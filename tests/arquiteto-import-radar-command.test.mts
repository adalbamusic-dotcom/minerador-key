import assert from "node:assert/strict";
import test from "node:test";
import { WorkflowCommandSchema } from "../lib/editorial/persistence-contracts.ts";
import { createVersionEnvelope } from "../lib/arquiteto/versioning.ts";
import { deterministicArticleDnaPayload } from "../lib/arquiteto/adapters.ts";
import { buildProvisionalGroups } from "../lib/arquiteto/engine.ts";
import { createRadarHydrationSnapshot } from "../lib/radar/hydration.ts";

/**
 * O COMANDO `import_radar` INTEIRO, como ele sai do cliente.
 *
 * Existe porque o round-trip anterior usava `articleVersions: []` e deixou
 * passar uma regressao real: `siloIdProvenance` foi adicionado ao contexto e
 * nao ao schema, que e `.strict()`. O servidor devolveu 400 e a importacao
 * parou inteira.
 *
 * Lote com DOIS artigos e componentes nao vazios — envelope versionado,
 * hidratacao com keywords de origem, Silo hidratado por territorio e Silo
 * declarado. Comando vazio nao prova contrato.
 */

const BRAND = "09762023-d0d4-4c24-b34e-d0fdfd43f891";

const keyword = (id: string, value: string) => ({
  id, keyword: value, intent: "Informativo", volume_search: 100,
  results_allintitle: null, kgr_score: null, lista_id: null, siloName: null,
  status: "aprovado",
  analise_semantica: { entidade_central: "skincare", publico: "clientes", problema_percebido: "duvida" },
});

async function articleVersion(id: string, texto: string, overrides: Record<string, unknown> = {}) {
  const group = buildProvisionalGroups([keyword(`${id}-kw`, texto)])[0];
  const payload = { ...deterministicArticleDnaPayload(group, BRAND), ...overrides };
  return createVersionEnvelope({
    entityId: (payload as { articleId: string }).articleId,
    versionNumber: 1, previousVersionId: null, origin: "human",
    changeReason: "handoff para o Radar", createdBy: "user-1", payload,
  });
}

const siloContext = (provenance: "DECLARED" | "LEGACY_TERRITORY_HYDRATION", role: "pillar" | "support") => ({
  siloId: "working-silo:3",
  siloName: "Skincare Facial",
  territoryRef: "territory:11111111-1111-4111-8111-111111111111",
  siloDnaVersionId: "silo-v1",
  siloDnaContentHash: `sha256:${"a".repeat(64)}`,
  siloPageId: "silo-page:working-silo:3",
  siloPageVersionId: "page-v1",
  siloPageSlug: "/skincare-facial",
  siloPageCanonical: null,
  siloPagePublicationStatus: "new",
  articleRole: role,
  siloIdProvenance: provenance,
});

async function comandoReal() {
  const kwA = keyword("serum-kw", "serum facial principia");
  const kwB = keyword("mascara-kw", "mascara de skincare");
  const a = await articleVersion("serum", "serum facial principia");
  const b = await articleVersion("mascara", "mascara de skincare");

  const hydrationByArticleId: Record<string, unknown> = {};
  const handoffContext: Record<string, unknown> = {};
  for (const [indice, version] of [a, b].entries()) {
    const articleId = (version.payload as { articleId: string }).articleId;
    // Um lote HETEROGÊNEO: um Silo declarado, outro hidratado pelo território.
    const silo = siloContext(indice === 0 ? "LEGACY_TERRITORY_HYDRATION" : "DECLARED", indice === 0 ? "pillar" : "support");
    const hydration = createRadarHydrationSnapshot({
      brandId: BRAND,
      article: version as never,
      sourceKeywords: [kwA, kwB] as never,
      resolvedSilo: silo as never,
      source: "arquiteto_import",
    } as never);
    assert.ok(hydration, `a hidratação de ${articleId} não pode voltar nula: sem ela o teste não prova nada`);
    hydrationByArticleId[articleId] = hydration;
    handoffContext[articleId] = { silo, internalLinks: null, serpProvenance: null };
  }

  return {
    action: "import_radar" as const,
    brandId: BRAND,
    articleVersions: [a, b],
    versionEvents: [],
    hydrationByArticleId,
    handoffContext,
  };
}

test("o comando import_radar completo atravessa o schema do servidor", async () => {
  const comando = await comandoReal();
  assert.equal(comando.articleVersions.length, 2, "lote com dois artigos");
  assert.equal(Object.keys(comando.hydrationByArticleId).length, 2, "hidratação real para os dois");

  const parsed = WorkflowCommandSchema.safeParse(comando);
  assert.equal(
    parsed.success,
    true,
    parsed.success ? "" : `o schema recusou: ${parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join(" · ")}`,
  );
});

test("o comando sobrevive ao JSON — é assim que ele viaja", async () => {
  // O cliente serializa antes de enviar. `undefined` some, Date vira string:
  // validar o objeto em memória não prova o que chega no servidor.
  const comando = await comandoReal();
  const viajado = JSON.parse(JSON.stringify(comando));
  const parsed = WorkflowCommandSchema.safeParse(viajado);
  assert.equal(
    parsed.success,
    true,
    parsed.success ? "" : `o schema recusou após o JSON: ${parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join(" · ")}`,
  );
});

test("campo a mais no contexto é recusado com o caminho nomeado", async () => {
  // A recusa precisa dizer ONDE. Foi a falta disso que custou uma rodada.
  const comando = await comandoReal();
  const primeiro = Object.keys(comando.handoffContext)[0];
  const sujo = JSON.parse(JSON.stringify(comando));
  sujo.handoffContext[primeiro].silo.campoQueNinguemDeclarou = "x";

  const parsed = WorkflowCommandSchema.safeParse(sujo);
  assert.equal(parsed.success, false, "chave desconhecida no silo tem de ser recusada");
  if (parsed.success) return;
  const caminhos = parsed.error.issues.map(issue => issue.path.join("."));
  assert.ok(
    caminhos.some(caminho => caminho.startsWith(`handoffContext.${primeiro}.silo`)),
    `o caminho recusado precisa nomear o artigo e o campo; veio: ${caminhos.join(", ")}`,
  );
});

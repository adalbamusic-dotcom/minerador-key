import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { mergeLogicalKeywordSemantic } from "../lib/arquiteto/keyword-dna-engine.ts";
import { readSiteOrigin, readPublicationLink } from "../lib/minerador/publication-link.ts";
import { readApprovalRecord } from "../lib/minerador/approved-package.ts";
import { readSerpEvidenceRecord } from "../lib/minerador/serp-evidence-record.ts";
import { resolveKeywordVinculo } from "../lib/minerador/keyword-vinculo.ts";
import { isKeywordPublished } from "../lib/minerador/keyword-lifecycle.ts";

/**
 * "Processar lógica" não pode destruir o que não é do motor.
 *
 * O merge terminava com `typeof value === "string" ? value : JSON.stringify(value)`
 * aplicado a TODA chave do `analise_semantica`. Um clique em Lógica
 * transformava `site_origin`, `aprovacao`, `human_review` e as medições em
 * string JSON — e todo leitor, que checa `typeof === "object"`, passava a
 * devolver `null`. Na tela a publicação declarada sumia, com o dado intacto
 * no banco e ilegível. REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

const LOGICO = {
  dna_schema_version: "1",
  dna_origem: "logico_deterministico",
  intencao_principal: "Informativa",
  entidade_central: "pomada",
  modificadores: "queimadura",
};

/** Evidência de publicação declarada, como a conferência por link grava. */
const siteOrigin = {
  schemaVersion: "site-sitemap-v1",
  source: "manual_url",
  brandId: "brand-1",
  catalogEntryId: null,
  sourceUrl: "https://careglow.com.br/rotina-skincare-facial/qual-pomada-e-boa-para-queimadura",
  resolvedUrl: "https://careglow.com.br/rotina-skincare-facial/qual-pomada-e-boa-para-queimadura",
  declaredCanonicalUrl: "https://careglow.com.br/rotina-skincare-facial/qual-pomada-e-boa-para-queimadura",
  canonicalUrl: "https://careglow.com.br/rotina-skincare-facial/qual-pomada-e-boa-para-queimadura",
  urlSituation: "canonical_confirmed",
  publicationStatus: "published",
  keywordUrlRelation: "confirmed_primary",
  lastCheckedAt: "2026-09-20T23:56:34.289Z",
  publicationConfirmedBy: "human-1",
  publicationConfirmedAt: "2026-09-21T01:27:08.153Z",
  siteRole: "article",
  siloPath: "/rotina-skincare-facial",
  relationConfirmedBy: "human-1",
  relationConfirmedAt: "2026-09-21T01:27:08.153Z",
};

test("a Lógica preserva a publicação declarada em vez de serializá-la", () => {
  const antes = {
    site_origin: siteOrigin,
    site_origins: [siteOrigin],
    primary_keyword_policy: "locked",
    keyword_page_type: "article",
    keyword_page_type_history: [{ previous: "article", next: "article", actorId: "human-1", changedAt: "2026-09-20T23:57:00.000Z" }],
  };
  // O caso real: a keyword estava publicada e o humano clicou em Lógica.
  assert.equal(readPublicationLink({ status: "bruto", evidence: readSiteOrigin(antes) }).state, "published");

  const depois = mergeLogicalKeywordSemantic(antes, LOGICO);

  assert.equal(typeof depois.site_origin, "object", "site_origin continua objeto");
  assert.ok(Array.isArray(depois.site_origins), "site_origins continua array");
  assert.ok(Array.isArray(depois.keyword_page_type_history), "o histórico continua array");
  assert.deepEqual(depois.site_origin, siteOrigin, "e byte a byte o mesmo");

  // O que importa para quem lê: a publicação continua sendo publicação.
  const vinculo = resolveKeywordVinculo({ status: "bruto", semantic: depois });
  assert.equal(vinculo.publicationDeclared, true, "a publicação declarada sobrevive ao processamento");
  assert.equal(vinculo.postLabel, "Travado ao slug");
  assert.equal(vinculo.pageTypeLabel, "Artigo · declarado");
  assert.equal(vinculo.canonicalUrl, siteOrigin.canonicalUrl, "o canônico não se perde");

  // E os campos do motor entraram.
  assert.equal(depois.intencao_principal, "Informativa");
  assert.equal(depois.dna_origem, "logico_deterministico");
});

test("aprovação, revisão humana, SERP e medições sobrevivem ao mesmo caminho", () => {
  const antes = {
    aprovacao: { contentHash: "sha256:x", signature: "fnv1a-v2:abc", approvedAt: "2026-09-19T12:00:00.000Z", approvedBy: "human-1", version: 2 },
    human_review: { status: "completed", kgrDecisionReviewed: true, fieldDecisions: [{ field: "intent", decision: "keep_logic" }] },
    evidencia_serp: { schemaVersion: "v1", peso: "forte", versionId: "v1", version: 1, contentHash: "sha256:q", collectedAt: "2026-09-19T10:02:00.000Z", derivationVersion: "d", thresholdsVersion: "t", semanticState: "conclusive", intent: { value: "Informativa", strength: "conclusive" }, funnel: { value: "TOFU", strength: "conclusive" }, invalidada: null },
    volume_measurement: { provider: "google_ads", averageMonthlySearches: 110, measuredAt: "2026-09-20T18:56:00.000Z" },
    kgr_score_history: [{ score: 1.2, at: "2026-09-19T10:00:00.000Z" }],
  };

  const depois = mergeLogicalKeywordSemantic(antes, LOGICO);

  // Sem isto, um clique em Lógica apagava o pacote aprovado do Arquiteto.
  assert.equal(readApprovalRecord(depois)?.version, 2, "o registro de aprovação continua legível");
  assert.equal(readSerpEvidenceRecord(depois)?.semanticState, "conclusive", "a evidência SERP continua legível");
  assert.equal(typeof depois.human_review, "object", "a revisão humana continua objeto");
  assert.equal(typeof depois.volume_measurement, "object", "a medição continua objeto");
  assert.ok(Array.isArray(depois.kgr_score_history), "o histórico de KGR continua array");
});

test("os campos do próprio motor continuam texto", () => {
  // `KeywordSemanticRecord` é `Record<string, string>`: o que é do motor sai
  // como texto, inclusive quando chega como número por um caminho antigo.
  const depois = mergeLogicalKeywordSemantic({ dna_confianca: 0.44, site_origin: siteOrigin }, LOGICO);
  assert.equal(depois.dna_confianca, "0.44");
  assert.equal(typeof depois.site_origin, "object", "e o que não é do motor não vira texto");
});

test("a proteção não se desliga porque o dado mudou de forma", () => {
  /*
   * Defesa em profundidade. O motor foi corrigido e há script de reparo, mas
   * enquanto houver linha serializada no banco a keyword publicada não pode
   * ser tratada como livre — é dessa leitura que sai a proteção contra
   * exclusão, tanto na tela quanto no `assessKeywordHardDelete`.
   */
  const serializada = { site_origin: JSON.stringify(siteOrigin) };
  const lida = readSiteOrigin(serializada);
  assert.ok(lida, "a evidência serializada continua sendo lida");
  assert.equal(lida?.publicationStatus, "published");
  assert.equal(readPublicationLink({ status: "bruto", evidence: lida }).state, "published");
  assert.equal(isKeywordPublished({ status: "bruto", semantic: serializada }), true, "e a keyword continua protegida");

  // Ler não conserta o banco: a forma canônica continua sendo objeto.
  assert.equal(typeof serializada.site_origin, "string");

  // Texto que não volta a ser objeto não vira evidência inventada.
  assert.equal(readSiteOrigin({ site_origin: "{quebrado" }), null);
  assert.equal(readSiteOrigin({ site_origin: "publicado" }), null);
  assert.equal(readSiteOrigin({}), null);
});

test("a rota declara o fluxo; quem recusa é o banco", () => {
  const rota = readFileSync(new URL("../app/api/minerador/marcas/[brandId]/keywords/delete/route.ts", import.meta.url), "utf8");
  const limpa = rota.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  /*
   * Apagar publicada É permitido — com a janela de 24 horas e restauração.
   * O que não pode é ela sumir por efeito colateral, e a diferença entre as
   * duas é a DECLARAÇÃO do fluxo recuperável.
   *
   * Entre 2026-09-21 e a correção, esta rota teve guarda própria recusando
   * toda publicada. Recusava o fluxo legítimo antes mesmo do banco, com a
   * tela oferecendo o que a rota negava. Duas fontes de verdade.
   */
  assert.match(limpa, /allowRecoverable: z\.boolean\(\)\.optional\(\)\.default\(false\)/, "ausente é false");
  assert.match(limpa, /p_allow_recoverable: input\.allowRecoverable/, "a declaração chega ao banco");
  assert.doesNotMatch(limpa, /isKeywordPublished\(/, "a rota não repete a decisão");

  // Nenhuma métrica justifica apagar: a decisão não olha volume nem KGR.
  assert.doesNotMatch(limpa, /volume_search|kgr_score|results_allintitle/, "nenhuma métrica entra na decisão");
});

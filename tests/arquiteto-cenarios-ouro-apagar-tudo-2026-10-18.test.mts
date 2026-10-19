import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

/*
 * ===== CENÁRIOS-OURO · "TUDO TEM QUE PODER SER APAGADO" (2026-10-18) =====
 *
 * As decisões do dono no mesmo dia (literais):
 *   - "Manter em duas etapas": o Silo do plano consolidado sai pelo "Desfazer Silo" do Arquiteto (Pilar incluído) e
 *     depois o Minerador exclui as keywords;
 *   - e a que a amplia: "sobre apagar, tem que poder apagar sim não interessa qual seja o estado, isso está no contrato
 *     global, tudo tem que poder ser apagado e claro com instâncias de seleção e confirmação, e alerta falando o que
 *     está apagando. mas tem que poder apagar tudo sim".
 *
 * A MESMA linha nos dois botões: o núcleo do "Desfazer Silo" (`lib/server/arquiteto-territory-undo.ts`) é o que o
 * "Excluir tudo da cor" do Minerador chama ANTES de excluir as keywords (`architectDismantlePort`). Tudo num banco em
 * memória (`tests/excluir-cor-fake-db.mts`) que os dois núcleos leem e escrevem: nenhuma rede, nenhum banco real, nada
 * pago.
 *
 *   (a) a cor do plano consolidada (o azul da WifiConecta: Pilar + 6 Suportes, SiloDNA/SiloPage v2, grafo aprovado,
 *       o grupo ligado) sai numa confirmação só do Minerador → keywords excluídas, artigos e par fora de vigência,
 *       território desfeito, grupo desligado e a cor liberada;
 *   (b) a mesma cor em duas etapas: "Desfazer Silo" no Arquiteto e depois a exclusão no Minerador, sem
 *       nenhuma keyword presa;
 *   (c) a cor com um artigo já no Radar (o amarelo) → o item do Radar sai da operação; a investigação fica;
 *   (d) a keyword publicada → lixeira de 24 h com a marcação; o publicado sai de vigência no Arquiteto e o alerta diz
 *       que no site nada muda.
 */

register(`data:text/javascript,${encodeURIComponent(
  "export async function resolve(especificador, contexto, proximo) {"
  + " if (especificador === 'next/server') return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent("
  + "\"export class NextRequest extends Request {}; export const NextResponse = { json: (corpo, opcoes) => new Response(JSON.stringify(corpo), { status: (opcoes && opcoes.status) || 200, headers: { 'Content-Type': 'application/json' } }) };\") };"
  + " return proximo(especificador, contexto); }",
)}`);
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
let chamadasDeRede = 0;
globalThis.fetch = (async () => { chamadasDeRede += 1; throw new Error("Rede proibida nos cenários-ouro."); }) as typeof fetch;

const { CorFakeDb } = await import("./excluir-cor-fake-db.mts");
const { importDeclaredPlanWithCore } = await import("../lib/minerador/declared-plan-import-core.ts");
const { setKeywordSubject } = await import("../lib/minerador/keyword-subject.ts");
const { applyGroupDeleteAllWithCore, previewGroupDeleteAllWithCore } = await import("../lib/minerador/group-delete-all-core.ts");
const { architectDismantlePort } = await import("../lib/server/arquiteto-territory-undo.ts");
const { handleArchitectWorkspacePatch } = await import("../lib/server/arquiteto-workspace-http.ts");
const { manualSiloCandidateDraft } = await import("../lib/arquiteto/silo-assignment.ts");

type Row = Record<string, unknown>;
type Db = InstanceType<typeof CorFakeDb>;

const BRAND = "d4fa133a-13bd-4bf7-bfd1-d0f22253f223";
const ACTOR = "8f0c2a4e-1111-4222-8333-444455556666";
const AT = "2026-10-18T12:00:00.000Z";
const HASH = `sha256:${"a".repeat(64)}`;

type Cor = { groupId: string; color: string; name: string; territoryRef: string; siloName: string; siloSlug: string; artigos: Array<[string, string]> };
const AZUL: Cor = {
  groupId: "07fec332-4b0a-43cb-af19-cedfd9b24897", color: "azul", name: "Wi-Fi e fibra óptica",
  territoryRef: "territory:5e689f8c-8f06-4e65-94c4-b3cd7ac906cc", siloName: "Wi-Fi e fibra óptica", siloSlug: "wifi-e-fibra-optica",
  artigos: [
    ["Diferença entre internet e Wi-Fi", "diferenca entre internet e wifi"],
    ["Wi-Fi 6 vale a pena", "wifi 6 vale a pena"],
    ["Roteador Wi-Fi: como escolher", "roteador wifi"],
    ["Fibra óptica: como funciona", "fibra optica"],
    ["Repetidor de Wi-Fi resolve", "repetidor wifi"],
    ["Internet cai à noite: por quê", "internet cai a noite"],
    ["Wi-Fi mesh vale a pena", "wifi mesh"],
  ],
};
const AMARELO: Cor = {
  groupId: "aaaa0000-0000-4000-8000-00000000a203", color: "amarelo", name: "Planos e contratação",
  territoryRef: "territory:2318febb-f4c7-4036-ac8c-b7416be0de3c", siloName: "Planos e contratação", siloSlug: "planos-de-internet",
  artigos: [
    ["Como escolher um plano de internet residencial", "como escolher plano de internet residencial"],
    ["Internet residencial barata: o que comparar", "internet residencial barata"],
    ["Claro, Vivo ou TIM para casa", "claro vivo ou tim internet residencial"],
    ["Combo de internet e celular vale a pena", "combo internet e celular"],
  ],
};
const uuid = (prefixo: string, n: number) => `${prefixo}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const S = (n: number) => uuid("00000000", n + 1);
const P = (n: number) => uuid("10000000", n + 1);
const ITEM_KW = (n: number, lado: "s" | "p") => uuid(lado === "s" ? "bbbbbbbb" : "bbbbbbbc", n + 1);
const ITEM_TERRITORIO = "cccccccc-0000-4000-8000-000000000001";
const ITEM_RADAR = "ffffffff-0000-4000-8000-000000000001";
const art = (n: number) => `art-${n + 1}`;

function assunto() {
  const resultado = setKeywordSubject({ dna_origem: "logico_deterministico" }, { note: "Para quem quer resolver em casa", actorId: ACTOR, changedAt: AT, origin: "import" });
  assert.ok(resultado.ok);
  return resultado.semantic;
}
const kw = (id: string, keyword: string, cor: Cor, extra: Row = {}): Row => ({ id, keyword, brand_id: BRAND, status: "aprovado", group_id: cor.groupId, deleted_at: null, volume_search: 260, results_allintitle: null, analise_semantica: { dna_origem: "logico_deterministico" }, ...extra });

async function marcaComSilo(cor: Cor, opcoes: { radarNoArtigo?: number; publicado?: number } = {}): Promise<Db> {
  const db = new CorFakeDb({
    editorial_groups: [{ id: cor.groupId, marca_id: BRAND, name: cor.name, color: cor.color, origin: "manual", status: "active", plan: null, plan_version: 0, plan_hash: null, silo_id: null, lock_version: 1, updated_at: AT, created_at: AT }],
    editorial_group_events: [],
    editorial_group_articles: [],
    editorial_artifact_versions: [],
    editorial_version_status_events: [],
    editorial_workflow_items: [],
    brand_site_catalog_entries: [],
    internal_link_graphs: [],
    content_documents: [],
    minerador_keywords: cor.artigos.flatMap(([titulo, chave], n) => [kw(S(n), titulo, cor, { analise_semantica: assunto() }), kw(P(n), chave, cor)]),
  });
  // O plano do cadastro (o importador de sempre): Silo, Pilar e ordem.
  const texto = [
    `Nome: ${cor.siloName}\nSlug: /${cor.siloSlug}/\nObjetivo: Ajudar quem decide em casa.`,
    ...cor.artigos.map(([titulo, chave], n) => `${n + 1}. ${titulo}\n${n === 0 ? "Artigo pilar • " : ""}Palavra-chave: ${chave}\nEscopo do artigo ${n + 1}.`),
  ].join("\n");
  const gravado = await importDeclaredPlanWithCore({ brandId: BRAND, actorUserId: ACTOR, keywordsClient: db as never, groupsClient: db as never, mode: "apply", text: texto, group: { mode: "existing", groupId: cor.groupId }, importRequestId: "6a1c0d2e-1111-4222-8333-444455556666", now: AT });
  assert.ok(gravado.ok && gravado.mode === "apply" && gravado.failed === 0, JSON.stringify(gravado));
  if (opcoes.publicado !== undefined) db.publicadas.add(P(opcoes.publicado));

  // O Arquiteto: o Silo do plano consolidado (par v2), os artigos v1 aprovados, o grupo ligado, as etiquetas e o grafo.
  const territorio = {
    ...manualSiloCandidateDraft({ name: cor.siloName, slug: cor.siloSlug }),
    territoryRef: cor.territoryRef, brandId: BRAND, lifecycleStatus: "consolidated", decisionState: "confirmed",
    reasons: [`Silo do plano declarado: ${cor.siloName}.`],
    provenance: { producedBy: "human", adoptedFromScenarioType: null, humanAdjustmentCount: 1, note: `Plano declarado no cadastro: grupo ${cor.name}, plano v1.` },
    consolidation: {
      siloId: cor.territoryRef,
      siloDnaVersionRef: { entityId: cor.territoryRef, versionId: uuid("dddddddd", 2), contentHash: HASH, versionNumber: 2 },
      siloPageVersionRef: { entityId: `silo-page:${cor.territoryRef}`, versionId: uuid("eeeeeeee", 2), contentHash: HASH, versionNumber: 2 },
      consolidatedAt: AT,
    },
  };
  db.tables.editorial_workflow_items.push(
    { id: ITEM_TERRITORIO, marca_id: BRAND, subject_type: "territory", subject_id: cor.territoryRef, article_id: null, stage: "architect", state: "consolidated", source_entity_id: cor.territoryRef, lock_version: 7, created_at: AT, updated_at: AT, payload: { contractVersion: "territory-record-v1", territory: territorio } },
    ...cor.artigos.flatMap((_, n) => (["s", "p"] as const).map(lado => ({
      id: ITEM_KW(n, lado), marca_id: BRAND, subject_type: "keyword", subject_id: lado === "s" ? S(n) : P(n), article_id: null, stage: "architect", state: "received",
      source_entity_id: lado === "s" ? S(n) : P(n), lock_version: 2, created_at: AT, updated_at: AT,
      payload: { territoryRef: cor.territoryRef, territoryAssignment: { state: "existing_silo_match", reason: "Segue o plano declarado do grupo.", source: "human", decidedAt: AT } },
    }))),
  );
  if (opcoes.radarNoArtigo !== undefined) {
    db.tables.editorial_workflow_items.push({ id: ITEM_RADAR, marca_id: BRAND, subject_type: "article", subject_id: art(opcoes.radarNoArtigo), article_id: art(opcoes.radarNoArtigo), stage: "radar", state: "awaiting_approval", source_entity_id: art(opcoes.radarNoArtigo), lock_version: 4, created_at: AT, updated_at: AT, payload: { analysisVersions: [{ versionNumber: 1, note: "investigação congelada" }] } });
  }
  db.tables.editorial_artifact_versions.push(
    ...cor.artigos.map(([titulo, chave], n) => ({
      version_id: uuid("aaaaaaa1", n + 1), entity_id: art(n), version_number: 1, status: "approved", marca_id: BRAND, artifact_type: "article_dna",
      payload: {
        articleId: art(n), brandId: BRAND, territoryRef: cor.territoryRef, siloId: cor.territoryRef, suggestedSlug: chave.replace(/\s+/g, "-"),
        principalKeywordId: P(n), secondaryKeywordIds: [], narrativeReinforcementIds: [], subject: { keywordId: S(n), phrase: titulo },
        ...(opcoes.publicado === n ? { publishedIdentityRef: { url: `https://site.example/${chave.replace(/\s+/g, "-")}` } } : {}),
      },
    })),
    { version_id: uuid("dddddddd", 1), entity_id: cor.territoryRef, version_number: 1, status: "approved", marca_id: BRAND, artifact_type: "silo_dna", payload: { siloId: cor.territoryRef, territoryRef: cor.territoryRef, brandId: BRAND, pillarArticleId: art(0), supportArticleIds: [] } },
    { version_id: uuid("dddddddd", 2), entity_id: cor.territoryRef, version_number: 2, status: "approved", marca_id: BRAND, artifact_type: "silo_dna", payload: { siloId: cor.territoryRef, territoryRef: cor.territoryRef, brandId: BRAND, pillarArticleId: art(0), supportArticleIds: cor.artigos.slice(1).map((_, n) => art(n + 1)), articleReferences: cor.artigos.map((_, n) => ({ articleId: art(n) })) } },
    { version_id: uuid("eeeeeeee", 2), entity_id: `silo-page:${cor.territoryRef}`, version_number: 2, status: "approved", marca_id: BRAND, artifact_type: "silo_page", payload: { siloId: cor.territoryRef, territoryRef: cor.territoryRef, brandId: BRAND, publicationStatus: "new" } },
  );
  db.rows("editorial_groups").find(grupo => grupo.id === cor.groupId)!.silo_id = cor.territoryRef;
  db.tables.editorial_group_articles.push(...cor.artigos.map((_, n) => ({ marca_id: BRAND, article_id: art(n), group_id: cor.groupId, origin: "inherited" })));
  db.tables.internal_link_graphs.push({ graph_version_id: uuid("99999999", 1), graph_id: `arquiteto:internal-links:${cor.territoryRef}`, marca_id: BRAND, silo_id: cor.territoryRef, version_number: 1, workflow_status: "approved" });
  return db;
}

/** O contexto do Arquiteto já autorizado (arquiteto:approve) sobre o MESMO banco, e o writer do evento de status gravando nele. */
const contextoDoArquiteto = (db: Db) => ({ actorUserId: ACTOR, brandId: BRAND, module: "arquiteto", action: "approve", permissions: ["arquiteto:approve"] as const, authorizationSource: "canonical_actor_rpc" as const, supabase: db as never });
const eventosNoBanco = (db: Db) => async (eventos: Array<{ eventId: string; versionId: string; status: string; reason: string; occurredAt: string }>) => {
  for (const evento of eventos) {
    if (db.rows("editorial_version_status_events").some(linha => linha.id === evento.eventId)) continue;
    db.rows("editorial_version_status_events").push({ id: evento.eventId, version_id: evento.versionId, status: evento.status, reason: evento.reason, actor_id: ACTOR, occurred_at: evento.occurredAt });
  }
};
const porta = (db: Db) => architectDismantlePort(async () => contextoDoArquiteto(db) as never, { appendEvents: eventosNoBanco(db) as never, now: () => AT });
const previa = (db: Db, cor: Cor, includePublished = false) => previewGroupDeleteAllWithCore({ client: db as never, brandId: BRAND, actorUserId: ACTOR, groupId: cor.groupId, includePublished, architect: porta(db) });
const aplicar = (db: Db, cor: Cor, decisionHash: string, typed: Record<string, unknown>, includePublished = false) => {
  let n = 0;
  return applyGroupDeleteAllWithCore({ client: db as never, brandId: BRAND, actorUserId: ACTOR, groupId: cor.groupId, includePublished, decisionHash, typed, architect: porta(db), requestId: () => `7b000000-0000-4000-8000-${String(++n).padStart(12, "0")}` });
};
const vivas = (db: Db, cor: Cor) => db.rows("minerador_keywords").filter(row => row.group_id === cor.groupId && !row.deleted_at);
const territorio = (db: Db) => db.rows("editorial_workflow_items").find(row => row.id === ITEM_TERRITORIO)!;
const rejeitadas = (db: Db) => db.rows("editorial_version_status_events").filter(row => row.status === "rejected").map(row => String(row.version_id)).sort();
const versoesVigentesDaCor = (cor: Cor) => [...cor.artigos.map((_, n) => uuid("aaaaaaa1", n + 1)), uuid("dddddddd", 2), uuid("eeeeeeee", 2)].sort();

test("(a) a cor do plano consolidada sai numa confirmação só do Minerador: o Arquiteto desmonta antes (Pilar incluído), as keywords saem e a cor fica livre", async () => {
  const db = await marcaComSilo(AZUL);
  const versoesAntes = JSON.stringify(db.rows("editorial_artifact_versions"));
  const r = await previa(db, AZUL);
  assert.ok(r.ok, JSON.stringify(r));
  if (!r.ok) return;
  const p = r.preview;
  // O alerta: nada fica fora por estar num artigo; o Arquiteto sai junto, por área, com os nomes.
  assert.deepEqual(p.out, [], "nenhuma keyword fica fora por estar num artigo do Arquiteto");
  assert.equal(p.totals.hard, 14);
  const arquiteto = p.areas.find(area => area.area === "arquiteto")!;
  assert.equal(arquiteto.executable, true);
  assert.match(arquiteto.items.map(item => item.label).join(" "), /^Silo “Wi-Fi e fibra óptica”: sai inteiro — 7 artigo\(s\) \(Pilar incluído\): “Diferença entre internet e Wi-Fi”, .*SiloDNA e SiloPage e o grafo de links deixam de valer; o grupo Azul \(Wi-Fi e fibra óptica\) é desligado do Silo\. As versões ficam como histórico\.$/);
  assert.ok(p.effects.some(efeito => /^Antes das keywords, sai junto/.test(efeito)));
  assert.equal(p.color.freedAtEnd, true, "nada prende a cor: as etiquetas e o Silo saem junto");
  assert.deepEqual(rejeitadas(db), [], "a prévia não escreve");

  const feito = await aplicar(db, AZUL, r.decisionHash, { color: "azul", phrase: "apaga de vez" });
  assert.ok(feito.ok, JSON.stringify(feito));
  if (!feito.ok) return;
  assert.deepEqual(feito.architect.applied, ["Silo “Wi-Fi e fibra óptica” desfeito"]);
  assert.equal(feito.hardDeletedIds.length, 14, "as keywords da cor saem");
  assert.equal(vivas(db, AZUL).length, 0);
  // O Arquiteto: os 7 ArticleDNA (o Pilar incluído) e o par fora de vigência; nenhuma versão apagada nem regravada.
  assert.deepEqual(rejeitadas(db), versoesVigentesDaCor(AZUL));
  assert.equal(JSON.stringify(db.rows("editorial_artifact_versions")), versoesAntes, "ArticleDNA, SiloDNA e SiloPage ficam como histórico");
  assert.equal(territorio(db).state, "rejected");
  assert.equal(db.rows("editorial_group_articles").length, 0, "as etiquetas dos artigos retirados saem");
  assert.equal(db.rows("internal_link_graphs").length, 1, "o grafo fica como histórico (deixa de valer com o par)");
  const grupo = db.rows("editorial_groups").find(item => item.id === AZUL.groupId)!;
  assert.equal(grupo.silo_id, null, "o grupo desligado do Silo");
  assert.equal(grupo.status, "archived", "a cor liberada (D7)");
  assert.equal(feito.color.freed, true);
  assert.equal(chamadasDeRede, 0);
});

test("(b) a mesma cor em duas etapas: \"Desfazer Silo\" no Arquiteto e, depois, a exclusão no Minerador sem nenhuma keyword presa", async () => {
  const db = await marcaComSilo(AZUL);
  const patch = async (corpo: Record<string, unknown>) => {
    const resposta = await handleArchitectWorkspacePatch(new Request("http://local/api/arquiteto/workspace", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ brandId: BRAND, ...corpo }) }), contextoDoArquiteto(db) as never, { territoryUndo: { appendEvents: eventosNoBanco(db) as never, now: () => AT } });
    return { status: resposta.status, corpo: await resposta.json() as Record<string, unknown> };
  };
  // Etapa 1: o "Desfazer Silo" de sempre — a prévia e a confirmação forte.
  const leitura = await patch({ territoryUndos: [{ territoryRef: AZUL.territoryRef, expectedLock: 7, mode: "preview" }] });
  assert.equal(leitura.status, 200, JSON.stringify(leitura.corpo));
  const silo = (leitura.corpo.data as { territoryUndoPreviews: Array<{ wholeSilo: { decisionHash: string; confirmationName: string; articles: unknown[] } }> }).territoryUndoPreviews[0].wholeSilo;
  assert.equal(silo.articles.length, 7);
  const desfeito = await patch({ territoryUndos: [{ territoryRef: AZUL.territoryRef, expectedLock: 7, decisionHash: silo.decisionHash, typedName: silo.confirmationName }] });
  assert.equal(desfeito.status, 200, JSON.stringify(desfeito.corpo));
  assert.deepEqual(rejeitadas(db), versoesVigentesDaCor(AZUL));
  // Etapa 2: a prévia do Minerador não tem mais nada do Arquiteto a desmontar e nenhuma keyword presa.
  const r = await previa(db, AZUL);
  assert.ok(r.ok, JSON.stringify(r));
  if (!r.ok) return;
  assert.deepEqual(r.preview.out, [], "nenhuma keyword presa no Arquiteto (nem architect_reference nem architect_unavailable)");
  assert.equal(r.preview.areas.find(area => area.area === "arquiteto")!.executable, false, "nada mais a desmontar lá");
  const feito = await aplicar(db, AZUL, r.decisionHash, { color: "azul", phrase: "apaga de vez" });
  assert.ok(feito.ok && feito.complete, JSON.stringify(feito));
  if (!feito.ok) return;
  assert.deepEqual(feito.architect.applied, []);
  assert.equal(vivas(db, AZUL).length, 0);
  assert.equal(feito.color.freed, true);
});

test("(c) a cor com um artigo já no Radar (o amarelo): o item do Radar sai da operação (a investigação fica como histórico) e as keywords saem", async () => {
  const db = await marcaComSilo(AMARELO, { radarNoArtigo: 2 });
  const r = await previa(db, AMARELO);
  assert.ok(r.ok, JSON.stringify(r));
  if (!r.ok) return;
  assert.deepEqual(r.preview.out, []);
  const radar = r.preview.areas.find(area => area.area === "radar")!;
  assert.equal(radar.executable, true);
  assert.match(radar.items.map(item => item.label).join(" "), /^“Claro, Vivo ou TIM para casa”: o item sai da operação do Radar \(“retirado”\); a investigação e o histórico ficam\.$/);
  const feito = await aplicar(db, AMARELO, r.decisionHash, { color: "amarelo", phrase: "apaga de vez" });
  assert.ok(feito.ok, JSON.stringify(feito));
  if (!feito.ok) return;
  const item = db.rows("editorial_workflow_items").find(row => row.id === ITEM_RADAR)!;
  assert.equal(item.state, "withdrawn", "o item do Radar sai da operação");
  assert.deepEqual((item.payload as Row).analysisVersions, [{ versionNumber: 1, note: "investigação congelada" }], "a investigação fica");
  assert.equal(((item.payload as Row).withdrawal as Row).previousState, "awaiting_approval");
  assert.equal(vivas(db, AMARELO).length, 0);
  assert.equal(territorio(db).state, "rejected");
});

test("(d) a keyword publicada vai para a lixeira de 24 h (com a marcação e o nome digitado); no Arquiteto o publicado sai de vigência e o alerta diz que no site nada muda", async () => {
  const db = await marcaComSilo(AZUL, { publicado: 1 });
  const sem = await previa(db, AZUL);
  assert.ok(sem.ok);
  if (!sem.ok) return;
  assert.ok(sem.preview.out.some(item => item.id === P(1) && item.reason === "published_not_included"), "sem a marcação, a publicada fica (D6)");
  const r = await previa(db, AZUL, true);
  assert.ok(r.ok, JSON.stringify(r));
  if (!r.ok) return;
  assert.deepEqual(r.preview.out, []);
  const publicacoes = r.preview.areas.find(area => area.area === "publicacoes")!;
  assert.equal(publicacoes.executable, true);
  assert.match(publicacoes.items.map(item => item.label).join(" "), /^“Wi-Fi 6 vale a pena” está publicado: no site nada muda \(URL, slug e canonical ficam\); a keyword publicada vai para a lixeira de 24 h\.$/);
  const feito = await aplicar(db, AZUL, r.decisionHash, { color: "azul", phrase: "apaga de vez", publishedNames: { [P(1)]: "wifi 6 vale a pena" } }, true);
  assert.ok(feito.ok, JSON.stringify(feito));
  if (!feito.ok) return;
  assert.deepEqual(feito.recoverableIds, [P(1)], "a publicada vai para a lixeira de 24 h");
  assert.ok(db.rows("minerador_keywords").find(row => row.id === P(1))?.deleted_at, "fica restaurável (não sumiu)");
  assert.equal(feito.hardDeletedIds.length, 13);
  assert.ok(rejeitadas(db).includes(uuid("aaaaaaa1", 2)), "o ArticleDNA do publicado sai de vigência");
  assert.equal(feito.color.freed, false, "a publicada na lixeira prende a cor até a purga (D7)");
});

test("o desmonte que não fecha não exclui nenhuma keyword e diz o que foi feito e o que não foi", async () => {
  const db = await marcaComSilo(AZUL);
  const r = await previa(db, AZUL);
  assert.ok(r.ok);
  if (!r.ok) return;
  // O Silo muda entre a prévia e a confirmação (outra sessão): o Arquiteto recusa e nada sai no Minerador.
  territorio(db).lock_version = 8;
  const feito = await aplicar(db, AZUL, r.decisionHash, { color: "azul", phrase: "apaga de vez" });
  assert.ok(!feito.ok, JSON.stringify(feito));
  if (feito.ok) return;
  assert.ok(feito.code === "DECISION_STALE" || feito.code === "ARCHITECT_DISMANTLE_FAILED", feito.code);
  assert.equal(vivas(db, AZUL).length, 14, "nenhuma keyword foi excluída");
  assert.equal(db.rpcLog.filter(item => item.name === "lifecycle_delete_group_keywords").length, 0);
});

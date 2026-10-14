import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

import { ARTICLE_FORMATION_SERP_LIST_DETAIL, projectArticleFormationSerpPayload, projectArticleFormationSerpRecord } from "../lib/arquiteto/article-serp-projection.ts";
import { ArticleFormationSerpPayloadSchema } from "../lib/arquiteto/article-serp-record.ts";
import { resolveSerpEvidencePriority } from "../lib/arquiteto/serp-evidence-priority.ts";
import { resolveSerpFormationVerdict, type SerpFormationObservationInput } from "../lib/arquiteto/serp-formation-verdict.ts";
import { articleSerpLensesComplete } from "../lib/arquiteto/article-serp-gate.ts";
import { resolveCandidateBoundaries, type CandidateSerpEvidence } from "../lib/arquiteto/candidate-serp-boundary.ts";
import { serpAssessmentComposition, serpCompositionMismatch, aliasPublishedFormationSerp } from "../lib/arquiteto/published-formation-serp.ts";
import { articleSerpParecerFromAssessment } from "../lib/arquiteto/article-serp-interpretation.ts";
import { applySyncPatch, diffSyncMarks, isArchitectSyncMarks, mergeArchitectWorkspaceDelta, stableJson, syncHash, syncPatchOf, type ArchitectSyncMarks, type ArchitectWorkspaceData } from "../lib/arquiteto/workspace-delta.ts";
import { parecerDaFormacao } from "./listas-leves-fixtures.mts";

/**
 * F2 · LISTAS LEVES (SDD `docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`,
 * item 4, parte sem view). Domínio puro, sem banco e sem rede:
 *
 * - o parecer de SERP da formação em PROJEÇÃO tem só o que a tela lê, e cada
 *   operação que lia o parecer inteiro dá o MESMO resultado sobre a projeção
 *   (veredito, gate, canibalização, composição do Reforçar/melhoria, parecer
 *   reconstruído do registro legado);
 * - a fusão da releitura do que mudou (marcas, remendo, ordem, conjunto das
 *   keywords recebidas) e as recusas que fazem a tela reler tudo;
 * - leituras estruturais: a exportação pede o parecer inteiro, o cliente nunca
 *   guarda a base fora da memória, nenhum entregável usa o leitor leve.
 *
 * Testes estruturais limpam os comentários antes de casar.
 */

const semComentarios = (texto: string) => texto
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split(/\r?\n/)
  .map(linha => linha.replace(/(^|[^:"'`])\/\/.*$/, "$1"))
  .join("\n");
const ler = (arquivo: string) => readFileSync(new URL(`../${arquivo}`, import.meta.url), "utf8");

const K = ["k1", "k2", "k3"];
const cheio = parecerDaFormacao("cand-1", K);
const projetado = projectArticleFormationSerpPayload(cheio);

/* ============================ a projeção: campos ============================ */

test("projeção · o parecer da lista leva só o que a tela lê (e cabe no contrato)", () => {
  assert.equal(projetado.projected, true);
  const p = projetado.payload;
  assert.doesNotThrow(() => ArticleFormationSerpPayloadSchema.parse(p), "continua um parecer válido");
  // Mantido inteiro: tudo fora de assessment.
  for (const campo of ["candidateRef", "territoryRef", "formationBaseHash", "verdict", "snapshotIds", "interpretation", "humanResolution", "provenance", "contractVersion"] as const) {
    assert.deepEqual(p[campo], cheio[campo], `${campo} igual`);
  }
  const a = p.assessment as unknown as Record<string, unknown> & { snapshots: Array<Record<string, unknown>>; keywordDnaReferences: Array<Record<string, unknown>> };
  const original = cheio.assessment as unknown as typeof a;
  for (const campo of ["formationEvidence", "recommendations", "notes", "conflicts", "queriedKeywordDnaIds", "dominantResultTypes", "evaluationStatus", "id", "contentHash", "version", "queryCount"]) {
    assert.deepEqual(a[campo], original[campo], `assessment.${campo} igual`);
  }
  // SERP bruta: das consultas, os campos escalares; dos orgânicos, só url, domínio e posição.
  assert.equal(a.snapshots.length, original.snapshots.length);
  for (const [indice, snapshot] of a.snapshots.entries()) {
    assert.equal(snapshot.id, original.snapshots[indice].id);
    assert.equal(snapshot.keywordId, original.snapshots[indice].keywordId);
    for (const pesado of ["serpFeatures", "peopleAlsoAsk", "relatedSearches", "diagnostic"]) assert.equal(pesado in snapshot, false, `sem ${pesado}`);
    const organicos = snapshot.organicResults as Array<Record<string, unknown>>;
    assert.equal(organicos.length, (original.snapshots[indice].organicResults as unknown[]).length, "a contagem dos orgânicos é a mesma");
    for (const organico of organicos) assert.deepEqual(Object.keys(organico).sort(), ["domain", "position", "url"]);
  }
  // Cópias do KeywordDNA: identidade, versão e só a intenção esperada.
  for (const referencia of a.keywordDnaReferences) {
    assert.equal("sourceKeywordSnapshot" in referencia, false);
    assert.deepEqual(Object.keys(referencia.payload as object).sort(), ["originalIntentLabel", "searchIntent"]);
    assert.ok(referencia.versionReference);
  }
  const antes = JSON.stringify(cheio).length;
  const depois = JSON.stringify(p).length;
  assert.ok(depois < antes / 4, `a projeção corta o grosso do parecer (${antes} → ${depois} bytes)`);
});

test("projeção · o registro ganha detail: \"list\"; parecer legado (sem interpretation) vai INTEIRO", () => {
  const registro = projectArticleFormationSerpRecord({ candidateRef: "cand-1", workflowItemId: "w1", lockVersion: 1, createdAt: "x", updatedAt: "y", payload: cheio });
  assert.equal(registro.detail, ARTICLE_FORMATION_SERP_LIST_DETAIL);
  const legado = parecerDaFormacao("cand-legado", K, { interpretation: false });
  const registroLegado = projectArticleFormationSerpRecord({ candidateRef: "cand-legado", payload: legado });
  assert.equal("detail" in registroLegado, false);
  assert.deepEqual(registroLegado.payload, legado, "a tela reconstrói o parecer dos orgânicos completos");
});

/* ============================ as operações que liam o parecer inteiro ============================ */

/** O veredito do artigo como `articleSerpVerdictFor` monta (mesmas leituras do assessment). */
function veredito(assessment: Record<string, unknown>) {
  const a = assessment as never as {
    formationEvidence?: { keywordObservations: Array<Record<string, unknown>> };
    recommendations: Array<{ keywordId: string; currentRole: string; decision: { status: string }; action: string; reason: string }>;
    keywordDnaReferences: Array<{ keywordId: string; payload: { searchIntent?: string; originalIntentLabel?: string } }>;
  };
  const observations = (a.formationEvidence?.keywordObservations || []).map(observation => {
    const recommendation = a.recommendations.find(item => item.keywordId === observation.keywordId);
    const reference = a.keywordDnaReferences.find(item => item.keywordId === observation.keywordId);
    return {
      keywordId: String(observation.keywordId), keyword: String(observation.keywordId), currentRole: (recommendation?.currentRole || "secundaria"),
      upstreamIntent: reference?.payload.searchIntent || reference?.payload.originalIntentLabel || null,
      observedIntent: observation.observedIntent, compatibility: observation.compatibility, overlap: observation.overlap,
      dominantPageType: observation.dominantPageType, competition: observation.competition, conflict: observation.conflict,
      insufficientEvidence: observation.insufficientEvidence, likelyCannibalization: observation.likelyCannibalization,
      needsSeparation: observation.needsSeparation, principalPossiblyInadequate: observation.principalPossiblyInadequate,
      decisionStatus: recommendation?.decision.status || "pending", recommendationAction: recommendation?.action || null, recommendationReason: recommendation?.reason || null,
    } as SerpFormationObservationInput;
  });
  return resolveSerpFormationVerdict({ hasAssessment: true, evidencePriority: resolveSerpEvidencePriority(assessment as never).priority, keywordCount: K.length, observations });
}

test("operação · veredito do artigo (prioridade da evidência, observações, intenção esperada): igual sobre a projeção", () => {
  assert.deepEqual(resolveSerpEvidencePriority(projetado.payload.assessment as never), resolveSerpEvidencePriority(cheio.assessment as never));
  assert.equal(resolveSerpEvidencePriority(cheio.assessment as never).priority, "prioritaria", "a fixture tem evidência forte — a comparação não é trivial");
  assert.deepEqual(veredito(projetado.payload.assessment as Record<string, unknown>), veredito(cheio.assessment as Record<string, unknown>));
});

test("operação · o gate da formação (base, veredito, 4 lentes, decisão humana): igual sobre a projeção", () => {
  const observado = (p: typeof cheio) => ({ formationBaseHash: p.formationBaseHash, verdict: p.verdict, lensesComplete: articleSerpLensesComplete(p.interpretation?.lenses), humanDecisionBaseHash: p.humanResolution?.formationBaseHash ?? null });
  assert.deepEqual(observado(projetado.payload), observado(cheio));
  const tresLentes = parecerDaFormacao("cand-3l", K, { lentes: ["desktop-windows", "mobile-android", "mobile-ios"] });
  assert.equal(observado(projectArticleFormationSerpPayload(tresLentes).payload).lensesComplete, false, "lente faltando continua faltando");
});

test("operação · canibalização: o par é confrontado com as MESMAS URLs e domínios", () => {
  const vizinho = parecerDaFormacao("cand-2", ["k2", "k4"]);
  const evidencia = (ref: string, p: typeof cheio): CandidateSerpEvidence => {
    const organicos = ((p.assessment as { snapshots?: Array<{ organicResults?: Array<{ url?: string; domain?: string; position?: number }> }> }).snapshots || [])
      .flatMap(snapshot => snapshot.organicResults || []).slice().sort((x, y) => (x.position ?? 0) - (y.position ?? 0));
    return { candidateRef: ref, label: ref, declaredIntent: "Informativo", observedIntent: null, urls: organicos.map(item => String(item.url || "")).filter(Boolean), domains: organicos.map(item => String(item.domain || "")).filter(Boolean), current: (p.assessment as { evaluationStatus?: string }).evaluationStatus === "active" };
  };
  const pares = [{ left: "cand-1", right: "cand-2" }];
  const comCheio = resolveCandidateBoundaries({ evidence: [evidencia("cand-1", cheio), evidencia("cand-2", vizinho)], pairs: pares });
  const comProjecao = resolveCandidateBoundaries({ evidence: [evidencia("cand-1", projetado.payload), evidencia("cand-2", projectArticleFormationSerpPayload(vizinho).payload)], pairs: pares });
  assert.deepEqual(comProjecao, comCheio);
  assert.ok(comCheio[0].sharedUrls > 0 || comCheio[0].domainOverlap > 0, "a fixture confronta resultados de verdade");
});

test("operação · Reforçar publicados e a melhoria leem a MESMA composição do parecer", () => {
  const lentes = (p: typeof cheio) => p.interpretation?.lenses;
  const composicao = serpAssessmentComposition(cheio.assessment, lentes(cheio));
  assert.deepEqual(serpAssessmentComposition(projetado.payload.assessment, lentes(projetado.payload)), composicao);
  const alvo = { keywordIds: K, principalKeywordId: "k1", roles: { k1: "principal" as const, k2: "secundaria" as const, k3: "secundaria" as const } };
  assert.equal(serpCompositionMismatch(serpAssessmentComposition(projetado.payload.assessment, lentes(projetado.payload)), alvo), serpCompositionMismatch(composicao, alvo));
  const registros = [{ candidateRef: "cand-1", payload: cheio }];
  const linhas = [{ id: "k1", articleFormationRef: "cand-1" }];
  assert.deepEqual(
    aliasPublishedFormationSerp(registros.map(projectArticleFormationSerpRecord), linhas as never).map(item => item.candidateRef),
    aliasPublishedFormationSerp(registros, linhas as never).map(item => item.candidateRef),
  );
});

test("operação · parecer legado: a tela o reconstrói dos orgânicos completos, porque ele não é projetado", () => {
  const legado = parecerDaFormacao("cand-legado", K, { interpretation: false });
  const candidato = { principalKeywordId: "k1", keywordIds: K };
  const daLista = projectArticleFormationSerpPayload(legado).payload;
  assert.deepEqual(articleSerpParecerFromAssessment(daLista as never, candidato), articleSerpParecerFromAssessment(legado as never, candidato));
  assert.ok(articleSerpParecerFromAssessment(legado as never, candidato), "a reconstrução dá um parecer");
});

/* ============================ a fusão da releitura ============================ */

const base = (): ArchitectWorkspaceData => ({
  source: "CANONICAL_REMOTE",
  workflowItems: [
    { id: "i1", subjectType: "keyword", subjectId: "k1", state: "received", lockVersion: 1, payload: {} },
    { id: "i2", subjectType: "keyword", subjectId: "k2", state: "received", lockVersion: 1, payload: {} },
  ],
  importEligibility: [{ keywordId: "k1", importability: "WORKFLOW_RECEIVED", workflowState: "received" }],
  keywords: [{ id: "k1", brand_id: "b", keyword: "um" }, { id: "k2", brand_id: "b", keyword: "dois" }],
  availableKeywords: [{ id: "k1", brand_id: "b", keyword: "um" }, { id: "k2", brand_id: "b", keyword: "dois" }, { id: "k9", brand_id: "b", keyword: "nove" }],
  articleDnas: [{ entityId: "a1", versionId: "a1:v1" }, { entityId: "a2", versionId: "a2:v1" }],
  siloDnas: [], siloPages: [], aiReviews: [], statuses: [{ versionId: "a1:v1", status: "approved" }],
  brandSiloCatalog: [], territories: [{ territoryRef: "t1" }], siloWorkingCopies: [], territorialSerp: [], territorialAi: [],
  articleFormationSerp: [{ candidateRef: "c1", lockVersion: 1 }],
  architectureMarker: { m: 1 }, articleFormationMarker: null,
});

test("fusão · sem mudança, a mesa é a mesma", () => {
  const fundida = mergeArchitectWorkspaceDelta(base(), {});
  assert.ok(fundida.ok);
  assert.deepEqual(fundida.data, base());
});

test("fusão · troca só as linhas que mudaram, respeita a ordem do servidor e o conjunto das recebidas", () => {
  const fundida = mergeArchitectWorkspaceDelta(base(), {
    workflowItems: { upsert: [{ id: "i3", subjectType: "keyword", subjectId: "k3", state: "received", lockVersion: 1, payload: {} }, { id: "i1", subjectType: "keyword", subjectId: "k1", state: "received", lockVersion: 2, payload: { clusterId: "x" } }], remove: ["i2"], order: ["i1", "i3"] },
    keywords: { upsert: [{ id: "k3", brand_id: "b", keyword: "três" }, { id: "k1", brand_id: "b", keyword: "um (relida)" }] },
    articleDnas: { upsert: [{ entityId: "a1", versionId: "a1:v2" }], remove: ["a2"] },
    articleFormationSerp: { upsert: [{ candidateRef: "c2", lockVersion: 1 }], remove: [], order: ["c2", "c1"] },
    territories: [],
    articleFormationMarker: { f: 1 },
  });
  assert.ok(fundida.ok);
  const d = fundida.data;
  assert.deepEqual(d.workflowItems.map(item => `${item.id}:${item.lockVersion}`), ["i1:2", "i3:1"]);
  assert.deepEqual(d.keywords.map(item => item.keyword).sort(), ["três", "um (relida)"], "k2 saiu com o item; k1 relida; k3 entrou");
  assert.deepEqual(d.articleDnas, [{ entityId: "a1", versionId: "a1:v2" }]);
  assert.deepEqual(d.articleFormationSerp.map(item => item.candidateRef), ["c2", "c1"]);
  assert.deepEqual(d.territories, [], "coleção relida vazia substitui (o servidor leu: vazio confirmado)");
  assert.deepEqual(d.articleFormationMarker, { f: 1 });
  assert.deepEqual(d.architectureMarker, { m: 1 }, "seção ausente = não mudou");
  assert.deepEqual(d.availableKeywords, base().availableKeywords, "sem mudança no índice");
});

test("fusão · o que não fecha faz a tela reler tudo (nunca uma mesa pela metade)", () => {
  assert.equal(mergeArchitectWorkspaceDelta(base(), { workflowItems: { upsert: [{ id: "i9", subjectType: "keyword", subjectId: "k9", state: "received", lockVersion: 1 }], remove: [] }, keywords: { upsert: [{ id: "k9", brand_id: "b", keyword: "nove" }] } }).ok, false, "chave nova sem ordem");
  assert.equal(mergeArchitectWorkspaceDelta(base(), { articleDnas: { upsert: [], remove: [], order: ["a1", "a2", "a3"] } }).ok, false, "a ordem cita o que a fusão não tem");
  assert.equal(mergeArchitectWorkspaceDelta(base(), { workflowItems: { upsert: [{ id: "i3", subjectType: "keyword", subjectId: "k3", state: "received", lockVersion: 1 }], remove: [], order: ["i1", "i2", "i3"] } }).ok, false, "keyword recebida sem a linha dela");
});

test("marcas · remendo e aplicação: só o que mudou viaja; aplicar devolve as marcas do servidor", () => {
  const antes: ArchitectSyncMarks = { v: 1, items: { i1: "1|a", i2: "1|b" }, kw: { k1: "x" }, art: { "article_dna:a1": "a1:v1" }, serp: {}, hashes: { orderItems: "o1" } };
  const depois: ArchitectSyncMarks = { v: 1, items: { i1: "2|c", i3: "1|d" }, kw: { k1: "x" }, art: { "article_dna:a1": "a1:v2" }, serp: { c1: "w|1|t" }, hashes: { orderItems: "o2" } };
  const patch = syncPatchOf(depois, antes);
  assert.deepEqual(patch.items, { set: { i1: "2|c", i3: "1|d" }, remove: ["i2"] });
  assert.equal(patch.kw, undefined, "impressão igual não viaja");
  assert.deepEqual(applySyncPatch(antes, patch), depois);
  assert.deepEqual(diffSyncMarks(depois.items, antes.items), { changed: ["i1", "i3"], removed: ["i2"] });
  assert.ok(isArchitectSyncMarks(depois));
  assert.equal(isArchitectSyncMarks({ v: 2 }), false);
  assert.equal(syncHash(stableJson({ b: 1, a: [1, { c: 2 }] })), syncHash(stableJson({ a: [1, { c: 2 }], b: 1 })), "a ordem das chaves não muda a impressão");
  assert.notEqual(syncHash("a"), syncHash("b"));
});

/* ============================ leituras estruturais ============================ */

test("estrutura · a tela relê pelo delta; a 1ª leitura de cada abertura é a inteira; a exportação pede o parecer inteiro", () => {
  const cliente = semComentarios(ler("lib/arquiteto/canonical-workspace.ts"));
  assert.match(cliente, /fetch\("\/api\/arquiteto\/workspace\/delta"/);
  assert.match(cliente, /if \(options\.keywordDetail === "full" \|\| options\.serpDetail === "full"\) \{/, "detalhe completo é sempre a leitura inteira e não vira base");
  assert.match(cliente, /const base = options\.fresh \? undefined : baseDaMesa\.get\(brandId\);/);
  assert.doesNotMatch(cliente, /localStorage|indexedDB|IndexedDB/, "a base da releitura é só memória desta aba");
  const tela = semComentarios(ler("modules/arquiteto/arquiteto-workspace.tsx"));
  assert.match(tela, /loadCanonicalArquitetoWorkspace\(brandId, leituraFresca \? \{ fresh: true \} : \{\}\)/);
  assert.match(tela, /loadCanonicalArquitetoWorkspace\(selectedBrandId, \{ serpDetail: "full" \}\)\.catch\(\(\) => null\)/, "a exportação (backup) leva o parecer inteiro");
  const http = semComentarios(ler("lib/server/arquiteto-workspace-http.ts"));
  assert.match(http, /articleFormationSerp: serpCheio \? articleFormationSerp : articleFormationSerp\.map\(projectArticleFormationSerpRecord\)/);
  assert.match(http, /const baseDaReleitura = options\.groupFilter\.kind === "all" && !options\.keywordDetail && !serpCheio;/);
  const rota = semComentarios(ler("app/api/arquiteto/workspace/delta/route.ts"));
  assert.match(rota, /export async function POST/);
  assert.doesNotMatch(rota, /export async function (GET|PATCH|DELETE|PUT)/);
});

test("estrutura · a releitura e a projeção NUNCA escrevem; as escritas do parecer leem a linha gravada inteira", () => {
  const sync = semComentarios(ler("lib/server/arquiteto-workspace-sync.ts"));
  assert.doesNotMatch(sync, /\.(insert|update|upsert|delete)\(/);
  assert.doesNotMatch(sync, /fetch\(/, "nenhum provider");
  const loja = semComentarios(ler("lib/server/arquiteto-article-serp-store.ts"));
  assert.doesNotMatch(loja, /projectArticleFormationSerp/, "o que é gravado nasce do registro inteiro, nunca da projeção");
  const projecao = semComentarios(ler("lib/arquiteto/article-serp-projection.ts"));
  assert.doesNotMatch(projecao, /fetch\(|supabase|localStorage/);
});

test("estrutura · nenhum caminho de entregável usa o leitor leve (CSV Para escrever, artigo-modelo, Redator, MCP de escrita)", () => {
  const arquivos: string[] = [];
  const varrer = (pasta: string) => {
    for (const nome of readdirSync(new URL(`../${pasta}`, import.meta.url))) {
      const caminho = `${pasta}/${nome}`;
      if (statSync(new URL(`../${caminho}`, import.meta.url)).isDirectory()) varrer(caminho);
      else if (/\.(ts|tsx)$/.test(nome)) arquivos.push(caminho);
    }
  };
  varrer("lib/redator");
  varrer("modules/redator");
  for (const nome of readdirSync(new URL("../lib/radar", import.meta.url))) if (/^portable-(writing-export|export|video-export|silo-export)/.test(nome)) arquivos.push(`lib/radar/${nome}`);
  arquivos.push("lib/server/radar-portable-export-core.ts", "app/api/editorial/radar-export/route.ts", "lib/radar/article-blueprint.ts", "lib/radar/article-blueprint-freeze.ts",
    "lib/radar/editorial-blueprint.ts", "lib/radar/human-voice-guideline.ts", "lib/radar/natural-anchor.ts", "lib/radar/editorial-identity.ts", "lib/server/platform-mcp-tools.ts", "lib/server/radar-mcp-material.ts");
  const existentes = arquivos.filter(arquivo => existsSync(new URL(`../${arquivo}`, import.meta.url)));
  assert.ok(existentes.length >= 15, `a lista do §2.1 foi encontrada (${existentes.length})`);
  for (const arquivo of existentes) {
    assert.doesNotMatch(semComentarios(ler(arquivo)), /listLight\(|projectArticleFormationSerp|artifactRead|workspace\/delta|readArchitectSyncState|mergeArchitectWorkspaceDelta/, `${arquivo} não usa o leitor leve`);
  }
});

test("estrutura · a mesa sem convites e sem visualizações; a Marca lê os convites dela; /api/inteligencia sem o DNA", () => {
  const rota = semComentarios(ler("app/api/editorial/workspace/route.ts"));
  assert.doesNotMatch(rota, /InvitationRepository|ViewPreferenceRepository/);
  const pipeline = semComentarios(ler("components/editorial-pipeline-context.tsx"));
  assert.match(pipeline, /invitations: persisted\.invitations \?\? current\.invitations,/, "ausente não apaga a lista que a memória tem");
  const marca = semComentarios(ler("modules/marca/brand-page.tsx"));
  assert.match(marca, /fetch\(`\/api\/editorial\/invitations\?brandId=\$\{encodeURIComponent\(equipeBrandId\)\}`/);
  assert.match(marca, /Isto não quer dizer que não há convites\./, "falha de leitura não vira lista vazia");
  const convites = semComentarios(ler("app/api/editorial/invitations/route.ts"));
  assert.match(convites, /export async function GET[\s\S]*assertEditorialPermission\(profile, brandId, "marca", "view"\)/);
  const inteligencia = semComentarios(ler("app/api/inteligencia/route.ts"));
  assert.doesNotMatch(inteligencia, /analise_semantica/);
  assert.match(inteligencia, /\.select\("id,keyword,intent,volume_search,kgr_score,lista_id,status,created_at"\)\.eq\("brand_id", marcaId\)/);
});

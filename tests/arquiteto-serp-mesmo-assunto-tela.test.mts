/**
 * D2.1 e D2.2 · TELA — o dilema de cada publicado e de cada Assunto na mesa.
 *
 * Três metades:
 *   1. o modelo puro da tela (`modules/arquiteto/serp-subject-model.ts`), com
 *      a leitura real da AdalbaPro (fixture do cache, sem custo) e sem rede;
 *   2. a troca aplicada como NOVA versão do ArticleDNA, com o schema de hoje
 *      (nenhum formato novo) e a identidade publicada intocada;
 *   3. a estrutura dos componentes e da fiação, lida como texto SEM
 *      comentários (um comentário que cita o código casaria com a busca).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import type { ArticleFormationKeyword } from "../lib/arquiteto/article-formation.ts";
import { proposeCrossSiloReinforcements } from "../lib/arquiteto/article-formation-priority.ts";
import { buildSerpSubjectIndex, type KeywordSerpFootprint } from "../lib/arquiteto/serp-subject-overlap.ts";
import { decidePublishedPrimarySwap } from "../lib/arquiteto/published-primary-swap.ts";
import { diagnoseSerpSubjectAnchors, type AnchorSerpDiagnosis, type PublishedAnchorInfo } from "../lib/arquiteto/serp-subject-diagnosis.ts";
import { ArticleDNASchema, type ArticleDNA } from "../lib/arquiteto/contracts.ts";
import {
  SERP_SUBJECT_READ_BATCH,
  appliedPublishedSwapOf,
  buildPublishedSwapArticlePayload,
  describeSerpSubjectBatchOutcome,
  evidenceTargetsOf,
  freshPostRefusal,
  freshPublishedPostOf,
  keptSwapKey,
  mergeSerpSubjectReads,
  planSerpSubjectRead,
  publishedSwapReadiness,
  readKeptSwaps,
  reconciliationPrincipalKeywordId,
  reinforcementSearchOutcomes,
  serializeKeptSwaps,
  serpSubjectBatchChoices,
  serpSubjectCardView,
  serpSubjectEgressLabel,
  serpSubjectEvidencePairs,
  serpSubjectSessionLabel,
  readSerpSubjectSession,
  serializeSerpSubjectSession,
  summarizeSerpSubjectCards,
  describeSuggestionOutcome,
  initialSuggestionSelection,
  leftoverOpportunitiesView,
  suggestionApplyPreview,
  type SerpSubjectCardView,
} from "../modules/arquiteto/serp-subject-model.ts";
import { groupLeftoverOpportunities } from "../lib/arquiteto/serp-subject-suggestions.ts";
import { parseReinforcementSearchLink, parseSubjectSearchLink, reinforcementSearchFields } from "../modules/minerador/discovery/subject-search-model.ts";
import { findVisualViolations } from "../scripts/check-visual-system.mjs";

let chamadasDeRede = 0;
globalThis.fetch = (async () => {
  chamadasDeRede += 1;
  throw new Error("Rede proibida nos testes da tela de mesmo assunto.");
}) as typeof fetch;

type Linha = { keywordId: string; keyword: string; volume: number | null; intent: string | null; published: boolean; lenses: Array<{ lens: string; urls: string[] | null }> };
const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/arquiteto-serp-mesmo-assunto-adalbapro.json", import.meta.url), "utf8")) as { keywords: Linha[] };
const LINHA = new Map(FIXTURE.keywords.map(linha => [linha.keywordId, linha]));
const pegadas = (): KeywordSerpFootprint[] => FIXTURE.keywords.map(linha => ({
  keywordId: linha.keywordId,
  keyword: linha.keyword,
  lenses: linha.lenses.map(leitura => ({ lens: leitura.lens, urls: leitura.urls, domains: null, collectedAt: "2026-09-20T12:00:00+00:00" })),
}));
const INDICE = buildSerpSubjectIndex(pegadas());
const kw = (keywordId: string, overrides: Partial<ArticleFormationKeyword> = {}): ArticleFormationKeyword => {
  const linha = LINHA.get(keywordId)!;
  return { keywordId, keyword: linha.keyword, intent: linha.intent, volume: linha.volume, kgr: null, entity: null, problem: null, isPublished: linha.published, ...overrides };
};
const mapaDe = (ids: string[], overrides: Record<string, Partial<ArticleFormationKeyword>> = {}) => new Map(ids.map(id => [id, kw(id, overrides[id])] as const));
const sem = new Set<string>();
const publicado = (post: PublishedAnchorInfo["post"], slug: string): PublishedAnchorInfo => ({ post, url: `https://adalbapro.com.br/${slug}`, canonical: `https://adalbapro.com.br/${slug}`, slug });
const nomeDe = (keywordId: string) => LINHA.get(keywordId)?.keyword || keywordId;
const ATOR = "11111111-1111-4111-8111-111111111111";

/** O lote do domínio: um publicado por dilema, com a SERP real. */
function loteReal() {
  const keywords = mapaDe(
    ["kw-01", "kw-02", "kw-04", "kw-07", "kw-08", "kw-09", "kw-10", "kw-11", "kw-15", "kw-16", "kw-17", "kw-19"],
    { "kw-01": { intent: "Informativo" } },
  );
  const silos = [
    { siloRef: "territory:a", siloLabel: "Captação de pacientes", siloTokens: sem, plan: {
      anchors: [
        { kind: "published" as const, principalKeywordId: "kw-01", keywordIds: ["kw-01", "kw-09", "kw-10", "kw-11"] },
        { kind: "published" as const, principalKeywordId: "kw-04", keywordIds: ["kw-04"] },
      ], awaitingSubjectKeywordIds: [], leftoverKeywordIds: [] } },
    { siloRef: "territory:odonto", siloLabel: "Marketing odontológico", siloTokens: sem, plan: {
      anchors: [{ kind: "published" as const, principalKeywordId: "kw-02", keywordIds: ["kw-02", "kw-15", "kw-16", "kw-17"] }],
      awaitingSubjectKeywordIds: [], leftoverKeywordIds: [] } },
    { siloRef: "territory:b", siloLabel: "Leads sem tráfego pago", siloTokens: sem, plan: {
      anchors: [
        { kind: "published" as const, principalKeywordId: "kw-07", keywordIds: ["kw-07"] },
        { kind: "published" as const, principalKeywordId: "kw-08", keywordIds: ["kw-08"] },
      ], awaitingSubjectKeywordIds: [], leftoverKeywordIds: ["kw-19"] } },
  ];
  const indice = buildSerpSubjectIndex(pegadas().filter(item => item.keywordId !== "kw-08"));
  const crossSiloProposals = proposeCrossSiloReinforcements({ silos, keywords, serpSubject: indice });
  const published = new Map([
    ["kw-01", publicado("free", "como-atrair-pacientes-para-clinica")],
    ["kw-02", publicado("locked", "marketing-digital-para-dentistas")],
    ["kw-04", publicado("locked", "captacao-de-pacientes")],
    ["kw-07", publicado("locked", "promocoes-para-estetica")],
    ["kw-08", publicado("locked", "leads-sem-trafego-pago")],
  ]);
  const diagnosticos = diagnoseSerpSubjectAnchors({
    silos, keywords, serp: indice, crossSiloProposals, published,
    volumeValidated: new Set(["kw-09", "kw-10", "kw-11", "kw-15", "kw-16", "kw-17", "kw-19"]),
    brandRef: "adalbapro--brand",
  });
  return { diagnosticos, indice, published, de: new Map(diagnosticos.map(item => [item.anchorKeywordId, item])) };
}

/* ============================ 1. leitura do cache ============================ */

test("o pedido da SERP da mesa: âncoras primeiro, sem duplicata, lotes de até 600 e nada cortado", () => {
  const alvos = [
    { keywordId: "livre-1", keyword: "  como   captar pacientes ", priority: "free" as const },
    { keywordId: "pub-1", keyword: "captação de pacientes", priority: "published" as const },
    { keywordId: "assunto-1", keyword: "SEO para clínicas", priority: "subject" as const },
    { keywordId: "livre-1", keyword: "como captar pacientes", priority: "subject" as const },
    { keywordId: "vazia", keyword: "   ", priority: "free" as const },
  ];
  const plano = planSerpSubjectRead(alvos);
  assert.equal(plano.total, 3);
  assert.deepEqual(plano.batches[0].map(item => item.keywordId), ["pub-1", "assunto-1", "livre-1"], "a prioridade mais alta vence a duplicata");
  assert.equal(plano.batches[0][2].keyword, "como captar pacientes", "espaços normalizados");
  assert.equal(planSerpSubjectRead([...alvos].reverse()).signature, plano.signature, "a assinatura não depende da ordem");

  const muitos = Array.from({ length: 1250 }, (_, index) => ({ keywordId: `k-${String(index).padStart(4, "0")}`, keyword: `keyword ${index}`, priority: "free" as const }));
  const grande = planSerpSubjectRead(muitos);
  assert.deepEqual(grande.batches.map(lote => lote.length), [600, 600, 50]);
  assert.equal(grande.batches.flat().length, 1250);
  const servidor = readFileSync("lib/server/arquiteto-serp-subject-store.ts", "utf8");
  assert.match(servidor, new RegExp(`SERP_SUBJECT_MAX_KEYWORDS = ${SERP_SUBJECT_READ_BATCH};`), "o lote da tela é o teto da rota");
});

test("as respostas dos lotes se juntam: egress soma, keyword aparece uma vez, sem SERP é só quem não voltou", () => {
  const [a, b] = pegadas();
  const junto = mergeSerpSubjectReads([
    { footprints: [a], withoutSerp: ["x", b.keywordId], missingLenses: [{ keywordId: a.keywordId, lens: "desktop-windows", reason: "sem digest" }], egress: { queries: 2, entriesRead: 8, approxBytes: 4096 }, targetingReadFailed: false },
    { footprints: [b, a], withoutSerp: [], missingLenses: [{ keywordId: a.keywordId, lens: "desktop-windows", reason: "sem digest" }], egress: { queries: 1, entriesRead: 4, approxBytes: 2048 }, targetingReadFailed: true },
  ]);
  assert.equal(junto.footprints.length, 2);
  assert.deepEqual(junto.withoutSerp, ["x"]);
  assert.equal(junto.missingLenses.length, 1);
  assert.deepEqual(junto.egress, { queries: 3, entriesRead: 12, approxBytes: 6144 });
  assert.equal(junto.targetingReadFailed, true);
  assert.equal(serpSubjectEgressLabel(junto.egress), "Leitura do cache: 3 consulta(s) ao banco, 12 entrada(s), cerca de 6 KB. Nenhuma chamada paga ao provider.");
  assert.equal(serpSubjectEgressLabel(null), "Leitura do cache ainda não feita.");
});

/* ============================ 2. o cartão de cada dilema ============================ */

test("cada dilema fala como o dono pediu: curto, com o ato certo", () => {
  const { diagnosticos, de } = loteReal();
  const cartao = (id: string, extra: Parameters<typeof serpSubjectCardView>[1] = {}) => serpSubjectCardView(de.get(id)!, { nameOf: nomeDe, ...extra });

  const troca = cartao("kw-01", { post: "free", swapReadiness: { ready: true } });
  assert.equal(troca.state, "swap_proposed");
  assert.equal(troca.stateLabel, "Troca proposta");
  assert.equal(troca.headline, "Troca da principal sugerida: \"como atrair pacientes\" (volume 20, 7 páginas em comum). URL e slug continuam.");
  assert.match(troca.subline!, /Posto: Livre.*"como atrair pacientes para clínica" vira secundária/);
  assert.deepEqual(troca.actions.map(action => action.label), ["Aplicar troca", "Manter"]);
  assert.equal(troca.actions[0].kind === "apply_swap" && troca.actions[0].disabledReason, null);

  const reforcado = cartao("kw-02", { post: "locked" });
  assert.equal(reforcado.state, "reinforced");
  assert.equal(reforcado.headline, "Reforçado com 3 keywords que dividem a SERP. Cabem mais 2.");
  assert.match(reforcado.subline!, /Posto: Travado ao slug/);

  const outroSilo = cartao("kw-04", { post: "locked" });
  assert.equal(outroSilo.state, "pair_in_other_silo");
  assert.equal(outroSilo.headline, "O par está no Silo \"Leads sem tráfego pago\": trazer?");
  assert.match(outroSilo.subline!, /"como captar pacientes" · 3 páginas em comum/);
  const trazer = outroSilo.actions.find(action => action.kind === "bring_pair");
  assert.ok(trazer && trazer.kind === "bring_pair" && trazer.proposals[0].keywordId === "kw-19");
  assert.equal(trazer!.label, "Trazer para este artigo");

  const semPar = cartao("kw-07", { post: "locked" });
  assert.equal(semPar.state, "no_pair_in_batch");
  assert.equal(semPar.headline, "Nenhuma keyword deste lote trata do mesmo assunto no Google.");
  assert.match(semPar.subline!, /URL do artigo como página de destino/);
  assert.deepEqual(semPar.actions, [{ kind: "search_reinforcement", label: "Buscar reforço", href: "/adalbapro--brand/minerador/descobrir?modo=assunto&reforco=kw-07" }]);

  const semSerp = cartao("kw-08", { post: "locked" });
  assert.equal(semSerp.state, "serp_missing");
  assert.match(semSerp.headline, /^Sem SERP de "leads sem tráfego pago" no cache/);
  assert.deepEqual(semSerp.actions.map(action => action.kind), ["collect_serp", "search_reinforcement"]);

  const resumo = summarizeSerpSubjectCards(diagnosticos.map(item => serpSubjectCardView(item, { post: item.anchorKeywordId === "kw-01" ? "free" : "locked" })));
  assert.equal(resumo.published, 5);
  assert.equal(resumo.reinforced, 1);
  assert.equal(resumo.swapsSuggested, 1);
  assert.equal(resumo.pairsInOtherSilos, 1);
  assert.equal(resumo.withoutPair, 1);
  assert.equal(resumo.withoutSerp, 1);
  // D2.3 — o resumo conta os cartões com sugestões de reforço com volume.
  assert.equal(resumo.withSuggestions, diagnosticos.filter(item => item.suggestions.length > 0).length);
  assert.equal(resumo.headline, `5 publicados e 0 Assuntos: 1 reforçado, 1 troca sugerida, ${resumo.withSuggestions} com sugestões de reforço, 1 par em outro Silo, 1 sem par no lote.`);
  assert.equal(chamadasDeRede, 0);
});

test("Tema sem demanda no Google: depois da busca sem volume, a decisão é do dono e o link continua", () => {
  const [diagnostico] = diagnoseSerpSubjectAnchors({
    silos: [{ siloRef: "territory:b", siloLabel: "Leads", plan: { anchors: [{ kind: "published", principalKeywordId: "kw-07", keywordIds: ["kw-07"] }], awaitingSubjectKeywordIds: [], leftoverKeywordIds: [] } }],
    keywords: mapaDe(["kw-07", "kw-20"]), serp: INDICE,
    published: new Map([["kw-07", publicado("locked", "promocoes-para-estetica")]]),
    volumeValidated: new Set(["kw-20"]),
    reinforcementSearches: new Map([["kw-07", { searchedAt: "2026-09-26T20:00:00Z", candidateCount: 14, candidatesWithDemand: 0 }]]),
  });
  const cartao = serpSubjectCardView(diagnostico, {
    post: "locked",
    reinforcementSearch: { searchedAt: "2026-09-26T20:00:00Z", candidateCount: 14, candidatesWithDemand: 0 },
    reinforcementHref: "/adalbapro--brand/minerador/descobrir?modo=assunto&reforco=kw-07",
  });
  assert.equal(cartao.state, "no_demand");
  assert.equal(cartao.stateLabel, "Tema sem demanda no Google");
  assert.equal(cartao.headline, "Tema sem demanda no Google.");
  assert.match(cartao.subline!, /14 candidatas, nenhuma com volume\. A decisão é sua\./);
  assert.deepEqual(cartao.actions, [{ kind: "search_reinforcement", label: "Buscar reforço de novo", href: "/adalbapro--brand/minerador/descobrir?modo=assunto&reforco=kw-07" }]);
});

test("Manter e troca aplicada mudam o cartão; Posto não declarado pede a declaração", () => {
  const { de } = loteReal();
  const mantida = serpSubjectCardView(de.get("kw-01")!, { post: "free", kept: true });
  assert.equal(mantida.state, "swap_kept");
  assert.match(mantida.headline, /^Principal mantida por você: "como atrair pacientes para clínica"\. A sugestão era "como atrair pacientes"/);
  assert.deepEqual(mantida.actions.map(action => action.kind), ["review_swap"]);

  const aplicada = serpSubjectCardView(de.get("kw-01")!, { post: "free", nameOf: nomeDe, appliedSwap: { previousKeywordId: "kw-01", selectedKeywordId: "kw-09", decidedAt: null, actorId: ATOR } });
  assert.equal(aplicada.state, "swap_applied");
  assert.equal(aplicada.tone, "success");
  assert.equal(aplicada.headline, "Troca aplicada: \"como atrair pacientes\" é a principal e \"como atrair pacientes para clínica\" ficou como secundária. URL e slug continuam.");
  assert.equal(aplicada.actions.length, 0);

  const semPosto = serpSubjectCardView(de.get("kw-07")!, { post: "unknown", mineradorHref: "/adalbapro--brand/minerador" });
  assert.match(semPosto.subline!, /Posto: não declarado \(o Minerador mostra "Travado ao slug" por padrão, mas ninguém declarou\)/);
  assert.deepEqual(semPosto.actions.at(-1), { kind: "open_minerador", label: "Declarar o Posto no Minerador", href: "/adalbapro--brand/minerador" });

  const chave = keptSwapKey("kw-01", "kw-09");
  assert.deepEqual([...readKeptSwaps(serializeKeptSwaps(new Set([chave, "kw-02>kw-15"])))].sort(), ["kw-01>kw-09", "kw-02>kw-15"]);
  assert.equal(readKeptSwaps("{quebrado").size, 0);
  assert.equal(readKeptSwaps(JSON.stringify(["sem-seta", 3])).size, 0);
});

test("a evidência ao expandir: páginas em comum com as lentes de cada lado, e a lente que falta", () => {
  const { de, indice } = loteReal();
  const pares = serpSubjectEvidencePairs({ index: indice, anchorKeywordId: "kw-01", others: evidenceTargetsOf(de.get("kw-01")!) });
  const substituta = pares.find(par => par.keywordId === "kw-09")!;
  assert.equal(substituta.relation, "substitute", "a substituta vem primeiro e não repete como membro");
  assert.equal(pares.filter(par => par.keywordId === "kw-09").length, 1);
  assert.equal(substituta.sharedPageCount, 7);
  assert.equal(substituta.pages.length, 7);
  for (const pagina of substituta.pages) {
    assert.ok(pagina.anchorLenses.length > 0 && pagina.otherLenses.length > 0);
    assert.ok(!pagina.anchorLenses.includes("desktop-windows"), "a canônica não tem digest");
  }
  assert.deepEqual(substituta.missingLensesAnchor, ["desktop-windows"]);
  assert.equal(serpSubjectEvidencePairs({ index: null, anchorKeywordId: "kw-01", others: [] }).length, 0);
});

/* ============================ 3. a troca como nova versão ============================ */

function referencia(keywordId: string, role: "principal" | "secundaria" | "reforco_narrativo") {
  return {
    keywordId, keywordDnaVersionId: `legacy:dna-${keywordId}:v1`, keywordDnaContentHash: `legacy:dna-${keywordId}`,
    role, strategicContribution: "Sustenta o artigo.", coveredIntentions: ["informacional"], requiredTopics: [], excludedTopics: [],
    classificationOrigin: "system" as const, confidence: 0.7, humanConfirmed: false,
    ...(role === "principal" ? { keywordUrlRelation: "confirmed_primary" as const } : {}),
  };
}
function artigoPublicado(extra: Partial<ArticleDNA> = {}): ArticleDNA {
  return ArticleDNASchema.parse({
    schemaVersion: 1, articleId: "article-atrair-pacientes", brandId: "5b0e7c1a-2d3f-4a5b-8c9d-0e1f2a3b4c5d",
    principalKeywordId: "kw-01", secondaryKeywordIds: ["kw-09", "kw-10"], narrativeReinforcementIds: ["kw-11"],
    keywordReferences: [referencia("kw-01", "principal"), referencia("kw-09", "secundaria"), referencia("kw-10", "secundaria"), referencia("kw-11", "reforco_narrativo")],
    siloId: null, hierarchy: "Suporte", suggestedSlug: "como-atrair-pacientes-para-clinica",
    canonical: "https://adalbapro.com.br/como-atrair-pacientes-para-clinica", mainIntent: "informacional", auxiliaryIntents: [],
    audience: "Donas de clínica", problem: "Agenda vazia", desiredResult: "Agenda cheia", journeyStage: "TOFU", brandObjective: "Serviço",
    promise: "Atrair pacientes", angle: "Orgânico", cta: "Conhecer", coverage: ["captação"], excludedSubjects: [],
    antiCannibalizationBoundary: "Não trata de gestão.", nearbyArticleIds: [], differentiation: [], entities: [], requiredTopics: [],
    questions: [], objections: [], evidenceNeeded: [], sourcesNeeded: [], internalLinks: [], alerts: [], confidence: 0.7, humanPendingDecisions: [],
    primaryKeywordPolicy: "free",
    primaryKeywordPolicyContext: { policy: "free", currentKeyword: "como atrair pacientes para clínica" },
    ...extra,
  });
}

test("a troca aceita vira nova versão: nova principal, antiga secundária, reforço no lugar, URL/slug/canonical iguais", () => {
  const { de } = loteReal();
  const diagnostico = de.get("kw-01")!;
  const atual = artigoPublicado();
  assert.deepEqual(publishedSwapReadiness({ diagnosis: diagnostico, article: atual, currentPost: "free" }), { ready: true });
  const decidida = decidePublishedPrimarySwap({
    proposal: diagnostico.swap!, currentPost: "free", accepted: true, actorUserId: ATOR, decidedAt: "2026-09-26T21:00:00-03:00",
    article: { principalKeywordId: atual.principalKeywordId, keywordIds: atual.keywordReferences.map(item => item.keywordId), identity: { url: atual.canonical, canonical: atual.canonical, slug: atual.suggestedSlug } },
  });
  assert.ok(decidida.ok);
  if (!decidida.ok) return;
  const nova = buildPublishedSwapArticlePayload({ current: atual, outcome: decidida, actorId: ATOR, decidedAt: "2026-09-26T21:00:00-03:00", substituteLabel: "como atrair pacientes", previousLabel: "como atrair pacientes para clínica" });
  assert.equal(nova.principalKeywordId, "kw-09");
  assert.deepEqual(nova.secondaryKeywordIds, ["kw-01", "kw-10"]);
  assert.deepEqual(nova.narrativeReinforcementIds, ["kw-11"], "reforço narrativo não é rebaixado de carona");
  assert.equal(nova.keywordReferences[0].keywordId, "kw-09");
  assert.equal(nova.keywordReferences.find(item => item.keywordId === "kw-01")?.role, "secundaria");
  for (const campo of ["articleId", "brandId", "suggestedSlug", "canonical", "siloId", "hierarchy"] as const) assert.deepEqual(nova[campo], atual[campo], campo);
  assert.equal(nova.primaryKeywordDecision?.status, "confirmed");
  assert.equal(nova.primaryKeywordDecision?.previousKeywordId, "kw-01");
  assert.equal(nova.primaryKeywordDecision?.actorId, ATOR);
  assert.equal(nova.primaryKeywordPolicy, "free", "o Posto não muda de carona");
  assert.equal(nova.primaryKeywordPolicyContext?.currentKeyword, "como atrair pacientes");
  assert.equal(nova.primaryKeywordPolicyContext?.publishedOriginalKeyword, "como atrair pacientes para clínica");
  assert.equal(nova.primaryKeywordPolicyContext?.history?.length, 1);
  assert.ok(nova.alerts.some(alerta => /URL, slug e canonical preservados/.test(alerta)));
  assert.deepEqual(Object.keys(nova).filter(chave => !(chave in atual)).sort(), ["primaryKeywordCandidates", "primaryKeywordDecision"], "só campos que o schema já aceita");
  ArticleDNASchema.parse(nova);

  assert.deepEqual(appliedPublishedSwapOf(nova), { previousKeywordId: "kw-01", selectedKeywordId: "kw-09", decidedAt: "2026-09-27T00:00:00.000Z", actorId: ATOR });
  assert.equal(appliedPublishedSwapOf(atual), null);
  const publicadas = new Set(["kw-01"]);
  assert.equal(reconciliationPrincipalKeywordId(nova, publicadas), "kw-01", "a mesa reconcilia pela página publicada");
  assert.equal(reconciliationPrincipalKeywordId(nova, new Set()), "kw-09", "sem publicada anterior, a principal de sempre");
  assert.equal(reconciliationPrincipalKeywordId(atual, publicadas), "kw-01");
  assert.deepEqual(publishedSwapReadiness({ diagnosis: diagnostico, article: nova, currentPost: "free" }), { ready: false, reason: "A troca já foi aplicada neste artigo." });
});

test("a troca só é oferecida quando pode ser gravada, e cada impedimento diz o que fazer", () => {
  const { de } = loteReal();
  const diagnostico = de.get("kw-01")!;
  const semArtigo = publishedSwapReadiness({ diagnosis: diagnostico, article: null, currentPost: "free" });
  assert.ok(!semArtigo.ready && /conclua a formação dele \(Concluir formação\)/.test(semArtigo.reason));
  const semSubstituta = publishedSwapReadiness({ diagnosis: diagnostico, article: artigoPublicado({ secondaryKeywordIds: ["kw-10"], keywordReferences: [referencia("kw-01", "principal"), referencia("kw-10", "secundaria"), referencia("kw-11", "reforco_narrativo")] } as Partial<ArticleDNA>), currentPost: "free" });
  assert.ok(!semSubstituta.ready && /"como atrair pacientes" ainda não está no ArticleDNA/.test(semSubstituta.reason));
  const travou = publishedSwapReadiness({ diagnosis: diagnostico, article: artigoPublicado(), currentPost: "locked" });
  assert.ok(!travou.ready && /Travado ao slug/.test(travou.reason));
  const naoDeclarado = publishedSwapReadiness({ diagnosis: diagnostico, article: artigoPublicado(), currentPost: "unknown" });
  assert.ok(!naoDeclarado.ready && /Revisão Humana do Minerador/.test(naoDeclarado.reason));

  const cartao = serpSubjectCardView(diagnostico, { post: "free", swapReadiness: semArtigo });
  const aplicar = cartao.actions.find(action => action.kind === "apply_swap");
  assert.ok(aplicar && aplicar.kind === "apply_swap" && aplicar.disabledReason === (semArtigo.ready ? null : semArtigo.reason));

  const antigaEAssunto = artigoPublicado({ subject: { keywordId: "kw-01", phrase: "como atrair pacientes para clínica", note: null, destinationUrl: null, attachedBy: ATOR, attachedAt: "2026-09-24T10:00:00+00:00", approvedPackageRef: { version: 1, contentHash: "pkg", approvedAt: "2026-09-24T09:00:00+00:00" } } } as Partial<ArticleDNA>);
  const decidida = decidePublishedPrimarySwap({ proposal: diagnostico.swap!, currentPost: "free", accepted: true, actorUserId: ATOR, decidedAt: "2026-09-26T21:00:00Z", article: { principalKeywordId: "kw-01", keywordIds: ["kw-01", "kw-09", "kw-10", "kw-11"], identity: { url: null, canonical: null, slug: null } } });
  assert.ok(decidida.ok);
  if (decidida.ok) {
    assert.throws(() => buildPublishedSwapArticlePayload({ current: antigaEAssunto, outcome: decidida, actorId: ATOR, decidedAt: "2026-09-26T21:00:00Z", substituteLabel: "como atrair pacientes", previousLabel: "como atrair pacientes para clínica" }), /Assunto declarado não pode ser secundária/);
  }
});

test("ação em grupo: trocas e reforços escolhíveis, o indisponível diz por quê, e o desfecho só conta a releitura", () => {
  const { diagnosticos } = loteReal();
  const cartoes = new Map<string, SerpSubjectCardView>(diagnosticos.map(item => {
    const cartao = serpSubjectCardView(item, { post: item.anchorKeywordId === "kw-01" ? "free" : "locked", swapReadiness: { ready: false, reason: "conclua a formação" } });
    return [cartao.key, cartao];
  }));
  const escolhas = serpSubjectBatchChoices({ diagnoses: diagnosticos, cards: cartoes });
  const troca = escolhas.find(item => item.kind === "swap")!;
  assert.equal(troca.anchorKeywordId, "kw-01");
  assert.equal(troca.disabledReason, "conclua a formação");
  assert.match(troca.label, /Trocar a principal de "como atrair pacientes para clínica" por "como atrair pacientes" \(URL e slug continuam\)/);
  assert.equal(troca.probable, undefined, "a Forte entra em 'Marcar todas'");
  // A mesma troca como Provável: o nível aparece no rótulo e ela sai de "Marcar todas".
  const provaveis = diagnosticos.map(item => item.swap?.substitute ? { ...item, swap: { ...item.swap, substitute: { ...item.swap.substitute, level: "probable" as const } } } : item);
  const trocaProvavel = serpSubjectBatchChoices({ diagnoses: provaveis, cards: cartoes }).find(item => item.kind === "swap")!;
  assert.match(trocaProvavel.label, /por "como atrair pacientes" · Provável, confira a evidência \(URL e slug continuam\)/);
  assert.equal(trocaProvavel.probable, true);
  const cartaoProvavel = serpSubjectCardView(provaveis.find(item => item.anchorKeywordId === "kw-01")!, { post: "free", swapReadiness: { ready: true } });
  assert.match(cartaoProvavel.headline, /^Troca da principal sugerida \(Provável\): "como atrair pacientes"/, "o nível aparece no título do cartão");
  const trazer = escolhas.find(item => item.kind === "cross_silo")!;
  assert.equal(trazer.crossSilo?.keywordId, "kw-19");
  assert.equal(trazer.disabledReason, null);
  assert.equal(new Set(escolhas.map(item => item.id)).size, escolhas.length, "cada keyword aparece uma vez");

  const tudoCerto = describeSerpSubjectBatchOutcome({ swapsConfirmed: 1, swapsRefused: [], movedConfirmed: 2, movedUnchanged: 1, movedRefused: 0 });
  assert.equal(tudoCerto.tone, "success");
  assert.match(tudoCerto.message, /1 troca confirmada na releitura .*2 keywords trazidas de outro Silo, 1 já estavam no destino\. URL, slug e canonical dos publicados não mudaram\./);
  const parcial = describeSerpSubjectBatchOutcome({ swapsConfirmed: 0, swapsRefused: [{ label: "\"a\"", reason: "a releitura não confirmou a nova versão" }], movedConfirmed: 1, movedUnchanged: 0, movedRefused: 0 });
  assert.equal(parcial.tone, "warning");
  assert.match(parcial.message, /Não aplicado: "a": a releitura não confirmou a nova versão/);
  assert.equal(describeSerpSubjectBatchOutcome({ swapsConfirmed: 0, swapsRefused: [{ label: "x", reason: "y" }], movedConfirmed: 0, movedUnchanged: 0, movedRefused: 0 }).tone, "error");
});

/* ============================ 4. Buscar reforço ============================ */

test("a busca que já rodou: Assunto pelo id, publicado pela frase e pela URL; demanda = Google Ads ou estimativa maior que zero (D2.3)", () => {
  const registros = [
    { savedAt: "2026-09-20T10:00:00Z", config: { phrase: "Promoções para Estética", destinationUrl: "https://www.adalbapro.com.br/promocoes-para-estetica/", subjectKeywordId: null }, result: { candidates: [{ googleAds: { averageMonthlySearches: 0 } }, { googleAds: null }] } },
    { savedAt: "2026-09-25T10:00:00Z", config: { phrase: "promocoes para estetica", destinationUrl: "https://adalbapro.com.br/promocoes-para-estetica", subjectKeywordId: null }, result: { candidates: [{ googleAds: { averageMonthlySearches: 30 } }, { googleAds: { averageMonthlySearches: null } }, { googleAds: { averageMonthlySearches: 0 } }] } },
    { savedAt: "2026-09-26T10:00:00Z", config: { phrase: "outra coisa", destinationUrl: "", subjectKeywordId: "assunto-1" }, result: { candidates: [] } },
    { savedAt: "2026-09-26T11:00:00Z", config: { phrase: "promoções para estética", destinationUrl: "https://outro.com.br/x", subjectKeywordId: null }, result: { candidates: [{ googleAds: { averageMonthlySearches: 900 } }] } },
    // Sem média do Google Ads, mas com estimativa: tem demanda (mesma regra do Minerador).
    { savedAt: "2026-09-26T12:00:00Z", config: { phrase: "", destinationUrl: "", subjectKeywordId: "assunto-2" }, result: { candidates: [{ googleAds: null, dataForSeoEstimate: { searchVolume: 90 } }, { googleAds: { averageMonthlySearches: null }, dataForSeoEstimate: { searchVolume: 0 } }, { googleAds: null, dataForSeoEstimate: null }] } },
  ];
  const buscas = reinforcementSearchOutcomes({ records: registros, anchors: [
    { kind: "published", anchorKeywordId: "kw-07", phrase: "promoções para estética", destinationUrl: "https://adalbapro.com.br/promocoes-para-estetica" },
    { kind: "subject", anchorKeywordId: "assunto-1", phrase: "", destinationUrl: null },
    { kind: "subject", anchorKeywordId: "assunto-2", phrase: "", destinationUrl: null },
    { kind: "published", anchorKeywordId: "kw-08", phrase: "leads sem tráfego pago", destinationUrl: null },
  ] });
  assert.deepEqual(buscas.get("kw-07"), { searchedAt: "2026-09-25T10:00:00.000Z", candidateCount: 3, candidatesWithDemand: 1 }, "a mais recente da mesma página; outra URL não conta");
  assert.deepEqual(buscas.get("assunto-1"), { searchedAt: "2026-09-26T10:00:00.000Z", candidateCount: 0, candidatesWithDemand: 0 });
  assert.equal(buscas.has("kw-08"), false, "publicado sem URL não casa com nada");
  assert.deepEqual(buscas.get("assunto-2"), { searchedAt: "2026-09-26T12:00:00.000Z", candidateCount: 3, candidatesWithDemand: 1 }, "só estimativa 90 conta; estimativa 0 e vazia, não");
});

test("o link do Arquiteto abre a Pesquisa por Assunto com o tema e a URL do artigo, sem mudar o link de Assunto", () => {
  const id = "44444444-4444-4444-8444-444444444444";
  assert.deepEqual(parseReinforcementSearchLink(`?modo=assunto&reforco=${id}`), { reinforcementKeywordId: id });
  assert.deepEqual(parseReinforcementSearchLink(`?reforco=${id}`), { reinforcementKeywordId: null }, "sem o modo, não abre");
  assert.deepEqual(parseReinforcementSearchLink("?modo=assunto&reforco=promo%C3%A7%C3%B5es"), { reinforcementKeywordId: null }, "a frase nunca viaja na URL");
  assert.deepEqual(parseSubjectSearchLink(`?modo=assunto&reforco=${id}`), { subjectMode: true, subjectKeywordId: null }, "o link de Assunto continua o de antes");

  const publicada = {
    id, keyword: "promoções  para estética", status: "published",
    site_origin: { publicationStatus: "published", url: "https://adalbapro.com.br/promocoes-para-estetica", canonicalUrl: "https://adalbapro.com.br/promocoes-para-estetica", verification: { status: "verified" }, humanConfirmation: { confirmedBy: ATOR, confirmedAt: "2026-09-20T10:00:00Z" } },
  };
  const campos = reinforcementSearchFields(publicada);
  assert.ok(campos, "publicada com URL no Vínculo abre com o destino");
  if (campos) {
    assert.equal(campos.phrase, "promoções para estética");
    assert.equal(campos.destinationUrl, "https://adalbapro.com.br/promocoes-para-estetica");
    assert.match(campos.note, /Reforço do artigo publicado.*URL e slug do artigo não mudam/);
  }
  assert.equal(reinforcementSearchFields({ id, keyword: "sem publicação", status: "aprovado" }), null, "sem publicação declarada, nenhum destino inventado");
  assert.equal(reinforcementSearchFields({ id: "nao-e-uuid", keyword: "x" }), null);
});

/* ============================ 5. estrutura e fiação ============================ */

const semComentarios = (fonte: string) => fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const workspace = semComentarios(readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8"));
const painel = readFileSync("modules/arquiteto/serp-subject-panels.tsx", "utf8");
const modelo = readFileSync("modules/arquiteto/serp-subject-model.ts", "utf8");
const pagina = semComentarios(readFileSync("modules/minerador/discovery/discovery-keywords-page.tsx", "utf8"));
const ganchoReforco = semComentarios(readFileSync("modules/minerador/discovery/use-reinforcement-link.ts", "utf8"));

test("a mesa lê a SERP só do cache, uma rota, e entrega o índice à formação, às propostas e à sustentação", () => {
  assert.equal((workspace.match(/"\/api\/arquiteto\/serp-subject"/g) || []).length, 1);
  assert.match(workspace, /planSiloArticleFormation\(\{[\s\S]{0,2400}serpSubject: serpSubjectIndex,[\s\S]{0,120}\}\);/);
  assert.match(workspace, /proposeCrossSiloReinforcements\(\{[\s\S]{0,400}serpSubject: serpSubjectIndex,/);
  assert.equal((workspace.match(/suggestSubjectSupport\(\{[^}]*serpSubject: serpSubjectIndex/g) || []).length, 3);
  assert.match(workspace, /workspaceMode !== "articles" \|\| !serpSubjectKey/, "só lê com a aba Artigos aberta");
  assert.match(workspace, /principalKeywordId: reconciliationPrincipalKeywordId\(version\.payload, publishedKeywordIdSet\)/);
  assert.doesNotMatch(workspace, /serp-subject"[\s\S]{0,300}mode: "execute"/, "a leitura nunca executa coleta paga");
});

test("aplicar a troca passa pela porta de versão, com ator autenticado e releitura; Manter não grava versão", () => {
  const aplicar = workspace.slice(workspace.indexOf("const applyPublishedSwaps = async"), workspace.indexOf("const applyOnePublishedSwap = async"));
  assert.match(aplicar, /authenticatedArchitectActor\(/);
  assert.match(aplicar, /publishedSwapReadiness\(/);
  assert.match(aplicar, /decidePublishedPrimarySwap\(\{[\s\S]*accepted: true/);
  assert.match(aplicar, /buildPublishedSwapArticlePayload\(/);
  assert.match(aplicar, /await persistArticleSubjectVersion\(/);
  assert.match(aplicar, /await loadCanonicalArquitetoWorkspace\(selectedBrandId\)/);
  assert.match(aplicar, /primaryKeywordDecision\?\.status === "confirmed"/);
  const manter = workspace.slice(workspace.indexOf("const keepPublishedPrimary = "), workspace.indexOf("const applySerpSubjectBatch = async"));
  assert.doesNotMatch(manter, /persist|fetch\(|createVersionEnvelope/);
  assert.match(workspace, /window\.localStorage\.setItem\(`\$\{KEPT_SWAPS_STORAGE_PREFIX\}\$\{selectedBrandId\}`/);
  assert.doesNotMatch(workspace, /localStorage\.(removeItem|clear)\(`?\$?\{?KEPT/);
});

test("a lista local da Pesquisa por Assunto é só lida: nada é apagado a partir do Arquiteto", () => {
  const leitura = workspace.slice(workspace.indexOf("const reinforcementScope = "), workspace.indexOf("const serpSubjectAnalysis = useMemo"));
  assert.match(leitura, /createIndexedDbSubjectSearchStorage\(\)\.list\(reinforcementScope\)/);
  assert.doesNotMatch(leitura, /deleteMany|discardSubjectSearch|loadSubjectSearches|put\(/);
});

test("o painel e o cartão: sem rede, sem cor crua, texto de 14px+, teclado e diálogo com confirmação", () => {
  for (const fonte of [painel, modelo]) assert.doesNotMatch(semComentarios(fonte),/\bfetch\(|\/api\/|supabase|dataforseo/i);
  for (const caminho of ["modules/arquiteto/serp-subject-panels.tsx", "modules/arquiteto/serp-subject-model.ts", "modules/minerador/discovery/use-reinforcement-link.ts"]) {
    assert.deepEqual(findVisualViolations(readFileSync(caminho, "utf8")), [], caminho);
  }
  assert.doesNotMatch(painel, /\btext-xs\b|text-\[\d+px\]/);
  assert.match(painel, /aria-expanded=\{open\}/);
  assert.match(painel, /aria-pressed=\{filtro === item\.key\}/);
  assert.match(painel, /role="dialog"[\s\S]{0,80}aria-modal="true"/);
  assert.match(painel, /useSubjectDialogFocus\(open, dialogRef, onClose, !busy\)/);
  assert.match(painel, /<label htmlFor=\{id\}/);
  assert.match(painel, /text-keyword/);
  assert.match(painel, /"Ver a evidência"/);
});

test("Buscar reforço no Minerador: só o id na URL, colunas estreitas, na marca da rota; nada é pesquisado sozinho", () => {
  assert.match(pagina, /parseReinforcementSearchLink\(window\.location\.search\)/);
  assert.match(pagina, /url\.searchParams\.delete\("reforco"\);/);
  assert.match(pagina, /useReinforcementLink\(\{/);
  assert.match(ganchoReforco, /\.select\("id,keyword,status,site_origin:analise_semantica->site_origin,primary_keyword_policy:analise_semantica->primary_keyword_policy"\)\s*\.eq\("brand_id", brandId\)\s*\.eq\("id", keywordId\)\s*\.is\("deleted_at", null\)\s*\.maybeSingle\(\)/);
  assert.doesNotMatch(ganchoReforco, /requestPlan|confirmPlan|fetch\(/, "abrir o link nunca pesquisa nem paga");
});

/* ================== 5. correções do revisor: dilemas, métricas e Posto relido ================== */

test("Par em outro artigo, Livre sem substituta e SERP vencida: cada cartão diz o dilema e oferece o ato", () => {
  const ids = ["kw-03", "kw-05", "kw-10", "kw-11", "kw-12", "kw-13"];
  const keywords = mapaDe(ids, { "kw-03": { isPublished: true }, "kw-05": { isPublished: true } });
  const plan = {
    anchors: [
      { kind: "published" as const, principalKeywordId: "kw-03", keywordIds: ["kw-03", "kw-10", "kw-11", "kw-12", "kw-13"] },
      { kind: "published" as const, principalKeywordId: "kw-05", keywordIds: ["kw-05"] },
    ],
    awaitingSubjectKeywordIds: [], leftoverKeywordIds: [],
  };
  const diagnosticos = diagnoseSerpSubjectAnchors({
    silos: [{ siloRef: "territory:captacao", siloLabel: "Captação", plan, keywordIds: ids }],
    keywords, serp: INDICE,
    published: new Map([["kw-03", publicado("free", "como-atrair-clientes")], ["kw-05", publicado("free", "como-atrair-odonto")]]),
    volumeValidated: new Set(["kw-05", "kw-10", "kw-11", "kw-12", "kw-13"]),
    brandRef: "adalbapro--brand",
  });
  const cinco = serpSubjectCardView(diagnosticos.find(item => item.anchorKeywordId === "kw-05")!, { post: "free", nameOf: nomeDe });
  assert.equal(cinco.state, "pair_in_other_article");
  assert.equal(cinco.stateLabel, "Par em outro artigo");
  assert.equal(cinco.tone, "info");
  assert.equal(cinco.headline, "O Google junta \"como atrair pacientes para o consultório\" a este artigo, mas ela já está em \"como atrair clientes para consultório\". Para onde ela vai é decisão sua.");
  assert.match(cinco.subline!, /4 páginas em comum com este, 5 com aquele/);
  assert.match(cinco.subline!, /os dois publicados disputam o mesmo assunto \(possível canibalização\)/);
  assert.deepEqual(cinco.actions[0], { kind: "open_article", label: "Abrir o artigo \"como atrair clientes para consultório\"", siloRef: "territory:captacao", principalKeywordId: "kw-03" });
  assert.equal(cinco.actions[1].kind, "search_reinforcement");
  const resumo = summarizeSerpSubjectCards([cinco]);
  assert.equal(resumo.pairsInOtherArticles, 1);
  assert.match(resumo.headline, /1 par em outro artigo/);

  // Livre sem substituta: no título, com a ação.
  const pegada = (keywordId: string, urls: string[]): KeywordSerpFootprint => ({ keywordId, keyword: keywordId, lenses: [{ lens: "mobile-android", urls, domains: null, collectedAt: null }] });
  const indice = buildSerpSubjectIndex([pegada("pub", ["https://a.com/1", "https://b.com/2", "https://c.com/3"]), pegada("par", ["https://a.com/1", "https://b.com/2", "https://c.com/3"])]);
  const base = { intent: "Informativo", kgr: null, entity: null, problem: null };
  const [livre] = diagnoseSerpSubjectAnchors({
    silos: [{ siloRef: "territory:c", siloLabel: "Captação", plan: { anchors: [{ kind: "published", principalKeywordId: "pub", keywordIds: ["pub", "par"] }], awaitingSubjectKeywordIds: [], leftoverKeywordIds: [] } }],
    keywords: new Map([["pub", { ...base, keywordId: "pub", keyword: "captação de pacientes", volume: 90, isPublished: true }], ["par", { ...base, keywordId: "par", keyword: "como captar pacientes", volume: 30, isPublished: false }]]),
    serp: indice, published: new Map([["pub", publicado("free", "captacao")]]), volumeValidated: new Set(["par"]), brandRef: "adalbapro--brand",
  });
  const cartaoLivre = serpSubjectCardView(livre, { post: "free", reinforcementHref: "/adalbapro--brand/minerador/descobrir?modo=assunto&reforco=pub" });
  assert.equal(cartaoLivre.state, "reinforced");
  assert.equal(cartaoLivre.headline, "Reforçado com 1 keyword que divide a SERP. Cabem mais 4. Posto Livre, mas nenhuma keyword do lote serve de substituta: busque uma com volume que divida a SERP.");
  assert.ok(cartaoLivre.actions.some(action => action.kind === "search_reinforcement"));
  const cartaoTravado = serpSubjectCardView(livre, { post: "locked" });
  assert.doesNotMatch(cartaoTravado.headline, /Posto Livre/, "o título só fala da troca quando o Posto é Livre");

  // SERP vencida: o cartão diz há quanto tempo e oferece coletar de novo.
  const [vencida] = diagnoseSerpSubjectAnchors({
    silos: [{ siloRef: "territory:b", siloLabel: "Leads", plan: { anchors: [{ kind: "published", principalKeywordId: "kw-08", keywordIds: ["kw-08"] }], awaitingSubjectKeywordIds: [], leftoverKeywordIds: [] } }],
    keywords: mapaDe(["kw-08"]), serp: buildSerpSubjectIndex(pegadas().filter(item => item.keywordId !== "kw-08")),
    published: new Map([["kw-08", publicado("locked", "leads")]]), volumeValidated: new Set(),
    serpGaps: new Map([["kw-08", { kind: "stale", collectedAt: "2026-09-20T12:00:00+00:00", ageDays: 32 }]]),
  });
  const cartaoVencida = serpSubjectCardView(vencida, { post: "locked" });
  assert.equal(cartaoVencida.headline, "A SERP de \"leads sem tráfego pago\" venceu (coletada há 32 dias; validade de 30): sem ela, a mesa não mede o mesmo assunto e a formação volta às palavras.");
  assert.deepEqual(cartaoVencida.actions.map(action => action.label), ["Coletar de novo (pago, com plano)", "Buscar reforço"]);
  assert.equal(chamadasDeRede, 0);
});

test("a troca leva as métricas da nova principal: volume, KGR e estratégia não ficam com os números da antiga", () => {
  const { de } = loteReal();
  const diagnostico = de.get("kw-01")!;
  const contribuicao = (keywordId: string, role: "principal" | "secundaria" | "reforco_narrativo", volume: number | null) => ({
    keywordId, keywordDnaId: `dna-${keywordId}`, role, volume, incrementalVolume: volume,
    contribution: role === "principal" ? "central" as const : "incremental_volume" as const, rationale: "Contribuição.",
  });
  const atual = artigoPublicado({
    primaryKeywordMetrics: { volumeSearch: 0, resultCount: 120, kgrScore: 0.12 },
    volumeStrategy: {
      primaryKeywordVolume: 0, secondaryKeywordVolumeSum: 40, reinforcementKeywordVolumeSum: 10, grossCombinedVolume: 50, adjustedCombinedVolume: 45,
      overlapRisk: "low", volumePurpose: "consolidate_low_volume_queries",
      contributions: [contribuicao("kw-01", "principal", 0), contribuicao("kw-09", "secundaria", 20), contribuicao("kw-10", "secundaria", 20), contribuicao("kw-11", "reforco_narrativo", 10)],
      calculationVersion: "v1",
    },
    keywordStrategy: {
      principalKeywordDnaId: "dna-kw-01", secondaryKeywordDnaIds: ["dna-kw-09", "dna-kw-10"], dominantIntent: "informational",
      principalVolume: 0, secondaryVolume: 40, combinedVolume: 50, volumeCoverage: "complete", principalKgrStatus: "qualified",
      score: 0.7, slugCoherence: "protected_published", groupingRationale: "Grupo real.",
      semanticNarrative: ["A principal \"como atrair pacientes para clínica\" define a intenção.", "\"como atrair pacientes\" reforça."],
      publicationProtection: { isPublished: true, protectedFields: ["slug", "canonical", "url", "brand", "principal"] },
    },
    kgrIdentity: {
      isKgrArticle: true, source: "minerador", bindingStatus: "confirmed", status: "confirmed", primaryKeywordId: "kw-01",
      principalKeywordDnaId: "dna-kw-01", primaryVolume: 0, kgrValue: 0.12, boundSlug: "como-atrair-pacientes-para-clinica",
      confirmedAt: "2026-09-01T00:00:00.000Z", confirmedBy: ATOR,
    },
  });
  const decidida = decidePublishedPrimarySwap({
    proposal: diagnostico.swap!, currentPost: "free", accepted: true, actorUserId: ATOR, decidedAt: "2026-09-26T21:00:00-03:00",
    article: { principalKeywordId: atual.principalKeywordId, keywordIds: atual.keywordReferences.map(item => item.keywordId), identity: { url: atual.canonical, canonical: atual.canonical, slug: atual.suggestedSlug } },
  });
  assert.ok(decidida.ok);
  if (!decidida.ok) return;
  const nova = buildPublishedSwapArticlePayload({
    current: atual, outcome: decidida, actorId: ATOR, decidedAt: "2026-09-26T21:00:00-03:00",
    substituteLabel: "como atrair pacientes", previousLabel: "como atrair pacientes para clínica",
    substituteMetrics: { volume: 20, resultCount: 300, kgrScore: 0.3 },
  });
  assert.deepEqual(nova.primaryKeywordMetrics, { volumeSearch: 20, resultCount: 300, kgrScore: 0.3 });
  assert.equal(nova.volumeStrategy?.primaryKeywordVolume, 20);
  assert.equal(nova.volumeStrategy?.secondaryKeywordVolumeSum, 20, "a antiga (0) e kw-10 (20) são as secundárias agora");
  assert.equal(nova.volumeStrategy?.grossCombinedVolume, 50, "o conjunto não mudou: o volume combinado fica");
  assert.equal(nova.volumeStrategy?.contributions.find(item => item.keywordId === "kw-09")?.role, "principal");
  assert.equal(nova.volumeStrategy?.contributions.find(item => item.keywordId === "kw-01")?.role, "secundaria");
  assert.equal(nova.keywordStrategy?.principalKeywordDnaId, "dna-kw-09");
  assert.deepEqual(nova.keywordStrategy?.secondaryKeywordDnaIds, ["dna-kw-01", "dna-kw-10"]);
  assert.equal(nova.keywordStrategy?.principalVolume, 20);
  assert.equal(nova.keywordStrategy?.principalKgrStatus, "not_qualified");
  assert.match(nova.keywordStrategy!.semanticNarrative[0], /^A principal "como atrair pacientes" define a intenção dominante; "como atrair pacientes para clínica", principal publicada anterior, fica como secundária/);
  assert.equal(nova.kgrIdentity?.primaryKeywordId, "kw-09");
  assert.equal(nova.kgrIdentity?.primaryVolume, 20);
  assert.equal(nova.kgrIdentity?.kgrValue, 0.3);
  assert.equal(nova.kgrIdentity?.bindingStatus, "candidate", "o par principal–slug mudou: pede confirmação humana de novo");
  assert.equal(nova.kgrIdentity?.confirmedAt, undefined);
  assert.equal(nova.kgrIdentity?.boundSlug, "como-atrair-pacientes-para-clinica", "o slug publicado continua o mesmo");
  for (const campo of ["suggestedSlug", "canonical", "articleId", "brandId"] as const) assert.deepEqual(nova[campo], atual[campo], campo);

  // Sem métricas conhecidas: null, nunca o número da antiga.
  const semMetricas = buildPublishedSwapArticlePayload({ current: atual, outcome: decidida, actorId: ATOR, decidedAt: "2026-09-26T21:00:00-03:00", substituteLabel: "como atrair pacientes", previousLabel: "como atrair pacientes para clínica" });
  assert.deepEqual(semMetricas.primaryKeywordMetrics, { volumeSearch: null, resultCount: null, kgrScore: null });
  assert.equal(semMetricas.volumeStrategy?.primaryKeywordVolume, 20, "a contribuição da nova já tinha o volume dela");
  assert.equal(semMetricas.keywordStrategy?.principalKgrStatus, "unknown");
  ArticleDNASchema.parse(nova);
  ArticleDNASchema.parse(semMetricas);
});

test("o Posto é relido na hora de gravar: travado ou não declarado depois da leitura da mesa recusa a troca", () => {
  assert.equal(freshPublishedPostOf({ primary_keyword_policy: "reviewable" }), "free");
  assert.equal(freshPublishedPostOf({ primary_keyword_policy: "locked" }), "locked");
  assert.equal(freshPublishedPostOf({ primary_keyword_policy: null }), "unknown", "padrão não é declaração");
  assert.equal(freshPublishedPostOf(null), "unknown");
  assert.equal(freshPostRefusal({ shown: "free", fresh: "free" }), null);
  assert.match(freshPostRefusal({ shown: "free", fresh: "locked" })!, /travado .* depois que a mesa foi lida/);
  assert.match(freshPostRefusal({ shown: "free", fresh: "unknown" })!, /não está mais declarado/);
  assert.match(freshPostRefusal({ shown: "free", fresh: null })!, /não pôde ser relido/);
  assert.match(freshPostRefusal({ shown: "locked", fresh: "free" })!, /mudou depois que a mesa foi lida/);
});

test("a leitura do cache é reaproveitada na sessão por 20 minutos, só com o mesmo conjunto de keywords", () => {
  const data = mergeSerpSubjectReads([{ footprints: pegadas().slice(0, 2), withoutSerp: [], missingLenses: [{ keywordId: "kw-01", lens: "desktop-windows", reason: "validade vencida", collectedAt: "2026-09-01T00:00:00Z" }], egress: { queries: 1, entriesRead: 8, approxBytes: 12000 }, targetingReadFailed: false }]);
  assert.equal(data.missingLenses[0].collectedAt, "2026-09-01T00:00:00Z", "a data da lente vencida chega à tela");
  const bruto = serializeSerpSubjectSession({ signature: "a|b", savedAt: "2026-09-26T20:00:00.000Z", data });
  assert.deepEqual(readSerpSubjectSession(bruto, { signature: "a|b", now: new Date("2026-09-26T20:10:00Z") })?.data.footprints.length, 2);
  assert.equal(readSerpSubjectSession(bruto, { signature: "a|b|c", now: new Date("2026-09-26T20:10:00Z") }), null, "outro conjunto: lê de novo");
  assert.equal(readSerpSubjectSession(bruto, { signature: "a|b", now: new Date("2026-09-26T20:21:00Z") }), null, "passou de 20 minutos: lê de novo");
  assert.equal(readSerpSubjectSession("{quebrado", { signature: "a|b", now: new Date() }), null);
  assert.match(serpSubjectSessionLabel("2026-09-26T20:00:00.000Z", new Date("2026-09-26T20:10:00Z")), /^Leitura do cache reaproveitada desta sessão \(feita há 10 min\): nenhuma consulta nova ao banco e nenhuma chamada paga\./);
});

test("fiação: Posto relido antes de gravar, métricas da nova, abrir artigo sem mover nada, sessão só sem Reler", () => {
  const aplicar = workspace.slice(workspace.indexOf("const applyPublishedSwaps = async"), workspace.indexOf("const applyOnePublishedSwap = async"));
  assert.match(aplicar, /\.select\("id,primary_keyword_policy:analise_semantica->primary_keyword_policy"\)\s*\.eq\("brand_id", selectedBrandId\)\s*\.in\("id",/);
  assert.ok(aplicar.indexOf("freshPostRefusal(") < aplicar.indexOf("decidePublishedPrimarySwap("), "o Posto relido barra antes da decisão");
  assert.match(aplicar, /currentPost: post,/);
  assert.match(aplicar, /substituteMetrics: \{/);
  const abrir = workspace.slice(workspace.indexOf("onOpenArticle: (siloRef: string, principalKeywordId: string) =>"), workspace.indexOf("const serpSubjectCardForCandidate"));
  assert.match(abrir, /setSelectedArticleNodeRef\(candidateRef\)/);
  assert.doesNotMatch(abrir, /moveKeywordToCandidate|applyFormationPlan|setPendingScenarioChange|persist/, "abrir o artigo não move nada");
  assert.match(workspace, /const podeReaproveitar = serpSubjectReload === 0;/);
  assert.match(workspace, /window\.sessionStorage\.setItem\(chaveSessao, serializeSerpSubjectSession\(/);
  assert.doesNotMatch(workspace, /sessionStorage\.(removeItem|clear)\(/);
  assert.match(workspace, /serpGaps: serpSubjectRead\.data && serpSubjectRead\.brandId === selectedBrandId/);
  assert.match(painel, /case "open_article":/);
});

/* ================== 6. D2.3 — sugestões e oportunidades na tela ================== */

function loteComSobras() {
  const keywords = mapaDe(["kw-01", "kw-09", "kw-10", "kw-11", "kw-12", "kw-13", "kw-19", "kw-20"], { "kw-12": { volume: 0 } });
  const silos = [
    { siloRef: "territory:a", siloLabel: "Captação", siloTokens: sem, plan: {
      anchors: [{ kind: "published" as const, principalKeywordId: "kw-01", keywordIds: ["kw-01", "kw-13"] }],
      awaitingSubjectKeywordIds: [], leftoverKeywordIds: ["kw-09", "kw-10", "kw-11", "kw-12", "kw-20"] } },
    { siloRef: "territory:b", siloLabel: "Leads", siloTokens: sem, plan: { anchors: [], awaitingSubjectKeywordIds: [], leftoverKeywordIds: ["kw-19"] } },
  ];
  const [diagnostico] = diagnoseSerpSubjectAnchors({
    silos, keywords, serp: INDICE,
    published: new Map([["kw-01", publicado("locked", "como-atrair-pacientes-para-clinica")]]),
    volumeValidated: new Set(["kw-09", "kw-10", "kw-11", "kw-13", "kw-19", "kw-20"]),
    brandRef: "adalbapro--brand",
  });
  return { diagnostico, keywords, silos };
}

test("D2.3 · o cartão traz as sugestões por volume, Forte marcada até as vagas, e a prévia diz o que muda", () => {
  const { diagnostico } = loteComSobras();
  const cartao = serpSubjectCardView(diagnostico, { post: "locked", nameOf: nomeDe });
  assert.ok(cartao.suggestions.length >= 3);
  assert.ok(!cartao.suggestions.some(item => item.keywordId === "kw-12"), "volume zero não aparece");
  const volumes = cartao.suggestions.map(item => item.volume);
  assert.deepEqual(volumes, [...volumes].sort((left, right) => right - left));
  assert.equal(cartao.suggestionLimit, 4, "dois no artigo: cabem mais quatro");
  assert.equal(cartao.suggestionMode, "add");
  const marcadas = initialSuggestionSelection(cartao);
  assert.ok(marcadas.size > 0 && marcadas.size <= 4);
  assert.ok([...marcadas].every(id => cartao.suggestions.find(item => item.keywordId === id)?.level === "strong"));
  assert.ok(cartao.suggestions.filter(item => item.level === "probable").every(item => !marcadas.has(item.keywordId)));
  const linha = cartao.suggestions[0];
  assert.match(linha.volumeLabel, /^volume \d/);
  assert.ok(["Forte", "Provável"].includes(linha.levelLabel));

  const previa = suggestionApplyPreview(cartao, marcadas);
  assert.equal(previa.blockedReason, null);
  assert.equal(previa.intoArticle.length, marcadas.size);
  const demais = suggestionApplyPreview({ ...cartao, suggestionLimit: 1 }, new Set(cartao.suggestions.slice(0, 3).filter(item => item.where !== "other_silo").map(item => item.keywordId)));
  assert.match(demais.blockedReason!, /^Cabem 1 neste artigo \(teto de 6\): desmarque/);
  assert.match(suggestionApplyPreview({ ...cartao, suggestionLimit: 0 }, new Set([linha.keywordId])).blockedReason!, /teto de 6/);
  assert.equal(suggestionApplyPreview(cartao, new Set()).blockedReason, "Marque ao menos uma sugestão.");
  const outroSilo = cartao.suggestions.find(item => item.where === "other_silo");
  assert.equal(outroSilo?.keywordId, "kw-19", "o par de outro Silo entra na mesma lista");
  assert.equal(suggestionApplyPreview(cartao, new Set([outroSilo!.keywordId])).changeSilo.length, 1, "o par de outro Silo muda de Silo antes");
});

test("D2.3 · desfecho só com a releitura; oportunidades com nome, volume somado e sem volume no fim", () => {
  assert.equal(describeSuggestionOutcome({ anchorLabel: "x", addedConfirmed: 2, created: false, movedToSilo: 0, refused: [] }).tone, "success");
  assert.match(describeSuggestionOutcome({ anchorLabel: "x", addedConfirmed: 2, created: false, movedToSilo: 1, refused: ["a"] }).message, /^2 keywords entraram no artigo "x" · 1 keyword mudou de Silo.*Não aplicado: a\..*URL, slug e canonical não mudam\.$/);
  assert.equal(describeSuggestionOutcome({ anchorLabel: "x", addedConfirmed: 0, created: false, movedToSilo: 0, refused: ["falhou"] }).tone, "error");
  const recusado = describeSuggestionOutcome({ anchorLabel: "x", addedConfirmed: 0, created: false, movedToSilo: 0, refused: ["O artigo já tem 6 keywords (teto)."] });
  assert.match(recusado.message, /^Nada foi aplicado\. Não aplicado: O artigo já tem 6 keywords \(teto\)\. URL, slug e canonical não mudam\.$/, "a recusa do plano aparece com o motivo dela, sem 'Confirmado na releitura'");
  assert.match(describeSuggestionOutcome({ anchorLabel: "A", addedConfirmed: 3, created: true, movedToSilo: 0, refused: ["o vínculo do Assunto não voltou na releitura (o artigo foi criado): prenda o Assunto de novo na Revisão"] }).message, /^3 keywords entraram no artigo novo do Assunto "A"\. Não aplicado: o vínculo do Assunto não voltou na releitura \(o artigo foi criado\)/);

  const { keywords, silos } = loteComSobras();
  const vista = leftoverOpportunitiesView(groupLeftoverOpportunities({
    silos: silos.map(silo => ({ siloRef: silo.siloRef, siloLabel: silo.siloLabel, leftoverKeywordIds: silo.plan.leftoverKeywordIds })),
    keywords, serp: INDICE,
  }));
  assert.ok(vista.groups.length > 0);
  assert.ok(vista.groups.every(group => group.actionLabel === "Criar artigo novo com este grupo" && group.members[0].leader && group.name === group.members[0].keyword));
  assert.ok(vista.groups.every(group => /^volume somado \d/.test(group.totalVolumeLabel)));
  assert.deepEqual(vista.withoutVolume.map(item => item.keywordId), ["kw-12"]);
  assert.match(vista.headline, /1 sem volume, no fim\.$/);
  assert.ok(vista.groups.every(group => group.members.every(member => !/Precisa avaliar/.test(member.reason))));
});

test("D2.3 · painéis: seleção por checkbox com rótulo, diálogo de confirmação, 14px+, tokens e sem rede", () => {
  const oportunidades = readFileSync("modules/arquiteto/leftover-opportunities-panel.tsx", "utf8");
  for (const caminho of ["modules/arquiteto/serp-subject-panels.tsx", "modules/arquiteto/leftover-opportunities-panel.tsx"]) {
    assert.deepEqual(findVisualViolations(readFileSync(caminho, "utf8")), [], caminho);
  }
  for (const fonte of [painel, oportunidades]) {
    assert.doesNotMatch(semComentarios(fonte), /\bfetch\(|\/api\/|supabase|dataforseo/i);
    assert.doesNotMatch(fonte, /\btext-xs\b|text-\[\d+px\]/);
  }
  assert.match(painel, /data-testid="architect-serp-subject-suggestions"/);
  assert.match(painel, /data-testid="architect-serp-subject-suggestions-dialog"/);
  assert.match(painel, /await handlers\.onApplySuggestions\(card\.key, \[\.\.\.selecionadas\]\)/);
  assert.match(painel, /disabled=\{busy \|\| Boolean\(previa\.blockedReason\)\}/, "o teto de 6 barra na confirmação");
  assert.match(oportunidades, /role="dialog"[\s\S]{0,80}aria-modal="true"/);
  assert.match(oportunidades, /<label htmlFor=\{id\}/);
  assert.match(oportunidades, /<details[\s\S]{0,120}architect-leftover-without-volume/, "sem volume, recolhida");
  assert.doesNotMatch(semComentarios(oportunidades), /onCreateArticle\(\{[\s\S]{0,40}\}\)\s*;?\s*\}\s*\}\s*\/>/, "criar só pela confirmação");
});

test("D2.3 · fiação: aplicar e criar passam pelo writer da formação com releitura; outro Silo pela decisão de Silo", () => {
  const aplicar = workspace.slice(workspace.indexOf("const applyAnchorSuggestions = async"), workspace.indexOf("const leftoverOpportunities = useMemo"));
  assert.match(aplicar, /planAddKeywordsToCandidate\(/);
  assert.match(aplicar, /planNewArticleFromKeywords\(/);
  assert.match(aplicar, /planWorkingSubjectAnchorWrites\(/);
  assert.equal((aplicar.match(/await applyFormationPlan\(/g) || []).length, 2);
  assert.match(aplicar, /await applySiloDecisionsInBatch\(/);
  assert.match(aplicar, /publishedKeywordIds: publishedKeywordIdSet/);
  assert.doesNotMatch(aplicar, /supabase\.|fetch\(/, "nenhum gravador novo");
  const criar = workspace.slice(workspace.indexOf("const createArticleFromLeftoverGroup = async"), workspace.indexOf("const serpSubjectHandlers = {"));
  assert.match(criar, /await applyFormationPlan\(planNewArticleFromKeywords\(/);
  assert.match(workspace, /onApplySuggestions: \(cardKey: string, keywordIds: readonly string\[\]\) => applyAnchorSuggestions\(cardKey, keywordIds\)/);
  assert.match(workspace, /<LeftoverOpportunitiesPanel[\s\S]{0,200}onCreateArticle=\{createArticleFromLeftoverGroup\}/);
  // Correções do revisor: conta o confirmado, diz o motivo do plano e confere o vínculo do Assunto.
  assert.doesNotMatch(aplicar, /adicionadas = ids\.length/, "conta o que o plano gravou, não o que foi pedido");
  assert.equal((aplicar.match(/plano\.refusals\.length\) recusas\.push\(\.\.\.plano\.refusals\.map\(refusal => refusal\.detail\)\)/g) || []).length, 2, "a recusa do plano vai com o motivo dela");
  assert.match(aplicar, /if \(!vinculo\.ok\) recusas\.push\(/, "sem vínculo do Assunto, o artigo não nasce");
  assert.match(aplicar, /relidos\.get\(ref\)\?\.subjectKeywordId === diagnosis\.anchorKeywordId/, "o vínculo é conferido na releitura");
  // A lista antiga de não agrupadas: recolhida quando há o painel de Sobras, por volume, sem volume no fim.
  assert.match(workspace, /<details open=\{!leftoverOpportunities\}>[\s\S]{0,900}formationDeferredRowsByVolume\.map/);
  assert.match(workspace, /\(right\.volume \?\? -1\) - \(left\.volume \?\? -1\)/);
  // Troca Provável fica fora de "Marcar todas".
  assert.match(painel, /disponiveis\.filter\(choice => !choice\.probable\)\.map\(choice => choice\.id\)/);
});

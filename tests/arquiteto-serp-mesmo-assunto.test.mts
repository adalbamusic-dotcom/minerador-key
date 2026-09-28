import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { AFFINITY_FLOOR, sameArticleAffinity, type ArticleFormationKeyword } from "../lib/arquiteto/article-formation.ts";
import { planSiloArticleFormation, proposeCrossSiloReinforcements, type SiloFormationPlan } from "../lib/arquiteto/article-formation-priority.ts";
import {
  SERP_SUBJECT_THRESHOLDS,
  buildSerpSubjectIndex,
  measureSerpSubjectOverlap,
  normalizeSerpPageUrl,
  serpSubjectNeighbors,
  type KeywordSerpFootprint,
} from "../lib/arquiteto/serp-subject-overlap.ts";
import { bestAnchorConvergence, measureAnchorConvergence } from "../lib/arquiteto/serp-subject-convergence.ts";
import { decidePublishedPrimarySwap, proposePublishedPrimarySwap, publishedPrimaryPostOf } from "../lib/arquiteto/published-primary-swap.ts";
import {
  NO_DEMAND_MESSAGE,
  NO_SERP_PAIR_IN_BATCH_MESSAGE,
  REINFORCEMENT_SEARCH_ACTION_LABEL,
  SERP_SUBJECT_DILEMMA_LABELS,
  SERP_SUBJECT_DILEMMA_STATES,
  diagnoseSerpSubjectAnchors,
  reinforcementSearchHref,
  serpGapsFromMissingLenses,
  summarizeSerpSubjectDiagnoses,
  type PublishedAnchorInfo,
} from "../lib/arquiteto/serp-subject-diagnosis.ts";
import { PrimaryKeywordCandidateSchema, PrimaryKeywordDecisionSchema } from "../lib/arquiteto/contracts.ts";
import { suggestSubjectSupport } from "../lib/arquiteto/declared-subject.ts";
import { subjectSearchLinkHref } from "../modules/minerador/discovery/subject-search-model.ts";
import { ASSUNTO_ID, MARCA, VOLUME_VALIDADO, declarado, linhaDaMesa, logica } from "./arquiteto-assunto-fixtures.mts";
import {
  CREATE_ARTICLE_FROM_GROUP_ACTION,
  groupLeftoverOpportunities,
  hasSearchVolume,
  serpSuggestionMatch,
  suggestAnchorReinforcements,
} from "../lib/arquiteto/serp-subject-suggestions.ts";
import { SERP_GENERIC_DOMAINS } from "../lib/arquiteto/serp-subject-overlap.ts";
import { planAddKeywordsToCandidate, planNewArticleFromKeywords } from "../lib/arquiteto/article-formation-editing.ts";

/**
 * D2.2 — "MESMO ASSUNTO" PELA SERP, COM A LEITURA REAL DA ADALBAPRO.
 *
 * A fixture é o top 10 orgânico das keywords da medida de 2026-09-26, lido
 * do cache (sem custo). A lente canônica guarda corpo, não digest: entra sem
 * URLs, como na leitura estreita real. Nenhuma rede, nenhum provider.
 */

let chamadasDeRede = 0;
globalThis.fetch = (async () => {
  chamadasDeRede += 1;
  throw new Error("Rede proibida nos testes da medida de mesmo assunto.");
}) as typeof fetch;

type Linha = { keywordId: string; keyword: string; volume: number | null; intent: string | null; published: boolean; lenses: Array<{ lens: string; urls: string[] | null }> };
const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/arquiteto-serp-mesmo-assunto-adalbapro.json", import.meta.url), "utf8")) as { keywords: Linha[] };
const LINHA = new Map(FIXTURE.keywords.map(linha => [linha.keywordId, linha]));

const footprintsReais = (): KeywordSerpFootprint[] => FIXTURE.keywords.map(linha => ({
  keywordId: linha.keywordId,
  keyword: linha.keyword,
  lenses: linha.lenses.map(leitura => ({ lens: leitura.lens, urls: leitura.urls, domains: null, collectedAt: "2026-09-20T12:00:00+00:00" })),
}));
const INDICE = buildSerpSubjectIndex(footprintsReais());

/** A linha da formação, a partir da fixture: só o que a medida real tem. */
const kw = (keywordId: string, overrides: Partial<ArticleFormationKeyword> = {}): ArticleFormationKeyword => {
  const linha = LINHA.get(keywordId)!;
  return {
    keywordId, keyword: linha.keyword, intent: linha.intent, volume: linha.volume, kgr: null,
    entity: null, problem: null, isPublished: linha.published, ...overrides,
  };
};
const comVolume = (ids: string[]) => new Map(ids.map(id => [id, { declared: false, volumeValidated: true }] as const));
const sem = new Set<string>();

/* ============================ 1. a medida e a régua ============================ */

test("a medida reproduz a leitura real: pares que o dono conferiu ficam fortes", () => {
  const pares: Array<[string, string, number]> = [
    ["kw-01", "kw-09", 7], // como atrair pacientes para clínica × como atrair pacientes
    ["kw-01", "kw-10", 7], // × como atrair pacientes para o consultório
    ["kw-01", "kw-11", 7], // × como atrair mais pacientes
    ["kw-01", "kw-12", 6],
    ["kw-02", "kw-15", 3], // marketing digital para dentistas × marketing para dentistas
    ["kw-02", "kw-17", 4], // × marketing digital odontologico
    ["kw-03", "kw-10", 5], // como atrair clientes para consultório × como atrair pacientes para o consultório
    ["kw-04", "kw-19", 3], // captação de pacientes × como captar pacientes
  ];
  for (const [a, b, paginas] of pares) {
    const medida = INDICE.overlap(a, b);
    assert.equal(medida.sharedPageCount, paginas, `${LINHA.get(a)!.keyword} × ${LINHA.get(b)!.keyword}`);
    assert.equal(medida.strength, "strong");
    assert.match(medida.reason, /O Google trata como o mesmo assunto/);
    assert.equal(INDICE.overlap(b, a).sharedPageCount, paginas, "simétrica");
  }
  // Palavras parecidas, outro assunto no Google.
  const estetica = INDICE.overlap("kw-06", "kw-20");
  assert.equal(estetica.sharedPageCount, 1);
  assert.equal(estetica.strength, "weak");
  assert.match(estetica.reason, /não é o mesmo assunto/);
  // Publicado sem nenhum par forte no lote.
  assert.deepEqual(serpSubjectNeighbors(INDICE, "kw-07", FIXTURE.keywords.map(linha => linha.keywordId)), []);
});

test("a canônica sem digest entra como lente faltante, e a tela diz que a SERP está incompleta", () => {
  const medida = INDICE.overlap("kw-02", "kw-15");
  assert.deepEqual(medida.pageLensesLeft, ["desktop-macos", "mobile-android", "mobile-ios"]);
  assert.deepEqual(medida.missingLensesLeft, ["desktop-windows"]);
  assert.equal(medida.complete, false);
  assert.match(medida.reason, /SERP incompleta: falta lente no cache/);
  // Com os domínios da observação, a canônica conta como presente.
  const comDominios = footprintsReais().map(item => ({ ...item, lenses: item.lenses.map(leitura => leitura.lens === "desktop-windows" ? { ...leitura, domains: ["exemplo.com.br"] } : leitura) }));
  const cheia = buildSerpSubjectIndex(comDominios).overlap("kw-02", "kw-15");
  assert.equal(cheia.complete, true);
  assert.equal(cheia.sharedPageCount, 3, "domínio não vira página");
  assert.ok(cheia.sharedDomains.includes("exemplo.com.br"));
});

test("a régua é nomeada: 3+ forte, 2 apoio, 1 ruído, 0 nenhuma; sem páginas é desconhecido, nunca zero", () => {
  assert.deepEqual(SERP_SUBJECT_THRESHOLDS, { strongPages: 3, supportPages: 2 });
  const pegada = (keywordId: string, urls: string[] | null): KeywordSerpFootprint => ({ keywordId, keyword: keywordId, lenses: [{ lens: "mobile-ios", urls, domains: null, collectedAt: null }] });
  const base = pegada("a", ["https://a.com/1", "https://b.com/2", "https://c.com/3", "https://d.com/4"]);
  assert.equal(measureSerpSubjectOverlap(base, pegada("b", ["https://a.com/1", "https://b.com/2", "https://c.com/3"])).strength, "strong");
  assert.equal(measureSerpSubjectOverlap(base, pegada("b", ["https://a.com/1", "https://b.com/2"])).strength, "support");
  assert.equal(measureSerpSubjectOverlap(base, pegada("b", ["https://a.com/1"])).strength, "weak");
  assert.equal(measureSerpSubjectOverlap(base, pegada("b", ["https://z.com/9"])).strength, "none");
  const desconhecida = measureSerpSubjectOverlap(base, pegada("b", null));
  assert.equal(desconhecida.strength, "unknown");
  assert.match(desconhecida.reason, /Sem páginas da SERP no cache para "b"/);
  assert.equal(INDICE.overlap("kw-01", "nao-existe").strength, "unknown");
});

test("a página é a mesma com ou sem www, barra final, query e âncora", () => {
  assert.equal(normalizeSerpPageUrl("https://www.Exemplo.com.br/Blog/Atrair-Pacientes/?utm_source=x#topo"), "exemplo.com.br/blog/atrair-pacientes");
  assert.equal(normalizeSerpPageUrl("http://exemplo.com.br/blog/atrair-pacientes"), "exemplo.com.br/blog/atrair-pacientes");
  assert.equal(normalizeSerpPageUrl("ftp://exemplo.com.br/x"), null);
  assert.equal(normalizeSerpPageUrl("não é url"), null);
});

/* ========================== 2. convergência com a âncora ========================== */

test("convergência: sem índice é a afinidade de antes, byte a byte", () => {
  const anchor = kw("kw-02");
  for (const id of ["kw-15", "kw-16", "kw-17", "kw-20"]) {
    const antes = sameArticleAffinity(anchor, kw(id), sem);
    const agora = measureAnchorConvergence(anchor, kw(id), { siloTokens: sem });
    assert.equal(agora.score, antes.affinity);
    assert.equal(agora.eligible, antes.affinity >= AFFINITY_FLOOR);
    assert.deepEqual(agora.reasons, antes.reasons);
  }
});

test("convergência: SERP forte entra com poucas palavras; SERP fraca barra palavras parecidas", () => {
  // "marketing digital odontologico" tem 0,4 de palavras (abaixo do piso) e 4 páginas em comum.
  const odonto = measureAnchorConvergence(kw("kw-02"), kw("kw-17"), { siloTokens: sem, serp: INDICE });
  assert.ok(sameArticleAffinity(kw("kw-02"), kw("kw-17"), sem).affinity < AFFINITY_FLOOR);
  assert.equal(odonto.eligible, true);
  assert.equal(odonto.basis, "serp");
  assert.match(odonto.reasons[0], /4 páginas em comum/);
  // "marketing para clinica" tem as palavras de "marketing para clínica de estética", mas 1 página só.
  const estetica = measureAnchorConvergence(kw("kw-06"), kw("kw-20"), { siloTokens: sem, serp: INDICE });
  assert.ok(sameArticleAffinity(kw("kw-06"), kw("kw-20"), sem).affinity >= AFFINITY_FLOOR, "pelas palavras, entraria");
  assert.equal(estetica.eligible, false);
  assert.equal(estetica.basis, "serp_refuses");
});

test("convergência (D2.3): a intenção da Lógica diferente vira aviso com 7 páginas; a da SERP continua barrando", () => {
  // Comercial × Informativa só na Lógica: o Google junta as duas (7 páginas) — entra, com aviso.
  const medida = measureAnchorConvergence(kw("kw-01"), kw("kw-09"), { siloTokens: sem, serp: INDICE });
  assert.equal(medida.eligible, true);
  assert.equal(medida.basis, "serp");
  assert.match(medida.reasons[0], /7 páginas em comum/);
  assert.match(medida.warnings!.join(" "), /^Aviso: intenção da Lógica diferente \(Comercial × Informativo\); quem barra é a intenção da SERP/);
  // D2.3.1 — a intenção OBSERVADA diferente com 7 páginas em comum vira aviso: as páginas vencem o rótulo.
  const observada = measureAnchorConvergence(kw("kw-01", { observedIntent: "Comercial" }), kw("kw-09", { observedIntent: "Informativa" }), { siloTokens: sem, serp: INDICE });
  assert.equal(observada.eligible, true);
  assert.equal(observada.basis, "serp");
  assert.match(observada.warnings!.join(" "), /Aviso: o Google mostrou, de forma conclusiva, intenções diferentes para as duas buscas, mas 7 páginas do top 10 coincidem/);
  // Com só 2 páginas em comum, a intenção observada diferente continua barrando.
  const vizinha = measureAnchorConvergence(kw("kw-01", { observedIntent: "Comercial" }), kw("kw-19", { observedIntent: "Informativa" }), { siloTokens: sem, serp: INDICE });
  assert.equal(INDICE.overlap("kw-01", "kw-19").sharedPageCount, 2);
  assert.equal(vizinha.eligible, false);
  assert.equal(vizinha.basis, "dna_contradiction");
  assert.match(vizinha.reasons[0], /Mas o DNA separa as duas: o Google mostrou, de forma conclusiva, intenções diferentes/);
  // Sem índice de SERP, a regra de antes: a Lógica barra.
  const semIndice = measureAnchorConvergence(kw("kw-01"), kw("kw-09"), { siloTokens: sem });
  assert.equal(semIndice.eligible, false);
  assert.deepEqual(semIndice.reasons, ["O DNA separa as duas: intenções principais diferentes."]);
});

test("convergência: sem SERP no cache volta às palavras, dizendo isso, e fica atrás de quem tem SERP", () => {
  const semSerp = buildSerpSubjectIndex(footprintsReais().filter(item => item.keywordId !== "kw-16"));
  const medida = measureAnchorConvergence(kw("kw-02"), kw("kw-16"), { siloTokens: sem, serp: semSerp });
  assert.equal(medida.basis, "words_without_serp");
  assert.equal(medida.eligible, true, "mesma intenção e as palavras convergem");
  assert.match(medida.reasons[0], /Sem páginas da SERP no cache.*só por palavras/);
  const forte = measureAnchorConvergence(kw("kw-02"), kw("kw-15"), { siloTokens: sem, serp: semSerp });
  assert.ok(forte.score > medida.score);
});

test("convergência com o Assunto: mede contra a principal E a frase declarada", () => {
  const melhor = bestAnchorConvergence([kw("kw-20"), kw("kw-02")], kw("kw-17"), { siloTokens: sem, serp: INDICE });
  assert.equal(melhor.eligible, true);
  assert.equal(melhor.measuredAgainstKeywordId, "kw-02");
});

/* ============================== 3. formação ============================== */

const planoDentistas = (serp: typeof INDICE | null) => planSiloArticleFormation({
  siloRef: "territory:odonto", siloLabel: "Marketing odontológico", siloSlug: "/marketing-odontologico", siloTokens: sem,
  keywords: [kw("kw-02"), kw("kw-15"), kw("kw-16"), kw("kw-17"), kw("kw-18")],
  subjects: comVolume(["kw-15", "kw-16", "kw-17", "kw-18"]),
  batchObjective: "improve",
  ...(serp ? { serpSubject: serp } : {}),
});

test("formação: o publicado recebe as keywords que dividem a SERP, mesmo sem palavras em comum", () => {
  const antes = planoDentistas(null);
  const publicadoAntes = antes.anchors.find(ancora => ancora.kind === "published")!;
  assert.deepEqual(new Set(publicadoAntes.keywordIds), new Set(["kw-02", "kw-15", "kw-16"]), "pelas palavras, só as duas parecidas");
  assert.deepEqual(new Set(antes.leftoverKeywordIds), new Set(["kw-17", "kw-18"]));

  const agora = planoDentistas(INDICE);
  const publicado = agora.anchors.find(ancora => ancora.kind === "published")!;
  assert.deepEqual(new Set(publicado.keywordIds), new Set(["kw-02", "kw-15", "kw-16", "kw-17", "kw-18"]));
  assert.deepEqual(agora.leftoverKeywordIds, []);
  assert.match(agora.nucleusByKeywordId.get("kw-17")!.reasons.join(" "), /4 páginas em comum no top 10/);
});

test("formação: a SERP barra a keyword parecida de outro assunto; ela fica fora com motivo, sem sumir", () => {
  const plano = (serp: typeof INDICE | null) => planSiloArticleFormation({
    siloRef: "territory:estetica", siloLabel: "Clínica de estética", siloSlug: "/estetica", siloTokens: sem,
    keywords: [kw("kw-06"), kw("kw-20")],
    subjects: comVolume(["kw-20"]),
    batchObjective: "improve",
    ...(serp ? { serpSubject: serp } : {}),
  });
  assert.ok(plano(null).anchors[0].keywordIds.includes("kw-20"), "pelas palavras, colava");
  const agora = plano(INDICE);
  assert.deepEqual(agora.anchors[0].keywordIds, ["kw-06"]);
  assert.deepEqual(agora.leftoverKeywordIds, ["kw-20"]);
  const universo = agora.universe;
  assert.ok(universo.ungroupedKeywordIds.includes("kw-20"), "D8: nenhuma keyword some");
});

test("formação: teto de seis com SERP — as de mais páginas em comum entram primeiro", () => {
  const plano = planSiloArticleFormation({
    siloRef: "territory:captacao", siloLabel: "Captação", siloSlug: "/captacao", siloTokens: sem,
    keywords: ["kw-01", "kw-09", "kw-10", "kw-11", "kw-12", "kw-13", "kw-14"].map(id => kw(id, { intent: "Informativo" })),
    subjects: comVolume(["kw-09", "kw-10", "kw-11", "kw-12", "kw-13", "kw-14"]),
    batchObjective: "improve",
    serpSubject: INDICE,
  });
  const publicado = plano.anchors.find(ancora => ancora.kind === "published")!;
  assert.equal(publicado.keywordIds.length, 6);
  for (const id of ["kw-09", "kw-10", "kw-11", "kw-12"]) assert.ok(publicado.keywordIds.includes(id), `${id} (6-7 páginas) entra`);
  assert.equal(plano.leftoverKeywordIds.length, 1, "a sétima fica visível, fora do teto");
});

/* ======================= 4. propostas entre Silos (D8) ======================= */

type PlanoMinimo = Pick<SiloFormationPlan, "anchors" | "awaitingSubjectKeywordIds" | "leftoverKeywordIds">;
const silosCaptacao = (): Array<{ siloRef: string; siloLabel: string; siloTokens: Set<string>; plan: PlanoMinimo }> => [
  { siloRef: "territory:a", siloLabel: "Captação de pacientes", siloTokens: sem, plan: { anchors: [{ kind: "published", principalKeywordId: "kw-04", keywordIds: ["kw-04"] }], awaitingSubjectKeywordIds: [], leftoverKeywordIds: [] } },
  { siloRef: "territory:b", siloLabel: "Leads sem tráfego pago", siloTokens: sem, plan: { anchors: [], awaitingSubjectKeywordIds: [], leftoverKeywordIds: ["kw-19"] } },
];
const mapaDe = (ids: string[], overrides: Record<string, Partial<ArticleFormationKeyword>> = {}) => new Map(ids.map(id => [id, kw(id, overrides[id])] as const));

test("entre Silos: o par real noutro Silo vira proposta pela SERP; pelas palavras, nem era visto", () => {
  const keywords = mapaDe(["kw-04", "kw-19"]);
  assert.deepEqual(proposeCrossSiloReinforcements({ silos: silosCaptacao(), keywords }), [], "0,3 de palavras: sem proposta");
  const propostas = proposeCrossSiloReinforcements({ silos: silosCaptacao(), keywords, serpSubject: INDICE });
  assert.equal(propostas.length, 1);
  assert.equal(propostas[0].keywordId, "kw-19");
  assert.equal(propostas[0].anchorKeywordId, "kw-04");
  assert.equal(propostas[0].basis, "serp");
  assert.equal(propostas[0].sharedPageCount, 3);
  assert.match(propostas[0].reason, /3 páginas em comum no top 10 do Google/);
});

/* ======================= 5. troca da principal publicada ======================= */

const identidade = { url: "https://adalbapro.com.br/captacao/como-atrair-pacientes-para-clinica", canonical: "https://adalbapro.com.br/captacao/como-atrair-pacientes-para-clinica", slug: "como-atrair-pacientes-para-clinica" };
const candidatasAtrair = () => ["kw-09", "kw-10", "kw-11", "kw-12", "kw-13"].map(id => ({ ...kw(id), volumeValidated: true }));

test("D2.1 Livre: propõe a de maior volume que divide a SERP; URL, slug e canonical intocados", () => {
  assert.equal(publishedPrimaryPostOf("reviewable"), "free");
  assert.equal(publishedPrimaryPostOf("locked"), "locked");
  assert.equal(publishedPrimaryPostOf(null), "unknown");
  const proposta = proposePublishedPrimarySwap({
    published: kw("kw-01", { intent: "Informativo" }), post: "free", identity: identidade,
    candidates: candidatasAtrair(), serp: INDICE,
  });
  assert.equal(proposta.state, "proposed");
  assert.equal(proposta.substitute?.keywordId, "kw-09", "volume 20 e 7 páginas; empate com kw-10 pela ordem estável");
  assert.equal(proposta.substitute?.sharedPageCount, 7);
  assert.deepEqual(proposta.alternatives.map(item => item.keywordId), ["kw-10", "kw-11", "kw-12", "kw-13"]);
  assert.deepEqual(proposta.protectedIdentity, identidade);
  assert.equal(proposta.previousPrimaryBecomes, "secundaria");
  assert.equal(proposta.decision?.status, "pending");
  assert.equal(proposta.requiresHumanDecision, true);
  for (const candidata of proposta.candidates) PrimaryKeywordCandidateSchema.parse(candidata);
  PrimaryKeywordDecisionSchema.parse(proposta.decision);
  assert.match(proposta.note, /a principal atual não tem volume.*URL, slug e canonical não mudam.*secundária/);
});

test("D2.1 Travado ao slug: nunca propõe troca, só reforço; Posto não declarado: nada sem declaração", () => {
  const travado = proposePublishedPrimarySwap({ published: kw("kw-01", { intent: "Informativo" }), post: "locked", identity: identidade, candidates: candidatasAtrair(), serp: INDICE });
  assert.equal(travado.state, "locked");
  assert.equal(travado.substitute, null);
  assert.equal(travado.decision, null);
  assert.match(travado.note, /Travado ao slug.*só recebe reforço/);
  const semPosto = proposePublishedPrimarySwap({ published: kw("kw-01", { intent: "Informativo" }), post: "unknown", identity: identidade, candidates: candidatasAtrair(), serp: INDICE });
  assert.equal(semPosto.state, "unknown_post");
  assert.match(semPosto.note, /Revisão Humana do Minerador/);
});

test("D2.1: cada recusa diz o que faltou — volume menor, intenção, SERP, publicada", () => {
  const proposta = proposePublishedPrimarySwap({
    published: kw("kw-04"), post: "free", identity: identidade, serp: INDICE,
    candidates: [
      { ...kw("kw-19"), volumeValidated: true }, // 30 < 90
      { ...kw("kw-15"), volumeValidated: true }, // 210, mas 1 página
      { ...kw("kw-01"), volumeValidated: false },
      { ...kw("kw-20"), volumeValidated: false },
    ],
  });
  assert.equal(proposta.state, "no_candidate");
  const motivo = new Map(proposta.rejected.map(item => [item.keywordId, item.missing]));
  assert.equal(motivo.get("kw-19"), "volume_not_higher");
  assert.equal(motivo.get("kw-15"), "serp");
  assert.equal(motivo.get("kw-01"), "published");
  assert.equal(motivo.get("kw-20"), "volume");
  assert.match(proposta.note, /Buscar reforço/);
  const intencao = proposePublishedPrimarySwap({ published: kw("kw-01"), post: "free", identity: identidade, candidates: candidatasAtrair(), serp: INDICE });
  assert.ok(intencao.rejected.every(item => item.missing === "intent"), "Comercial × Informativa: a troca exige a mesma intenção");
});

test("D2.1 decisão humana: aceita troca a principal, a antiga vira secundária, identidade igual", () => {
  const proposta = proposePublishedPrimarySwap({ published: kw("kw-01", { intent: "Informativo" }), post: "free", identity: identidade, candidates: candidatasAtrair(), serp: INDICE });
  const artigo = { principalKeywordId: "kw-01", keywordIds: ["kw-01", "kw-09", "kw-10"], identity: identidade };
  const aceita = decidePublishedPrimarySwap({ proposal: proposta, article: artigo, currentPost: "free", accepted: true, actorUserId: "11111111-1111-4111-8111-111111111111", decidedAt: "2026-09-26T21:00:00-03:00" });
  assert.ok(aceita.ok);
  if (!aceita.ok) return;
  assert.equal(aceita.principalKeywordId, "kw-09");
  assert.deepEqual(aceita.keywordIds, ["kw-09", "kw-01", "kw-10"]);
  assert.deepEqual(aceita.roleChanges, [{ keywordId: "kw-09", role: "principal" }, { keywordId: "kw-01", role: "secundaria" }]);
  assert.deepEqual(aceita.identity, identidade);
  assert.equal(aceita.requiresNewVersion, true);
  const decisao = PrimaryKeywordDecisionSchema.parse(aceita.articleDnaFields.primaryKeywordDecision);
  assert.equal(decisao.status, "confirmed");
  assert.equal(decisao.decidedAt, "2026-09-27T00:00:00.000Z");
  assert.equal(aceita.articleDnaFields.primaryKeywordCandidates.find(item => item.keywordId === "kw-09")?.status, "confirmed");

  const recusada = decidePublishedPrimarySwap({ proposal: proposta, article: artigo, currentPost: "free", accepted: false, actorUserId: "u", decidedAt: "2026-09-26T21:00:00Z" });
  assert.ok(recusada.ok && !recusada.requiresNewVersion && recusada.principalKeywordId === "kw-01");

  const travouDepois = decidePublishedPrimarySwap({ proposal: proposta, article: artigo, currentPost: "locked", accepted: true, actorUserId: "u", decidedAt: "2026-09-26T21:00:00Z" });
  assert.ok(!travouDepois.ok && /Travado ao slug/.test(travouDepois.reason));
  const velha = decidePublishedPrimarySwap({ proposal: proposta, article: { ...artigo, principalKeywordId: "kw-10" }, currentPost: "free", accepted: true, actorUserId: "u", decidedAt: "2026-09-26T21:00:00Z" });
  assert.ok(!velha.ok && /mudou depois da proposta/.test(velha.reason));
  const cheio = decidePublishedPrimarySwap({ proposal: proposta, article: { ...artigo, keywordIds: ["kw-01", "a", "b", "c", "d", "e"] }, currentPost: "free", accepted: true, actorUserId: "u", decidedAt: "2026-09-26T21:00:00Z" });
  assert.ok(!cheio.ok && /teto de 6/.test(cheio.reason));
  const semAtor = decidePublishedPrimarySwap({ proposal: proposta, article: artigo, currentPost: "free", accepted: true, actorUserId: " ", decidedAt: "2026-09-26T21:00:00Z" });
  assert.ok(!semAtor.ok);
});

/* ============================== 6. diagnóstico ============================== */

const publicado = (post: PublishedAnchorInfo["post"], slug: string): PublishedAnchorInfo => ({ post, url: `https://adalbapro.com.br/${slug}`, canonical: `https://adalbapro.com.br/${slug}`, slug });

test("diagnóstico: cada dilema tem um estado claro e uma ação", () => {
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
  const semSerpDoOito = buildSerpSubjectIndex(footprintsReais().filter(item => item.keywordId !== "kw-08"));
  const crossSiloProposals = proposeCrossSiloReinforcements({ silos, keywords, serpSubject: semSerpDoOito });
  const diagnosticos = diagnoseSerpSubjectAnchors({
    silos, keywords, serp: semSerpDoOito, crossSiloProposals,
    published: new Map([
      ["kw-01", publicado("free", "como-atrair-pacientes-para-clinica")],
      ["kw-02", publicado("locked", "marketing-digital-para-dentistas")],
      ["kw-04", publicado("locked", "captacao-de-pacientes")],
      ["kw-07", publicado("locked", "promocoes-para-estetica")],
      ["kw-08", publicado("locked", "leads-sem-trafego-pago")],
    ]),
    volumeValidated: new Set(["kw-09", "kw-10", "kw-11", "kw-15", "kw-16", "kw-17", "kw-19"]),
    brandRef: "adalbapro--brand",
  });
  const de = new Map(diagnosticos.map(item => [item.anchorKeywordId, item]));

  const troca = de.get("kw-01")!;
  assert.equal(troca.state, "swap_proposed");
  assert.equal(troca.swap?.substitute?.keywordId, "kw-09");
  assert.match(troca.headline, /Troca proposta: "como atrair pacientes" .*vira secundária\. URL, slug e canonical não mudam\./);
  assert.equal(troca.actions[0].kind, "decide_swap");

  const reforcado = de.get("kw-02")!;
  assert.equal(reforcado.state, "reinforced");
  assert.match(reforcado.headline, /^Reforçado com 3 keywords — 3 dividem a SERP \(3\+ páginas\)\. Cabem mais 2\.$/);
  assert.equal(reforcado.swap?.state, "locked");
  assert.ok(reforcado.members.filter(item => item.basis === "serp").every(item => (item.sharedPageCount ?? 0) >= 3));

  const outroSilo = de.get("kw-04")!;
  assert.equal(outroSilo.state, "pair_in_other_silo");
  assert.match(outroSilo.headline, /"como captar pacientes" \(Silo "Leads sem tráfego pago", 3 páginas em comum\)\. Mover de Silo é decisão sua\./);

  const semPar = de.get("kw-07")!;
  assert.equal(semPar.state, "no_pair_in_batch");
  assert.match(semPar.headline, new RegExp(`${NO_SERP_PAIR_IN_BATCH_MESSAGE}.*${REINFORCEMENT_SEARCH_ACTION_LABEL}`));
  const busca = semPar.actions[0];
  assert.equal(busca.kind, "search_reinforcement");
  assert.deepEqual(busca.search, {
    kind: "published", anchorKeywordId: "kw-07", phrase: "promoções para estética",
    destinationUrl: "https://adalbapro.com.br/promocoes-para-estetica", note: null,
    href: "/adalbapro--brand/minerador/descobrir?modo=assunto&reforco=kw-07",
  });

  const semSerp = de.get("kw-08")!;
  assert.equal(semSerp.state, "serp_missing");
  assert.equal(semSerp.serpEvidence, "missing");
  assert.equal(semSerp.actions[0].kind, "collect_serp");

  const resumo = summarizeSerpSubjectDiagnoses(diagnosticos);
  assert.equal(resumo.published, 5);
  assert.equal(resumo.byState.swap_proposed + resumo.byState.reinforced + resumo.byState.pair_in_other_silo + resumo.byState.no_pair_in_batch + resumo.byState.serp_missing, 5);
  assert.match(resumo.headline, /^5 publicados e 0 Assuntos: 1 troca proposta, 1 reforçado, 1 par em outro silo, 1 sem serp no cache, 1 sem par no lote\.$/);
  assert.equal(chamadasDeRede, 0);
});

test("diagnóstico: depois da busca sem demanda, 'tema sem demanda no Google' e a decisão é do dono", () => {
  const diagnosticos = diagnoseSerpSubjectAnchors({
    silos: [{ siloRef: "territory:b", siloLabel: "Leads", plan: { anchors: [{ kind: "published", principalKeywordId: "kw-07", keywordIds: ["kw-07"] }], awaitingSubjectKeywordIds: [], leftoverKeywordIds: [] } }],
    keywords: mapaDe(["kw-07", "kw-20"]), serp: INDICE,
    published: new Map([["kw-07", publicado("locked", "promocoes-para-estetica")]]),
    volumeValidated: new Set(["kw-20"]),
    reinforcementSearches: new Map([["kw-07", { searchedAt: "2026-09-26T20:00:00Z", candidateCount: 14, candidatesWithDemand: 0 }]]),
  });
  assert.equal(diagnosticos[0].state, "no_demand");
  assert.match(diagnosticos[0].headline, new RegExp(`^${NO_DEMAND_MESSAGE[0].toUpperCase()}${NO_DEMAND_MESSAGE.slice(1)}: a busca de reforço \\(14 candidatas\\)`));
  assert.equal(diagnosticos[0].actions[0].kind, "owner_decides");
  assert.equal(diagnosticos[0].actions[0].search, undefined, "sem link: o href só existe com brandRef");
});

test("diagnóstico (D2.3): a Lógica diferente não barra — o par de 7 páginas vira sugestão Forte, marcada, com aviso", () => {
  const entrada = {
    silos: [{ siloRef: "territory:a", siloLabel: "Captação", plan: { anchors: [{ kind: "published" as const, principalKeywordId: "kw-01", keywordIds: ["kw-01"] }], awaitingSubjectKeywordIds: [], leftoverKeywordIds: ["kw-09", "kw-10"] } }],
    serp: INDICE,
    published: new Map([["kw-01", publicado("locked", "como-atrair-pacientes-para-clinica")], ["kw-03", publicado("locked", "como-atrair-clientes-para-consultorio")]]),
    volumeValidated: new Set(["kw-09", "kw-10"]),
  };
  const [sugerido] = diagnoseSerpSubjectAnchors({ ...entrada, keywords: mapaDe(["kw-01", "kw-03", "kw-09", "kw-10"]) });
  assert.equal(sugerido.state, "suggestions_available");
  assert.deepEqual(sugerido.blockedByDna, []);
  assert.deepEqual(sugerido.suggestions.map(item => [item.keywordId, item.level, item.preselected, item.where]), [["kw-09", "strong", true, "leftover"], ["kw-10", "strong", true, "leftover"]]);
  assert.match(sugerido.suggestions[0].reason, /^7 páginas em comum no top 10$/);
  assert.match(sugerido.suggestions[0].warning!, /Intenção da Lógica diferente \(Comercial × Informativo\): só aviso/);
  assert.match(sugerido.headline, /^2 sugestões com volume para o artigo "como atrair pacientes para clínica" \(2 Forte\)\. A maior: "como atrair pacientes"/);
  assert.equal(sugerido.actions[0].kind, "apply_suggestions");

  // D2.3.1 (2026-09-28) — o DEFEITO da AdalbaPro: intenção OBSERVADA diferente, mas 7
  // páginas em comum. As páginas vencem o rótulo: sugestão Forte, com aviso.
  const observada = { "kw-01": { observedIntent: "Comercial" }, "kw-09": { observedIntent: "Informativa" }, "kw-10": { observedIntent: "Informativa" }, "kw-19": { observedIntent: "Informativa" } };
  const [corrigido] = diagnoseSerpSubjectAnchors({ ...entrada, keywords: mapaDe(["kw-01", "kw-03", "kw-09", "kw-10"], observada) });
  assert.equal(corrigido.state, "suggestions_available");
  assert.deepEqual(corrigido.blockedByDna, []);
  assert.deepEqual(corrigido.suggestions.map(item => [item.keywordId, item.level, item.preselected]), [["kw-09", "strong", true], ["kw-10", "strong", true]]);
  assert.match(corrigido.suggestions[0].warning!, /Aviso: o Google mostrou, de forma conclusiva, intenções diferentes para as duas buscas, mas 7 páginas do top 10 coincidem/);

  // Com 2 páginas em comum, a intenção observada diferente continua barrando: "o DNA separa".
  const [alvo] = diagnoseSerpSubjectAnchors({
    ...entrada,
    silos: [{ ...entrada.silos[0], plan: { ...entrada.silos[0].plan, leftoverKeywordIds: ["kw-19"] } }],
    volumeValidated: new Set(["kw-19"]),
    keywords: mapaDe(["kw-01", "kw-03", "kw-19"], observada),
  });
  assert.deepEqual(alvo.suggestions, [], "2 páginas e a SERP separou: não é sugestão");
  assert.notEqual(alvo.state, "suggestions_available");
  // Outra página publicada divide a SERP: sinal de canibalização, nunca fusão.
  assert.deepEqual(corrigido.publishedOverlaps.map(item => item.keywordId), ["kw-03"]);
  assert.ok(corrigido.details.some(linha => /possível canibalização/.test(linha)));
});

test("diagnóstico do Assunto: aguardando sustentação e par sem volume", () => {
  const assunto = { ...kw("kw-11"), keywordId: "assunto-atrair", keyword: "atrair pacientes" };
  const pegadas = [...footprintsReais(), { ...footprintsReais().find(item => item.keywordId === "kw-11")!, keywordId: "assunto-atrair", keyword: "atrair pacientes" }];
  const indice = buildSerpSubjectIndex(pegadas);
  const keywords = new Map([["assunto-atrair", assunto], ...mapaDe(["kw-09", "kw-10", "kw-07"])]);
  const silo = { siloRef: "territory:a", siloLabel: "Captação", plan: { anchors: [], awaitingSubjectKeywordIds: ["assunto-atrair"], leftoverKeywordIds: ["kw-09", "kw-10"] } };
  const semVolume = diagnoseSerpSubjectAnchors({ silos: [silo], keywords, serp: indice, published: new Map(), volumeValidated: new Set(), subjects: new Map([["assunto-atrair", { note: "Para clínicas", destinationUrl: "https://adalbapro.com.br/servicos" }]]), brandRef: "adalbapro--brand" });
  assert.equal(semVolume[0].kind, "subject");
  assert.equal(semVolume[0].state, "pair_without_volume");
  assert.equal(semVolume[0].actions[0].kind, "measure_volume");
  assert.equal(semVolume[0].actions[1].search?.href, reinforcementSearchHref("adalbapro--brand", { kind: "subject", anchorKeywordId: "assunto-atrair" }));
  assert.equal(semVolume[0].actions[1].search?.destinationUrl, "https://adalbapro.com.br/servicos");

  const sozinho = diagnoseSerpSubjectAnchors({ silos: [{ ...silo, plan: { ...silo.plan, leftoverKeywordIds: ["kw-07"] } }], keywords: new Map([["assunto-atrair", assunto], ...mapaDe(["kw-07"])]), serp: indice, published: new Map(), volumeValidated: new Set() });
  assert.equal(sozinho[0].state, "no_pair_in_batch");
  assert.match(sozinho[0].headline, /^Assunto · aguardando sustentação: nenhuma keyword deste lote trata do mesmo assunto no Google\./);
});

test("Buscar reforço do Assunto usa o mesmo link de 'Buscar sustentação' do Minerador", () => {
  const id = "0f4a2c1e-2b3d-4e5f-8a9b-0c1d2e3f4a5b";
  assert.equal(reinforcementSearchHref("adalbapro--x", { kind: "subject", anchorKeywordId: id }), subjectSearchLinkHref("adalbapro--x", id));
  assert.equal(reinforcementSearchHref("adalbapro--x", { kind: "published", anchorKeywordId: id }), `/adalbapro--x/minerador/descobrir?modo=assunto&reforco=${id}`);
  assert.equal(SERP_SUBJECT_DILEMMA_STATES.length, Object.keys(SERP_SUBJECT_DILEMMA_LABELS).length);
});

/* ======================= 7. sustentação sugerida do Assunto ======================= */

test("sugestões do Assunto: a SERP forte basta e vem primeiro; palavras que o Google recusa saem do automático", () => {
  const assunto = linhaDaMesa({ id: ASSUNTO_ID, keyword: "como atrair pacientes para clínica", semantic: { ...declarado(null), ...logica({ intent: "Informativa" }) } });
  const serpForte = linhaDaMesa({ id: "serp-forte", keyword: "google meu negocio consultorio", semantic: { ...VOLUME_VALIDADO, ...logica({ intent: "Transacional" }) } });
  const soPalavras = linhaDaMesa({ id: "so-palavras", keyword: "como atrair pacientes sem redes sociais", semantic: { ...VOLUME_VALIDADO, ...logica({ intent: "Informativa" }) } });
  const pegada = (keywordId: string, urls: string[]): KeywordSerpFootprint => ({ keywordId, keyword: keywordId, lenses: [{ lens: "mobile-android", urls, domains: null, collectedAt: null }] });
  const indice = buildSerpSubjectIndex([
    pegada(ASSUNTO_ID, ["https://a.com/1", "https://b.com/2", "https://c.com/3", "https://d.com/4"]),
    pegada("serp-forte", ["https://a.com/1", "https://b.com/2", "https://c.com/3"]),
    pegada("so-palavras", ["https://z.com/9"]),
  ]);
  const antes = suggestSubjectSupport({ brandId: MARCA, subjectKeyword: assunto, keywords: [serpForte, soPalavras] });
  assert.deepEqual(antes.map(item => item.keywordId), ["so-palavras"], "sem SERP, a de outro vocabulário nem aparecia");
  const agora = suggestSubjectSupport({ brandId: MARCA, subjectKeyword: assunto, keywords: [serpForte, soPalavras], serpSubject: indice });
  assert.deepEqual(agora.map(item => item.keywordId), ["serp-forte", "so-palavras"]);
  assert.deepEqual(agora[0].signals, ["serp_shared_pages"]);
  assert.equal(agora[0].automaticEligible, true);
  assert.equal(agora[0].serp?.sharedPageCount, 3);
  assert.match(agora[0].reason, /^Mesmo assunto no Google \(3 páginas em comum no top 10\)\.$/);
  assert.equal(agora[1].automaticEligible, false, "o Google põe em outro assunto");
  assert.match(agora[1].reason, /O Google não confirma: nenhuma página em comum no top 10\.$/);
});

/* ================== 8. correções do revisor: os dilemas que faltavam ================== */

const publicado_ = (post: PublishedAnchorInfo["post"], slug: string): PublishedAnchorInfo => ({ post, url: `https://adalbapro.com.br/${slug}`, canonical: `https://adalbapro.com.br/${slug}`, slug });

/** Duas keywords "iguais" à kw-17 no Google (mesmo top 10, volume 10): enchem o artigo como na AdalbaPro real. */
const clonesDoDezessete = (): KeywordSerpFootprint[] => {
  const base = footprintsReais().find(item => item.keywordId === "kw-17")!;
  return ["kw-17b", "kw-17c"].map(keywordId => ({ ...base, keywordId, keyword: `${base.keyword} ${keywordId}` }));
};

test("formação: entre as que o Google junta, entra primeiro a de maior volume (D1.3), e a substituta cabe", () => {
  const indice = buildSerpSubjectIndex([...footprintsReais(), ...clonesDoDezessete()]);
  const clone = (keywordId: string) => ({ ...kw("kw-17"), keywordId, keyword: `marketing digital odontologico ${keywordId}` });
  const plano = planSiloArticleFormation({
    siloRef: "territory:odonto", siloLabel: "Marketing odontológico", siloSlug: "/marketing-odontologico", siloTokens: sem,
    keywords: [kw("kw-02"), kw("kw-15"), kw("kw-16"), kw("kw-17"), kw("kw-18"), clone("kw-17b"), clone("kw-17c")],
    subjects: comVolume(["kw-15", "kw-16", "kw-17", "kw-18", "kw-17b", "kw-17c"]),
    batchObjective: "improve",
    serpSubject: indice,
  });
  const publicado = plano.anchors.find(ancora => ancora.kind === "published")!;
  assert.equal(publicado.keywordIds.length, 6, "teto de 6");
  assert.ok(publicado.keywordIds.includes("kw-15"), "marketing para dentistas (210, 3 páginas) não fica de fora por quatro keywords de volume 10");
  assert.ok(publicado.keywordIds.includes("kw-16"), "marketing dentista (70) também entra antes das de volume 10");
  assert.equal(plano.leftoverKeywordIds.length, 1, "a que sobrou fica em Keywords não agrupadas, sem sumir");
  assert.equal(LINHA.get("kw-17")?.volume, 10);

  // Entre fortes: volume primeiro; com o mesmo volume, mais páginas.
  const forte210 = measureAnchorConvergence(kw("kw-02"), kw("kw-15"), { siloTokens: sem, serp: INDICE });
  const forte10 = measureAnchorConvergence(kw("kw-02"), kw("kw-17"), { siloTokens: sem, serp: INDICE });
  assert.equal(forte210.basis, "serp");
  assert.equal(forte10.basis, "serp");
  assert.ok(forte210.score > forte10.score, "210 com 3 páginas passa na frente de 10 com 4");
  assert.ok(forte10.score >= 1 && forte210.score < 2, "o volume não tira ninguém da faixa forte");

  // A troca do Posto Livre sai para uma keyword que JÁ está no artigo: dá para aplicar.
  const diagnostico = diagnoseSerpSubjectAnchors({
    silos: [{ siloRef: "territory:odonto", siloLabel: "Marketing odontológico", plan: plano, keywordIds: [...publicado.keywordIds, ...plano.leftoverKeywordIds] }],
    keywords: new Map([kw("kw-02"), kw("kw-15"), kw("kw-16"), kw("kw-17"), kw("kw-18"), clone("kw-17b"), clone("kw-17c")].map(item => [item.keywordId, item] as const)),
    serp: indice,
    published: new Map([["kw-02", publicado_("free", "marketing-digital-para-dentistas")]]),
    volumeValidated: new Set(["kw-15", "kw-16", "kw-17", "kw-18", "kw-17b", "kw-17c"]),
  })[0];
  assert.equal(diagnostico.state, "swap_proposed");
  assert.equal(diagnostico.swap?.substitute?.keywordId, "kw-15");
  assert.ok(publicado.keywordIds.includes(diagnostico.swap!.substitute!.keywordId));
  assert.equal(chamadasDeRede, 0);
});

test("troca: a melhor substituta fora de um artigo cheio não vira botão morto — o cartão diz qual é e abre o artigo", () => {
  const indice = buildSerpSubjectIndex([...footprintsReais(), ...clonesDoDezessete()]);
  const clone = (keywordId: string) => ({ ...kw("kw-17"), keywordId, keyword: `marketing digital odontologico ${keywordId}` });
  const keywords = new Map([kw("kw-02"), kw("kw-15"), kw("kw-16"), kw("kw-17"), kw("kw-18"), clone("kw-17b"), clone("kw-17c")].map(item => [item.keywordId, item] as const));
  // O plano de antes da correção: cheio com as de volume 10; a de 210 ficou de fora.
  const plan = { anchors: [{ kind: "published" as const, principalKeywordId: "kw-02", keywordIds: ["kw-02", "kw-17", "kw-18", "kw-17b", "kw-17c", "kw-16"] }], awaitingSubjectKeywordIds: [], leftoverKeywordIds: ["kw-15"] };
  const [diagnostico] = diagnoseSerpSubjectAnchors({
    silos: [{ siloRef: "territory:odonto", siloLabel: "Marketing odontológico", plan, keywordIds: [...keywords.keys()] }],
    keywords, serp: indice,
    published: new Map([["kw-02", publicado_("free", "marketing-digital-para-dentistas")]]),
    volumeValidated: new Set(["kw-15", "kw-16", "kw-17", "kw-18", "kw-17b", "kw-17c"]),
  });
  assert.notEqual(diagnostico.swap?.substitute?.keywordId, "kw-15", "não propõe uma substituta que não cabe");
  assert.equal(diagnostico.substituteOutsideFullArticle?.keywordId, "kw-15");
  assert.equal(diagnostico.substituteOutsideFullArticle?.volume, 210);
  assert.equal(diagnostico.state, "reinforced");
  assert.match(diagnostico.headline, /No teto de 6\. Posto Livre: a melhor substituta, "marketing para dentistas" \(volume 210, 3 páginas em comum\), ficou fora porque o artigo está no teto de 6 — tire uma keyword para ela entrar\.$/);
  assert.equal(diagnostico.actions[0].kind, "open_article");
  assert.deepEqual(diagnostico.actions[0].article, { siloRef: "territory:odonto", principalKeywordId: "kw-02", label: "marketing digital para dentistas" });

  // Posto Travado: nem a hipótese aparece — a principal fica, só reforço.
  const [travado] = diagnoseSerpSubjectAnchors({
    silos: [{ siloRef: "territory:odonto", siloLabel: "Marketing odontológico", plan, keywordIds: [...keywords.keys()] }],
    keywords, serp: indice,
    published: new Map([["kw-02", publicado_("locked", "marketing-digital-para-dentistas")]]),
    volumeValidated: new Set(["kw-15", "kw-16", "kw-17", "kw-18", "kw-17b", "kw-17c"]),
  });
  assert.equal(travado.substituteOutsideFullArticle ?? null, null);
  assert.equal(travado.swap?.state, "locked");
});

test("Par em outro artigo: o par real do publicado está em outro artigo do Silo — nunca 'sem par no lote'", () => {
  const ids = ["kw-03", "kw-05", "kw-10", "kw-11", "kw-12", "kw-13"];
  const lista = ids.map(id => kw(id, id === "kw-03" || id === "kw-05" ? { isPublished: true } : {}));
  const plano = planSiloArticleFormation({
    siloRef: "territory:captacao", siloLabel: "Captação", siloSlug: "/captacao", siloTokens: sem,
    keywords: lista,
    subjects: comVolume(["kw-10", "kw-11", "kw-12", "kw-13"]),
    batchObjective: "improve",
    serpSubject: INDICE,
  });
  const doTres = plano.anchors.find(ancora => ancora.principalKeywordId === "kw-03")!;
  const doCinco = plano.anchors.find(ancora => ancora.principalKeywordId === "kw-05")!;
  assert.ok(doTres.keywordIds.includes("kw-10"), "a formação dá o par ao publicado que divide mais páginas com ele");
  assert.deepEqual(doCinco.keywordIds, ["kw-05"]);

  const diagnosticos = diagnoseSerpSubjectAnchors({
    silos: [{ siloRef: "territory:captacao", siloLabel: "Captação", plan: plano, keywordIds: ids }],
    keywords: new Map(lista.map(item => [item.keywordId, item] as const)),
    serp: INDICE,
    published: new Map([
      ["kw-03", publicado_("free", "como-atrair-clientes-para-consultorio")],
      ["kw-05", publicado_("free", "como-atrair-pacientes-para-consultorio-odontologico")],
    ]),
    volumeValidated: new Set(["kw-05", "kw-10", "kw-11", "kw-12", "kw-13"]),
    brandRef: "adalbapro--brand",
  });
  const cinco = diagnosticos.find(item => item.anchorKeywordId === "kw-05")!;
  assert.equal(cinco.state, "pair_in_other_article");
  assert.equal(SERP_SUBJECT_DILEMMA_LABELS[cinco.state], "Par em outro artigo");
  assert.doesNotMatch(cinco.headline, new RegExp(NO_SERP_PAIR_IN_BATCH_MESSAGE), "a frase da D2.2 só vale quando nenhuma divide");
  assert.match(cinco.headline, /^O Google junta "como atrair pacientes para o consultório" ao artigo "como atrair pacientes para consultório odontológico" \(4 páginas em comum com este, 5 com aquele\), mas ela já está no artigo "como atrair clientes para consultório"/);
  assert.match(cinco.headline, /Os dois publicados disputam o mesmo assunto\. Decida para onde ela vai: trazer para cá, deixar lá ou tratar como canibalização\.$/);
  const abrir = cinco.actions[0];
  assert.equal(abrir.kind, "open_article");
  assert.deepEqual(abrir.article, { siloRef: "territory:captacao", principalKeywordId: "kw-03", label: "como atrair clientes para consultório" });
  assert.equal(cinco.actions[1].kind, "search_reinforcement");
  const par = cinco.pairsElsewhere.find(item => item.keywordId === "kw-10")!;
  assert.equal(par.where, "other_anchor");
  assert.equal(par.inAnchorPrincipalKeywordId, "kw-03");
  assert.equal(par.inAnchorPublished, true);
  assert.equal(par.sharedWithHolder, 5);
  assert.match(summarizeSerpSubjectDiagnoses(diagnosticos).headline, /1 par em outro artigo/);
});

test("Posto Livre (D2.3): a Provável de 2 páginas com volume maior vira troca proposta, com aviso; SERP de apoio não é chamada de 'divide'", () => {
  const pegada = (keywordId: string, urls: string[]): KeywordSerpFootprint => ({ keywordId, keyword: keywordId, lenses: [{ lens: "mobile-android", urls, domains: null, collectedAt: null }] });
  const indice = buildSerpSubjectIndex([
    pegada("pub", ["https://a.com/1", "https://b.com/2", "https://c.com/3", "https://d.com/4"]),
    pegada("viz", ["https://a.com/1", "https://b.com/2", "https://x.com/9"]),
  ]);
  const pub: ArticleFormationKeyword = { keywordId: "pub", keyword: "tráfego pago vs orgânico para clínica de estética", intent: "Informativo", volume: null, kgr: null, entity: null, problem: null, isPublished: true };
  const viz: ArticleFormationKeyword = { keywordId: "viz", keyword: "tráfego pago ou orgânico para clínica de estética", intent: "Informativo", volume: 30, kgr: null, entity: null, problem: null, isPublished: false };
  const [diagnostico] = diagnoseSerpSubjectAnchors({
    silos: [{ siloRef: "territory:e", siloLabel: "Estética", plan: { anchors: [{ kind: "published", principalKeywordId: "pub", keywordIds: ["pub", "viz"] }], awaitingSubjectKeywordIds: [], leftoverKeywordIds: [] }, siloTokens: new Set(["trafego", "pago", "organico"]) }],
    keywords: new Map([["pub", pub], ["viz", viz]]),
    serp: indice,
    published: new Map([["pub", publicado_("free", "trafego-pago-vs-organico")]]),
    volumeValidated: new Set(["viz"]),
    brandRef: "adalbapro--brand",
  });
  assert.equal(diagnostico.state, "swap_proposed");
  assert.equal(diagnostico.members.find(item => item.keywordId === "viz")?.basis, "serp_and_words");
  assert.equal(diagnostico.swap?.substitute?.keywordId, "viz");
  assert.equal(diagnostico.swap?.substitute?.level, "probable");
  assert.match(diagnostico.swap!.substitute!.warning!, /Nível Provável \(2 páginas e palavras em comum no top 10\)/);
  assert.match(diagnostico.headline, /^Troca proposta \(Provável\): "tráfego pago ou orgânico para clínica de estética" \(volume 30, 2 páginas em comum no top 10\)/);
  assert.doesNotMatch(diagnostico.headline, /divide a SERP/);
  assert.match(diagnostico.swap!.note, /é Provável: 2 páginas e palavras em comum no top 10\..*URL, slug e canonical não mudam/);
  // Sem volume, a Provável não assume: a Livre fica sem substituta e pede Buscar reforço.
  const [semVolume] = diagnoseSerpSubjectAnchors({
    silos: [{ siloRef: "territory:e", siloLabel: "Estética", plan: { anchors: [{ kind: "published", principalKeywordId: "pub", keywordIds: ["pub", "viz"] }], awaitingSubjectKeywordIds: [], leftoverKeywordIds: [] }, siloTokens: new Set(["trafego", "pago", "organico"]) }],
    keywords: new Map([["pub", pub], ["viz", { ...viz, volume: null }]]),
    serp: indice,
    published: new Map([["pub", publicado_("free", "trafego-pago-vs-organico")]]),
    volumeValidated: new Set(),
    brandRef: "adalbapro--brand",
  });
  assert.equal(semVolume.state, "reinforced");
  assert.match(semVolume.headline, /Posto Livre, mas nenhuma keyword do lote serve de substituta/);
  assert.ok(semVolume.actions.some(action => action.kind === "search_reinforcement"), "a Livre sem substituta pede Buscar reforço");
  assert.equal(semVolume.swap?.rejected.find(item => item.keywordId === "viz")?.missing, "volume");
});

test("Posto não declarado: diz que o Minerador mostra 'Travado' por padrão e o que seria proposto se fosse Livre", () => {
  const keywords = mapaDe(["kw-02", "kw-15", "kw-16"]);
  const [diagnostico] = diagnoseSerpSubjectAnchors({
    silos: [{ siloRef: "territory:odonto", siloLabel: "Marketing odontológico", plan: { anchors: [{ kind: "published", principalKeywordId: "kw-02", keywordIds: ["kw-02", "kw-15", "kw-16"] }], awaitingSubjectKeywordIds: [], leftoverKeywordIds: [] } }],
    keywords, serp: INDICE,
    published: new Map([["kw-02", publicado_("unknown", "marketing-digital-para-dentistas")]]),
    volumeValidated: new Set(["kw-15", "kw-16"]),
  });
  assert.equal(diagnostico.state, "reinforced", "nada é proposto nem bloqueado sem declaração");
  assert.equal(diagnostico.swap?.state, "unknown_post");
  assert.equal(diagnostico.swapIfDeclaredFree?.substitute?.keywordId, "kw-15");
  assert.match(diagnostico.swap!.note, /O Minerador mostra "Travado ao slug" por padrão em página publicada, mas padrão não é decisão/);
  assert.ok(diagnostico.details.some(linha => /^Se você declarar o Posto "Livre", a troca proposta seria "marketing para dentistas" \(volume 210, 3 páginas em comum\)\./.test(linha)));
  assert.ok(diagnostico.actions.some(action => action.kind === "declare_post"));

  const [travado] = diagnoseSerpSubjectAnchors({
    silos: [{ siloRef: "territory:odonto", siloLabel: "Marketing odontológico", plan: { anchors: [{ kind: "published", principalKeywordId: "kw-02", keywordIds: ["kw-02", "kw-15", "kw-16"] }], awaitingSubjectKeywordIds: [], leftoverKeywordIds: [] } }],
    keywords, serp: INDICE,
    published: new Map([["kw-02", publicado_("locked", "marketing-digital-para-dentistas")]]),
    volumeValidated: new Set(["kw-15", "kw-16"]),
  });
  assert.equal(travado.swapIfDeclaredFree ?? null, null, "Travado nunca mostra troca, nem hipotética");
  assert.equal(travado.swap?.state, "locked");
});

test("SERP vencida não é 'nunca coletada': o cartão diz quando venceu e oferece coletar de novo", () => {
  const lacunas = serpGapsFromMissingLenses({
    now: new Date("2026-10-22T12:00:00Z"),
    missingLenses: [
      { keywordId: "kw-08", lens: "desktop-windows", reason: "validade vencida", collectedAt: "2026-09-20T12:00:00+00:00" },
      { keywordId: "kw-08", lens: "mobile-android", reason: "validade vencida", collectedAt: "2026-09-21T12:00:00+00:00" },
      { keywordId: "kw-07", lens: "desktop-windows", reason: "sem entrada no cache" },
      { keywordId: "kw-07", lens: "mobile-ios", reason: "sem entrada no cache" },
      { keywordId: "kw-04", lens: "desktop-windows", reason: "outra localidade", collectedAt: "2026-09-21T12:00:00+00:00" },
      { keywordId: "kw-02", lens: "desktop-windows", reason: "sem entrada no cache" },
    ],
    withPages: keywordId => keywordId === "kw-02",
  });
  assert.deepEqual(lacunas.get("kw-08"), { kind: "stale", collectedAt: "2026-09-21T12:00:00+00:00", ageDays: 31 });
  assert.deepEqual(lacunas.get("kw-07"), { kind: "never", collectedAt: null, ageDays: null });
  assert.equal(lacunas.get("kw-04")?.kind, "unusable");
  assert.equal(lacunas.has("kw-02"), false, "lente parcial não é lacuna");

  const semSerp = buildSerpSubjectIndex(footprintsReais().filter(item => item.keywordId !== "kw-08" && item.keywordId !== "kw-07"));
  const diagnosticos = diagnoseSerpSubjectAnchors({
    silos: [{ siloRef: "territory:b", siloLabel: "Leads", plan: { anchors: [
      { kind: "published", principalKeywordId: "kw-08", keywordIds: ["kw-08"] },
      { kind: "published", principalKeywordId: "kw-07", keywordIds: ["kw-07"] },
    ], awaitingSubjectKeywordIds: [], leftoverKeywordIds: [] } }],
    keywords: mapaDe(["kw-07", "kw-08"]), serp: semSerp,
    published: new Map([["kw-07", publicado_("locked", "promocoes")], ["kw-08", publicado_("locked", "leads")]]),
    volumeValidated: new Set(), serpGaps: lacunas,
  });
  const vencida = diagnosticos.find(item => item.anchorKeywordId === "kw-08")!;
  assert.equal(vencida.state, "serp_missing");
  assert.equal(vencida.serpGap?.kind, "stale");
  assert.match(vencida.headline, /^A SERP de "leads sem tráfego pago" no cache venceu \(coletada em 21\/09\/2026, há 31 dias\): a validade é de 30 dias/);
  assert.equal(vencida.actions[0].label, "Coletar de novo (pago)");
  const nunca = diagnosticos.find(item => item.anchorKeywordId === "kw-07")!;
  assert.match(nunca.headline, /^"promoções para estética" nunca teve a SERP coletada/);
  assert.equal(nunca.actions[0].label, "Coletar SERP (pago)");
});

/* ================== 9. D2.3 — volume primeiro, sugestão que o dono confirma ================== */

test("D2.3 · sem volume é nulo, zero ou inválido", () => {
  assert.equal(hasSearchVolume(null), false);
  assert.equal(hasSearchVolume(undefined), false);
  assert.equal(hasSearchVolume(0), false);
  assert.equal(hasSearchVolume(Number.NaN), false);
  assert.equal(hasSearchVolume(10), true);
});

test("D2.3 · o nível: Forte com 3+ páginas; Provável com 2 páginas, 3+ sites que distinguem ou mesma entidade e problema", () => {
  const pegada = (keywordId: string, urls: string[]): KeywordSerpFootprint => ({ keywordId, keyword: keywordId, lenses: [{ lens: "mobile-ios", urls, domains: null, collectedAt: null }] });
  const indice = buildSerpSubjectIndex([
    pegada("a", ["https://a.com/1", "https://b.com/2", "https://c.com/3", "https://s1.com/x", "https://s2.com/x", "https://s3.com/x", "https://www.instagram.com/p", "https://youtube.com/v"]),
    pegada("forte", ["https://a.com/1", "https://b.com/2", "https://c.com/3"]),
    pegada("duas", ["https://a.com/1", "https://b.com/2"]),
    pegada("sites", ["https://s1.com/y", "https://s2.com/y", "https://s3.com/y"]),
    pegada("social", ["https://instagram.com/q", "https://m.youtube.com/w", "https://s1.com/z"]),
    pegada("nada", ["https://z.com/9"]),
  ]);
  const linha = (keywordId: string, extra: Partial<ArticleFormationKeyword> = {}): ArticleFormationKeyword => ({ keywordId, keyword: keywordId, intent: null, volume: 10, kgr: null, entity: null, problem: null, isPublished: false, ...extra });
  assert.equal(serpSuggestionMatch(linha("a"), linha("forte"), indice)?.level, "strong");
  assert.equal(serpSuggestionMatch(linha("a"), linha("forte"), indice)?.reason, "3 páginas em comum no top 10");
  assert.deepEqual([serpSuggestionMatch(linha("a"), linha("duas"), indice)?.level, serpSuggestionMatch(linha("a"), linha("duas"), indice)?.basis], ["probable", "two_pages"]);
  const sites = serpSuggestionMatch(linha("a"), linha("sites"), indice);
  assert.deepEqual([sites?.level, sites?.basis, sites?.reason], ["probable", "domains", "3 sites em comum no top 10"]);
  assert.equal(serpSuggestionMatch(linha("a"), linha("social"), indice), null, "rede social não distingue assunto");
  assert.ok(SERP_GENERIC_DOMAINS.includes("instagram.com"));
  assert.equal(serpSuggestionMatch(linha("a"), linha("nada"), indice), null);
  const dna = { entity: "Clínica", problem: "atrair pacientes", semanticState: "conclusive" as const };
  // A SERP mediu o par (0 página, sem sites em comum): outro assunto, o DNA não reabre (D2.2/A2).
  assert.equal(serpSuggestionMatch(linha("a", dna), linha("nada", dna), indice), null, "SERP que separa vence o DNA");
  // Sem SERP no cache para a candidata: o DNA sustenta a Provável.
  const semSerp = serpSuggestionMatch(linha("a", dna), linha("fora-do-cache", dna), indice);
  assert.deepEqual([semSerp?.level, semSerp?.basis], ["probable", "dna"]);
  assert.match(semSerp?.reason ?? "", /sem SERP para medir/);
  assert.equal(serpSuggestionMatch(linha("a", dna), linha("fora-do-cache", { ...dna, semanticState: "non_conclusive" }), indice), null, "DNA inconclusivo não sustenta");
});

test("D2.3 · site presente em mais de 15% das SERPs do lote não conta como sinal (lote de 50+)", () => {
  const pegada = (keywordId: string, urls: string[]): KeywordSerpFootprint => ({ keywordId, keyword: keywordId, lenses: [{ lens: "mobile-ios", urls, domains: null, collectedAt: null }] });
  const comuns = ["https://portal1.com.br/a", "https://portal2.com.br/a", "https://portal3.com.br/a"];
  const lote = Array.from({ length: 60 }, (_, indice) => pegada(`k${indice}`, [...comuns.map(url => `${url}${indice}`), `https://unico${indice}.com/x`]));
  const indice = buildSerpSubjectIndex(lote);
  assert.ok(indice.genericDomains().has("portal1.com.br"));
  const medida = indice.overlap("k0", "k1");
  assert.equal(medida.sharedDomainCount, 3);
  assert.equal(medida.sharedDistinctiveDomainCount, 0);
  // Abaixo de 50 keywords, só a lista fixa vale.
  assert.equal(buildSerpSubjectIndex(lote.slice(0, 49)).genericDomains().size, 0);
});

test("D2.3 · sugestões do publicado: só com volume, por volume, Forte marcada até as vagas, Provável desmarcada, outro Silo como proposta", () => {
  const keywords = mapaDe(["kw-01", "kw-03", "kw-09", "kw-10", "kw-11", "kw-12", "kw-13", "kw-14", "kw-19", "kw-20"], {
    "kw-12": { volume: 0 },
    "kw-13": { humanFormationRef: "article-formation:outro" },
  });
  const lugares: Record<string, { siloRef: string; siloLabel: string; kind: "leftover" | "anchor_member" }> = {
    "kw-09": { siloRef: "territory:a", siloLabel: "Captação", kind: "leftover" },
    "kw-10": { siloRef: "territory:a", siloLabel: "Captação", kind: "leftover" },
    "kw-11": { siloRef: "territory:a", siloLabel: "Captação", kind: "leftover" },
    "kw-14": { siloRef: "territory:a", siloLabel: "Captação", kind: "anchor_member" },
    "kw-19": { siloRef: "territory:b", siloLabel: "Leads", kind: "leftover" },
    "kw-20": { siloRef: "territory:a", siloLabel: "Captação", kind: "leftover" },
  };
  const sugestoes = suggestAnchorReinforcements({
    siloRef: "territory:a",
    measureAgainst: [keywords.get("kw-01")!],
    memberIds: ["kw-01", "kw-03"].slice(0, 1),
    keywords,
    serp: INDICE,
    locate: keywordId => {
      const lugar = lugares[keywordId];
      return lugar ? { ...lugar, articleLabel: keywordId === "kw-14" ? "como atrair clientes para consultório" : null } : { siloRef: null, siloLabel: null, kind: "unknown" as const };
    },
    slotsLeft: 2,
  });
  const ids = sugestoes.map(item => item.keywordId);
  assert.ok(!ids.includes("kw-03"), "publicada nunca é sugestão");
  assert.ok(!ids.includes("kw-12"), "sem volume não é sugestão");
  assert.ok(!ids.includes("kw-13"), "decisão humana noutro artigo é preservada");
  const volumes = sugestoes.map(item => item.volume);
  assert.deepEqual(volumes, [...volumes].sort((left, right) => right - left), "ordenadas por volume");
  const marcadas = sugestoes.filter(item => item.preselected);
  assert.equal(marcadas.length, 2, "Forte marcada só até as vagas");
  assert.ok(marcadas.every(item => item.level === "strong" && item.where === "leftover"));
  assert.ok(sugestoes.filter(item => item.level === "probable").every(item => !item.preselected), "Provável vem desmarcada");
  const outroSilo = sugestoes.find(item => item.keywordId === "kw-19");
  assert.ok(outroSilo, "par em outro Silo entra na lista, como proposta");
  {
    assert.equal(outroSilo!.where, "other_silo");
    assert.equal(outroSilo!.preselected, false);
    assert.equal(outroSilo!.whereLabel, 'Silo "Leads"');
  }
  const noOutroArtigo = sugestoes.find(item => item.keywordId === "kw-14");
  assert.ok(noOutroArtigo, "Forte em outro artigo entra desmarcada");
  {
    assert.equal(noOutroArtigo!.where, "other_article");
    assert.equal(noOutroArtigo!.preselected, false);
    assert.equal(noOutroArtigo!.whereLabel, 'no artigo "como atrair clientes para consultório"');
  }
  // A Lógica (Comercial × Informativa) só avisa.
  assert.match(sugestoes.find(item => item.keywordId === "kw-09")!.warning!, /Intenção da Lógica diferente/);
  assert.ok(sugestoes.every(item => item.reason.length <= 40 && !/Precisa avaliar/.test(item.reason)), "motivo curto");
});

test("D2.3 · formação: o par de 7 páginas com a Lógica diferente reforça o publicado; a livre sem volume não reforça e fica recolhida", () => {
  const plano = planSiloArticleFormation({
    siloRef: "territory:a", siloLabel: "Captação", siloSlug: "/captacao", siloTokens: sem,
    keywords: [kw("kw-01"), kw("kw-09"), kw("kw-10", { volume: null })],
    subjects: comVolume(["kw-09"]),
    batchObjective: "improve",
    serpSubject: INDICE,
  });
  const publicado = plano.anchors.find(ancora => ancora.kind === "published")!;
  assert.deepEqual(publicado.keywordIds, ["kw-01", "kw-09"], "como atrair pacientes entra em como atrair pacientes para clínica");
  assert.deepEqual(plano.leftoverKeywordIds, ["kw-10"]);
  assert.equal(plano.universe.deferredKeywords?.find(item => item.keywordId === "kw-10")?.reason, "sem volume: não reforça nem forma artigo");
  assert.match(plano.nucleusByKeywordId.get("kw-09")!.reasons.join(" "), /7 páginas em comum.*Aviso: intenção da Lógica diferente/);
  // Sem índice de SERP, a regra de antes: a Lógica barra e a sem volume segue a regra das palavras.
  const semIndice = planSiloArticleFormation({
    siloRef: "territory:a", siloLabel: "Captação", siloSlug: "/captacao", siloTokens: sem,
    keywords: [kw("kw-01"), kw("kw-09")], subjects: comVolume(["kw-09"]), batchObjective: "improve",
  });
  assert.deepEqual(semIndice.anchors.find(ancora => ancora.kind === "published")!.keywordIds, ["kw-01"]);
});

test("D2.3 · o publicado com composição decidida por humano continua com cartão (só com SERP) e não recebe proposta de outro Silo", () => {
  const ref = "article-formation:11111111-1111-4111-8111-111111111111";
  const plano = planSiloArticleFormation({
    siloRef: "territory:a", siloLabel: "Captação", siloSlug: "/captacao", siloTokens: sem,
    keywords: [kw("kw-01", { humanFormationRef: ref }), kw("kw-09", { humanFormationRef: ref }), kw("kw-10")],
    subjects: comVolume(["kw-09", "kw-10"]),
    batchObjective: "improve",
    serpSubject: INDICE,
  });
  const humano = plano.anchors.find(ancora => ancora.principalKeywordId === "kw-01");
  assert.ok(humano);
  assert.equal(humano!.humanDecided, true);
  assert.deepEqual(humano!.keywordIds, ["kw-01", "kw-09"]);
  const propostas = proposeCrossSiloReinforcements({
    silos: [
      { siloRef: "territory:a", siloLabel: "Captação", siloTokens: sem, plan: plano },
      { siloRef: "territory:b", siloLabel: "Leads", siloTokens: sem, plan: { anchors: [], awaitingSubjectKeywordIds: [], leftoverKeywordIds: ["kw-11"] } },
    ],
    keywords: mapaDe(["kw-01", "kw-09", "kw-10", "kw-11"]),
    serpSubject: INDICE,
  });
  assert.ok(propostas.every(item => item.anchorKeywordId !== "kw-01"), "composição decidida por humano não recebe proposta automática");
  const semSerp = planSiloArticleFormation({
    siloRef: "territory:a", siloLabel: "Captação", siloSlug: "/captacao", siloTokens: sem,
    keywords: [kw("kw-01", { humanFormationRef: ref }), kw("kw-09", { humanFormationRef: ref })],
    subjects: comVolume(["kw-09"]), batchObjective: "improve",
  });
  assert.equal(semSerp.anchors.some(ancora => ancora.humanDecided), false, "sem SERP, nada muda");
});

test("D2.3 · troca: a Forte tem prioridade; a Provável (2 páginas e palavras) de volume maior fica nas alternativas, com o nível", () => {
  const pegada = (keywordId: string, urls: string[]): KeywordSerpFootprint => ({ keywordId, keyword: keywordId, lenses: [{ lens: "mobile-ios", urls, domains: null, collectedAt: null }] });
  const indice = buildSerpSubjectIndex([
    pegada("pub", ["https://a.com/1", "https://b.com/2", "https://c.com/3", "https://d.com/4"]),
    pegada("forte", ["https://a.com/1", "https://b.com/2", "https://c.com/3"]),
    pegada("provavel", ["https://a.com/1", "https://b.com/2"]),
  ]);
  const nomes: Record<string, string> = { pub: "como atrair pacientes para clínica", forte: "atrair pacientes clínica", provavel: "como atrair pacientes para clínica médica" };
  const linha = (keywordId: string, volume: number | null, isPublished = false): ArticleFormationKeyword => ({ keywordId, keyword: nomes[keywordId], intent: "Informativo", volume, kgr: null, entity: null, problem: null, isPublished });
  const proposta = proposePublishedPrimarySwap({
    published: linha("pub", null, true), post: "free", identity: identidade, serp: indice,
    candidates: [{ ...linha("forte", 20), volumeValidated: true }, { ...linha("provavel", 900), volumeValidated: true }],
  });
  assert.equal(proposta.state, "proposed");
  assert.equal(proposta.substitute?.keywordId, "forte");
  assert.equal(proposta.substitute?.level, "strong");
  assert.deepEqual(proposta.alternatives.map(item => [item.keywordId, item.level]), [["provavel", "probable"]]);
  const soProvavel = proposePublishedPrimarySwap({
    published: linha("pub", 10, true), post: "free", identity: identidade, serp: indice,
    candidates: [{ ...linha("provavel", 900), volumeValidated: true }, { ...linha("forte", 5), volumeValidated: true }],
  });
  assert.equal(soProvavel.substitute?.keywordId, "provavel", "sem Forte com volume maior, a Provável é proposta");
  assert.match(soProvavel.substitute!.warning!, /Nível Provável \(2 páginas e palavras em comum no top 10\)/);
  assert.equal(soProvavel.rejected.find(item => item.keywordId === "forte")?.missing, "volume_not_higher", "sempre com volume maior");
});

test("D2.1 · troca exige páginas em comum: 2 páginas sem palavras, só sites, só o DNA ou SERP desconhecida nunca assumem a principal", () => {
  const pegada = (keywordId: string, urls: string[]): KeywordSerpFootprint => ({ keywordId, keyword: keywordId, lenses: [{ lens: "mobile-ios", urls, domains: null, collectedAt: null }] });
  const indice = buildSerpSubjectIndex([
    pegada("pub", ["https://a.com/1", "https://b.com/2", "https://s1.com/x", "https://s2.com/x", "https://s3.com/x"]),
    pegada("duas", ["https://a.com/1", "https://b.com/2"]),
    pegada("sites", ["https://s1.com/y", "https://s2.com/y", "https://s3.com/y"]),
    pegada("dna", ["https://z.com/9"]),
  ]);
  const dna = { entity: "Clínica", problem: "atrair pacientes", semanticState: "conclusive" as const };
  const nomes: Record<string, string> = { pub: "como atrair pacientes para clínica", duas: "receita de bolo", sites: "marketing odontológico", dna: "bolo de cenoura", fora: "torta de limão" };
  const linha = (keywordId: string, volume: number | null, isPublished = false): ArticleFormationKeyword => ({ keywordId, keyword: nomes[keywordId], intent: "Informativo", volume, kgr: null, isPublished, ...dna });
  const proposta = proposePublishedPrimarySwap({
    published: linha("pub", null, true), post: "free", identity: identidade, serp: indice,
    candidates: ["duas", "sites", "dna", "fora"].map(id => ({ ...linha(id, 5000), volumeValidated: true })),
  });
  assert.equal(proposta.state, "no_candidate");
  assert.equal(proposta.substitute, null);
  assert.deepEqual(proposta.rejected.map(item => [item.keywordId, item.missing]), [["duas", "serp_support"], ["sites", "serp"], ["dna", "serp"], ["fora", "serp_unknown"]]);
  // Para a lista de reforço (D2.3), os sites em comum continuam Provável; o DNA só vale sem SERP.
  assert.equal(serpSuggestionMatch(linha("pub", null, true), linha("sites", 5000), indice)?.basis, "domains");
  assert.equal(serpSuggestionMatch(linha("pub", null, true), linha("dna", 5000), indice), null);
  assert.equal(serpSuggestionMatch(linha("pub", null, true), linha("fora", 5000), indice)?.basis, "dna");
});

test("D2.1 · par real da AdalbaPro: 'marketing para clinica' (4 sites, 0 página) não assume 'como atrair pacientes sem redes sociais'", () => {
  const lentes = (keywordId: string, porLente: Record<string, string[]>): KeywordSerpFootprint => ({ keywordId, keyword: keywordId, lenses: Object.entries(porLente).map(([lens, urls]) => ({ lens: lens as "mobile-ios", urls, domains: null, collectedAt: null })) });
  const semRedes = [
    "https://www.youtube.com/watch?v=ORCb_r_FKbk",
    "https://telemedicinamorsch.com.br/blog/como-atrair-pacientes-para-clinica",
    "https://www.reddit.com/r/PsicologiaBR/comments/1kyjt30/dificuldade_em_captar_pacientes_pelo_instagram/",
    "https://iclinic.com.br/blog/erros-nas-redes-sociais/",
    "https://saudeservice.blog/estrategias-praticas-para-atrair-mais-pacientes-pelas-redes-sociais/",
    "https://sitedeclinica.com.br/blog/8-maneiras-para-atrair-e-conquistar-novos-pacientes/",
    "https://mambowifi.com/redes-sociais-saude-atrair-paciente/",
    "https://pro.doctoralia.com.br/blog/especialistas/como-atrair-pacientes-pelo-instagram",
  ];
  const semRedesMac = [
    "https://hotmart.com/pt-br/marketplace/produtos/como-captar-paciente-fora-das-redes-sociais/X103484022R",
    "https://www.sympla.com.br/evento/como-captar-pacientes-sem-depender-do-instagram/3471191",
    "https://www.instagram.com/reel/DYeq-HTSpCn/",
    "https://www.reddit.com/r/PsicologiaBR/comments/1fkn6js/marketing_para_atrair_pacientes/",
    "https://feegowclinic.com.br/blog/como-atrair-pacientes-particulares",
    "https://panoramaestrategico.com.br/blog/captar-pacientes-pela-internet/",
    "https://www.instagram.com/reel/CT9QjpgLYJr/",
    "https://www.futuremarketing.com.br/como-atrair-pacientes",
  ];
  const marketing = [
    "https://telemedicinamorsch.com.br/blog/marketing-para-clinicas-medicas",
    "https://www.futuremarketing.com.br/",
    "https://pro.doctoralia.com.br/blog/clinicas/marketing-360-para-clinicas",
    "https://iclinic.com.br/blog/estrategias-de-marketing-para-clinicas/",
    "https://educacaomedica.afya.com.br/blog/marketing-de-experiencia",
    "https://www.rdstation.com/blog/marketing/marketing-para-area-da-saude/",
    "https://clinicanasnuvens.com.br/blog/marketing-para-clinicas-multidisciplinares/",
    "https://marketmed.com.br/",
    "https://www.simdoctor.com.br/marketing-medico",
  ];
  const indice = buildSerpSubjectIndex([
    lentes("pub", { "mobile-ios": semRedes, "mobile-android": semRedes, "desktop-macos": semRedesMac }),
    lentes("mkt", { "mobile-ios": marketing, "mobile-android": marketing, "desktop-macos": marketing }),
  ]);
  const pub: ArticleFormationKeyword = { keywordId: "pub", keyword: "como atrair pacientes sem redes sociais", intent: "Informativo", volume: null, kgr: null, entity: null, problem: null, isPublished: true };
  const mkt: ArticleFormationKeyword = { keywordId: "mkt", keyword: "marketing para clinica", intent: "Comercial", volume: 140, kgr: null, entity: null, problem: null, isPublished: false };
  const medida = indice.overlap("pub", "mkt");
  assert.equal(medida.sharedPageCount, 0);
  assert.ok((medida.sharedDistinctiveDomainCount ?? 0) >= 3, "4 sites em comum");
  const proposta = proposePublishedPrimarySwap({ published: pub, post: "free", identity: identidade, serp: indice, candidates: [{ ...mkt, volumeValidated: true }] });
  assert.equal(proposta.state, "no_candidate");
  assert.deepEqual(proposta.rejected.map(item => [item.keyword, item.missing]), [["marketing para clinica", "serp"]]);
  // Como reforço, continua sugerida como Provável (sites em comum), desmarcada.
  assert.equal(serpSuggestionMatch(pub, mkt, indice)?.basis, "domains");
});

test("D2.3 · sobras: agrupadas por tema, nome da de maior volume, ordem pelo volume somado, até 6, sem volume no fim", () => {
  const extras = Array.from({ length: 3 }, (_, indice) => ({ ...footprintsReais().find(item => item.keywordId === "kw-11")!, keywordId: `clone-${indice}`, keyword: `como atrair mais pacientes ${indice}` }));
  const indice = buildSerpSubjectIndex([...footprintsReais(), ...extras]);
  const keywords = new Map([
    ...mapaDe(["kw-09", "kw-10", "kw-11", "kw-12", "kw-13", "kw-15", "kw-16", "kw-17", "kw-20", "kw-07"], { "kw-07": { isPublished: false, volume: null } }),
    ...extras.map(item => [item.keywordId, { ...kw("kw-11"), keywordId: item.keywordId, keyword: item.keyword }] as const),
  ]);
  const oportunidades = groupLeftoverOpportunities({
    silos: [{ siloRef: "territory:a", siloLabel: "Captação", leftoverKeywordIds: [...keywords.keys()] }],
    keywords, serp: indice, reservedKeywordIds: new Set(["kw-16"]),
  });
  assert.equal(oportunidades.reservedForAnchors, 1, "a Forte já marcada para um publicado fica lá (D1)");
  assert.deepEqual(oportunidades.withoutVolume.map(item => item.keywordId), ["kw-07"], "sem volume, recolhida no fim");
  const somas = oportunidades.groups.map(group => group.totalVolume);
  assert.deepEqual(somas, [...somas].sort((left, right) => right - left), "ordem pelo volume somado");
  assert.ok(oportunidades.groups.every(group => group.members.length <= 6), "teto de 6");
  for (const group of oportunidades.groups) {
    assert.equal(group.name, group.members[0].keyword);
    assert.ok(group.members.every(member => member.volume <= group.members[0].volume), "a líder é a de maior volume");
  }
  const atrair = oportunidades.groups.find(group => group.members.some(member => member.keywordId === "kw-09"))!;
  assert.ok(atrair.members.length >= 4, "o Google junta a família de 'como atrair pacientes'");
  assert.equal(atrair.basis, "serp");
  // "marketing para clinica" tem palavras de outras, mas a SERP a separa.
  const clinica = oportunidades.groups.find(group => group.members.some(member => member.keywordId === "kw-20"))!;
  assert.ok(!clinica.members.some(member => member.keywordId === "kw-09"));
  assert.equal(CREATE_ARTICLE_FROM_GROUP_ACTION, "Criar artigo novo com este grupo");
  const semSobras = groupLeftoverOpportunities({ silos: [], keywords, serp: indice });
  assert.equal(semSobras.totalLeftovers, 0);
});

test("D2.3 · aplicar as marcadas e criar artigo: um plano pelo mesmo writer, teto de 6, publicada protegida", () => {
  const universo = {
    siloRef: "territory:a", siloLabel: "Captação", siloSlug: null,
    keywordIds: ["p", "a", "b", "c", "d", "e", "f", "g"],
    publishedArticles: [], ungroupedKeywordIds: ["a", "b", "c", "d", "e", "f", "g"], singletonAudits: [], relations: [], matchedToPublished: [], conflicts: [],
    candidates: [{ candidateRef: "article-candidate:territory:a:p", siloRef: "territory:a", principalKeywordId: "p", keywords: [{ keywordId: "p", role: "principal" }], overflowKeywordIds: [], suggestedSlug: null, origin: "logic", stale: false, scores: { coherence: { value: 1, reasons: [] }, intent: { value: 1, reasons: [] }, centrality: { value: 1, reasons: [] } }, cannibalizationRisk: "baixa", conflicts: [], reason: "" }],
  } as unknown as Parameters<typeof planAddKeywordsToCandidate>[0]["universe"];
  const itens = ["p", "a", "b", "c", "d", "e", "f", "g"].map((keywordId, indice) => ({ keywordId, workflowItemId: `w-${keywordId}`, lockVersion: indice }));
  const base = { universe: universo, keywords: itens, mintUuid: "22222222-2222-4222-8222-222222222222", decidedAt: "2026-09-27T12:00:00Z" };
  const plano = planAddKeywordsToCandidate({ ...base, keywordIds: ["a", "b"], targetCandidateRef: "article-candidate:territory:a:p", publishedKeywordIds: new Set(["p"]) });
  assert.deepEqual(plano.refusals, []);
  assert.deepEqual(plano.patches.map(patch => [patch.keywordId, patch.assignment.articleFormationDecision.role]), [["p", "principal"], ["a", "secundaria"], ["b", "secundaria"]]);
  assert.ok(plano.patches.every(patch => patch.assignment.articleFormationRef === "article-formation:22222222-2222-4222-8222-222222222222" && patch.assignment.articleFormationDecision.source === "human"));
  assert.equal(planAddKeywordsToCandidate({ ...base, keywordIds: ["a", "b", "c", "d", "e", "f"], targetCandidateRef: "article-candidate:territory:a:p" }).refusals[0]?.code, "MERGE_EXCEEDS_CEILING");
  assert.equal(planAddKeywordsToCandidate({ ...base, keywordIds: ["x"], targetCandidateRef: "article-candidate:territory:a:p" }).refusals[0]?.code, "KEYWORD_NOT_IN_UNIVERSE");
  assert.equal(planAddKeywordsToCandidate({ ...base, keywordIds: ["a"], targetCandidateRef: "article-candidate:territory:a:p", publishedKeywordIds: new Set(["a"]) }).refusals[0]?.code, "PUBLISHED_KEYWORD_IS_PROTECTED");

  const novo = planNewArticleFromKeywords({ universe: universo, keywords: itens, keywordIds: ["b", "a"], principalKeywordId: "a", newFormationRef: "article-formation:33333333-3333-4333-8333-333333333333", decidedAt: "2026-09-27T12:00:00Z" });
  assert.deepEqual(novo.patches.map(patch => [patch.keywordId, patch.assignment.articleFormationDecision.role]), [["a", "principal"], ["b", "secundaria"]]);
  assert.equal(planNewArticleFromKeywords({ universe: universo, keywords: itens, keywordIds: ["a", "b", "c", "d", "e", "f", "g"], principalKeywordId: "a", newFormationRef: "article-formation:33333333-3333-4333-8333-333333333333", decidedAt: "2026-09-27T12:00:00Z" }).refusals[0]?.code, "MERGE_EXCEEDS_CEILING");
  assert.equal(planNewArticleFromKeywords({ universe: universo, keywords: itens, keywordIds: ["p", "a"], principalKeywordId: "a", publishedKeywordIds: new Set(["p"]), newFormationRef: "article-formation:33333333-3333-4333-8333-333333333333", decidedAt: "2026-09-27T12:00:00Z" }).refusals[0]?.code, "PUBLISHED_KEYWORD_IS_PROTECTED");
  assert.equal(chamadasDeRede, 0);
});

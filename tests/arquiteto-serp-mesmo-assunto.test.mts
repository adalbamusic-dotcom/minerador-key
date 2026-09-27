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

test("convergência: contradição de DNA continua barrando mesmo com 7 páginas em comum", () => {
  const medida = measureAnchorConvergence(kw("kw-01"), kw("kw-09"), { siloTokens: sem, serp: INDICE });
  assert.equal(medida.eligible, false);
  assert.equal(medida.basis, "dna_contradiction");
  assert.match(medida.reasons[0], /7 páginas em comum.*Mas o DNA separa as duas: intenções principais diferentes/);
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

test("diagnóstico: par forte barrado pelo DNA não é 'sem par' — é intenção diferente, decisão humana", () => {
  const diagnosticos = diagnoseSerpSubjectAnchors({
    silos: [{ siloRef: "territory:a", siloLabel: "Captação", plan: { anchors: [{ kind: "published", principalKeywordId: "kw-01", keywordIds: ["kw-01"] }], awaitingSubjectKeywordIds: [], leftoverKeywordIds: ["kw-09", "kw-10"] } }],
    keywords: mapaDe(["kw-01", "kw-03", "kw-09", "kw-10"]), serp: INDICE,
    published: new Map([["kw-01", publicado("locked", "como-atrair-pacientes-para-clinica")], ["kw-03", publicado("locked", "como-atrair-clientes-para-consultorio")]]),
    volumeValidated: new Set(["kw-09", "kw-10"]),
  });
  const alvo = diagnosticos[0];
  assert.equal(alvo.state, "pair_blocked_by_dna");
  assert.deepEqual(alvo.blockedByDna.map(item => item.keywordId), ["kw-09", "kw-10"]);
  assert.match(alvo.headline, /^2 keywords tratam do mesmo assunto no Google que o artigo "como atrair pacientes para clínica" \("como atrair pacientes", 7 páginas em comum\), mas o DNA separa: intenções principais diferentes\./);
  assert.equal(alvo.actions[0].kind, "review_dna");
  // Outra página publicada divide a SERP: sinal de canibalização, nunca fusão.
  assert.deepEqual(alvo.publishedOverlaps.map(item => item.keywordId), ["kw-03"]);
  assert.ok(alvo.details.some(linha => /possível canibalização/.test(linha)));
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

test("Posto Livre sem substituta vem no título, com Buscar reforço; SERP de apoio não é chamada de 'divide'", () => {
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
  assert.equal(diagnostico.state, "reinforced");
  assert.equal(diagnostico.members.find(item => item.keywordId === "viz")?.basis, "serp_and_words");
  assert.match(diagnostico.headline, /^Reforçado com 1 keyword — 1 na vizinhança do Google \(2 páginas, confirmada pelas palavras\)\. Cabem mais 4\. Posto Livre, mas nenhuma keyword do lote serve de substituta/);
  assert.doesNotMatch(diagnostico.headline, /divide a SERP/);
  assert.ok(diagnostico.actions.some(action => action.kind === "search_reinforcement"), "a Livre sem substituta pede Buscar reforço");
  const recusa = diagnostico.swap?.rejected.find(item => item.keywordId === "viz");
  assert.equal(recusa?.missing, "serp_support");
  assert.match(recusa!.reason, /^Só 2 páginas em comum no top 10 \(vizinhança do Google\): serve para reforçar, mas assumir a principal exige 3 ou mais\.$/);
  assert.match(diagnostico.swap!.note, /1 só na vizinhança do Google: 2 páginas, e a troca exige 3\+/);
  assert.doesNotMatch(diagnostico.swap!.note, /não divide/);
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

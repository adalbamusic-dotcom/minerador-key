import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { SerpOrganicDigestSchema, buildSerpOrganicDigest, pruneSerpBody, trimSerpBodyToDepth, type SerpOrganicDigest } from "../lib/editorial/serp-cache.ts";
import {
  deriveSerpSemanticEvidence,
  deriveSerpSemanticEvidenceAcrossLenses,
  readSerpLensFromDigest,
  serpBodyFromDigest,
  serpLensEvidencePresentation,
  type SerpLensDerivationInput,
  type SerpSemanticEvidence,
} from "../lib/minerador/serp-semantic-evidence.ts";
import {
  buildKeywordSemanticQualification,
  parseKeywordSemanticQualification,
  predatesCurrentSemanticQualification,
  qualificationLensSummary,
  repeatsCurrentSemanticQualification,
  type KeywordSemanticQualification,
} from "../lib/minerador/keyword-semantic-qualification.ts";
import {
  SERP_EVIDENCE_INVALIDATION_MAX_BYTES,
  SERP_EVIDENCE_RECORD_MAX_BYTES,
  applySerpEvidenceRecord,
  invalidateSerpEvidence,
  readSerpEvidenceRecord,
  serpEvidenceMixedLabels,
  serpEvidenceRecordFromQualification,
} from "../lib/minerador/serp-evidence-record.ts";
import { readCanonicalKeywordDna } from "../lib/minerador/logical-read-model.ts";
import { buildLogicalOutputContract } from "../lib/minerador/logical-processor.ts";
import { APPROVAL_SIGNATURE_SCHEME, applyApproval, approvedPackageDiverged, approvedPackageSignature } from "../lib/minerador/approved-package.ts";
import { buildMineradorArquitetoHandoffPlan } from "../lib/arquiteto/minerador-handoff.ts";

/**
 * INTENÇÃO E FUNIL PELAS QUATRO LENTES — adendo `docs/03-minerador/propostas/
 * adendo-derivacao-v4-quatro-lentes-2026-09-23.md`, §3 e §4.
 *
 * As duas SERPs reais (`tests/fixtures/`) são desktop-windows. NÃO há fixture
 * real de desktop-macos, mobile-android nem mobile-ios: toda lente extra aqui é
 * SINTÉTICA e diz isso no nome — ou é o digest do mesmo corpo real, ou uma SERP
 * montada à mão.
 *
 * REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

type Item = Record<string, unknown>;

const FACIAL = JSON.parse(readFileSync(new URL("./fixtures/dataforseo-google-skincare-facial-advanced-desktop-windows.json", import.meta.url), "utf8"));
const NOTURNO_CRU = JSON.parse(readFileSync(new URL("./fixtures/dataforseo-google-skin-care-noturno.json", import.meta.url), "utf8"));
const NOTURNO = { tasks: [{ id: NOTURNO_CRU.id, result: NOTURNO_CRU.result }] };

const KW = "serum noturno";
const T0 = "2026-09-23T09:00:00.000Z";

/**
 * SERP SINTÉTICA: os blocos no topo (como PAA e Shopping aparecem de verdade),
 * depois os orgânicos na ordem dada. Bloco depois do 10º orgânico fica fora do
 * top 10 — e fora do digest, como numa coleta de profundidade 10.
 */
function serp(organic: Item[], blocks: Item[] = [], keyword = KW) {
  return { tasks: [{ id: "task", result: [{ keyword, items: [...blocks, ...organic.map((item, index) => ({ type: "organic", rank_group: index + 1, ...item }))] }] }] };
}

/** Orgânicos SINTÉTICOS com leitura conhecida: título decide intenção e funil. */
const informativo = (n: number, host = "guia") => ({ title: `Como usar sérum ${n}`, url: `https://${host}${n}.com.br/artigo-${n}`, domain: `${host}${n}.com.br` });
const comparativo = (n: number, host = "ranking") => ({ title: `Melhor sérum ${n}`, url: `https://${host}${n}.com.br/lista-${n}`, domain: `${host}${n}.com.br` });
const compra = (n: number, host = "loja") => ({ title: `Comprar sérum ${n}`, url: `https://${host}${n}.com.br/oferta-${n}`, domain: `${host}${n}.com.br` });
const PAA = { type: "people_also_ask", items: [] };

/** Dominância 0,5 na intenção e no funil: 5 informativos, 3 comparativos, 2 de compra. */
const meioAMeio = () => [1, 2, 3, 4, 5].map(n => informativo(n)).concat([1, 2, 3].map(n => comparativo(n)), [1, 2].map(n => compra(n)));

const fonte = (lens: string, over: Partial<{ collectedAt: string; providerRequestId: string | null; collectedBy: string | null }> = {}) => ({
  lens, collectedAt: T0, providerRequestId: `task-${lens}`, collectedBy: "minerador", ...over,
});

function comDigest(lens: string, body: unknown, over: Parameters<typeof fonte>[1] = {}): SerpLensDerivationInput {
  const digest = buildSerpOrganicDigest(body);
  assert.ok(digest, "o corpo SINTÉTICO precisa virar digest");
  return { ...fonte(lens, over), digest };
}

function lentes(canonical: unknown, extras: SerpLensDerivationInput[] = [], keyword = KW, canonicalOver: Parameters<typeof fonte>[1] = {}): SerpSemanticEvidence {
  const evidence = deriveSerpSemanticEvidenceAcrossLenses({
    keyword, locationCode: 2076, languageCode: "pt", operationRequestId: "33333333-3333-4333-8333-333333333333",
    canonical: { ...fonte("desktop-windows", canonicalOver), body: canonical },
    extras,
  });
  assert.ok(evidence, "a canônica precisa produzir evidência");
  return evidence;
}

function umaLente(body: unknown, keyword = KW): SerpSemanticEvidence {
  const evidence = deriveSerpSemanticEvidence({ body, keyword, locationCode: 2076, languageCode: "pt", device: "desktop", providerRequestId: "task-desktop-windows", operationRequestId: "33333333-3333-4333-8333-333333333333", collectedAt: T0 });
  assert.ok(evidence);
  return evidence;
}

const semMascara = (evidence: SerpSemanticEvidence) => evidence.sample.map(item => {
  const { lenses: _mascara, ...resto } = item;
  return resto;
});

/* ------------------------------- o digest ---------------------------------- */

test("digest · cru e podado dão o MESMO digest, e ele passa no contrato do cache", () => {
  for (const corpo of [FACIAL, NOTURNO]) {
    const cru = buildSerpOrganicDigest(corpo);
    assert.ok(cru);
    assert.deepEqual(buildSerpOrganicDigest(pruneSerpBody(corpo)), cru);
    assert.ok(SerpOrganicDigestSchema.safeParse(cru).success);
    assert.ok(cru.organic.length <= 10, "top 10");
  }
});

test("digest · a leitura pelo digest é IDÊNTICA à do corpo recortado no top 10 — nenhum campo lido se perde", () => {
  for (const [corpo, keyword] of [[FACIAL, "skincare facial"], [NOTURNO, "skin care noturno"]] as const) {
    const digest = buildSerpOrganicDigest(corpo)!;
    assert.deepEqual(umaLente(serpBodyFromDigest(digest), keyword), umaLente(trimSerpBodyToDepth(corpo, 10), keyword));
  }
});

test("digest · SINTÉTICO: cada campo que o classificador lê sobrevive ao digest e ao jsonb", () => {
  const corpo = serp([
    // FAQ em lista, featured snippet, data: sinais estruturais.
    { title: "Página", description: "linha", url: "https://a.com.br/x", faq: [{ question: "q" }], is_featured_snippet: true, timestamp: "2026-01-01 00:00:00 +00:00" },
    // Nota sem valor numérico em página .html: é produto pela presença da nota.
    { title: "Página", description: "linha", url: "https://b.com.br/produto.html", rating: { rating_type: "Max5" } },
    // Preço só exibido.
    { title: "Página", description: "linha", url: "https://c.com.br/y", price: { displayed_price: "R$ 49,90" } },
    // Sem descrição: o snippet é lido.
    { title: "Sérum", snippet: "como usar à noite", url: "https://d.com.br/z" },
    // pre/extended snippet e breadcrumb humano; com descrição, o snippet não é lido.
    { title: "Sérum", description: "linha", snippet: "comprar agora", pre_snippet: "comprar hoje", extended_snippet: "o melhor", breadcrumb: "https://e.com.br › Home › Rotina de Beleza", url: "https://e.com.br/w" },
    // R5: varejista mudo, casado pelo nome do site.
    { title: "Página", description: "linha", url: "https://www.drogariasaopaulo.com.br/q", website_name: "Farmácias São Paulo" },
    // R4: post em rede social.
    { title: "3 passos para a pele", url: "https://www.instagram.com/reel/abc/" },
    // Sem URL legível e rank ausente: posição pelo índice.
    { title: "Como usar", description: "linha", rank_group: undefined },
    // R5 recusada pela data: o mesmo varejista mudo, datado, não vira Transacional.
    { title: "Página", description: "linha", url: "https://www.drogariasaopaulo.com.br/r", website_name: "Farmácias São Paulo", date: "2026-01-02" },
    { title: "Página", description: "linha", url: "https://www.drogariasaopaulo.com.br/s", website_name: "Farmácias São Paulo", timestamp: "2026-01-03 00:00:00 +00:00" },
  ], [{ type: "popular_products", items: [{ type: "popular_products_element", seller: "Farmácias São Paulo" }, { seller: "Farmácias São Paulo" }] }, PAA, { type: "short_videos" }]);
  const digest = buildSerpOrganicDigest(corpo)!;
  const relido = SerpOrganicDigestSchema.parse(JSON.parse(JSON.stringify(digest)));
  assert.deepEqual(relido, digest);
  assert.deepEqual(umaLente(serpBodyFromDigest(relido)), umaLente(trimSerpBodyToDepth(corpo, 10)));
  // O digest guarda só o que decide.
  assert.equal(digest.organic[0].faq, true);
  assert.deepEqual(digest.organic[1].rating, {});
  assert.deepEqual(digest.organic[2].price, { displayed_price: "R$ 49,90" });
  assert.equal(digest.organic[3].snippet, "como usar à noite");
  assert.equal("snippet" in digest.organic[4], false, "com descrição, o snippet não entra: não é lido");
  assert.equal(umaLente(serpBodyFromDigest(relido)).sample[8].intent, "indefinido", "a data segue no digest e segura a R5");
  assert.deepEqual(digest.sellers, ["Farmácias São Paulo"]);
});

test("digest · o tamanho por lente fica na faixa medida (~6 KB no pior fixture real)", () => {
  const bytes = (valor: unknown) => Buffer.byteLength(JSON.stringify(valor));
  // MEDIDO: skincare facial 5.720 B (25 vendedores), skin care noturno 2.754 B.
  assert.ok(bytes(buildSerpOrganicDigest(FACIAL)) < 6_500, `digest com ${bytes(buildSerpOrganicDigest(FACIAL))} B`);
  assert.ok(bytes(buildSerpOrganicDigest(FACIAL)) < bytes(trimSerpBodyToDepth(pruneSerpBody(FACIAL), 10)) / 4, "uma fração do corpo de 10");
});

/* ---------------------------- a leitura em 4 lentes -------------------------- */

test("4 lentes · só com a canônica, a leitura é a de uma lente", () => {
  for (const [corpo, keyword] of [[FACIAL, "skincare facial"], [NOTURNO, "skin care noturno"]] as const) {
    const quatro = lentes(corpo, [], keyword);
    const uma = umaLente(corpo, keyword);
    assert.deepEqual(quatro.intent, uma.intent);
    assert.deepEqual(quatro.funnel, uma.funnel);
    assert.equal(quatro.observedResults, uma.observedResults);
    assert.deepEqual(quatro.serpFeatures, uma.serpFeatures);
    assert.deepEqual(semMascara(quatro), uma.sample);
    assert.ok(quatro.sample.every(item => item.lenses === 1), "toda URL só na canônica");
    assert.deepEqual(quatro.lensEvidence?.lensesMissing, [
      { lens: "desktop-macos", reason: "not_collected" },
      { lens: "mobile-android", reason: "not_collected" },
      { lens: "mobile-ios", reason: "not_collected" },
    ]);
    assert.equal(quatro.device, "desktop", "a consulta continua a da lente canônica");
    assert.deepEqual(quatro.lenses, ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"]);
  }
});

test("4 lentes · a mesma URL conta UMA vez, com a máscara das lentes; a nova de uma lente entra com a dela", () => {
  // SINTÉTICO: as extras são o digest do mesmo corpo real, e a ios traz uma página a mais.
  const ios = structuredClone(FACIAL);
  ios.tasks[0].result[0].items.unshift({ type: "organic", rank_group: 1, domain: "so-no-ios.com.br", url: "https://so-no-ios.com.br/rotina", title: "Como montar a rotina" });
  const evidence = lentes(FACIAL, [comDigest("desktop-macos", FACIAL), comDigest("mobile-android", FACIAL), comDigest("mobile-ios", ios)], "skincare facial");
  const uma = umaLente(FACIAL, "skincare facial");
  assert.equal(uma.observedResults, 18);
  assert.equal(evidence.observedResults, 19, "uma URL a mais, e não quatro vezes as mesmas");
  const comMascara = (mascara: number) => evidence.sample.filter(item => item.lenses === mascara).length;
  // Na iOS a página nova empurra o 10º resultado para fora do top 10 dela.
  assert.equal(comMascara(15), 9, "o top 10 comum às quatro");
  assert.equal(comMascara(7), 1, "o 10º, fora do top 10 da iOS");
  assert.equal(comMascara(8), 1, "a página só da iOS");
  assert.equal(comMascara(1), 8, "o 11º ao 20º distinto, só a canônica lê 20");
  assert.equal(evidence.sample.find(item => item.urlKey === "so-no-ios.com.br/rotina")?.lenses, 8);
});

test("4 lentes · variante de query entre lentes também conta uma vez (R8 na união)", () => {
  const desktop = serp(meioAMeio());
  const mobile = serp(meioAMeio().map(item => ({ ...item, url: `${item.url}?srsltid=abc` })));
  const evidence = lentes(desktop, [comDigest("mobile-android", mobile)]);
  assert.equal(evidence.observedResults, 10);
  assert.ok(evidence.sample.every(item => item.lenses === 5));
});

test("4 lentes · bloco em UMA lente não fecha eixo; em duas, reforça; com uma lente lida, vale como sempre", () => {
  // SINTÉTICO: dominância 0,5 — só o reforço do PAA (peso 2) fecharia o eixo.
  const semPaa = serp(meioAMeio());
  const comPaa = serp(meioAMeio(), [PAA]);
  const soNoIos = lentes(semPaa, [comDigest("desktop-macos", semPaa), comDigest("mobile-ios", comPaa)]);
  assert.equal(soNoIos.intent.strength, "mixed");
  assert.equal(soNoIos.intent.value, null);
  assert.deepEqual(soNoIos.intent.structuralSignals.find(item => item.signal === "people_also_ask"), { signal: "people_also_ask", label: "Perguntas relacionadas", weight: 0 }, "registrado, com peso 0");
  assert.deepEqual(soNoIos.lensEvidence?.blocks, [{ type: "people_also_ask", lenses: 8 }], "informação de aparelho: PAA só no mobile iOS");
  const emDuas = lentes(semPaa, [comDigest("desktop-macos", comPaa), comDigest("mobile-ios", comPaa)]);
  assert.equal(emDuas.intent.strength, "conclusive");
  assert.equal(emDuas.intent.value, "Informativa");
  assert.equal(emDuas.funnel.value, "TOFU");
  // Uma lente lida: o bloco dela reforça como na derivação de uma lente.
  assert.equal(lentes(comPaa).intent.strength, "conclusive");
  assert.deepEqual(lentes(comPaa).intent, umaLente(comPaa).intent);
});

test("4 lentes · empate continua misto, mesmo com reforço nas quatro", () => {
  // SINTÉTICO: a canônica sozinha conclui (6 × 4); o mobile traz duas lojas novas e empata 6 × 6.
  const desktop = serp([1, 2, 3, 4, 5, 6].map(n => informativo(n)).concat([1, 2, 3, 4].map(n => compra(n))), [PAA]);
  const mobile = serp([1, 2, 3, 4].map(n => informativo(n)).concat([1, 2, 3, 4, 5, 6].map(n => compra(n))), [PAA]);
  assert.equal(umaLente(desktop).intent.strength, "conclusive");
  const evidence = lentes(desktop, [comDigest("desktop-macos", desktop), comDigest("mobile-android", mobile), comDigest("mobile-ios", mobile)]);
  assert.deepEqual(evidence.intent.distribution, [{ label: "Informativa", count: 6 }, { label: "Transacional", count: 6 }]);
  assert.equal(evidence.intent.strength, "mixed");
  assert.equal(evidence.intent.value, null);
});

test("4 lentes · concordância é REGISTRO, não reforço: 4 de 4 concordando não fecha eixo misto", () => {
  const corpo = serp(meioAMeio());
  const evidence = lentes(corpo, [comDigest("desktop-macos", corpo), comDigest("mobile-android", corpo), comDigest("mobile-ios", corpo)]);
  assert.deepEqual(evidence.lensEvidence?.agreement.intent, { label: "Informativa", agreeing: 4, of: 4 });
  assert.deepEqual(evidence.lensEvidence?.agreement.funnel, { label: "TOFU", agreeing: 4, of: 4 });
  assert.equal(evidence.intent.strength, "mixed", "as lentes dividem o mesmo top 10: não são amostras independentes");
  assert.deepEqual(evidence.intent, umaLente(corpo).intent);
});

test("4 lentes · o rótulo da URL é a maioria das lentes que a leram; empate segue a matriz; o conflito é contado", () => {
  const url = "https://disputada.com.br/serum";
  const outros = [1, 2, 3, 4].map(n => informativo(n));
  const comoCompra = serp([{ title: "Comprar sérum noturno", url, domain: "disputada.com.br" }, ...outros]);
  const comoGuia = serp([{ title: "Como usar sérum noturno", url, domain: "disputada.com.br" }, ...outros]);
  const maioria = lentes(comoCompra, [comDigest("desktop-macos", comoGuia), comDigest("mobile-android", comoGuia)]);
  const disputada = maioria.sample.find(item => item.urlKey === "disputada.com.br/serum")!;
  assert.equal(disputada.intent, "Informativa");
  assert.equal(disputada.lenses, 7);
  assert.equal(maioria.lensEvidence?.labelConflicts.intent, 1);
  assert.deepEqual(disputada.score, { intent: { Informativa: 2 }, funnel: { TOFU: 2 } }, "o item mostrado é o da lente que leu o rótulo vencedor");
  // Uma contra uma: vale a lente que vem antes na matriz (a canônica).
  const empate = lentes(comoCompra, [comDigest("mobile-ios", comoGuia)]);
  assert.equal(empate.sample.find(item => item.urlKey === "disputada.com.br/serum")!.intent, "Transacional");
});

test("4 lentes · deviceSplit registra desktop × mobile, e não cria força", () => {
  // SINTÉTICO: desktop lê guias; mobile lê lojas — páginas diferentes.
  const desktop = serp([1, 2, 3, 4, 5, 6, 7].map(n => informativo(n)).concat([1, 2, 3].map(n => compra(n))));
  const mobile = serp([1, 2, 3, 4, 5, 6, 7].map(n => compra(n, "movel")).concat([1, 2, 3].map(n => informativo(n, "blogmovel"))));
  const evidence = lentes(desktop, [comDigest("desktop-macos", desktop), comDigest("mobile-android", mobile), comDigest("mobile-ios", mobile)]);
  assert.deepEqual(evidence.lensEvidence?.deviceSplit.intent, { desktop: "Informativa", mobile: "Transacional" });
  assert.deepEqual(evidence.lensEvidence?.deviceSplit.funnel, { desktop: "TOFU", mobile: "BOFU" });
  assert.equal(evidence.intent.strength, "mixed", "a união empata 10 × 10: a divergência é sinal, não conclusão");
  assert.equal(evidence.lensEvidence?.agreement.intent.label, null);
  // Sem mobile lido, não há divergência a registrar.
  assert.equal(lentes(desktop, [comDigest("desktop-macos", desktop)]).lensEvidence?.deviceSplit.intent, null);
  // Concordância parcial: o agregado lidera com Informativa, e só a canônica lidera igual.
  const iosLojas = serp([1, 2, 3, 4, 5, 6].map(n => compra(n, "movel")).concat([1, 2, 3, 4].map(n => informativo(n, "blogmovel"))));
  const parcial = lentes(desktop, [comDigest("mobile-ios", iosLojas)]);
  assert.deepEqual(parcial.lensEvidence?.agreement.intent, { label: "Informativa", agreeing: 1, of: 2 });
});

test("4 lentes · lentes faltantes, lente fora da matriz e ordem de chegada não mudam o registro", () => {
  const corpo = serp(meioAMeio());
  const outraConsulta = serp(meioAMeio(), [], "outra keyword");
  const embaralhadas: SerpLensDerivationInput[] = [
    comDigest("mobile-ios", corpo),
    { lens: "desktop-macos", missing: "missing_digest" },
    comDigest("mobile-android", outraConsulta),
    comDigest("tablet-linux", corpo),
    comDigest("mobile-ios", corpo, { providerRequestId: "repetida" }),
  ];
  const evidence = lentes(corpo, embaralhadas);
  assert.deepEqual(evidence.lensEvidence?.readings.map(item => item.lens), ["desktop-windows", "mobile-ios"]);
  assert.equal(evidence.lensEvidence?.readings[1].providerRequestId, "task-mobile-ios", "a primeira ocorrência da lente fica");
  assert.deepEqual(evidence.lensEvidence?.lensesMissing, [
    { lens: "desktop-macos", reason: "missing_digest" },
    { lens: "mobile-android", reason: "other_query" },
  ]);
  const ordenadas = lentes(corpo, [embaralhadas[2], embaralhadas[1], embaralhadas[0]]);
  assert.deepEqual(ordenadas, lentes(corpo, [embaralhadas[0], embaralhadas[1], embaralhadas[2]]));
  // Três extras lidas em ordem invertida: o registro sai na ordem da matriz.
  const invertidas = lentes(corpo, [comDigest("mobile-ios", corpo), comDigest("mobile-android", corpo), comDigest("desktop-macos", corpo)]);
  assert.deepEqual(invertidas.lensEvidence?.readings.map(item => item.lens), ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"]);
});

test("4 lentes · datas com mais de 7 dias entre lentes são marcadas, sem recoleta e sem mudar a leitura", () => {
  const corpo = serp(meioAMeio(), [PAA]);
  const mesmas = lentes(corpo, [comDigest("mobile-ios", corpo)]);
  const distantes = lentes(corpo, [comDigest("mobile-ios", corpo, { collectedAt: "2026-09-10T09:00:00.000Z" })]);
  assert.equal(mesmas.lensEvidence?.dates.divergent, false);
  assert.deepEqual(distantes.lensEvidence?.dates, { oldest: "2026-09-10T09:00:00.000Z", newest: T0, divergent: true });
  assert.deepEqual(distantes.intent, mesmas.intent);
  const seteDias = lentes(corpo, [comDigest("mobile-ios", corpo, { collectedAt: "2026-09-16T09:00:00.000Z" })]);
  assert.equal(seteDias.lensEvidence?.dates.divergent, false, "exatamente 7 dias ainda não marca");
});

test("4 lentes · a proveniência de cada lente fica na leitura, inclusive a coleta de outro módulo", () => {
  const corpo = serp(meioAMeio());
  const evidence = lentes(corpo, [comDigest("mobile-android", corpo, { collectedBy: "arquiteto", providerRequestId: "task-arq" })]);
  assert.deepEqual(evidence.lensEvidence?.readings.map(item => [item.lens, item.collectedBy, item.providerRequestId, item.collectedAt]), [
    ["desktop-windows", "minerador", "task-desktop-windows", T0],
    ["mobile-android", "arquiteto", "task-arq", T0],
  ]);
  assert.equal(evidence.collectedAt, T0);
  assert.equal(evidence.providerRequestId, "task-desktop-windows", "a proveniência da Qualificação continua a da canônica");
});

test("4 lentes · determinismo: coleta (corpo cru + digest em memória) e acerto (corpo podado + digest relido do jsonb) dão a MESMA evidência", () => {
  // SINTÉTICO: a lente mobile é o corpo real com a ordem do top 10 trocada.
  const mobile = structuredClone(FACIAL);
  mobile.tasks[0].result[0].items.reverse();
  const relido = (corpo: unknown) => SerpOrganicDigestSchema.parse(JSON.parse(JSON.stringify(buildSerpOrganicDigest(pruneSerpBody(corpo)))));
  const extrasNaColeta: SerpLensDerivationInput[] = [
    { ...fonte("desktop-macos"), digest: buildSerpOrganicDigest(FACIAL)! },
    { ...fonte("mobile-android"), digest: buildSerpOrganicDigest(mobile)! },
    { ...fonte("mobile-ios"), digest: buildSerpOrganicDigest(mobile)! },
  ];
  const extrasNoAcerto: SerpLensDerivationInput[] = [
    { ...fonte("desktop-macos"), digest: relido(FACIAL) },
    { ...fonte("mobile-android"), digest: relido(mobile) },
    { ...fonte("mobile-ios"), digest: relido(mobile) },
  ];
  const coleta = lentes(FACIAL, extrasNaColeta, "skincare facial");
  const acerto = lentes(trimSerpBodyToDepth(pruneSerpBody(FACIAL), 20), extrasNoAcerto, "skincare facial");
  assert.deepEqual(acerto, coleta);
  // E a leitura de uma lente pelo digest é a mesma nos dois caminhos.
  const leitura = (digest: SerpOrganicDigest) => readSerpLensFromDigest({ digest, keyword: "skincare facial", source: fonte("mobile-ios") });
  assert.deepEqual(leitura(relido(mobile)), leitura(buildSerpOrganicDigest(mobile)!));
});

test("4 lentes · SERP real: skincare facial com as extras SINTÉTICAS iguais à canônica mantém o estado", () => {
  const digest = buildSerpOrganicDigest(FACIAL)!;
  const evidence = lentes(FACIAL, ["desktop-macos", "mobile-android", "mobile-ios"].map(lens => ({ ...fonte(lens), digest })), "skincare facial");
  assert.equal(evidence.intent.strength, "conclusive");
  assert.equal(evidence.intent.value, "Informativa");
  assert.equal(evidence.funnel.value, "TOFU");
  assert.equal(evidence.observedResults, 18, "o top 10 das extras já está nos 20 da canônica");
  assert.deepEqual(evidence.lensEvidence?.lensesMissing, []);
});

/* ------------------------------- a Qualificação ------------------------------ */

async function qualificar(evidence: SerpSemanticEvidence, previous?: KeywordSemanticQualification | null) {
  return buildKeywordSemanticQualification({ brandId: "brand-a", keywordId: "kw-1", evidence, createdBy: "user-1", previous });
}

const quatroDoFacial = (over: Record<string, Parameters<typeof fonte>[1]> = {}, faltando: string[] = []) => {
  const digest = buildSerpOrganicDigest(FACIAL)!;
  return lentes(FACIAL, ["desktop-macos", "mobile-android", "mobile-ios"].map((lens): SerpLensDerivationInput => faltando.includes(lens)
    ? { lens, missing: "collection_failed" }
    : { ...fonte(lens, over[lens]), digest }), "skincare facial");
};

test("Qualificação · lensEvidence, query.lenses e máscaras gravados; o parser preserva tudo e a relida repete a vigente", async () => {
  const vigente = await qualificar(quatroDoFacial());
  assert.deepEqual(vigente.query.lenses, ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"]);
  assert.equal(vigente.query.device, "desktop");
  assert.equal(vigente.lensEvidence?.readings.length, 4);
  assert.ok(vigente.evidence.sample.every(item => typeof item.lenses === "number"));
  const relida = parseKeywordSemanticQualification(JSON.parse(JSON.stringify(vigente)));
  assert.deepEqual(relida, vigente);
  const acerto = await qualificar(quatroDoFacial(), relida);
  assert.equal(repeatsCurrentSemanticQualification(relida!, acerto), true, "mesmas quatro fontes: nenhuma versão nova");
});

test("Qualificação · a legada de uma lente continua válida e não ganha campo nenhum", async () => {
  const legada = await qualificar(umaLente(FACIAL, "skincare facial"));
  const relida = parseKeywordSemanticQualification(JSON.parse(JSON.stringify(legada)))!;
  assert.deepEqual(relida, legada);
  assert.equal("lensEvidence" in relida, false);
  assert.equal("lenses" in relida.query, false);
  assert.equal(qualificationLensSummary(relida), null);
});

test("Qualificação · lensEvidence malformado é descartado inteiro, nunca lido pela metade", async () => {
  const vigente = await qualificar(quatroDoFacial());
  const quebrada = JSON.parse(JSON.stringify(vigente));
  quebrada.lensEvidence.agreement = "4/4";
  assert.equal("lensEvidence" in parseKeywordSemanticQualification(quebrada)!, false);
  const outraVersao = JSON.parse(JSON.stringify(vigente));
  outraVersao.lensEvidence.version = "serp-lens-evidence-v9";
  assert.equal("lensEvidence" in parseKeywordSemanticQualification(outraVersao)!, false);
  const mascaraRuim = JSON.parse(JSON.stringify(vigente));
  mascaraRuim.evidence.sample[0].lenses = 99;
  assert.equal("lenses" in parseKeywordSemanticQualification(mascaraRuim)!.evidence.sample[0], false);
});

test("repeatsCurrent com 4 fontes: lente paga de novo, nova ou faltante é mudança real", async () => {
  const vigente = await qualificar(quatroDoFacial());
  const recolhida = await qualificar(quatroDoFacial({ "mobile-ios": { providerRequestId: "task-ios-2", collectedAt: "2026-09-24T09:00:00.000Z" } }), vigente);
  assert.equal(repeatsCurrentSemanticQualification(vigente, recolhida), false, "a mobile iOS foi paga de novo");
  const semIos = await qualificar(quatroDoFacial({}, ["mobile-ios"]), vigente);
  assert.equal(repeatsCurrentSemanticQualification(vigente, semIos), false, "uma lente deixou de estar");
  const legada = await qualificar(umaLente(FACIAL, "skincare facial"));
  assert.equal(repeatsCurrentSemanticQualification(legada, await qualificar(quatroDoFacial(), legada)), false, "da leitura de uma lente para as quatro");
  assert.equal(repeatsCurrentSemanticQualification(legada, await qualificar(umaLente(FACIAL, "skincare facial"), legada)), true, "a régua da legada não mudou");
});

test("predatesCurrent por lente: uma lente mais VELHA que a vigente segura a versão", async () => {
  const vigente = await qualificar(quatroDoFacial({ "mobile-ios": { collectedAt: "2026-09-24T09:00:00.000Z" } }));
  const maisVelha = await qualificar(quatroDoFacial({ "mobile-ios": { collectedAt: "2026-09-22T09:00:00.000Z" } }), vigente);
  const maisNova = await qualificar(quatroDoFacial({ "mobile-ios": { collectedAt: "2026-09-25T09:00:00.000Z" } }), vigente);
  assert.equal(predatesCurrentSemanticQualification(vigente, maisVelha), true);
  assert.equal(predatesCurrentSemanticQualification(vigente, maisNova), false);
  assert.equal(predatesCurrentSemanticQualification(vigente, vigente), false);
});

test("Qualificação · tamanho por versão MEDIDO: 4 lentes custam o bloco das lentes e as máscaras", async () => {
  const bytes = (valor: unknown) => Buffer.byteLength(JSON.stringify(valor));
  const uma = await qualificar(umaLente(FACIAL, "skincare facial"));
  const quatro = await qualificar(quatroDoFacial());
  // MEDIDO nesta etapa, com ids UUID: 6.578 B → 8.800 B na SERP real de skincare facial.
  assert.ok(bytes(quatro) - bytes(uma) < 2_500, `acréscimo de ${bytes(quatro) - bytes(uma)} B`);
  assert.ok(bytes(quatro.lensEvidence) < 2_000);
});

/* ------------------------------- evidencia_serp ------------------------------ */

/** Pior caso da linha: versão de 4 dígitos, os dois eixos mistos com os rótulos mais longos, 4 lentes. */
function piorCaso(base: KeywordSemanticQualification): KeywordSemanticQualification {
  const misto = (axis: KeywordSemanticQualification["intent"], labels: [string, string]) => ({
    ...axis, observedValue: null, strength: "mixed" as const, coverage: 0.8333333333333334, dominance: 0.5,
    distribution: [{ label: labels[0], count: 5 }, { label: labels[1], count: 4 }, { label: "Local", count: 1 }],
  });
  return {
    ...base,
    id: "keyword_semantic_qualification:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222:v9999",
    lifecycle: { ...base.lifecycle, version: 9999, contentHash: `sha256:${"f".repeat(64)}` },
    intent: misto(base.intent, ["Navegacional", "Transacional"]),
    funnel: misto(base.funnel, ["BOFU", "MOFU"]),
    lensEvidence: { ...base.lensEvidence!, agreement: { intent: { label: "Navegacional", agreeing: 4, of: 4 }, funnel: { label: "BOFU", agreeing: 4, of: 4 } } },
  };
}

test("evidencia_serp · TETO de 700 B no pior caso, fixado por teste", async () => {
  const bytes = (valor: unknown) => Buffer.byteLength(JSON.stringify(valor));
  const pior = serpEvidenceRecordFromQualification(piorCaso(await qualificar(quatroDoFacial())));
  assert.equal(SERP_EVIDENCE_RECORD_MAX_BYTES, 700);
  assert.ok(pior.lentes && pior.intent.rotulos && pior.funnel.rotulos, "o pior caso tem todos os campos novos");
  assert.ok(bytes(pior) <= SERP_EVIDENCE_RECORD_MAX_BYTES, `evidencia_serp com ${bytes(pior)} B`);
  assert.ok(bytes(serpEvidenceRecordFromQualification(await qualificar(quatroDoFacial()))) <= SERP_EVIDENCE_RECORD_MAX_BYTES);
});

test("evidencia_serp · resumo das lentes e, só no eixo misto, os dois rótulos e a cobertura", async () => {
  const conclusiva = serpEvidenceRecordFromQualification(await qualificar(quatroDoFacial()));
  assert.deepEqual(conclusiva.lentes, { lidas: 4, intent: 4, funnel: 4 });
  const duas = serpEvidenceRecordFromQualification(await qualificar(quatroDoFacial({}, ["mobile-android", "mobile-ios"])));
  assert.deepEqual(duas.lentes, { lidas: 2, intent: 2, funnel: 2 });
  assert.equal("rotulos" in conclusiva.intent, false, "conclusivo não leva rótulos: leva o valor");
  const mista = serpEvidenceRecordFromQualification(piorCaso(await qualificar(quatroDoFacial())));
  assert.deepEqual(mista.intent, { value: null, strength: "mixed", rotulos: ["Navegacional", "Transacional"], cobertura: 0.83 });
  // Legada de uma lente: a linha não ganha `lentes`.
  assert.equal("lentes" in serpEvidenceRecordFromQualification(await qualificar(umaLente(FACIAL, "skincare facial"))), false);
});

test("evidencia_serp · releitura e invalidação preservam os campos novos", async () => {
  const semantic = applySerpEvidenceRecord({}, piorCaso(await qualificar(quatroDoFacial())));
  const relido = readSerpEvidenceRecord(JSON.parse(JSON.stringify(semantic)));
  assert.deepEqual(relido, semantic.evidencia_serp);
  const invalidada = readSerpEvidenceRecord(invalidateSerpEvidence(semantic, { por: "user-1", em: T0, motivo: "SERP de outra cidade" }))!;
  assert.deepEqual(invalidada.lentes, relido?.lentes);
  assert.deepEqual(invalidada.intent, relido?.intent);
  assert.equal(serpEvidenceMixedLabels(invalidada, "intent"), null, "invalidada não vira rótulo");
});

test("evidencia_serp · a cobertura é TRUNCADA: 0,4999 nunca liga a R9", async () => {
  const base = piorCaso(await qualificar(quatroDoFacial()));
  const record = serpEvidenceRecordFromQualification({ ...base, intent: { ...base.intent, coverage: 0.4999 } });
  assert.equal(record.intent.cobertura, 0.49);
  assert.equal(serpEvidenceMixedLabels(record, "intent"), null);
  assert.deepEqual(serpEvidenceMixedLabels(record, "funnel"), ["BOFU", "MOFU"]);
});

/* ------------------------------------ R9 ------------------------------------- */

const PACOTE = { keywordId: "kw-1", brandId: "brand-a", keyword: "serum noturno", intent: "Ambígua", volumeSearch: 90, resultsAllintitle: 336, kgrScore: 3.7333, listaId: null };

function semanticaAmbigua(): Record<string, unknown> {
  const semantic: Record<string, unknown> = { dna_origem: "logico_deterministico", intencao_principal: "Ambígua", nicho: "Estética", funnel: "Ambíguo", kgr_aplicabilidade: "applicable" };
  semantic.logical_output_contract = buildLogicalOutputContract({ semantic, intent: "Ambígua", niche: "Estética", funnel: "Ambíguo" });
  return semantic;
}

test("R9 · Lógica ambígua e SERP mista com cobertura ≥ 0,5: \"Misto na SERP (A × B)\"", async () => {
  const semantic = applySerpEvidenceRecord(semanticaAmbigua(), piorCaso(await qualificar(quatroDoFacial())));
  const leitura = readCanonicalKeywordDna({ intent: "Ambígua", analise_semantica: semantic });
  assert.equal(leitura.intentLabel, "Misto na SERP (Navegacional × Transacional)");
  assert.equal(leitura.funnelLabel, "Misto na SERP (BOFU × MOFU)");
  assert.equal(leitura.intent, null, "o valor canônico continua sem valor");
  assert.equal(leitura.intentState, "unresolved");
  assert.equal(leitura.funnel, null);
});

test("R9 · não se aplica sem os rótulos, com cobertura baixa, invalidada, com decisão humana ou lendo só a Lógica", async () => {
  const qualificacao = piorCaso(await qualificar(quatroDoFacial()));
  const comR9 = applySerpEvidenceRecord(semanticaAmbigua(), qualificacao);
  const semRotulos = { ...comR9, evidencia_serp: { ...(comR9.evidencia_serp as Record<string, unknown>), intent: { value: null, strength: "mixed" } } };
  assert.equal(readCanonicalKeywordDna({ analise_semantica: semRotulos }).intentLabel, "Ambíguo", "projeção anterior a estes campos");
  const cobertura = applySerpEvidenceRecord(semanticaAmbigua(), { ...qualificacao, intent: { ...qualificacao.intent, coverage: 0.45 } });
  assert.equal(readCanonicalKeywordDna({ analise_semantica: cobertura }).intentLabel, "Ambíguo");
  const invalidada = invalidateSerpEvidence(comR9, { por: "user-1", em: T0, motivo: "outra praça" });
  assert.equal(readCanonicalKeywordDna({ analise_semantica: invalidada }).intentLabel, "Ambíguo");
  assert.equal(readCanonicalKeywordDna({ analise_semantica: comR9 }, { includeSerpEvidence: false }).intentLabel, "Ambíguo");
  const humano = { ...comR9, human_review: { overrides: { intent: "" } } };
  assert.equal(readCanonicalKeywordDna({ analise_semantica: humano }).intentLabel, "Indeterminado", "decisão humana não é substituída pela SERP mista");
  const pendente = applySerpEvidenceRecord({ intencao_principal: "Pendente", logical_output_contract: buildLogicalOutputContract({ semantic: {}, intent: "Pendente", niche: "Estética", funnel: "Pendente" }) }, qualificacao);
  assert.equal(readCanonicalKeywordDna({ analise_semantica: pendente }).intentLabel, "Pendente", "só o \"Ambíguo\" vira rótulo da SERP");
});

test("R9 · o valor canônico e a assinatura do pacote aprovado NÃO mudam com o rótulo", async () => {
  const qualificacao = piorCaso(await qualificar(quatroDoFacial()));
  // Aprovada com a projeção de antes destes campos (mesma versão, sem rótulos).
  const record = serpEvidenceRecordFromQualification(qualificacao);
  const antes = { ...semanticaAmbigua(), evidencia_serp: { ...record, intent: { value: null, strength: "mixed" }, funnel: { value: null, strength: "mixed" } } };
  const aprovada = await applyApproval({ ...PACOTE, semantic: antes, approvedAt: "2026-09-20T12:00:00.000Z", approvedBy: "human-1" });
  const depois = applySerpEvidenceRecord(aprovada, qualificacao);
  assert.equal(readCanonicalKeywordDna({ analise_semantica: antes }).intentLabel, "Ambíguo");
  assert.equal(readCanonicalKeywordDna({ analise_semantica: depois }).intentLabel, "Misto na SERP (Navegacional × Transacional)");
  assert.equal(APPROVAL_SIGNATURE_SCHEME, "fnv1a-v3");
  assert.equal(approvedPackageSignature({ ...PACOTE, semantic: depois }), approvedPackageSignature({ ...PACOTE, semantic: aprovada }));
  assert.equal(approvedPackageDiverged({ ...PACOTE, semantic: depois }), false);
  assert.equal(readCanonicalKeywordDna({ intent: "Ambígua", analise_semantica: depois }).intent, null);
});

/* ----------------------------- handoff e tela ------------------------------- */

test("handoff · `lenses` opcional viaja ao Arquiteto sem mudar a forma de antes", async () => {
  const quatro = await qualificar(quatroDoFacial());
  const legada = await qualificar(umaLente(FACIAL, "skincare facial"));
  const referencia = (qualificacao: KeywordSemanticQualification) => ({
    versionId: qualificacao.id, versionNumber: qualificacao.lifecycle.version, contentHash: qualificacao.lifecycle.contentHash,
    intent: "Informativa", funnel: "TOFU", semanticState: "conclusive" as const, collectedAt: qualificacao.source.collectedAt,
    ...(qualificationLensSummary(qualificacao) ? { lenses: qualificationLensSummary(qualificacao)! } : {}),
  });
  const plano = buildMineradorArquitetoHandoffPlan({
    brandId: "brand-a",
    existingKeywordIds: new Set<string>(),
    keywords: [{ id: "kw-1", brandId: "brand-a", status: "aprovado", semanticQualification: referencia(quatro) }, { id: "kw-2", brandId: "brand-a", status: "aprovado", semanticQualification: referencia(legada) }],
  });
  assert.deepEqual(plano.rows[0].payload.semanticQualification?.lenses, { observadas: 4, concordancia: { intent: 4, funnel: 4 } });
  assert.equal("lenses" in (plano.rows[1].payload.semanticQualification || {}), false);
  assert.equal(plano.rows[0].source_version_id, quatro.id);
  assert.deepEqual(Object.keys(plano.rows[0].payload).sort(), ["approvedDna", "brandId", "decision", "keywordId", "semanticQualification", "source", "state"]);
});

test("tela · \"SERP · 4 lentes\" ou \"K de 4\", concordância por eixo, aparelhos e datas", async () => {
  const quatro = serpLensEvidencePresentation((await qualificar(quatroDoFacial())).lensEvidence!);
  assert.equal(quatro.headline, "SERP · 4 lentes");
  assert.equal(quatro.intent.agreement, "Concordância entre lentes: 4 de 4 · Informativa");
  assert.equal(quatro.intent.deviceSplit, null);
  assert.equal(quatro.missing, null);
  assert.equal(quatro.lenses.length, 4);
  assert.match(quatro.lenses[0], /^desktop Windows · Intenção Informativa \(evidência forte\) · Funil TOFU \(evidência forte\) · 10 resultado\(s\) · coletada em 23\/09\/2026 pelo Minerador$/);
  const duas = serpLensEvidencePresentation((await qualificar(quatroDoFacial({}, ["mobile-android", "mobile-ios"]))).lensEvidence!);
  assert.equal(duas.headline, "SERP · 2 de 4 lentes");
  assert.equal(duas.missing, "Fora da leitura: mobile Android (falha na coleta), mobile iOS (falha na coleta).");
  const desktop = serp([1, 2, 3, 4, 5, 6, 7].map(n => informativo(n)).concat([1, 2, 3].map(n => compra(n))));
  const mobile = serp([1, 2, 3, 4, 5, 6, 7].map(n => compra(n, "movel")).concat([1, 2, 3].map(n => informativo(n, "blogmovel"))), [{ type: "shopping" }]);
  const dividida = serpLensEvidencePresentation(lentes(desktop, [comDigest("mobile-ios", mobile, { collectedAt: "2026-09-10T09:00:00.000Z" })]).lensEvidence!);
  assert.equal(dividida.intent.deviceSplit, "Desktop × mobile: Informativa × Transacional");
  assert.equal(dividida.dates, "Lentes de datas diferentes: de 10/09/2026 a 23/09/2026. A recoleta é manual.");
  assert.equal(dividida.blocks, "Blocos só em parte das lentes: Shopping (mobile iOS).");
});

test("tela · o painel da Qualificação usa a apresentação das lentes, com tokens e sem cor crua", () => {
  const fonteDoPainel = readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter(linha => !linha.trim().startsWith("//"))
    .join("\n");
  const painel = fonteDoPainel.slice(fonteDoPainel.indexOf("function SemanticConsolidationPanel("), fonteDoPainel.indexOf("function HumanReviewPanel("));
  assert.ok(painel.length > 1000, "o painel foi encontrado");
  assert.match(painel, /const lensView = qualification\?\.lensEvidence \? serpLensEvidencePresentation\(qualification\.lensEvidence\) : null;/);
  assert.match(painel, /<ProfilePill label=\{lensView\.headline\} \/>/);
  assert.match(painel, /\{lensView\[axis\]\.agreement\}/);
  assert.match(painel, /\{lensView\[axis\]\.deviceSplit\}/);
  assert.match(painel, /data-semantic-consolidation-lens-readings/);
  assert.doesNotMatch(painel, /#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(|slate-|emerald-|sky-|purple|violet|indigo/);
});

/* ------------------- correções da revisão (etapa 1b, corretor) ------------------- */

const UUID_ATOR = "44444444-4444-4444-8444-444444444444";
const EM_ISO = "2026-09-23T10:00:00.000Z";

test("evidencia_serp · a invalidação tem TETO próprio: o registro invalidado no pior caso fica dentro de 700 + 300 B", async () => {
  const bytes = (valor: unknown) => Buffer.byteLength(JSON.stringify(valor));
  assert.equal(SERP_EVIDENCE_INVALIDATION_MAX_BYTES, 300);
  const semantic = applySerpEvidenceRecord({}, piorCaso(await qualificar(quatroDoFacial())));
  // `{"por":"<uuid>","em":"<iso>","motivo":""}` tem 90 B: sobram 210 B de motivo.
  const noLimite = invalidateSerpEvidence(semantic, { por: UUID_ATOR, em: EM_ISO, motivo: "x".repeat(210) });
  const registro = noLimite.evidencia_serp as Record<string, unknown>;
  assert.equal(bytes(registro.invalidada), SERP_EVIDENCE_INVALIDATION_MAX_BYTES);
  assert.ok(bytes(registro) <= SERP_EVIDENCE_RECORD_MAX_BYTES + SERP_EVIDENCE_INVALIDATION_MAX_BYTES, `invalidada com ${bytes(registro)} B`);
  // O caso comum da revisão (motivo curto) passa dos 700: por isso o teto é declarado à parte.
  assert.ok(bytes(invalidateSerpEvidence(semantic, { por: UUID_ATOR, em: EM_ISO, motivo: "SERP de outra cidade" }).evidencia_serp) > SERP_EVIDENCE_RECORD_MAX_BYTES);
  // Um byte a mais é RECUSADO, nunca truncado; e acento conta 2 bytes.
  assert.throws(() => invalidateSerpEvidence(semantic, { por: UUID_ATOR, em: EM_ISO, motivo: "x".repeat(211) }), /longo demais/);
  assert.throws(() => invalidateSerpEvidence(semantic, { por: UUID_ATOR, em: EM_ISO, motivo: "ç".repeat(106) }), /longo demais/);
  assert.equal((invalidateSerpEvidence(semantic, { por: UUID_ATOR, em: EM_ISO, motivo: "ç".repeat(105) }).evidencia_serp as { invalidada: { motivo: string } }).invalidada.motivo, "ç".repeat(105), "o motivo aceito fica como veio");
});

test("repeatsCurrent · só o MOTIVO de uma lente faltante mudou: mesma leitura, nenhuma versão nova", async () => {
  const falhou = await qualificar(quatroDoFacial({}, ["mobile-ios"]));
  const relida = parseKeywordSemanticQualification(JSON.parse(JSON.stringify(falhou)))!;
  const digest = buildSerpOrganicDigest(FACIAL)!;
  const semQuota = lentes(FACIAL, [
    { ...fonte("desktop-macos"), digest },
    { ...fonte("mobile-android"), digest },
    { lens: "mobile-ios", missing: "not_collected" },
  ], "skincare facial");
  const proxima = await qualificar(semQuota, relida);
  assert.deepEqual(proxima.lensEvidence?.lensesMissing, [{ lens: "mobile-ios", reason: "not_collected" }]);
  assert.deepEqual(relida.lensEvidence?.lensesMissing, [{ lens: "mobile-ios", reason: "collection_failed" }]);
  assert.equal(repeatsCurrentSemanticQualification(relida, proxima), true, "collection_failed → not_collected é a mesma leitura");
  // Outro CONJUNTO de lentes faltantes continua sendo mudança real.
  const outraFaltando = await qualificar(quatroDoFacial({}, ["mobile-android"]), relida);
  assert.equal(repeatsCurrentSemanticQualification(relida, outraFaltando), false);
});

test("predatesCurrent · canônica mais NOVA com uma extra mais velha grava; só lentes mais velhas seguram", async () => {
  // A sonda P5 da revisão: vigente com iOS às 10:00; a próxima traz a canônica
  // recolhida em 25/09 e a iOS de uma entrada mais velha (09:30, corrida `concurrent`).
  const vigente = await qualificar(quatroDoFacial({ "mobile-ios": { providerRequestId: "ios-2", collectedAt: "2026-09-23T10:00:00.000Z" } }));
  const digest = buildSerpOrganicDigest(FACIAL)!;
  const extras = (ios: Parameters<typeof fonte>[1]): SerpLensDerivationInput[] => [
    { ...fonte("desktop-macos"), digest },
    { ...fonte("mobile-android"), digest },
    { ...fonte("mobile-ios", ios), digest },
  ];
  const canonicaNova = await qualificar(lentes(FACIAL, extras({ providerRequestId: "ios-1", collectedAt: "2026-09-23T09:30:00.000Z" }), "skincare facial", { providerRequestId: "canon-new", collectedAt: "2026-09-25T09:00:00.000Z" }), vigente);
  assert.equal(predatesCurrentSemanticQualification(vigente, canonicaNova), false, "a canônica nova é progresso: não fica bloqueada pela extra velha");
  // Só a extra mais velha, o resto igual: nada novo, a vigente fica.
  const soVelha = await qualificar(lentes(FACIAL, extras({ providerRequestId: "ios-1", collectedAt: "2026-09-23T09:30:00.000Z" }), "skincare facial"), vigente);
  assert.equal(predatesCurrentSemanticQualification(vigente, soVelha), true);
  // Uma extra mais nova e outra mais velha: há lente nova, grava.
  const misturada = await qualificar(lentes(FACIAL, [
    { ...fonte("desktop-macos", { collectedAt: "2026-09-24T09:00:00.000Z" }), digest },
    { ...fonte("mobile-android"), digest },
    { ...fonte("mobile-ios", { collectedAt: "2026-09-23T09:30:00.000Z" }), digest },
  ], "skincare facial"), vigente);
  assert.equal(predatesCurrentSemanticQualification(vigente, misturada), false);
});

/** SERP SINTÉTICA com o bloco DEPOIS do 10º orgânico: fora do top 10 de qualquer lente. */
function serpComBlocoDepois(organic: Item[], block: Item) {
  const itens = organic.map((item, index) => ({ type: "organic", rank_group: index + 1, ...item }));
  return { tasks: [{ id: "task", result: [{ keyword: KW, items: [...itens.slice(0, 10), block, ...itens.slice(10)] }] }] };
}

test("4 lentes · blocos e aparelhos comparados na MESMA janela: a canônica também no top 10", () => {
  // Bloco depois do 10º orgânico, em todas as lentes: nenhuma o vê no top 10.
  const corpo = serpComBlocoDepois(meioAMeio().concat([11, 12].map(n => informativo(n))), PAA);
  const quatro = lentes(corpo, [comDigest("desktop-macos", corpo), comDigest("mobile-android", corpo), comDigest("mobile-ios", corpo)]);
  assert.deepEqual(quatro.lensEvidence?.blocks, [], "nada de \"PAA só no desktop Windows\": era a janela, não o aparelho");
  assert.equal(quatro.intent.structuralSignals.some(item => item.signal === "people_also_ask"), false);
  assert.deepEqual(quatro.serpFeatures, [{ type: "people_also_ask", count: 1 }], "os blocos da canônica continuam registrados inteiros");
  assert.equal(quatro.observedResults, 12, "a união das URLs continua com as 20 da canônica");
  // Com uma lente só, nada muda: o bloco do corpo inteiro reforça como sempre.
  assert.deepEqual(lentes(corpo).intent, umaLente(corpo).intent);
  assert.ok(lentes(corpo).intent.structuralSignals.some(item => item.signal === "people_also_ask" && item.weight > 0));

  // Aparelhos: o mesmo top 10 no desktop e no mobile, e lojas só do 11º ao 20º da canônica.
  const desktop = serp([1, 2, 3, 4, 5, 6].map(n => informativo(n)).concat([1, 2, 3, 4].map(n => compra(n)), [11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map(n => compra(n))));
  const mesmoTopo = lentes(desktop, [comDigest("mobile-android", desktop)]);
  assert.equal(mesmoTopo.lensEvidence?.deviceSplit.intent, null, "o mesmo top 10 nos dois aparelhos não é divergência");
  assert.equal(mesmoTopo.lensEvidence?.deviceSplit.funnel, null);
  assert.equal(mesmoTopo.observedResults, 20);
});

test("Qualificação · UMA leitura de lente malformada descarta o bloco inteiro, nunca meia leitura", async () => {
  const vigente = await qualificar(quatroDoFacial());
  const quebrada = JSON.parse(JSON.stringify(vigente));
  quebrada.lensEvidence.readings[1].intent.coverage = null;
  const relida = parseKeywordSemanticQualification(quebrada)!;
  assert.equal("lensEvidence" in relida, false);
  const semLente = JSON.parse(JSON.stringify(vigente));
  delete semLente.lensEvidence.readings[2].lens;
  assert.equal("lensEvidence" in parseKeywordSemanticQualification(semLente)!, false);
  // O motivo novo de lente faltante é aceito na releitura.
  const invalidada = JSON.parse(JSON.stringify(await qualificar(quatroDoFacial({}, ["mobile-ios"]))));
  invalidada.lensEvidence.lensesMissing = [{ lens: "mobile-ios", reason: "evidence_invalidated" }];
  assert.deepEqual(parseKeywordSemanticQualification(invalidada)!.lensEvidence?.lensesMissing, [{ lens: "mobile-ios", reason: "evidence_invalidated" }]);
});

test("tela · lente fora da leitura por evidência invalidada diz o motivo", async () => {
  const evidence = lentes(FACIAL, [
    { ...fonte("desktop-macos"), digest: buildSerpOrganicDigest(FACIAL)! },
    { lens: "mobile-android", missing: "evidence_invalidated" },
    { lens: "mobile-ios", missing: "evidence_invalidated" },
  ], "skincare facial");
  const tela = serpLensEvidencePresentation(evidence.lensEvidence!);
  assert.equal(tela.headline, "SERP · 2 de 4 lentes");
  assert.equal(tela.missing, "Fora da leitura: mobile Android (evidência invalidada: a do cache não entra), mobile iOS (evidência invalidada: a do cache não entra).");
});

test("R9 · a tabela recebe uma forma CURTA do misto; o rótulo inteiro não muda", async () => {
  const semantic = applySerpEvidenceRecord(semanticaAmbigua(), piorCaso(await qualificar(quatroDoFacial())));
  const leitura = readCanonicalKeywordDna({ intent: "Ambígua", analise_semantica: semantic });
  assert.equal(leitura.intentLabel, "Misto na SERP (Navegacional × Transacional)");
  assert.equal(leitura.intentCompactLabel, "Misto: Nav × Trans");
  assert.equal(leitura.funnelLabel, "Misto na SERP (BOFU × MOFU)");
  assert.equal(leitura.funnelCompactLabel, "Misto");
  assert.ok(leitura.intentCompactLabel!.length <= 20, "cabe na coluna de intenção");
  // Onde a R9 não vale, não há forma curta: a célula mostra o rótulo de sempre.
  const semR9 = readCanonicalKeywordDna({ analise_semantica: semanticaAmbigua() });
  assert.equal(semR9.intentLabel, "Ambíguo");
  assert.equal("intentCompactLabel" in semR9, false);
  assert.equal("funnelCompactLabel" in semR9, false);
  const humano = readCanonicalKeywordDna({ analise_semantica: { ...semantic, human_review: { overrides: { intent: "", funnel: "" } } } });
  assert.equal("intentCompactLabel" in humano, false, "decisão humana não ganha forma curta da SERP");
  assert.equal("funnelCompactLabel" in humano, false);
});

test("R9 · a célula da tabela mostra a forma curta, e o título continua com o rótulo inteiro", () => {
  const fonteDaTabela = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter(linha => !linha.trim().startsWith("//"))
    .join("\n");
  assert.match(fonteDaTabela, /title=\{intentLabel\}[\s\S]{0,600}<span className="truncate">\{keywordReadModel\.intentCompactLabel \|\| intentLabel\}<\/span>/);
  assert.match(fonteDaTabela, /title=\{keywordReadModel\.funnel \|\| \(keywordReadModel\.funnelLabel !== "—" \? keywordReadModel\.funnelLabel : "Funil ainda não informado"\)\}>[\s\S]{0,200}<span className="truncate">\{keywordReadModel\.funnelCompactLabel \|\| keywordReadModel\.funnelLabel\}<\/span>/);
});

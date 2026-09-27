/**
 * DIFERENCIAR PUBLICADOS · TELA — o painel "Publicados que disputam o mesmo assunto".
 *
 * SDD docs/04-arquiteto/sdd-diferenciacao-publicados-canibalizados-2026-09-27.md.
 * Três metades:
 *   1. o modelo puro da tela com a LEITURA REAL do cache da AdalbaPro (fixture,
 *      sem custo) e o plano de verdade do núcleo;
 *   2. a proposta e o aceite: estado e motivo por página, antes → depois,
 *      sucesso só com a releitura, passos seguintes com o contrato do import;
 *   3. a estrutura do painel, do hook e da fiação, lida como texto SEM
 *      comentários. Nenhuma rede: `fetch` falso que falha.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { buildSerpSubjectIndex, type KeywordSerpFootprint } from "../lib/arquiteto/serp-subject-overlap.ts";
import {
  compactDifferentiationGroup,
  detectPublishedCannibalization,
  proposeDifferentiationAngles,
  type DifferentiationPage,
} from "../lib/arquiteto/published-differentiation.ts";
import { DIFFERENTIATION_MAX_COST_USD, buildDifferentiationPlan, type DifferentiationChoice } from "../lib/arquiteto/published-differentiation-run.ts";
import { SubjectDiscoveryImportRequestSchema } from "../lib/minerador/subject-discovery-import.ts";
import { PLATFORM_OPERATIONS } from "../lib/agent/platform-catalog.ts";
import {
  DIFFERENTIATION_ACCEPT_ACTION,
  DIFFERENTIATION_INCLUDE_OPTION,
  DIFFERENTIATION_KEEP_ACTION,
  DIFFERENTIATION_PLAN_ACTION,
  DIFFERENTIATION_REACCEPT_ACTION,
  DIFFERENTIATION_REPLAN_ACTION,
  DIFFERENTIATION_RUN_ACTION,
  acceptPreviewLines,
  defaultAcceptPageIds,
  keepPreviewLines,
  costRangeLabel,
  differentiationApplyView,
  differentiationErrorMessage,
  differentiationEvaluationView,
  differentiationGroupRowView,
  differentiationHeadline,
  differentiationIngestRequest,
  differentiationPlanView,
  differentiationRunRequest,
  formatUsd,
  runActionLabel,
  runReadiness,
  sumDifferentiationCost,
  visibleDifferentiationGroups,
  type DifferentiationAcceptData,
  type DifferentiationDetectData,
  type DifferentiationPlanData,
  type DifferentiationRunData,
} from "../modules/arquiteto/published-differentiation-model.ts";
import { findVisualViolations } from "../scripts/check-visual-system.mjs";

let chamadasDeRede = 0;
globalThis.fetch = (async () => {
  chamadasDeRede += 1;
  throw new Error("Rede proibida no teste da tela de diferenciação.");
}) as typeof fetch;

type Fixture = {
  publicados: Array<{ keyword: string; volume: number | null; intencao: string }>;
  serp: Array<{ keyword: string; lente: string; urls: string[] | null }>;
};
const REAL = JSON.parse(readFileSync(new URL("./fixtures/adalbapro-publicados-serp-2026-09-26.json", import.meta.url), "utf8")) as Fixture;
const slugDe = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const URLS_REAIS: Record<string, string> = {
  "campanhas de marketing para clínica de estética sem anúncios": "https://adalbapro.com.br/leads-sem-trafego-pago/campanhas-de-marketing-para-clinica-de-estetica-sem-anuncios",
  "modelos de campanha para clínica de estética": "https://adalbapro.com.br/estrategia-de-negocios/modelos-de-campanha-para-clinica-de-estetica",
};
const ATRAIR = "como atrair pacientes para clínica de estética";
const CAPTAR = "como captar clientes para clínica de estética";

function pegadas(): KeywordSerpFootprint[] {
  const porKeyword = new Map<string, KeywordSerpFootprint>();
  for (const linha of REAL.serp) {
    const atual = porKeyword.get(linha.keyword) || { keywordId: linha.keyword, keyword: linha.keyword, lenses: [] };
    porKeyword.set(linha.keyword, { ...atual, lenses: [...atual.lenses, { lens: linha.lente, urls: linha.urls, domains: null, collectedAt: "2026-09-20T12:00:00Z" }] });
  }
  return [...porKeyword.values()];
}

function paginas(): DifferentiationPage[] {
  return REAL.publicados.map(item => ({
    keywordId: item.keyword, keyword: item.keyword,
    url: URLS_REAIS[item.keyword] || `https://adalbapro.com.br/blog/${slugDe(item.keyword)}`,
    canonical: null, slug: null, post: item.keyword === ATRAIR ? "locked" : "free",
    volume: item.volume, volumeValidated: (item.volume ?? 0) > 0,
    intent: item.intencao === "Pendente" ? null : item.intencao, entity: null, problem: null,
    articleId: item.keyword === CAPTAR || item.keyword === ATRAIR ? `article:${slugDe(item.keyword)}` : null,
    articleKeywordCount: 1,
  }));
}

const DETECCAO = detectPublishedCannibalization({ pages: paginas(), serp: buildSerpSubjectIndex(pegadas()), brandHosts: ["adalbapro.com.br"] });
const DETECT: DifferentiationDetectData = {
  mode: "detect",
  groups: DETECCAO.groups.map(grupo => compactDifferentiationGroup(grupo)),
  withoutSerp: DETECCAO.withoutSerp,
  pagesMeasured: DETECCAO.pagesMeasured,
  publishedCount: 25,
  paid: false,
};
const PAR = DETECCAO.groups.find(grupo => grupo.members.some(membro => membro.page.keyword === CAPTAR))!;
const PAR_COMPACTO = compactDifferentiationGroup(PAR);

async function planoDe(grupoId: string): Promise<DifferentiationPlanData> {
  const grupo = DETECCAO.groups.find(item => item.groupId === grupoId)!;
  const angles = proposeDifferentiationAngles({ group: grupo });
  const plan = await buildDifferentiationPlan({ brandId: "marca", group: grupo, angles, aiUsed: false });
  return { mode: "plan", group: compactDifferentiationGroup(grupo), angles, aiRejected: [], plan, proposal: { state: "planned", lockVersion: 1 }, paid: false };
}

const escolha = (keyword: string, adsVolume: number | null, extra: Partial<DifferentiationChoice> = {}): DifferentiationChoice => ({
  candidateId: `cand:${keyword}`, keyword, adsVolume, estimate: null, origins: ["labs_ranked"], evidence: ["A URL ranqueia em 12º."],
  existingKeywordId: null, sharedWithPage: 3, sharedWithSiblings: 0, separationOk: true, fitOk: true, ...extra,
});

function rodada(): DifferentiationRunData {
  const membro = (keyword: string) => PAR.members.find(item => item.page.keyword === keyword)!;
  return {
    mode: "run", groupId: PAR.groupId, operationRequestId: "11111111-2222-4333-8444-555555555555", executedAt: "2026-09-27T12:00:00Z",
    evaluation: {
      state: "differentiated",
      reason: "As propostas separam as páginas: nenhum par divide mais de 1 página no top 10.",
      pages: [
        { keywordId: CAPTAR, keyword: CAPTAR, url: membro(CAPTAR).page.url, post: "free", ranking: membro(CAPTAR).ranking, angle: "captar clientes", state: "differentiated", reason: "Principal nova \"anúncios para clínica de estética\" e 1 secundária(s), sem dividir mais de 1 página com as irmãs.", newPrincipal: escolha("anúncios para clínica de estética", 320), principalNote: null, secondaries: [escolha("tráfego pago para estética", 90)], warning: null, measured: [], inRound: true },
        { keywordId: ATRAIR, keyword: ATRAIR, url: membro(ATRAIR).page.url, post: "locked", ranking: membro(ATRAIR).ranking, angle: "atrair pacientes", state: "differentiated", reason: "2 secundária(s) com volume, sem dividir mais de 1 página com as irmãs.", newPrincipal: null, principalNote: "Posto \"Travado ao slug\": a principal fica; entram só 1 ou 2 secundárias, e a diferenciação fica mais fraca.", secondaries: [escolha("instagram para clínica de estética", 480), escolha("marketing de indicação estética", null, { estimate: 50 })], warning: "Posto \"Travado ao slug\": a principal fica; entram só 1 ou 2 secundárias, e a diferenciação fica mais fraca.", measured: [], inRound: true },
      ],
      before: [{ leftKeywordId: PAR.strongPairs[0].leftKeywordId, rightKeywordId: PAR.strongPairs[0].rightKeywordId, sharedPageCount: 6 }],
      after: [{ leftKeywordId: PAR.strongPairs[0].leftKeywordId, rightKeywordId: PAR.strongPairs[0].rightKeywordId, sharedPageCount: 1 }],
    },
    evaluationHash: "hash-da-avaliacao",
    costs: { reportedCostUsd: 0.0966, budgetSpentUsd: 0.12, authorizedUsd: 0.284, byPage: [] },
    serp: { cached: 4, collected: 12, failed: 0, skippedBudget: 0, readFailed: false },
    labsFailures: [], adsVolumeFailed: false, refusedCount: { [CAPTAR]: 3 }, ledgerRecording: true, ledgerWarning: null,
    notices: [], proposal: { state: "proposed", lockVersion: 2 }, persistWarning: null, paid: true,
  };
}

/* ============================ 1. detecção e plano ============================ */

test("detecção real: 4 grupos, uma linha por grupo com Posto, volume e quem ranqueia", () => {
  assert.equal(visibleDifferentiationGroups(DETECT).length, 4);
  assert.match(differentiationHeadline(DETECT), /^4 grupo\(s\), 14 publicados\. O Google mostra as mesmas páginas/);
  const linhas = DETECT.groups.map(differentiationGroupRowView);
  const par = differentiationGroupRowView(PAR_COMPACTO);
  assert.equal(par.sharedLabel, "6 páginas em comum no top 10", "um par só: sem \"até\"");
  assert.deepEqual(par.members.map(item => item.postLabel).sort(), ["Livre", "Travado ao slug"]);
  assert.equal(linhas[0].sharedLabel, "até 7 páginas em comum no top 10", "o grupo mais grave vem primeiro");
  const campanhas = linhas.find(linha => linha.members.length === 5)!;
  const ranqueia = campanhas.members.filter(item => item.ranks).map(item => item.rankingLabel).sort();
  assert.deepEqual(ranqueia, ["Ranqueia em 4º", "Ranqueia em 7º"]);
  assert.equal(campanhas.note, "Quem já aparece no Google não troca a principal: recebe só secundárias.");
  assert.equal(par.note, null);
  assert.equal(chamadasDeRede, 0);
});

test("Manter como está: o grupo mantido some do painel e o resumo diz quantos", () => {
  const mantido = { ...DETECT, groups: DETECT.groups.map((grupo, indice) => indice === 0 ? { ...grupo, kept: true } : grupo) };
  assert.equal(visibleDifferentiationGroups(mantido).length, 3);
  assert.match(differentiationHeadline(mantido), /1 mantido\(s\) como está, até a SERP mudar\./);
  const vazio = { ...DETECT, groups: [], withoutSerp: [{ keywordId: "x", keyword: "x" }] };
  assert.equal(differentiationHeadline(vazio), "Nenhum publicado disputa o mesmo assunto no cache de SERP. 1 publicado(s) sem SERP no cache: não dá para medir.");
});

test("plano: ângulos por página, faixa de custo arredondada para fora e teto por grupo", async () => {
  const plano = await planoDe(PAR.groupId);
  const vista = differentiationPlanView(plano);
  assert.equal(vista.costLabel, "US$ 0,07 a 0,29", "0,072 a 0,284: o mínimo para baixo, o máximo para cima");
  assert.equal(vista.capLabel, "Teto de US$ 0,50 por grupo.");
  assert.ok(vista.withinCap);
  const captar = vista.angles.find(item => item.keyword === CAPTAR)!;
  assert.match(captar.angle, /captar/);
  assert.match(captar.sources, /o que já separa os slugs/);
  assert.equal(formatUsd(0.284, "ceil"), "0,29");
  assert.equal(formatUsd(0.072, "floor"), "0,07");
  assert.equal(costRangeLabel({ minUsd: 0.5, maxUsd: 0.5 }), "US$ 0,50");

  const todos = await Promise.all(DETECCAO.groups.map(grupo => planoDe(grupo.groupId)));
  const soma = sumDifferentiationCost(todos.map(item => item.plan));
  assert.ok(soma.maxUsd > 1.5 && soma.maxUsd < 2.1, `as 4 famílias: ~US$ 2 (${soma.maxUsd})`);
  assert.match(runActionLabel(soma), /^Buscar e validar \(US\$ 0,\d\d a 1,\d\d\)$/);
  assert.equal(runActionLabel(null), DIFFERENTIATION_RUN_ACTION);
  const cortado = todos.find(item => item.plan.cuts.length)!;
  assert.ok(differentiationPlanView(cortado).cuts.length > 0, "o corte do teto aparece na tela");
});

test("Buscar e validar só com plano dentro do teto; o corpo leva o hash e o custo confirmados", async () => {
  const plano = await planoDe(PAR.groupId);
  const planos = new Map([[PAR.groupId, plano.plan]]);
  assert.deepEqual(runReadiness({ selected: [], plans: planos, busy: false }), { ready: false, reason: "Marque ao menos um grupo." });
  assert.equal(runReadiness({ selected: [PAR.groupId, "dg-0000000000000000"], plans: planos, busy: false }).reason, "Planeje antes: 1 grupo(s) marcado(s) sem plano.");
  assert.equal(runReadiness({ selected: [PAR.groupId], plans: new Map([[PAR.groupId, { ...plano.plan, withinCap: false }]]), busy: false }).reason, "1 grupo(s) acima do teto de US$ 0,50.");
  assert.deepEqual(runReadiness({ selected: [PAR.groupId], plans: planos, busy: false }), { ready: true, reason: null });
  assert.equal(runReadiness({ selected: [PAR.groupId], plans: planos, busy: true }).ready, false);
  const corpo = differentiationRunRequest({ brandId: "marca", plan: plano.plan, operationRequestId: "op" });
  assert.deepEqual(corpo, { brandId: "marca", groupId: PAR.groupId, operationRequestId: "op", authorizedPlan: { planHash: plano.plan.planHash, maxCostUsd: plano.plan.costRange.maxUsd } });
  assert.equal(differentiationRunRequest({ brandId: "m", plan: { ...plano.plan, costRange: { minUsd: 0.1, maxUsd: 0.9 } }, operationRequestId: "op" }).authorizedPlan.maxCostUsd, DIFFERENTIATION_MAX_COST_USD);
});

/* ============================ 2. proposta e aceite ============================ */

test("proposta por página: ângulo, principal nova, secundárias com volume, antes → depois, estado e motivo", () => {
  const vista = differentiationEvaluationView(rodada(), PAR_COMPACTO);
  assert.equal(vista.stateLabel, "Diferenciado");
  assert.equal(vista.tone, "success");
  assert.match(vista.costLabel, /^Gasto: US\$ 0,10 \(autorizado até US\$ 0,29\)\. SERP: 4 do cache, 12 coletada\(s\)\.$/);
  const captar = vista.pages.find(pagina => pagina.keyword === CAPTAR)!;
  assert.deepEqual(captar.newPrincipal, { keyword: "anúncios para clínica de estética", volumeLabel: "volume 320" });
  assert.deepEqual(captar.siblings, [{ keyword: ATRAIR, before: "6", after: 1 }]);
  const atrair = vista.pages.find(pagina => pagina.keyword === ATRAIR)!;
  assert.equal(atrair.newPrincipal, null);
  assert.match(atrair.principalNote || "", /Travado ao slug/);
  assert.deepEqual(atrair.secondaries.map(item => item.volumeLabel), ["volume 480", "estimativa 50"]);
  assert.ok(vista.canAccept);
  const previa = acceptPreviewLines(vista);
  assert.ok(previa.some(linha => linha.includes("principal nova \"anúncios para clínica de estética\"")));
  assert.ok(previa.includes("URL, slug, canonical e marca não mudam. Nada é apagado."));
});

test("sem saída ou avaliação não gravada: nada a aceitar, com o motivo", () => {
  const base = rodada();
  const semSaida: DifferentiationRunData = { ...base, evaluation: { ...base.evaluation, state: "no_way_out", reason: "Nenhuma keyword com volume cabe no slug destas páginas. A decisão fica com você.", pages: base.evaluation.pages.map(pagina => ({ ...pagina, state: "no_way_out", newPrincipal: null, secondaries: [] })) } };
  const vista = differentiationEvaluationView(semSaida, PAR_COMPACTO);
  assert.equal(vista.stateLabel, "Sem saída pelo provider");
  assert.equal(vista.canAccept, false);
  assert.match(vista.acceptBlockedReason || "", /Nenhuma página ficou Diferenciada/);
  // A pessoa pode marcar uma página sem saída: ela recebe só a nota do ângulo.
  const soNota = differentiationEvaluationView(semSaida, PAR_COMPACTO, [ATRAIR]);
  assert.equal(soNota.canAccept, true);
  assert.ok(acceptPreviewLines(soNota).includes(`"${ATRAIR}": só a nota do ângulo, sem keyword nova.`));
  assert.ok(acceptPreviewLines(soNota).includes("1 página(s) fora deste aceite: nada muda nelas."));
  const naoGravada = differentiationEvaluationView({ ...base, proposal: null, persistWarning: "A avaliação foi feita e paga, mas não pôde ser gravada agora." }, PAR_COMPACTO);
  assert.equal(naoGravada.canAccept, false);
  assert.ok(naoGravada.notices.some(aviso => /não pôde ser gravada/.test(aviso)));
});

function aceite(extra: Partial<DifferentiationAcceptData> = {}): DifferentiationAcceptData {
  return {
    mode: "apply", decision: "accept", groupId: PAR.groupId,
    pages: [
      { keywordId: CAPTAR, keyword: CAPTAR, articleId: "a1", written: true, versionId: "v2", readbackConfirmed: true, error: null, swap: { applied: false, keyword: "anúncios para clínica de estética", reason: "A nova ainda não está no artigo." }, formation: [], ingest: [{ keyword: "anúncios para clínica de estética", origins: ["labs_ranked"], evidence: ["A URL ranqueia em 12º."] }], refusal: null },
      { keywordId: ATRAIR, keyword: ATRAIR, articleId: "a2", written: true, versionId: "v3", readbackConfirmed: true, error: null, swap: { applied: false, keyword: null, reason: "Posto Travado." }, formation: [{ keywordId: "kw-insta", keyword: "instagram para clínica de estética", role: "secundaria" }], ingest: [], refusal: null },
    ],
    ingestBatches: [{ pageKeywordId: CAPTAR, subjectPhrase: CAPTAR, items: [{ keyword: "anúncios para clínica de estética", origins: ["labs_ranked"], evidence: ["A URL ranqueia em 12º."] }], searchId: "11111111-2222-4333-8444-555555555555", subjectKeywordId: null }],
    proposal: { state: "partially_applied", lockVersion: 3 }, persistWarning: null, readbackConfirmed: true,
    ...extra,
  };
}

test("aceite: sucesso só com a releitura; passos seguintes com o contrato do import do Minerador", () => {
  const vista = differentiationApplyView(aceite());
  assert.equal(vista.tone, "success");
  assert.equal(vista.headline, "2 página(s) gravada(s) e confirmada(s) na releitura.");
  assert.equal(vista.ingestCount, 1);
  assert.deepEqual(vista.formation, [{ pageKeywordId: ATRAIR, pageKeyword: ATRAIR, keywordIds: ["kw-insta"], keywords: ["instagram para clínica de estética"] }]);
  assert.ok(vista.needsSecondAccept, "a troca da principal só completa no segundo aceite");

  const semReleitura = differentiationApplyView(aceite({ readbackConfirmed: false, pages: aceite().pages.map((pagina, indice) => indice === 0 ? { ...pagina, written: false, readbackConfirmed: false, error: "A releitura não confirmou a versão nova." } : pagina) }));
  assert.equal(semReleitura.tone, "warning");
  assert.match(semReleitura.headline, /^1 página\(s\) não confirmada\(s\) na releitura/);
  assert.doesNotMatch(semReleitura.headline, /gravada\(s\) e confirmada/);

  const corpo = differentiationIngestRequest(aceite().ingestBatches[0], "22222222-3333-4444-8555-666666666666");
  assert.ok(SubjectDiscoveryImportRequestSchema.safeParse(corpo).success, "o mesmo contrato .strict() da Pesquisa por Assunto");
  assert.equal("volume" in corpo.items[0], false, "nenhuma métrica vai no corpo");
});

test("erros: código conhecido vira frase curta; sem código, a do servidor; nada pago é dito", () => {
  assert.equal(differentiationErrorMessage(409, { code: "PLAN_STALE", error: "x" }), "A SERP do grupo mudou desde o plano. Planeje de novo; nada foi pago.");
  assert.equal(differentiationErrorMessage(409, { code: "PREVIEW_CHANGED" }), "A proposta mudou desde que você a viu. Nada foi gravado; busque de novo.");
  assert.equal(differentiationErrorMessage(403, { code: "OUTRO", error: "Sem permissão." }), "Sem permissão.");
  assert.equal(differentiationErrorMessage(0, null), "Sem resposta do servidor.");
});

test("fraca: a melhor possível é só evidência; o aceite padrão leva só as Diferenciado", () => {
  const base = rodada();
  const fraca: DifferentiationRunData = {
    ...base,
    evaluation: {
      ...base.evaluation,
      state: "weak",
      pages: base.evaluation.pages.map(pagina => pagina.keywordId === ATRAIR
        // Avaliação antiga (antes da correção) trazia a melhor possível em secundárias.
        ? { ...pagina, state: "weak" as const, reason: "A melhor possível: \"curso de maquiagem\".", secondaries: [escolha("curso de maquiagem", 900, { fitOk: false, sharedWithPage: 0 })], bestEffort: escolha("curso de maquiagem", 900, { fitOk: false, sharedWithPage: 0 }) }
        : pagina),
    },
  };
  assert.deepEqual(defaultAcceptPageIds(fraca), [CAPTAR]);
  const vista = differentiationEvaluationView(fraca, PAR_COMPACTO);
  const atrair = vista.pages.find(pagina => pagina.keywordId === ATRAIR)!;
  assert.equal(atrair.included, false, "fraca não entra sem a marca da pessoa");
  assert.deepEqual(atrair.secondaries, [], "a melhor possível nunca vira secundária");
  assert.deepEqual(atrair.bestEffort, { keyword: "curso de maquiagem", volumeLabel: "volume 900" });
  const previa = acceptPreviewLines(vista);
  assert.ok(!previa.some(linha => linha.includes("curso de maquiagem")));
  const desmarcada = differentiationEvaluationView(fraca, PAR_COMPACTO, []);
  assert.equal(desmarcada.canAccept, false);
  assert.match(desmarcada.acceptBlockedReason || "", new RegExp(DIFFERENTIATION_INCLUDE_OPTION));
});

test("a prévia vale uma rodada: grupo já buscado não paga de novo; Manter pede confirmação", async () => {
  const plano = await planoDe(PAR.groupId);
  const planos = new Map([[PAR.groupId, plano.plan]]);
  const usado = runReadiness({ selected: [PAR.groupId], plans: planos, busy: false, used: new Set([PAR.groupId]) });
  assert.equal(usado.ready, false);
  assert.match(usado.reason || "", new RegExp(DIFFERENTIATION_REPLAN_ACTION));
  assert.deepEqual(keepPreviewLines(PAR_COMPACTO), [
    "Os 2 publicados ficam como estão: nenhuma versão nova, nenhuma keyword.",
    "O grupo sai do painel até a SERP dele mudar. A decisão fica registrada com o seu nome.",
  ]);
  for (const codigo of ["DIFFERENTIATION_ALREADY_RUN", "DIFFERENTIATION_EVALUATION_PENDING"]) {
    assert.match(differentiationErrorMessage(409, { code: codigo }), /nada foi (pago|apagado)/);
  }
});

/* ============================ 3. estrutura e fiação ============================ */

const semComentarios = (fonte: string) => fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const painel = semComentarios(readFileSync("modules/arquiteto/published-differentiation-panel.tsx", "utf8"));
const modelo = semComentarios(readFileSync("modules/arquiteto/published-differentiation-model.ts", "utf8"));
const gancho = semComentarios(readFileSync("modules/arquiteto/use-published-differentiation.ts", "utf8"));
const workspace = semComentarios(readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8"));

test("painel e modelo: sem rede, tokens, 14px+, checkbox com rótulo, diálogo com foco e keyword na cor dela", () => {
  for (const fonte of [painel, modelo]) assert.doesNotMatch(fonte, /\bfetch\(|\/api\/|supabase|dataforseo\.com/i);
  for (const caminho of ["modules/arquiteto/published-differentiation-panel.tsx", "modules/arquiteto/published-differentiation-model.ts", "modules/arquiteto/use-published-differentiation.ts"]) {
    assert.deepEqual(findVisualViolations(readFileSync(caminho, "utf8")), [], caminho);
  }
  assert.doesNotMatch(painel, /\btext-xs\b|text-\[\d+px\]/);
  assert.match(painel, /role="dialog"[\s\S]{0,40}aria-modal="true"/);
  assert.match(painel, /useSubjectDialogFocus\(true, dialogRef, onClose, !busy\)/);
  assert.equal((painel.match(/<label htmlFor=\{/g) || []).length, 2, "grupo e opção da IA");
  assert.match(painel, /text-keyword/);
  assert.match(painel, /onConfirm=\{\(\) => \{ setConfirmRun\(false\); void controller\.runConfirmed\(\); \}\}/, "pagar só pela confirmação");
  assert.match(painel, /onConfirm=\{\(\) => \{ const alvo = confirmAccept; setConfirmAccept\(null\); void controller\.accept\(alvo\); \}\}/, "aceitar só pela confirmação");
  assert.match(painel, /disabled=\{!controller\.readiness\.ready\}/);
  assert.match(painel, /onConfirm=\{\(\) => \{ const alvo = confirmKeep; setConfirmKeep\(null\); void controller\.keep\(alvo\); \}\}/, "manter só pela confirmação");
  assert.doesNotMatch(painel, /onClick=\{\(\) => void controller\.keep\(/, "nenhum clique grava Manter direto");
  assert.match(painel, /void controller\.replan\(group\.groupId\)/, "nova rodada só por pedido explícito");
  assert.match(painel, /onReaccept=\{onAccept\}/, "o segundo aceite passa pela mesma confirmação");
  assert.doesNotMatch(painel, /busque de novo e aceite/);
});

test("hook: as três rotas do núcleo, id novo por rodada, hash no aceite, nada pago sem confirmação", () => {
  assert.equal((gancho.match(/"\/api\/arquiteto\/cannibalization\/plan"/g) || []).length, 3, "detectar, planejar e reler o resultado gravado");
  assert.equal((gancho.match(/"\/api\/arquiteto\/cannibalization\/run"/g) || []).length, 1);
  assert.equal((gancho.match(/"\/api\/arquiteto\/cannibalization\/apply"/g) || []).length, 2, "aceitar e manter");
  assert.match(gancho, /const fila = selected\.map\(groupId => \(\{ groupId, operationRequestId: crypto\.randomUUID\(\) \}\)\)/);
  assert.match(gancho, /retryOperationId: !result\.responded \|\| result\.code === "OPERATION_IN_PROGRESS" \? operationRequestId : null/, "repetir só a MESMA rodada");
  assert.match(gancho, /decision: "accept", evaluationHash: run\.evaluationHash, pageKeywordIds: paginas/);
  assert.match(gancho, /temAvaliacao\(groupId\) \? "resume" : "plan"/, "grupo já buscado é relido, nunca replanejado em silêncio");
  assert.match(gancho, /\.\.\.\(mode === "replace" \? \{ replaceEvaluation: true \} : \{\}\)/);
  assert.match(gancho, /subject-discovery\/import`/);
  assert.match(gancho, /differentiationIngestRequest\(lote, crypto\.randomUUID\(\)\)/);
  assert.doesNotMatch(gancho, /localStorage|indexedDB|sessionStorage/, "nada de estado canônico no navegador");
  assert.doesNotMatch(gancho, /mode: "execute"|authorizedPlan: \{/, "o corpo pago só sai do modelo, com o plano confirmado");
});

test("fiação: a mesa mostra o painel na aba Artigos e coloca keyword no artigo pelo writer da formação", () => {
  assert.match(workspace, /<PublishedDifferentiationSection[\s\S]{0,120}brandId=\{selectedBrandId\}[\s\S]{0,300}onAddToArticle=\{addDifferentiationKeywordsToArticle\}/);
  assert.match(workspace, /onApplied=\{\(\) => setCanonicalWorkspaceReload\(current => current \+ 1\)\}/);
  const passo = workspace.slice(workspace.indexOf("const addDifferentiationKeywordsToArticle = async"), workspace.indexOf("const serpSubjectHandlers = {"));
  assert.match(passo, /planAddKeywordsToCandidate\(/);
  assert.match(passo, /publishedKeywordIds: publishedKeywordIdSet/);
  assert.equal((passo.match(/await applyFormationPlan\(/g) || []).length, 1);
  assert.doesNotMatch(passo, /supabase\.|fetch\(/, "nenhum gravador novo");
});

test("catálogo das IAs fala os rótulos da tela (AGENTS §17.1)", () => {
  const operacao = PLATFORM_OPERATIONS.find(item => item.id === "arquiteto.published_differentiation")!;
  const deteccao = PLATFORM_OPERATIONS.find(item => item.id === "arquiteto.published_differentiation_detect")!;
  assert.ok(deteccao.howOnScreen.includes(`'${DIFFERENTIATION_PLAN_ACTION} (grátis)'`));
  for (const rotulo of [`'${DIFFERENTIATION_RUN_ACTION} (US$ x a y)'`, `'${DIFFERENTIATION_ACCEPT_ACTION}'`, `'${DIFFERENTIATION_KEEP_ACTION}'`, "'Enviar ao Minerador'", "'Colocar no artigo'", `'${DIFFERENTIATION_REACCEPT_ACTION}'`, `'${DIFFERENTIATION_REPLAN_ACTION}'`, `'${DIFFERENTIATION_INCLUDE_OPTION}'`]) {
    assert.ok(operacao.howOnScreen.includes(rotulo), rotulo);
  }
  assert.doesNotMatch(`${operacao.howOnScreen} ${deteccao.howOnScreen}`, /Montar prévia|Buscar keywords \(pago\)/);
  assert.equal(chamadasDeRede, 0);
});

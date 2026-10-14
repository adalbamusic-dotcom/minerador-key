import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  KNOWN_NO_AVERAGE_TTL_DAYS,
  buildKnownBeforeSearchPlan,
  keywordDnaSummary,
  knownBeforeSearchAuthorizeLabel,
  knownBeforeSearchSentences,
  readKnownVolume,
  type KnownVolume,
} from "../lib/editorial/known-before-search.ts";
import { buildImprovementAiPrompt, IMPROVEMENT_AI_SYSTEM } from "../lib/arquiteto/article-improvement-ai.ts";
import { resolveKeywordDnaSignals } from "../lib/arquiteto/keyword-dna-signals.ts";
import { resolveImprovementNextStep } from "../lib/arquiteto/article-improvement-next-step.ts";
import type { ImprovementKeyword, ImprovementTarget } from "../lib/arquiteto/article-improvement.ts";
import { ArticleImprovementRequestSchema } from "../lib/arquiteto/article-improvement-request.ts";
import { improvementDiscoveryCostSentence } from "../lib/arquiteto/article-improvement-reuse.ts";
import {
  SubjectDiscoverySearchRequestSchema,
  runSubjectDiscoverySearch,
  subjectDiscoveryPreviousSearchNotice,
  type SubjectDiscoveryPlanResponse,
  type SubjectDiscoveryPorts,
} from "../lib/minerador/subject-discovery-search.ts";

/*
 * F3 · LER ANTES DE BUSCAR — SDD `docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`
 * (item 3; D4 do dono). Fixtures, nenhuma chamada paga, nenhum banco remoto.
 * O servidor (portas que contam chamadas) está em
 * `tests/ler-antes-de-buscar-servidor-2026-10-13.test.mts` e nos casos "F3 ·"
 * de `tests/arquiteto-article-improvement-server.test.mts` e
 * `tests/arquiteto-quatro-lentes-rota.test.mts`.
 */

const AGORA = new Date("2026-10-14T12:00:00.000Z");
const dias = (n: number) => new Date(AGORA.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
function stripComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

/* ------------------------------------ D4 ------------------------------------ */

test("D4 · volume medido no Google Ads é conhecido em qualquer idade (só 'Medir de novo' explícito remede)", () => {
  const antiga = readKnownVolume({ volume_search: 390, volume_source: "google_ads", analise_semantica: { volume_measurement: { provider: "google_ads", measuredAt: "2024-01-01T00:00:00.000Z", averageMonthlySearches: 390 } } }, AGORA);
  assert.deepEqual(antiga, { state: "measured", volume: 390, measuredAt: "2024-01-01T00:00:00.000Z" });
  // A medição gravada vale mesmo quando a coluna ainda não foi projetada.
  const soMedicao = readKnownVolume({ volume_search: null, volume_source: null, analise_semantica: { volume_measurement: { provider: "google_ads", measuredAt: dias(400), averageMonthlySearches: 720 } } }, AGORA);
  assert.equal(soMedicao.state, "measured");
  assert.equal((soMedicao as Extract<KnownVolume, { state: "measured" }>).volume, 720);
  // Número válido e depois uma resposta vazia: o número fica (resposta vazia não apaga dado).
  const comVazioDepois = readKnownVolume({ volume_search: 50, volume_source: "google_ads", analise_semantica: { volume_eligibility: { status: "eligible", lastEmptyResponse: { provider: "google_ads", measuredAt: dias(2), averageMonthlySearches: null } } } }, AGORA);
  assert.equal(comVazioDepois.state, "measured");
});

test(`D4 · "sem média" do Google Ads vale como medido por ${KNOWN_NO_AVERAGE_TTL_DAYS} dias; depois falta medir`, () => {
  const semMedia = (quando: string) => ({ volume_search: null, volume_source: null, analise_semantica: { volume_eligibility: { status: "unavailable", provider: "google_ads", measuredAt: quando, averageMonthlySearches: null } } });
  const recente = readKnownVolume(semMedia(dias(5)), AGORA);
  assert.equal(recente.state, "no_average");
  assert.equal((recente as Extract<KnownVolume, { state: "no_average" }>).validUntil, new Date(Date.parse(dias(5)) + 30 * 24 * 60 * 60 * 1000).toISOString());
  assert.equal(readKnownVolume(semMedia(dias(29)), AGORA).state, "no_average");
  const vencida = readKnownVolume(semMedia(dias(31)), AGORA);
  assert.deepEqual([vencida.state, (vencida as Extract<KnownVolume, { state: "missing" }>).reason], ["missing", "no_average_expired"]);
});

test("D4 · volume de outro provider, nunca medida e medição que falhou: falta medir (com o motivo)", () => {
  const motivo = (row: Parameters<typeof readKnownVolume>[0]) => { const k = readKnownVolume(row, AGORA); return k.state === "missing" ? k.reason : k.state; };
  assert.equal(motivo({ volume_search: 140, volume_source: "previous", analise_semantica: {} }), "other_provider");
  assert.equal(motivo({ volume_search: null, volume_source: null, analise_semantica: {} }), "never_measured");
  assert.equal(motivo({ volume_search: null, volume_source: null, analise_semantica: { volume_eligibility: { status: "measurement_failed", provider: "google_ads", measuredAt: dias(1) } } }), "measurement_failed");
  // "Sem média" de OUTRO provider não conta: só o Google Ads responde por "sem média".
  assert.equal(motivo({ volume_search: null, volume_source: null, analise_semantica: { volume_eligibility: { status: "unavailable", provider: "dataforseo", measuredAt: dias(1), averageMonthlySearches: null } } }), "never_measured");
});

/* --------------------------- "já temos · falta · custa" --------------------------- */

const conhecida = (keywordId: string, volume: KnownVolume, extra: { serpComplete?: boolean; dnaIntent?: boolean } = {}) => ({ keywordId, keyword: `kw ${keywordId}`, volume, serpComplete: extra.serpComplete ?? true, dnaIntent: extra.dnaIntent ?? true });
const medida: KnownVolume = { state: "measured", volume: 320, measuredAt: dias(100) };
const semMediaRecente: KnownVolume = { state: "no_average", measuredAt: dias(3), validUntil: dias(-27) };
const falta: KnownVolume = { state: "missing", reason: "other_provider", previousVolume: 140, previousSource: "previous", measuredAt: null };
const base = { subjects: 1, lockedPrincipals: 1, mineradorLists: 0, reusedRunId: null, aiReadingReused: false, aiReading: null, serp: { calls: 0, costUsd: { min: 0, max: 0 } } };

test("plano: DNA completo e nada a pagar → grátis, sem botão de leitura paga", () => {
  const plano = buildKnownBeforeSearchPlan({ ...base, keywords: [conhecida("a", medida), conhecida("b", semMediaRecente)] });
  assert.equal(plano.free, true);
  assert.equal(plano.needsPaidReading, false);
  assert.deepEqual(plano.plan.googleAds, { keywords: 0, calls: 0, moneyUsd: 0, quota: true });
  assert.equal(plano.plan.ai.calls, 0);
  assert.equal(knownBeforeSearchAuthorizeLabel(plano), null, "sem nada a pagar, não há botão de pagar");
  const frases = knownBeforeSearchSentences(plano);
  assert.match(frases.known, /^Já temos: volume medido de 1 de 2 keyword\(s\) ligadas aos alvos \(\+1 “sem média” no Google Ads há menos de 30 dias, que não são medidas de novo\)/);
  assert.match(frases.known, /1 Assunto\(s\), 1 com principal travada/);
  assert.equal(frases.missing, "Falta: nada — tudo o que esta análise precisa já está lido.");
  assert.equal(frases.cost, "Custa: nada (grátis).");
});

test("plano: só o que falta entra — uma consulta de métricas para as que faltam, uma chamada de IA, SERP só no 'Validar no Google'", () => {
  const plano = buildKnownBeforeSearchPlan({ ...base, keywords: [conhecida("a", medida), conhecida("b", falta), conhecida("c", falta, { serpComplete: false })], aiReading: { targets: 2, listSize: 5 }, serp: { calls: 3, costUsd: { min: 0.006, max: 0.009 } } });
  assert.equal(plano.free, false);
  assert.equal(plano.needsPaidReading, true);
  assert.deepEqual(plano.plan.googleAds, { keywords: 2, calls: 1, moneyUsd: 0, quota: true });
  assert.deepEqual(plano.plan.ai, { calls: 1, costUsd: null, provider: "OpenRouter" });
  assert.deepEqual(plano.plan.dataForSeo, { calls: 3, costUsd: { min: 0.006, max: 0.009 } });
  assert.deepEqual(plano.missing.volumeToMeasureSample.map(item => [item.keywordId, item.reason]), [["b", "other_provider"], ["c", "other_provider"]]);
  const frases = knownBeforeSearchSentences(plano);
  assert.match(frases.missing, /medir 2 keyword\(s\) no Google Ads; 1 leitura da IA \(2 alvo\(s\) sem proposta, lista de 5\); 3 consulta\(s\) de SERP/);
  assert.match(frases.cost, /Google Ads: 1 consulta\(s\) de métricas para 2 keyword\(s\) — sem custo em dólar, usa a cota da marca/);
  assert.match(frases.cost, /IA: 1 chamada \(OpenRouter, cobrada pelo uso\)/);
  assert.match(frases.cost, /DataForSEO: 3 consulta\(s\), US\$ 0,01 a US\$ 0,01/);
  assert.equal(knownBeforeSearchAuthorizeLabel(plano), "Ler com IA e medir · 1 chamada de IA + 2 keyword(s) no Google Ads (cota)");
});

test("rótulos verdadeiros: só IA, só medição e nada (o botão nunca diz 'grátis' quando chama provider)", () => {
  const soIa = buildKnownBeforeSearchPlan({ ...base, keywords: [conhecida("a", medida)], aiReading: { targets: 1, listSize: 3 } });
  assert.equal(knownBeforeSearchAuthorizeLabel(soIa), "Ler com IA · 1 chamada de IA (OpenRouter)");
  const soMedir = buildKnownBeforeSearchPlan({ ...base, keywords: [conhecida("a", falta)] });
  assert.equal(knownBeforeSearchAuthorizeLabel(soMedir), "Medir 1 keyword(s) no Google Ads · cota, sem custo em dólar");
  // Lista vazia: a IA não teria o que ler — não é cobrada nem prometida.
  assert.equal(buildKnownBeforeSearchPlan({ ...base, keywords: [], aiReading: { targets: 2, listSize: 0 } }).plan.ai.calls, 0);
  // O que esta preparação chamou com a autorização fica dito.
  const feito = knownBeforeSearchSentences(buildKnownBeforeSearchPlan({ ...base, keywords: [conhecida("a", medida)], done: { aiCalls: 1, measuredKeywords: 4, googleAdsCalls: 1 } }));
  assert.match(feito.done ?? "", /Chamado agora, com a sua autorização: 4 keyword\(s\) medida\(s\) no Google Ads \(1 consulta\(s\)\) e 1 leitura da IA\./);
});

/* ----------------------------- a IA recebe o DNA ----------------------------- */

test("a IA recebe o resumo do DNA de cada alvo e de cada keyword da lista (sem id, sem texto longo)", () => {
  assert.deepEqual(keywordDnaSummary({ intent: "Informativa", centralEntity: "clínica de estética", funnel: null, audience: "gestores de clínicas", perceivedProblem: "x".repeat(200) }), { intencao: "Informativa", entidade: "clínica de estética", publico: "gestores de clínicas", problema: `${"x".repeat(79)}…` });
  assert.equal(keywordDnaSummary({ intent: null, centralEntity: " ", funnel: null }), undefined);
  const semantica = { entidade_central: "captação de pacientes", problema_percebido: "poucos agendamentos", publico: "gestores de clínicas", intencao_principal: "Informativa" };
  const sinais = (id: string, texto: string) => resolveKeywordDnaSignals({ keywordId: id, text: texto, semantic: semantica });
  const alvo: ImprovementTarget = { id: "t-1111", kind: "subject", theme: "Como captar pacientes", note: null, primaryId: null, post: "free", memberIds: [], territoryRef: "territory:a", slug: null, url: null, canonical: null, signals: sinais("t-1111", "Como captar pacientes"), declaredPrincipalId: "k-9999" };
  const lista: ImprovementKeyword[] = [{ id: "k-2222", keyword: "captar pacientes", volume: 390, volumeValidated: true, signals: sinais("k-2222", "captar pacientes"), ownerId: null, published: false, territoryRef: "territory:a", external: false }];
  const prompt = buildImprovementAiPrompt({ targets: [alvo], list: lista, keywords: lista });
  const pedido = JSON.parse(prompt.user);
  assert.equal(pedido.alvos[0].dna.entidade, "captação de pacientes");
  assert.equal(pedido.alvos[0].dna.problema, "poucos agendamentos");
  assert.equal(pedido.alvos[0].principalTravada, true, "a trava do plano vai para a IA");
  assert.equal(pedido.lista[0].dna.publico, "gestores de clínicas");
  assert.ok(!prompt.user.includes("k-2222") && !prompt.user.includes("t-1111") && !prompt.user.includes("k-9999"), "ids reais não vão para a IA");
  assert.match(IMPROVEMENT_AI_SYSTEM, /Cada alvo e cada keyword podem trazer `dna`/);
});

/* ------------------------------- contrato e tela ------------------------------- */

test("pedido: sem authorizeReading o prepare só lê; a autorização é explícita e estrita", () => {
  const brandId = "61d2e019-f44f-4fa3-af2f-d86b95628ab3";
  assert.equal(ArticleImprovementRequestSchema.parse({ brandId, action: "prepare" }).authorizeReading, undefined);
  assert.deepEqual(ArticleImprovementRequestSchema.parse({ brandId, action: "prepare", authorizeReading: { ai: true } }).authorizeReading, { ai: true });
  assert.equal(ArticleImprovementRequestSchema.safeParse({ brandId, action: "prepare", authorizeReading: { ai: true, tudo: true } }).success, false);
});

test("próximo passo: a leitura paga vem antes de validar, com o botão que diz o custo; começar continua grátis e verdadeiro", () => {
  const inicio = resolveImprovementNextStep({ hasRun: false, state: null, leaseActive: false, accepted: false, paidQueries: 0, costMaxUsd: 0, selectedCount: 0 });
  assert.equal(inicio.button, "1 · Buscar keywords (grátis)");
  assert.match(inicio.sentence, /É grátis: a IA e o Google Ads só rodam depois, com o custo dito e a sua autorização/);
  const leitura = resolveImprovementNextStep({ hasRun: true, state: "prepared", leaseActive: false, accepted: false, paidQueries: 4, costMaxUsd: 0.02, selectedCount: 1, paidReading: { button: "Ler com IA · 1 chamada de IA (OpenRouter)", sentence: "Já temos: … Falta: … Custa: …" } });
  assert.deepEqual([leitura.kind, leitura.button], ["read_paid", "Ler com IA · 1 chamada de IA (OpenRouter)"]);
  const semLeitura = resolveImprovementNextStep({ hasRun: true, state: "prepared", leaseActive: false, accepted: false, paidQueries: 4, costMaxUsd: 0.02, selectedCount: 1, paidReading: null });
  assert.equal(semLeitura.kind, "validate");
});

// F4 (ajuste declarado 2026-10-14): a gravação da medição guardada (replay) saiu do apply do Arquiteto e foi para a caixa do Minerador.
test("estrutural: o prepare só chama IA e Google Ads com a autorização; a medição guardada é gravada pelo Minerador (replay)", () => {
  const servidor = stripComments(read("lib/server/arquiteto-article-improvement.ts"));
  const chamadasIa = [...servidor.matchAll(/await readEditorialAi\(/g)].length;
  assert.equal(chamadasIa, 1, "uma chamada só da leitura da IA");
  assert.match(servidor, /if \(autorizado\.ai\) await readEditorialAi\(runtime, run, ranking\);/);
  assert.match(servidor, /const medidas = autorizado\.measure \? await measureOldVolumes\(runtime, run\) : \{ asked: 0, calls: 0 \};/);
  assert.equal([...servidor.matchAll(/await measureOldVolumes\(/g)].length, 1, "medir o volume antigo só pela autorização");
  assert.doesNotMatch(servidor, /\} else await measureOldVolumes/, "a semente não mede sozinha");
  assert.doesNotMatch(servidor, /measureKeywordVolume|handleGoogleAdsKeywordMetrics|replayStoredMeasurements/, "F4: o Arquiteto não grava a medição no Minerador");
  const caixa = stripComments(read("lib/server/minerador-architect-suggestions.ts"));
  assert.match(caixa, /measureKeywordVolume\(editar, entries\.map\(entry => entry\.keywordId\), \{ measure: \(req, params, ctx\) => handleGoogleAdsKeywordMetrics\(req, params, ctx, \{ replay \}\) \}\)/);
  assert.match(servidor, /run\.reading = \{ \.\.\.plano, authorized: autorizado, sentences: knownBeforeSearchSentences\(plano\) \};/);
  // A projeção para o navegador e o MCP não leva a medição guardada.
  assert.match(servidor, /keywords: run\.keywords\.filter\(k => used\.has\(k\.id\)\)\.map\(semMedicaoGuardada\)/);
  assert.match(servidor, /delete copia\.measurement;/);
  const rota = stripComments(read("lib/server/minerador-google-ads-metrics-http.ts"));
  assert.match(rota, /options\.replay \? await options\.replay\(\{ keywords: batch\.map\(keyword => keyword\.keyword\) \}\) : await generateGoogleAdsHistoricalMetrics\(/);
  assert.match(rota, /const client = options\.replay \? null :/, "com a medição já recebida, nenhum cliente do Google Ads é aberto");
});

test("estrutural: o servidor decide o volume na SERP do lote e no parecer; a tela pede a conferência", () => {
  const parecer = stripComments(read("lib/server/arquiteto-serp-http.ts"));
  const leitura = parecer.indexOf("await readKnownBeforeSearch(");
  assert.ok(leitura > 0, "o parecer relê o volume no banco");
  assert.ok(leitura < parecer.indexOf("const observableInGroup") || leitura < parecer.indexOf("buildSerpPaidPlan("), "antes do plano pago");
  const lote = stripComments(read("app/api/arquiteto/keyword-serp/route.ts"));
  assert.match(lote, /onlyMeasuredVolume: z\.boolean\(\)\.optional\(\)/);
  assert.ok(lote.indexOf("readKnownBeforeSearch(") < lote.indexOf("buildSerpPaidPlan("), "a conferência vem antes do plano");
  const tela = stripComments(read("modules/arquiteto/arquiteto-workspace.tsx"));
  assert.equal([...tela.matchAll(/fetch\("\/api\/arquiteto\/keyword-serp"/g)].length, 2);
  assert.equal([...tela.matchAll(/keywords, onlyMeasuredVolume: true, \.\.\.extra \}\)/g)].length, 2, "as duas coletas do Arquiteto pedem a conferência");
  const servidorLeitor = stripComments(read("lib/server/known-before-search.ts"));
  assert.doesNotMatch(servidorLeitor, /"analise_semantica"|select\("\*"\)/, "nunca o analise_semantica inteiro");
  assert.doesNotMatch(servidorLeitor, /\.(update|insert|upsert|delete)\(/, "o leitor só lê");
});

test("estrutural: a tela mostra 'Já temos · Falta · Custa' e só pede a leitura paga depois da prévia", () => {
  const painel = stripComments(read("modules/arquiteto/article-improvement-panel.tsx"));
  assert.match(painel, /data-testid="architect-improvement-known"/);
  assert.match(painel, /confirm === "read" \? execute\("prepare", \{ \.\.\.recorteDaExecucao, authorizeReading: autorizacaoDaLeitura \}\)/);
  assert.match(painel, /\.\.\.\(action === "prepare" && options\.authorizeReading \? \{ authorizeReading: options\.authorizeReading \} : \{\}\)/);
  assert.match(painel, /else if \(next\.kind === "read_paid"\) setConfirm\("read"\);/);
  // O botão grátis não carrega autorização nenhuma.
  assert.match(painel, /onClick=\{\(\) => void execute\("prepare", recorteAtivo\)\}>\{activeGroup \? `Buscar keywords da cor \$\{activeGroup\.label\} \(grátis\)` : "Buscar keywords \(grátis\)"\}/);
  assert.match(improvementDiscoveryCostSentence(2), /A ideia que já existe no Minerador com volume medido usa o volume dele, sem medir de novo/);
});

test("estrutural: Reforçar publicados e a diferenciação não remedem a candidata que o Minerador já mediu", () => {
  const rodada = stripComments(read("lib/arquiteto/published-differentiation-run.ts"));
  assert.match(rodada, /if \(input\.knownVolumeByNormalized\?\.has\(candidata\.normalizedKeyword\)\) jaTemos\.set\(/);
  assert.match(rodada, /if \(jaTemos\.size\) volumes = new Map\(\[\.\.\.volumes, \.\.\.jaTemos\]\);/);
  for (const arquivo of ["lib/server/arquiteto-differentiation.ts", "lib/server/arquiteto-published-reinforcement-search.ts"]) {
    assert.match(stripComments(read(arquivo)), /knownVolumeByNormalized: knownVolumesByNormalized\(/, arquivo);
  }
});

/* ------------------------- Pesquisa por Assunto (Minerador) ------------------------- */

const BRAND = "aaaaaaaa-0000-4000-8000-000000000001";
const SUBJECT_ID = "5b000000-0000-4000-8000-00000000000a";
const targeting = { language: "languageConstants/1014", selectedStates: ["Todos os estados"], keywordPlanNetwork: "GOOGLE_SEARCH" as const, includeAdultKeywords: false };
function portas(anteriores: Array<{ operationRequestId: string; executedAt: string; candidateCount: number }> | null) {
  const pedidos: Array<{ phrase: string; subjectKeywordId: string | null }> = [];
  const ports: SubjectDiscoveryPorts = {
    now: () => AGORA,
    readBrandSiteUrl: async () => null,
    readSubjectKeyword: async id => id === SUBJECT_ID ? { id, keyword: "seo para clínicas", keywordSubject: { declared: true, note: null, destinationUrl: null, destinationCheck: null } } : null,
    lookupSerp: async () => assert.fail("a prévia não lê SERP"),
    findLedgerCapability: async () => assert.fail("a prévia não lê o ledger"),
    readExistingKeywords: async () => assert.fail("a prévia não lê as keywords"),
    openExecution: async () => assert.fail("a prévia não abre o Google Ads"),
    ...(anteriores ? { readPreviousSearches: async (input: { phrase: string; subjectKeywordId: string | null }) => { pedidos.push(input); return anteriores; } } : {}),
  };
  return { ports, pedidos };
}

test("Pesquisa por Assunto: a prévia lê as pesquisas anteriores do mesmo Assunto antes de consultar o Google Ads", async () => {
  const { ports, pedidos } = portas([{ operationRequestId: "op-2", executedAt: "2026-10-12T15:00:00.000Z", candidateCount: 41 }, { operationRequestId: "op-1", executedAt: "2026-10-01T15:00:00.000Z", candidateCount: 30 }]);
  const plano = await runSubjectDiscoverySearch({ brandId: BRAND, request: SubjectDiscoverySearchRequestSchema.parse({ mode: "plan", subjectKeywordId: SUBJECT_ID, targeting }) }, ports);
  assert.equal(plano.status, 200);
  const corpo = plano.body as SubjectDiscoveryPlanResponse;
  assert.deepEqual(pedidos, [{ phrase: "seo para clínicas", subjectKeywordId: SUBJECT_ID }]);
  assert.equal(corpo.previousSearches?.length, 2);
  assert.match(corpo.plan.notices[0], /^Já temos: este Assunto já foi pesquisado 2 vezes \(a última em 12\/10\/2026 UTC, 41 candidata\(s\) no recibo\)/);
  // O aviso fica fora do hash do plano: a execução continua aceitando o mesmo planHash.
  const { ports: semRecibos } = portas(null);
  const semAnteriores = (await runSubjectDiscoverySearch({ brandId: BRAND, request: SubjectDiscoverySearchRequestSchema.parse({ mode: "plan", subjectKeywordId: SUBJECT_ID, targeting }) }, semRecibos)).body as SubjectDiscoveryPlanResponse;
  assert.equal(semAnteriores.plan.planHash, corpo.plan.planHash);
  assert.equal(semAnteriores.previousSearches, undefined);
  assert.equal(subjectDiscoveryPreviousSearchNotice([]), null);
});

test("Pesquisa por Assunto: leitura dos recibos que falha não derruba a prévia", async () => {
  const { ports } = portas([]);
  ports.readPreviousSearches = async () => { throw new Error("banco fora"); };
  const plano = await runSubjectDiscoverySearch({ brandId: BRAND, request: SubjectDiscoverySearchRequestSchema.parse({ mode: "plan", subjectKeywordId: SUBJECT_ID, targeting }) }, ports);
  assert.equal(plano.status, 200);
  assert.equal((plano.body as SubjectDiscoveryPlanResponse).previousSearches, undefined);
});

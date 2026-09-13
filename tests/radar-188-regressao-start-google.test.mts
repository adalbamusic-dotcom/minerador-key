import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { describeLocalRecoveryFailure, localRecoveryWarning, LOCAL_RECOVERY_SAVED } from "../lib/editorial/local-recovery.ts";
import { recoverRadarSerpSnapshot } from "../lib/radar/serp-recovery.ts";
import { radarPhase1Action } from "../lib/radar/serp-phase1.ts";
import type { SerpCollectionRecord } from "../lib/editorial/contracts.ts";
import { comProductShell, montarRadar, React } from "./radar-dom-harness.mts";
import { RadarR3Workbench } from "../modules/radar/radar-r3-workbench.tsx";
import { SupabaseSessionProvider } from "../components/auth/supabase-session-context.tsx";
import { GlobalNoticeProvider } from "../components/global-notice-center.tsx";
import { buildRadarDeepResearchView } from "../lib/radar/deep-research-view.ts";
import { startRadarDeepResearch } from "../lib/radar/deep-research.ts";
import { buildRadarResearchQueryPlan } from "../lib/radar/research-query-plan.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarR3Model } from "../lib/radar/r3-workbench.ts";

/*
 * ======  RADAR · GATE 18.8 — A REGRESSÃO DO START GOOGLE  ===============
 *
 * O QUE ACONTECEU, EM UMA FRASE: uma gravação no `localStorage` do navegador
 * tinha poder de veto sobre uma coleta que o DataForSEO já havia entregue e
 * cobrado.
 *
 * A ordem em `collectSerp` era:
 *
 *     1. POST /api/editorial/serp   → o provider responde, a rota grava
 *     2. SerpCollectionRecordSchema.parse(body.record)
 *     3. saveLocalSerpRecovery(...)  → serializa o WORKSPACE INTEIRO
 *     4. if (falhou) throw          ← aqui o resultado pago era descartado
 *     5. updateWorkspace(...)        ← nunca alcançado
 *
 * O `throw` do passo 4 acontecia DEPOIS do gasto e ANTES do estado. A tela
 * voltava a dizer "Não iniciado" sobre uma pesquisa que existiu de verdade, e
 * o único caminho oferecido para sair desse estado era clicar em "Iniciar
 * pesquisa" de novo — outra coleta, outra fatura. A própria base de código já
 * declarava a doutrina certa no efeito de re-gravação do mesmo arquivo:
 * "Recovery is best-effort and must never interrupt an editorial action."
 *
 * O `catch` sem binding agravava: quota estourada, contrato divergente e
 * ausência de `window` viravam a mesma frase muda.
 *
 * O QUE ESTE GATE PROVA:
 *   A, B  a falha local é NOMEADA e a frase não acusa a operação
 *   C, D  memória primeiro, cache depois — nos três caminhos que erravam
 *   E     nenhum `throw` continua atrelado à cópia local
 *   F–H   a recuperação escolhe o snapshot certo, ou recusa com motivo
 *   I     a rota recupera LENDO; nenhum provider no caminho
 *   J     o rótulo do START diz ONDE, e a explicação existe
 *   K     um botão primário só, para os dois lugares de render
 *   L     o guarda cobre a rodada inteira e é liberado em `finally`
 *   M     o botão de recuperar só existe onde a perda é possível
 *   N     PROVIDER_CALLS = 0, provado
 *
 * NADA DE VÍDEOS · NADA DE VIDEOBRIEFS · NENHUMA MIGRATION.
 */

/* ======================  N · A SENTINELA DE REDE  ====================== */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    const alvo = typeof entrada === "string" ? entrada : String((entrada as { url?: string })?.url || entrada);
    tentativasDeRede.push(alvo);
    return Promise.reject(new Error(`REDE PROIBIDA NESTE GATE: ${alvo}`));
  },
  writable: true, configurable: true,
});

const contextoDoPipeline = () => readFileSync(new URL("../components/editorial-pipeline-context.tsx", import.meta.url), "utf8");
const rota = () => readFileSync(new URL("../app/api/editorial/serp/route.ts", import.meta.url), "utf8");
const workbench = () => readFileSync(new URL("../modules/radar/radar-r3-workbench.tsx", import.meta.url), "utf8");
const pagina = () => readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");

/**
 * O trecho entre duas âncoras verificadas.
 *
 * `indexOf` devolve -1 quando não acha, e `slice(-1, n)` produz um pedaço
 * plausível de arquivo errado — o tipo de falso verde que este gate existe
 * para não repetir. Por isso as duas âncoras são exigidas antes do corte.
 */
function trecho(fonte: string, de: string, ate: string): string {
  const inicio = fonte.indexOf(de);
  assert.notEqual(inicio, -1, `âncora inicial ausente: ${de}`);
  const fim = fonte.indexOf(ate, inicio + de.length);
  assert.notEqual(fim, -1, `âncora final ausente: ${ate}`);
  return fonte.slice(inicio, fim);
}

/* ==========  A · A FALHA LOCAL TEM NOME  ============================== */

test("RADAR 18.8 · A — quota, contrato e desconhecida são três causas, não uma", () => {
  const quotaPorNome = Object.assign(new Error("cheio"), { name: "QuotaExceededError" });
  const quotaPorCodigo = Object.assign(new Error("cheio"), { name: "Error", code: 22 });
  const quotaFirefox = Object.assign(new Error("cheio"), { name: "NS_ERROR_DOM_QUOTA_REACHED" });
  const contrato = { issues: [{ path: ["serpRecords", 0, "research"], message: "Required" }] };

  for (const [rotulo, erro] of [["nome", quotaPorNome], ["código legado", quotaPorCodigo], ["Firefox", quotaFirefox]] as const) {
    assert.match(describeLocalRecoveryFailure(erro), /armazenamento local do navegador está cheio/, `quota por ${rotulo}`);
  }

  const doContrato = describeLocalRecoveryFailure(contrato);
  assert.match(doContrato, /contrato de recuperação/);
  assert.match(doContrato, /serpRecords\.0\.research/, "o caminho recusado é dito, não escondido");
  assert.doesNotMatch(doContrato, /cheio/, "contrato divergente não é quota");

  const desconhecida = describeLocalRecoveryFailure({});
  assert.match(desconhecida, /não identificada/);
  assert.doesNotMatch(desconhecida, /cheio|contrato/, "desconhecida não se disfarça de causa conhecida");

  /* E as três são REALMENTE diferentes entre si. */
  const frases = new Set([describeLocalRecoveryFailure(quotaPorNome), doContrato, desconhecida]);
  assert.equal(frases.size, 3, "colapsar as causas é o defeito que este gate corrigiu");

  assert.deepEqual(LOCAL_RECOVERY_SAVED, { saved: true, reason: null });
});

/* ==========  B · A FRASE NÃO ACUSA A OPERAÇÃO  ======================== */

test("RADAR 18.8 · B — o aviso diz que a coleta NÃO precisa ser refeita", () => {
  const frase = localRecoveryWarning({ operation: "A coleta real da SERP", reason: "o armazenamento local do navegador está cheio (quota excedida)", remoteConfirmed: true });

  assert.match(frase, /não precisa ser refeita/, "sem isto a pessoa clica de novo — e paga de novo");
  assert.match(frase, /salva remotamente/);
  assert.match(frase, /cópia de recuperação no navegador/, "o responsável é nomeado");
  assert.match(frase, /quota excedida/, "e a causa viaja junto");

  /*
   * A frase antiga dizia só "a recuperação local não pôde ser salva" — ela era
   * verdadeira e produziu exatamente a conclusão errada. Ela não pode voltar.
   */
  assert.doesNotMatch(frase, /^A coleta real foi concluída, mas a recuperação local não pôde ser salva\.$/);
});

/* ==========  C e D · MEMÓRIA PRIMEIRO, CACHE DEPOIS  ================== */

test("RADAR 18.8 · C — a coleta entra no estado ANTES da cópia local", () => {
  const corpo = trecho(contextoDoPipeline(), "collectSerp: async (articleId, location, articleDnaVersionId) => {", "collectAuxiliarySerp:");

  const ondeGravaEstado = corpo.indexOf("updateWorkspace(current => ({ ...current, serpRecords:");
  const ondeSalvaCache = corpo.indexOf("saveLocalSerpRecovery(");
  assert.notEqual(ondeGravaEstado, -1, "a coleta precisa entrar no estado");
  assert.notEqual(ondeSalvaCache, -1, "a cópia local continua existindo");

  /*
   * ORDEM, NÃO PRESENÇA.
   *
   * As duas linhas existiam antes e existem agora; o defeito era a ordem entre
   * elas somada ao `throw` no meio. Asserção sobre presença passaria verde
   * exatamente no código quebrado.
   */
  assert.ok(ondeSalvaCache < ondeGravaEstado, "a cópia é calculada antes, mas o estado é gravado na MESMA expressão que a consome");
  assert.match(corpo, /localRecoveryWarning: recuperacao\.saved \? null : localRecoveryWarning\(/, "a falha vira aviso, dentro da mesma escrita de estado");

  /*
   * E O AVISO CHEGA À TELA.
   *
   * Guardar a frase num campo do workspace e não renderizá-la seria o mesmo
   * silêncio do `catch` mudo, com mais código. O aviso tem lugar próprio, fora
   * do `notice`, porque ele coexiste com a mensagem de sucesso da coleta.
   */
  const tela = pagina();
  assert.match(tela, /pipeline\.localRecoveryWarning && <div[^>]*data-testid="radar-local-recovery-warning"/, "o aviso precisa ser renderizado");
  assert.match(tela, /\{pipeline\.localRecoveryWarning\}<\/div>/, "e o texto exibido é o do próprio aviso");
});

test("RADAR 18.8 · D — revisão e análise do Radar tinham o mesmo defeito", () => {
  const fonte = contextoDoPipeline();

  const revisao = trecho(fonte, "reviewSerp: async (articleId, snapshotId, status, notes) => {", "simulateProductEvidence:");
  assert.match(revisao, /const recuperacaoDaRevisao = actorUserId/);
  assert.equal(/if \(!actorUserId \|\| !saveLocalSerpRecovery\([^)]*\)\) throw/.test(revisao), false, "a revisão aplicada não volta atrás por causa do cache");

  const analise = trecho(fonte, "const recuperacaoDaAnalise = actorUserId", "reviewSerp:");
  /*
   * RADAR 18.10: o workspace que vai ao cache é o SEM afirmação de autoridade
   * remota — senão o F5 ressuscitaria "Finalizado" a partir do `localStorage`.
   * A garantia deste gate (a cópia não veta a operação) segue idêntica.
   */
  assert.match(analise, /saveLocalRadarAnalysisRecovery\(actorUserId, selectedBrandId, workspaceLocal\)/);
  assert.match(analise, /localRecoveryWarning: recuperacaoDaAnalise\.saved \? null :/);
});

/* ==========  E · NENHUM `throw` ATRELADO AO CACHE  ==================== */

test("RADAR 18.8 · E — a cópia do navegador perdeu o poder de veto, nos três caminhos", () => {
  const fonte = contextoDoPipeline();

  /*
   * A varredura é sobre a FORMA do veto, não sobre a mensagem: trocar o texto
   * do erro e manter o `throw` deixaria o defeito intacto com outro nome.
   */
  assert.equal(/!saveLocalSerpRecovery\(/.test(fonte), false, "nenhuma negação da gravação local governa o fluxo");
  assert.equal(/!saveLocalRadarAnalysisRecovery\(/.test(fonte), false);
  assert.equal(/recuperação local não pôde ser salva/.test(fonte), false, "a frase que mandava refazer saiu");

  /* E as duas funções passaram a devolver a CAUSA, não um booleano mudo. */
  assert.match(fonte, /function saveLocalSerpRecovery\([^)]*\): LocalRecoveryOutcome/);
  assert.match(fonte, /function saveLocalRadarAnalysisRecovery\([^)]*\): LocalRecoveryOutcome/);
  assert.match(fonte, /\} catch \(error\) \{\s*\r?\n\s*return \{ saved: false, reason: describeLocalRecoveryFailure\(error\) \};/);
  assert.equal(/\} catch \{\s*\r?\n\s*return false;/.test(fonte), false, "o catch mudo não volta");
});

/* ==========  F, G e H · A RECUPERAÇÃO ESCOLHE, OU RECUSA COM MOTIVO  == */

const snapshot = (patch: { id: string; version: number; dna?: string; origin?: string; isMock?: boolean }): SerpCollectionRecord => ({
  id: patch.id,
  input: { keyword: "skincare para pele oleosa", articleId: "a", location: "Brasil", language: "pt-BR", device: "desktop" },
  status: "needs_review", provider: "dataforseo", origin: patch.origin ?? "real", isMock: patch.isMock ?? false,
  snapshot: null, research: { brandId: "b", articleId: "a", articleDnaVersionId: patch.dna ?? "dna-atual", version: patch.version },
  persistenceMode: "remote", cost: null, error: null,
} as unknown as SerpCollectionRecord);

test("RADAR 18.8 · F — sem nada gravado, a recuperação diz isso e não inventa registro", () => {
  const vazio = recoverRadarSerpSnapshot({ records: [], articleId: "a", articleDnaVersionId: "dna-atual" });
  assert.equal(vazio.state, "NOTHING_PERSISTED");
  assert.equal(vazio.record, null);
  assert.match(vazio.reason, /Não há coleta real gravada/);

  /* Outro artigo não conta como este. */
  const deOutroArtigo = recoverRadarSerpSnapshot({
    records: [{ ...snapshot({ id: "s1", version: 1 }), input: { ...snapshot({ id: "s1", version: 1 }).input, articleId: "outro" } } as SerpCollectionRecord],
    articleId: "a", articleDnaVersionId: "dna-atual",
  });
  assert.equal(deOutroArtigo.state, "NOTHING_PERSISTED");
});

test("RADAR 18.8 · G — coleta de outra versão do ArticleDNA é recusada, e o motivo é dito", () => {
  const antiga = recoverRadarSerpSnapshot({
    records: [snapshot({ id: "s1", version: 1, dna: "dna-antiga" })],
    articleId: "a", articleDnaVersionId: "dna-atual",
  });
  assert.equal(antiga.state, "OTHER_ARTICLE_DNA_VERSION");
  assert.equal(antiga.record, null);
  assert.match(antiga.reason, /outra versão do ArticleDNA/);
  assert.match(antiga.reason, /1 coleta/, "quantas existem é informação, não ruído");

  /*
   * E as duas recusas são DISTINGUÍVEIS: colapsá-las mandaria refazer uma
   * pesquisa que existe, ou aproveitar uma que descreve outro artigo.
   */
  const nada = recoverRadarSerpSnapshot({ records: [], articleId: "a", articleDnaVersionId: "dna-atual" });
  assert.notEqual(antiga.state, nada.state);
  assert.notEqual(antiga.reason, nada.reason);
});

test("RADAR 18.8 · H — recupera a maior versão, e nunca um simulado", () => {
  const recuperada = recoverRadarSerpSnapshot({
    records: [snapshot({ id: "s1", version: 1 }), snapshot({ id: "s3", version: 3 }), snapshot({ id: "s2", version: 2 })],
    articleId: "a", articleDnaVersionId: "dna-atual",
  });
  assert.equal(recuperada.state, "RECOVERED");
  assert.equal(recuperada.record?.id, "s3", "a ordem vem da versão do snapshot, não da ordem de chegada");
  assert.match(recuperada.reason, /v3/);
  assert.match(recuperada.reason, /Nenhuma consulta nova/, "recuperar não gasta, e isso é dito");

  /* Mock e simulação não entram: seriam pior do que não recuperar nada. */
  const soMock = recoverRadarSerpSnapshot({
    records: [snapshot({ id: "m1", version: 9, isMock: true }), snapshot({ id: "m2", version: 8, origin: "simulated" })],
    articleId: "a", articleDnaVersionId: "dna-atual",
  });
  assert.equal(soMock.state, "NOTHING_PERSISTED");

  const misturado = recoverRadarSerpSnapshot({
    records: [snapshot({ id: "m1", version: 9, isMock: true }), snapshot({ id: "s1", version: 2 })],
    articleId: "a", articleDnaVersionId: "dna-atual",
  });
  assert.equal(misturado.record?.id, "s1", "o mock de versão maior não vence a coleta real");
});

/* ==========  I · A ROTA RECUPERA LENDO  =============================== */

test("RADAR 18.8 · I — sem snapshotId a rota responde pelo que já está gravado, sem provider", () => {
  const fonte = rota();
  const get = trecho(fonte, "export async function GET(request: NextRequest)", "export async function POST(request: NextRequest)");

  assert.match(get, /if \(!input\.snapshotId\) \{/, "o ramo de recuperação existe");
  assert.match(get, /recoverRadarSerpSnapshot\(\{ records: history\.records/, "e consulta a autoridade do domínio");
  assert.match(get, /recovery: recuperacao\.state/, "o estado viaja para o cliente");
  assert.match(get, /recoveryReason: recuperacao\.reason/);

  /*
   * O QUE NÃO PODE ESTAR AQUI — §3 e §11.
   *
   * Nenhuma chamada paga, nenhuma contabilização de uso: este caminho existe
   * justamente para não cobrar de novo pelo que já foi cobrado.
   */
  assert.equal(/collectDataForSeoSerpSnapshot/.test(get), false, "PROVIDER_IN_RECOVERY = NO");
  assert.equal(/recordIntegrationUsage/.test(get), false, "recuperar não consome cota");
  assert.equal(/resolveDataForSeoCanonicalSerpCompatibilityConfig/.test(get), false);

  /* E com snapshotId o comportamento antigo continua: confirmação exata. */
  assert.match(fonte, /snapshotId: z\.string\(\)\.min\(1\)\.nullable\(\)\.default\(null\)/, "o id deixou de ser obrigatório sem deixar de ser aceito");
  assert.match(get, /O snapshot SERP não pertence à versão atual do ArticleDNA/, "a recusa por versão continua de pé");
});

/* ==========  J · O RÓTULO DIZ ONDE, E A EXPLICAÇÃO EXISTE  ============ */

const acaoBase = {
  contextReady: true, hasPrimaryQuery: true, running: false,
  selected: 0, pending: 0, failed: 0, analyzed: 0,
} as const;

test("RADAR 18.8 · J — o START nomeia o destino e carrega o ⓘ; erro e estado ficam fora dele", () => {
  const google = radarPhase1Action({ ...acaoBase, state: "NOT_STARTED" });
  assert.equal(google.label, "Iniciar Pesquisa Google");
  assert.equal(google.id, "START_RESEARCH", "o id e o handler não mudaram com o rótulo");

  const youtube = radarPhase1Action({ ...acaoBase, state: "NOT_STARTED", mode: "YOUTUBE" });
  assert.equal(youtube.label, "Iniciar Pesquisa YouTube");
  assert.notEqual(google.label, youtube.label, "o modo precisa CHEGAR ao texto");

  const refazer = radarPhase1Action({ ...acaoBase, state: "STALE" });
  assert.equal(refazer.label, "Refazer Pesquisa Google");

  /* O ⓘ explica: a que área pertence, o que produz e que é pago. */
  assert.ok(google.info, "sem explicação o botão volta a aparecer mudo fora da área Pesquisa");
  assert.match(google.info!, /área Pesquisa/);
  assert.match(google.info!, /consulta paga/);
  assert.match(google.info!, /Google/);
  assert.match(youtube.info!, /YouTube/);

  /*
   * O TOOLTIP NÃO ENGOLE ESTADO NEM ERRO.
   *
   * Um bloqueio escondido atrás do ⓘ é um bloqueio que ninguém lê. Onde há
   * `blockedReason`, ele continua sendo campo próprio.
   */
  const semContexto = radarPhase1Action({ ...acaoBase, state: "NOT_STARTED", contextReady: false });
  assert.equal(semContexto.info, null, "ação indisponível não ganha explicação de ação disponível");
  assert.match(semContexto.blockedReason!, /contexto do artigo/);

  const amazon = radarPhase1Action({ ...acaoBase, state: "NOT_STARTED", mode: "AMAZON" });
  assert.equal(amazon.id, "NONE", "modo sem engine não oferece START");
  assert.equal(amazon.info, null);
});

/* ==========  K · UM BOTÃO PRIMÁRIO, DOIS LUGARES DE RENDER  =========== */

test("RADAR 18.8 · K — o rótulo e o ⓘ não podem divergir entre as áreas", () => {
  const fonte = workbench();

  assert.equal((fonte.match(/data-testid="radar-deep-research-button"/g) || []).length, 1, "um só lugar declara o botão");
  assert.equal((fonte.match(/acao\.id !== "NONE" && <Phase1Button acao=\{acao\}/g) || []).length, 2, "e os dois lugares o consomem");

  const componente = trecho(fonte, "function Phase1Button(", "function RecoverSerpAction(");
  assert.match(componente, /onClick=\{onTrigger\}/, "o clique é o único caminho");
  assert.match(componente, /acao\.info && <InfoHint title=\{acao\.label\} description=\{acao\.info\}/);
  assert.match(componente, /title=\{acao\.blockedReason \|\| undefined\}/, "o bloqueio continua no botão, não no tooltip");

  /* E o slot da primeira camada continua mostrando motivo/hint em texto visível. */
  const slot = trecho(fonte, "function Phase1Slot(", "* O ARTIGO INVESTIGADO");
  assert.match(slot, /\(acao\.blockedReason \|\| acao\.hint\) && <p /, "estado e erro ficam legíveis sem passar o mouse");
});

/* ==========  L · O GUARDA COBRE A RODADA INTEIRA  ===================== */

test("RADAR 18.8 · L — um clique, uma pesquisa; e o segundo é recusado em voz alta", () => {
  const fonte = pagina();
  const invólucro = trecho(fonte, "const startDeepResearch = async () => {", "* A PESQUISA PROFUNDA COMEÇA AQUI");

  /*
   * A PORTA PRECISA OLHAR O REF QUE FECHA PRIMEIRO.
   *
   * `busyArticleId` é estado de render e chega tarde; `collectingArticleIdRef`
   * fecha antes do primeiro await. Sem ele no guarda, o segundo clique chegava
   * a `collect`, recebia FAILED_RETRYABLE e voltava MUDO.
   */
  assert.match(invólucro, /pesquisaEmVooRef\.current \|\| collectingArticleIdRef\.current \|\| serpActionRef\.current/);
  assert.match(invólucro, /setNotice\("A pesquisa deste artigo já está em andamento[^"]*consulta paga/, "a recusa é dita, e diz o custo");
  assert.match(invólucro, /pesquisaEmVooRef\.current = target\.articleId;/);
  assert.match(invólucro, /finally \{\s*\r?\n\s*pesquisaEmVooRef\.current = null;/, "e a porta reabre mesmo se a rodada explodir");

  /*
   * O REF COBRE O LAÇO DAS AUXILIARES — onde não havia guarda nenhum e cada
   * iteração é uma consulta paga.
   */
  const rodada = trecho(fonte, "const rodadaDePesquisaProfunda = async () => {", "const recuperarPesquisaPaga = async () => {");
  assert.match(rodada, /collectAuxiliarySerp\(/, "o laço pago continua aqui dentro");
  assert.equal(/pesquisaEmVooRef\.current = null/.test(rodada), false, "e a rodada não solta a porta antes da hora");

  /* Recuperar é leitura: ela não passa pelo guarda de coleta, mas respeita o em-voo. */
  const recuperar = trecho(fonte, "const recuperarPesquisaPaga = async () => {", "const finalizeInvestigation = async () => {");
  assert.match(recuperar, /pipeline\.recoverSerp\(target\.articleId\)/);
  assert.equal(/collectSerp\(|collectAuxiliarySerp/.test(recuperar), false, "RECOVERY_CALLS_PROVIDER = NO");
});

/* ==========  M · O BOTÃO DE RECUPERAR, ONDE A PERDA É POSSÍVEL  ======= */

const contexto = (): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: { brandId: "b", articleId: "a", articleDnaVersionId: "dna-188", articleDnaContentHash: "hash", promise: "Skincare para pele oleosa", mainIntent: "informacional", hierarchy: "Suporte" },
  keywords: [{
    identity: { keywordId: "kw1", canonicalKeywordId: null, sourceKeywordId: null, keywordDnaVersionId: "kdna-1", text: "skincare para pele oleosa", role: "principal" },
    strategy: { volume: 720, resultCount: 4200, kgrScore: 0.589, incrementalVolume: null, contribution: null, normalizedIntent: "informacional", coveredIntentions: [], strategicContribution: null, purpose: null, overlapRisk: null, keywordUrlRelation: null, demandEvidence: null, keywordDnaSnapshot: { payload: { centralEntity: "pele oleosa" } }, semanticQualification: { versionId: "sq-1", contentHash: "h", intent: "informacional", funnel: "TOFU", semanticState: "conclusive", collectedAt: "2026-09-01T10:00:00.000Z" } },
    resolution: "FULL",
    provenance: { textSource: "hydration", strategySource: "article_reference", keywordDnaVersionId: "kdna-1", keywordDnaContentHash: "hash-kdna" },
  }],
  editorialTopics: ["identificação da pele oleosa"],
  resolvedKeywordTexts: ["skincare para pele oleosa"],
  silo: { siloId: "silo-1", siloName: "skincare", articleRole: "SUPORTE" },
  formationSerp: null, internalLinks: null, limitations: [],
} as unknown as RadarArticleResearchContext);

const vista = (comRegistro: boolean) => buildRadarDeepResearchView({
  context: contexto(),
  record: comRegistro
    ? startRadarDeepResearch({ context: contexto(), plan: buildRadarResearchQueryPlan(contexto()), startedBy: "ator", now: "2026-09-11T09:00:00.000Z" })
    : null,
  snapshot: null as never,
  extractions: [],
  observedAt: "2026-09-11T12:00:00.000Z",
} as Parameters<typeof buildRadarDeepResearchView>[0]);

const modelo = (deepResearch: ReturnType<typeof vista>): RadarR3Model => ({
  brandId: "b", articleId: "a", articleDnaVersionId: "dna-188",
  title: "Cobrir com clareza o tema skincare para pele oleosa",
  keyword: "skincare para pele oleosa", silo: "skincare", hierarchy: "Suporte",
  articleDnaVersion: "v1", publication: "Ainda não publicado", mode: "competitive_full", article: null,
  researchContext: contexto(), deepResearch,
  serp: { provider: "dataforseo", status: "Não iniciada", resultCount: 0, primaryCount: 1, pendingCount: 0, references: [], view: null, analysis: null, latestSnapshotId: null, reviewStatus: null, reviewNotes: null, reviewCurrentness: "current", reviewedAt: null, reviewHistory: [], capturedAt: null },
  amazon: { state: "AMAZON_NOT_APPLICABLE", note: "" },
  content: { articleDnaVersion: "v1", principal: "skincare para pele oleosa", needs: 0, evidenceCount: 0, sourceCount: 0, rows: [], technical: { brandId: "b", articleId: "a", articleDnaVersionId: "dna-188", siloId: null, snapshotId: null, provider: null, articleDnaEntityId: null, articleDnaHash: null } },
  specialist: { expert: "Não selecionado", specialty: "", status: "Não iniciado", channel: "", requestsSent: 0, contributionsReceived: 0, reviewedEvidence: 0, pending: 0, existingContent: "Nenhum material" },
  report: { status: "Aguardando", version: null, needs: 0, summary: "", approved: false, sentToPlanner: false, updatedAt: null },
  nextAction: "", lastActivity: null,
  provenance: { brandId: "b", articleId: "a", articleDnaVersionId: "dna-188", siloId: null, snapshotId: null, provider: null },
} as unknown as RadarR3Model);

async function montarTela(comRegistro: boolean, comRecuperacao = true) {
  const chamadas = { recuperar: 0, iniciar: 0 };
  const tela = await montarRadar();
  const props: Record<string, unknown> = {
    model: modelo(vista(comRegistro)), refreshing: false,
    onStartDeepResearch: () => { chamadas.iniciar += 1; },
    onOpenArticle: () => {}, onOpenDetail: () => {},
  };
  if (comRecuperacao) props.onRecoverSerp = () => { chamadas.recuperar += 1; };
  await tela.render(comProductShell(React.createElement(
    SupabaseSessionProvider, null,
    React.createElement(GlobalNoticeProvider, null, React.createElement(RadarR3Workbench, props as never)),
  )));
  return { tela, chamadas };
}

test("RADAR 18.8 · M — recuperar só aparece onde a perda é possível, e não coleta", async () => {
  /* NOT_STARTED é exatamente o estado que o defeito produzia sobre uma coleta real. */
  const naoIniciada = await montarTela(false);
  const botao = naoIniciada.tela.get("radar-recover-serp");
  assert.match(botao.textContent || "", /Recuperar pesquisa já paga/);

  await naoIniciada.tela.click(botao);
  assert.equal(naoIniciada.chamadas.recuperar, 1, "o clique chega ao handler de leitura");
  assert.equal(naoIniciada.chamadas.iniciar, 0, "e nunca ao de coleta");
  naoIniciada.tela.destroy();

  /* Com investigação em curso não há o que recuperar: o botão some. */
  const emCurso = await montarTela(true);
  assert.equal(emCurso.tela.query("radar-recover-serp"), null, "RECOVERY_VISIBLE_WHEN_STARTED = NO");
  emCurso.tela.destroy();

  /* E sem handler ele não é oferecido — nada de botão morto. */
  const semHandler = await montarTela(false, false);
  assert.equal(semHandler.tela.query("radar-recover-serp"), null);
  semHandler.tela.destroy();
});

/* ==========  N · A CONTA DA REDE  ===================================== */

test("RADAR 18.8 · N — nenhuma chamada de rede saiu desta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `PROVIDER_CALLS = 0 — tentativas: ${tentativasDeRede.join(", ")}`);
});

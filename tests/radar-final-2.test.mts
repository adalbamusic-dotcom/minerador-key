import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  RADAR_ANALYSIS_HEAVY_FIELDS,
  pruneRadarAnalysisHistory,
  radarAnalysisVersionsToPreserve,
} from "../lib/radar/analysis-history-pruning.ts";
import { normalizeDataForSeoAmazonResponse } from "../lib/server/dataforseo-amazon-operation.ts";
import { buildRadarAmazonUniverse } from "../lib/radar/amazon-search-model.ts";
import { buildRadarAmazonSearchRun, buildRadarAmazonRunFingerprint } from "../lib/radar/amazon-search-run.ts";
import { amazonCompetitiveBlueprintOfAnalysis } from "../lib/radar/amazon-editorial.ts";
import { freezeRadarAmazonInvestigation } from "../lib/radar/amazon-evidence.ts";
import { radarResearchProfileStateOfAnalysis } from "../lib/radar/research-profile-state.ts";

/*
 * ===== RADAR_FINAL_2 · PAYLOAD, LAZY E CAMINHOS MORTOS =====
 *
 * Este gate não acrescenta capacidade editorial. Ele mede, aliviana o
 * transporte e prova que nada da SEMÂNTICA se perdeu no caminho.
 *
 * PROVIDER_CALLS = 0, com sentinela no fim.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const semComentarios = (fonte: string) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

const payloadAmazon = JSON.parse(
  await readFile(new URL("./fixtures/dataforseo-amazon-discovery.json", import.meta.url), "utf8"),
);

const fonteDaRotaDeAnalise = await readFile(new URL("../app/api/editorial/radar-analysis/route.ts", import.meta.url), "utf8");
const fonteDoPainelAmazon = await readFile(new URL("../modules/radar/radar-amazon-search-panel.tsx", import.meta.url), "utf8");
const fonteDoPainelYoutube = await readFile(new URL("../modules/radar/radar-youtube-search-panel.tsx", import.meta.url), "utf8");
const fonteDaPagina = await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
const fonteDoContexto = await readFile(new URL("../components/editorial-pipeline-context.tsx", import.meta.url), "utf8");
const fonteDoEnvelope = await readFile(new URL("../lib/radar/planner-handoff.ts", import.meta.url), "utf8");

/* ============================ a investigação real ============================ */

const corridaAmazon = () => {
  const normalizada = normalizeDataForSeoAmazonResponse(payloadAmazon, "amzq:1");
  return buildRadarAmazonSearchRun({
    runId: "run-amz-1", runVersion: 1,
    startedAt: "2026-09-15T12:00:00.000Z", startedBy: "user-1",
    fingerprint: buildRadarAmazonRunFingerprint({ articleId: "artigo-1", articleDnaVersionId: "dna-1", queryIds: ["amzq:1"] }),
    provenance: {
      provider: "dataforseo", endpoint: "/v3/merchant/amazon/products/live/advanced",
      collectedAt: "2026-09-15T12:00:05.000Z", languageCode: "pt_BR", depth: 20,
      queriesRequested: 1, queriesSucceeded: 1, queriesFailed: 0,
    },
    queries: [{ queryId: "amzq:1", text: "protetor solar facial", origin: "PRIMARY_KEYWORD", reason: "principal", executed: true }],
    results: normalizada.results,
    universe: buildRadarAmazonUniverse(normalizada.results),
    relatedSearches: normalizada.relatedSearches,
  });
};

const congeladaAmazon = () => freezeRadarAmazonInvestigation({
  run: corridaAmazon(),
  blueprint: amazonCompetitiveBlueprintOfAnalysis({
    articleId: "artigo-1", articleDnaVersionId: "dna-1", articleDnaContentHash: "sha256:abc",
    run: corridaAmazon(), support: null,
    primaryKeyword: "protetor solar facial", declaredIntent: "comercial",
    researchRefs: [], generatedAt: "2026-09-15T13:00:00.000Z", frozenAt: null,
  }),
  finalizedBy: "user-1", finalizedAt: "2026-09-15T14:00:00.000Z",
});

const versao = (numero: number, status: string) => ({
  versionId: `v-${numero}`,
  versionNumber: numero,
  payload: {
    status,
    extractions: [],
    competitiveReport: null,
    amazonSearch: corridaAmazon(),
    amazonFrozenInvestigation: congeladaAmazon(),
    youtubeSearch: null,
  },
});

const bytes = (valor: unknown) => JSON.stringify(valor ?? null).length;

/* ======================== §1 e §23 · a medição ======================== */

test("§1 e §23 · a poda corta matéria-prima, e a medição diz quanto", () => {
  const historico = [versao(1, "draft"), versao(2, "draft"), versao(3, "draft"), versao(4, "approved"), versao(5, "draft")];

  const antes = bytes(historico);
  const depois = bytes(pruneRadarAnalysisHistory(historico));
  const reducao = ((antes - depois) / antes) * 100;

  /*
   * ============ A CONTA, SOBRE A COLETA REAL ============
   *
   * Cinco versões da mesma investigação. Três delas ninguém abre — e cada uma
   * carregava 129,7 KB de corrida que é recalculável e tem autoridade própria.
   */
  assert.ok(reducao > 50, `a poda precisa cortar mais da metade; cortou ${reducao.toFixed(1)}%`);

  /* E o que sobra são as duas que a tela abre: a corrente e a última aprovada. */
  const preservadas = radarAnalysisVersionsToPreserve(historico);
  assert.deepEqual([...preservadas].sort(), ["v-4", "v-5"]);
});

/* ============================== §24 ============================== */

test("§24 · a versão que se escreve NUNCA é podada", () => {
  /*
   * ============ A INVARIANTE QUE TORNA A PODA SEGURA ============
   *
   * Toda gravação monta a sucessora a partir da versão CORRENTE, espalhando o
   * payload dela. Se a corrente chegasse podada ao navegador, a gravação
   * seguinte persistiria `amazonSearch: null` — e a coleta paga sumiria do
   * banco sem que nada avisasse.
   *
   * A poda preserva a corrente e a última aprovada. Este teste é o que impede
   * alguém de "simplificar" a regra para podar tudo menos a última.
   */
  const historico = [versao(1, "draft"), versao(2, "approved"), versao(3, "draft")];
  const podado = pruneRadarAnalysisHistory(historico);

  const corrente = podado.find(item => item.versionId === "v-3")!;
  assert.notEqual(corrente.payload.amazonSearch, null, "a corrente perdeu a coleta");
  assert.equal(corrente.payload.amazonSearch?.universe.length, 51);

  const aprovada = podado.find(item => item.versionId === "v-2")!;
  assert.notEqual(aprovada.payload.amazonSearch, null, "a última aprovada perdeu a coleta");

  const historica = podado.find(item => item.versionId === "v-1")!;
  assert.equal(historica.payload.amazonSearch, null, "a histórica devia estar podada");

  /*
   * E A CONCLUSÃO SOBREVIVE EM TODAS — inclusive nas podadas.
   *
   * A fotografia é o que a tela mostra de uma versão antiga; podá-la faria a
   * leitura desaparecer, que é perda de semântica e não de transporte.
   */
  for (const item of podado) {
    assert.ok(item.payload.amazonFrozenInvestigation, `${item.versionId} perdeu a fotografia`);
  }
});

test("§24 · uma versão podada continua legível pela projeção de estado", () => {
  const podado = pruneRadarAnalysisHistory([versao(1, "draft"), versao(2, "draft")]);
  const historica = podado[0];

  /*
   * A FOTOGRAFIA RESPONDE SOZINHA, sem a corrida ao lado.
   *
   * Foi para isso que ela nasceu por referência: `runRef` carrega as contagens
   * congeladas, e a tela não precisa reabrir 51 produtos para dizer "51".
   */
  const projecao = radarResearchProfileStateOfAnalysis({ payload: historica.payload, profile: "AMAZON" });
  assert.equal(projecao.state, "FINALIZED");
  assert.equal(projecao.counts.videos, 51, "as contagens vêm da referência, não da coleta podada");
  assert.equal(projecao.counts.queries, 1);
});

/* ========================= §3 · o readback podado ========================= */

test("§3 · o readback por artigo também devolve o histórico podado", () => {
  const rota = semComentarios(fonteDaRotaDeAnalise);

  /*
   * A LISTAGEM JÁ PODAVA; O READBACK NÃO — e ele remontava o histórico inteiro
   * no navegador a cada gravação, desfazendo a poda para aquele artigo.
   */
  assert.match(rota, /pruneRadarAnalysisHistory\(analyses/);
  assert.match(rota, /analyses: history/);

  /*
   * E `selected` continua INTEIRO: quem pede uma versão por `versionId` está
   * pedindo justamente o conteúdo dela.
   */
  const ordem = [rota.indexOf("const selected"), rota.indexOf("const history")];
  assert.ok(ordem[0] < ordem[1], "a versão pedida é resolvida antes da poda");
  assert.match(rota, /analysis: selected \|\| null/);
});

/* ==================== §4 e §5 · amostra e proveniência ==================== */

test("§4 e §5 · amostra e proveniência continuam recolhidas, e abrir não chama nada", () => {
  for (const [nome, fonte] of [["amazon", fonteDoPainelAmazon], ["youtube", fonteDoPainelYoutube]] as const) {
    const painel = semComentarios(fonte);

    /*
     * ABRIR UM DISCLOSURE É LEITURA DO QUE JÁ ESTÁ NA MÃO.
     *
     * Nenhum dos dois painéis busca nada ao abrir: o universo veio na versão
     * corrente, que é a única não podada. Um fetch aqui transformaria um clique
     * de curiosidade numa ida ao servidor — ou, pior, numa coleta.
     */
    assert.equal(/\bfetch\(/.test(painel), false, `${nome}: o painel busca ao abrir`);
    assert.equal(/onToggle=\{[^}]*fetch|onClick=\{[^}]*executeDataForSeo/.test(painel), false, `${nome}: abrir dispara provider`);
  }

  /*
   * §29 do gate anterior · a amostra da Amazon vem fechada.
   *
   * 1.3 · §8 tornou a regra mais forte: era fechada DEPOIS da análise
   * (`open={projecao.sampleDefaultExpanded && !analisado}`) e passou a nascer
   * fechada sempre. A asserção vira a ausência do atributo.
   */
  assert.equal(
    /open=\{projecao\.sampleDefaultExpanded/.test(semComentarios(fonteDoPainelAmazon)),
    false,
    "a amostra da Amazon nasce fechada, sem condição",
  );
  /*
   * E A PROVENIÊNCIA NASCE RECOLHIDA — ela não recebe o atributo `open`.
   *
   * A auditoria é do ATRIBUTO JSX, não da palavra: desde o RADAR_FINAL_2.1 o
   * `onToggle` lê `.open` do elemento para saber se deve buscar, e procurar a
   * palavra solta acusaria justamente o mecanismo do lazy.
   */
  const proveniencia = fonteDoPainelAmazon.slice(
    fonteDoPainelAmazon.indexOf('data-testid="radar-amazon-provenance"') - 600,
    fonteDoPainelAmazon.indexOf('data-testid="radar-amazon-provenance"'),
  );
  assert.equal(/<details[^>]*\sopen[\s>]|\sopen=\{/.test(proveniencia), false, "a proveniência abre por padrão");
});

/* ======================= §11 e §12 · caminhos mortos ======================= */

test("§11 · nenhum caminho morto continua alcançável em runtime", () => {
  const pagina = semComentarios(fonteDaPagina);
  const contexto = semComentarios(fonteDoContexto);

  /*
   * ============ O QUE FOI AUDITADO, UM POR UM ============
   *
   * `importApprovedToPlanner`  REMOVIDO no 1.2 — movia a esteira sem dossiê.
   * `buildRadarPlannerEvidenceHandoff`  TEST_ONLY — depreciado, sem runtime.
   * `RadarPlannerHandoffV3`  TEST_ONLY — depreciado, exercitado pelo Gate 16.
   *
   * Um caminho morto que ainda FUNCIONA é uma arma carregada: alguém o
   * encontraria e voltaria a usá-lo.
   */
  for (const [nome, fonte] of [["página", pagina], ["contexto", contexto]] as const) {
    assert.equal(/importApprovedToPlanner/.test(fonte), false, `${nome} conhece o caminho removido`);
    assert.equal(/buildRadarPlannerEvidenceHandoff/.test(fonte), false, `${nome} monta o envelope depreciado`);
  }

  /* §12 · e o envelope continua marcado, para ninguém o tomar por ativo. */
  assert.match(fonteDoEnvelope, /@deprecated Use `RadarEvidenceBundle` \(V3\)/);
  assert.match(fonteDoEnvelope, /@deprecated §6 · Use `sendRadarToPlanner`/);
});

/* ===================== §15 · IDs técnicos na visão normal ===================== */

test("§15 · nenhum ID técnico aparece fora da proveniência", () => {
  const painel = semComentarios(fonteDoPainelAmazon);
  /*
   * A FATIA COMEÇA NA ÁRVORE JSX — preparar um dado não é mostrá-lo.
   *
   * Desde o RADAR_FINAL_2.1 a leitura técnica é montada antes do `return` para
   * ser entregue ao disclosure; medir o arquivo inteiro acusaria a preparação.
   */
  const arvore = painel.slice(painel.indexOf('return <section className="mt-3 space-y-3"'));
  const antesDaProveniencia = arvore.slice(0, arvore.indexOf('data-testid="radar-amazon-provenance"'));
  assert.ok(antesDaProveniencia.length > 0, "a fatia da visão normal existe");

  /*
   * runId, assinatura e endpoint existem para CONFERÊNCIA. Na visão normal eles
   * só competem com a leitura — e quem decide não decide olhando para
   * `run-amz-1`.
   */
  assert.equal(/run\.runId|fingerprint\.signature|provenance\.endpoint|bundleHash/.test(antesDaProveniencia), false);
  /* E nenhum JSON cru é despejado na tela. */
  assert.equal(/JSON\.stringify/.test(painel), false, "a tela despeja JSON");
});

/* ================== §12 do 1.1 · a autoridade é remota ================== */

test("§21 · nada crítico do Radar depende de localStorage", () => {
  const pagina = semComentarios(fonteDaPagina);

  /*
   * O ESTADO QUE IMPORTA VEM DO SERVIDOR: fotografia, envio, decisão do
   * especialista, associação de vídeo. Cache local como autoridade faria duas
   * pessoas verem investigações diferentes do mesmo artigo.
   */
  const trechosCriticos = [
    pagina.slice(pagina.indexOf("const fronteiraDoPlanejador"), pagina.indexOf("const enviarAoPlanejador")),
    pagina.slice(pagina.indexOf("const projecaoAmazon"), pagina.indexOf("const planoAmazon")),
  ];
  for (const trecho of trechosCriticos) {
    assert.ok(trecho.length > 0);
    assert.equal(/localStorage|sessionStorage/.test(trecho), false);
  }
});

/* ========================= §8 · frozen vence live ========================= */

test("§8 · finalizado lê a fotografia, e não recalcula nada", () => {
  const comCorrida = radarResearchProfileStateOfAnalysis({
    payload: { amazonSearch: corridaAmazon(), amazonFrozenInvestigation: congeladaAmazon() },
    profile: "AMAZON",
  });
  const semCorrida = radarResearchProfileStateOfAnalysis({
    payload: { amazonSearch: null, amazonFrozenInvestigation: congeladaAmazon() },
    profile: "AMAZON",
  });

  /*
   * A LEITURA É IDÊNTICA COM E SEM A COLETA AO LADO.
   *
   * É essa igualdade que prova que a fotografia responde sozinha — e que podar
   * a corrida de uma versão histórica não muda o que a tela diz sobre ela.
   */
  assert.deepEqual(semCorrida, comCorrida);
  assert.equal(comCorrida.state, "FINALIZED");
});

test("§16 · um evento de domínio, no máximo uma notificação", () => {
  const pagina = semComentarios(fonteDaPagina);

  /*
   * ============ READBACK, RENDER E REALTIME NÃO NOTIFICAM ============
   *
   * Uma notificação por RE-RENDER apareceria em F5, em troca de artigo e a
   * cada chegada de realtime — e quem opera aprenderia a ignorá-las todas,
   * inclusive a que importa.
   */
  const efeitos = [...pagina.matchAll(/useEffect\(/g)].map(item => item.index || 0);
  for (const inicio of efeitos) {
    const corpo = pagina.slice(inicio, inicio + 2500);
    const fim = corpo.indexOf("}, [");
    if (fim <= 0) continue;
    assert.equal(/setNotice\(/.test(corpo.slice(0, fim)), false, "um efeito notifica a cada render");
  }

  /*
   * E CADA HANDLER NOTIFICA UMA VEZ POR DESFECHO.
   *
   * As chamadas que sobram são caminhos MUTUAMENTE EXCLUSIVOS — guarda, erro,
   * sucesso —, nunca duas sobre o mesmo evento. Foi somando duas frases sobre
   * a mesma coleta que a tela do 1.1 aprendeu a discordar de si mesma.
   */
  const handlers: Array<[string, string, string]> = [
    ["enviarAoPlanejador", "const enviarAoPlanejador", "const startYoutubeSearch"],
    ["acaoAmazonSemProvider", "const acaoAmazonSemProvider", "const resetAmazonSearch"],
  ];
  for (const [nome, inicio, fim] of handlers) {
    const fatia = pagina.slice(pagina.indexOf(inicio), pagina.indexOf(fim));
    assert.ok(fatia.length > 0, `${nome}: fatia vazia`);
    const sucessos = (fatia.match(/setNotice\(corpo\.headline|setNotice\(resultado\.message/g) || []).length;
    assert.equal(sucessos, 1, `${nome} notifica o sucesso mais de uma vez`);
    /*
     * E A RELEITURA DO BANCO NÃO VIRA UMA SEGUNDA FRASE.
     *
     * A contagem é do CAMINHO DE SUCESSO — do readback até o `catch`. O `catch`
     * também notifica, e deve: ele é o outro desfecho do mesmo evento, nunca um
     * segundo aviso sobre o mesmo.
     */
    const inicioDoSucesso = fatia.indexOf("reloadRadarAnalysis");
    const fimDoSucesso = fatia.indexOf("} catch", inicioDoSucesso);
    const caminhoFeliz = fatia.slice(inicioDoSucesso, fimDoSucesso > 0 ? fimDoSucesso : undefined);
    assert.equal((caminhoFeliz.match(/setNotice\(/g) || []).length, 1, `${nome} notifica duas vezes o mesmo sucesso`);
  }
});

test("sentinela · PROVIDER_CALLS = 0", () => {
  assert.deepEqual(tentativasDeRede, []);
});

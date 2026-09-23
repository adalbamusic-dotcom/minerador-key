import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  RadarPrimaryModeConflictError,
  RadarPrimarySearchModeSchema,
  assertRadarResearchModeAllowed,
  radarPrimaryModeCommitment,
  radarPrimaryModeOfAnalysis,
  type RadarPrimarySearchMode,
} from "../lib/radar/search-mode.ts";
import {
  assertRadarPrimaryModeForRequest,
  radarAnalysisPayloadFromWorkflowRow,
} from "../lib/server/radar-primary-mode.ts";
import { RADAR_YOUTUBE_DEFAULT_BLOCK_DEPTH } from "../lib/radar/youtube-search-run.ts";

/*
 * ========  YOUTUBE_SEARCH_1.2 · AUTORIDADE DE MODO NO SERVIDOR  ========
 *
 * O 1.1 fechou a troca WEB ↔ YOUTUBE na TELA e registrou o resto como dívida.
 * Não era dívida: era integridade de domínio com consumo pago atrás. Um POST
 * direto em qualquer das duas rotas iniciava coleta num artigo já comprometido
 * com o outro universo, e a interface prometia uma coisa enquanto o servidor
 * fazia outra.
 *
 * Este arquivo prova a decisão REAL — a mesma função que roda em produção, com
 * a leitura da análise injetada. Não é auditoria de texto: é a regra executando.
 *
 * PROVIDER_CALLS_IN_TESTS = 0, com sentinela no fim.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

/* ============================== as fixturas ============================= */

/** Quantas vezes a análise foi lida. Prova que a guarda consultou o servidor. */
let leituras = 0;

const comAnalise = (payload: Record<string, unknown> | null) => {
  leituras = 0;
  return async () => { leituras += 1; return payload; };
};

/** Uma corrida de YouTube mínima — só o que a resolução de modo olha. */
const CORRIDA_YOUTUBE = { researchMode: "YOUTUBE", runId: "run-1", universe: [] };
const REGISTRO_GOOGLE = { state: "COMPLETED", queries: [] };

const conflito = async (input: { currentMode: Record<string, unknown> | null; requestedMode: RadarPrimarySearchMode }) => {
  try {
    await assertRadarPrimaryModeForRequest(
      { brandId: "marca-1", articleId: "artigo-1", requestedMode: input.requestedMode },
      { loadAnalysisPayload: comAnalise(input.currentMode) },
    );
    return null;
  } catch (erro) {
    assert.ok(erro instanceof RadarPrimaryModeConflictError, `erro inesperado: ${String(erro)}`);
    return erro;
  }
};

/* ==================== §6.A · WEB → YOUTUBE = 409 ==================== */

test("§6.A · artigo comprometido com WEB recusa START de YOUTUBE, sem tocar no provider", async () => {
  const erro = await conflito({ currentMode: { deepResearch: REGISTRO_GOOGLE, youtubeSearch: null }, requestedMode: "YOUTUBE" });

  assert.ok(erro, "WEB_TO_YOUTUBE_BLOCKED");
  assert.equal(erro.status, 409, "HTTP_CONFLICT = 409");
  assert.equal(erro.code, "RADAR_PRIMARY_MODE_CONFLICT", "o código é estável e é este");
  assert.equal(erro.currentMode, "WEB");
  assert.equal(erro.requestedMode, "YOUTUBE");

  /*
   * §2 · O CORPO É ÚTIL — "conflito" sozinho não diz o que mudar.
   *
   * Quem chamou precisa saber que o artigo é do Google para escolher outro
   * artigo, em vez de tentar de novo achando que foi falha transitória.
   */
  assert.deepEqual(
    { code: erro.body.code, currentMode: erro.body.currentMode, requestedMode: erro.body.requestedMode },
    { code: "RADAR_PRIMARY_MODE_CONFLICT", currentMode: "WEB", requestedMode: "YOUTUBE" },
  );
  assert.ok(erro.body.error.length > 20, "e carrega a frase legível, não só o código");

  /* A decisão CONSULTOU o estado remoto — ela não presumiu. */
  assert.equal(leituras, 1);
  assert.deepEqual(tentativasDeRede, [], "PROVIDER_CALLS_ON_CONFLICT = 0");
});

/* ==================== §6.B · YOUTUBE → WEB = 409 ==================== */

test("§6.B · artigo comprometido com YOUTUBE recusa START de WEB — a simetria é real", async () => {
  const erro = await conflito({ currentMode: { deepResearch: null, youtubeSearch: CORRIDA_YOUTUBE }, requestedMode: "WEB" });

  assert.ok(erro, "YOUTUBE_TO_WEB_BLOCKED");
  assert.equal(erro.status, 409);
  assert.equal(erro.code, "RADAR_PRIMARY_MODE_CONFLICT");
  assert.equal(erro.currentMode, "YOUTUBE");
  assert.equal(erro.requestedMode, "WEB");
  assert.deepEqual(tentativasDeRede, []);
});

/* =================== §6.C · AMAZON → YOUTUBE = 409 =================== */

test("§6.C · o domínio completo já é aceito — AMAZON recusa YOUTUBE antes de existir START de Amazon", () => {
  /*
   * §4 · A FUNÇÃO ACEITA OS TRÊS MODOS HOJE, e Amazon não tem coleta nenhuma
   * neste gate. Deixar o terceiro modo de fora faria a regra precisar ser
   * reaberta quando o START de Amazon chegasse — e reabrir regra de integridade
   * é quando ela se desencontra.
   */
  assert.deepEqual(RadarPrimarySearchModeSchema.options, ["WEB", "YOUTUBE", "AMAZON"]);

  let erro: RadarPrimaryModeConflictError | null = null;
  try { assertRadarResearchModeAllowed({ currentMode: "AMAZON", requestedMode: "YOUTUBE" }); }
  catch (capturado) { erro = capturado instanceof RadarPrimaryModeConflictError ? capturado : null; }

  assert.ok(erro, "AMAZON → YOUTUBE não foi recusado");
  assert.equal(erro.status, 409, "AMAZON_TO_YOUTUBE_BLOCKED");
  assert.equal(erro.currentMode, "AMAZON");
  assert.equal(erro.requestedMode, "YOUTUBE");

  /* E nos dois sentidos, para os três modos, sem exceção escondida. */
  const modos: RadarPrimarySearchMode[] = ["WEB", "YOUTUBE", "AMAZON"];
  for (const atual of modos) {
    for (const pedido of modos) {
      if (atual === pedido) continue;
      assert.throws(() => assertRadarResearchModeAllowed({ currentMode: atual, requestedMode: pedido }), RadarPrimaryModeConflictError, `${atual} → ${pedido} passou`);
    }
  }
});

/* ==================== §6.D · null → YOUTUBE passa ==================== */

test("§6.D · artigo sem investigação nenhuma pode começar — é ele que cria o compromisso", async () => {
  const decisao = await assertRadarPrimaryModeForRequest(
    { brandId: "marca-1", articleId: "artigo-1", requestedMode: "YOUTUBE" },
    { loadAnalysisPayload: comAnalise({ deepResearch: null, youtubeSearch: null }) },
  );
  assert.deepEqual(decisao, { currentMode: null, requestedMode: "YOUTUBE" });

  /*
   * E ARTIGO SEM ITEM RADAR, ou sem análise nenhuma, também passa.
   *
   * Recusar aqui bloquearia justamente o caminho novo: o smoke do gate é num
   * artigo que ainda não tem investigação alguma.
   */
  const semItem = await assertRadarPrimaryModeForRequest(
    { brandId: "marca-1", articleId: "artigo-novo", requestedMode: "YOUTUBE" },
    { loadAnalysisPayload: comAnalise(null) },
  );
  assert.equal(semItem.currentMode, null);
  assert.deepEqual(tentativasDeRede, []);
});

/* ============ §6.E e §5 · YOUTUBE → YOUTUBE não é conflito ============ */

test("§6.E · repetir o MESMO modo não é troca — o lifecycle continua sendo de quem o governa", async () => {
  const decisao = await assertRadarPrimaryModeForRequest(
    { brandId: "marca-1", articleId: "artigo-1", requestedMode: "YOUTUBE" },
    { loadAnalysisPayload: comAnalise({ deepResearch: null, youtubeSearch: CORRIDA_YOUTUBE }) },
  );
  assert.deepEqual(decisao, { currentMode: "YOUTUBE", requestedMode: "YOUTUBE" });

  /* O mesmo do lado do Google: nova coleta sobre investigação Google segue. */
  const google = await assertRadarPrimaryModeForRequest(
    { brandId: "marca-1", articleId: "artigo-1", requestedMode: "WEB" },
    { loadAnalysisPayload: comAnalise({ deepResearch: REGISTRO_GOOGLE, youtubeSearch: null }) },
  );
  assert.equal(google.currentMode, "WEB");

  /*
   * §5 · ESTA GUARDA IMPEDE TROCA, E SÓ ISSO.
   *
   * Se ela também decidisse "pode repetir?", passaria a ter uma segunda
   * autoridade — e o "corrida em voo", o "finalizada, precisa reset" e o
   * "pode continuar" de cada modo teriam duas casas. A função sequer recebe o
   * estado da corrida.
   */
  const fonte = await readFile(new URL("../lib/radar/search-mode.ts", import.meta.url), "utf8");
  /*
   * A fatia é o CORPO da regra, não tudo que vem depois dela no arquivo.
   *
   * O 1.1 pôs os tipos de status de fonte entre as duas funções, e "status"
   * casava com a auditoria. O que precisa continuar valendo é que a REGRA não
   * conhece estado de corrida.
   */
  const inicio = fonte.indexOf("export function assertRadarResearchModeAllowed");
  const regra = fonte.slice(inicio, fonte.indexOf("\n}", inicio));
  assert.equal(/state|runVersion|finalized|lifecycle|status/i.test(regra), false, "a regra de troca não conhece estado de corrida");
});

/* ============== §6.F e §1 · o cliente não é consultado ============== */

test("§6.F · CLIENT_MODE_TRUSTED = NO — o modo corrente é resolvido no servidor", async () => {
  /*
   * O CLIENTE NÃO TEM COMO MENTIR PORQUE NÃO TEM ONDE.
   *
   * As duas rotas pagas não aceitam `mode` no corpo: os schemas são `.strict()`
   * e não têm o campo. Um pedido com `mode: "YOUTUBE"` adulterado é recusado
   * como pedido inválido antes de chegar à guarda — e mesmo que passasse, a
   * guarda lê a análise gravada e ignora o corpo.
   */
  const rotaYoutube = await readFile(new URL("../app/api/editorial/radar-youtube-search/route.ts", import.meta.url), "utf8");
  const corpoSchema = rotaYoutube.slice(rotaYoutube.indexOf("const CorpoSchema"), rotaYoutube.indexOf("const noStoreHeaders"));
  assert.ok(corpoSchema.includes(".strict()"), "o corpo é estrito: campo desconhecido é recusado");
  assert.equal(/\bmode\b\s*:/.test(corpoSchema), false, "não existe campo de modo no pedido");

  const pedidoSerp = await readFile(new URL("../lib/radar/serp/request.ts", import.meta.url), "utf8");
  assert.equal(/\bprimaryMode\b|\bsearchMode\b|\bresearchMode\b/.test(pedidoSerp), false, "nem no pedido da SERP do Google");

  /*
   * E a resolução é do estado REMOTO: o mesmo pedido, com a mesma marca e o
   * mesmo artigo, muda de veredito quando o que está GRAVADO muda — e só por
   * isso.
   */
  const pedido = { brandId: "marca-1", articleId: "artigo-1", requestedMode: "YOUTUBE" as const };
  assert.ok(await conflito({ currentMode: { deepResearch: REGISTRO_GOOGLE }, requestedMode: "YOUTUBE" }), "gravado WEB: recusa");
  const liberado = await assertRadarPrimaryModeForRequest(pedido, { loadAnalysisPayload: comAnalise({ deepResearch: null }) });
  assert.equal(liberado.currentMode, null, "gravado nada: passa");
  assert.deepEqual(tentativasDeRede, []);
});

/* ============== §1 · a resolução lê a análise CORRENTE ============== */

test("§1 · o modo sai da ÚLTIMA versão da análise, lida como a produção lê", () => {
  /*
   * A análise é append-only: a corrente é a última. Ler a primeira faria um
   * artigo que trocou de mão continuar preso ao que a v1 dizia.
   */
  const linha = {
    payload: {
      analysisVersions: [
        { versionId: "v1", payload: { deepResearch: null, youtubeSearch: null } },
        { versionId: "v2", payload: { deepResearch: null, youtubeSearch: CORRIDA_YOUTUBE } },
      ],
    },
  };
  assert.equal(radarPrimaryModeOfAnalysis(radarAnalysisPayloadFromWorkflowRow(linha.payload)), "YOUTUBE");

  /* E a leitura é DEFENSIVA: dado fora de forma resolve `null`, não explode. */
  for (const torto of [null, undefined, 42, "texto", [], {}, { analysisVersions: [] }, { analysisVersions: [null] }, { analysisVersions: [{ payload: 7 }] }]) {
    assert.equal(radarPrimaryModeOfAnalysis(radarAnalysisPayloadFromWorkflowRow(torto)), null, `explodiu em ${JSON.stringify(torto)}`);
  }

  /*
   * UMA GUARDA NÃO PODE VIRAR INDISPONIBILIDADE.
   *
   * Validar a análise inteira aqui transformaria um registro legado fora de
   * forma numa recusa de coleta — o artigo ficaria impossível de pesquisar por
   * um campo que a guarda nem olha.
   */
  assert.equal(radarPrimaryModeOfAnalysis({ deepResearch: REGISTRO_GOOGLE, youtubeSearch: null }), "WEB");
  assert.equal(radarPrimaryModeOfAnalysis({ youtubeSearch: CORRIDA_YOUTUBE }), "YOUTUBE");
  assert.equal(radarPrimaryModeOfAnalysis({}), null);
});

/* ========== §2 e §3 · a ordem nas rotas, e uma regra só ========== */

test("§2 · PROVIDER_CALL_BEFORE_MODE_CHECK = NO — nas duas rotas pagas", async () => {
  const rotaYoutube = await readFile(new URL("../app/api/editorial/radar-youtube-search/route.ts", import.meta.url), "utf8");
  const rotaSerp = await readFile(new URL("../app/api/editorial/serp/route.ts", import.meta.url), "utf8");

  /*
   * A GUARDA VEM ANTES DE TUDO QUE CUSTA — e "custa" começa antes da chamada.
   *
   * `resolveDataForSeoCanonicalSerpCompatibilityConfig` já RESERVA cota. Um 409
   * depois dela seria um 409 que já mexeu no livro do provider.
   */
  /*
   * A GUARDA MUDOU DE CASA NO 1.4, e ficou mais cedo ainda.
   *
   * A rota de YouTube não a chama mais diretamente: ela chama
   * `startRadarYoutubeRun`, que resolve contexto, modo e corrida antes de
   * devolver. Continua valendo — e agora com mais coisa protegida — que nada
   * que custa acontece antes.
   */
  const guardaYoutube = rotaYoutube.indexOf("await startRadarYoutubeRun(");
  assert.ok(guardaYoutube > 0, "a rota de YouTube inicia pelo orquestrador do servidor");
  for (const gasto of ["resolveDataForSeoCanonicalSerpCompatibilityConfig(", "executeDataForSeoYoutubeQuery(", "recordIntegrationUsage("]) {
    assert.ok(rotaYoutube.indexOf(gasto) > guardaYoutube, `a guarda vem depois de ${gasto}`);
  }

  /* E dentro do orquestrador, o modo é conferido antes de ele retornar. */
  const orquestrador = await readFile(new URL("../lib/server/radar-youtube-start.ts", import.meta.url), "utf8");
  const start = orquestrador.slice(orquestrador.indexOf("export async function startRadarYoutubeRun"));
  /*
   * Desde o 2.1 o orquestrador decide por FONTE: 
   * substituiu a recusa por modo, porque coletar a segunda SERP deixou de ser
   * conversão. O que ele continua fazendo antes de gravar é RESOLVER o alvo.
   */
  assert.ok(start.includes("radarDecideResearchSource({"));
  assert.ok(start.includes("source: \"YOUTUBE_SERP\""));
  assert.ok(start.indexOf("radarDecideResearchSource") < start.indexOf("appendAnalysis"), "o alvo é resolvido antes de gravar qualquer coisa");

  const guardaSerp = rotaSerp.slice(rotaSerp.indexOf("export async function POST")).indexOf("resolveRadarResearchSource(");
  assert.ok(guardaSerp > 0, "a rota do Google tem a guarda dentro do POST");
  const posPost = rotaSerp.slice(rotaSerp.indexOf("export async function POST"));
  for (const gasto of ["collectRadarSerpLensSnapshot(", "resolveDataForSeoCanonicalSerpCompatibilityConfig(", "recordUsage: recordIntegrationUsage"]) {
    assert.ok(posPost.indexOf(gasto) > guardaSerp, `no Google, a guarda vem depois de ${gasto}`);
  }

  /*
   * E ELA FICA DEPOIS DO `review`: revisar snapshot que já existe não inicia
   * investigação nenhuma, e recusar isso seria vetar decisão humana sobre
   * trabalho já pago.
   */
  assert.ok(posPost.indexOf("input.action === \"review\"") < guardaSerp);
});

test("§3 · COMMON_MODE_GUARD = YES — as rotas não têm regra própria", async () => {
  const fontes = {
    youtube: await readFile(new URL("../app/api/editorial/radar-youtube-search/route.ts", import.meta.url), "utf8"),
    serp: await readFile(new URL("../app/api/editorial/serp/route.ts", import.meta.url), "utf8"),
    pagina: await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8"),
  };

  /*
   * NENHUM DOS TRÊS DECIDE SOZINHO. Uma comparação de modo escrita na rota é
   * a segunda cópia da regra — e duas cópias é exatamente como a tela e o
   * servidor se desencontraram no 1.1.
   */
  for (const [nome, fonte] of Object.entries(fontes)) {
    const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
    assert.equal(/currentMode\s*(===|!==)\s*/.test(codigo), false, `${nome} compara modo por conta própria`);
    assert.equal(codigo.includes("RADAR_PRIMARY_MODE_CONFLICT\""), false, `${nome} recria o código de erro`);
  }

  /*
   * OS DOIS CAMINHOS PAGOS CHEGAM À MESMA REGRA — por rotas diferentes.
   *
   * O Google chama `assertRadarPrimaryModeForRequest` direto; o YouTube passa
   * pelo orquestrador do 1.4, que chama `assertRadarResearchModeAllowed`. As
   * duas portas levam à mesma função de domínio, e nenhuma tem cópia da regra.
   */
  const orquestrador = await readFile(new URL("../lib/server/radar-youtube-start.ts", import.meta.url), "utf8");
  assert.ok(fontes.youtube.includes("startRadarYoutubeRun("));
  assert.ok(orquestrador.includes("source: \"YOUTUBE_SERP\""));
  assert.ok(fontes.serp.includes("source: \"WEB_SERP\""), "desde o 2.1 o Google declara a FONTE, não o modo");
  assert.ok(orquestrador.includes("radarDecideResearchSource"), "o orquestrador usa a regra de domínio, não uma cópia");

  /* E as duas devolvem o 409 pelo corpo que a própria regra monta. */
  for (const fonte of [fontes.youtube, fontes.serp]) {
    assert.ok(/RadarPrimaryModeConflictError\) return NextResponse\.json\(/.test(fonte.replace(/\{ success: false, \.\.\./, "")), "o 409 sai do erro de domínio");
  }
});

test("§3 · UI_ONLY_AUTHORITY = NO — a tela usa a mesma resolução, não uma cópia", async () => {
  const pagina = await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  /* Só o CÓDIGO: o comentário vizinho explica a regra citando os campos. */
  const autoridade = pagina.slice(pagina.indexOf("const compromissoDeModo"), pagina.indexOf("const garantirContextoDoRadar"))
    .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

  assert.ok(autoridade.includes("radarPrimaryModeOfAnalysis(payload)"), "a tela chama o resolver compartilhado");
  assert.equal(/deepResearch|youtubeSearch/.test(autoridade), false, "e não sabe quais campos provam cada modo");

  /* O invólucro da tela é a MESMA regra: ele chama o assert e converte. */
  const fonte = await readFile(new URL("../lib/radar/search-mode.ts", import.meta.url), "utf8");
  const involucro = fonte.slice(fonte.indexOf("export function radarPrimaryModeCommitment"));
  assert.ok(involucro.includes("assertRadarResearchModeAllowed("), "a tela não tem veredito próprio");

  /* E os dois vereditos coincidem, modo a modo — nenhuma divergência possível. */
  const modos: Array<RadarPrimarySearchMode | null> = ["WEB", "YOUTUBE", "AMAZON", null];
  for (const currentMode of modos) {
    for (const mode of ["WEB", "YOUTUBE", "AMAZON"] as RadarPrimarySearchMode[]) {
      const tela = radarPrimaryModeCommitment({ mode, currentMode });
      let servidorPermitiu = true;
      try { assertRadarResearchModeAllowed({ currentMode, requestedMode: mode }); } catch { servidorPermitiu = false; }
      assert.equal(tela.canStart, servidorPermitiu, `divergência em ${currentMode} → ${mode}`);
    }
  }
});

/* ======================== §7 · o que não foi tocado ====================== */

test("§7 · este gate não mexeu em plano, profundidade, normalização nem coortes", async () => {
  const [consultas, operacao, modelo] = await Promise.all([
    readFile(new URL("../lib/radar/youtube-search-queries.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/server/dataforseo-youtube-operation.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/radar/youtube-search-model.ts", import.meta.url), "utf8"),
  ]);

  /*
   * A guarda é de ENTRADA. Se ela tivesse alcançado o plano, a coleta ou a
   * classificação, este gate teria reaberto o que o 1.1 homologou.
   */
  for (const [nome, fonte] of [["plano", consultas], ["provider", operacao], ["universo", modelo]] as const) {
    assert.equal(/assertRadarPrimaryModeForRequest|RadarPrimaryModeConflictError/.test(fonte), false, `${nome} passou a conhecer a guarda de modo`);
  }

  /*
   * A profundidade mudou de ARQUIVO no 1.3 (passou ao domínio, para a tela
   * poder gravar a corrida antes da chamada) e NÃO mudou de valor. É o valor
   * que este gate não podia tocar.
   */
  assert.equal(RADAR_YOUTUBE_DEFAULT_BLOCK_DEPTH, 20, "a profundidade continua 20");
  assert.ok(operacao.includes("RADAR_YOUTUBE_DEFAULT_BLOCK_DEPTH"), "o adaptador continua usando a mesma");
  assert.ok(modelo.includes("COMPARABLE_LONG_FORM"), "as coortes continuam de pé");
});

test("PROVIDER_CALLS_IN_TESTS = 0", () => {
  assert.deepEqual(tentativasDeRede, []);
});

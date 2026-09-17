import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  RADAR_RESEARCH_PROFILES,
  RADAR_RESEARCH_PROFILE_PLANS,
  buildRadarResearchPackage,
  radarProfileOfTarget,
  radarProfileSupportPlan,
  radarResearchPackageState,
  radarResearchProfileOfAnalysis,
  radarResearchSourceRoleForProfile,
  radarTargetOfProfile,
} from "../lib/radar/research-profile.ts";
import { normalizeDataForSeoYoutubeResponse } from "../lib/server/dataforseo-youtube-operation.ts";
import { buildRadarYoutubeUniverse } from "../lib/radar/youtube-search-model.ts";
import { radarYoutubeShortsNotice } from "../lib/radar/youtube-search-run.ts";
import { RadarAnalysisPayloadSchema } from "../lib/radar/analysis-contracts.ts";

/*
 * ========  RADAR_RESEARCH_PROFILES_1 · UM START, UM PACOTE  ========
 *
 * A chavinha nunca escolheu "onde pesquisar". Ela escolhe que RADIOGRAFIA
 * competitiva queremos produzir — e o Google participa das três, com papel
 * diferente em cada uma.
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

const semComentarios = (fonte: string) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

const pagina = () => readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
const painel = () => readFile(new URL("../modules/radar/radar-youtube-search-panel.tsx", import.meta.url), "utf8");

/* ==================== §1 · os três perfis canônicos ==================== */

test("§1 · GOOGLE é principal sozinho; YouTube e Amazon levam o Google de apoio", () => {
  assert.deepEqual([...RADAR_RESEARCH_PROFILES], ["GOOGLE", "YOUTUBE", "AMAZON"]);

  const google = RADAR_RESEARCH_PROFILE_PLANS.GOOGLE;
  assert.equal(google.primarySource, "WEB_SERP");
  assert.deepEqual([...google.supportSources], [], "no perfil Google não há apoio: ele É a pesquisa");
  assert.equal(google.supportRole, null);

  const youtube = RADAR_RESEARCH_PROFILE_PLANS.YOUTUBE;
  assert.equal(youtube.primarySource, "YOUTUBE_SERP");
  assert.deepEqual([...youtube.supportSources], ["WEB_SERP"]);

  const amazon = RADAR_RESEARCH_PROFILE_PLANS.AMAZON;
  assert.equal(amazon.primarySource, "AMAZON_SERP");
  assert.deepEqual([...amazon.supportSources], ["WEB_SERP"]);
});

test("§1 e §12 · a Amazon já cabe no mesmo contrato, sem arquitetura nova", () => {
  /*
   * O perfil existe antes do coletor. Não é adiantamento: é o que impede que a
   * Amazon chegue exigindo um segundo desenho de pacote.
   */
  const pacote = buildRadarResearchPackage({
    profile: "AMAZON", primaryKeyword: "sérum vitamina c",
    primaryRunning: false, primaryCollected: false, primaryFailed: false,
    primaryQueryCount: 0, primaryResultCount: 0, support: null, webSerpCollected: false,
  });
  assert.equal(pacote.primary.source, "AMAZON_SERP");
  assert.equal(pacote.support?.source, "WEB_SERP");
  assert.equal(pacote.support?.role, "SEO_COMMERCIAL_SUPPORT");
  assert.equal(pacote.state, "COLLECTING", "sem coletor, o pacote não se declara pronto");
});

/* =================== §4 · o papel está no dado =================== */

test("§4 · o mesmo Google tem três papéis diferentes, e eles são contrato", () => {
  assert.equal(radarResearchSourceRoleForProfile("GOOGLE", "WEB_SERP"), "PRIMARY_COMPETITIVE_RESEARCH");
  assert.equal(radarResearchSourceRoleForProfile("YOUTUBE", "WEB_SERP"), "SEO_SUPPORT");
  assert.equal(radarResearchSourceRoleForProfile("AMAZON", "WEB_SERP"), "SEO_COMMERCIAL_SUPPORT");

  assert.equal(radarResearchSourceRoleForProfile("YOUTUBE", "YOUTUBE_SERP"), "PRIMARY_COMPETITIVE_RESEARCH");
  assert.equal(radarResearchSourceRoleForProfile("AMAZON", "AMAZON_SERP"), "PRIMARY_COMPETITIVE_RESEARCH");

  /*
   * FONTE QUE NÃO PARTICIPA NÃO GANHA PAPEL VAZIO.
   *
   * A SERP da Amazon não tem função nenhuma numa radiografia de vídeo, e
   * dar-lhe um papel faria a tela listar uma coleta que não vai acontecer ali.
   */
  assert.equal(radarResearchSourceRoleForProfile("YOUTUBE", "AMAZON_SERP"), null);
  assert.equal(radarResearchSourceRoleForProfile("GOOGLE", "YOUTUBE_SERP"), null);
});

test("§4 · o papel gravado atravessa o contrato da análise", () => {
  const payload = RadarAnalysisPayloadSchema.partial().parse({
    supportResearch: {
      source: "WEB_SERP", role: "SEO_SUPPORT", keyword: "skin care noturno",
      packageRunId: "run-1", collectedAt: "2026-09-14T20:00:00.000Z",
      serpSnapshotId: "serp-9", failureReason: null,
    },
  });
  assert.equal(payload.supportResearch?.role, "SEO_SUPPORT");
  assert.equal(payload.supportResearch?.packageRunId, "run-1", "o apoio aponta para a corrida que o pediu");
});

test("§4 · análise gravada antes deste gate continua legível e declara ausência", () => {
  const payload = RadarAnalysisPayloadSchema.partial().parse({});
  assert.equal(payload.supportResearch, null, "ausência declarada, não preenchida");
});

/* ============ §3 · o apoio é UMA leitura, sobre a principal ============ */

test("§3 · o apoio não repete as consultas do provider principal", () => {
  const apoio = radarProfileSupportPlan({ profile: "YOUTUBE", primaryKeyword: "skin care noturno" });
  assert.ok(apoio);
  assert.equal(apoio.queryCount, 1, "uma leitura, não uma por consulta do YouTube");
  assert.equal(apoio.keyword, "skin care noturno", "e ela é sobre a keyword principal");
  assert.equal(apoio.role, "SEO_SUPPORT");
});

test("§3 · o perfil Google não planeja apoio nenhum", () => {
  assert.equal(radarProfileSupportPlan({ profile: "GOOGLE", primaryKeyword: "skin care noturno" }), null);
});

test("§3 · sem keyword principal não se inventa uma consulta de apoio", () => {
  /*
   * Cair no título do artigo pareceria robusto e produziria uma leitura sobre
   * uma formulação que ninguém pesquisa — paga, e sobre a pergunta errada.
   */
  assert.equal(radarProfileSupportPlan({ profile: "YOUTUBE", primaryKeyword: null }), null);
  assert.equal(radarProfileSupportPlan({ profile: "YOUTUBE", primaryKeyword: "   " }), null);
});

/* ================= §7 · o status composto ================= */

test("§7 · apoio que falha NÃO apaga a pesquisa principal", () => {
  const estado = radarResearchPackageState({
    primaryRunning: false, primaryCollected: true, primaryFailed: false,
    supportPlanned: true, supportCollected: false, supportFailed: true,
  });
  assert.equal(estado, "PARTIAL_SUPPORT_FAILED");

  /* E o pacote continua dizendo quantos vídeos a principal trouxe. */
  const pacote = buildRadarResearchPackage({
    profile: "YOUTUBE", primaryKeyword: "skin care noturno",
    primaryRunning: false, primaryCollected: true, primaryFailed: false,
    primaryQueryCount: 3, primaryResultCount: 47,
    support: {
      source: "WEB_SERP", role: "SEO_SUPPORT", keyword: "skin care noturno",
      packageRunId: "run-1", collectedAt: null, serpSnapshotId: null,
      failureReason: "A cota do provider foi recusada.",
    },
    webSerpCollected: false,
  });
  assert.equal(pacote.state, "PARTIAL_SUPPORT_FAILED");
  assert.equal(pacote.primary.collected, true, "a coleta paga ficou");
  assert.equal(pacote.primary.resultCount, 47);
  assert.equal(pacote.support?.failureReason, "A cota do provider foi recusada.");
});

test("§7 · a falha da PRINCIPAL é falha do pacote, e o apoio não a resgata", () => {
  assert.equal(radarResearchPackageState({
    primaryRunning: false, primaryCollected: false, primaryFailed: true,
    supportPlanned: true, supportCollected: true, supportFailed: false,
  }), "FAILED");
});

test("§7 · READY exige as duas no perfil YouTube, e só a principal no Google", () => {
  const comApoio = radarResearchPackageState({
    primaryRunning: false, primaryCollected: true, primaryFailed: false,
    supportPlanned: true, supportCollected: true, supportFailed: false,
  });
  assert.equal(comApoio, "READY");

  /* Sem apoio planejado, a principal sozinha basta — é o perfil Google. */
  assert.equal(radarResearchPackageState({
    primaryRunning: false, primaryCollected: true, primaryFailed: false,
    supportPlanned: false, supportCollected: false, supportFailed: false,
  }), "READY");

  /* Apoio pendente e sem falha ainda é coleta em curso, não "pronta". */
  assert.equal(radarResearchPackageState({
    primaryRunning: false, primaryCollected: true, primaryFailed: false,
    supportPlanned: true, supportCollected: false, supportFailed: false,
  }), "COLLECTING");
});

test("§6 · SERP do Google já gravada satisfaz o apoio, sem cobrar de novo", () => {
  /*
   * O artigo pode ter passado pelo perfil Google antes de virar vídeo. Recoletar
   * a mesma SERP para carimbar "apoio coletado" cobraria a troca de perfil.
   */
  const pacote = buildRadarResearchPackage({
    profile: "YOUTUBE", primaryKeyword: "skin care noturno",
    primaryRunning: false, primaryCollected: true, primaryFailed: false,
    primaryQueryCount: 3, primaryResultCount: 47, support: null, webSerpCollected: true,
  });
  assert.equal(pacote.support?.collected, true);
  assert.equal(pacote.state, "READY");
});

/* ================= §8 · o perfil Google continua intacto ================= */

test("§8 · no perfil Google não existe apoio, e o alvo continua sendo WEB", () => {
  const pacote = buildRadarResearchPackage({
    profile: "GOOGLE", primaryKeyword: "skin care noturno",
    primaryRunning: false, primaryCollected: true, primaryFailed: false,
    primaryQueryCount: 4, primaryResultCount: 17, support: null, webSerpCollected: true,
  });
  assert.equal(pacote.support, null, "Google não é apoio de si mesmo");
  assert.equal(pacote.primary.role, "PRIMARY_COMPETITIVE_RESEARCH");
  assert.equal(pacote.primaryTarget, "WEB");
  assert.equal(pacote.state, "READY");
});

test("§8 · o vocabulário antigo do alvo continua valendo nos dois sentidos", () => {
  /*
   * `primaryTarget` é `WEB | YOUTUBE | AMAZON` e está gravado em toda análise
   * existente. Renomeá-lo para GOOGLE quebraria a leitura do passado por
   * questão de rótulo.
   */
  assert.equal(radarProfileOfTarget("WEB"), "GOOGLE");
  assert.equal(radarTargetOfProfile("GOOGLE"), "WEB");
  for (const profile of RADAR_RESEARCH_PROFILES) {
    assert.equal(radarProfileOfTarget(radarTargetOfProfile(profile)), profile);
  }

  assert.equal(radarResearchProfileOfAnalysis({ researchTarget: { primaryTarget: "YOUTUBE" } }), "YOUTUBE");
  assert.equal(radarResearchProfileOfAnalysis({ researchTarget: { primaryTarget: "WEB" } }), "GOOGLE");
  /* Sem alvo declarado, o padrão — nunca inferência a partir de qual coleta existe. */
  assert.equal(radarResearchProfileOfAnalysis({ youtubeSearch: { runId: "r" } }), "GOOGLE");
});

/* ============ §2, §5 e §14 · o START único e o apoio corrigido ============ */

test("§14 · o botão de somar fonte saiu da tela", async () => {
  /* O comentário que EXPLICA a remoção cita o rótulo; ele não é a tela. */
  const fonte = semComentarios(await painel());
  assert.equal(fonte.includes("Adicionar leitura Google"), false);
  assert.equal(fonte.includes("radar-add-google-support"), false);
  assert.equal(fonte.includes("onAddGoogleSupport"), false);
  assert.ok(fonte.includes("radar-research-package"), "no lugar dele, o pacote");
});

test("§2 · o apoio roda dentro do mesmo START, depois da principal", async () => {
  const fonte = semComentarios(await pagina());
  const start = fonte.slice(fonte.indexOf("const startYoutubeSearch"), fonte.indexOf("const toggleYoutubeVideo"));

  assert.ok(start.includes("await coletarApoioDoGoogle(target, run.runId);"), "um clique, duas coletas");
  /* A ordem importa: o apoio vem DEPOIS de a principal ter sido confirmada. */
  assert.ok(start.indexOf("RadarYoutubeSearchRunSchema.parse(corpo.run)") < start.indexOf("coletarApoioDoGoogle"));
});

test("§5 · o apoio COLETA e para — não entra na curadoria do Google", async () => {
  const fonte = semComentarios(await pagina());
  const apoio = fonte.slice(fonte.indexOf("const coletarApoioDoGoogle"), fonte.indexOf("const repetirApoioDoGoogle"));

  /*
   * ESTE ERA O DEFEITO DE RUNTIME.
   *
   * `startSerpAnalysis` é INICIAR CURADORIA: ele exige snapshot canônico
   * completo e respondia "este snapshot não possui payload canônico completo".
   * O apoio nunca coletou nada.
   */
  assert.equal(apoio.includes("startSerpAnalysis"), false, "o apoio não abre curadoria Google");
  assert.equal(apoio.includes("curationVersionFor"), false, "nem cria versão de análise Google");
  assert.equal(apoio.includes("persistSerpAnalysis"), false);
  assert.equal(/selectedCompetitorIds|finalizeInvestigation/.test(apoio), false, "nem pede os 10 concorrentes, nem finaliza");

  /* O que ele faz é uma coleta, pela porta única, e grava o papel. */
  assert.ok(apoio.includes("await coletarSerpDoProvider(target)"));
  assert.ok(apoio.includes("supportResearch:"));

  /*
   * O PAPEL VEM DO PLANO, NUNCA ESCRITO À MÃO — §4.
   *
   * Um `PRIMARY_COMPETITIVE_RESEARCH` fixado em qualquer um dos três caminhos
   * (snapshot reaproveitado, coleta nova, falha) faria aquela SERP do Google
   * passar a se declarar a radiografia principal do artigo. Meses depois, o
   * Planejador leria um vídeo como se fosse uma investigação de página.
   */
  const gravacoes = apoio.match(/role: [^,]+,/g) || [];
  assert.equal(gravacoes.length, 3, "os três caminhos do apoio gravam o papel");
  for (const gravacao of gravacoes) {
    assert.equal(gravacao, "role: apoio.role,", `papel escrito à mão: ${gravacao}`);
  }
});

test("§5 · o guard da curadoria continua exigindo payload canônico — para o Google", async () => {
  const fonte = await pagina();
  /*
   * A mensagem não sumiu, e não devia: ela está CERTA para a investigação
   * Google principal. O que estava errado era o apoio chegar até ela.
   */
  assert.ok(fonte.includes("Este snapshot não possui payload canônico completo para iniciar a curadoria."));
  const curadoria = fonte.slice(fonte.indexOf("const startSerpAnalysis"), fonte.indexOf("const resetRadarInvestigation"));
  assert.ok(curadoria.includes("view.source === \"legacy_snapshot\""), "o guard segue de pé no fluxo dele");
});

/* ========== a regressão do 409: escrever depois do servidor ========== */

test("o apoio sucede a versão do SERVIDOR, não a que o render capturou", async () => {
  /*
   * ========== O DEFEITO QUE ISTO TRAVA ==========
   *
   * `HTTP 409 · optimistic_conflict` no meio do START.
   *
   * O START chama a rota, e a ROTA grava a corrida. Daí em diante o `RadarItem`
   * que o render capturou descreve o passado: ele não tem a versão nova. Suceder
   * a partir dele colide com o banco, que já está à frente.
   *
   * Recarregar o estado não resolve — a função assíncrona em curso continua
   * segurando o mesmo objeto, e o React só entrega o novo no próximo render, que
   * ainda não aconteceu. A leitura remota devolve VALOR, e valor atravessa o
   * await.
   */
  const fonte = semComentarios(await pagina());
  const apoio = fonte.slice(fonte.indexOf("const coletarApoioDoGoogle"), fonte.indexOf("const repetirApoioDoGoogle"));

  const escritas = apoio.match(/await gravarYoutube\(/g) || [];
  assert.equal(escritas.length, 3, "os três caminhos do apoio gravam");
  assert.equal(
    (apoio.match(/await versaoCorrenteNoServidor\(target\)\)/g) || []).length,
    3,
    "e os três partem da versão lida do servidor",
  );

  /* A leitura remota é remota mesmo: nada de reaproveitar o estado da tela. */
  const leitura = fonte.slice(fonte.indexOf("const versaoCorrenteNoServidor"), fonte.indexOf("const gravarYoutube"));
  assert.ok(leitura.includes("pipeline.readRemoteRadarAnalyses(row.articleId)"));
  assert.ok(leitura.includes("maisNova.versionNumber > local.versionNumber"), "a mais nova das duas vence");
});

test("o aviso do START descreve a coleta que acabou de acontecer", async () => {
  /*
   * Ler o pacote do `RadarItem` capturado diria "0 consulta(s) · 0
   * resultado(s)" logo depois de uma coleta que trouxe dezenas — o mesmo
   * objeto velho, agora mentindo na tela em vez de no banco.
   */
  const fonte = semComentarios(await pagina());
  const start = fonte.slice(fonte.indexOf("const startYoutubeSearch"), fonte.indexOf("const toggleYoutubeVideo"));

  assert.equal(/setNotice\(pacoteDePesquisa\(target\)/.test(start), false, "não se lê o pacote do item capturado");
  assert.ok(start.includes("const apoio = await coletarApoioDoGoogle(target, run.runId);"), "o apoio devolve o que gravou");
  assert.ok(start.includes("primaryResultCount: run.universe.length,"), "e a contagem vem da corrida confirmada");
  assert.ok(start.includes("support: apoio,"));
});

test("§7 · o retry alcança só o apoio, e exige a principal existindo", async () => {
  const fonte = semComentarios(await pagina());
  const retry = fonte.slice(fonte.indexOf("const repetirApoioDoGoogle"), fonte.indexOf("const pacoteDePesquisa"));

  assert.ok(retry.includes("coletarApoioDoGoogle(target, corrida.runId)"), "o apoio volta para a MESMA corrida");
  /* Refazer a principal cobraria de novo as consultas do YouTube. */
  assert.equal(retry.includes("startYoutubeSearch"), false);
  assert.equal(/fetch\(|radar-youtube-search/.test(retry), false);
  assert.ok(retry.includes("Não há pesquisa principal a que este apoio pertença."), "sem principal, não há apoio");
});

test("§2 e §14 · a porta até a SERP do Google continua sendo uma só", async () => {
  const fonte = await pagina();
  const chamadas = fonte.match(/pipeline\.collectSerp\(/g) || [];
  assert.equal(chamadas.length, 1, "duas chamadas seriam duas políticas de coleta");

  /* E nenhum efeito coleta: o START é humano. */
  for (const efeito of fonte.match(/useEffect\([\s\S]*?\n {2}\}, \[[^\]]*\]\);/g) || []) {
    assert.equal(/coletarSerpDoProvider|coletarApoioDoGoogle|collectSerp/.test(efeito), false);
  }
});

/* ==================== §9 · a tela ==================== */

test("§9 · a tela mostra o pacote, com o papel do apoio e a pergunta que ele responde", async () => {
  const fonte = await painel();
  const secao = fonte.slice(fonte.indexOf("function PacoteDePesquisa"), fonte.indexOf("function BlueprintMultiformato"));

  assert.ok(secao.includes("radar-research-primary"));
  assert.ok(secao.includes("radar-research-support"));
  assert.ok(secao.includes("RADAR_RESEARCH_SOURCE_ROLE_LABELS[apoio.role]"), "o papel aparece em português");
  assert.ok(secao.includes("{apoio.purpose}"), "e o que ele responde");
  assert.ok(secao.includes("coletado automaticamente"));
  assert.ok(secao.includes("radar-retry-support"), "o retry do apoio existe");

  /* §9 · nada de id técnico na visão normal. */
  const renderizado = semComentarios(secao).replace(/key=\{[^}]*\}/g, " ");
  assert.equal(/runId|packageRunId|serpSnapshotId|JSON\.stringify/.test(renderizado), false);
});

test("§9 · o rótulo do START vem do perfil, não de texto fixo", async () => {
  const fonte = await painel();
  assert.ok(fonte.includes("radarResearchProfilePlan(pacote.profile).startLabel"));
  assert.equal(RADAR_RESEARCH_PROFILE_PLANS.YOUTUBE.startLabel, "Iniciar pesquisa no YouTube");
  assert.equal(RADAR_RESEARCH_PROFILE_PLANS.AMAZON.startLabel, "Iniciar pesquisa na Amazon");
});

/* ============ §13 · a auditoria de Shorts, com payload real ============ */

test("§13 · RAW → NORMALIZED → UNIVERSE preserva todo Short do payload real", async () => {
  const bruto = JSON.parse(await readFile(new URL("./fixtures/dataforseo-youtube-skin-care-noturno.json", import.meta.url), "utf8"));
  const normalizada = normalizeDataForSeoYoutubeResponse(bruto, "ytq:1");
  const universo = buildRadarYoutubeUniverse(normalizada.results);
  const noUniverso = universo.filter(item => item.universeClass === "COMPARABLE_SHORT").length;

  assert.equal(normalizada.diagnostics.rawShorts, 14, "o provider marcou 14 Shorts");
  assert.equal(normalizada.diagnostics.normalizedShorts, 14, "e 14 atravessaram a normalização");
  assert.equal(noUniverso, 14, "e 14 chegaram ao universo competitivo");

  /*
   * A CORRENTE ESTÁ ÍNTEGRA — então "47 vídeos e 0 Shorts" numa coleta real não
   * é perda nossa: é o que aquele provider devolveu naquela chamada. A medição
   * abaixo é o que passa a dizer isso sozinha, sem ninguém refazer a busca.
   */
});

test("§13 · zero Shorts diz de quem é o zero", () => {
  const corrida = (providerShortsCount: number | null, shorts: number) => ({
    provenance: { providerShortsCount },
    universe: Array.from({ length: shorts }, () => ({ universeClass: "COMPARABLE_SHORT" as const })),
  }) as never;

  assert.match(radarYoutubeShortsNotice(corrida(0, 0))!, /não marcou nenhum resultado como Short/);
  assert.match(radarYoutubeShortsNotice(corrida(14, 0))!, /marcou 14 Short\(s\) e nenhum chegou/);
  assert.equal(radarYoutubeShortsNotice(corrida(14, 14)), null, "nada a declarar quando bate");

  /*
   * CORRIDA ANTIGA NÃO FOI MEDIDA, e `null` diz isso — não "zero". Afirmar zero
   * para o passado inventaria uma auditoria que não houve.
   */
  assert.equal(radarYoutubeShortsNotice(corrida(null, 0)), null);
});

test("§13 · a rota soma a medição por consulta e grava na proveniência", async () => {
  const rota = semComentarios(await readFile(new URL("../app/api/editorial/radar-youtube-search/route.ts", import.meta.url), "utf8"));
  assert.ok(rota.includes("shortsDoProvider += normalizada.diagnostics.rawShorts;"));
  assert.ok(rota.includes("shortsNormalizados += normalizada.diagnostics.normalizedShorts;"));
  assert.ok(rota.includes("providerShortsCount: shortsDoProvider,"));
  assert.ok(rota.includes("normalizedShortsCount: shortsNormalizados,"));
});

test("PROVIDER_CALLS_IN_TESTS = 0", () => {
  assert.deepEqual(tentativasDeRede, []);
});

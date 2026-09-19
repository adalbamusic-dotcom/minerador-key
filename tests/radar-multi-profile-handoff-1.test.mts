import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { radarFrozenObservedAtOfAnalysis, radarPrimaryProfileOfAnalysis } from "../lib/radar/evidence-bundle-runtime.ts";
import { radarWriterImportable } from "../lib/redator/writer-handoff.ts";

/**
 * ===== RADAR_MULTI_PROFILE_HANDOFF_1 =====
 *
 * Três artigos, três perfis, e a tela discordando de si mesma: o YouTube
 * "entregue" virava "pacote anterior" no clique seguinte; o diálogo do Redator
 * só listava o Google; a planilha dizia "Iniciar Pesquisa Google" ao lado de
 * uma investigação de YouTube concluída.
 *
 * Três causas, três correções, e cada uma tem o seu pino aqui.
 */

const source = (caminho: string) => readFile(new URL(caminho, import.meta.url), "utf8");
const semComentarios = (texto: string) => texto.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

const GOOGLE = { finalizedBundle: { frozenAt: "2026-09-10T13:00:00.000Z", frozenBy: "u", limitations: [] } };
const YOUTUBE = { youtubeFrozenInvestigation: { frozenVersion: 1, finalizedAt: "2026-09-14T10:00:00.000Z", finalizedBy: "u" } };
const AMAZON = { amazonFrozenInvestigation: { frozenVersion: 1, finalizedAt: "2026-09-16T08:00:00.000Z", finalizedBy: "u" } };

/* ============================ o instante do congelamento ============================ */

test("A · o instante do pacote é lido do perfil que manda, na precedência canônica", () => {
  assert.equal(radarFrozenObservedAtOfAnalysis(GOOGLE), "2026-09-10T13:00:00.000Z");
  assert.equal(radarFrozenObservedAtOfAnalysis(YOUTUBE), "2026-09-14T10:00:00.000Z");
  assert.equal(radarFrozenObservedAtOfAnalysis(AMAZON), "2026-09-16T08:00:00.000Z");
  /* AMAZON > YOUTUBE > GOOGLE — a mesma ordem de `radarPrimaryProfileOfAnalysis`. */
  assert.equal(radarFrozenObservedAtOfAnalysis({ ...GOOGLE, ...YOUTUBE, ...AMAZON }), "2026-09-16T08:00:00.000Z");
  assert.equal(radarFrozenObservedAtOfAnalysis({ ...GOOGLE, ...YOUTUBE }), "2026-09-14T10:00:00.000Z");
  assert.equal(radarPrimaryProfileOfAnalysis({ ...GOOGLE, ...YOUTUBE }), "YOUTUBE", "o instante e o perfil precisam concordar");
});

test("A · sem congelamento não há instante — e não se inventa um", () => {
  assert.equal(radarFrozenObservedAtOfAnalysis({}), null);
  assert.equal(radarFrozenObservedAtOfAnalysis(null), null);
  assert.equal(radarFrozenObservedAtOfAnalysis({ finalizedBundle: null, youtubeFrozenInvestigation: null }), null);
  assert.equal(radarFrozenObservedAtOfAnalysis({ finalizedBundle: { frozenAt: 123 } }), null, "carimbo que não é string não é carimbo");
});

test("A · envio e export resolvem o dossiê com o MESMO instante — o congelado", async () => {
  const envio = semComentarios(await source("../lib/server/radar-writer-send.ts"));
  const exportacao = semComentarios(await source("../app/api/editorial/radar-export/route.ts"));
  assert.match(envio, /observedAt = radarFrozenObservedAtOfAnalysis\(corrente\.payload\) \?\? entrada\.sentAt/);
  assert.match(envio, /resolveRadarCanonicalDossier\(\{ analysis: corrente, article, observedAt, authorities/);
  assert.equal(/observedAt: entrada\.sentAt/.test(envio), false, "a hora do clique voltou a entrar no hash");
  assert.match(exportacao, /observedAt: radarFrozenObservedAtOfAnalysis\(corrente\.payload\) \?\? exportedAt/);
  assert.equal(/observedAt: exportedAt,/.test(exportacao), false, "o export voltou a carimbar a hora do clique");
});

/* ============================ quem aparece em "Importar do Radar" ============================ */

const item = (state: string, payloads: unknown[]) => ({
  state,
  analysisVersions: payloads.map((payload, indice) => ({ versionNumber: indice + 1, payload })),
});

test("B · o diálogo lista quem FINALIZOU, em qualquer perfil, e não quem a esteira aprovou", () => {
  assert.equal(radarWriterImportable(item("research_pending", [YOUTUBE]), radarPrimaryProfileOfAnalysis), true, "YouTube finalizado sumiu do diálogo");
  assert.equal(radarWriterImportable(item("research_pending", [AMAZON]), radarPrimaryProfileOfAnalysis), true, "Amazon finalizada sumiu do diálogo");
  assert.equal(radarWriterImportable(item("research_pending", [GOOGLE]), radarPrimaryProfileOfAnalysis), true);
  assert.equal(radarWriterImportable(item("approved", [{}]), radarPrimaryProfileOfAnalysis), false, "aprovado na esteira sem finalização não é importável");
  assert.equal(radarWriterImportable(item("research_pending", []), radarPrimaryProfileOfAnalysis), false);
});

test("B · a análise CORRENTE decide — não a primeira", () => {
  /* v1 finalizada, v2 sem fotografia: a corrente é v2. */
  assert.equal(radarWriterImportable(item("research_pending", [YOUTUBE, {}]), radarPrimaryProfileOfAnalysis), false);
  assert.equal(radarWriterImportable(item("research_pending", [{}, YOUTUBE]), radarPrimaryProfileOfAnalysis), true);
});

test("B · quem já foi entregue continua listado, para que repetir não duplique", () => {
  assert.equal(radarWriterImportable(item("sent_writer", []), radarPrimaryProfileOfAnalysis), true);
});

test("B · a tela do Redator usa a regra, e a esteira não decide mais", async () => {
  const writer = semComentarios(await source("../components/editorial/professional-writer.tsx"));
  assert.match(writer, /radarWriterImportable\(item, radarPrimaryProfileOfAnalysis\)/);
  assert.equal(/\["approved", "sent_writer"\]\.includes\(item\.state\)/.test(writer), false);
});

/* ============================ o modo efetivo da linha ============================ */

test("C · a planilha lê o modo GRAVADO antes de cair no padrão", async () => {
  const pagina = semComentarios(await source("../modules/radar/radar-page.tsx"));
  assert.match(pagina, /const modoEfetivoDe = useCallback/);
  assert.match(pagina, /searchModeByArticle\[row\.articleId\]\s*\|\|\s*radarResearchPlanOfAnalysis\(analiseCorrenteDe\(row\)\?\.payload \|\| null\)\.primaryTarget\s*\|\|\s*RADAR_DEFAULT_SEARCH_MODE/);
  /* Nenhum ponto da página pode voltar a pular do estado da sessão direto para o padrão. */
  /* Qualquer identificador — foi `activeRadarItem`, no painel, que escapou da primeira varredura. */
  assert.equal(/searchModeByArticle\[\w+\.articleId\] \|\| RADAR_DEFAULT_SEARCH_MODE/.test(pagina), false,
    "algum ponto da página voltou a ignorar o modo gravado");
  assert.ok((pagina.match(/modoEfetivoDe\((row|target)\)/g) || []).length >= 10, "os pontos de leitura precisam passar pelo modo efetivo");
});

test("PROVIDER_CALLS = 0 · AI_CALLS = 0", async () => {
  for (const caminho of ["../lib/radar/evidence-bundle-runtime.ts", "../lib/redator/writer-handoff.ts"]) {
    const texto = semComentarios(await source(caminho));
    assert.equal(/fetch\(|dataforseo|openai|anthropic/i.test(texto), false, `${caminho} chama provider`);
  }
});

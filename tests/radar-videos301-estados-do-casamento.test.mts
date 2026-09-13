import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { radarMatchingReadiness, type RadarMatchableSource } from "../lib/radar/video-brief-matching.ts";
import type { RadarLibrarySource } from "../lib/radar/video-library.ts";
import type { RadarVideoTextState } from "../lib/radar/video-text-acquisition.ts";
import { comProductShell, montarRadar, React } from "./radar-dom-harness.mts";

/*
 * ======  VÍDEOS · GATE 3.0.1 — OS QUATRO ESTADOS DO CASAMENTO  ========
 *
 * O smoke esbarrou numa tela que não distinguia ausências. Ela dizia "a
 * investigação atual não produziu pauta de vídeo" — verdadeiro e inútil — com o
 * botão "Casar pautas com o conteúdo" ACESO ao lado.
 *
 * QUATRO AUSÊNCIAS, QUATRO PRÓXIMOS PASSOS DIFERENTES:
 *
 *   não finalizei a pesquisa        → finalize a investigação
 *   finalizei e não pediu vídeo     → nada a fazer; é resposta, não falha
 *   pediu, mas não escolhi fonte    → marque na biblioteca
 *   escolhi, mas o texto não veio   → extraia o texto delas
 *
 * Colapsá-las numa frase só transforma um próximo passo claro em adivinhação.
 *
 * UMA DECISÃO, DOIS CONSUMIDORES: a mensagem e o botão leem a MESMA prontidão.
 * Quando eram duas leituras, uma delas estava errada — e era a do botão.
 *
 * NENHUM PROVIDER · NENHUMA MUTAÇÃO · o matcher, a migration, o transcript e a
 * persistência não foram tocados.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const painel = () => readFileSync(new URL("../modules/radar/radar-r3-videos-panel.tsx", import.meta.url), "utf8");
const pagina = () => readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");

const fonteDominio = (patch: Partial<RadarMatchableSource> & { videoSourceId: string }): RadarMatchableSource => ({
  displayName: null, textState: "TEXT_READY", selectedForArticle: true,
  registrationStatus: "REGISTERED", languageCode: "pt", processingVersion: 1,
  segments: [], transcriptText: "",
  ...patch,
});

/* ==========  A DECISÃO, NO DOMÍNIO  ============================= */

test("VÍDEOS 3.0.1 · os quatro estados são quatro, e cada um diz o próximo passo", () => {
  const pronta = fonteDominio({ videoSourceId: "f1" });
  const semTexto = fonteDominio({ videoSourceId: "f2", textState: "QUEUED" });
  const naoSelecionada = fonteDominio({ videoSourceId: "f3", selectedForArticle: false });

  /* 1 · SEM INVESTIGAÇÃO FINALIZADA — e ter fonte pronta não adianta. */
  const naoFinalizada = radarMatchingReadiness({ articleId: "a1", investigationFinalized: false, frozenBriefCount: 0, sources: [pronta] });
  assert.equal(naoFinalizada.state, "INVESTIGATION_NOT_FINALIZED");
  assert.equal(naoFinalizada.canRun, false);
  assert.equal(naoFinalizada.reason, "Pesquisa ainda não finalizada. Finalize a investigação para gerar pautas audiovisuais quando houver necessidade.");

  /*
   * BLUEPRINT VIVO NÃO CONTA. Mesmo que a investigação corrente tenha pautas,
   * sem congelamento não há identidade a que amarrar o recorte.
   */
  const vivaComPautas = radarMatchingReadiness({ articleId: "a1", investigationFinalized: false, frozenBriefCount: 3, sources: [pronta] });
  assert.equal(vivaComPautas.state, "INVESTIGATION_NOT_FINALIZED", "pauta viva não habilita o casamento");

  /* 2 · FINALIZADA E SEM PAUTA — resposta, não falha. */
  const semPauta = radarMatchingReadiness({ articleId: "a1", investigationFinalized: true, frozenBriefCount: 0, sources: [pronta] });
  assert.equal(semPauta.state, "NO_VIDEO_BRIEFS");
  assert.equal(semPauta.canRun, false);
  assert.equal(semPauta.reason, "A investigação finalizada não identificou necessidade de apoio audiovisual.");
  assert.ok(!/falha|erro|inválid/i.test(semPauta.reason), "ausência não é acusada como erro");

  /* 3 · PAUTA SEM FONTE PRONTA — e a frase muda conforme o que falta. */
  const selecionadaSemTexto = radarMatchingReadiness({ articleId: "a1", investigationFinalized: true, frozenBriefCount: 2, sources: [semTexto] });
  assert.equal(selecionadaSemTexto.state, "NO_READY_SOURCES");
  assert.equal(selecionadaSemTexto.canRun, false);
  assert.match(selecionadaSemTexto.reason, /1 fonte\(s\) selecionada\(s\) ainda sem texto pronto/);
  assert.match(selecionadaSemTexto.reason, /Extraia o texto delas/);

  const nenhumaSelecionada = radarMatchingReadiness({ articleId: "a1", investigationFinalized: true, frozenBriefCount: 2, sources: [naoSelecionada] });
  assert.equal(nenhumaSelecionada.state, "NO_READY_SOURCES");
  assert.match(nenhumaSelecionada.reason, /Marque na biblioteca as que ele vai usar/);
  assert.notEqual(nenhumaSelecionada.reason, selecionadaSemTexto.reason, "faltar seleção e faltar texto são coisas diferentes");

  /* 4 · PRONTO. */
  const pronto = radarMatchingReadiness({ articleId: "a1", investigationFinalized: true, frozenBriefCount: 2, sources: [pronta, semTexto, naoSelecionada] });
  assert.equal(pronto.state, "READY");
  assert.equal(pronto.canRun, true);
  assert.equal(pronto.readySourceCount, 1);
  assert.match(pronto.reason, /2 pauta\(s\) · 1 fonte\(s\) com texto pronto/);

  /* E sem artigo a camada inteira não existe — nem a pergunta faz sentido. */
  const semArtigo = radarMatchingReadiness({ articleId: null, investigationFinalized: true, frozenBriefCount: 2, sources: [pronta] });
  assert.equal(semArtigo.state, "NO_ARTICLE");
  assert.equal(semArtigo.canRun, false);

  /* Fonte arquivada não conta como pronta, mesmo selecionada e com texto. */
  const arquivada = radarMatchingReadiness({
    articleId: "a1", investigationFinalized: true, frozenBriefCount: 1,
    sources: [fonteDominio({ videoSourceId: "f9", registrationStatus: "ARCHIVED" })],
  });
  assert.equal(arquivada.state, "NO_READY_SOURCES");
});

/* ==========  OS QUATRO ESTADOS, NA TELA  ======================== */

const { RadarR3VideosPanel } = await import("../modules/radar/radar-r3-videos-panel.tsx");

const fonteDaTela = (patch: Partial<RadarLibrarySource> & { id: string }): RadarLibrarySource => ({
  brandId: "marca-1", articleId: null, sourceKind: "YOUTUBE",
  originalUrl: `https://youtu.be/${patch.id}`, normalizedUrl: `https://www.youtube.com/watch?v=${patch.id}`,
  normalizedUrlHash: `ytv:${patch.id}`, youtubeVideoId: null, displayName: `Fonte ${patch.id}`,
  registrationStatus: "REGISTERED", registeredBy: null,
  registrationArticleDnaVersionId: null, registrationArticleDnaContentHash: null,
  textState: "TEXT_READY" as RadarVideoTextState, textStateReason: null,
  metadataFetchedAt: null, videoTitle: null, channelId: null, channelTitle: null,
  videoDescription: null, publishedAt: null, duration: null, thumbnails: null,
  uploadedMediaUri: null, uploadedMediaContentType: null, uploadedMediaAt: null,
  createdAt: "2026-09-14T10:00:00.000Z", updatedAt: "2026-09-14T10:00:00.000Z",
  selectedForArticle: true, articleUsageCount: 1,
  ...patch,
} as RadarLibrarySource);

const PRONTA = fonteDaTela({ id: "pronta" });

function vista(patch: Record<string, unknown>) {
  return {
    sources: [PRONTA], texts: [], briefs: [], briefsUnavailableReason: null,
    coverage: null, matching: false, investigationFinalized: false, frozenBriefCount: 0,
    loading: false, saving: false, extracting: null, lastBatch: null, error: null, readbackConfirmed: true,
    ...patch,
  };
}

const PAUTA_CONGELADA = { briefId: "b1", topic: "Rotina para pele oleosa", narrativePurpose: "Mostrar a ordem", whatToLookFor: ["ordem"], priority: "HIGH", frozen: true };

async function montar(patch: Record<string, unknown>) {
  const tela = await montarRadar();
  const acoes: unknown[][] = [];
  await tela.render(comProductShell(React.createElement(RadarR3VideosPanel, {
    articleId: "artigo-1", videoSources: vista(patch),
    onLibraryAction: () => {}, onRunMatching: (...args: unknown[]) => acoes.push(args),
  } as never)));
  return { tela, acoes };
}

const botao = (tela: Awaited<ReturnType<typeof montarRadar>>) => tela.get("radar-videos-run-matching") as HTMLButtonElement;

test("VÍDEOS 3.0.1 · 1 — sem investigação finalizada, a tela manda finalizar e o botão está desligado", async () => {
  const { tela, acoes } = await montar({ investigationFinalized: false, frozenBriefCount: 0 });

  assert.match(tela.text(), /Pesquisa ainda não finalizada\. Finalize a investigação para gerar pautas audiovisuais quando houver necessidade\./);
  assert.equal(tela.get("radar-videos-coverage-summary").getAttribute("data-readiness"), "INVESTIGATION_NOT_FINALIZED");
  assert.equal(botao(tela).disabled, true);
  assert.equal(botao(tela).getAttribute("data-readiness"), "INVESTIGATION_NOT_FINALIZED");

  /* E clicar num botão desligado não chama nada. */
  await tela.click("radar-videos-run-matching");
  assert.deepEqual(acoes, []);
  tela.destroy();
});

test("VÍDEOS 3.0.1 · 2 — finalizada sem pauta: a tela diz que não houve necessidade", async () => {
  const { tela, acoes } = await montar({ investigationFinalized: true, frozenBriefCount: 0 });

  assert.match(tela.text(), /A investigação finalizada não identificou necessidade de apoio audiovisual\./);
  assert.equal(tela.get("radar-videos-coverage-summary").getAttribute("data-readiness"), "NO_VIDEO_BRIEFS");
  assert.equal(botao(tela).disabled, true);
  /* A frase anterior sumiu: os dois estados não se confundem mais. */
  assert.ok(!tela.text().includes("Pesquisa ainda não finalizada"));

  await tela.click("radar-videos-run-matching");
  assert.deepEqual(acoes, []);
  tela.destroy();
});

test("VÍDEOS 3.0.1 · 3 — com pauta e sem fonte pronta, a tela diz o que falta", async () => {
  /* Selecionada, mas o texto ainda não veio. */
  const comFila = await montar({
    investigationFinalized: true, frozenBriefCount: 1, briefs: [PAUTA_CONGELADA],
    sources: [fonteDaTela({ id: "na-fila", textState: "QUEUED" as RadarVideoTextState })],
  });
  assert.match(comFila.tela.text(), /1 fonte\(s\) selecionada\(s\) ainda sem texto pronto/);
  assert.equal(botao(comFila.tela).disabled, true);
  assert.equal(botao(comFila.tela).getAttribute("data-readiness"), "NO_READY_SOURCES");
  await comFila.tela.click("radar-videos-run-matching");
  assert.deepEqual(comFila.acoes, []);
  comFila.tela.destroy();

  /* Nenhuma selecionada: outra ausência, outra frase. */
  const semSelecao = await montar({
    investigationFinalized: true, frozenBriefCount: 1, briefs: [PAUTA_CONGELADA],
    sources: [fonteDaTela({ id: "solta", selectedForArticle: false })],
  });
  assert.match(semSelecao.tela.text(), /Nenhuma fonte com texto pronto está selecionada para este artigo/);
  assert.equal(botao(semSelecao.tela).disabled, true);
  semSelecao.tela.destroy();
});

test("VÍDEOS 3.0.1 · 4 — com pauta e fonte pronta, o botão habilita e chama a ação", async () => {
  const { tela, acoes } = await montar({
    investigationFinalized: true, frozenBriefCount: 2, briefs: [PAUTA_CONGELADA],
    sources: [PRONTA],
  });

  assert.equal(botao(tela).disabled, false);
  assert.equal(botao(tela).getAttribute("data-readiness"), "READY");
  /* Enquanto não casou, a tela diz isso — e não uma ausência. */
  assert.match(tela.text(), /Pautas e conteúdo ainda não foram casados\./);
  assert.equal(tela.query("radar-videos-briefs-empty"), null, "a pauta aparece, então não há mensagem de vazio");

  const antes = tentativasDeRede.length;
  await tela.click("radar-videos-run-matching");
  assert.deepEqual(acoes, [["artigo-1"]], "o clique chama a ação uma vez");
  /* E a tela não chama provider nenhum: quem fala com o servidor é a página. */
  assert.equal(tentativasDeRede.length, antes);

  tela.destroy();
});

/* ==========  UMA DECISÃO, DOIS CONSUMIDORES  =================== */

test("VÍDEOS 3.0.1 · a mensagem e o botão leem a MESMA prontidão", () => {
  const tela = painel();

  /*
   * ERA AQUI QUE A TELA MENTIA: a coluna das pautas tinha uma frase própria e o
   * botão tinha uma condição própria. Dois julgamentos sobre o mesmo fato, e o
   * do botão estava errado.
   */
  assert.match(tela, /const prontidao = radarMatchingReadiness\(\{/);
  assert.match(tela, /disabled=\{!onRunMatching \|\| ocupado \|\| vista\?\.matching \|\| !prontidao\.canRun\}/);
  /*
   * VIDEOS 3.1 · sobrou UMA frase, e ela é a da prontidão.
   *
   * A lista duplicada de pautas tinha texto próprio (`briefsUnavailableReason`)
   * ao lado do do botão. Com ela recolhida ao disclosure do topo, resta o
   * resumo — que já lia `prontidao.reason` e agora carrega também o estado.
   * Um consumidor a menos é uma divergência a menos.
   */
  assert.match(tela, /: prontidao\.reason\}/);
  assert.match(tela, /data-testid="radar-videos-coverage-summary" data-readiness=\{prontidao\.state\}/);
  assert.equal(/briefsUnavailableReason \|\| prontidao\.reason/.test(tela), false, "a segunda frase não sobreviveu");
  assert.match(tela, /data-readiness=\{prontidao\.state\}/);

  /* O botão não decide por conta própria a partir da contagem de fontes. */
  assert.ok(!tela.includes("selecionadasDoArtigo.length === 0}"), "a condição antiga do botão não sobreviveu");

  /*
   * E A PÁGINA DECLARA OS DOIS FATOS separadamente: finalizada, e quantas
   * pautas o CONGELADO preservou. Um campo só não diria as duas coisas.
   */
  const texto = pagina();
  assert.match(texto, /const finalizada = Boolean\(investigacao\?\.finalizedBundle\);/);
  assert.match(texto, /investigationFinalized: videoBriefsDoArtigo\.finalizada, frozenBriefCount: videoBriefsDoArtigo\.frozenBriefCount,/);
  /* A pauta viva não entra na contagem que habilita o casamento. */
  assert.match(texto, /return \{ finalizada, frozenBriefCount: 0, briefs: vivas\.map/);
  assert.match(texto, /return \{ finalizada, frozenBriefCount: congelado\.length, briefs: congelado\.map/);
  /* E a frase antiga saiu da página: quem decide o texto é o domínio. */
  assert.ok(!texto.includes("A investigação atual não produziu pauta de vídeo."), "a frase antiga não sobreviveu");
});

/* ==========  NADA MAIS FOI TOCADO  ============================= */

test("VÍDEOS 3.0.1 · matcher, migration, transcript e persistência intactos", () => {
  const dominio = readFileSync(new URL("../lib/radar/video-brief-matching.ts", import.meta.url), "utf8");

  /* A prontidão é ADITIVA: ela não entra no caminho do casamento. */
  const casamento = dominio.slice(dominio.indexOf("export function matchRadarVideoBriefs"), dominio.indexOf("function classificar"));
  assert.ok(!casamento.includes("radarMatchingReadiness"), "o matcher não consulta a prontidão");
  assert.ok(!casamento.includes("investigationFinalized"), "nem conhece o estado da investigação");

  /* O portão da ancoragem continua igual — é o coração do Gate 3. */
  assert.match(dominio, /originalText: ancorados\.map\(item => item\.text\.trim\(\)\)\.join\(" "\)/);
  assert.match(dominio, /const startMs = Math\.min\(\.\.\.ancorados\.map\(item => item\.startMs\)\)/);

  /* E a tela continua sem casar nada sozinha. */
  assert.ok(!painel().includes("matchRadarVideoBriefs"), "o painel não casa");
  for (const efeito of pagina().match(/useEffect\([\s\S]*?\n {2}\}, \[[^\]]*\]\);/g) || []) {
    assert.ok(!/radar-video-matching|runVideoMatching\(/.test(efeito), "nenhum useEffect casa pautas");
  }
});

/* ==========  PROVIDER  ========================================= */

test("VÍDEOS 3.0.1 · nenhuma chamada de rede saiu desta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `PROVIDER_CALLS deveria ser 0; houve: ${tentativasDeRede.join(", ")}`);
});

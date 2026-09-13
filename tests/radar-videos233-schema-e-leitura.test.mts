import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { summarizeRadarVideoLibrary, type RadarLibrarySource } from "../lib/radar/video-library.ts";
import type { RadarVideoTextState } from "../lib/radar/video-text-acquisition.ts";
import { comProductShell, montarRadar, React } from "./radar-dom-harness.mts";

/*
 * ======  VÍDEOS · GATE 2.3.3 — O SCHEMA E A LEITURA HONESTA  ==========
 *
 * O QUE O USER VIU: a biblioteca abria sem artigo (o 2.3.2 funcionou), mas a
 * leitura remota falhava com
 *
 *   column radar_video_sources.uploaded_media_uri does not exist
 *
 * e o card dizia "Nenhuma fonte na biblioteca da marca".
 *
 * DOIS DEFEITOS, e o segundo é o pior:
 *
 *   1. DRIFT     `20260911180000` nunca foi aplicada. Não falta UMA coluna:
 *                treze das vinte e oito que a rota lê nascem nela. A 12100000
 *                foi aplicada antes, fora de ordem.
 *   2. MENTIRA   a tela afirmou um acervo VAZIO a partir de uma consulta que
 *                nunca voltou. Lista vazia e leitura falha são estados
 *                diferentes, e a projeção não os distinguia.
 *
 * O drift some quando a migration for aplicada. A mentira não: ela é de
 * desenho, e é aqui que ela fica travada.
 *
 * PROVIDER_CALLS = 0.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const rotaFontes = () => ler("../app/api/editorial/radar-video-sources/route.ts");
const painel = () => ler("../modules/radar/radar-r3-videos-panel.tsx");
const workbench = () => ler("../modules/radar/radar-r3-workbench.tsx");
const base = () => ler("../supabase/migrations/20260911120000_radar_video_sources.sql");
const textos = () => ler("../supabase/migrations/20260911180000_radar_video_source_texts.sql");
const biblioteca = () => ler("../supabase/migrations/20260912100000_radar_video_library.sql");

/* ==========  A · O SCHEMA QUE A ROTA PRESSUPÕE  ================== */

/** As colunas que o SELECT canônico da biblioteca pede ao banco. */
function colunasSelecionadas(): string[] {
  const rota = rotaFontes();
  const linha = /const COLUNAS = "([^"]+)"/.exec(rota);
  assert.ok(linha, "a rota declara a lista de colunas num lugar só");
  return linha[1].split(",").map(item => item.trim()).filter(Boolean);
}

/** As colunas de `radar_video_sources` que cada migration promete criar. */
function colunasOferecidas(): Map<string, string> {
  const oferta = new Map<string, string>();

  /* O CREATE TABLE original. */
  const criacao = base();
  const corpo = criacao.slice(criacao.indexOf("CREATE TABLE IF NOT EXISTS public.radar_video_sources"));
  for (const linha of corpo.slice(0, corpo.indexOf("\n);")).split("\n").slice(1)) {
    const nome = /^\s{2}([a-z_]+)\s/.exec(linha);
    if (nome && !/^(CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK)$/i.test(nome[1])) oferta.set(nome[1], "20260911120000");
  }

  /* E os ALTER ... ADD COLUMN das seguintes. */
  for (const [arquivo, texto] of [["20260911180000", textos()], ["20260912100000", biblioteca()]] as const) {
    const alvo = texto.split("ALTER TABLE public.radar_video_sources");
    for (const bloco of alvo.slice(1)) {
      const trecho = bloco.slice(0, bloco.indexOf(";"));
      for (const achado of trecho.matchAll(/ADD COLUMN IF NOT EXISTS ([a-z_]+)/g)) {
        if (!oferta.has(achado[1])) oferta.set(achado[1], arquivo);
      }
    }
  }
  return oferta;
}

test("VÍDEOS 2.3.3 · A — toda coluna que a rota lê é criada por alguma migration", () => {
  const pedidas = colunasSelecionadas();
  const oferecidas = colunasOferecidas();

  /*
   * O DETECTOR DE DRIFT.
   *
   * O runtime disse "column uploaded_media_uri does not exist" e parou na
   * PRIMEIRA que faltava — o erro não conta quantas outras vêm junto. Esta
   * varredura conta: se o SELECT pedir uma coluna que nenhuma migration cria,
   * o teste falha antes de alguém abrir a tela.
   */
  const orfas = pedidas.filter(coluna => !oferecidas.has(coluna));
  assert.deepEqual(orfas, [], `colunas sem migration: ${orfas.join(", ")}`);

  /* E a coluna do relato está declarada onde o gate afirma. */
  assert.equal(oferecidas.get("uploaded_media_uri"), "20260911180000");
  assert.equal(pedidas.includes("uploaded_media_uri"), true);
});

test("VÍDEOS 2.3.3 · A — 20260911180000 não é uma coluna: são treze", () => {
  const pedidas = new Set(colunasSelecionadas());
  const oferecidas = colunasOferecidas();

  const daFaltante = [...oferecidas.entries()]
    .filter(([coluna, arquivo]) => arquivo === "20260911180000" && pedidas.has(coluna))
    .map(([coluna]) => coluna)
    .sort();

  /*
   * O ERRO PARECIA PONTUAL E NÃO ERA. Remover `uploaded_media_uri` do SELECT
   * para "resolver" teria descoberto a próxima coluna, e a próxima — treze
   * vezes. O que falta é a migration inteira.
   */
  assert.deepEqual(daFaltante, [
    "channel_id", "channel_title", "duration", "metadata_fetched_at", "published_at",
    "text_state", "text_state_reason", "thumbnails", "uploaded_media_at",
    "uploaded_media_content_type", "uploaded_media_uri", "video_description", "video_title",
  ]);
  assert.equal(daFaltante.length, 13);
});

test("VÍDEOS 2.3.3 · aplicar 20260911180000 depois da 12100000 é seguro", () => {
  const sql = textos();

  /*
   * A ORDEM INVERTEU-SE NO BANCO REAL, e a pergunta é se a migration atrasada
   * ainda pode entrar. Ela não toca em NADA que a 12100000 mexeu: não conhece
   * `radar_article_video_sources`, não conhece a identidade da fonte e não
   * conhece `article_id`.
   */
  for (const alheio of ["radar_article_video_sources", "uq_radar_video_source_identity", "uq_radar_video_source_brand_identity", "article_id"]) {
    assert.ok(!sql.includes(alheio), `a migration atrasada não toca em "${alheio}"`);
  }

  /* E ela é reexecutável: a constraint sem IF NOT EXISTS ganhou guarda. */
  assert.match(sql, /IF NOT EXISTS \(\s*\n\s*SELECT 1 FROM pg_constraint[\s\S]{0,220}uq_radar_video_source_texts_brand_id/);
  const naoIdempotentes = sql
    .split("\n")
    .filter(linha => /^\s*(CREATE (TABLE|INDEX|UNIQUE INDEX|POLICY)|ALTER TABLE [^\n]*ADD CONSTRAINT)/.test(linha))
    .filter(linha => !/IF NOT EXISTS/.test(linha))
    .filter(linha => !/CREATE POLICY/.test(linha));
  assert.deepEqual(naoIdempotentes, [], "toda criação é condicional");

  /* A 12100000, por sua vez, já sabe conviver com a chegada tardia do texto. */
  assert.match(biblioteca(), /IF to_regclass\('public\.radar_video_source_texts'\) IS NOT NULL THEN/);
});

/* ==========  B, F e G · ERRO NÃO É LISTA VAZIA  ================== */

const fonte = (patch: Partial<RadarLibrarySource> & { id: string }): RadarLibrarySource => ({
  brandId: "marca-1", articleId: null, sourceKind: "YOUTUBE",
  originalUrl: `https://youtu.be/${patch.id}`, normalizedUrl: `https://www.youtube.com/watch?v=${patch.id}`,
  normalizedUrlHash: `ytv:${patch.id}`, youtubeVideoId: null, displayName: null,
  registrationStatus: "REGISTERED", registeredBy: null,
  registrationArticleDnaVersionId: null, registrationArticleDnaContentHash: null,
  textState: "REGISTERED" as RadarVideoTextState, textStateReason: null,
  metadataFetchedAt: null, videoTitle: null, channelId: null, channelTitle: null,
  videoDescription: null, publishedAt: null, duration: null, thumbnails: null,
  uploadedMediaUri: null, uploadedMediaContentType: null, uploadedMediaAt: null,
  createdAt: "2026-09-12T10:00:00.000Z", updatedAt: "2026-09-12T10:00:00.000Z",
  selectedForArticle: false, articleUsageCount: 0,
  ...patch,
} as RadarLibrarySource);

const FALHA = 'column radar_video_sources.uploaded_media_uri does not exist';

test("VÍDEOS 2.3.3 · B, F e G — quatro estados de leitura, e só um deles diz 'nenhuma'", () => {
  /* F · o erro REAL do relato, com a lista vazia que o acompanhava. */
  const falhou = summarizeRadarVideoLibrary({ sources: [], articleId: null, error: FALHA, readbackConfirmed: false });
  assert.equal(falhou.state, "READ_FAILED");
  assert.equal(falhou.headline, "Não foi possível carregar a biblioteca");
  assert.equal(falhou.detail, FALHA, "o motivo técnico é mostrado, não engolido");
  assert.equal(falhou.tone, "warning");
  assert.ok(!falhou.headline.includes("Nenhuma fonte"), "leitura falha não vira acervo vazio");

  /* G · zero fontes de VERDADE — depois de uma leitura que voltou. */
  const vazia = summarizeRadarVideoLibrary({ sources: [], articleId: null, readbackConfirmed: true });
  assert.equal(vazia.state, "READ_OK");
  assert.equal(vazia.headline, "Nenhuma fonte na biblioteca da marca");

  /* B · e os dois estados intermediários também não afirmam vazio. */
  const lendo = summarizeRadarVideoLibrary({ sources: [], articleId: null, loading: true, readbackConfirmed: false });
  assert.equal(lendo.state, "LOADING");
  assert.ok(!lendo.headline.includes("Nenhuma fonte"));

  const nuncaLida = summarizeRadarVideoLibrary({ sources: [], articleId: null, readbackConfirmed: false });
  assert.equal(nuncaLida.state, "NOT_READ");
  assert.ok(!nuncaLida.headline.includes("Nenhuma fonte"));
  assert.match(nuncaLida.detail, /leitura remota ainda não foi confirmada/i);

  /*
   * E O ERRO VENCE O CACHE. Uma leitura que falhou DEPOIS de uma boa ainda tem
   * fontes em memória; mostrá-las como atuais esconderia que a tela está
   * defasada em relação ao banco.
   */
  const defasada = summarizeRadarVideoLibrary({
    sources: [fonte({ id: "a" }), fonte({ id: "b" })],
    articleId: null, error: FALHA, readbackConfirmed: true,
  });
  assert.equal(defasada.state, "READ_FAILED");
  assert.equal(defasada.counts.live, 2, "as fontes continuam contadas…");
  assert.ok(!defasada.headline.includes("2 fonte"), "…mas o título não as afirma como atuais");
});

test("VÍDEOS 2.3.3 · F no DOM — a falha aparece como falha, no painel e no card", async () => {
  const tela = await montarRadar();
  const { RadarR3VideosPanel } = await import("../modules/radar/radar-r3-videos-panel.tsx");

  await tela.render(comProductShell(React.createElement(RadarR3VideosPanel, {
    articleId: null,
    videoSources: {
      sources: [], texts: [], briefs: [], coverage: null, matching: false, investigationFinalized: false, frozenBriefCount: 0, briefsUnavailableReason: null,
      loading: false, saving: false, extracting: null, lastBatch: null,
      error: FALHA, readbackConfirmed: false,
    },
    onLibraryAction: () => {}, onReloadLibrary: () => {},
  } as never)));

  const linha = tela.get("radar-videos-reading");
  assert.equal(linha.getAttribute("data-read-state"), "READ_FAILED");
  assert.match(tela.text(), /Não foi possível carregar a biblioteca/);
  assert.ok(!tela.text().includes("Nenhuma fonte na biblioteca"), "a tela não afirma acervo vazio");
  /* I · e o erro continua na camada principal, com saída. */
  assert.ok(tela.query("radar-videos-error"));
  assert.ok(tela.query("radar-videos-retry"));
  assert.match(tela.text(), new RegExp("uploaded_media_uri"), "o motivo técnico fica visível");

  tela.destroy();
});

test("VÍDEOS 2.3.3 · G no DOM — zero fontes de verdade continua dizendo 'nenhuma'", async () => {
  const tela = await montarRadar();
  const { RadarR3VideosPanel } = await import("../modules/radar/radar-r3-videos-panel.tsx");

  await tela.render(comProductShell(React.createElement(RadarR3VideosPanel, {
    articleId: null,
    videoSources: {
      sources: [], texts: [], briefs: [], coverage: null, matching: false, investigationFinalized: false, frozenBriefCount: 0, briefsUnavailableReason: null,
      loading: false, saving: false, extracting: null, lastBatch: null,
      error: null, readbackConfirmed: true,
    },
    onLibraryAction: () => {},
  } as never)));

  assert.equal(tela.get("radar-videos-reading").getAttribute("data-read-state"), "READ_OK");
  assert.match(tela.text(), /Nenhuma fonte na biblioteca da marca/);
  assert.equal(tela.query("radar-videos-error"), null);
  /* E cadastrar continua disponível: acervo vazio não é tela travada. */
  assert.ok(tela.query("radar-videos-input"));
  assert.ok(tela.query("radar-videos-register"));

  tela.destroy();
});

test("VÍDEOS 2.3.3 · F no card — a tela do relato: sem artigo e com o SELECT quebrado", async () => {
  /*
   * É EXATAMENTE O QUE O USER VIU, reproduzido: nenhum artigo selecionado e a
   * leitura remota falhando. O card dizia "Nenhuma fonte na biblioteca da
   * marca" — uma afirmação sobre um acervo que ninguém tinha conseguido ler.
   */
  const tela = await montarRadar();
  const { RadarR3Workbench } = await import("../modules/radar/radar-r3-workbench.tsx");

  await tela.render(comProductShell(React.createElement(RadarR3Workbench, {
    model: null, refreshing: false, articleId: null,
    videoSources: {
      sources: [], texts: [], briefs: [], coverage: null, matching: false, investigationFinalized: false, frozenBriefCount: 0, briefsUnavailableReason: null,
      loading: false, saving: false, extracting: null, lastBatch: null,
      error: FALHA, readbackConfirmed: false,
    },
    onOpenArticle: () => {}, onOpenDetail: () => {},
  } as never)));

  assert.match(tela.text(), /Não foi possível carregar a biblioteca/);
  assert.match(tela.text(), /Erro de leitura/, "o estado do card diz que falhou");
  assert.ok(!tela.text().includes("Nenhuma fonte na biblioteca"), "o card não afirma acervo vazio");
  assert.ok(!tela.text().includes("Não utilizado"), "nem que a área está sem uso");

  tela.destroy();
});

test("VÍDEOS 2.3.3 · B — card e painel leem a MESMA projeção", () => {
  /*
   * DUAS PROJEÇÕES DO MESMO FATO DIVERGEM — já divergiram na coluna do
   * Especialista, no Gate 18.7. O card e o painel chamam a mesma função.
   */
  assert.match(workbench(), /summarizeRadarVideoLibrary\(\{ sources, articleId, \.\.\.leitura \}\)/);
  assert.match(painel(), /const leitura = summarizeRadarVideoLibrary\(\{/);
  assert.match(painel(), /loading: vista\?\.loading, error: vista\?\.error, readbackConfirmed: vista\?\.readbackConfirmed,/);

  /*
   * E NENHUM DOS DOIS ESCREVE "nenhuma fonte" POR CONTA PRÓPRIA.
   *
   * A frase existe uma vez só, no domínio, atrás do estado READ_OK. Um literal
   * na tela poderia voltar a ser escolhido por `sources.length` — que é o que
   * transformava erro em acervo vazio.
   */
  /* Os comentários citam a frase para explicar o defeito: o alvo é o CÓDIGO. */
  const semComentarios = (texto: string) => texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const [nome, texto] of [["painel", painel()], ["workbench", workbench()]] as const) {
    assert.ok(!/Nenhuma fonte na biblioteca/.test(semComentarios(texto)), `${nome} não tem o literal do vazio`);
  }
  const linhaDoPainel = painel().slice(painel().indexOf('data-testid="radar-videos-reading"'), painel().indexOf("radar-videos-error"));
  assert.match(linhaDoPainel, /\{leitura\.headline\}/, "o texto vem da projeção");
  /* O `length` que sobrou ali é guarda do sufixo de filtro, sob READ_OK. */
  assert.match(linhaDoPainel, /leitura\.state === "READ_OK" && registradas\.length \? ` · \$\{visiveis\.length\} no filtro atual\.` : ""/);
});

/* ==========  H e I · INFOHINT  ================================== */

test("VÍDEOS 2.3.3 · H — a copy explicativa foi para o InfoHint", () => {
  const tela = painel();

  /* As duas explicações longas saíram da primeira camada. */
  assert.match(tela, /<InfoHint\s*\n\s*title="Biblioteca de fontes da marca"/);
  assert.match(tela, /<InfoHint\s*\n\s*title="Conteúdo extraído"/);
  assert.match(tela, /A fonte de vídeo pertence à MARCA e pode servir a vários artigos/);
  assert.match(tela, /O texto extraído é preservado no idioma ORIGINAL/);

  /* E não sobraram como parágrafo permanente. */
  assert.ok(!tela.includes('data-testid="radar-videos-roadmap"'), "o parágrafo de escopo saiu da primeira camada");
  assert.ok(!/<p[^>]*>\s*\n\s*A fonte pertence à marca e pode servir a vários artigos/.test(tela));
});

test("VÍDEOS 2.3.3 · I — estado, ação e erro NÃO foram para o InfoHint", async () => {
  const tela = painel();

  /*
   * A REGRA DO GATE: explicação vai para o InfoHint; estado, ação e erro ficam.
   *
   * O teste varre o conteúdo de CADA `description` — um estado escondido atrás
   * de um ícone é um estado que ninguém vê enquanto opera.
   */
  const descricoes = [...tela.matchAll(/description="([^"]+)"/g)].map(item => item[1]);
  assert.ok(descricoes.length >= 2, "existem InfoHints no painel");

  const proibidos = [
    "Não foi possível carregar", "Leitura remota ainda não confirmada",
    "fonte(s) na biblioteca", "selecionada(s) para este artigo",
    "TEXT_READY", "Nenhuma pauta", "Tentar novamente",
  ];
  for (const descricao of descricoes) {
    for (const termo of proibidos) {
      assert.ok(!descricao.includes(termo), `"${termo}" é estado/ação e não pode viver num InfoHint`);
    }
  }

  /* E os estados continuam alcançáveis na árvore principal. */
  const ecra = await montarRadar();
  const { RadarR3VideosPanel } = await import("../modules/radar/radar-r3-videos-panel.tsx");
  await ecra.render(comProductShell(React.createElement(RadarR3VideosPanel, {
    articleId: "artigo-1",
    videoSources: {
      sources: [fonte({ id: "pronta", displayName: "Pronta", textState: "TEXT_READY", selectedForArticle: true })],
      texts: [], briefs: [], coverage: null, matching: false, investigationFinalized: false, frozenBriefCount: 0, briefsUnavailableReason: null,
      loading: false, saving: false, extracting: null, lastBatch: null,
      error: null, readbackConfirmed: false,
    },
    onLibraryAction: () => {}, onRegisterVideoSources: () => {},
  } as never)));

  assert.match(ecra.text(), /1 selecionada\(s\) para este artigo/);
  assert.match(ecra.text(), /Leitura remota ainda não confirmada/);
  assert.ok(ecra.query("radar-videos-register"), "a ação continua na primeira camada");

  ecra.destroy();
});

/* ==========  J · O 2.3.2 NÃO REGREDIU  ========================== */

test("VÍDEOS 2.3.3 · J — selecionar artigo continua sem remontar a biblioteca", async () => {
  const tela = await montarRadar();
  const { RadarR3VideosPanel } = await import("../modules/radar/radar-r3-videos-panel.tsx");
  const acervo = [fonte({ id: "palestra-a", displayName: "Palestra A" }), fonte({ id: "palestra-b", displayName: "Palestra B" })];

  const render = (articleId: string | null, sources: RadarLibrarySource[]) => comProductShell(React.createElement(RadarR3VideosPanel, {
    articleId,
    videoSources: {
      sources, texts: [], briefs: [], coverage: null, matching: false, investigationFinalized: false, frozenBriefCount: 0, briefsUnavailableReason: null,
      loading: false, saving: false, extracting: null, lastBatch: null, error: null, readbackConfirmed: true,
    },
    onLibraryAction: () => {},
  } as never));

  await tela.render(render(null, acervo));
  const linhas = tela.container.querySelectorAll("[data-testid='radar-videos-registered'] > li");
  assert.equal(linhas.length, 2);
  const primeira = linhas[0];

  /* Selecionar artigo: as mesmas linhas, agora com a camada do artigo. */
  await tela.render(render("artigo-1", acervo.map(item => ({ ...item, selectedForArticle: item.id === "palestra-a" }))));
  assert.equal(tela.container.querySelectorAll("[data-testid='radar-videos-registered'] > li")[0], primeira, "a linha é o mesmo nó");
  assert.ok(tela.query("radar-videos-check-palestra-a"));

  /* E largar o artigo também não remonta. */
  await tela.render(render(null, acervo));
  assert.equal(tela.container.querySelectorAll("[data-testid='radar-videos-registered'] > li")[0], primeira, "continua o mesmo nó");
  assert.equal(tela.query("radar-videos-check-palestra-a"), null);

  tela.destroy();
});

/* ==========  K e L · PROVIDER  ================================= */

test("VÍDEOS 2.3.3 · K e L — nenhuma chamada de rede saiu desta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `PROVIDER_CALLS deveria ser 0; houve: ${tentativasDeRede.join(", ")}`);
});

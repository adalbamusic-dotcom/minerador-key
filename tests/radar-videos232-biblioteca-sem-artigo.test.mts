import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { overlayRadarArticleSelection, summarizeRadarVideoLibrary, type RadarLibrarySource } from "../lib/radar/video-library.ts";
import type { RadarVideoTextState } from "../lib/radar/video-text-acquisition.ts";
import { comProductShell, montarRadar, React } from "./radar-dom-harness.mts";

/*
 * ======  VÍDEOS · GATE 2.3.2 — A BIBLIOTECA NÃO ESPERA ARTIGO  ========
 *
 * O DEFEITO QUE O USER VIU: sem artigo selecionado, o Workbench dizia
 * "Selecione um artigo para trabalhar", a área Vídeos virava esqueleto, a tela
 * piscava, e a biblioteca da marca ficava inalcançável.
 *
 * Três causas somadas, todas cobertas aqui:
 *
 *   1. FRONTEIRA   o retorno antecipado `if (!model)` desabilitava as QUATRO
 *                  áreas, e as rotas exigiam `articleId` — a camada da marca
 *                  não tinha como existir.
 *   2. REMONTAGEM  `key={activeRadarRowId}` no Workbench remontava a árvore
 *                  inteira a cada troca de artigo, apagando a biblioteca.
 *   3. LAÇO        o efeito de leitura tinha o próprio cache nas dependências
 *                  e uma guarda que o caminho de erro reabria: falha → estado
 *                  → efeito → falha, indefinidamente.
 *
 * DUAS CAMADAS:
 *   BRAND    sempre disponível enquanto existe marca.
 *   ARTICLE  só com artigo ativo, e ausente — não fingida — sem ele.
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

const pagina = () => readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
const workbench = () => readFileSync(new URL("../modules/radar/radar-r3-workbench.tsx", import.meta.url), "utf8");
const rotaFontes = () => readFileSync(new URL("../app/api/editorial/radar-video-sources/route.ts", import.meta.url), "utf8");
const rotaBiblioteca = () => readFileSync(new URL("../app/api/editorial/radar-video-library/route.ts", import.meta.url), "utf8");

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

const { RadarR3VideosPanel } = await import("../modules/radar/radar-r3-videos-panel.tsx");
const { RadarR3Workbench } = await import("../modules/radar/radar-r3-workbench.tsx");
type VistaDeVideos = Parameters<typeof RadarR3VideosPanel>[0]["videoSources"];

const vista = (sources: RadarLibrarySource[], patch: Partial<NonNullable<VistaDeVideos>> = {}): VistaDeVideos => ({
  sources, texts: [], briefs: [], coverage: null, matching: false, investigationFinalized: false, frozenBriefCount: 0, briefsUnavailableReason: "sem investigação neste fixture",
  loading: false, saving: false, extracting: null, lastBatch: null, error: null, readbackConfirmed: true,
  ...patch,
});

/** A B C — a biblioteca da marca, sempre as mesmas três fontes. */
const ACERVO: RadarLibrarySource[] = [
  fonte({ id: "palestra-a", displayName: "Palestra A", textState: "TEXT_READY" }),
  fonte({ id: "palestra-b", displayName: "Palestra B", textState: "QUEUED" }),
  fonte({ id: "palestra-c", displayName: "Palestra C" }),
];

/** A mesma biblioteca, com a seleção de um artigo por cima. */
const comSelecao = (ids: string[], usos: Record<string, number> = {}) =>
  ACERVO.map(item => ({ ...item, selectedForArticle: ids.includes(item.id), articleUsageCount: usos[item.id] ?? (ids.includes(item.id) ? 1 : 0) }));

const painelDe = (articleId: string | null, sources: RadarLibrarySource[], extra: Record<string, unknown> = {}) =>
  React.createElement(RadarR3VideosPanel, { articleId, videoSources: vista(sources), onLibraryAction: () => {}, onRegisterVideoSources: () => {}, ...extra } as never);

/* ==========  A SOBREPOSIÇÃO, NO DOMÍNIO  ======================== */

test("VÍDEOS 2.3.2 · a camada do artigo é uma sobreposição, e sem artigo ela é vazia", () => {
  const links = [
    { articleId: "artigo-1", videoSourceId: "palestra-a" },
    { articleId: "artigo-2", videoSourceId: "palestra-a" },
    { articleId: "artigo-2", videoSourceId: "palestra-b" },
  ];

  /*
   * SEM ARTIGO, NADA SELECIONADO — e esta é a linha que separa "biblioteca da
   * marca" de "tudo em uso". Tratar a ausência como "tudo" mostraria uso que
   * ninguém declarou, e o checkbox nasceria marcado para o artigo seguinte.
   */
  const semArtigo = overlayRadarArticleSelection({ sources: ACERVO, links, articleId: null });
  assert.deepEqual(semArtigo.map(item => item.selectedForArticle), [false, false, false]);
  /* Mas o USO continua contado: é informação da FONTE, não do artigo corrente. */
  assert.deepEqual(semArtigo.map(item => item.articleUsageCount), [2, 1, 0]);

  /* Com artigo, só o que aquele artigo declarou. */
  const doUm = overlayRadarArticleSelection({ sources: ACERVO, links, articleId: "artigo-1" });
  assert.deepEqual(doUm.map(item => item.selectedForArticle), [true, false, false]);

  const doDois = overlayRadarArticleSelection({ sources: ACERVO, links, articleId: "artigo-2" });
  assert.deepEqual(doDois.map(item => item.selectedForArticle), [true, true, false]);
  /* A contagem de uso não muda com o artigo que está olhando. */
  assert.deepEqual(doDois.map(item => item.articleUsageCount), [2, 1, 0]);

  /* Um artigo que não selecionou nada não vê seleção nenhuma. */
  const estranho = overlayRadarArticleSelection({ sources: ACERVO, links, articleId: "artigo-9" });
  assert.deepEqual(estranho.map(item => item.selectedForArticle), [false, false, false]);

  /* E as duas rotas usam ESTA decisão, em vez de cada uma reimplementá-la. */
  for (const rota of [rotaFontes(), rotaBiblioteca()]) {
    assert.match(rota, /overlayRadarArticleSelection\(\{\s*\r?\n\s*sources: \w+,\s*\r?\n\s*links: linhas\.map\(item => \(\{ articleId: item\.article_id, videoSourceId: item\.video_source_id \}\)\),\s*\r?\n\s*articleId,\s*\r?\n\s*\}\)/);
    assert.ok(!rota.includes("const doArtigo = new Set("), "a sobreposição não é reimplementada na rota");
  }
});

/* ==========  A, D e L · SEM ARTIGO  ============================== */

test("VÍDEOS 2.3.2 · A — sem artigo, a biblioteca da marca renderiza inteira", async () => {
  const tela = await montarRadar();
  await tela.render(comProductShell(painelDe(null, ACERVO)));

  assert.ok(tela.query("radar-videos-panel"), "o painel existe sem artigo");
  assert.match(tela.text(), /Biblioteca de fontes da marca/);
  assert.match(tela.text(), /3 fonte\(s\) na biblioteca da marca/);
  /* As três linhas estão lá, com título, estado e endereço. */
  for (const nome of ["Palestra A", "Palestra B", "Palestra C"]) assert.match(tela.text(), new RegExp(nome));

  tela.destroy();
});

test("VÍDEOS 2.3.2 · D e L — sem artigo, a camada do artigo não existe", async () => {
  const tela = await montarRadar();
  await tela.render(comProductShell(painelDe(null, ACERVO)));

  /* D · nenhuma caixa de "usar neste artigo": não há artigo a declarar. */
  for (const id of ["palestra-a", "palestra-b", "palestra-c"]) {
    assert.equal(tela.query(`radar-videos-check-${id}`), null, `sem checkbox em ${id}`);
  }
  /* L · nem o filtro de selecionadas, nem o contador, nem o lote, nem processar. */
  assert.equal(tela.query("radar-videos-filter-SELECTED_FOR_ARTICLE"), null);
  assert.equal(tela.query("radar-videos-article-count"), null);
  assert.equal(tela.query("radar-videos-bulk"), null);
  assert.equal(tela.query("radar-videos-process-selected"), null);

  /* E a ausência é DITA, não deixada no vazio. */
  assert.ok(tela.query("radar-videos-no-article"));
  assert.match(tela.text(), /Nenhum artigo selecionado — a biblioteca é da marca\./);

  /* O que é da MARCA continua de pé. */
  assert.ok(tela.query("radar-videos-input"), "cadastrar continua disponível");
  assert.ok(tela.query("radar-videos-register"));
  assert.ok(tela.query("radar-videos-clear-list"));
  assert.ok(tela.query("radar-videos-archive-palestra-a"), "arquivar é da biblioteca");

  tela.destroy();
});

/* ==========  B e C · CADASTRO SEM ARTIGO  ======================= */

test("VÍDEOS 2.3.2 · B — sem artigo, cadastrar é fluxo válido e principal", async () => {
  const tela = await montarRadar();
  const cadastros: unknown[][] = [];
  await tela.render(comProductShell(painelDe(null, [], { onRegisterVideoSources: (...args: unknown[]) => cadastros.push(args) })));

  const campo = tela.get("radar-videos-input");
  await tela.type(campo, "https://youtu.be/dQw4w9WgXcQ");
  await tela.click("radar-videos-register");

  /* O artigo chega NULO, e é isso que o servidor precisa receber. */
  assert.deepEqual(cadastros, [[null, "https://youtu.be/dQw4w9WgXcQ"]]);
  assert.deepEqual(tentativasDeRede, [], "nenhum provider ao cadastrar");

  tela.destroy();
});

test("VÍDEOS 2.3.2 · C — sem artigo, nenhuma associação é criada, nem no cliente nem no servidor", () => {
  /*
   * O cliente manda `null` e não inventa artigo. A varredura é do CORPO do
   * registro — o arquivo inteiro citaria `activeRadarItem.articleId` por
   * motivos que nada têm com vídeo.
   */
  const cadastroNaPagina = pagina().slice(pagina().indexOf("const registerVideoSources = useCallback"), pagina().indexOf("const extractVideoText = useCallback"));
  assert.match(cadastroNaPagina, /articleId: articleId \|\| null,\s*\r?\n\s*raw,/);
  assert.ok(!cadastroNaPagina.includes("activeRadarItem"), "nenhum artigo implícito é injetado no cadastro");
  assert.match(cadastroNaPagina, /const item = articleId \? pipeline\.radarItems\.find\(row => row\.articleId === articleId\) \|\| null : null;/);

  /*
   * O SERVIDOR ACEITA O NULO NAS DUAS OPERAÇÕES.
   *
   * Uma asserção só casaria com qualquer um dos dois esquemas e deixaria o
   * outro voltar a exigir artigo sem ninguém perceber — então cada um é
   * conferido no próprio bloco.
   */
  const rota = rotaFontes();
  const listar = rota.slice(rota.indexOf("const ListQuerySchema"), rota.indexOf("const RegisterSchema"));
  const registrar = rota.slice(rota.indexOf("const RegisterSchema"), rota.indexOf("type LinhaRemota"));
  for (const [nome, bloco] of [["leitura", listar], ["cadastro", registrar]] as const) {
    assert.match(bloco, /articleId: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(256\)\.nullable\(\)\.optional\(\),/, `${nome} aceita artigo nulo`);
  }
  /* E as três ações de fonte também: metadado, texto e mídia. */
  for (const caminho of ["radar-video-metadata", "radar-video-text", "radar-video-media"]) {
    const texto = readFileSync(new URL(`../app/api/editorial/${caminho}/route.ts`, import.meta.url), "utf8");
    assert.match(texto, /articleId: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(256\)\.nullable\(\)\.optional\(\),/, `${caminho} aceita artigo nulo`);
  }

  const post = rota.slice(rota.indexOf("export async function POST"));
  assert.match(post, /article_id: parsed\.data\.articleId \|\| null,/);
  for (const escrita of ["insert", "upsert", "update", "delete"]) {
    assert.ok(!post.includes(`radar_article_video_sources").${escrita}(`), `o cadastro não faz ".${escrita}()" no vínculo`);
  }

  /*
   * E AS AÇÕES DO ARTIGO RECUSAM EM VOZ ALTA em vez de escolher um artigo
   * qualquer para a requisição passar — isso gravaria uso que ninguém declarou.
   */
  assert.match(rotaBiblioteca(), /const ACOES_DO_ARTIGO = \["SELECT", "UNSELECT", "PROCESS_SELECTED"\] as const;/);
  assert.match(rotaBiblioteca(), /if \(!articleId && \(ACOES_DO_ARTIGO as readonly string\[\]\)\.includes\(action\)\) \{/);
  assert.match(rotaBiblioteca(), /code: "ARTICLE_REQUIRED"/);
  /* Arquivar e limpar são da biblioteca: continuam valendo sem artigo. */
  assert.ok(!rotaBiblioteca().includes('"ARCHIVE", "CLEAR_LIST"] as const'), "arquivar não entrou na lista do artigo");
});

/* ==========  E, F, G e H · A CAMADA DO ARTIGO  ================== */

test("VÍDEOS 2.3.2 · E — com artigo, a camada do artigo aparece", async () => {
  const tela = await montarRadar();
  await tela.render(comProductShell(painelDe("artigo-1", comSelecao(["palestra-a"]))));

  for (const id of ["palestra-a", "palestra-b", "palestra-c"]) {
    assert.ok(tela.query(`radar-videos-check-${id}`), `checkbox em ${id}`);
  }
  assert.ok(tela.query("radar-videos-filter-SELECTED_FOR_ARTICLE"));
  assert.ok(tela.query("radar-videos-process-selected"));
  assert.ok(tela.query("radar-videos-article-count"));
  assert.equal(tela.query("radar-videos-no-article"), null);
  assert.match(tela.text(), /1 selecionada\(s\) para este artigo/);

  tela.destroy();
});

test("VÍDEOS 2.3.2 · F, G e H — trocar e largar o artigo não mexe nas fontes", async () => {
  const tela = await montarRadar();

  /* Artigo 1: A selecionada. */
  await tela.render(comProductShell(painelDe("artigo-1", comSelecao(["palestra-a"], { "palestra-a": 2 }))));
  const linhaA = tela.get("radar-videos-check-palestra-a");
  const linhaC = tela.get("radar-videos-check-palestra-c");
  assert.equal((linhaA as HTMLInputElement).checked, true);
  assert.equal((linhaC as HTMLInputElement).checked, false);

  /* Artigo 2: B e C. */
  await tela.render(comProductShell(painelDe("artigo-2", comSelecao(["palestra-b", "palestra-c"], { "palestra-a": 2 }))));

  /*
   * F · AS MESMAS LINHAS, LITERALMENTE.
   *
   * Comparar a identidade do nó prova que o React reconciliou em vez de
   * remontar: uma remontagem devolveria elementos novos, e é exatamente ela
   * que apagava a biblioteca na tela a cada troca.
   */
  assert.equal(tela.get("radar-videos-check-palestra-a"), linhaA, "a linha A é o mesmo nó");
  assert.equal(tela.get("radar-videos-check-palestra-c"), linhaC, "a linha C é o mesmo nó");
  assert.match(tela.text(), /3 fonte\(s\) na biblioteca da marca/);

  /* G · e cada artigo mostra a seleção dele. */
  assert.equal((tela.get("radar-videos-check-palestra-a") as HTMLInputElement).checked, false);
  assert.equal((tela.get("radar-videos-check-palestra-b") as HTMLInputElement).checked, true);
  assert.equal((tela.get("radar-videos-check-palestra-c") as HTMLInputElement).checked, true);
  assert.match(tela.text(), /2 selecionada\(s\) para este artigo/);

  /* H · largar o artigo mantém a biblioteca e retira só a camada dele. */
  await tela.render(comProductShell(painelDe(null, ACERVO)));
  assert.match(tela.text(), /3 fonte\(s\) na biblioteca da marca/);
  for (const nome of ["Palestra A", "Palestra B", "Palestra C"]) assert.match(tela.text(), new RegExp(nome));
  assert.equal(tela.query("radar-videos-check-palestra-a"), null);
  assert.ok(tela.query("radar-videos-no-article"));

  tela.destroy();
});

/* ==========  I e J · PROVIDER E F5  ============================= */

test("VÍDEOS 2.3.2 · I e J — trocar contexto não chama nada, e o F5 sem artigo devolve a biblioteca", async () => {
  const antes = tentativasDeRede.length;
  const tela = await montarRadar();

  /* I · abrir, trocar A→B, largar: quatro contextos, zero chamadas. */
  await tela.render(comProductShell(painelDe(null, ACERVO)));
  await tela.render(comProductShell(painelDe("artigo-1", comSelecao(["palestra-a"]))));
  await tela.render(comProductShell(painelDe("artigo-2", comSelecao(["palestra-b"]))));
  await tela.render(comProductShell(painelDe(null, ACERVO)));
  assert.equal(tentativasDeRede.length, antes, "trocar de contexto não chama provider");
  tela.destroy();

  /* J · F5 é montagem nova, sem artigo, e a biblioteca volta do servidor. */
  const depois = await montarRadar();
  await depois.render(comProductShell(painelDe(null, ACERVO)));
  assert.match(depois.text(), /3 fonte\(s\) na biblioteca da marca/);
  assert.ok(depois.query("radar-videos-input"), "e continua administrável");
  depois.destroy();

  /* A leitura que sustenta o F5 é por MARCA, e o artigo é opcional nela. */
  assert.match(pagina(), /const loadVideoLibrary = useCallback\(async \(articleId: string \| null\) => \{/);
  assert.match(pagina(), /if \(!selectedBrandId\) return;/);
  assert.match(pagina(), /if \(articleId\) busca\.set\("articleId", articleId\);/);

  /*
   * E A PÁGINA NÃO CONDICIONA O PAINEL AO ARTIGO ATIVO.
   *
   * `videoSources={activeRadarItem ? ... : undefined}` era metade do defeito:
   * mesmo com o Workbench montado, a vista chegava indefinida sem artigo e a
   * biblioteca aparecia vazia.
   */
  const texto = pagina();
  /* O Gate 3 acrescentou a cobertura à vista; o que importa aqui é a ausência da condicional. */
  assert.match(texto, /videoSources=\{\{ \.\.\.videoLibrary, briefs: videoBriefsDoArtigo\.briefs, briefsUnavailableReason: videoBriefsDoArtigo\.reason,/);
  assert.ok(!/videoSources=\{activeRadarItem \?/.test(texto), "a vista não depende do artigo ativo");

  /* Nem o efeito: ele desiste por falta de MARCA, nunca por falta de artigo. */
  const efeito = texto.slice(texto.indexOf("  useEffect(() => {\n    if (!selectedBrandId) return;"));
  const corpo = efeito.slice(0, efeito.indexOf("}, ["));
  assert.ok(!/if \(!articleId\) return;/.test(corpo), "a ausência de artigo não aborta a leitura");
  assert.ok(!/if \(!articleId \|\| !selectedBrandId\) return;/.test(corpo));
});

/* ==========  K · FILTRO SEM ARTIGO  ============================= */

test("VÍDEOS 2.3.2 · K — o filtro da marca funciona sem artigo", async () => {
  const tela = await montarRadar();
  const acervo = [...ACERVO, fonte({ id: "antiga", displayName: "Palestra antiga", registrationStatus: "ARCHIVED" })];
  await tela.render(comProductShell(painelDe(null, acervo)));

  await tela.click("radar-videos-filter-TEXT_READY");
  assert.match(tela.text(), /Palestra A/);
  assert.ok(!tela.text().includes("Palestra C"), "só a com texto pronto permanece");

  await tela.click("radar-videos-filter-PROCESSING");
  assert.match(tela.text(), /Palestra B/);

  await tela.click("radar-videos-filter-NOT_PROCESSED");
  assert.match(tela.text(), /Palestra C/);

  await tela.click("radar-videos-filter-ARCHIVED");
  assert.match(tela.text(), /Palestra antiga/);

  /*
   * A arquivada continua NO ACERVO — ela sai da biblioteca por padrão, e a
   * linha diz as duas coisas: três na biblioteca, uma arquivada.
   */
  await tela.click("radar-videos-filter-ALL");
  assert.match(tela.text(), /3 fonte\(s\) na biblioteca da marca/);
  assert.match(tela.text(), /1 arquivada\(s\)/);
  assert.match(tela.text(), /3 no filtro atual/);

  tela.destroy();
});

/* ==========  M · O CARD DO TOPO  =============================== */

test("VÍDEOS 2.3.2 · M — sem artigo, o card Vídeos conta a marca em vez de virar esqueleto", async () => {
  const tela = await montarRadar();
  await tela.render(comProductShell(React.createElement(RadarR3Workbench, {
    model: null, refreshing: false,
    articleId: null, videoSources: vista(ACERVO),
    onOpenArticle: () => {}, onOpenDetail: () => {},
  } as never)));

  /*
   * O CARD ERA UM ESQUELETO — literalmente: `DisabledAreaCard` desenha uma
   * barrinha cinza no lugar do conteúdo. Era isso que o USER via.
   */
  assert.equal(tela.query("radar-r3-card-videos-disabled"), null, "Vídeos não é mais card desabilitado");
  assert.ok(tela.query("radar-r3-card-videos"), "e é clicável");

  /* As três áreas do artigo continuam desabilitadas — elas dependem mesmo dele. */
  for (const area of ["pesquisa", "especialista", "relatorio"]) {
    assert.ok(tela.query(`radar-r3-card-${area}-disabled`), `${area} continua aguardando artigo`);
  }

  /* E o card conta a BIBLIOTECA, não o conteúdo local legado. */
  assert.match(tela.text(), /3 fonte\(s\) na biblioteca da marca/);
  assert.match(tela.text(), /1 com texto pronto/);
  assert.match(tela.text(), /1 em processamento/);
  assert.ok(!tela.text().includes("Nenhum material registrado"), "com biblioteca cheia, nada de 'nenhum material'");
  /* Sem artigo, nenhuma linha de seleção — um zero ali seria mentira. */
  assert.ok(!tela.text().includes("selecionada(s) para este artigo"));

  /* E abrir o card abre a biblioteca, sem artigo nenhum. */
  await tela.click("radar-r3-card-videos");
  assert.ok(tela.query("radar-videos-panel"), "a biblioteca abre sem artigo");
  assert.ok(tela.query("radar-videos-input"));

  tela.destroy();
});

test("VÍDEOS 2.3.2 · M — com artigo, o card acrescenta a linha do artigo", () => {
  /*
   * A linha do artigo é um ACRÉSCIMO, e só existe quando há artigo: o resumo
   * decide isso por `articleId`, não por um contador que vale zero.
   */
  const semArtigo = summarizeRadarVideoLibrary({ sources: comSelecao(["palestra-a"]), articleId: null, readbackConfirmed: true });
  assert.equal(semArtigo.counts.selectedForArticle, null, "sem artigo não há seleção a contar");
  assert.ok(!semArtigo.detail.includes("selecionada(s) para este artigo"));

  const comArtigo = summarizeRadarVideoLibrary({ sources: comSelecao(["palestra-a"]), articleId: "artigo-1", readbackConfirmed: true });
  assert.equal(comArtigo.counts.selectedForArticle, 1);
  assert.match(comArtigo.detail, /1 selecionada\(s\) para este artigo/);
  /* O acervo é o mesmo nos dois: só a camada do artigo muda. */
  assert.equal(comArtigo.headline, semArtigo.headline);

  /* E o card conta a biblioteca, não `model.r4.existingContent`. */
  const fonteDoResumo = workbench().slice(workbench().indexOf("function resumoDaBiblioteca"), workbench().indexOf("function AreaCard"));
  assert.ok(!fonteDoResumo.includes("existingContent"), "o card não conta mais o conteúdo local legado");
  assert.match(fonteDoResumo, /summarizeRadarVideoLibrary\(\{ sources, articleId, \.\.\.leitura \}\)/);
  assert.match(workbench(), /copy=\{area === "videos" \? copyDeVideos : areaCopy\(area, model, searchMode\)\}/);
});

/* ==========  N · O LAÇO  ======================================= */

test("VÍDEOS 2.3.2 · N — a leitura é tentada uma vez por contexto, e não em laço", () => {
  const texto = pagina();
  const efeito = texto.slice(texto.indexOf("  useEffect(() => {\n    if (!selectedBrandId) return;"));
  const corpo = efeito.slice(0, efeito.indexOf("}, ["));
  const deps = efeito.slice(efeito.indexOf("}, ["), efeito.indexOf("]);") + 3);

  /*
   * A CAUSA DO PISCAR, NOMEADA.
   *
   * O efeito antigo tinha `videoSourcesByArticle` nas dependências e se guardava
   * por `readbackConfirmed`. No caminho de ERRO os dois voltavam a falso, o
   * efeito redisparava e a leitura entrava em laço.
   */
  assert.ok(!deps.includes("videoLibrary"), "o cache não é dependência do efeito que o escreve");
  assert.ok(!deps.includes("videoSourcesByArticle"), "nem sob o nome antigo");
  assert.ok(!corpo.includes("readbackConfirmed"), "a guarda não depende do resultado da leitura");

  /* A guarda é uma tentativa por marca+artigo, dê certo ou não. */
  assert.match(corpo, /const chave = `\$\{selectedBrandId\}:\$\{articleId \|\| ""\}`;/);
  assert.match(corpo, /if \(bibliotecaTentada\.current\.has\(chave\)\) return;/);
  assert.match(corpo, /bibliotecaTentada\.current\.add\(chave\);/);

  /* E o preço dela vem com a saída: repetir é decisão de quem opera. */
  assert.match(texto, /const reloadVideoLibrary = useCallback\(\(articleId: string \| null\) => \{/);
  assert.match(texto, /bibliotecaTentada\.current\.delete\(`\$\{selectedBrandId\}:\$\{articleId \|\| ""\}`\);/);
});

test("VÍDEOS 2.3.2 · N — a leitura nunca esvazia a lista enquanto carrega", async () => {
  /*
   * O OUTRO PISCAR: `sources: current[articleId]?.sources || []` zerava a lista
   * para um artigo ainda não lido. A biblioteca sumia por meio segundo a cada
   * troca — com os dados certos chegando logo depois.
   */
  const texto = pagina();
  const carregar = texto.slice(texto.indexOf("const loadVideoLibrary = useCallback"), texto.indexOf("const reloadVideoLibrary"));
  assert.match(carregar, /setVideoLibrary\(current => \(\{ \.\.\.current, loading: true, error: null \}\)\);/);
  assert.ok(!/sources: \[\]/.test(carregar), "carregar não zera as fontes");

  /* E na tela: `loading` não apaga o que já está lá. */
  const tela = await montarRadar();
  await tela.render(comProductShell(painelDe(null, ACERVO)));
  await tela.render(comProductShell(React.createElement(RadarR3VideosPanel, {
    articleId: null, videoSources: vista(ACERVO, { loading: true }), onLibraryAction: () => {},
  } as never)));
  for (const nome of ["Palestra A", "Palestra B", "Palestra C"]) assert.match(tela.text(), new RegExp(nome));
  assert.match(tela.text(), /Lendo a biblioteca…/);

  tela.destroy();
});

test("VÍDEOS 2.3.2 · N — a falha oferece saída em vez de repetir sozinha", async () => {
  const tela = await montarRadar();
  const recarregas: unknown[][] = [];
  await tela.render(comProductShell(React.createElement(RadarR3VideosPanel, {
    articleId: null, videoSources: vista(ACERVO, { error: "Falha ao ler a biblioteca de vídeos." }),
    onLibraryAction: () => {}, onReloadLibrary: (...args: unknown[]) => recarregas.push(args),
  } as never)));

  assert.ok(tela.query("radar-videos-error"));
  await tela.click("radar-videos-retry");
  assert.deepEqual(recarregas, [[null]], "repetir é um clique, não um efeito");
  /* E a biblioteca continua na tela por trás do erro. */
  assert.match(tela.text(), /Palestra A/);

  tela.destroy();
});

/* ==========  PROVIDER  ========================================= */

test("VÍDEOS 2.3.2 · nenhuma chamada de rede saiu desta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `PROVIDER_CALLS deveria ser 0; houve: ${tentativasDeRede.join(", ")}`);
});

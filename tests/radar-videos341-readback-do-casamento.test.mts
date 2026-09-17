import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  matchRadarVideoBriefs,
  radarCoverageFromExtracts,
  summarizeRadarBriefCoverage,
  type RadarFrozenBriefInput,
  type RadarMatchableSource,
} from "../lib/radar/video-brief-matching.ts";
import { comProductShell, montarRadar, React } from "./radar-dom-harness.mts";

/*
 * ====  VÍDEOS · GATE 3.4.1 — PERSISTÊNCIA E READBACK DO CASAMENTO  ====
 *
 * O runtime disse a verdade inteira:
 *
 *   MATCH_RUNTIME   funcionou — 5 trechos gravados, m4 ativa, m2 superada;
 *   F5_READBACK     falhou — a tela voltou a "ainda não foram casados".
 *
 * A CAUSA, e ela é simples: NÃO HAVIA LEITURA. `videoMatching` só era escrito
 * pelo clique, e a rota tinha um GET que nenhuma tela chamava. O resultado
 * vivia em memória de React; recarregar apagava da vista um casamento íntegro
 * no banco.
 *
 * ============== O QUE ESTE ARQUIVO EXISTE PARA IMPEDIR ================
 *
 *   que o resultado volte a depender do estado criado pelo clique;
 *   que existam duas montagens do mesmo resultado — uma para o clique e
 *   outra para o carregamento — livres para divergir;
 *   que erro de leitura volte a ser exibido como "ainda não casaram".
 *
 * PROVIDER_CALLS = 0 · nenhuma rede sai desta suíte.
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
const pagina = () => ler("../modules/radar/radar-page.tsx");
const painel = () => ler("../modules/radar/radar-r3-videos-panel.tsx");
const rota = () => ler("../app/api/editorial/radar-video-matching/route.ts");
const leitura = () => ler("../lib/server/radar-video-matching-read.ts");
const persistencia = () => ler("../lib/server/radar-video-brief-extracts.ts");

/* ==========  §2 e §4 · UMA PROJEÇÃO, DOIS CONSUMIDORES  ============ */

test("VÍDEOS 3.4.1 · o clique e o carregamento usam a MESMA leitura do banco", () => {
  const texto = rota();

  /* O GET carrega pela projeção única… */
  assert.match(texto, /export async function GET\(request: Request\)/);
  assert.match(texto, /const gravado = await loadRadarVideoBriefMatching\(\{[\s\S]{0,200}\}\);/);

  /* …e o POST responde com a MESMA, depois de gravar. */
  assert.match(texto, /READBACK PELA MESMA PROJEÇÃO QUE O F5 USA/);
  assert.equal((texto.match(/loadRadarVideoBriefMatching\(\{/g) || []).length, 2, "as duas pontas chamam a mesma função");
  assert.match(texto, /coverage: gravado\.coverage,/);

  /*
   * E NÃO SOBROU UMA SEGUNDA MONTAGEM. `radarCoverageFromExtracts` na rota
   * seria o caminho paralelo de volta: o clique montando o resultado por conta
   * própria enquanto o F5 monta pelo read model.
   */
  const codigo = texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.equal(/radarCoverageFromExtracts|readRadarExtractRun/.test(codigo), false, "nenhuma projeção paralela na rota");
});

test("VÍDEOS 3.4.1 · a consulta não exige que a tela conheça o bundle", () => {
  /*
   * §4 · O `frozenBundleId` saiu da consulta e é derivado no servidor, da mesma
   * investigação congelada que o casamento usou. Exigi-lo do cliente obrigava a
   * tela a conhecer bundle para pedir o próprio resultado — e uma tela que
   * acabou de carregar não conhece.
   */
  assert.match(rota(), /const ConsultaSchema = z\.object\(\{\s*\r?\n\s*brandId: z\.string\(\)\.uuid\(\),\s*\r?\n\s*articleId: z\.string\(\)[^\n]*\r?\n\s*\}\);/);
  assert.equal(/frozenBundleId: z\.string/.test(rota()), false, "o cliente não manda bundle");
  assert.match(leitura(), /export async function readRadarFrozenVideoBriefs/);
  assert.match(leitura(), /frozenBundleId: pautas\.frozenBundleId, client: input\.client,/);
});

/* ==========  §3 · A RUN ATIVA, E A SUPERSESSÃO  ==================== */

test("VÍDEOS 3.4.1 · a leitura devolve a execução corrente, e a m2 não volta", () => {
  /*
   * §3 · A regra da supersessão já existia na persistência: a leitura filtra
   * `superseded_at IS NULL` e ordena pela mais nova. O que faltava era alguém
   * CHAMAR essa leitura. Os 509 trechos da m2 continuam gravados e não voltam.
   */
  assert.match(persistencia(), /\.is\("superseded_at", null\)/);
  assert.match(persistencia(), /\.order\("created_at", \{ ascending: false \}\)\s*\r?\n\s*\.limit\(1\)/);
  assert.match(leitura(), /const gravado = await readRadarExtractRun\(\{/);

  /* E a versão do matcher é lida da impressão digital, sem coluna nova. */
  assert.match(leitura(), /export function radarMatcherVersionOfFingerprint/);
  assert.match(leitura(), /\/\^m\(\\d\+\):\//);

  /*
   * SEM EXECUÇÃO, A LEITURA SAI ANTES DE CLASSIFICAR.
   *
   * Classificar pautas sem execução devolveria `NOT_FOUND` com cara de
   * resultado — "casou e não achou nada" no lugar de "nunca casou". A saída
   * antecipada é a regra, não uma otimização: por isso ela vem ANTES da conta.
   */
  const corpo = leitura();
  const saida = corpo.indexOf("if (!gravado.run) {");
  const conta = corpo.indexOf("const coverage = radarCoverageFromExtracts(");
  assert.ok(saida > 0 && conta > saida, "a recusa vem antes de calcular cobertura");
});

/* ==========  §5 · O F5  =========================================== */

test("VÍDEOS 3.4.1 · a página lê o casamento ao abrir, e a leitura não casa nada", () => {
  const texto = pagina();

  /* A leitura existe, é GET, e declara que não quer cache (§8). */
  /*
   * A LEITURA MUDOU DE CASA NO RADAR_LIVE_UX_2.2 — §7 — e não de natureza.
   *
   * Era um `loadVideoMatching` próprio, chamado por um efeito com guarda. Agora
   * ela é uma das três leituras paralelas do read-model da área, e continua
   * sendo GET, continua declarando que não quer cache, e continua não casando
   * nada.
   */
  assert.match(texto, /const carregarAreaVideos = useCallback\(async \(signal: AbortSignal\) => \{/);
  assert.match(texto, /fetch\(`\/api\/editorial\/radar-video-matching\?\$\{new URLSearchParams/);
  assert.match(texto, /cache: "no-store" as const, signal/);

  /*
   * E ELA É CHAMADA POR UM EFEITO — uma tentativa por marca + artigo. Sem isto
   * a função existiria e ninguém a usaria, que é a forma mais silenciosa deste
   * defeito voltar.
   */
  /*
   * E ELA É CHAMADA PELO HOOK DA ÁREA — que tem cache por chave e uma leitura
   * por chave. A guarda de "uma tentativa por contexto" virou parte da
   * infraestrutura; repeti-la aqui impediria a área de se atualizar sozinha.
   */
  assert.match(texto, /load: carregarAreaVideos,/);
  assert.match(texto, /area: "videos",/);

  /*
   * §5 · O EFEITO LÊ E SÓ LÊ. Um POST aqui dentro criaria execução a cada
   * abertura de página — e o gate anterior gastou uma rodada inteira provando
   * que casar é ação humana.
   */
  const leitura = texto.slice(texto.indexOf("const carregarAreaVideos = useCallback"), texto.indexOf("const videosPendenteRef"));
  assert.ok(leitura.includes("radar-video-matching"), "a leitura do casamento está no read-model da área");
  assert.equal(/method: "POST"|runVideoMatching\(/.test(leitura), false, "F5_CREATES_NEW_RUN = NO");
});

test("VÍDEOS 3.4.1 · nenhum hook da página fica depois do retorno antecipado", () => {
  /*
   * O DEFEITO QUE ESTE TESTE EXISTE PARA NÃO DEIXAR VOLTAR.
   *
   * `RadarPage` tem um retorno antecipado no meio — `if (state ||
   * !pipeline.snapshot) return state;` — enquanto a marca carrega. Um hook
   * abaixo dele não roda em todo render, e React derruba a tela inteira com
   * "change in the order of Hooks". Foi exatamente o que aconteceu quando a
   * leitura do casamento nasceu junto de `activeRadarItem`, que só existe lá
   * embaixo: tela preta, sem dado nenhum.
   *
   * Provar que o efeito EXISTE não bastava: ele existia. O que não podia era
   * estar onde estava.
   */
  const texto = pagina().replace(/\r/g, "");
  const corte = texto.indexOf("  if (state || !pipeline.snapshot) return state;");
  assert.ok(corte > 0, "o retorno antecipado continua lá");

  const depois = texto.slice(corte).split("\n");
  const hooksTardios = depois.filter(linha => /^ {2}(const [^=]+= )?use[A-Z]\w*\(/.test(linha));
  assert.deepEqual(hooksTardios, [], "todo hook do componente vive acima do retorno antecipado");

  /* E o efeito do casamento está entre os que vivem acima. */
  assert.ok(texto.indexOf("const leituraDeVideos = useRadarAreaLiveRead({") < corte, "a leitura da área roda em todo render");
});

test("VÍDEOS 3.4.1 · o que o servidor devolve sobrevive à ida e volta sem perder nada", () => {
  /*
   * §5 · A PROVA DE QUE O F5 MOSTRA O MESMO.
   *
   * A execução calcula e grava; a leitura reconstrói do texto gravado. Aqui as
   * duas pontas são comparadas campo a campo — estado, evidências, tempos,
   * critérios cobertos, critérios faltantes e fontes.
   */
  const pauta: RadarFrozenBriefInput = {
    briefId: "b1", topic: "O que piora a oleosidade no rosto?",
    narrativePurpose: "", whatToLookFor: ["os sinais visíveis", "onde eles aparecem"],
    relatedSectionId: null, relatedSectionTitle: "O que piora a oleosidade no rosto?",
    questions: ["O que piora a oleosidade no rosto?"], entities: ["oleosa", "rosto"],
    evidenceNeeded: "", priority: "MEDIUM",
  };
  const fonte: RadarMatchableSource = {
    videoSourceId: "f1", displayName: null, textState: "TEXT_READY", selectedForArticle: true,
    registrationStatus: "REGISTERED", languageCode: "pt", processingVersion: 1, transcriptText: "",
    segments: [
      { text: "o calor aumenta a oleosidade visivel do rosto", startMs: 1_000, endMs: 5_500 },
      { text: "e a marca aparece mais na regiao da testa", startMs: 5_500, endMs: 10_000 },
    ],
  };

  const executado = matchRadarVideoBriefs({ briefs: [pauta], sources: [fonte] });
  assert.ok(executado.coverage[0].extracts.length, "houve o que gravar");

  /* É assim que o banco devolve: sem os vereditos derivados. */
  const comoOBancoDevolve = executado.coverage.flatMap(item => item.extracts)
    .map(item => ({ ...item, matchedCriteria: [] as string[], answersTitle: false }));
  const relido = radarCoverageFromExtracts({ briefs: [pauta], extracts: comoOBancoDevolve });

  const projetar = (cobertura: typeof relido) => cobertura.map(item => ({
    videoBriefId: item.videoBriefId, state: item.state, reason: item.reason,
    matchedCriteria: item.matchedCriteria, missingCriteria: item.missingCriteria,
    usefulSourceIds: item.usefulSourceIds,
    extracts: item.extracts.map(trecho => ({
      videoSourceId: trecho.videoSourceId, startMs: trecho.startMs, endMs: trecho.endMs,
      originalText: trecho.originalText, segmentIndexes: trecho.segmentIndexes,
      matchedCriteria: trecho.matchedCriteria, answersTitle: trecho.answersTitle,
    })),
  }));

  assert.deepEqual(projetar(relido), projetar(executado.coverage), "F5_LOADS_M4 = YES");
  assert.deepEqual(summarizeRadarBriefCoverage(relido), summarizeRadarBriefCoverage(executado.coverage));
});

/* ==========  §6 · O SEGUNDO CLIQUE  =============================== */

test("VÍDEOS 3.4.1 · material idêntico reutiliza a execução em vez de criar outra", () => {
  /*
   * §6 · A idempotência já existia e continua onde estava: mesma impressão
   * digital, mesma execução. O que este gate não podia fazer era quebrá-la ao
   * mexer na leitura.
   */
  assert.match(persistencia(), /if \(atual\.run && atual\.run\.inputFingerprint === input\.inputFingerprint\) \{\s*\r?\n\s*return \{ runId: atual\.run\.runId, reused: true \};/);
  assert.match(rota(), /reused: execucao\.reused,/);
  /* E o clique diz isso a quem opera, em vez de fingir que recalculou. */
  assert.match(pagina(), /if \(corpo\.reused\) partes\.push\("nada mudou desde o último casamento"\);/);
});

/* ==========  §7 · AUSÊNCIA NÃO É ERRO  ============================ */

test("VÍDEOS 3.4.1 · erro de leitura não é exibido como 'ainda não foram casados'", () => {
  const texto = pagina();

  /*
   * A PÁGINA SEPARA AS DUAS SITUAÇÕES NO READ-MODEL…
   *
   * O RADAR_LIVE_UX_2.2 tirou o casamento do estado React e o pôs na leitura da
   * área. A distinção que este teste protege continua idêntica: "ninguém casou
   * ainda" e "existe e não consegui ler" não podem virar a mesma coisa.
   */
  assert.match(texto, /matchingLoadFailed: Boolean\(videosArticleId && !casamentoLido\),/);
  assert.match(texto, /matchingError: videosArticleId && !casamentoLido \? \(casamento\?\.error \|\| "Não foi possível carregar o casamento salvo\."\) : null,/);

  /*
   * …e nunca engole o erro como ausência: sem execução, `coverage` fica `null`
   * com `loadFailed` falso; com falha de leitura, `null` com `loadFailed`
   * verdadeiro. Um só campo não conseguiria dizer as duas coisas.
   */
  assert.match(texto, /coverage: casamentoLido \? \(casamento\.run \? \(casamento\.coverage \|\| \[\]\) as RadarBriefCoverage\[\] : null\) : null,/);

  /* E a tela escolhe a frase pela distinção, não pela ausência. */
  const tela = painel();
  assert.match(tela, /\{matchingLoadFailed\s*\r?\n?\s*\? vista\?\.matchingError \|\| "Não foi possível carregar o casamento salvo\."/);
  assert.match(tela, /data-matching-state=\{matchingLoadFailed \? "READ_ERROR" : cobertura \? "LOADED" : "NEVER_MATCHED"\}/);
});

test("VÍDEOS 3.4.1 · a tela diz qual das três situações é, e não mistura duas", async () => {
  /*
   * PROVAR NO ARQUIVO NÃO É PROVAR NA TELA. Aqui as três situações são
   * montadas de verdade e o que se lê é o texto renderizado.
   */
  /*
   * A FONTE PRONTA É PRÉ-REQUISITO DA FRASE.
   *
   * Sem material selecionado com texto, a linha diz outra coisa — o que falta
   * para poder casar. "Ainda não foram casados" só é verdade quando dava para
   * casar e ninguém casou.
   */
  const base = {
    articleId: "artigo-1",
    videoSources: {
      sources: [{
        id: "f1", brandId: "m1", articleId: "artigo-1", sourceKind: "YOUTUBE_VIDEO",
        originalUrl: "https://youtu.be/abc", normalizedUrl: "https://www.youtube.com/watch?v=abc",
        normalizedUrlHash: "hash", youtubeVideoId: "abc", displayName: "Fonte",
        registrationStatus: "REGISTERED", registeredBy: null,
        registrationArticleDnaVersionId: null, registrationArticleDnaContentHash: null,
        textState: "TEXT_READY", textStateReason: null, metadataFetchedAt: null,
        videoTitle: null, channelId: null, channelTitle: null, videoDescription: null,
        publishedAt: null, duration: null, thumbnails: null,
        uploadedMediaUri: null, uploadedMediaContentType: null, uploadedMediaAt: null,
        createdAt: "2026-09-13T00:00:00.000Z", updatedAt: "2026-09-13T00:00:00.000Z",
        selectedForArticle: true, articleUsageCount: 1,
      }],
      texts: [],
      briefs: [{ briefId: "b1", topic: "Uma pauta", narrativePurpose: "", whatToLookFor: [], priority: "HIGH", frozen: true }],
      briefsUnavailableReason: null, matching: false, investigationFinalized: true, frozenBriefCount: 1,
      loading: false, saving: false, extracting: null, lastBatch: null, error: null, readbackConfirmed: true,
    },
  };
  const { RadarR3VideosPanel } = await import("../modules/radar/radar-r3-videos-panel.tsx");

  const nunca = await montarRadar();
  await nunca.render(comProductShell(React.createElement(RadarR3VideosPanel, {
    ...base, videoSources: { ...base.videoSources, coverage: null, matchingLoadFailed: false },
  } as never)));
  assert.equal(nunca.get("radar-videos-coverage-summary").getAttribute("data-matching-state"), "NEVER_MATCHED");
  assert.match(nunca.get("radar-videos-coverage-summary").textContent || "", /ainda não foram casados/);
  nunca.destroy();

  const falhou = await montarRadar();
  await falhou.render(comProductShell(React.createElement(RadarR3VideosPanel, {
    ...base,
    videoSources: { ...base.videoSources, coverage: null, matchingLoadFailed: true, matchingError: "Não foi possível conectar ao Supabase editorial." },
  } as never)));
  const resumoDaFalha = falhou.get("radar-videos-coverage-summary");
  assert.equal(resumoDaFalha.getAttribute("data-matching-state"), "READ_ERROR");
  assert.match(resumoDaFalha.textContent || "", /Não foi possível conectar ao Supabase editorial\./);
  assert.equal(/ainda não foram casados/.test(resumoDaFalha.textContent || ""), false, "EMPTY_STATE_DISTINGUISHED_FROM_READ_ERROR = YES");
  falhou.destroy();

  const carregado = await montarRadar();
  await carregado.render(comProductShell(React.createElement(RadarR3VideosPanel, {
    ...base,
    videoSources: {
      ...base.videoSources,
      coverage: [{ videoBriefId: "b1", state: "NOT_FOUND", extracts: [], usefulSourceIds: [], criteria: [], matchedCriteria: [], missingCriteria: [], reason: "Nada respondeu." }],
      matchingLoadFailed: false,
    },
  } as never)));
  assert.equal(carregado.get("radar-videos-coverage-summary").getAttribute("data-matching-state"), "LOADED");
  carregado.destroy();
});

/* ==========  §9 · O QUE ESTE GATE NÃO PODIA TOCAR  ================ */

test("VÍDEOS 3.4.1 · a leitura não transcreve, não chama provider e não depende do navegador", () => {
  const superficie = `${leitura()}${rota()}`.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const proibido of ["youtube", "googleapis", "runSharedLongSpeech", "external_processing_jobs", "localStorage", "sessionStorage"]) {
    assert.ok(!superficie.toLowerCase().includes(proibido.toLowerCase()), `a leitura não faz "${proibido}"`);
  }
  /* E o read model é server-only por construção. */
  assert.match(leitura(), /^import "server-only";/);

  /* O resultado do casamento nunca passou por localStorage, e continua sem. */
  const trecho = pagina().slice(pagina().indexOf("const loadVideoMatching"), pagina().indexOf("const handleExpandedChange"));
  assert.equal(/localStorage|sessionStorage/.test(trecho), false, "LOCAL_STATE_REQUIRED = NO");
});

test("VÍDEOS 3.4.1 · nenhuma chamada de rede saiu desta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `PROVIDER_CALLS = 0 — ${tentativasDeRede.join(", ")}`);
});

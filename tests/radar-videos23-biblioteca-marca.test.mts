import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  decideRadarVideoArchive,
  decideRadarVideoProcessing,
  filterRadarVideoLibrary,
  summarizeRadarVideoArchive,
  type RadarLibrarySource,
} from "../lib/radar/video-library.ts";
import { classifyRadarVideoSourceBatch, radarVideoSourceIdentity } from "../lib/radar/video-source.ts";
import type { RadarVideoTextState } from "../lib/radar/video-text-acquisition.ts";
import { comProductShell, montarRadar, React } from "./radar-dom-harness.mts";

/*
 * ======  VÍDEOS · GATE 2.3 — A BIBLIOTECA É DA MARCA  ================
 *
 * A decisão: a fonte pertence à MARCA; o artigo apenas seleciona quais usar.
 *
 * O caso que a motivou: 25 palestras do mesmo especialista, cada artigo usando
 * quatro delas. No modelo antigo a mesma palestra virava uma fonte por artigo
 * — e seria transcrita uma vez por artigo.
 *
 *   1. FONTE      da marca. Uma URL, uma fonte.
 *   2. CONTEÚDO   transcript, idioma, tempos. Da FONTE.
 *   3. USO        o artigo seleciona quem participa do trabalho dele.
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

const migracao = () => readFileSync(new URL("../supabase/migrations/20260912100000_radar_video_library.sql", import.meta.url), "utf8");
const rotaBiblioteca = () => readFileSync(new URL("../app/api/editorial/radar-video-library/route.ts", import.meta.url), "utf8");
const rotaFontes = () => readFileSync(new URL("../app/api/editorial/radar-video-sources/route.ts", import.meta.url), "utf8");
const painel = () => readFileSync(new URL("../modules/radar/radar-r3-videos-panel.tsx", import.meta.url), "utf8");

const fonte = (patch: Partial<RadarLibrarySource> & { id: string }): RadarLibrarySource => ({
  brandId: "marca-1", articleId: "", sourceKind: "YOUTUBE",
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

/* ==========  A · A FONTE É DA MARCA  ============================== */

test("VÍDEOS 2.3 · A — a identidade da fonte é marca + URL, não marca + artigo", () => {
  const sql = migracao().replace(/--[^\n]*/g, "");

  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS uq_radar_video_source_brand_identity/);
  assert.match(sql, /ON public\.radar_video_sources \(brand_id, normalized_url_hash\)/);
  /* Parcial: arquivar e recadastrar a mesma URL continua possível. */
  assert.match(sql, /WHERE registration_status <> 'ARCHIVED'/);
  /* E a identidade antiga, presa ao artigo, é derrubada. */
  assert.match(sql, /DROP INDEX IF EXISTS public\.uq_radar_video_source_identity/);

  /*
   * `article_id` SOBREVIVE COMO PROVENIÊNCIA, não como identidade — e deixa de
   * ser obrigatório. Apagar a coluna perderia o registro de qual artigo
   * originou cada cadastro.
   */
  assert.match(sql, /ALTER TABLE public\.radar_video_sources ALTER COLUMN article_id DROP NOT NULL/);
  assert.match(migracao(), /DEPRECIADO como identidade/);

  /* A leitura devolve a biblioteca inteira: não filtra por artigo. */
  const leitura = rotaFontes().slice(rotaFontes().indexOf("async function lerFontes"), rotaFontes().indexOf("function falha"));
  assert.match(leitura, /\.from\("radar_video_sources"\)[\s\S]{0,200}\.eq\("brand_id", context\.brandId\)/);
  assert.ok(!/\.from\("radar_video_sources"\)[\s\S]{0,200}\.eq\("article_id"/.test(leitura), "a fonte não é filtrada por artigo");
});

test("VÍDEOS 2.3 · a migration converge de qualquer estado parcial", () => {
  const sql = migracao();

  /*
   * REEXECUTAR TEM DE SER SEGURO.
   *
   * Um executor que não honra o `BEGIN/COMMIT` como transação única deixa a
   * migration aplicada pela metade. Se a segunda rodada morre na primeira linha
   * já feita, o operador fica sem saber o que rodou — e o erro não diz nada
   * sobre o que falta. Toda DDL daqui é idempotente ou guardada.
   */
  const naoIdempotentes = sql
    .split("\n")
    .filter(linha => /^\s*(CREATE (TABLE|INDEX|UNIQUE INDEX|POLICY)|ALTER TABLE [^\n]*ADD CONSTRAINT)/.test(linha))
    .filter(linha => !/IF NOT EXISTS/.test(linha))
    /* CREATE POLICY é precedido de DROP POLICY IF EXISTS. */
    .filter(linha => !/CREATE POLICY/.test(linha));
  assert.deepEqual(naoIdempotentes, [], "toda criação é condicional");

  assert.match(sql, /DROP POLICY IF EXISTS radar_article_video_sources_select/);
  assert.match(sql, /IF NOT EXISTS \(\s*\n\s*SELECT 1 FROM pg_constraint[\s\S]{0,200}uq_radar_article_video_sources_brand_id/);
  assert.match(sql, /DROP TABLE IF EXISTS radar_video_source_merge;/);
  /* O vínculo redundante só é rebaixado uma vez. */
  assert.match(sql, /AND a\.status <> 'REMOVED';/);
});

test("VÍDEOS 2.3 · a migration não pressupõe que 20260911180000 já rodou", () => {
  const sql = migracao();

  /*
   * O CABEÇALHO PROMETE SER CORRETA SOB OS DOIS ESTADOS — e a promessa tem de
   * valer. `radar_video_source_texts` e `external_processing_jobs.video_source_id`
   * nascem na migration anterior; tocá-los sem guarda quebraria esta aqui num
   * banco onde aquela ainda não foi aplicada.
   */
  assert.match(sql, /esta roda depois e é correta sob os dois estados/);
  assert.match(sql, /IF to_regclass\('public\.radar_video_source_texts'\) IS NOT NULL THEN\s*\n\s*UPDATE public\.radar_video_source_texts/);
  assert.match(sql, /table_name = 'external_processing_jobs'\s*\n\s*AND column_name = 'video_source_id'\s*\n\s*\) THEN\s*\n\s*UPDATE public\.external_processing_jobs/);

  /* E nenhuma referência a elas fica fora de um guarda. */
  const guardado = sql.slice(sql.indexOf("-- O texto e os jobs seguem a fonte sobrevivente"), sql.indexOf("UPDATE public.radar_video_sources AS s"));
  const forasDoBloco = sql.replace(guardado, "");
  assert.ok(!/UPDATE public\.radar_video_source_texts/.test(forasDoBloco), "o texto só é tocado sob guarda");
  assert.ok(!/UPDATE public\.external_processing_jobs/.test(forasDoBloco), "o job só é tocado sob guarda");
});

/* ==========  B, C, D e E · MULTI-ARTICLE  ======================== */

test("VÍDEOS 2.3 · B e C — a mesma URL em dois artigos é UMA fonte e DUAS seleções", () => {
  /* B · a identidade não conhece artigo: a mesma URL dá o mesmo hash. */
  const daA = radarVideoSourceIdentity("https://youtu.be/dQw4w9WgXcQ");
  const daB = radarVideoSourceIdentity("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(daA?.normalizedUrlHash, daB?.normalizedUrlHash, "uma fonte só");

  /* C · o vínculo é que se multiplica, e é único por par. */
  const sql = migracao().replace(/--[^\n]*/g, "");
  assert.match(sql, /CONSTRAINT uq_article_video_source UNIQUE \(brand_id, article_id, video_source_id\)/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.radar_article_video_sources/);
  /* E aponta para a fonte da MESMA marca. */
  assert.match(sql, /FOREIGN KEY \(brand_id, video_source_id\)\s*\r?\n\s*REFERENCES public\.radar_video_sources \(brand_id, id\)/);
});

test("VÍDEOS 2.3 · D — desmarcar num artigo não toca o outro", () => {
  const rota = rotaBiblioteca();

  /*
   * `UNSELECT` marca `REMOVED` numa linha escopada por artigo. Sem o
   * `.eq("article_id", …)`, remover de um artigo removeria de todos — e é
   * exatamente o erro que a estrutura antiga tornava invisível.
   */
  const bloco = rota.slice(rota.indexOf('if (action === "UNSELECT"'), rota.indexOf('return NextResponse.json({ success: true, action, affected'));
  assert.match(bloco, /status: "REMOVED"/);
  assert.match(bloco, /\.eq\("article_id", articleId\)/);
  assert.match(bloco, /\.eq\("brand_id", context\.brandId\)/);
  /* E não apaga a linha: a história de que o artigo usou a fonte permanece. */
  assert.ok(!/\.delete\(\)/.test(bloco), "desmarcar não apaga o vínculo");
  /* Nem toca a fonte da biblioteca. */
  assert.ok(!/from\("radar_video_sources"\)[\s\S]{0,120}update/.test(bloco));
});

test("VÍDEOS 2.3 · E e H — texto pronto é reutilizado, nunca refeito", () => {
  const pronta = fonte({ id: "pronta", textState: "TEXT_READY", selectedForArticle: true, articleUsageCount: 2 });
  const decisoes = decideRadarVideoProcessing({ selected: [pronta] });

  assert.equal(decisoes[0].outcome, "REUSED_TEXT");
  assert.match(decisoes[0].reason, /já existe e é reutilizado/);

  /*
   * É A ECONOMIA CENTRAL DO DESENHO. Sem ela, 25 palestras usadas por 10
   * artigos seriam 250 transcrições — e o Speech é pago por minuto de áudio.
   */
  const rota = rotaBiblioteca();
  const processamento = rota.slice(rota.indexOf('if (action === "PROCESS_SELECTED")'), rota.indexOf("/* ARCHIVE e CLEAR_LIST"));
  assert.match(processamento, /if \(decisao\.outcome !== "ENQUEUED"\) continue;/, "só ENQUEUED cria job");
});

/* ==========  F, G e I · PROCESSAR SÓ O SELECIONADO  ============== */

test("VÍDEOS 2.3 · F — marcar não chama provider", () => {
  const rota = rotaBiblioteca();
  const selecao = rota.slice(rota.indexOf('if (action === "SELECT" || action === "UNSELECT")'), rota.indexOf('if (action === "PROCESS_SELECTED")'));

  for (const proibido of ["enqueueRadarVideoTextJob", "runShared", "fetchShared", "uploadShared"]) {
    assert.ok(!selecao.includes(proibido), `selecionar não faz "${proibido}"`);
  }

  /*
   * E o checkbox só declara o uso — §2.3.1. Ele grava o vínculo e para aí:
   * quem processa é outra ação, sobre o que já foi selecionado.
   */
  const tela = painel();
  assert.match(tela, /data-testid=\{`radar-videos-check-\$\{fonte\.id\}`\}/);
  const checkbox = tela.slice(tela.indexOf("data-testid={`radar-videos-check-"), tela.indexOf("</label>"));
  assert.match(checkbox, /onChange=\{\(\) => onLibraryAction\?\.\(articleId, fonte\.selectedForArticle \? "UNSELECT" : "SELECT", \[fonte\.id\]\)\}/);
  assert.ok(!/PROCESS_SELECTED/.test(checkbox), "marcar não processa");
});

test("VÍDEOS 2.3 · G — processar ignora o que não foi selecionado", () => {
  const selecionada = fonte({ id: "sim", selectedForArticle: true, uploadedMediaUri: "gs://b/brand/x/radar/videos/sim/a.mp3" });
  const solta = fonte({ id: "nao", selectedForArticle: false, uploadedMediaUri: "gs://b/brand/x/radar/videos/nao/a.mp3" });

  const decisoes = decideRadarVideoProcessing({ selected: [selecionada] });
  assert.equal(decisoes.length, 1);
  assert.equal(decisoes[0].videoSourceId, "sim");
  assert.equal(decisoes[0].outcome, "ENQUEUED");

  /* A rota monta o conjunto a partir da seleção, não do corpo da requisição. */
  const rota = rotaBiblioteca();
  assert.match(rota, /const selecionadas = biblioteca\.filter\(item => item\.selectedForArticle && item\.registrationStatus !== "ARCHIVED"\)/);
  assert.ok(solta.selectedForArticle === false, "a fonte solta permanece fora por construção");
});

test("VÍDEOS 2.3 · I — fonte na fila não gera segundo job", () => {
  for (const estado of ["QUEUED", "PROCESSING"] as RadarVideoTextState[]) {
    const emCurso = fonte({ id: `em-${estado}`, textState: estado, selectedForArticle: true, uploadedMediaUri: "gs://b/brand/x/radar/videos/y/a.mp3" });
    const decisao = decideRadarVideoProcessing({ selected: [emCurso] })[0];
    assert.equal(decisao.outcome, "REUSED_JOB", `${estado} reusa o job existente`);
  }

  /* Falha definitiva não vira retry automático. */
  const falhada = fonte({ id: "falhou", textState: "FAILED_FINAL", selectedForArticle: true, uploadedMediaUri: "gs://b/brand/x/radar/videos/z/a.mp3" });
  assert.equal(decideRadarVideoProcessing({ selected: [falhada] })[0].outcome, "BLOCKED_BY_FAILURE");

  /* E sem via de aquisição a fonte é declarada, não tentada. */
  /*
   * GATE 2.4: uma fonte do YouTube sem mídia deixou de ser beco sem saída —
   * ela entra na tentativa best effort de legenda pública. O que continua
   * valendo é a outra metade da regra: SEM VIA NENHUMA, declara-se em vez de
   * tentar. Um `kind` fora do YouTube é o caso que prova isso.
   */
  const soUrlDoYouTube = fonte({ id: "so-url", selectedForArticle: true });
  assert.equal(decideRadarVideoProcessing({ selected: [soUrlDoYouTube] })[0].outcome, "ENQUEUED", "YouTube sem mídia tenta a legenda pública");

  const semCaminho = fonte({ id: "sem", selectedForArticle: true, sourceKind: "PODCAST" as never });
  const semVia = decideRadarVideoProcessing({ selected: [semCaminho] })[0];
  assert.equal(semVia.outcome, "UNAVAILABLE");
  assert.match(semVia.reason, /não possui acesso à legenda ou ao áudio/);
});

/* ==========  J e K · CADASTRO EM LOTE E INDIVIDUAL  ============== */

test("VÍDEOS 2.3 · J e K — cadastro individual e em lote entram na mesma biblioteca", () => {
  /*
   * K · UMA URL SÓ. O cadastro individual é o lote de tamanho um, e é assim
   * de propósito: dois caminhos de entrada seriam duas deduplicações.
   */
  const individual = classifyRadarVideoSourceBatch({ raw: "https://youtu.be/dQw4w9WgXcQ" });
  assert.equal(individual.registrable.length, 1);
  assert.equal(individual.entries[0].verdict, "VALID");

  /*
   * J · O LOTE DEDUPE CONTRA A BIBLIOTECA DA MARCA e contra si mesmo — e a
   * mesma URL em duas formas é a mesma fonte.
   */
  const lote = classifyRadarVideoSourceBatch({
    raw: [
      "https://youtu.be/dQw4w9WgXcQ",                    // já na biblioteca
      "https://www.youtube.com/watch?v=aaaaaaaaaaa",      // nova
      "https://youtu.be/aaaaaaaaaaa",                     // a mesma, outra forma
      "https://example.com/video",                        // fora do escopo
    ].join("\n"),
    existing: [{ normalizedUrlHash: String(radarVideoSourceIdentity("https://youtu.be/dQw4w9WgXcQ")?.normalizedUrlHash) }],
  });
  assert.deepEqual(lote.entries.map(item => item.verdict), ["ALREADY_REGISTERED", "VALID", "DUPLICATE_IN_INPUT", "UNSUPPORTED"]);
  assert.equal(lote.registrable.length, 1, "uma fonte nova, não quatro");

  /* E a tela diz que uma URL basta, e para onde ela vai. */
  const tela = painel();
  assert.match(tela, /data-testid="radar-videos-input"/);
  assert.match(tela, /data-testid="radar-videos-register"/);
  assert.match(tela, /Cole uma URL do YouTube, ou várias — uma por linha\. Elas entram na biblioteca da marca sem ficar\s*\n\s*selecionadas para este artigo\./);

  /* E o cadastro dedupe contra a biblioteca da MARCA, não do artigo. */
  const rota = rotaFontes();
  assert.match(rota, /A DEDUPLICAÇÃO É POR MARCA/);
  assert.match(rota, /existing: existentes\.map\(item => \(\{ normalizedUrlHash: item\.normalizedUrlHash \}\)\)/);
  /* Uma URL já na biblioteca não vira fonte nova — o readback prova o que restou. */
  assert.match(rota, /const registered = apos\.filter\(item => !gravadas\.has\(item\.normalizedUrlHash\)\)/);

  /* Colar de novo readmite a arquivada, em vez de criar uma segunda fonte. */
  assert.match(rota, /const readmitir = apos\.filter\(item => coladas\.has\(item\.normalizedUrlHash\) && item\.registrationStatus === "ARCHIVED"\)/);
  assert.match(rota, /registration_status: "REGISTERED"/);

  /* O veredicto diz a verdade nova: a biblioteca é da marca. */
  const jaRegistrada = classifyRadarVideoSourceBatch({
    raw: "https://youtu.be/dQw4w9WgXcQ",
    existing: [{ normalizedUrlHash: String(radarVideoSourceIdentity("https://youtu.be/dQw4w9WgXcQ")?.normalizedUrlHash) }],
  });
  assert.match(jaRegistrada.entries[0].reason, /já está na biblioteca desta marca\. Marque o checkbox dela para usar neste artigo\./);
});

/* ==========  L, M e N · REMOVER, ARQUIVAR, LIMPAR  ============== */

test("VÍDEOS 2.3 · L — remover do artigo preserva a biblioteca", () => {
  const rota = rotaBiblioteca();
  const selecao = rota.slice(rota.indexOf('if (action === "SELECT" || action === "UNSELECT")'), rota.indexOf('if (action === "PROCESS_SELECTED")'));

  /* A ação toca só o vínculo. A fonte e o texto dela não são alcançados. */
  assert.ok(!selecao.includes("radar_video_sources"), "remover do artigo não altera a fonte");
  assert.ok(!selecao.includes("radar_video_source_texts"), "nem o texto dela");
  assert.match(selecao, /from\("radar_article_video_sources"\)/);
});

test("VÍDEOS 2.3 · M e N — arquivar preserva proveniência, e limpar lista não quebra evidência", () => {
  const congelada = fonte({ id: "congelada", textState: "TEXT_READY", articleUsageCount: 1, selectedForArticle: true });
  const emOutro = fonte({ id: "em-outro", articleUsageCount: 3, selectedForArticle: true });
  const livre = fonte({ id: "livre", articleUsageCount: 1, selectedForArticle: true });
  const jaArquivada = fonte({ id: "ja", registrationStatus: "ARCHIVED" });

  const decisoes = decideRadarVideoArchive({
    sources: [congelada, emOutro, livre, jaArquivada],
    currentArticleId: "artigo-1",
    frozenSourceIds: ["congelada"],
    clearList: true,
  });

  const porId = new Map(decisoes.map(item => [item.videoSourceId, item]));

  /*
   * N · EVIDÊNCIA CONGELADA NÃO SOME. Se a fonte desaparecesse, o bundle
   * deixaria de provar o que provava.
   */
  assert.equal(porId.get("congelada")?.outcome, "KEPT_FROZEN");
  assert.match(String(porId.get("congelada")?.reason), /sustenta evidência congelada/);

  /* Uso em outro artigo protege numa limpeza de lista. */
  assert.equal(porId.get("em-outro")?.outcome, "KEPT_IN_USE");
  assert.match(String(porId.get("em-outro")?.reason), /2 outro\(s\) artigo\(s\)/);

  /* O que não tem dependência é arquivado — e arquivado não é apagado. */
  assert.equal(porId.get("livre")?.outcome, "ARCHIVED");
  assert.match(String(porId.get("livre")?.reason), /continua resolvível/);
  assert.equal(porId.get("ja")?.outcome, "ALREADY_ARCHIVED");

  /* A recusa é POR ITEM: "limpei X, mantive Y por estes motivos". */
  assert.deepEqual(summarizeRadarVideoArchive(decisoes), { archived: 1, keptInUse: 1, keptFrozen: 1, alreadyArchived: 1, total: 4 });

  /*
   * M · NENHUM HARD DELETE em lugar nenhum do caminho de arquivamento.
   */
  const rota = rotaBiblioteca();
  const arquivamento = rota.slice(rota.indexOf("/* ARCHIVE e CLEAR_LIST"));
  assert.ok(!/\.delete\(\)/.test(arquivamento), "arquivar nunca apaga");
  assert.match(arquivamento, /registration_status: "ARCHIVED"/);

  /*
   * E A PROVENIÊNCIA É REALMENTE CONSULTADA.
   *
   * A política acima só protege o que ela recebe: uma rota que passasse uma
   * lista vazia de congeladas arquivaria a fonte que sustenta o bundle, e a
   * política continuaria correta enquanto o produto quebrava.
   */
  assert.match(arquivamento, /frozenSourceIds: await fontesCongeladas\(context\),/);
  const proveniencia = rota.slice(rota.indexOf("async function fontesCongeladas"), rota.indexOf("export async function POST"));
  assert.match(proveniencia, /\.from\("radar_video_source_texts"\)[\s\S]{0,160}\.eq\("brand_id", context\.brandId\)/);
  assert.match(proveniencia, /return \[\.\.\.new Set\(/, "a lista devolvida é de ids de fonte, sem repetição");
  /*
   * E a migration também não apaga duplicata herdada: reaponta e arquiva.
   *
   * NENHUM `DELETE FROM public.` — a única exclusão permitida é na tabela
   * temporária do merge, que não é dado de ninguém. O vínculo que sobra
   * redundante vira REMOVED, não sumiço.
   */
  const sql = migracao().replace(/--[^\n]*/g, "");
  assert.match(sql, /SET registration_status = 'ARCHIVED'/);
  assert.match(sql, /SET status = 'REMOVED', removed_at = now\(\)/);
  assert.ok(!/DELETE FROM public\./.test(sql), "a migração não apaga nenhuma linha de produção");
  assert.match(sql, /DELETE FROM radar_video_source_merge/, "só a tabela temporária é limpa");
});

/* ==========  O · RESET DA PESQUISA  ============================= */

test("VÍDEOS 2.3 · O — o RESET preserva a fonte, o texto e a seleção", () => {
  const reset = readFileSync(new URL("../lib/radar/radar-reset.ts", import.meta.url), "utf8");

  /*
   * A SELEÇÃO É DELIBERADA, e por isso pertence à área Vídeos — não à pesquisa
   * corrente. Zerar a investigação não desfaz a decisão de quais fontes o
   * artigo usa.
   */
  for (const tabela of ["radar_video_sources", "radar_video_source_texts", "radar_article_video_sources"]) {
    assert.ok(!reset.includes(tabela), `o reset não conhece ${tabela}`);
  }
  const workflow = readFileSync(new URL("../app/api/editorial/workflow/route.ts", import.meta.url), "utf8");
  assert.ok(!workflow.includes("radar_article_video_sources"));
});

/* ==========  P · TENANT  ======================================= */

test("VÍDEOS 2.3 · P — o vínculo herda o isolamento por marca", () => {
  const sql = migracao();

  assert.match(sql, /ALTER TABLE public\.radar_article_video_sources ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON TABLE public\.radar_article_video_sources FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT SELECT ON TABLE public\.radar_article_video_sources TO authenticated/);
  assert.match(sql, /USING \(public\.can_access_brand\(brand_id\)\)/);
  assert.ok(!/GRANT[^;]*\b(INSERT|UPDATE|DELETE)\b[^;]*TO authenticated/.test(sql));

  /* A rota confere permissão e nunca confia no brandId do corpo. */
  const rota = rotaBiblioteca();
  assert.match(rota, /resolvePipelineContext\(\{ brandId: parsed\.data\.brandId, module: "radar", action: "edit" \}\)/);
  assert.match(rota, /\.eq\("brand_id", context\.brandId\)/);
  assert.ok(!/\.eq\("brand_id", parsed\.data\.brandId\)/.test(rota));

  /*
   * E SÓ FONTES DESTA MARCA ENTRAM NA AÇÃO: o corpo lista ids, e o servidor
   * descarta os que não estão na biblioteca dela.
   */
  assert.match(rota, /const alvos = videoSourceIds\.filter\(id => porId\.has\(id\)\)/);
});

/* ==========  §10 e §20 · FILTROS E A COLUNA DE CONTEÚDO  ======== */

test("VÍDEOS 2.3 · §10 — os filtros separam o que precisa ser separado", () => {
  const biblioteca = [
    fonte({ id: "pronta", textState: "TEXT_READY", selectedForArticle: true }),
    fonte({ id: "fila", textState: "QUEUED" }),
    fonte({ id: "nova" }),
    fonte({ id: "arquivada", registrationStatus: "ARCHIVED" }),
  ];

  assert.deepEqual(filterRadarVideoLibrary(biblioteca, "ALL").map(item => item.id), ["pronta", "fila", "nova"], "arquivada sai por padrão");
  assert.deepEqual(filterRadarVideoLibrary(biblioteca, "SELECTED_FOR_ARTICLE").map(item => item.id), ["pronta"]);
  assert.deepEqual(filterRadarVideoLibrary(biblioteca, "TEXT_READY").map(item => item.id), ["pronta"]);
  assert.deepEqual(filterRadarVideoLibrary(biblioteca, "PROCESSING").map(item => item.id), ["fila"]);
  assert.deepEqual(filterRadarVideoLibrary(biblioteca, "NOT_PROCESSED").map(item => item.id), ["nova"]);
  /* Arquivada continua ALCANÇÁVEL: sair da vista não é sumir. */
  assert.deepEqual(filterRadarVideoLibrary(biblioteca, "ARCHIVED").map(item => item.id), ["arquivada"]);
});

test("VÍDEOS 2.3 · §20 — só as selecionadas entram na coluna de conteúdo", () => {
  const tela = painel();

  assert.match(tela, /const selecionadasDoArtigo = registradas\.filter\(item => item\.selectedForArticle && item\.registrationStatus !== "ARCHIVED"\)/);
  const coluna = tela.slice(tela.indexOf('data-testid="radar-videos-extracted"'));
  assert.match(coluna, /selecionadasDoArtigo\.length === 0/);
  assert.match(coluna, /\{selecionadasDoArtigo\.map\(fonte => \{/);
  /* A biblioteca inteira não entra automaticamente. */
  assert.ok(!/\{registradas\.map\(fonte => \{/.test(coluna), "a biblioteca inteira não entra na coluna");
});

/* ==========  F e Q NO DOM · CLIQUE REAL, MONTAGEM NOVA  ========= */

const { RadarR3VideosPanel } = await import("../modules/radar/radar-r3-videos-panel.tsx");
type VistaDeVideos = Parameters<typeof RadarR3VideosPanel>[0]["videoSources"];

const vista = (sources: RadarLibrarySource[]): VistaDeVideos => ({
  sources, texts: [], briefs: [], coverage: null, matching: false, investigationFinalized: false, frozenBriefCount: 0, briefsUnavailableReason: "sem investigação neste fixture",
  loading: false, saving: false, extracting: null, lastBatch: null, error: null, readbackConfirmed: true,
});
const MODELO = "artigo-1";

const BIBLIOTECA: RadarLibrarySource[] = [
  fonte({ id: "palestra-a", displayName: "Palestra A", selectedForArticle: true, articleUsageCount: 3, textState: "TEXT_READY" }),
  fonte({ id: "palestra-b", displayName: "Palestra B", selectedForArticle: false, articleUsageCount: 1 }),
];

test("VÍDEOS 2.3 · F no DOM — o checkbox declara o uso e nada mais", async () => {
  const tela = await montarRadar();
  const acoes: unknown[][] = [];
  await tela.render(comProductShell(React.createElement(RadarR3VideosPanel, {
    articleId: MODELO, videoSources: vista(BIBLIOTECA),
    onLibraryAction: (...args: unknown[]) => acoes.push(args),
  } as never)));

  const antes = tentativasDeRede.length;

  /* Fonte fora do artigo: marcar declara o uso. */
  await tela.click("radar-videos-check-palestra-b");
  assert.deepEqual(acoes, [["artigo-1", "SELECT", ["palestra-b"]]]);

  /* Fonte já no artigo: a mesma caixa desfaz o vínculo. */
  await tela.click("radar-videos-check-palestra-a");
  assert.deepEqual(acoes[1], ["artigo-1", "UNSELECT", ["palestra-a"]]);

  /* E nenhuma das duas saiu para provider nenhum. */
  assert.equal(tentativasDeRede.length, antes, "marcar não chama provider");
  assert.ok(!acoes.some(acao => acao[1] === "PROCESS_SELECTED"), "marcar não processa");

  tela.destroy();
});

test("VÍDEOS 2.3 · G no DOM — sem seleção não há o que processar", async () => {
  const tela = await montarRadar();
  const nenhumaSelecionada = BIBLIOTECA.map(item => ({ ...item, selectedForArticle: false }));

  await tela.render(comProductShell(React.createElement(RadarR3VideosPanel, {
    articleId: MODELO, videoSources: vista(nenhumaSelecionada), onLibraryAction: () => {},
  } as never)));
  assert.ok((tela.get("radar-videos-process-selected") as HTMLButtonElement).disabled, "nada selecionado, nada a processar");

  await tela.render(comProductShell(React.createElement(RadarR3VideosPanel, {
    articleId: MODELO, videoSources: vista(BIBLIOTECA), onLibraryAction: () => {},
  } as never)));
  assert.ok(!(tela.get("radar-videos-process-selected") as HTMLButtonElement).disabled);

  tela.destroy();
});

test("VÍDEOS 2.3 · §10 no DOM — o filtro muda a lista, e a arquivada continua alcançável", async () => {
  const tela = await montarRadar();
  const comArquivada = [...BIBLIOTECA, fonte({ id: "antiga", registrationStatus: "ARCHIVED" })];
  await tela.render(comProductShell(React.createElement(RadarR3VideosPanel, {
    articleId: MODELO, videoSources: vista(comArquivada), onLibraryAction: () => {},
  } as never)));

  /* Por padrão: as vivas, sem a arquivada. */
  assert.ok(tela.query("radar-videos-check-palestra-a"));
  assert.ok(tela.query("radar-videos-check-palestra-b"));
  assert.equal(tela.query("radar-videos-check-antiga"), null, "arquivada não entra na vista padrão");

  /* "Texto pronto" deixa só quem tem texto. */
  await tela.click("radar-videos-filter-TEXT_READY");
  assert.ok(tela.query("radar-videos-check-palestra-a"), "a fonte com texto permanece");
  assert.equal(tela.query("radar-videos-check-palestra-b"), null, "a sem texto sai da vista");

  /* E arquivar não é sumir: o filtro a traz de volta. */
  await tela.click("radar-videos-filter-ARCHIVED");
  assert.ok(tela.query("radar-videos-check-antiga"), "a arquivada continua alcançável");
  assert.equal(tela.query("radar-videos-check-palestra-a"), null);

  tela.destroy();
});

test("VÍDEOS 2.3 · Q no DOM — o F5 devolve a biblioteca e a seleção do artigo", async () => {
  /*
   * F5 É UMA MONTAGEM NOVA sem nenhum estado de cliente.
   *
   * O que sobrevive é o que veio do servidor — e a seleção do artigo está lá,
   * porque o checkbox a gravou. Nenhuma caixa desta tela guarda seleção só na
   * memória do navegador.
   */
  const depois = await montarRadar();
  await depois.render(comProductShell(React.createElement(RadarR3VideosPanel, {
    articleId: MODELO, videoSources: vista(BIBLIOTECA), onLibraryAction: () => {},
  } as never)));

  /* A biblioteca inteira da marca volta. */
  const marcada = depois.get("radar-videos-check-palestra-a") as HTMLInputElement;
  const desmarcada = depois.get("radar-videos-check-palestra-b") as HTMLInputElement;

  /* E cada caixa volta no estado que o servidor declara. */
  assert.equal(marcada.checked, true, "a selecionada volta marcada");
  assert.equal(desmarcada.checked, false, "a não selecionada volta desmarcada");
  assert.match(depois.text(), /neste artigo/);
  assert.match(depois.text(), /1 selecionada\(s\) para este artigo/);

  depois.destroy();
});

/* ==========  PROVIDER  ========================================= */

test("VÍDEOS 2.3 · nenhuma chamada de rede saiu desta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `PROVIDER_CALLS deveria ser 0; houve: ${tentativasDeRede.join(", ")}`);
});

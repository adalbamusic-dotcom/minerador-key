import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  classifyRadarVideoSourceBatch,
  radarVideoSourceDisplay,
  radarVideoSourceIdentity,
  radarVideoSourceIsUrl,
  radarYouTubeVideoId,
  RadarVideoSourceSchema,
} from "../lib/radar/video-source.ts";
import { freezeRadarEvidenceBundle, radarFinalizationReadiness, radarFrozenVideoBriefReading, RadarFrozenEvidenceBundleSchema } from "../lib/radar/investigation-finalization.ts";
import { RADAR_RESET_CLEARED, RADAR_RESET_OUTSIDE_PAYLOAD } from "../lib/radar/radar-reset.ts";
import { buildRadarDeepResearchView } from "../lib/radar/deep-research-view.ts";
import { startRadarDeepResearch } from "../lib/radar/deep-research.ts";
import { buildRadarResearchQueryPlan } from "../lib/radar/research-query-plan.ts";
import { radarResearchUniverseFingerprint } from "../lib/radar/research-curation.ts";
import { autoDecideRadarReference } from "../lib/radar/research-auto-selection.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarExtractionPage, RadarObservedLink } from "../lib/radar/analysis-contracts.ts";

/*
 * ======  VÍDEOS · GATE 1 — FONTES DELIBERADAS PERSISTENTES  ============
 *
 * O Gate 0 encontrou uma área que aparentava guardar material e não guardava:
 * `addExistingContentForArticle` escrevia num `useState` e em mais lugar
 * nenhum. Um F5 apagava tudo — e a garantia "o RESET da Pesquisa não apaga os
 * vídeos" era verdadeira pelo motivo errado: o reset não os alcançava porque
 * eles já não existiam.
 *
 * Este gate troca isso por persistência real, e troca também a garantia: ela
 * passa a valer por arquitetura, não por ausência.
 *
 * IDENTIDADE PRÓPRIA. O invariante 24 separa `Pesquisa → YouTube` (motor
 * competitivo) da área Vídeos (ingestão deliberada). O mesmo vídeo pode existir
 * nos dois papéis sem compartilhar identidade.
 *
 * REAL_PROVIDER_CALLS = 0, com sentinela no fim.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

/* ============================ a fixture ============================== */

const link = (): RadarObservedLink => ({
  destinationUrl: "https://www.aad.org/public/diseases/oily-skin",
  destinationDomain: "www.aad.org", kind: "EXTERNAL", anchorText: "American Academy of Dermatology",
  surroundingText: "A produção de sebo é regulada por hormônios.",
  sectionHeading: "Por que a pele fica oleosa?", rel: [], target: null, order: 0,
});

const pagina = (id: string, headings: string[]): RadarExtractionPage => ({
  id: `page:${id}`, url: `https://dominio-${id.toLowerCase()}.com.br/artigo/pele-oleosa`, status: "success",
  fetchedAt: "2026-09-10T10:00:00.000Z", title: `Concorrente ${id}`, metaDescription: "", canonical: null,
  h1: ["Pele oleosa"], h2: headings, h3: [], wordCount: 1600, internalLinkCount: 3, externalLinkCount: 1,
  listCount: 1, tableCount: 0, faqCount: 0, imageCount: 2, blockquoteCount: 0, comparisonCount: 0,
  hasDates: true, author: "Dra. Ana Souza", structuredDataTypes: ["Article"], recurringTerms: [],
  boldCount: 3, italicCount: 0, paragraphCount: 12, paragraphWordCounts: [70],
  headingOutline: [{ level: 1, text: "Pele oleosa" }, ...headings.map(text => ({ level: 2 as const, text }))],
  introWordCount: 60, introText: "Na prática, testamos a rotina por oito semanas.", closingWordCount: 40,
  closingText: "Fecho.", hasClosing: true, emphasizedTerms: [], keywordPlacement: null,
  observedLinks: [link()], error: null,
});

/*
 * A AFIRMAÇÃO YMYL É O QUE CRIA O REQUISITO.
 *
 * "É seguro usar ácido salicílico na gravidez?" aparece em 7 das 12 páginas: é
 * uma afirmação sensível recorrente na amostra, e é dela que a autoridade de
 * evidência conclui que existe um ponto de revisão profissional. Sem isso a
 * fixture provaria "Não necessário" e nada mais.
 */
const PAGINAS = Array.from({ length: 12 }, (_, index) => {
  const headings = ["Como identificar a pele oleosa?"];
  if (index < 9) headings.push("Por que a pele fica oleosa?");
  if (index < 8) headings.push("Rotina de cuidados para pele oleosa");
  if (index < 7) headings.push("É seguro usar ácido salicílico na gravidez?");
  return pagina(`A${index}`, headings);
});

const contexto = (): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: {
    brandId: "marca-1", articleId: "artigo-1", articleDnaVersionId: "dna-v18", articleDnaContentHash: "hash-dna",
    promise: "Explicar como identificar, compreender e cuidar da pele oleosa.",
    mainIntent: "Informacional", hierarchy: "Suporte",
    classification: { intent: "INFORMATIONAL", intentLabel: "Informacional", funnel: "TOP", funnelLabel: "Topo", reason: "A Principal declara este estágio." },
  },
  keywords: [{
    identity: { keywordId: "kw1", canonicalKeywordId: null, sourceKeywordId: null, keywordDnaVersionId: "kdna-1", text: "skincare para pele oleosa", role: "principal" },
    strategy: { volume: 720, resultCount: 4200, kgrScore: 0.589, incrementalVolume: null, contribution: null, normalizedIntent: "informational", coveredIntentions: [], strategicContribution: null, purpose: null, overlapRisk: null, keywordUrlRelation: null, demandEvidence: null, keywordDnaSnapshot: { payload: { centralEntity: "pele oleosa" } }, semanticQualification: { versionId: "sq-1", contentHash: "h", intent: "informacional", funnel: "TOFU", semanticState: "conclusive", collectedAt: "2026-09-01T10:00:00.000Z" } },
    resolution: "FULL",
    provenance: { textSource: "hydration", strategySource: "article_reference", keywordDnaVersionId: "kdna-1", keywordDnaContentHash: "hash-kdna" },
  }],
  editorialTopics: ["identificação da pele oleosa"],
  resolvedKeywordTexts: ["skincare para pele oleosa"],
  silo: { siloId: "silo-1", siloName: "skincare", articleRole: "SUPORTE" },
  formationSerp: null,
  internalLinks: {
    graphId: "graph-1", graphVersionId: "graph-v18", graphContentHash: `sha256:${"c".repeat(64)}`,
    edges: [
      { sourceNodeId: "article:este", targetNodeId: "article:pilar", relationType: "SUPPORT_TO_PILLAR", anchorConcepts: ["rotina de cuidados para pele oleosa"], reason: "O suporte devolve ao Pilar", priority: "HIGH", direction: "outbound" },
      { sourceNodeId: "article:pilar", targetNodeId: "article:este", relationType: "PILLAR_TO_SUPPORT", anchorConcepts: ["pele oleosa e acne"], reason: "O Pilar abre a verticalização", priority: "HIGH", direction: "inbound" },
    ],
  },
  limitations: [],
} as unknown as RadarArticleResearchContext);

const SNAPSHOT = { query: "skincare para pele oleosa", organicResults: PAGINAS.map((page, index) => ({ position: index + 1, title: page.title, domain: `d${index}.com`, url: page.url })) };
const registro = () => startRadarDeepResearch({ context: contexto(), plan: buildRadarResearchQueryPlan(contexto()), startedBy: "ator", now: "2026-09-10T09:00:00.000Z" });

function vista() {
  const base = {
    context: contexto(), record: registro(), snapshot: SNAPSHOT as never, extractions: PAGINAS,
    observedAt: "2026-09-10T12:00:00.000Z",
    diagnostic: { dominantIntent: "informacional", dominantFormats: ["article"] },
  } as Parameters<typeof buildRadarDeepResearchView>[0];

  const universo = buildRadarDeepResearchView(base);
  const recordBase = base.record as NonNullable<typeof base.record>;
  return buildRadarDeepResearchView({
    ...base,
    record: {
      ...recordBase,
      researchCuration: {
        universeFingerprint: radarResearchUniverseFingerprint(universo.references),
        confirmedAt: "2026-09-10T09:30:00.000Z", confirmedBy: "ator",
        references: universo.references.map(reference => ({
          referenceId: reference.referenceId, normalizedUrl: reference.normalizedUrl, url: reference.url,
          decision: autoDecideRadarReference(reference).decision, reason: "",
        })),
      },
    },
  });
}

const ID = "dQw4w9WgXcQ";
const CANONICA = `https://www.youtube.com/watch?v=${ID}`;

/* ==========  A · UMA URL VÁLIDA REGISTRA  ========================== */

test("VÍDEOS 1 · A — uma URL válida vira fonte registrável", () => {
  const lote = classifyRadarVideoSourceBatch({ raw: CANONICA });

  assert.equal(lote.entries.length, 1);
  assert.equal(lote.entries[0].verdict, "VALID");
  assert.equal(lote.registrable.length, 1);
  assert.equal(lote.registrable[0].videoId, ID);
  assert.equal(lote.registrable[0].normalizedUrl, CANONICA);
  assert.equal(lote.registrable[0].kind, "YOUTUBE");
  /* A linha crua é preservada: quem colou precisa se reconhecer na lista. */
  assert.equal(lote.registrable[0].raw, CANONICA);
});

/* ==========  B · LOTE  ============================================= */

test("VÍDEOS 1 · B — várias URLs registram num lote só", () => {
  const ids = ["dQw4w9WgXcQ", "aBcDeFgHiJk", "9bZkp7q19f0"];
  const lote = classifyRadarVideoSourceBatch({ raw: ids.map(id => `https://youtu.be/${id}`).join("\n") });

  assert.equal(lote.registrable.length, 3);
  assert.deepEqual(lote.registrable.map(item => item.videoId), ids);
  assert.equal(lote.counts.VALID, 3);

  /* Espaço, tabulação e linhas em branco separam tão bem quanto \n. */
  const bagunçado = classifyRadarVideoSourceBatch({ raw: `  https://youtu.be/${ids[0]}  \n\n\t https://youtu.be/${ids[1]}\n  ` });
  assert.equal(bagunçado.registrable.length, 2);
});

/* ==========  C · UMA LINHA RUIM NÃO DERRUBA O LOTE  =============== */

test("VÍDEOS 1 · C — URL inválida não aborta as válidas", () => {
  /*
   * O caso comum é colar de uma planilha, onde sempre entra um cabeçalho ou
   * uma célula vazia. Recusar o lote inteiro obrigaria o usuário a caçar a
   * linha ruim sem saber qual é.
   */
  const lote = classifyRadarVideoSourceBatch({
    raw: [CANONICA, "isto-não-é-url", "https://vimeo.com/123456789", `https://youtu.be/${"aBcDeFgHiJk"}`].join("\n"),
  });

  assert.equal(lote.registrable.length, 2, "as duas válidas seguem");
  assert.equal(lote.counts.INVALID, 1);
  assert.equal(lote.counts.UNSUPPORTED, 1);

  /* E cada linha recebe o motivo, não um erro genérico do lote. */
  const invalida = lote.entries.find(entry => entry.verdict === "INVALID");
  const foraDoEscopo = lote.entries.find(entry => entry.verdict === "UNSUPPORTED");
  assert.match(String(invalida?.reason), /não é um endereço/i);
  assert.match(String(foraDoEscopo?.reason), /somente vídeos do YouTube/i);
  assert.equal(foraDoEscopo?.raw, "https://vimeo.com/123456789");

  /* A distinção importa: endereço válido fora de escopo ≠ texto qualquer. */
  assert.equal(radarVideoSourceIsUrl("https://vimeo.com/123"), true);
  assert.equal(radarVideoSourceIsUrl("isto-não-é-url"), false);
});

/* ==========  D · REPETIÇÃO DENTRO DO INPUT  ======================= */

test("VÍDEOS 1 · D — a mesma URL duas vezes no input vira uma fonte só", () => {
  const lote = classifyRadarVideoSourceBatch({ raw: `${CANONICA}\n${CANONICA}` });

  assert.equal(lote.registrable.length, 1);
  assert.equal(lote.counts.VALID, 1);
  assert.equal(lote.counts.DUPLICATE_IN_INPUT, 1);
  assert.equal(lote.entries[1].verdict, "DUPLICATE_IN_INPUT");
});

/* ==========  E · FORMAS EQUIVALENTES  ============================= */

test("VÍDEOS 1 · E — youtu.be, watch?v, shorts e embed são a MESMA fonte", () => {
  /*
   * O usuário copia de onde estiver: do compartilhar (youtu.be), da barra de
   * endereço (watch?v), do celular (shorts), de um site que incorpora (embed).
   * São o mesmo vídeo — ele não escolheu quatro coisas.
   */
  const formas = [
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://m.youtube.com/watch?v=${ID}&t=42s`,
    `youtu.be/${ID}`,
    `https://www.youtube.com/live/${ID}`,
  ];
  for (const forma of formas) {
    assert.equal(radarYouTubeVideoId(forma), ID, `${forma} deveria resolver para o mesmo vídeo`);
    assert.equal(radarVideoSourceIdentity(forma)?.normalizedUrl, CANONICA, `${forma} deveria convergir para a forma canônica`);
  }

  /* E o lote com todas elas produz UMA fonte. */
  const lote = classifyRadarVideoSourceBatch({ raw: formas.join("\n") });
  assert.equal(lote.registrable.length, 1, "todas as formas são a mesma fonte");
  assert.equal(lote.counts.DUPLICATE_IN_INPUT, formas.length - 1);

  /*
   * E O HASH É O QUE A RESTRIÇÃO DE UNICIDADE ENXERGA: se ele divergisse entre
   * as formas, o banco aceitaria duplicata que o domínio recusa.
   */
  const hashes = new Set(formas.map(forma => radarVideoSourceIdentity(forma)?.normalizedUrlHash));
  assert.equal(hashes.size, 1);
});

test("VÍDEOS 1 · E — o normalizador da SERP NÃO serve para isto, e é por isso que existe autoridade própria", async () => {
  const { radarNormalizedUrl } = await import("../lib/radar/research-reference.ts");

  /*
   * `radarNormalizedUrl` descarta a query string — que é exatamente onde o
   * YouTube guarda o vídeo. Reusá-lo aqui colapsaria TODO vídeo do formato
   * canônico numa identidade só. Este teste trava a razão da separação.
   */
  const outroId = "aBcDeFgHiJk";
  assert.equal(
    radarNormalizedUrl(`https://www.youtube.com/watch?v=${ID}`),
    radarNormalizedUrl(`https://www.youtube.com/watch?v=${outroId}`),
    "premissa: o normalizador da SERP realmente colapsa os dois",
  );
  assert.notEqual(
    radarVideoSourceIdentity(`https://www.youtube.com/watch?v=${ID}`)?.normalizedUrlHash,
    radarVideoSourceIdentity(`https://www.youtube.com/watch?v=${outroId}`)?.normalizedUrlHash,
    "a autoridade de vídeo separa os dois",
  );
});

test("VÍDEOS 1 · E — a extração concorda com o extrator do provider", () => {
  /*
   * O extrator do provider vive em `lib/server/google-cloud/` sob
   * `import "server-only"` e não pode ser importado aqui. As duas
   * implementações precisam concordar sobre as formas canônicas, e é este
   * teste que garante — não a boa vontade de quem editar uma delas.
   */
  const provider = readFileSync(new URL("../lib/server/google-cloud/youtube-metadata-operation.ts", import.meta.url), "utf8");
  assert.match(provider, /\^\[A-Za-z0-9_-\]\{11\}\$/, "o provider usa o mesmo formato de id");
  for (const caminho of ["shorts", "embed", "live"]) {
    assert.ok(provider.includes(`"${caminho}"`), `o provider reconhece /${caminho}/`);
    assert.equal(radarYouTubeVideoId(`https://www.youtube.com/${caminho}/${ID}`), ID, `e o domínio também reconhece /${caminho}/`);
  }
  assert.ok(provider.includes("youtu.be"), "o provider reconhece youtu.be");
});

/* ==========  F e G · JÁ REGISTRADA  =============================== */

test("VÍDEOS 1 · F — a mesma URL já registrada vira reuso, não duplicata", () => {
  const existente = radarVideoSourceIdentity(CANONICA)!;
  const lote = classifyRadarVideoSourceBatch({
    raw: `https://youtu.be/${ID}`,
    existing: [{ normalizedUrlHash: existente.normalizedUrlHash }],
  });

  assert.equal(lote.registrable.length, 0, "nada novo é gravado");
  assert.equal(lote.counts.ALREADY_REGISTERED, 1);
  /* Gate 2.3.1: a fonte é da MARCA, e o reuso não seleciona por conta própria. */
  assert.match(lote.entries[0].reason, /já está na biblioteca desta marca/i);
});

test("VÍDEOS 1 · G — a mesma URL em outro Article é outro uso deliberado", () => {
  /*
   * A unicidade é (brand, article, identidade). "Quero este vídeo NESTE artigo"
   * é uma decisão por artigo: o mesmo material pode sustentar dois artigos
   * diferentes da mesma marca.
   */
  const migracao = readFileSync(new URL("../supabase/migrations/20260911120000_radar_video_sources.sql", import.meta.url), "utf8");
  assert.match(
    migracao,
    /CREATE UNIQUE INDEX IF NOT EXISTS uq_radar_video_source_identity\s+ON public\.radar_video_sources \(brand_id, article_id, normalized_url_hash\)/,
    "a unicidade inclui o artigo",
  );

  /* Sem o artigo na chave, o segundo artigo seria recusado. */
  assert.ok(!/UNIQUE.*\(brand_id, normalized_url_hash\)/.test(migracao), "a unicidade não é só por marca");
});

/* ==========  H · SUCESSO SÓ DEPOIS DO READBACK  ================== */

test("VÍDEOS 1 · H — a rota só declara sucesso com a lista relida do banco", () => {
  const rota = readFileSync(new URL("../app/api/editorial/radar-video-sources/route.ts", import.meta.url), "utf8");

  /*
   * A RESPOSTA VEM DE UMA SEGUNDA LEITURA, não do que enviamos — e o Gate 2.3
   * acrescentou um passo: a leitura final acontece DEPOIS de o vínculo com o
   * artigo ser gravado, senão as fontes novas apareceriam sem a seleção que
   * acabou de ser criada.
   */
  assert.match(rota, /const apos = await lerFontes\(context, parsed\.data\.articleId \|\| null\)/);
  assert.match(rota, /const sources = await lerFontes\(context, parsed\.data\.articleId \|\| null\);/);
  assert.ok(
    rota.lastIndexOf("const sources = await lerFontes") > rota.indexOf("radar_article_video_sources"),
    "a leitura final vem depois do vínculo",
  );
  assert.match(rota, /readbackConfirmed: true/);
  assert.ok(!/sources: lote\.registrable/.test(rota), "a resposta não devolve o que foi enviado");

  /* E a tela recusa o sucesso sem essa confirmação. */
  const pagina = readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  assert.match(pagina, /if \(!corpo\.readbackConfirmed\) throw new Error\("A gravação não foi confirmada pela releitura remota\."\)/);
});

/* ==========  I · F5  ============================================= */

test("VÍDEOS 1 · I — a lista vem do servidor, então sobrevive ao F5", () => {
  const pagina = readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");

  /*
   * F5 destrói todo estado React. A lista só reaparece porque é LIDA de novo —
   * este efeito é literalmente o mecanismo da sobrevivência.
   */
  /* Desde o §2.3.2 a leitura é da MARCA: o artigo, quando existe, só sobrepõe. */
  assert.match(pagina, /void loadVideoLibrary\(articleId\);/, "existe leitura ao abrir a marca");
  assert.match(pagina, /fetch\(`\/api\/editorial\/radar-video-sources\?\$\{busca\.toString\(\)\}`\)/, "e ela consulta a rota canônica");
  assert.match(pagina, /const busca = new URLSearchParams\(\{ brandId: selectedBrandId \}\);\s*\r?\n\s*if \(articleId\) busca\.set\("articleId", articleId\);/);

  /* O painel lê da prop remota, não de estado próprio. */
  const painel = readFileSync(new URL("../modules/radar/radar-r3-videos-panel.tsx", import.meta.url), "utf8");
  assert.match(painel, /const registradas = vista\?\.sources \|\| \[\];/);
});

/* ==========  J · RESET DA PESQUISA  ============================== */

test("VÍDEOS 1 · J — o RESET da Pesquisa não alcança as fontes, agora por arquitetura", () => {
  /*
   * A garantia mudou de natureza. Antes as fontes sobreviviam porque o reset
   * não tinha como alcançá-las — elas não existiam fora da memória. Agora elas
   * estão em OUTRA TABELA, e o reset reescreve o payload do workflow.
   */
  const reset = readFileSync(new URL("../lib/radar/radar-reset.ts", import.meta.url), "utf8");
  assert.ok(!reset.includes("radar_video_sources"), "o reset não conhece a tabela das fontes");
  assert.ok(!RADAR_RESET_CLEARED.includes("existingContent" as never), "e não limpa material de vídeo");
  assert.ok(RADAR_RESET_OUTSIDE_PAYLOAD.includes("existingContent"), "a fronteira continua declarada");

  /* E nenhuma rota de reset toca a tabela. */
  const rotaWorkflow = readFileSync(new URL("../app/api/editorial/workflow/route.ts", import.meta.url), "utf8");
  assert.ok(!rotaWorkflow.includes("radar_video_sources"));
});

/* ==========  K e L · NADA GRAVA SOZINHO  ========================= */

test("VÍDEOS 1 · K e L — colar e trocar de aba não gravam; só o clique grava", () => {
  const painel = readFileSync(new URL("../modules/radar/radar-r3-videos-panel.tsx", import.meta.url), "utf8");

  /* O textarea só mexe em estado local do formulário. */
  assert.match(painel, /onChange=\{event => setRaw\(event\.target\.value\)\}/);
  assert.ok(!/onPaste|onBlur|onKeyDown/.test(painel), "não há gravação por colar, sair do campo ou tecla");

  /* A única chamada do registro está no onClick do botão. */
  const chamadas = painel.match(/onRegisterVideoSources\?\.\(/g) || [];
  assert.equal(chamadas.length, 1, "existe uma única origem de escrita");
  const inicioDoBotao = painel.indexOf('data-testid="radar-videos-register"');
  assert.ok(inicioDoBotao > 0, "o botão de registrar foi localizado");
  const trechoDoBotao = painel.slice(inicioDoBotao, painel.indexOf("</button>", inicioDoBotao));
  assert.match(trechoDoBotao, /onClick=\{\(\) => \{ onRegisterVideoSources\?\.\(articleId, raw\);/);

  /*
   * GATE 2 · A EXTRAÇÃO TAMBÉM NASCE DE UM CLIQUE, e de um só.
   *
   * Ela é a segunda ação da área, e a mesma regra vale: montar, colar, trocar
   * de aba e recarregar não disparam processamento.
   */
  const extracoes = painel.match(/onExtractVideoText\?\.\(/g) || [];
  assert.equal(extracoes.length, 1, "existe uma única origem de processamento");
  const inicioDaExtracao = painel.indexOf("data-testid={`radar-videos-extract-");
  const trechoDaExtracao = painel.slice(inicioDaExtracao, painel.indexOf("</button>", inicioDaExtracao));
  assert.match(trechoDaExtracao, /onClick=\{\(\) => onExtractVideoText\?\.\(articleId, fonte\.id\)\}/);

  /* E o efeito de carga da página apenas LÊ. */
  const pagina = readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  const efeito = pagina.slice(pagina.indexOf("useEffect(() => {\n    const articleId = activeRadarItem?.articleId;"), pagina.indexOf("const handleExpandedChange"));
  assert.ok(!/method: "POST"/.test(efeito), "o efeito não grava");
});

/* ==========  M, N e O · NENHUM PROVIDER, STORAGE OU JOB  ========= */

test("VÍDEOS 1 · M, N e O — nenhum provider, nenhum Storage, nenhum job", () => {
  const dominio = readFileSync(new URL("../lib/radar/video-source.ts", import.meta.url), "utf8");
  const rota = readFileSync(new URL("../app/api/editorial/radar-video-sources/route.ts", import.meta.url), "utf8");
  const migracao = readFileSync(new URL("../supabase/migrations/20260911120000_radar_video_sources.sql", import.meta.url), "utf8");

  /* O domínio é puro: o videoId sai da string, nenhuma URL é visitada. */
  const codigoDominio = dominio.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const proibido of ["fetch", "await ", "googleapis", "youtube.com/oembed"]) {
    assert.ok(!codigoDominio.includes(proibido), `o domínio não faz "${proibido}"`);
  }

  /*
   * A rota não chama provider, não escreve em Storage e não cria job.
   *
   * A verificação é sobre CHAMADAS, não sobre a palavra: `youtube_video_id` e
   * `radar_video_sources` são nomes de coluna e de tabela, e proibir a string
   * "youtube" numa rota de vídeos do YouTube seria um teste que só mede a
   * própria ingenuidade.
   */
  for (const proibido of ["fetch(", "googleapis", "storage.from", "bucket(", "external_processing_jobs", "runSharedLongSpeech", "runSharedShortSpeech", "fetchSharedYouTubeMetadata"]) {
    assert.ok(!rota.includes(proibido), `a rota não faz "${proibido}"`);
  }
  /*
   * AS TABELAS TOCADAS SÃO AS DE VÍDEO — e só elas.
   *
   * O Gate 2 acrescentou a leitura do texto preservado
   * (`radar_video_source_texts`). A garantia continua a mesma: a rota não
   * alcança fundamento, workflow nem contribuição de especialista.
   */
  assert.deepEqual(
    [...new Set(rota.match(/\.from\("([a-z_]+)"\)/g) || [])].sort(),
    ['.from("radar_article_video_sources")', '.from("radar_video_source_texts")', '.from("radar_video_sources")'],
  );

  /* A migration cria UMA tabela e não toca em jobs nem em buckets. */
  const ddl = migracao.replace(/--[^\n]*/g, "");
  assert.equal((ddl.match(/CREATE TABLE/gi) || []).length, 1, "uma tabela só");
  for (const proibido of ["external_processing_jobs", "storage.buckets", "ALTER TABLE public.expert_contributions"]) {
    assert.ok(!ddl.includes(proibido), `a migration não toca em "${proibido}"`);
  }
});

/* ==========  P · TENANT E RLS  =================================== */

test("VÍDEOS 1 · P — RLS impede outra marca, e o browser não usa service-role", () => {
  const migracao = readFileSync(new URL("../supabase/migrations/20260911120000_radar_video_sources.sql", import.meta.url), "utf8");

  assert.match(migracao, /ALTER TABLE public\.radar_video_sources ENABLE ROW LEVEL SECURITY/);
  assert.match(migracao, /REVOKE ALL PRIVILEGES ON TABLE public\.radar_video_sources FROM PUBLIC, anon, authenticated/);
  assert.match(migracao, /GRANT SELECT ON TABLE public\.radar_video_sources TO authenticated/);
  assert.match(migracao, /GRANT SELECT, INSERT, UPDATE ON TABLE public\.radar_video_sources TO service_role/);
  assert.match(migracao, /USING \(public\.can_access_brand\(brand_id\)\)/);
  /* Escrita por authenticated não é concedida: a rota grava pelo service client. */
  assert.ok(!/GRANT (INSERT|UPDATE)[^;]*TO authenticated/.test(migracao));
  /* FK para a marca e chave composta, o padrão do projeto contra cross-brand. */
  assert.match(migracao, /brand_id uuid NOT NULL REFERENCES public\.marcas\(id\)/);
  assert.match(migracao, /ADD CONSTRAINT uq_radar_video_sources_brand_id UNIQUE \(brand_id, id\)/);

  /*
   * A rota resolve acesso E permissão de módulo antes de receber o client.
   * Ler exige `radar:view`; gravar exige `radar:edit`.
   */
  const rota = readFileSync(new URL("../app/api/editorial/radar-video-sources/route.ts", import.meta.url), "utf8");
  assert.match(rota, /resolvePipelineContext\(\{ brandId: parsed\.data\.brandId, module: "radar", action: "view" \}\)/);
  assert.match(rota, /resolvePipelineContext\(\{ brandId: parsed\.data\.brandId, module: "radar", action: "edit" \}\)/);
  /* O brandId usado na consulta é o do contexto resolvido, não o do corpo. */
  assert.match(rota, /\.eq\("brand_id", context\.brandId\)/);
  assert.ok(!/\.eq\("brand_id", parsed\.data\.brandId\)/.test(rota), "o filtro não confia no corpo da requisição");

  /* E nada de service-role no cliente. */
  const painel = readFileSync(new URL("../modules/radar/radar-r3-videos-panel.tsx", import.meta.url), "utf8");
  assert.ok(!/SERVICE_ROLE|service_role/.test(painel));
});

/* ==========  Q · O FUNDAMENTO NÃO É MUTADO  ===================== */

test("VÍDEOS 1 · Q — registrar fonte não toca o ArticleDNA", () => {
  const rota = readFileSync(new URL("../app/api/editorial/radar-video-sources/route.ts", import.meta.url), "utf8");
  const migracao = readFileSync(new URL("../supabase/migrations/20260911120000_radar_video_sources.sql", import.meta.url), "utf8");

  /* A rota escreve só nas tabelas de vídeo; a de texto é lida, não escrita. */
  const escritas = rota.match(/\.from\("([a-z_]+)"\)/g) || [];
  assert.deepEqual([...new Set(escritas)].sort(), ['.from("radar_article_video_sources")', '.from("radar_video_source_texts")', '.from("radar_video_sources")'], "nenhuma outra tabela é tocada");
  assert.ok(!/from\("radar_video_source_texts"\)[\s\S]{0,120}\.insert/.test(rota), "o texto é lido por esta rota, nunca escrito");
  for (const proibido of ["editorial_artifact_versions", "editorial_workflow_items"]) {
    assert.ok(!rota.includes(proibido), `a rota não toca "${proibido}"`);
  }

  /*
   * A versão do ArticleDNA é gravada como PROVENIÊNCIA, não como vínculo: uma
   * decisão deliberada do humano não caduca porque o artigo ganhou versão nova,
   * e por isso a coluna não é FK nem entra na unicidade.
   */
  assert.match(migracao, /registration_article_dna_version_id text,/);
  assert.ok(!/registration_article_dna_version_id[^,]*REFERENCES/.test(migracao));
  assert.ok(!/uq_radar_video_source_identity[\s\S]{0,200}article_dna_version/.test(migracao));
});

/* ==========  R, S e T · O SNAPSHOT DAS PAUTAS  ================== */

/**
 * A BASE DO CONGELAMENTO, A PARTIR DE UMA INVESTIGAÇÃO DE VERDADE.
 *
 * `freezeRadarEvidenceBundle` exige a fotografia competitiva inteira. Montar um
 * objeto mínimo que passe no parse produziria um teste que só descreve o
 * próprio esqueleto — a vista real é construída aqui, com amostra, conceitos e
 * autoridade, como acontece em produção.
 */
const vistaReal = () => vista();

const bundleBase = () => {
  const view = vistaReal();
  return {
    readiness: radarFinalizationReadiness({
      started: true, stale: false, alreadyFinalized: false,
      pending: 0, analyzed: view.observed.sample.analyzedSuccess,
      failed: view.observed.sample.failedFinal, sufficiency: view.sufficiency,
    }),
    observed: view.observed, record: registro(), mode: "WEB" as const, sufficiency: view.sufficiency,
    frozenBy: "ator", frozenAt: "2026-09-11T12:00:00.000Z",
  };
};

/** O blueprint real da investigação, com as pautas trocadas pelas do caso. */
const blueprintCom = (videoBriefs: unknown[]) => {
  const view = vistaReal();
  return { ...view.blueprint, videoBriefs } as never;
};

test("VÍDEOS 1 · R — o bundle congela a pauta inteira, não só o id", () => {
  const pauta = {
    id: "video:abc123", topic: "Rotina para pele oleosa", narrativePurpose: "Mostrar a aplicação passo a passo",
    whatToLookFor: ["ordem dos produtos", "quantidade"], relatedSectionId: "sec-1", relatedSectionTitle: "Rotina",
    questions: ["Qual a ordem correta?"], entities: ["ácido salicílico"], evidenceNeeded: "Demonstração visual",
    priority: "HIGH", provenance: [{ source: "SEMANTIC_CONCEPT", detail: "conceito recorrente na amostra" }],
  };

  const congelamento = freezeRadarEvidenceBundle({
    ...bundleBase(),
    blueprint: blueprintCom([pauta]),
  });
  assert.equal(congelamento.ok, true);
  if (!congelamento.ok) return;

  const leitura = radarFrozenVideoBriefReading(congelamento.bundle);
  assert.equal(leitura.legacyIdsOnly, false);
  assert.equal(leitura.briefs.length, 1);

  /* Cada campo que §15 exige está lá, com valor — não com placeholder. */
  const congelada = leitura.briefs[0];
  assert.equal(congelada.briefId, pauta.id);
  assert.equal(congelada.topic, pauta.topic);
  assert.equal(congelada.narrativePurpose, pauta.narrativePurpose);
  assert.deepEqual(congelada.whatToLookFor, pauta.whatToLookFor);
  assert.equal(congelada.relatedSectionTitle, pauta.relatedSectionTitle);
  assert.deepEqual(congelada.questions, pauta.questions);
  assert.deepEqual(congelada.entities, pauta.entities);
  assert.equal(congelada.evidenceNeeded, pauta.evidenceNeeded);
  assert.equal(congelada.priority, pauta.priority);
  assert.equal(congelada.provenance[0].detail, pauta.provenance[0].detail);

  /*
   * §16 · A PAUTA SAI AMARRADA À INVESTIGAÇÃO QUE LHE DÁ SIGNIFICADO.
   *
   * O id é derivado da amostra e pode mudar depois de um RESET. Um extrato
   * futuro precisa provar "respondi a ESTA pauta, DESTA investigação" — e por
   * isso o bundle e a versão do fundamento viajam junto.
   */
  assert.equal(congelada.frozenBundleId, congelamento.bundle.bundleId);
  assert.equal(congelada.frozenBundleHash, congelamento.bundle.bundleHash);
  assert.equal(congelada.articleDnaVersionId, congelamento.bundle.binding.articleDnaVersionId);
  assert.equal(congelada.articleDnaContentHash, congelamento.bundle.binding.articleDnaContentHash);
});

test("VÍDEOS 1 · S — bundle legado, só com ids, continua legível e se declara", () => {
  const congelamento = freezeRadarEvidenceBundle({
    ...bundleBase(),
    blueprint: blueprintCom([{ id: "video:antigo", topic: "t", narrativePurpose: "n", whatToLookFor: [], relatedSectionId: null, relatedSectionTitle: null, questions: [], entities: [], evidenceNeeded: "e", priority: "LOW", provenance: [] }]),
  });
  assert.equal(congelamento.ok, true);
  if (!congelamento.ok) return;

  /*
   * O bundle antigo é reconstruído removendo o campo — é assim que ele chega do
   * banco, gravado antes deste contrato. O `.default([])` do schema é o que o
   * mantém legível sem reescrever história.
   */
  const legado = RadarFrozenEvidenceBundleSchema.parse(JSON.parse(JSON.stringify({
    ...congelamento.bundle,
    blueprint: { ...congelamento.bundle.blueprint, videoBriefSnapshots: undefined },
  })));

  assert.deepEqual(legado.blueprint?.videoBriefSnapshots, [], "o campo ausente vira lista vazia");
  assert.deepEqual(legado.blueprint?.videoBriefIds, ["video:antigo"], "e os ids continuam lá");

  const leitura = radarFrozenVideoBriefReading(legado);
  assert.equal(leitura.legacyIdsOnly, true, "a limitação é declarada");
  assert.deepEqual(leitura.idsWithoutSnapshot, ["video:antigo"]);
  assert.equal(leitura.briefs.length, 0, "nenhuma pauta é inventada para o bundle antigo");
});

test("VÍDEOS 1 · T — o snapshot congelado não muda quando o blueprint vivo é recomputado", () => {
  const pauta = (topic: string) => ({
    id: "video:estavel", topic, narrativePurpose: "p", whatToLookFor: [], relatedSectionId: null,
    relatedSectionTitle: null, questions: [], entities: [], evidenceNeeded: "e", priority: "HIGH", provenance: [],
  });

  const congelamento = freezeRadarEvidenceBundle({ ...bundleBase(), blueprint: blueprintCom([pauta("versão congelada")]) });
  assert.equal(congelamento.ok, true);
  if (!congelamento.ok) return;

  const antes = JSON.stringify(congelamento.bundle.blueprint?.videoBriefSnapshots);

  /*
   * O blueprint vivo é recomputado a cada leitura da tela. Congelar significa
   * que o que foi gravado não acompanha essa recomputação — senão o "congelado"
   * mudaria sozinho e a promessa do FINALIZE não valeria nada.
   */
  freezeRadarEvidenceBundle({ ...bundleBase(), blueprint: blueprintCom([pauta("versão recomputada, diferente")]) });

  assert.equal(JSON.stringify(congelamento.bundle.blueprint?.videoBriefSnapshots), antes, "o bundle já congelado não foi tocado");
  assert.equal(congelamento.bundle.blueprint?.videoBriefSnapshots[0].topic, "versão congelada");

  /* E a leitura é pura: ler não reescreve. */
  radarFrozenVideoBriefReading(congelamento.bundle);
  assert.equal(JSON.stringify(congelamento.bundle.blueprint?.videoBriefSnapshots), antes);
});

/* ==========  U · O HANDOFF CONTINUA COMPATÍVEL  ================= */

test("VÍDEOS 1 · U — PlannerHandoff segue em v3, sem contrato novo", async () => {
  const { RADAR_PLANNER_CONTRACT_VERSION } = await import("../lib/radar/planner-handoff.ts");

  /*
   * O campo é ADITIVO e OPCIONAL dentro do bundle congelado. Ele não altera a
   * forma do envelope do Planejador, que já carrega o blueprint inteiro — não
   * há contrato novo a versionar, então não existe v4.
   */
  assert.equal(RADAR_PLANNER_CONTRACT_VERSION, 3);

  const handoff = readFileSync(new URL("../lib/radar/planner-handoff.ts", import.meta.url), "utf8");
  assert.match(handoff, /editorialBlueprint: input\.blueprint/, "o handoff continua levando o blueprint completo");
  assert.ok(!/videoBriefSnapshots/.test(handoff), "o snapshot é do bundle; o handoff não o duplica");
});

/* ==========  A PRIMEIRA CAMADA HUMANA  ========================== */

test("VÍDEOS 1 · §10 — a lista mostra leitura humana, não identificador técnico", () => {
  const fonte = RadarVideoSourceSchema.parse({
    id: "11111111-1111-4111-8111-111111111111",
    brandId: "22222222-2222-4222-8222-222222222222",
    articleId: "artigo-1", sourceKind: "YOUTUBE",
    originalUrl: `https://youtu.be/${ID}`, normalizedUrl: CANONICA, normalizedUrlHash: "ytv:deadbeef",
    youtubeVideoId: ID, displayName: null, registrationStatus: "REGISTERED", registeredBy: null,
    registrationArticleDnaVersionId: null, registrationArticleDnaContentHash: null,
    createdAt: "2026-09-11T12:00:00.000Z", updatedAt: "2026-09-11T12:00:00.000Z",
  });

  const leitura = radarVideoSourceDisplay(fonte);
  assert.equal(leitura.platform, "YouTube");
  assert.equal(leitura.statusLabel, "Registrada");
  assert.equal(leitura.url, CANONICA);
  /*
   * GATE 2 · a frase vem do ESTADO gravado, não de "existe transcript?".
   *
   * Enquanto ninguém acionar a extração, o estado é `REGISTERED` e a leitura
   * diz exatamente isso.
   */
  /*
   * GATE 2.1 · "extraído" virou "disponível".
   *
   * O texto pode chegar por transcrição fornecida, legenda do próprio canal ou
   * Speech sobre mídia da marca — "extrair" descrevia só um dos caminhos.
   */
  assert.equal(leitura.textStatus, "Texto ainda não disponível");
  assert.equal(fonte.textState, "REGISTERED", "o estado tem padrão explícito");
  assert.equal(leitura.hasMetadata, false, "metadado é ação separada e ainda não foi pedido");

  /* Nem id nem hash entram na primeira camada. */
  const texto = JSON.stringify(leitura);
  assert.ok(!texto.includes(fonte.id));
  assert.ok(!texto.includes(fonte.normalizedUrlHash));

  const painel = readFileSync(new URL("../modules/radar/radar-r3-videos-panel.tsx", import.meta.url), "utf8");
  assert.match(painel, /\{leitura\.textStatus\}/, "a tela diz que nada foi extraído");

  /*
   * O id aparece UMA vez, como `key` do React — que não é texto renderizado.
   * O hash não aparece em lugar nenhum. A distinção importa: proibir a string
   * `fonte.id` mediria o uso legítimo junto com o ilegítimo.
   */
  assert.ok(!painel.includes("normalizedUrlHash"), "a tela não conhece o hash");
  assert.match(painel, /key=\{fonte\.id\}/, "o id é chave do React");
  /*
   * O id aparece como `key`, no `data-testid` do botão e como argumento da
   * extração — todos usos técnicos, nenhum deles TEXTO renderizado. O que se
   * proíbe é exibi-lo, não referenciá-lo.
   */
  assert.ok(!/>\{fonte\.id\}|>\s*\{fonte\.id\}\s*</.test(painel), "o id nunca é exibido como conteúdo");
});

/* ==========  M · ZERO PROVIDER  ================================= */

test("VÍDEOS 1 · M — nenhuma chamada de rede saiu desta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `PROVIDER_CALLS deveria ser 0; houve: ${tentativasDeRede.join(", ")}`);
});

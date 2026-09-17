import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolveRadarCanonicalDossier } from "../lib/server/radar-canonical-dossier.ts";
import type { RadarCanonicalAuthorities } from "../lib/server/radar-canonical-authorities.ts";
import {
  RADAR_EMPTY_KEYWORD_CONTEXT,
  radarKeywordContextOf,
  radarKeywordContextOfBundle,
} from "../lib/radar/keyword-context.ts";
import { RADAR_EVIDENCE_BUNDLE_VERSION, assertRadarEvidenceBundleIntegrity } from "../lib/radar/evidence-bundle.ts";
import { RadarAnalysisPayloadSchema } from "../lib/radar/analysis-contracts.ts";
import { RadarYoutubeSearchRunSchema } from "../lib/radar/youtube-search-run.ts";
import { buildRadarYoutubeBlueprint } from "../lib/radar/youtube-blueprint.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";

/*
 * ===== RADAR_CANONICAL_KEYWORD_CONTEXT_1 · A ÚLTIMA LACUNA =====
 *
 * ==================== O QUE ESTE GATE FECHA ====================
 *
 * O texto da keyword principal só era alcançável no dossiê por
 * `observed.identity.principal` — que é da fotografia do pipeline do Google.
 * Num artigo de vídeo ou de produto aquele campo nunca existiu.
 *
 * O Planejador ficava com o título e o slug do artigo. Nenhum dos dois é a
 * keyword: "skincare para pele oleosa" vira o slug `cuidados-pele-oleosa` e o
 * título "Como cuidar da pele oleosa no dia a dia". Três textos, um fundamento
 * — e planejar pelo título é planejar pela formulação de quem o escreveu.
 *
 * PROVIDER_CALLS = 0 e AI_CALLS = 0, com sentinela no fim.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

/* ==================== a composição que o Arquiteto aprovou ==================== */

const PRINCIPAL = "skincare para pele oleosa";
const SECUNDARIAS = ["cuidados pele oleosa", "rotina pele oleosa"];
const REFORCOS = ["controle de oleosidade"];

/**
 * O CONTEXTO É O MESMO NOS TRÊS PERFIS — e é isso que o gate prova.
 *
 * `identity.role` vem da referência do ArticleDNA; `identity.text` vem da
 * hidratação amarrada àquela versão. Nenhum dos dois depende de como a
 * investigação foi feita.
 */
const contexto = (patch: Partial<{ slug: string; titulo: string }> = {}): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: {
    brandId: "marca-1", articleId: "artigo-1",
    articleDnaVersionId: "dna-v3", articleDnaContentHash: "sha256:abc",
    promise: patch.titulo || "Como cuidar da pele oleosa no dia a dia",
    mainIntent: "informacional", hierarchy: "Suporte",
  },
  keywords: [
    {
      identity: { keywordId: "kw-1", text: PRINCIPAL, role: "principal" },
      strategy: { volume: 720, resultCount: 41000, kgrScore: 0.589, incrementalVolume: null, normalizedIntent: "informacional", coveredIntentions: [], strategicContribution: null, purpose: null, overlapRisk: null, semanticQualification: null },
      resolution: "FULL",
      provenance: { textSource: "hydration", strategySource: "article_reference" },
    },
    ...SECUNDARIAS.map((texto, indice) => ({
      identity: { keywordId: `kw-s${indice}`, text: texto, role: "secundaria" },
      strategy: { volume: 210, resultCount: null, kgrScore: null, incrementalVolume: null, normalizedIntent: "informacional", coveredIntentions: [], strategicContribution: null, purpose: null, overlapRisk: null, semanticQualification: null },
      resolution: "FULL",
      provenance: { textSource: "hydration", strategySource: "article_reference" },
    })),
    ...REFORCOS.map((texto, indice) => ({
      identity: { keywordId: `kw-r${indice}`, text: texto, role: "reforco_narrativo" },
      strategy: { volume: null, resultCount: null, kgrScore: null, incrementalVolume: null, normalizedIntent: null, coveredIntentions: [], strategicContribution: null, purpose: null, overlapRisk: null, semanticQualification: null },
      resolution: "FULL",
      provenance: { textSource: "hydration", strategySource: "article_reference" },
    })),
  ],
  editorialTopics: [],
  resolvedKeywordTexts: [PRINCIPAL, ...SECUNDARIAS],
  silo: { siloId: "silo-1", siloName: "skincare", articleRole: "SUPORTE" },
  formationSerp: null, internalLinks: null, limitations: [],
} as unknown as RadarArticleResearchContext);

const autoridades = (patch: Partial<RadarCanonicalAuthorities> = {}): RadarCanonicalAuthorities => ({
  google: null, video: null, specialist: null,
  researchContext: contexto(),
  ...patch,
});

/* ==================== as três investigações congeladas ==================== */

const FUNDAMENTO = {
  brandId: "marca-1", articleId: "artigo-1",
  articleDnaVersionId: "dna-v3", articleDnaContentHash: "sha256:abc",
};

type Perfil = "GOOGLE" | "YOUTUBE" | "AMAZON";

/* A fotografia do vídeo exige blueprint completo; a corrida vazia basta. */
const blueprintDoYoutube = () => buildRadarYoutubeBlueprint({
  run: RadarYoutubeSearchRunSchema.parse({
    researchMode: "YOUTUBE", runId: "run-yt-1", runVersion: 1,
    startedAt: "2026-09-14T09:00:00.000Z", startedBy: "user-1", state: "COLLECTED",
    fingerprint: { articleId: "artigo-1", articleDnaVersionId: "dna-v3", articleDnaContentHash: "sha256:abc", queryIds: ["ytq:1"], signature: "yt" },
    provenance: { provider: "dataforseo", endpoint: "/yt", queriesRequested: 1, queriesSucceeded: 1, queriesFailed: 0, collectedAt: "2026-09-14T09:00:00.000Z" },
    queries: [], results: [], universe: [], limitations: [],
  }),
  declaredIntent: "informacional", editorialTopics: [], generatedAt: "2026-09-14T10:00:00.000Z",
});

/**
 * A MESMA ANÁLISE, COM A FOTOGRAFIA DE CADA PERFIL.
 *
 * O resolvedor lê a fotografia estruturalmente — é assim que ele mantém legível
 * o congelamento antigo que não tem camada multiformato. A bancada usa essa
 * mesma porta, porque o que este gate exercita é o CONTEXTO DE KEYWORD, e ele
 * não depende da forma da investigação.
 */
const analise = (perfil: Perfil, opcoes: { slug?: string; serpQuery?: string } = {}) => {
  const base = RadarAnalysisPayloadSchema.parse({
    schemaVersion: 1, brandId: "marca-1", articleId: "artigo-1", articleDnaVersionId: "dna-v3",
    serpSnapshotId: opcoes.serpQuery ? "serp-9" : null, serpSnapshotVersion: null, serpSnapshotHash: null,
    serpDecisions: [], selectedCompetitorIds: [], extractionIds: [], extractions: [], extractionFailures: [],
    verifiedSources: [], sourceVerificationFailures: [], deepResearch: null, researchTarget: null,
    supportResearch: null, researchPackage: null, amazonSearch: null, amazonBlueprint: null,
    amazonFrozenInvestigation: null, youtubeSearch: null, youtubeFrozenInvestigation: null,
    finalizedBundle: null, benchmark: null, semanticTerms: [], structuralDecisions: [],
    competitiveness: null, keywordDecisions: [], competitiveReport: null,
    plannerPackage: null, plannerTransfer: null, plannerBundle: null,
    researchTransport: "FULL", mode: "kgr_light",
    modeRecommendation: { suggestedMode: "kgr_light", reasons: ["fixture"], confidence: "low", ruleSource: "minerador_kgr_strict" },
    modeHumanReason: "", status: "approved", humanNotes: [], approvedAt: null, approvedBy: null,
  });

  const fotografia = perfil === "GOOGLE"
    ? { finalizedBundle: { frozenAt: "2026-09-10T13:00:00.000Z", frozenBy: "user-1", limitations: [] } }
    : perfil === "YOUTUBE"
      ? {
        youtubeFrozenInvestigation: {
          frozenVersion: 1, finalizedAt: "2026-09-14T10:00:00.000Z", finalizedBy: "user-1",
          runRef: { runId: "run-yt-1", runVersion: 1, runFingerprint: "yt", collectedAt: "2026-09-14T09:00:00.000Z", provider: "dataforseo", endpoint: "/yt", queriesExecuted: 3, universeSize: 38, selectedVideoIds: [] },
          run: null, blueprint: blueprintDoYoutube(), multimodal: null, limitations: [],
        },
      }
      : {
        amazonFrozenInvestigation: {
          frozenVersion: 1, finalizedAt: "2026-09-15T10:00:00.000Z", finalizedBy: "user-1",
          originalEditorialIntent: null,
          runRef: { runId: "run-amz-1", runVersion: 1, runFingerprint: "amz", collectedAt: "2026-09-15T09:00:00.000Z", provider: "dataforseo", endpoint: "/amz", languageCode: "pt_BR", queriesExecuted: 1, universeSize: 59 },
          supportRefs: [], observedSummary: { products: 59, organic: 58, sponsored: 1, sponsoredPlacements: 1, both: 0, withPrice: 59, withRating: 55, relatedSearches: 4 },
          competitiveBlueprint: null, editorialOutput: null, limitations: [],
        },
      };

  const payload = { ...base, ...fotografia } as unknown as typeof base;

  return {
    versionId: "analysis-1", entityId: "radar-analysis:artigo-1", versionNumber: 1,
    previousVersionId: null, contentHash: "sha256:analysis", origin: "human" as const,
    changeReason: "fixture", createdAt: "2026-09-15T12:00:00.000Z", createdBy: "user-1",
    payload,
  };
};

const dossie = (perfil: Perfil, autoridadesDoArtigo = autoridades()) => {
  const resultado = resolveRadarCanonicalDossier({
    analysis: analise(perfil) as never,
    article: FUNDAMENTO,
    observedAt: "2026-09-17T12:00:00.000Z",
    authorities: autoridadesDoArtigo,
  });
  assert.equal(resultado.ok, true, `a bancada precisa resolver o dossiê de ${perfil}`);
  if (!resultado.ok) throw new Error("dossiê não resolvido");
  return resultado.dossier;
};

/* ============================== A, B, C e K ============================== */

test("A, B e C · os três perfis carregam a MESMA keyword principal", () => {
  const google = dossie("GOOGLE");
  const youtube = dossie("YOUTUBE");
  const amazon = dossie("AMAZON");

  /*
   * A LACUNA ERA ESTA: antes do gate, só o Google carregava o texto, e ele o
   * carregava por `observed.identity` — um campo que o perfil de vídeo e o
   * comercial nunca tiveram.
   */
  assert.equal(google.keywordContext.principal, PRINCIPAL, "A · Google");
  assert.equal(youtube.keywordContext.principal, PRINCIPAL, "B · YouTube");
  assert.equal(amazon.keywordContext.principal, PRINCIPAL, "C · Amazon");

  /* E o contexto viaja DENTRO do dossiê entregue, não ao lado dele. */
  assert.equal(google.bundle.keywordContext?.principal, PRINCIPAL);
  assert.equal(youtube.bundle.keywordContext?.principal, PRINCIPAL);
  assert.equal(amazon.bundle.keywordContext?.principal, PRINCIPAL);
});

test("K · trocar o perfil de pesquisa não muda o contexto de keyword", () => {
  /*
   * O PERFIL DESCREVE COMO INVESTIGAMOS; a composição descreve SOBRE O QUÊ.
   *
   * Se o contexto mudasse com o perfil, uma segunda investigação do mesmo
   * artigo — em vídeo, digamos — entregaria ao Planejador outra keyword.
   */
  const contextos = (["GOOGLE", "YOUTUBE", "AMAZON"] as const).map(perfil => dossie(perfil).keywordContext);
  assert.deepEqual(contextos[1], contextos[0], "K · YouTube divergiu do Google");
  assert.deepEqual(contextos[2], contextos[0], "K · Amazon divergiu do Google");
});

/* ============================== D, E e F ============================== */

test("D, E e F · slug, título e consulta da SERP não substituem a keyword", () => {
  /*
   * ===== §5 · OS TRÊS FALLBACKS PROIBIDOS =====
   *
   * Os três existem, os três se parecem com a keyword em muitos artigos, e é
   * justamente por isso que usá-los produziria um erro que ninguém percebe: o
   * Planejador planejaria para um termo que a formação nunca qualificou.
   */
  const comSlugDiferente = radarKeywordContextOf(contexto({ slug: "cuidados-pele-oleosa" }));
  assert.equal(comSlugDiferente.principal, PRINCIPAL, "D · o slug mudou a keyword");

  const comTituloDiferente = radarKeywordContextOf(contexto({ titulo: "Como cuidar da pele oleosa no dia a dia" }));
  assert.equal(comTituloDiferente.principal, PRINCIPAL, "E · o título mudou a keyword");

  /* F · e a consulta executada é da investigação, não do fundamento. */
  const comOutraConsulta = resolveRadarCanonicalDossier({
    analysis: analise("GOOGLE", { serpQuery: "rotina noturna pele oleosa" }) as never,
    article: FUNDAMENTO,
    observedAt: "2026-09-17T12:00:00.000Z",
    authorities: autoridades(),
  });
  assert.equal(comOutraConsulta.ok, true);
  if (!comOutraConsulta.ok) return;
  assert.equal(comOutraConsulta.dossier.keywordContext.principal, PRINCIPAL, "F · a consulta mudou a keyword");
});

test("§5 · nenhum caminho do contexto de keyword lê título, slug ou consulta", async () => {
  const fonte = await readFile(new URL("../lib/radar/keyword-context.ts", import.meta.url), "utf8");
  const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

  for (const proibido of ["slug", "title", "titulo", "query", "serp", "hierarchy", "promise"]) {
    assert.equal(new RegExp(`\\b${proibido}\\b`, "i").test(semComentarios), false,
      `§5 · o contexto de keyword lê ${proibido}`);
  }
});

/* ================================ G e H ================================ */

test("G e H · secundárias e reforços narrativos atravessam inteiros", () => {
  const contexto = dossie("AMAZON").keywordContext;

  assert.deepEqual(contexto.secondary, SECUNDARIAS, "G · secundárias perdidas");
  assert.deepEqual(contexto.narrativeReinforcements, REFORCOS, "H · reforços narrativos perdidos");

  /*
   * OS TRÊS PAPÉIS SÃO TRÊS LISTAS, e nunca uma só.
   *
   * O papel decide o tratamento no texto: a principal governa o H1, a
   * secundária cobre uma faceta, o reforço sustenta o argumento. Achatá-los
   * numa lista faria o Planejador tratar os três do mesmo jeito.
   */
  assert.equal(contexto.secondary.includes(PRINCIPAL), false);
  assert.equal(contexto.narrativeReinforcements.includes(PRINCIPAL), false);
  assert.equal(contexto.resolution, "ARTICLE_DNA_HYDRATION");
});

/* ================================== I ================================== */

test("I · dossiê legado sem keywordContext resolve pelo fundamento canônico", () => {
  /*
   * ===== §5 · O QUE JÁ ESTÁ GRAVADO CONTINUA VÁLIDO =====
   *
   * Pacotes entregues antes deste gate não têm o campo. Eles continuam
   * íntegros — a chave ausente não entra na serialização canônica — e quem os
   * lê resolve pela mesma autoridade, alcançada pelo caminho mais longo.
   */
  const legado = { keywordContext: undefined };
  const resolvido = radarKeywordContextOfBundle(legado, contexto());
  assert.equal(resolvido.principal, PRINCIPAL);
  assert.deepEqual(resolvido.secondary, SECUNDARIAS);

  /* O gravado vence quando ele resolve. */
  const gravado = { keywordContext: { principal: "outra keyword", secondary: [], narrativeReinforcements: [], resolution: "ARTICLE_DNA_HYDRATION" as const } };
  assert.equal(radarKeywordContextOfBundle(gravado, contexto()).principal, "outra keyword");

  /* E sem nenhum dos dois, a ausência é declarada — nunca preenchida. */
  assert.deepEqual(radarKeywordContextOfBundle(null, null), RADAR_EMPTY_KEYWORD_CONTEXT);
  assert.equal(radarKeywordContextOf(null).resolution, "UNRESOLVED");
});

test("§1 e §5 · o contrato continua V3, e o dossiê legado continua íntegro", () => {
  assert.equal(RADAR_EVIDENCE_BUNDLE_VERSION, 3);

  const comContexto = dossie("YOUTUBE");
  assert.equal(comContexto.bundle.bundleVersion, 3);
  assertRadarEvidenceBundleIntegrity(comContexto.bundle);

  /*
   * ===== A CHAVE AUSENTE NÃO MUDA A IDENTIDADE DE QUEM NÃO A TEM =====
   *
   * Um artigo sem keyword resolvida produz o MESMO hash de antes do gate: o
   * campo só entra na serialização quando há contexto a entregar. Gravá-lo com
   * valor nulo mudaria a identidade de pacotes que não mudaram em nada.
   */
  const semContexto = dossie("YOUTUBE", { google: null, video: null, specialist: null, researchContext: null });
  assert.equal("keywordContext" in semContexto.bundle, false, "§5 · a chave apareceu sem contexto a entregar");
  assertRadarEvidenceBundleIntegrity(semContexto.bundle);
  assert.notEqual(semContexto.bundle.bundleHash, comContexto.bundle.bundleHash);
});

/* ================================== J ================================== */

test("J · a mesma principal chega ao Planejador e ao export", async () => {
  const canonico = dossie("YOUTUBE");

  /*
   * §7 · A PARIDADE É ESTRUTURAL: os dois leem o MESMO campo do dossiê.
   *
   * O envio grava `dossier.bundle`, que carrega `keywordContext`. O export
   * projeta `dossier.keywordContext`. Não há duas resoluções para comparar.
   */
  assert.equal(canonico.bundle.keywordContext?.principal, canonico.keywordContext.principal);
  assert.equal(canonico.keywordContext.principal, PRINCIPAL);

  const rota = await readFile(new URL("../app/api/editorial/radar-export/route.ts", import.meta.url), "utf8");
  const semComentarios = rota.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

  assert.match(semComentarios, /keywordContext: keywords \} = canonico\.dossier/);
  assert.match(semComentarios, /principalKeyword: keywords\.principal/);
  assert.match(semComentarios, /secondaryKeywords: keywords\.secondary/);
  assert.match(semComentarios, /narrativeReinforcements: keywords\.narrativeReinforcements/);

  /* E a rota não remonta a lista por papel por conta própria. */
  assert.equal(/identity\.role === "principal"/.test(semComentarios), false,
    "§7 · a rota voltou a montar a composição por conta própria");
});

/* ================================ §8 ================================ */

test("§8 · nada aqui coleta, chama IA ou grava fundamento", async () => {
  const fonte = await readFile(new URL("../lib/radar/keyword-context.ts", import.meta.url), "utf8");
  const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
  assert.equal(/fetch\(|dataforseo|openai|anthropic|\.insert\(|\.update\(/i.test(semComentarios), false);

  const arquiteto = await readFile(new URL("../lib/arquiteto/contracts.ts", import.meta.url), "utf8");
  assert.equal(/keyword-context/.test(arquiteto), false, "§8 · ARTICLE_DNA_MUTATED");
});

test("PROVIDER_CALLS = 0 e AI_CALLS = 0", () => {
  assert.deepEqual(idasAoServidor, [], `nenhuma rede deveria ter saído; houve: ${idasAoServidor.join(", ")}`);
});

/* ==================== os sobreviventes da bateria, fechados ==================== */

test("§2 · keyword principal não resolvida é `null`, nunca a secundária", () => {
  /*
   * ===== A SUBSTITUIÇÃO MAIS TENTADORA, E A MAIS CARA =====
   *
   * Quando a hidratação daquela versão não trouxe o texto da principal, existe
   * uma secundária ali do lado, com texto, do mesmo artigo. Promovê-la parece
   * um conserto — e é a mesma falha do título e do slug com outro nome: o
   * Planejador passaria a planejar para um termo de APOIO como se fosse o
   * termo que a formação qualificou.
   *
   * `null` é a única resposta honesta, e `UNRESOLVED` diz por quê.
   */
  const semPrincipal = radarKeywordContextOf({
    ...contexto(),
    keywords: contexto().keywords.map(item => item.identity.role === "principal"
      ? { ...item, identity: { ...item.identity, text: null }, provenance: { ...item.provenance, textSource: "none" } }
      : item),
  } as unknown as RadarArticleResearchContext);

  assert.equal(semPrincipal.principal, null, "§2 · a secundária assumiu o lugar da principal");
  assert.equal(semPrincipal.resolution, "UNRESOLVED", "§2 · a resolução mentiu sobre ter resolvido");

  /* As secundárias continuam inteiras: o que falta é a principal, não a lista. */
  assert.deepEqual(semPrincipal.secondary, SECUNDARIAS);
  assert.deepEqual(semPrincipal.narrativeReinforcements, REFORCOS);

  /* E o contexto resolvido continua dizendo que resolveu. */
  assert.equal(radarKeywordContextOf(contexto()).resolution, "ARTICLE_DNA_HYDRATION");
});

test("J · o arquivo exportado é identificado pela keyword, não pelo slug", async () => {
  const rota = await readFile(new URL("../app/api/editorial/radar-export/route.ts", import.meta.url), "utf8");
  const semComentarios = rota.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

  /*
   * O NOME DO ARQUIVO CAI PARA A KEYWORD QUANDO NÃO HÁ SLUG — e é a keyword
   * canônica que ele usa, não uma segunda leitura. Deixar o slug nos dois
   * campos faria o fallback do nome do arquivo deixar de existir em silêncio.
   */
  const identificacao = semComentarios.slice(semComentarios.indexOf("identificacao.push({"));
  assert.match(identificacao.slice(0, 200), /keyword: keywords\.principal/,
    "J · a identificação do arquivo deixou de usar a keyword canônica");
});

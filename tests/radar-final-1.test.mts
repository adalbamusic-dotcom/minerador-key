import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  RADAR_EVIDENCE_BUNDLE_VERSION,
  assertRadarEvidenceBundleIntegrity,
  buildRadarEvidenceBundleV3,
  radarEvidenceBundleIdentity,
  radarEvidenceBundleMatchesArticle,
  type RadarEvidenceBundle,
} from "../lib/radar/evidence-bundle.ts";
import {
  buildRadarEvidenceBundleFromAnalysis,
  radarPrimaryProfileOfAnalysis,
} from "../lib/radar/evidence-bundle-runtime.ts";
import { radarPlannerHandoffReadiness } from "../lib/radar/planner-handoff.ts";
import { RADAR_EVIDENCE_HIERARCHY } from "../lib/radar/evidence-authority.ts";
import { normalizeDataForSeoAmazonResponse } from "../lib/server/dataforseo-amazon-operation.ts";
import { buildRadarAmazonUniverse } from "../lib/radar/amazon-search-model.ts";
import { buildRadarAmazonSearchRun, buildRadarAmazonRunFingerprint } from "../lib/radar/amazon-search-run.ts";
import { amazonCompetitiveBlueprintOfAnalysis } from "../lib/radar/amazon-editorial.ts";
import { freezeRadarAmazonInvestigation } from "../lib/radar/amazon-evidence.ts";

/*
 * ===== RADAR_FINAL_1 · O DOSSIÊ V3 E A FRONTEIRA COM O PLANEJADOR =====
 *
 * PROVIDER_CALLS = 0 nos três motores, com sentinela no fim. Este gate
 * consolida e entrega: nada aqui coleta.
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

const payloadAmazon = JSON.parse(
  await readFile(new URL("./fixtures/dataforseo-amazon-discovery.json", import.meta.url), "utf8"),
);

const fonteDoRuntime = await readFile(new URL("../lib/radar/evidence-bundle-runtime.ts", import.meta.url), "utf8");
const fonteDoEnvio = await readFile(new URL("../lib/server/radar-planner-send.ts", import.meta.url), "utf8");
const fonteDaRota = await readFile(new URL("../app/api/editorial/radar-writer-handoff/route.ts", import.meta.url), "utf8");
const fonteDaWorkbench = await readFile(new URL("../modules/radar/radar-r3-workbench.tsx", import.meta.url), "utf8");
const fonteDaPagina = await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");

/* ============================ o fundamento ============================ */

const FUNDAMENTO = {
  brandId: "marca-1",
  articleId: "artigo-1",
  articleDnaVersionId: "dna-v3",
  articleDnaContentHash: "sha256:abc",
};

/* ====================== as investigações congeladas ====================== */

const corridaAmazon = () => {
  const normalizada = normalizeDataForSeoAmazonResponse(payloadAmazon, "amzq:1");
  return buildRadarAmazonSearchRun({
    runId: "run-amz-1", runVersion: 1,
    startedAt: "2026-09-15T12:00:00.000Z", startedBy: "user-1",
    fingerprint: buildRadarAmazonRunFingerprint({ articleId: "artigo-1", articleDnaVersionId: "dna-v3", queryIds: ["amzq:1"] }),
    provenance: {
      provider: "dataforseo", endpoint: "/v3/merchant/amazon/products/live/advanced",
      collectedAt: "2026-09-15T12:00:05.000Z", languageCode: "pt_BR", depth: 20,
      queriesRequested: 1, queriesSucceeded: 1, queriesFailed: 0,
    },
    queries: [{ queryId: "amzq:1", text: "protetor solar facial", origin: "PRIMARY_KEYWORD", reason: "principal", executed: true }],
    results: normalizada.results,
    universe: buildRadarAmazonUniverse(normalizada.results),
    relatedSearches: normalizada.relatedSearches,
  });
};

const blueprintAmazon = () => amazonCompetitiveBlueprintOfAnalysis({
  articleId: "artigo-1", articleDnaVersionId: "dna-v3", articleDnaContentHash: "sha256:abc",
  run: corridaAmazon(), support: null,
  primaryKeyword: "protetor solar facial", declaredIntent: "comercial",
  researchRefs: [], generatedAt: "2026-09-15T13:00:00.000Z", frozenAt: null,
});

const analiseAmazon = () => ({
  amazonSearch: corridaAmazon(),
  amazonFrozenInvestigation: freezeRadarAmazonInvestigation({
    run: corridaAmazon(),
    blueprint: blueprintAmazon(),
    supportRefs: [{ source: "WEB_SERP" as const, role: "SEO_COMMERCIAL_SUPPORT" as const, snapshotId: "snap-goo-1", keyword: "protetor solar facial", collectedAt: "2026-09-15T12:00:08.000Z" }],
    finalizedBy: "user-1", finalizedAt: "2026-09-15T14:00:00.000Z",
  }),
});

/**
 * A investigação de YouTube congelada, na forma compacta homologada.
 *
 * Só o que o dossiê precisa ler: referência da corrida, blueprint, camada
 * multiformato e limitações. Nada de universo.
 */
const analiseYoutube = () => ({
  youtubeFrozenInvestigation: {
    frozenVersion: 1,
    finalizedAt: "2026-09-14T10:00:00.000Z",
    finalizedBy: "user-1",
    runRef: {
      runId: "run-yt-1", runVersion: 1, runFingerprint: "assinatura-yt",
      collectedAt: "2026-09-14T09:00:00.000Z", provider: "dataforseo",
      endpoint: "/v3/serp/youtube/organic/live/advanced",
      queriesExecuted: 3, universeSize: 38, selectedVideoIds: ["v1", "v2"],
    },
    run: null,
    multimodal: {
      blueprint: {
        observed: {
          crossSerpVideos: [
            { signal: "CROSS_PLATFORM" }, { signal: "CROSS_PLATFORM" }, { signal: "YOUTUBE_ONLY" },
          ],
          sources: ["GOOGLE_SERP", "YOUTUBE_SERP"],
        },
        recommended: {
          editorialOutput: "ARTICLE_WITH_VIDEO",
          rationale: ["A SERP do Google devolve vídeo para esta intenção."],
        },
      },
    },
    limitations: ["O gancho interno dos vídeos não foi observado: a SERP mostra título, não conteúdo."],
  },
  supportResearch: { serpSnapshotId: "snap-goo-yt", keyword: "rotina de skincare", collectedAt: "2026-09-14T09:30:00.000Z" },
});

const montar = (payload: unknown, extras: Parameters<typeof buildRadarEvidenceBundleFromAnalysis>[0] extends infer T ? Partial<T> : never = {}) =>
  buildRadarEvidenceBundleFromAnalysis({
    payload,
    article: FUNDAMENTO,
    competitiveBlueprint: null,
    observedAt: "2026-09-15T15:00:00.000Z",
    ...extras,
  });

/* ================================ A ================================ */

test("A · perfil GOOGLE finalizado produz dossiê V3 válido", () => {
  const resultado = montar({
    finalizedBundle: { frozenAt: "2026-09-10T10:00:00.000Z", limitations: ["Fonte citada por concorrente não é endosso."] },
    serpSnapshotId: "snap-goo-1",
    serpSnapshotHash: "sha256:serp",
  });

  assert.equal(resultado.ok, true);
  if (!resultado.ok) return;

  assert.equal(resultado.bundle.bundleVersion, RADAR_EVIDENCE_BUNDLE_VERSION);
  assert.equal(resultado.bundle.primaryResearchProfile, "GOOGLE");
  assert.equal(resultado.bundle.research.google?.role, "PRIMARY");
  assert.equal(resultado.bundle.research.youtube, null);
  assert.equal(resultado.bundle.research.amazon, null);
  assert.deepEqual(resultado.bundle.researchSources, ["WEB_SERP"]);
  assert.ok(resultado.bundle.limitations.includes("Fonte citada por concorrente não é endosso."));
  assert.doesNotThrow(() => assertRadarEvidenceBundleIntegrity(resultado.bundle));
});

/* ================================ B ================================ */

test("B · YouTube finalizado produz V3 sem exigir snapshot primário do Google", () => {
  const resultado = montar(analiseYoutube());
  assert.equal(resultado.ok, true);
  if (!resultado.ok) return;

  const bundle = resultado.bundle;
  assert.equal(bundle.primaryResearchProfile, "YOUTUBE");
  assert.equal(bundle.research.youtube?.role, "PRIMARY");
  assert.equal(bundle.research.youtube?.counts.items, 38);

  /*
   * ============ §4 · O APOIO É APOIO ============
   *
   * O Google foi lido uma vez para fortalecer a leitura de vídeo. Marcá-lo como
   * primário faria o Planejador acreditar que houve investigação competitiva de
   * páginas — sobre dez links azuis que ninguém curou.
   */
  assert.equal(bundle.research.google?.role, "SUPPORT");
  assert.equal(bundle.research.google?.refs[0].role, "SEO_SUPPORT");
  assert.equal(bundle.research.amazon, null);

  /* A fotografia do Google não existe neste artigo — e isso é a verdade dele. */
  assert.equal(bundle.observed, null);

  /* §8 · o sinal cruzado viaja como sinal, com contagem por tipo. */
  assert.deepEqual(bundle.crossSerp?.signals, [
    { signal: "CROSS_PLATFORM", count: 2 },
    { signal: "YOUTUBE_ONLY", count: 1 },
  ]);

  /* §7 · a saída editorial viaja com origem. */
  assert.equal(bundle.editorialOutputs[0]?.output, "ARTICLE_WITH_VIDEO");
  assert.ok(bundle.editorialOutputs[0].sourceSignals.length >= 1);

  /* E a prontidão do handoff aceita este perfil sem congelado do Google. */
  const prontidao = radarPlannerHandoffReadiness({ article: FUNDAMENTO, frozen: null, dossier: bundle });
  assert.equal(prontidao.ready, true, prontidao.blocks.map(item => item.detail).join(" · "));
});

/* ================================ C ================================ */

test("C · Amazon finalizada produz V3 sem exigir reviews nem PDP", () => {
  const resultado = montar(analiseAmazon(), { competitiveBlueprint: blueprintAmazon() });
  assert.equal(resultado.ok, true);
  if (!resultado.ok) return;

  const bundle = resultado.bundle;
  assert.equal(bundle.primaryResearchProfile, "AMAZON");
  assert.equal(bundle.research.amazon?.role, "PRIMARY");
  assert.equal(bundle.research.amazon?.counts.items, 51);
  assert.equal(bundle.research.google?.role, "SUPPORT");
  assert.equal(bundle.research.google?.refs[0].role, "SEO_COMMERCIAL_SUPPORT");

  assert.equal(bundle.competitiveBlueprint?.profile, "AMAZON");
  assert.ok(bundle.editorialOutputs.length > 0);
  for (const saida of bundle.editorialOutputs) assert.ok(saida.sourceSignals.length >= 1);

  const prontidao = radarPlannerHandoffReadiness({ article: FUNDAMENTO, frozen: null, dossier: bundle });
  assert.equal(prontidao.ready, true, prontidao.blocks.map(item => item.detail).join(" · "));
});

/* ================================ D ================================ */

test("D · sem texto de review, a limitação atravessa o handoff", () => {
  /*
   * §14 · PERDER ESTAS FRASES FARIA O PLANEJADOR TRATAR SINAL COMERCIAL COMO
   * VEREDITO — e o artigo afirmaria o que a coleta nunca mediu.
   *
   * ============ OS DOIS CAMINHOS SÃO CONFERIDOS SEPARADAMENTE ============
   *
   * As limitações chegam de duas fontes: a fotografia congelada e o blueprint.
   * Conferir só o resultado somado deixaria qualquer uma das duas ser perdida
   * sem que ninguém notasse — a outra cobriria o rastro.
   */
  const BASE = [
    "Esta investigação não analisou textos de avaliações.",
    "Esta investigação não abriu páginas individuais dos produtos.",
    "Ratings e selos são sinais comerciais e reputacionais, não prova de qualidade.",
  ];

  /* 1 · a camada congelada entrega as dela, mesmo sem blueprint ao lado. */
  const semBlueprint = montar(analiseAmazon());
  assert.equal(semBlueprint.ok, true);
  if (!semBlueprint.ok) return;
  for (const frase of BASE) {
    assert.ok(semBlueprint.bundle.limitations.includes(frase), `a fotografia perdeu: ${frase}`);
  }

  /*
   * 2 · e o blueprint entrega as dele, INTEIRAS — nenhuma some no caminho.
   *
   * As duas frases marcadas existem SÓ no blueprint. Sem elas o teste seria
   * cego: as limitações de base aparecem nas duas fontes, e a fotografia
   * cobriria o rastro de qualquer uma perdida no caminho do blueprint.
   */
  const blueprint = {
    ...blueprintAmazon(),
    limitations: ["Limitação exclusiva do blueprint.", "Segunda limitação exclusiva.", ...blueprintAmazon().limitations],
  };
  const comBlueprint = montar(analiseAmazon(), { competitiveBlueprint: blueprint });
  assert.equal(comBlueprint.ok, true);
  if (!comBlueprint.ok) return;
  for (const frase of blueprint.limitations) {
    assert.ok(comBlueprint.bundle.limitations.includes(frase), `o blueprint perdeu: ${frase}`);
  }

  /* E a camada primária guarda as suas, para quem quiser saber de onde vieram. */
  for (const frase of BASE) {
    assert.ok(comBlueprint.bundle.research.amazon?.limitations.includes(frase), `a camada perdeu: ${frase}`);
  }
});

/* ================================ E ================================ */

test("E · a recomendação de vídeo continua recomendação, nunca observação", () => {
  const resultado = montar(analiseYoutube());
  assert.equal(resultado.ok, true);
  if (!resultado.ok) return;

  const bundle = resultado.bundle;
  /* A saída editorial vive em `editorialOutputs` — nunca dentro de uma camada. */
  assert.ok(bundle.editorialOutputs.length > 0);
  assert.equal("editorialOutput" in (bundle.research.youtube as object), false);

  /*
   * E a limitação do YouTube atravessa: a SERP mostra TÍTULO, não conteúdo.
   * Sem ela, "os concorrentes usam este gancho" viraria leitura de mercado.
   */
  assert.ok(bundle.limitations.some(item => /gancho interno/.test(item)));
});

/* ============================== F e G ============================== */

test("F e G · camada de vídeo entra quando associada; nunca quando não é", () => {
  const camada = {
    /* A identidade é conferida na montagem: sem ela a camada não sai daqui. */
    identity: { frozenBundleId: "bundle-1", matchingRunId: "run-1", inputFingerprint: "fp-1", executedAt: "2026-09-14T11:00:00.000Z" },
    briefs: [], results: [], sources: [],
    summary: { briefs: 0, supported: 0, partial: 0, notFound: 0, extracts: 0, sources: 0 },
  } as never;

  const comVideo = montar(analiseYoutube(), { video: camada });
  assert.equal(comVideo.ok, true);
  if (comVideo.ok) assert.notEqual(comVideo.bundle.video, null);

  /* Sem camada, `null` — e isso é "não houve", não uma execução vazia. */
  const semVideo = montar(analiseYoutube());
  assert.equal(semVideo.ok, true);
  if (semVideo.ok) assert.equal(semVideo.bundle.video, null);

  /*
   * §9 · O RUNTIME NÃO MONTA A CAMADA DE VÍDEO — ele a recebe.
   *
   * Montá-la aqui abriria caminho para incluir a biblioteca inteira: fonte
   * registrada não é evidência, e só o casamento decide o que sustentou trecho.
   */
  const fonte = semComentarios(fonteDoRuntime);
  assert.equal(/buildRadarVideoEvidenceLayer|videoSources|transcript/i.test(fonte), false);
});

/* ============================ H, I e J ============================ */

test("H, I e J · a decisão do especialista atravessa como ela é", async () => {
  const camadaFonte = semComentarios(await readFile(new URL("../lib/radar/specialist-evidence.ts", import.meta.url), "utf8"));

  /*
   * §10 · RECUSADA NUNCA VIRA EVIDÊNCIA POSITIVA.
   *
   * A camada já separa isso na origem: `items` só carrega decisão ativa, e o
   * que foi recusado viaja como CONTAGEM. O dossiê transporta a camada inteira
   * justamente para não reabrir essa decisão.
   */
  assert.match(camadaFonte, /notApproved: number;/);
  assert.match(camadaFonte, /rejected: number;/);

  /*
   * O VOCABULÁRIO CANÔNICO JÁ EXISTE, e não é o da prosa do gate:
   *
   *   ACCEPT_AS_EVIDENCE  →  ACCEPTED_EVIDENCE
   *   USE_AS_SUPPORT      →  SUPPORT_ONLY
   *   LITERAL_QUOTE       →  QUOTE_CANDIDATE
   *   REJECT              →  REJECTED
   *
   * Renomear os enums para casar com a prosa seria migrar decisão humana já
   * gravada. O dossiê transporta os nomes que o banco tem.
   */

  const camada = {
    binding: { brandId: "marca-1", articleId: "artigo-1", articleDnaVersionId: "dna-v3", articleDnaContentHash: "sha256:abc" },
    preparedRequirements: 3,
    items: [
      { requirementId: "r1", humanDecision: "ACCEPTED_EVIDENCE", originalText: "Resposta do profissional.", quote: null, provenance: { receivedAt: "2026-09-14T08:00:00.000Z" } },
      { requirementId: "r2", humanDecision: "SUPPORT_ONLY", originalText: "Contexto adicional.", quote: null, provenance: { receivedAt: "2026-09-14T08:05:00.000Z" } },
    ],
    notApproved: 1,
    rejected: 1,
  } as never;

  const resultado = montar(analiseYoutube(), { specialist: camada });
  assert.equal(resultado.ok, true);
  if (!resultado.ok) return;

  const entregue = resultado.bundle.specialist as unknown as { items: Array<{ humanDecision: string }>; rejected: number };
  assert.deepEqual(entregue.items.map(item => item.humanDecision), ["ACCEPTED_EVIDENCE", "SUPPORT_ONLY"]);
  assert.equal(entregue.items.some(item => item.humanDecision === "REJECTED"), false, "recusada não entra como evidência");

  /* E uma recusada empurrada para dentro da camada é recusada na montagem. */
  assert.throws(
    () => montar(analiseYoutube(), {
      specialist: { ...(camada as object), items: [{ requirementId: "r3", humanDecision: "REJECTED", originalText: "Não serve.", quote: null, provenance: { receivedAt: "2026-09-14T08:10:00.000Z" } }] } as never,
    }),
    /RADAR_SPECIALIST_EVIDENCE_WITHOUT_HUMAN_DECISION/,
  );
  /* A recusa continua CONTADA: ausência declarada é dado. */
  assert.equal(entregue.rejected, 1);
});

/* ================================ K ================================ */

test("K · hash do ArticleDNA diferente bloqueia o handoff", () => {
  const resultado = montar(analiseAmazon(), { competitiveBlueprint: blueprintAmazon() });
  assert.equal(resultado.ok, true);
  if (!resultado.ok) return;

  /*
   * §2 · A MESMA VERSÃO COM OUTRO CONTEÚDO É O CASO QUE INTERESSA.
   *
   * Comparar só a versão deixaria passar exatamente a edição silenciosa do
   * ArticleDNA — e o Planejador planejaria um artigo que já é outro.
   */
  const outroFundamento = { ...FUNDAMENTO, articleDnaContentHash: "sha256:mudou" };
  const vinculo = radarEvidenceBundleMatchesArticle(resultado.bundle, outroFundamento);
  assert.equal(vinculo.matches, false);
  assert.match(vinculo.reason, /conteúdo do ArticleDNA mudou/);

  const prontidao = radarPlannerHandoffReadiness({ article: outroFundamento, frozen: null, dossier: resultado.bundle });
  assert.equal(prontidao.ready, false);
  assert.deepEqual(prontidao.blocks.map(item => item.code), ["ARTICLE_HASH_MISMATCH"]);

  /* E versão diferente bloqueia por outro código, não pelo mesmo. */
  const outraVersao = radarPlannerHandoffReadiness({
    article: { ...FUNDAMENTO, articleDnaVersionId: "dna-v4" },
    frozen: null, dossier: resultado.bundle,
  });
  assert.deepEqual(outraVersao.blocks.map(item => item.code), ["ARTICLE_VERSION_MISMATCH"]);
});

/* ================================ L ================================ */

const fonteCanonica = await readFile(new URL("../lib/server/radar-canonical-dossier.ts", import.meta.url), "utf8");

test("L · frozen vence live — o dossiê lê a fotografia, nunca o recálculo", () => {
  const fonte = semComentarios(fonteDoRuntime);

  /* O runtime só conhece os campos CONGELADOS de cada perfil. */
  assert.match(fonte, /analise\.amazonFrozenInvestigation/);
  assert.match(fonte, /analise\.youtubeFrozenInvestigation/);
  assert.match(fonte, /analise\.finalizedBundle/);
  assert.equal(
    /analise\.amazonBlueprint|analise\.youtubeSearch|analise\.amazonSearch\b/.test(fonte),
    false,
    "nenhuma leitura viva alimenta o dossiê",
  );

  /* E o perfil primário é decidido pela fotografia, não pelo seletor da tela. */
  assert.equal(radarPrimaryProfileOfAnalysis({ amazonSearch: corridaAmazon() }), null, "coleta sem fotografia não é investigação finalizada");
  assert.equal(radarPrimaryProfileOfAnalysis(analiseAmazon()), "AMAZON");
  assert.equal(radarPrimaryProfileOfAnalysis(analiseYoutube()), "YOUTUBE");

  /*
   * ====== A RESOLUÇÃO MUDOU DE CASA EM PORTABLE_EXPORT_1 · §16 ======
   *
   * A cadeia "perfil → blueprint canônico → dossiê → prontidão" saiu de
   * `radar-planner-send` e virou módulo próprio, porque o export portátil
   * precisa do MESMO resultado com o MESMO hash — e dois trechos iguais
   * divergem na primeira correção feita só num deles.
   *
   * A invariante não mudou: quem resolve o dossiê não passa leitura viva.
   */
  const canonico = semComentarios(fonteCanonica);
  assert.match(canonico, /amazonBlueprint: null/, "a resolução não passa blueprint vivo à autoridade de leitura");
  assert.match(canonico, /liveBlueprint: null/);
  assert.match(canonico, /liveMultimodal: null/);

  /* E o envio passou a consumir essa resolução, em vez de repeti-la. */
  const envio = semComentarios(fonteDoEnvio);
  assert.match(envio, /resolveRadarCanonicalDossier\(\{/, "o envio usa a resolução canônica");
  assert.equal(/radarCompetitiveBlueprintViewOfAnalysis\(\{/.test(envio), false, "e não remonta o blueprint por conta própria");
});

/* ============================== M e N ============================== */

test("M e N · nem SERP crua nem universo competitivo entram no dossiê", () => {
  const amazon = montar(analiseAmazon(), { competitiveBlueprint: blueprintAmazon() });
  const youtube = montar(analiseYoutube());
  assert.equal(amazon.ok && youtube.ok, true);
  if (!amazon.ok || !youtube.ok) return;

  for (const [nome, bundle] of [["amazon", amazon.bundle], ["youtube", youtube.bundle]] as const) {
    const serializado = JSON.stringify(bundle);

    /*
     * ============ §15 · A CONFERÊNCIA É NO SERIALIZADO ============
     *
     * É a forma em que o dossiê realmente atravessa a rede e chega ao banco. A
     * auditoria já mediu o preço de esquecer isso: 126.656 de 144.440 bytes de
     * uma fotografia eram a coleta copiada byte a byte.
     */
    assert.equal(serializado.includes('"universe"'), false, `${nome}: universo copiado`);
    assert.equal(serializado.includes('"results"'), false, `${nome}: resultados crus copiados`);
    assert.equal(serializado.includes('"organicResults"'), false, `${nome}: SERP crua copiada`);
    assert.equal(serializado.includes('"peopleAlsoAsk"'), false, `${nome}: bloco cru do Google copiado`);
    assert.equal(serializado.includes('"transcript"'), false, `${nome}: transcript inteiro copiado`);
  }

  /* Nenhum ASIN da coleta viaja: o que viaja é a referência da corrida. */
  const serializadoAmazon = JSON.stringify(amazon.bundle);
  for (const produto of corridaAmazon().universe.slice(0, 5)) {
    assert.equal(serializadoAmazon.includes(`"${produto.asin}"`), false, `o ASIN ${produto.asin} entrou no dossiê`);
  }

  /* E a referência da corrida está lá, que é o ponto. */
  assert.equal(amazon.bundle.research.amazon?.refs[0].ref, "run-amz-1");
  assert.equal(amazon.bundle.research.amazon?.refs[0].fingerprint, corridaAmazon().fingerprint.signature);

  /* §15 · a medida, para o relatório do gate. */
  assert.ok(serializadoAmazon.length < 60_000, `dossiê grande demais: ${serializadoAmazon.length} bytes`);
});

/* ================================ O ================================ */

test("O · handoff repetido é idempotente — mesmo conteúdo, mesma identidade", () => {
  const primeiro = montar(analiseAmazon(), { competitiveBlueprint: blueprintAmazon() });
  const segundo = montar(analiseAmazon(), { competitiveBlueprint: blueprintAmazon() });
  assert.equal(primeiro.ok && segundo.ok, true);
  if (!primeiro.ok || !segundo.ok) return;

  assert.equal(segundo.bundle.bundleHash, primeiro.bundle.bundleHash);
  assert.equal(segundo.bundle.bundleId, primeiro.bundle.bundleId);

  /*
   * E uma investigação que mudou DE VERDADE produz outra identidade — é assim
   * que a versão sobe em vez de sobrescrever a entrega anterior em silêncio.
   */
  const comApoio = montar(analiseYoutube());
  if (comApoio.ok) assert.notEqual(comApoio.bundle.bundleHash, primeiro.bundle.bundleHash);

  const envio = semComentarios(fonteDoEnvio);
  assert.match(envio, /const mesmoDossie = Boolean\(anterior && anterior\.bundleHash === bundle\.bundleHash\)/);
  assert.match(envio, /Pacote já estava disponível no Planejador\./);
  /*
   * A CONFERÊNCIA ACONTECE ANTES DE QUALQUER ESCRITA.
   *
   * Invertê-la criaria uma versão de análise por clique, e o Planejador veria
   * N entregas onde houve uma.
   */
  /*
   * A ORDEM É MEDIDA DENTRO DO SERVIÇO.
   *
   * As portas declaram `appendAnalysis` no topo do arquivo; procurar do zero
   * acharia a declaração, não a chamada — e o teste mediria a ordem do módulo
   * em vez da ordem dos passos.
   */
  const servico = envio.slice(envio.indexOf("export async function sendRadarToPlanner"));
  assert.ok(servico.indexOf("const mesmoDossie") < servico.indexOf("portas.appendAnalysis("));
  assert.match(envio, /if \(!mesmoDossie\) \{/, "a regravação é guardada pela conferência");
});

/* ================================ P ================================ */

test("P · sem readback remoto não há sucesso", () => {
  const envio = semComentarios(fonteDoEnvio);

  /*
   * §19 · "O CLIENTE MUDOU DE ESTADO" NÃO É ENTREGA.
   *
   * A releitura vem DEPOIS da escrita e ANTES do retorno, e revalida
   * identidade, vínculo e integridade — o hash é recalculado sobre o conteúdo
   * inteiro, porque uma checagem de forma aceitaria um pacote trocado no
   * caminho.
   */
  const posEscrita = envio.slice(envio.indexOf("appendAnalysis"));
  assert.match(posEscrita, /loadRadarState/);
  assert.match(posEscrita, /radar_handoff_readback_failed/);
  assert.match(posEscrita, /assertRadarEvidenceBundleIntegrity\(conferido\)/);
  assert.match(posEscrita, /radarEvidenceBundleMatchesArticle\(conferido, article\)/);
  assert.ok(posEscrita.indexOf("readbackConfirmed") === -1, "quem declara o readback é a rota, sobre o retorno do serviço");

  const rota = semComentarios(fonteDaRota);
  assert.match(rota, /readbackConfirmed: true/);
  /* A rota não inventa sucesso: ela só o repassa depois do serviço retornar. */
  assert.ok(rota.indexOf("sendRadarBundleToPlanner") < rota.indexOf("readbackConfirmed"));
});

/* ================================ Q ================================ */

test("Q · F5 e outra sessão continuam vendo 'Enviado ao Redator'", () => {
  const pagina = semComentarios(fonteDaPagina);

  /*
   * §26 · O ESTADO VEM DO SERVIDOR.
   *
   * `analiseCorrenteDe(row).writerBundle` é a versão gravada da análise: F5 a
   * relê e outra sessão lê a mesma coisa. Guardar isso no navegador faria duas
   * pessoas verem entregas diferentes do mesmo artigo.
   */
  /*
   * O RECIBO DEIXOU DE SER UMA VERSÃO DE ANÁLISE.
   *
   * Gravá-lo reescrevia ~9,77 MB a cada entrega, e o Postgres cancelava com
   * 57014. Quem responde "foi entregue?" é a esteira, que o servidor move só
   * depois de confirmar o documento no readback — continua sendo prova remota,
   * e não estado desta aba.
   */
  assert.match(pagina, /const noRedator = row \? row\.state === "sent_writer" : false;/);
  assert.match(pagina, /sent: noRedator,/);

  const fatia = pagina.slice(pagina.indexOf("const fronteiraDoRedator"), pagina.indexOf("const enviarAoRedator"));
  assert.equal(/localStorage|sessionStorage/.test(fatia), false, "§26 · sem armazenamento local");

  const workbench = semComentarios(fonteDaWorkbench);
  assert.ok(workbench.includes('data-testid="radar-writer-sent"'));
  assert.equal(/localStorage/.test(workbench), false);
});

/* ================================ R ================================ */

test("R · o Planejador recebe ArticleDNA + V3, não um pacote falso do Google", () => {
  const envio = semComentarios(fonteDoEnvio);

  /*
   * §17 · NENHUM FALLBACK FABRICADO.
   *
   * O caminho legado exigia `SerpResearchSnapshot` do Google. Inventar um para
   * um artigo de vídeo entregaria ao Planejador uma proveniência que não aponta
   * para lugar nenhum.
   */
  assert.equal(/buildRadarPlannerPackage|SerpResearchSnapshot|serpSnapshot:\s*\{/.test(envio), false);

  /* §18 · o vínculo é REFERÊNCIA ao ArticleDNA, nunca cópia mutável dele. */
  assert.match(envio, /articleDnaVersionId: article\.versionId/);
  assert.match(envio, /articleDnaContentHash: article\.contentHash/);
  assert.equal(/articleDna:\s*article\.payload|\.\.\.article\.payload/.test(envio), false, "o ArticleDNA não é copiado para dentro do dossiê");

  /* §16 · UM builder. Não existem três handoffs paralelos. */
  const runtime = semComentarios(fonteDoRuntime);
  assert.equal(/buildGooglePlannerPackage|buildYoutubePlannerPackage|buildAmazonPlannerPackage/.test(runtime + envio), false);
  assert.match(runtime, /buildRadarEvidenceBundleV3\(\{/);
  assert.equal((runtime.match(/buildRadarEvidenceBundleV3\(/g) || []).length, 1, "uma montagem só");
});

/* ======================= §11 · a hierarquia única ======================= */

test("§11 · a ordem de autoridade é reutilizada, não recriada", () => {
  assert.deepEqual([...RADAR_EVIDENCE_HIERARCHY], [
    "ARTICLE_INVARIANT",
    "PRIMARY_FACTUAL_EVIDENCE",
    "QUALIFIED_SPECIALIST",
    "CURRENT_SUFFICIENT_SERP",
    "OTHER_RADAR_EVIDENCE",
    "ARTICLE_DNA_HYPOTHESIS",
    "AI_INTERPRETATION",
    "DETERMINISTIC_HEURISTIC",
    "GENERIC_EDITORIAL_SUGGESTION",
  ]);

  /* Nenhuma segunda hierarquia nasceu neste gate. */
  for (const fonte of [semComentarios(fonteDoRuntime), semComentarios(fonteDoEnvio)]) {
    assert.equal(/AUTHORITY_ORDER\s*=|authorityRank\s*=/.test(fonte), false);
  }
});

/* ==================== §4 · uma primária, e só uma ==================== */

test("§4 · o contrato recusa duas camadas primárias e saída sem origem", () => {
  const base = montar(analiseYoutube());
  assert.equal(base.ok, true);
  if (!base.ok) return;

  const duasPrimarias = {
    ...base.bundle,
    research: { ...base.bundle.research, google: { ...base.bundle.research.google!, role: "PRIMARY" as const } },
  };
  assert.throws(
    () => buildRadarEvidenceBundleV3(semIdentidade(duasPrimarias)),
    /RADAR_EVIDENCE_BUNDLE_DUPLICATE_PRIMARY_LAYER/,
  );

  const semPrimaria = { ...base.bundle, research: { google: base.bundle.research.google, youtube: null, amazon: null } };
  assert.throws(
    () => buildRadarEvidenceBundleV3(semIdentidade(semPrimaria)),
    /RADAR_EVIDENCE_BUNDLE_PRIMARY_LAYER_MISSING/,
  );

  const saidaOrfa = { ...base.bundle, editorialOutputs: [{ output: "ARTICLE", objective: "x", reason: "y", sourceSignals: [] }] };
  assert.throws(
    () => buildRadarEvidenceBundleV3(semIdentidade(saidaOrfa)),
    /RADAR_EVIDENCE_BUNDLE_OUTPUT_WITHOUT_SOURCE/,
  );
});

function semIdentidade(bundle: RadarEvidenceBundle) {
  const { bundleVersion: _v, bundleId: _id, bundleHash: _hash, ...resto } = bundle;
  return resto;
}

/* ==================== §20 · a identidade do conteúdo ==================== */

test("§20 · a identidade muda quando o conteúdo muda, e o relógio não a move", () => {
  const base = montar(analiseYoutube());
  assert.equal(base.ok, true);
  if (!base.ok) return;

  /* Adulterar o conteúdo e manter a identidade não passa pela verificação. */
  const adulterado = { ...base.bundle, limitations: [] };
  /* O id é conferido primeiro; qualquer um dos dois já denuncia a adulteração. */
  assert.throws(() => assertRadarEvidenceBundleIntegrity(adulterado), /RADAR_EVIDENCE_BUNDLE_(ID_)?MUTATED/);

  /* E a identidade é do conteúdo: ela não conhece o id nem o hash anteriores. */
  /* `bundleVersion` faz parte do conteúdo assinado — tirá-la mudaria o hash. */
  const { bundleId: _id, bundleHash: _hash, ...conteudo } = base.bundle;
  const recalculada = radarEvidenceBundleIdentity(conteudo);
  assert.equal(recalculada.bundleHash, base.bundle.bundleHash);
});

test("sentinela · PROVIDER_CALLS = 0", () => {
  assert.deepEqual(tentativasDeRede, []);
});

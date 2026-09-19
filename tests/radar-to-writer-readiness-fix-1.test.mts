import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { sendRadarToWriter, type RadarWriterHandoffPorts } from "../lib/server/radar-writer-send.ts";
import { resolveRadarCanonicalDossier } from "../lib/server/radar-canonical-dossier.ts";
import type { RadarCanonicalAuthorities } from "../lib/server/radar-canonical-authorities.ts";
import { RadarAnalysisPayloadSchema } from "../lib/radar/analysis-contracts.ts";
import { RadarYoutubeSearchRunSchema } from "../lib/radar/youtube-search-run.ts";
import { buildRadarYoutubeBlueprint } from "../lib/radar/youtube-blueprint.ts";
import { getRadarR4BulkEligibility, type RadarR4BulkArticleSnapshot } from "../lib/radar/r4-queue.ts";
import type { ContentDocument } from "../lib/arquiteto/contracts.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";

/*
 * ===== RADAR_TO_WRITER_READINESS_FIX_1 · A RECUSA QUE PEDIA O IMPOSSÍVEL =====
 *
 * ==================== O DEFEITO ====================
 *
 * Clicar em "Enviar ao Redator" num artigo com investigação FINALIZADA
 * respondia:
 *
 *   "Somente investigação aprovada entra no Redator. Aprove o Radar antes de
 *    enviar."
 *
 * O servidor exigia `editorial_workflow_items.state === "approved"`. Esse
 * estado é da ESTEIRA, e o fluxo operacional vigente nunca o produz: a linha
 * nasce `research_pending` e nem START, nem ANALYZE, nem FINALIZE a movem.
 * `approved` só existia no fluxo ANTIGO por abas, com o botão "Aprovar SERP" —
 * um botão que a tela atual não tem.
 *
 * A pessoa era mandada procurar uma aprovação que não existe, num artigo que
 * já estava pronto.
 *
 * ==================== A AUTORIDADE CORRETA ====================
 *
 * A mesma que o Radar já usa para dizer "concluída": a prontidão canônica do
 * dossiê — perfil resolvido a partir da fotografia congelada, bundle V3
 * íntegro e vínculo com o ArticleDNA corrente.
 *
 * Não existe segunda aprovação. PROVIDER_CALLS = 0 e AI_CALLS = 0.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const HASH = `sha256:${"a".repeat(64)}`;
const PRINCIPAL = "skincare para pele oleosa";

const FUNDAMENTO = {
  brandId: "marca-1", articleId: "artigo-1",
  articleDnaVersionId: "dna-v3", articleDnaContentHash: HASH,
};

const contexto = (): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: {
    brandId: "marca-1", articleId: "artigo-1",
    articleDnaVersionId: "dna-v3", articleDnaContentHash: HASH,
    promise: "Como cuidar da pele oleosa", mainIntent: "informacional", hierarchy: "Suporte",
  },
  keywords: [{
    identity: { keywordId: "kw-1", text: PRINCIPAL, role: "principal" },
    strategy: { volume: 720, resultCount: 41000, kgrScore: 0.589, incrementalVolume: null, normalizedIntent: "informacional", coveredIntentions: [], strategicContribution: null, purpose: null, overlapRisk: null, semanticQualification: null },
    resolution: "FULL",
    provenance: { textSource: "hydration", strategySource: "article_reference" },
  }],
  editorialTopics: [], resolvedKeywordTexts: [PRINCIPAL],
  silo: { siloId: "silo-1", siloName: "skincare", articleRole: "SUPORTE" },
  formationSerp: null, internalLinks: null, limitations: [],
} as unknown as RadarArticleResearchContext);

const AUTORIDADES: RadarCanonicalAuthorities = {
  google: null, video: null, specialist: null, researchContext: contexto(),
};

const blueprintDoYoutube = () => buildRadarYoutubeBlueprint({
  run: RadarYoutubeSearchRunSchema.parse({
    researchMode: "YOUTUBE", runId: "run-yt-1", runVersion: 1,
    startedAt: "2026-09-14T09:00:00.000Z", startedBy: "user-1", state: "COLLECTED",
    fingerprint: { articleId: "artigo-1", articleDnaVersionId: "dna-v3", articleDnaContentHash: HASH, queryIds: ["ytq:1"], signature: "yt" },
    provenance: { provider: "dataforseo", endpoint: "/yt", queriesRequested: 1, queriesSucceeded: 1, queriesFailed: 0, collectedAt: "2026-09-14T09:00:00.000Z" },
    queries: [], results: [], universe: [], limitations: [],
  }),
  declaredIntent: "informacional", editorialTopics: [], generatedAt: "2026-09-14T10:00:00.000Z",
});

/**
 * A ANÁLISE — com a fotografia congelada, ou sem ela.
 *
 * `legado` reproduz o artigo entregue ao Planejador ANTES da mudança de
 * destino: ele tem `plannerBundle` gravado e nenhum `writerBundle`.
 */
const analiseDoArtigo = (opcoes: { finalizada?: boolean; legado?: boolean; googleCorrompido?: boolean } = {}) => {
  const base = RadarAnalysisPayloadSchema.parse({
    schemaVersion: 1, brandId: "marca-1", articleId: "artigo-1", articleDnaVersionId: "dna-v3",
    serpSnapshotId: "serp-9", serpSnapshotVersion: 1, serpSnapshotHash: "sha256:serp",
    serpDecisions: [], selectedCompetitorIds: [], extractionIds: [], extractions: [], extractionFailures: [],
    verifiedSources: [], sourceVerificationFailures: [], deepResearch: null, researchTarget: null,
    supportResearch: null, researchPackage: null, amazonSearch: null, amazonBlueprint: null,
    amazonFrozenInvestigation: null, youtubeSearch: null, youtubeFrozenInvestigation: null,
    finalizedBundle: null, benchmark: null, semanticTerms: [], structuralDecisions: [],
    competitiveness: null, keywordDecisions: [], competitiveReport: null,
    plannerPackage: null, plannerTransfer: null, plannerBundle: null,
    writerBundle: null, writerTransfer: null,
    researchTransport: "FULL", mode: "kgr_light",
    modeRecommendation: { suggestedMode: "kgr_light", reasons: ["fixture"], confidence: "low", ruleSource: "minerador_kgr_strict" },
    /*
     * `status: "draft"` DE PROPÓSITO — é o estado da análise no fluxo vigente.
     *
     * A aprovação do relatório é do fluxo antigo. Se a entrega dependesse dela,
     * este teste falharia — e é exatamente isso que ele existe para impedir.
     */
    modeHumanReason: "", status: "draft", humanNotes: [], approvedAt: null, approvedBy: null,
  });

  /*
   * ===== A FOTOGRAFIA DO GOOGLE QUE NÃO PASSA NA INTEGRIDADE =====
   *
   * Ela EXISTE — então o perfil resolve e o dossiê é montado. O que ela não
   * faz é bater com o próprio hash. É o caso em que `ok: true` e
   * `readiness.ready: false` convivem, e é ele que prova que a prontidão
   * canônica ainda bloqueia sozinha.
   */
  if (opcoes.googleCorrompido) {
    return {
      versionId: "analysis-1", entityId: "radar-analysis:artigo-1", versionNumber: 1,
      previousVersionId: null, contentHash: "sha256:analysis", origin: "human" as const,
      changeReason: "fixture", createdAt: "2026-09-15T12:00:00.000Z", createdBy: "user-1",
      payload: {
        ...base,
        finalizedBundle: {
          frozenAt: "2026-09-10T13:00:00.000Z", frozenBy: "user-1",
          limitations: ["fotografia sem hash conferível"],
        },
      } as typeof base,
    };
  }

  const fotografia = opcoes.finalizada === false ? {} : {
    youtubeFrozenInvestigation: {
      frozenVersion: 1, finalizedAt: "2026-09-14T10:00:00.000Z", finalizedBy: "user-1",
      runRef: { runId: "run-yt-1", runVersion: 1, runFingerprint: "yt", collectedAt: "2026-09-14T09:00:00.000Z", provider: "dataforseo", endpoint: "/yt", queriesExecuted: 3, universeSize: 38, selectedVideoIds: [] },
      run: null, blueprint: blueprintDoYoutube(), multimodal: null,
      limitations: ["O gancho interno dos vídeos não foi observado."],
    },
  };

  const legado = opcoes.legado
    ? {
      plannerBundle: {
        bundleVersion: 3, bundleId: "bundle-antigo", bundleHash: "sha256:antigo",
        primaryResearchProfile: "YOUTUBE", binding: { ...FUNDAMENTO },
        handoffVersion: 1, sentAt: "2026-09-01T10:00:00.000Z", sentBy: "user-1",
        previousBundleHash: null, plannerMayNot: [], bundle: {},
      },
      plannerTransfer: {
        sourceAnalysisVersionId: "analysis-0", sourceAnalysisVersionNumber: 1,
        sentAt: "2026-09-01T10:00:00.000Z", sentBy: "user-1",
      },
    }
    : {};

  return {
    versionId: "analysis-1", entityId: "radar-analysis:artigo-1", versionNumber: 1,
    previousVersionId: null, contentHash: "sha256:analysis", origin: "human" as const,
    changeReason: "fixture", createdAt: "2026-09-15T12:00:00.000Z", createdBy: "user-1",
    payload: { ...base, ...fotografia, ...legado } as typeof base,
  };
};

const ARTICLE_DNA = {
  versionId: "dna-v3", entityId: "artigo-1", versionNumber: 3, previousVersionId: null,
  contentHash: HASH, origin: "human" as const, changeReason: "fixture",
  createdAt: "2026-09-01T10:00:00.000Z", createdBy: "user-1",
  payload: {
    brandId: "marca-1", articleId: "artigo-1", siloId: "silo-1",
    promise: "Como cuidar da pele oleosa", suggestedSlug: "cuidados-pele-oleosa",
    mainIntent: "informacional", hierarchy: "Suporte", principalKeywordId: "kw-1",
    keywordReferences: [{ keywordId: "kw-1", role: "principal", keywordDnaVersionId: "kw-v1", keywordDnaContentHash: `sha256:${"1".repeat(64)}` }],
  },
};

async function enviar(opcoes: {
  estadoDoRadar?: string;
  finalizada?: boolean;
  legado?: boolean;
  googleCorrompido?: boolean;
  fundamento?: typeof FUNDAMENTO;
  fundamentoDepois?: typeof FUNDAMENTO;
} = {}) {
  const analises = [analiseDoArtigo({ finalizada: opcoes.finalizada, legado: opcoes.legado, googleCorrompido: opcoes.googleCorrompido })];
  const radar = {
    id: "wf-radar-1", marca_id: "marca-1", article_id: "artigo-1", stage: "radar",
    state: opcoes.estadoDoRadar || "research_pending", lock_version: 1,
    payload: { title: "Artigo", slug: "cuidados-pele-oleosa" },
    source_version_id: "dna-v3", source_content_hash: HASH,
    created_at: "2026-09-01T10:00:00.000Z", updated_at: "2026-09-01T10:00:00.000Z",
  };

  let leiturasDoFundamento = 0;
  let gravada: unknown = null;
  let documento: ContentDocument | null = null;
  const chamadas: string[] = [];

  const portas: RadarWriterHandoffPorts = {
    loadCanonicalAuthorities: async () => AUTORIDADES,
    loadRadarState: async () => ({ lockVersion: 1, analyses: (gravada ? [...analises, gravada] : analises) as never }),
    loadArticleFoundation: async () => {
      leiturasDoFundamento += 1;
      if (leiturasDoFundamento > 1 && opcoes.fundamentoDepois) return opcoes.fundamentoDepois;
      return opcoes.fundamento || FUNDAMENTO;
    },
    loadArticleIdentity: async () => ({ article: ARTICLE_DNA as never, silo: null }),
    findWorkflowItem: async () => radar as never,
    findDocument: async () => documento,
    createDocument: async ({ document }) => { chamadas.push("createDocument"); documento = document; },
    transitionRadar: async () => { chamadas.push("transitionRadar"); },
    appendDecision: async () => { chamadas.push("appendDecision"); },
  };

  const resultado = await sendRadarToWriter({
    brandId: "marca-1", articleId: "artigo-1", actorId: "user-1",
    sentAt: "2026-09-17T12:00:00.000Z",
  }, portas);

  return { resultado, chamadas, documento: documento as ContentDocument | null };
}

const prontidao = (opcoes: { finalizada?: boolean; googleCorrompido?: boolean; fundamento?: typeof FUNDAMENTO } = {}) => {
  const resultado = resolveRadarCanonicalDossier({
    analysis: analiseDoArtigo({ finalizada: opcoes.finalizada, googleCorrompido: opcoes.googleCorrompido }) as never,
    article: opcoes.fundamento || FUNDAMENTO,
    observedAt: "2026-09-17T12:00:00.000Z",
    authorities: AUTORIDADES,
  });
  return resultado;
};

/* ================================= A ================================= */

test("A · artigo finalizado ANTES da mudança de destino continua reconhecido", async () => {
  /*
   * ===== §5 · NINGUÉM FINALIZA DUAS VEZES =====
   *
   * Este artigo foi investigado, finalizado e entregue ao Planejador no fluxo
   * antigo: ele tem `plannerBundle` gravado, `plannerTransfer` e a linha da
   * esteira em `sent_planner`.
   *
   * Exigir que ele seja finalizado de novo custaria uma coleta paga para
   * reproduzir evidência que já existe — e a evidência congelada não muda.
   */
  const { resultado, documento } = await enviar({ legado: true, estadoDoRadar: "sent_planner" });

  assert.equal(resultado.change, "CREATED");
  assert.ok(documento, "o artigo histórico não gerou documento");
  assert.equal(resultado.record.primaryResearchProfile, "YOUTUBE");
});

/* ================================= B ================================= */

test("B · artigo finalizado pelo fluxo vigente é reconhecido, com a linha em research_pending", async () => {
  /*
   * O ESTADO REAL DE UM ARTIGO FINALIZADO HOJE.
   *
   * `START → ANALYZE → FINALIZE` não move a esteira. Se a entrega dependesse
   * dela, NENHUM artigo do fluxo atual passaria — que é exatamente o defeito
   * relatado.
   */
  const { resultado, documento } = await enviar({ estadoDoRadar: "research_pending" });
  assert.equal(resultado.change, "CREATED");
  assert.ok(documento);
});

/* ================================= C ================================= */

test("C · investigação não finalizada continua bloqueada, com o motivo real", async () => {
  await assert.rejects(
    () => enviar({ finalizada: false }),
    (erro: Error & { code?: string }) => {
      assert.equal(erro.code, "radar_research_not_finalized");
      assert.match(erro.message, /Finalize a investigação antes de enviar ao Redator/);
      /* E o motivo NÃO manda aprovar o que já está aprovado. */
      assert.equal(/Aprove o Radar/.test(erro.message), false);
      return true;
    },
  );

  const resolvido = prontidao({ finalizada: false });
  assert.equal(resolvido.ok, false);
});

/* ================================ D, E, F ================================ */

test("D, E e F · a entrega não olha o perfil — ela olha a finalização", async () => {
  /*
   * O SERVIÇO É CEGO AO PERFIL, e é isso que estende este gate aos três.
   *
   * Google, YouTube e Amazon congelam em campos diferentes; quem lê a
   * fotografia e resolve o perfil é o dossiê canônico, uma vez só.
   */
  const servico = await readFile(new URL("../lib/server/radar-writer-send.ts", import.meta.url), "utf8");
  const semComentarios = servico.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
  assert.equal(/=== "GOOGLE"|=== "YOUTUBE"|=== "AMAZON"/.test(semComentarios), false,
    "o envio passou a decidir por perfil");

  /* E a prontidão dos três sai da MESMA função canônica. */
  const dossie = await readFile(new URL("../lib/server/radar-canonical-dossier.ts", import.meta.url), "utf8");
  assert.match(dossie, /radarPrimaryProfileOfAnalysis/);
  assert.match(semComentarios, /canonico\.dossier\.readiness|dossie\.readiness/);
});

/* ================================= G ================================= */

test("G · guard real continua bloqueando — ArticleDNA que muda no meio recusa", async () => {
  /*
   * NÃO AFROUXAR O QUE PROTEGE.
   *
   * O que este gate removeu foi uma condição sobre a ESTEIRA. A identidade do
   * ArticleDNA continua conferida DUAS vezes — antes de montar e antes de
   * entregar —, porque entre elas houve uma escrita e duas idas ao banco.
   *
   * Criar o documento sobre um fundamento que mudou faria o Redator escrever
   * sobre evidência de um artigo que já é outro.
   */
  await assert.rejects(
    () => enviar({ fundamentoDepois: { ...FUNDAMENTO, articleDnaVersionId: "dna-v9" } }),
    (erro: Error & { code?: string }) => {
      assert.equal(erro.code, "radar_handoff_blocked_stale");
      return true;
    },
  );

  /* E a prontidão canônica continua sendo a autoridade do resto. */
  const resolvido = prontidao();
  assert.equal(resolvido.ok, true);
  if (resolvido.ok) assert.equal(resolvido.dossier.readiness.ready, true);
});

test("G · a prontidão canônica bloqueia sozinha — investigação resolvida, porém não íntegra", async () => {
  /*
   * ===== O GUARD QUE SUBSTITUIU A CONDIÇÃO DA ESTEIRA =====
   *
   * Aqui a fotografia EXISTE: o perfil resolve, o dossiê é montado e
   * `resolveRadarCanonicalDossier` devolve `ok: true`. O que não passa é a
   * integridade — e é a prontidão, sozinha, que recusa.
   *
   * Sem este caso, remover o `if (!prontidao.ready)` não quebraria nada: o
   * gate teria trocado uma condição inútil por nenhuma condição.
   */
  const resolvido = prontidao({ googleCorrompido: true });
  assert.equal(resolvido.ok, true, "a fotografia corrompida precisa RESOLVER para o caso existir");
  if (resolvido.ok) {
    assert.equal(resolvido.dossier.readiness.ready, false, "a prontidão deixou passar um pacote não íntegro");
    assert.ok(resolvido.dossier.readiness.blocks.length > 0, "o bloqueio precisa dizer o motivo");
  }

  await assert.rejects(
    () => enviar({ googleCorrompido: true }),
    (erro: Error & { code?: string; readiness?: { blocks: unknown[] } }) => {
      assert.equal(erro.code, "radar_handoff_blocked");
      /* E o motivo real viaja para a tela, em vez de "aprove o Radar". */
      assert.ok((erro.readiness?.blocks.length || 0) > 0);
      assert.equal(/Aprove o Radar/.test(erro.message), false);
      return true;
    },
  );
});

test("G · a tela informa ao lote a finalização CANÔNICA, e não uma constante", async () => {
  /*
   * A BARRA PERGUNTA AO DOMÍNIO, e o domínio responde a partir da fotografia.
   *
   * Uma tela que informasse `false` fixo deixaria a barra bloqueada para
   * sempre; uma que informasse `true` fixo ofereceria o que o servidor
   * recusa. Nos dois casos a barra e o botão diriam coisas diferentes sobre o
   * mesmo artigo.
   */
  const pagina = await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  assert.ok(pagina.includes("researchFinalized: Boolean(radarPrimaryProfileOfAnalysis("),
    "a finalização informada ao lote deixou de vir da fotografia");
  assert.equal(/researchFinalized: (true|false)/.test(pagina), false,
    "a finalização informada ao lote virou constante");
});

/* ================================= H ================================= */

test("H · a entrega não depende de nada do Planejador", async () => {
  const servico = await readFile(new URL("../lib/server/radar-writer-send.ts", import.meta.url), "utf8");
  const semComentarios = servico.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

  for (const proibido of ["sendRadarToPlanner", "importRadarToPlanner", "plannerBundle", "plannerItem", "sent_planner"]) {
    assert.equal(semComentarios.includes(proibido), false, `o envio ainda conhece ${proibido}`);
  }

  /* E um artigo que nunca passou pelo Planejador atravessa igual. */
  const { resultado } = await enviar({ legado: false });
  assert.equal(resultado.change, "CREATED");
});

/* ================================= I ================================= */

test("I · não existe segunda aprovação — nem no serviço, nem na barra do lote", async () => {
  const servico = await readFile(new URL("../lib/server/radar-writer-send.ts", import.meta.url), "utf8");
  const semComentarios = servico.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

  /*
   * A RECUSA QUE ESTE GATE APAGOU não pode voltar por outro nome.
   */
  assert.equal(/radar_not_approved/.test(semComentarios), false, "a recusa por esteira voltou");
  assert.equal(/Aprove o Radar/.test(servico), false, "a mensagem impossível voltou");
  assert.equal(/state !== "approved"/.test(semComentarios), false, "a condição de esteira voltou");

  /*
   * E O LOTE PERGUNTA A MESMA COISA QUE O BOTÃO.
   *
   * A barra decidia por `reportApproved` — a aprovação do relatório do fluxo
   * ANTIGO. Um artigo finalizado hoje aparecia bloqueado nela enquanto o botão
   * individual o aceitava: duas respostas para a mesma pergunta.
   */
  const snapshot = (patch: Partial<RadarR4BulkArticleSnapshot>): RadarR4BulkArticleSnapshot => ({
    articleId: "artigo-1", keywordReady: true, serpCollected: true, serpReviewed: true,
    analysisStarted: true, reportGenerated: true, reportApproved: false,
    researchFinalized: true, sentToWriter: false, rowState: "research_pending",
    topicsState: "NOT_PREPARED", topicsReviewed: false,
    specialistState: "NOT_PREPARED", serpQueueState: null, amazonState: "AMAZON_NOT_APPLICABLE",
    ...patch,
  } as RadarR4BulkArticleSnapshot);

  const finalizado = getRadarR4BulkEligibility([snapshot({})], "writer");
  assert.deepEqual(finalizado.eligible, ["artigo-1"], "o lote bloqueou um artigo finalizado");

  const naoFinalizado = getRadarR4BulkEligibility([snapshot({ researchFinalized: false })], "writer");
  assert.deepEqual(naoFinalizado.blocked, ["artigo-1"], "o lote ofereceu um artigo não finalizado");

  const jaEntregue = getRadarR4BulkEligibility([snapshot({ sentToWriter: true })], "writer");
  assert.deepEqual(jaEntregue.alreadyDone, ["artigo-1"]);
});

/* ================================= J ================================= */

test("J · reler não muda a prontidão, e reler não entrega", async () => {
  /*
   * A PRONTIDÃO É FUNÇÃO DO QUE ESTÁ GRAVADO.
   *
   * Duas resoluções do mesmo estado devolvem o mesmo veredito e o mesmo hash.
   * Se F5 mudasse a resposta, a pessoa veria o botão aparecer e sumir sem ter
   * tocado em nada.
   */
  const primeira = prontidao();
  const segunda = prontidao();
  assert.equal(primeira.ok, true);
  assert.equal(segunda.ok, true);
  if (primeira.ok && segunda.ok) {
    assert.equal(primeira.dossier.readiness.ready, segunda.dossier.readiness.ready);
    assert.equal(primeira.dossier.bundle.bundleHash, segunda.dossier.bundle.bundleHash);
  }

  /* E a entrega continua sendo POST: nenhuma leitura a dispara. */
  const rota = await readFile(new URL("../app/api/editorial/radar-writer-handoff/route.ts", import.meta.url), "utf8");
  assert.equal(/export async function GET/.test(rota), false);
});

/* ============================== a sentinela ============================== */

test("PROVIDER_CALLS = 0 · AI_CALLS = 0 · RECOLLECTION = NO", () => {
  assert.deepEqual(idasAoServidor, [], `houve rede: ${idasAoServidor.join(" · ")}`);
});

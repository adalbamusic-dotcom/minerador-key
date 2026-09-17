import { OptimisticLockError } from "./editorial-db";
import { ArtifactRepository, WorkflowRepository } from "./editorial-repositories";
import { createRadarAnalysisContext, createRadarAnalysisSuccessor, VersionedRadarAnalysisSchema, type RadarAnalysisVersion } from "../radar/analysis-contracts";
import { radarDecideResearchSource, radarResearchPlanOfAnalysis, type RadarPrimarySearchMode } from "../radar/search-mode";
import { buildRadarYoutubeRunFingerprint, buildRadarYoutubeStartedRun, type RadarYoutubeQueryRecord, type RadarYoutubeSearchRun } from "../radar/youtube-search-run";
import type { ArticleDNA, VersionEnvelope } from "../arquiteto/contracts";

/**
 * ========= O START, NO SERVIDOR — YOUTUBE_SEARCH_1.4 · §1 =========
 *
 * ======================== POR QUE ISTO EXISTE ========================
 *
 * O 1.3 fez o contêiner neutro nascer — no CLIENTE. A rota paga continuava
 * podendo coletar num artigo virgem sem garantir o vaso remoto em que a corrida
 * seria persistida: um POST direto gastaria DataForSEO e o resultado não teria
 * onde ficar.
 *
 * Aqui o servidor passa a conseguir iniciar sozinho. Nenhuma etapa essencial
 * depende de o React ter rodado antes.
 *
 * ===================== A ORDEM É O CONTRATO — §4 =====================
 *
 *   ARTIGO VÁLIDO → CONTEXTO CONFIRMADO → MODO CONFIRMADO
 *   → CORRIDA COLLECTING CONFIRMADA → só então o provider.
 *
 * Cada seta é um `await` que pode falhar, e falhar em qualquer uma delas
 * significa PROVIDER_CALLS = 0. É por isso que este módulo devolve a corrida já
 * persistida e confirmada: quem chama não tem como inverter a ordem, porque não
 * recebe nada antes dela existir.
 *
 * ===================== TUDO INJETÁVEL, DE PROPÓSITO =====================
 *
 * As três portas — ler artigo, ler estado, gravar — entram por parâmetro. É o
 * que permite provar a ordem e cada modo de falha sem banco e sem rede, com a
 * MESMA função que roda em produção.
 */

export type RadarRadarState = {
  lockVersion: number;
  analyses: RadarAnalysisVersion[];
};

export type RadarStartPorts = {
  loadArticle: (input: { brandId: string; articleId: string }) => Promise<VersionEnvelope<ArticleDNA> | null>;
  loadRadarState: (input: { brandId: string; articleId: string }) => Promise<RadarRadarState | null>;
  appendAnalysis: (input: { brandId: string; articleId: string; expectedLock: number; analysis: RadarAnalysisVersion }) => Promise<void>;
};

export class RadarStartError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "RadarStartError";
    this.code = code;
    this.status = status;
  }
}

const correnteDe = (estado: RadarRadarState | null) =>
  estado?.analyses.length ? estado.analyses[estado.analyses.length - 1] : null;

/**
 * ============ §2 · O BOOTSTRAP É IDEMPOTENTE ============
 *
 * Se já existe contêiner, ele é REUSADO — nunca duplicado. E duas chamadas
 * concorrentes não produzem duas cadeias v1: a gravação é travada por
 * `lock_version`, então a segunda perde a corrida, relê, encontra o contêiner
 * que a primeira criou e segue com ele.
 *
 * Reler em vez de estourar é o comportamento certo AQUI, e só aqui: criar o
 * vaso duas vezes não é decisão humana nem gasto — é infraestrutura. O
 * compromisso de modo, logo abaixo, faz o oposto de propósito.
 */
export async function ensureRadarAnalysisContext(
  input: { brandId: string; articleId: string; actorId: string },
  ports: RadarStartPorts,
): Promise<{ analysis: RadarAnalysisVersion; lockVersion: number; created: boolean }> {
  for (let tentativa = 0; tentativa < 2; tentativa += 1) {
    const estado = await ports.loadRadarState({ brandId: input.brandId, articleId: input.articleId });
    if (!estado) throw new RadarStartError("radar_item_not_found", "Item Radar não encontrado para este artigo.", 404);

    const existente = correnteDe(estado);
    if (existente) return { analysis: existente, lockVersion: estado.lockVersion, created: false };

    const article = await ports.loadArticle({ brandId: input.brandId, articleId: input.articleId });
    if (!article) throw new RadarStartError("article_dna_not_found", "O ArticleDNA canônico deste artigo não foi encontrado para esta marca.", 404);

    const contexto = await createRadarAnalysisContext({ brandId: input.brandId, article, actorId: input.actorId });
    try {
      await ports.appendAnalysis({ brandId: input.brandId, articleId: input.articleId, expectedLock: estado.lockVersion, analysis: contexto });
    } catch (erro) {
      /* Outra sessão gravou primeiro: a próxima volta do laço relê e reusa. */
      if (erro instanceof OptimisticLockError) continue;
      throw erro;
    }

    /*
     * §1 · PASSO 4 — RELER E CONFIRMAR.
     *
     * A gravação ter voltado sem erro não é o mesmo que o contêiner estar
     * legível. Sem o readback, uma escrita aceita e não confirmada deixaria a
     * coleta paga acontecer contra um vaso que ninguém consegue ler.
     */
    const confirmado = await ports.loadRadarState({ brandId: input.brandId, articleId: input.articleId });
    const corrente = correnteDe(confirmado);
    if (!confirmado || !corrente) throw new RadarStartError("radar_context_readback_failed", "O contexto de trabalho do Radar não foi confirmado após a gravação.", 503);
    return { analysis: corrente, lockVersion: confirmado.lockVersion, created: corrente.versionId === contexto.versionId };
  }

  throw new RadarStartError("radar_context_contended", "O contexto de trabalho do Radar está sendo criado por outra sessão. Tente novamente.", 409);
}

/**
 * ============ §1 · O START INTEIRO, ANTES DO PROVIDER ============
 *
 * Devolve a corrida `COLLECTING` já persistida e RELIDA. Quem chama só recebe
 * permissão de gastar depois que tudo isto passou.
 */
export async function startRadarYoutubeRun(
  input: {
    brandId: string;
    articleId: string;
    articleDnaVersionId: string;
    actorId: string;
    queries: readonly RadarYoutubeQueryRecord[];
    limitations?: readonly string[];
    runId: string;
    startedAt: string;
  },
  ports: RadarStartPorts,
): Promise<{ run: RadarYoutubeSearchRun; analysis: RadarAnalysisVersion; currentMode: RadarPrimarySearchMode | null }> {
  /*
   * §1 · PASSO 2 — O ArticleDNA CANÔNICO É A ENTRADA.
   *
   * Ele é lido ANTES do contêiner porque é ele quem autoriza o START: sem
   * fundamento canônico não há o que pesquisar, e a versão que o cliente
   * afirmou tem de ser a que o banco tem. Comparar contra o contêiner seria
   * comparar contra uma cópia; comparar contra o artigo é comparar contra a
   * autoridade.
   */
  const article = await ports.loadArticle({ brandId: input.brandId, articleId: input.articleId });
  if (!article) throw new RadarStartError("article_dna_not_found", "O ArticleDNA canônico deste artigo não foi encontrado para esta marca.", 404);
  if (article.versionId !== input.articleDnaVersionId) {
    throw new RadarStartError("radar_article_dna_mismatch", "A versão do ArticleDNA enviada diverge da versão canônica do artigo.", 409);
  }

  const contexto = await ensureRadarAnalysisContext({ brandId: input.brandId, articleId: input.articleId, actorId: input.actorId }, ports);

  /*
   * §1 · PASSO 5 e 6 — O MODO SAI DO QUE ESTÁ GRAVADO.
   *
   * Nunca do corpo do pedido. É a mesma autoridade de domínio que a tela usa, e
   * ela recusa a TROCA lançando o conflito 409 — que sobe daqui sem virar
   * coleta.
   */
  /*
   * ============ 2.1 · PARTE B · A FONTE É ADITIVA; O ALVO NÃO ============
   *
   * A coleta da SERP do YouTube deixou de ser recusada por já existir outra
   * fonte. Um artigo que coletou o Google como APOIO continua podendo — e
   * precisando — coletar o YouTube, que é a fonte obrigatória do alvo de vídeo.
   *
   * O que continua imutável é o ALVO. Se este artigo já é de Google, esta
   * coleta entra como apoio e não o converte (§7).
   */
  const plano = radarResearchPlanOfAnalysis(contexto.analysis.payload);
  const decisao = radarDecideResearchSource({
    currentTarget: plano.primaryTarget,
    source: "YOUTUBE_SERP",
    intendedTarget: "YOUTUBE",
  });
  const currentMode = plano.primaryTarget;

  const anterior = contexto.analysis.payload.youtubeSearch;
  const run = buildRadarYoutubeStartedRun({
    runId: input.runId,
    /* Uma coleta nova SUCEDE a anterior; ela não a reescreve. */
    runVersion: (anterior?.runVersion || 0) + 1,
    startedAt: input.startedAt,
    startedBy: input.actorId,
    fingerprint: buildRadarYoutubeRunFingerprint({
      articleId: input.articleId,
      articleDnaVersionId: input.articleDnaVersionId,
      articleDnaContentHash: article.contentHash,
      queryIds: input.queries.map(consulta => consulta.queryId),
    }),
    queries: input.queries,
    limitations: input.limitations,
  });

  /*
   * O ALVO É GRAVADO EXPLICITAMENTE quando esta coleta é a que o declara.
   *
   * Sem isso, o alvo continuaria sendo INFERIDO de qual investigação existe — e
   * era essa inferência que convertia um artigo de vídeo em artigo de Google
   * assim que alguém coletasse a SERP de apoio.
   */
  const comprometida = await createRadarAnalysisSuccessor(contexto.analysis, {
    youtubeSearch: run,
    ...(decisao.declaresTarget
      ? {
        researchTarget: {
          primaryTarget: decisao.primaryTarget,
          declaredAt: input.startedAt,
          declaredBy: input.actorId,
          reason: "Declarado pela primeira coleta de SERP do YouTube deste artigo.",
        },
      }
      : {}),
  }, input.actorId);

  /*
   * ============ §10.F · DOIS STARTS CONCORRENTES ============
   *
   * Aqui o conflito de trava NÃO é retentado. Dois cliques simultâneos leriam o
   * mesmo estado e gravariam duas corridas equivalentes — e as duas cobrariam.
   * Quem perde a trava para de propósito, ANTES de qualquer gasto: a coleta que
   * venceu é a que vale.
   */
  try {
    await ports.appendAnalysis({ brandId: input.brandId, articleId: input.articleId, expectedLock: contexto.lockVersion, analysis: comprometida });
  } catch (erro) {
    if (erro instanceof OptimisticLockError) {
      throw new RadarStartError("radar_start_contended", "Outra coleta deste artigo começou primeiro. Recarregue a investigação antes de tentar de novo.", 409);
    }
    throw erro;
  }

  /*
   * §1 · PASSO 8 — READBACK DO COMPROMISSO.
   *
   * O provider só é chamado depois que a corrida está LEGÍVEL no banco, com o
   * mesmo `runId`. Sem esta conferência, uma gravação aceita e não visível
   * deixaria a coleta paga sem onde pousar — que é exatamente o buraco que este
   * gate fecha.
   */
  const relido = await ports.loadRadarState({ brandId: input.brandId, articleId: input.articleId });
  const corrente = correnteDe(relido);
  if (!corrente || corrente.payload.youtubeSearch?.runId !== run.runId || corrente.payload.youtubeSearch?.state !== "COLLECTING") {
    throw new RadarStartError("radar_run_readback_failed", "A corrida de YouTube não foi confirmada no banco; nenhuma consulta foi executada.", 503);
  }

  return { run: VersionedRadarAnalysisSchema.parse(corrente).payload.youtubeSearch!, analysis: corrente, currentMode };
}

/**
 * ============ §1 · PASSOS 11 e 12 — A COLETA, PERSISTIDA E RELIDA ============
 *
 * Fecha a MESMA corrida que o START abriu. O `runId` é conferido contra o que
 * está gravado: se outra coleta assumiu o artigo no meio do caminho, esta não
 * sobrescreve o trabalho dela — ela para e diz o que houve.
 *
 * §7 · O CAMINHO DA FALHA PASSA PELA MESMA PORTA. Uma coleta que não trouxe
 * nada fecha como `COLLECTION_FAILED`, com o erro preservado, mesmo `runId` e
 * `primaryMode` ainda YOUTUBE — nunca uma corrida nova.
 */
export async function finishRadarYoutubeRun(
  input: { brandId: string; articleId: string; actorId: string; runId: string; run: RadarYoutubeSearchRun },
  ports: RadarStartPorts,
): Promise<{ analysis: RadarAnalysisVersion; run: RadarYoutubeSearchRun }> {
  if (input.run.runId !== input.runId) throw new RadarStartError("radar_run_identity_mismatch", "A corrida a gravar não é a que foi iniciada.", 500);

  const estado = await ports.loadRadarState({ brandId: input.brandId, articleId: input.articleId });
  const corrente = correnteDe(estado);
  if (!estado || !corrente) throw new RadarStartError("radar_item_not_found", "Item Radar não encontrado para este artigo.", 404);
  if (corrente.payload.youtubeSearch?.runId !== input.runId) {
    throw new RadarStartError("radar_run_superseded", "Outra coleta assumiu este artigo enquanto esta executava; o resultado não foi gravado por cima.", 409);
  }

  const proxima = await createRadarAnalysisSuccessor(corrente, { youtubeSearch: input.run }, input.actorId);
  await ports.appendAnalysis({ brandId: input.brandId, articleId: input.articleId, expectedLock: estado.lockVersion, analysis: proxima });

  const relido = await ports.loadRadarState({ brandId: input.brandId, articleId: input.articleId });
  const confirmado = correnteDe(relido);
  if (!confirmado || confirmado.payload.youtubeSearch?.runId !== input.runId || confirmado.payload.youtubeSearch?.state === "COLLECTING") {
    throw new RadarStartError("radar_result_readback_failed", "A coleta foi executada e o resultado não foi confirmado no banco.", 503);
  }
  return { analysis: confirmado, run: confirmado.payload.youtubeSearch };
}

/* ======================= as portas de produção ======================= */

export const radarStartPorts: RadarStartPorts = {
  loadArticle: async ({ brandId, articleId }) => {
    const artefatos = await new ArtifactRepository().list(brandId);
    return artefatos.articles.find(version => version.payload.articleId === articleId && version.payload.brandId === brandId) || null;
  },
  loadRadarState: async ({ brandId, articleId }) => {
    const linha = await new WorkflowRepository().findByArticle(brandId, articleId, "radar");
    if (!linha || linha.marca_id !== brandId || linha.article_id !== articleId) return null;
    const bruto = linha.payload && typeof linha.payload === "object" && !Array.isArray(linha.payload)
      ? (linha.payload as { analysisVersions?: unknown }).analysisVersions
      : null;
    /*
     * A LEITURA NÃO PODE VIRAR INDISPONIBILIDADE.
     *
     * Uma versão legada fora de forma no meio do histórico não pode impedir a
     * coleta — ela é ignorada, e a corrente é a última que ainda parseia.
     */
    const analyses = (Array.isArray(bruto) ? bruto : [])
      .map(item => VersionedRadarAnalysisSchema.safeParse(item))
      .filter(resultado => resultado.success)
      .map(resultado => resultado.data);
    return { lockVersion: linha.lock_version, analyses };
  },
  appendAnalysis: async ({ brandId, articleId, expectedLock, analysis }) => {
    const linha = await new WorkflowRepository().appendRadarAnalysis(brandId, articleId, expectedLock, analysis, analysis.createdBy);
    if (!linha) throw new RadarStartError("radar_item_not_found", "Item Radar não encontrado para esta marca.", 404);
  },
};

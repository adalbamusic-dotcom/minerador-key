/**
 * ===== A AUTORIDADE ÚNICA DO HANDOFF — RADAR_FINAL_1.1 · §2 =====
 *
 * ==================== UMA AÇÃO, UM SERVIÇO, SETE PASSOS ====================
 *
 * Até o 1.1 existiam DUAS operações independentes: esta rota gravava o dossiê,
 * e `importApprovedToPlanner` movia o workflow a partir do React. Quem clicava
 * uma vez disparava metade da fronteira — e a outra metade dependia de um
 * caminho que a tela controlava sozinha.
 *
 * Agora o servidor conclui o handoff INTEIRO:
 *
 *   VALIDAR → MONTAR → GRAVAR DOSSIÊ → RELER DOSSIÊ
 *   → REVALIDAR IDENTIDADE → TRANSICIONAR WORKFLOW → RELER DESTINO → SUCESSO
 *
 * ==================== FALHA PARCIAL NÃO VIRA SUCESSO — §4 ====================
 *
 * Se a transição falhar depois do dossiê gravado, a resposta é ERRO. O dossiê
 * fica válido e a repetição reconhece que ele já existe, completando só o que
 * falta. Mentir sucesso ali deixaria um artigo marcado como entregue enquanto o
 * Planejador nunca o recebeu.
 *
 * ==================== PROVIDER_CALLS = 0 ====================
 *
 * Consolidar e entregar é ler o que já foi pago.
 */

import { createRadarAnalysisSuccessor, RadarPlannerBundleRecordSchema, type RadarAnalysisVersion, type RadarPlannerBundleRecord } from "../radar/analysis-contracts.ts";
import { assertRadarEvidenceBundleIntegrity, radarEvidenceBundleMatchesArticle, type RadarEvidenceBinding, type RadarEvidenceBundle } from "../radar/evidence-bundle.ts";
import { RADAR_PLANNER_MAY_NOT, type RadarPlannerHandoffReadiness } from "../radar/planner-handoff.ts";
import { importRadarToPlanner, RadarItemSchema } from "../editorial/operational-flow.ts";
import { ArtifactRepository, DecisionEventRepository, WorkflowRepository } from "./editorial-repositories.ts";
import { RadarStartError, radarStartPorts } from "./radar-youtube-start.ts";
import { resolveRadarCanonicalDossier } from "./radar-canonical-dossier.ts";
import { RADAR_NO_AUTHORITIES, loadRadarCanonicalAuthorities, type RadarCanonicalAuthorities } from "./radar-canonical-authorities.ts";

export class RadarPlannerSendError extends Error {
  readonly code: string;
  readonly status: number;
  readonly readiness: RadarPlannerHandoffReadiness | null;
  constructor(code: string, message: string, status = 409, readiness: RadarPlannerHandoffReadiness | null = null) {
    super(message);
    this.name = "RadarPlannerSendError";
    this.code = code;
    this.status = status;
    this.readiness = readiness;
  }
}

/** §11 · o vocabulário canônico do desfecho, sem inventar estado novo. */
export type RadarPlannerHandoffChange =
  | "CREATED"
  | "NEW_VERSION"
  | "TRANSITION_COMPLETED"
  | "ALREADY_IMPORTED";

export type RadarPlannerSendResult = {
  change: RadarPlannerHandoffChange;
  record: RadarPlannerBundleRecord;
  analysisVersionId: string;
  bundleBytes: number;
  handoffBytes: number;
  plannerItemId: string;
  headline: string;
};

/* ============================== as portas ============================== */

type ItemDeWorkflow = {
  id: string;
  marca_id: string;
  article_id: string;
  stage: string;
  state: string;
  lock_version: number;
  payload: unknown;
  source_version_id: string | null;
  source_content_hash: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * ============ §13 · AS FALHAS PARCIAIS PRECISAM SER TESTÁVEIS ============
 *
 * "Gravou o dossiê e a transição falhou" é o caso que este gate existe para
 * fechar, e ele não acontece sozinho num teste contra o banco real. As portas
 * existem para que cada passo possa falhar isoladamente — e para que a ordem
 * entre eles seja uma prova, não uma esperança.
 */
export type RadarPlannerHandoffPorts = {
  loadRadarState: typeof radarStartPorts.loadRadarState;
  appendAnalysis: typeof radarStartPorts.appendAnalysis;
  loadArticleFoundation: (input: { brandId: string; articleId: string }) => Promise<RadarEvidenceBinding | null>;
  findWorkflowItem: (input: { brandId: string; articleId: string; stage: "radar" | "planner" }) => Promise<ItemDeWorkflow | null>;
  importPlannerItem: (input: { brandId: string; articleId: string; radar: ItemDeWorkflow; payload: object; actorId: string }) => Promise<{ id: string }>;
  transitionRadar: (input: { id: string; expectedLock: number; payload: unknown; actorId: string }) => Promise<void>;
  appendDecision: (input: { brandId: string; workflowItemId: string; articleId: string; actorId: string }) => Promise<void>;
  /**
   * ===== PARITY_1 · §2 e §11 · AS AUTORIDADES ENTRAM POR PORTA =====
   *
   * O envio não ganha uma segunda rota nem uma segunda resolução: ele ganha
   * mais uma LEITURA, isolável como todas as outras. Isso é o que permite ao
   * teste provar que a falha de uma leitura não vira dossiê pela metade.
   */
  loadCanonicalAuthorities: (input: { brandId: string; articleId: string; analysis: RadarAnalysisVersion }) => Promise<RadarCanonicalAuthorities>;
};

export const radarPlannerHandoffPorts: RadarPlannerHandoffPorts = {
  loadRadarState: input => radarStartPorts.loadRadarState(input),
  appendAnalysis: input => radarStartPorts.appendAnalysis(input),

  async loadArticleFoundation({ brandId, articleId }) {
    const artefatos = await new ArtifactRepository().list(brandId);
    const article = artefatos.articles.find(version =>
      version.payload.articleId === articleId && version.payload.brandId === brandId);
    if (!article) return null;
    return {
      brandId,
      articleId,
      articleDnaVersionId: article.versionId,
      articleDnaContentHash: article.contentHash,
    };
  },

  async findWorkflowItem({ brandId, articleId, stage }) {
    const item = await new WorkflowRepository().findByArticle(brandId, articleId, stage);
    return (item as ItemDeWorkflow | null) || null;
  },

  async importPlannerItem({ brandId, articleId, radar, payload, actorId }) {
    const inserido = await new WorkflowRepository().importItem({
      marcaId: brandId, articleId, stage: "planner", state: "draft",
      sourceEntityId: articleId,
      sourceVersionId: radar.source_version_id,
      sourceContentHash: radar.source_content_hash,
      payload, actorId,
    });
    return { id: (inserido as { id: string }).id };
  },

  async transitionRadar({ id, expectedLock, payload, actorId }) {
    await new WorkflowRepository().transition(id, expectedLock, "sent_planner", (payload || {}) as object, actorId);
  },

  async loadCanonicalAuthorities({ brandId, articleId, analysis }) {
    const artefatos = await new ArtifactRepository().list(brandId);
    const article = artefatos.articles.find(version =>
      version.payload.articleId === articleId && version.payload.brandId === brandId);
    if (!article) return RADAR_NO_AUTHORITIES;
    return loadRadarCanonicalAuthorities({ brandId, articleId, article, analysis });
  },

  async appendDecision({ brandId, workflowItemId, articleId, actorId }) {
    await new DecisionEventRepository().append({
      marcaId: brandId, workflowItemId, articleId,
      eventType: "import_planner", fromState: "approved", toState: "draft", actorId,
    });
  },
};

/* ============================== o serviço ============================== */

export async function sendRadarToPlanner(entrada: {
  brandId: string;
  articleId: string;
  actorId: string;
  sentAt: string;
}, portas: RadarPlannerHandoffPorts = radarPlannerHandoffPorts): Promise<RadarPlannerSendResult> {
  const estado = await portas.loadRadarState({ brandId: entrada.brandId, articleId: entrada.articleId });
  const corrente = estado?.analyses.slice().sort((esquerda, direita) => direita.versionNumber - esquerda.versionNumber)[0] || null;
  if (!estado || !corrente) {
    throw new RadarStartError("radar_item_not_found", "Item Radar não encontrado para este artigo.", 404);
  }

  const payload = corrente.payload;

  /*
   * ============ §14 · O FUNDAMENTO CORRENTE, LIDO DO ARQUITETO ============
   *
   * A identidade NÃO vem da análise: ela viria envelhecida junto com a
   * evidência, e um dossiê antigo pareceria atual para sempre.
   */
  const article = await portas.loadArticleFoundation(entrada);
  if (!article) {
    throw new RadarPlannerSendError("article_dna_not_found", "O ArticleDNA canônico deste artigo não foi encontrado.", 404);
  }

  const radarItem = await portas.findWorkflowItem({ brandId: entrada.brandId, articleId: entrada.articleId, stage: "radar" });
  if (!radarItem) {
    throw new RadarPlannerSendError("radar_workflow_item_not_found", "O item do Radar não foi encontrado no fluxo operacional.", 404);
  }

  const destinoExistente = await portas.findWorkflowItem({ brandId: entrada.brandId, articleId: entrada.articleId, stage: "planner" });
  const anterior = payload.plannerBundle;

  /*
   * ============ §5 · A INCONSISTÊNCIA EXPLÍCITA ============
   *
   * Workflow no Planejador sem dossiê gravado significa que a esteira foi
   * movida por fora desta autoridade. Responder sucesso aqui esconderia um
   * artigo que o Planejador tem em mãos sem evidência nenhuma atrás.
   */
  if (destinoExistente && !anterior) {
    throw new RadarPlannerSendError(
      "radar_handoff_inconsistent",
      "O artigo já está no Planejador, mas não há dossiê de evidência gravado para ele. Refaça o envio a partir do Radar.",
    );
  }

  /*
   * ===== PORTABLE_EXPORT_1 · §16 · UMA RESOLUÇÃO, DOIS DESTINOS =====
   *
   * Esta cadeia — perfil, blueprint canônico, dossiê, prontidão — era escrita
   * aqui. O export portátil precisa do MESMO resultado, com o mesmo hash.
   *
   * Duplicá-la e cobrir com um teste de paridade provaria que hoje coincidem.
   * Um caminho só faz com que não exista "os dois": um `observedAt` diferente
   * já bastaria para o hash divergir, e o artigo chegaria ao Redator com
   * evidência de outra rodada sem ninguém perceber.
   */
  /*
   * §2 · AS MESMAS AUTORIDADES QUE O EXPORT LÊ — e pela mesma função.
   *
   * Antes do PARITY_1 esta chamada não existia, e o Planejador recebia um
   * dossiê sem a fotografia do Google, sem a biblioteca de vídeos e sem o
   * especialista. O CSV que sai da plataforma levava as três.
   */
  const autoridades = await portas.loadCanonicalAuthorities({
    brandId: entrada.brandId, articleId: entrada.articleId, analysis: corrente,
  });

  const canonico = resolveRadarCanonicalDossier({ analysis: corrente, article, observedAt: entrada.sentAt, authorities: autoridades });
  if (!canonico.ok) {
    throw new RadarPlannerSendError(
      canonico.code,
      canonico.code === "radar_research_not_finalized"
        ? "Finalize a investigação antes de enviar ao Planejador."
        : canonico.reason,
    );
  }

  const bundle = canonico.dossier.bundle;

  /*
   * ============ §9 · A MESMA PRONTIDÃO QUE A TELA USA ============
   *
   * `radarPlannerHandoffReadiness` responde para os dois lados. Duplicar a
   * regra em React é como a tela passou a dizer "pronto" ao lado de um pacote
   * que o domínio recusaria — e ninguém descobre até a hora de entregar.
   */
  const prontidao = canonico.dossier.readiness;
  if (!prontidao.ready) {
    throw new RadarPlannerSendError("radar_handoff_blocked", prontidao.headline, 409, prontidao);
  }

  /* =================== §5 · a matriz de idempotência =================== */

  const mesmoDossie = Boolean(anterior && anterior.bundleHash === bundle.bundleHash);

  if (mesmoDossie && destinoExistente) {
    return {
      change: "ALREADY_IMPORTED",
      record: anterior!,
      analysisVersionId: corrente.versionId,
      bundleBytes: JSON.stringify(anterior!.bundle).length,
      handoffBytes: JSON.stringify(anterior!).length,
      plannerItemId: destinoExistente.id,
      headline: "Pacote já estava disponível no Planejador.",
    };
  }

  /*
   * DOSSIÊ GRAVADO, DESTINO AUSENTE — a retomada de §4.
   *
   * Uma transição que falhou na primeira tentativa deixa exatamente este
   * estado. Regravar o dossiê aqui criaria uma versão de análise por tentativa;
   * o que falta é só completar a esteira.
   */
  let record = anterior;
  let analysisVersionId = corrente.versionId;
  const change: RadarPlannerHandoffChange = mesmoDossie ? "TRANSITION_COMPLETED" : anterior ? "NEW_VERSION" : "CREATED";

  if (!mesmoDossie) {
    record = RadarPlannerBundleRecordSchema.parse({
      bundleVersion: bundle.bundleVersion,
      bundleId: bundle.bundleId,
      bundleHash: bundle.bundleHash,
      primaryResearchProfile: bundle.primaryResearchProfile,
      binding: bundle.binding,
      handoffVersion: anterior ? anterior.handoffVersion + 1 : 1,
      sentAt: entrada.sentAt,
      sentBy: entrada.actorId,
      previousBundleHash: anterior ? anterior.bundleHash : null,
      /*
       * §8 · AS INVARIANTES VIAJAM COM O PACOTE.
       *
       * Elas estavam num envelope que nenhuma chamada runtime montava — ou
       * seja, governança declarada e nunca entregue. Aqui elas chegam ao
       * Planejador junto da evidência, que é o único lugar onde servem.
       */
      plannerMayNot: [...RADAR_PLANNER_MAY_NOT],
      bundle,
    });

    const proxima = await createRadarAnalysisSuccessor(
      corrente,
      {
        plannerBundle: record,
        plannerTransfer: {
          sourceAnalysisVersionId: corrente.versionId,
          sourceAnalysisVersionNumber: corrente.versionNumber,
          sentAt: entrada.sentAt,
          sentBy: entrada.actorId,
        },
      },
      entrada.actorId,
    );
    await portas.appendAnalysis({
      brandId: entrada.brandId, articleId: entrada.articleId,
      expectedLock: estado.lockVersion, analysis: proxima,
    });

    /*
     * ============ §4 · READBACK DO DOSSIÊ, ANTES DA TRANSIÇÃO ============
     *
     * A esteira só se move sobre evidência que o servidor confirmou ter
     * gravado. Inverter a ordem moveria o artigo para o Planejador apostando
     * numa escrita que pode não ter acontecido.
     */
    const relido = await portas.loadRadarState({ brandId: entrada.brandId, articleId: entrada.articleId });
    const versaoRelida = relido?.analyses.slice().sort((esquerda, direita) => direita.versionNumber - esquerda.versionNumber)[0] || null;
    const gravado = versaoRelida?.payload.plannerBundle || null;

    if (!gravado || gravado.bundleHash !== record.bundleHash) {
      throw new RadarPlannerSendError(
        "radar_handoff_readback_failed",
        "A gravação não pôde ser confirmada no servidor: o pacote não foi entregue ao Planejador.",
        502,
      );
    }

    const conferido = gravado.bundle as RadarEvidenceBundle;
    assertRadarEvidenceBundleIntegrity(conferido);
    const vinculo = radarEvidenceBundleMatchesArticle(conferido, article);
    if (!vinculo.matches) {
      throw new RadarPlannerSendError("radar_handoff_readback_binding", vinculo.reason, 502);
    }

    record = gravado;
    analysisVersionId = versaoRelida!.versionId;
  }

  /* ==================== §14 · a revalidação final ==================== */

  /*
   * O FUNDAMENTO PODE TER MUDADO ENTRE MONTAR E MOVER.
   *
   * São duas idas ao banco e uma escrita no meio. Mover um pacote stale faria o
   * Planejador receber evidência de uma investigação para um artigo que já é
   * outro — exatamente o que a identidade existe para impedir.
   */
  const fundamentoAgora = await portas.loadArticleFoundation(entrada);
  if (!fundamentoAgora
    || fundamentoAgora.articleDnaVersionId !== article.articleDnaVersionId
    || fundamentoAgora.articleDnaContentHash !== article.articleDnaContentHash) {
    throw new RadarPlannerSendError(
      "radar_handoff_blocked_stale",
      "O ArticleDNA mudou durante o envio: o pacote descreve outra versão do artigo e não foi movido ao Planejador.",
    );
  }
  if (record!.bundleHash !== bundle.bundleHash && !mesmoDossie) {
    throw new RadarPlannerSendError("radar_handoff_bundle_mismatch", "O pacote gravado não é o que foi montado nesta operação.", 502);
  }

  /* ==================== §4 · a transição do workflow ==================== */

  const radarAtual = await portas.findWorkflowItem({ brandId: entrada.brandId, articleId: entrada.articleId, stage: "radar" });
  if (!radarAtual) {
    throw new RadarPlannerSendError("radar_workflow_item_not_found", "O item do Radar não foi encontrado no fluxo operacional.", 404);
  }

  let plannerItemId = destinoExistente?.id || null;

  if (!plannerItemId) {
    /*
     * A PRÉ-CONDIÇÃO DA ESTEIRA CONTINUA SENDO DELA.
     *
     * Só Radar aprovado entra no Planejador — a mesma regra do comando de
     * workflow. Afrouxá-la aqui abriria uma segunda porta com outra política.
     */
    if (radarAtual.state !== "approved" && radarAtual.state !== "sent_planner") {
      throw new RadarPlannerSendError(
        "radar_not_approved",
        "Somente investigação aprovada entra no Planejador. Aprove o Radar antes de enviar.",
      );
    }

    const radar = RadarItemSchema.parse({
      ...(radarAtual.payload as object),
      id: radarAtual.id, brandId: radarAtual.marca_id, articleId: radarAtual.article_id,
      state: "approved", lockVersion: radarAtual.lock_version,
      importedAt: radarAtual.created_at, updatedAt: radarAtual.updated_at, origin: "real",
    });
    const plannerPayload = importRadarToPlanner([], [radar], entrada.brandId)[0];

    const inserido = await portas.importPlannerItem({
      brandId: entrada.brandId, articleId: entrada.articleId,
      radar: radarAtual, payload: plannerPayload, actorId: entrada.actorId,
    });
    plannerItemId = inserido.id;

    if (radarAtual.state === "approved") {
      await portas.transitionRadar({
        id: radarAtual.id, expectedLock: radarAtual.lock_version,
        payload: radarAtual.payload, actorId: entrada.actorId,
      });
    }
    await portas.appendDecision({
      brandId: entrada.brandId, workflowItemId: plannerItemId,
      articleId: entrada.articleId, actorId: entrada.actorId,
    });
  }

  /* ================= §4 · o readback do DESTINO ================= */

  /*
   * O ÚLTIMO PASSO ANTES DO SUCESSO.
   *
   * Sem ele, "enviado" significaria apenas que a escrita não lançou exceção. O
   * que a pessoa precisa saber é que o Planejador TEM o item — e isso só o
   * destino relido responde.
   */
  const destino = await portas.findWorkflowItem({ brandId: entrada.brandId, articleId: entrada.articleId, stage: "planner" });
  if (!destino) {
    throw new RadarPlannerSendError(
      "radar_handoff_destination_readback_failed",
      "O item não pôde ser confirmado no Planejador. O dossiê está gravado; repita o envio para completar a transferência.",
      502,
    );
  }
  if (destino.article_id !== entrada.articleId || destino.marca_id !== entrada.brandId) {
    throw new RadarPlannerSendError("radar_handoff_destination_mismatch", "O item confirmado no Planejador é de outro artigo.", 502);
  }

  const handoffBytes = JSON.stringify(record).length;
  return {
    change,
    record: record!,
    analysisVersionId,
    bundleBytes: JSON.stringify(record!.bundle).length,
    handoffBytes,
    plannerItemId: destino.id,
    headline: change === "TRANSITION_COMPLETED"
      ? "Transferência ao Planejador concluída: o dossiê já estava gravado."
      : change === "NEW_VERSION"
        ? `Nova versão do pacote enviada ao Planejador (v${record!.handoffVersion}).`
        : "Pacote enviado ao Planejador.",
  };
}

/**
 * @deprecated Use `sendRadarToPlanner`. O nome antigo descrevia metade da
 * fronteira — gravava o dossiê e deixava a esteira para o React.
 */
export const sendRadarBundleToPlanner = sendRadarToPlanner;

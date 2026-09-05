export const RADAR_R4_SERP_QUEUE_STATES = [
  "QUEUED",
  "RUNNING",
  "WAITING_REVIEW",
  "COMPLETED",
  "FAILED_RETRYABLE",
  "FAILED_FINAL",
] as const;

export const BATCH_PROCESSING_CAN_REUSE_EXISTING_JOBS = "PARTIAL" as const;

export type RadarR4SerpQueueState = typeof RADAR_R4_SERP_QUEUE_STATES[number];

export const RADAR_R4_TOPIC_STATES = [
  "NOT_PREPARED",
  "TOPICS_PREPARING",
  "FAILED_RETRYABLE",
  "TOPICS_READY_FOR_REVIEW",
  "TOPICS_APPROVED",
  "READY_TO_SEND",
] as const;

export type RadarR4TopicState = typeof RADAR_R4_TOPIC_STATES[number];

export const RADAR_R4_AMAZON_STATES = [
  "AMAZON_APPLICABLE",
  "AMAZON_NOT_APPLICABLE",
  "AMAZON_PENDING",
  "AMAZON_REVIEWED",
] as const;

export type RadarR4AmazonState = typeof RADAR_R4_AMAZON_STATES[number];

export const RADAR_R4_SPECIALIST_STATES = [
  "NOT_REQUIRED",
  "TOPICS_PREPARING",
  "TOPICS_READY",
  "READY_TO_SEND",
  "SENT",
  "AWAITING_EXPERT",
  "RECEIVED",
  "PROCESSING",
  "READY_FOR_REVIEW",
  "REVIEWED",
] as const;

export type RadarR4SpecialistState = typeof RADAR_R4_SPECIALIST_STATES[number];

/**
 * R4 kept READY_FOR_REVIEW as a compatibility alias. R6 uses the three
 * explicit human gates below so generation, review and approval cannot be
 * mistaken for the same operation.
 */
export type RadarR4ReportState = "NOT_STARTED" | "REPORT_GENERATED" | "REPORT_REVIEWED" | "REPORT_APPROVED" | "READY_FOR_REVIEW";

export type RadarR4TopicSource = "SERP" | "AMAZON" | "ArticleDNA" | "SiloDNA" | "Conteúdo existente";

export type RadarR4ExistingContentKind = "YOUTUBE" | "PODCAST" | "VIDEO" | "AUDIO" | "DOCUMENT";
export type RadarR4ExistingContentState = "LINK_REGISTERED" | "AWAITING_FILE" | "IGNORED_FOR_ARTICLE";
export type RadarR4ExistingContentRecord = {
  id: string;
  kind: RadarR4ExistingContentKind;
  label: string;
  reference: string;
  state: RadarR4ExistingContentState;
};

export type RadarR4TopicProvenance = {
  origins: RadarR4TopicSource[];
  reference: string | null;
  complementaryExistingContent: string | null;
};

export type RadarR4ExpertContext = {
  articleDna: {
    principal: string;
    intent: string;
    silo: string;
  };
  serpNeeds: string[];
  amazonCriteria: string[];
  existingContent: string;
  openGaps: string[];
};

export const RADAR_R4_SPECIALIST_STATUS_LABEL: Record<RadarR4SpecialistState, string> = {
  NOT_REQUIRED: "Não necessário",
  TOPICS_PREPARING: "Preparando pautas",
  TOPICS_READY: "Pauta pronta para revisão",
  READY_TO_SEND: "Pronto para enviar",
  SENT: "Enviado ao especialista",
  AWAITING_EXPERT: "Aguardando resposta",
  RECEIVED: "Contribuição recebida",
  PROCESSING: "Processando contribuição",
  READY_FOR_REVIEW: "Contribuição pronta para revisão",
  REVIEWED: "Contribuição revisada",
};

export const RADAR_R4_AMAZON_STATUS_LABEL: Record<RadarR4AmazonState, string> = {
  AMAZON_APPLICABLE: "Amazon aplicável",
  AMAZON_NOT_APPLICABLE: "Amazon não aplicável",
  AMAZON_PENDING: "Amazon aguardando decisão",
  AMAZON_REVIEWED: "Amazon revisada",
};

export const RADAR_R4_SERP_STATUS_LABEL: Record<RadarR4SerpQueueState, string> = {
  QUEUED: "Na fila SERP",
  RUNNING: "Processando SERP",
  WAITING_REVIEW: "Aguardando revisão SERP",
  COMPLETED: "SERP concluída",
  FAILED_RETRYABLE: "Falha SERP · retry disponível",
  FAILED_FINAL: "Falha SERP final",
};

export type RadarR4Topic = {
  id: string;
  text: string;
  source: string;
  sourceType: RadarR4TopicSource;
  origin?: string;
  justification?: string;
  need?: string;
  reference?: string | null;
  provenance?: RadarR4TopicProvenance;
};

export type RadarR4LocalArticleState = {
  serp: {
    state: RadarR4SerpQueueState | null;
    position: number | null;
    total: number | null;
    error: string | null;
  };
  amazon: RadarR4AmazonState;
  topics: {
    state: RadarR4TopicState;
    items: RadarR4Topic[];
    context: RadarR4ExpertContext | null;
    reviewedIds: string[];
  };
  specialist: RadarR4SpecialistState;
  report: RadarR4ReportState;
  /** Fingerprint local da evidência usada na aprovação; nunca é um ID remoto. */
  reportApprovedEvidenceFingerprint?: string | null;
  existingContent?: RadarR4ExistingContentRecord[];
};

export type RadarR4SerpQueueItem = {
  articleId: string;
  state: RadarR4SerpQueueState;
  position: number;
  total: number;
  error: string | null;
};

export type RadarR4SerpQueue = {
  id: string;
  articleIds: string[];
  items: Record<string, RadarR4SerpQueueItem>;
};

export type RadarR4BulkOperation = "serp" | "refreshSerp" | "review" | "approve" | "topics" | "approveTopics" | "specialist" | "reviewSpecialist" | "report" | "planner";

export type RadarR4BulkArticleSnapshot = {
  articleId: string;
  keywordReady: boolean;
  serpCollected: boolean;
  serpReviewed: boolean;
  analysisStarted: boolean;
  reportGenerated: boolean;
  reportApproved: boolean;
  sentToPlanner: boolean;
  rowState: string;
  topicsState: RadarR4TopicState;
  topicsReviewed: boolean;
  topicsTotal?: number;
  topicsReviewedCount?: number;
  specialistState: RadarR4SpecialistState;
  serpQueueState: RadarR4SerpQueueState | null;
  amazonState: RadarR4AmazonState;
};

export type RadarR4BulkEligibility = {
  eligible: string[];
  alreadyDone: string[];
  requiresExplicitRefresh: string[];
  blocked: string[];
  notApplicable: string[];
};

export function createRadarR4LocalArticleState(): RadarR4LocalArticleState {
  return {
    serp: { state: null, position: null, total: null, error: null },
    amazon: "AMAZON_NOT_APPLICABLE",
    topics: { state: "NOT_PREPARED", items: [], context: null, reviewedIds: [] },
    specialist: "NOT_REQUIRED",
    report: "NOT_STARTED",
    existingContent: [],
  };
}

function uniqueText(values: string[] | undefined): string[] {
  return [...new Set((values || []).map(value => value.replace(/\s+/g, " ").trim()).filter(Boolean))];
}

export function buildRadarR4ExpertContext(input: {
  principal: string;
  intent?: string;
  silo?: string;
  serpNeeds?: string[];
  amazonCriteria?: string[];
  existingContent?: string;
  openGaps?: string[];
}): RadarR4ExpertContext {
  return {
    articleDna: {
      principal: input.principal.trim() || "Tema recebido no ArticleDNA",
      intent: input.intent?.trim() || "Intenção não recebida nesta etapa",
      silo: input.silo?.trim() || "Silo não recebido nesta etapa",
    },
    serpNeeds: uniqueText(input.serpNeeds),
    amazonCriteria: uniqueText(input.amazonCriteria),
    existingContent: input.existingContent?.trim() || "Nenhum material existente associado",
    openGaps: uniqueText(input.openGaps),
  };
}

export function createRadarR4SerpQueue(articleIds: string[], batchId = `radar-r4-serp-${Date.now()}`): RadarR4SerpQueue {
  const uniqueIds = [...new Set(articleIds)];
  const total = uniqueIds.length;
  return {
    id: batchId,
    articleIds: uniqueIds,
    items: Object.fromEntries(uniqueIds.map((articleId, index) => [articleId, {
      articleId,
      state: "QUEUED" as const,
      position: index + 1,
      total,
      error: null,
    }])),
  };
}

export function updateRadarR4SerpQueueItem(queue: RadarR4SerpQueue, articleId: string, state: RadarR4SerpQueueState, error: string | null = null): RadarR4SerpQueue {
  const current = queue.items[articleId];
  if (!current) return queue;
  return { ...queue, items: { ...queue.items, [articleId]: { ...current, state, error } } };
}

export function radarR4QueueItems(queue: RadarR4SerpQueue): RadarR4SerpQueueItem[] {
  return queue.articleIds.map(articleId => queue.items[articleId]).filter((item): item is RadarR4SerpQueueItem => Boolean(item));
}

export function getRadarR4BulkEligibility(snapshots: RadarR4BulkArticleSnapshot[], operation: RadarR4BulkOperation): RadarR4BulkEligibility {
  const result: RadarR4BulkEligibility = { eligible: [], alreadyDone: [], requiresExplicitRefresh: [], blocked: [], notApplicable: [] };
  for (const snapshot of snapshots) {
    const bucket = (value: keyof RadarR4BulkEligibility) => result[value].push(snapshot.articleId);
    if (operation === "serp") {
      if (!snapshot.keywordReady) bucket("blocked");
      else if (snapshot.serpQueueState === "FAILED_FINAL") bucket("blocked");
      else if (snapshot.serpCollected || ["QUEUED", "RUNNING", "WAITING_REVIEW", "COMPLETED"].includes(snapshot.serpQueueState || "")) {
        bucket("alreadyDone");
        bucket("requiresExplicitRefresh");
      }
      else bucket("eligible");
      continue;
    }
    if (operation === "refreshSerp") {
      if (!snapshot.keywordReady || !snapshot.serpCollected || snapshot.serpQueueState === "FAILED_FINAL") bucket("blocked");
      else if (["QUEUED", "RUNNING"].includes(snapshot.serpQueueState || "")) bucket("blocked");
      else bucket("eligible");
      continue;
    }
    if (operation === "review") {
      if (!snapshot.serpCollected) bucket("blocked");
      else if (snapshot.serpReviewed || snapshot.serpQueueState === "COMPLETED") bucket("alreadyDone");
      else if (snapshot.serpQueueState === "WAITING_REVIEW" || ["researching", "needs_review"].includes(snapshot.rowState)) bucket("eligible");
      else bucket("blocked");
      continue;
    }
    if (operation === "approve") {
      if (!snapshot.serpReviewed) bucket("blocked");
      else if (snapshot.reportApproved || snapshot.sentToPlanner || snapshot.rowState === "approved" || snapshot.rowState === "sent_planner") bucket("alreadyDone");
      else bucket("eligible");
      continue;
    }
    if (operation === "topics") {
      const amazonReady = snapshot.amazonState === "AMAZON_NOT_APPLICABLE" || snapshot.amazonState === "AMAZON_REVIEWED";
      if (!snapshot.serpReviewed || !snapshot.analysisStarted || !amazonReady) bucket("blocked");
      else if (snapshot.topicsState === "FAILED_RETRYABLE") bucket("eligible");
      else if (snapshot.topicsState !== "NOT_PREPARED") bucket("alreadyDone");
      else bucket("eligible");
      continue;
    }
    if (operation === "approveTopics") {
      if (snapshot.topicsState === "TOPICS_READY_FOR_REVIEW" && snapshot.topicsReviewed) bucket("eligible");
      else if (["TOPICS_APPROVED", "READY_TO_SEND"].includes(snapshot.topicsState)) bucket("alreadyDone");
      else bucket("blocked");
      continue;
    }
    if (operation === "reviewSpecialist") {
      if (snapshot.specialistState === "NOT_REQUIRED") bucket("notApplicable");
      else if (snapshot.specialistState === "REVIEWED") bucket("alreadyDone");
      else if (snapshot.specialistState === "RECEIVED" || snapshot.specialistState === "READY_FOR_REVIEW") bucket("eligible");
      else bucket("blocked");
      continue;
    }
    if (operation === "specialist") {
      if (snapshot.specialistState === "NOT_REQUIRED") bucket("notApplicable");
      else if (snapshot.specialistState === "SENT" || snapshot.specialistState === "AWAITING_EXPERT" || snapshot.specialistState === "RECEIVED" || snapshot.specialistState === "PROCESSING" || snapshot.specialistState === "READY_FOR_REVIEW" || snapshot.specialistState === "REVIEWED") bucket("alreadyDone");
      else if (snapshot.specialistState === "READY_TO_SEND") bucket("blocked");
      else bucket("blocked");
      continue;
    }
    if (operation === "report") {
      if (!snapshot.serpReviewed || !snapshot.analysisStarted) bucket("blocked");
      else if (snapshot.reportGenerated) bucket("alreadyDone");
      else bucket("eligible");
      continue;
    }
    if (snapshot.sentToPlanner) bucket("alreadyDone");
    else if (snapshot.reportApproved) bucket("eligible");
    else bucket("blocked");
  }
  return result;
}

export function availableBulkActions(snapshots: RadarR4BulkArticleSnapshot[]): Record<RadarR4BulkOperation, RadarR4BulkEligibility> {
  return {
    serp: getRadarR4BulkEligibility(snapshots, "serp"),
    refreshSerp: getRadarR4BulkEligibility(snapshots, "refreshSerp"),
    review: getRadarR4BulkEligibility(snapshots, "review"),
    approve: getRadarR4BulkEligibility(snapshots, "approve"),
    topics: getRadarR4BulkEligibility(snapshots, "topics"),
    approveTopics: getRadarR4BulkEligibility(snapshots, "approveTopics"),
    specialist: getRadarR4BulkEligibility(snapshots, "specialist"),
    reviewSpecialist: getRadarR4BulkEligibility(snapshots, "reviewSpecialist"),
    report: getRadarR4BulkEligibility(snapshots, "report"),
    planner: getRadarR4BulkEligibility(snapshots, "planner"),
  };
}

export function prepareRadarR4Topics(input: { articleId: string; principal: string; reportSummary: string; evidenceCount: number }): RadarR4Topic[] {
  const principal = input.principal.trim() || "tema recebido no ArticleDNA";
  return [
    { id: `${input.articleId}:topic:principal`, text: `Experiência prática relacionada a “${principal}”.`, source: "Principal recebida no ArticleDNA", sourceType: "ArticleDNA" },
    { id: `${input.articleId}:topic:needs`, text: input.reportSummary.trim() || "Necessidades observadas na análise SERP.", source: "Resumo local do relatório Radar", sourceType: "SERP" },
    { id: `${input.articleId}:topic:evidence`, text: `Contexto para revisar as ${input.evidenceCount} evidência(s) observada(s).`, source: "Amostra do Radar", sourceType: "SERP" },
  ];
}

export function prepareRadarR4TopicsFromContext(input: { articleId: string; context: RadarR4ExpertContext; evidenceCount: number }): RadarR4Topic[] {
  const serpNeed = input.context.serpNeeds[0] || input.context.openGaps[0] || "Necessidades observadas na análise SERP.";
  const amazonNeed = input.context.amazonCriteria[0] || "Amazon marcada como não aplicável nesta etapa.";
  return [
    { id: `${input.articleId}:topic:principal`, text: `Experiência prática relacionada a “${input.context.articleDna.principal}”.`, source: `ArticleDNA · ${input.context.articleDna.intent}`, sourceType: "ArticleDNA" },
    { id: `${input.articleId}:topic:serp`, text: serpNeed, source: "Necessidade observada na SERP", sourceType: "SERP" },
    { id: `${input.articleId}:topic:amazon`, text: amazonNeed, source: input.context.amazonCriteria.length ? "Critério Amazon" : "Amazon não aplicável", sourceType: "AMAZON" },
  ];
}

export function updateRadarR4Topic(items: RadarR4Topic[], topicId: string, text: string): RadarR4Topic[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return items;
  return items.map(item => item.id === topicId ? { ...item, text: normalized } : item);
}

export function removeRadarR4Topic(items: RadarR4Topic[], topicId: string): RadarR4Topic[] {
  return items.filter(item => item.id !== topicId);
}

export function moveRadarR4Topic(items: RadarR4Topic[], topicId: string, direction: -1 | 1): RadarR4Topic[] {
  const index = items.findIndex(item => item.id === topicId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function nextActionForRadarR4Article(input: { baseAction: string; localState: RadarR4LocalArticleState }): string {
  const serp = input.localState.serp;
  if (serp.state === "QUEUED") return `SERP na fila ${serp.position || 1}/${serp.total || 1}.`;
  if (serp.state === "RUNNING") return `Processando SERP ${serp.position || 1}/${serp.total || 1}.`;
  if (serp.state === "WAITING_REVIEW") return "Revise a SERP coletada deste artigo.";
  if (serp.state === "FAILED_RETRYABLE") return "Tente novamente a coleta SERP deste artigo.";
  if (serp.state === "FAILED_FINAL") return "Resolva a falha final da SERP antes de continuar.";
  if (input.localState.amazon === "AMAZON_PENDING") return "Defina se a etapa Amazon é aplicável a este artigo.";
  if (input.localState.specialist === "AWAITING_EXPERT" || input.localState.specialist === "SENT") return "Aguarde a resposta do especialista.";
  if (input.localState.specialist === "RECEIVED" || input.localState.specialist === "READY_FOR_REVIEW") return "Revise a contribuição recebida do especialista.";
  if (input.localState.specialist === "PROCESSING") return "Aguarde o processamento da contribuição do especialista.";
  if (input.localState.topics.state === "FAILED_RETRYABLE") return "Tente novamente a preparação das pautas deste artigo.";
  if (input.localState.topics.state === "TOPICS_PREPARING") return "Aguarde a preparação local das pautas.";
  if (input.localState.topics.state === "TOPICS_READY_FOR_REVIEW") return "Aprove a pauta local do especialista.";
  if (input.localState.topics.state === "TOPICS_APPROVED" || input.localState.topics.state === "READY_TO_SEND") return "Envio ao especialista aguarda a fundação Telegram.";
  if (input.localState.report === "REPORT_GENERATED" || input.localState.report === "READY_FOR_REVIEW") return "Revise a prévia local do relatório.";
  if (input.localState.report === "REPORT_REVIEWED") return "Aprove o relatório somente após a revisão humana.";
  return input.baseAction;
}

export const nextActionForArticle = nextActionForRadarR4Article;

export function radarR4SpecialistStatusLabel(state: RadarR4SpecialistState): string {
  return RADAR_R4_SPECIALIST_STATUS_LABEL[state];
}

export function radarR4AmazonStatusLabel(state: RadarR4AmazonState): string {
  return RADAR_R4_AMAZON_STATUS_LABEL[state];
}

export function radarR4SerpStatusLabel(state: RadarR4SerpQueueState): string {
  return RADAR_R4_SERP_STATUS_LABEL[state];
}

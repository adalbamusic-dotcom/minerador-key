"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RadarR6ExpertEvidenceInput, RadarR6ExpertTopicContext } from "@/lib/radar/r6-sequential";
import type { RadarR7TopicSuggestion } from "@/lib/radar/r7-sequential";
import { parseRadarR7TopicResponse } from "@/lib/radar/r7-sequential";
import { projectRadarExpertEvidence, type RadarExpertContributionEvidenceSource, type RadarExpertEvidenceReview } from "@/lib/radar/expert-evidence";
import type { RadarExpertEvidence } from "@/lib/radar/analysis-contracts";
import {
  radarSpecialistCounters,
  radarSpecialistPriorityLabel,
  radarSpecialistRequirementIdOf,
  radarSpecialistReviewCard,
  radarSpecialistReviewPoints,
  radarSpecialistStateFromBrief,
  radarSpecialistStateLabel,
  type RadarFrozenSpecialistRequirement,
  type RadarSpecialistBriefReading,
  type RadarSpecialistCounters,
} from "@/lib/radar/specialist-lifecycle";
import { useRadarAreaLiveRead } from "./use-radar-area-live-read";
import { RADAR_SPECIALIST_INVITE_LABELS, RADAR_SPECIALIST_INVITE_STATES, radarSpecialistConsultationOf, type RadarSpecialistInviteState } from "@/lib/radar/specialist-consultation";
import {
  RADAR_SPECIALIST_CLASSIFICATIONS,
  RADAR_SPECIALIST_CLASSIFICATION_HINTS,
  RADAR_SPECIALIST_CLASSIFICATION_LABELS,
  RADAR_SPECIALIST_CLASSIFICATION_SOURCE_LABELS,
  RADAR_SPECIALIST_DECISION_LABELS,
  radarSpecialistDecisionIsActive,
  radarSpecialistDecisionToProjection,
  radarSpecialistExtraction,
  radarSpecialistReviewsOf,
  type RadarSpecialistClassification,
  type RadarSpecialistDecision,
  type RadarSpecialistStoredReview,
} from "@/lib/radar/specialist-contribution-review";
import {
  radarSpecialistBriefActionLabel,
  radarSpecialistFlow,
  radarSpecialistNextAction,
  radarSpecialistQuestionControls,
} from "@/lib/radar/specialist-flow";
import {
  buildRadarExpertBriefContext,
  normalizeRadarExpertBriefQuestions,
  questionFromRadarSuggestion,
  radarExpertBriefMatchesContext,
  radarExpertBriefQuestionOriginLabel,
  type RadarExpertBriefQuestion,
} from "@/lib/radar/expert-brief";

type RadarExpertRecord = {
  id: string;
  brandId: string;
  displayName: string;
  specialty: string | null;
  status: string;
  createdAt: string;
};

type RadarBindingSummary = { expertId: string; status: string };

type RadarExpertContributionRecord = RadarExpertContributionEvidenceSource & {
  sourceType: "TEXT" | "VOICE" | "AUDIO" | "DOCUMENT";
  processingStatus: string;
};

/**
 * A REVISÃO É REMOTA — SPECIALIST_3 · §13.
 *
 * Ela vinha do `localStorage`, e por isso só existia no navegador onde alguém
 * clicou: abrir o mesmo artigo na Vercel depois de decidir no local mostrava
 * tudo "aguardando decisão" de novo. Agora ela é lida do `radar_context` da
 * pauta, que é remoto, e gravada pela rota de revisão.
 */
type ExpertReview = RadarSpecialistStoredReview;

type RadarBriefRecord = {
  id: string;
  brandId: string;
  expertId: string;
  articleId: string | null;
  articleDnaVersionId: string | null;
  title: string;
  radarContext: Record<string, unknown>;
  questions: unknown[];
  status: string;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  completedAt: string | null;
};

export type RadarSpecialistPanelSummary = {
  contributionCount: number;
  pendingCount: number;
  remote: true;
  canonicalEvidence: RadarExpertEvidence[];
  blockedEvidenceCount: number;
  articleDnaVersionId: string;
  /**
   * OS CINCO NÚMEROS, LIDOS DO BANCO — SPECIALIST_1 · §5.
   *
   * A planilha mostrava `requestsSent: 0` fixo enquanto o envio existia e
   * gravava `sent_at`. Quem lê os contadores precisa recebê-los de quem
   * carregou as pautas remotas, e não de uma constante.
   */
  counters: RadarSpecialistCounters;
};

type RadarExpertBriefPanelProps = {
  brandId: string;
  articleId: string;
  articleDnaVersionId: string;
  articleTitle: string;
  articleVersion: string;
  articleRole: string;
  context: RadarR6ExpertTopicContext | null;
  suggestedQuestions?: unknown[];
  /**
   * OS PONTOS QUE A INVESTIGAÇÃO PREPAROU — congelados quando há congelamento.
   *
   * Chegam prontos de quem tem a investigação em mãos. O painel não os
   * reconstrói: duas montagens do mesmo requisito divergiriam no primeiro
   * ajuste, e a coluna direita mostraria um ponto que o bundle não tem.
   */
  requirements?: readonly RadarFrozenSpecialistRequirement[];
  onExpertEvidenceChange?: (articleId: string, evidence: RadarR6ExpertEvidenceInput[], summary: RadarSpecialistPanelSummary) => void;
};

type Draft = { title: string; questions: RadarExpertBriefQuestion[] };

/** O que a projeção canônica de `/expert-consultations` devolve por ponto. */
type RadarConsultationView = {
  requirementId: string | null;
  consultationId: string | null;
  participant: { id: string; displayName: string | null; provisional: boolean };
  briefId: string;
  status: string;
  sentAt: string | null;
  connected: boolean;
  invite: { state: RadarSpecialistInviteState; expiresAt: string | null };
};

const surface = "rounded-md border border-divider bg-surface-subtle p-3";
const action = "inline-flex min-h-10 items-center justify-center rounded-md border border-divider px-3 py-2 text-sm text-foreground transition-colors hover:border-context-accent hover:text-context-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:text-text-muted";
const primaryAction = `${action} border-context-accent bg-selected`;

function recordValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function optionalRecordValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function parseExpert(value: unknown): RadarExpertRecord | null {
  const record = asObject(value);
  if (!record || !record.id || !record.brandId || !record.displayName) return null;
  return {
    id: recordValue(record.id),
    brandId: recordValue(record.brandId),
    displayName: recordValue(record.displayName),
    specialty: optionalRecordValue(record.specialty),
    status: recordValue(record.status),
    createdAt: recordValue(record.createdAt),
  };
}

function parseBinding(value: unknown): RadarBindingSummary | null {
  const record = asObject(value);
  if (!record || !record.expertId) return null;
  return { expertId: recordValue(record.expertId), status: recordValue(record.status) };
}

function parseContribution(value: unknown): RadarExpertContributionRecord | null {
  const record = asObject(value);
  if (!record || !record.id || !record.brandId || !record.expertId || !record.briefId) return null;
  const sourceType = record.sourceType;
  if (sourceType !== "TEXT" && sourceType !== "VOICE" && sourceType !== "AUDIO" && sourceType !== "DOCUMENT") return null;
  return {
    id: recordValue(record.id),
    brandId: recordValue(record.brandId),
    expertId: recordValue(record.expertId),
    briefId: recordValue(record.briefId),
    sourceType,
    originalText: optionalRecordValue(record.originalText),
    transcriptText: optionalRecordValue(record.transcriptText),
    organizationPayload: asObject(record.organizationPayload),
    processingStatus: recordValue(record.processingStatus),
    receivedAt: recordValue(record.receivedAt),
    externalUpdateId: recordValue(asObject(record.evidence)?.externalUpdateId),
    originalAssetUri: optionalRecordValue(asObject(record.evidence)?.originalAssetUri),
    checksum: optionalRecordValue(asObject(record.evidence)?.checksum),
  };
}

function parseConsultation(value: unknown): RadarConsultationView | null {
  const record = asObject(value);
  if (!record || !record.briefId) return null;
  const participante = asObject(record.participant) || {};
  const convite = asObject(record.invite) || {};
  const estado = recordValue(convite.state);
  return {
    requirementId: optionalRecordValue(record.requirementId),
    consultationId: optionalRecordValue(record.consultationId),
    participant: { id: recordValue(participante.id), displayName: optionalRecordValue(participante.displayName), provisional: Boolean(participante.provisional) },
    briefId: recordValue(record.briefId),
    status: recordValue(record.status),
    sentAt: optionalRecordValue(record.sentAt),
    connected: Boolean(record.connected),
    invite: {
      state: (RADAR_SPECIALIST_INVITE_STATES as readonly string[]).includes(estado) ? estado as RadarSpecialistInviteState : "NONE",
      expiresAt: optionalRecordValue(convite.expiresAt),
    },
  };
}

function parseBrief(value: unknown): RadarBriefRecord | null {
  const record = asObject(value);
  if (!record || !record.id || !record.brandId || !record.expertId || !record.title) return null;
  return {
    id: recordValue(record.id),
    brandId: recordValue(record.brandId),
    expertId: recordValue(record.expertId),
    articleId: optionalRecordValue(record.articleId),
    articleDnaVersionId: optionalRecordValue(record.articleDnaVersionId),
    title: recordValue(record.title),
    radarContext: asObject(record.radarContext) || {},
    questions: Array.isArray(record.questions) ? record.questions : [],
    status: recordValue(record.status),
    createdAt: recordValue(record.createdAt),
    updatedAt: recordValue(record.updatedAt) || recordValue(record.createdAt),
    sentAt: optionalRecordValue(record.sentAt),
    completedAt: optionalRecordValue(record.completedAt),
  };
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "data não informada" : date.toLocaleString("pt-BR");
}

function briefDate(brief: RadarBriefRecord) {
  return formatDate(brief.updatedAt || brief.createdAt);
}

/**
 * A DURAÇÃO, SÓ QUANDO ELA EXISTE DE VERDADE.
 *
 * `expert_contributions` não tem coluna de duração: quando o provider a
 * informou, ela chega dentro do payload de organização. Exibir "00:00" para o
 * resto faria uma mensagem de voz de três minutos parecer vazia.
 */
function contributionDuration(contribution: RadarExpertContributionRecord): string | null {
  const payload = contribution.organizationPayload;
  if (!payload) return null;
  const raw = payload.durationSeconds ?? payload.duration;
  const seconds = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function localQuestionId() {
  return `question-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyDraft(articleTitle: string, questions: RadarExpertBriefQuestion[] = []): Draft {
  return { title: `Pauta para ${articleTitle}`.slice(0, 240), questions };
}

function errorMessage(value: unknown, fallback: string) {
  return value instanceof Error && value.message ? value.message : fallback;
}

function sourceTypeLabel(sourceType: RadarExpertContributionRecord["sourceType"]) {
  return ({ TEXT: "Texto", VOICE: "Mensagem de voz", AUDIO: "Áudio", DOCUMENT: "Documento" } as const)[sourceType];
}

function processingStatusLabel(status: string) {
  return ({ RECEIVED: "Recebida", PENDING_LOCAL_PROCESSING: "Aguardando processamento", PROCESSING: "Em processamento", EXTRACTED: "Asset preservado", FAILED_RETRYABLE: "Falha recuperável", FAILED_FINAL: "Falha final" } as Record<string, string>)[status] || "Estado não reconhecido";
}

/**
 * AS QUATRO DECISÕES, NA ORDEM EM QUE ELAS PESAM.
 *
 * Aceitar como evidência sustenta uma afirmação do artigo; usar como apoio não
 * sustenta sozinha; marcar citação preserva a fala com procedência; rejeitar
 * mantém no histórico e para por ali. Os rótulos vêm do domínio para a tela e
 * o Planejador nunca divergirem sobre o que uma decisão significa.
 */
const DECISOES: Array<{ value: RadarSpecialistDecision; label: string }> = [
  { value: "ACCEPTED_EVIDENCE", label: "Aceitar como evidência" },
  { value: "SUPPORT_ONLY", label: "Usar como apoio" },
  { value: "QUOTE_CANDIDATE", label: "Marcar citação literal" },
  { value: "REJECTED", label: "Rejeitar" },
];

/**
 * AS TABELAS CUJO EVENTO SIGNIFICA "a área Especialista mudou".
 *
 * `expert_contributions` é a resposta que chega; `expert_briefs` muda de
 * estado no envio e na revisão; `telegram_expert_bindings` nasce no `/start`
 * e é o que transforma um convite aberto em especialista conectado.
 *
 * `external_processing_jobs` FICA DE FORA de propósito: a fila é de todas as
 * marcas e de todos os tipos de trabalho, e o que interessa aqui — o áudio
 * transcrito — chega como UPDATE na própria contribuição.
 */
const RADAR_SPECIALIST_LIVE_TABLES = ["expert_contributions", "expert_briefs", "telegram_expert_bindings"] as const;

/* Referências estáveis: um array novo a cada render remontaria os memos. */
const VAZIO_EXPERTS: RadarExpertRecord[] = [];
const VAZIO_BINDINGS: RadarBindingSummary[] = [];
const VAZIO_BRIEFS: RadarBriefRecord[] = [];
const VAZIO_CONTRIBUICOES: RadarExpertContributionRecord[] = [];
const VAZIO_CONSULTAS: RadarConsultationView[] = [];

/** A decisão humana que transforma contribuição em evidência. */
const REVISAO_PENDENTE: ExpertReview = { decision: "NOT_APPROVED", classification: null, relatedRequirementId: null, decidedAt: "", decidedBy: null };

export function RadarExpertBriefPanel({ brandId, articleId, articleDnaVersionId, articleTitle, articleVersion, articleRole, context, suggestedQuestions = [], requirements = [], onExpertEvidenceChange }: RadarExpertBriefPanelProps) {
  /**
   * O QUE VEM DO SERVIDOR NÃO É ESTADO DA TELA.
   *
   * Eram quatro `useState` preenchidos por efeito. Cada leitura nova produzia
   * uma sequência de `setState`, e entre elas existiam renders com metade dos
   * dados novos e metade dos antigos — a área piscava para "nenhuma resposta"
   * no meio de uma revalidação.
   *
   * Agora tudo é DERIVADO do read-model. O único estado local é o overlay das
   * pautas, abaixo, porque ele representa uma escrita confirmada que a tela já
   * pode mostrar antes da próxima leitura chegar.
   */
  const [overlayBriefs, setOverlayBriefs] = useState<RadarBriefRecord[]>([]);
  /*
   * O RITMO DO TIQUE LÊ UMA REF, e não o estado.
   *
   * `aguardandoAlgo` é derivado do que o próprio hook devolveu; passá-lo como
   * prop criaria a dependência circular leitura → estado → leitura. A ref
   * carrega o valor da volta anterior, que é o que a política precisa saber.
   */
  const pendenteRef = useRef(false);
  const lerPendente = useCallback(() => pendenteRef.current, []);
  const [selectedExpertId, setSelectedExpertId] = useState("");
  const [selectedBriefId, setSelectedBriefId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(articleTitle));
  const [draftOpen, setDraftOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"save" | "review" | "suggestions" | "send" | "requirement" | "">("");
  const [creatingRequirementId, setCreatingRequirementId] = useState<string | null>(null);
  /**
   * O CONVITE VIVE NESTA SESSÃO, e isso é deliberado.
   *
   * O token é gravado como hash: o servidor não consegue devolvê-lo depois, e
   * guardá-lo em claro seria transformar um segredo de uso único em dado
   * persistido. Perdeu o link? Clicar de novo emite outro para a MESMA pauta —
   * por isso a rota é idempotente na pauta e não no token.
   */
  const [invites, setInvites] = useState<Record<string, { link: string | null; message: string; connected: boolean }>>({});
  /**
   * A CONSULTA LIDA DO BANCO — a autoridade que sobrevive ao F5.
   *
   * `invites` guarda o link, que só existe na resposta do POST e morre com a
   * aba. Isto aqui guarda o que o servidor sabe: quem é o participante, qual
   * é a pauta, se o convite ainda está aberto, se alguém entrou. É o que faz
   * a tela recém-carregada mostrar a consulta em vez de pedir um cadastro.
   */

  /**
   * O @username DO BOT, LIDO DA PLATAFORMA — SPECIALIST_2.1.2.
   *
   * A tela deduzia "o bot está confirmado?" a partir de `invite.link` ter vindo
   * nulo num POST anterior. Depois de confirmar o Bot no Admin, o Radar
   * continuava repetindo o aviso: ele estava lendo o resultado de uma AÇÃO
   * velha, não o ESTADO atual da integração.
   *
   * A autoridade é `integration_connections.metadata.telegram.bot_username`,
   * a mesma que o Admin mostra, projetada pelo GET desta área.
   */
  const [copied, setCopied] = useState("");
  /*
   * O GUARDA FECHA A PORTA ANTES DO PRIMEIRO `await`.
   *
   * Estado de render chega tarde: dois cliques dentro do mesmo tique veem o
   * mesmo `busy` vazio e disparam dois POST. Os dois correm em paralelo, e a
   * guarda da rota — que lê o que já está gravado — não enxerga a inserção do
   * irmão. O especialista receberia a mesma dúvida duas vezes.
   */
  const criandoPauta = useRef<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newQuestion, setNewQuestion] = useState("");
  /** A contribuição cuja classificação está aberta para correção — §5. */
  const [editandoClassificacao, setEditandoClassificacao] = useState("");
  const [decidindo, setDecidindo] = useState("");

  const contextPayload = useMemo(() => context ? buildRadarExpertBriefContext(context) : null, [context]);
  const initialQuestions = useMemo(() => normalizeRadarExpertBriefQuestions(suggestedQuestions), [suggestedQuestions]);
  const canLoad = Boolean(brandId && articleId && articleDnaVersionId && context);

  /**
   * A ÁREA ESPECIALISTA, LIDA DE UMA VEZ — RADAR_LIVE_UX_2.1 · §2.
   *
   * Eram dois efeitos independentes, cada um com o seu `AbortController` e o
   * seu ciclo. Duas leituras da MESMA área, disparadas em sequência de render:
   * uma podia terminar com o estado da outra ainda pela metade, e nada as
   * reunia num instante coerente.
   *
   * Agora é UMA função de refetch, com os dois GET em PARALELO. Eles continuam
   * separados porque respondem a permissões diferentes — `expert-briefs` lista
   * a Marca, `expert-consultations` projeta a consulta — mas quem espera pelos
   * dois é o mesmo `Promise.all`, e o resultado entra no cache junto.
   */
  const carregarArea = useCallback(async (signal: AbortSignal) => {
    const params = new URLSearchParams({ brandId, articleId, articleDnaVersionId });
    const opcoes = { headers: { Accept: "application/json" }, cache: "no-store" as const, signal };

    const [respostaBriefs, respostaConsultas] = await Promise.all([
      fetch(`/api/editorial/expert-briefs?${params.toString()}`, opcoes),
      fetch(`/api/editorial/expert-consultations?${params.toString()}`, opcoes),
    ]);

    const payload = await respostaBriefs.json().catch(() => ({}));
    if (!respostaBriefs.ok) throw new Error(recordValue(asObject(payload)?.error) || "Não foi possível carregar os especialistas da Marca.");

    /*
     * A PROJEÇÃO DA CONSULTA PODE FALTAR SEM DERRUBAR A ÁREA.
     *
     * Ela acrescenta o estado do convite; sem ela a área ainda mostra pautas e
     * respostas. Tratar as duas com a mesma severidade deixaria o operador sem
     * nada por causa da parte menos crítica.
     */
    const consultasPayload = respostaConsultas.ok ? await respostaConsultas.json().catch(() => ({})) : {};

    const lista = (valor: unknown): unknown[] => (Array.isArray(valor) ? valor : []);
    return {
      experts: lista(payload.experts).map(parseExpert).filter((item): item is RadarExpertRecord => Boolean(item && item.status === "active" && item.brandId === brandId)),
      bindings: lista(payload.bindings).map(parseBinding).filter((item): item is RadarBindingSummary => Boolean(item && item.status === "active")),
      briefs: lista(payload.briefs).map(parseBrief).filter((item): item is RadarBriefRecord => Boolean(item && radarExpertBriefMatchesContext(item, { brandId, articleId, articleDnaVersionId }))),
      contributions: lista(payload.contributions).map(parseContribution).filter((item): item is RadarExpertContributionRecord => Boolean(item && item.brandId === brandId)),
      consultations: lista((consultasPayload as Record<string, unknown>).consultations).map(parseConsultation).filter((item): item is RadarConsultationView => Boolean(item)),
      botUsername: optionalRecordValue((consultasPayload as Record<string, unknown>).botUsername),
    };
  }, [articleDnaVersionId, articleId, brandId]);

  /**
   * A LEITURA VIVA DA ÁREA — RADAR_LIVE_UX_2.1 · §3 e §4.
   *
   * O Realtime é o sinal preferido; o tique entra quando ele não está
   * disponível — e não dá para saber de antemão se estas tabelas estão na
   * publication. Os dois caminhos chamam `carregarArea`, que é a autoridade.
   *
   * O payload do evento NUNCA vira estado: um INSERT bruto não conhece a
   * projeção nem as permissões que o read-model aplica.
   */
  const leituraDaArea = useRadarAreaLiveRead({
    area: "specialist",
    brandId, articleId, articleDnaVersionId,
    tables: RADAR_SPECIALIST_LIVE_TABLES,
    load: carregarArea,
    open: true,
    pending: lerPendente,
    enabled: canLoad,
  });

  const experts = leituraDaArea.data?.experts || VAZIO_EXPERTS;
  const bindings = leituraDaArea.data?.bindings || VAZIO_BINDINGS;
  const contributions = leituraDaArea.data?.contributions || VAZIO_CONTRIBUICOES;
  const consultations = leituraDaArea.data?.consultations || VAZIO_CONSULTAS;
  const botUsername = leituraDaArea.data?.botUsername ?? null;
  const loading = leituraDaArea.loading;

  /**
   * O OVERLAY DA PAUTA — uma escrita já confirmada, antes da próxima leitura.
   *
   * Salvar, aprovar ou enviar devolve o readback remoto: aquilo JÁ é verdade,
   * e esperar o refetch para mostrar deixaria o botão parecendo sem efeito. O
   * overlay some sozinho quando a leitura seguinte traz a mesma pauta.
   */
  const briefs = useMemo(() => {
    const base = leituraDaArea.data?.briefs || VAZIO_BRIEFS;
    if (!overlayBriefs.length) return base;
    const porId = new Map(base.map(item => [item.id, item]));
    for (const item of overlayBriefs) porId.set(item.id, item);
    return [...porId.values()];
  }, [leituraDaArea.data, overlayBriefs]);

  /*
   * QUANDO VALE OLHAR MAIS DE PERTO — RADAR_LIVE_UX_2.1 · §6.
   *
   * Convite aberto esperando alguém entrar, pauta enviada sem resposta, áudio
   * em processamento: são os estados em que alguém está esperando algo mudar.
   * Fora deles, perguntar a cada poucos segundos gasta leitura para confirmar
   * que nada aconteceu.
   */
  const aguardandoAlgo = useMemo(() => {
    if (consultations.some(item => !item.connected && item.invite.state === "OPEN")) return true;
    if (briefs.some(item => item.sentAt && !item.completedAt)) return true;
    return contributions.some(item => item.processingStatus === "PENDING_LOCAL_PROCESSING" || item.processingStatus === "PROCESSING");
  }, [briefs, consultations, contributions]);
  useEffect(() => { pendenteRef.current = aguardandoAlgo; }, [aguardandoAlgo]);
  const selectedExpert = experts.find(expert => expert.id === selectedExpertId) || null;
  const expertName = useCallback((expertId: string | null) => experts.find(expert => expert.id === expertId)?.displayName || "Especialista não identificado", [experts]);
  const scopedBriefs = useMemo(() => briefs.filter(brief => brief.expertId === selectedExpertId && radarExpertBriefMatchesContext(brief, { brandId, expertId: selectedExpertId || undefined, articleId, articleDnaVersionId })), [articleDnaVersionId, articleId, brandId, briefs, selectedExpertId]);
  const activeBrief = selectedBriefId ? briefs.find(brief => brief.id === selectedBriefId && brief.expertId === selectedExpertId && radarExpertBriefMatchesContext(brief, { brandId, expertId: selectedExpertId, articleId, articleDnaVersionId })) || null : null;

  /*
   * AS RESPOSTAS DO ARTIGO INTEIRO, NÃO SÓ AS DA PAUTA ABERTA.
   *
   * Enquanto a leitura era presa ao brief selecionado, uma contribuição que
   * chegou por outra pauta do mesmo artigo não existia para a tela nem para os
   * contadores — e "0 contribuições" aparecia com a resposta já no banco.
   */
  const briefIds = useMemo(() => new Set(briefs.map(brief => brief.id)), [briefs]);
  const articleContributions = useMemo(
    () => contributions.filter(contribution => briefIds.has(contribution.briefId)).slice().sort((left, right) => Date.parse(right.receivedAt) - Date.parse(left.receivedAt)),
    [briefIds, contributions],
  );
  const contributionsByBrief = useMemo(() => {
    const mapa = new Map<string, RadarExpertContributionRecord[]>();
    for (const contribution of articleContributions) {
      const lista = mapa.get(contribution.briefId) || [];
      lista.push(contribution);
      mapa.set(contribution.briefId, lista);
    }
    return mapa;
  }, [articleContributions]);

  /**
   * AS DECISÕES HUMANAS, LIDAS DO REMOTO — SPECIALIST_3 · §13.
   *
   * Elas moram no `radar_context` de cada pauta, que já chega nesta leitura.
   * Derivar daqui, em vez de guardar em estado, é o que faz F5, troca de
   * artigo, sessão nova e troca entre local e Vercel mostrarem a MESMA coisa:
   * nenhuma delas passa pelo navegador onde alguém clicou.
   */
  const reviews = useMemo<Record<string, ExpertReview>>(() => {
    const total: Record<string, ExpertReview> = {};
    for (const brief of briefs) Object.assign(total, radarSpecialistReviewsOf(brief.radarContext));
    return total;
  }, [briefs]);

  const decisionOf = useCallback((contributionId: string): RadarSpecialistDecision => reviews[contributionId]?.decision || "NOT_APPROVED", [reviews]);

  /* A leitura única das pautas: contadores e pontos falam do mesmo conjunto. */
  const vinculados = useMemo(() => new Set(bindings.filter(item => item.status === "active").map(item => item.expertId)), [bindings]);
  const briefReadings = useMemo<RadarSpecialistBriefReading[]>(() => briefs.map(brief => {
    const recebidas = contributionsByBrief.get(brief.id) || [];
    return {
      id: brief.id,
      expertId: brief.expertId,
      status: brief.status,
      sentAt: brief.sentAt,
      requirementId: radarSpecialistRequirementIdOf(brief.radarContext),
      contributionIds: recebidas.map(item => item.id),
      acceptedContributionIds: recebidas.filter(item => radarSpecialistDecisionIsActive(decisionOf(item.id))).map(item => item.id),
      /*
       * CONECTADO É FATO DO BANCO: existe vínculo Telegram ativo para este
       * participante. CONVIDADO é fato da pauta: ela nasceu de uma consulta.
       * Nenhum dos dois é envio — `sent_at` continua sozinho nesse papel.
       */
      connected: vinculados.has(brief.expertId),
      invited: Boolean(radarSpecialistConsultationOf(brief.radarContext)),
    };
  }), [briefs, contributionsByBrief, decisionOf, vinculados]);

  const counters = useMemo(() => radarSpecialistCounters({ requirements, briefs: briefReadings }), [briefReadings, requirements]);
  const reviewPoints = useMemo(() => radarSpecialistReviewPoints({ requirements, briefs: briefReadings }), [briefReadings, requirements]);
  const requirementByBriefId = useMemo(() => new Map(briefReadings.map(item => [item.id, item.requirementId])), [briefReadings]);
  /**
   * AS PAUTAS SEM PONTO — as únicas que não têm card próprio onde morar.
   *
   * Toda pauta nascida de um ponto de revisão aparece no card daquele ponto, e
   * listá-la de novo numa segunda seção era a duplicação do §1.
   */
  const pautasAvulsas = useMemo(() => briefs.filter(brief => !radarSpecialistRequirementIdOf(brief.radarContext)), [briefs]);
  const briefById = useMemo(() => new Map(briefs.map(brief => [brief.id, brief])), [briefs]);
  const requirementById = useMemo(() => new Map(requirements.map(item => [item.requirementId, item])), [requirements]);
  const consultationByRequirement = useMemo(() => new Map(consultations.filter(item => item.requirementId).map(item => [item.requirementId as string, item])), [consultations]);

  /**
   * O PONTO DE REVISÃO DE UMA CONTRIBUIÇÃO — derivado, nunca perguntado (§4).
   *
   * A contribuição sabe a pauta, a pauta sabe o ponto, o ponto sabe o assunto.
   * O select "Relacionar à necessidade" perguntava exatamente isto, e oferecia
   * `competitor:aHR0cHM6…` como alternativa de resposta.
   *
   * A associação manual só entra quando NÃO há o que derivar — uma resposta
   * que chegou por pauta avulsa — e nesse caso ela vence, porque foi uma
   * pessoa que a fez.
   */
  const requirementOfContribution = useCallback((contribution: RadarExpertContributionRecord) => {
    const manual = reviews[contribution.id]?.relatedRequirementId || null;
    const automatico = requirementByBriefId.get(contribution.briefId) || null;
    const requirementId = manual || automatico;
    return { requirementId, requirement: requirementId ? requirementById.get(requirementId) || null : null, manual: Boolean(manual) };
  }, [requirementByBriefId, requirementById, reviews]);

  /**
   * A CONTRIBUIÇÃO EXTRAÍDA — SPECIALIST_3 · §7, e ela não aprova nada (§8).
   *
   * Classificação sugerida, síntese recortada do que foi dito, aplicação
   * editorial derivada do ponto. `humanDecision` entra a partir do que está
   * GRAVADO: esta projeção não tem como promover coisa nenhuma a evidência, o
   * que é de propósito — se tivesse, reabrir a tela criaria evidência sozinha.
   */
  const extractionOf = useCallback((contribution: RadarExpertContributionRecord) => {
    const { requirementId, requirement } = requirementOfContribution(contribution);
    const review = reviews[contribution.id] || REVISAO_PENDENTE;
    const card = requirement ? radarSpecialistReviewCard(requirement) : null;
    return radarSpecialistExtraction({
      contributionId: contribution.id,
      expertId: contribution.expertId,
      briefId: contribution.briefId,
      requirementId,
      requirementKind: requirement?.kind || null,
      requirementTopic: requirement?.topic || null,
      requirementClaim: requirement?.claim || null,
      requirementQuestion: card?.question || requirement?.specificQuestion || null,
      sourceType: contribution.sourceType,
      originalText: contribution.originalText,
      transcriptText: contribution.transcriptText,
      organizationPayload: contribution.organizationPayload,
      externalUpdateId: contribution.externalUpdateId,
      originalAssetUri: contribution.originalAssetUri,
      checksum: contribution.checksum,
      receivedAt: contribution.receivedAt,
      decision: review.decision,
      classification: review.classification,
    });
  }, [requirementOfContribution, reviews]);

  const pendingContributionCount = articleContributions.filter(contribution => decisionOf(contribution.id) === "NOT_APPROVED").length;
  const selectedEvidenceCount = articleContributions.filter(contribution => radarSpecialistDecisionIsActive(decisionOf(contribution.id))).length;
  const briefLocked = Boolean(activeBrief && ["awaiting_expert", "receiving", "awaiting_review"].includes(activeBrief.status));
  const bindingConfigured = Boolean(selectedExpertId && bindings.some(binding => binding.expertId === selectedExpertId && binding.status === "active"));
  const canSave = Boolean(selectedExpertId && draftOpen && draft.title.trim() && contextPayload && !busy && !briefLocked);
  const canReview = Boolean(activeBrief && draftOpen && draft.title.trim() && !busy && !briefLocked);
  const canSend = Boolean(activeBrief && activeBrief.status === "reviewed" && !dirty && bindingConfigured && draft.questions.length && !busy);
  /** Ordenar só existe quando há ordem: com uma pergunta, Subir/Descer somem — §3. */
  const controlesDePergunta = radarSpecialistQuestionControls(draft.questions.length);

  useEffect(() => {
    const evidence: RadarR6ExpertEvidenceInput[] = articleContributions.map(contribution => {
      const extracao = extractionOf(contribution);
      return {
        id: contribution.id,
        contributionId: contribution.id,
        /* A síntese extraída, e não mais o texto cru: é ela que o relatório lê. */
        summary: extracao.extractedSummary || "Contribuição recebida sem texto disponível.",
        reviewed: extracao.humanDecision !== "NOT_APPROVED",
        decision: radarSpecialistDecisionToProjection(extracao.humanDecision),
        classification: extracao.classification,
        /* A necessidade vem do ponto de revisão, não de um select preenchido à mão. */
        need: extracao.requirementId,
        sourceType: contribution.sourceType,
      };
    });
    const canonicalEvidence: RadarExpertEvidence[] = [];
    let blockedEvidenceCount = 0;
    for (const contribution of articleContributions) {
      const brief = briefById.get(contribution.briefId);
      if (!brief) continue;
      /* A projeção canônica fala o enum antigo; a tradução mora no domínio. */
      const review: RadarExpertEvidenceReview = { decision: radarSpecialistDecisionToProjection(decisionOf(contribution.id)) };
      const projected = projectRadarExpertEvidence({ brandId, articleId, articleDnaVersionId, brief, contribution, review });
      if (projected.evidence) canonicalEvidence.push(projected.evidence);
      /*
       * DECIDIDA E NÃO PROMOVIDA É BLOQUEIO, qualquer que seja o motivo.
       *
       * `pending_review` é o estado normal de quem ainda não decidiu e não
       * conta. Os outros dois são contribuições que UMA PESSOA já aceitou e
       * que mesmo assim não viraram evidência — e é isso que precisa travar a
       * aprovação do relatório, em vez de sumir da contagem.
       */
      if (projected.reason && projected.reason !== "pending_review") blockedEvidenceCount += 1;
    }
    onExpertEvidenceChange?.(articleId, evidence, { contributionCount: articleContributions.length, pendingCount: pendingContributionCount, remote: true, canonicalEvidence, blockedEvidenceCount, articleDnaVersionId, counters });
  }, [articleContributions, articleDnaVersionId, articleId, brandId, briefById, counters, decisionOf, extractionOf, onExpertEvidenceChange, pendingContributionCount]);

  const setDraftValue = (update: (current: Draft) => Draft) => {
    setDraft(current => update(current));
    setDirty(true);
    setNotice("");
  };

  const selectExpert = (expertId: string) => {
    setSelectedExpertId(expertId);
    setSelectedBriefId(null);
    setDraft(emptyDraft(articleTitle));
    setDraftOpen(false);
    setDirty(false);
    setNotice("");
    setError("");
  };

  const openBrief = useCallback((brief: RadarBriefRecord) => {
    setSelectedExpertId(brief.expertId);
    setSelectedBriefId(brief.id);
    setDraft({ title: brief.title, questions: normalizeRadarExpertBriefQuestions(brief.questions) });
    setDraftOpen(true);
    setDirty(false);
    setNotice("");
  }, []);

  const selectBrief = (briefId: string) => {
    if (!briefId) {
      setSelectedBriefId(null);
      setDraft(emptyDraft(articleTitle, initialQuestions));
      setDraftOpen(false);
      setDirty(false);
      return;
    }
    const brief = scopedBriefs.find(item => item.id === briefId);
    if (brief) openBrief(brief);
  };

  const createDraft = () => {
    if (!selectedExpert) {
      setError("Selecione um especialista antes de criar a pauta.");
      return;
    }
    setSelectedBriefId(null);
    setDraft(emptyDraft(articleTitle, initialQuestions));
    setDraftOpen(true);
    setDirty(true);
    setError("");
    setNotice("Pauta de trabalho aberta. Salve para criar o ExpertBrief remoto.");
  };

  const updateQuestion = (questionId: string, text: string) => setDraftValue(current => ({ ...current, questions: current.questions.map(question => question.id === questionId ? { ...question, text } : question) }));
  const removeQuestion = (questionId: string) => setDraftValue(current => ({ ...current, questions: current.questions.filter(question => question.id !== questionId) }));
  const moveQuestion = (questionId: string, direction: -1 | 1) => setDraftValue(current => {
    const index = current.questions.findIndex(question => question.id === questionId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= current.questions.length) return current;
    const questions = current.questions.slice();
    [questions[index], questions[nextIndex]] = [questions[nextIndex], questions[index]];
    return { ...current, questions };
  });

  const addQuestion = () => {
    const text = newQuestion.replace(/\s+/g, " ").trim();
    if (!text) return;
    setDraftValue(current => ({ ...current, questions: [...current.questions, { id: localQuestionId(), text, origin: "human", need: null, reference: null, justification: null }] }));
    setNewQuestion("");
  };

  const generateSuggestions = async () => {
    if (!context || !draftOpen) return;
    setBusy("suggestions");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/editorial/radar-topics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId, articleId, articleDnaVersionId, context }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(recordValue(asObject(payload)?.error) || "Não foi possível gerar sugestões para esta pauta.");
      const suggestions = parseRadarR7TopicResponse(context, payload);
      setDraftValue(current => ({ ...current, questions: suggestions.map((suggestion: RadarR7TopicSuggestion, index) => questionFromRadarSuggestion(suggestion, index)) }));
      setNotice("Sugestões geradas para esta cópia de trabalho. Revise-as antes de salvar.");
    } catch (suggestionError) {
      setError(errorMessage(suggestionError, "Não foi possível gerar sugestões para esta pauta."));
    } finally {
      setBusy("");
    }
  };

  const persist = async (status: "reviewed" | undefined, operation: "created" | "saved" | "reviewed") => {
    if (!selectedExpertId || !contextPayload || !draft.title.trim()) return;
    setBusy(operation === "reviewed" ? "review" : "save");
    setError("");
    setNotice("");
    try {
      const body = {
        brandId,
        expertId: selectedExpertId,
        articleId,
        articleDnaVersionId,
        title: draft.title.trim(),
        /* Editar a pauta não pode apagar de onde ela veio. */
        radarContext: activeBrief ? { ...activeBrief.radarContext, ...contextPayload } : contextPayload,
        questions: draft.questions,
        ...(status ? { status } : activeBrief?.status === "reviewed" ? { status: "draft" } : {}),
        ...(selectedBriefId ? { briefId: selectedBriefId } : {}),
      };
      const response = await fetch("/api/editorial/expert-briefs", { method: selectedBriefId ? "PATCH" : "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(recordValue(asObject(payload)?.error) || "Não foi possível persistir a pauta.");
      if (payload.persistence !== "remote_readback_confirmed") throw new Error("A confirmação remota da pauta não retornou um readback compatível.");
      const persisted = parseBrief(payload.brief);
      if (!persisted || !radarExpertBriefMatchesContext(persisted, { brandId, expertId: selectedExpertId, articleId, articleDnaVersionId })) throw new Error("O readback retornou uma pauta fora do contexto selecionado.");
      setOverlayBriefs(current => [persisted, ...current.filter(brief => brief.id !== persisted.id)]);
      leituraDaArea.refresh();
      setSelectedBriefId(persisted.id);
      setDraft({ title: persisted.title, questions: normalizeRadarExpertBriefQuestions(persisted.questions) });
      setDraftOpen(true);
      setDirty(false);
      setNotice(operation === "created" ? "Pauta criada e confirmada por readback remoto. Nenhuma mensagem Telegram foi enviada." : operation === "reviewed" ? "Pauta aprovada para envio e confirmada por readback remoto." : "Pauta salva e confirmada por readback remoto.");
    } catch (persistError) {
      setError(errorMessage(persistError, "Não foi possível persistir a pauta."));
    } finally {
      setBusy("");
    }
  };

  /**
   * O PONTO DE REVISÃO VIRA CONSULTA — SPECIALIST_2.1.
   *
   * A pergunta enviada é a `specificQuestion` que a investigação já escreveu,
   * a partir do conflito ou da lacuna concretos daquele claim. Nada de IA aqui:
   * trocar uma pergunta fundamentada por uma inventada esvaziaria o motivo de
   * consultar um profissional.
   *
   * O QUE MUDOU: não é mais preciso escolher um especialista cadastrado antes.
   * A rota cria o participante externo provisório, a pauta e o token de convite
   * no mesmo ato — e devolve o deep link para o operador COPIAR. Quem convida
   * não precisa sair do Radar para preencher um formulário sobre alguém que
   * ainda não aceitou revisar nada.
   *
   * O QUE ESTA AÇÃO NÃO FAZ, e é o ponto inteiro do gate: não envia Telegram,
   * não marca como aprovada, não escreve `sent_at`, não abre nenhum app. Ela
   * cria um convite — e PREPARED continua diferente de SENT do outro lado do
   * clique.
   */
  const createConsultationFromRequirement = async (requirement: RadarFrozenSpecialistRequirement, action: "create" | "reissue" = "create") => {
    if (!contextPayload) return;
    if (criandoPauta.current) return;
    criandoPauta.current = requirement.requirementId;
    setBusy("requirement");
    setCreatingRequirementId(requirement.requirementId);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/editorial/expert-consultations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ brandId, articleId, articleDnaVersionId, requirement, radarContext: contextPayload, action }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(recordValue(asObject(payload)?.error) || "Não foi possível criar a consulta deste ponto de revisão.");
      const persisted = parseBrief(payload.brief);
      if (!persisted || !radarExpertBriefMatchesContext(persisted, { brandId, articleId, articleDnaVersionId })) throw new Error("O readback retornou uma pauta fora do contexto selecionado.");
      setOverlayBriefs(current => [persisted, ...current.filter(brief => brief.id !== persisted.id)]);
      leituraDaArea.refresh();

      const convite = asObject(payload.invite);
      const link = convite ? optionalRecordValue(convite.link) : null;
      setInvites(current => ({
        ...current,
        [requirement.requirementId]: {
          link,
          message: convite ? recordValue(convite.message) : "",
          connected: Boolean(payload.connected),
        },
      }));
      /* A projeção remota é relida: a tela não fica dependendo do que lembrou. */
      leituraDaArea.refresh();
      setNotice(payload.connected
        ? "O especialista desta consulta já está conectado. Nenhum link novo foi gerado."
        : link
          ? action === "reissue" ? "Link novo gerado. O anterior foi revogado." : "Consulta criada. Copie o link e compartilhe com o especialista — nada foi enviado."
          : "Consulta criada, mas o link não pôde ser montado: confirme o username do Bot no Admin.");
    } catch (requirementError) {
      setError(errorMessage(requirementError, "Não foi possível criar a consulta deste ponto de revisão."));
    } finally {
      criandoPauta.current = null;
      setBusy("");
      setCreatingRequirementId(null);
    }
  };

  /**
   * APROVAR A PAUTA DE ONDE ELA É LIDA — SPECIALIST_3 · §1.
   *
   * "Enviar pauta" ficava desabilitado até o brief estar `reviewed`, e a
   * aprovação só existia dentro do editor, atrás de "Abrir pauta", no fim da
   * coluna. O critério estava certo e era invisível: de fora, o botão parecia
   * quebrado — foi exatamente essa a leitura do runtime.
   *
   * A aprovação continua sendo ato humano explícito e continua exigindo pelo
   * menos uma pergunta. O que mudou é ela acontecer no card do ponto, onde a
   * pessoa está olhando, com o texto da pauta que o banco tem — e não com o
   * rascunho que o editor tiver em mãos.
   */
  const aprovarPauta = async (brief: RadarBriefRecord) => {
    setBusy("review");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/editorial/expert-briefs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          brandId,
          expertId: brief.expertId,
          articleId,
          articleDnaVersionId,
          briefId: brief.id,
          title: brief.title,
          radarContext: brief.radarContext,
          questions: brief.questions,
          status: "reviewed",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(recordValue(asObject(payload)?.error) || "Não foi possível aprovar esta pauta para envio.");
      if (payload.persistence !== "remote_readback_confirmed") throw new Error("A aprovação não retornou confirmação remota da pauta.");
      const persisted = parseBrief(payload.brief);
      if (!persisted || !radarExpertBriefMatchesContext(persisted, { brandId, articleId, articleDnaVersionId })) throw new Error("O readback da aprovação retornou uma pauta fora do contexto selecionado.");
      setOverlayBriefs(current => [persisted, ...current.filter(item => item.id !== persisted.id)]);
      leituraDaArea.refresh();
      setNotice("Pauta aprovada para envio. Nada foi enviado ainda.");
    } catch (approveError) {
      setError(errorMessage(approveError, "Não foi possível aprovar esta pauta para envio."));
    } finally {
      setBusy("");
    }
  };

  /**
   * ENVIAR A PAUTA — a única ação que escreve `sent_at`.
   *
   * Recebe pauta e participante por argumento porque a consulta do card não
   * passa pelo editor: exigir que alguém "abrisse" a pauta antes de enviá-la
   * era resquício do fluxo em que o especialista era escolhido à mão.
   *
   * A confirmação remota é obrigatória: sem o readback, "enviado" seria só a
   * tentativa HTTP — e uma pauta apareceria como pedida sem ninguém ter
   * recebido nada.
   */
  const enviarPauta = async (briefId: string, expertIdDaPauta: string) => {
    setBusy("send");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/editorial/expert-briefs/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ brandId, expertId: expertIdDaPauta, briefId, articleId, articleDnaVersionId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(recordValue(asObject(payload)?.error) || "Não foi possível enviar a pauta ao especialista.");
      if (payload.persistence !== "remote_readback_confirmed") throw new Error("O envio não retornou confirmação remota da pauta.");
      const persisted = parseBrief(payload.brief);
      if (!persisted || !radarExpertBriefMatchesContext(persisted, { brandId, expertId: expertIdDaPauta, articleId, articleDnaVersionId })) throw new Error("O readback do envio retornou uma pauta fora do contexto selecionado.");
      setOverlayBriefs(current => [persisted, ...current.filter(brief => brief.id !== persisted.id)]);
      leituraDaArea.refresh();
      if (selectedBriefId === persisted.id) { setDraft({ title: persisted.title, questions: normalizeRadarExpertBriefQuestions(persisted.questions) }); setDirty(false); }
      leituraDaArea.refresh();
      setNotice(payload.send === "already_confirmed" ? "Esta pauta já havia sido enviada; nenhum novo envio foi feito." : "Pauta enviada ao especialista e confirmada por readback remoto.");
    } catch (sendError) {
      setError(errorMessage(sendError, "Não foi possível enviar a pauta ao especialista."));
    } finally {
      setBusy("");
    }
  };

  const sendToTelegram = async () => {
    if (!activeBrief || !canSend) return;
    setBusy("send");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/editorial/expert-briefs/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ brandId, expertId: selectedExpertId, briefId: activeBrief.id, articleId, articleDnaVersionId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(recordValue(asObject(payload)?.error) || "Não foi possível enviar a pauta ao especialista.");
      if (payload.persistence !== "remote_readback_confirmed") throw new Error("O envio não retornou confirmação remota da pauta.");
      const persisted = parseBrief(payload.brief);
      if (!persisted || !radarExpertBriefMatchesContext(persisted, { brandId, expertId: selectedExpertId, articleId, articleDnaVersionId })) throw new Error("O readback do envio retornou uma pauta fora do contexto selecionado.");
      setOverlayBriefs(current => [persisted, ...current.filter(brief => brief.id !== persisted.id)]);
      leituraDaArea.refresh();
      setDraft({ title: persisted.title, questions: normalizeRadarExpertBriefQuestions(persisted.questions) });
      setDirty(false);
      setNotice(payload.send === "already_confirmed" ? "Esta pauta já havia sido enviada; nenhum novo envio foi feito." : "Pauta enviada ao especialista e confirmada por readback remoto.");
    } catch (sendError) {
      setError(errorMessage(sendError, "Não foi possível enviar a pauta ao especialista."));
    } finally {
      setBusy("");
    }
  };

  /**
   * COPIAR É A ÚNICA AÇÃO — o gate proíbe abrir ou enviar qualquer coisa.
   *
   * `navigator.clipboard` exige contexto seguro e pode ser recusado pelo
   * navegador; nesse caso o erro precisa aparecer, senão o operador sai
   * achando que copiou e cola um link vazio no WhatsApp do especialista.
   */
  const copiar = async (valor: string, requirementId: string, tipo: "link" | "mensagem") => {
    if (!valor) return;
    try {
      await navigator.clipboard.writeText(valor);
      setCopied(`${requirementId}:${tipo}`);
      setError("");
    } catch {
      setCopied("");
      setError(`Não foi possível copiar o ${tipo}. Copie manualmente do campo de proveniência.`);
    }
  };

  /**
   * A DECISÃO HUMANA VAI PARA O SERVIDOR — SPECIALIST_3 · §6 e §13.
   *
   * Era `setReviews` num `useState` espelhado em `localStorage`. O clique
   * parecia funcionar e sobrevivia ao F5, mas a decisão morava no navegador:
   * abrir o mesmo artigo na Vercel depois de decidir no local mostrava tudo
   * "aguardando decisão" outra vez.
   *
   * Agora o clique é uma escrita remota com readback obrigatório, e a tela só
   * muda depois que o servidor confirma o que gravou. Enquanto ela não
   * confirma, a decisão anterior continua na tela — nunca uma falsa.
   */
  const registrarDecisao = async (contribution: RadarExpertContributionRecord, update: {
    decision?: RadarSpecialistDecision;
    classification?: RadarSpecialistClassification | null;
    relatedRequirementId?: string | null;
  }) => {
    const atual = reviews[contribution.id] || REVISAO_PENDENTE;
    setDecidindo(contribution.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/editorial/expert-contributions/review", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          brandId, articleId, articleDnaVersionId,
          briefId: contribution.briefId,
          contributionId: contribution.id,
          decision: update.decision ?? atual.decision,
          classification: update.classification !== undefined ? update.classification : atual.classification,
          relatedRequirementId: update.relatedRequirementId !== undefined ? update.relatedRequirementId : atual.relatedRequirementId,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(recordValue(asObject(payload)?.error) || "Não foi possível gravar a decisão sobre esta contribuição.");
      if (payload.persistence !== "remote_readback_confirmed") throw new Error("A decisão não retornou confirmação remota.");
      const persisted = parseBrief(payload.brief);
      if (!persisted || !radarExpertBriefMatchesContext(persisted, { brandId, articleId, articleDnaVersionId })) throw new Error("O readback da decisão retornou uma pauta fora do contexto selecionado.");
      setOverlayBriefs(current => [persisted, ...current.filter(brief => brief.id !== persisted.id)]);
      leituraDaArea.refresh();
      setEditandoClassificacao("");
    } catch (reviewError) {
      setError(errorMessage(reviewError, "Não foi possível gravar a decisão sobre esta contribuição."));
    } finally {
      setDecidindo("");
    }
  };

  if (!context) return <section className={surface} aria-label="ExpertBrief indisponível"><h3 className="text-base font-semibold text-foreground">ExpertBrief</h3><p className="mt-2 text-sm text-text-muted">ArticleDNA não está hidratado para este artigo. A seleção de especialista e qualquer chamada de IA permanecem bloqueadas.</p></section>;

  /*
   * AS OPÇÕES DE ASSOCIAÇÃO MANUAL SÃO OS PONTOS, NÃO O INTERNO — §4 e §12.
   *
   * O select antigo listava `context.serpNeeds` e `context.openGaps` inteiros:
   * `competitor:aHR0cHM6Ly93d3c…: marketplace / success`, `article_editorial /
   * success`, tópicos de benchmark. É diagnóstico do Radar, não vocabulário de
   * quem revisa — e nenhuma daquelas linhas é uma necessidade do artigo.
   *
   * O que se pode associar a uma resposta é um PONTO DE REVISÃO deste artigo,
   * com o título que uma pessoa lê. Nada mais entra na lista.
   */
  const needOptions = reviewPoints.map(point => ({ value: point.requirementId, label: point.title }));
  /*
   * O RESULTADO É AGRUPADO PELO VÍNCULO EFETIVO — automático ou manual (§4).
   *
   * Agrupar por `requirementByBriefId` ignorava a associação manual: uma
   * resposta que alguém ligou a um ponto continuava listada logo abaixo, sob
   * "sem ponto de revisão associado". A tela contradizia a decisão que a
   * própria pessoa tinha acabado de tomar.
   */
  const contributionsByRequirement = new Map<string, RadarExpertContributionRecord[]>();
  const unassignedContributions: RadarExpertContributionRecord[] = [];
  for (const contribution of articleContributions) {
    const { requirementId } = requirementOfContribution(contribution);
    if (!requirementId) { unassignedContributions.push(contribution); continue; }
    contributionsByRequirement.set(requirementId, [...(contributionsByRequirement.get(requirementId) || []), contribution]);
  }
  const resultPoints = reviewPoints.filter(point => (contributionsByRequirement.get(point.requirementId) || []).length > 0);

  /**
   * UMA LINHA DE ESTADO, NA ORDEM DO QUE PEDE ATENÇÃO.
   *
   * O que trava primeiro vem primeiro: sem especialista cadastrado, nada mais
   * importa; com resposta a revisar, é isso que espera uma pessoa. Sem esta
   * ordem, a linha diria "vinculado ao Telegram" enquanto uma contribuição
   * aguardava decisão logo abaixo.
   */
  const estadoOperacional = !experts.length
    ? "Nenhuma consulta criada ainda."
    : !selectedExpert
      ? "Nenhum especialista selecionado."
      : counters.responded > counters.accepted
        ? `${selectedExpert.displayName} · resposta recebida, aguardando sua decisão`
        : counters.waiting > 0
          ? `${selectedExpert.displayName} · aguardando resposta`
          : counters.drafts > 0
            ? `${selectedExpert.displayName} · pauta em rascunho, ainda não enviada`
            : `${selectedExpert.displayName} · ${bindingConfigured ? "vinculado ao Telegram" : "sem vínculo Telegram"}`;

  /**
   * A CONTRIBUIÇÃO, NO FORMATO COMPACTO DO §11.
   *
   * ===================== O QUE SAIU DA VISÃO NORMAL =====================
   *
   * Três colunas lado a lado — Original, Transcrição fiel, Contribuição
   * extraída — para um texto que na prática é o MESMO nas três. E dois selects
   * vazios antes de qualquer decisão: um pedindo uma classificação que ninguém
   * sabia o que significava, outro oferecendo `competitor:aHR0cHM6…` como
   * "necessidade".
   *
   * Agora: quem respondeu, a resposta original recolhida, a contribuição
   * organizada com a classificação JÁ SUGERIDA, onde isso se aplica no artigo,
   * e as quatro decisões. Ids, transcrição e proveniência continuam inteiros —
   * um nível abaixo, em "Detalhes avançados". NADA foi apagado (§12).
   */
  const contributionCard = (contribution: RadarExpertContributionRecord, brief: RadarBriefRecord | null) => {
    const review = reviews[contribution.id] || REVISAO_PENDENTE;
    const extracao = extractionOf(contribution);
    const { requirementId, manual } = requirementOfContribution(contribution);
    const verbatimText = extracao.originalText;
    const originalText = verbatimText || (contribution.originalAssetUri ? "Asset original preservado no armazenamento server-side." : "O material original ainda aguarda preservação.");
    const editandoEste = editandoClassificacao === contribution.id;
    const ocupado = decidindo === contribution.id;

    return <article className="rounded-md border border-divider bg-surface p-3" key={contribution.id} data-testid="radar-specialist-review-contribution">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h5 className="text-sm font-semibold text-foreground">{expertName(contribution.expertId)} · Telegram</h5>
          <p className="mt-1 text-sm text-text-muted">{formatDate(contribution.receivedAt)}{contributionDuration(contribution) ? ` · ${contributionDuration(contribution)}` : ""} · {processingStatusLabel(contribution.processingStatus)}</p>
        </div>
        <span className="shrink-0 rounded-full border border-divider px-2 py-1 text-sm text-text-muted" data-testid="radar-specialist-decision-state">{RADAR_SPECIALIST_DECISION_LABELS[review.decision]}</span>
      </div>

      {/* O ORIGINAL É A AUTORIDADE DE FIDELIDADE — recolhido, jamais substituído. */}
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Resposta original</p>
      <details className="mt-1 rounded-md border border-divider p-2" data-testid="radar-specialist-original-text"><summary className="cursor-pointer text-sm text-text-muted">Ver texto completo</summary><p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-foreground">{originalText}</p></details>

      {/*
        * A CLASSIFICAÇÃO CHEGA SUGERIDA, COM A ORIGEM DECLARADA — §5.
        *
        * O gate proíbe exigir a escolha manual como primeira ação, e proíbe
        * aceitar automaticamente como evidência. As duas coisas convivem: a
        * sugestão aparece pronta e corrigível, e nenhuma delas decide nada.
        */}
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Contribuição organizada</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <strong className="text-sm text-foreground" data-testid="radar-specialist-classification">{RADAR_SPECIALIST_CLASSIFICATION_LABELS[extracao.classification]}</strong>
        <span className="text-sm text-text-muted" data-testid="radar-specialist-classification-source">({RADAR_SPECIALIST_CLASSIFICATION_SOURCE_LABELS[extracao.classificationSource]})</span>
        {!editandoEste && <button type="button" className="text-sm text-context-accent underline underline-offset-2" onClick={() => setEditandoClassificacao(contribution.id)} data-testid="radar-specialist-change-classification">Alterar</button>}
      </div>
      {editandoEste && <label className="mt-2 block text-sm text-foreground">Classificação
        <select value={extracao.classification} disabled={ocupado} onChange={event => void registrarDecisao(contribution, { classification: event.target.value as RadarSpecialistClassification })} className="mt-1 min-h-10 w-full rounded-md border border-divider bg-surface-elevated px-3 py-2 text-sm text-foreground" aria-label="Classificação da contribuição">
          {RADAR_SPECIALIST_CLASSIFICATIONS.map(item => <option value={item} key={item}>{RADAR_SPECIALIST_CLASSIFICATION_LABELS[item]} — {RADAR_SPECIALIST_CLASSIFICATION_HINTS[item]}</option>)}
        </select>
      </label>}
      <blockquote className="mt-2 border-l-2 border-divider pl-3 text-sm leading-5 text-foreground" data-testid="radar-specialist-extracted-summary">{extracao.extractedSummary || "Ainda não organizada; não é evidência aprovada."}</blockquote>

      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Aplicação no artigo</p>
      <p className="mt-1 text-sm text-text-muted" data-testid="radar-specialist-editorial-use">{extracao.editorialUse}{manual ? " (associação manual)" : ""}</p>

      {/*
        * AS QUATRO DECISÕES — e cada clique é uma escrita remota (§6 e §13).
        *
        * Sem texto legível não há o que aceitar: um áudio ainda em transcrição
        * não pode virar evidência, porque ninguém leu o que ele diz. Rejeitar,
        * esse, continua possível — recusar não exige ler o conteúdo inteiro.
        */}
      <div className="mt-3 flex flex-wrap gap-2">{DECISOES.map(item => <button
        type="button"
        key={item.value}
        className={review.decision === item.value ? primaryAction : action}
        onClick={() => void registrarDecisao(contribution, { decision: item.value })}
        disabled={ocupado || (item.value !== "REJECTED" && !verbatimText)}
        data-testid={`radar-specialist-decision-${item.value}`}
      >{ocupado ? "Gravando…" : item.label}</button>)}</div>

      {review.decision === "QUOTE_CANDIDATE" && extracao.quoteCandidate && <blockquote className="mt-3 border-l-2 border-context-accent pl-3 text-sm leading-5 text-foreground" data-testid="radar-specialist-quote">“{extracao.quoteCandidate}”<footer className="mt-1 text-text-muted">Trecho original preservado; timestamps só aparecem quando fornecidos pelo provider.</footer></blockquote>}

      <details className="mt-3 rounded-md border border-divider p-2" data-testid="radar-specialist-contribution-advanced"><summary className="cursor-pointer text-sm font-semibold text-text-muted">Detalhes avançados</summary>
        {/*
          * A ASSOCIAÇÃO MANUAL É EXCEÇÃO, E POR ISSO MORA AQUI — §4.
          *
          * Ela só tem uso quando a resposta chegou por uma pauta avulsa, que
          * não nasceu de ponto nenhum: ali não há o que derivar. Para todo o
          * resto, o vínculo automático já respondeu, e mexer nele é sobrescrever
          * uma verdade do banco com um palpite de tela.
          */}
        {needOptions.length > 0 && <label className="mt-2 block text-sm text-foreground">Relacionar a outro ponto de revisão
          <select value={requirementId || ""} disabled={ocupado} onChange={event => void registrarDecisao(contribution, { relatedRequirementId: event.target.value || null })} className="mt-1 min-h-10 w-full rounded-md border border-divider bg-surface-elevated px-3 py-2 text-sm text-foreground" aria-label="Relacionar a outro ponto de revisão">
            <option value="">Vínculo automático da pauta</option>
            {needOptions.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}
          </select>
        </label>}
        <p className="mt-3 text-sm text-text-muted">Transcrição fiel: {contribution.transcriptText ? "disponível abaixo" : "ainda não disponível; o original permanece preservado."}</p>
        {contribution.transcriptText && <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-text-muted">{contribution.transcriptText}</p>}
        <p className="mt-3 text-sm text-text-muted">Síntese: {extracao.summarySource === "AI_ORGANIZATION" ? "organização revisável da resposta" : extracao.summarySource === "VERBATIM" ? "o próprio texto recebido, sem corte" : "recorte das primeiras frases do texto recebido"}.</p>
        <dl className="mt-3 grid gap-2 text-sm text-text-muted sm:grid-cols-2"><div><dt>contributionId</dt><dd className="break-all text-foreground">{contribution.id}</dd></div><div><dt>briefId</dt><dd className="break-all text-foreground">{brief?.id || contribution.briefId}</dd></div><div><dt>requirementId</dt><dd className="break-all text-foreground">{requirementId || "não associado"}</dd></div><div><dt>externalUpdateId</dt><dd className="break-all text-foreground">{contribution.externalUpdateId}</dd></div><div><dt>originalAssetUri</dt><dd className="break-all text-foreground">{contribution.originalAssetUri || "não disponível"}</dd></div><div><dt>checksum</dt><dd className="break-all text-foreground">{contribution.checksum || "não disponível"}</dd></div><div><dt>Decidida em</dt><dd className="text-foreground">{review.decidedAt ? formatDate(review.decidedAt) : "ainda não decidida"}</dd></div><div><dt>Persistência da decisão</dt><dd className="text-foreground">Remota, no contexto da pauta, confirmada por readback.</dd></div></dl>
      </details>
    </article>;
  };

  return <section className="space-y-3" aria-label="ExpertBrief do artigo selecionado" data-testid="radar-expert-brief-panel">
    {/*
      * O CABEÇALHO RESPONDE UMA PERGUNTA SÓ: em que pé está o especialista.
      *
      * Ele carregava o ArticleDNA, o selo "Pedido ≠ evidência" e um parágrafo
      * explicando a diferença entre pauta, contribuição e evidência. Tudo
      * verdadeiro, e nada disso é decisão: quem abre esta área já sabe onde
      * está, e precisa saber se há ponto preparado, se alguém pediu, e se
      * respondeu. Uma linha, com os números que já vêm do banco.
      */}
    <header className={surface} data-testid="radar-specialist-header">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-base font-semibold text-foreground">Especialista</h3>
        {/*
          * "RESPOSTA" É A MENSAGEM QUE CHEGOU, não a pauta que foi respondida.
          *
          * O resumo mostrava `counters.responded`, que conta PAUTAS com pelo
          * menos uma contribuição. Duas mensagens do especialista na mesma pauta
          * apareciam como "1 resposta" — e quem acabou de receber a segunda lia
          * que nada tinha mudado.
          *
          * O contador do domínio continua igual: `responded` responde "quantas
          * pautas voltaram", que é outra pergunta e tem outros consumidores.
          */}
        <p className="text-sm text-text-muted" data-testid="radar-specialist-counters">{counters.prepared} ponto(s) preparado(s) · {counters.sent} enviado(s) · {articleContributions.length} resposta(s) · {counters.accepted} aceita(s)</p>
      </div>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm text-text-muted" data-testid="radar-specialist-state-line">{estadoOperacional}</p>
        <div className="flex items-center gap-2">
          {/*
            * "ATUALIZANDO…" NÃO APAGA O QUE ESTÁ NA TELA — §8.
            *
            * Trocar o conteúdo por um estado de carga durante a revalidação
            * faria a área piscar para "nenhuma resposta recebida" a cada tique,
            * e quem estivesse lendo uma contribuição a perderia de vista.
            */}
          {leituraDaArea.revalidating && <span className="text-sm text-text-muted" role="status" data-testid="radar-specialist-revalidating">Atualizando…</span>}
          {/* Atualiza SÓ esta área: nunca F5, nunca recarga do workspace. */}
          <button type="button" className={action} onClick={() => leituraDaArea.refresh()} data-testid="radar-specialist-refresh">Atualizar</button>
        </div>
      </div>
    </header>

    {loading && <p className={surface + " text-sm text-text-muted"}>Carregando especialistas utilizáveis desta Marca…</p>}
    {error && <p className="rounded-md border border-warning/50 bg-warning-soft/20 p-3 text-sm text-warning" role="alert">{error}</p>}
    {notice && <p className="rounded-md border border-divider bg-surface-subtle p-3 text-sm text-success" role="status">{notice}</p>}

    {/*
      * AS DUAS COLUNAS — SPECIALIST_1 · §7, o mesmo princípio de Vídeos.
      *
      * À esquerda o que CHEGOU do especialista; à direita o que o Radar PEDIU.
      * Empilhadas, as duas leituras se misturavam e uma resposta parecia
      * pertencer ao ponto listado logo acima dela.
      *
      * A ordem do DOM é a ordem do mobile (§9): entradas, pontos, resultado.
      */}
    <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" data-testid="radar-specialist-operational-grid">
      <div className="space-y-3 min-w-0" data-testid="radar-specialist-entries-column">
        
        {!loading && experts.length > 0 && <section className={surface}>
          <h4 className="text-sm font-semibold uppercase tracking-wide text-foreground">ENTRADAS / RESPOSTAS DO ESPECIALISTA</h4>
          {/*
            * O SELETOR MANUAL SAIU DA VISÃO NORMAL — SPECIALIST_2.1.1 · §8.
            *
            * Ele pertence ao fluxo anterior, em que alguém cadastrava um
            * especialista antes de poder perguntar qualquer coisa. No fluxo por
            * consulta, o participante é criado pelo convite e É a autoridade
            * daquela consulta: não há o que escolher, e a caixa "Selecionar
            * especialista" fazia a tela pedir uma ação que não existe mais.
            *
            * Continua acessível porque a pauta avulsa ainda é uma ferramenta
            * legítima — só deixou de competir com a ação principal (§10).
            */}
          <details className="mt-3 rounded-md border border-divider p-2" data-testid="radar-specialist-advanced">
            <summary className="cursor-pointer text-sm font-semibold text-text-muted">Ferramentas avançadas</summary>
            <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <label className="block text-sm text-foreground">Especialista
                <select aria-label="Selecionar especialista" value={selectedExpertId} onChange={event => selectExpert(event.target.value)} className="mt-1 min-h-10 w-full rounded-md border border-divider bg-surface-elevated px-3 py-2 text-sm text-foreground">
                  <option value="">Selecionar especialista</option>
                  {experts.map(expert => <option value={expert.id} key={expert.id}>{expert.displayName}{expert.specialty ? ` · ${expert.specialty}` : ""}</option>)}
                </select>
              </label>
              <div className="rounded-md border border-divider bg-surface px-3 py-2 text-sm">
                <span className="block text-text-muted">Canal Telegram</span>
                <strong className="mt-1 block text-foreground">{selectedExpert ? bindingConfigured ? "Configurado" : "Não vinculado" : "Nenhum selecionado"}</strong>
              </div>
            </div>
            {selectedExpert && <div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" className={action} onClick={createDraft}>Criar pauta avulsa</button><span className="text-sm text-text-muted">Fora do ponto de revisão; não substitui a consulta.</span></div>}
          </details>
        </section>}

        <section className={surface} aria-label="Entradas recebidas do especialista">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-foreground">RESPOSTAS RECEBIDAS</h4>
            <span className="text-sm text-text-muted">Readback remoto · {articleContributions.length}</span>
          </div>
          {!articleContributions.length && <p className="mt-2 rounded-md border border-divider bg-surface px-3 py-3 text-sm text-text-muted">Nenhuma resposta recebida.</p>}
          <ul className="mt-3 space-y-2">{articleContributions.map(contribution => {
            const requirementId = requirementByBriefId.get(contribution.briefId) || null;
            const ponto = requirementId ? requirementById.get(requirementId) : null;
            const verbatimText = contribution.transcriptText || contribution.originalText || "";
            return <li className="rounded-md border border-divider bg-surface p-3" key={contribution.id} data-testid="radar-specialist-entry">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{expertName(contribution.expertId)} · {sourceTypeLabel(contribution.sourceType)}</p>
                  <p className="mt-1 text-sm text-text-muted">Telegram · {formatDate(contribution.receivedAt)}{contributionDuration(contribution) ? ` · ${contributionDuration(contribution)}` : ""}</p>
                </div>
                <span className="shrink-0 rounded-full border border-divider px-2 py-1 text-sm text-text-muted">{processingStatusLabel(contribution.processingStatus)}</span>
              </div>
              <p className="mt-2 text-sm text-text-muted">{contribution.transcriptText ? "Transcrição disponível." : contribution.sourceType === "TEXT" ? "Texto recebido." : "Transcrição ainda não disponível; o original permanece preservado."}</p>
              {/*
                * O ÁUDIO JÁ TRANSCRITO APARECE COMO TEXTO CONSULTÁVEL — e recolhido.
                *
                * Aberta por padrão, uma transcrição de três minutos empurra as
                * outras respostas para fora da tela, e a coluna deixa de servir
                * como caixa de entrada.
                */}
              {verbatimText && <details className="mt-2 rounded-md border border-divider p-2" data-testid="radar-specialist-entry-transcript"><summary className="cursor-pointer text-sm font-semibold text-text-muted">Ver transcrição completa</summary><p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-text-muted">{verbatimText}</p></details>}
              <p className="mt-2 text-sm text-text-muted">{ponto ? `Responde ao ponto: ${ponto.topic || ponto.claim || ponto.requirementId}` : requirementId ? `Responde ao ponto ${requirementId}, que não está nesta investigação.` : "Contribuição ainda não associada a um ponto de revisão."}</p>
            </li>;
          })}</ul>
        </section>
      </div>

      <aside className="space-y-3 min-w-0" data-testid="radar-specialist-review-points-column">
        {/*
          * UM CARD POR PONTO — SPECIALIST_3 · §1.
          *
          * "PONTOS PARA REVISÃO" e "PAUTAS / PEDIDOS" eram duas listas com o
          * MESMO título dentro, lado a lado. Com um ponto preparado e a sua
          * pauta derivada, a coluna mostrava dois cards e dois botões — e a
          * leitura natural era que havia dois pedidos a enviar. Enviar um
          * deixava o outro parecendo travado, que foi o que o runtime relatou.
          *
          * Uma pauta não é outra coisa além do que o ponto virou. O card é um
          * só, e ele EVOLUI: ponto preparado → pauta pronta → pedido enviado →
          * resposta recebida → contribuição a revisar → evidência decidida.
          */}
        <section className={surface} aria-label="Pontos de revisão deste artigo">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-foreground">PONTOS DE REVISÃO</h4>
            <span className="text-sm text-text-muted">{reviewPoints.length}</span>
          </div>
          {!reviewPoints.length && <p className="mt-2 rounded-md border border-divider bg-surface px-3 py-3 text-sm text-text-muted">Nenhum ponto preparado para revisão.</p>}
          <ul className="mt-3 space-y-2">{reviewPoints.map(point => {
            const requisito = requirementById.get(point.requirementId);
            const card = requisito ? radarSpecialistReviewCard(requisito) : null;
            const convite = invites[point.requirementId] || null;
            const consulta = consultationByRequirement.get(point.requirementId) || null;
            const pauta = point.briefId ? briefById.get(point.briefId) || null : null;
            const fluxo = radarSpecialistFlow(point.state);
            const aRevisar = point.contributionIds.filter(id => decisionOf(id) === "NOT_APPROVED").length;
            /*
             * A PRÓXIMA AÇÃO, E O MOTIVO QUANDO ELA NÃO PODE ACONTECER.
             *
             * O critério que travava "Enviar pauta" existia e era correto — o
             * brief precisa estar aprovado. Ele só não estava escrito em lugar
             * nenhum que a pessoa pudesse ler. Agora o motivo vem junto.
             */
            const proxima = radarSpecialistNextAction({
              state: point.state,
              connected: Boolean(consulta?.connected),
              inviteState: consulta?.invite.state || "NONE",
              hasInviteLink: Boolean(convite?.link),
              botConfigured: Boolean(botUsername),
              /*
               * A PAUTA MANDA SOBRE `sent_at`, e a projeção da consulta segue.
               *
               * Só a rota de envio escreve `sent_at`, e o readback dela volta
               * como pauta — que entra no overlay na hora. A projeção da
               * consulta é leitura derivada e chega na próxima releitura: ler
               * a consulta primeiro deixava o card dizendo "Editar pauta" e
               * oferecendo enviar uma pauta que já tinha sido enviada.
               *
               * TROCAR A ORDEM AQUI É MUTANTE EQUIVALENTE, e está registrado
               * como tal: `||` já cai para o outro lado quando um dos dois é
               * nulo, e os dois nunca discordam com valor — saem da mesma
               * coluna. A ordem documenta a autoridade, não corrige um caso.
               * O defeito real era ler a consulta SOZINHA, que é o que o
               * rótulo da pauta fazia; esse, sim, morre em teste.
               */
              sentAt: pauta?.sentAt || consulta?.sentAt || null,
              approved: (pauta?.status || consulta?.status) === "reviewed",
              questionCount: pauta ? normalizeRadarExpertBriefQuestions(pauta.questions).length : 0,
              pendingReview: aRevisar > 0,
              contributionCount: point.contributionIds.length,
            });
            const executarProxima = () => {
              if (proxima.kind === "CREATE_CONSULTATION" && requisito) return void createConsultationFromRequirement(requisito);
              if (proxima.kind === "ISSUE_INVITE" && requisito) return void createConsultationFromRequirement(requisito, "reissue");
              if (proxima.kind === "SHARE_INVITE") return void copiar(convite?.link || "", point.requirementId, "link");
              if (proxima.kind === "APPROVE_BRIEF" && pauta) return void aprovarPauta(pauta);
              if (proxima.kind === "SEND_BRIEF" && consulta) return void enviarPauta(consulta.briefId, consulta.participant.id);
            };
            return <li className="rounded-md border border-divider bg-surface p-3" key={point.requirementId} data-testid="radar-specialist-review-point">
            <p className="text-sm font-semibold text-foreground">{point.title}</p>
            <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-text-muted">{radarSpecialistPriorityLabel(point.priority)} · {point.stateLabel}</p>
            {/* A régua diz ONDE no caminho este ponto está — sem repetir o título. */}
            <ol className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs" data-testid="radar-specialist-flow" aria-label="Andamento deste ponto de revisão">
              {fluxo.steps.map(step => <li key={step.stage} className={step.current ? "font-semibold text-context-accent" : step.reached ? "text-foreground" : "text-text-muted"} aria-current={step.current ? "step" : undefined} data-testid={step.current ? "radar-specialist-flow-current" : undefined}>{step.label}</li>)}
            </ol>
            {/*
              * A PERGUNTA, O MOTIVO E O QUE SE ESPERA — nada do diagnóstico.
              *
              * A `specificQuestion` congelada começa com a contagem de mercado
              * que levou o Radar até aqui ("3 de 10 concorrentes…"). Ela não
              * ajuda ninguém a decidir o que perguntar, e empurrava a pergunta
              * de verdade para o fim de um parágrafo. O texto integral continua
              * na pauta e na proveniência; o card mostra o que se opera.
              */}
            {card && card.question !== point.title && <><p className="mt-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Pergunta</p><p className="mt-1 text-sm text-foreground" data-testid="radar-specialist-point-question">{card.question}</p></>}
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Por que revisar</p>
            <p className="mt-1 text-sm text-text-muted" data-testid="radar-specialist-point-reason">{card?.reason || point.whyReviewIsNeeded || "Esta afirmação precisa de validação profissional."}</p>
            {card && <><p className="mt-3 text-xs font-semibold uppercase tracking-wide text-text-muted">O que esperamos</p><p className="mt-1 text-sm text-text-muted">{card.expectation}</p>{card.contributions.length > 0 && <p className="mt-1 text-sm text-foreground" data-testid="radar-specialist-point-contributions">{card.contributions.join(" · ")}</p>}</>}
            {/*
              * UMA AÇÃO, E ELA DIZ O QUE FALTA QUANDO NÃO PODE ACONTECER.
              *
              * Antes eram três botões espalhados pelo card — criar consulta,
              * gerar link, enviar pauta — cada um aparecendo ou sumindo por
              * conta própria, e o de enviar ficava inerte sem explicar nada.
              * Aqui existe a próxima do fluxo, e só ela.
              */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {proxima.actionable
                ? proxima.kind === "REVIEW_CONTRIBUTION"
                  ? <a href="#radar-specialist-review-result" className={primaryAction} data-testid="radar-specialist-next-action">{proxima.label}</a>
                  : <button type="button" className={primaryAction} onClick={executarProxima} disabled={!proxima.enabled || busy !== "" || (proxima.kind === "CREATE_CONSULTATION" && !requisito)} data-testid="radar-specialist-next-action">{creatingRequirementId === point.requirementId ? "Criando consulta…" : busy === "send" && proxima.kind === "SEND_BRIEF" ? "Enviando…" : busy === "review" && proxima.kind === "APPROVE_BRIEF" ? "Aprovando…" : proxima.label}</button>
                : <span className="text-sm text-text-muted" data-testid="radar-specialist-next-action">{proxima.label}</span>}
              {proxima.reason && <span className="text-sm text-text-muted" data-testid="radar-specialist-next-action-reason">{proxima.reason}</span>}
            </div>
            {/*
              * A CONSULTA, LIDA DO BANCO — SPECIALIST_2.1.1 · §4, §5 e §9.
              *
              * Este bloco não depende mais do que o POST devolveu: ele existe
              * porque a consulta existe. Antes, o primeiro F5 apagava tudo e a
              * área voltava a pedir "Selecionar especialista" com participante,
              * pauta e convite gravados a três tabelas de distância.
              *
              * O LINK, ESSE, NÃO VOLTA. Só o hash do token é persistido: a URL
              * existiu uma vez, na resposta que a criou. Em vez de esconder o
              * botão — o defeito de runtime deste gate — a tela diz que o
              * convite está aberto e oferece gerar outro, revogando o anterior.
              */}
            {consulta && <div className="mt-3 rounded-md border border-divider bg-surface-subtle p-2" data-testid="radar-specialist-consultation">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Consulta</p>
              <p className="mt-1 text-sm text-foreground" data-testid="radar-specialist-consultation-participant">{consulta.participant.displayName || "Especialista convidado"}{consulta.connected ? " · Telegram conectado" : ""}</p>
              <p className="mt-1 text-sm text-text-muted">{consulta.sentAt ? "Pedido enviado" : consulta.status === "reviewed" ? "Pauta aprovada para envio" : "Pauta em preparação"}</p>
              {!consulta.connected && <p className="mt-1 text-sm text-text-muted" data-testid="radar-specialist-invite-state">{RADAR_SPECIALIST_INVITE_LABELS[consulta.invite.state]}</p>}

              {/*
                * COPIAR A MENSAGEM ACOMPANHA O LINK, e nada mais duplica a ação.
                *
                * Gerar o link e enviar a pauta viraram a PRÓXIMA AÇÃO do card.
                * Repeti-los aqui recriaria os dois botões concorrentes que o §1
                * veio eliminar — e era a segunda cópia que parecia travada.
                */}
              {convite?.link && <button type="button" className={`${action} mt-2`} onClick={() => void copiar(convite.message, point.requirementId, "mensagem")} data-testid="radar-specialist-copy-message">Copiar mensagem do convite</button>}
              {(pauta?.sentAt || consulta.sentAt) && <p className="mt-2 text-sm text-text-muted">Enviado em {formatDate((pauta?.sentAt || consulta.sentAt) as string)}.</p>}

              {/*
                * "EDITAR" ANTES DO ENVIO, "VER" DEPOIS — §2.
                *
                * Depois do envio as perguntas estão congeladas: a rota recusa
                * alteração em pauta `awaiting_expert`. "Abrir pauta" prometia
                * uma edição que não ia acontecer, e sugeria criar outra.
                */}
              <button type="button" className={`${action} mt-2`} onClick={() => { const brief = briefById.get(consulta.briefId); if (brief) openBrief(brief); }} data-testid="radar-specialist-open-brief">{radarSpecialistBriefActionLabel({ sentAt: pauta?.sentAt || consulta.sentAt })}</button>
              {copied === `${point.requirementId}:link` && <p className="mt-2 text-sm text-success" role="status">Link copiado</p>}
              {copied === `${point.requirementId}:mensagem` && <p className="mt-2 text-sm text-success" role="status">Mensagem copiada</p>}
              {/*
                * O AVISO SÓ APARECE QUANDO O BOT REALMENTE NÃO ESTÁ CONFIRMADO.
                *
                * Antes bastava um POST antigo ter voltado sem link para a tela
                * acusar a plataforma. Agora ela consulta o mesmo dado do Admin:
                * sem `botUsername`, o aviso é verdade; com ele, o que falta é
                * apenas gerar um link — e esse caminho já está logo acima.
                */}
              {!botUsername && !consulta.connected && <p className="mt-2 text-sm text-warning" data-testid="radar-specialist-bot-missing">O username do Bot ainda não foi confirmado no Admin; sem ele o link direto não pode ser montado.</p>}
            </div>}
          </li>;
          })}</ul>
        </section>

        {/*
          * SÓ O QUE NÃO CABE EM NENHUM PONTO — o resto da lista virou duplicata.
          *
          * Toda pauta que nasceu de um ponto de revisão já aparece, uma vez,
          * no card daquele ponto. O que sobra aqui é a pauta AVULSA: criada à
          * mão, sem requisito, e que portanto não tem card onde morar. Na
          * maioria dos artigos esta seção simplesmente não existe.
          */}
        {pautasAvulsas.length > 0 && <section className={surface} aria-label="Pautas avulsas deste artigo">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-foreground">PAUTAS AVULSAS</h4>
            <span className="text-sm text-text-muted">{pautasAvulsas.length}</span>
          </div>
          <p className="mt-1 text-sm text-text-muted">Criadas fora de um ponto de revisão preparado.</p>
          <ul className="mt-3 space-y-2">{pautasAvulsas.map(brief => {
            const recebidas = contributionsByBrief.get(brief.id) || [];
            /*
             * O ESTADO CANÔNICO, NUNCA O RÓTULO DO BANCO — §6.
             *
             * `reviewed` significa "uma pessoa aprovou o envio" nesta coluna e
             * "chegou contribuição e falta revisar" em `awaiting_review`. Duas
             * revisões no mesmo enum; expor a palavra crua faria a tela dizer
             * "revisada" sobre uma pauta que ninguém enviou.
             */
            const state = radarSpecialistStateFromBrief({ status: brief.status, sentAt: brief.sentAt, contributions: recebidas.length, acceptedContributions: recebidas.filter(item => radarSpecialistDecisionIsActive(decisionOf(item.id))).length, connected: vinculados.has(brief.expertId), invited: Boolean(radarSpecialistConsultationOf(brief.radarContext)) });
            return <li className="rounded-md border border-divider bg-surface p-3" key={brief.id} data-testid="radar-specialist-brief-row">
              <p className="text-sm font-semibold text-foreground">{brief.title}</p>
              <p className="mt-1 text-sm text-text-muted">{expertName(brief.expertId)} · {briefDate(brief)}</p>
              <p className="mt-2 flex flex-wrap gap-2 text-sm"><span className="rounded-full border border-divider px-2 py-1 text-foreground">{radarSpecialistStateLabel(state)}</span><span className="rounded-full border border-divider px-2 py-1 text-text-muted">{recebidas.length} resposta(s)</span></p>
              <button type="button" className={`${action} mt-3`} onClick={() => openBrief(brief)}>{radarSpecialistBriefActionLabel({ sentAt: brief.sentAt })}</button>
            </li>;
          })}</ul>
          {selectedExpert && scopedBriefs.length > 0 && <label className="mt-3 block text-sm text-foreground">Histórico deste artigo, versão e especialista
            <select aria-label="Selecionar pauta existente" value={selectedBriefId || ""} onChange={event => selectBrief(event.target.value)} className="mt-1 min-h-10 w-full rounded-md border border-divider bg-surface-elevated px-3 py-2 text-sm text-foreground">
              <option value="">Nova pauta não salva</option>
              {scopedBriefs.map(brief => <option value={brief.id} key={brief.id}>{brief.title} · {radarSpecialistStateLabel(radarSpecialistStateFromBrief({ status: brief.status, sentAt: brief.sentAt, contributions: (contributionsByBrief.get(brief.id) || []).length }))} · {briefDate(brief)}</option>)}
            </select>
          </label>}
        </section>}

        {selectedExpert && draftOpen && <section className={surface} aria-label="Editor de perguntas do ExpertBrief">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h4 className="text-sm font-semibold uppercase tracking-wide text-foreground">PERGUNTAS AO ESPECIALISTA</h4><p className="mt-1 text-sm text-text-muted">Pergunta ≠ contribuição recebida. Remova o que a SERP já responde e mantenha o que depende da prática deste especialista.</p></div>
            <span className="rounded-full border border-divider px-3 py-1 text-sm text-text-muted">{activeBrief ? radarSpecialistStateLabel(radarSpecialistStateFromBrief({ status: activeBrief.status, sentAt: activeBrief.sentAt, contributions: (contributionsByBrief.get(activeBrief.id) || []).length })) : "Nova pauta local"}</span>
          </div>
          <label className="mt-3 block text-sm text-foreground">Título da pauta<input value={draft.title} onChange={event => setDraftValue(current => ({ ...current, title: event.target.value }))} maxLength={240} disabled={briefLocked} className="mt-1 min-h-10 w-full rounded-md border border-divider bg-surface-elevated px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-70" /></label>
          {briefLocked && <p className="mt-2 text-sm text-text-muted" data-testid="radar-specialist-brief-locked">Esta pauta já foi enviada; as perguntas estão congeladas e só podem ser consultadas.</p>}
          <ol className="mt-3 space-y-2" aria-label="Perguntas editáveis do ExpertBrief">
            {draft.questions.map((question, index) => <li className="rounded-md border border-divider bg-surface p-3" key={question.id}>
              <div className="flex items-start gap-2"><span className="pt-2 text-sm font-semibold text-context-accent">{index + 1}.</span><textarea value={question.text} onChange={event => updateQuestion(question.id, event.target.value)} rows={2} disabled={briefLocked} className="min-h-16 min-w-0 flex-1 rounded-md border border-divider bg-surface-elevated px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-70" aria-label={`Pergunta ${index + 1}`} /></div>
              <p className="mt-2 text-sm text-text-muted">Origem: {radarExpertBriefQuestionOriginLabel(question.origin)}{question.need ? ` · necessidade: ${question.need}` : ""}</p>
              {question.reference && <p className="mt-1 break-words text-sm text-text-muted">Referência: {question.reference}</p>}
              {/*
                * SUBIR E DESCER SÓ EXISTEM QUANDO HÁ ORDEM — §3.
                *
                * Com uma pergunta só, os dois ficavam permanentemente inativos:
                * três controles na tela, dois deles inertes para sempre. Quem
                * olhava não tinha como saber que aquilo era o esperado.
                */}
              <div className="mt-2 flex flex-wrap gap-2" data-testid="radar-specialist-question-controls">
                {controlesDePergunta.canReorder && <><button type="button" className={action} onClick={() => moveQuestion(question.id, -1)} disabled={briefLocked || index === 0}>Subir</button><button type="button" className={action} onClick={() => moveQuestion(question.id, 1)} disabled={briefLocked || index === draft.questions.length - 1}>Descer</button></>}
                <button type="button" className={action} onClick={() => removeQuestion(question.id)} disabled={briefLocked}>Remover</button>
              </div>
            </li>)}
          </ol>
          {!draft.questions.length && <p className="mt-3 rounded-md border border-divider bg-surface px-3 py-2 text-sm text-text-muted">Nenhuma pergunta adicionada. Crie uma pergunta ou gere sugestões explicitamente.</p>}
          <div className="mt-3 flex flex-col gap-2"><input aria-label="Nova pergunta ao especialista" value={newQuestion} onChange={event => setNewQuestion(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addQuestion(); } }} disabled={briefLocked} className="min-h-10 min-w-0 flex-1 rounded-md border border-divider bg-surface-elevated px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-70" placeholder="Adicionar pergunta" /><button type="button" className={action} onClick={addQuestion} disabled={briefLocked || !newQuestion.trim()}>Adicionar pergunta</button></div>
          {/*
            * "SUGESTÕES POR IA" É AÇÃO SECUNDÁRIA — §3.
            *
            * Ela estava no topo do editor, com o mesmo peso visual do resto e
            * um parágrafo permanente explicando que a IA só roda ao clicar. O
            * aviso era verdadeiro e ocupava espaço a cada render: ele passa a
            * ser o `title` do próprio botão, onde é lido quando interessa.
            *
            * A chamada continua sendo EXCLUSIVAMENTE desta ação, e o resultado
            * continua revisável antes de qualquer gravação.
            */}
          <button type="button" className="mt-2 text-sm text-context-accent underline underline-offset-2 disabled:cursor-not-allowed disabled:text-text-muted disabled:no-underline" onClick={() => void generateSuggestions()} disabled={busy !== "" || briefLocked} title="A IA só é chamada por esta ação; o resultado continua revisável antes de salvar." data-testid="radar-specialist-generate-suggestions">{busy === "suggestions" ? "Gerando sugestões…" : "Sugestões por IA"}</button>
          <div className="mt-4 flex flex-wrap gap-2"><button type="button" className={primaryAction} onClick={() => void persist(undefined, selectedBriefId ? "saved" : "created")} disabled={!canSave}>{busy === "save" ? "Salvando…" : selectedBriefId ? "Salvar pauta" : "Salvar pauta e criar"}</button><button type="button" className={action} onClick={() => void persist("reviewed", "reviewed")} disabled={!canReview}>{busy === "review" ? "Registrando aprovação…" : activeBrief?.status === "reviewed" && !dirty ? "Aprovada para envio" : "Aprovar para envio"}</button></div>
          {dirty && <p className="mt-2 text-sm text-pending">Alterações locais ainda não salvas.</p>}

          <div className="mt-3 rounded-md border border-warning/50 bg-warning-soft/20 p-3"><p className="text-sm font-semibold text-foreground">Envio ao Telegram</p><p className="mt-1 text-sm text-text-muted">{!activeBrief ? "Salve ou selecione uma pauta antes de qualquer envio." : !bindingConfigured ? "O especialista não está vinculado; conclua o onboarding antes do envio." : activeBrief.sentAt ? "Mensagem já confirmada. O Radar aguarda a resposta deste brief." : activeBrief.status !== "reviewed" ? "A pauta precisa da aprovação humana antes do envio." : dirty ? "Há alterações locais; salve e aprove novamente antes do envio." : "O envio é uma ação explícita e usa somente o vínculo Telegram deste especialista."}</p><button type="button" className={`${primaryAction} mt-2`} onClick={() => void sendToTelegram()} disabled={!canSend}>{busy === "send" ? "Enviando…" : activeBrief?.sentAt ? "Mensagem já enviada" : "Enviar ao especialista"}</button></div>
        </section>}
      </aside>
    </div>

    {/*
      * O RESULTADO DA REVISÃO, ORGANIZADO PELO PONTO — §8, largura inteira.
      *
      * Original, transcrição, contribuição extraída e a decisão humana não
      * cabem numa coluna de um terço: é aqui que alguém decide se a resposta
      * de um profissional vira evidência do artigo.
      */}
    <section id="radar-specialist-review-result" className={surface} aria-label="Resultado da revisão do especialista" data-testid="radar-specialist-review-result">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-foreground">RESULTADO DA REVISÃO</h4>
        <span className="text-sm text-text-muted">{selectedEvidenceCount} aceita(s) · {pendingContributionCount} pendente(s)</span>
      </div>
      {!articleContributions.length && <p className="mt-2 rounded-md border border-divider bg-surface px-3 py-3 text-sm text-text-muted">A revisão começa quando uma contribuição é recebida.</p>}
      <div className="mt-3 space-y-4">{resultPoints.map(point => <section className="rounded-md border border-divider bg-surface-subtle p-3" key={point.requirementId} data-testid="radar-specialist-result-point">
        <div className="flex flex-wrap items-start justify-between gap-2">
          {/*
            * A PERGUNTA ENVIADA, NÃO O DIAGNÓSTICO INTEIRO — §12.
            *
            * `specificQuestion` começa com a contagem de mercado que levou o
            * Radar até aqui. O texto congelado continua na proveniência; aqui
            * fica o que foi efetivamente perguntado ao profissional.
            */}
          <div className="min-w-0"><h5 className="text-sm font-semibold text-foreground">{point.title}</h5><p className="mt-1 text-sm text-text-muted">{requirementById.get(point.requirementId) ? radarSpecialistReviewCard(requirementById.get(point.requirementId) as RadarFrozenSpecialistRequirement).question : point.specificQuestion}</p></div>
          <span className="shrink-0 rounded-full border border-divider px-3 py-1 text-sm text-foreground">{point.stateLabel}</span>
        </div>
        <p className="mt-2 text-sm text-text-muted">Especialista: {expertName(point.expertId)}</p>
        <div className="mt-3 space-y-3">{(contributionsByRequirement.get(point.requirementId) || []).map(contribution => contributionCard(contribution, briefById.get(contribution.briefId) || null))}</div>
      </section>)}</div>
      {unassignedContributions.length > 0 && <section className="mt-4 rounded-md border border-divider bg-surface-subtle p-3" data-testid="radar-specialist-result-unassigned">
        <h5 className="text-sm font-semibold text-foreground">Respostas sem ponto de revisão associado</h5>
        <p className="mt-1 text-sm text-text-muted">Chegaram por pautas que não nasceram de um ponto preparado. A associação a um requisito não é feita automaticamente sem evidência suficiente.</p>
        <div className="mt-3 space-y-3">{unassignedContributions.map(contribution => contributionCard(contribution, briefById.get(contribution.briefId) || null))}</div>
      </section>}
      {articleContributions.length > 0 && <p className="mt-3 text-sm text-text-muted">A contribuição remota não vira ExpertEvidence automaticamente.</p>}
    </section>

    {/*
      * UM DISCLOSURE SÓ, E FECHADO — SPECIALIST_1.1.
      *
      * NECESSIDADES DO RADAR, LACUNAS OBSERVADAS e o texto congelado inteiro de
      * cada ponto saíram da visão principal e vieram para cá. NADA FOI APAGADO:
      * é o mesmo dado, na profundidade certa. Quem opera a revisão precisa saber
      * o que perguntar e para quem; o diagnóstico que levou o Radar até o ponto
      * é conferência, não operação.
      *
      * Um disclosure, não vários: uma fileira de accordions recria exatamente o
      * muro de texto que este gate veio derrubar.
      */}
    <details className="rounded-md border border-divider p-3" data-testid="radar-specialist-provenance"><summary className="cursor-pointer text-sm font-semibold text-text-muted">Proveniência / detalhes técnicos</summary>
      <h5 className="mt-3 text-sm font-semibold uppercase tracking-wide text-foreground">NECESSIDADES DO RADAR</h5>
      <div className="mt-2 flex flex-wrap gap-2">{context.serpNeeds.length ? context.serpNeeds.map((need, index) => <span className="rounded-full border border-divider px-3 py-1 text-sm text-text-muted" key={`${need}:${index}`}>{need}</span>) : <span className="text-sm text-text-muted">Nenhuma necessidade registrada.</span>}</div>
      <h5 className="mt-4 text-sm font-semibold uppercase tracking-wide text-foreground">LACUNAS OBSERVADAS</h5>
      <div className="mt-2 space-y-2">{context.openGaps.length ? context.openGaps.map((gap, index) => <p className="rounded-md border border-divider bg-surface px-3 py-2 text-sm text-text-muted" key={`${gap}:${index}`}>{gap}</p>) : <p className="text-sm text-text-muted">Nenhuma lacuna explícita foi registrada pela investigação atual.</p>}</div>
      {reviewPoints.length > 0 && <><h5 className="mt-4 text-sm font-semibold uppercase tracking-wide text-foreground">PONTOS DE REVISÃO, TEXTO CONGELADO</h5>
        <dl className="mt-2 space-y-2">{reviewPoints.map(point => {
          const requisito = requirementById.get(point.requirementId);
          return <div className="rounded-md border border-divider bg-surface px-3 py-2" key={point.requirementId}><dt className="break-all text-sm text-text-muted">{point.requirementId}</dt><dd className="mt-1 text-sm text-foreground">{requisito ? radarSpecialistReviewCard(requisito).fullQuestion : point.specificQuestion}</dd></div>;
        })}</dl></>}
      <dl className="mt-4 grid gap-2 text-sm text-text-muted sm:grid-cols-2"><div><dt>brandId</dt><dd className="break-all text-foreground">{brandId}</dd></div><div><dt>articleId</dt><dd className="break-all text-foreground">{articleId}</dd></div><div><dt>ArticleDNA</dt><dd className="break-all text-foreground">{articleVersion} · {articleRole || "função não informada"}</dd></div><div><dt>ArticleDNA versionId</dt><dd className="break-all text-foreground">{articleDnaVersionId}</dd></div><div><dt>expertId</dt><dd className="break-all text-foreground">{selectedExpertId || "não selecionado"}</dd></div><div><dt>briefId</dt><dd className="break-all text-foreground">{selectedBriefId || "ainda não criado"}</dd></div><div><dt>Origem dos contadores</dt><dd className="text-foreground">Pautas e contribuições lidas do banco remoto.</dd></div><div><dt>Persistência da revisão</dt><dd className="text-foreground">Projeção local; o schema remoto atual não possui tabela/coluna de ExpertEvidence.</dd></div></dl>
    </details>
  </section>;
}

import { readKgrApplicability, setKgrApplicability, type KgrApplicability } from "./kgr-applicability.ts";
import { readCanonicalKeywordDna } from "./logical-read-model.ts";
import { deriveProcessorRevalidation } from "./processor-revalidation.ts";

/**
 * Revisão Humana do KeywordDNA.
 *
 * Desde 2026-09-18 não existe IA no Minerador. O que era comparação entre a
 * Lógica e uma sugestão de IA virou o que sempre foi de fato: o humano decide
 * sobre a leitura determinística — mantém, edita ou confirma que é
 * desconhecida. `accept_ai`, `aiSuggestion`, os enriquecimentos e o
 * `aiInputHash` saíram do contrato; nenhuma das 27 revisões persistidas no
 * banco usava qualquer um deles.
 */

export type HumanReviewFieldDecisionType = "keep_logic" | "edit" | "confirm_unknown";

export type HumanReviewAction =
  | { type: "field"; field: string; logicalValue: unknown; decision: HumanReviewFieldDecisionType; editedValue?: unknown }
  | { type: "kgr"; applicability: KgrApplicability }
  | { type: "reopen" }
  | { type: "cancel" }
  | { type: "complete" };

export type HumanReviewFieldDecision = {
  field: string;
  canonicalField: string | null;
  decision: HumanReviewFieldDecisionType;
  logicalValue: unknown;
  selectedValue: unknown;
  source: "logical" | "human";
  actorId: string;
  decidedAt: string;
};

export type HumanReviewRecord = {
  schemaVersion: "r6";
  status: "in_progress" | "completed";
  decision: "pending" | "keep_logic" | "edited" | "confirm_unknown" | "mixed" | "completed";
  fieldDecisions: HumanReviewFieldDecision[];
  overrides?: Record<string, unknown>;
  kgrApplicability?: KgrApplicability;
  kgrDecisionReviewed?: boolean;
  completedAt?: string;
  completedBy?: string;
  pendingFields?: string[];
};

export type HumanReviewStrategicField = {
  field: "intent" | "niche" | "funnel";
  label: "Intenção" | "Nicho" | "Funil";
  logicalValue: string | null;
};

export function humanReviewStrategicFields(semantic: Semantic | null | undefined, intent?: string | null): HumanReviewStrategicField[] {
  const readModel = readCanonicalKeywordDna({ intent: intent ?? null, analise_semantica: semantic || {} });
  return [
    { field: "intent", label: "Intenção", logicalValue: readModel.intent },
    { field: "niche", label: "Nicho", logicalValue: readModel.niche },
    { field: "funnel", label: "Funil", logicalValue: readModel.funnel },
  ];
}

type Semantic = Record<string, unknown>;

function asRecord(value: unknown): Semantic | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Semantic : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[._-]+/g, " ").replace(/\s+/g, " ");
}

function comparableValue(value: unknown): unknown {
  if (typeof value === "string") return normalize(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean" || value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.map(comparableValue);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, comparableValue(item)]));
  }
  return String(value);
}

function materiallyEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(comparableValue(left)) === JSON.stringify(comparableValue(right));
}

const fieldAliases: Record<string, string> = {
  intent: "intent",
  "intencao": "intent",
  "intencao logica": "intent",
  "intencao principal": "intent",
  niche: "niche",
  nicho: "niche",
  funnel: "funnel",
  funil: "funnel",
  "central entity": "centralEntity",
  "entidade central": "centralEntity",
  centralentity: "centralEntity",
  modifiers: "modifiers",
  modificadores: "modifiers",
  audience: "audience",
  audiencia: "audience",
  publico: "audience",
  "publico alvo": "audience",
  "perceived problem": "perceivedProblem",
  "problema percebido": "perceivedProblem",
  problem: "perceivedProblem",
  "desired result": "desiredResult",
  "resultado desejado": "desiredResult",
  "job to be done": "jobToBeDone",
  "job to be done ": "jobToBeDone",
  journey: "journey",
  jornada: "journey",
  awareness: "awareness",
  consciencia: "awareness",
  "nivel de consciencia": "awareness",
  "editorial type": "editorialType",
  "tipo editorial": "editorialType",
  "expected format": "expectedFormat",
  "formato esperado": "expectedFormat",
  "local intent": "localIntent",
  "intencao local": "localIntent",
  "implicit objection": "implicitObjection",
  "objecao implicita": "implicitObjection",
  urgency: "urgency",
  urgencia: "urgency",
  "urgencia tempo": "urgency",
  "dominant emotion": "dominantEmotion",
  "emocao dominante": "dominantEmotion",
  ambiguity: "ambiguity",
  ambiguidade: "ambiguity",
};

export function canonicalHumanReviewField(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const key = normalize(value);
  return fieldAliases[key] || null;
}

function normalizedFieldKey(field: string, canonicalField?: string | null): string {
  return canonicalField || normalize(field);
}

function readHumanReviewRecord(semantic: Semantic | null | undefined): HumanReviewRecord {
  const existing = asRecord(semantic?.human_review);
  const fieldDecisions = Array.isArray(existing?.fieldDecisions)
    ? existing.fieldDecisions.filter(entry => entry && typeof entry === "object") as HumanReviewFieldDecision[]
    : [];
  const rawOverrides = asRecord(existing?.overrides) || {};
  const decision = ["keep_logic", "edited", "confirm_unknown", "mixed", "completed"].includes(String(existing?.decision))
    ? existing?.decision as HumanReviewRecord["decision"]
    : "pending";
  return {
    schemaVersion: "r6",
    status: existing?.status === "completed" ? "completed" : "in_progress",
    decision,
    fieldDecisions,
    ...(Object.keys(rawOverrides).length > 0 ? { overrides: rawOverrides } : {}),
    ...(existing?.kgrApplicability === "pending" || existing?.kgrApplicability === "applicable" || existing?.kgrApplicability === "not_applicable"
      ? { kgrApplicability: existing.kgrApplicability }
      : {}),
    ...(existing?.kgrDecisionReviewed === true ? { kgrDecisionReviewed: true } : {}),
    ...(typeof existing?.completedAt === "string" ? { completedAt: existing.completedAt } : {}),
    ...(typeof existing?.completedBy === "string" ? { completedBy: existing.completedBy } : {}),
    ...(Array.isArray(existing?.pendingFields) ? { pendingFields: existing.pendingFields.filter(value => typeof value === "string") } : {}),
  };
}

export function humanReviewRecord(semantic: Semantic | null | undefined): HumanReviewRecord {
  return readHumanReviewRecord(semantic);
}

export function humanReviewFieldDecision(semantic: Semantic | null | undefined, field: unknown, current?: { logicalValue?: unknown }): HumanReviewFieldDecision | null {
  if (typeof field !== "string") return null;
  const canonical = canonicalHumanReviewField(field);
  const key = normalizedFieldKey(field, canonical);
  const decision = readHumanReviewRecord(semantic).fieldDecisions.find(entry => normalizedFieldKey(entry.field, entry.canonicalField) === key) || null;
  if (!decision || !current) return decision;
  // A decisão vale para o valor lógico que o humano viu. Se a Lógica mudou, a
  // decisão anterior não responde mais pelo campo.
  return materiallyEqual(decision.logicalValue, current.logicalValue) ? decision : null;
}

function decisionSummary(decisions: HumanReviewFieldDecision[]): HumanReviewRecord["decision"] {
  const types = new Set(decisions.map(entry => entry.decision));
  if (types.size === 0) return "pending";
  if (types.size === 1) {
    const type = [...types][0];
    return type === "edit" ? "edited" : type;
  }
  return "mixed";
}

function setFieldDecision(record: HumanReviewRecord, next: HumanReviewFieldDecision): HumanReviewRecord {
  const key = normalizedFieldKey(next.field, next.canonicalField);
  const fieldDecisions = record.fieldDecisions.filter(entry => normalizedFieldKey(entry.field, entry.canonicalField) !== key);
  fieldDecisions.push(next);
  return {
    ...record,
    status: "in_progress",
    decision: decisionSummary(fieldDecisions),
    fieldDecisions,
    pendingFields: [],
    completedAt: undefined,
    completedBy: undefined,
  };
}

function invalidateHumanConfirmation(semantic: Semantic): void {
  // A completed review is a consolidation marker, not a permanent lock. Any
  // subsequent human decision must make the draft visibly pending until the
  // new consolidation is explicitly completed.
  semantic.dna_revisao_humana = "pendente";
  delete semantic.dna_revisao_humana_por;
  delete semantic.dna_revisao_humana_em;
}

function valueForDecision(input: { decision: HumanReviewFieldDecisionType; logicalValue: unknown; editedValue?: unknown }): { value: unknown; source: HumanReviewFieldDecision["source"] } {
  if (input.decision === "keep_logic") return { value: input.logicalValue, source: "logical" };
  if (input.decision === "confirm_unknown") return { value: null, source: "human" };
  return { value: input.editedValue ?? null, source: "human" };
}

/**
 * Applies only a semantic decision. It never accepts metric/provider fields,
 * and it keeps the logical layer available for audit.
 */
export function applyHumanReviewField(input: {
  semantic: Semantic | null | undefined;
  intent: string | null | undefined;
  field: string;
  logicalValue: unknown;
  decision: HumanReviewFieldDecisionType;
  editedValue?: unknown;
  actorId: string;
  decidedAt: string;
}): { semantic: Semantic; intent: string | null; selectedValue: unknown; record: HumanReviewRecord } {
  const canonicalField = canonicalHumanReviewField(input.field);
  const selected = valueForDecision({ decision: input.decision, logicalValue: input.logicalValue, editedValue: input.editedValue });
  const current = { ...(input.semantic || {}) };
  invalidateHumanConfirmation(current);
  const existingRecord = readHumanReviewRecord(current);
  const nextDecision: HumanReviewFieldDecision = {
    field: input.field,
    canonicalField,
    decision: input.decision,
    logicalValue: input.logicalValue,
    selectedValue: selected.value,
    source: selected.source,
    actorId: input.actorId,
    decidedAt: input.decidedAt,
  };
  const record = setFieldDecision(existingRecord, nextDecision);
  const overrides = { ...(record.overrides || {}) };
  const effectiveField = canonicalField || normalize(input.field);

  if (input.decision === "keep_logic" || input.decision === "confirm_unknown") delete overrides[effectiveField];
  else overrides[effectiveField] = selected.value;

  let nextIntent = input.intent ?? null;
  if (canonicalField === "intent") {
    const selectedIntent = asString(selected.value);
    if (input.decision === "confirm_unknown") {
      nextIntent = null;
      delete current.intencao_humana;
      delete current.intencao_revisada;
      delete current.intencao_origem;
    } else {
      if (selectedIntent) nextIntent = selectedIntent;
      current.intencao_humana = selected.value;
      current.intencao_revisada = selected.value;
      current.intencao_origem = "human";
    }
  }

  if (canonicalField === "niche") {
    const selectedNiche = asString(selected.value);
    if (input.decision === "confirm_unknown") {
      delete current.nicho_humano;
      delete current.nicho_override;
      delete current.nicho_origem;
    } else if (selectedNiche) {
      if (current.nicho === undefined && current.nicho_override !== undefined) current.nicho_logico_original = current.nicho_override;
      current.nicho_override = selectedNiche;
      current.nicho_humano = selectedNiche;
      current.nicho_origem = "human";
    }
  }

  if (canonicalField === "funnel") {
    const selectedFunnel = asString(selected.value)?.toUpperCase();
    if (input.decision === "confirm_unknown") {
      delete current.funnel_humano;
      delete current.funnel_revisado;
      delete current.funnel_human_confirmed;
      delete current.funnel_source;
      delete current.funnel_decision_origin;
    } else if (selectedFunnel && ["TOFU", "MOFU", "BOFU"].includes(selectedFunnel)) {
      current.funnel_humano = selectedFunnel;
      current.funnel_revisado = selectedFunnel;
      current.funnel_human_confirmed = true;
      current.funnel_source = "human";
      current.funnel_decision_origin = "human";
    }
  }

  const nextRecord: HumanReviewRecord = {
    ...record,
    ...(Object.keys(overrides).length > 0 ? { overrides } : { overrides: undefined }),
  };
  current.human_review = nextRecord;
  return { semantic: current, intent: nextIntent, selectedValue: selected.value, record: nextRecord };
}

export function applyHumanReviewKgrApplicability(input: {
  semantic: Semantic | null | undefined;
  applicability: KgrApplicability;
  actorId: string;
  decidedAt: string;
}): Semantic {
  const next = setKgrApplicability(input.semantic, input.applicability, { actorId: input.actorId, decidedAt: input.decidedAt });
  invalidateHumanConfirmation(next);
  const record = readHumanReviewRecord(next);
  next.human_review = {
    ...record,
    status: record.status === "completed" ? "in_progress" : record.status,
    decision: record.status === "completed" ? "pending" : record.decision,
    kgrApplicability: input.applicability,
    kgrDecisionReviewed: true,
    pendingFields: [],
  } satisfies HumanReviewRecord;
  return next;
}

function kgrIsCalculable(semantic: Semantic | null | undefined): boolean {
  // KGR applicability is a review gate only when the two current Processor
  // measurements make the calculation real. Imported/top-level snapshots or
  // an old persisted score must not turn into a new KGR obligation.
  return deriveProcessorRevalidation({ semantic: semantic || {} }).kgr.ready;
}

/**
 * O que pode ficar pendente hoje é campo estratégico sem leitura consolidada
 * e a aplicabilidade do KGR. A aplicabilidade continua sendo decisão humana
 * própria, reportada como pendente em vez de desabilitar o comando.
 */
export function canCompleteHumanReview(semantic: Semantic | null | undefined, options: { hasOpenEdit?: boolean; intent?: string | null } = {}): { ok: boolean; pendingFields: string[]; pendingKgrDecision?: boolean; reason?: string } {
  const pendingKgrDecision = kgrIsCalculable(semantic) && readKgrApplicability(semantic) === "pending";

  const pendingFields = humanReviewStrategicFields(semantic, options.intent)
    .filter(field => !field.logicalValue)
    .filter(field => !humanReviewFieldDecision(semantic, field.field, { logicalValue: field.logicalValue }))
    .map(field => `${field.label} (confirmar desconhecido)`);

  // Pending items are intentionally returned for the checklist/read-model,
  // but they are not a completion blocker. The explicit completion command
  // records conservative defaults for every unresolved item.
  return {
    ok: true,
    pendingFields,
    ...(pendingKgrDecision ? { pendingKgrDecision } : {}),
    ...(pendingKgrDecision
      ? { reason: "Trate a aplicabilidade do KGR para concluir a revisão humana." }
      : pendingFields.length > 0
        ? { reason: "Você pode concluir agora: campos sem evidência permanecerão desconhecidos." }
        : {}),
  };
}

function applyHumanReviewCompletionDefaults(input: {
  semantic: Semantic;
  intent: string | null;
  actorId: string;
  decidedAt: string;
}): { semantic: Semantic; intent: string | null } {
  let semantic = input.semantic;
  let intent = input.intent;

  // Default conservador: campo estratégico sem leitura da Lógica é registrado
  // como desconhecido confirmado, nunca preenchido por conta própria.
  for (const field of humanReviewStrategicFields(semantic, intent)) {
    if (field.logicalValue) continue;
    if (humanReviewFieldDecision(semantic, field.field, { logicalValue: field.logicalValue })) continue;
    const result = applyHumanReviewField({
      semantic,
      intent,
      field: field.field,
      logicalValue: null,
      decision: "confirm_unknown",
      actorId: input.actorId,
      decidedAt: input.decidedAt,
    });
    semantic = result.semantic;
    intent = result.intent;
  }

  return { semantic, intent };
}

export function completeHumanReview(input: {
  semantic: Semantic | null | undefined;
  intent?: string | null;
  actorId: string;
  completedAt: string;
}): Semantic {
  const completion = canCompleteHumanReview(input.semantic, { intent: input.intent });
  if (!completion.ok) throw new Error(completion.reason || "Há pendências na revisão humana.");
  // The KGR applicability stays a human decision: the completion command
  // never invents "aplicável"/"não aplicável" on the human's behalf.
  if (completion.pendingKgrDecision) throw new Error(completion.reason || "Trate a aplicabilidade do KGR para concluir a revisão humana.");
  const defaults = applyHumanReviewCompletionDefaults({
    semantic: { ...(input.semantic || {}) },
    intent: input.intent ?? null,
    actorId: input.actorId,
    decidedAt: input.completedAt,
  });
  const record = readHumanReviewRecord(defaults.semantic);
  const applicability = readKgrApplicability(defaults.semantic);
  const nextRecord: HumanReviewRecord = {
    ...record,
    status: "completed",
    decision: "completed",
    kgrApplicability: applicability,
    kgrDecisionReviewed: record.kgrDecisionReviewed === true || !kgrIsCalculable(defaults.semantic) || applicability !== "pending",
    pendingFields: [],
    completedAt: input.completedAt,
    completedBy: input.actorId,
  };
  return {
    ...defaults.semantic,
    dna_revisao_humana: "aprovado",
    dna_revisao_humana_por: input.actorId,
    dna_revisao_humana_em: input.completedAt,
    human_review: nextRecord,
  };
}

export function isHumanReviewCompleted(semantic: Semantic | null | undefined): boolean {
  const marker = String(semantic?.dna_revisao_humana || "").trim().toLocaleLowerCase("pt-BR");
  return readHumanReviewRecord(semantic).status === "completed"
    || ["aprovado", "aprovada", "confirmado", "confirmada", "confirmed"].includes(marker);
}

export function isHumanReviewConfirmationValid(semantic: Semantic | null | undefined, intent?: string | null): boolean {
  // Completion gates belong to the explicit command. Once persisted, the
  // human artifact remains valid on its own snapshot; upstream process
  // changes are provenance, not a retroactive invalidation.
  void intent;
  return isHumanReviewCompleted(semantic);
}

/**
 * Identity for the deterministic logic engine, deliberately separate from
 * dna_schema_version. A schema version describes shape; this version describes
 * the processor that produced the logical interpretation.
 */
export const LOGIC_PROCESSOR_VERSION = "r1.1";

export const LOGIC_PROCESSOR_METADATA_KEYS = [
  "logicProcessorVersion",
  "logicProcessedAt",
  "logicInputHash",
] as const;

/**
 * Output contract for the deterministic stage. It lives inside the existing
 * JSONB semantic record, so it adds no database column or migration. A field
 * may be a value or an explicit unresolved state; it may never disappear
 * silently after the processor has completed.
 */
export const LOGICAL_OUTPUT_CONTRACT_VERSION = "r1" as const;
export const LOGICAL_OUTPUT_CONTRACT_KEY = "logical_output_contract" as const;
export type LogicalOutputFieldState = "value" | "explicit_unknown" | "ambiguous" | "pending";
/**
 * The strategic fields are consumed by the table/read-model, while the
 * remaining names cover the logical KeywordDNA fields that the engine already
 * produces. Keeping them in the same contract prevents a field from
 * disappearing silently between the engine and persistence.
 */
export const LOGICAL_OUTPUT_FIELD_NAMES = [
  "intent",
  "niche",
  "funnel",
  "secondaryIntent",
  "editorialType",
  "centralEntity",
  "modifiers",
  "audience",
  "perceivedProblem",
  "desiredResult",
  "jobToBeDone",
  "awareness",
  "journey",
  "commercialPotential",
  "affiliatePotential",
  "localIntent",
  "objection",
  "urgency",
  "emotion",
  "expectedFormat",
  "cannibalizationRisk",
  "reviewCandidate",
  "productResearchRequired",
  "confidence",
  "evidence",
] as const;
export type LogicalOutputFieldName = typeof LOGICAL_OUTPUT_FIELD_NAMES[number];
export type LogicalOutputContract = {
  version: typeof LOGICAL_OUTPUT_CONTRACT_VERSION;
  fields: Record<LogicalOutputFieldName, {
    state: LogicalOutputFieldState;
    value: string | null;
  }>;
};

export type LogicalOutputContractResult = {
  valid: boolean;
  contract: LogicalOutputContract | null;
  missingFields: LogicalOutputFieldName[];
};

export type LogicalProcessReadinessState = "current_valid" | "stale" | "incomplete" | "missing";

export type LogicalProcessReadiness = {
  state: LogicalProcessReadinessState;
  reason: string;
  processorVersion: string | null;
  processedAt: string | null;
  inputHash: string | null;
  currentInputHash: string | null;
  inputHashMatches: boolean;
  processorVersionMatches: boolean;
  freshnessValid: boolean;
  requiredOutputValid: boolean;
  requiredOutputPending: boolean;
  missingFields: LogicalOutputFieldName[];
};

export type LogicProcessorMetadata = {
  logicProcessorVersion: string;
  logicProcessedAt: string;
  logicInputHash: string;
};

function normalizedMarker(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ")
    : "";
}

function meaningfulText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function fieldState(value: unknown, field: LogicalOutputFieldName, semantic: Record<string, unknown>): LogicalOutputContract["fields"][LogicalOutputFieldName] {
  const text = meaningfulText(value);
  const marker = normalizedMarker(text);
  if (marker === "ambigua" || marker === "ambiguo" || (field === "intent" && String(semantic.intencao_ambigua || "").toLocaleLowerCase("pt-BR") === "sim")) {
    return { state: "ambiguous", value: null };
  }
  // A logical conflict can still have a valid deterministic value. Only a
  // missing/pending value belongs to the processing state; review_required is
  // handled later by the human review stage.
  if (marker === "pendente" || marker === "pending") {
    return { state: "pending", value: null };
  }
  if (text && !["pendente", "pending", "unknown", "desconhecido", "desconhecida", "nao informado", "nao determinado", "indeterminado", "indeterminada", "nao classificavel", "ambigua", "ambiguo"].includes(marker)) {
    return { state: "value", value: text };
  }
  return { state: "explicit_unknown", value: null };
}

export function buildLogicalOutputContract(input: {
  semantic: Record<string, unknown>;
  intent?: unknown;
  niche?: unknown;
  funnel?: unknown;
}): LogicalOutputContract {
  const values: Record<LogicalOutputFieldName, unknown> = {
    intent: input.intent ?? input.semantic.intencao_principal,
    niche: input.niche ?? input.semantic.nicho_override ?? input.semantic.nicho,
    funnel: input.funnel ?? input.semantic.funnel,
    secondaryIntent: input.semantic.intencao_secundaria,
    editorialType: input.semantic.tipo_editorial,
    centralEntity: input.semantic.entidade_central,
    modifiers: input.semantic.modificadores,
    audience: input.semantic.publico,
    perceivedProblem: input.semantic.problema_percebido,
    desiredResult: input.semantic.resultado_desejado,
    jobToBeDone: input.semantic.job_to_be_done,
    awareness: input.semantic.nivel_consciencia,
    journey: input.semantic.etapa_jornada,
    commercialPotential: input.semantic.potencial_comercial,
    affiliatePotential: input.semantic.potencial_afiliado,
    localIntent: input.semantic.intencao_local,
    objection: input.semantic.objecao_implicita,
    urgency: input.semantic.urgencia_tempo,
    emotion: input.semantic.emocao_dominante,
    expectedFormat: input.semantic.formato_esperado,
    cannibalizationRisk: input.semantic.risco_canibalizacao,
    reviewCandidate: input.semantic.candidato_review,
    productResearchRequired: input.semantic.pesquisa_produto_necessaria,
    confidence: input.semantic.dna_confianca,
    evidence: input.semantic.evidencias_logicas,
  };
  return {
    version: LOGICAL_OUTPUT_CONTRACT_VERSION,
    fields: Object.fromEntries(LOGICAL_OUTPUT_FIELD_NAMES.map((name) => [name, fieldState(values[name], name, input.semantic)])) as LogicalOutputContract["fields"],
  };
}

export function validateLogicalKeywordOutput(input: {
  semantic?: Record<string, unknown> | null;
  intent?: unknown;
}): LogicalOutputContractResult {
  const semantic = input.semantic || {};
  const raw = semantic[LOGICAL_OUTPUT_CONTRACT_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { valid: false, contract: null, missingFields: ["intent", "niche", "funnel"] };
  }
  const candidate = raw as Record<string, unknown>;
  const fields = candidate.fields && typeof candidate.fields === "object" && !Array.isArray(candidate.fields)
    ? candidate.fields as Record<string, unknown>
    : null;
  if (candidate.version !== LOGICAL_OUTPUT_CONTRACT_VERSION || !fields) {
    return { valid: false, contract: null, missingFields: ["intent", "niche", "funnel"] };
  }
  const names = [...LOGICAL_OUTPUT_FIELD_NAMES];
  const missingFields: LogicalOutputFieldName[] = [];
  const normalizedFields = {} as LogicalOutputContract["fields"];
  for (const name of names) {
    const item = fields[name] && typeof fields[name] === "object" && !Array.isArray(fields[name])
      ? fields[name] as Record<string, unknown>
      : null;
    const state = item?.state;
    const value = meaningfulText(item?.value);
    if (!item || !["value", "explicit_unknown", "ambiguous", "pending"].includes(String(state))) {
      missingFields.push(name);
      continue;
    }
    if (state === "value" && !value) {
      missingFields.push(name);
      continue;
    }
    if (state !== "value" && item.value !== null && item.value !== undefined && value) {
      missingFields.push(name);
      continue;
    }
    normalizedFields[name] = { state: state as LogicalOutputFieldState, value: state === "value" ? value : null };
  }
  if (missingFields.length) return { valid: false, contract: null, missingFields };
  return {
    valid: true,
    contract: { version: LOGICAL_OUTPUT_CONTRACT_VERSION, fields: normalizedFields },
    missingFields: [],
  };
}

export function hasCompleteLogicalOutputContract(input: { semantic?: Record<string, unknown> | null; intent?: unknown }): boolean {
  const result = validateLogicalKeywordOutput(input);
  return result.valid
    && result.contract !== null
    && Object.values(result.contract.fields).every(field => field.state !== "pending");
}

/**
 * Explicit alias for consumers that need to distinguish the completed
 * process from the structural validator above. Ambiguous and explicit
 * unknown are completed outputs; only a pending field keeps the process open.
 */
export function hasCompletedLogicalOutputContract(input: { semantic?: Record<string, unknown> | null; intent?: unknown }): boolean {
  return hasCompleteLogicalOutputContract(input);
}

export function readLogicalOutputContract(semantic: Record<string, unknown> | null | undefined): LogicalOutputContract | null {
  const result = validateLogicalKeywordOutput({ semantic });
  return result.valid ? result.contract : null;
}

export type LogicalProcessorInput = {
  keywordId: string;
  keyword: string;
  location?: string | null;
  niche?: string | null;
};

function normalized(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const result = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
  return result || null;
}

/**
 * Stable, non-cryptographic identity for the inputs used by the deterministic
 * processor. It is a freshness marker, not a security signature.
 */
export function logicalProcessorInputHash(input: LogicalProcessorInput): string {
  const payload = JSON.stringify({
    keywordId: input.keywordId,
    keyword: normalized(input.keyword) || "",
    location: normalized(input.location),
    niche: normalized(input.niche),
  });
  let hash = 2166136261;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function buildLogicalProcessorMetadata(input: LogicalProcessorInput, processedAt: string): LogicProcessorMetadata {
  return {
    logicProcessorVersion: LOGIC_PROCESSOR_VERSION,
    logicProcessedAt: processedAt,
    logicInputHash: logicalProcessorInputHash(input),
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function readLogicalProcessorMetadata(semantic: Record<string, unknown> | null | undefined): Partial<LogicProcessorMetadata> {
  const current = semantic || {};
  return {
    ...(stringValue(current.logicProcessorVersion) ? { logicProcessorVersion: stringValue(current.logicProcessorVersion)! } : {}),
    ...(stringValue(current.logicProcessedAt) ? { logicProcessedAt: stringValue(current.logicProcessedAt)! } : {}),
    ...(stringValue(current.logicInputHash) ? { logicInputHash: stringValue(current.logicInputHash)! } : {}),
  };
}

export function hasCurrentLogicalProcessorMetadata(input: LogicalProcessorInput & { semantic?: Record<string, unknown> | null }): boolean {
  const metadata = readLogicalProcessorMetadata(input.semantic);
  const processedAt = metadata.logicProcessedAt;
  return metadata.logicProcessorVersion === LOGIC_PROCESSOR_VERSION
    && metadata.logicInputHash === logicalProcessorInputHash(input)
    && Boolean(processedAt && Number.isFinite(Date.parse(processedAt)));
}

function readinessNiche(input: LogicalProcessorInput & { semantic?: Record<string, unknown> | null }): string | null {
  const semantic = input.semantic || {};
  return input.niche
    ?? meaningfulText(semantic.nicho_override)
    ?? meaningfulText(semantic.nicho)
    ?? null;
}

/**
 * Canonical read-model for the deterministic logical stage.
 *
 * This deliberately requires the processor identity, the input hash, a
 * parseable processedAt and a completed output contract. It never treats a
 * local projection as a remote success and never uses a display label such as
 * "Pendente" as a proxy for freshness.
 */
export function resolveLogicalProcessReadiness(
  input: LogicalProcessorInput & { semantic?: Record<string, unknown> | null },
): LogicalProcessReadiness {
  const semantic = input.semantic || {};
  const metadata = readLogicalProcessorMetadata(semantic);
  const output = validateLogicalKeywordOutput({
    semantic,
    intent: semantic.intencao_principal,
  });
  const completedOutput = hasCompleteLogicalOutputContract({ semantic, intent: semantic.intencao_principal });
  const currentInputHash = input.keywordId && meaningfulText(input.keyword)
    ? logicalProcessorInputHash({
        keywordId: input.keywordId,
        keyword: input.keyword,
        location: input.location ?? null,
        niche: readinessNiche(input),
      })
    : null;
  const processorVersion = metadata.logicProcessorVersion || null;
  const processedAt = metadata.logicProcessedAt || null;
  const inputHash = metadata.logicInputHash || null;
  const processorVersionMatches = processorVersion === LOGIC_PROCESSOR_VERSION;
  const inputHashMatches = Boolean(currentInputHash && inputHash && currentInputHash === inputHash);
  const freshnessValid = Boolean(processedAt && Number.isFinite(Date.parse(processedAt)));
  const requiredOutputPending = Boolean(output.contract && Object.values(output.contract.fields).some(field => field.state === "pending"));
  const requiredOutputValid = output.valid && completedOutput;
  const hasArtifact = Boolean(
    semantic.dna_origem
      || semantic[LOGICAL_OUTPUT_CONTRACT_KEY]
      || processorVersion
      || processedAt
      || inputHash,
  );

  if (!hasArtifact) {
    return {
      state: "missing",
      reason: "Nenhuma leitura lógica persistida foi encontrada.",
      processorVersion,
      processedAt,
      inputHash,
      currentInputHash,
      inputHashMatches,
      processorVersionMatches,
      freshnessValid,
      requiredOutputValid,
      requiredOutputPending,
      missingFields: output.missingFields,
    };
  }

  if (!processorVersionMatches || !inputHashMatches || !freshnessValid) {
    return {
      state: "stale",
      reason: "A leitura lógica existente está desatualizada: versão, hash dos inputs ou data de processamento não coincide com o Processador atual.",
      processorVersion,
      processedAt,
      inputHash,
      currentInputHash,
      inputHashMatches,
      processorVersionMatches,
      freshnessValid,
      requiredOutputValid,
      requiredOutputPending,
      missingFields: output.missingFields,
    };
  }

  if (semantic.dna_origem !== "logico_deterministico" || !requiredOutputValid) {
    return {
      state: "incomplete",
      reason: requiredOutputPending
        ? "A leitura lógica foi persistida, mas ainda possui saída pendente do processo."
        : "A leitura lógica não contém todos os campos obrigatórios concluídos.",
      processorVersion,
      processedAt,
      inputHash,
      currentInputHash,
      inputHashMatches,
      processorVersionMatches,
      freshnessValid,
      requiredOutputValid,
      requiredOutputPending,
      missingFields: output.missingFields,
    };
  }

  return {
    state: "current_valid",
    reason: "Leitura lógica atual confirmada por versão, hash dos inputs, data válida e contrato de saída concluído.",
    processorVersion,
    processedAt,
    inputHash,
    currentInputHash,
    inputHashMatches,
    processorVersionMatches,
    freshnessValid,
    requiredOutputValid,
    requiredOutputPending,
    missingFields: output.missingFields,
  };
}

export function withoutLogicalProcessorMetadata(semantic: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const result = { ...(semantic || {}) };
  for (const key of LOGIC_PROCESSOR_METADATA_KEYS) delete result[key];
  return result;
}

export function logicalSemanticRecordsEqual(
  left: Record<string, unknown> | null | undefined,
  right: Record<string, unknown> | null | undefined,
): boolean {
  const normalizeRecord = (record: Record<string, unknown> | null | undefined) => Object.keys(withoutLogicalProcessorMetadata(record))
    .sort()
    .map(key => [key, withoutLogicalProcessorMetadata(record)?.[key]]);
  return JSON.stringify(normalizeRecord(left)) === JSON.stringify(normalizeRecord(right));
}

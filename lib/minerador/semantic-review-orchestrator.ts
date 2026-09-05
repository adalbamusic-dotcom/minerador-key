import {
  DeepSeekR5ResponseError,
  requestDeepSeekR5Phase,
  type DeepSeekR5PhaseDiagnostic,
  type DeepSeekR5PhaseNumber,
  type DeepSeekR5ReasoningMode,
} from "./deepseek-r5.ts";
import {
  buildSemanticReviewPhase1Input,
  buildSemanticReviewPhase1ResponseFormat,
  buildSemanticReviewPhase2Input,
  buildSemanticReviewPhase2ResponseFormat,
  buildSemanticReviewPhase3Input,
  buildSemanticReviewPhase3ResponseFormat,
  normalizePhasedSemanticReviewOutput,
  parseSemanticReviewPhase1Output,
  parseSemanticReviewPhase2Output,
  parseSemanticReviewPhase3Output,
  SEMANTIC_REVIEW_PHASE3_MINIMAL_EXAMPLE,
  type SemanticReviewPhase1Output,
  type SemanticReviewPhase2Output,
  type SemanticReviewPhase3Output,
  type SemanticReviewValueTelemetry,
} from "./semantic-review-phases.ts";
import { SemanticReviewOutputError, type SemanticReviewContext, type SemanticReviewOutput } from "./semantic-review.ts";

export const SEMANTIC_REVIEW_PHASE_BUDGETS = {
  // Phase 1 returns only semantic deltas, but the logical input itself can be
  // wide. Keep the output compact while giving the contract a safe envelope.
  phase1MaxCompletionTokens: 1100,
  phase2MaxCompletionTokens: 1100,
  phase3MaxCompletionTokens: 600,
} as const;

export const MAX_CALLS_PER_PHASE = 2 as const;
export const MAX_PHASE_1_TRUNCATION_RETRIES = 1 as const;
export const MAX_PHASE_2_TRUNCATION_RETRIES = 1 as const;
export const MAX_PHASE_3_TRUNCATION_RETRIES = 1 as const;
export const MAX_PHASE_3_SCHEMA_REPAIR_RETRIES = 1 as const;

export type SemanticReviewPhase = "semantic" | "evidence" | "synthesis";

const phaseMeta: Record<SemanticReviewPhase, {
  number: DeepSeekR5PhaseNumber;
  label: string;
  maxCompletionTokens: number;
}> = {
  semantic: { number: 1, label: "IA · Revisão semântica", maxCompletionTokens: SEMANTIC_REVIEW_PHASE_BUDGETS.phase1MaxCompletionTokens },
  evidence: { number: 2, label: "IA · Analisando evidências", maxCompletionTokens: SEMANTIC_REVIEW_PHASE_BUDGETS.phase2MaxCompletionTokens },
  synthesis: { number: 3, label: "IA · Consolidando revisão", maxCompletionTokens: SEMANTIC_REVIEW_PHASE_BUDGETS.phase3MaxCompletionTokens },
};

function thinkingModeForPhase(): DeepSeekR5ReasoningMode {
  // O R5 oficial usa JSON curto e determinístico nas três fases. Esta política
  // é exclusiva da operação e não altera o default global da Connection.
  return "disabled";
}

export type SemanticReviewPhaseProgress = {
  phase: SemanticReviewPhase;
  phaseNumber: DeepSeekR5PhaseNumber;
  phaseCount: 3;
  label: string;
  percent: 33 | 67 | 100;
  attempt: number;
  retry?: boolean;
};

export type SemanticReviewPhaseUsageEvent = SemanticReviewPhaseProgress & {
  status: "succeeded" | "failed";
  diagnostic: DeepSeekR5PhaseDiagnostic;
  providerCode?: string;
};

export class PhasedSemanticReviewError extends Error {
  readonly status: number;
  readonly code: string;
  readonly phase: SemanticReviewPhase;
  readonly phaseNumber: DeepSeekR5PhaseNumber;
  readonly diagnostic: DeepSeekR5PhaseDiagnostic;
  readonly providerCode: string | null;
  readonly repairContent: string | null;

  constructor(input: {
    phase: SemanticReviewPhase;
    phaseNumber: DeepSeekR5PhaseNumber;
    error: unknown;
    diagnostic: DeepSeekR5PhaseDiagnostic;
  }) {
    const providerCode = input.error instanceof DeepSeekR5ResponseError ? input.error.code : null;
    const suffix = providerCode === "AI_PROVIDER_RESPONSE_TRUNCATED"
      ? "TRUNCATED"
      : providerCode === "AI_PROVIDER_JSON_PARSE_FAILED"
        ? "JSON_PARSE_FAILED"
        : providerCode === "AI_PROVIDER_SCHEMA_INVALID"
          ? "SCHEMA_INVALID"
        : "FAILED";
    super(input.error instanceof Error ? input.error.message : `Falha na fase ${input.phaseNumber} da revisão IA.`);
    this.name = "PhasedSemanticReviewError";
    this.status = input.error instanceof DeepSeekR5ResponseError ? input.error.status : 502;
    this.code = `AI_PHASE_${input.phaseNumber}_${suffix}`;
    this.phase = input.phase;
    this.phaseNumber = input.phaseNumber;
    this.diagnostic = input.diagnostic;
    this.providerCode = providerCode;
    this.repairContent = input.error instanceof DeepSeekR5ResponseError ? input.error.repairContent : null;
  }
}

export type DeepSeekPhasedReviewConfig = {
  apiUrl: string;
  apiKey: string;
  model: string;
  extraHeaders?: Record<string, string>;
  responseFormatMode?: "json_object";
  thinkingMode?: DeepSeekR5ReasoningMode;
  sessionId?: string;
  fetchImpl?: typeof fetch;
};

export type RunKeywordSemanticReviewInput = {
  context: SemanticReviewContext;
  provider: DeepSeekPhasedReviewConfig;
  /** Only an explicit user action may spend the one automatic retry. */
  userInitiated?: boolean;
  onPhaseStarted?: (progress: SemanticReviewPhaseProgress) => void | Promise<void>;
  onPhaseUsage?: (event: SemanticReviewPhaseUsageEvent) => void | Promise<void>;
};

export type RunKeywordSemanticReviewResult = {
  output: SemanticReviewOutput;
  humanReviewNotes: string[];
  phaseDiagnostics: DeepSeekR5PhaseDiagnostic[];
  valueTelemetry: SemanticReviewValueTelemetry;
};

export const SEMANTIC_REVIEW_PHASE1_SYSTEM_PROMPT = `Você é a revisora semântica da primeira fase do KeywordDNA do Minerador.
O objeto principal é rawKeyword: interprete a keyword original por si mesma antes de olhar qualquer hipótese da Lógica.
Os valores em logicHypothesis foram produzidos por outro processador: são hipóteses auditáveis, não verdade nem ponto de partida semântico.
Não use nem imagine Google Ads, DataForSEO, KGR, CPC, histórico ou payload técnico nesta fase.

Siga esta ordem mental obrigatória:
A. leia rawKeyword;
B. faça uma interpretação semântica independente;
C. identifique sinais explícitos da expressão;
D. identifique sinais ausentes que limitam a conclusão;
E. somente depois compare sua leitura com logicHypothesis.

Avalie, quando aplicável e somente dentro dos campos existentes, entidade principal, modificadores, ação explícita, localidade, comparação, sinal comercial, problema, necessidade, resultado desejado, audiência, tipo de busca, possíveis interpretações e ambiguidade.

Retorne SOMENTE um objeto JSON com estas quatro chaves, exatamente:
agreementFields, divergences, semanticEnrichments, remainingAmbiguities.
Não inclua reviewStatus, overallVerdict, fieldReviews, status de revisão humana ou qualquer outra chave.

Regras do contrato:
- agreementFields: apenas nomes dos campos em que concorda; não repita valores ou justificativas;
- divergences: somente divergências reais, com field, suggestion, rationale e evidenceUsed;
- evidenceUsed é obrigatório em toda divergência e deve ser um array não vazio de strings curtas (1 a 8 itens), contendo sinais concretos da rawKeyword ou uma referência a evidência concreta das fases. Um caminho como logical.fields.intent sozinho não prova uma divergência;
- uma divergência é uma correção proposta acionável: não repita o valor atual, não use campo de métrica e não transforme concordância sem mudança em divergência;
- semanticEnrichments: somente acréscimos semânticos úteis, com type, value e rationale;
- não crie enriquecimento para repetir intenção, nicho, funil, entidade, modificador, uma ambiguidade já registrada ou qualquer fato medido;
- remainingAmbiguities: ambiguidades ainda abertas. Se não houver evidência suficiente para sustentar uma divergência, não crie divergência; registre a incerteza aqui.
- audite Intenção e Funil como eixos independentes; não converta uma intenção ambígua em Funil indefinido sem evidência;
- para Funil, TOFU exige tema amplo/descoberta e ausência de ação forte; MOFU exige comparação, avaliação, escolha, alternativas, "melhor", "vs", "vale a pena" ou diferenças; BOFU exige sinais como preço, comprar, contratar, agendar, orçamento, fornecedor, serviço/profissional explícito, perto de mim, cidade, onde fazer, disponibilidade ou contato;
- nome de técnica, nome de produto ou termo específico isolado não é evidência suficiente para promover a busca a BOFU;
- ambiguidade é uma conclusão válida. Se a leitura independente chegar à mesma conclusão da Lógica, concorde e não invente problema;
- mantenha a saída compacta: no máximo 3 divergências, 3 enriquecimentos e 3 ambiguidades;
- cada rationale e cada item de evidência deve ter no máximo 160 caracteres;
- não repita o valor lógico, a keyword inteira ou explicações longas.

Exemplo mínimo e exato do formato permitido:
{
  "agreementFields": ["niche"],
  "divergences": [
    {
      "field": "intent",
      "suggestion": "Comercial investigativa",
      "rationale": "A construção da keyword sugere avaliação de contratação.",
      "evidenceUsed": ["logical.fields.intent", "perto de mim"]
    }
  ],
  "semanticEnrichments": [],
  "remainingAmbiguities": []
}`;

const phase1RetrySystemPrompt = `${SEMANTIC_REVIEW_PHASE1_SYSTEM_PROMPT}

REPETIÇÃO CONTROLADA: a resposta anterior não terminou. Retorne agora somente o contrato mínimo: no máximo 2 divergências, 2 enriquecimentos e 2 ambiguidades; uma frase curta por rationale; sem repetir valores ou explicações.`;

const phase2SystemPrompt = `Você é a revisora quantitativa da segunda fase do KeywordDNA do Minerador.
Leia rawKeyword somente como contexto semântico e interprete o resumo normalizado de Google Ads, DataForSEO e KGR recebido.

Os fatos são imutáveis: volume, CPC, Resultado, KD, KGR, backlinks, referring domains, competition e trend não podem ser alterados, recalculados ou substituídos.
Não receba nem peça payload raw, histórico mensal completo, request ID ou proveniência técnica.

Retorne SOMENTE um objeto JSON com estas cinco chaves, exatamente:
supportingEvidence, contradictingEvidence, quantitativeWarnings, opportunitySignals e insufficientEvidence.
Não inclua reviewStatus, overallVerdict, fieldReviews, potencial editorial ou decisão humana.
Não crie thresholds nem classificação forte/moderada/fraca.
Cada lista pode ter no máximo 3 itens. Cada item deve ser uma frase curta, com no máximo 160 caracteres.
Não repita números entre listas, não reescreva o input e não explique fatos óbvios. Pergunte para cada item: esta evidência externa realmente reforça, contradiz ou limita uma leitura semântica da rawKeyword? Se não houver relação, não gere comentário.
Volume não determina Funil; Resultado não determina Funil; KGR não determina Intenção; KD não determina Intenção. Intenção externa é evidência secundária, nunca verdade absoluta: conflitos devem ser descritos, não resolvidos automaticamente. Se não houver item, use [].`;

const phase2RetrySystemPrompt = `${phase2SystemPrompt}

REPETIÇÃO CONTROLADA: a resposta anterior não terminou. Retorne o mesmo contrato agora de forma mínima: no máximo 2 itens por lista, uma frase curta por item, sem justificativas longas e sem repetição.`;

export const SEMANTIC_REVIEW_PHASE3_SYSTEM_PROMPT = `Você é a revisora de síntese final do KeywordDNA do Minerador.
Recebe rawKeyword, a leitura independente compacta da Phase 1, a hipótese lógica compacta e a síntese de evidências externas da Phase 2.
Faça a síntese nesta ordem: leitura independente da keyword, hipótese da Lógica, evidências externas compatíveis.
Não reconstrua o KeywordDNA, não repita todos os campos lógicos, não repita históricos e não altere fatos quantitativos.

Retorne SOMENTE um objeto JSON com estas seis chaves, exatamente:
reviewStatus, overallVerdict, divergences, enrichments, remainingAmbiguities e humanReviewNotes.
Use reviewStatus = "completed".
- overallVerdict deve ser exatamente: "CONCORDA", "CONCORDA PARCIALMENTE", "DIVERGE" ou "EVIDÊNCIA INSUFICIENTE".
- divergences deve ser um array de objetos. Cada objeto exige exatamente estes campos obrigatórios: field (string), suggestion (string, número, booleano, array de strings ou null), rationale (string) e evidenceUsed (array não vazio de 1 a 8 strings curtas).
- field, suggestion, rationale e evidenceUsed nunca podem ser omitidos. Use field, nunca campo; use rationale, nunca reason.
- enrichments deve ser um array de objetos, nunca array de strings. Cada objeto exige exatamente: type (string), value (string, array de strings ou null) e rationale (string).
- produza no máximo 3 enriquecimentos realmente novos; descarte paráfrases dos campos canônicos, números medidos, observações genéricas e duplicatas entre si;
- divergences são correções semânticas acionáveis. Não proponha alteração de Volume, Resultado, CPC, KD, KGR, tendência, concorrência, backlinks, targeting ou timestamps;
- só mantenha divergência quando houver mudança real, rationale específico, evidência identificável e relação direta entre a evidência e a sugestão. Evidência genérica ou hipótese especulativa deve virar array vazio;
- não promova Funil para BOFU por nome de técnica/produto isolado. Use sinais explícitos da rawKeyword; "perto de mim", "preço" e "qual é melhor" são exemplos de evidências concretas para BOFU/MOFU;
- remainingAmbiguities deve ser um valor compacto; quando não houver ambiguidade, use [].
- humanReviewNotes deve ser um array de strings curtas; quando não houver nota, use [].

Formato mínimo válido:
${JSON.stringify(SEMANTIC_REVIEW_PHASE3_MINIMAL_EXAMPLE)}

Quando a leitura independente e a hipótese lógica forem semanticamente coerentes, não invente divergências: use "divergences": [] e "enrichments": []. Correções propostas = 0 é um resultado válido.
Não produza confirmação humana, potencial editorial, principal, secundária, reforço, slug ou silo.`;

const phase3RetrySystemPrompt = `${SEMANTIC_REVIEW_PHASE3_SYSTEM_PROMPT}

REPETIÇÃO CONTROLADA: a resposta anterior não terminou. Retorne o mesmo contrato de forma mínima, usando arrays vazios quando não houver item e sem explicações longas.`;

const phase3SchemaRepairSystemPrompt = `Você corrige somente o formato da síntese JSON da Phase 3 do KeywordDNA.
O JSON anterior já contém a análise semântica. Não analise novamente a keyword, não mude o significado e não acrescente conteúdo.
Reescreva o mesmo resultado obedecendo exatamente ao contrato abaixo e responda somente com JSON.

Campos obrigatórios de cada divergência: field (string), suggestion (string, número, booleano, array de strings ou null), rationale (string), evidenceUsed (array não vazio de strings curtas).
Campos obrigatórios de cada enriquecimento: type (string), value (string, array de strings ou null), rationale (string).
Nunca transforme um enrichment em string simples e nunca omita field ou rationale.

Exemplo estrutural obrigatório:
${JSON.stringify(SEMANTIC_REVIEW_PHASE3_MINIMAL_EXAMPLE)}`;

function percentForPhase(phaseNumber: DeepSeekR5PhaseNumber): 33 | 67 | 100 {
  return phaseNumber === 1 ? 33 : phaseNumber === 2 ? 67 : 100;
}

function progressFor(phase: SemanticReviewPhase, attempt = 1, retry = false): SemanticReviewPhaseProgress {
  const meta = phaseMeta[phase];
  return {
    phase,
    phaseNumber: meta.number,
    phaseCount: 3,
    label: meta.label,
    percent: percentForPhase(meta.number),
    attempt,
    ...(retry ? { retry: true } : {}),
  };
}

function buildPhase3SchemaRepairUserPrompt(error: PhasedSemanticReviewError): string {
  const issues = error.diagnostic.schemaIssues.length
    ? error.diagnostic.schemaIssues.map((issue) => `${issue.path}: esperado ${issue.expected || "tipo compatível"}; recebido ${issue.received || "desconhecido"}`).join("\n")
    : error.diagnostic.schemaIssuePaths.join("\n");
  return `O JSON abaixo é sintaticamente válido, mas falhou no schema da Phase 3.
Corrija SOMENTE a estrutura, preserve o significado e responda somente com JSON.

Erros sanitizados do validator:
${issues || "formato incompatível com o contrato"}

JSON anterior:
${error.repairContent || "{}"}

Formato obrigatório:
${JSON.stringify(SEMANTIC_REVIEW_PHASE3_MINIMAL_EXAMPLE)}`;
}

function decorateDiagnostic(
  diagnostic: DeepSeekR5ResponseError["diagnostic"],
  phase: SemanticReviewPhase,
  thinkingMode: DeepSeekR5ReasoningMode,
  maxCompletionTokens: number,
): DeepSeekR5PhaseDiagnostic {
  const meta = phaseMeta[phase];
  return {
    ...diagnostic,
    phase: meta.number,
    reasoningMode: thinkingMode,
    phaseMaxCompletionTokens: maxCompletionTokens,
    requestedMaxTokens: maxCompletionTokens,
    thinkingExplicitlyConfigured: thinkingMode !== "provider_default",
  };
}

type ExecutePhaseAttemptInput<T> = {
  phase: SemanticReviewPhase;
  provider: DeepSeekPhasedReviewConfig;
  system: string;
  user: string;
  responseFormatBuilder: () => Record<string, unknown>;
  parseOutput: (content: string) => T;
  maxCompletionTokens?: number;
  attempt?: number;
  retry?: boolean;
  onPhaseStarted?: RunKeywordSemanticReviewInput["onPhaseStarted"];
  onPhaseUsage?: RunKeywordSemanticReviewInput["onPhaseUsage"];
  retryLabel?: string;
};

async function executePhaseAttempt<T>(input: ExecutePhaseAttemptInput<T>): Promise<{ output: T; diagnostic: DeepSeekR5PhaseDiagnostic }> {
  const maxCompletionTokens = input.maxCompletionTokens ?? phaseMeta[input.phase].maxCompletionTokens;
  const progress = progressFor(input.phase, input.attempt ?? 1, input.retry ?? false);
  const thinkingMode = thinkingModeForPhase();
  const visibleProgress = input.retry
    ? { ...progress, label: input.retryLabel || (input.phase === "synthesis" ? "IA · Ajustando resposta..." : `${progress.label} · repetindo`) }
    : progress;
  await input.onPhaseStarted?.(visibleProgress);
  try {
    const result = await requestDeepSeekR5Phase({
      ...input.provider,
      system: input.system,
      user: input.user,
      responseFormatBuilder: input.responseFormatBuilder,
      thinkingMode,
      parseOutput: input.parseOutput,
      phase: progress.phaseNumber,
      maxCompletionTokens,
    });
    await input.onPhaseUsage?.({ ...visibleProgress, status: "succeeded", diagnostic: result.diagnostic });
    return result;
  } catch (error) {
    const baseDiagnostic: DeepSeekR5ResponseError["diagnostic"] = error instanceof DeepSeekR5ResponseError
      ? error.diagnostic
      : {
          provider: "deepseek" as const,
          requestedModel: input.provider.model,
          returnedModel: null,
          httpStatus: null,
          finishReason: null,
          nativeFinishReason: null,
          choicesCount: null,
          messagePresent: false,
          contentPresent: false,
          contentType: null,
          contentLength: 0,
          reasoningPresent: false,
          maxTokensSent: null,
          maxCompletionTokensSent: maxCompletionTokens,
          outputTokenParameter: "max_tokens" as const,
          outputTokenLimit: maxCompletionTokens,
          promptTokens: null,
           completionTokens: null,
           totalTokens: null,
           reasoningTokens: null,
           reasoningEffort: null,
           cost: null,
          providerRequireParameters: false,
          providerErrorCode: null,
          providerErrorType: null,
          providerErrorMessage: null,
          providerErrorCategory: null,
          responseFormatRequested: "none" as const,
          resolvedOutputFormatMode: "unknown" as const,
          schemaMode: "unknown" as const,
          structuredOutputRequested: false,
          providerMetadata: { provider: null, route: null, upstreamModel: null, systemFingerprint: null },
          envelopeJsonParse: "not_run" as const,
          jsonParse: "not_run" as const,
          schemaValidation: "not_run" as const,
          schemaIssuePaths: [],
          schemaIssues: [],
          responseShape: null,
          requestId: null,
          failureStage: "http_request" as const,
        };
     const diagnostic = decorateDiagnostic(baseDiagnostic, input.phase, thinkingMode, maxCompletionTokens);
    await input.onPhaseUsage?.({
      ...visibleProgress,
      status: "failed",
      diagnostic,
      providerCode: error instanceof DeepSeekR5ResponseError ? error.code : "AI_PROVIDER_ERROR",
    });
    throw new PhasedSemanticReviewError({ phase: input.phase, phaseNumber: progress.phaseNumber, error, diagnostic });
  }
}

type PhaseRecoveryInput<T> = Omit<ExecutePhaseAttemptInput<T>, "attempt" | "retry" | "retryLabel"> & {
  retryLabel?: string;
};

type ExecuteReliablePhaseInput<T> = ExecutePhaseAttemptInput<T> & {
  userInitiated?: boolean;
  truncationRecovery?: PhaseRecoveryInput<T>;
  schemaRecovery?: (error: PhasedSemanticReviewError) => PhaseRecoveryInput<T> | null;
};

function isDeepSeekProvider(provider: DeepSeekPhasedReviewConfig): boolean {
  return provider.apiUrl.toLocaleLowerCase().includes("deepseek")
    || provider.model.toLocaleLowerCase().includes("deepseek");
}

function recoveryKind(error: PhasedSemanticReviewError): "truncated" | "schema" | null {
  if (error.providerCode === "AI_PROVIDER_RESPONSE_TRUNCATED") return "truncated";
  if (error.providerCode === "AI_PROVIDER_SCHEMA_INVALID") return "schema";
  return null;
}

/**
 * Uniform R5 envelope: one initial call and, only after an explicit user
 * action, one recovery call for the same phase. A valid phase is never
 * re-executed because a later phase failed.
 */
export async function executeR5PhaseWithReliability<T>(input: ExecuteReliablePhaseInput<T>): Promise<{ output: T; diagnostic: DeepSeekR5PhaseDiagnostic }> {
  try {
    return await executePhaseAttempt(input);
  } catch (error: unknown) {
    if (!(error instanceof PhasedSemanticReviewError)
      || !input.userInitiated
      || !isDeepSeekProvider(input.provider)
      || MAX_CALLS_PER_PHASE < 2) {
      throw error;
    }

    const kind = recoveryKind(error);
    const retryAllowed = kind === "truncated"
      ? error.phaseNumber === 1
        ? MAX_PHASE_1_TRUNCATION_RETRIES
        : error.phaseNumber === 2
          ? MAX_PHASE_2_TRUNCATION_RETRIES
          : MAX_PHASE_3_TRUNCATION_RETRIES
      : MAX_PHASE_3_SCHEMA_REPAIR_RETRIES;
    if (retryAllowed < 1) throw error;
    const recovery = kind === "truncated"
      ? input.truncationRecovery
      : kind === "schema"
        ? input.schemaRecovery?.(error) || undefined
        : undefined;
    if (!recovery) throw error;

    return executePhaseAttempt({
      ...recovery,
      attempt: 2,
      retry: true,
      retryLabel: recovery.retryLabel,
      onPhaseStarted: input.onPhaseStarted,
      onPhaseUsage: input.onPhaseUsage,
    });
  }
}

export async function runKeywordSemanticReview(input: RunKeywordSemanticReviewInput): Promise<RunKeywordSemanticReviewResult> {
  const phase1 = await executeR5PhaseWithReliability<SemanticReviewPhase1Output>({
    phase: "semantic",
    provider: input.provider,
    system: SEMANTIC_REVIEW_PHASE1_SYSTEM_PROMPT,
    user: `Revise somente esta leitura lógica compacta:\n\n${JSON.stringify(buildSemanticReviewPhase1Input(input.context))}`,
    responseFormatBuilder: buildSemanticReviewPhase1ResponseFormat,
    parseOutput: parseSemanticReviewPhase1Output,
    userInitiated: input.userInitiated,
    truncationRecovery: {
      phase: "semantic",
      provider: input.provider,
      system: phase1RetrySystemPrompt,
      user: `Responda somente o delta semântico mínimo abaixo. Não repita a leitura lógica:\n\n${JSON.stringify(buildSemanticReviewPhase1Input(input.context))}`,
      responseFormatBuilder: buildSemanticReviewPhase1ResponseFormat,
      parseOutput: parseSemanticReviewPhase1Output,
      maxCompletionTokens: SEMANTIC_REVIEW_PHASE_BUDGETS.phase1MaxCompletionTokens,
    },
    onPhaseStarted: input.onPhaseStarted,
    onPhaseUsage: input.onPhaseUsage,
  });
  const phase2 = await executeR5PhaseWithReliability<SemanticReviewPhase2Output>({
    phase: "evidence",
    provider: input.provider,
    system: phase2SystemPrompt,
    user: `Interprete somente estes fatos resumidos e imutáveis:\n\n${JSON.stringify(buildSemanticReviewPhase2Input(input.context))}`,
    responseFormatBuilder: buildSemanticReviewPhase2ResponseFormat,
    parseOutput: parseSemanticReviewPhase2Output,
    userInitiated: input.userInitiated,
    truncationRecovery: {
      phase: "evidence",
      provider: input.provider,
      system: phase2RetrySystemPrompt,
      user: `Responda somente o resumo quantitativo mínimo abaixo. Não reescreva os fatos.\n\n${JSON.stringify(buildSemanticReviewPhase2Input(input.context))}`,
      responseFormatBuilder: buildSemanticReviewPhase2ResponseFormat,
      parseOutput: parseSemanticReviewPhase2Output,
      maxCompletionTokens: SEMANTIC_REVIEW_PHASE_BUDGETS.phase2MaxCompletionTokens,
    },
    onPhaseStarted: input.onPhaseStarted,
    onPhaseUsage: input.onPhaseUsage,
  });
  const phase3 = await executeR5PhaseWithReliability<SemanticReviewPhase3Output>({
    phase: "synthesis",
    provider: input.provider,
    system: SEMANTIC_REVIEW_PHASE3_SYSTEM_PROMPT,
    user: `Consolide somente estes resultados compactos:\n\n${JSON.stringify(buildSemanticReviewPhase3Input({ context: input.context, phase1: phase1.output, phase2: phase2.output }))}`,
    responseFormatBuilder: buildSemanticReviewPhase3ResponseFormat,
    parseOutput: parseSemanticReviewPhase3Output,
    userInitiated: input.userInitiated,
    truncationRecovery: {
      phase: "synthesis",
      provider: input.provider,
      system: phase3RetrySystemPrompt,
      user: `Retorne a síntese mínima e válida para estes resultados:\n\n${JSON.stringify(buildSemanticReviewPhase3Input({ context: input.context, phase1: phase1.output, phase2: phase2.output }))}`,
      responseFormatBuilder: buildSemanticReviewPhase3ResponseFormat,
      parseOutput: parseSemanticReviewPhase3Output,
      maxCompletionTokens: SEMANTIC_REVIEW_PHASE_BUDGETS.phase3MaxCompletionTokens,
    },
    schemaRecovery: (error) => error.repairContent
      ? {
          phase: "synthesis",
          provider: input.provider,
          system: phase3SchemaRepairSystemPrompt,
          user: buildPhase3SchemaRepairUserPrompt(error),
          responseFormatBuilder: buildSemanticReviewPhase3ResponseFormat,
          parseOutput: parseSemanticReviewPhase3Output,
          maxCompletionTokens: SEMANTIC_REVIEW_PHASE_BUDGETS.phase3MaxCompletionTokens,
        }
      : null,
    onPhaseStarted: input.onPhaseStarted,
    onPhaseUsage: input.onPhaseUsage,
  });

  let normalized: ReturnType<typeof normalizePhasedSemanticReviewOutput>;
  try {
    normalized = normalizePhasedSemanticReviewOutput({ context: input.context, phase1: phase1.output, phase2: phase2.output, phase3: phase3.output });
  } catch (error) {
    if (error instanceof SemanticReviewOutputError) {
      throw new PhasedSemanticReviewError({
        phase: "synthesis",
        phaseNumber: 3,
        error,
        diagnostic: phase3.diagnostic,
      });
    }
    throw error;
  }

  return {
    output: normalized.output,
    humanReviewNotes: normalized.humanReviewNotes,
    phaseDiagnostics: [phase1.diagnostic, phase2.diagnostic, phase3.diagnostic],
    valueTelemetry: normalized.valueTelemetry,
  };
}

export function semanticReviewPhaseLabels(): Record<SemanticReviewPhase, string> {
  return Object.fromEntries(Object.entries(phaseMeta).map(([phase, meta]) => [phase, meta.label])) as Record<SemanticReviewPhase, string>;
}

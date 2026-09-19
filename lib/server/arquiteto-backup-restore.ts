import "server-only";

/**
 * AUTORIDADE DE RESTAURAÇÃO DO ARQUITETO.
 *
 * Restaurar não é INSERT em tabela. Cada tipo do backup entra pelo MESMO
 * writer canônico que a mesa usa no dia a dia — `appendArquitetoArtifact`,
 * `createTerritoryWorkflowItem`, `createSiloWorkingCopy`, `save*Assessment`,
 * `persistInternalLinkGraph` — e herda dele a validação de Brand, de contrato,
 * de identidade e de lock. Não existe bypass: o que a autoridade normal recusa,
 * a restauração também recusa.
 *
 * Duas etapas, sempre: `plan` (leitura pura do remoto + classificação) e
 * `apply` (escrita pelos writers + readback + comparação semântica). O apply
 * recusa o lote inteiro quando o plano tem CONFLICT ou BLOCKED — restauração
 * parcial silenciosa não existe.
 *
 * Identidade: território e working copy de Silo têm o identificador EMITIDO
 * pelo servidor. Eles nunca voltam com o id do backup; o id novo entra no mapa
 * e todas as referências são religadas por ele.
 */

import {
  BACKUP_RESTORE_ORDER,
  BACKUP_SERVER_EMITTED_IDENTITY,
  validateBackupIntegrity,
  type BackupFile,
  type BackupRecord,
  type BackupRecordType,
} from "@/lib/arquiteto/backup-contract";
import { remapReferences } from "@/lib/arquiteto/backup-restore";
import { contentHash } from "@/lib/arquiteto/versioning";
import {
  ArticleDNASchema,
  InternalLinkGraphSchema,
  InternalLinkGraphWorkingCopySchema,
  SiloDNASchema,
  SiloPageSchema,
  VersionedArticleDNASchema,
  VersionedSiloDNASchema,
  VersionedSiloPageSchema,
  type VersionEnvelope,
} from "@/lib/arquiteto/contracts";
import { ARTICLE_AI_REVIEW_ARTIFACT_TYPE, VersionedArticleArchitectureAiReviewSchema } from "@/lib/arquiteto/article-ai-review";
import { TerritorialSerpPayloadSchema } from "@/lib/arquiteto/territorial-serp-record";
import { ArticleFormationSerpPayloadSchema } from "@/lib/arquiteto/article-serp-record";
import { TerritorialAiPayloadSchema } from "@/lib/arquiteto/territorial-ai-record";
import { ArchitectureMarkerPayloadSchema } from "@/lib/arquiteto/architecture-marker-record";
import { ArticleFormationMarkerPayloadSchema } from "@/lib/arquiteto/article-formation-marker";
import { appendArquitetoArtifact, listArquitetoArtifacts, type ArquitetoArtifactType, type ArquitetoArtifactVersion } from "./arquiteto-persistence";
import { createTerritoryWorkflowItem, listTerritoryWorkflowItems } from "./arquiteto-territory-store";
import { createSiloWorkingCopy, listSiloWorkingCopies } from "./arquiteto-silo-working-copy-store";
import { listTerritorialSerpAssessments, saveTerritorialSerpAssessment } from "./arquiteto-territorial-serp-store";
import { listArticleFormationSerpAssessments, saveArticleFormationSerpAssessment } from "./arquiteto-article-serp-store";
import { listTerritorialAiProposals, saveTerritorialAiProposal } from "./arquiteto-territorial-ai-store";
import { readArchitectureMarker, saveArchitectureMarker } from "./arquiteto-architecture-marker-store";
import { readArticleFormationMarker, saveArticleFormationMarker } from "./arquiteto-article-formation-marker-store";
import { listInternalLinkGraphs, persistInternalLinkGraph, persistInternalLinkGraphWorkingCopy } from "./internal-link-graph-persistence";
import { WorkflowRepository } from "./pipeline-repositories";
import { PipelineRuntimeError, pipelineErrorFromSupabase, type PipelineContext } from "./pipeline-runtime";

/* ------------------------------- contrato -------------------------------- */

export type RestoreOutcome = "CREATE" | "NO_OP" | "REMAP" | "CONFLICT" | "BLOCKED";

export type RestorePlanEntry = {
  recordType: BackupRecordType;
  recordKey: string;
  recordVersion: number | null;
  outcome: RestoreOutcome;
  reason: string;
};

export type RestorePlanResult = {
  brandId: string;
  sourceBrandId: string;
  exportedAt: string;
  entries: RestorePlanEntry[];
  issues: ReturnType<typeof validateBackupIntegrity>;
  counts: Record<RestoreOutcome, number>;
  executable: boolean;
  summary: string;
};

export type RestoreAppliedEntry = RestorePlanEntry & {
  restoredKey: string | null;
  restoredVersionId: string | null;
};

export type RestoreDifference = {
  recordType: BackupRecordType;
  recordKey: string;
  field: string;
  expected: string;
  actual: string;
};

export type RestoreApplyResult = {
  plan: RestorePlanResult;
  applied: RestoreAppliedEntry[];
  identityMap: Record<string, string>;
  readback: { checked: number; equivalent: boolean; differences: RestoreDifference[] };
  summary: string;
};

/** O estado do Arquiteto lido do remoto — a mesma leitura que a mesa faz. */
export type CanonicalRestoreState = {
  artifacts: Awaited<ReturnType<typeof listArquitetoArtifacts>>;
  territories: Awaited<ReturnType<typeof listTerritoryWorkflowItems>>;
  siloWorkingCopies: Awaited<ReturnType<typeof listSiloWorkingCopies>>;
  territorialSerp: Awaited<ReturnType<typeof listTerritorialSerpAssessments>>;
  articleFormationSerp: Awaited<ReturnType<typeof listArticleFormationSerpAssessments>>;
  territorialAi: Awaited<ReturnType<typeof listTerritorialAiProposals>>;
  architectureMarker: Awaited<ReturnType<typeof readArchitectureMarker>>;
  articleFormationMarker: Awaited<ReturnType<typeof readArticleFormationMarker>>;
  graphs: Awaited<ReturnType<typeof listInternalLinkGraphs>>;
  workflowItems: readonly Record<string, unknown>[];
};

export async function readCanonicalRestoreState(context: PipelineContext): Promise<CanonicalRestoreState> {
  // Estreitada por etapa: a restauração só trata itens do Arquiteto.
  const workflow = await new WorkflowRepository(context).listByStage("architect");
  const [artifacts, territories, siloWorkingCopies, territorialSerp, articleFormationSerp, territorialAi, architectureMarker, articleFormationMarker, graphs] = await Promise.all([
    listArquitetoArtifacts(context),
    listTerritoryWorkflowItems(context),
    listSiloWorkingCopies(context),
    listTerritorialSerpAssessments(context),
    listArticleFormationSerpAssessments(context),
    listTerritorialAiProposals(context),
    readArchitectureMarker(context),
    readArticleFormationMarker(context),
    listInternalLinkGraphs(context),
  ]);
  return {
    artifacts, territories, siloWorkingCopies, territorialSerp, articleFormationSerp,
    territorialAi, architectureMarker, articleFormationMarker, graphs,
    workflowItems: workflow.status === "READY" ? workflow.data as readonly Record<string, unknown>[] : [],
  };
}

/* ------------------------------ normalização ----------------------------- */

/**
 * O que a comparação semântica IGNORA.
 *
 * Identificador remapeado e carimbo de tempo da restauração são exatamente o
 * que deve mudar; compará-los reprovaria toda restauração correta. Tudo o mais
 * — conteúdo, relações, versões lógicas, papéis, estados e topologia — precisa
 * bater.
 */
const VOLATILE_FIELDS = new Set([
  "versionId", "graphVersionId", "workingCopyId", "workflowItemId", "id",
  "createdAt", "updatedAt", "createdBy", "updatedBy", "approvedAt", "approvedBy",
  "lockVersion", "previousVersionId", "baseGraphVersionId", "changeReason", "origin",
  "capturedAt", "decidedAt", "generatedAt", "measuredAt", "operationRequestId",
]);

/**
 * ENVIRONMENT-SPECIFIC — documentado, e só ignorado quando a comparação
 * atravessa Brands.
 *
 * `brandId` e `marca_id` são o ENDEREÇO do artefato, não o conteúdo dele. Numa
 * homologação que restaura Care Glow numa Brand descartável, eles têm de
 * mudar; compará-los reprovaria justamente a restauração correta. Dentro da
 * mesma Brand eles continuam sendo comparados.
 */
export const ENVIRONMENT_SPECIFIC_FIELDS = ["brandId", "marca_id"] as const;

export function semanticShape(value: unknown, options: { ignoreEnvironment?: boolean } = {}): unknown {
  if (Array.isArray(value)) return value.map(item => semanticShape(item, options));
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (VOLATILE_FIELDS.has(key)) continue;
      if (options.ignoreEnvironment && (ENVIRONMENT_SPECIFIC_FIELDS as readonly string[]).includes(key)) continue;
      next[key] = semanticShape(source[key], options);
    }
    return next;
  }
  return value;
}

function stable(value: unknown): string {
  return JSON.stringify(semanticShape(value));
}

/* -------------------------------- índice --------------------------------- */

type StateIndexEntry = {
  key: string;
  contentHash: string | null;
  protectedState: boolean;
  semantic: string;
  /** O mesmo conteúdo sem a identidade que o servidor emite. */
  semanticWithoutIdentity: string;
};

/**
 * Para território e working copy de Silo, a própria referência está DENTRO do
 * payload. Compará-la faria o mesmo conteúdo restaurado parecer diferente,
 * e a restauração nunca seria idempotente para esses tipos.
 */
const EMITTED_IDENTITY_FIELDS = ["territoryRef", "workingCopyRef"];

function withoutEmittedIdentity(value: unknown, options: { ignoreEnvironment?: boolean } = {}): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return semanticShape(value, options);
  const source = { ...(value as Record<string, unknown>) };
  for (const field of EMITTED_IDENTITY_FIELDS) delete source[field];
  return semanticShape(source, options);
}

function artifactTypeOf(recordType: BackupRecordType): ArquitetoArtifactType | null {
  if (recordType === "ARTICLE_DNA") return "article_dna";
  if (recordType === "SILO_DNA") return "silo_dna";
  if (recordType === "SILO_PAGE") return "silo_page";
  if (recordType === "ARTICLE_AI_REVIEW") return ARTICLE_AI_REVIEW_ARTIFACT_TYPE;
  return null;
}

function indexState(state: CanonicalRestoreState, options: { ignoreEnvironment?: boolean } = {}): Map<string, StateIndexEntry> {
  const index = new Map<string, StateIndexEntry>();
  const put = (recordType: BackupRecordType, key: string, contentHash: string | null, protectedState: boolean, semantic: unknown) =>
    index.set(`${recordType} ${key}`, {
      key, contentHash, protectedState,
      semantic: JSON.stringify(semanticShape(semantic, options)),
      semanticWithoutIdentity: JSON.stringify(withoutEmittedIdentity(semantic, options)),
    });

  const statusByVersion = new Map(state.artifacts.statuses.map(item => [item.versionId, item.status]));
  const latest = <T>(versions: readonly VersionEnvelope<T>[], keyOf: (version: VersionEnvelope<T>) => string) => {
    const map = new Map<string, VersionEnvelope<T>>();
    for (const version of versions) {
      const key = keyOf(version);
      const current = map.get(key);
      if (!current || version.versionNumber > current.versionNumber) map.set(key, version);
    }
    return map;
  };

  for (const [key, version] of latest(state.artifacts.articleDnas, item => item.payload.articleId)) {
    put("ARTICLE_DNA", key, version.contentHash, statusByVersion.get(version.versionId) === "approved" || Boolean(version.payload.publishedIdentityRef), version.payload);
  }
  for (const [key, version] of latest(state.artifacts.siloDnas, item => item.payload.siloId)) {
    put("SILO_DNA", key, version.contentHash, statusByVersion.get(version.versionId) === "approved", version.payload);
  }
  for (const [key, version] of latest(state.artifacts.siloPages, item => item.payload.siloPageId)) {
    put("SILO_PAGE", key, version.contentHash, statusByVersion.get(version.versionId) === "approved" || version.payload.publicationStatus === "published", version.payload);
  }
  for (const [key, version] of latest(state.artifacts.aiReviews, item => item.payload.articleId)) {
    put("ARTICLE_AI_REVIEW", key, version.contentHash, false, version.payload);
  }
  for (const graph of state.graphs) put("INTERNAL_LINK_GRAPH", graph.graphId, graph.contentHash, graph.workflowStatus === "approved", graph);
  for (const territory of state.territories) put("TERRITORY", territory.territoryRef, null, false, territory.territory);
  for (const copy of state.siloWorkingCopies) put("SILO_WORKING_COPY", copy.workingCopyRef, null, false, copy.workingCopy);
  for (const item of state.territorialSerp) put("TERRITORIAL_SERP", item.questionId, null, false, item.payload);
  for (const item of state.articleFormationSerp) put("ARTICLE_FORMATION_SERP", item.candidateRef, null, false, item.payload);
  for (const item of state.territorialAi) put("TERRITORIAL_AI", item.questionId, null, false, item.payload);
  if (state.architectureMarker) put("ARCHITECTURE_MARKER", "architecture", null, false, state.architectureMarker.payload);
  if (state.articleFormationMarker) put("ARTICLE_FORMATION_MARKER", "article-formation", null, false, state.articleFormationMarker.payload);
  for (const row of state.workflowItems) {
    if (String(row.stage) !== "architect") continue;
    if (String(row.subject_type) === "article") put("WORKFLOW_STATUS", String(row.subject_id), null, false, { state: row.state });
    if (String(row.subject_type) === "keyword") put("KEYWORD_ASSIGNMENT", String(row.subject_id), null, false, row.payload);
  }
  return index;
}

/* --------------------------------- plano --------------------------------- */

/**
 * A forma comparável de um registro.
 *
 * O backup guarda o envelope inteiro do artefato, mas quem responde pelo
 * conteúdo é o payload. E o status operacional é gravado como `state` na linha
 * de workflow: comparar o envelope do backup com a linha crua acusaria
 * divergência em toda restauração correta.
 */
function recordSemantic(record: BackupRecord): unknown {
  const payload = record.payload as Record<string, unknown>;
  if (artifactTypeOf(record.recordType)) return payload.payload ?? payload;
  if (record.recordType === "WORKFLOW_STATUS") return { state: String(payload.status ?? record.status) };
  return payload;
}

export type RestoreOptions = {
  /**
   * Restaurar numa Brand diferente da de origem. É DECISÃO EXPLÍCITA de
   * homologação: sem ela o plano é bloqueado. Ligada, o payload inteiro passa
   * a apontar para a Brand de destino e toda identidade de versão é reemitida
   * — nenhum UUID da Brand original é pressuposto reutilizável.
   */
  allowCrossBrand?: boolean;
};

export function buildRestorePlan(file: BackupFile, brandId: string, state: CanonicalRestoreState, options: RestoreOptions = {}): RestorePlanResult {
  const issues = [...validateBackupIntegrity(file)];
  const crossBrand = file.header.brandId !== brandId;
  if (crossBrand && !options.allowCrossBrand) {
    issues.push({ severity: "error", code: "CROSS_BRAND_RESTORE", recordType: null, recordKey: null, detail: `O backup é da Brand ${file.header.brandId} e a Marca ativa é ${brandId}. Restaurar entre Brands exige decisão explícita de homologação.` });
  }
  const blocking = issues.some(issue => issue.severity === "error");
  const index = indexState(state);

  const ordered = [...file.records].sort((left, right) => BACKUP_RESTORE_ORDER.indexOf(left.recordType) - BACKUP_RESTORE_ORDER.indexOf(right.recordType));
  const entries: RestorePlanEntry[] = ordered.map(record => {
    const base = { recordType: record.recordType, recordKey: record.recordKey, recordVersion: record.recordVersion };
    if (blocking) return { ...base, outcome: "BLOCKED", reason: "A validação de integridade do arquivo falhou; nenhum registro é aplicado." };

    const current = index.get(`${record.recordType} ${record.recordKey}`);
    const semantic = stable(recordSemantic(record));
    const emitted = BACKUP_SERVER_EMITTED_IDENTITY.includes(record.recordType);

    if (emitted) {
      // A identidade é emitida pelo servidor: o mesmo conteúdo já restaurado
      // aparece com OUTRA chave. Procurar por conteúdo, ignorando a própria
      // referência, é o que torna a restauração idempotente para estes tipos.
      const semSemIdentidade = JSON.stringify(withoutEmittedIdentity(recordSemantic(record)));
      const equivalente = [...index.entries()].find(([key, entry]) => key.startsWith(`${record.recordType} `) && entry.semanticWithoutIdentity === semSemIdentidade);
      if (equivalente) return { ...base, outcome: "NO_OP", reason: `Já existe com o mesmo conteúdo sob a identidade ${equivalente[1].key}.` };
      return { ...base, outcome: "REMAP", reason: "A identidade é emitida pelo servidor; o backup entra com um identificador novo e as referências são religadas." };
    }

    if (!current) return { ...base, outcome: "CREATE", reason: "O artefato não existe na Marca ativa e será recriado pelo writer canônico." };
    if (record.contentHash && current.contentHash === record.contentHash) return { ...base, outcome: "NO_OP", reason: "O mesmo conteúdo já está persistido; nada é reescrito." };
    if (!record.contentHash && current.semantic === semantic) return { ...base, outcome: "NO_OP", reason: "O conteúdo persistido é equivalente ao do backup; nada é reescrito." };
    if (current.protectedState) return { ...base, outcome: "CONFLICT", reason: "A Marca ativa tem este artefato com conteúdo diferente e estado protegido. Nada é sobrescrito em silêncio." };
    return { ...base, outcome: "CONFLICT", reason: "A identidade existe com conteúdo divergente; a restauração não sobrescreve sem decisão humana." };
  });

  const counts = entries.reduce<Record<RestoreOutcome, number>>((totals, entry) => {
    totals[entry.outcome] += 1;
    return totals;
  }, { CREATE: 0, NO_OP: 0, REMAP: 0, CONFLICT: 0, BLOCKED: 0 });

  const executable = !blocking && counts.CONFLICT === 0 && counts.BLOCKED === 0;
  const parts = (Object.entries(counts) as [RestoreOutcome, number][]).filter(([, value]) => value > 0).map(([key, value]) => `${value} ${key}`);
  return {
    brandId,
    sourceBrandId: file.header.brandId,
    exportedAt: file.header.exportedAt,
    entries,
    issues,
    counts,
    executable,
    summary: `Prévia da restauração: ${entries.length} registro(s) · ${parts.join(" · ") || "nada a aplicar"}.`,
  };
}

/**
 * O backup traduzido para a Brand de destino.
 *
 * Restaurar em outra Brand não é copiar linhas: o payload inteiro precisa
 * apontar para a Brand nova, e o hash de conteúdo precisa voltar a descrever o
 * conteúdo — manter o hash de origem sobre um payload alterado seria gravar
 * uma assinatura que não confere. A identidade de cada versão é REEMITIDA e
 * entra no mapa; nenhum UUID da Brand original é pressuposto reutilizável.
 *
 * Numa restauração dentro da mesma Brand nada disso acontece: a função devolve
 * o arquivo como veio.
 */
/**
 * A identidade reemitida é DERIVADA, não sorteada.
 *
 * Um `randomUUID` por execução faria a segunda restauração do mesmo arquivo
 * gerar outros identificadores — e a idempotência morreria ali: o mesmo
 * conteúdo voltaria como artefato novo. Derivar de (Brand de destino, id de
 * origem) mantém a troca estável entre execuções sem reutilizar o id antigo.
 */
async function derivedUuid(seed: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed)));
  const hex = [...bytes.slice(0, 16)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export async function localizeBackupForBrand(
  file: BackupFile,
  targetBrandId: string,
): Promise<{ file: BackupFile; seededIdentity: Map<string, string> }> {
  const seededIdentity = new Map<string, string>();
  if (file.header.brandId === targetBrandId) return { file, seededIdentity };

  for (const record of file.records) {
    const payload = record.payload as { versionId?: unknown };
    if (typeof payload.versionId === "string" && payload.versionId.trim()) {
      seededIdentity.set(payload.versionId, await derivedUuid(`${targetBrandId}:${payload.versionId}`));
    }
  }

  const brandMap = new Map([[file.header.brandId, targetBrandId]]);
  let records: BackupRecord[] = file.records.map(record => ({
    ...record,
    parentRef: "",
    payload: remapReferences(remapReferences(record.payload, brandMap), seededIdentity) as Record<string, unknown>,
  }));

  /*
   * PONTO FIXO DOS HASHES.
   *
   * Mudar a Brand muda o conteúdo, e o hash precisa voltar a descrever o
   * conteúdo — a autoridade recusa uma SiloPage cujo `siloDnaRef.contentHash`
   * não corresponde ao SiloDNA persistido. Mas o hash da SiloPage depende do
   * hash do SiloDNA, e o do grafo depende dos dois: reescrever uma vez só
   * deixaria a cadeia pela metade. O laço repete até nenhum hash mudar.
   */
  for (let passada = 0; passada < 6; passada += 1) {
    const hashMap = new Map<string, string>();
    for (const record of records) {
      const artifactType = artifactTypeOf(record.recordType);
      const payload = (record.payload as { payload?: unknown }).payload;
      if (!artifactType || !payload) continue;
      const atual = String((record.payload as { contentHash?: unknown }).contentHash ?? record.contentHash);
      const proximo = await contentHash(payload);
      if (atual !== proximo) hashMap.set(atual, proximo);
    }
    if (hashMap.size === 0) break;
    for (const [antigo, novo] of hashMap) seededIdentity.set(antigo, novo);
    records = records.map(record => {
      const payload = remapReferences(record.payload, hashMap) as Record<string, unknown>;
      return { ...record, contentHash: String(payload.contentHash ?? remapReferences(record.contentHash, hashMap)), payload };
    });
  }

  /*
   * A CADEIA DO MAPA É ACHATADA.
   *
   * O laço acima produz saltos encadeados: o hash original vira H1 na primeira
   * passada e H1 vira H2 na segunda, porque o payload do Silo carrega os hashes
   * dos artigos e muda junto. `remapReferences` aplica o mapa UMA vez — sem
   * achatar, quem consultasse o mapa pararia em H1 e compararia contra H2.
   */
  for (const [antigo] of seededIdentity) {
    let destino = seededIdentity.get(antigo)!;
    const visitados = new Set([antigo]);
    while (seededIdentity.has(destino) && !visitados.has(destino)) {
      visitados.add(destino);
      destino = seededIdentity.get(destino)!;
    }
    seededIdentity.set(antigo, destino);
  }

  return {
    file: { header: { ...file.header, brandId: targetBrandId }, records },
    seededIdentity,
  };
}

export async function planArquitetoRestore(context: PipelineContext, file: BackupFile, options: RestoreOptions = {}): Promise<RestorePlanResult> {
  const crossBrand = file.header.brandId !== context.brandId;
  if (crossBrand && !options.allowCrossBrand) {
    return buildRestorePlan(file, context.brandId, await readCanonicalRestoreState(context), options);
  }
  const localized = await localizeBackupForBrand(file, context.brandId);
  const plan = buildRestorePlan(localized.file, context.brandId, await readCanonicalRestoreState(context), options);
  return withCrossBrandNotice(plan, file.header.brandId, context.brandId);
}

/**
 * A troca de Brand fica DECLARADA no plano.
 *
 * Depois da localização o arquivo já aponta para a Brand de destino, e o
 * planejador não teria mais como saber que houve troca. Registrar aqui é o que
 * mantém a decisão visível na prévia em vez de virar um detalhe silencioso.
 */
function withCrossBrandNotice(plan: RestorePlanResult, sourceBrandId: string, targetBrandId: string): RestorePlanResult {
  if (sourceBrandId === targetBrandId) return plan;
  return {
    ...plan,
    sourceBrandId,
    issues: [
      ...plan.issues,
      { severity: "warning", code: "CROSS_BRAND_ACCEPTED", recordType: null, recordKey: null, detail: `Restauração entre Brands autorizada: ${sourceBrandId} → ${targetBrandId}. Toda identidade de versão é reemitida e as referências são religadas.` },
    ],
  };
}

/* --------------------------------- apply --------------------------------- */

type ArtifactStatus = "draft" | "proposed" | "approved" | "rejected" | "superseded";

function artifactStatus(value: string): ArtifactStatus {
  return (["draft", "proposed", "approved", "rejected", "superseded"] as const).includes(value as ArtifactStatus) ? value as ArtifactStatus : "proposed";
}

function envelopeFor(type: ArquitetoArtifactType, payload: unknown): ArquitetoArtifactVersion {
  if (type === "article_dna") return VersionedArticleDNASchema.parse(payload);
  if (type === "silo_dna") return VersionedSiloDNASchema.parse(payload);
  if (type === ARTICLE_AI_REVIEW_ARTIFACT_TYPE) return VersionedArticleArchitectureAiReviewSchema.parse(payload) as ArquitetoArtifactVersion;
  return VersionedSiloPageSchema.parse(payload);
}

/**
 * O envelope do backup nunca é gravado com o `versionId` e o
 * `previousVersionId` do banco de origem: a numeração e o encadeamento são do
 * repositório canônico, que recusaria uma sucessora apontando para uma versão
 * que não existe aqui.
 */
function forRestore(version: ArquitetoArtifactVersion): ArquitetoArtifactVersion {
  return { ...version, previousVersionId: null } as ArquitetoArtifactVersion;
}

const PERSISTED_WORKFLOW_STATES = new Set(["RASCUNHO", "EM_PROCESSO", "DESCARTADO", "PRONTO_PARA_RADAR", "ENVIADO_AO_RADAR"]);

async function restoreWorkflowStatus(context: PipelineContext, record: BackupRecord, articleApproved: ReadonlySet<string>) {
  const payload = record.payload as { articleId?: unknown; status?: unknown };
  const articleId = String(payload.articleId ?? record.recordKey);
  const status = String(payload.status ?? record.status);
  if (!PERSISTED_WORKFLOW_STATES.has(status)) {
    // Estados derivados não são persistidos por ninguém: restaurá-los
    // inventaria uma linha que a autoridade normal nunca escreveria.
    throw new PipelineRuntimeError("INVALID_ARTIFACT", `O status ${status} é derivado e não é persistido pelo Arquiteto.`, 409);
  }
  if ((status === "PRONTO_PARA_RADAR" || status === "ENVIADO_AO_RADAR") && !articleApproved.has(articleId)) {
    throw new PipelineRuntimeError("CONFLICT", `O status ${status} exige ArticleDNA aprovado para ${articleId}.`, 409);
  }
  const repository = new WorkflowRepository(context);
  const existing = await context.supabase
    .from("editorial_workflow_items")
    .select("id,lock_version,state")
    .eq("marca_id", context.brandId)
    .eq("stage", "architect")
    .eq("subject_type", "article")
    .eq("subject_id", articleId)
    .maybeSingle();
  if (existing.error) throw pipelineErrorFromSupabase(existing.error);
  const row = existing.data as { id: string; lock_version: number; state: string } | null;
  if (!row) {
    await repository.create({ subjectType: "article", subjectId: articleId, articleId, stage: "architect", state: status, sourceEntityId: articleId, payload: {} });
    return;
  }
  if (row.state === status) return;
  await repository.update(row.id, row.lock_version, { state: status });
}

async function restoreKeywordAssignment(context: PipelineContext, record: BackupRecord) {
  const existing = await context.supabase
    .from("editorial_workflow_items")
    .select("id,lock_version,payload")
    .eq("marca_id", context.brandId)
    .eq("stage", "architect")
    .eq("subject_type", "keyword")
    .eq("subject_id", record.recordKey)
    .maybeSingle();
  if (existing.error) throw pipelineErrorFromSupabase(existing.error);
  const row = existing.data as { id: string; lock_version: number; payload: unknown } | null;
  if (!row) {
    // A keyword pertence ao Minerador: o Arquiteto não a cria na restauração.
    throw new PipelineRuntimeError("CONFLICT", `A keyword ${record.recordKey} não está no workspace desta Brand; importe do Minerador antes de restaurar.`, 409);
  }
  if (stable(row.payload) === stable(record.payload)) return;
  await new WorkflowRepository(context).update(row.id, row.lock_version, { payload: record.payload });
}

/**
 * Executa a restauração. Recusa o lote inteiro quando o plano não é
 * executável: um CONFLICT no meio não pode virar meia restauração.
 */
export async function applyArquitetoRestore(context: PipelineContext, backup: BackupFile, options: RestoreOptions = {}): Promise<RestoreApplyResult> {
  const crossBrand = backup.header.brandId !== context.brandId;
  if (crossBrand && !options.allowCrossBrand) {
    const recusa = buildRestorePlan(backup, context.brandId, await readCanonicalRestoreState(context), options);
    throw new PipelineRuntimeError("CONFLICT", `A restauração foi recusada: ${recusa.summary}`, 409);
  }
  const localized = await localizeBackupForBrand(backup, context.brandId);
  const file = localized.file;

  const state = await readCanonicalRestoreState(context);
  const plan = withCrossBrandNotice(buildRestorePlan(file, context.brandId, state, options), backup.header.brandId, context.brandId);
  if (!plan.executable) {
    throw new PipelineRuntimeError("CONFLICT", `A restauração foi recusada: ${plan.summary}`, 409);
  }

  // O mapa já nasce com as identidades reemitidas da troca de Brand.
  const identity = new Map<string, string>(localized.seededIdentity);
  const applied: RestoreAppliedEntry[] = [];
  const byKey = new Map(plan.entries.map(entry => [`${entry.recordType} ${entry.recordKey}`, entry]));
  const ordered = [...file.records].sort((left, right) => BACKUP_RESTORE_ORDER.indexOf(left.recordType) - BACKUP_RESTORE_ORDER.indexOf(right.recordType));

  const approvedArticles = new Set(
    state.artifacts.articleDnas
      .filter(version => state.artifacts.statuses.some(item => item.versionId === version.versionId && item.status === "approved"))
      .map(version => version.payload.articleId),
  );

  for (const record of ordered) {
    const entry = byKey.get(`${record.recordType} ${record.recordKey}`);
    const outcome = entry?.outcome ?? "CREATE";
    const result: RestoreAppliedEntry = { ...(entry as RestorePlanEntry), restoredKey: null, restoredVersionId: null };
    if (outcome === "NO_OP") { applied.push(result); continue; }

    // Cada payload atravessa o mapa antes de ser escrito: as referências
    // religadas são as do ambiente de destino, não as do backup.
    const payload = remapReferences(record.payload, identity) as Record<string, unknown>;

    const artifactType = artifactTypeOf(record.recordType);
    if (artifactType) {
      const version = forRestore(envelopeFor(artifactType, payload));
      const persisted = await appendArquitetoArtifact(context, artifactType, version, artifactStatus(record.status));
      result.restoredVersionId = persisted.version.versionId;
      result.restoredKey = persisted.version.entityId;
      if (version.versionId !== persisted.version.versionId) identity.set(version.versionId, persisted.version.versionId);
      if (artifactType === "article_dna" && artifactStatus(record.status) === "approved") approvedArticles.add(persisted.version.entityId);
    } else if (record.recordType === "TERRITORY") {
      const created = await createTerritoryWorkflowItem(context, payload);
      result.restoredKey = created.territoryRef;
      if (created.territoryRef !== record.recordKey) identity.set(record.recordKey, created.territoryRef);
    } else if (record.recordType === "SILO_WORKING_COPY") {
      const created = await createSiloWorkingCopy(context, payload);
      result.restoredKey = created.workingCopyRef;
      if (created.workingCopyRef !== record.recordKey) identity.set(record.recordKey, created.workingCopyRef);
    } else if (record.recordType === "TERRITORIAL_SERP") {
      const parsed = TerritorialSerpPayloadSchema.parse(payload);
      const saved = await saveTerritorialSerpAssessment(context, { assessment: parsed.assessment, base: parsed.base, operationRequestId: parsed.provenance.operationRequestId });
      result.restoredKey = saved.questionId;
    } else if (record.recordType === "ARTICLE_FORMATION_SERP") {
      const parsed = ArticleFormationSerpPayloadSchema.parse(payload);
      const saved = await saveArticleFormationSerpAssessment(context, {
        candidateRef: parsed.candidateRef, territoryRef: parsed.territoryRef, formationBaseHash: parsed.formationBaseHash,
        verdict: parsed.verdict,
        // O assessment é preservado como veio: o schema do registro valida a
        // identidade e a base, e o parecer já passou pelo schema próprio quando
        // nasceu. Revalidar o agregado aqui recusaria evolução do contrato SERP.
        assessment: parsed.assessment as unknown as Parameters<typeof saveArticleFormationSerpAssessment>[1]["assessment"],
        operationRequestId: parsed.provenance.operationRequestId,
        ...(parsed.interpretation ? { interpretation: parsed.interpretation } : {}),
      });
      result.restoredKey = saved.candidateRef;
    } else if (record.recordType === "TERRITORIAL_AI") {
      const parsed = TerritorialAiPayloadSchema.parse(payload);
      const saved = await saveTerritorialAiProposal(context, { proposal: parsed.proposal, base: parsed.base, serpRef: parsed.serpRef ?? null, operationRequestId: parsed.provenance.operationRequestId, generatedAt: parsed.provenance.generatedAt });
      result.restoredKey = saved.questionId;
    } else if (record.recordType === "ARCHITECTURE_MARKER") {
      await saveArchitectureMarker(context, ArchitectureMarkerPayloadSchema.parse(payload));
      result.restoredKey = "architecture";
    } else if (record.recordType === "ARTICLE_FORMATION_MARKER") {
      await saveArticleFormationMarker(context, ArticleFormationMarkerPayloadSchema.parse(payload));
      result.restoredKey = "article-formation";
    } else if (record.recordType === "INTERNAL_LINK_GRAPH") {
      const graph = InternalLinkGraphSchema.parse(payload);
      const persistedGraph = await persistInternalLinkGraph(context, graph);
      result.restoredKey = graph.graphId;
      result.restoredVersionId = persistedGraph.graph.graphVersionId;
    } else if (record.recordType === "INTERNAL_LINK_GRAPH_WORKING_COPY") {
      const copy = InternalLinkGraphWorkingCopySchema.parse(payload);
      const persistedCopy = await persistInternalLinkGraphWorkingCopy(context, copy);
      result.restoredKey = persistedCopy.workingCopy.graphId;
    } else if (record.recordType === "WORKFLOW_STATUS") {
      await restoreWorkflowStatus(context, { ...record, payload }, approvedArticles);
      result.restoredKey = record.recordKey;
    } else if (record.recordType === "KEYWORD_ASSIGNMENT") {
      await restoreKeywordAssignment(context, { ...record, payload });
      result.restoredKey = record.recordKey;
    }
    applied.push(result);
  }

  const readback = await verifyRestoreReadback(context, file, identity);
  return {
    plan,
    applied,
    identityMap: Object.fromEntries(identity),
    readback,
    summary: readback.equivalent
      ? `Restauração aplicada e confirmada por readback: ${applied.filter(item => item.outcome !== "NO_OP").length} registro(s) escrito(s), ${readback.checked} conferido(s).`
      : `Restauração aplicada, mas o readback encontrou ${readback.differences.length} divergência(s) semântica(s).`,
  };
}

/* -------------------------------- readback ------------------------------- */

/**
 * Relê o remoto e compara semanticamente com o backup religado.
 *
 * Retorno 2xx da mutation não é prova: a linha pode ter sido gravada com outro
 * conteúdo, em outra Brand, ou não ter voltado. A comparação ignora só o que
 * mudou legitimamente — identidade remapeada e carimbo novo.
 */
export async function verifyRestoreReadback(
  context: PipelineContext,
  file: BackupFile,
  identity: ReadonlyMap<string, string>,
): Promise<RestoreApplyResult["readback"]> {
  const state = await readCanonicalRestoreState(context);
  const index = indexState(state);
  const differences: RestoreDifference[] = [];
  let checked = 0;

  for (const record of file.records) {
    const expectedKey = identity.get(record.recordKey) ?? record.recordKey;
    const expected = stable(remapReferences(recordSemantic(record), identity));
    const semIdentidade = JSON.stringify(withoutEmittedIdentity(remapReferences(recordSemantic(record), identity)));
    const current = index.get(`${record.recordType} ${expectedKey}`)
      // Identidade emitida pelo servidor: a chave restaurada pode não estar no
      // mapa quando o registro era NO_OP; nesse caso o conteúdo é a âncora.
      || [...index.entries()].find(([key, entry]) => key.startsWith(`${record.recordType} `) && entry.semanticWithoutIdentity === semIdentidade)?.[1];
    checked += 1;
    if (!current) {
      differences.push({ recordType: record.recordType, recordKey: record.recordKey, field: "<registro>", expected: "presente", actual: "ausente" });
      continue;
    }
    if (current.semantic !== expected && current.semanticWithoutIdentity !== semIdentidade) {
      differences.push({ recordType: record.recordType, recordKey: record.recordKey, field: "<conteúdo>", expected, actual: current.semantic });
    }
  }

  return { checked, equivalent: differences.length === 0, differences };
}

/**
 * Comparação de ida e volta entre dois estados canônicos completos.
 *
 * É a pergunta que o roundtrip faz: depois de exportar A, esvaziar e
 * restaurar, o estado B diz a mesma coisa? Identificadores remapeados e
 * carimbos novos ficam de fora; conteúdo, relações, papéis, estados e
 * topologia precisam bater.
 */
/* ------------------------------ fingerprint ------------------------------ */

export type StateFingerprint = {
  byType: Record<string, { count: number; digest: string; keys: string[] }>;
  totalRecords: number;
  digest: string;
};

async function digestOf(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

/**
 * O retrato semântico do estado, POR TIPO DE ARTEFATO.
 *
 * Um digest só do conjunto inteiro diria "diferente" sem dizer onde. Por tipo,
 * a homologação aponta exatamente qual artefato não voltou igual.
 */
export async function fingerprintCanonicalState(
  state: CanonicalRestoreState,
  options: { ignoreEnvironment?: boolean; identity?: ReadonlyMap<string, string> } = {},
): Promise<StateFingerprint> {
  const source = options.identity?.size ? remapReferences(state, options.identity) : state;
  const index = indexState(source, { ignoreEnvironment: options.ignoreEnvironment });
  const grouped = new Map<string, { keys: string[]; semantics: string[] }>();
  for (const [key, entry] of index) {
    const [recordType, ...rest] = key.split(" ");
    const bucket = grouped.get(recordType) || { keys: [], semantics: [] };
    bucket.keys.push(rest.join(" "));
    bucket.semantics.push(entry.semanticWithoutIdentity);
    grouped.set(recordType, bucket);
  }
  const byType: StateFingerprint["byType"] = {};
  for (const [recordType, bucket] of [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right, "en"))) {
    byType[recordType] = {
      count: bucket.keys.length,
      keys: [...bucket.keys].sort(),
      digest: await digestOf([...bucket.semantics].sort().join(" ")),
    };
  }
  return {
    byType,
    totalRecords: index.size,
    digest: await digestOf(Object.entries(byType).map(([type, item]) => `${type}:${item.count}:${item.digest}`).join("|")),
  };
}

export function compareFingerprints(before: StateFingerprint, after: StateFingerprint) {
  const differences: Array<{ recordType: string; detail: string }> = [];
  for (const recordType of new Set([...Object.keys(before.byType), ...Object.keys(after.byType)])) {
    const left = before.byType[recordType];
    const right = after.byType[recordType];
    if (!left) { differences.push({ recordType, detail: `Existe só depois da restauração (${right.count} registro(s)).` }); continue; }
    if (!right) { differences.push({ recordType, detail: `Existia antes (${left.count}) e sumiu depois.` }); continue; }
    if (left.count !== right.count) differences.push({ recordType, detail: `Contagem mudou: ${left.count} → ${right.count}.` });
    else if (left.digest !== right.digest) differences.push({ recordType, detail: "Mesma contagem, conteúdo semântico divergente." });
  }
  return { equivalent: differences.length === 0, differences };
}

export function compareCanonicalStates(
  before: CanonicalRestoreState,
  after: CanonicalRestoreState,
  identity: ReadonlyMap<string, string> = new Map(),
): { equivalent: boolean; differences: RestoreDifference[] } {
  // O lado de origem atravessa o mapa: comparar a identidade antiga com a
  // restaurada acusaria divergência em toda restauração correta.
  const left = indexState(identity.size ? remapReferences(before, identity) : before);
  const right = indexState(after);
  const differences: RestoreDifference[] = [];

  const matchIn = (index: Map<string, StateIndexEntry>, key: string, entry: StateIndexEntry) => {
    const [recordType] = key.split(" ");
    return index.get(key)
      || [...index.entries()].find(([otherKey, other]) => otherKey.startsWith(`${recordType} `) && (other.semantic === entry.semantic || other.semanticWithoutIdentity === entry.semanticWithoutIdentity))?.[1];
  };

  for (const [key, entry] of left) {
    const [recordType, ...rest] = key.split(" ");
    const recordKey = rest.join(" ");
    const match = matchIn(right, key, entry);
    if (!match) {
      differences.push({ recordType: recordType as BackupRecordType, recordKey, field: "<registro>", expected: "presente", actual: "ausente" });
      continue;
    }
    if (match.semantic !== entry.semantic && match.semanticWithoutIdentity !== entry.semanticWithoutIdentity) {
      differences.push({ recordType: recordType as BackupRecordType, recordKey, field: "<conteúdo>", expected: entry.semantic, actual: match.semantic });
    }
  }
  for (const [key, entry] of right) {
    if (matchIn(left, key, entry)) continue;
    const [recordType, ...rest] = key.split(" ");
    differences.push({ recordType: recordType as BackupRecordType, recordKey: rest.join(" "), field: "<registro>", expected: "ausente", actual: "presente" });
  }
  return { equivalent: differences.length === 0, differences };
}

export { ArticleDNASchema, SiloDNASchema, SiloPageSchema };

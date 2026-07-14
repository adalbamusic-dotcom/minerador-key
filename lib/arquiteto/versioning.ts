import type {
  VersionEnvelope,
  VersionReference,
  VersionStatusEvent,
} from "./contracts.ts";

export class VersioningError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "VersioningError";
    this.code = code;
  }
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(item => canonicalJson(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).filter(key => record[key] !== undefined).sort()
    .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

const bytesToHex = (bytes: Uint8Array) => [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");

export async function contentHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${bytesToHex(new Uint8Array(digest))}`;
}

function legacySignature(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function legacyVersionReference(entityId: string, payload: unknown): VersionReference {
  return {
    entityId,
    versionId: `legacy:${entityId}:v1`,
    contentHash: `legacy:${legacySignature(canonicalJson(payload))}`,
  };
}

export function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export async function createVersionEnvelope<T>({
  entityId,
  versionNumber,
  previousVersionId = null,
  origin,
  changeReason,
  createdBy,
  payload,
  versionId = crypto.randomUUID(),
  createdAt = new Date().toISOString(),
}: {
  entityId: string;
  versionNumber: number;
  previousVersionId?: string | null;
  origin: VersionEnvelope<T>["origin"];
  changeReason: string;
  createdBy: string;
  payload: T;
  versionId?: string;
  createdAt?: string;
}): Promise<Readonly<VersionEnvelope<T>>> {
  if (versionNumber < 1 || !Number.isInteger(versionNumber)) {
    throw new VersioningError("invalid_version_number", "O numero da versao deve ser inteiro e positivo.");
  }
  const envelope: VersionEnvelope<T> = {
    versionId,
    entityId,
    versionNumber,
    previousVersionId,
    contentHash: await contentHash(payload),
    origin,
    changeReason,
    createdAt,
    createdBy,
    payload: structuredClone(payload),
  };
  return deepFreeze(envelope);
}

export function toVersionReference<T>(version: VersionEnvelope<T>): VersionReference {
  return { entityId: version.entityId, versionId: version.versionId, contentHash: version.contentHash };
}

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  none: ["draft", "proposed"],
  draft: ["proposed", "rejected"],
  proposed: ["approved", "rejected"],
  approved: ["superseded"],
  rejected: [],
  superseded: [],
};

export class InMemoryVersionRepository {
  readonly #versions = new Map<string, Readonly<VersionEnvelope<unknown>>>();
  readonly #events = new Map<string, readonly VersionStatusEvent[]>();

  addVersion<T>(version: Readonly<VersionEnvelope<T>>) {
    if (this.#versions.has(version.versionId)) throw new VersioningError("duplicate_version", `A versao ${version.versionId} ja existe.`);
    if (version.previousVersionId && !this.#versions.has(version.previousVersionId)) {
      throw new VersioningError("missing_previous_version", `A versao anterior ${version.previousVersionId} nao existe.`);
    }
    this.#versions.set(version.versionId, deepFreeze(structuredClone(version)) as Readonly<VersionEnvelope<unknown>>);
  }

  getVersion<T>(versionId: string): Readonly<VersionEnvelope<T>> | null {
    return (this.#versions.get(versionId) as Readonly<VersionEnvelope<T>> | undefined) || null;
  }

  appendStatusEvent(event: VersionStatusEvent) {
    if (!this.#versions.has(event.versionId)) throw new VersioningError("missing_version", `A versao ${event.versionId} nao existe.`);
    const current = this.effectiveStatus(event.versionId) || "none";
    if (!ALLOWED_TRANSITIONS[current]?.includes(event.status)) {
      throw new VersioningError("invalid_status_transition", `Transicao ${current} -> ${event.status} nao permitida.`);
    }
    const events = [...(this.#events.get(event.versionId) || []), deepFreeze(structuredClone(event))];
    this.#events.set(event.versionId, deepFreeze(events));
  }

  events(versionId: string) {
    return this.#events.get(versionId) || [];
  }

  effectiveStatus(versionId: string) {
    const events = this.events(versionId);
    return events.at(-1)?.status || null;
  }

  resolve<T>(reference: VersionReference): Readonly<VersionEnvelope<T>> {
    const version = this.getVersion<T>(reference.versionId);
    if (!version || version.entityId !== reference.entityId) {
      throw new VersioningError("missing_reference", `Referencia ausente: ${reference.versionId}.`);
    }
    if (version.contentHash !== reference.contentHash) {
      throw new VersioningError("hash_mismatch", `Hash divergente em ${reference.versionId}.`);
    }
    if (this.effectiveStatus(reference.versionId) === "rejected") {
      throw new VersioningError("rejected_reference", `A versao ${reference.versionId} foi rejeitada.`);
    }
    return version;
  }

  approvedForEntity(entityId: string) {
    return [...this.#versions.values()]
      .filter(version => version.entityId === entityId && this.effectiveStatus(version.versionId) === "approved")
      .sort((a, b) => b.versionNumber - a.versionNumber);
  }

  isStale(reference: VersionReference) {
    const current = this.approvedForEntity(reference.entityId)[0];
    return Boolean(current && current.versionId !== reference.versionId);
  }
}

export function createStatusEvent(
  versionId: string,
  status: VersionStatusEvent["status"],
  actorId: string,
  reason: string,
  occurredAt = new Date().toISOString(),
): VersionStatusEvent {
  return deepFreeze({ eventId: crypto.randomUUID(), versionId, status, actorId, reason, occurredAt });
}

export function approveSuccessor(
  repository: InMemoryVersionRepository,
  successor: VersionReference,
  previous: VersionReference | null,
  actorId: string,
  reason: string,
) {
  repository.resolve(successor);
  if (previous) repository.resolve(previous);
  repository.appendStatusEvent(createStatusEvent(successor.versionId, "approved", actorId, reason));
  if (previous) repository.appendStatusEvent(createStatusEvent(previous.versionId, "superseded", actorId, `Substituida por ${successor.versionId}.`));
}

export function hydrateVersionGraph<T>(
  root: VersionReference,
  repository: InMemoryVersionRepository,
  dependenciesOf: (version: Readonly<VersionEnvelope<unknown>>) => VersionReference[],
) {
  const hydrated = new Map<string, Readonly<VersionEnvelope<unknown>>>();
  const active = new Set<string>();
  const visit = (reference: VersionReference) => {
    if (active.has(reference.versionId)) throw new VersioningError("reference_cycle", `Ciclo detectado em ${reference.versionId}.`);
    if (hydrated.has(reference.versionId)) return;
    active.add(reference.versionId);
    const version = repository.resolve(reference);
    dependenciesOf(version).forEach(visit);
    active.delete(reference.versionId);
    hydrated.set(reference.versionId, version);
  };
  visit(root);
  return { root: repository.resolve<T>(root), versions: hydrated };
}

export async function hydrateExactVersionGraph<T>(
  root: VersionReference,
  repository: InMemoryVersionRepository,
  dependenciesOf: (version: Readonly<VersionEnvelope<unknown>>) => VersionReference[],
  options: { rejectStale?: boolean } = {},
) {
  const hydrated = new Map<string, Readonly<VersionEnvelope<unknown>>>();
  const active = new Set<string>();
  const staleReferences: VersionReference[] = [];
  const visit = async (reference: VersionReference): Promise<void> => {
    if (active.has(reference.versionId)) throw new VersioningError("reference_cycle", `Ciclo detectado em ${reference.versionId}.`);
    if (hydrated.has(reference.versionId)) return;
    active.add(reference.versionId);
    const version = repository.resolve(reference);
    if (version.contentHash.startsWith("sha256:") && await contentHash(version.payload) !== version.contentHash) {
      throw new VersioningError("tampered_payload", `O conteudo de ${reference.versionId} nao corresponde ao hash registrado.`);
    }
    if (repository.isStale(reference)) {
      staleReferences.push(reference);
      if (options.rejectStale) throw new VersioningError("stale_reference", `A referencia ${reference.versionId} nao e a versao aprovada vigente.`);
    }
    for (const dependency of dependenciesOf(version)) await visit(dependency);
    active.delete(reference.versionId);
    hydrated.set(reference.versionId, version);
  };
  await visit(root);
  return { root: repository.resolve<T>(root), versions: hydrated, staleReferences };
}

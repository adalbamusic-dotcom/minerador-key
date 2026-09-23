import {
  acceptQualificationPayload,
  selectCurrentKeywordSemanticQualificationVersions,
  type QualificationVersionMetadataRow,
  type QualificationVersionPayloadReader,
  type QualificationVersionPayloadRow,
} from "./keyword-semantic-qualification-current.ts";
import type { KeywordSemanticQualification } from "./keyword-semantic-qualification.ts";

/**
 * Cache no navegador das versões IMUTÁVEIS da Qualificação Semântica (E8).
 *
 * `editorial_artifact_versions` é append-only por gatilho (migration 0027):
 * uma versão guardada pelo `version_id` nunca fica errada, só deixa de ser a
 * vigente. Por isso:
 *
 * - a vigente continua decidida pelos metadados lidos do servidor a cada
 *   carga; o cache só substitui a leitura do payload de uma versão já pedida;
 * - a chave leva `actorUserId`, `brandId` e `version_id`; o valor leva os
 *   três, a keyword e o payload, e a leitura confere todos contra a carga;
 * - o payload do cache passa pela mesma validação da leitura remota (parse do
 *   Minerador, Marca e keyword); inválido é ignorado e relido do servidor;
 * - só entra no cache payload lido do servidor e escolhido como vigente;
 * - qualquer erro ou demora do armazenamento cai para a leitura remota; cache
 *   vazio nunca vira "sem Qualificação": quem decide o que existe é o servidor;
 * - poda: ao fim de uma carga bem-sucedida, saem do cache as entradas daquele
 *   actor+Marca que não são mais vigentes. É cópia de dado imutável do
 *   servidor, nunca dado único do usuário.
 *
 * O banco IndexedDB é próprio: nunca o `minerador-pro-editorial` de
 * `lib/editorial/browser-artifact-store.ts`.
 */

export const QUALIFICATION_VERSION_CACHE_DATABASE = "minerador-qualificacao-versoes";
export const QUALIFICATION_VERSION_CACHE_DATABASE_VERSION = 1;
export const QUALIFICATION_VERSION_CACHE_STORE = "versoes";
export const QUALIFICATION_VERSION_CACHE_FORMAT = 1;
/** Acima disso a operação do armazenamento conta como falha e a carga segue pelo servidor. */
export const QUALIFICATION_VERSION_CACHE_TIMEOUT_MS = 2000;

const KEY_NAMESPACE = "mkq1";

export type CachedQualificationVersion = {
  format: typeof QUALIFICATION_VERSION_CACHE_FORMAT;
  actorUserId: string;
  brandId: string;
  entityId: string;
  versionId: string;
  payload: unknown;
};

/** Armazenamento injetável: IndexedDB no navegador, memória nos testes. */
export interface QualificationVersionCacheStorage {
  getMany(keys: readonly string[]): Promise<ReadonlyMap<string, unknown>>;
  putMany(entries: ReadonlyArray<{ key: string; value: CachedQualificationVersion }>): Promise<void>;
  listKeys(prefix: string): Promise<string[]>;
  deleteMany(keys: readonly string[]): Promise<void>;
}

/**
 * - `brand`: a carga cobriu todas as keywords vivas da Marca; sai do cache
 *   tudo daquele actor+Marca que não foi escolhido como vigente.
 * - `loaded-entities`: carga parcial (refresh depois de persistir); saem só
 *   as versões superadas das keywords desta carga.
 */
export type QualificationVersionCachePrune = "brand" | "loaded-entities";

/**
 * Teto de linhas de uma leitura do PostgREST (`max_rows` em
 * supabase/config.toml). A listagem de keywords e a de metadados não são
 * paginadas: uma leitura que chega ao teto pode ter vindo cortada, e aí a
 * poda `brand` apagaria entradas válidas das keywords que ficaram de fora.
 */
export const QUALIFICATION_VERSION_CACHE_ROW_LIMIT = 1000;

/** `brand` só quando a listagem de keywords certamente veio inteira. */
export function qualificationVersionCachePruneForListing(listedKeywords: number, rowLimit: number = QUALIFICATION_VERSION_CACHE_ROW_LIMIT): QualificationVersionCachePrune {
  return Number.isInteger(listedKeywords) && listedKeywords >= 0 && listedKeywords < rowLimit ? "brand" : "loaded-entities";
}

export type QualificationVersionCacheReport = {
  cacheEnabled: boolean;
  cacheHits: number;
  cacheInvalid: number;
  remoteVersionIds: number;
  stored: number;
  pruned: number;
  cacheErrors: string[];
};

function keyPart(value: string): string {
  return encodeURIComponent(value);
}

/** Prefixo de actor+Marca, ou null quando falta identidade (sem cache). */
export function qualificationVersionCacheScope(actorUserId: string | null | undefined, brandId: string | null | undefined): string | null {
  const actor = typeof actorUserId === "string" ? actorUserId.trim() : "";
  const brand = typeof brandId === "string" ? brandId.trim() : "";
  if (!actor || !brand) return null;
  return `${KEY_NAMESPACE}|${keyPart(actor)}|${keyPart(brand)}|`;
}

export function qualificationVersionCacheKey(scope: string, versionId: string): string {
  return `${scope}${keyPart(versionId)}`;
}

function versionIdFromKey(scope: string, key: string): string | null {
  if (!key.startsWith(scope)) return null;
  try {
    return decodeURIComponent(key.slice(scope.length));
  } catch {
    return null;
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

function withTimeout<T>(run: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Armazenamento local demorou demais.")), timeoutMs);
  });
  // `Promise.resolve().then` também captura exceção síncrona do adaptador.
  return Promise.race([Promise.resolve().then(run), timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

function readCachedRecord(value: unknown, expected: { actorUserId: string; brandId: string; entityId: string; versionId: string }): unknown | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Partial<CachedQualificationVersion>;
  if (record.format !== QUALIFICATION_VERSION_CACHE_FORMAT) return undefined;
  if (record.actorUserId !== expected.actorUserId) return undefined;
  if (record.brandId !== expected.brandId) return undefined;
  if (record.entityId !== expected.entityId) return undefined;
  if (record.versionId !== expected.versionId) return undefined;
  if (!("payload" in record)) return undefined;
  return record.payload;
}

/**
 * Mesma seleção de `resolveCurrentKeywordSemanticQualifications`, com o
 * payload de cada versão pedida vindo do cache quando válido e do servidor
 * quando não. `maintenance` guarda as vigentes lidas do servidor e poda o
 * resto do actor+Marca; nunca rejeita e não precisa ser aguardada.
 */
export async function resolveCurrentKeywordSemanticQualificationsWithCache(input: {
  brandId: string;
  actorUserId: string | null | undefined;
  metadata: readonly QualificationVersionMetadataRow[];
  readRemotePayloads: QualificationVersionPayloadReader;
  storage: QualificationVersionCacheStorage | null | undefined;
  prune: QualificationVersionCachePrune;
  batchSize?: number;
  timeoutMs?: number;
  rowLimit?: number;
}): Promise<{ qualifications: Map<string, KeywordSemanticQualification>; maintenance: Promise<QualificationVersionCacheReport> }> {
  const timeoutMs = Math.max(1, input.timeoutMs ?? QUALIFICATION_VERSION_CACHE_TIMEOUT_MS);
  // Metadados no teto de linhas podem ter vindo cortados: a poda fica
  // restrita às versões que esta carga viu.
  const prune: QualificationVersionCachePrune = input.prune === "brand" && input.metadata.length < (input.rowLimit ?? QUALIFICATION_VERSION_CACHE_ROW_LIMIT)
    ? "brand"
    : "loaded-entities";
  const actorUserId = typeof input.actorUserId === "string" ? input.actorUserId.trim() : "";
  const scope = qualificationVersionCacheScope(actorUserId, input.brandId);
  const storage = scope ? input.storage ?? null : null;
  const report: QualificationVersionCacheReport = {
    cacheEnabled: Boolean(storage),
    cacheHits: 0,
    cacheInvalid: 0,
    remoteVersionIds: 0,
    stored: 0,
    pruned: 0,
    cacheErrors: [],
  };
  let cacheUsable = Boolean(storage);

  const entityByVersionId = new Map<string, string>();
  for (const row of input.metadata) {
    if (typeof row.version_id === "string" && row.version_id && typeof row.entity_id === "string" && row.entity_id) {
      entityByVersionId.set(row.version_id, row.entity_id);
    }
  }
  // Payload lido do servidor nesta carga: só ele pode entrar no cache.
  const remotePayloads = new Map<string, unknown>();

  const readPayloads: QualificationVersionPayloadReader = async versionIds => {
    const served: QualificationVersionPayloadRow[] = [];
    let missing = versionIds;
    if (cacheUsable && storage && scope) {
      let cached: ReadonlyMap<string, unknown> | null = null;
      try {
        cached = await withTimeout(() => storage.getMany(versionIds.map(versionId => qualificationVersionCacheKey(scope, versionId))), timeoutMs);
      } catch (error) {
        cacheUsable = false;
        report.cacheErrors.push(`leitura: ${errorMessage(error)}`);
      }
      if (cached) {
        missing = [];
        for (const versionId of versionIds) {
          const entityId = entityByVersionId.get(versionId);
          const value = cached.get(qualificationVersionCacheKey(scope, versionId));
          const payload = entityId && value !== undefined
            ? readCachedRecord(value, { actorUserId, brandId: input.brandId, entityId, versionId })
            : undefined;
          // O `id` da Qualificação é o `version_id` que a gravou: payload de
          // outra versão guardado nesta chave também é recusado.
          const accepted = entityId && payload !== undefined ? acceptQualificationPayload({ brandId: input.brandId, entityId, payload }) : null;
          if (accepted && accepted.id === versionId) {
            served.push({ version_id: versionId, payload });
            report.cacheHits += 1;
            continue;
          }
          if (value !== undefined) report.cacheInvalid += 1;
          missing.push(versionId);
        }
      }
    }
    if (missing.length > 0) {
      report.remoteVersionIds += missing.length;
      for (const row of await input.readRemotePayloads(missing)) {
        if (typeof row.version_id !== "string") continue;
        remotePayloads.set(row.version_id, row.payload);
        served.push(row);
      }
    }
    return served;
  };

  const selected = await selectCurrentKeywordSemanticQualificationVersions({
    brandId: input.brandId,
    metadata: input.metadata,
    readPayloads,
    batchSize: input.batchSize,
  });
  const qualifications = new Map([...selected.entries()].map(([entityId, value]) => [entityId, value.qualification]));

  const maintenance = (async (): Promise<QualificationVersionCacheReport> => {
    if (!cacheUsable || !storage || !scope) return report;
    const currentVersionIds = new Set([...selected.values()].map(value => value.versionId));
    const toStore: Array<{ key: string; value: CachedQualificationVersion }> = [];
    for (const [entityId, value] of selected.entries()) {
      if (!remotePayloads.has(value.versionId)) continue;
      // Só guarda o que a próxima leitura aceitaria.
      if (value.qualification.id !== value.versionId) continue;
      toStore.push({
        key: qualificationVersionCacheKey(scope, value.versionId),
        value: {
          format: QUALIFICATION_VERSION_CACHE_FORMAT,
          actorUserId,
          brandId: input.brandId,
          entityId,
          versionId: value.versionId,
          payload: remotePayloads.get(value.versionId),
        },
      });
    }
    try {
      if (toStore.length > 0) {
        await withTimeout(() => storage.putMany(toStore), timeoutMs);
        report.stored = toStore.length;
      }
    } catch (error) {
      report.cacheErrors.push(`gravação: ${errorMessage(error)}`);
    }
    try {
      const keys = await withTimeout(() => storage.listKeys(scope), timeoutMs);
      const stale = keys.filter(key => {
        const versionId = versionIdFromKey(scope, key);
        if (versionId === null) return false;
        if (currentVersionIds.has(versionId)) return false;
        return prune === "brand" || entityByVersionId.has(versionId);
      });
      if (stale.length > 0) {
        await withTimeout(() => storage.deleteMany(stale), timeoutMs);
        report.pruned = stale.length;
      }
    } catch (error) {
      report.cacheErrors.push(`poda: ${errorMessage(error)}`);
    }
    return report;
  })();

  return { qualifications, maintenance };
}

function requestError(request: { error?: DOMException | null } | null | undefined, fallback: string): Error {
  return request?.error ?? new Error(fallback);
}

/**
 * Adaptador IndexedDB, em banco próprio. Não toca `indexedDB` ao ser criado
 * (seguro no render do servidor); cada operação abre e fecha a conexão.
 */
export function createIndexedDbQualificationVersionCacheStorage(factory?: IDBFactory): QualificationVersionCacheStorage {
  const resolveFactory = (): IDBFactory => {
    const resolved = factory ?? (typeof indexedDB === "undefined" ? undefined : indexedDB);
    if (!resolved) throw new Error("IndexedDB indisponível.");
    return resolved;
  };

  const open = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    const request = resolveFactory().open(QUALIFICATION_VERSION_CACHE_DATABASE, QUALIFICATION_VERSION_CACHE_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(QUALIFICATION_VERSION_CACHE_STORE)) {
        database.createObjectStore(QUALIFICATION_VERSION_CACHE_STORE);
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(requestError(request, "Não foi possível abrir o cache da Qualificação."));
    request.onblocked = () => reject(new Error("Cache da Qualificação bloqueado por outra aba."));
  });

  const transact = async <T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => () => T): Promise<T> => {
    const database = await open();
    try {
      return await new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(QUALIFICATION_VERSION_CACHE_STORE, mode);
        const collect = run(transaction.objectStore(QUALIFICATION_VERSION_CACHE_STORE));
        transaction.oncomplete = () => resolve(collect());
        transaction.onerror = () => reject(requestError(transaction, "Falha no cache da Qualificação."));
        transaction.onabort = () => reject(requestError(transaction, "Operação do cache da Qualificação abortada."));
      });
    } finally {
      database.close();
    }
  };

  return {
    getMany: keys => transact("readonly", store => {
      const found = new Map<string, unknown>();
      for (const key of keys) {
        const request = store.get(key);
        request.onsuccess = () => {
          if (request.result !== undefined) found.set(key, request.result);
        };
      }
      return () => found;
    }),
    putMany: entries => transact("readwrite", store => {
      for (const entry of entries) store.put(entry.value, entry.key);
      return () => undefined;
    }),
    listKeys: prefix => transact("readonly", store => {
      let keys: string[] = [];
      // O prefixo é ASCII (partes codificadas), então U+FFFF fecha o intervalo.
      const request = store.getAllKeys(IDBKeyRange.bound(prefix, `${prefix}￿`));
      request.onsuccess = () => {
        keys = request.result.filter((key): key is string => typeof key === "string");
      };
      return () => keys;
    }),
    deleteMany: keys => transact("readwrite", store => {
      for (const key of keys) store.delete(key);
      return () => undefined;
    }),
  };
}

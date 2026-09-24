import type { SubjectDiscoveryExecuteResponse } from "../../../lib/minerador/subject-discovery-search.ts";
import type { SubjectSearchImportMark } from "./subject-search-model.ts";

/**
 * PESQUISA POR ASSUNTO — lista local no navegador (SDD 2026-09-24, F1b.5).
 *
 * As candidatas NÃO vão ao banco. O resultado da pesquisa volta ao navegador
 * e fica guardado aqui, em IndexedDB PRÓPRIO (`minerador-pesquisa-assunto`),
 * com a chave `actorUserId:brandId:searchId`.
 *
 * Natureza do dado: estado de apresentação e recuperação, NUNCA canônico
 * (`AGENTS.md` §10). "Já existe" e "importada" são indicativos; a autoridade é
 * o import.
 *
 * Política (Q12, autorizada pelo dono como limpeza de dado local): cada busca
 * vale 30 dias e ficam no máximo 10 por ator e marca. Saem sozinhas SÓ a busca
 * vencida e a mais antiga além das 10, do mesmo ator e da mesma marca. Nada
 * mais é apagado: registro de outro ator, de outra marca ou ilegível fica onde
 * está. "Descartar esta busca" é ato humano, busca a busca.
 *
 * Padrão de `lib/minerador/semantic-qualification-version-cache.ts`: escopo
 * por ator e marca, prazo de 2 s por operação e adaptador que não toca
 * `indexedDB` ao ser criado. Qualquer falha do armazenamento vira "só em
 * memória"; nunca derruba a tela.
 */

export const SUBJECT_SEARCH_LOCAL_DATABASE = "minerador-pesquisa-assunto";
export const SUBJECT_SEARCH_LOCAL_DATABASE_VERSION = 1;
export const SUBJECT_SEARCH_LOCAL_STORE = "buscas";
export const SUBJECT_SEARCH_LOCAL_FORMAT = 1;
export const SUBJECT_SEARCH_LOCAL_TIMEOUT_MS = 2000;
export const SUBJECT_SEARCH_LOCAL_TTL_DAYS = 30;
export const SUBJECT_SEARCH_LOCAL_MAX_SEARCHES = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

export type SubjectSearchLocalConfig = {
  phrase: string;
  note: string;
  destinationUrl: string;
  subjectKeywordId: string | null;
  language: string;
  selectedStates: string[];
  includeAdultKeywords: boolean;
};

export type SubjectSearchLocalRecord = {
  format: typeof SUBJECT_SEARCH_LOCAL_FORMAT;
  actorUserId: string;
  brandId: string;
  searchId: string;
  /** Instante da execução: a validade de 30 dias conta daqui. */
  savedAt: string;
  updatedAt: string;
  config: SubjectSearchLocalConfig;
  result: SubjectDiscoveryExecuteResponse;
  /** Por keyword normalizada: o que o envio ao Processador respondeu. Indicativo. */
  marks: Record<string, SubjectSearchImportMark>;
  /** O Assunto declarado no envio desta busca, quando houve. */
  declaredSubjectKeywordId: string | null;
};

/** Armazenamento injetável: IndexedDB no navegador, memória nos testes. */
export interface SubjectSearchLocalStorage {
  list(prefix: string): Promise<Array<{ key: string; value: unknown }>>;
  put(key: string, value: SubjectSearchLocalRecord): Promise<void>;
  deleteMany(keys: readonly string[]): Promise<void>;
}

/** `actorUserId:brandId:` — ou `null` quando falta identidade (sem armazenamento). */
export function subjectSearchLocalScope(actorUserId: string | null | undefined, brandId: string | null | undefined): string | null {
  const actor = typeof actorUserId === "string" ? actorUserId.trim() : "";
  const brand = typeof brandId === "string" ? brandId.trim() : "";
  if (!actor || !brand || actor.includes(":") || brand.includes(":")) return null;
  return `${actor}:${brand}:`;
}

export function subjectSearchLocalKey(scope: string, searchId: string): string {
  return `${scope}${searchId}`;
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Aceita só o registro deste ator, desta marca e desta chave, no formato
 * atual e com um resultado de execução. Qualquer outro vale `null` e é
 * ignorado — nunca apagado.
 */
export function readSubjectSearchLocalRecord(value: unknown, expected: { actorUserId: string; brandId: string; key: string }): SubjectSearchLocalRecord | null {
  if (!isRecordObject(value)) return null;
  if (value.format !== SUBJECT_SEARCH_LOCAL_FORMAT) return null;
  if (value.actorUserId !== expected.actorUserId || value.brandId !== expected.brandId) return null;
  if (typeof value.searchId !== "string" || !value.searchId) return null;
  if (expected.key !== `${expected.actorUserId}:${expected.brandId}:${value.searchId}`) return null;
  if (typeof value.savedAt !== "string" || !Number.isFinite(Date.parse(value.savedAt))) return null;
  const result = value.result;
  if (!isRecordObject(result) || result.success !== true || result.mode !== "execute" || !Array.isArray(result.candidates)) return null;
  if (!isRecordObject(value.config) || typeof value.config.phrase !== "string") return null;
  return {
    ...(value as unknown as SubjectSearchLocalRecord),
    marks: isRecordObject(value.marks) ? value.marks as Record<string, SubjectSearchImportMark> : {},
    declaredSubjectKeywordId: typeof value.declaredSubjectKeywordId === "string" ? value.declaredSubjectKeywordId : null,
  };
}

export function isSubjectSearchExpired(savedAt: string, now: Date, ttlDays: number = SUBJECT_SEARCH_LOCAL_TTL_DAYS): boolean {
  const saved = Date.parse(savedAt);
  if (!Number.isFinite(saved)) return false;
  return now.getTime() - saved >= ttlDays * DAY_MS;
}

/**
 * A política Q12, pura. Recebe SÓ registros válidos do mesmo ator e marca e
 * separa: os que ficam (mais nova primeiro), os vencidos e os excedentes
 * (os mais antigos além de 10).
 */
export function planSubjectSearchRetention(entries: ReadonlyArray<{ key: string; record: SubjectSearchLocalRecord }>, now: Date, options: { ttlDays?: number; maxSearches?: number } = {}): { keep: Array<{ key: string; record: SubjectSearchLocalRecord }>; expired: string[]; overflow: string[] } {
  const ttlDays = options.ttlDays ?? SUBJECT_SEARCH_LOCAL_TTL_DAYS;
  const max = Math.max(0, options.maxSearches ?? SUBJECT_SEARCH_LOCAL_MAX_SEARCHES);
  const expired: string[] = [];
  const alive: Array<{ key: string; record: SubjectSearchLocalRecord }> = [];
  for (const entry of entries) {
    if (isSubjectSearchExpired(entry.record.savedAt, now, ttlDays)) expired.push(entry.key);
    else alive.push(entry);
  }
  alive.sort((a, b) => Date.parse(b.record.savedAt) - Date.parse(a.record.savedAt) || b.key.localeCompare(a.key));
  return { keep: alive.slice(0, max), expired, overflow: alive.slice(max).map(entry => entry.key) };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

function withTimeout<T>(run: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("O armazenamento do navegador demorou demais.")), timeoutMs);
  });
  // `Promise.resolve().then` também captura exceção síncrona do adaptador.
  return Promise.race([Promise.resolve().then(run), timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

export type SubjectSearchLocalLoad = {
  /** `false`: o armazenamento falhou ou falta identidade; a lista fica só em memória. */
  available: boolean;
  records: SubjectSearchLocalRecord[];
  removed: number;
  error: string | null;
};

async function applyRetention(storage: SubjectSearchLocalStorage, scope: string, actorUserId: string, brandId: string, now: Date, timeoutMs: number) {
  const raw = await withTimeout(() => storage.list(scope), timeoutMs);
  const entries: Array<{ key: string; record: SubjectSearchLocalRecord }> = [];
  for (const { key, value } of raw) {
    if (typeof key !== "string" || !key.startsWith(scope)) continue;
    const record = readSubjectSearchLocalRecord(value, { actorUserId, brandId, key });
    if (record) entries.push({ key, record });
  }
  const plan = planSubjectSearchRetention(entries, now);
  const remove = [...plan.expired, ...plan.overflow];
  let removed = 0;
  let error: string | null = null;
  if (remove.length) {
    try {
      await withTimeout(() => storage.deleteMany(remove), timeoutMs);
      removed = remove.length;
    } catch (reason) {
      error = `remoção: ${errorMessage(reason)}`;
    }
  }
  return { records: plan.keep.map(entry => entry.record), removed, error };
}

/** Lê as buscas do ator nesta marca e aplica a política Q12. */
export async function loadSubjectSearches(input: { storage: SubjectSearchLocalStorage | null | undefined; actorUserId: string | null | undefined; brandId: string; now?: Date; timeoutMs?: number }): Promise<SubjectSearchLocalLoad> {
  const scope = subjectSearchLocalScope(input.actorUserId, input.brandId);
  if (!scope || !input.storage) return { available: false, records: [], removed: 0, error: scope ? "Armazenamento indisponível." : null };
  try {
    const result = await applyRetention(input.storage, scope, String(input.actorUserId).trim(), input.brandId.trim(), input.now ?? new Date(), Math.max(1, input.timeoutMs ?? SUBJECT_SEARCH_LOCAL_TIMEOUT_MS));
    return { available: true, ...result };
  } catch (error) {
    return { available: false, records: [], removed: 0, error: `leitura: ${errorMessage(error)}` };
  }
}

/** Guarda (ou atualiza) uma busca e aplica a política Q12. Falha vira `persisted: false`. */
export async function saveSubjectSearch(input: { storage: SubjectSearchLocalStorage | null | undefined; record: SubjectSearchLocalRecord; now?: Date; timeoutMs?: number }): Promise<{ persisted: boolean; records: SubjectSearchLocalRecord[] | null; removed: number; error: string | null }> {
  const { record } = input;
  const scope = subjectSearchLocalScope(record.actorUserId, record.brandId);
  if (!scope || !input.storage) return { persisted: false, records: null, removed: 0, error: null };
  const timeoutMs = Math.max(1, input.timeoutMs ?? SUBJECT_SEARCH_LOCAL_TIMEOUT_MS);
  try {
    await withTimeout(() => input.storage!.put(subjectSearchLocalKey(scope, record.searchId), record), timeoutMs);
  } catch (error) {
    return { persisted: false, records: null, removed: 0, error: `gravação: ${errorMessage(error)}` };
  }
  try {
    const result = await applyRetention(input.storage, scope, record.actorUserId, record.brandId, input.now ?? new Date(), timeoutMs);
    return { persisted: true, ...result };
  } catch (error) {
    return { persisted: true, records: null, removed: 0, error: `política: ${errorMessage(error)}` };
  }
}

/** "Descartar esta busca": ato humano, uma busca, só do próprio ator e marca. */
export async function discardSubjectSearch(input: { storage: SubjectSearchLocalStorage | null | undefined; actorUserId: string | null | undefined; brandId: string; searchId: string; timeoutMs?: number }): Promise<{ ok: boolean; error: string | null }> {
  const scope = subjectSearchLocalScope(input.actorUserId, input.brandId);
  if (!scope || !input.storage || !input.searchId) return { ok: false, error: null };
  try {
    await withTimeout(() => input.storage!.deleteMany([subjectSearchLocalKey(scope, input.searchId)]), Math.max(1, input.timeoutMs ?? SUBJECT_SEARCH_LOCAL_TIMEOUT_MS));
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

function requestError(request: { error?: DOMException | null } | null | undefined, fallback: string): Error {
  return request?.error ?? new Error(fallback);
}

/** O último caractere do BMP fecha o intervalo do prefixo. */
const PREFIX_END = String.fromCharCode(0xffff);

/**
 * Adaptador IndexedDB, em banco próprio. Não toca `indexedDB` ao ser criado
 * (seguro no render do servidor); cada operação abre e fecha a conexão.
 */
export function createIndexedDbSubjectSearchStorage(factory?: IDBFactory): SubjectSearchLocalStorage {
  const resolveFactory = (): IDBFactory => {
    const resolved = factory ?? (typeof indexedDB === "undefined" ? undefined : indexedDB);
    if (!resolved) throw new Error("IndexedDB indisponível.");
    return resolved;
  };

  const open = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    const request = resolveFactory().open(SUBJECT_SEARCH_LOCAL_DATABASE, SUBJECT_SEARCH_LOCAL_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SUBJECT_SEARCH_LOCAL_STORE)) database.createObjectStore(SUBJECT_SEARCH_LOCAL_STORE);
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(requestError(request, "Não foi possível abrir a lista local da Pesquisa por Assunto."));
    request.onblocked = () => reject(new Error("Lista local da Pesquisa por Assunto bloqueada por outra aba."));
  });

  const transact = async <T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => () => T): Promise<T> => {
    const database = await open();
    try {
      return await new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(SUBJECT_SEARCH_LOCAL_STORE, mode);
        const collect = run(transaction.objectStore(SUBJECT_SEARCH_LOCAL_STORE));
        transaction.oncomplete = () => resolve(collect());
        transaction.onerror = () => reject(requestError(transaction, "Falha na lista local da Pesquisa por Assunto."));
        transaction.onabort = () => reject(requestError(transaction, "Operação da lista local abortada."));
      });
    } finally {
      database.close();
    }
  };

  return {
    list: prefix => transact("readonly", store => {
      const found: Array<{ key: string; value: unknown }> = [];
      const request = store.openCursor(IDBKeyRange.bound(prefix, `${prefix}${PREFIX_END}`));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (typeof cursor.key === "string") found.push({ key: cursor.key, value: cursor.value });
        cursor.continue();
      };
      return () => found;
    }),
    put: (key, value) => transact("readwrite", store => {
      store.put(value, key);
      return () => undefined;
    }),
    deleteMany: keys => transact("readwrite", store => {
      for (const key of keys) store.delete(key);
      return () => undefined;
    }),
  };
}

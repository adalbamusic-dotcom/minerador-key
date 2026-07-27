const DATABASE_NAME = "minerador-pro-editorial";
const DATABASE_VERSION = 1;
const STORE_NAME = "artifacts";

export interface BrowserArtifactEntry {
  key: string;
  value: unknown;
  source: "indexeddb" | "localstorage";
  parseError?: string;
}

export interface BrowserStorageSnapshot {
  capturedAt: string;
  localStorage: BrowserArtifactEntry[];
  indexedDb: BrowserArtifactEntry[];
  indexedDbAvailable: boolean;
  errors: string[];
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponivel."));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Nao foi possivel abrir o armazenamento editorial."));
  });
}

async function readIndexedDb(key: string): Promise<unknown | null> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error ?? new Error("Falha ao ler o artefato editorial."));
    });
  } finally {
    database.close();
  }
}

async function readIndexedDbEntriesWithoutMutation(): Promise<BrowserArtifactEntry[]> {
  if (typeof indexedDB === "undefined") return [];

  // Opening a missing database with `indexedDB.open` creates it. The
  // Without databases(), opening the name could create a new database. The
  // recovery audit must fail closed instead of performing that write.
  const databases = (indexedDB as unknown as { databases?: () => Promise<Array<{ name?: string | null }>> }).databases;
  if (!databases) throw new Error("O navegador nao permite enumerar o IndexedDB sem risco de criar um banco.");
  const known = await databases.call(indexedDB);
  if (!known.some(database => database.name === DATABASE_NAME)) return [];

  const database = await openDatabase();
  try {
    return await new Promise<BrowserArtifactEntry[]>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const keysRequest = store.getAllKeys();
      const valuesRequest = store.getAll();
      let keys: IDBValidKey[] | null = null;
      let values: unknown[] | null = null;

      const finish = () => {
        if (!keys || !values) return;
        resolve(keys.map((key, index) => ({ key: String(key), value: values![index] ?? null, source: "indexeddb" as const })));
      };
      keysRequest.onsuccess = () => { keys = keysRequest.result; finish(); };
      valuesRequest.onsuccess = () => { values = valuesRequest.result; finish(); };
      keysRequest.onerror = () => reject(keysRequest.error ?? new Error("Falha ao listar artefatos do IndexedDB."));
      valuesRequest.onerror = () => reject(valuesRequest.error ?? new Error("Falha ao ler artefatos do IndexedDB."));
    });
  } finally {
    database.close();
  }
}

async function writeIndexedDb(key: string, value: unknown): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(value, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Falha ao salvar o artefato editorial."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Salvamento editorial cancelado."));
    });
  } finally {
    database.close();
  }
}

function readLegacyLocalStorage(key: string): unknown | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  return JSON.parse(raw) as unknown;
}

function readLocalStorageEntriesWithoutMutation(): BrowserArtifactEntry[] {
  if (typeof window === "undefined") return [];
  const entries: BrowserArtifactEntry[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key) continue;
    const raw = window.localStorage.getItem(key);
    if (raw === null) continue;
    try {
      entries.push({ key, value: JSON.parse(raw) as unknown, source: "localstorage" });
    } catch (error) {
      entries.push({ key, value: raw, source: "localstorage", parseError: error instanceof Error ? error.message : "JSON inválido" });
    }
  }
  return entries;
}

/**
 * Reads both browser stores without migration, deletion or writes. This is
 * intentionally separate from readBrowserArtifact(), which reads one key and
 * cannot provide the complete evidence set required by a recovery audit.
 */
export async function readBrowserStorageSnapshot(): Promise<BrowserStorageSnapshot> {
  const errors: string[] = [];
  const localStorageEntries = readLocalStorageEntriesWithoutMutation();
  let indexedDbEntries: BrowserArtifactEntry[] = [];
  let indexedDbAvailable = typeof indexedDB !== "undefined";
  try {
    indexedDbEntries = await readIndexedDbEntriesWithoutMutation();
  } catch (error) {
    indexedDbAvailable = false;
    errors.push(error instanceof Error ? error.message : "Falha ao ler IndexedDB.");
  }
  return { capturedAt: new Date().toISOString(), localStorage: localStorageEntries, indexedDb: indexedDbEntries, indexedDbAvailable, errors };
}

export async function readBrowserArtifactReadOnly(key: string): Promise<unknown | null> {
  const snapshot = await readBrowserStorageSnapshot();
  const indexed = snapshot.indexedDb.find(entry => entry.key === key);
  if (indexed) return indexed.value;
  return snapshot.localStorage.find(entry => entry.key === key)?.value ?? null;
}

/**
 * IndexedDB is the primary store because ArticleDNA/SiloDNA can exceed the
 * small localStorage quota. Legacy localStorage values remain intact as a
 * second recovery copy; reading an artifact never deletes browser state.
 */
export async function readBrowserArtifact(key: string): Promise<unknown | null> {
  try {
    const stored = await readIndexedDb(key);
    if (stored !== null) return stored;
  } catch {
    // The legacy fallback below keeps browsers without IndexedDB operational.
  }
  const legacy = readLegacyLocalStorage(key);
  return legacy;
}

export async function writeBrowserArtifact(key: string, value: unknown): Promise<"indexeddb" | "localstorage"> {
  try {
    await writeIndexedDb(key, value);
    return "indexeddb";
  } catch (indexedDbError) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return "localstorage";
    } catch {
      throw indexedDbError;
    }
  }
}

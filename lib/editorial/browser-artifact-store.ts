const DATABASE_NAME = "minerador-pro-editorial";
const DATABASE_VERSION = 1;
const STORE_NAME = "artifacts";

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

/**
 * IndexedDB is the primary store because ArticleDNA/SiloDNA can exceed the
 * small localStorage quota. Existing localStorage values are migrated lazily.
 */
export async function readBrowserArtifact(key: string): Promise<unknown | null> {
  try {
    const stored = await readIndexedDb(key);
    if (stored !== null) return stored;
  } catch {
    // The legacy fallback below keeps browsers without IndexedDB operational.
  }
  const legacy = readLegacyLocalStorage(key);
  if (legacy === null) return null;
  try {
    await writeIndexedDb(key, legacy);
    window.localStorage.removeItem(key);
  } catch {
    // Keep the legacy copy when migration is unavailable.
  }
  return legacy;
}

export async function writeBrowserArtifact(key: string, value: unknown): Promise<"indexeddb" | "localstorage"> {
  try {
    await writeIndexedDb(key, value);
    if (typeof window !== "undefined") window.localStorage.removeItem(key);
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

/**
 * On-device image storage for the custom photo skin. Images stay in the
 * WebView's IndexedDB: never bundled, committed or sent to the server.
 */
export interface ImageStore {
  get(key: string): Promise<Blob | null>;
  put(key: string, blob: Blob): Promise<void>;
  delete(key: string): Promise<void>;
}

const DB_NAME = "gamepad-images";
const STORE = "images";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result as T);
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    });
  } finally {
    db.close();
  }
}

const indexedDbImageStore: ImageStore = {
  async get(key) {
    const value = await run<unknown>("readonly", (store) => store.get(key));
    return value instanceof Blob ? value : null;
  },
  async put(key, blob) {
    await run("readwrite", (store) => store.put(blob, key));
  },
  async delete(key) {
    await run("readwrite", (store) => store.delete(key));
  },
};

export function memoryImageStore(initial: Record<string, Blob> = {}): ImageStore {
  const data = new Map(Object.entries(initial));
  return {
    get: async (key) => data.get(key) ?? null,
    put: async (key, blob) => {
      data.set(key, blob);
    },
    delete: async (key) => {
      data.delete(key);
    },
  };
}

let current: ImageStore = indexedDbImageStore;

export function setImageStore(next: ImageStore): void {
  current = next;
}

export function imageStore(): ImageStore {
  return current;
}

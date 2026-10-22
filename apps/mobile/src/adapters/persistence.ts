/** Small async key/value port; strings only. */
export interface Persistence {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

/** Capacitor Preferences (native storage; falls back to localStorage on web). */
const capacitorPersistence: Persistence = {
  async get(key) {
    const { Preferences } = await import("@capacitor/preferences");
    return (await Preferences.get({ key })).value;
  },
  async set(key, value) {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key, value });
  },
};

export function memoryPersistence(initial: Record<string, string> = {}): Persistence {
  const data = new Map(Object.entries(initial));
  return {
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => {
      data.set(key, value);
    },
  };
}

let current: Persistence = capacitorPersistence;

export function setPersistence(next: Persistence): void {
  current = next;
}

export function persistence(): Persistence {
  return current;
}

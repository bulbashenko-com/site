"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

// Browser-only preferences (language, last section, display tweaks) kept in localStorage. Read through
// useSyncExternalStore: the server render and hydration see the fallback, the stored value applies right after
// hydration, and every component using the same key stays in sync (also across tabs, via the storage event).

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export interface StoredStateCodec<T> {
  /** Turns the stored string into a value; undefined (or a throw) means "ignore it, use the fallback". */
  parse: (raw: string) => T | undefined;
  serialize: (value: T) => string;
}

export const stringCodec = <T extends string>(allowed: readonly T[]): StoredStateCodec<T> => ({
  parse: (raw) => (allowed.includes(raw as T) ? (raw as T) : undefined),
  serialize: (value) => value,
});

export function useStoredState<T>(key: string, fallback: T, codec: StoredStateCodec<T>) {
  const raw = useSyncExternalStore(subscribe, () => read(key), () => null);
  const value = useMemo(() => {
    if (raw === null) return fallback;
    try {
      return codec.parse(raw) ?? fallback;
    } catch {
      return fallback;
    }
  }, [raw, fallback, codec]);

  const setValue = useCallback(
    (next: T | ((previous: T) => T)) => {
      const resolved = typeof next === "function" ? (next as (previous: T) => T)(value) : next;
      try {
        localStorage.setItem(key, codec.serialize(resolved));
      } catch {
        // Storage may be unavailable (private mode, quota): the value just is not kept.
      }
      for (const listener of listeners) listener();
    },
    [key, codec, value],
  );

  return [value, setValue] as const;
}

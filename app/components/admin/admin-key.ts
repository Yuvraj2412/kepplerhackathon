/**
 * OC admin credentials live in sessionStorage only (cleared when the tab closes)
 * and are read through useSyncExternalStore. Supports both named ADMIN_TOKENS
 * and legacy ADMIN_API_TOKEN (which uses X-Admin-Actor).
 */

import type { AdminCredentials } from "@/app/services/api";

const STORE = "kosmodrome:admin-creds";
const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedParsed: AdminCredentials | null = null;

export function subscribeAdminCreds(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readAdminCreds(): AdminCredentials | null {
  try {
    const raw = window.sessionStorage.getItem(STORE);
    if (raw === cachedRaw) return cachedParsed;
    cachedRaw = raw;
    if (!raw) {
      cachedParsed = null;
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<AdminCredentials>;
    if (typeof parsed.token === "string" && parsed.token.trim()) {
      cachedParsed = {
        token: parsed.token.trim(),
        actor: typeof parsed.actor === "string" ? parsed.actor.trim() : "",
      };
      return cachedParsed;
    }
    cachedParsed = null;
    return null;
  } catch {
    return null;
  }
}

export function writeAdminCreds(creds: AdminCredentials | null) {
  try {
    if (creds && creds.token.trim()) {
      const normalized: AdminCredentials = {
        token: creds.token.trim(),
        actor: creds.actor.trim(),
      };
      const raw = JSON.stringify(normalized);
      cachedRaw = raw;
      cachedParsed = normalized;
      window.sessionStorage.setItem(STORE, raw);
    } else {
      cachedRaw = null;
      cachedParsed = null;
      window.sessionStorage.removeItem(STORE);
    }
  } catch {
    cachedRaw = null;
    cachedParsed = creds
      ? { token: creds.token.trim(), actor: creds.actor.trim() }
      : null;
  }
  listeners.forEach((listener) => listener());
}

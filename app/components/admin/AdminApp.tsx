"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { adminRequest, type AdminCredentials } from "@/app/services/api";
import { Badge } from "../ui/Badge";
import { Button3D } from "../ui/Button3D";
import { cn } from "../ui/cn";
import { errorText, fieldBase, Notice } from "../portal/shared";
import { readAdminCreds, subscribeAdminCreds, writeAdminCreds } from "./admin-key";
import { LedgerPanel } from "./LedgerPanel";
import { MessagesPanel } from "./MessagesPanel";
import { OperationsPanel } from "./OperationsPanel";
import { ProblemsPanel } from "./ProblemsPanel";
import { RegistrationsPanel } from "./RegistrationsPanel";
import { ResultsPanel } from "./ResultsPanel";

const TABS = [
  { id: "registrations", label: "Registrations" },
  { id: "messages", label: "Messages" },
  { id: "problems", label: "Problems & Leak Trace" },
  { id: "operations", label: "Judging & Ops" },
  { id: "results", label: "Results & Appeals" },
  { id: "ledger", label: "Ledger" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function AdminSignInForm() {
  const [token, setToken] = useState("");
  const [actor, setActor] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmedToken = token.trim();
    const trimmedActor = actor.trim();
    if (!trimmedToken) {
      setError("Enter your OC admin token.");
      return;
    }
    setBusy(true);
    setError("");
    const candidate: AdminCredentials = { token: trimmedToken, actor: trimmedActor };
    const check = await adminRequest<{ total: number }>(
      candidate,
      "GET",
      "/api/admin/registrations?limit=1&offset=0",
    );
    setBusy(false);
    if (!check.ok) {
      setError(errorText(check));
      return;
    }
    writeAdminCreds(candidate);
  }

  return (
    <form noValidate className="max-w-xl space-y-4" onSubmit={(e) => void handleSubmit(e)}>
      <div>
        <label htmlFor="admin-token" className="block text-sm font-medium text-foreground">
          OC admin token
        </label>
        <input
          id="admin-token"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="ADMIN_API_TOKEN or named ADMIN_TOKENS entry"
          aria-invalid={Boolean(error)}
          className={cn(fieldBase, error && "border-danger")}
        />
      </div>
      <div>
        <label htmlFor="admin-actor" className="block text-sm font-medium text-foreground">
          Your name / actor ID
        </label>
        <input
          id="admin-actor"
          type="text"
          autoComplete="name"
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          placeholder="e.g. OC Chair (required for shared ADMIN_API_TOKEN)"
          className={fieldBase}
        />
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          Recorded on every audit log &amp; ledger action. If using a role token from <code className="font-mono">ADMIN_TOKENS</code>, the token&apos;s assigned name is used automatically.
        </p>
      </div>
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
      <p className="text-xs leading-relaxed text-muted">
        Credentials stay in <code className="font-mono">sessionStorage</code> for this browser tab only.
      </p>
      <Button3D type="submit" disabled={busy}>
        {busy ? "Verifying…" : "Sign in to OC console"}
      </Button3D>
    </form>
  );
}

export function AdminApp() {
  const creds = useSyncExternalStore(subscribeAdminCreds, readAdminCreds, () => null);
  const [tab, setTab] = useState<TabId>("registrations");
  const [sessionValid, setSessionValid] = useState<boolean | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    if (!creds) return;
    let active = true;
    void adminRequest(creds, "GET", "/api/admin/registrations?limit=1&offset=0").then((res) => {
      if (!active) return;
      if (res.ok) {
        setSessionValid(true);
        setSessionError(null);
      } else if (res.status === 401 || res.status === 400) {
        writeAdminCreds(null);
        setSessionValid(null);
        setSessionError(errorText(res));
      } else {
        setSessionValid(false);
        setSessionError(errorText(res));
      }
    });
    return () => {
      active = false;
    };
  }, [creds]);

  if (!creds) {
    return (
      <div className="space-y-4">
        {sessionError ? <Notice tone="error">{sessionError}</Notice> : null}
        <AdminSignInForm />
      </div>
    );
  }

  if (sessionValid === null) {
    return <p className="text-sm text-muted" role="status">Verifying OC session…</p>;
  }

  if (!sessionValid) {
    return (
      <div className="space-y-4">
        <Notice tone="error">{sessionError ?? "Could not connect to the admin backend."}</Notice>
        <Button3D type="button" size="sm" variant="secondary" onClick={() => writeAdminCreds(null)}>
          Sign out
        </Button3D>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-foreground">OC Admin Session</span>
          <Badge tone="success">authenticated</Badge>
          {creds.actor ? <span className="text-xs text-muted">Actor: {creds.actor}</span> : null}
        </div>
        <Button3D
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            setSessionValid(null);
            setSessionError(null);
            writeAdminCreds(null);
          }}
        >
          Sign out
        </Button3D>
      </div>

      <div role="tablist" aria-label="Admin sections" className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
              tab === item.id
                ? "border-primary bg-primary-soft text-foreground"
                : "border-border text-muted hover:border-border-strong hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "registrations" ? <RegistrationsPanel creds={creds} /> : null}
      {tab === "messages" ? <MessagesPanel creds={creds} /> : null}
      {tab === "problems" ? <ProblemsPanel creds={creds} /> : null}
      {tab === "operations" ? <OperationsPanel creds={creds} /> : null}
      {tab === "results" ? <ResultsPanel creds={creds} /> : null}
      {tab === "ledger" ? <LedgerPanel creds={creds} /> : null}
    </div>
  );
}

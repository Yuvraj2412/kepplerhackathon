"use client";

import { useCallback, useEffect, useState } from "react";
import { adminRequest, putToSignedUrl, type AdminCredentials } from "@/app/services/api";
import { Badge } from "../ui/Badge";
import { Button3D } from "../ui/Button3D";
import { errorText, fieldBase, formatBytes, formatIst, Notice, Section } from "../portal/shared";

interface ProblemRow {
  id: string;
  track: "Beginner" | "Advanced";
  kind: "statement" | "dataset" | "starter" | "other";
  name: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  active: boolean;
  uploaded_by: string;
  created_at: string;
}

interface LeakMatch {
  teamCode: string;
  matched: number;
  total: number;
}

export function ProblemsPanel({ creds }: { creds: AdminCredentials }) {
  const [files, setFiles] = useState<ProblemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const [track, setTrack] = useState<"Beginner" | "Advanced">("Beginner");
  const [kind, setKind] = useState<"statement" | "dataset" | "starter" | "other">("statement");
  const [displayName, setDisplayName] = useState("");
  const [uploadStatus, setUploadStatus] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);

  const [leakFileId, setLeakFileId] = useState("");
  const [leakedCsv, setLeakedCsv] = useState("");
  const [leakMatches, setLeakMatches] = useState<{ matches: LeakMatch[]; note: string } | null>(null);
  const [leakError, setLeakError] = useState<string | null>(null);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let active = true;
    void adminRequest<{ files: ProblemRow[] }>(creds, "GET", "/api/admin/problems").then((res) => {
      if (!active) return;
      setLoading(false);
      if (res.ok) {
        setFiles(res.data.files);
        setError(null);
      } else {
        setError(errorText(res));
      }
    });
    return () => {
      active = false;
    };
  }, [creds, version]);

  async function handleFileUpload(file: File) {
    setUploadStatus({ tone: "info", text: "Requesting signed upload URL…" });
    const signed = await adminRequest<{ objectPath: string; uploadUrl: string; method: "PUT" }>(
      creds,
      "POST",
      "/api/admin/problems/upload-url",
      { track, filename: file.name },
    );
    if (!signed.ok) {
      setUploadStatus({ tone: "error", text: errorText(signed) });
      return;
    }

    setUploadStatus({ tone: "info", text: `Uploading ${formatBytes(file.size)} to problems bucket…` });
    const put = await putToSignedUrl({ ...signed.data, maxBytes: 500 * 1024 * 1024 }, file);
    if (!put.ok) {
      setUploadStatus({ tone: "error", text: errorText(put) });
      return;
    }

    setUploadStatus({ tone: "info", text: "Computing SHA-256 and writing ledger entry…" });
    const reg = await adminRequest<{ id: string; sha256: string; size: number }>(
      creds,
      "POST",
      "/api/admin/problems",
      {
        track,
        kind,
        name: displayName.trim() || file.name,
        contentType: file.type || "application/octet-stream",
        objectPath: signed.data.objectPath,
      },
    );
    if (!reg.ok) {
      setUploadStatus({ tone: "error", text: errorText(reg) });
      return;
    }
    setDisplayName("");
    setUploadStatus({
      tone: "ok",
      text: `Registered ${reg.data.id} (${formatBytes(reg.data.size)}, SHA-256 ${reg.data.sha256.slice(0, 16)}…).`,
    });
    refresh();
  }

  async function retireFile(id: string) {
    const res = await adminRequest(creds, "DELETE", `/api/admin/problems/${encodeURIComponent(id)}`);
    if (!res.ok) {
      setUploadStatus({ tone: "error", text: errorText(res) });
      return;
    }
    refresh();
  }

  async function runLeakTrace() {
    setLeakError(null);
    setLeakMatches(null);
    const res = await adminRequest<{ matches: LeakMatch[]; note: string }>(
      creds,
      "POST",
      "/api/admin/leak-trace",
      { fileId: leakFileId.trim(), leakedCsv },
    );
    if (!res.ok) {
      setLeakError(errorText(res));
      return;
    }
    setLeakMatches(res.data);
  }

  return (
    <div className="space-y-6">
      <Section title="Upload & register problem file">
        <p>Files uploaded here are SHA-256 hashed, logged into the hash-chained ledger, and released at T0 with per-team watermarks and CSV canaries.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="prob-track" className="block text-xs font-medium text-foreground">Track</label>
            <select
              id="prob-track"
              value={track}
              onChange={(e) => setTrack(e.target.value as "Beginner" | "Advanced")}
              className={fieldBase}
            >
              <option value="Beginner">Beginner</option>
              <option value="Advanced">Advanced</option>
            </select>
          </div>
          <div>
            <label htmlFor="prob-kind" className="block text-xs font-medium text-foreground">Kind</label>
            <select
              id="prob-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as ProblemRow["kind"])}
              className={fieldBase}
            >
              <option value="statement">Statement</option>
              <option value="dataset">Dataset (CSV canaries if text/csv)</option>
              <option value="starter">Starter code</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label htmlFor="prob-name" className="block text-xs font-medium text-foreground">Display name</label>
            <input
              id="prob-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Defaults to filename"
              className={fieldBase}
            />
          </div>
        </div>
        <div>
          <label htmlFor="prob-file" className="block text-xs font-medium text-foreground">Select file</label>
          <input
            id="prob-file"
            type="file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void handleFileUpload(f);
            }}
            className="mt-2 block w-full text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
          />
        </div>
        {uploadStatus ? <Notice tone={uploadStatus.tone}>{uploadStatus.text}</Notice> : null}
      </Section>

      <Section title={`Problem files (${files.length})`}>
        {error ? <Notice tone="error">{error}</Notice> : null}
        {loading ? (
          <p className="text-sm text-muted" role="status">Loading problem files…</p>
        ) : files.length === 0 ? (
          <Notice tone="info">No problem files registered yet.</Notice>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {files.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{f.name}</span>
                    <Badge tone={f.active ? "success" : "neutral"}>{f.active ? "active" : "retired"}</Badge>
                    <Badge tone="neutral">{f.track}</Badge>
                    <Badge tone="neutral">{f.kind}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    <code className="font-mono">{f.id}</code> · {formatBytes(f.size_bytes)} · SHA-256{" "}
                    <code className="font-mono">{f.sha256.slice(0, 16)}…</code> · by {f.uploaded_by} · {formatIst(f.created_at)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button3D type="button" size="sm" variant="secondary" onClick={() => setLeakFileId(f.id)}>
                    Use in tracer
                  </Button3D>
                  {f.active ? (
                    <Button3D type="button" size="sm" variant="secondary" onClick={() => void retireFile(f.id)}>
                      Retire
                    </Button3D>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="CSV leak tracer (canary forensics)">
        <p>Compare a leaked CSV dataset against every verified team&apos;s deterministic canary rows (Sections 5.8 &amp; 5.12).</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="leak-file-id" className="block text-xs font-medium text-foreground">Problem file ID</label>
            <input
              id="leak-file-id"
              type="text"
              value={leakFileId}
              onChange={(e) => setLeakFileId(e.target.value)}
              placeholder="prob_…"
              className={fieldBase}
            />
          </div>
          <div>
            <label htmlFor="leak-csv-upload" className="block text-xs font-medium text-foreground">Or load leaked CSV file</label>
            <input
              id="leak-csv-upload"
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) setLeakedCsv(await f.text());
              }}
              className="mt-2 block w-full text-xs text-muted file:mr-2 file:rounded file:border-0 file:bg-surface-raised file:px-2.5 file:py-1.5 file:text-xs file:text-foreground"
            />
          </div>
        </div>
        <div>
          <label htmlFor="leak-csv-text" className="block text-xs font-medium text-foreground">Leaked CSV text</label>
          <textarea
            id="leak-csv-text"
            rows={5}
            value={leakedCsv}
            onChange={(e) => setLeakedCsv(e.target.value)}
            placeholder="Paste leaked CSV content…"
            className={`${fieldBase} font-mono text-xs`}
          />
        </div>
        <Button3D type="button" size="sm" onClick={() => void runLeakTrace()}>
          Trace canary matches
        </Button3D>
        {leakError ? <Notice tone="error">{leakError}</Notice> : null}
        {leakMatches ? (
          <div className="rounded-lg border border-border p-3 text-xs">
            <p className="text-muted">{leakMatches.note}</p>
            {leakMatches.matches.length === 0 ? (
              <p className="mt-2 text-foreground">No canary matches found across verified teams.</p>
            ) : (
              <ul className="mt-2 space-y-1 font-mono text-foreground">
                {leakMatches.matches.map((m) => (
                  <li key={m.teamCode}>
                    {m.teamCode}: {m.matched}/{m.total} canary records matched
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </Section>
    </div>
  );
}

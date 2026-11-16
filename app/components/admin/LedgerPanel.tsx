"use client";

import { useCallback, useEffect, useState } from "react";
import { adminRequest, type AdminCredentials } from "@/app/services/api";
import { Badge } from "../ui/Badge";
import { Button3D } from "../ui/Button3D";
import { errorText, formatIst, Notice, Section } from "../portal/shared";

interface LedgerEntry {
  id: number;
  at: string;
  kind: string;
  subject: string;
  hash: string;
}

interface LedgerResponse {
  intact: boolean;
  brokenAt: number | null;
  recent: LedgerEntry[];
}

export function LedgerPanel({ creds }: { creds: AdminCredentials }) {
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let active = true;
    void adminRequest<LedgerResponse>(creds, "GET", "/api/admin/ledger").then((res) => {
      if (!active) return;
      if (res.ok) {
        setData(res.data);
        setError(null);
      } else {
        setError(errorText(res));
      }
    });
    return () => {
      active = false;
    };
  }, [creds, version]);

  return (
    <Section title="Immutable hash-chained ledger">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span>Chain verification:</span>
          {data ? (
            data.intact ? (
              <Badge tone="success">Intact ({data.recent.length} recent entries)</Badge>
            ) : (
              <Badge tone="danger">Tampered / broken at #{data.brokenAt}</Badge>
            )
          ) : (
            <Badge tone="neutral">Checking…</Badge>
          )}
        </div>
        <Button3D type="button" size="sm" variant="secondary" onClick={refresh}>
          Re-verify chain
        </Button3D>
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}

      {data && data.recent.length === 0 ? (
        <Notice tone="info">No ledger entries recorded yet.</Notice>
      ) : data ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-raised text-muted">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Timestamp (IST)</th>
                <th className="px-3 py-2">Kind</th>
                <th className="px-3 py-2">Subject</th>
                <th className="px-3 py-2">SHA-256 chain hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.recent.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 font-mono">{row.id}</td>
                  <td className="px-3 py-2 text-muted">{formatIst(row.at)}</td>
                  <td className="px-3 py-2"><Badge tone="neutral">{row.kind}</Badge></td>
                  <td className="px-3 py-2 font-mono text-foreground">{row.subject}</td>
                  <td className="px-3 py-2 font-mono text-muted">{row.hash}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Section>
  );
}

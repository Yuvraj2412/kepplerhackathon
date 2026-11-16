"use client";

import { useCallback, useEffect, useState } from "react";
import { adminRequest, type AdminCredentials } from "@/app/services/api";
import { Badge, type BadgeTone } from "../ui/Badge";
import { Button3D } from "../ui/Button3D";
import { errorText, fieldBase, formatIst, Notice, Section } from "../portal/shared";

interface MessageRow {
  id: string;
  name: string;
  email: string;
  topic: string;
  message: string;
  status: "new" | "in_progress" | "resolved";
  legal_hold: boolean;
  created_at: string;
}

function toneFor(status: string): BadgeTone {
  if (status === "resolved") return "success";
  if (status === "in_progress") return "warning";
  return "accent";
}

export function MessagesPanel({ creds }: { creds: AdminCredentials }) {
  const [statusFilter, setStatusFilter] = useState("");
  const [rows, setRows] = useState<MessageRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let active = true;
    const qs = new URLSearchParams({ limit: "100", offset: "0" });
    if (statusFilter) qs.set("status", statusFilter);

    void adminRequest<{ total: number; messages: MessageRow[] }>(
      creds,
      "GET",
      `/api/admin/messages?${qs.toString()}`,
    ).then((res) => {
      if (!active) return;
      setLoading(false);
      if (res.ok) {
        setRows(res.data.messages);
        setTotal(res.data.total ?? res.data.messages.length);
        setError(null);
      } else {
        setError(errorText(res));
      }
    });
    return () => {
      active = false;
    };
  }, [creds, statusFilter, version]);

  async function updateMessage(id: string, patch: { status?: MessageRow["status"]; legalHold?: boolean }) {
    setNotice(null);
    const res = await adminRequest(creds, "PATCH", `/api/admin/messages/${encodeURIComponent(id)}`, patch);
    if (!res.ok) {
      setNotice({ tone: "error", text: errorText(res) });
      return;
    }
    setNotice({ tone: "ok", text: `Updated ${id}.` });
    refresh();
  }

  return (
    <Section title={`Contact & OC inbox (${total})`}>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="msg-status" className="block text-xs font-medium text-foreground">Filter by status</label>
          <select
            id="msg-status"
            value={statusFilter}
            onChange={(e) => {
              setLoading(true);
              setStatusFilter(e.target.value);
            }}
            className={fieldBase}
          >
            <option value="">All</option>
            <option value="new">New</option>
            <option value="in_progress">In progress</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
        <Button3D
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            setLoading(true);
            refresh();
          }}
        >
          Refresh
        </Button3D>
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      {loading ? (
        <p className="text-sm text-muted" role="status">Loading messages…</p>
      ) : rows.length === 0 ? (
        <Notice tone="info">No messages in this view.</Notice>
      ) : (
        <div className="space-y-3">
          {rows.map((m) => (
            <div key={m.id} className="rounded-lg border border-border bg-background/60 p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground">{m.name}</span>
                    <Badge tone={toneFor(m.status)}>{m.status}</Badge>
                    <Badge tone="neutral">{m.topic}</Badge>
                    {m.legal_hold ? <Badge tone="warning">Legal hold</Badge> : null}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {m.email} · <code className="font-mono">{m.id}</code> · {formatIst(m.created_at)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(["new", "in_progress", "resolved"] as const).map((status) => (
                    <Button3D
                      key={status}
                      type="button"
                      size="sm"
                      variant={m.status === status ? "primary" : "secondary"}
                      onClick={() => void updateMessage(m.id, { status })}
                    >
                      {status.replace("_", " ")}
                    </Button3D>
                  ))}
                  <Button3D
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => void updateMessage(m.id, { legalHold: !m.legal_hold })}
                  >
                    {m.legal_hold ? "Unhold" : "Legal hold"}
                  </Button3D>
                </div>
              </div>
              <p className="whitespace-pre-wrap text-sm text-foreground">{m.message}</p>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

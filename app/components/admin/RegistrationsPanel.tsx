"use client";

import { useCallback, useEffect, useState } from "react";
import { adminRequest, type AdminCredentials } from "@/app/services/api";
import { Badge, type BadgeTone } from "../ui/Badge";
import { Button3D } from "../ui/Button3D";
import { errorText, fieldBase, formatBytes, formatIst, Notice, Section } from "../portal/shared";

interface TeamMemberSummary {
  position: number;
  full_name: string;
  email: string;
  college: string;
  programme: string;
  id_uploaded_at: string | null;
  id_content_type?: string | null;
  id_size_bytes?: number | null;
}

interface RegistrationRow {
  id: string;
  team_name: string;
  track: "Beginner" | "Advanced";
  leader_email: string;
  verification_status: "pending" | "verified" | "rejected";
  rejection_reason: string | null;
  legal_hold: boolean;
  created_at: string;
  verified_at?: string | null;
  verified_by?: string | null;
  team_members: TeamMemberSummary[];
}

interface ManualKeyEntry {
  position: number;
  fullName: string;
  email: string;
  key: string;
}

interface ActivationInfo {
  teamCode: string;
  alreadyActive: boolean;
  delivery: string;
  manualKeys: ManualKeyEntry[];
}

function statusTone(status: string): BadgeTone {
  if (status === "verified") return "success";
  if (status === "rejected") return "danger";
  return "warning";
}

export function RegistrationsPanel({ creds }: { creds: AdminCredentials }) {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [trackFilter, setTrackFilter] = useState<string>("");
  const [rows, setRows] = useState<RegistrationRow[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RegistrationRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [dqReason, setDqReason] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionNotice, setActionNotice] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const [issuedKeys, setIssuedKeys] = useState<ActivationInfo | null>(null);
  const [idLink, setIdLink] = useState<{ member: string; url: string } | null>(null);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let active = true;
    const qs = new URLSearchParams({ limit: "100", offset: "0" });
    if (statusFilter) qs.set("status", statusFilter);
    if (trackFilter) qs.set("track", trackFilter);

    void adminRequest<{ total: number; registrations: RegistrationRow[] }>(
      creds,
      "GET",
      `/api/admin/registrations?${qs.toString()}`,
    ).then((res) => {
      if (!active) return;
      setLoading(false);
      if (res.ok) {
        setRows(res.data.registrations);
        setTotal(res.data.total ?? res.data.registrations.length);
        setError(null);
      } else {
        setError(errorText(res));
      }
    });
    return () => {
      active = false;
    };
  }, [creds, statusFilter, trackFilter, version]);

  async function inspectTeam(id: string) {
    if (selectedId === id) {
      setSelectedId(null);
      setDetail(null);
      setIdLink(null);
      return;
    }
    setSelectedId(id);
    setActionNotice(null);
    setIssuedKeys(null);
    setIdLink(null);
    const res = await adminRequest<RegistrationRow>(creds, "GET", `/api/admin/registrations/${encodeURIComponent(id)}`);
    if (res.ok) setDetail(res.data);
    else setActionNotice({ tone: "error", text: errorText(res) });
  }

  async function patchRegistration(id: string, body: Record<string, unknown>, okMsg: string) {
    setActionBusy(true);
    setActionNotice(null);
    setIssuedKeys(null);
    const res = await adminRequest<RegistrationRow & { portal?: ActivationInfo }>(
      creds,
      "PATCH",
      `/api/admin/registrations/${encodeURIComponent(id)}`,
      body,
    );
    setActionBusy(false);
    if (!res.ok) {
      setActionNotice({ tone: "error", text: errorText(res) });
      return;
    }
    setDetail(res.data);
    if (res.data.portal) setIssuedKeys(res.data.portal);
    setActionNotice({ tone: "ok", text: okMsg });
    refresh();
  }

  async function viewCollegeId(teamId: string, pos: number, fullName: string) {
    setActionNotice(null);
    const res = await adminRequest<{ url: string; expiresInSeconds: number }>(
      creds,
      "GET",
      `/api/admin/registrations/${encodeURIComponent(teamId)}/members/${pos}/college-id`,
    );
    if (!res.ok) {
      setActionNotice({ tone: "error", text: errorText(res) });
      return;
    }
    setIdLink({ member: fullName, url: res.data.url });
    window.open(res.data.url, "_blank", "noopener,noreferrer");
  }

  async function reissueKey(teamId: string, pos: number, fullName: string) {
    setActionBusy(true);
    setActionNotice(null);
    const res = await adminRequest<ActivationInfo>(
      creds,
      "POST",
      `/api/admin/registrations/${encodeURIComponent(teamId)}/members/${pos}/reissue-key`,
    );
    setActionBusy(false);
    if (!res.ok) {
      setActionNotice({ tone: "error", text: errorText(res) });
      return;
    }
    setIssuedKeys(res.data);
    setActionNotice({ tone: "ok", text: `Portal key reissued for ${fullName} (delivery: ${res.data.delivery}).` });
  }

  async function handleDisqualify(teamId: string, reinstate: boolean) {
    setActionBusy(true);
    setActionNotice(null);
    const res = await adminRequest<{ id: string; disqualified: boolean }>(
      creds,
      "POST",
      `/api/admin/teams/${encodeURIComponent(teamId)}/disqualify`,
      { reason: dqReason, reinstate },
    );
    setActionBusy(false);
    if (!res.ok) {
      setActionNotice({ tone: "error", text: errorText(res) });
      return;
    }
    setDqReason("");
    setActionNotice({
      tone: "ok",
      text: reinstate ? `Team ${teamId} reinstated.` : `Team ${teamId} marked disqualified.`,
    });
    refresh();
  }

  return (
    <div className="space-y-6">
      <Section title={`Team registrations (${total})`}>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="reg-status" className="block text-xs font-medium text-foreground">Status</label>
            <select
              id="reg-status"
              value={statusFilter}
              onChange={(e) => {
                setLoading(true);
                setStatusFilter(e.target.value);
              }}
              className={fieldBase}
            >
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="verified">Verified</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div>
            <label htmlFor="reg-track" className="block text-xs font-medium text-foreground">Track</label>
            <select
              id="reg-track"
              value={trackFilter}
              onChange={(e) => {
                setLoading(true);
                setTrackFilter(e.target.value);
              }}
              className={fieldBase}
            >
              <option value="">All tracks</option>
              <option value="Beginner">Beginner</option>
              <option value="Advanced">Advanced</option>
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
        {loading ? (
          <p className="text-sm text-muted" role="status">Loading registrations…</p>
        ) : rows.length === 0 ? (
          <Notice tone="info">No team registrations match this filter yet.</Notice>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => {
              const members = row.team_members ?? [];
              const uploadedCount = members.filter((m) => m.id_uploaded_at).length;
              const isSelected = selectedId === row.id;
              return (
                <div key={row.id} className="rounded-lg border border-border bg-background/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground">{row.team_name}</span>
                        <Badge tone={statusTone(row.verification_status)}>{row.verification_status}</Badge>
                        <Badge tone="neutral">{row.track}</Badge>
                        {row.legal_hold ? <Badge tone="warning">Legal hold</Badge> : null}
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        <code className="font-mono">{row.id}</code> · Leader {row.leader_email} · IDs {uploadedCount}/{members.length} · Registered {formatIst(row.created_at)}
                      </p>
                    </div>
                    <Button3D type="button" size="sm" variant="secondary" onClick={() => void inspectTeam(row.id)}>
                      {isSelected ? "Close" : "Inspect"}
                    </Button3D>
                  </div>

                  {isSelected && detail && detail.id === row.id ? (
                    <div className="mt-4 space-y-4 border-t border-border pt-4">
                      {detail.rejection_reason ? (
                        <Notice tone="error">Rejection reason: {detail.rejection_reason}</Notice>
                      ) : null}

                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Team members</p>
                        <ul className="divide-y divide-border rounded-lg border border-border">
                          {(detail.team_members ?? [])
                            .slice()
                            .sort((a, b) => a.position - b.position)
                            .map((m) => (
                              <li key={m.position} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
                                <div>
                                  <p className="font-medium text-foreground">
                                    {m.position === 0 ? "[Leader] " : `[#${m.position + 1}] `}
                                    {m.full_name}
                                  </p>
                                  <p className="text-xs text-muted">
                                    {m.email} · {m.college} · {m.programme} ·{" "}
                                    {m.id_uploaded_at
                                      ? `ID uploaded (${m.id_content_type ?? "file"}, ${m.id_size_bytes ? formatBytes(m.id_size_bytes) : "size unknown"})`
                                      : "No college ID uploaded"}
                                  </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {m.id_uploaded_at ? (
                                    <Button3D
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      onClick={() => void viewCollegeId(detail.id, m.position, m.full_name)}
                                    >
                                      View ID (60s)
                                    </Button3D>
                                  ) : null}
                                  {detail.verification_status === "verified" ? (
                                    <Button3D
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      disabled={actionBusy}
                                      onClick={() => void reissueKey(detail.id, m.position, m.full_name)}
                                    >
                                      Reissue key
                                    </Button3D>
                                  ) : null}
                                </div>
                              </li>
                            ))}
                        </ul>
                      </div>

                      {idLink ? (
                        <Notice tone="info">
                          Signed 60s ID link for {idLink.member}:{" "}
                          <a href={idLink.url} target="_blank" rel="noopener noreferrer" className="underline text-primary">
                            Open college ID
                          </a>
                        </Notice>
                      ) : null}

                      <div className="flex flex-wrap gap-2">
                        <Button3D
                          type="button"
                          size="sm"
                          disabled={actionBusy}
                          onClick={() =>
                            void patchRegistration(
                              detail.id,
                              { verificationStatus: "verified" },
                              "Team verified and portal activated.",
                            )
                          }
                        >
                          Verify & activate portal
                        </Button3D>
                        <Button3D
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={actionBusy}
                          onClick={() =>
                            void patchRegistration(
                              detail.id,
                              { verificationStatus: "pending" },
                              "Reset to pending.",
                            )
                          }
                        >
                          Set pending
                        </Button3D>
                        <Button3D
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={actionBusy}
                          onClick={() =>
                            void patchRegistration(
                              detail.id,
                              { legalHold: !detail.legal_hold },
                              detail.legal_hold ? "Legal hold removed." : "Legal hold applied.",
                            )
                          }
                        >
                          {detail.legal_hold ? "Clear legal hold" : "Set legal hold"}
                        </Button3D>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-lg border border-border p-3">
                          <label htmlFor={`reject-${detail.id}`} className="block text-xs font-medium text-foreground">
                            Reject registration
                          </label>
                          <input
                            id={`reject-${detail.id}`}
                            type="text"
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="Reason shown in audit log…"
                            className={fieldBase}
                          />
                          <div className="mt-2">
                            <Button3D
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={actionBusy}
                              onClick={() =>
                                void patchRegistration(
                                  detail.id,
                                  { verificationStatus: "rejected", reason: rejectReason },
                                  "Team rejected.",
                                )
                              }
                            >
                              Reject team
                            </Button3D>
                          </div>
                        </div>

                        <div className="rounded-lg border border-border p-3">
                          <label htmlFor={`dq-${detail.id}`} className="block text-xs font-medium text-foreground">
                            Disqualification (Section 9.2)
                          </label>
                          <input
                            id={`dq-${detail.id}`}
                            type="text"
                            value={dqReason}
                            onChange={(e) => setDqReason(e.target.value)}
                            placeholder="Documented evidence reason…"
                            className={fieldBase}
                          />
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button3D
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={actionBusy}
                              onClick={() => void handleDisqualify(detail.id, false)}
                            >
                              Disqualify
                            </Button3D>
                            <Button3D
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={actionBusy}
                              onClick={() => void handleDisqualify(detail.id, true)}
                            >
                              Reinstate
                            </Button3D>
                          </div>
                        </div>
                      </div>

                      {actionNotice ? <Notice tone={actionNotice.tone}>{actionNotice.text}</Notice> : null}

                      {issuedKeys ? (
                        <div className="rounded-lg border border-success bg-success-soft p-3 text-xs text-foreground">
                          <p className="font-semibold">
                            Team code: {issuedKeys.teamCode} · Delivery: {issuedKeys.delivery}
                            {issuedKeys.alreadyActive ? " (already active)" : ""}
                          </p>
                          {issuedKeys.manualKeys.length > 0 ? (
                            <div className="mt-2 space-y-1">
                              <p className="text-muted">
                                Mail not configured or failed for these members — copy their personal portal keys now (shown once):
                              </p>
                              <ul className="space-y-1 font-mono">
                                {issuedKeys.manualKeys.map((k) => (
                                  <li key={k.position}>
                                    {k.fullName} ({k.email}): <code>{k.key}</code>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}

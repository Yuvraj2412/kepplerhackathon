"use client";

import { useCallback, useEffect, useState } from "react";
import { adminRequest, type AdminCredentials } from "@/app/services/api";
import { Badge, type BadgeTone } from "../ui/Badge";
import { Button3D } from "../ui/Button3D";
import { errorText, fieldBase, formatIst, Notice, Section } from "../portal/shared";

interface StoredResultRow {
  team_id: string;
  track: string;
  stage1: number | null;
  stage2: number | null;
  final: number | null;
  rank: number | null;
  finalist: boolean;
  phase: string | null;
  audit_passed: boolean | null;
  teams?: { team_code?: string; team_name?: string } | null;
}

interface ComputedResultsPayload {
  track: string;
  saved: boolean;
  ledgerHash: string | null;
  awardsMayBeVacant: boolean;
  moderationPending: string[];
  incomplete: string[];
  juryVoteRequired: string[];
  teams: {
    teamId: string;
    teamCode: string;
    teamName: string;
    stage1: number | null;
    stage2: number | null;
    final: number | null;
    rank: number | null;
    finalist: boolean;
    eligible: boolean;
  }[];
}

interface AppealRow {
  id: string;
  team_id: string;
  ground: string;
  description: string;
  status: "open" | "upheld" | "rejected";
  decision_note: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  teams?: { team_code?: string; team_name?: string; track?: string } | null;
}

function appealTone(status: string): BadgeTone {
  if (status === "upheld") return "success";
  if (status === "rejected") return "danger";
  return "warning";
}

export function ResultsPanel({ creds }: { creds: AdminCredentials }) {
  const [track, setTrack] = useState<"Beginner" | "Advanced">("Beginner");
  const [stored, setStored] = useState<StoredResultRow[]>([]);
  const [computed, setComputed] = useState<ComputedResultsPayload | null>(null);
  const [resultsNotice, setResultsNotice] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const [version, setVersion] = useState(0);

  const [auditTeamId, setAuditTeamId] = useState("");
  const [appeals, setAppeals] = useState<AppealRow[]>([]);
  const [appealStatus, setAppealStatus] = useState("");
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [appealNotice, setAppealNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const [sheetId, setSheetId] = useState("");
  const [corrScoresJson, setCorrScoresJson] = useState('{"problem_understanding": 12}');
  const [corrJustJson, setCorrJustJson] = useState('{"problem_understanding": "Updated on upheld appeal"}');
  const [corrReason, setCorrReason] = useState("");
  const [corrNotice, setCorrNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let active = true;
    const appealQs = appealStatus ? `?status=${encodeURIComponent(appealStatus)}` : "";
    void Promise.all([
      adminRequest<{ results: StoredResultRow[] }>(creds, "GET", `/api/admin/results?track=${track}`),
      adminRequest<{ appeals: AppealRow[] }>(creds, "GET", `/api/admin/appeals${appealQs}`),
    ]).then(([rRes, aRes]) => {
      if (!active) return;
      if (rRes.ok) setStored(rRes.data.results);
      else setResultsNotice({ tone: "error", text: errorText(rRes) });
      if (aRes.ok) setAppeals(aRes.data.appeals);
    });
    return () => {
      active = false;
    };
  }, [creds, track, appealStatus, version]);

  async function compute(save: boolean) {
    setResultsNotice(null);
    const res = await adminRequest<ComputedResultsPayload>(
      creds,
      "POST",
      "/api/admin/results/compute",
      { track, save },
    );
    if (!res.ok) {
      setResultsNotice({ tone: "error", text: errorText(res) });
      return;
    }
    setComputed(res.data);
    setResultsNotice({
      tone: "ok",
      text: save
        ? `Saved ${res.data.teams.length} results for ${track} (ledger ${res.data.ledgerHash?.slice(0, 12)}…).`
        : `Previewed ${res.data.teams.length} results for ${track} (not saved yet).`,
    });
    if (save) refresh();
  }

  async function submitAudit(teamId: string, passed: boolean) {
    setResultsNotice(null);
    const res = await adminRequest(creds, "POST", "/api/admin/results/audit", { teamId: teamId.trim(), passed });
    if (!res.ok) {
      setResultsNotice({ tone: "error", text: errorText(res) });
      return;
    }
    setResultsNotice({ tone: "ok", text: `Winner audit recorded (${passed ? "PASSED" : "FAILED"}) for ${teamId}.` });
    refresh();
  }

  async function publish(phase: "provisional" | "final") {
    setResultsNotice(null);
    const res = await adminRequest<{ track: string; phase: string; teams: number }>(
      creds,
      "POST",
      "/api/admin/results/publish",
      { track, phase },
    );
    if (!res.ok) {
      setResultsNotice({ tone: "error", text: errorText(res) });
      return;
    }
    setResultsNotice({ tone: "ok", text: `Published ${res.data.phase} results for ${res.data.track} (${res.data.teams} teams).` });
    refresh();
  }

  async function decideAppeal(id: string, status: "upheld" | "rejected") {
    setAppealNotice(null);
    const note = decisionNotes[id] ?? "";
    const res = await adminRequest<{ id: string; status: string; afterDeadline: boolean }>(
      creds,
      "PATCH",
      `/api/admin/appeals/${encodeURIComponent(id)}`,
      { status, note },
    );
    if (!res.ok) {
      setAppealNotice({ tone: "error", text: errorText(res) });
      return;
    }
    setAppealNotice({
      tone: "ok",
      text: `Appeal ${id} marked ${res.data.status}.${res.data.afterDeadline ? " (Recorded after T+138 deadline)" : ""}`,
    });
    refresh();
  }

  async function applyScoreCorrection() {
    setCorrNotice(null);
    let parsedScores: unknown;
    let parsedJust: unknown;
    try {
      parsedScores = JSON.parse(corrScoresJson);
      parsedJust = JSON.parse(corrJustJson);
    } catch {
      setCorrNotice({ tone: "error", text: "Scores and justifications must be valid JSON objects." });
      return;
    }
    const res = await adminRequest(creds, "POST", "/api/admin/score-corrections", {
      sheetId: Number(sheetId),
      scores: parsedScores,
      justifications: parsedJust,
      reason: corrReason,
    });
    if (!res.ok) {
      setCorrNotice({ tone: "error", text: errorText(res) });
      return;
    }
    setCorrReason("");
    setCorrNotice({ tone: "ok", text: `Score sheet #${sheetId} corrected with audit & ledger entry.` });
  }

  return (
    <div className="space-y-6">
      <Section title="Scoring computation, winner audit & publishing">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="res-track" className="block text-xs font-medium text-foreground">Track</label>
            <select
              id="res-track"
              value={track}
              onChange={(e) => setTrack(e.target.value as "Beginner" | "Advanced")}
              className={fieldBase}
            >
              <option value="Beginner">Beginner</option>
              <option value="Advanced">Advanced</option>
            </select>
          </div>
          <Button3D type="button" size="sm" variant="secondary" onClick={() => void compute(false)}>
            Preview compute
          </Button3D>
          <Button3D type="button" size="sm" onClick={() => void compute(true)}>
            Compute & save draft
          </Button3D>
          <Button3D type="button" size="sm" variant="secondary" onClick={() => void publish("provisional")}>
            Publish provisional
          </Button3D>
          <Button3D type="button" size="sm" variant="secondary" onClick={() => void publish("final")}>
            Publish final
          </Button3D>
        </div>

        {resultsNotice ? <Notice tone={resultsNotice.tone}>{resultsNotice.text}</Notice> : null}

        {computed ? (
          <div className="rounded-lg border border-border p-3 text-xs space-y-1">
            <p className="font-semibold text-foreground">Compute flags ({computed.track})</p>
            <p>Moderation pending: {computed.moderationPending.join(", ") || "None"}</p>
            <p>Incomplete Stage 1 judging: {computed.incomplete.join(", ") || "None"}</p>
            <p>Grand Jury tie-break needed: {computed.juryVoteRequired.join(", ") || "None"}</p>
            {computed.awardsMayBeVacant ? (
              <p className="text-warning">Note: fewer eligible teams than podium spots (awards may stay vacant per 14.5).</p>
            ) : null}
          </div>
        ) : null}

        {stored.length === 0 ? (
          <Notice tone="info">No stored results for {track} yet. Run &ldquo;Compute &amp; save draft&rdquo; after judging.</Notice>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-raised text-muted">
                <tr>
                  <th className="px-3 py-2">Rank</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">Stage 1</th>
                  <th className="px-3 py-2">Stage 2</th>
                  <th className="px-3 py-2">Final</th>
                  <th className="px-3 py-2">Phase</th>
                  <th className="px-3 py-2">Winner audit</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stored.map((r) => (
                  <tr key={r.team_id}>
                    <td className="px-3 py-2 font-mono">{r.rank ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className="font-medium text-foreground">{r.teams?.team_code ?? r.team_id}</span>{" "}
                      <span className="text-muted">{r.teams?.team_name ?? ""}</span>
                    </td>
                    <td className="px-3 py-2 font-mono">{r.stage1 ?? "—"}</td>
                    <td className="px-3 py-2 font-mono">{r.stage2 ?? "—"}</td>
                    <td className="px-3 py-2 font-mono">{r.final ?? "—"}</td>
                    <td className="px-3 py-2"><Badge tone="neutral">{r.phase ?? "draft"}</Badge></td>
                    <td className="px-3 py-2">
                      {r.audit_passed === true ? (
                        <Badge tone="success">passed</Badge>
                      ) : r.audit_passed === false ? (
                        <Badge tone="danger">failed</Badge>
                      ) : (
                        <Badge tone="warning">pending</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <Button3D type="button" size="sm" variant="secondary" onClick={() => void submitAudit(r.team_id, true)}>
                          Pass audit
                        </Button3D>
                        <Button3D type="button" size="sm" variant="secondary" onClick={() => void submitAudit(r.team_id, false)}>
                          Fail
                        </Button3D>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <div className="min-w-[240px] flex-1">
            <label htmlFor="audit-team-id" className="block text-xs font-medium text-foreground">
              Record winner audit by Team ID (`reg_…`)
            </label>
            <input
              id="audit-team-id"
              type="text"
              value={auditTeamId}
              onChange={(e) => setAuditTeamId(e.target.value)}
              placeholder="reg_…"
              className={fieldBase}
            />
          </div>
          <Button3D type="button" size="sm" variant="secondary" onClick={() => void submitAudit(auditTeamId, true)}>
            Mark audit passed
          </Button3D>
          <Button3D type="button" size="sm" variant="secondary" onClick={() => void submitAudit(auditTeamId, false)}>
            Mark failed
          </Button3D>
        </div>
      </Section>

      <Section title={`Grievance Committee appeals (${appeals.length})`}>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="app-status" className="block text-xs font-medium text-foreground">Status</label>
            <select
              id="app-status"
              value={appealStatus}
              onChange={(e) => setAppealStatus(e.target.value)}
              className={fieldBase}
            >
              <option value="">All</option>
              <option value="open">Open</option>
              <option value="upheld">Upheld</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <Button3D type="button" size="sm" variant="secondary" onClick={refresh}>
            Refresh
          </Button3D>
        </div>
        {appealNotice ? <Notice tone={appealNotice.tone}>{appealNotice.text}</Notice> : null}

        {appeals.length === 0 ? (
          <Notice tone="info">No appeals submitted.</Notice>
        ) : (
          <div className="space-y-3">
            {appeals.map((a) => (
              <div key={a.id} className="rounded-lg border border-border bg-background/60 p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">
                    {a.teams?.team_code ?? a.team_id} · {a.teams?.team_name ?? ""}
                  </span>
                  <Badge tone={appealTone(a.status)}>{a.status}</Badge>
                  <Badge tone="neutral">{a.ground}</Badge>
                </div>
                <p className="text-xs text-muted">
                  <code className="font-mono">{a.id}</code> · Submitted {formatIst(a.created_at)}
                </p>
                <p className="whitespace-pre-wrap text-sm text-foreground">{a.description}</p>
                {a.decision_note ? (
                  <p className="text-xs text-muted">
                    Decision by {a.decided_by ?? "OC"} ({formatIst(a.decided_at)}): {a.decision_note}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-end gap-2 pt-2">
                  <input
                    type="text"
                    value={decisionNotes[a.id] ?? ""}
                    onChange={(e) => setDecisionNotes((prev) => ({ ...prev, [a.id]: e.target.value }))}
                    placeholder="Grievance Committee reasoning…"
                    className={`${fieldBase} mt-0 flex-1`}
                  />
                  <Button3D type="button" size="sm" onClick={() => void decideAppeal(a.id, "upheld")}>
                    Uphold
                  </Button3D>
                  <Button3D type="button" size="sm" variant="secondary" onClick={() => void decideAppeal(a.id, "rejected")}>
                    Reject
                  </Button3D>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Moderator score sheet correction (Section 10.8)">
        <p>Corrects a locked score sheet only with a documented reason and preserves the original sheet in the ledger.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="corr-sheet" className="block text-xs font-medium text-foreground">Score sheet ID</label>
            <input id="corr-sheet" type="number" value={sheetId} onChange={(e) => setSheetId(e.target.value)} placeholder="1" className={fieldBase} />
          </div>
          <div>
            <label htmlFor="corr-reason" className="block text-xs font-medium text-foreground">Reason</label>
            <input id="corr-reason" type="text" value={corrReason} onChange={(e) => setCorrReason(e.target.value)} placeholder="Upheld appeal / arithmetic correction" className={fieldBase} />
          </div>
          <div>
            <label htmlFor="corr-scores" className="block text-xs font-medium text-foreground">Full scores JSON (all judge criteria)</label>
            <textarea id="corr-scores" rows={3} value={corrScoresJson} onChange={(e) => setCorrScoresJson(e.target.value)} className={`${fieldBase} font-mono text-xs`} />
          </div>
          <div>
            <label htmlFor="corr-just" className="block text-xs font-medium text-foreground">Justifications JSON</label>
            <textarea id="corr-just" rows={3} value={corrJustJson} onChange={(e) => setCorrJustJson(e.target.value)} className={`${fieldBase} font-mono text-xs`} />
          </div>
        </div>
        <Button3D type="button" size="sm" variant="secondary" onClick={() => void applyScoreCorrection()}>
          Apply moderator correction
        </Button3D>
        {corrNotice ? <Notice tone={corrNotice.tone}>{corrNotice.text}</Notice> : null}
      </Section>
    </div>
  );
}

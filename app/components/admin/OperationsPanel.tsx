"use client";

import { useCallback, useEffect, useState } from "react";
import { adminRequest, type AdminCredentials } from "@/app/services/api";
import { Badge } from "../ui/Badge";
import { Button3D } from "../ui/Button3D";
import { errorText, fieldBase, formatIst, Notice, Section } from "../portal/shared";

interface JudgeRow {
  id: string;
  name: string;
  role: string;
  tracks: string[];
  active: boolean;
  created_at: string;
}

const PENALTY_CODES = [
  { code: "identity_leak", label: "Identity leak (fixed 3 pts)", min: 3, max: 3 },
  { code: "undeclared_third_party", label: "Undeclared third-party (5-15 pts)", min: 5, max: 15 },
  { code: "undeclared_ai", label: "Undeclared AI assistance (5-10 pts)", min: 5, max: 10 },
  { code: "conduct_repeat", label: "Repeated conduct issue (fixed 10 pts)", min: 10, max: 10 },
] as const;

export function OperationsPanel({ creds }: { creds: AdminCredentials }) {
  const [judges, setJudges] = useState<JudgeRow[]>([]);
  const [judgeLoading, setJudgeLoading] = useState(true);
  const [judgeError, setJudgeError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const [jName, setJName] = useState("");
  const [jRole, setJRole] = useState<"judge" | "chair" | "moderator" | "grand_jury">("judge");
  const [jBeginner, setJBeginner] = useState(true);
  const [jAdvanced, setJAdvanced] = useState(false);
  const [createdJudgeKey, setCreatedJudgeKey] = useState<{ id: string; name: string; role: string; key: string } | null>(null);
  const [judgeNotice, setJudgeNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const [conflictJudgeId, setConflictJudgeId] = useState("");
  const [conflictTeamId, setConflictTeamId] = useState("");
  const [conflictReason, setConflictReason] = useState("");

  const [assignTrack, setAssignTrack] = useState<"Beginner" | "Advanced">("Beginner");
  const [assignMode, setAssignMode] = useState<"stage1" | "third" | "stage2">("stage1");
  const [assignNotice, setAssignNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const [cpTeamId, setCpTeamId] = useState("");
  const [cpPos, setCpPos] = useState<number[]>([0, 1]);
  const [cpNotice, setCpNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const [closeNotice, setCloseNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const [scTeamId, setScTeamId] = useState("");
  const [reqWork, setReqWork] = useState("");
  const [reqTotal, setReqTotal] = useState("");
  const [benchPriv, setBenchPriv] = useState("");
  const [benchBase, setBenchBase] = useState("");
  const [benchRef, setBenchRef] = useState("");
  const [cleanRunOk, setCleanRunOk] = useState<"unset" | "true" | "false">("unset");
  const [scNotice, setScNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const [penTeamId, setPenTeamId] = useState("");
  const [penCode, setPenCode] = useState<string>("identity_leak");
  const [penPoints, setPenPoints] = useState("3");
  const [penReason, setPenReason] = useState("");
  const [penNotice, setPenNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let active = true;
    void adminRequest<{ judges: JudgeRow[] }>(creds, "GET", "/api/admin/judges").then((res) => {
      if (!active) return;
      setJudgeLoading(false);
      if (res.ok) {
        setJudges(res.data.judges);
        setJudgeError(null);
      } else {
        setJudgeError(errorText(res));
      }
    });
    return () => {
      active = false;
    };
  }, [creds, version]);

  async function createJudge() {
    setJudgeNotice(null);
    setCreatedJudgeKey(null);
    const tracks: string[] = [];
    if (jBeginner) tracks.push("Beginner");
    if (jAdvanced) tracks.push("Advanced");
    const res = await adminRequest<{ id: string; name: string; role: string; key: string }>(
      creds,
      "POST",
      "/api/admin/judges",
      { name: jName, role: jRole, tracks },
    );
    if (!res.ok) {
      setJudgeNotice({ tone: "error", text: errorText(res) });
      return;
    }
    setCreatedJudgeKey(res.data);
    setJName("");
    setJudgeNotice({ tone: "ok", text: `Judge ${res.data.name} created.` });
    refresh();
  }

  async function declareConflict() {
    setJudgeNotice(null);
    const res = await adminRequest(creds, "PUT", "/api/admin/judges", {
      judgeId: conflictJudgeId.trim(),
      teamId: conflictTeamId.trim(),
      reason: conflictReason,
    });
    if (!res.ok) {
      setJudgeNotice({ tone: "error", text: errorText(res) });
      return;
    }
    setConflictTeamId("");
    setConflictReason("");
    setJudgeNotice({ tone: "ok", text: "Conflict of interest recorded." });
  }

  async function runAssignments() {
    setAssignNotice(null);
    const res = await adminRequest<{ created: number; pending?: string[] }>(
      creds,
      "POST",
      "/api/admin/assignments",
      { track: assignTrack, mode: assignMode },
    );
    if (!res.ok) {
      setAssignNotice({ tone: "error", text: errorText(res) });
      return;
    }
    setAssignNotice({
      tone: "ok",
      text: `Created ${res.data.created} ${assignMode} assignment(s) for ${assignTrack}.${
        res.data.pending?.length ? ` Moderation pending: ${res.data.pending.join(", ")}` : ""
      }`,
    });
  }

  async function recordCheckpoint2() {
    setCpNotice(null);
    const res = await adminRequest<{ teamId: string; present: number; of: number; counts: boolean }>(
      creds,
      "POST",
      "/api/admin/checkpoints",
      { teamId: cpTeamId.trim(), presentPositions: cpPos },
    );
    if (!res.ok) {
      setCpNotice({ tone: "error", text: errorText(res) });
      return;
    }
    setCpNotice({
      tone: "ok",
      text: `Recorded Checkpoint 2 for ${res.data.teamId}: ${res.data.present}/${res.data.of} present (${res.data.counts ? "counts" : "incomplete"}).`,
    });
  }

  async function closeSubmissions() {
    setCloseNotice(null);
    const res = await adminRequest<{ frozen: number; alreadyFrozen: number }>(
      creds,
      "POST",
      "/api/admin/submissions/close",
    );
    if (!res.ok) {
      setCloseNotice({ tone: "error", text: errorText(res) });
      return;
    }
    setCloseNotice({
      tone: "ok",
      text: `Frozen ${res.data.frozen} manifests (${res.data.alreadyFrozen} already frozen).`,
    });
  }

  async function saveScriptScores() {
    setScNotice(null);
    const payload: Record<string, unknown> = { teamId: scTeamId.trim() };
    if (reqWork !== "") payload.requirementsWorking = Number(reqWork);
    if (reqTotal !== "") payload.requirementsTotal = Number(reqTotal);
    if (benchPriv !== "") payload.benchmarkPrivate = Number(benchPriv);
    if (benchBase !== "") payload.benchmarkBaseline = Number(benchBase);
    if (benchRef !== "") payload.benchmarkReference = Number(benchRef);
    if (cleanRunOk !== "unset") payload.cleanRunOk = cleanRunOk === "true";

    const res = await adminRequest<{ teamId: string; requirementsPoints: number | null; benchmarkPoints: number | null }>(
      creds,
      "POST",
      "/api/admin/scripts",
      payload,
    );
    if (!res.ok) {
      setScNotice({ tone: "error", text: errorText(res) });
      return;
    }
    setScNotice({
      tone: "ok",
      text: `Saved script inputs for ${res.data.teamId}. Beginner req pts: ${res.data.requirementsPoints ?? "n/a"} · Advanced benchmark pts: ${res.data.benchmarkPoints ?? "n/a"}.`,
    });
  }

  async function applyPenalty() {
    setPenNotice(null);
    const res = await adminRequest<{ id: number; code: string; points: number }>(
      creds,
      "POST",
      "/api/admin/penalties",
      {
        teamId: penTeamId.trim(),
        code: penCode,
        points: Number(penPoints),
        reason: penReason,
      },
    );
    if (!res.ok) {
      setPenNotice({ tone: "error", text: errorText(res) });
      return;
    }
    setPenReason("");
    setPenNotice({ tone: "ok", text: `Applied penalty #${res.data.id}: ${res.data.code} (-${res.data.points} pts).` });
  }

  return (
    <div className="space-y-6">
      <Section title={`Judges (${judges.length})`}>
        {judgeError ? <Notice tone="error">{judgeError}</Notice> : null}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3 rounded-lg border border-border p-4">
            <h4 className="font-semibold text-foreground">Create judge (shows key once)</h4>
            <div>
              <label htmlFor="jdg-name" className="block text-xs font-medium text-foreground">Full name</label>
              <input id="jdg-name" type="text" value={jName} onChange={(e) => setJName(e.target.value)} className={fieldBase} />
            </div>
            <div>
              <label htmlFor="jdg-role" className="block text-xs font-medium text-foreground">Role</label>
              <select
                id="jdg-role"
                value={jRole}
                onChange={(e) => setJRole(e.target.value as typeof jRole)}
                className={fieldBase}
              >
                <option value="judge">Judge</option>
                <option value="chair">Chair</option>
                <option value="moderator">Moderator</option>
                <option value="grand_jury">Grand Jury</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-foreground">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={jBeginner} onChange={(e) => setJBeginner(e.target.checked)} />
                Beginner
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={jAdvanced} onChange={(e) => setJAdvanced(e.target.checked)} />
                Advanced
              </label>
            </div>
            <Button3D type="button" size="sm" onClick={() => void createJudge()}>
              Create judge
            </Button3D>
          </div>

          <div className="space-y-3 rounded-lg border border-border p-4">
            <h4 className="font-semibold text-foreground">Declare conflict of interest (Annex B)</h4>
            <div>
              <label htmlFor="conf-jdg" className="block text-xs font-medium text-foreground">Judge ID</label>
              <input
                id="conf-jdg"
                type="text"
                value={conflictJudgeId}
                onChange={(e) => setConflictJudgeId(e.target.value)}
                placeholder="jdg_…"
                className={fieldBase}
              />
            </div>
            <div>
              <label htmlFor="conf-team" className="block text-xs font-medium text-foreground">Team ID</label>
              <input
                id="conf-team"
                type="text"
                value={conflictTeamId}
                onChange={(e) => setConflictTeamId(e.target.value)}
                placeholder="reg_…"
                className={fieldBase}
              />
            </div>
            <div>
              <label htmlFor="conf-reason" className="block text-xs font-medium text-foreground">Reason</label>
              <input
                id="conf-reason"
                type="text"
                value={conflictReason}
                onChange={(e) => setConflictReason(e.target.value)}
                placeholder="Same lab / advisor / collaborator"
                className={fieldBase}
              />
            </div>
            <Button3D type="button" size="sm" variant="secondary" onClick={() => void declareConflict()}>
              Record conflict
            </Button3D>
          </div>
        </div>

        {judgeNotice ? <Notice tone={judgeNotice.tone}>{judgeNotice.text}</Notice> : null}
        {createdJudgeKey ? (
          <Notice tone="ok">
            One-time key for {createdJudgeKey.name} ({createdJudgeKey.role}, <code className="font-mono">{createdJudgeKey.id}</code>):{" "}
            <code className="font-mono font-semibold text-foreground">{createdJudgeKey.key}</code>
          </Notice>
        ) : null}

        {judgeLoading ? (
          <p className="text-sm text-muted" role="status">Loading judges…</p>
        ) : judges.length > 0 ? (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {judges.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{j.name}</span>
                    <Badge tone="neutral">{j.role}</Badge>
                    <Badge tone={j.active ? "success" : "danger"}>{j.active ? "active" : "inactive"}</Badge>
                  </div>
                  <p className="text-xs text-muted">
                    <code className="font-mono">{j.id}</code> · Tracks: {j.tracks.join(", ") || "All (Grand Jury)"} · {formatIst(j.created_at)}
                  </p>
                </div>
                <Button3D type="button" size="sm" variant="secondary" onClick={() => setConflictJudgeId(j.id)}>
                  Select ID
                </Button3D>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <div className="grid gap-6 md:grid-cols-2">
        <Section title="Auto-assign judges">
          <p>Balanced assignment excluding declared conflicts (Section 10).</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="assign-track" className="block text-xs font-medium text-foreground">Track</label>
              <select
                id="assign-track"
                value={assignTrack}
                onChange={(e) => setAssignTrack(e.target.value as "Beginner" | "Advanced")}
                className={fieldBase}
              >
                <option value="Beginner">Beginner</option>
                <option value="Advanced">Advanced</option>
              </select>
            </div>
            <div>
              <label htmlFor="assign-mode" className="block text-xs font-medium text-foreground">Stage / mode</label>
              <select
                id="assign-mode"
                value={assignMode}
                onChange={(e) => setAssignMode(e.target.value as typeof assignMode)}
                className={fieldBase}
              >
                <option value="stage1">Stage 1 (2 judges per team)</option>
                <option value="third">Third judge (disagreement moderation)</option>
                <option value="stage2">Stage 2 (Grand Jury for finalists)</option>
              </select>
            </div>
          </div>
          <Button3D type="button" size="sm" onClick={() => void runAssignments()}>
            Run assignment
          </Button3D>
          {assignNotice ? <Notice tone={assignNotice.tone}>{assignNotice.text}</Notice> : null}
        </Section>

        <Section title="Checkpoint 2 & submission close">
          <div className="space-y-3">
            <div>
              <label htmlFor="cp-team" className="block text-xs font-medium text-foreground">
                Checkpoint 2 video attendance (Team ID `reg_…`)
              </label>
              <input
                id="cp-team"
                type="text"
                value={cpTeamId}
                onChange={(e) => setCpTeamId(e.target.value)}
                placeholder="reg_…"
                className={fieldBase}
              />
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-foreground">
              {[0, 1, 2, 3].map((pos) => (
                <label key={pos} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={cpPos.includes(pos)}
                    onChange={(e) =>
                      setCpPos((prev) =>
                        e.target.checked ? [...prev, pos] : prev.filter((p) => p !== pos),
                      )
                    }
                  />
                  Member #{pos + 1}
                </label>
              ))}
            </div>
            <Button3D type="button" size="sm" onClick={() => void recordCheckpoint2()}>
              Save Checkpoint 2
            </Button3D>
            {cpNotice ? <Notice tone={cpNotice.tone}>{cpNotice.text}</Notice> : null}
          </div>

          <div className="border-t border-border pt-3">
            <p className="mb-2 text-xs text-muted">
              After T+48 (+ grace window ends), freeze every team&apos;s submission manifest into the ledger:
            </p>
            <Button3D type="button" size="sm" variant="secondary" onClick={() => void closeSubmissions()}>
              Freeze submission manifests
            </Button3D>
            {closeNotice ? <Notice tone={closeNotice.tone}>{closeNotice.text}</Notice> : null}
          </div>
        </Section>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Section title="Script scores (Section 10.4)">
          <div className="space-y-2">
            <label htmlFor="sc-team" className="block text-xs font-medium text-foreground">Team ID (`reg_…`)</label>
            <input id="sc-team" type="text" value={scTeamId} onChange={(e) => setScTeamId(e.target.value)} placeholder="reg_…" className={fieldBase} />
            <div className="grid gap-2 sm:grid-cols-2">
              <input type="number" placeholder="Beginner working reqs" value={reqWork} onChange={(e) => setReqWork(e.target.value)} className={fieldBase} />
              <input type="number" placeholder="Beginner total reqs" value={reqTotal} onChange={(e) => setReqTotal(e.target.value)} className={fieldBase} />
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <input type="number" step="any" placeholder="Adv private" value={benchPriv} onChange={(e) => setBenchPriv(e.target.value)} className={fieldBase} />
              <input type="number" step="any" placeholder="Adv baseline" value={benchBase} onChange={(e) => setBenchBase(e.target.value)} className={fieldBase} />
              <input type="number" step="any" placeholder="Adv reference" value={benchRef} onChange={(e) => setBenchRef(e.target.value)} className={fieldBase} />
            </div>
            <select value={cleanRunOk} onChange={(e) => setCleanRunOk(e.target.value as typeof cleanRunOk)} className={fieldBase}>
              <option value="unset">Clean reproduction check: unchanged</option>
              <option value="true">Clean run OK (true)</option>
              <option value="false">Reproduction mismatch (false — voids benchmark)</option>
            </select>
            <Button3D type="button" size="sm" onClick={() => void saveScriptScores()}>
              Save script scores
            </Button3D>
            {scNotice ? <Notice tone={scNotice.tone}>{scNotice.text}</Notice> : null}
          </div>
        </Section>

        <Section title="Manual penalties (Section 13)">
          <div className="space-y-2">
            <label htmlFor="pen-team" className="block text-xs font-medium text-foreground">Team ID (`reg_…`)</label>
            <input id="pen-team" type="text" value={penTeamId} onChange={(e) => setPenTeamId(e.target.value)} placeholder="reg_…" className={fieldBase} />
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                value={penCode}
                onChange={(e) => {
                  const next = e.target.value;
                  setPenCode(next);
                  const rule = PENALTY_CODES.find((c) => c.code === next);
                  if (rule) setPenPoints(String(rule.min));
                }}
                className={fieldBase}
              >
                {PENALTY_CODES.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
              <input
                type="number"
                value={penPoints}
                onChange={(e) => setPenPoints(e.target.value)}
                placeholder="Points"
                className={fieldBase}
              />
            </div>
            <input
              type="text"
              value={penReason}
              onChange={(e) => setPenReason(e.target.value)}
              placeholder="Documented reason…"
              className={fieldBase}
            />
            <Button3D type="button" size="sm" variant="secondary" onClick={() => void applyPenalty()}>
              Apply penalty
            </Button3D>
            {penNotice ? <Notice tone={penNotice.tone}>{penNotice.text}</Notice> : null}
          </div>
        </Section>
      </div>
    </div>
  );
}

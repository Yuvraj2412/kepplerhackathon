/* eslint-disable @typescript-eslint/no-explicit-any */
/** End-to-end route and Supabase client regression tests across backend endpoints. */

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { GET as healthGet } from "../app/api/health/route";
import { GET as publicResultsGet } from "../app/api/results/route";
import { GET as portalMeGet } from "../app/api/portal/me/route";
import { GET as portalProblemFileGet } from "../app/api/portal/problems/[id]/route";
import { GET as portalSubmissionGet } from "../app/api/portal/submission/route";
import { GET as portalLeaderboardGet } from "../app/api/portal/leaderboard/route";
import { GET as portalFeedbackGet } from "../app/api/portal/feedback/route";
import { POST as portalCheckpointPost } from "../app/api/portal/checkpoints/[n]/route";
import { POST as portalPredictionPost } from "../app/api/portal/predictions/route";
import { POST as portalPredictionSelectPost } from "../app/api/portal/predictions/select/route";
import { POST as portalSubmissionItemPost } from "../app/api/portal/submission/items/route";
import { GET as judgeAssignmentsGet } from "../app/api/judge/assignments/route";
import { GET as judgeFinalistsGet } from "../app/api/judge/finalists/route";
import { GET as judgeSubmissionGet } from "../app/api/judge/submissions/[code]/route";
import { GET as adminAppealsGet } from "../app/api/admin/appeals/route";
import { PATCH as adminAppealPatch } from "../app/api/admin/appeals/[id]/route";
import { POST as adminAssignmentsPost } from "../app/api/admin/assignments/route";
import { POST as adminCheckpoint2Post } from "../app/api/admin/checkpoints/route";
import { POST as adminJudgePost, PUT as adminJudgePut } from "../app/api/admin/judges/route";
import { POST as adminLeakTracePost } from "../app/api/admin/leak-trace/route";
import { GET as adminLedgerGet } from "../app/api/admin/ledger/route";
import { POST as adminPenaltyPost } from "../app/api/admin/penalties/route";
import { GET as adminProblemsGet, POST as adminProblemsPost } from "../app/api/admin/problems/route";
import { POST as adminReissueKeyPost } from "../app/api/admin/registrations/[id]/members/[index]/reissue-key/route";
import { POST as adminResultsAuditPost } from "../app/api/admin/results/audit/route";
import { POST as adminResultsComputePost } from "../app/api/admin/results/compute/route";
import { POST as adminResultsPublishPost } from "../app/api/admin/results/publish/route";
import { POST as adminScoreCorrectionPost } from "../app/api/admin/score-corrections/route";
import { POST as adminScriptsPost } from "../app/api/admin/scripts/route";
import { POST as adminStage0Post } from "../app/api/admin/stage0/route";
import { POST as adminSubmissionsClosePost } from "../app/api/admin/submissions/close/route";
import { POST as adminSnapshotsPost } from "../app/api/admin/submissions/snapshots/route";
import { hashObject, updateRows } from "../lib/supabase";
import { sha256Hex } from "../lib/security";
import { installFakeSupabase, restoreFetch, setEnv, type Call } from "./helpers";

const KEY = "kmp_" + "a".repeat(43);
const JKEY = "kmj_" + "b".repeat(43);
const TEAM = "reg_" + "1".repeat(20);
const JDG = "jdg_" + "2".repeat(20);

const setNow = (h: number) =>
  setEnv({ EVENT_START_ISO: new Date(Date.now() - h * 3600_000).toISOString() });

const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) }) as never;

const req = (url: string, init: { method?: string; key?: string; json?: unknown; admin?: boolean } = {}) =>
  new Request(`http://localhost${url}`, {
    method: init.method ?? (init.json !== undefined ? "POST" : "GET"),
    headers: {
      "x-forwarded-for": "203.0.113.9",
      ...(init.admin
        ? { authorization: "Bearer admin-secret", "x-admin-actor": "Priya (OC)" }
        : init.key
          ? { authorization: `Bearer ${init.key}` }
          : {}),
      ...(init.json !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(init.json !== undefined ? { body: JSON.stringify(init.json) } : {}),
  });

const memberRow = (track: "Beginner" | "Advanced" = "Beginner") => ({
  position: 0,
  full_name: "Asha Rao",
  email_key: "asha@iist.ac.in",
  pledge_signed_at: "2026-12-13T00:00:00Z",
  final_declaration_signed_at: null,
  teams: {
    id: TEAM,
    team_code: track === "Beginner" ? "B-001" : "A-001",
    team_name: "Orbital Originals",
    track,
    leader_email: "asha@iist.ac.in",
    verification_status: "verified",
    disqualified: false,
    grace_granted: false,
    repo_url: null,
    team_members: [{ position: 0, pledge_signed_at: "x", final_declaration_signed_at: null }],
  },
});

beforeEach(() => setEnv());
afterEach(() => restoreFetch());

describe("supabase client fixes", () => {
  it("updateRows omits select=id so tables without an id column succeed", async () => {
    const calls = installFakeSupabase((c) => (c.method === "PATCH" ? { body: [{ team_id: TEAM }] } : undefined));
    const count = await updateRows("results", { team_id: `eq.${TEAM}` }, { phase: "provisional" });
    assert.equal(count, 1);
    const patch = calls[0] as Call;
    assert.equal(patch.url.searchParams.get("select"), null);
    assert.equal(patch.url.searchParams.get("team_id"), `eq.${TEAM}`);
  });

  it("hashObject accumulates at least 64 header bytes across tiny stream chunks", async () => {
    const mp4 = Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]);
    globalThis.fetch = (async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(mp4.slice(0, 4));
          controller.enqueue(mp4.slice(4, 8));
          controller.enqueue(mp4.slice(8));
          controller.close();
        },
      });
      return new Response(stream, { status: 200 });
    }) as typeof fetch;

    const hashed = await hashObject("submissions", `${TEAM}/demo/1`, 1024);
    assert.ok(hashed);
    assert.equal(hashed.size, mp4.length);
    assert.deepEqual(hashed.head, mp4);
  });
});

describe("health and public results", () => {
  it("health endpoint responds with liveness and deep db ping", async () => {
    installFakeSupabase((c) => (c.path.includes("/rest/v1/rate_limits") ? { body: [] } : undefined));
    const shallow = await healthGet(new Request("http://localhost/api/health"));
    assert.equal(shallow.status, 200);
    assert.equal(((await shallow.json()) as any).database, "skipped");

    const deep = await healthGet(new Request("http://localhost/api/health?deep=1"));
    assert.equal(deep.status, 200);
    assert.equal(((await deep.json()) as any).database, "ok");
  });

  it("public results validates track query param and returns published rows", async () => {
    installFakeSupabase((c) =>
      c.path.includes("/rest/v1/results")
        ? { body: [{ track: "Beginner", rank: 1, final: 88.5, phase: "final", teams: { team_name: "Orbital", team_code: "B-001" } }] }
        : undefined,
    );
    assert.equal((await publicResultsGet(req("/api/results?track=Invalid"), ctx({}))).status, 400);
    const ok = await publicResultsGet(req("/api/results?track=Beginner"), ctx({}));
    assert.equal(ok.status, 200);
    assert.equal(((await ok.json()) as any).data.results[0].teamCode, "B-001");
  });
});

describe("checkpoints, predictions, decks & judging fixes", () => {
  it("updating an existing checkpoint note or Checkpoint 2 does not send select=id", async () => {
    setNow(5);
    const note = "Updated progress note with at least ten words for checkpoint verification.";
    const calls = installFakeSupabase((c) => {
      if (c.path.includes("/rest/v1/team_members") && c.url.searchParams.get("portal_token_hash") === `eq.${sha256Hex(KEY)}`) {
        return { body: [memberRow()] };
      }
      if (c.path.includes("/rest/v1/team_members")) return { body: [{ position: 0 }] };
      if (c.path.includes("/rest/v1/checkpoints") && c.method === "GET") return { body: [{ n: 1 }] };
      if (c.path.includes("/rest/v1/checkpoints") && c.method === "PATCH") return { body: [{ team_id: TEAM, n: 1 }] };
    });

    const p = await portalCheckpointPost(req("/api/portal/checkpoints/1", { key: KEY, json: { note } }), ctx({ n: "1" }));
    assert.equal(p.status, 200);
    const a = await adminCheckpoint2Post(req("/api/admin/checkpoints", { admin: true, json: { teamId: TEAM, presentPositions: [0] } }), ctx({}));
    assert.equal(a.status, 200);

    const patches = calls.filter((c) => c.method === "PATCH");
    assert.equal(patches.length, 2);
    for (const patch of patches) assert.equal(patch.url.searchParams.get("select"), null);
  });

  it("rejects empty prediction uploads (422) and deletes empty object from storage", async () => {
    setNow(5);
    const calls: Call[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      const call: Call = {
        method: init?.method ?? "GET",
        path: url.pathname + url.search,
        url,
        json: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
        headers: new Headers(init?.headers),
      };
      calls.push(call);
      if (url.pathname.includes("/rest/v1/team_members")) return Response.json([memberRow("Advanced")]);
      if (url.pathname.includes("/rest/v1/prediction_uploads")) return Response.json([]);
      if (url.pathname.includes("/storage/v1/object/submissions/") && call.method === "GET") {
        return new Response(new Uint8Array(0), { status: 200 });
      }
      if (url.pathname.includes("/storage/v1/object/submissions") && call.method === "DELETE") {
        return Response.json([]);
      }
      throw new Error(`Unexpected fetch: ${call.method} ${call.path}`);
    }) as typeof fetch;

    const res = await portalPredictionPost(
      req("/api/portal/predictions", { key: KEY, json: { objectPath: `${TEAM}/predictions/p1` } }),
      ctx({}),
    );
    assert.equal(res.status, 422);
    assert.ok(calls.some((c) => c.method === "DELETE" && c.path.includes("/storage/v1/object/submissions")));
  });

  it("blocks non-finalists when registering a finals deck item", async () => {
    setNow(85);
    installFakeSupabase((c) => {
      if (c.path.includes("/rest/v1/team_members")) return { body: [memberRow()] };
      if (c.path.includes("/rest/v1/results")) return { body: [] };
    });
    const res = await portalSubmissionItemPost(
      req("/api/portal/submission/items", { key: KEY, json: { item: "deck", objectPath: `${TEAM}/deck/d1` } }),
      ctx({}),
    );
    assert.equal(res.status, 403);
  });

  it("allows moderators to read assigned blind submissions", async () => {
    installFakeSupabase((c) => {
      if (c.path.includes("/rest/v1/judges")) return { body: [{ id: JDG, name: "Mod", role: "moderator", tracks: ["Beginner"] }] };
      if (c.path.includes("/rest/v1/teams")) return { body: [{ id: TEAM, track: "Beginner" }] };
      if (c.path.includes("/rest/v1/judge_assignments")) return { body: [{ team_id: TEAM }] };
      if (c.path.includes("/rest/v1/judge_conflicts")) return { body: [] };
      if (c.path.includes("/rest/v1/submission_manifests")) return { body: [{ manifest_sha256: "abc", payload: { repo: null } }] };
      if (c.path.includes("/rest/v1/submission_items")) return { body: [] };
    });
    const res = await judgeSubmissionGet(req("/api/judge/submissions/B-001", { key: JKEY }), ctx({ code: "B-001" }));
    assert.equal(res.status, 200);
  });
});

describe("admin assignments, results and FK handling", () => {
  it("does not assign a 4th judge when third-judge moderation is triggered twice", async () => {
    const calls = installFakeSupabase((c) => {
      if (c.path.includes("/rest/v1/judges")) {
        return {
          body: [
            { id: "jdg_1", role: "judge", tracks: ["Beginner"] },
            { id: "jdg_2", role: "judge", tracks: ["Beginner"] },
            { id: "jdg_3", role: "judge", tracks: ["Beginner"] },
            { id: "jdg_4", role: "judge", tracks: ["Beginner"] },
          ],
        };
      }
      if (c.path.includes("/rest/v1/judge_conflicts")) return { body: [] };
      if (c.path.includes("/rest/v1/judge_assignments")) {
        return {
          body: [
            { judge_id: "jdg_1", team_id: TEAM, stage: 1, third: false },
            { judge_id: "jdg_2", team_id: TEAM, stage: 1, third: false },
            { judge_id: "jdg_3", team_id: TEAM, stage: 1, third: true },
          ],
        };
      }
      if (c.path.includes("/rest/v1/teams")) {
        return { body: [{ id: TEAM, team_code: "B-001", team_name: "Orbital", disqualified: false, grace_granted: false }] };
      }
      if (c.path.includes("/rest/v1/stage0_results")) return { body: [{ team_id: TEAM, passed: true }] };
      if (c.path.includes("/rest/v1/score_sheets")) {
        return {
          body: [
            { judge_id: "jdg_1", team_id: TEAM, stage: 1, scores: { problem_understanding: 15 }, total: 80 },
            { judge_id: "jdg_2", team_id: TEAM, stage: 1, scores: { problem_understanding: 5 }, total: 40 },
          ],
        };
      }
      if (c.path.includes("/rest/v1/script_scores")) return { body: [] };
      if (c.path.includes("/rest/v1/penalties")) return { body: [] };
      if (c.path.includes("/rest/v1/checkpoints")) return { body: [] };
      if (c.path.includes("/rest/v1/team_members")) return { body: [{ team_id: TEAM }, { team_id: TEAM }] };
      if (c.path.includes("/rest/v1/submission_items")) return { body: [] };
      if (c.path.includes("/rest/v1/repo_snapshots")) return { body: [] };
    });

    const res = await adminAssignmentsPost(
      req("/api/admin/assignments", { admin: true, json: { track: "Beginner", mode: "third" } }),
      ctx({}),
    );
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as any).data.created, 0);
    assert.ok(!calls.some((c) => c.method === "POST" && c.path.includes("/judge_assignments")));
  });

  it("computes+saves, audits, and publishes results cleanly", async () => {
    const calls = installFakeSupabase((c) => {
      if (c.path.includes("/rest/v1/teams")) {
        return { body: [{ id: TEAM, team_code: "B-001", team_name: "Orbital", disqualified: false, grace_granted: false }] };
      }
      if (c.path.includes("/rest/v1/stage0_results")) return { body: [{ team_id: TEAM, passed: true }] };
      if (c.path.includes("/rest/v1/score_sheets")) {
        return {
          body: [
            { judge_id: "j1", team_id: TEAM, stage: 1, scores: { technical_implementation: 8, domain_accuracy: 12 }, total: 70 },
            { judge_id: "j2", team_id: TEAM, stage: 1, scores: { technical_implementation: 8, domain_accuracy: 12 }, total: 72 },
          ],
        };
      }
      if (c.path.includes("/rest/v1/script_scores")) return { body: [] };
      if (c.path.includes("/rest/v1/penalties")) return { body: [] };
      if (c.path.includes("/rest/v1/checkpoints")) return { body: [] };
      if (c.path.includes("/rest/v1/team_members")) return { body: [{ team_id: TEAM }, { team_id: TEAM }] };
      if (c.path.includes("/rest/v1/submission_items")) return { body: [] };
      if (c.path.includes("/rest/v1/repo_snapshots")) return { body: [] };
      if (c.path.includes("/rest/v1/results") && c.method === "GET") return { body: [{ team_id: TEAM, rank: 1, audit_passed: true, phase: "draft" }] };
      if (c.path.includes("/rest/v1/results") && c.method === "PATCH") return { body: [{ team_id: TEAM }] };
      if (c.path.endsWith("/rpc/ledger_append")) return { body: { id: 1, hash: "abc" } };
    });

    const comp = await adminResultsComputePost(req("/api/admin/results/compute", { admin: true, json: { track: "Beginner", save: true } }), ctx({}));
    assert.equal(comp.status, 200);
    const aud = await adminResultsAuditPost(req("/api/admin/results/audit", { admin: true, json: { teamId: TEAM, passed: true } }), ctx({}));
    assert.equal(aud.status, 200);
    const pub = await adminResultsPublishPost(req("/api/admin/results/publish", { admin: true, json: { track: "Beginner", phase: "final" } }), ctx({}));
    assert.equal(pub.status, 200);
    for (const patch of calls.filter((c) => c.method === "PATCH")) {
      assert.equal(patch.url.searchParams.get("select"), null);
    }
  });

  it("maps foreign key violations on penalties, scripts, and judge conflicts to 404", async () => {
    installFakeSupabase((c) => {
      if (c.method === "GET" && c.path.includes("/rest/v1/script_scores")) return { body: [] };
      if (c.method === "POST") return { status: 409, body: { code: "23503", message: "violates foreign key constraint" } };
    });

    const pen = await adminPenaltyPost(
      req("/api/admin/penalties", { admin: true, json: { teamId: TEAM, code: "identity_leak", points: 3, reason: "Name in PDF" } }),
      ctx({}),
    );
    assert.equal(pen.status, 404);

    const scr = await adminScriptsPost(
      req("/api/admin/scripts", { admin: true, json: { teamId: TEAM, requirementsWorking: 4, requirementsTotal: 5 } }),
      ctx({}),
    );
    assert.equal(scr.status, 404);

    const jput = await adminJudgePut(
      req("/api/admin/judges", { admin: true, json: { judgeId: JDG, teamId: TEAM, reason: "Advisor" } }),
      ctx({}),
    );
    assert.equal(jput.status, 404);
  });

  it("deduplicates conflicts on judge creation", async () => {
    const calls = installFakeSupabase((c) => {
      if (c.path.includes("/rest/v1/judges") && c.method === "POST") return { body: [{ id: JDG }] };
      if (c.path.includes("/rest/v1/judge_conflicts") && c.method === "POST") return { body: [{ judge_id: JDG }] };
    });
    const res = await adminJudgePost(
      req("/api/admin/judges", {
        admin: true,
        json: {
          name: "Dr. Rao",
          role: "judge",
          tracks: ["Beginner"],
          conflicts: [{ teamId: TEAM, reason: "Mentor" }, { teamId: TEAM, reason: "Duplicate" }],
        },
      }),
      ctx({}),
    );
    assert.equal(res.status, 201);
    assert.equal(calls.filter((c) => c.path.includes("/judge_conflicts")).length, 1);
  });
});

describe("additional portal, judging and admin end-to-end coverage", () => {
  it("injects CSV canaries instead of Markdown footers even when CSV has text/plain MIME", async () => {
    setNow(1);
    const probId = "prob_" + "3".repeat(20);
    const csvBody = ["id,val"].concat(Array.from({ length: 15 }, (_, i) => `${i},${(i + 1.12345).toFixed(5)}`)).join("\n");
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      if (url.pathname.includes("/rest/v1/team_members")) return Response.json([memberRow()]);
      if (url.pathname.includes("/rest/v1/problem_files")) {
        return Response.json([{ id: probId, name: "dataset.csv", content_type: "text/plain", object_path: "Beginner/dataset.csv", size_bytes: csvBody.length }]);
      }
      if (url.pathname.includes("/rest/v1/download_log")) return Response.json([{ id: 1 }]);
      if (url.pathname.includes("/storage/v1/object/problems/")) return new Response(csvBody, { status: 200 });
      throw new Error(`Unexpected fetch: ${url.pathname}`);
    }) as typeof fetch;

    const res = await portalProblemFileGet(req(`/api/portal/problems/${probId}`, { key: KEY }), ctx({ id: probId }));
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(!text.includes("Team ID:"), "CSV must not get Markdown footer");
    assert.notEqual(text, csvBody);
  });

  it("blocks selecting a failed prediction and allows selecting a scored one", async () => {
    setNow(5);
    const predId = "pred_" + "a".repeat(20);
    let evalStatus = "failed";
    installFakeSupabase((c) => {
      if (c.path.includes("/rest/v1/team_members")) return { body: [memberRow("Advanced")] };
      if (c.path.includes("/rest/v1/prediction_uploads") && c.method === "GET") {
        return { body: [{ id: predId, eval_status: evalStatus }] };
      }
      if (c.path.includes("/rest/v1/prediction_uploads") && c.method === "PATCH") {
        return { body: [{ id: predId }] };
      }
    });

    const bad = await portalPredictionSelectPost(req("/api/portal/predictions/select", { key: KEY, json: { id: predId } }), ctx({}));
    assert.equal(bad.status, 422);

    evalStatus = "scored";
    const ok = await portalPredictionSelectPost(req("/api/portal/predictions/select", { key: KEY, json: { id: predId } }), ctx({}));
    assert.equal(ok.status, 200);
  });

  it("rejects malformed object paths with query/whitespace characters", async () => {
    setNow(42);
    installFakeSupabase((c) => {
      if (c.path.includes("/rest/v1/team_members")) return { body: [memberRow()] };
    });
    const badItem = await portalSubmissionItemPost(
      req("/api/portal/submission/items", { key: KEY, json: { item: "report", objectPath: `${TEAM}/report/id?x=1` } }),
      ctx({}),
    );
    assert.equal(badItem.status, 422);

    const badProb = await adminProblemsPost(
      req("/api/admin/problems", { admin: true, json: { track: "Beginner", kind: "statement", name: "spec.md", objectPath: "/Beginner/spec.md" } }),
      ctx({}),
    );
    assert.equal(badProb.status, 422);
  });

  it("excludes conflicted teams from judge assignments and finalists lists", async () => {
    const otherTeam = "reg_" + "9".repeat(20);
    installFakeSupabase((c) => {
      if (c.path.includes("/rest/v1/judges")) return { body: [{ id: JDG, name: "J", role: "grand_jury", tracks: [] }] };
      if (c.path.includes("/rest/v1/judge_assignments")) {
        return {
          body: [
            {
              team_id: TEAM, stage: 2, third: false,
              teams: { team_code: "B-001", team_name: "ConflictTeam", track: "Beginner", team_members: [] },
            },
            {
              team_id: otherTeam, stage: 2, third: false,
              teams: { team_code: "B-002", team_name: "CleanTeam", track: "Beginner", team_members: [{ position: 0, full_name: "Dev", college: "IIST" }] },
            },
          ],
        };
      }
      if (c.path.includes("/rest/v1/score_sheets")) return { body: [] };
      if (c.path.includes("/rest/v1/judge_conflicts")) return { body: [{ team_id: TEAM }] };
    });

    const assign = await judgeAssignmentsGet(req("/api/judge/assignments", { key: JKEY }), ctx({}));
    assert.equal(assign.status, 200);
    assert.deepEqual(((await assign.json()) as any).data.assignments.map((a: any) => a.teamCode), ["B-002"]);

    const fin = await judgeFinalistsGet(req("/api/judge/finalists", { key: JKEY }), ctx({}));
    assert.equal(fin.status, 200);
    assert.deepEqual(((await fin.json()) as any).data.finalists.map((f: any) => f.teamCode), ["B-002"]);
  });

  it("covers portal me, submission, leaderboard and feedback endpoints", async () => {
    setNow(42);
    installFakeSupabase((c) => {
      if (c.path.includes("/rest/v1/team_members") && c.url.searchParams.get("portal_token_hash")) {
        return { body: [memberRow("Advanced")] };
      }
      if (c.path.includes("/rest/v1/checkpoints")) return { body: [{ n: 1, recorded_at: "2026-12-14T15:00:00Z" }] };
      if (c.path.includes("/rest/v1/submission_items")) return { body: [] };
      if (c.path.includes("/rest/v1/prediction_uploads")) {
        return {
          body: [
            { id: "pred_1", sha256: "h1", size_bytes: 100, selected: true, uploaded_at: "2026-12-14T15:00:00Z", team_id: TEAM, public_score: 0.91, teams: { team_code: "A-001", team_name: "Orbital Originals", disqualified: false } },
          ],
        };
      }
      if (c.path.includes("/rest/v1/repo_snapshots")) return { body: [] };
      if (c.path.includes("/rest/v1/team_members")) return { body: [{ final_declaration_signed_at: null }] };
      if (c.path.includes("/rest/v1/submission_manifests")) return { body: [] };
      if (c.path.includes("/rest/v1/results")) {
        return { body: [{ phase: "final", stage1: 80, stage2: 85, final: 82, rank: 1, detail: { penalties: [], criterionMeans: { technical_depth: 22 } } }] };
      }
      if (c.path.includes("/rest/v1/score_sheets")) {
        return { body: [{ scores: { technical_depth: 22 }, justifications: { technical_depth: "Solid" }, comment: "Well done" }] };
      }
    });

    const me = await portalMeGet(req("/api/portal/me", { key: KEY }), ctx({}));
    assert.equal(me.status, 200);
    assert.equal(((await me.json()) as any).data.team.code, "A-001");

    const sub = await portalSubmissionGet(req("/api/portal/submission", { key: KEY }), ctx({}));
    assert.equal(sub.status, 200);
    assert.equal(((await sub.json()) as any).data.window.open, true);

    const lb = await portalLeaderboardGet(req("/api/portal/leaderboard", { key: KEY }), ctx({}));
    assert.equal(lb.status, 200);
    assert.equal(((await lb.json()) as any).data.leaderboard[0].you, true);

    const fb = await portalFeedbackGet(req("/api/portal/feedback", { key: KEY }), ctx({}));
    assert.equal(fb.status, 200);
    assert.equal(((await fb.json()) as any).data.comments[0].judge, "Judge 1");
  });

  it("covers snapshots, close, stage0, score-corrections, appeals, ledger, leak-trace, problems & key reissue", async () => {
    setNow(50);
    const appId = "app_" + "4".repeat(20);
    const probId = "prob_" + "5".repeat(20);
    const csvOrig = ["id,x"].concat(Array.from({ length: 15 }, (_, i) => `${i},${(i + 1.12345).toFixed(5)}`)).join("\n");

    const calls = installFakeSupabase((c) => {
      if (c.path.includes("/rest/v1/repo_snapshots") && c.method === "GET") return { body: [] };
      if (c.path.includes("/rest/v1/repo_snapshots") && c.method === "POST") return { body: [{ team_id: TEAM }] };
      if (c.path.includes("/rest/v1/teams") && c.method === "GET") {
        return { body: [{ id: TEAM, team_code: "B-001", track: "Beginner", grace_granted: false }] };
      }
      if (c.path.includes("/rest/v1/submission_manifests") && c.method === "GET") return { body: [] };
      if (c.path.includes("/rest/v1/submission_manifests") && c.method === "POST") return { body: [{ team_id: TEAM }] };
      if (c.path.includes("/rest/v1/submission_items")) return { body: [] };
      if (c.path.includes("/rest/v1/team_members") && c.url.searchParams.get("position")) {
        return { body: [{ position: 0, full_name: "Asha", email: "asha@iist.ac.in" }] };
      }
      if (c.path.includes("/rest/v1/team_members") && c.method === "GET") return { body: [{ final_declaration_signed_at: null }] };
      if (c.path.includes("/rest/v1/team_members") && c.method === "PATCH") return { body: [{ id: 1 }] };
      if (c.path.includes("/rest/v1/stage0_results") && c.method === "GET") return { body: [] };
      if (c.path.includes("/rest/v1/stage0_results") && c.method === "POST") return { body: [{ team_id: TEAM }] };
      if (c.path.includes("/rest/v1/score_sheets")) return { body: [{ stage: 1, teams: { track: "Beginner" } }] };
      if (c.path.endsWith("/rpc/correct_score_sheet")) return { body: { id: 9, hash: "h9" } };
      if (c.path.endsWith("/rpc/ledger_append")) return { body: { id: 1, hash: "h1" } };
      if (c.path.endsWith("/rpc/verify_ledger")) return { body: null };
      if (c.path.includes("/rest/v1/ledger")) return { body: [{ id: 1, kind: "submission_manifest", hash: "h1" }] };
      if (c.path.includes("/rest/v1/appeals") && c.method === "GET") return { body: [] };
      if (c.path.includes("/rest/v1/appeals") && c.method === "PATCH") return { body: [{ id: appId }] };
      if (c.path.includes("/rest/v1/problem_files")) return { body: [{ id: probId, object_path: "Beginner/d.csv", track: "Beginner" }] };
      if (c.path.includes("/storage/v1/object/problems/")) return { body: csvOrig };
    });

    const snap = await adminSnapshotsPost(
      req("/api/admin/submissions/snapshots", {
        admin: true,
        json: { snapshots: [{ teamId: TEAM, repoUrl: "https://github.com/org/repo", commitSha: "abcdef1", facts: { hasReadme: true, hasEnvFile: true } }] },
      }),
      ctx({}),
    );
    assert.equal(snap.status, 200);
    assert.equal(((await snap.json()) as any).data.saved, 1);

    const closed = await adminSubmissionsClosePost(req("/api/admin/submissions/close", { admin: true, json: {} }), ctx({}));
    assert.equal(closed.status, 200);
    assert.equal(((await closed.json()) as any).data.frozen, 1);

    const s0 = await adminStage0Post(
      req("/api/admin/stage0", {
        admin: true,
        json: { teams: [{ teamId: TEAM, commits: [{ at: new Date(Date.now() - 40 * 3600_000).toISOString(), additions: 50 }], maxSimilarityPercent: 0, copiedReportText: false }] },
      }),
      ctx({}),
    );
    assert.equal(s0.status, 200);

    const corrScores: Record<string, number> = {};
    const corrJust: Record<string, string> = {};
    for (const k of ["problem_understanding", "domain_accuracy", "innovation", "code_quality", "demo_communication", "process_learning"]) {
      corrScores[k] = 5;
      corrJust[k] = "checked";
    }
    corrScores.technical_implementation = 7;
    corrJust.technical_implementation = "corrected";

    const corr = await adminScoreCorrectionPost(
      req("/api/admin/score-corrections", {
        admin: true,
        json: { sheetId: 1, scores: corrScores, justifications: corrJust, reason: "Arithmetic fix" },
      }),
      ctx({}),
    );
    assert.equal(corr.status, 200);

    assert.equal((await adminAppealsGet(req("/api/admin/appeals?status=bad", { admin: true }), ctx({}))).status, 400);
    assert.equal((await adminAppealsGet(req("/api/admin/appeals?status=open", { admin: true }), ctx({}))).status, 200);
    assert.equal((await adminAppealPatch(req(`/api/admin/appeals/${appId}`, { method: "PATCH", admin: true, json: { status: "upheld", note: "Confirmed" } }), ctx({ id: appId }))).status, 200);

    const led = await adminLedgerGet(req("/api/admin/ledger", { admin: true }), ctx({}));
    assert.equal(led.status, 200);
    assert.equal(((await led.json()) as any).data.intact, true);

    assert.equal((await adminProblemsGet(req("/api/admin/problems?track=Bad", { admin: true }), ctx({}))).status, 400);
    assert.equal((await adminProblemsGet(req("/api/admin/problems?track=Beginner", { admin: true }), ctx({}))).status, 200);

    const leak = await adminLeakTracePost(req("/api/admin/leak-trace", { admin: true, json: { fileId: probId, leakedCsv: csvOrig } }), ctx({}));
    assert.equal(leak.status, 200);

    const reissue = await adminReissueKeyPost(
      req(`/api/admin/registrations/${TEAM}/members/0/reissue-key`, { admin: true, json: {} }),
      ctx({ id: TEAM, index: "0" }),
    );
    assert.equal(reissue.status, 200);
    assert.match(((await reissue.json()) as any).data.manualKeys[0].key, /^kmp_/);
    assert.ok(calls.some((c) => c.path.includes("/audit_log")));
  });
});


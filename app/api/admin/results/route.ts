import { requireAdmin } from "@/lib/admin";
import { JUDGING } from "@/lib/admin-routes";
import { errorResponse, okResponse } from "@/lib/http";
import { route } from "@/lib/route";
import { TRACKS } from "@/lib/rules";
import { selectRows } from "@/lib/supabase";

/** GET /api/admin/results?track= : stored results with team identities (OC only). */
export const GET = route("admin-results", async (request) => {
  const auth = await requireAdmin(request, JUDGING);
  if (!auth.ok) return auth.response;
  const track = new URL(request.url).searchParams.get("track");
  if (track && !(TRACKS as readonly string[]).includes(track)) {
    return errorResponse(400, "Unknown track.");
  }
  const { rows } = await selectRows("results", {
    select: "team_id,track,stage1,stage2,final,rank,finalist,phase,audit_passed,detail,teams(team_code,team_name)",
    order: "rank.asc.nullslast",
    ...(track ? { track: `eq.${track}` } : {}),
  });
  return okResponse({ results: rows });
});

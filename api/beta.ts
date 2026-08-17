import { handleApiError, requireUser, type ApiRequest, type ApiResponse } from "./lib/supabase-auth.js";

async function count(supabase: any, table: string, configure?: (query: any) => any) {
  let query = supabase.from(table).select("id", { count: "exact", head: true });
  if (configure) query = configure(query);
  const { count: result, error } = await query;
  if (error) throw error;
  return result ?? 0;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }
    const { supabase } = await requireUser(req);
    const [folders, notes, t, f, common, saved] = await Promise.all([
      count(supabase, "folders"),
      count(supabase, "notes"),
      count(supabase, "beta_analysis_usage", (query) => query.eq("analysis_type", "T")),
      count(supabase, "beta_analysis_usage", (query) => query.eq("analysis_type", "F")),
      count(supabase, "beta_analysis_usage", (query) => query.eq("analysis_type", "common")),
      count(supabase, "analysis_history", (query) => query.eq("is_saved", true)),
    ]);
    return res.status(200).json({ activity: { folders, notes, T: t, F: f, common, saved } });
  } catch (error) {
    return handleApiError(error, res, "이용 현황을 불러오지 못했습니다.");
  }
}

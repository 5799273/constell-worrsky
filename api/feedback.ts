import { handleApiError, requireUser, type ApiRequest, type ApiResponse } from "./lib/supabase-auth.js";

const TYPES = new Set(["T", "F", "common"]);
const REASONS = new Set([
  "내 상황을 잘 이해했어요", "실제로 도움이 됐어요", "내용이 구체적이었어요",
  "너무 뻔한 답이었어요", "내 상황과 맞지 않았어요", "기록의 맥락을 잘 반영하지 못했어요",
]);
const MAX_COMMENT_LENGTH = 5_000;

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const { userId, supabase } = await requireUser(req);
    const queryId = Array.isArray(req.query?.analysisId) ? req.query?.analysisId[0] : req.query?.analysisId;

    if (req.method === "GET") {
      if (!queryId) return res.status(400).json({ error: "조언 결과를 확인해주세요." });
      const { data, error } = await supabase.from("analysis_feedback")
        .select("rating_score,reasons,comment").eq("evaluation_key", `${userId}:${queryId}`).maybeSingle();
      if (error) throw error;
      return res.status(200).json(data ? { rating: data.rating_score, reasons: data.reasons ?? [], comment: data.comment ?? "" } : null);
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const analysisId = typeof body.analysisId === "string" ? body.analysisId : "";
    const analysisType = typeof body.analysisType === "string" ? body.analysisType : "";
    const rating = typeof body.rating === "number" ? body.rating : 0;
    const reasons = Array.isArray(body.reasons) ? body.reasons.filter((item): item is string => typeof item === "string") : [];
    const comment = typeof body.comment === "string" ? body.comment.trim() : "";
    if (!analysisId || !TYPES.has(analysisType) || !Number.isInteger(rating) || rating < 1 || rating > 5 || reasons.some((item) => !REASONS.has(item)) || comment.length > MAX_COMMENT_LENGTH) {
      return res.status(400).json({ error: "평가 내용을 확인해주세요." });
    }

    const { data: analysis, error: analysisError } = await supabase.from("analysis_history").select("id,type").eq("id", analysisId).single();
    if (analysisError || !analysis || analysis.type !== analysisType) return res.status(400).json({ error: "조언 결과를 확인해주세요." });

    const { data, error } = await supabase.from("analysis_feedback").upsert({
      user_id: userId, analysis_id: analysisId, analysis_type: analysisType,
      rating: rating >= 4 ? "helpful" : rating === 3 ? "unclear" : "not_helpful",
      rating_score: rating, reasons,
      selected_paragraphs: reasons.length > 0 ? reasons : ["선택 항목 없음"],
      comment: comment || null, evaluation_key: `${userId}:${analysisId}`, updated_at: new Date().toISOString(),
    }, { onConflict: "evaluation_key" }).select("id,created_at").single();
    if (error || !data) throw error ?? new Error("Feedback upsert failed");
    return res.status(200).json(data);
  } catch (error) {
    return handleApiError(error, res, "평가를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
  }
}

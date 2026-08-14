import { randomUUID } from "node:crypto";
import { handleApiError, requireUser, type ApiRequest, type ApiResponse } from "./lib/supabase-auth.js";

const TYPES = new Set(["T", "F", "common"]);
const RATINGS = new Set(["helpful", "unclear", "not_helpful"]);
const MAX_PARAGRAPHS = 30;
const MAX_PARAGRAPH_LENGTH = 4_000;
const MAX_COMMENT_LENGTH = 5_000;

function cleanParagraphs(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PARAGRAPHS) return null;
  const paragraphs = value.map((item) => typeof item === "string" ? item.trim() : "");
  if (paragraphs.some((item) => !item || item.length > MAX_PARAGRAPH_LENGTH)) return null;
  return paragraphs;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { userId, supabase } = await requireUser(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const analysisId = typeof body.analysisId === "string" ? body.analysisId : "";
    const analysisType = typeof body.analysisType === "string" ? body.analysisType : "";
    const rating = typeof body.rating === "string" ? body.rating : "";
    const selectedParagraphs = cleanParagraphs(body.selectedParagraphs);
    const comment = typeof body.comment === "string" ? body.comment.trim() : "";

    if (!analysisId || !TYPES.has(analysisType) || !RATINGS.has(rating) || !selectedParagraphs || comment.length > MAX_COMMENT_LENGTH) {
      return res.status(400).json({ error: "피드백 내용을 확인해주세요." });
    }

    const { data: analysis, error: analysisError } = await supabase
      .from("analysis_history")
      .select("id,type")
      .eq("id", analysisId)
      .single();
    if (analysisError || !analysis || analysis.type !== analysisType) {
      return res.status(400).json({ error: "분석 결과를 확인해주세요." });
    }

    const { data, error } = await supabase.from("analysis_feedback").insert({
      id: randomUUID(),
      user_id: userId,
      analysis_id: analysisId,
      analysis_type: analysisType,
      rating,
      selected_paragraphs: selectedParagraphs,
      comment: comment || null,
    }).select("id,created_at").single();
    if (error || !data) throw error ?? new Error("Feedback insert failed");

    return res.status(201).json(data);
  } catch (error) {
    return handleApiError(error, res, "피드백을 보내지 못했습니다. 잠시 후 다시 시도해주세요.");
  }
}


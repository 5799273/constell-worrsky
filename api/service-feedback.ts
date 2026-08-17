import { randomUUID } from "node:crypto";
import { handleApiError, requireUser, type ApiRequest, type ApiResponse } from "./lib/supabase-auth.js";

const TYPES = new Set(["오류 / 불편", "사용성", "기능 제안", "기타"]);

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }
    const { userId, supabase } = await requireUser(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const feedbackType = typeof body.feedbackType === "string" ? body.feedbackType : "";
    const rating = typeof body.rating === "number" ? body.rating : 0;
    const content = typeof body.content === "string" ? body.content.trim() : "";
    const route = typeof body.route === "string" ? body.route.slice(0, 500) : "";
    const deviceType = typeof body.deviceType === "string" ? body.deviceType.slice(0, 30) : "unknown";
    const viewport = typeof body.viewport === "string" ? body.viewport.slice(0, 50) : "unknown";
    const userAgent = typeof body.userAgent === "string" ? body.userAgent.slice(0, 1000) : "";
    if (!TYPES.has(feedbackType) || !Number.isInteger(rating) || rating < 1 || rating > 5 || !content || content.length > 5000) {
      return res.status(400).json({ error: "의견 내용을 확인해주세요." });
    }
    const { data, error } = await supabase.from("service_feedback").insert({
      id: randomUUID(), user_id: userId, feedback_type: feedbackType, rating, content,
      route, device_type: deviceType, viewport, user_agent: userAgent,
    }).select("id,created_at").single();
    if (error || !data) throw error ?? new Error("Service feedback insert failed");
    return res.status(201).json(data);
  } catch (error) {
    return handleApiError(error, res, "의견을 보내지 못했습니다. 잠시 후 다시 시도해주세요.");
  }
}

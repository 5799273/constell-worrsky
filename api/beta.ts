import { randomUUID } from "node:crypto";
import { ANALYSIS_SELECT, decryptAnalysis } from "./analysis-history";
import { betaSourceSignature, type SourceNote } from "./lib/beta-source";
import { decryptText, fieldAad, getOrCreateUserDek } from "./lib/encryption";
import { handleApiError, requireUser, type ApiRequest, type ApiResponse } from "./lib/supabase-auth";

type Stage = "instant" | "day7" | "day14";
const TYPES = new Set(["T", "F", "common"]);
const DEFAULT_MODEL = "gpt-5.6-luna";
const DAY = 86_400_000;

function score(value: unknown, max = 100) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max && (max === 10 || value % 10 === 0) ? value : null;
}
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function min(value: unknown, length: number, allowNone = false) {
  const valueText = text(value);
  return (allowNone && valueText === "없음") || valueText.length >= length ? valueText : null;
}
function betaTiming(startedAt: string, now = Date.now()) {
  const started = Date.parse(startedAt);
  const elapsed = Math.max(0, now - started);
  return { day: Math.min(14, Math.floor(elapsed / DAY) + 1), day7Available: elapsed >= 6 * DAY && elapsed < 13 * DAY, day14Available: elapsed >= 13 * DAY };
}

async function ensureParticipant(supabase: any, userId: string) {
  const { data: found, error } = await supabase.from("beta_participants").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (found) return found;
  const started = new Date();
  const { data, error: insertError } = await supabase.from("beta_participants").insert({
    user_id: userId, beta_started_at: started.toISOString(), beta_ends_at: new Date(started.getTime() + 14 * DAY).toISOString(),
  }).select("*").single();
  if (insertError || !data) throw insertError ?? new Error("Beta enrollment failed");
  return data;
}

async function count(supabase: any, table: string, configure?: (query: any) => any) {
  let query = supabase.from(table).select("id", { count: "exact", head: true });
  if (configure) query = configure(query);
  const { count: result, error } = await query;
  if (error) throw error;
  return result ?? 0;
}

async function sharedSnapshot(supabase: any, userId: string, analysisId: string) {
  const dek = await getOrCreateUserDek(supabase, userId);
  const { data: analysis, error } = await supabase.from("analysis_history").select(ANALYSIS_SELECT).eq("id", analysisId).single();
  if (error || !analysis) throw new Error("SHARE_UNAVAILABLE");
  const { data: source, error: sourceError } = await supabase.from("beta_analysis_sources").select("note_ids,source_signature").eq("analysis_id", analysisId).single();
  if (sourceError || !source) throw new Error("SHARE_UNAVAILABLE");
  const { data: rows, error: notesError } = await supabase.from("notes")
    .select("id,user_id,folder_id,text_ciphertext,text_nonce,text_auth_tag,encryption_key_version,created_at")
    .in("id", source.note_ids).order("created_at", { ascending: true });
  if (notesError || !rows || rows.length !== source.note_ids.length) throw new Error("SHARE_UNAVAILABLE");
  const notes: SourceNote[] = rows.map((row: any) => {
    if (!row.text_ciphertext || !row.text_nonce || !row.text_auth_tag || !row.encryption_key_version) throw new Error("SHARE_UNAVAILABLE");
    return {
      id: row.id,
      createdAt: row.created_at,
      text: decryptText({ ciphertext: row.text_ciphertext, nonce: row.text_nonce, authTag: row.text_auth_tag, keyVersion: row.encryption_key_version }, dek, fieldAad(userId, "notes", row.id, "text", row.encryption_key_version)),
    };
  });
  if (betaSourceSignature(notes) !== source.source_signature) throw new Error("SHARE_UNAVAILABLE");
  return { analysis, content: decryptAnalysis(analysis, dek).content, notes };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const { userId, supabase } = await requireUser(req);
    const participant = await ensureParticipant(supabase, userId);
    const timing = betaTiming(participant.beta_started_at);

    if (req.method === "GET") {
      const [folders, notes, t, f, common, saved, feedbackResult, analysesResult] = await Promise.all([
        count(supabase, "folders", (q) => q.gte("created_at", participant.beta_started_at)), count(supabase, "notes", (q) => q.gte("created_at", participant.beta_started_at)),
        count(supabase, "beta_analysis_usage", (q) => q.eq("analysis_type", "T").gte("created_at", participant.beta_started_at)),
        count(supabase, "beta_analysis_usage", (q) => q.eq("analysis_type", "F").gte("created_at", participant.beta_started_at)),
        count(supabase, "beta_analysis_usage", (q) => q.eq("analysis_type", "common").gte("created_at", participant.beta_started_at)),
        count(supabase, "analysis_history", (q) => q.eq("is_saved", true)),
        supabase.from("beta_feedback").select("id,feedback_stage,analysis_id,created_at").order("created_at", { ascending: false }),
        supabase.from("analysis_history").select("id,folder_id,type,created_at,prompt_version").gte("created_at", participant.beta_started_at).order("created_at", { ascending: false }),
      ]);
      if (feedbackResult.error) throw feedbackResult.error;
      if (analysesResult.error) throw analysesResult.error;
      return res.status(200).json({
        participant: { ...participant, ...timing, daysRemaining: Math.max(0, Math.ceil((Date.parse(participant.beta_ends_at) - Date.now()) / DAY)) },
        activity: { folders, notes, T: t, F: f, common, saved },
        feedback: feedbackResult.data ?? [], analyses: analysesResult.data ?? [],
      });
    }

    if (req.method !== "POST") { res.setHeader("Allow", "GET, POST"); return res.status(405).json({ error: "Method not allowed" }); }
    const [t, f, common] = await Promise.all([
      count(supabase, "beta_analysis_usage", (q) => q.eq("analysis_type", "T").gte("created_at", participant.beta_started_at)),
      count(supabase, "beta_analysis_usage", (q) => q.eq("analysis_type", "F").gte("created_at", participant.beta_started_at)),
      count(supabase, "beta_analysis_usage", (q) => q.eq("analysis_type", "common").gte("created_at", participant.beta_started_at)),
    ]);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const stage = body.stage as Stage;
    if (!(["instant", "day7", "day14"] as string[]).includes(stage)) return res.status(400).json({ error: "피드백 단계를 확인해주세요." });
    const analysisId = typeof body.analysisId === "string" ? body.analysisId : null;
    const analysisType = typeof body.analysisType === "string" && TYPES.has(body.analysisType) ? body.analysisType : null;
    const share = body.shareAnalysisData === true;
    const payload: Record<string, unknown> = { id: randomUUID(), user_id: userId, feedback_stage: stage, analysis_id: analysisId, analysis_type: analysisType, share_analysis_data: share };

    if (stage === "instant") {
      const agreement = score(body.agreementPercent), desired = score(body.desiredAnswerPercent);
      if (!analysisId || !analysisType || agreement === null || desired === null) return res.status(400).json({ error: "평가 점수를 확인해주세요." });
      payload.agreement_percent = agreement; payload.desired_answer_percent = desired; payload.reason = text(body.reason) || null;
    } else if (stage === "day7") {
      if (!timing.day7Available || participant.day7_completed) return res.status(409).json({ error: "Day 7 피드백 제출 시점이 아니거나 이미 제출했습니다." });
      const desired = score(body.desiredAnswerPercent), understood = score(body.understoodPercent);
      if (!analysisId || !analysisType || desired === null || understood === null || !min(body.likedText, 30) || !min(body.improvementText, 30) || !min(body.misunderstoodText, 30)) return res.status(400).json({ error: "필수 항목과 최소 글자 수를 확인해주세요." });
      Object.assign(payload, { desired_answer_percent: desired, understood_percent: understood, liked_text: text(body.likedText), improvement_text: text(body.improvementText), misunderstood_text: text(body.misunderstoodText) });
    } else {
      if (!timing.day14Available || participant.day14_completed) return res.status(409).json({ error: "Day 14 피드백 제출 시점이 아니거나 이미 제출했습니다." });
      const understood = score(body.understoodPercent), recommendation = score(body.recommendationScore, 10);
      if (understood === null || recommendation === null || !min(body.likedText, 50) || !min(body.improvementText, 50) || !min(body.misunderstoodText, 30, true) || !min(body.reuseSituationText, 30) || !min(body.continuedUseText, 30) || (text(body.comparisonText) && !min(body.comparisonText, 30))) return res.status(400).json({ error: "필수 항목과 최소 글자 수를 확인해주세요." });
      if (t > 0 && score(body.tSatisfactionPercent) === null || f > 0 && score(body.fSatisfactionPercent) === null || common > 0 && score(body.commonSatisfactionPercent) === null) return res.status(400).json({ error: "사용한 기능의 만족도를 입력해주세요." });
      Object.assign(payload, { understood_percent: understood, recommendation_score: recommendation, t_satisfaction_percent: t > 0 ? score(body.tSatisfactionPercent) : null, f_satisfaction_percent: f > 0 ? score(body.fSatisfactionPercent) : null, common_satisfaction_percent: common > 0 ? score(body.commonSatisfactionPercent) : null, liked_text: text(body.likedText), improvement_text: text(body.improvementText), misunderstood_text: text(body.misunderstoodText), comparison_text: min(body.comparisonText, 30) ?? null, reuse_situation_text: text(body.reuseSituationText), continued_use_text: text(body.continuedUseText), one_line_description: text(body.oneLineDescription) || null });
    }

    if (analysisId) {
      const { data: owned, error } = await supabase.from("analysis_history").select("id,folder_id,type,prompt_version").eq("id", analysisId).single();
      if (error || !owned || (analysisType && owned.type !== analysisType)) return res.status(400).json({ error: "선택한 분석을 확인해주세요." });
      payload.folder_id = owned.folder_id; payload.analysis_type = owned.type; payload.prompt_version = owned.prompt_version; payload.model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
      if (share) {
        const snapshot = await sharedSnapshot(supabase, userId, analysisId);
        payload.shared_notes = snapshot.notes; payload.shared_ai_response = snapshot.content;
      }
    } else if (share) return res.status(400).json({ error: "원문 공유에는 분석 선택이 필요합니다." });

    const { data, error } = await supabase.from("beta_feedback").insert(payload).select("id,feedback_stage,created_at").single();
    if (error || !data) throw error ?? new Error("Feedback insert failed");
    if (stage === "day7" || stage === "day14") {
      const { error: updateError } = await supabase.from("beta_participants").update({ [stage === "day7" ? "day7_completed" : "day14_completed"]: true }).eq("user_id", userId);
      if (updateError) throw updateError;
    }
    return res.status(201).json(data);
  } catch (error) {
    if (error instanceof Error && error.message === "SHARE_UNAVAILABLE") return res.status(409).json({ error: "분석 이후 메모가 변경되어 해당 분석의 원문을 정확히 공유할 수 없습니다. 공유 동의를 끄고 제출해주세요." });
    return handleApiError(error, res, "베타 피드백을 처리하지 못했습니다.");
  }
}

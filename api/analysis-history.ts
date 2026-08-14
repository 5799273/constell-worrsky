import { decryptText, fieldAad, getOrCreateUserDek } from "./lib/encryption";
import { handleApiError, requireUser, type ApiRequest, type ApiResponse } from "./lib/supabase-auth";

type AnalysisRow = {
  id: string;
  user_id: string;
  folder_id: string;
  type: "T" | "F" | "common";
  content_ciphertext: string | null;
  content_nonce: string | null;
  content_auth_tag: string | null;
  encryption_key_version: number | null;
  created_at: string;
  notes_signature: string | null;
  prompt_version: string | null;
  note_count: number | null;
  character_name: string | null;
  is_saved: boolean;
};

export function decryptAnalysis(row: AnalysisRow, dek: Buffer) {
  const encrypted = row.content_ciphertext && row.content_nonce && row.content_auth_tag && row.encryption_key_version
    ? { ciphertext: row.content_ciphertext, nonce: row.content_nonce, authTag: row.content_auth_tag, keyVersion: row.encryption_key_version }
    : null;
  if (!encrypted) throw new Error("Encrypted analysis is incomplete");
  const content = decryptText(encrypted, dek, fieldAad(row.user_id, "analysis_history", row.id, "content", encrypted.keyVersion));
  return {
    id: row.id,
    folder_id: row.folder_id,
    type: row.type,
    content,
    created_at: row.created_at,
    notes_signature: row.notes_signature,
    prompt_version: row.prompt_version,
    note_count: row.note_count,
    character_name: row.character_name,
    is_saved: row.is_saved,
  };
}

export const ANALYSIS_SELECT = "id, user_id, folder_id, type, content_ciphertext, content_nonce, content_auth_tag, encryption_key_version, created_at, notes_signature, prompt_version, note_count, character_name, is_saved";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const { userId, supabase } = await requireUser(req);
    const dek = await getOrCreateUserDek(supabase, userId);
    if (req.method === "GET") {
      const { data, error } = await supabase.from("analysis_history").select(ANALYSIS_SELECT).order("created_at", { ascending: true });
      if (error) throw error;
      return res.status(200).json({ analysisHistory: (data as AnalysisRow[]).map((row) => decryptAnalysis(row, dek)) });
    }
    if (req.method === "PATCH") {
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (typeof body.id !== "string" || typeof body.isSaved !== "boolean") return res.status(400).json({ error: "저장할 조언을 확인해주세요." });
      const { data, error } = await supabase.from("analysis_history").update({ is_saved: body.isSaved }).eq("id", body.id).select("id, is_saved").single();
      if (error || !data) throw error ?? new Error("Update failed");
      return res.status(200).json(data);
    }
    res.setHeader("Allow", "GET, PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return handleApiError(error, res, "저장된 조언 처리 중 오류가 발생했습니다.");
  }
}

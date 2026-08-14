import { randomUUID } from "node:crypto";
import { activeEncryptionKeyVersion, decryptText, encryptText, fieldAad, getOrCreateUserDek } from "./lib/encryption";
import { handleApiError, requireUser, type ApiRequest, type ApiResponse } from "./lib/supabase-auth";

type NoteRow = {
  id: string;
  user_id: string;
  folder_id: string;
  text_ciphertext: string | null;
  text_nonce: string | null;
  text_auth_tag: string | null;
  encryption_key_version: number | null;
  created_at: string;
  updated_at: string;
};

function encryptedValue(row: NoteRow) {
  if (!row.text_ciphertext || !row.text_nonce || !row.text_auth_tag || !row.encryption_key_version) return null;
  return { ciphertext: row.text_ciphertext, nonce: row.text_nonce, authTag: row.text_auth_tag, keyVersion: row.encryption_key_version };
}

function decryptNote(row: NoteRow, dek: Buffer) {
  const encrypted = encryptedValue(row);
  if (!encrypted) throw new Error("Encrypted note is incomplete");
  const text = decryptText(encrypted, dek, fieldAad(row.user_id, "notes", row.id, "text", encrypted.keyVersion));
  return { id: row.id, text, folder_id: row.folder_id, created_at: row.created_at, updated_at: row.updated_at };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const { userId, supabase } = await requireUser(req);
    const dek = await getOrCreateUserDek(supabase, userId);

    if (req.method === "GET") {
      const { data, error } = await supabase.from("notes")
        .select("id, user_id, folder_id, text_ciphertext, text_nonce, text_auth_tag, encryption_key_version, created_at, updated_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return res.status(200).json({ notes: (data as NoteRow[]).map((row) => decryptNote(row, dek)) });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    if (req.method === "POST") {
      if (typeof body.folderId !== "string" || typeof body.text !== "string" || !body.text.trim()) {
        return res.status(400).json({ error: "메모 내용을 확인해주세요." });
      }
      const id = randomUUID();
      const keyVersion = activeEncryptionKeyVersion();
      const encrypted = encryptText(body.text.trim(), dek, fieldAad(userId, "notes", id, "text", keyVersion), keyVersion);
      const createdAt = typeof body.createdAt === "string" && !Number.isNaN(Date.parse(body.createdAt)) ? body.createdAt : new Date().toISOString();
      const { data, error } = await supabase.from("notes").insert({
        id,
        user_id: userId,
        folder_id: body.folderId,
        text_ciphertext: encrypted.ciphertext,
        text_nonce: encrypted.nonce,
        text_auth_tag: encrypted.authTag,
        encryption_key_version: encrypted.keyVersion,
        created_at: createdAt,
      }).select("id, user_id, folder_id, text_ciphertext, text_nonce, text_auth_tag, encryption_key_version, created_at, updated_at").single();
      if (error || !data) throw error ?? new Error("Insert failed");
      return res.status(201).json({ note: decryptNote(data as NoteRow, dek) });
    }

    if (req.method === "PATCH") {
      if (typeof body.id !== "string") return res.status(400).json({ error: "메모를 확인해주세요." });
      const updates: Record<string, unknown> = {};
      if (typeof body.createdAt === "string" && !Number.isNaN(Date.parse(body.createdAt))) updates.created_at = body.createdAt;
      if (typeof body.text === "string" && body.text.trim()) {
        const keyVersion = activeEncryptionKeyVersion();
        const encrypted = encryptText(body.text.trim(), dek, fieldAad(userId, "notes", body.id, "text", keyVersion), keyVersion);
        Object.assign(updates, { text_ciphertext: encrypted.ciphertext, text_nonce: encrypted.nonce, text_auth_tag: encrypted.authTag, encryption_key_version: encrypted.keyVersion });
      }
      if (Object.keys(updates).length === 0) return res.status(400).json({ error: "수정할 내용을 확인해주세요." });
      const { data, error } = await supabase.from("notes").update(updates).eq("id", body.id)
        .select("id, user_id, folder_id, text_ciphertext, text_nonce, text_auth_tag, encryption_key_version, created_at, updated_at").single();
      if (error || !data) throw error ?? new Error("Update failed");
      return res.status(200).json({ note: decryptNote(data as NoteRow, dek) });
    }

    if (req.method === "DELETE") {
      const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === "string") : typeof body.id === "string" ? [body.id] : [];
      if (ids.length === 0) return res.status(400).json({ error: "삭제할 메모를 확인해주세요." });
      const { error } = await supabase.from("notes").delete().in("id", ids);
      if (error) throw error;
      return res.status(200).json({ deleted: ids.length });
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return handleApiError(error, res, "메모 처리 중 오류가 발생했습니다.");
  }
}

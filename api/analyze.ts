import { createHash, randomUUID } from "node:crypto";
import { AI_PROMPT_VERSION } from "../src/app/services/ai-config.js";
import { buildAnalysisInstructions, type AnalysisType } from "./lib/ai-prompt-v1.js";
import { ANALYSIS_SELECT, decryptAnalysis } from "./analysis-history.js";
import { activeEncryptionKeyVersion, decryptText, encryptText, fieldAad, getOrCreateUserDek } from "./lib/encryption.js";
import { handleApiError, requireUser, type ApiRequest, type ApiResponse } from "./lib/supabase-auth.js";

type AnalyzeNote = { id: string; text: string; folderId: string; createdAt: string };
type AnalyzeRequestBody = { folderId?: unknown; type?: unknown; characterPrompt?: unknown; characterName?: unknown };

const ALLOWED_TYPES = new Set<AnalysisType>(["common", "T", "F"]);
const DEFAULT_MODEL = "gpt-5.6-luna";

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function optionalText(value: unknown, maxLength: number): string | undefined {
  return isString(value) && value.trim() ? value.trim().slice(0, maxLength) : undefined;
}

function createInput(folderId: string, type: AnalysisType, notes: AnalyzeNote[]) {
  const timeline = notes.map((note, index) => `${index + 1}. ${note.createdAt}\n${note.text}`).join("\n\n");
  return [
    `분석 유형: ${type === "common" ? "패턴 찾기" : type === "T" ? "T적 조언" : "F적 조언"}`,
    `고민 폴더 ID: ${folderId}`,
    "아래는 선택된 하나의 고민 폴더의 전체 기록입니다. 작성 시각 순서와 메모 내용만 근거로 답변하세요.",
    "시간순 메모:",
    timeline,
  ].join("\n\n");
}

function analysisSignature(notes: AnalyzeNote[], characterName: string, characterPrompt: string) {
  return createHash("sha256").update(JSON.stringify({
    notes: notes.map(({ id, text, folderId, createdAt }) => ({ id, text, folderId, createdAt })),
    characterName,
    characterPrompt,
  })).digest("hex");
}

function extractOutputText(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const response = result as { output_text?: unknown; output?: unknown };
  if (isString(response.output_text) && response.output_text.trim()) return response.output_text.trim();
  if (!Array.isArray(response.output)) return null;
  const text = response.output.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) return [];
    return content.flatMap((part) => part && typeof part === "object" && isString((part as { text?: unknown }).text) ? [(part as { text: string }).text] : []);
  }).join("\n\n").trim();
  return text || null;
}

function stripMarkdown(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/^```[^\n]*\n?|```$/g, ""))
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = (req.body ?? {}) as AnalyzeRequestBody;
    if (!isString(body.folderId) || !ALLOWED_TYPES.has(body.type as AnalysisType)) return res.status(400).json({ error: "잘못된 분석 요청입니다." });
    const { userId, supabase } = await requireUser(req);
    const dek = await getOrCreateUserDek(supabase, userId);

    const { data: noteRows, error: notesError } = await supabase.from("notes")
      .select("id, user_id, folder_id, text_ciphertext, text_nonce, text_auth_tag, encryption_key_version, created_at")
      .eq("folder_id", body.folderId)
      .order("created_at", { ascending: true });
    if (notesError) throw notesError;
    const notes: AnalyzeNote[] = (noteRows ?? []).map((row) => {
      const encrypted = row.text_ciphertext && row.text_nonce && row.text_auth_tag && row.encryption_key_version
        ? { ciphertext: row.text_ciphertext, nonce: row.text_nonce, authTag: row.text_auth_tag, keyVersion: row.encryption_key_version }
        : null;
      if (!encrypted) throw new Error("Encrypted note is incomplete");
      const text = decryptText(encrypted, dek, fieldAad(userId, "notes", row.id, "text", encrypted.keyVersion));
      return { id: row.id, text, folderId: row.folder_id, createdAt: row.created_at };
    });
    if (notes.length === 0) return res.status(400).json({ error: "선택한 고민 폴더의 메모를 확인할 수 없습니다." });

    const characterName = optionalText(body.characterName, 80);
    const characterPrompt = optionalText(body.characterPrompt, 1000);
    const notesSignature = analysisSignature(notes, characterName ?? "", characterPrompt ?? "");
    const { data: cachedRows, error: cacheError } = await supabase.from("analysis_history")
      .select(ANALYSIS_SELECT)
      .eq("folder_id", body.folderId)
      .eq("type", body.type)
      .eq("notes_signature", notesSignature)
      .eq("prompt_version", AI_PROMPT_VERSION)
      .order("created_at", { ascending: false })
      .limit(1);
    if (cacheError) throw cacheError;
    if (cachedRows?.[0]) {
      await supabase.from("beta_analysis_usage").insert({ user_id: userId, analysis_id: cachedRows[0].id, analysis_type: body.type });
      return res.status(200).json({ ...decryptAnalysis(cachedRows[0], dek), cached: true });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "AI 분석 서비스가 아직 설정되지 않았습니다." });
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        store: false,
        instructions: buildAnalysisInstructions(body.type as AnalysisType, characterName, characterPrompt),
        input: createInput(body.folderId, body.type as AnalysisType, notes),
        max_output_tokens: 1200,
        text: { verbosity: "medium" },
      }),
    });
    if (!response.ok) return res.status(502).json({ error: "AI 분석을 지금 완료하지 못했습니다. 잠시 후 다시 시도해주세요." });
    const outputText = extractOutputText(await response.json());
    if (!outputText) return res.status(502).json({ error: "AI 분석 결과를 받지 못했습니다. 다시 시도해주세요." });

    const content = stripMarkdown(outputText);
    const id = randomUUID();
    const keyVersion = activeEncryptionKeyVersion();
    const encrypted = encryptText(content, dek, fieldAad(userId, "analysis_history", id, "content", keyVersion), keyVersion);
    const createdAt = new Date().toISOString();
    const { data, error } = await supabase.from("analysis_history").insert({
      id,
      user_id: userId,
      folder_id: body.folderId,
      type: body.type,
      content_ciphertext: encrypted.ciphertext,
      content_nonce: encrypted.nonce,
      content_auth_tag: encrypted.authTag,
      encryption_key_version: encrypted.keyVersion,
      notes_signature: notesSignature,
      prompt_version: AI_PROMPT_VERSION,
      note_count: notes.length,
      character_name: characterName ?? null,
      is_saved: false,
      created_at: createdAt,
    }).select(ANALYSIS_SELECT).single();
    if (error || !data) throw error ?? new Error("Analysis insert failed");
    await supabase.from("beta_analysis_usage").insert({ user_id: userId, analysis_id: id, analysis_type: body.type });
    return res.status(200).json({ ...decryptAnalysis(data, dek), cached: false });
  } catch (error) {
    return handleApiError(error, res, "AI 분석 서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.");
  }
}

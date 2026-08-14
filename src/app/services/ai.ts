import type { AnalysisType } from "../types";
import { secureApi } from "./secure-api";

export interface AnalyzeRequest {
  folderId: string;
  type: AnalysisType;
  characterPrompt?: string;
  characterName?: string;
}

export interface AnalyzeResponse {
  id: string;
  folderId: string;
  content: string;
  type: AnalysisType;
  analyzedAt: string;
  noteCount: number;
  notesSignature: string;
  promptVersion: string;
  isSaved: boolean;
  characterName?: string;
}

export function stripMarkdown(value: string) {
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

export async function analyzeNotes(req: AnalyzeRequest): Promise<AnalyzeResponse> {
  const payload = await secureApi<{
    id: string;
    folder_id: string;
    content: string;
    type: AnalysisType;
    created_at: string;
    note_count: number;
    notes_signature: string;
    prompt_version: string;
    is_saved: boolean;
    character_name?: string | null;
  }>("/api/analyze", {
    method: "POST",
    body: JSON.stringify(req),
  });
  if (!payload || typeof payload.content !== "string" || !payload.content.trim()) {
    throw new Error("AI 분석 결과를 확인할 수 없습니다. 다시 시도해주세요.");
  }
  return {
    id: payload.id,
    folderId: payload.folder_id,
    content: stripMarkdown(payload.content),
    type: payload.type,
    analyzedAt: payload.created_at,
    noteCount: payload.note_count,
    notesSignature: payload.notes_signature,
    promptVersion: payload.prompt_version,
    isSaved: payload.is_saved,
    characterName: payload.character_name ?? undefined,
  };
}

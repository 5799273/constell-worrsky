import type { AnalysisType } from "../types";
import { secureApi } from "./secure-api";

export type ApiNote = { id: string; text: string; folder_id: string; created_at: string; updated_at: string };
export type ApiAnalysis = {
  id: string;
  folder_id: string;
  type: AnalysisType;
  content: string;
  created_at: string;
  notes_signature: string | null;
  prompt_version: string | null;
  note_count: number | null;
  character_name: string | null;
  is_saved: boolean;
};

export async function loadEncryptedNotes(token?: string) {
  return secureApi<{ notes: ApiNote[] }>("/api/notes", {}, token);
}

export async function createEncryptedNote(folderId: string, text: string, createdAt: string) {
  return secureApi<{ note: ApiNote }>("/api/notes", { method: "POST", body: JSON.stringify({ folderId, text, createdAt }) });
}

export async function updateEncryptedNote(id: string, patch: { createdAt?: string; text?: string }) {
  return secureApi<{ note: ApiNote }>("/api/notes", { method: "PATCH", body: JSON.stringify({ id, ...patch }) });
}

export async function deleteEncryptedNotes(ids: string[]) {
  return secureApi<{ deleted: number }>("/api/notes", { method: "DELETE", body: JSON.stringify({ ids }) });
}

export async function loadEncryptedAnalysisHistory(token?: string) {
  return secureApi<{ analysisHistory: ApiAnalysis[] }>("/api/analysis-history", {}, token);
}

export async function updateAnalysisSavedState(id: string, isSaved: boolean) {
  return secureApi<{ id: string; is_saved: boolean }>("/api/analysis-history", { method: "PATCH", body: JSON.stringify({ id, isSaved }) });
}

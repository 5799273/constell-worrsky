import type { AnalysisType } from "../types";
import { secureApi } from "./secure-api";

export type BetaStatus = {
  participant: { beta_started_at: string; beta_ends_at: string; day7_completed: boolean; day14_completed: boolean; day: number; daysRemaining: number; day7Available: boolean; day14Available: boolean };
  activity: { folders: number; notes: number; T: number; F: number; common: number; saved: number };
  feedback: { id: string; feedback_stage: string; analysis_id: string | null; created_at: string }[];
  analyses: { id: string; folder_id: string; type: AnalysisType; created_at: string; prompt_version: string | null }[];
};

export function loadBetaStatus(token?: string) { return secureApi<BetaStatus>("/api/beta", {}, token); }
export function submitBetaFeedback(payload: Record<string, unknown>) { return secureApi<{ id: string; feedback_stage: string; created_at: string }>("/api/beta", { method: "POST", body: JSON.stringify(payload) }); }

import { secureApi } from "./secure-api";
import type { AnalysisType } from "../types";

export type AnalysisFeedbackRating = "helpful" | "unclear" | "not_helpful";

export function submitAnalysisFeedback(payload: {
  analysisId: string;
  analysisType: AnalysisType;
  rating: AnalysisFeedbackRating;
  selectedParagraphs: string[];
  comment: string;
}) {
  return secureApi<{ id: string; created_at: string }>("/api/feedback", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}


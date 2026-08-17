import { secureApi } from "./secure-api";
import type { AnalysisType } from "../types";

export const ADVICE_REASONS = [
  "내 상황을 잘 이해했어요",
  "실제로 도움이 됐어요",
  "내용이 구체적이었어요",
  "너무 뻔한 답이었어요",
  "내 상황과 맞지 않았어요",
  "기록의 맥락을 잘 반영하지 못했어요",
] as const;

export type AdviceFeedback = {
  rating: number;
  reasons: string[];
  comment: string;
};

export function loadAnalysisFeedback(analysisId: string) {
  return secureApi<AdviceFeedback | null>(`/api/feedback?analysisId=${encodeURIComponent(analysisId)}`);
}

export function submitAnalysisFeedback(payload: AdviceFeedback & { analysisId: string; analysisType: AnalysisType }) {
  return secureApi<{ id: string; created_at: string }>("/api/feedback", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type ServiceFeedbackType = "오류 / 불편" | "사용성" | "기능 제안" | "기타";

export function submitServiceFeedback(payload: {
  feedbackType: ServiceFeedbackType;
  rating: number;
  content: string;
  route: string;
  deviceType: string;
  viewport: string;
  userAgent: string;
}) {
  return secureApi<{ id: string; created_at: string }>("/api/service-feedback", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

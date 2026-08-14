import { useMemo, useState } from "react";
import type { AnalysisRecord } from "../types";
import { submitAnalysisFeedback, type AnalysisFeedbackRating } from "../services/feedback";

const RATINGS: { value: AnalysisFeedbackRating; label: string }[] = [
  { value: "helpful", label: "도움됐어요" },
  { value: "unclear", label: "애매해요" },
  { value: "not_helpful", label: "별로예요" },
];

export function AnalysisFeedback({ record }: { record: AnalysisRecord }) {
  const paragraphs = useMemo(() => record.content.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean), [record.content]);
  const [rating, setRating] = useState<AnalysisFeedbackRating | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  function toggleParagraph(index: number) {
    setSelected((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index]);
  }

  async function submit() {
    if (!rating || selected.length === 0 || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await submitAnalysisFeedback({
        analysisId: record.id,
        analysisType: record.type,
        rating,
        selectedParagraphs: [...selected].sort((a, b) => a - b).map((index) => paragraphs[index]),
        comment,
      });
      setSubmitted(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "피드백을 보내지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return <div style={{ marginTop: 20, padding: 14, border: "1px solid rgba(120,75,20,0.18)", borderRadius: 10, background: "rgba(255,255,255,0.28)", textAlign: "center", color: "#5B3512", fontSize: 12 }}>피드백을 보내주셔서 감사합니다.</div>;
  }

  return <section style={{ marginTop: 20, padding: 16, border: "1px solid rgba(120,75,20,0.18)", borderRadius: 10, background: "rgba(255,255,255,0.28)" }}>
    <h3 style={{ margin: "0 0 12px", color: "#32180A", fontSize: 14, fontFamily: "'Noto Serif KR', Georgia, serif" }}>이 답변, 어땠나요?</h3>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {RATINGS.map((item) => <button key={item.value} type="button" onClick={() => setRating(item.value)} aria-pressed={rating === item.value} style={{ minHeight: 40, padding: "8px 13px", borderRadius: 9, border: `1px solid ${rating === item.value ? "rgba(95,55,12,0.62)" : "rgba(120,75,20,0.22)"}`, background: rating === item.value ? "rgba(120,75,20,0.18)" : "rgba(255,255,255,0.34)", color: "#5B3512", cursor: "pointer", fontSize: 12 }}>{item.label}</button>)}
    </div>

    <div style={{ marginTop: 16, color: "#49351D", fontSize: 12, fontWeight: 700 }}>어떤 부분에 대한 의견인가요?</div>
    <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
      {paragraphs.map((paragraph, index) => {
        const checked = selected.includes(index);
        return <label key={index} style={{ display: "flex", alignItems: "flex-start", gap: 9, minHeight: 44, padding: "10px 11px", borderRadius: 9, border: `1px solid ${checked ? "rgba(95,55,12,0.50)" : "rgba(120,75,20,0.16)"}`, background: checked ? "rgba(120,75,20,0.12)" : "rgba(255,255,255,0.24)", color: "#3A2815", cursor: "pointer", fontSize: 11.5, lineHeight: 1.6 }}>
          <input type="checkbox" checked={checked} onChange={() => toggleParagraph(index)} style={{ marginTop: 3, flexShrink: 0 }} />
          <span>{paragraph.replace(/\n/g, " ")}</span>
        </label>;
      })}
    </div>

    <label style={{ display: "block", marginTop: 16, color: "#49351D", fontSize: 12, fontWeight: 700 }}>
      어떤 점이 좋았거나 아쉬웠나요?
      <textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={5000} rows={4} style={{ width: "100%", boxSizing: "border-box", marginTop: 8, padding: 10, borderRadius: 9, border: "1px solid rgba(120,75,20,0.22)", background: "rgba(255,255,255,0.42)", color: "#32220F", resize: "vertical", fontFamily: "'Noto Sans KR', sans-serif", lineHeight: 1.6 }} />
    </label>
    <p style={{ margin: "10px 0 0", color: "#715B42", fontSize: 10.5, lineHeight: 1.55 }}>선택한 답변 내용과 작성한 의견만 서비스 개선을 위해 전송됩니다. 고민 원문은 전송되지 않습니다.</p>
    {error && <p style={{ margin: "9px 0 0", color: "#A33", fontSize: 11 }}>{error}</p>}
    <button type="button" disabled={!rating || selected.length === 0 || submitting} onClick={submit} style={{ width: "100%", minHeight: 42, marginTop: 12, padding: "9px 12px", borderRadius: 9, border: "1px solid rgba(120,75,20,0.28)", background: "rgba(120,75,20,0.14)", color: "#5B3512", cursor: !rating || selected.length === 0 || submitting ? "default" : "pointer", opacity: !rating || selected.length === 0 ? 0.55 : 1, fontWeight: 700 }}>{submitting ? "보내는 중…" : "피드백 보내기"}</button>
  </section>;
}

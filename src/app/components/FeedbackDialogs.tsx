import { useEffect, useState } from "react";
import type { AnalysisRecord } from "../types";
import { ADVICE_REASONS, loadAnalysisFeedback, submitAnalysisFeedback, submitServiceFeedback, type ServiceFeedbackType } from "../services/feedback";

type Palette = { overlayBg: string; modalBg: string; modalBorder: string; headingColor: string; textPrimary: string; textSecondary: string; textMuted: string; btnBg: string; btnBorder: string; accentBtn: string; accentBtnBorder: string; accentBtnText: string; inputBg: string; inputBorder: string };

function ModalShell({ children, onClose, bg, labelledBy }: { children: React.ReactNode; onClose: () => void; bg: Palette; labelledBy: string }) {
  return <div className="feedback-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} style={{ background: bg.overlayBg }}>
    <section className="feedback-modal" role="dialog" aria-modal="true" aria-labelledby={labelledBy} style={{ background: bg.modalBg, borderColor: bg.modalBorder }}>
      {children}
    </section>
  </div>;
}

function Stars({ value, onChange, color }: { value: number; onChange: (value: number) => void; color: string }) {
  return <div className="rating-row" aria-label="만족도 1점에서 5점">
    {[1, 2, 3, 4, 5].map((score) => <button key={score} type="button" aria-label={`${score}점`} aria-pressed={value === score} onClick={() => onChange(score)} style={{ color, background: value === score ? "rgba(190,145,55,.18)" : "transparent" }}>{score}<span>점</span></button>)}
  </div>;
}

export function ServiceFeedbackModal({ onClose, bg }: { onClose: () => void; bg: Palette }) {
  const [feedbackType, setFeedbackType] = useState<ServiceFeedbackType>("오류 / 불편");
  const [rating, setRating] = useState(0);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    if (!rating || !content.trim() || submitting) return;
    setSubmitting(true); setError("");
    try {
      const width = window.innerWidth;
      await submitServiceFeedback({ feedbackType, rating, content, route: `${window.location.pathname}${window.location.search}`, deviceType: width < 768 ? "mobile" : width < 1024 ? "tablet" : "desktop", viewport: `${width}x${window.innerHeight}`, userAgent: navigator.userAgent });
      setSubmitted(true);
    } catch (e) { setError(e instanceof Error ? e.message : "의견을 보내지 못했습니다."); }
    finally { setSubmitting(false); }
  }
  return <ModalShell onClose={onClose} bg={bg} labelledBy="service-feedback-title">
    <button className="feedback-close" onClick={onClose} aria-label="닫기" style={{ color: bg.textSecondary }}>×</button>
    {submitted ? <div className="feedback-success" style={{ color: bg.textPrimary }}>고마워요. 보내주신 의견은 더 나은 별별고민을 만드는 데 참고할게요.<button onClick={onClose} style={{ borderColor: bg.btnBorder, color: bg.textPrimary, background: bg.btnBg }}>닫기</button></div> : <>
      <h2 id="service-feedback-title" style={{ color: bg.headingColor }}>별별고민을 써보니 어떠셨나요?</h2>
      <p className="feedback-description" style={{ color: bg.textSecondary }}>불편했던 점이나 있었으면 하는 점을 편하게 알려주세요.</p>
      <label className="feedback-label" style={{ color: bg.textPrimary }}>피드백 유형</label>
      <div className="choice-grid">{(["오류 / 불편", "사용성", "기능 제안", "기타"] as ServiceFeedbackType[]).map((type) => <button type="button" key={type} onClick={() => setFeedbackType(type)} aria-pressed={feedbackType === type} style={{ borderColor: feedbackType === type ? bg.accentBtnBorder : bg.btnBorder, background: feedbackType === type ? bg.accentBtn : bg.btnBg, color: feedbackType === type ? bg.accentBtnText : bg.textPrimary }}>{type}</button>)}</div>
      <label className="feedback-label" style={{ color: bg.textPrimary }}>만족도</label><Stars value={rating} onChange={setRating} color={bg.textPrimary} />
      <label className="feedback-label" style={{ color: bg.textPrimary }}>내용</label>
      <textarea value={content} onChange={(e) => setContent(e.target.value)} maxLength={5000} rows={5} placeholder="어떤 점이 좋았거나 불편했나요?" style={{ background: bg.inputBg, borderColor: bg.inputBorder, color: bg.textPrimary }} />
      {error && <p className="feedback-error">{error}</p>}
      <button className="feedback-submit" type="button" disabled={!rating || !content.trim() || submitting} onClick={submit} style={{ background: bg.accentBtn, borderColor: bg.accentBtnBorder, color: bg.accentBtnText }}>{submitting ? "보내는 중…" : "의견 보내기"}</button>
    </>}
  </ModalShell>;
}

export function AdviceRatingModal({ record, onClose, bg }: { record: AnalysisRecord; onClose: () => void; bg: Palette }) {
  const [rating, setRating] = useState(0); const [reasons, setReasons] = useState<string[]>([]); const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false); const [submitted, setSubmitted] = useState(false); const [error, setError] = useState("");
  useEffect(() => { let active = true; loadAnalysisFeedback(record.id).then((saved) => { if (active && saved) { setRating(saved.rating); setReasons(saved.reasons); setComment(saved.comment); } }).catch(() => undefined); return () => { active = false; }; }, [record.id]);
  const toggle = (reason: string) => setReasons((current) => current.includes(reason) ? current.filter((item) => item !== reason) : [...current, reason]);
  async function submit() { if (!rating || submitting) return; setSubmitting(true); setError(""); try { await submitAnalysisFeedback({ analysisId: record.id, analysisType: record.type, rating, reasons, comment }); setSubmitted(true); } catch (e) { setError(e instanceof Error ? e.message : "평가를 저장하지 못했습니다."); } finally { setSubmitting(false); } }
  return <ModalShell onClose={onClose} bg={bg} labelledBy="advice-rating-title">
    <button className="feedback-close" onClick={onClose} aria-label="닫기" style={{ color: bg.textSecondary }}>×</button>
    {submitted ? <div className="feedback-success" style={{ color: bg.textPrimary }}>평가를 보내주셔서 고마워요.<button onClick={onClose} style={{ borderColor: bg.btnBorder, color: bg.textPrimary, background: bg.btnBg }}>닫기</button></div> : <>
      <h2 id="advice-rating-title" style={{ color: bg.headingColor }}>이 조언이 도움이 되었나요?</h2>
      <Stars value={rating} onChange={setRating} color={bg.textPrimary} />
      <label className="feedback-label" style={{ color: bg.textPrimary }}>해당하는 항목을 선택해 주세요 <span>(복수 선택 가능)</span></label>
      <div className="reason-grid">{ADVICE_REASONS.map((reason) => <button type="button" key={reason} onClick={() => toggle(reason)} aria-pressed={reasons.includes(reason)} style={{ borderColor: reasons.includes(reason) ? bg.accentBtnBorder : bg.btnBorder, background: reasons.includes(reason) ? bg.accentBtn : bg.btnBg, color: reasons.includes(reason) ? bg.accentBtnText : bg.textPrimary }}>{reason}</button>)}</div>
      <label className="feedback-label" style={{ color: bg.textPrimary }}>추가 의견</label>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={5000} rows={4} placeholder="어떤 점이 좋았거나 아쉬웠나요? (선택)" style={{ background: bg.inputBg, borderColor: bg.inputBorder, color: bg.textPrimary }} />
      {error && <p className="feedback-error">{error}</p>}
      <button className="feedback-submit" type="button" disabled={!rating || submitting} onClick={submit} style={{ background: bg.accentBtn, borderColor: bg.accentBtnBorder, color: bg.accentBtnText }}>{submitting ? "저장하는 중…" : "평가 보내기"}</button>
    </>}
  </ModalShell>;
}

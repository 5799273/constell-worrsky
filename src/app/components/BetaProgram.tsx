import { useState } from "react";
import type { AnalysisRecord, AnalysisType, ConcernFolder } from "../types";
import type { BetaStatus } from "../services/beta";

const typeLabel = (type: AnalysisType) => type === "T" ? "T적 조언" : type === "F" ? "F적 조언" : "패턴 찾기";
const inputStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: 9, borderRadius: 8, border: "1px solid rgba(140,120,80,.28)", background: "rgba(255,255,255,.6)", color: "#32220f" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 700, color: "#49351d", marginTop: 14, marginBottom: 6, lineHeight: 1.5 };

function Score({ label, value, onChange, max = 100 }: { label: string; value: number; onChange: (value: number) => void; max?: number }) {
  return <label style={labelStyle}>{label}<div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}><input type="range" min={0} max={max} step={max === 10 ? 1 : 10} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ flex: 1 }} /><strong>{value}{max === 10 ? "점" : "%"}</strong></div></label>;
}

function Consent({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 16, fontSize: 11, color: "#5a4630", lineHeight: 1.55 }}><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />품질 개선을 위해 선택한 분석에 사용된 메모와 AI 답변을 운영팀에 함께 전송하는 데 동의합니다.</label>;
}

export function InstantFeedback({ record, submitted, onSubmit }: { record: AnalysisRecord; submitted: boolean; onSubmit: (payload: Record<string, unknown>) => Promise<void> }) {
  const [open, setOpen] = useState(false), [agreement, setAgreement] = useState(50), [desired, setDesired] = useState(50), [reason, setReason] = useState(""), [share, setShare] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  if (submitted) return <div style={{ marginTop: 16, textAlign: "center", fontSize: 11, color: "#70552f" }}>이 답변의 평가를 제출했습니다.</div>;
  if (!open) return <div style={{ marginTop: 16, textAlign: "center" }}><button onClick={() => setOpen(true)} style={{ padding: "7px 13px", borderRadius: 8, border: "1px solid rgba(120,75,20,.24)", background: "rgba(120,75,20,.08)", color: "#5b3512", cursor: "pointer" }}>이 답변 평가하기 (선택)</button></div>;
  return <div style={{ marginTop: 18, padding: 15, border: "1px solid rgba(120,75,20,.18)", borderRadius: 10, background: "rgba(255,255,255,.25)" }}>
    <Score label="이 답변에 어느 정도 공감하나요?" value={agreement} onChange={setAgreement} />
    <Score label="AI가 당신이 원했던 답을 해주었나요?" value={desired} onChange={setDesired} />
    <label style={labelStyle}>그렇게 느낀 이유가 있다면 알려주세요. (선택)<textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} style={{ ...inputStyle, marginTop: 6, resize: "vertical" }} /></label>
    <Consent checked={share} onChange={setShare} />
    {error && <p style={{ color: "#a33", fontSize: 11 }}>{error}</p>}
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}><button onClick={() => setOpen(false)}>닫기</button><button disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await onSubmit({ stage: "instant", analysisId: record.id, analysisType: record.type, agreementPercent: agreement, desiredAnswerPercent: desired, reason, shareAnalysisData: share }); } catch (e) { setError(e instanceof Error ? e.message : "제출하지 못했습니다."); } finally { setBusy(false); } }}>{busy ? "제출 중" : "제출"}</button></div>
  </div>;
}

function FeedbackForm({ stage, status, folders, onSubmit }: { stage: "day7" | "day14"; status: BetaStatus; folders: ConcernFolder[]; onSubmit: (payload: Record<string, unknown>) => Promise<void> }) {
  const [analysisId, setAnalysisId] = useState(stage === "day7" ? status.analyses[0]?.id ?? "" : ""), [desired, setDesired] = useState(50), [understood, setUnderstood] = useState(50), [tScore, setTScore] = useState(50), [fScore, setFScore] = useState(50), [commonScore, setCommonScore] = useState(50), [recommendation, setRecommendation] = useState(5), [liked, setLiked] = useState(""), [improvement, setImprovement] = useState(""), [misunderstood, setMisunderstood] = useState(""), [comparison, setComparison] = useState(""), [reuse, setReuse] = useState(""), [continued, setContinued] = useState(""), [oneLine, setOneLine] = useState(""), [share, setShare] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const selected = status.analyses.find((item) => item.id === analysisId);
  const analysisLabel = (item: BetaStatus["analyses"][number]) => `${folders.find((f) => f.id === item.folder_id)?.name ?? "폴더"} · ${typeLabel(item.type)}`;
  async function submit() { setBusy(true); setError(""); try { await onSubmit({ stage, analysisId: analysisId || undefined, analysisType: selected?.type, desiredAnswerPercent: desired, understoodPercent: understood, tSatisfactionPercent: tScore, fSatisfactionPercent: fScore, commonSatisfactionPercent: commonScore, recommendationScore: recommendation, likedText: liked, improvementText: improvement, misunderstoodText: misunderstood, comparisonText: comparison, reuseSituationText: reuse, continuedUseText: continued, oneLineDescription: oneLine, shareAnalysisData: share }); } catch (e) { setError(e instanceof Error ? e.message : "제출하지 못했습니다."); } finally { setBusy(false); } }
  return <div style={{ marginTop: 18, padding: 18, border: "1px solid rgba(140,120,80,.24)", borderRadius: 12, background: "rgba(255,255,255,.45)" }}>
    <h3 style={{ margin: 0, color: "#392713" }}>{stage === "day7" ? "Day 7 중간 피드백" : "Day 14 최종 피드백"}</h3>
    <label style={labelStyle}>{stage === "day7" ? "가장 기억에 남는 분석" : "메모와 AI 답변을 공유할 경우 선택할 분석"}<select value={analysisId} onChange={(e) => setAnalysisId(e.target.value)} style={{ ...inputStyle, marginTop: 6 }}><option value="">선택하지 않음</option>{status.analyses.map((item) => <option key={item.id} value={item.id}>{analysisLabel(item)}</option>)}</select></label>
    {stage === "day7" && <Score label="지난 7일 동안 원하는 조언을 얻었다고 느끼셨나요?" value={desired} onChange={setDesired} />}
    {stage === "day14" && <><div style={{ fontSize: 11, color: "#665038", lineHeight: 1.7 }}>이번 체험에서 사용한 기능: 메모 {status.activity.notes}회 · T {status.activity.T}회 · F {status.activity.F}회 · 패턴 {status.activity.common}회 · 저장 {status.activity.saved}건</div>{status.activity.T > 0 && <Score label="원하는 현실적인 조언을 얻었나요?" value={tScore} onChange={setTScore} />}{status.activity.F > 0 && <Score label="원하는 공감이나 위로를 받았나요?" value={fScore} onChange={setFScore} />}{status.activity.common > 0 && <Score label="새로운 발견이나 도움이 되는 흐름을 찾았나요?" value={commonScore} onChange={setCommonScore} />}</>}
    <Score label="AI가 내 기록을 잘 읽고 이해했다고 느끼셨나요?" value={understood} onChange={setUnderstood} />
    <label style={labelStyle}>가장 마음에 들었던 점 ({stage === "day7" ? "최소 30자" : "최소 50자"})<textarea value={liked} onChange={(e) => setLiked(e.target.value)} rows={4} style={{ ...inputStyle, marginTop: 6 }} /></label>
    <label style={labelStyle}>아쉬웠던 점 ({stage === "day7" ? "최소 30자" : "최소 50자"})<textarea value={improvement} onChange={(e) => setImprovement(e.target.value)} rows={4} style={{ ...inputStyle, marginTop: 6 }} /></label>
    <label style={labelStyle}>조금 다르게 이해한 부분 ({stage === "day14" ? "최소 30자, 없다면 ‘없음’" : "최소 30자"})<textarea value={misunderstood} onChange={(e) => setMisunderstood(e.target.value)} rows={4} style={{ ...inputStyle, marginTop: 6 }} /></label>
    {stage === "day14" && <><label style={labelStyle}>다른 서비스와 달랐던 점 (선택, 입력 시 최소 30자)<textarea value={comparison} onChange={(e) => setComparison(e.target.value)} rows={3} style={{ ...inputStyle, marginTop: 6 }} /></label><label style={labelStyle}>어떤 상황에서 다시 사용할 것 같나요? (최소 30자)<textarea value={reuse} onChange={(e) => setReuse(e.target.value)} rows={3} style={{ ...inputStyle, marginTop: 6 }} /></label><label style={labelStyle}>계속 사용할 것 같나요? 이유도 알려주세요. (최소 30자)<textarea value={continued} onChange={(e) => setContinued(e.target.value)} rows={3} style={{ ...inputStyle, marginTop: 6 }} /></label><Score label="주변 사람에게 추천하고 싶나요?" value={recommendation} onChange={setRecommendation} max={10} /><label style={labelStyle}>이 서비스를 한 문장으로 표현한다면? (선택)<input value={oneLine} onChange={(e) => setOneLine(e.target.value)} style={{ ...inputStyle, marginTop: 6 }} /></label></>}
    <Consent checked={share} onChange={setShare} />
    {error && <p style={{ color: "#a33", fontSize: 11 }}>{error}</p>}<button disabled={busy || (stage === "day7" && !analysisId)} onClick={submit} style={{ width: "100%", marginTop: 14, padding: 10 }}>{busy ? "제출 중" : "피드백 제출"}</button>
  </div>;
}

export function BetaPanel({ status, folders, onClose, onSubmit }: { status: BetaStatus; folders: ConcernFolder[]; onClose: () => void; onSubmit: (payload: Record<string, unknown>) => Promise<void> }) {
  const p = status.participant, a = status.activity;
  return <div onClick={(e) => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, zIndex: 140, background: "rgba(4,2,16,.86)", display: "flex", justifyContent: "center", alignItems: "center", padding: 20 }}><div style={{ width: "100%", maxWidth: 720, maxHeight: "88vh", overflow: "auto", background: "#f4ead0", borderRadius: 18, padding: 24 }}>
    <div style={{ display: "flex", justifyContent: "space-between" }}><h2 style={{ margin: 0, color: "#33220f" }}>14일 베타 체험</h2><button onClick={onClose}>닫기</button></div>
    <p style={{ color: "#604a30", fontSize: 13 }}>체험 {p.day}일차 · {p.daysRemaining}일 남음 · 중간 피드백 Day 7 · 최종 피드백 Day 14</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>{[["폴더",a.folders],["메모",a.notes],["T적 조언",a.T],["F적 조언",a.F],["패턴 찾기",a.common],["저장한 조언",a.saved]].map(([label,value]) => <div key={String(label)} style={{ padding: 10, borderRadius: 9, background: "rgba(255,255,255,.48)", textAlign: "center", color: "#4d3820", fontSize: 11 }}><strong style={{ display: "block", fontSize: 18 }}>{value}</strong>{label}</div>)}</div>
    <p style={{ fontSize: 11, color: "#715b42", lineHeight: 1.6 }}>작성한 피드백은 서비스 개선을 위해 운영자가 확인할 수 있습니다.<br />메모와 AI 답변은 별도로 동의한 경우에만 함께 전송됩니다.</p>
    {p.day7Available && !p.day7_completed && <FeedbackForm stage="day7" status={status} folders={folders} onSubmit={onSubmit} />}
    {p.day7_completed && <p style={{ fontSize: 12, color: "#49643d" }}>Day 7 피드백 제출 완료</p>}
    {p.day14Available && !p.day14_completed && <FeedbackForm stage="day14" status={status} folders={folders} onSubmit={onSubmit} />}
    {p.day14_completed && <p style={{ fontSize: 12, color: "#49643d" }}>Day 14 피드백 제출 완료</p>}
  </div></div>;
}

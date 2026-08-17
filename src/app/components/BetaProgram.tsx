import type { BetaStatus } from "../services/beta";

type Palette = {
  overlayBg: string; modalBg: string; modalBorder: string; headingColor: string;
  textPrimary: string; textSecondary: string; textMuted: string; cardBg: string;
  cardBorder: string; btnBg: string; btnBorder: string; accentBtn: string;
  accentBtnBorder: string; accentBtnText: string;
};

export function BetaPanel({ status, onClose, onFeedback, bg }: {
  status: BetaStatus;
  onClose: () => void;
  onFeedback: () => void;
  bg: Palette;
}) {
  const activity = status.activity;
  const statistics = [
    ["폴더", activity.folders], ["고민 메모", activity.notes], ["T적 조언", activity.T],
    ["F적 조언", activity.F], ["패턴 찾기", activity.common], ["저장한 조언", activity.saved],
  ] as const;

  return <div className="beta-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} style={{ background: bg.overlayBg }}>
    <section className="beta-panel" role="dialog" aria-modal="true" aria-labelledby="beta-panel-title" style={{ background: bg.modalBg, borderColor: bg.modalBorder }}>
      <header className="beta-panel-header">
        <div>
          <div className="beta-eyebrow" style={{ color: bg.textMuted }}>별별고민 Beta</div>
          <h2 id="beta-panel-title" style={{ color: bg.headingColor }}>나의 이용 현황</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="닫기" style={{ color: bg.textSecondary }}>×</button>
      </header>

      <div className="beta-stat-grid">
        {statistics.map(([label, value]) => <div key={label} style={{ background: bg.cardBg, borderColor: bg.cardBorder, color: bg.textSecondary }}>
          <strong style={{ color: bg.textPrimary }}>{value}</strong><span>{label}</span>
        </div>)}
      </div>

      <div className="beta-feedback-callout" style={{ borderColor: bg.cardBorder, color: bg.textSecondary }}>
        <p>별별고민은 현재 Beta 운영 중입니다.<br />사용하면서 불편했던 점이나 필요한 점이 있다면 알려주세요.</p>
        <button type="button" className="feedback-entry-button" onClick={onFeedback}>의견 보내기</button>
      </div>
    </section>
  </div>;
}

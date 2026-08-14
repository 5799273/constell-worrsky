import { useState, useMemo, useCallback, useEffect, useRef, createContext, useContext } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { NoteData, AnalysisType, AnalysisRecord, BoxData, ConcernFolder, UserSession, AuthState, ColorTheme, BackgroundTheme } from "./types";
import { analyzeNotes, stripMarkdown } from "./services/ai";
import { supabase } from "./services/supabase";
import { createEncryptedNote, deleteEncryptedNotes, loadEncryptedAnalysisHistory, loadEncryptedNotes, updateAnalysisSavedState, updateEncryptedNote } from "./services/encrypted-data";
import { loadBetaStatus, submitBetaFeedback, type BetaStatus } from "./services/beta";
import { BetaPanel, InstantFeedback } from "./components/BetaProgram";

/* ═══════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════ */
let _id = 0;
const uid = () => `${Date.now()}-${++_id}`;
const nowISO = () => new Date().toISOString();
const currentYM = () => new Date().toISOString().slice(0, 7);
const fmtMonth = (ym: string) => { const [y, m] = ym.split("-"); return `${y}년 ${parseInt(m)}월`; };

const DEFAULT_FOLDER_NAMES = ["#001", "#002"];

function nextFolderName(folders: ConcernFolder[]): string {
  let n = 1;
  while (folders.some((folder) => folder.name === `#${String(n).padStart(3, "0")}`)) n++;
  return `#${String(n).padStart(3, "0")}`;
}

const PALETTE_PASTEL = [
  { bg: "#B8D4F5", mid: "#88ADE0", dark: "#5580C0", text: "#1a3050", glow: "rgba(100,160,230,0.42)" },
  { bg: "#F5B0B0", mid: "#E08080", dark: "#C05050", text: "#5a1010", glow: "rgba(230,100,100,0.42)" },
  { bg: "#A8E6C0", mid: "#70C090", dark: "#3A9060", text: "#0a3020", glow: "rgba(80,190,130,0.40)" },
  { bg: "#D8B8F5", mid: "#B090E0", dark: "#8060C0", text: "#350a5a", glow: "rgba(170,110,230,0.40)" },
  { bg: "#F5E0A8", mid: "#E0C060", dark: "#C09020", text: "#3a2800", glow: "rgba(230,190,60,0.40)" },
  { bg: "#F5B8D4", mid: "#E080B0", dark: "#C05080", text: "#4a1030", glow: "rgba(230,80,170,0.42)" },
  { bg: "#A8D8F5", mid: "#60B0E0", dark: "#2080C0", text: "#002040", glow: "rgba(60,160,230,0.40)" },
  { bg: "#C8F5A8", mid: "#90D060", dark: "#508020", text: "#142000", glow: "rgba(130,210,60,0.40)" },
];
const PALETTE_NEON = [
  { bg: "#00D0FF", mid: "#0090CC", dark: "#005A8A", text: "#000e1a", glow: "rgba(0,200,255,0.58)" },
  { bg: "#FF2266", mid: "#CC0044", dark: "#880022", text: "#1a0010", glow: "rgba(255,30,80,0.58)" },
  { bg: "#20FF80", mid: "#00CC50", dark: "#008030", text: "#001510", glow: "rgba(20,255,100,0.52)" },
  { bg: "#CC44FF", mid: "#9900CC", dark: "#660088", text: "#0e0018", glow: "rgba(200,50,255,0.52)" },
  { bg: "#FFD700", mid: "#CCA500", dark: "#886600", text: "#1a1200", glow: "rgba(255,210,0,0.52)" },
  { bg: "#FF6622", mid: "#CC4400", dark: "#882200", text: "#1a0800", glow: "rgba(255,80,30,0.52)" },
  { bg: "#22FFEE", mid: "#00CCC0", dark: "#008888", text: "#001a18", glow: "rgba(30,255,240,0.52)" },
  { bg: "#88FF22", mid: "#66CC00", dark: "#448800", text: "#0e1a00", glow: "rgba(120,255,30,0.52)" },
];

function getColorByIndex(index: number, theme: ColorTheme) {
  const p = theme === "pastel" ? PALETTE_PASTEL : PALETTE_NEON;
  return p[Math.abs(index) % p.length];
}

/* ─── Settings Context ─── */
interface AppSettings {
  colorTheme: ColorTheme;
  bgTheme: BackgroundTheme;
  characterPrompt: string;
  characterName: string;
}
type ViewSettings = AppSettings & { folders: ConcernFolder[] };
const SettingsCtx = createContext<ViewSettings>({
  colorTheme: "pastel",
  bgTheme: "dark",
  folders: [],
  characterPrompt: "",
  characterName: "",
});

function useColor(folderId: string) {
  const { colorTheme, folders } = useContext(SettingsCtx);
  const folder = folders.find((item) => item.id === folderId);
  return getColorByIndex(folder?.colorKey ?? 0, colorTheme);
}

function folderName(folderId: string, folders: ConcernFolder[]) {
  return folders.find((folder) => folder.id === folderId)?.name ?? "알 수 없는 고민";
}

function dateInputValue(iso: string) {
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function koreanDate(iso: string) {
  const date = new Date(iso);
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function orderMarker(order: number) {
  const markers = ["", "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳"];
  return markers[order] ?? `${order}번째`;
}

function replaceDateKeepingTime(iso: string, dateValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(iso);
  date.setFullYear(year, month - 1, day);
  return date.toISOString();
}

function sortNotesByDisplayOrder(notes: NoteData[]) {
  return [...notes].sort((a, b) => {
    const dateCompare = dateInputValue(b.createdAt).localeCompare(dateInputValue(a.createdAt));
    return dateCompare !== 0 ? dateCompare : a.createdAt.localeCompare(b.createdAt);
  });
}

/* ─── Background theme config ─── */
const BG = {
  dark: {
    pageBg: "linear-gradient(160deg, #1a1828 0%, #10101e 55%, #0c0a18 100%)",
    dotColor: "255,255,255",
    headingColor: "#F0EDE6",
    subtitleColor: "rgba(200,185,130,0.48)",
    dividerColor: "rgba(210,195,120,0.28)",
    cardBg: "rgba(255,255,255,0.035)",
    cardBorder: "rgba(255,255,255,0.085)",
    panelBorder: "rgba(255,255,255,0.08)",
    textPrimary: "#EEE9DC",
    textSecondary: "rgba(200,185,140,0.58)",
    textMuted: "rgba(170,155,110,0.40)",
    inputBg: "rgba(255,255,255,0.06)",
    inputBorder: "rgba(255,255,255,0.11)",
    boxInterior: "linear-gradient(160deg, #08061a 0%, #0b0820 55%, #070518 100%)",
    popupBg: "linear-gradient(145deg, #1e1b30, #16132a)",
    modalBg: "linear-gradient(160deg, #1a1730, #12102a)",
    modalBorder: "rgba(255,255,255,0.10)",
    overlayBg: "rgba(4,2,16,0.85)",
    emptyColor: "rgba(200,180,120,0.20)",
    sectionLabel: "rgba(180,160,115,0.46)",
    btnBg: "rgba(255,255,255,0.04)",
    btnBorder: "rgba(255,255,255,0.08)",
    accentBtn: "rgba(200,180,100,0.14)",
    accentBtnBorder: "rgba(200,180,100,0.30)",
    accentBtnText: "rgba(215,195,130,0.85)",
    cabinetBg: "linear-gradient(180deg, #1e1a2c 0%, #16131e 100%)",
    cabinetShelf: "rgba(196,146,26,0.28)",
    cabinetBorder: "rgba(196,146,26,0.22)",
    recentBg: "rgba(255,255,255,0.025)",
    mugShadow: "rgba(0,0,0,0.35)",
  },
  sky: {
    pageBg: "linear-gradient(160deg, #c2deff 0%, #d8eeff 45%, #e8f6ff 100%)",
    dotColor: "30,80,160",
    headingColor: "#222222",
    subtitleColor: "rgba(60,60,80,0.62)",
    dividerColor: "rgba(80,140,220,0.30)",
    cardBg: "rgba(255,255,255,0.62)",
    cardBorder: "rgba(100,160,220,0.28)",
    panelBorder: "rgba(100,160,220,0.22)",
    textPrimary: "#333333",
    textSecondary: "rgba(50,50,70,0.70)",
    textMuted: "rgba(80,80,100,0.60)",
    inputBg: "rgba(255,255,255,0.75)",
    inputBorder: "rgba(100,160,220,0.35)",
    boxInterior: "linear-gradient(160deg, #f0f8ff 0%, #e8f2ff 55%, #e0ecf8 100%)",
    popupBg: "linear-gradient(145deg, #e8f4ff, #f0f8ff)",
    modalBg: "linear-gradient(160deg, #e0f0ff, #ecf6ff)",
    modalBorder: "rgba(100,160,220,0.30)",
    overlayBg: "rgba(20,80,180,0.30)",
    emptyColor: "rgba(80,140,210,0.25)",
    sectionLabel: "rgba(60,60,80,0.55)",
    btnBg: "rgba(255,255,255,0.50)",
    btnBorder: "rgba(100,160,220,0.22)",
    accentBtn: "rgba(80,140,220,0.14)",
    accentBtnBorder: "rgba(80,140,220,0.30)",
    accentBtnText: "rgba(30,60,130,0.85)",
    cabinetBg: "linear-gradient(180deg, #dceeff 0%, #cce0f8 100%)",
    cabinetShelf: "rgba(80,140,220,0.28)",
    cabinetBorder: "rgba(80,140,220,0.22)",
    recentBg: "rgba(255,255,255,0.45)",
    mugShadow: "rgba(80,120,200,0.18)",
  },
} as const;

type BgConfig = (typeof BG)[keyof typeof BG];

function useBg(): BgConfig {
  const { bgTheme } = useContext(SettingsCtx);
  return BG[bgTheme];
}

const ANALYSIS_META = {
  common: { label: "패턴 찾기", sub: "기록 속 흐름", sq: "#8B5CF6", glow: "rgba(139,92,246,0.30)" },
  T:      { label: "T적 조언",    sub: "논리의 나침반", sq: "#3B82F6", glow: "rgba(59,130,246,0.30)" },
  F:      { label: "F적 조언",    sub: "공감의 등불",   sq: "#EF4444", glow: "rgba(239,68,68,0.30)" },
} as const;

const BOX_W = 320;
const BOX_H = 260;
const STAR_SZ = 20;

/* ═══════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════ */
function pilePos(index: number) {
  const cols = 5, col = index % cols, row = Math.floor(index / cols);
  const offsets = [-62, -31, 0, 31, 62];
  const bx = BOX_W / 2 + offsets[col], by = BOX_H - STAR_SZ - 14 - row * 34;
  const jx = Math.sin(index * 47.32 + col * 2.1) * 14;
  const jy = Math.cos(index * 89.17 + row * 1.7) * 9;
  return {
    x: Math.max(STAR_SZ, Math.min(bx + jx, BOX_W - STAR_SZ)),
    y: Math.max(STAR_SZ, Math.min(by + jy, BOX_H - STAR_SZ)),
    rot: Math.sin(index * 127.5 + 3.3) * 28,
  };
}
function shakePos() {
  return { x: STAR_SZ + Math.random() * (BOX_W - STAR_SZ * 2), y: STAR_SZ + Math.random() * (BOX_H - STAR_SZ * 2), rot: (Math.random() - 0.5) * 90 };
}
function makeBox(): BoxData {
  const createdAt = nowISO();
  return {
    id: uid(), title: null,
    folders: DEFAULT_FOLDER_NAMES.map((name, colorKey) => ({ id: `folder_${uid()}`, name, colorKey, createdAt })),
    notes: [], analysisHistory: [], createdAt, updatedAt: createdAt,
  };
}

/* ═══════════════════════════════════════════════
   LUCKY STAR SVG
═══════════════════════════════════════════════ */
function LuckyStar({ size = STAR_SZ, cat, style }: { size?: number; cat: string; style?: React.CSSProperties }) {
  const c = useColor(cat);
  const s = size, cx = s / 2, cy = s / 2, R = s * 0.44, r = s * 0.185;
  const pts: [number, number][] = Array.from({ length: 10 }, (_, i) => {
    const a = (i * 36 - 90) * Math.PI / 180;
    return [cx + (i % 2 === 0 ? R : r) * Math.cos(a), cy + (i % 2 === 0 ? R : r) * Math.sin(a)];
  });
  const outer = pts.filter((_, i) => i % 2 === 0);
  const inner = pts.filter((_, i) => i % 2 !== 0);
  const pStr = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const iStr = inner.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  // ID based on actual color hex so different categories never share a gradient
  const gid = `gstar_${c.bg.replace(/[^0-9a-fA-F]/g, "").slice(0, 6)}_${Math.round(s)}`;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ filter: `drop-shadow(0 1px 4px rgba(0,0,0,0.35)) drop-shadow(0 0 6px ${c.glow})`, flexShrink: 0, ...style }}>
      <defs>
        <radialGradient id={gid} cx="38%" cy="32%" r="68%">
          <stop offset="0%" stopColor={c.bg} /><stop offset="55%" stopColor={c.mid} /><stop offset="100%" stopColor={c.dark} />
        </radialGradient>
      </defs>
      <polygon points={pStr} fill={`url(#${gid})`} />
      {outer.map(([ox, oy], i) => { const [bx, by] = inner[(i + 4) % 5]; return <polygon key={`fl${i}`} points={`${cx.toFixed(1)},${cy.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)} ${ox.toFixed(1)},${oy.toFixed(1)}`} fill="rgba(255,255,255,0.28)" />; })}
      {outer.map(([ox, oy], i) => { const [ax, ay] = inner[i]; return <polygon key={`fr${i}`} points={`${cx.toFixed(1)},${cy.toFixed(1)} ${ox.toFixed(1)},${oy.toFixed(1)} ${ax.toFixed(1)},${ay.toFixed(1)}`} fill="rgba(0,0,0,0.18)" />; })}
      <polygon points={iStr} fill="rgba(255,255,255,0.14)" />
      <polygon points={pStr} fill="none" stroke="rgba(255,255,255,0.20)" strokeWidth="0.6" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════
   MUG SVG — 2D flat mug, saucer colored by category
   Category label text shown in center of body
═══════════════════════════════════════════════ */
function MugSvg({ cat, selected, noteCount, label }: { cat: string; selected: boolean; noteCount: number; label: string }) {
  const c = useColor(cat);
  const bg = useBg();
  // viewBox 0 0 72 72
  // Body: white rounded rect
  const bodyX = 4, bodyY = 6, bodyW = 46, bodyH = 36, bodyR = 6;
  // Rim: slightly wider at top
  const rimX = 2, rimY = 3, rimW = 50, rimH = 7, rimR = 5;
  // Handle: right side open D
  const hx = bodyX + bodyW, hy1 = bodyY + 8, hy2 = bodyY + bodyH - 8, hcx = hx + 17;
  // Saucer: ellipse at base, colored with category color
  const saucerCY = bodyY + bodyH + 7;

  const borderColor = selected ? c.mid : "rgba(200,205,218,0.65)";
  const saucerFill = selected ? c.mid : c.bg;
  const saucerStroke = selected ? c.dark : c.mid;

  // Trim label to fit: max ~8 chars for small font
  const displayLabel = label.length > 8 ? label.slice(0, 7) + "…" : label;
  const fontSize = label.length > 6 ? 7.5 : 8.5;

  return (
    <svg width={72} height={72} viewBox="0 0 72 72" style={{ display: "block" }}>
      <defs>
        <linearGradient id={`mughl_${c.bg.replace(/[^0-9a-f]/gi,"").slice(0,4)}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.00)" />
        </linearGradient>
      </defs>

      {/* Saucer — category color identifier */}
      <ellipse cx={27} cy={saucerCY + 2} rx={22} ry={4} fill={`${c.bg}30`} />
      <ellipse cx={27} cy={saucerCY} rx={21} ry={3.5}
        fill={saucerFill} stroke={saucerStroke} strokeWidth="1.2" opacity={selected ? 1 : 0.75} />
      {/* Saucer rim highlight */}
      <ellipse cx={27} cy={saucerCY - 1} rx={14} ry={1.5} fill="rgba(255,255,255,0.35)" />

      {/* Mug body */}
      <rect x={bodyX} y={bodyY} width={bodyW} height={bodyH} rx={bodyR} ry={bodyR}
        fill={selected ? `${c.bg}14` : "rgba(255,255,255,0.97)"}
        stroke={borderColor} strokeWidth={selected ? 2 : 1.2} />

      {/* Inner highlight strip */}
      <rect x={bodyX + 4} y={bodyY + 5} width={7} height={bodyH - 10} rx={3}
        fill={`url(#mughl_${c.bg.replace(/[^0-9a-f]/gi,"").slice(0,4)})`} />

      {/* Rim */}
      <rect x={rimX} y={rimY} width={rimW} height={rimH} rx={rimR} ry={rimR}
        fill={selected ? `${c.bg}22` : "rgba(238,240,250,0.94)"}
        stroke={borderColor} strokeWidth="1" />

      {/* Handle */}
      <path d={`M${hx},${hy1} Q${hcx},${hy1} ${hcx},${(hy1+hy2)/2} Q${hcx},${hy2} ${hx},${hy2}`}
        fill="none" stroke={borderColor} strokeWidth={selected ? 2.2 : 1.6} strokeLinecap="round" />

      {/* Category label text centered in body */}
      <text
        x={bodyX + bodyW / 2} y={bodyY + bodyH / 2 + 3}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={fontSize} fontWeight="600"
        fill={selected ? c.dark : "rgba(80,85,110,0.75)"}
        fontFamily="'Noto Sans KR', sans-serif"
        style={{ letterSpacing: "0.02em" }}
      >{displayLabel}</text>

      {/* Note count badge */}
      {noteCount > 0 && (
        <>
          <circle cx={56} cy={8} r={8} fill={c.mid} />
          <text x={56} y={12} textAnchor="middle" fontSize="7.5" fontWeight="700" fill="white" fontFamily="sans-serif">{noteCount > 99 ? "99" : noteCount}</text>
        </>
      )}

      {/* Selected glow ring */}
      {selected && (
        <rect x={bodyX - 1} y={bodyY - 1} width={bodyW + 2} height={bodyH + 2} rx={bodyR + 1}
          fill="none" stroke={c.mid} strokeWidth="1.5" opacity="0.45" />
      )}
    </svg>
  );
}

/* ═══════════════════════════════════════════════
   MUG CABINET — 고민 찻장
═══════════════════════════════════════════════ */
function MugCabinet({ folders, notes, selectedFolderId, onSelectFolder, onAnalyze, activeType, isLoading }: {
  folders: ConcernFolder[];
  notes: NoteData[];
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onAnalyze: (t: AnalysisType) => void;
  activeType: AnalysisType | null;
  isLoading: boolean;
}) {
  const bg = useBg();
  const { colorTheme } = useContext(SettingsCtx);

  const countByFolder = useMemo(() => {
    const m: Record<string, number> = {};
    for (const n of notes) m[n.folderId] = (m[n.folderId] ?? 0) + 1;
    return m;
  }, [notes]);

  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId) ?? null;
  const selectedNotes = selectedFolder ? notes.filter((note) => note.folderId === selectedFolder.id) : [];
  const disabled = !selectedFolder || selectedNotes.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", borderRadius: 14, overflow: "hidden", border: `1px solid ${bg.cabinetBorder}`, boxShadow: bg === BG.sky ? "0 4px 20px rgba(80,140,220,0.12)" : "0 4px 20px rgba(0,0,0,0.30)" }}>
      {/* Cabinet header */}
      <div style={{ padding: "9px 14px 8px", background: bg.cabinetBg, borderBottom: `1px solid ${bg.cabinetShelf}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 9.5, letterSpacing: "0.28em", color: bg.textSecondary, textTransform: "uppercase", fontFamily: "Georgia, serif" }}>고민 찻장</span>
        {selectedFolder && (
          <button onClick={() => onSelectFolder(null)}
            style={{ background: "none", border: "none", color: bg.textMuted, fontSize: 10, cursor: "pointer", fontFamily: "Georgia, serif", letterSpacing: "0.05em" }}>
            전체 보기 ×
          </button>
        )}
      </div>

      {/* Horizontal scrollable mug row */}
      <div style={{ background: bg.cabinetBg, padding: "10px 8px 4px", overflowX: folders.length > 3 ? "auto" : "hidden" }}>
        <div style={{ display: "flex", gap: 4, width: folders.length > 3 ? `${folders.length * 83}px` : "100%", paddingBottom: 2 }}>
          {folders.map((folder) => {
            const isSel = selectedFolderId === folder.id;
            const cnt = countByFolder[folder.id] ?? 0;
            const c = getColorByIndex(folder.colorKey, colorTheme);
            return (
              <motion.button
                key={folder.id}
                whileHover={{ y: -3, scale: 1.05 }}
                whileTap={{ scale: 0.94 }}
                onClick={() => onSelectFolder(isSel ? null : folder.id)}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  background: "transparent", border: "none", cursor: "pointer", padding: "2px 0",
                  borderRadius: 8, outline: "none",
                  boxShadow: isSel ? `0 0 14px ${c.glow}` : "none",
                  flex: folders.length <= 3 ? "1 1 0" : "0 0 79px",
                  minWidth: 0,
                }}
              >
                <MugSvg cat={folder.id} selected={isSel} noteCount={cnt} label={folder.name} />
              </motion.button>
            );
          })}
        </div>
        {/* Shelf plank */}
        <div style={{ height: 6, margin: "4px 4px 4px", borderRadius: 3, background: bg === BG.sky ? "linear-gradient(90deg, rgba(160,200,240,0.5), rgba(140,180,230,0.7), rgba(160,200,240,0.5))" : "linear-gradient(90deg, rgba(120,80,20,0.25), rgba(196,146,26,0.45), rgba(120,80,20,0.25))", boxShadow: bg === BG.sky ? "0 2px 4px rgba(80,140,220,0.15)" : "0 2px 4px rgba(0,0,0,0.25)" }} />
      </div>

      {/* AI analysis buttons */}
      <div style={{ borderTop: `1px solid ${bg.cabinetShelf}`, padding: "10px 12px 12px", background: bg.cabinetBg }}>
        {selectedFolder && (
          <div style={{ marginBottom: 8, textAlign: "center" }}>
            <span style={{ fontSize: 9.5, color: bg.textMuted, fontFamily: "Georgia, serif", fontStyle: "italic" }}>
              "{selectedFolder.name}" 고민 {selectedNotes.length}개 분석
            </span>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {(["common", "T", "F"] as AnalysisType[]).map((type) => {
            const m = ANALYSIS_META[type];
            const isActive = activeType === type;
            const spinning = isActive && isLoading;
            return (
              <motion.button key={type}
                whileHover={!disabled ? { x: 2 } : {}}
                whileTap={!disabled ? { scale: 0.97 } : {}}
                onClick={() => !disabled && onAnalyze(type)}
                disabled={disabled}
                style={{
                  display: "flex", alignItems: "center", gap: 9, padding: "8px 10px",
                  background: isActive ? `${m.sq}16` : bg.btnBg,
                  border: `1px solid ${isActive ? m.sq + "50" : bg.btnBorder}`,
                  borderRadius: 8, cursor: disabled ? "default" : "pointer",
                  opacity: disabled ? 0.30 : 1, textAlign: "left",
                  boxShadow: isActive ? `0 0 14px ${m.glow}` : "none",
                  transition: "all 0.20s",
                }}>
                <motion.div
                  animate={spinning ? { rotate: 360 } : { rotate: isActive ? 12 : 0 }}
                  transition={spinning ? { repeat: Infinity, duration: 1.4, ease: "linear" } : { duration: 0.25 }}
                  style={{ width: 11, height: 11, background: m.sq, borderRadius: "2px", flexShrink: 0, boxShadow: `0 0 5px ${m.sq}66` }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: isActive ? m.sq : bg.textPrimary, fontFamily: "'Noto Sans KR', sans-serif", transition: "color 0.2s" }}>{m.label}</div>
                  <div style={{ fontSize: 9, color: bg.textMuted, fontFamily: "Georgia, serif" }}>{spinning ? "분석 중…" : m.sub}</div>
                </div>
              </motion.button>
            );
          })}
        </div>
        {disabled && (
          <p style={{ margin: "8px 0 0", fontSize: 9.5, color: bg.textMuted, textAlign: "center", fontFamily: "Georgia, serif", fontStyle: "italic" }}>
            {selectedFolder ? "이 고민 폴더에 기록이 없어요" : "분석할 고민 폴더를 선택하세요"}
          </p>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   RECENT NOTES PANEL
═══════════════════════════════════════════════ */
function RecentNotes({ notes, onDelete, onUpdateDate }: {
  notes: NoteData[];
  onDelete: (id: string) => void;
  onUpdateDate: (id: string, dateValue: string) => void;
}) {
  const bg = useBg();
  const { colorTheme, folders } = useContext(SettingsCtx);
  const [editingDateId, setEditingDateId] = useState<string | null>(null);

  const displayed = useMemo(() => sortNotesByDisplayOrder(notes), [notes]);

  const orderByNoteId = useMemo(() => {
    const notesByDate = new Map<string, NoteData[]>();
    for (const note of notes) {
      const date = dateInputValue(note.createdAt);
      const group = notesByDate.get(date) ?? [];
      group.push(note);
      notesByDate.set(date, group);
    }

    const result = new Map<string, { order: number; total: number }>();
    for (const group of notesByDate.values()) {
      group.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      group.forEach((note, index) => result.set(note.id, { order: index + 1, total: group.length }));
    }
    return result;
  }, [notes]);

  function folderColor(folderId: string) {
    const folder = folders.find((item) => item.id === folderId);
    return getColorByIndex(folder?.colorKey ?? 0, colorTheme);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, background: bg.cardBg, border: `1px solid ${bg.cardBorder}`, borderRadius: 13, overflow: "hidden" }}>
      <div style={{ padding: "9px 14px 7px", borderBottom: `1px solid ${bg.panelBorder}`, flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 9.5, letterSpacing: "0.24em", color: bg.textSecondary, fontFamily: "Georgia, serif" }}>별별고민</span>
        {displayed.length > 0 && <span style={{ fontSize: 10, color: bg.textMuted, fontFamily: "Georgia, serif" }}>{displayed.length}</span>}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 10px 8px" }}>
        {displayed.length === 0 ? (
          <p style={{ margin: "16px 0", fontSize: 11, color: bg.textMuted, textAlign: "center", fontFamily: "Georgia, serif", fontStyle: "italic" }}>아직 비어있어요</p>
        ) : (
          <AnimatePresence initial={false}>
            {displayed.map((note) => {
              const c = folderColor(note.folderId);
              const isEditingDate = editingDateId === note.id;
              const sameDateOrder = orderByNoteId.get(note.id);
              return (
                <motion.div key={note.id} layout initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }}
                  style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "5px 6px", marginBottom: 4, background: `${c.bg}0d`, border: `1px solid ${c.bg}1e`, borderRadius: 7 }}>
                  <div style={{ flexShrink: 0, paddingTop: 2 }}><LuckyStar size={12} cat={note.folderId} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: "0 0 1px", fontSize: 12, color: bg.textPrimary, fontFamily: "'Noto Sans KR', sans-serif", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any }}>{note.text}</p>
                    {isEditingDate ? (
                      <input
                        type="date"
                        value={dateInputValue(note.createdAt)}
                        onChange={(event) => { onUpdateDate(note.id, event.target.value); setEditingDateId(null); }}
                        onKeyDown={(event) => { if (event.key === "Escape") setEditingDateId(null); }}
                        aria-label="메모 날짜 수정"
                        autoFocus
                        style={{ padding: "1px 3px", background: bg.inputBg, border: `1px solid ${c.bg}70`, borderRadius: 4, color: bg.textPrimary, fontSize: 9, fontFamily: "Georgia, serif", outline: "none" }}
                      />
                    ) : (
                      <button
                        onClick={() => setEditingDateId(note.id)}
                        title="날짜 수정"
                        style={{ padding: 0, background: "none", border: "none", color: bg.textMuted, fontSize: 9, cursor: "pointer", fontFamily: "Georgia, serif" }}
                      >
                        {koreanDate(note.createdAt)}{sameDateOrder && sameDateOrder.total > 1 ? ` · ${orderMarker(sameDateOrder.order)}` : ""} · {folderName(note.folderId, folders)}
                      </button>
                    )}
                  </div>
                  <motion.button whileHover={{ scale: 1.2, color: "rgba(220,80,80,0.85)" }} whileTap={{ scale: 0.85 }} onClick={() => onDelete(note.id)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: bg.textMuted, fontSize: 13, padding: "0 2px", lineHeight: 1, flexShrink: 0 }}>×</motion.button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   STAR POPUP
═══════════════════════════════════════════════ */
function StarPopup({ note, x, y, boxW }: { note: NoteData; x: number; y: number; boxW: number }) {
  const c = useColor(note.folderId);
  const { folders } = useContext(SettingsCtx);
  const bg = useBg();
  const pw = 180, px = Math.max(4, Math.min(x - pw / 2, boxW - pw - 4));
  const above = y > 100;
  const py = above ? y - STAR_SZ / 2 - 12 : y + STAR_SZ / 2 + 12;
  const d = new Date(note.createdAt);
  return (
    <motion.div initial={{ opacity: 0, y: above ? 6 : -6, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.88 }} transition={{ duration: 0.18 }}
      style={{ position: "absolute", left: px, width: pw, zIndex: 200, ...(above ? { bottom: BOX_H - py } : { top: py }), background: bg.popupBg, border: `1px solid ${c.bg}45`, borderRadius: 10, padding: "10px 12px", boxShadow: `0 8px 24px rgba(0,0,0,0.35)`, pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: Math.min(x - px - 6, pw - 18), width: 0, height: 0, ...(above ? { bottom: -7, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: `7px solid ${c.bg}45` } : { top: -7, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderBottom: `7px solid ${c.bg}45` }) }} />
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
        <LuckyStar size={12} cat={note.folderId} />
        <span style={{ fontSize: 9.5, color: c.mid, fontFamily: "'Noto Sans KR', sans-serif", fontWeight: 600 }}>{folderName(note.folderId, folders)}</span>
        <span style={{ fontSize: 9, color: bg.textMuted, fontFamily: "Georgia, serif", marginLeft: "auto" }}>{d.getMonth() + 1}.{d.getDate()}</span>
      </div>
      <p style={{ margin: 0, fontSize: 12.5, color: bg.textPrimary, fontFamily: "'Noto Sans KR', sans-serif", lineHeight: 1.6, wordBreak: "break-all" }}>{note.text}</p>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════
   BOX STAR
═══════════════════════════════════════════════ */
function BoxStar({ note, index, selectedId, onSelect }: { note: NoteData; index: number; selectedId: string | null; onSelect: (id: string | null, x: number, y: number) => void }) {
  const isSel = selectedId === note.id;
  return (
    <motion.div
      initial={{ y: -60, opacity: 0, scale: 0.5, rotate: note.rot }}
      animate={{ x: note.x - STAR_SZ / 2, y: note.y - STAR_SZ / 2, rotate: note.rot, opacity: 1, scale: isSel ? 1.22 : 1 }}
      exit={{ opacity: 0, scale: 0.3, transition: { duration: 0.16 } }}
      transition={{ type: "spring", stiffness: 135, damping: 14 }}
      whileHover={{ scale: isSel ? 1.22 : 1.12 }}
      onClick={(e) => { e.stopPropagation(); onSelect(isSel ? null : note.id, note.x, note.y); }}
      style={{ position: "absolute", left: 0, top: 0, zIndex: index + 1, cursor: "pointer", filter: isSel ? "brightness(1.25)" : undefined }}
    >
      <LuckyStar cat={note.folderId} />
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════
   OPEN STAR BOX
═══════════════════════════════════════════════ */
function OpenStarBox({ notes, shaking, onShake, yearMonth }: { notes: NoteData[]; shaking: boolean; onShake: () => void; yearMonth: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });
  const bg = useBg();
  const { bgTheme } = useContext(SettingsCtx);

  const selectedNote = notes.find((n) => n.id === selectedId) ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <motion.div
        animate={shaking ? { rotate: [-2.5, 2.5, -3.5, 3.5, -1.5, 1.5, 0], x: [-5, 5, -7, 7, -3, 3, 0] } : {}}
        transition={shaking ? { duration: 0.55 } : { duration: 0.3 }}
        style={{ position: "relative" }}
      >
        <div style={{ height: 8, background: "linear-gradient(90deg, #6B4E0A, #C4921A, #E8C048, #F5D878, #E8C048, #C4921A, #6B4E0A)", borderRadius: "5px 5px 0 0", boxShadow: "0 -1px 4px rgba(0,0,0,0.35)" }} />
        <div style={{ width: BOX_W, height: BOX_H, background: bg.boxInterior, borderLeft: "1.5px solid rgba(196,146,26,0.38)", borderRight: "1.5px solid rgba(196,146,26,0.38)", position: "relative", overflow: "hidden", cursor: "default" }}
          onClick={() => setSelectedId(null)}>
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", backgroundImage: "linear-gradient(rgba(255,255,255,0.012) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.012) 1px, transparent 1px)", backgroundSize: "30px 30px" }} />
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse at 50% 0%, rgba(180,150,60,0.08) 0%, transparent 60%)" }} />
          {notes.length === 0 && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 26, color: bg.emptyColor }}>✦</div>
              <p style={{ margin: 0, fontSize: 11, color: bg.emptyColor, fontFamily: "Georgia, serif", letterSpacing: "0.15em" }}>비어있어요</p>
            </div>
          )}
          <AnimatePresence>
            {notes.map((note, i) => <BoxStar key={note.id} note={note} index={i} selectedId={selectedId} onSelect={(id, x, y) => { setSelectedId(id); setPopupPos({ x, y }); }} />)}
          </AnimatePresence>
          <AnimatePresence>
            {selectedNote && <StarPopup note={selectedNote} x={popupPos.x} y={popupPos.y} boxW={BOX_W} />}
          </AnimatePresence>
        </div>
        <div style={{ borderLeft: "1.5px solid rgba(196,146,26,0.32)", borderRight: "1.5px solid rgba(196,146,26,0.32)", borderBottom: "1.5px solid rgba(196,146,26,0.32)", borderRadius: "0 0 5px 5px", background: bgTheme === "sky" ? "rgba(255,255,255,0.65)" : "linear-gradient(180deg, #0f0d1e, #09071a)", padding: "7px 16px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11.5, color: bgTheme === "sky" ? "rgba(50,50,70,0.60)" : "rgba(200,175,100,0.62)", fontFamily: "Georgia, serif", letterSpacing: "0.08em" }}>{fmtMonth(yearMonth)}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {notes.length > 0 && <span style={{ fontSize: 10.5, color: bg.textMuted, fontFamily: "Georgia, serif" }}>★ {notes.length}</span>}
            {notes.length > 0 && (
              <motion.button whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }} onClick={onShake}
                style={{ padding: "3px 10px", background: bg.accentBtn, border: `1px solid ${bg.accentBtnBorder}`, borderRadius: 12, color: bg.accentBtnText, fontSize: 10, fontFamily: "Georgia, serif", cursor: "pointer" }}>흔들기</motion.button>
            )}
          </div>
        </div>
        <div style={{ position: "absolute", left: -5, top: 8, bottom: 0, width: 5, background: "linear-gradient(90deg, rgba(0,0,0,0.12), rgba(0,0,0,0.04))", borderRadius: "2px 0 0 2px" }} />
        <div style={{ position: "absolute", right: -5, top: 8, bottom: 0, width: 5, background: "linear-gradient(90deg, rgba(0,0,0,0.04), rgba(0,0,0,0.12))", borderRadius: "0 2px 2px 0" }} />
      </motion.div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   PAPER BOAT (archive)
═══════════════════════════════════════════════ */
function PaperBoatShape({ width: w, height: h }: { width: number; height: number }) {
  const cx = w / 2, peak = h * 0.14, mid = h * 0.55, bottom = h * 0.88;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <defs>
        <filter id="bShadow"><feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="rgba(0,0,0,0.28)" /></filter>
        <linearGradient id="bLeft" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="rgba(255,255,255,0.93)" /><stop offset="100%" stopColor="rgba(240,242,255,0.88)" /></linearGradient>
        <linearGradient id="bRight" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="rgba(232,234,252,0.90)" /><stop offset="100%" stopColor="rgba(218,222,248,0.86)" /></linearGradient>
        <linearGradient id="bHull" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(250,250,255,0.92)" /><stop offset="100%" stopColor="rgba(225,228,250,0.88)" /></linearGradient>
      </defs>
      <path d={`M${w*.08},${mid} Q${cx},${bottom} ${w*.92},${mid} L${w*.88},${mid*1.05} Q${cx},${h} ${w*.12},${mid*1.05} Z`} fill="url(#bHull)" filter="url(#bShadow)" stroke="rgba(200,205,225,0.55)" strokeWidth="1" />
      <polygon points={`${w*.08},${mid} ${cx},${peak} ${cx},${mid}`} fill="url(#bLeft)" stroke="rgba(200,205,225,0.50)" strokeWidth="0.8" />
      <polygon points={`${w*.92},${mid} ${cx},${peak} ${cx},${mid}`} fill="url(#bRight)" stroke="rgba(200,205,225,0.50)" strokeWidth="0.8" />
      <line x1={cx} y1={peak} x2={cx} y2={mid} stroke="rgba(170,175,210,0.40)" strokeWidth="0.8" strokeDasharray="3,2" />
      <line x1={w*.08} y1={mid} x2={w*.92} y2={mid} stroke="rgba(180,185,215,0.55)" strokeWidth="1.2" />
    </svg>
  );
}

type BoatState = "collapsed" | "popped" | "expanded";
function PaperBoat({ yearMonth, notes }: { yearMonth: string; notes: NoteData[] }) {
  const [state, setState] = useState<BoatState>("collapsed");
  const [selId, setSelId] = useState<string | null>(null);
  const bg = useBg();
  const SW = 110, SH = 78, EW = 340, EH = 220;
  const SZ = { x1: 30, y1: 26, x2: 310, y2: 118 };
  function starPos(note: NoteData, idx: number) {
    const cols = 5, col = idx % cols, row = Math.floor(idx / cols);
    const cw = (SZ.x2 - SZ.x1) / cols, ch = Math.min(36, (SZ.y2 - SZ.y1) / 2);
    const jx = Math.sin(idx * 53.1 + col) * cw * 0.28, jy = Math.cos(idx * 71.3 + row) * ch * 0.35;
    return { x: Math.max(SZ.x1 + 10, Math.min(SZ.x1 + col * cw + cw / 2 + jx, SZ.x2 - 10)), y: Math.max(SZ.y1 + 8, Math.min(SZ.y1 + row * ch + ch / 2 + jy, SZ.y2)), rot: Math.sin(idx * 131.7) * 25 };
  }
  const selNote = notes.find((n) => n.id === selId) ?? null;
  return (
    <>
      <motion.div
        animate={{ scale: state === "popped" ? 1.28 : 1, y: state === "popped" ? -10 : 0, filter: state === "popped" ? "drop-shadow(0 12px 24px rgba(0,0,0,0.45))" : "drop-shadow(0 2px 8px rgba(0,0,0,0.22))" }}
        transition={{ type: "spring", stiffness: 200, damping: 18 }}
        style={{ position: "relative", width: SW, height: SH, cursor: "pointer", flexShrink: 0 }}
        onClick={() => { if (state === "collapsed") setState("popped"); else if (state === "popped") setState("expanded"); }}
      >
        <PaperBoatShape width={SW} height={SH} />
        <div style={{ position: "absolute", bottom: 8, left: 0, right: 0, textAlign: "center" }}>
          <span style={{ fontSize: 9, color: "rgba(120,125,160,0.72)", fontFamily: "Georgia, serif" }}>{fmtMonth(yearMonth)}</span>
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 14, display: "flex", justifyContent: "center", gap: 3, flexWrap: "wrap", padding: "0 18px" }}>
          {notes.slice(0, 8).map((n, i) => <div key={n.id} style={{ transform: `rotate(${(i % 5 - 2) * 12}deg) translateY(${i % 2 * 3}px)` }}><LuckyStar size={11} cat={n.folderId} /></div>)}
          {notes.length > 8 && <span style={{ fontSize: 8.5, color: "rgba(150,155,185,0.60)", alignSelf: "center", fontFamily: "Georgia, serif" }}>+{notes.length - 8}</span>}
        </div>
        {state === "popped" && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ position: "absolute", bottom: -18, left: "50%", transform: "translateX(-50%)", fontSize: 9, color: "rgba(120,115,160,0.55)", whiteSpace: "nowrap", fontFamily: "Georgia, serif" }}>다시 눌러 확대</motion.div>}
      </motion.div>
      <AnimatePresence>
        {state === "expanded" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, background: bg.overlayBg, backdropFilter: "blur(10px)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={() => { setState("collapsed"); setSelId(null); }}>
            <motion.div initial={{ opacity: 0, scale: 0.88, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.90 }} transition={{ type: "spring", stiffness: 180, damping: 20 }}
              onClick={(e) => e.stopPropagation()} style={{ position: "relative", width: EW, height: EH }}>
              <PaperBoatShape width={EW} height={EH} />
              <div style={{ position: "absolute", inset: 0, overflow: "hidden" }} onClick={() => setSelId(null)}>
                {notes.map((note, i) => {
                  const pos = starPos(note, i); const isSel = selId === note.id;
                  return (
                    <motion.div key={note.id} initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: isSel ? 1.25 : 1 }}
                      style={{ position: "absolute", left: pos.x - STAR_SZ / 2, top: pos.y - STAR_SZ / 2, rotate: pos.rot, zIndex: i + 1, cursor: "pointer" }}
                      onClick={(e) => { e.stopPropagation(); setSelId(isSel ? null : note.id); }}>
                      <LuckyStar cat={note.folderId} />
                    </motion.div>
                  );
                })}
                <AnimatePresence>
                  {selNote && (
                    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      style={{ position: "absolute", left: 20, top: SZ.y2 + 4, right: 20, background: "rgba(20,16,38,0.88)", border: "1px solid rgba(200,200,255,0.20)", borderRadius: 8, padding: "8px 12px", zIndex: 500, pointerEvents: "none" }}>
                      <p style={{ margin: 0, fontSize: 12.5, color: "#EEE9DC", fontFamily: "'Noto Sans KR', sans-serif", lineHeight: 1.6 }}>{selNote.text}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div style={{ position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)" }}>
                <span style={{ fontSize: 11, color: "rgba(120,125,165,0.68)", fontFamily: "Georgia, serif" }}>{fmtMonth(yearMonth)} · ★ {notes.length}</span>
              </div>
              <button onClick={() => { setState("collapsed"); setSelId(null); }}
                style={{ position: "absolute", top: -14, right: -14, width: 30, height: 30, borderRadius: "50%", background: "rgba(200,175,100,0.12)", border: "1px solid rgba(200,175,100,0.28)", color: "rgba(200,175,100,0.65)", fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ═══════════════════════════════════════════════
   CATEGORY PICKER (double-click to rename)
═══════════════════════════════════════════════ */
function CategoryPicker({ folders, selectedFolderId, onSelect, onAdd, onRename }: {
  folders: ConcernFolder[]; selectedFolderId: string;
  onSelect: (folderId: string) => void;
  onAdd: () => void;
  onRename: (folderId: string, newName: string) => void;
}) {
  const bg = useBg();
  const { colorTheme } = useContext(SettingsCtx);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit(folder: ConcernFolder) {
    setEditingFolderId(folder.id);
    setDraft(folder.name);
    setTimeout(() => inputRef.current?.select(), 30);
  }
  function commitEdit() {
    const editingFolder = folders.find((folder) => folder.id === editingFolderId);
    if (editingFolder && draft.trim() && draft.trim() !== editingFolder.name) {
      onRename(editingFolder.id, draft.trim());
    }
    setEditingFolderId(null);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span style={{ fontSize: 9, letterSpacing: "0.20em", color: bg.sectionLabel, textTransform: "uppercase", fontFamily: "Georgia, serif", flexShrink: 0 }}>고민 폴더</span>
      {folders.map((folder) => {
        const c = getColorByIndex(folder.colorKey, colorTheme);
        const isSel = selectedFolderId === folder.id;
        const isEditing = editingFolderId === folder.id;
        return (
          <div key={folder.id} style={{ position: "relative" }}>
            {isEditing ? (
              <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingFolderId(null); }}
                style={{ width: Math.max(52, draft.length * 11 + 12), padding: "2px 7px", background: bg.inputBg, border: `1.5px solid ${c.bg}70`, borderRadius: 20, color: c.mid, fontSize: 11, fontFamily: "'Noto Sans KR', sans-serif", outline: "none", fontWeight: 600 }}
                autoFocus
              />
            ) : (
              <motion.button
                whileHover={{ scale: 1.07 }} whileTap={{ scale: 0.92 }}
                onClick={() => onSelect(folder.id)}
                onDoubleClick={() => startEdit(folder)}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 8px 3px 5px", background: isSel ? `${c.bg}1e` : bg.btnBg, border: `1px solid ${isSel ? c.bg + "55" : bg.btnBorder}`, borderRadius: 20, cursor: "pointer", outline: "none", boxShadow: isSel ? `0 0 10px ${c.glow}` : "none", transition: "all 0.17s", userSelect: "none" }}
                title="더블클릭으로 이름 수정"
              >
                <LuckyStar size={11} cat={folder.id} />
                <span style={{ fontSize: 11, color: isSel ? c.bg : bg.textPrimary, fontFamily: "'Noto Sans KR', sans-serif", fontWeight: isSel ? 700 : 400 }}>{folder.name}</span>
              </motion.button>
            )}
          </div>
        );
      })}
      <motion.button whileHover={{ scale: 1.10 }} whileTap={{ scale: 0.88 }} onClick={onAdd} title="고민 폴더 추가"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, background: bg.btnBg, border: `1px dashed ${bg.btnBorder}`, borderRadius: "50%", cursor: "pointer", color: bg.textMuted, fontSize: 14, lineHeight: 1, padding: 0 }}>+</motion.button>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   SETTINGS PANEL
═══════════════════════════════════════════════ */
function SettingsPanel({ settings, onSave, onClose }: { settings: AppSettings; onSave: (s: Partial<AppSettings>) => void; onClose: () => void }) {
  const [colorTheme, setColorTheme] = useState(settings.colorTheme);
  const [bgTheme, setBgTheme] = useState(settings.bgTheme);
  const [characterPrompt, setCharacterPrompt] = useState(settings.characterPrompt);
  const [characterName, setCharacterName] = useState(settings.characterName);
  const bg = BG[bgTheme];

  function save() { onSave({ colorTheme, bgTheme, characterPrompt, characterName }); onClose(); }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: "fixed", inset: 0, background: bg.overlayBg, backdropFilter: "blur(8px)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div initial={{ opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}
        style={{ width: "100%", maxWidth: 380, maxHeight: "90vh", overflowY: "auto", background: bg.modalBg, border: `1px solid ${bg.modalBorder}`, borderRadius: 16, padding: "26px 22px 22px", boxShadow: "0 24px 64px rgba(0,0,0,0.40)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <h3 style={{ margin: 0, fontSize: 15, color: bg.headingColor, fontFamily: "'Noto Serif KR', Georgia, serif", fontWeight: 700 }}>설정</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: bg.textMuted, fontSize: 18, cursor: "pointer" }}>×</button>
        </div>

        <p style={{ margin: "0 0 8px", fontSize: 10, letterSpacing: "0.20em", color: bg.sectionLabel, textTransform: "uppercase", fontFamily: "Georgia, serif" }}>배경 테마</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          {([["dark", "🌙 어두운 밤"], ["sky", "☀️ 하늘빛"]] as [BackgroundTheme, string][]).map(([t, label]) => (
            <motion.button key={t} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={() => setBgTheme(t)}
              style={{ flex: 1, padding: "9px 0", background: bgTheme === t ? bg.accentBtn : bg.btnBg, border: `1px solid ${bgTheme === t ? bg.accentBtnBorder : bg.btnBorder}`, borderRadius: 9, cursor: "pointer", color: bgTheme === t ? bg.accentBtnText : bg.textMuted, fontSize: 12, fontFamily: "'Noto Sans KR', sans-serif", fontWeight: bgTheme === t ? 700 : 400 }}>{label}</motion.button>
          ))}
        </div>

        <p style={{ margin: "0 0 8px", fontSize: 10, letterSpacing: "0.20em", color: bg.sectionLabel, textTransform: "uppercase", fontFamily: "Georgia, serif" }}>별 색상 테마</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          {([["pastel", "파스텔"], ["neon", "네온"]] as [ColorTheme, string][]).map(([t, label]) => (
            <motion.button key={t} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={() => setColorTheme(t)}
              style={{ flex: 1, padding: "9px 0", background: colorTheme === t ? bg.accentBtn : bg.btnBg, border: `1px solid ${colorTheme === t ? bg.accentBtnBorder : bg.btnBorder}`, borderRadius: 9, cursor: "pointer", color: colorTheme === t ? bg.accentBtnText : bg.textMuted, fontSize: 12, fontFamily: "'Noto Sans KR', sans-serif", fontWeight: colorTheme === t ? 700 : 400 }}>{label}</motion.button>
          ))}
        </div>

        <p style={{ margin: "0 0 8px", fontSize: 10, letterSpacing: "0.20em", color: bg.sectionLabel, textTransform: "uppercase", fontFamily: "Georgia, serif" }}>AI 캐릭터 설정</p>
        <input value={characterName} onChange={(e) => setCharacterName(e.target.value)} placeholder="캐릭터 이름 (예: 토끼 친구)"
          style={{ width: "100%", boxSizing: "border-box", marginBottom: 7, padding: "8px 10px", background: bg.inputBg, border: `1px solid ${bg.inputBorder}`, borderRadius: 7, color: bg.textPrimary, fontSize: 12.5, fontFamily: "'Noto Sans KR', sans-serif", outline: "none" }} />
        <textarea value={characterPrompt} onChange={(e) => setCharacterPrompt(e.target.value)} placeholder="캐릭터 프롬프트 (예: 따뜻한 언니처럼 공감해줘)" rows={3}
          style={{ width: "100%", boxSizing: "border-box", marginBottom: 18, padding: "8px 10px", background: bg.inputBg, border: `1px solid ${bg.inputBorder}`, borderRadius: 7, color: bg.textPrimary, fontSize: 12.5, fontFamily: "'Noto Sans KR', sans-serif", outline: "none", resize: "vertical", lineHeight: 1.5 }} />

        <button onClick={save} style={{ width: "100%", padding: "10px 0", background: bg.accentBtn, border: `1px solid ${bg.accentBtnBorder}`, borderRadius: 9, color: bg.accentBtnText, fontSize: 13, fontWeight: 700, fontFamily: "'Noto Sans KR', sans-serif", cursor: "pointer" }}>저장하기</button>
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════
   RESULT PAPER
═══════════════════════════════════════════════ */
function ResultPaper({ record, error, isLoading, activeType, selectedFolder, onSave, onEmail, instantSubmitted, onFeedback }: { record: AnalysisRecord | null; error: string | null; isLoading: boolean; activeType: AnalysisType | null; selectedFolder: ConcernFolder | null; onSave: (record: AnalysisRecord) => void; onEmail: (record: AnalysisRecord, folder: ConcernFolder | null) => void; instantSubmitted: boolean; onFeedback: (payload: Record<string, unknown>) => Promise<void> }) {
  if (!activeType) return null;
  const m = ANALYSIS_META[activeType];
  return (
    <motion.div initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }} transition={{ duration: 0.48, ease: [0.16, 1, 0.3, 1] }} style={{ width: "100%", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ position: "relative", background: "linear-gradient(158deg, #F9F2DA 0%, #F2E5B2 30%, #EDD89A 62%, #F4EBC4 100%)", borderRadius: "3px", padding: "28px 36px 32px", overflow: "hidden", boxShadow: "0 10px 50px rgba(0,0,0,0.38), 0 2px 8px rgba(0,0,0,0.16)" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg, transparent, rgba(140,90,25,0.22), transparent)" }} />
        {["tl","tr","bl","br"].map((p) => <div key={p} style={{ position: "absolute", top: p[0]==="t"?9:undefined, bottom: p[0]==="b"?9:undefined, left: p[1]==="l"?12:undefined, right: p[1]==="r"?12:undefined, fontSize: 12, color: "rgba(140,90,28,0.26)", lineHeight: 1, transform: p==="tr"?"scaleX(-1)":p==="bl"?"scaleY(-1)":p==="br"?"scale(-1,-1)":undefined }}>❧</div>)}
        {Array.from({length:12},(_,i)=>(<div key={i} style={{position:"absolute",left:32,right:32,top:96+i*26,height:"0.5px",background:"rgba(140,90,25,0.08)"}}/>))}
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ display: "inline-block", width: 10, height: 10, background: m.sq, borderRadius: "2px", marginBottom: 8, boxShadow: `0 0 10px ${m.sq}88`, transform: "rotate(12deg)" }} />
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#32180A", fontFamily: "'Noto Serif KR', Georgia, serif", letterSpacing: "0.08em" }}>
            {selectedFolder ? `"${selectedFolder.name}" · ` : ""}{m.label}
          </h2>
          {record?.characterName && <div style={{ marginTop: 4, fontSize: 10, color: "rgba(80,40,10,0.52)", fontFamily: "Georgia, serif", fontStyle: "italic" }}>— {record.characterName}</div>}
          <div style={{ marginTop: 8, height: 1, background: "linear-gradient(90deg, transparent, rgba(120,75,20,0.28), transparent)" }} />
        </div>
        <div>
          {isLoading ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "16px 0" }}>
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2.2, ease: "linear" }} style={{ fontSize: 18, color: "rgba(120,75,20,0.45)" }}>✦</motion.div>
              <p style={{ margin: 0, fontSize: 12.5, color: "rgba(80,48,12,0.45)", fontFamily: "Georgia, serif", fontStyle: "italic" }}>고민 조각들을 읽고 있어요…</p>
            </div>
          ) : error ? (
            <p style={{ margin: "8px 0", fontSize: 13, color: "rgba(120,55,20,0.78)", fontFamily: "'Noto Sans KR', sans-serif", lineHeight: 1.7, textAlign: "center" }}>{error}</p>
          ) : record ? (
            <AnimatePresence mode="wait">
              <motion.div key={record.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.40 }}>
                {record.content.split("\n\n").filter(Boolean).map((para, i, arr) => (
                  <p key={i} style={{ margin: 0, marginBottom: i < arr.length - 1 ? 14 : 0, fontSize: 13.5, color: "#2C1B07", fontFamily: "'Noto Serif KR', Georgia, serif", lineHeight: 1.88, textAlign: "justify" }}>{para.replace(/\n/g, " ")}</p>
                ))}
                <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 18 }}>
                  <button onClick={() => onSave(record)} disabled={record.isSaved}
                    style={{ padding: "7px 14px", background: record.isSaved ? "rgba(120,75,20,0.08)" : "rgba(120,75,20,0.14)", border: "1px solid rgba(120,75,20,0.24)", borderRadius: 8, color: "#5B3512", fontSize: 11, cursor: record.isSaved ? "default" : "pointer" }}>
                    {record.isSaved ? "저장됨" : "저장하기"}
                  </button>
                  <button onClick={() => onEmail(record, selectedFolder)}
                    style={{ padding: "7px 14px", background: "rgba(120,75,20,0.10)", border: "1px solid rgba(120,75,20,0.24)", borderRadius: 8, color: "#5B3512", fontSize: 11, cursor: "pointer" }}>
                    이메일로 전송
                  </button>
                </div>
                <InstantFeedback record={record} submitted={instantSubmitted} onSubmit={onFeedback} />
                <div style={{ marginTop: 18, textAlign: "center" }}>
                  <div style={{ height: 1, background: "linear-gradient(90deg, transparent, rgba(120,75,20,0.24), transparent)", marginBottom: 8 }} />
                  <span style={{ fontSize: 10, color: "rgba(110,65,15,0.36)", fontFamily: "Georgia, serif", letterSpacing: "0.14em" }}>✦ 별별고민 ✦</span>
                </div>
              </motion.div>
            </AnimatePresence>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}

function SavedAdvicePanel({ records, folders, onClose, onEmail }: { records: AnalysisRecord[]; folders: ConcernFolder[]; onClose: () => void; onEmail: (record: AnalysisRecord, folder: ConcernFolder | null) => void }) {
  const bg = useBg();
  const sorted = useMemo(() => [...records].sort((a, b) => b.analyzedAt.localeCompare(a.analyzedAt)), [records]);
  const [selectedId, setSelectedId] = useState<string | null>(sorted[0]?.id ?? null);
  const selected = sorted.find((record) => record.id === selectedId) ?? null;
  const folderFor = (record: AnalysisRecord) => folders.find((folder) => folder.id === record.folderId) ?? null;
  const labelFor = (type: AnalysisType) => type === "T" ? "T적 조언" : type === "F" ? "F적 조언" : "패턴 찾기";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 110, background: bg.overlayBg, backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        style={{ width: "100%", maxWidth: 760, maxHeight: "82vh", overflow: "auto", background: bg.modalBg, border: `1px solid ${bg.modalBorder}`, borderRadius: 18, padding: 24, boxShadow: "0 24px 64px rgba(0,0,0,0.40)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <h2 style={{ margin: 0, color: bg.headingColor, fontSize: 18, fontFamily: "'Noto Serif KR', Georgia, serif" }}>저장된 조언</h2>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: bg.textSecondary, cursor: "pointer", fontSize: 18 }}>×</button>
        </div>
        {sorted.length === 0 ? (
          <p style={{ margin: "30px 0", color: bg.textMuted, textAlign: "center", fontSize: 12 }}>저장된 조언이 없습니다.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 0.8fr) minmax(280px, 1.4fr)", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sorted.map((record) => {
                const folder = folderFor(record);
                return (
                  <button key={record.id} onClick={() => setSelectedId(record.id)}
                    style={{ textAlign: "left", padding: 12, background: selectedId === record.id ? bg.accentBtn : bg.btnBg, border: `1px solid ${selectedId === record.id ? bg.accentBtnBorder : bg.btnBorder}`, borderRadius: 10, color: bg.textPrimary, cursor: "pointer" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{folder?.name ?? "알 수 없는 고민"} · {labelFor(record.type)}</div>
                    <div style={{ fontSize: 9.5, color: bg.textMuted, marginBottom: 6 }}>{new Date(record.analyzedAt).toLocaleDateString("ko-KR")}</div>
                    <div style={{ fontSize: 10.5, color: bg.textSecondary, lineHeight: 1.45, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any }}>{record.content}</div>
                  </button>
                );
              })}
            </div>
            {selected && (
              <div style={{ padding: 18, background: bg.cardBg, border: `1px solid ${bg.cardBorder}`, borderRadius: 12 }}>
                <h3 style={{ margin: "0 0 5px", color: bg.headingColor, fontSize: 14 }}>{folderFor(selected)?.name ?? "알 수 없는 고민"} · {labelFor(selected.type)}</h3>
                <div style={{ marginBottom: 14, fontSize: 10, color: bg.textMuted }}>{new Date(selected.analyzedAt).toLocaleDateString("ko-KR")}</div>
                <div style={{ color: bg.textPrimary, fontSize: 12.5, lineHeight: 1.75, whiteSpace: "pre-wrap" }}>{selected.content}</div>
                <button onClick={() => onEmail(selected, folderFor(selected))}
                  style={{ marginTop: 16, padding: "7px 13px", background: bg.accentBtn, border: `1px solid ${bg.accentBtnBorder}`, borderRadius: 8, color: bg.accentBtnText, fontSize: 11, cursor: "pointer" }}>이메일로 전송</button>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════
   LOGIN MODAL
═══════════════════════════════════════════════ */
function LoginModal({ onLogin, onClose }: { onLogin: (u: UserSession) => void; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [done, setDone] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const bg = useBg();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password || isSubmitting) return;
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      if (mode === "signUp") {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (data.session && data.user) onLogin({ id: data.user.id, email: data.user.email ?? email.trim(), displayName: data.user.email?.split("@")[0] ?? null });
        setDone(true);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        if (!data.user) throw new Error("로그인 정보를 확인하지 못했습니다.");
        onLogin({ id: data.user.id, email: data.user.email ?? email.trim(), displayName: data.user.email?.split("@")[0] ?? null });
        setDone(true);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "로그인 처리 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: "fixed", inset: 0, background: bg.overlayBg, backdropFilter: "blur(8px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}
        style={{ width: "100%", maxWidth: 340, background: bg.modalBg, border: `1px solid ${bg.modalBorder}`, borderRadius: 18, padding: "30px 26px 26px", boxShadow: "0 24px 64px rgba(0,0,0,0.40)" }}>
        {done ? (
          <div style={{ textAlign: "center", padding: "14px 0" }}>
            {mode === "signUp" && <p style={{ margin: "0 0 12px", color: bg.textSecondary, fontSize: 12, lineHeight: 1.6 }}>가입 확인 이메일을 보냈습니다. 이메일 인증 후 로그인해 주세요.</p>}
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200 }}
              style={{ fontSize: 38, marginBottom: 14 }}>✦</motion.div>
            <p style={{ margin: "0 0 6px", color: bg.headingColor, fontSize: 16, fontFamily: "'Noto Serif KR', Georgia, serif", fontWeight: 700 }}>반가워요!</p>
            <p style={{ margin: 0, color: bg.textMuted, fontSize: 12, fontFamily: "'Noto Sans KR', sans-serif", lineHeight: 1.6 }}>이제 고민들을 저장하고 이어갈 수 있어요.</p>
          </div>
        ) : (
          <>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>☕</div>
              <h2 style={{ margin: "0 0 10px", fontSize: 18, color: bg.headingColor, fontFamily: "'Noto Serif KR', Georgia, serif", fontWeight: 700 }}>{mode === "signIn" ? "로그인" : "회원가입"}</h2>
              <p style={{ margin: 0, fontSize: 12, color: bg.textMuted, fontFamily: "'Noto Sans KR', sans-serif", lineHeight: 1.75 }}>
                로그인하면 지금 담은 고민들을 잃지 않고<br />나중에 언제든 다시 꺼내볼 수 있어요.<br />
                <span style={{ fontSize: 10.5, opacity: 0.7 }}>찻장은 항상 여기 있을게요 ✦</span>
              </p>
            </div>
            <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일" required
                style={{ padding: "11px 13px", background: bg.inputBg, border: `1px solid ${bg.inputBorder}`, borderRadius: 9, color: bg.textPrimary, fontSize: 13.5, fontFamily: "'Noto Sans KR', sans-serif", outline: "none" }} />
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="비밀번호" minLength={6} required
                style={{ padding: "11px 13px", background: bg.inputBg, border: `1px solid ${bg.inputBorder}`, borderRadius: 9, color: bg.textPrimary, fontSize: 13.5, fontFamily: "'Noto Sans KR', sans-serif", outline: "none" }} />
              <motion.button type="submit" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} disabled={isSubmitting}
                style={{ padding: "11px 0", background: bg.accentBtn, border: `1px solid ${bg.accentBtnBorder}`, borderRadius: 9, color: bg.accentBtnText, fontSize: 13.5, fontWeight: 700, fontFamily: "'Noto Sans KR', sans-serif", cursor: "pointer" }}>
                {mode === "signIn" ? "로그인" : "회원가입"}
              </motion.button>
              {errorMessage && <p style={{ margin: "2px 0 0", color: "#d45a5a", fontSize: 11, lineHeight: 1.5 }}>{errorMessage}</p>}
            </form>
            <button onClick={() => { setMode((value) => value === "signIn" ? "signUp" : "signIn"); setErrorMessage(null); }}
              style={{ marginTop: 10, width: "100%", padding: "4px 0", background: "transparent", border: "none", color: bg.textSecondary, fontSize: 11, cursor: "pointer" }}>
              {mode === "signIn" ? "계정이 없나요? 회원가입" : "이미 계정이 있나요? 로그인"}
            </button>
            <button onClick={onClose} style={{ marginTop: 13, width: "100%", padding: "6px 0", background: "transparent", border: "none", color: bg.textMuted, fontSize: 11, fontFamily: "Georgia, serif", letterSpacing: "0.08em", cursor: "pointer" }}>
              괜찮아요, 나중에 할게요
            </button>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════
   APP
═══════════════════════════════════════════════ */
export default function App() {
  const [box, setBox] = useState<BoxData>(makeBox);
  const [auth, setAuth] = useState<AuthState>({ status: "guest" });
  const [authLoading, setAuthLoading] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>({
    colorTheme: "pastel", bgTheme: "dark",
    characterPrompt: "", characterName: "",
  });
  const [selectedFolderId, setSelectedFolderId] = useState(() => box.folders[0]?.id ?? "");
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [shaking, setShaking] = useState(false);
  const [shakeInput, setShakeInput] = useState(false);
  const [activeAnalysis, setActiveAnalysis] = useState<AnalysisType | null>(null);
  const [resultFolderId, setResultFolderId] = useState<string | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSavedAdvice, setShowSavedAdvice] = useState(false);
  const [showBeta, setShowBeta] = useState(false);
  const [betaStatus, setBetaStatus] = useState<BetaStatus | null>(null);
  const [betaUnavailable, setBetaUnavailable] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const loadGenerationRef = useRef(0);

  const ym = currentYM();
  const bg = BG[settings.bgTheme];

  useEffect(() => {
    let active = true;

    async function loadUserData(userId: string, email: string | null, accessToken?: string) {
      const generation = ++loadGenerationRef.current;
      setAuth({ status: "authenticated", user: { id: userId, email: email ?? "", displayName: email?.split("@")[0] ?? null } });
      setBetaUnavailable(false);

      const foldersPromise = supabase.from("folders").select("id, name, color_key, created_at").order("created_at", { ascending: true });
      const notesPromise = loadEncryptedNotes(accessToken);
      const analysisPromise = loadEncryptedAnalysisHistory(accessToken);
      const betaPromise = loadBetaStatus(accessToken);
      const optionalResultsPromise = Promise.allSettled([analysisPromise, betaPromise]);
      const [foldersSettled, notesSettled] = await Promise.allSettled([foldersPromise, notesPromise]);

      if (!active || generation !== loadGenerationRef.current) return;
      const loadErrors: string[] = [];
      let folders: ConcernFolder[] = [];
      let notes: NoteData[] = [];

      if (foldersSettled.status === "fulfilled" && !foldersSettled.value.error) {
        folders = (foldersSettled.value.data ?? []).map((folder) => ({ id: folder.id, name: folder.name, colorKey: folder.color_key, createdAt: folder.created_at }));
      } else {
        loadErrors.push("고민 폴더를 불러오지 못했습니다.");
      }

      if (notesSettled.status === "fulfilled") {
        notes = sortNotesByDisplayOrder(notesSettled.value.notes.map((note, index) => {
          const position = pilePos(index);
          return { id: note.id, text: note.text, folderId: note.folder_id, createdAt: note.created_at, updatedAt: note.updated_at, x: position.x, y: position.y, rot: position.rot };
        }));
      } else {
        loadErrors.push("저장된 메모를 불러오지 못했습니다. 로그인 상태와 서버 연결을 확인해주세요.");
      }

      setBox((previous) => ({ ...previous, folders, notes, analysisHistory: [], updatedAt: nowISO() }));
      setSelectedFolderId(folders[0]?.id ?? "");
      setActiveFolderId(null);
      setStorageError(loadErrors.length > 0 ? loadErrors.join(" ") : null);

      const [analysisSettled, betaSettled] = await optionalResultsPromise;
      if (!active || generation !== loadGenerationRef.current) return;

      if (analysisSettled.status === "fulfilled") {
        const analysisHistory: AnalysisRecord[] = analysisSettled.value.analysisHistory.map((record) => ({
          id: record.id, folderId: record.folder_id, type: record.type as AnalysisType,
          content: stripMarkdown(record.content), analyzedAt: record.created_at,
          noteCount: record.note_count ?? 0, notesSignature: record.notes_signature ?? "",
          promptVersion: record.prompt_version ?? "", isSaved: record.is_saved,
          yearMonth: record.created_at.slice(0, 7), characterName: record.character_name ?? undefined,
        }));
        setBox((previous) => ({ ...previous, analysisHistory, updatedAt: nowISO() }));
      } else {
        setStorageError((previous) => [previous, "저장된 조언은 현재 불러올 수 없습니다."].filter(Boolean).join(" "));
      }

      if (betaSettled.status === "fulfilled") {
        setBetaStatus(betaSettled.value);
      } else {
        setBetaStatus(null);
        setBetaUnavailable(true);
      }
    }

    async function syncSession() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;
      if (session?.user) await loadUserData(session.user.id, session.user.email ?? null, session.access_token);
      else {
        setAuth({ status: "guest" });
        setBox(makeBox());
      }
      if (active) setAuthLoading(false);
    }

    void syncSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) void loadUserData(session.user.id, session.user.email ?? null, session.access_token);
      else if (active) {
        setAuth({ status: "guest" });
        setBox(makeBox());
        setSelectedFolderId("");
        setActiveFolderId(null);
        setActiveAnalysis(null);
        setResultFolderId(null);
        setBetaStatus(null);
        setBetaUnavailable(false);
      }
    });

    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const notesByMonth = useMemo(() => {
    const map = new Map<string, NoteData[]>();
    for (const n of box.notes) { const k = n.createdAt.slice(0, 7); if (!map.has(k)) map.set(k, []); map.get(k)!.push(n); }
    return map;
  }, [box.notes]);

  const currentNotes = notesByMonth.get(ym) ?? [];
  const archivedMonths = [...notesByMonth.keys()].filter((k) => k !== ym).sort().reverse();

  function updateBox(fn: (p: BoxData) => BoxData) {
    setBox((previous) => {
      const next = fn(previous);
      return { ...next, notes: sortNotesByDisplayOrder(next.notes), updatedAt: nowISO() };
    });
  }

  function requireAuthenticatedUser() {
    if (auth.status === "authenticated") return auth.user;
    setStorageError("로그인 후 고민 기록을 저장할 수 있습니다.");
    setShowLogin(true);
    return null;
  }

  async function addNote() {
    if (!text.trim()) { setShakeInput(true); setTimeout(() => setShakeInput(false), 440); textareaRef.current?.focus(); return; }
    const user = requireAuthenticatedUser();
    if (!user) return;
    const folderId = box.folders.some((folder) => folder.id === selectedFolderId) ? selectedFolderId : box.folders[0]?.id;
    if (!folderId) return;
    const pos = pilePos(currentNotes.length);
    const now = nowISO();
    try {
      const { note: data } = await createEncryptedNote(folderId, text.trim(), now);
      updateBox((prev) => ({ ...prev, notes: [...prev.notes, { id: data.id, text: data.text, folderId: data.folder_id, createdAt: data.created_at, updatedAt: data.updated_at, x: pos.x, y: pos.y, rot: pos.rot }] }));
    } catch (error) { setStorageError(error instanceof Error ? error.message : "메모를 저장하지 못했습니다."); return; }
    setStorageError(null);
    setText(""); textareaRef.current?.focus();
  }

  const handleShake = useCallback(() => {
    if (currentNotes.length === 0) return;
    setShaking(true);
    updateBox((prev) => ({ ...prev, notes: prev.notes.map((n) => { if (n.createdAt.slice(0, 7) !== ym) return n; const p = shakePos(); return { ...n, x: p.x, y: p.y, rot: p.rot }; }) }));
    setTimeout(() => setShaking(false), 700);
  }, [currentNotes.length, ym]);

  async function deleteNote(id: string) {
    if (!requireAuthenticatedUser()) return;
    try { await deleteEncryptedNotes([id]); } catch (error) { setStorageError(error instanceof Error ? error.message : "메모를 삭제하지 못했습니다."); return; }
    updateBox((prev) => ({ ...prev, notes: prev.notes.filter((n) => n.id !== id) }));
    setStorageError(null);
  }

  async function deleteAllNotes() {
    if (!requireAuthenticatedUser() || box.notes.length === 0) return;
    const ids = box.notes.map((note) => note.id);
    try { await deleteEncryptedNotes(ids); } catch (error) { setStorageError(error instanceof Error ? error.message : "메모를 삭제하지 못했습니다."); return; }
    updateBox((prev) => ({ ...prev, notes: [] }));
    setStorageError(null);
  }

  async function updateNoteDate(id: string, dateValue: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return;
    if (!requireAuthenticatedUser()) return;
    const existing = box.notes.find((note) => note.id === id);
    if (!existing) return;
    const createdAt = replaceDateKeepingTime(existing.createdAt, dateValue);
    let data;
    try { ({ note: data } = await updateEncryptedNote(id, { createdAt })); } catch (error) { setStorageError(error instanceof Error ? error.message : "메모 날짜를 수정하지 못했습니다."); return; }
    updateBox((prev) => ({ ...prev, notes: prev.notes.map((note) => note.id === id ? { ...note, createdAt: data.created_at, updatedAt: data.updated_at } : note) }));
    setStorageError(null);
  }

  async function handleRenameFolder(folderId: string, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed || box.folders.some((folder) => folder.id !== folderId && folder.name === trimmed)) return;
    if (!requireAuthenticatedUser()) return;
    const { data, error } = await supabase.from("folders").update({ name: trimmed }).eq("id", folderId).select("id, name").single();
    if (error || !data) { setStorageError(error?.message ?? "폴더 이름을 수정하지 못했습니다."); return; }
    updateBox((prev) => ({ ...prev, folders: prev.folders.map((folder) => folder.id === folderId ? { ...folder, name: data.name } : folder) }));
    setStorageError(null);
  }

  async function handleAddFolder() {
    if (box.folders.length >= 12) return;
    const user = requireAuthenticatedUser();
    if (!user) return;
    const { data, error } = await supabase.from("folders")
      .insert({ user_id: user.id, name: nextFolderName(box.folders), color_key: box.folders.length })
      .select("id, name, color_key, created_at").single();
    if (error || !data) { setStorageError(error?.message ?? "폴더를 추가하지 못했습니다."); return; }
    const folder: ConcernFolder = { id: data.id, name: data.name, colorKey: data.color_key, createdAt: data.created_at };
    updateBox((prev) => ({ ...prev, folders: [...prev.folders, folder] }));
    setSelectedFolderId(folder.id);
    setStorageError(null);
  }

  async function handleLogout() {
    const { error } = await supabase.auth.signOut();
    if (error) setStorageError(error.message);
  }

  async function handleAnalyze(type: AnalysisType) {
    if (!activeFolderId || auth.status !== "authenticated") return;
    const notesToAnalyze = box.notes
      .filter((note) => note.folderId === activeFolderId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (notesToAnalyze.length === 0 || analysisLoading) return;
    setActiveAnalysis(type); setResultFolderId(activeFolderId); setAnalysisError(null); setAnalysisLoading(true);
    try {
      const res = await analyzeNotes({
        folderId: activeFolderId,
        type,
        characterPrompt: settings.characterPrompt || undefined,
        characterName: settings.characterName || undefined,
      });
      const record: AnalysisRecord = {
        id: res.id,
        folderId: res.folderId,
        type: res.type,
        content: stripMarkdown(res.content),
        analyzedAt: res.analyzedAt,
        noteCount: res.noteCount,
        notesSignature: res.notesSignature,
        promptVersion: res.promptVersion,
        isSaved: res.isSaved,
        yearMonth: res.analyzedAt.slice(0, 7),
        characterName: res.characterName,
      };
      updateBox((prev) => ({ ...prev, analysisHistory: [...prev.analysisHistory.filter((item) => item.id !== record.id), record] }));
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "AI 분석을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally { setAnalysisLoading(false); }
  }

  async function saveAnalysis(record: AnalysisRecord) {
    if (record.isSaved || auth.status !== "authenticated") return;
    try { await updateAnalysisSavedState(record.id, true); } catch { setAnalysisError("조언을 저장하지 못했습니다. 잠시 후 다시 시도해주세요."); return; }
    updateBox((prev) => ({ ...prev, analysisHistory: prev.analysisHistory.map((item) => item.id === record.id ? { ...item, isSaved: true } : item) }));
  }

  async function submitFeedback(payload: Record<string, unknown>) {
    await submitBetaFeedback(payload);
    setBetaStatus(await loadBetaStatus());
  }

  function emailAnalysis(record: AnalysisRecord, folder: ConcernFolder | null) {
    const typeLabel = record.type === "T" ? "T적 조언" : record.type === "F" ? "F적 조언" : "패턴 찾기";
    const subject = `CONSTELL WORRSKY | ${typeLabel}`;
    const body = [
      `폴더 이름: ${folder?.name ?? "알 수 없는 고민"}`,
      `분석 유형: ${typeLabel}`,
      `분석 날짜: ${new Date(record.analyzedAt).toLocaleDateString("ko-KR")}`,
      "",
      record.content,
    ].join("\n");
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  const resultFolder = box.folders.find((folder) => folder.id === resultFolderId) ?? null;
  const latestRecord = activeAnalysis && resultFolderId
    ? [...box.analysisHistory].reverse().find((record) => record.folderId === resultFolderId && record.type === activeAnalysis) ?? null
    : null;
  const savedAdvice = box.analysisHistory.filter((record) => record.isSaved);

  const sel = useMemo(() => {
    const folder = box.folders.find((item) => item.id === selectedFolderId);
    return getColorByIndex(folder?.colorKey ?? 0, settings.colorTheme);
  }, [selectedFolderId, box.folders, settings.colorTheme]);

  const particles = useMemo(() => Array.from({ length: 55 }, (_, i) => ({
    left: `${(i * 137.5) % 100}%`, top: `${(i * 97.3) % 100}%`,
    size: i % 4 === 0 ? 2.2 : 1.2,
    opBase: 0.07 + (i % 5) * 0.025,
    opPeak: settings.bgTheme === "sky" ? 0.20 : 0.28,
    dur: 2.5 + (i % 6), delay: i * 0.13,
  })), [settings.bgTheme]);

  // Target height of center column ≈ box + input + padding
  const LEFT_PANEL_HEIGHT = 530;

  return (
    <SettingsCtx.Provider value={{ ...settings, folders: box.folders }}>
      <div style={{ minHeight: "100svh", background: bg.pageBg, display: "flex", flexDirection: "column", alignItems: "center", padding: "36px 20px 56px", fontFamily: "'Noto Sans KR', sans-serif", overflowX: "hidden" }}>
        {/* Particles */}
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
          {particles.map((p, i) => (
            <motion.div key={i} style={{ position: "absolute", left: p.left, top: p.top, width: p.size, height: p.size, borderRadius: "50%", background: `rgb(${bg.dotColor})`, opacity: p.opBase }}
              animate={{ opacity: [p.opBase, p.opPeak, p.opBase] }} transition={{ duration: p.dur, repeat: Infinity, delay: p.delay, ease: "easeInOut" }} />
          ))}
        </div>

        <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 860 }}>
          {/* Header */}
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9 }}
            style={{ textAlign: "center", marginBottom: 26, position: "relative" }}>
            <div style={{ fontSize: 9.5, letterSpacing: "0.38em", color: bg.subtitleColor, textTransform: "uppercase", marginBottom: 5, fontFamily: "Georgia, serif" }}>나의 고민 사이트</div>
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700, color: bg.headingColor, letterSpacing: "0.06em", fontFamily: "'Noto Serif KR', Georgia, serif", textShadow: settings.bgTheme === "dark" ? "0 0 30px rgba(210,195,120,0.14)" : "0 2px 12px rgba(40,100,200,0.10)" }}>별별고민</h1>
            <div style={{ marginTop: 10, height: "1px", background: `linear-gradient(90deg, transparent, ${bg.dividerColor}, transparent)` }} />
            <div style={{ position: "absolute", right: 0, top: 0, display: "flex", alignItems: "center", gap: 8 }}>
              {auth.status === "authenticated" ? (
                <>
                  <button onClick={() => setShowSavedAdvice(true)} style={{ padding: "4px 8px", background: bg.btnBg, border: `1px solid ${bg.btnBorder}`, borderRadius: 10, cursor: "pointer", color: bg.textSecondary, fontSize: 10 }}>저장된 조언</button>
                  <button onClick={() => { if (!betaUnavailable) setShowBeta(true); }} disabled={betaUnavailable} title={betaUnavailable ? "베타 현황을 불러올 수 없습니다." : undefined} style={{ padding: "4px 8px", background: bg.btnBg, border: `1px solid ${bg.btnBorder}`, borderRadius: 10, cursor: betaUnavailable ? "default" : "pointer", opacity: betaUnavailable ? 0.55 : 1, color: bg.textSecondary, fontSize: 10 }}>베타 {betaUnavailable ? "사용 불가" : betaStatus ? `${betaStatus.participant.day}일차` : "현황"}</button>
                  <span style={{ fontSize: 10.5, color: bg.textSecondary, fontFamily: "Georgia, serif" }}>{auth.user.displayName}</span>
                  <button onClick={handleLogout} style={{ padding: "4px 8px", background: "transparent", border: `1px solid ${bg.btnBorder}`, borderRadius: 10, cursor: "pointer", color: bg.textSecondary, fontSize: 10 }}>로그아웃</button>
                </>
              ) : (
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.94 }} onClick={() => setShowLogin(true)}
                  style={{ padding: "5px 12px", background: bg.accentBtn, border: `1px solid ${bg.accentBtnBorder}`, borderRadius: 14, cursor: "pointer", color: bg.accentBtnText, fontSize: 11, fontFamily: "'Noto Sans KR', sans-serif", fontWeight: 600, letterSpacing: "0.03em" }}>
                  로그인
                </motion.button>
              )}
              <motion.button whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }} onClick={() => setShowSettings(true)}
                style={{ background: bg.btnBg, border: `1px solid ${bg.btnBorder}`, borderRadius: 8, width: 30, height: 30, cursor: "pointer", color: bg.textSecondary, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>⚙</motion.button>
            </div>
          </motion.div>

          {/* ── Main 3-area layout ── */}
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start", justifyContent: "center", flexWrap: "wrap" }}>

            {/* LEFT: Cabinet + Recent notes */}
            <motion.div initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7, delay: 0.2 }}
              style={{ width: 270, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10, height: LEFT_PANEL_HEIGHT }}>
              <MugCabinet
                folders={box.folders}
                notes={box.notes}
                selectedFolderId={activeFolderId}
                onSelectFolder={(folderId) => { setActiveFolderId(folderId); setAnalysisError(null); }}
                onAnalyze={handleAnalyze}
                activeType={activeAnalysis}
                isLoading={analysisLoading}
              />
              {/* Recent notes — all notes, most recent first */}
              <RecentNotes notes={box.notes} onDelete={deleteNote} onUpdateDate={updateNoteDate} />
            </motion.div>

            {/* CENTER: Star box + input */}
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.1 }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
              <OpenStarBox notes={currentNotes} shaking={shaking} onShake={handleShake} yearMonth={ym} />

              {/* Input panel */}
              <div style={{ width: BOX_W, marginTop: 8, background: bg.cardBg, border: `1px solid ${bg.cardBorder}`, borderRadius: 13, padding: "14px 15px 12px", backdropFilter: "blur(12px)" }}>
                <div style={{ marginBottom: 11 }}>
                  <CategoryPicker folders={box.folders} selectedFolderId={selectedFolderId} onSelect={setSelectedFolderId} onAdd={handleAddFolder} onRename={handleRenameFolder} />
                </div>
                <motion.div animate={shakeInput ? { x: [-5, 5, -4, 4, -2, 2, 0] } : {}} transition={{ duration: 0.38 }}>
                  <textarea ref={textareaRef} value={text} onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addNote(); } }}
                    placeholder={`${folderName(selectedFolderId, box.folders)} 고민을 적어보세요…`} rows={3}
                    style={{ width: "100%", boxSizing: "border-box", background: `${sel.bg}0e`, border: `1.5px solid ${sel.bg}38`, borderRadius: 9, padding: "9px 11px", color: bg.textPrimary, fontSize: 13.5, fontFamily: "'Noto Sans KR', sans-serif", resize: "none", outline: "none", lineHeight: 1.65, transition: "border-color 0.2s, background 0.2s" }}
                    onFocus={(e) => { e.target.style.borderColor = sel.bg + "78"; e.target.style.background = sel.bg + "18"; }}
                    onBlur={(e) => { e.target.style.borderColor = sel.bg + "38"; e.target.style.background = sel.bg + "0e"; }} />
                </motion.div>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }} onClick={addNote}
                  style={{ marginTop: 9, width: "100%", padding: "10px 0", background: `linear-gradient(135deg, ${sel.bg}e0, ${sel.bg}a0)`, border: `1.5px solid ${sel.bg}50`, borderRadius: 9, color: sel.text, fontSize: 13, fontWeight: 700, fontFamily: "'Noto Sans KR', sans-serif", cursor: "pointer", boxShadow: `0 3px 14px ${sel.glow}` }}>
                  상자에 담기
                </motion.button>
                {storageError && <p style={{ margin: "8px 0 0", color: "#d45a5a", fontSize: 11, lineHeight: 1.5 }}>{storageError}</p>}
                {auth.status === "guest" && !authLoading && <p style={{ margin: "8px 0 0", color: bg.textMuted, fontSize: 10.5, textAlign: "center" }}>로그인 후 고민 기록을 저장할 수 있어요.</p>}
                {box.notes.length > 0 && (
                  <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} whileHover={{ opacity: 0.72 }}
                    onClick={deleteAllNotes}
                    style={{ marginTop: 6, width: "100%", padding: "6px 0", background: "transparent", border: `1px solid ${bg.panelBorder}`, borderRadius: 7, color: bg.textMuted, fontSize: 10.5, fontFamily: "Georgia, serif", letterSpacing: "0.10em", cursor: "pointer" }}>
                    전부 꺼내기
                  </motion.button>
                )}
              </div>
            </motion.div>
          </div>

          {/* Archive boats */}
          <AnimatePresence>
            {archivedMonths.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ marginTop: 36 }}>
                <div style={{ fontSize: 9, letterSpacing: "0.28em", color: bg.sectionLabel, textTransform: "uppercase", fontFamily: "Georgia, serif", textAlign: "center", marginBottom: 16 }}>지난 고민들</div>
                <div style={{ display: "flex", gap: 20, flexWrap: "wrap", justifyContent: "center", alignItems: "flex-end" }}>
                  {archivedMonths.map((m) => <PaperBoat key={m} yearMonth={m} notes={notesByMonth.get(m) ?? []} />)}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Result paper */}
          <AnimatePresence>
            {activeAnalysis && (
              <motion.div key="result" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ marginTop: 30 }}>
                <ResultPaper record={latestRecord} error={analysisError} isLoading={analysisLoading} activeType={activeAnalysis} selectedFolder={resultFolder} onSave={saveAnalysis} onEmail={emailAnalysis} instantSubmitted={Boolean(latestRecord && betaStatus?.feedback.some((item) => item.feedback_stage === "instant" && item.analysis_id === latestRecord.id))} onFeedback={submitFeedback} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {showSettings && <SettingsPanel settings={settings} onSave={(patch) => setSettings((s) => ({ ...s, ...patch }))} onClose={() => setShowSettings(false)} />}
          {showLogin && <LoginModal onLogin={(u) => { setAuth({ status: "authenticated", user: u }); setShowLogin(false); }} onClose={() => setShowLogin(false)} />}
          {showSavedAdvice && <SavedAdvicePanel records={savedAdvice} folders={box.folders} onClose={() => setShowSavedAdvice(false)} onEmail={emailAnalysis} />}
          {showBeta && betaStatus && <BetaPanel status={betaStatus} folders={box.folders} onClose={() => setShowBeta(false)} onSubmit={submitFeedback} />}
        </AnimatePresence>
      </div>
    </SettingsCtx.Provider>
  );
}

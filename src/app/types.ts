export type AnalysisType = "common" | "T" | "F";
export type ColorTheme = "pastel" | "neon";
export type BackgroundTheme = "dark" | "sky";

export interface ConcernFolder {
  id: string;
  name: string;
  colorKey: number;
  createdAt: string;
}

export interface NoteData {
  id: string;
  text: string;
  folderId: string;
  createdAt: string;
  updatedAt: string;
  x: number;
  y: number;
  rot: number;
}

export interface AnalysisRecord {
  id: string;
  folderId: string;
  type: AnalysisType;
  content: string;
  analyzedAt: string;
  noteCount: number;
  notesSignature: string;
  promptVersion: string;
  isSaved: boolean;
  yearMonth: string;
  characterName?: string;
}

export interface BoxData {
  id: string;
  title: string | null;
  folders: ConcernFolder[];
  notes: NoteData[];
  analysisHistory: AnalysisRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface UserSession {
  id: string;
  email: string;
  displayName: string | null;
}

export type AuthState =
  | { status: "guest" }
  | { status: "authenticated"; user: UserSession };

export interface UserPreferences {
  colorTheme: ColorTheme;
  bgTheme: BackgroundTheme;
  characterPrompt: string;
  characterName: string;
}

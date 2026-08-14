import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type ApiRequest = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
};

export type ApiResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): ApiResponse;
  json(body: unknown): void;
};

function serverSupabaseConfig() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Supabase server configuration is missing");
  return { url, anonKey };
}

function bearerToken(req: ApiRequest) {
  const raw = req.headers?.authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export async function requireUser(req: ApiRequest): Promise<{ userId: string; supabase: SupabaseClient }> {
  const token = bearerToken(req);
  if (!token) throw new Error("UNAUTHORIZED");
  const { url, anonKey } = serverSupabaseConfig();
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error("UNAUTHORIZED");
  return { userId: data.user.id, supabase };
}

export function handleApiError(error: unknown, res: ApiResponse, fallback: string) {
  if (error instanceof Error && error.message === "UNAUTHORIZED") {
    return res.status(401).json({ error: "로그인이 필요합니다." });
  }
  return res.status(500).json({ error: fallback });
}

import { supabase } from "./supabase";

async function accessToken() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("로그인이 필요합니다.");
  return session.access_token;
}

export async function secureApi<T>(path: string, init: RequestInit = {}, tokenOverride?: string): Promise<T> {
  const token = tokenOverride ?? await accessToken();
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  const payload = await response.json().catch(() => null) as T | { error?: string } | null;
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
      ? payload.error
      : "서버 요청을 완료하지 못했습니다.";
    throw new Error(message);
  }
  return payload as T;
}

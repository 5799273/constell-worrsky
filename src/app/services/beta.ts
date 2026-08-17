import { secureApi } from "./secure-api";

export type BetaStatus = {
  activity: { folders: number; notes: number; T: number; F: number; common: number; saved: number };
};

export function loadBetaStatus(token?: string) {
  return secureApi<BetaStatus>("/api/beta", {}, token);
}

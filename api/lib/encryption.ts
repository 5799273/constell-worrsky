import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const ALGORITHM = "aes-256-gcm";
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export type EncryptedValue = {
  ciphertext: string;
  nonce: string;
  authTag: string;
  keyVersion: number;
};

type WrappedDekRow = {
  wrapped_dek: string;
  dek_nonce: string;
  dek_auth_tag: string;
  dek_key_version: number;
};

function currentKeyVersion() {
  const version = Number(process.env.APP_ENCRYPTION_KEY_VERSION ?? "1");
  if (!Number.isInteger(version) || version < 1) throw new Error("Encryption key version is invalid");
  return version;
}

function getKek(version: number) {
  const encoded = process.env[`APP_ENCRYPTION_KEK_V${version}`];
  if (!encoded) throw new Error("Encryption key is not configured");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("Encryption key length is invalid");
  return key;
}

function encryptBuffer(plaintext: Buffer, key: Buffer, aad: string, keyVersion: number): EncryptedValue {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, nonce, { authTagLength: AUTH_TAG_BYTES });
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    nonce: nonce.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion,
  };
}

function decryptBuffer(value: EncryptedValue, key: Buffer, aad: string) {
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(value.nonce, "base64"), { authTagLength: AUTH_TAG_BYTES });
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(value.authTag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, "base64")), decipher.final()]);
}

function dekAad(userId: string, keyVersion: number) {
  return `constell:dek:${userId}:v${keyVersion}`;
}

export function fieldAad(userId: string, table: "notes" | "analysis_history", recordId: string, column: "text" | "content", keyVersion: number) {
  return `constell:${userId}:${table}:${recordId}:${column}:v${keyVersion}`;
}

export function wrapDek(dek: Buffer, userId: string) {
  const keyVersion = currentKeyVersion();
  return encryptBuffer(dek, getKek(keyVersion), dekAad(userId, keyVersion), keyVersion);
}

export function unwrapDek(row: WrappedDekRow, userId: string) {
  return decryptBuffer({
    ciphertext: row.wrapped_dek,
    nonce: row.dek_nonce,
    authTag: row.dek_auth_tag,
    keyVersion: row.dek_key_version,
  }, getKek(row.dek_key_version), dekAad(userId, row.dek_key_version));
}

export async function getOrCreateUserDek(supabase: SupabaseClient, userId: string) {
  const { data: existing, error: selectError } = await supabase.from("profiles")
    .select("wrapped_dek, dek_nonce, dek_auth_tag, dek_key_version")
    .eq("id", userId)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing?.wrapped_dek && existing.dek_nonce && existing.dek_auth_tag && existing.dek_key_version) {
    return unwrapDek(existing as WrappedDekRow, userId);
  }

  const candidate = randomBytes(32);
  const wrapped = wrapDek(candidate, userId);
  const { data, error } = await supabase.rpc("ensure_user_encryption_key", {
    p_wrapped_dek: wrapped.ciphertext,
    p_dek_nonce: wrapped.nonce,
    p_dek_auth_tag: wrapped.authTag,
    p_dek_key_version: wrapped.keyVersion,
  }).single();
  if (error || !data) throw error ?? new Error("Unable to create encryption key");
  return unwrapDek(data as WrappedDekRow, userId);
}

export function encryptText(plaintext: string, dek: Buffer, aad: string, keyVersion = currentKeyVersion()) {
  return encryptBuffer(Buffer.from(plaintext, "utf8"), dek, aad, keyVersion);
}

export function decryptText(value: EncryptedValue, dek: Buffer, aad: string) {
  return decryptBuffer(value, dek, aad).toString("utf8");
}

export function activeEncryptionKeyVersion() {
  return currentKeyVersion();
}

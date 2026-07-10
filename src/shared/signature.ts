import type { FieldDescriptor } from "./types";

export function normalizePathname(pathname: string): string {
  const normalized = pathname.replace(/\/(\d+|[0-9a-f-]{8,})(?=\/|$)/gi, "/*");
  return normalized.replace(/\/$/, "") || "/";
}

export function fieldKey(field: FieldDescriptor): string {
  return [
    field.ref?.documentId ?? String(field.frameId),
    field.formKey ?? field.ref?.formKey ?? "document",
    field.tag,
    field.type ?? "",
    field.name ?? "",
    field.domId ?? "",
    field.autocomplete ?? "",
    field.label ?? "",
    String(field.occurrence ?? field.ref?.occurrence ?? 0)
  ].join("~");
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function formSignature(url: string, fields: FieldDescriptor[]): Promise<string> {
  const parsed = new URL(url);
  const sorted = [...fields].sort((a, b) => fieldKey(a).localeCompare(fieldKey(b)));
  const payload = [
    parsed.origin,
    normalizePathname(parsed.pathname),
    sorted.map(fieldKey).join("\u00b6")
  ].join("|");
  return sha256Hex(payload);
}

import type { FieldDescriptor, SensitiveSemanticType } from "./types";

const SENSITIVE_PATTERNS: Array<[SensitiveSemanticType, RegExp]> = [
  ["card_number", /\b(card|credit|debit|cc)[ -]?(number|no\.?)\b/i],
  ["card_expiry", /\b(expiry|expiration|valid thru|valid until|mm\s*\/\s*yy)\b/i],
  ["card_cvc", /\b(cvc|cvv|security code|card code)\b/i],
  ["iban", /\biban\b/i],
  ["account_number", /\b(account number|bank account|acct no)\b/i],
  ["routing_number", /\b(routing number|sort code|aba)\b/i],
  ["password", /\b(password|passcode)\b/i],
  ["otp", /\b(otp|one time|one-time|verification code|2fa|mfa)\b/i]
];

export function sensitiveSemanticType(
  field: Pick<
    FieldDescriptor,
    "type" | "name" | "domId" | "autocomplete" | "placeholder" | "label" | "nearbyText"
  >
): SensitiveSemanticType | null {
  const type = field.type?.toLowerCase();
  if (type === "password") return "password";

  const autocomplete = field.autocomplete?.toLowerCase() ?? "";
  if (autocomplete.startsWith("cc-")) {
    if (autocomplete.includes("csc")) return "card_cvc";
    if (autocomplete.includes("exp")) return "card_expiry";
    return "card_number";
  }
  if (autocomplete.includes("one-time-code")) return "otp";
  if (autocomplete.includes("current-password") || autocomplete.includes("new-password")) {
    return "password";
  }

  const text = [
    field.name,
    field.domId,
    field.autocomplete,
    field.placeholder,
    field.label,
    field.nearbyText
  ]
    .filter(Boolean)
    .join(" ");

  for (const [kind, pattern] of SENSITIVE_PATTERNS) {
    if (pattern.test(text)) return kind;
  }

  return null;
}

export function isSensitiveField(field: FieldDescriptor): boolean {
  return sensitiveSemanticType(field) !== null;
}

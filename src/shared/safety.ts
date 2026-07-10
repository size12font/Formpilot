import { isSensitiveField } from "./sensitive";
import type {
  FieldDescriptor,
  SafetyBlockReason,
  SafetyDecision
} from "./types";

const HONEYPOT = /\b(leave (?:this )?field blank|do not fill|don'?t fill|honeypot|bot[ -]?trap|spam[ -]?trap|_gotcha|dejar en blanco|deixe em branco|入力しない|입력하지 마세요|لا تملأ)\b/i;
const CONSENT = /\b(consent|terms(?: and conditions)?|privacy(?: policy)?|acepto|autorizo|pol[ií]tica de privacidad|datenschutz|bedingungen|consenso|termos|privacidade|同意|プライバシー|개인정보|ยินยอม|ความเป็นส่วนตัว)\b/i;
const MARKETING = /\b(marketing|newsletter|promotional|promotions|receive (?:relevant )?content|commercial messages|publicidad|mercadotecnia|bolet[ií]n|werbung|newsletter|promozion|pemasaran|quảng cáo|การตลาด)\b/i;

function fieldText(field: FieldDescriptor): string {
  return [
    field.name,
    field.domId,
    field.autocomplete,
    field.placeholder,
    field.label,
    field.nearbyText,
    field.sectionHeading
  ]
    .filter(Boolean)
    .join(" ");
}

function blocked(reason: SafetyBlockReason): SafetyDecision {
  return { action: "block", reason };
}

export function safetyDecision(
  field: FieldDescriptor,
  profileKey?: string
): SafetyDecision {
  if (field.currentValue?.trim()) return blocked("prefilled");
  if (isSensitiveField(field)) return blocked("sensitive");
  if (field.type?.toLowerCase() === "file") return blocked("file");
  if (field.safetySignals?.some((signal) => signal !== "visible")) return blocked("hidden");

  const text = fieldText(field);
  if (HONEYPOT.test(text)) return blocked("honeypot");
  if (MARKETING.test(text)) return blocked("marketing");
  if (CONSENT.test(text)) return blocked("consent");

  const kind = field.controlKind;
  const type = field.type?.toLowerCase();
  if (kind === "checkbox" || type === "checkbox") return blocked("manual-choice");
  if (kind === "unsupported") return blocked("unsupported-control");
  if ((kind === "radio-group" || type === "radio") && !profileKey) {
    return { action: "review", reason: "manual-choice" };
  }
  if (
    (kind === "radio-group" || type === "radio") &&
    profileKey !== "identity.gender" &&
    !profileKey?.startsWith("custom.")
  ) {
    return blocked("manual-choice");
  }

  return { action: "allow" };
}

export function entryStatusForSafety(decision: SafetyDecision): {
  status: "skipped-sensitive" | "skipped-prefilled" | "blocked";
  blockReason: SafetyBlockReason;
} | null {
  if (decision.action !== "block") return null;
  if (decision.reason === "sensitive") {
    return { status: "skipped-sensitive", blockReason: decision.reason };
  }
  if (decision.reason === "prefilled") {
    return { status: "skipped-prefilled", blockReason: decision.reason };
  }
  return { status: "blocked", blockReason: decision.reason };
}

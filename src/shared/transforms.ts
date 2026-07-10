import { parsePhoneNumberFromString } from "libphonenumber-js";
import { countryCandidates, countryIso2, countryName } from "./countries";
import { bestFuzzyOption } from "./fuzzy";
import { getProfileValue } from "./profile";
import type { FieldDescriptor, Profile, TransformName } from "./types";

export interface TransformResult {
  value: string;
  selectedOptionValue?: string;
  warning?: string;
}

function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function two(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDate(value: string, transform: TransformName): string {
  const date = parseIsoDate(value);
  if (!date) return value;
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();

  switch (transform) {
    case "date:DD/MM/YYYY":
      return `${two(day)}/${two(month)}/${year}`;
    case "date:MM/DD/YYYY":
      return `${two(month)}/${two(day)}/${year}`;
    case "date:YYYY-MM-DD":
      return `${year}-${two(month)}-${two(day)}`;
    case "date:split-day":
      return String(day);
    case "date:split-month":
      return String(month);
    case "date:split-year":
      return String(year);
    default:
      return value;
  }
}

function formatPhone(value: string, transform: TransformName): string {
  const phone = parsePhoneNumberFromString(value);
  const digits = value.replace(/\D/g, "");
  if (!phone) {
    if (transform === "phone:country-code-digits") return digits;
    return value;
  }
  const nationalDigits = phone.nationalNumber.replace(/\D/g, "");
  const nationalParts =
    phone.countryCallingCode === "1" && nationalDigits.length === 10
      ? [
          nationalDigits.slice(0, 3),
          nationalDigits.slice(3, 6),
          nationalDigits.slice(6)
        ]
      : [
          nationalDigits.slice(0, 3),
          nationalDigits.slice(3, 6),
          nationalDigits.slice(6, 10),
          nationalDigits.slice(10)
        ];

  switch (transform) {
    case "phone:e164":
      return phone.number;
    case "phone:national":
      return phone.formatNational();
    case "phone:national-digits":
      return nationalDigits;
    case "phone:split-country-code":
      return `+${phone.countryCallingCode}`;
    case "phone:country-code-digits":
      return phone.countryCallingCode;
    case "phone:national-part-1":
      return nationalParts[0] ?? "";
    case "phone:national-part-2":
      return nationalParts[1] ?? "";
    case "phone:national-part-3":
      return nationalParts[2] ?? "";
    case "phone:national-part-4":
      return nationalParts[3] ?? "";
    default:
      return value;
  }
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function applyLengthAndPattern(
  value: string,
  field: FieldDescriptor | undefined
): TransformResult {
  let next = value;
  let warning: string | undefined;

  if (field?.maxLength && field.maxLength > 0 && next.length > field.maxLength) {
    next = next.slice(0, field.maxLength);
    warning = "truncated";
  }

  if (field?.pattern) {
    try {
      const pattern = new RegExp(`^(?:${field.pattern})$`);
      if (!pattern.test(next)) warning = warning ? `${warning}, pattern` : "pattern";
    } catch {
      warning = warning ? `${warning}, invalid-pattern` : "invalid-pattern";
    }
  }

  const result: TransformResult = { value: next };
  if (warning) result.warning = warning;
  return result;
}

export function transformProfileValue(
  profile: Profile,
  profileKey: string,
  transform: TransformName,
  field?: FieldDescriptor,
  pageLang = "en"
): TransformResult {
  const raw = getProfileValue(profile, profileKey) ?? "";
  let value = raw;
  let selectedOptionValue: string | undefined;

  if (transform.startsWith("date:")) value = formatDate(raw, transform);
  if (transform.startsWith("phone:")) value = formatPhone(raw, transform);
  if (transform === "uppercase") value = raw.toUpperCase();
  if (transform === "name:initials") value = initials(raw);
  if (transform === "country:iso2") value = countryIso2(raw);
  if (transform === "country:name-in-page-lang") value = countryName(raw, pageLang);
  if (transform === "name:full") {
    value = [profile.identity.givenName, profile.identity.middleName, profile.identity.familyName]
      .filter(Boolean)
      .join(" ");
  }

  if (transform === "select:match-option" && field?.options) {
    const options = field.options;
    const targets = profileKey.toLowerCase().includes("country")
      ? countryCandidates(raw, pageLang)
      : [raw];
    const match = targets
      .map((target) => bestFuzzyOption(target, options))
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
      .sort((left, right) => right.score - left.score)[0];
    if (match) {
      selectedOptionValue = match.option.value;
      value = match.option.text || match.option.value;
    }
  }

  const result = applyLengthAndPattern(value, field);
  if (selectedOptionValue) result.selectedOptionValue = selectedOptionValue;
  return result;
}

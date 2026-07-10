import { getCachedMappings } from "./signatureCache";
import { mapFieldsWithPromptApi } from "./promptClient";
import { flattenProfile } from "../shared/profile";
import { entryStatusForSafety, safetyDecision } from "../shared/safety";
import { formSignature } from "../shared/signature";
import { transformProfileValue } from "../shared/transforms";
import type {
  FieldDescriptor,
  FillPlan,
  FillPlanEntry,
  MappingCandidate,
  Profile,
  TransformName
} from "../shared/types";

const DATE_DMY = /\b(dd[./-]?mm|tt[./-]?mm|tag|giorno|day)\b/i;
const DATE_MDY = /\b(mm[./-]?dd|month)\b/i;
const PHONE_NATIONAL_PART_TRANSFORMS = [
  "phone:national-part-1",
  "phone:national-part-2",
  "phone:national-part-3",
  "phone:national-part-4"
] as const;

function fieldText(field: FieldDescriptor): string {
  return [
    field.autocomplete,
    field.name,
    field.domId,
    field.placeholder,
    field.label,
    field.nearbyText,
    field.sectionHeading,
    field.type
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[_-]+/g, " ");
}

function has(text: string, ...patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function includesAny(text: string, ...terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function findKey(keys: string[], preferred: string[]): string | null {
  for (const prefix of preferred) {
    const hit = keys.find((key) => key === prefix || key.startsWith(prefix));
    if (hit) return hit;
  }
  return null;
}

function dateTransform(field: FieldDescriptor, text: string): TransformName {
  if (field.type === "date") return "date:YYYY-MM-DD";
  if (DATE_DMY.test(text)) return "date:DD/MM/YYYY";
  if (DATE_MDY.test(text)) return "date:MM/DD/YYYY";
  return "date:YYYY-MM-DD";
}

function profileIndex(profileKey: string, prefix: string): number | null {
  const match = new RegExp(`^${prefix}\\[(\\d+)\\]\\.`).exec(profileKey);
  return match ? Number(match[1]) : null;
}

function keyForIndexedField(
  keys: string[],
  prefix: string,
  index: number,
  fieldName: string
): string | null {
  return findKey(keys, [`${prefix}[${index}].${fieldName}`]);
}

function isPhoneCandidate(candidate: MappingCandidate): boolean {
  return /^contact\.phones\[\d+\]\./.test(candidate.profileKey);
}

function explicitCountryCodeField(field: FieldDescriptor): boolean {
  const text = fieldText(field);
  return has(text, /\b(country code|calling code|vorwahl|prefisso|tel-country-code)\b/) ||
    has(text, /(^|\s)\+(\s|$)/);
}

function shouldSplitPhoneRun(
  run: Array<{ field: FieldDescriptor; candidate: MappingCandidate }>
): boolean {
  if (run.length >= 3) return true;
  if (run.length >= 2 && explicitCountryCodeField(run[0]!.field)) return true;
  return false;
}

function refinePhoneCandidates(
  fields: FieldDescriptor[],
  candidates: MappingCandidate[],
  keys: string[]
): MappingCandidate[] {
  const next = [...candidates];
  let index = 0;

  while (index < fields.length) {
    const current = next[index];
    if (!current || !isPhoneCandidate(current)) {
      index += 1;
      continue;
    }

    const start = index;
    while (index < fields.length) {
      const candidate = next[index];
      if (!candidate || !isPhoneCandidate(candidate)) break;
      index += 1;
    }
    const run: Array<{
      field: FieldDescriptor;
      candidate: MappingCandidate;
      candidateIndex: number;
    }> = [];
    for (let runIndex = start; runIndex < index; runIndex += 1) {
      const field = fields[runIndex];
      const candidate = next[runIndex];
      if (field && candidate) run.push({ field, candidate, candidateIndex: runIndex });
    }

    if (!shouldSplitPhoneRun(run)) continue;

    const firstRunItem = run[0]!;
    const phoneIndex = profileIndex(firstRunItem.candidate.profileKey, "contact\\.phones") ?? 0;
    const numberKey = keyForIndexedField(keys, "contact.phones", phoneIndex, "number");
    const countryCodeKey = keyForIndexedField(keys, "contact.phones", phoneIndex, "countryCode");
    if (!numberKey) continue;

    const usesCountryCode =
      Boolean(countryCodeKey) && (run.length >= 4 || explicitCountryCodeField(firstRunItem.field));
    const nationalStart = usesCountryCode ? 1 : 0;

    if (usesCountryCode && countryCodeKey) {
      const first = firstRunItem;
      next[first.candidateIndex] = {
        ...first.candidate,
        profileKey: countryCodeKey,
        transform: "phone:country-code-digits",
        confidence: Math.max(first.candidate.confidence, 0.92)
      };
    }

    run.slice(nationalStart).forEach((item, partIndex) => {
      const transform =
        PHONE_NATIONAL_PART_TRANSFORMS[
          Math.min(partIndex, PHONE_NATIONAL_PART_TRANSFORMS.length - 1)
        ] ?? "phone:national-part-4";
      next[item.candidateIndex] = {
        ...item.candidate,
        profileKey: numberKey,
        transform,
        confidence: Math.max(item.candidate.confidence, 0.92)
      };
    });
  }

  return next;
}

function isAddressCandidate(candidate: MappingCandidate): boolean {
  return /^addresses\[\d+\]\./.test(candidate.profileKey);
}

function genericAddressContext(field: FieldDescriptor): boolean {
  const visibleContext = [field.nearbyText, field.sectionHeading].filter(Boolean).join(" ").toLowerCase();
  return has(visibleContext, /\b(address|adresse|住所)\b/) &&
    !has(visibleContext, /\b(city|locality|town|postal|postcode|zip|state|province|region|country)\b/);
}

function looksLikeCityGuess(field: FieldDescriptor): boolean {
  return has(fieldText(field), /\b(city|locality|town|address-level2|stadt|citta)\b/);
}

function looksLikeStreetField(field: FieldDescriptor): boolean {
  return has(fieldText(field), /\b(street|street-address|address line 1|adresse|strasse|via)\b/);
}

function refineAddressCandidates(
  fields: FieldDescriptor[],
  candidates: MappingCandidate[],
  keys: string[]
): MappingCandidate[] {
  const next = [...candidates];
  let index = 0;

  while (index < fields.length) {
    const current = next[index];
    const field = fields[index];
    if (!field || (!current && !genericAddressContext(field))) {
      index += 1;
      continue;
    }
    if (current && !isAddressCandidate(current) && !genericAddressContext(field)) {
      index += 1;
      continue;
    }

    const start = index;
    while (index < fields.length) {
      const runField = fields[index];
      const runCandidate = next[index];
      if (!runField || (!runCandidate && !genericAddressContext(runField))) break;
      if (runCandidate && !isAddressCandidate(runCandidate) && !genericAddressContext(runField)) {
        break;
      }
      index += 1;
    }

    const run: Array<{
      field: FieldDescriptor;
      candidate: MappingCandidate;
      candidateIndex: number;
    }> = [];
    for (let runIndex = start; runIndex < index; runIndex += 1) {
      const runField = fields[runIndex];
      const runCandidate = next[runIndex];
      if (runField && runCandidate) {
        run.push({ field: runField, candidate: runCandidate, candidateIndex: runIndex });
      }
    }

    const firstRunItem = run[0];
    const secondRunItem = run[1];
    if (!firstRunItem || !secondRunItem || !genericAddressContext(firstRunItem.field)) continue;
    if (!looksLikeCityGuess(firstRunItem.field) || !looksLikeStreetField(secondRunItem.field)) {
      continue;
    }

    const addressIndex = profileIndex(firstRunItem.candidate.profileKey, "addresses") ?? 0;
    const streetNumberKey = keyForIndexedField(keys, "addresses", addressIndex, "streetNumber");
    const streetKey = keyForIndexedField(keys, "addresses", addressIndex, "street");
    if (!streetKey) continue;

    const first = firstRunItem;
    next[first.candidateIndex] = streetNumberKey
      ? {
          ...first.candidate,
          profileKey: streetNumberKey,
          transform: "none",
          confidence: Math.max(first.candidate.confidence, 0.9)
        }
      : {
          ...first.candidate,
          profileKey: "SKIP",
          transform: "none",
          confidence: 0
        };

    const second = secondRunItem;
    next[second.candidateIndex] = {
      ...second.candidate,
      profileKey: streetKey,
      transform: "none",
      confidence: Math.max(second.candidate.confidence, 0.9)
    };
  }

  return next;
}

function refineCandidates(
  fields: FieldDescriptor[],
  candidates: MappingCandidate[],
  keys: string[]
): MappingCandidate[] {
  const scoped = new Map<string, number[]>();
  fields.forEach((field, index) => {
    const scope = `${field.ref?.documentId ?? field.frameId}:${field.formKey ?? "document"}`;
    const indexes = scoped.get(scope) ?? [];
    indexes.push(index);
    scoped.set(scope, indexes);
  });

  const next = [...candidates];
  scoped.forEach((indexes) => {
    const scopedFields = indexes.map((index) => fields[index]!).filter(Boolean);
    const scopedCandidates = indexes.map((index) => candidates[index]!).filter(Boolean);
    const refined = refineAddressCandidates(
      scopedFields,
      refinePhoneCandidates(scopedFields, scopedCandidates, keys),
      keys
    );
    indexes.forEach((originalIndex, scopedIndex) => {
      const candidate = refined[scopedIndex];
      if (candidate) next[originalIndex] = candidate;
    });
  });
  return next;
}

function autocompleteFieldName(field: FieldDescriptor): string {
  const tokens = (field.autocomplete ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  return tokens.findLast(
    (token) => !token.startsWith("section-") && token !== "shipping" && token !== "billing"
  ) ?? "";
}

function candidateFromAutocomplete(
  field: FieldDescriptor,
  keys: string[]
): MappingCandidate | null {
  const token = autocompleteFieldName(field);
  const mapping: Record<string, { key: string[]; transform?: TransformName }> = {
    name: { key: ["identity.givenName"], transform: "name:full" },
    "given-name": { key: ["identity.givenName"] },
    "additional-name": { key: ["identity.middleName"] },
    "family-name": { key: ["identity.familyName"] },
    email: { key: ["contact.emails[0].value"] },
    tel: {
      key: ["contact.phones[0].number"],
      transform: field.type === "number" ? "phone:national-digits" : "phone:national"
    },
    organization: { key: ["work.company"] },
    "organization-title": { key: ["work.jobTitle"] },
    url: { key: ["work.website"] },
    bday: { key: ["identity.dateOfBirth"], transform: "date:YYYY-MM-DD" },
    sex: { key: ["identity.gender"] },
    "street-address": { key: ["addresses[0].street"] },
    "address-line1": { key: ["addresses[0].street"] },
    "address-line2": { key: ["addresses[0].line2"] },
    "address-level2": { key: ["addresses[0].city"] },
    "address-level1": { key: ["addresses[0].region"] },
    "postal-code": { key: ["addresses[0].postalCode"] },
    country: {
      key: ["addresses[0].country"],
      transform: field.options ? "select:match-option" : "country:iso2"
    },
    "country-name": {
      key: ["addresses[0].country"],
      transform: field.options ? "select:match-option" : "country:name-in-page-lang"
    }
  };
  const configured = mapping[token];
  if (!configured) return null;
  const key = findKey(keys, configured.key);
  if (!key) return null;
  return {
    fieldId: field.id,
    profileKey: key,
    transform: configured.transform ?? "none",
    confidence: 0.98
  };
}

function explicitVisibleProfileKey(field: FieldDescriptor, keys: string[]): string | null {
  const text = [field.label, field.placeholder, field.sectionHeading]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/\b(company|business|organization|organisation|empresa|entreprise|companhia|perusahaan|c[oô]ng ty)\b/.test(text) || includesAny(text, "tên công ty", "اسم الشركة", "公司名称", "会社名", "şirket")) {
    return findKey(keys, ["work.company"]);
  }
  if (/\b(full name|your name|nombre completo|nombre y apellidos|nom complet|nome completo|nome e sobrenome|nama lengkap)\b/.test(text) || includesAny(text, "họ và tên", "ad soyad", "الاسم الكامل", "姓名", "氏名", "ชื่อ-นามสกุล")) {
    return findKey(keys, ["identity.givenName"]);
  }
  if (/\b(first name|given name|forename|vorname|pr[eé]nom|nombre de pila|nome pr[oó]prio|nama depan|ad)\b/.test(text) || includesAny(text, "tên", "名")) {
    return findKey(keys, ["identity.givenName"]);
  }
  if (/\b(last name|family name|surname|nachname|apellido|nama belakang|soyad)\b/.test(text) || includesAny(text, "họ", "姓")) {
    return findKey(keys, ["identity.familyName"]);
  }
  if (/\b(zip|zipcode|zip code|postal|postal code|postcode|pin code|plz)\b/.test(text) || includesAny(text, "mã bưu chính", "الرمز البريدي", "우편번호", "郵便番号")) {
    return findKey(keys, ["addresses[0].postalCode"]);
  }
  if (/\b(country|pa[ií]s|pays|land|negara)\b/.test(text) || includesAny(text, "quốc gia", "国家", "国", "البلد")) {
    return findKey(keys, ["addresses[0].country"]);
  }
  return null;
}

function candidateForField(field: FieldDescriptor, keys: string[]): MappingCandidate {
  const initialSafety = safetyDecision(field);
  if (initialSafety.action === "block") {
    return {
      fieldId: field.id,
      profileKey: "SKIP",
      transform: "none",
      confidence: 1
    };
  }

  const autocompleteCandidate = candidateFromAutocomplete(field, keys);
  if (autocompleteCandidate) {
    const visibleKey = explicitVisibleProfileKey(field, keys);
    if (visibleKey && visibleKey !== autocompleteCandidate.profileKey) {
      return {
        fieldId: field.id,
        profileKey: "SKIP",
        transform: "none",
        confidence: 0.49
      };
    }
    return autocompleteCandidate;
  }

  const text = fieldText(field);
  let key: string | null = null;
  let transform: TransformName = "none";
  let confidence = 0;

  if (has(text, /\b(email|e-mail|mail|correo electr[oó]nico|courriel|e-post|e-postadress)\b/)) {
    key = findKey(keys, ["contact.emails[0].value", "contact.emails"]);
    confidence = 0.94;
  } else if (has(text, /\b(phone|tel|mobile|cell|telefon|telefono|tel[eé]fono|t[eé]l[eé]phone|telefone|telepon|điện thoại)\b/)) {
    if (has(text, /\b(country code|calling code|vorwahl|prefisso)\b/)) {
      key = findKey(keys, ["contact.phones[0].countryCode"]);
      transform = "phone:split-country-code";
    } else {
      key = findKey(keys, ["contact.phones[0].number", "contact.phones"]);
      transform = field.type === "number" ? "phone:national-digits" : field.type === "tel" ? "phone:national" : "phone:e164";
    }
    confidence = 0.9;
  } else if (has(text, /\b(company name|business name|organization|organisation|company|employer|firma|azienda|empresa|soci[eé]t[eé]|entreprise|companhia|perusahaan|c[oô]ng ty)\b/) || includesAny(text, "会社名", "회사명", "บริษัท", "الشركة", "tên công ty", "اسم الشركة", "公司名称", "şirket")) {
    key = findKey(keys, ["work.company"]);
    confidence = 0.94;
  } else if (has(text, /\b(full name|your name|nombre completo|nombre y apellidos|nom complet|nome completo|nome e sobrenome|nama lengkap)\b|(^|\s)name($|\s)/) || includesAny(text, "họ và tên", "ad soyad", "الاسم الكامل", "姓名", "氏名", "ชื่อ-นามสกุล")) {
    key = findKey(keys, ["identity.givenName"]);
    transform = "name:full";
    confidence = 0.72;
  } else if (has(text, /\b(first name|given name|forename|vorname|pr[eé]nom|nombre de pila|nome pr[oó]prio|nama depan|ad)\b/) || includesAny(text, "tên", "ชื่อ", "名")) {
    key = findKey(keys, ["identity.givenName"]);
    confidence = 0.93;
  } else if (has(text, /\b(last name|family name|surname|nachname|cognome|nom de famille|apellido|sobrenome|nama belakang|นามสกุล)\b/) || includesAny(text, "họ", "姓")) {
    key = findKey(keys, ["identity.familyName"]);
    confidence = 0.93;
  } else if (has(text, /\b(birth|dob|geboren|geburtsdatum|nascita)\b/)) {
    key = findKey(keys, ["identity.dateOfBirth"]);
    transform = dateTransform(field, text);
    confidence = 0.9;
  } else if (has(text, /\b(gender|sex|geschlecht|genere)\b/)) {
    key = findKey(keys, ["identity.gender"]);
    confidence = 0.82;
  } else if (has(text, /\b(nationality|nationalitat|nazionalita)\b/)) {
    key = findKey(keys, ["identity.nationality"]);
    transform = field.options ? "select:match-option" : "country:name-in-page-lang";
    confidence = 0.84;
  } else if (has(text, /\b(job title|position|role|beruf|professione)\b/)) {
    key = findKey(keys, ["work.jobTitle"]);
    confidence = 0.82;
  } else if (has(text, /\b(website|url|homepage)\b/)) {
    key = findKey(keys, ["work.website"]);
    confidence = 0.82;
  } else if (has(text, /\b(passport)\b/)) {
    key = findKey(keys, ["documents.passportNumber"]);
    confidence = 0.82;
  } else if (has(text, /\b(tax id|tax number|ssn|tin|steuer)\b/)) {
    key = findKey(keys, ["documents.taxId"]);
    confidence = 0.82;
  } else if (has(text, /\b(street|address line 1|adresse|strasse|via)\b/)) {
    key = findKey(keys, ["addresses[0].street"]);
    confidence = 0.88;
  } else if (has(text, /\b(address line 2|apt|apartment|suite|unit)\b/)) {
    key = findKey(keys, ["addresses[0].line2"]);
    confidence = 0.8;
  } else if (has(text, /\b(city|town|ort|stadt|citta)\b/)) {
    key = findKey(keys, ["addresses[0].city"]);
    confidence = 0.88;
  } else if (has(text, /\b(state|province|region|bundesland|provincia)\b/)) {
    key = findKey(keys, ["addresses[0].region"]);
    confidence = 0.82;
  } else if (has(text, /\b(zip|zipcode|zip code|postal|postal code|postcode|pin code|plz|cap)\b/) || includesAny(text, "mã bưu chính", "الرمز البريدي", "우편번호", "郵便番号")) {
    key = findKey(keys, ["addresses[0].postalCode"]);
    confidence = 0.88;
  } else if (has(text, /\b(country|land|paese|pa[ií]s|negara)\b/) || includesAny(text, "quốc gia", "国家", "国", "البلد")) {
    key = findKey(keys, ["addresses[0].country"]);
    transform = field.options ? "select:match-option" : "country:name-in-page-lang";
    confidence = 0.86;
  }

  if (!key) {
    return {
      fieldId: field.id,
      profileKey: "SKIP",
      transform: "none",
      confidence: 0
    };
  }

  return {
    fieldId: field.id,
    profileKey: key,
    transform,
    confidence
  };
}

function entryFromCandidate(
  field: FieldDescriptor,
  profile: Profile,
  pageLang: string,
  candidate: MappingCandidate
): FillPlanEntry {
  const base = {
    fieldId: field.id,
    ...(field.ref ? { ref: field.ref } : {}),
    ...(field.formKey ? { formKey: field.formKey } : {}),
    ...(field.controlKind ? { controlKind: field.controlKind } : {}),
    profileKey: candidate.profileKey,
    transform: candidate.transform,
    confidence: candidate.confidence,
    label: field.label
  };

  const safety = entryStatusForSafety(safetyDecision(field, candidate.profileKey));
  if (safety) {
    return {
      ...base,
      profileKey: "SKIP",
      value: "",
      status: safety.status,
      blockReason: safety.blockReason
    };
  }
  if (candidate.profileKey === "SKIP" || candidate.confidence < 0.5) {
    return { ...base, value: "", status: "low-confidence" };
  }

  const transformed = transformProfileValue(
    profile,
    candidate.profileKey,
    candidate.transform,
    field,
    pageLang
  );

  if (!transformed.value.trim()) {
    return { ...base, value: "", status: "low-confidence" };
  }

  const selectedOptionValue =
    candidate.selectedOptionValue &&
    field.options?.some((option) => option.value === candidate.selectedOptionValue)
      ? candidate.selectedOptionValue
      : transformed.selectedOptionValue;

  const status =
    candidate.transform === "select:match-option" && !selectedOptionValue
      ? "unresolved-option"
      : "ready";

  return {
    ...base,
    value: transformed.value,
    status,
    ...(selectedOptionValue ? { selectedOptionValue } : {}),
    ...(transformed.warning ? { warning: transformed.warning } : {})
  };
}

export function recomputePlanEntry(
  field: FieldDescriptor,
  profile: Profile,
  pageLang: string,
  correction: { profileKey: string; transform: TransformName }
): FillPlanEntry {
  return entryFromCandidate(field, profile, pageLang, {
    fieldId: field.id,
    profileKey: correction.profileKey,
    transform: correction.transform,
    confidence: correction.profileKey === "SKIP" ? 0 : 1
  });
}

async function promptCandidates(
  fields: FieldDescriptor[],
  profile: Profile,
  page: { locale: string; pageTitle: string; pageLang: string },
  screenshot?: Blob
): Promise<{ candidates: MappingCandidate[]; visionUsed: boolean }> {
  const keys = flattenProfile(profile).map((field) => field.key);
  const batches: MappingCandidate[] = [];
  let visionUsed = false;

  for (let index = 0; index < fields.length; index += 15) {
    const batch = fields.slice(index, index + 15);
    const promptResult = await mapFieldsWithPromptApi(batch, keys, page, screenshot);
    if (promptResult) {
      batches.push(...promptResult.candidates);
      visionUsed ||= promptResult.visionUsed;
    } else {
      batches.push(...batch.map((field) => candidateForField(field, keys)));
    }
  }

  return { candidates: batches, visionUsed };
}

export async function createFillPlan(options: {
  fields: FieldDescriptor[];
  profile: Profile;
  url: string;
  pageLang: string;
  pageTitle: string;
  screenshot?: Blob;
}): Promise<FillPlan> {
  const signature = await formSignature(options.url, options.fields);
  const cachedCandidates = await getCachedMappings(signature, options.fields);

  const promptResult = cachedCandidates
    ? { candidates: cachedCandidates, visionUsed: false }
    : await promptCandidates(
        options.fields,
        options.profile,
        {
          locale: navigator.language,
          pageLang: options.pageLang,
          pageTitle: options.pageTitle
        },
        options.screenshot
      );
  const { candidates, visionUsed } = promptResult;

  const profileKeys = flattenProfile(options.profile).map((item) => item.key);
  const resolvedCandidates = options.fields.map((field) => {
    return (
      candidates.find((item) => item.fieldId === field.id) ??
      candidateForField(field, profileKeys)
    );
  });
  const refinedCandidates = refineCandidates(options.fields, resolvedCandidates, profileKeys);

  return {
    signature,
    createdAt: Date.now(),
    visionUsed,
    entries: options.fields.map((field, index) => {
      const candidate = refinedCandidates[index] ?? candidateForField(field, profileKeys);
      return entryFromCandidate(field, options.profile, options.pageLang, candidate);
    }),
    forms: [...new Map(options.fields.map((field) => {
      const key = field.formKey ?? "document";
      return [key, {
        key,
        label: field.form?.label ?? key,
        fieldCount: options.fields.filter((candidate) => (candidate.formKey ?? "document") === key).length
      }] as const;
    })).values()],
    selectedFormKey: selectDefaultForm(options.fields)
  };
}

function selectDefaultForm(fields: FieldDescriptor[]): string {
  const groups = new Map<string, { count: number; eligible: number; penalty: number }>();
  fields.forEach((field) => {
    const key = field.formKey ?? "document";
    const current = groups.get(key) ?? { count: 0, eligible: 0, penalty: 0 };
    current.count += 1;
    if (safetyDecision(field).action !== "block") current.eligible += 1;
    const text = `${field.form?.label ?? ""} ${field.sectionHeading ?? ""} ${field.nearbyText}`;
    if (/\b(search|login|sign in|newsletter|subscribe|footer|header|navigation|nav)\b/i.test(text)) current.penalty += 8;
    groups.set(key, current);
  });
  return [...groups.entries()].sort((a, b) =>
    ((b[1].eligible * 10 + b[1].count) - b[1].penalty) -
    ((a[1].eligible * 10 + a[1].count) - a[1].penalty)
  )[0]?.[0] ?? "document";
}

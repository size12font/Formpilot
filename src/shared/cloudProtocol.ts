import { z } from "zod";

// Bump whenever vocabulary, candidate semantics, prompts, transforms, or gates change.
export const MATCHING_RULES_VERSION = 1;
export const MAX_MATCH_FIELDS = 12;
export const MAX_MATCH_CANDIDATES = 48;
export const MAX_MATCH_BYTES = 24_000;
export const CLOUD_TIMEOUT_MS = 2_500;
// Provisional, pending held-out live evaluation. Always requires preview.
export const MIN_CHOICE_CONFIDENCE = 0.85;

// Only these words can leave the device. Never forward arbitrary label fragments.
export const FIELD_WORDS = new Set(`
first given forename last family surname middle full name initials contact person
mobile cell telephone phone number calling code country area national international
email e-mail mail personal private work business professional primary alternate
home billing shipping delivery residential office address street house building line
city town locality region province state postal postcode zip zipcode country
company organization organisation employer job title website url
date birth birthday day month year dd mm yyyy dob
registration tax id identity passport account password payment card otp
vorname nachname familienname telefon adresse strasse straße hausnummer stadt plz land
prénom nom famille courriel téléphone facturation livraison pays code postal
nombre apellido apellidos correo electrónico móvil domicilio factura país código
nome sobrenome apelido telefone celular faturação cobrança entrega morada código
姓 名 姓名 電話 電話番号 携帯電話 郵便番号 住所 国 請求先 配送先
성 이름 성명 전화 휴대폰 우편번호 주소 국가 청구 배송
required optional your enter confirm repeat please of for at
`.trim().split(/\s+/));

const description = z.string().max(180).refine((text) =>
  text === "" || text.split(" ").every((word) => FIELD_WORDS.has(word))
);
export const CANDIDATE_ROLES = [
  "given name", "family name", "middle name", "date of birth",
  "company name", "job title", "website",
  ...["personal", "work", "primary", "alternate"].map((role) => `${role} email`),
  ...["mobile", "home", "work", "primary"].flatMap((role) => [
    `${role} phone number`, `${role} phone country code`
  ]),
  ...["home", "billing", "shipping", "work"].flatMap((role) =>
    ["street", "street number", "address line 2", "city", "region", "postal code", "country"]
      .map((part) => `${role} ${part}`)
  )
] as const;

export const CloudCandidateSchema = z.object({
  id: z.string().regex(/^c\d{1,2}$/),
  role: z.string().refine((role) => CANDIDATE_ROLES.includes(role))
}).strict();

export const CloudFieldSchema = z.object({
  id: z.string().regex(/^f\d{1,2}$/),
  label: description,
  placeholder: description,
  section: description,
  control: z.enum(["text", "number", "tel", "email", "date", "select"]),
  maxLength: z.number().int().min(1).max(1000).optional(),
  candidates: z.array(CloudCandidateSchema).min(1).max(MAX_MATCH_CANDIDATES)
}).strict().refine((field) => new Set(field.candidates.map((c) => c.id)).size === field.candidates.length);

export const CloudRequestSchema = z.object({
  version: z.literal(MATCHING_RULES_VERSION),
  fields: z.array(CloudFieldSchema).min(1).max(MAX_MATCH_FIELDS)
}).strict().refine((request) => new Set(request.fields.map((f) => f.id)).size === request.fields.length);

export const CloudResponseSchema = z.object({
  version: z.literal(MATCHING_RULES_VERSION),
  selections: z.array(z.object({
    fieldId: z.string().regex(/^f\d{1,2}$/),
    candidateId: z.string().regex(/^(?:c\d{1,2}|NO_MATCH)$/),
    confidence: z.number().finite().min(0).max(1)
  }).strict()).max(MAX_MATCH_FIELDS)
}).strict();

export type CloudRequest = z.infer<typeof CloudRequestSchema>;
export type CloudField = z.infer<typeof CloudFieldSchema>;
export type CloudResponse = z.infer<typeof CloudResponseSchema>;

export function sanitizeFieldText(text: string | null | undefined, privateValues: string[]): string {
  let clean = (text ?? "").slice(0, 1000).normalize("NFKC").toLowerCase();
  // Remove whole URLs/emails before tokenizing, so their parts cannot become hints.
  clean = clean.replace(/(?:https?:\/\/|www\.)\S+|\S+@\S+/g, " ");
  for (const value of privateValues) {
    const normalized = value.normalize("NFKC").toLowerCase().trim();
    if (normalized) clean = clean.split(normalized).join(" ");
  }
  return (clean.match(/[\p{L}]+(?:-[\p{L}]+)*/gu) ?? [])
    .filter((word) => FIELD_WORDS.has(word)).slice(0, 20).join(" ").slice(0, 180).trim();
}

export function validBrokerUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return !url.username && !url.password && !url.search && !url.hash &&
      url.pathname === "/match" && (url.protocol === "https:" ||
        (url.protocol === "http:" && url.hostname === "127.0.0.1"));
  } catch {
    return false;
  }
}

import type { Availability, FieldDescriptor, MappingCandidate, TransformName } from "../shared/types";

interface LanguageModelLike {
  availability?: (options?: unknown) => Promise<Availability>;
  create?: (options?: unknown) => Promise<{
    prompt: (input: unknown, options?: unknown) => Promise<unknown>;
    destroy?: () => void;
  }>;
}

const RESPONSE_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      fieldId: { type: "string" },
      profileKey: { type: "string" },
      transform: {
        enum: [
          "none",
          "date:DD/MM/YYYY",
          "date:MM/DD/YYYY",
          "date:YYYY-MM-DD",
          "date:split-day",
          "date:split-month",
          "date:split-year",
          "phone:e164",
          "phone:national",
          "phone:national-digits",
          "phone:split-country-code",
          "phone:country-code-digits",
          "phone:national-part-1",
          "phone:national-part-2",
          "phone:national-part-3",
          "phone:national-part-4",
          "name:full",
          "name:initials",
          "country:iso2",
          "country:name-in-page-lang",
          "uppercase",
          "select:match-option"
        ]
      },
      selectedOptionValue: { type: "string" },
      confidence: { type: "number" }
    },
    required: ["fieldId", "profileKey", "confidence"]
  }
};

const SYSTEM_PROMPT = [
  "You map web form fields to user profile keys.",
  "You receive JSON form fields, optional screenshot context, profile keys.",
  "Return only JSON matching schema.",
  "Use SKIP for prefilled, unknown, payment, password, OTP, or confidence below 0.5.",
  "Never invent profile keys.",
  "When one phone number is split across adjacent small boxes, map country/calling code to contact.phones[i].countryCode with phone:country-code-digits, then national boxes to phone:national-part-1, phone:national-part-2, phone:national-part-3.",
  "Visible page labels beat browser/autocomplete guesses. If visible text says Address and adjacent fields are address parts, do not map City/Locality unless visible text explicitly asks for city, town, or locality.",
  "For generic Address blocks with two address fields, first small field is usually street number, second is street; city/locality is wrong because it answers municipality, not street address."
].join(" ");

function languageModel(): LanguageModelLike | null {
  const candidate = (globalThis as { LanguageModel?: LanguageModelLike }).LanguageModel;
  return candidate ?? null;
}

export async function promptAvailability(expectImage: boolean): Promise<Availability> {
  const model = languageModel();
  if (!model?.availability) return "unavailable";

  try {
    return await model.availability(
      expectImage ? { expectedInputs: [{ type: "image" }] } : undefined
    );
  } catch {
    if (expectImage) return promptAvailability(false);
    return "unavailable";
  }
}

function coerceTransform(value: unknown): TransformName {
  const text = typeof value === "string" ? value : "none";
  const allowed = new Set(RESPONSE_SCHEMA.items.properties.transform.enum);
  return allowed.has(text) ? (text as TransformName) : "none";
}

function parseCandidates(
  value: unknown,
  fields: FieldDescriptor[],
  profileKeys: string[]
): MappingCandidate[] | null {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(parsed)) return null;

  const fieldById = new Map(fields.map((field) => [field.id, field]));
  const allowedKeys = new Set(profileKeys);
  return parsed
    .map((item): MappingCandidate | null => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      if (typeof record.fieldId !== "string" || typeof record.profileKey !== "string") {
        return null;
      }
      const field = fieldById.get(record.fieldId);
      if (!field) return null;
      const profileKey = record.profileKey === "SKIP" || allowedKeys.has(record.profileKey)
        ? record.profileKey
        : "SKIP";
      const selectedOptionValue =
        typeof record.selectedOptionValue === "string" &&
        field.options?.some((option) => option.value === record.selectedOptionValue)
          ? record.selectedOptionValue
          : undefined;
      return {
        fieldId: record.fieldId,
        profileKey,
        transform: coerceTransform(record.transform),
        confidence:
          profileKey === "SKIP"
            ? 0
            : Math.max(0, Math.min(1, typeof record.confidence === "number" ? record.confidence : 0)),
        ...(selectedOptionValue ? { selectedOptionValue } : {})
      };
    })
    .filter((item): item is MappingCandidate => item !== null);
}

export async function mapFieldsWithPromptApi(
  fields: FieldDescriptor[],
  profileKeys: string[],
  page: { locale: string; pageTitle: string; pageLang: string },
  screenshot?: Blob
): Promise<{ candidates: MappingCandidate[]; visionUsed: boolean } | null> {
  const model = languageModel();
  if (!model?.create) return null;

  const availability = await promptAvailability(Boolean(screenshot));
  if (availability === "unavailable" || availability === "downloading") return null;

  const payload = {
    fields: fields.map((field) => ({
      ...field,
      bbox: {
        x: Math.round(field.bbox.x),
        y: Math.round(field.bbox.y),
        w: Math.round(field.bbox.w),
        h: Math.round(field.bbox.h)
      },
      options: field.options
    })),
    profileKeys,
    locale: page.locale,
    pageTitle: page.pageTitle,
    pageLang: page.pageLang
  };

  let session: Awaited<ReturnType<NonNullable<LanguageModelLike["create"]>>> | null = null;
  try {
    session = await model.create({
      systemPrompt: SYSTEM_PROMPT,
      responseConstraint: RESPONSE_SCHEMA,
      ...(screenshot ? { expectedInputs: [{ type: "image" }] } : {})
    });
    const input = screenshot
      ? [
          { type: "text", value: JSON.stringify(payload) },
          { type: "image", value: screenshot }
        ]
      : JSON.stringify(payload);
    const response = await session.prompt(input);
    const candidates = parseCandidates(response, fields, profileKeys);
    if (!candidates) return null;
    return { candidates, visionUsed: Boolean(screenshot) };
  } catch {
    return null;
  } finally {
    session?.destroy?.();
  }
}

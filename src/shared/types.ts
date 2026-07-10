export interface Profile {
  version: 1;
  identity: {
    givenName: string;
    familyName: string;
    middleName?: string;
    dateOfBirth?: string;
    gender?: string;
    nationality?: string;
    placeOfBirth?: string;
  };
  contact: {
    emails: Array<{ label: string; value: string; primary?: boolean }>;
    phones: Array<{
      label: string;
      countryCode: string;
      number: string;
      primary?: boolean;
    }>;
  };
  addresses: Array<{
    label: string;
    street: string;
    streetNumber?: string;
    line2?: string;
    city: string;
    region?: string;
    postalCode: string;
    country: string;
    primary?: boolean;
  }>;
  documents?: {
    passportNumber?: string;
    passportExpiry?: string;
    passportIssuingCountry?: string;
    nationalId?: string;
    taxId?: string;
    driversLicense?: string;
  };
  work?: {
    company?: string;
    jobTitle?: string;
    website?: string;
  };
  custom: Array<{ key: string; label: string; value: string }>;
}

export interface ProfileField {
  key: string;
  label: string;
  value: string;
}

export interface FrameRef {
  frameId: number;
  documentId: string;
  url: string;
  origin: string;
  isTop: boolean;
}

export interface FormRef {
  key: string;
  kind: "form" | "role-form" | "fieldset" | "section" | "document";
  label?: string | undefined;
}

export interface FieldLocator {
  tag: string;
  formKey: string;
  occurrence: number;
  domId?: string | undefined;
  name?: string | undefined;
  type?: string | undefined;
}

export interface FieldRef {
  frameId: number;
  documentId: string;
  localId: string;
  formKey: string;
  occurrence: number;
  locator: FieldLocator;
}

export type ControlKind =
  | "text"
  | "textarea"
  | "number"
  | "native-select"
  | "radio-group"
  | "checkbox"
  | "combobox"
  | "listbox"
  | "contenteditable"
  | "unsupported";

export type SafetyBlockReason =
  | "sensitive"
  | "prefilled"
  | "file"
  | "honeypot"
  | "consent"
  | "marketing"
  | "hidden"
  | "manual-choice"
  | "unsupported-control"
  | "detached"
  | "stale-document";

export type SafetyDecision =
  | { action: "allow" }
  | { action: "review"; reason: SafetyBlockReason }
  | { action: "block"; reason: SafetyBlockReason };

export interface FieldDescriptor {
  id: string;
  frameId: number;
  ref?: FieldRef | undefined;
  form?: FormRef | undefined;
  formKey?: string | undefined;
  occurrence?: number | undefined;
  controlKind?: ControlKind | undefined;
  safetySignals?: string[] | undefined;
  tag: string;
  type?: string | undefined;
  name?: string | undefined;
  domId?: string | undefined;
  autocomplete?: string | undefined;
  placeholder?: string | undefined;
  maxLength?: number | undefined;
  minLength?: number | undefined;
  min?: string | undefined;
  max?: string | undefined;
  step?: string | undefined;
  inputMode?: string | undefined;
  ariaRequired?: boolean | undefined;
  required?: boolean | undefined;
  pattern?: string | undefined;
  label: string | null;
  nearbyText: string;
  sectionHeading: string | null;
  options?: Array<{ value: string; text: string }> | undefined;
  bbox: { x: number; y: number; w: number; h: number };
  currentValue?: string | undefined;
}

export const TRANSFORMS = [
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
] as const;

export type TransformName = (typeof TRANSFORMS)[number];

export type EntryStatus =
  | "ready"
  | "skipped-sensitive"
  | "skipped-prefilled"
  | "blocked"
  | "low-confidence"
  | "unresolved-option";

export interface FillPlanEntry {
  fieldId: string;
  signature?: string | undefined;
  ref?: FieldRef | undefined;
  formKey?: string | undefined;
  controlKind?: ControlKind | undefined;
  profileKey: string;
  transform: TransformName;
  value: string;
  confidence: number;
  status: EntryStatus;
  blockReason?: SafetyBlockReason | undefined;
  warning?: string | undefined;
  label?: string | null | undefined;
  selectedOptionValue?: string | undefined;
}

export interface FillPlan {
  signature: string;
  createdAt: number;
  visionUsed: boolean;
  entries: FillPlanEntry[];
  forms?: Array<{ key: string; label: string; fieldCount: number }> | undefined;
  selectedFormKey?: string | undefined;
}

export interface ActiveFillRequest {
  version: 1;
  requestId: string;
  tabId: number;
  topDocumentId: string;
  createdAt: number;
  expiresAt: number;
  fields: FieldDescriptor[];
  plan: FillPlan;
}

export interface VerifyCheckpoint {
  phase: "immediate" | "settled" | "retained";
  actual: string;
  connected: boolean;
  valid: boolean;
  errorText?: string | undefined;
}

export interface VerifyResult {
  fieldId: string;
  status:
    | "ok"
    | "mismatch"
    | "cleared"
    | "failed"
    | "invalid"
    | "detached"
    | "blocked"
    | "unsupported";
  expected: string;
  actual: string;
  message?: string | undefined;
  checkpoints?: VerifyCheckpoint[] | undefined;
}

export interface MappingCorrection {
  fieldId: string;
  profileKey: string;
  transform: TransformName;
  valueOverride?: string | undefined;
}

export interface CachedMapping {
  version?: 2 | undefined;
  signature: string;
  formKey?: string | undefined;
  mappings: Array<{
    fieldKey: string;
    occurrence?: number | undefined;
    profileKey: string;
    transform: TransformName;
    source?: "verified-auto" | "manual" | undefined;
    verifiedAt?: number | undefined;
  }>;
  hitCount: number;
  lastUsed: number;
  createdAt: number;
}

export type Availability =
  | "available"
  | "downloadable"
  | "downloading"
  | "unavailable";

export interface ExtractFieldsResponse {
  fields: FieldDescriptor[];
  url: string;
  pageLang: string;
  pageTitle: string;
}

export interface RequestFillResponse {
  ok: boolean;
  message: string;
  fields?: number | undefined;
  requestId?: string | undefined;
  diagnostics?: FillDiagnostics | undefined;
}

export type FillReadiness =
  | "no-profile"
  | "no-readable-document"
  | "no-fillable-fields"
  | "safe-partial"
  | "preview-ready";

export interface FillDiagnostics {
  readiness: FillReadiness;
  extractedFields: number;
  ready: number;
  lowConfidence: number;
  blocked: number;
  skippedSensitive: number;
  skippedPrefilled: number;
  unresolvedOption: number;
  frameCount: number;
  documentIds: string[];
  formCount: number;
  selectedFormKey?: string | undefined;
}

export interface MappingCandidate {
  fieldId: string;
  profileKey: string;
  transform: TransformName;
  selectedOptionValue?: string | undefined;
  confidence: number;
}

export const SENSITIVE_SEMANTIC_TYPES = [
  "card_number",
  "card_expiry",
  "card_cvc",
  "iban",
  "account_number",
  "routing_number",
  "password",
  "otp"
] as const;

export type SensitiveSemanticType = (typeof SENSITIVE_SEMANTIC_TYPES)[number];

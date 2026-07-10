import { z } from "zod";
import { TRANSFORMS } from "./types";
import type {
  Availability,
  ExtractFieldsResponse,
  FieldDescriptor,
  FillPlan,
  FillDiagnostics,
  RequestFillResponse
} from "./types";

const BboxSchema = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });
const FrameRefSchema = z.object({
  frameId: z.number(),
  documentId: z.string(),
  url: z.string(),
  origin: z.string(),
  isTop: z.boolean()
});
const FormRefSchema = z.object({
  key: z.string(),
  kind: z.enum(["form", "role-form", "fieldset", "section", "document"]),
  label: z.string().optional()
});
const LocatorSchema = z.object({
  tag: z.string(),
  formKey: z.string(),
  occurrence: z.number(),
  domId: z.string().optional(),
  name: z.string().optional(),
  type: z.string().optional()
});
const FieldRefSchema = z.object({
  frameId: z.number(),
  documentId: z.string(),
  localId: z.string(),
  formKey: z.string(),
  occurrence: z.number(),
  locator: LocatorSchema
});
const ControlKindSchema = z.enum([
  "text",
  "textarea",
  "number",
  "native-select",
  "radio-group",
  "checkbox",
  "combobox",
  "listbox",
  "contenteditable",
  "unsupported"
]);
const BlockReasonSchema = z.enum([
  "sensitive",
  "prefilled",
  "file",
  "honeypot",
  "consent",
  "marketing",
  "hidden",
  "manual-choice",
  "unsupported-control",
  "detached",
  "stale-document"
]);

export const FieldDescriptorSchema = z.object({
  id: z.string(),
  frameId: z.number(),
  ref: FieldRefSchema.optional(),
  form: FormRefSchema.optional(),
  formKey: z.string().optional(),
  occurrence: z.number().optional(),
  controlKind: ControlKindSchema.optional(),
  safetySignals: z.array(z.string()).optional(),
  tag: z.string(),
  type: z.string().optional(),
  name: z.string().optional(),
  domId: z.string().optional(),
  autocomplete: z.string().optional(),
  placeholder: z.string().optional(),
  maxLength: z.number().optional(),
  minLength: z.number().optional(),
  min: z.string().optional(),
  max: z.string().optional(),
  step: z.string().optional(),
  inputMode: z.string().optional(),
  ariaRequired: z.boolean().optional(),
  required: z.boolean().optional(),
  pattern: z.string().optional(),
  label: z.string().nullable(),
  nearbyText: z.string(),
  sectionHeading: z.string().nullable(),
  options: z.array(z.object({ value: z.string(), text: z.string() })).optional(),
  bbox: BboxSchema,
  currentValue: z.string().optional()
});

const TransformSchema = z.enum(TRANSFORMS);
const FillPlanEntrySchema = z.object({
  fieldId: z.string(),
  signature: z.string().optional(),
  ref: FieldRefSchema.optional(),
  formKey: z.string().optional(),
  controlKind: ControlKindSchema.optional(),
  profileKey: z.string(),
  transform: TransformSchema,
  value: z.string(),
  confidence: z.number(),
  status: z.enum([
    "ready",
    "skipped-sensitive",
    "skipped-prefilled",
    "blocked",
    "low-confidence",
    "unresolved-option"
  ]),
  blockReason: BlockReasonSchema.optional(),
  warning: z.string().optional(),
  label: z.string().nullable().optional(),
  selectedOptionValue: z.string().optional()
});
export const FillPlanSchema = z.object({
  signature: z.string(),
  createdAt: z.number(),
  visionUsed: z.boolean(),
  entries: z.array(FillPlanEntrySchema),
  forms: z.array(z.object({ key: z.string(), label: z.string(), fieldCount: z.number() })).optional(),
  selectedFormKey: z.string().optional()
});
const VerifyCheckpointSchema = z.object({
  phase: z.enum(["immediate", "settled", "retained"]),
  actual: z.string(),
  connected: z.boolean(),
  valid: z.boolean(),
  errorText: z.string().optional()
});
const VerifyResultSchema = z.object({
  fieldId: z.string(),
  status: z.enum([
    "ok",
    "mismatch",
    "cleared",
    "failed",
    "invalid",
    "detached",
    "blocked",
    "unsupported"
  ]),
  expected: z.string(),
  actual: z.string(),
  message: z.string().optional(),
  checkpoints: z.array(VerifyCheckpointSchema).optional()
});
const MappingCorrectionSchema = z.object({
  fieldId: z.string(),
  profileKey: z.string(),
  transform: TransformSchema,
  valueOverride: z.string().optional()
});
const SelectionSchema = z.object({
  fieldId: z.string(),
  enabled: z.boolean(),
  profileKey: z.string(),
  transform: TransformSchema,
  value: z.string()
});

export const MessageSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("EXTRACT_FIELDS") }),
  z.object({ kind: z.literal("FRAME_READY") }),
  z.object({ kind: z.literal("EXTRACT_FRAME"), requestId: z.string(), frame: FrameRefSchema }),
  z.object({
    kind: z.literal("FIELDS"),
    fields: z.array(FieldDescriptorSchema),
    url: z.string(),
    pageLang: z.string(),
    pageTitle: z.string()
  }),
  z.object({
    kind: z.literal("FRAME_FIELDS"),
    requestId: z.string(),
    frame: FrameRefSchema,
    fields: z.array(FieldDescriptorSchema),
    url: z.string(),
    pageLang: z.string(),
    pageTitle: z.string()
  }),
  z.object({ kind: z.literal("REQUEST_FILL"), tabId: z.number().optional() }),
  z.object({ kind: z.literal("FILL_PLAN"), plan: FillPlanSchema }),
  z.object({ kind: z.literal("SHOW_PREVIEW"), requestId: z.string(), plan: FillPlanSchema }),
  z.object({ kind: z.literal("EXECUTE_FILL"), entries: z.array(FillPlanEntrySchema) }),
  z.object({
    kind: z.literal("EXECUTE_REQUEST"),
    requestId: z.string(),
    selections: z.array(SelectionSchema)
  }),
  z.object({
    kind: z.literal("EXECUTE_FRAME"),
    requestId: z.string(),
    documentId: z.string(),
    entries: z.array(FillPlanEntrySchema)
  }),
  z.object({ kind: z.literal("VERIFY_RESULT"), requestId: z.string().optional(), results: z.array(VerifyResultSchema) }),
  z.object({
    kind: z.literal("SAVE_MAPPING"),
    requestId: z.string().optional(),
    signature: z.string(),
    corrections: z.array(MappingCorrectionSchema)
  }),
  z.object({
    kind: z.literal("RECOMPUTE_ENTRY"),
    requestId: z.string(),
    correction: MappingCorrectionSchema
  }),
  z.object({ kind: z.literal("HIGHLIGHT_REQUEST"), requestId: z.string(), fieldId: z.string().nullable() }),
  z.object({ kind: z.literal("HIGHLIGHT_FIELD"), requestId: z.string(), fieldId: z.string().nullable() }),
  z.object({ kind: z.literal("CANCEL_REQUEST"), requestId: z.string() }),
  z.object({
    kind: z.literal("MODEL_STATUS"),
    status: z.enum(["available", "downloadable", "downloading", "unavailable"]),
    progress: z.number().optional()
  })
]);

export type Msg = z.infer<typeof MessageSchema>;

export function parseMessage(input: unknown): Msg | null {
  const result = MessageSchema.safeParse(input);
  return result.success ? result.data : null;
}

export function fieldsResponse(
  fields: FieldDescriptor[],
  url: string,
  pageLang: string,
  pageTitle: string
): ExtractFieldsResponse {
  return { fields, url, pageLang, pageTitle };
}

export function requestFillResponse(
  ok: boolean,
  message: string,
  fields?: number,
  requestId?: string,
  diagnostics?: FillDiagnostics
): RequestFillResponse {
  const response: RequestFillResponse = { ok, message };
  if (fields !== undefined) response.fields = fields;
  if (requestId !== undefined) response.requestId = requestId;
  if (diagnostics !== undefined) response.diagnostics = diagnostics;
  return response;
}

export function modelStatus(status: Availability, progress?: number): Msg {
  return { kind: "MODEL_STATUS", status, ...(progress !== undefined ? { progress } : {}) };
}

export function asFillPlan(value: unknown): FillPlan | null {
  const result = FillPlanSchema.safeParse(value);
  return result.success ? (result.data as FillPlan) : null;
}

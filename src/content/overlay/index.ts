import { mountOverlay } from "./Overlay";
import { flattenProfile } from "../../shared/profile";
import { getProfile } from "../../shared/storage";
import type { FillPlan, FillPlanEntry, MappingCorrection, VerifyResult } from "../../shared/types";

export async function showPreviewOverlay(
  plan: FillPlan,
  handlers: {
    onFill: (entries: FillPlanEntry[]) => Promise<VerifyResult[]>;
    onSave: (corrections: MappingCorrection[]) => Promise<void>;
    onHighlight?: ((fieldId: string | null) => void) | undefined;
    onCorrect?: ((correction: MappingCorrection) => Promise<FillPlanEntry>) | undefined;
  }
): Promise<void> {
  const profile = await getProfile();
  const profileKeys = profile ? flattenProfile(profile).map((field) => field.key) : [];
  const profileLabels = Object.fromEntries(profile ? flattenProfile(profile).map((field) => [field.key, field.label]) : []);
  mountOverlay({ plan, profileKeys, profileLabels, ...handlers });
}

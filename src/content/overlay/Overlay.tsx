import { render } from "preact";
import { useMemo, useState } from "preact/hooks";
import { highlightField } from "../highlight";
import type { FillPlan, FillPlanEntry, MappingCorrection, VerifyResult } from "../../shared/types";

interface OverlayProps {
  plan: FillPlan;
  profileKeys: string[];
  onCancel: () => void;
  onFill: (entries: FillPlanEntry[]) => Promise<VerifyResult[]>;
  onSave: (corrections: MappingCorrection[]) => Promise<void>;
  onHighlight?: ((fieldId: string | null) => void) | undefined;
  onCorrect?: ((correction: MappingCorrection) => Promise<FillPlanEntry>) | undefined;
}

interface RowState extends FillPlanEntry {
  enabled: boolean;
  edited: boolean;
}

function statusLabel(entry: FillPlanEntry, result?: VerifyResult): string {
  if (result) return result.status;
  if (entry.status === "skipped-sensitive") return "locked";
  if (entry.status === "skipped-prefilled") return "prefilled";
  if (entry.status === "low-confidence") return "review";
  if (entry.status === "unresolved-option") return "option";
  if (entry.status === "blocked") return entry.blockReason ?? "blocked";
  return "ready";
}

function Overlay(props: OverlayProps) {
  const [rows, setRows] = useState<RowState[]>(
    props.plan.entries.map((entry) => ({
      ...entry,
      enabled: entry.status === "ready",
      edited: false
    }))
  );
  const [results, setResults] = useState<VerifyResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [selectedFormKey, setSelectedFormKey] = useState(
    props.plan.selectedFormKey ?? props.plan.forms?.[0]?.key ?? "document"
  );
  const visibleRows = rows.filter(
    (row) => !props.plan.forms || (row.formKey ?? "document") === selectedFormKey
  );
  const fillableCount = visibleRows.filter(
    (row) => row.enabled && row.status === "ready"
  ).length;
  const hasCorrections = rows.some((row) => row.edited);

  const resultById = useMemo(
    () => new Map(results.map((result) => [result.fieldId, result])),
    [results]
  );

  const updateRow = (fieldId: string, patch: Partial<RowState>) => {
    setRows((current) =>
      current.map((row) =>
        row.fieldId === fieldId ? { ...row, ...patch, edited: true } : row
      )
    );
  };

  const correctProfileKey = async (row: RowState, profileKey: string) => {
    if (!props.onCorrect) {
      updateRow(row.fieldId, { profileKey });
      return;
    }
    const recomputed = await props.onCorrect({
      fieldId: row.fieldId,
      profileKey,
      transform: row.transform
    });
    setRows((current) =>
      current.map((candidate) =>
        candidate.fieldId === row.fieldId
          ? {
              ...candidate,
              ...recomputed,
              enabled: recomputed.status === "ready",
              edited: true
            }
          : candidate
      )
    );
  };

  const fill = async () => {
    setBusy(true);
    const selected = visibleRows.filter((row) => row.enabled && row.status === "ready");
    const verifyResults = await props.onFill(selected);
    setResults(verifyResults);
    setBusy(false);
  };

  const save = async () => {
    setBusy(true);
    await props.onSave(
      rows
        .filter((row) => row.edited)
        .map((row) => ({
          fieldId: row.fieldId,
          profileKey: row.profileKey,
          transform: row.transform,
          valueOverride: row.value
        }))
    );
    setRows((current) => current.map((row) => ({ ...row, edited: false })));
    setBusy(false);
  };

  return (
    <section class="fp-panel" aria-label="FormPilot preview">
      <header class="fp-header">
        <div>
          <h2>FormPilot</h2>
          <p>{props.plan.visionUsed ? "Vision + DOM" : "DOM mapping"}</p>
        </div>
        <button class="fp-icon" type="button" onClick={props.onCancel} aria-label="Close">
          x
        </button>
      </header>

      <div class="fp-rows">
        {props.plan.forms && props.plan.forms.length > 1 ? (
          <label class="fp-form-select">
            Form
            <select
              value={selectedFormKey}
              onChange={(event) =>
                setSelectedFormKey((event.currentTarget as HTMLSelectElement).value)
              }
            >
              {props.plan.forms.map((form) => (
                <option value={form.key} key={form.key}>
                  {form.label} ({form.fieldCount})
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {visibleRows.map((row) => {
          const locked = row.status === "skipped-sensitive" || row.status === "blocked";
          const disabled = locked || row.status === "skipped-prefilled";
          const result = resultById.get(row.fieldId);
          return (
            <article
              class={`fp-row fp-${result?.status ?? row.status}`}
              key={row.fieldId}
              onMouseEnter={() =>
                props.onHighlight ? props.onHighlight(row.fieldId) : highlightField(row.fieldId)
              }
              onMouseLeave={() =>
                props.onHighlight ? props.onHighlight(null) : highlightField(null)
              }
            >
              <label class="fp-check">
                <input
                  type="checkbox"
                  checked={row.enabled}
                  disabled={disabled}
                  onChange={(event) =>
                    updateRow(row.fieldId, {
                      enabled: (event.currentTarget as HTMLInputElement).checked
                    })
                  }
                />
                <span>{row.label || row.fieldId}</span>
              </label>
              <input
                class="fp-value"
                value={row.value}
                disabled={locked || row.status !== "ready"}
                onInput={(event) =>
                  updateRow(row.fieldId, {
                    value: (event.currentTarget as HTMLInputElement).value
                  })
                }
              />
              <div class="fp-meta">
                <select
                  value={row.profileKey}
                  disabled={locked}
                  onChange={(event) => {
                    void correctProfileKey(
                      row,
                      (event.currentTarget as HTMLSelectElement).value
                    );
                  }}
                >
                  <option value="SKIP">SKIP</option>
                  {props.profileKeys.map((key) => (
                    <option value={key} key={key}>
                      {key}
                    </option>
                  ))}
                </select>
                <span>{statusLabel(row, result)}</span>
              </div>
            </article>
          );
        })}
      </div>

      <footer class="fp-actions">
        <button type="button" onClick={props.onCancel}>
          Cancel
        </button>
        {hasCorrections ? (
          <button type="button" onClick={save} disabled={busy}>
            Save corrections
          </button>
        ) : null}
        <button class="fp-primary" type="button" onClick={fill} disabled={busy || fillableCount === 0}>
          Fill ({fillableCount})
        </button>
      </footer>
    </section>
  );
}

const STYLE = `
  :host { all: initial; color-scheme: light; }
  .fp-panel {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 2147483647;
    width: min(360px, calc(100vw - 32px));
    max-height: calc(100vh - 32px);
    display: flex;
    flex-direction: column;
    font: 13px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #111827;
    background: #ffffff;
    border: 1px solid #d1d5db;
    box-shadow: 0 18px 50px rgba(17, 24, 39, 0.2);
    border-radius: 8px;
    overflow: hidden;
  }
  .fp-header, .fp-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid #e5e7eb;
  }
  .fp-actions { border-top: 1px solid #e5e7eb; border-bottom: 0; }
  h2 { font-size: 14px; margin: 0; font-weight: 700; }
  p { margin: 2px 0 0; color: #6b7280; font-size: 12px; }
  button, input, select {
    font: inherit;
    border-radius: 6px;
    border: 1px solid #d1d5db;
    background: #fff;
    color: #111827;
  }
  button { padding: 7px 10px; cursor: pointer; }
  button:disabled { opacity: 0.55; cursor: not-allowed; }
  .fp-primary { background: #2563eb; border-color: #2563eb; color: #fff; font-weight: 700; }
  .fp-icon { width: 28px; height: 28px; padding: 0; }
  .fp-rows { overflow: auto; padding: 8px; display: grid; gap: 8px; }
  .fp-row { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; display: grid; gap: 7px; }
  .fp-check { display: grid; grid-template-columns: 18px 1fr; gap: 6px; align-items: start; font-weight: 650; }
  .fp-check span { min-width: 0; overflow-wrap: anywhere; }
  .fp-value { width: 100%; box-sizing: border-box; padding: 7px 8px; }
  .fp-meta { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; }
  .fp-meta select { min-width: 0; width: 100%; padding: 6px 7px; }
  .fp-meta span { color: #4b5563; font-size: 12px; }
  .fp-skipped-sensitive { background: #f9fafb; }
  .fp-ok { border-color: #16a34a; }
  .fp-cleared, .fp-failed { border-color: #dc2626; }
  .fp-mismatch, .fp-unresolved-option, .fp-low-confidence { border-color: #d97706; }
`;

let host: HTMLDivElement | null = null;
let shadow: ShadowRoot | null = null;

export function closeOverlay(): void {
  host?.remove();
  host = null;
  shadow = null;
  highlightField(null);
}

export function mountOverlay(props: Omit<OverlayProps, "onCancel">): void {
  closeOverlay();
  host = document.createElement("div");
  host.dataset.formpilotOverlay = "true";
  shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = STYLE;
  shadow.append(style);
  const root = document.createElement("div");
  shadow.append(root);
  document.documentElement.append(host);
  render(<Overlay {...props} onCancel={closeOverlay} />, root);
}

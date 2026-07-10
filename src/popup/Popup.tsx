import { useEffect, useState } from "preact/hooks";
import { flattenProfile } from "../shared/profile";
import { getProfile } from "../shared/storage";
import type { RequestFillResponse } from "../shared/types";

export function Popup() {
  const [profileFields, setProfileFields] = useState(0);
  const [status, setStatus] = useState("Ready");
  const [busy, setBusy] = useState(false);
  const [diagnostics, setDiagnostics] = useState<RequestFillResponse["diagnostics"]>();
  const [requestId, setRequestId] = useState<string>();

  useEffect(() => {
    void getProfile().then((profile) => {
      setProfileFields(profile ? flattenProfile(profile).length : 0);
      if (!profile) setStatus("Add profile first");
    });
  }, []);

  const fill = async () => {
    setBusy(true);
    setStatus("Reading page");
    try {
      const response = (await chrome.runtime.sendMessage({
        kind: "REQUEST_FILL",
        ...(new URLSearchParams(location.search).get("tab")
          ? { tabId: Number(new URLSearchParams(location.search).get("tab")) }
          : {})
      })) as RequestFillResponse;
      setStatus(response.message);
      setDiagnostics(response.diagnostics);
      setRequestId(response.requestId);
      if (!response.ok && response.message === "Add profile first.") {
        await chrome.runtime.openOptionsPage();
      }
    } catch {
      setStatus("Cannot fill this page");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main
      data-formpilot-status={status}
      data-profile-fields={profileFields}
      data-diagnostics={diagnostics ? JSON.stringify(diagnostics) : ""}
      data-request-id={requestId ?? ""}
    >
      <header>
        <h1>FormPilot</h1>
        <button type="button" onClick={() => chrome.runtime.openOptionsPage()}>
          Settings
        </button>
      </header>
      <p>{status}</p>
      <div class="meter" aria-label="Profile fields">
        <span style={{ width: `${Math.min(100, profileFields * 8)}%` }} />
      </div>
      <button class="primary" type="button" onClick={fill} disabled={busy || profileFields === 0}>
        {busy ? "Working" : "Fill this form"}
      </button>
    </main>
  );
}

import { useEffect, useState } from "preact/hooks";
import { BROKER_SESSION_KEY, type BrokerSession } from "../background/cloudClient";
import { validBrokerUrl } from "../shared/cloudProtocol";

export function CloudMatchingSettings(props: { enabled: boolean; onChange: (enabled: boolean) => void }) {
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("");
  useEffect(() => {
    void chrome.storage.session.get(BROKER_SESSION_KEY).then((data) => {
      const session = data[BROKER_SESSION_KEY] as BrokerSession | undefined;
      if (session) { setUrl(session.url); setConnected(true); }
    });
  }, []);
  const connect = async () => {
    try {
      if (!validBrokerUrl(url) || !/^[a-zA-Z0-9_-]{32,128}$/.test(token)) {
        setStatus("Enter a valid service address and access token."); return;
      }
      await chrome.storage.session.set({ [BROKER_SESSION_KEY]: { url, token } });
      setToken(""); setConnected(true);
      setStatus("Connection saved for this browser session. Service availability is checked when matching.");
    } catch { setStatus("Could not save the connection."); }
  };
  return <div class="cloud-settings">
    <label>
      <input type="checkbox" checked={props.enabled} aria-describedby="cloud-help"
        onChange={(event) => props.onChange(event.currentTarget.checked)} />
      Cloud-assisted matching
    </label>
    <p id="cloud-help">Sends limited field descriptions to a matching service. Saved profile values stay on this device. Review suggestions before filling.</p>
    {props.enabled && <>
      <p>{connected ? "Service connection saved for this browser session." : "Connect a matching service to use this option. Without a connection, fields use local matching or manual review."}</p>
      <label>Service address<input type="url" placeholder="https://your-service.example/match" value={url} onInput={(event) => setUrl(event.currentTarget.value)} /></label>
      <label>Access token<input type="password" autoComplete="off" value={token} onInput={(event) => setToken(event.currentTarget.value)} /></label>
      <button type="button" onClick={() => void connect()}>Save connection</button>
      {connected && <button type="button" onClick={async () => {
        await chrome.storage.session.remove(BROKER_SESSION_KEY);
        setConnected(false); setStatus("Connection removed.");
      }}>Disconnect</button>}
    </>}
    <p role="status">{status}</p>
  </div>;
}

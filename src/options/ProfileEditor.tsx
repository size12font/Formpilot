import { useEffect, useMemo, useState } from "preact/hooks";
import { cloneEmptyProfile } from "../shared/profile";
import {
  getProfile,
  getSettings,
  saveProfile,
  saveSettings,
  unlockProfile,
  type Settings
} from "../shared/storage";
import type { Profile } from "../shared/types";

type SaveState = "idle" | "saving" | "saved" | "error";

function first<T>(items: T[], fallback: T): T {
  return items[0] ?? fallback;
}

function patchProfile(profile: Profile, patch: Partial<Profile>): Profile {
  return { ...profile, ...patch };
}

export function ProfileEditor() {
  const [profile, setProfile] = useState<Profile>(cloneEmptyProfile());
  const [settings, setSettings] = useState<Settings>({
    encryptionEnabled: false,
    simulateTyping: false
  });
  const [passphrase, setPassphrase] = useState("");
  const [customJson, setCustomJson] = useState("[]");
  const [saveState, setSaveState] = useState<SaveState>("idle");

  useEffect(() => {
    void Promise.all([getProfile(), getSettings()]).then(([storedProfile, storedSettings]) => {
      if (storedProfile) {
        setProfile(storedProfile);
        setCustomJson(JSON.stringify(storedProfile.custom, null, 2));
      }
      setSettings(storedSettings);
    });
  }, []);

  const email = first(profile.contact.emails, { label: "primary", value: "", primary: true });
  const phone = first(profile.contact.phones, {
    label: "mobile",
    countryCode: "+1",
    number: "",
    primary: true
  });
  const address = first(profile.addresses, {
    label: "home",
    street: "",
    city: "",
    postalCode: "",
    country: "US",
    primary: true
  });

  const completeness = useMemo(() => {
    const required = [
      profile.identity.givenName,
      profile.identity.familyName,
      email.value,
      phone.number,
      address.street,
      address.city,
      address.postalCode,
      address.country
    ];
    return Math.round((required.filter(Boolean).length / required.length) * 100);
  }, [address.city, address.country, address.postalCode, address.street, email.value, phone.number, profile.identity.familyName, profile.identity.givenName]);

  const updateIdentity = (key: keyof Profile["identity"], value: string) => {
    setProfile((current) =>
      patchProfile(current, {
        identity: { ...current.identity, [key]: value }
      })
    );
  };

  const updateEmail = (value: string) => {
    setProfile((current) => ({
      ...current,
      contact: {
        ...current.contact,
        emails: [{ ...email, value }]
      }
    }));
  };

  const updatePhone = (patch: Partial<typeof phone>) => {
    setProfile((current) => ({
      ...current,
      contact: {
        ...current.contact,
        phones: [{ ...phone, ...patch }]
      }
    }));
  };

  const updateAddress = (patch: Partial<typeof address>) => {
    setProfile((current) => ({
      ...current,
      addresses: [{ ...address, ...patch }]
    }));
  };

  const updateDocuments = (
    key: keyof NonNullable<Profile["documents"]>,
    value: string
  ) => {
    setProfile((current) => ({
      ...current,
      documents: { ...(current.documents ?? {}), [key]: value }
    }));
  };

  const updateWork = (key: keyof NonNullable<Profile["work"]>, value: string) => {
    setProfile((current) => ({
      ...current,
      work: { ...(current.work ?? {}), [key]: value }
    }));
  };

  const persist = async () => {
    setSaveState("saving");
    try {
      const parsedCustom = JSON.parse(customJson) as Profile["custom"];
      if (!Array.isArray(parsedCustom)) throw new Error("Custom fields must be an array.");
      if (passphrase) await unlockProfile(passphrase);
      await saveSettings(settings);
      await saveProfile({ ...profile, custom: parsedCustom });
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  };

  const exportJson = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" })
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "formpilot-profile.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const next = JSON.parse(text) as Profile;
    setProfile(next);
    setCustomJson(JSON.stringify(next.custom ?? [], null, 2));
  };

  return (
    <main class="page">
      <header class="topbar">
        <div>
          <h1>FormPilot Profile</h1>
          <p>{completeness}% complete</p>
        </div>
        <button type="button" onClick={persist} disabled={saveState === "saving"}>
          {saveState === "saving" ? "Saving" : "Save"}
        </button>
      </header>

      <section>
        <h2>Identity</h2>
        <div class="grid">
          <label>
            Given name
            <input value={profile.identity.givenName} onInput={(event) => updateIdentity("givenName", event.currentTarget.value)} />
          </label>
          <label>
            Family name
            <input value={profile.identity.familyName} onInput={(event) => updateIdentity("familyName", event.currentTarget.value)} />
          </label>
          <label>
            Middle name
            <input value={profile.identity.middleName ?? ""} onInput={(event) => updateIdentity("middleName", event.currentTarget.value)} />
          </label>
          <label>
            Date of birth
            <input type="date" value={profile.identity.dateOfBirth ?? ""} onInput={(event) => updateIdentity("dateOfBirth", event.currentTarget.value)} />
          </label>
          <label>
            Gender
            <input value={profile.identity.gender ?? ""} onInput={(event) => updateIdentity("gender", event.currentTarget.value)} />
          </label>
          <label>
            Nationality
            <input value={profile.identity.nationality ?? ""} onInput={(event) => updateIdentity("nationality", event.currentTarget.value.toUpperCase())} />
          </label>
        </div>
      </section>

      <section>
        <h2>Contact</h2>
        <div class="grid">
          <label>
            Email
            <input type="email" value={email.value} onInput={(event) => updateEmail(event.currentTarget.value)} />
          </label>
          <label>
            Phone country code
            <input value={phone.countryCode} onInput={(event) => updatePhone({ countryCode: event.currentTarget.value })} />
          </label>
          <label>
            Phone number
            <input type="tel" value={phone.number} onInput={(event) => updatePhone({ number: event.currentTarget.value })} />
          </label>
        </div>
      </section>

      <section>
        <h2>Address</h2>
        <div class="grid">
          <label>
            Street
            <input value={address.street} onInput={(event) => updateAddress({ street: event.currentTarget.value })} />
          </label>
          <label>
            Street number
            <input value={address.streetNumber ?? ""} onInput={(event) => updateAddress({ streetNumber: event.currentTarget.value })} />
          </label>
          <label>
            Line 2
            <input value={address.line2 ?? ""} onInput={(event) => updateAddress({ line2: event.currentTarget.value })} />
          </label>
          <label>
            City
            <input value={address.city} onInput={(event) => updateAddress({ city: event.currentTarget.value })} />
          </label>
          <label>
            Region
            <input value={address.region ?? ""} onInput={(event) => updateAddress({ region: event.currentTarget.value })} />
          </label>
          <label>
            Postal code
            <input value={address.postalCode} onInput={(event) => updateAddress({ postalCode: event.currentTarget.value })} />
          </label>
          <label>
            Country
            <input maxLength={2} value={address.country} onInput={(event) => updateAddress({ country: event.currentTarget.value.toUpperCase() })} />
          </label>
        </div>
      </section>

      <section>
        <h2>Documents</h2>
        <div class="grid">
          <label>
            Passport number
            <input value={profile.documents?.passportNumber ?? ""} onInput={(event) => updateDocuments("passportNumber", event.currentTarget.value)} />
          </label>
          <label>
            Passport expiry
            <input type="date" value={profile.documents?.passportExpiry ?? ""} onInput={(event) => updateDocuments("passportExpiry", event.currentTarget.value)} />
          </label>
          <label>
            Tax ID
            <input value={profile.documents?.taxId ?? ""} onInput={(event) => updateDocuments("taxId", event.currentTarget.value)} />
          </label>
        </div>
      </section>

      <section>
        <h2>Work</h2>
        <div class="grid">
          <label>
            Company
            <input value={profile.work?.company ?? ""} onInput={(event) => updateWork("company", event.currentTarget.value)} />
          </label>
          <label>
            Job title
            <input value={profile.work?.jobTitle ?? ""} onInput={(event) => updateWork("jobTitle", event.currentTarget.value)} />
          </label>
          <label>
            Website
            <input type="url" value={profile.work?.website ?? ""} onInput={(event) => updateWork("website", event.currentTarget.value)} />
          </label>
        </div>
      </section>

      <section>
        <h2>Custom</h2>
        <textarea value={customJson} onInput={(event) => setCustomJson(event.currentTarget.value)} spellcheck={false} />
      </section>

      <section>
        <h2>Settings</h2>
        <div class="checks">
          <label>
            <input
              type="checkbox"
              checked={settings.encryptionEnabled}
              onChange={(event) =>
                setSettings({ ...settings, encryptionEnabled: event.currentTarget.checked })
              }
            />
            Encrypt local profile
          </label>
          <label>
            Passphrase
            <input type="password" value={passphrase} onInput={(event) => setPassphrase(event.currentTarget.value)} />
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.simulateTyping}
              onChange={(event) =>
                setSettings({ ...settings, simulateTyping: event.currentTarget.checked })
              }
            />
            Simulate typing
          </label>
        </div>
      </section>

      <footer class="bottom">
        <button type="button" onClick={exportJson}>Export JSON</button>
        <label class="import">
          Import JSON
          <input type="file" accept="application/json" onChange={(event) => void importJson(event.currentTarget.files?.[0])} />
        </label>
        <span>{saveState === "saved" ? "Saved" : saveState === "error" ? "Save failed" : ""}</span>
      </footer>
    </main>
  );
}

import type { Profile } from "./types";
import { decryptJson, encryptJson, type EncryptedPayload } from "./crypto";
import { QA_PROFILE } from "./qaProfile";

export const PROFILE_KEY = "profile";
export const ENCRYPTED_PROFILE_KEY = "profile:encrypted";
export const CACHE_KEY_V1 = "cache:v1";
export const CACHE_KEY = "cache:v2";
export const SETTINGS_KEY = "settings:v1";
export const SESSION_PASSPHRASE_KEY = "profilePassphrase";

export interface Settings {
  encryptionEnabled: boolean;
  simulateTyping: boolean;
  cloudMatchingEnabled?: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  encryptionEnabled: false,
  simulateTyping: false,
  cloudMatchingEnabled: false
};

export async function getLocal<T>(key: string): Promise<T | undefined> {
  const data = await chrome.storage.local.get(key);
  return data[key] as T | undefined;
}

export async function setLocal<T>(key: string, value: T): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function getProfile(): Promise<Profile | undefined> {
  const settings = await getSettings();
  if (!settings.encryptionEnabled) {
    return (await getLocal<Profile>(PROFILE_KEY)) ?? qaProfileFallback();
  }

  const encrypted = await getLocal<EncryptedPayload>(ENCRYPTED_PROFILE_KEY);
  if (!encrypted) return qaProfileFallback();
  const session = await chrome.storage.session.get(SESSION_PASSPHRASE_KEY);
  const passphrase = session[SESSION_PASSPHRASE_KEY];
  if (typeof passphrase !== "string" || passphrase.length === 0) {
    return qaProfileFallback();
  }
  try {
    return decryptJson<Profile>(encrypted, passphrase);
  } catch {
    return qaProfileFallback();
  }
}

function qaProfileFallback(): Profile | undefined {
  return __FORMPILOT_QA_PROFILE__ ? QA_PROFILE : undefined;
}

export async function saveProfile(profile: Profile): Promise<void> {
  const settings = await getSettings();
  if (!settings.encryptionEnabled) {
    await setLocal(PROFILE_KEY, profile);
    return;
  }

  const session = await chrome.storage.session.get(SESSION_PASSPHRASE_KEY);
  const passphrase = session[SESSION_PASSPHRASE_KEY];
  if (typeof passphrase !== "string" || passphrase.length === 0) {
    throw new Error("Profile encryption needs passphrase.");
  }

  const encrypted = await encryptJson(profile, passphrase);
  await chrome.storage.local.set({ [ENCRYPTED_PROFILE_KEY]: encrypted });
  await chrome.storage.local.remove(PROFILE_KEY);
}

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await getLocal<Partial<Settings>>(SETTINGS_KEY)) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await setLocal(SETTINGS_KEY, settings);
}

export async function unlockProfile(passphrase: string): Promise<void> {
  await chrome.storage.session.set({ [SESSION_PASSPHRASE_KEY]: passphrase });
}

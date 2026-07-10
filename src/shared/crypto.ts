const ITERATIONS = 600_000;

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function bytesAsArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await globalThis.crypto.subtle.importKey(
    "raw",
    bytesAsArrayBuffer(new TextEncoder().encode(passphrase)),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return globalThis.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: bytesAsArrayBuffer(salt),
      iterations: ITERATIONS,
      hash: "SHA-256"
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export interface EncryptedPayload {
  v: 1;
  salt: string;
  iv: string;
  ciphertext: string;
}

export async function encryptJson(value: unknown, passphrase: string): Promise<EncryptedPayload> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(passphrase, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: bytesAsArrayBuffer(iv) },
    key,
    bytesAsArrayBuffer(plaintext)
  );

  return {
    v: 1,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted))
  };
}

export async function decryptJson<T>(
  payload: EncryptedPayload,
  passphrase: string
): Promise<T> {
  const salt = base64ToBytes(payload.salt);
  const iv = base64ToBytes(payload.iv);
  const key = await deriveKey(passphrase, salt);
  const decrypted = await globalThis.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytesAsArrayBuffer(iv) },
    key,
    bytesAsArrayBuffer(base64ToBytes(payload.ciphertext))
  );
  return JSON.parse(new TextDecoder().decode(decrypted)) as T;
}

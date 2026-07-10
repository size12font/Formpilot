import { webcrypto } from "node:crypto";
import { vi } from "vitest";

Object.defineProperty(globalThis, "crypto", {
  value: webcrypto,
  configurable: true
});

Object.defineProperty(globalThis, "chrome", {
  value: {
    storage: {
      local: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined)
      },
      session: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => undefined)
      }
    }
  },
  configurable: true
});

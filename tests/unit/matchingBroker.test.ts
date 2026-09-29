// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import { createMatchingBroker, choiceRequest, validateChoices } from "../../server/matchingBroker";
import type { CloudRequest } from "@/shared/cloudProtocol";

const token = "t".repeat(48);
const origin = `chrome-extension://${"a".repeat(32)}`;
const request: CloudRequest = { version: 1, fields: [{
  id: "f0", label: "email", placeholder: "", section: "work", control: "email",
  candidates: [{ id: "c0", role: "work email" }, { id: "c1", role: "personal email" }]
}] };
const answer = { type: "choice", choice: "c0", confidence: 0.98, probabilities: { c0: 0.99, c1: 0, NO_MATCH: 0.01 } };
const servers: ReturnType<typeof createMatchingBroker>[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
async function start(fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ answers: { f0: answer } })))) {
  const server = createMatchingBroker({ providerKey: "provider-secret", tokens: [token], extensionOrigins: [origin], fetcher });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/match`;
  const post = (body: unknown = request, headers: Record<string, string> = {}) => fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, Origin: origin, ...headers }, body: JSON.stringify(body)
  });
  return { post, fetcher, url };
}

describe("authenticated matching broker", () => {
  it("asks Choice questions with role descriptions and NO_MATCH, without allowing client instructions", async () => {
    const { post, fetcher } = await start();
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ version: 1, selections: [{ fieldId: "f0", candidateId: "c0", confidence: 0.98 }] });
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://api.typesafe.ai/v1/systemone");
    const body = JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string);
    expect(body.questions.f0).toMatchObject({ type: "choice", criteria: { c0: "work email", c1: "personal email", NO_MATCH: expect.any(String) } });
    expect(body.questions.f0.instructions).toContain("`f0`");
    expect(JSON.stringify(body)).not.toContain("provider-secret");
    expect(Object.keys(body.state.f0)).toEqual(["label", "placeholder", "section", "control"]);
  });

  it("rejects bad authentication and disallowed origins before inference", async () => {
    const { post, fetcher } = await start();
    expect((await post(request, { Authorization: "Bearer wrong" })).status).toBe(401);
    expect((await post(request, { Origin: "https://attacker.test" })).status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects extra fields, unbounded text, raw personal content, and arbitrary roles", async () => {
    const { post, fetcher } = await start();
    for (const invalid of [
      { ...request, profile: { value: "private" } },
      { ...request, fields: [{ ...request.fields[0], label: "email Avery" }] },
      { ...request, fields: [{ ...request.fields[0], candidates: [{ id: "c0", role: "Avery's inbox" }] }] },
      { ...request, fields: Array(13).fill(request.fields[0]) }
    ]) expect((await post(invalid)).status).toBe(400);
    expect((await post({ value: "x".repeat(25_000) })).status).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("bounds usage and makes no automatic retries", async () => {
    const { post, fetcher } = await start(vi.fn<typeof fetch>(async () => new Response("unavailable", { status: 503 })));
    for (let i = 0; i < 10; i++) expect((await post()).status).toBe(502);
    expect((await post()).status).toBe(429);
    expect(fetcher).toHaveBeenCalledTimes(10);
  });

  it("returns promptly on provider timeout", async () => {
    const { post } = await start(vi.fn<typeof fetch>(async (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("timeout")), { once: true });
    })));
    expect((await post()).status).toBe(504);
  });

  it("rejects incomplete or invalid provider responses and gates uncertainty", () => {
    expect(() => validateChoices({ answers: {} }, request)).toThrow();
    expect(() => validateChoices({ answers: { f0: { ...answer, choice: "unknown" } } }, request)).toThrow();
    expect(() => validateChoices({ answers: { f0: { ...answer, probabilities: { c0: 1 } } } }, request)).toThrow();
    expect(validateChoices({ answers: { f0: { ...answer, confidence: 0.4 } } }, request).selections[0]?.candidateId).toBe("NO_MATCH");
    expect(choiceRequest(request).questions.f0?.criteria.NO_MATCH).toBeTruthy();
  });
});

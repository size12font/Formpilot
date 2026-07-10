import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractAllFrames, frameContexts } from "@/background/frameCoordinator";

describe("frame coordinator", () => {
  beforeEach(() => {
    Object.assign(chrome, {
      runtime: {
        ContextType: { TAB: "TAB" },
        getContexts: vi.fn(async () => [
          {
            contextId: "top-context",
            contextType: "TAB",
            documentId: "top-document",
            documentOrigin: "https://example.test",
            documentUrl: "https://example.test/",
            frameId: 0,
            tabId: 7,
            windowId: 1,
            incognito: false
          },
          {
            contextId: "child-context",
            contextType: "TAB",
            documentId: "child-document",
            documentOrigin: "https://forms.test",
            documentUrl: "https://forms.test/embed",
            frameId: 3,
            tabId: 7,
            windowId: 1,
            incognito: false
          }
        ]),
        getManifest: vi.fn(() => ({ content_scripts: [] }))
      },
      tabs: {
        sendMessage: vi.fn(async (_tabId, message) => ({
          fields: [
            {
              id: "fp-1",
              frameId: message.frame.frameId,
              ref: {
                frameId: message.frame.frameId,
                documentId: message.frame.documentId,
                localId: "fp-1",
                formKey: "form:0",
                occurrence: 0,
                locator: { tag: "input", formKey: "form:0", occurrence: 0 }
              },
              formKey: "form:0",
              tag: "input",
              label: "Email",
              nearbyText: "",
              sectionHeading: null,
              bbox: { x: 0, y: 0, w: 100, h: 20 }
            }
          ],
          url: message.frame.url,
          pageLang: "en",
          pageTitle: "Form"
        }))
      }
    });
  });

  it("enumerates top and child documents", async () => {
    const frames = await frameContexts(7);
    expect(frames.map((frame) => [frame.documentId, frame.isTop])).toEqual([
      ["top-document", true],
      ["child-document", false]
    ]);
  });

  it("targets each document and globalizes duplicate local IDs", async () => {
    const extractions = await extractAllFrames(7, "request-1");
    expect(extractions.flatMap((item) => item.fields.map((field) => field.id))).toEqual([
      "top-document:fp-1",
      "child-document:fp-1"
    ]);
    expect(chrome.tabs.sendMessage).toHaveBeenNthCalledWith(
      2,
      7,
      expect.objectContaining({ kind: "EXTRACT_FRAME" }),
      { documentId: "child-document" }
    );
  });

  it("drops stale registry documents when runtime reports a new navigation", async () => {
    const { registerFrameContext } = await import("@/background/frameCoordinator");
    registerFrameContext({
      tabId: 7,
      frameId: 0,
      documentId: "old-document",
      url: "https://example.test/old"
    });
    (chrome.runtime.getContexts as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        contextType: "TAB",
        documentId: "new-document",
        documentOrigin: "https://example.test",
        documentUrl: "https://example.test/new",
        frameId: 0,
        tabId: 7
      }
    ]);
    await expect(frameContexts(7)).resolves.toEqual([
      expect.objectContaining({ documentId: "new-document", isTop: true })
    ]);
  });

  it("retries a late-loading document before classifying it empty", async () => {
    const sendMessage = chrome.tabs.sendMessage as ReturnType<typeof vi.fn>;
    sendMessage.mockReset();
    sendMessage
      .mockResolvedValueOnce({ fields: [], url: "https://example.test/", pageLang: "en", pageTitle: "Late" })
      .mockResolvedValueOnce({ fields: [], url: "https://example.test/", pageLang: "en", pageTitle: "Late" })
      .mockResolvedValueOnce({
        fields: [{ id: "email", tag: "input", label: "Email", nearbyText: "", sectionHeading: null, bbox: { x: 0, y: 0, w: 100, h: 20 } }],
        url: "https://example.test/", pageLang: "en", pageTitle: "Late"
      });
    sendMessage.mockResolvedValueOnce({
      fields: [{ id: "email", tag: "input", label: "Email", nearbyText: "", sectionHeading: null, bbox: { x: 0, y: 0, w: 100, h: 20 } }],
      url: "https://example.test/", pageLang: "en", pageTitle: "Late"
    });
    await expect(extractAllFrames(7, "late-request")).resolves.toHaveLength(2);
    expect(sendMessage).toHaveBeenCalledTimes(4);
  });
});

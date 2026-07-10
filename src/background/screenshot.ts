export async function captureViewport(tab: chrome.tabs.Tab): Promise<Blob | undefined> {
  if (tab.windowId === undefined) return undefined;

  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: "jpeg",
      quality: 60
    });
    const blob = dataUrlToBlob(dataUrl);
    return downscaleBlob(blob, 1024);
  } catch {
    return undefined;
  }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, payload] = dataUrl.split(",");
  const mime = /data:(.*?);base64/.exec(header ?? "")?.[1] ?? "image/jpeg";
  const bytes = Uint8Array.from(atob(payload ?? ""), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

async function downscaleBlob(blob: Blob, maxEdge: number): Promise<Blob> {
  if (!("createImageBitmap" in globalThis) || !("OffscreenCanvas" in globalThis)) {
    return blob;
  }

  try {
    const bitmap = await createImageBitmap(blob);
    const ratio = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    if (ratio >= 1) return blob;

    const width = Math.round(bitmap.width * ratio);
    const height = Math.round(bitmap.height * ratio);
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) return blob;
    context.drawImage(bitmap, 0, 0, width, height);
    return await canvas.convertToBlob({ type: "image/jpeg", quality: 0.6 });
  } catch {
    return blob;
  }
}

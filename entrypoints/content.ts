import { defineContentScript } from "wxt/utils/define-content-script";
import { setupContentScript } from "../src/content";

export default defineContentScript({
  matches: ["<all_urls>"],
  allFrames: true,
  matchAboutBlank: true,
  matchOriginAsFallback: true,
  runAt: "document_idle",
  main() {
    setupContentScript();
  }
});

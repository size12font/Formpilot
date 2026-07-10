import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import preact from "@preact/preset-vite";
import { defineConfig } from "wxt";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const qaProfileEnabled = process.env.FORMPILOT_QA_PROFILE === "1";

export default defineConfig({
  srcDir: ".",
  outDir: "dist",
  manifest: {
    name: "FormPilot",
    description: "Preview-first local form filler powered by Chrome built-in AI.",
    minimum_chrome_version: "138",
    permissions: ["storage", "activeTab", "scripting", "contextMenus"],
    background: {
      type: "module"
    },
    action: {
      default_title: "FormPilot"
    },
    commands: {
      "fill-current-form": {
        suggested_key: {
          default: "Ctrl+Shift+Y",
          mac: "Command+Shift+Y"
        },
        description: "Preview and fill the current form"
      }
    },
    host_permissions: ["<all_urls>"]
  },
  vite: () => ({
    plugins: [preact()],
    define: {
      __FORMPILOT_QA_PROFILE__: JSON.stringify(qaProfileEnabled)
    },
    resolve: {
      alias: {
        "@": resolve(projectRoot, "src")
      }
    },
    build: {
      modulePreload: {
        polyfill: false
      },
      sourcemap: true
    }
  })
});

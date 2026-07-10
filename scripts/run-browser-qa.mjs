import { spawnSync } from "node:child_process";

const build = spawnSync("pnpm", ["build:qa"], { stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);
const run = spawnSync("pnpm", ["exec", "playwright", "test", "-c", "playwright.config.ts", "tests/browser/publicSites.spec.ts", "--workers=1"], { stdio: "inherit" });
process.exit(run.status ?? 1);

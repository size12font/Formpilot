#!/usr/bin/env node
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixturesRoot = resolve(projectRoot, "fixtures");

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"]
]);

function parseArgs(argv) {
  const options = {
    host: process.env.FORMPILOT_FIXTURE_HOST ?? "127.0.0.1",
    port: Number(process.env.PORT ?? process.env.FORMPILOT_FIXTURE_PORT ?? 8765)
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--host") {
      options.host = argv[index + 1] ?? options.host;
      index += 1;
    } else if (arg.startsWith("--host=")) {
      options.host = arg.slice("--host=".length);
    } else if (arg === "--port") {
      options.port = Number(argv[index + 1] ?? options.port);
      index += 1;
    } else if (arg.startsWith("--port=")) {
      options.port = Number(arg.slice("--port=".length));
    }
  }

  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) {
    throw new Error("Port must be an integer from 0 to 65535.");
  }

  return options;
}

async function fixtureLinks(dir = fixturesRoot) {
  const entries = await readdir(dir, { withFileTypes: true });
  const links = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = resolve(dir, entry.name);
      if (entry.isDirectory()) return fixtureLinks(absolutePath);
      if (!entry.isFile() || extname(entry.name) !== ".html") return [];
      const fixturePath = relative(fixturesRoot, absolutePath).split(sep).join("/");
      return [`/fixtures/${fixturePath}`];
    })
  );

  return links.flat().sort();
}

async function renderIndex(origin) {
  const links = await fixtureLinks();
  const rows = links
    .map((href) => `<li><a href="${href}">${href.replace("/fixtures/", "")}</a></li>`)
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>FormPilot Fixtures</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; line-height: 1.5; }
    code { background: #f2f2f2; padding: 0.125rem 0.25rem; border-radius: 4px; }
    li { margin: 0.35rem 0; }
  </style>
</head>
<body>
  <h1>FormPilot Fixtures</h1>
  <p>Use these HTTP targets for Chrome Preview/Fill QA. Start with <code>${origin}/fixtures/plain/contact.html</code>.</p>
  <ul>
${rows}
  </ul>
</body>
</html>`;
}

function send(res, statusCode, body, type = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-type": type
  });
  res.end(body);
}

async function serveFixture(req, res, pathname) {
  if (!pathname.startsWith("/fixtures/")) {
    send(res, 404, "Not found.");
    return;
  }

  const relativePath = decodeURIComponent(pathname.slice("/fixtures/".length));
  const absolutePath = resolve(fixturesRoot, relativePath);
  if (absolutePath !== fixturesRoot && !absolutePath.startsWith(`${fixturesRoot}${sep}`)) {
    send(res, 403, "Forbidden.");
    return;
  }

  let fileStat;
  try {
    fileStat = await stat(absolutePath);
  } catch {
    send(res, 404, "Fixture not found.");
    return;
  }

  if (!fileStat.isFile()) {
    send(res, 404, "Fixture not found.");
    return;
  }

  res.writeHead(200, {
    "cache-control": "no-store",
    "content-length": fileStat.size,
    "content-type": contentTypes.get(extname(absolutePath)) ?? "application/octet-stream"
  });
  createReadStream(absolutePath).pipe(res);
}

const { host, port } = parseArgs(process.argv.slice(2));
const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? "/", `http://${host}:${port}`);
    if (url.pathname === "/" || url.pathname === "/fixtures") {
      const origin = `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${server.address().port}`;
      send(res, 200, await renderIndex(origin), "text/html; charset=utf-8");
      return;
    }

    await serveFixture(req, res, url.pathname);
  })().catch((error) => {
    send(res, 500, error instanceof Error ? error.message : "Server error.");
  });
});

server.listen(port, host, () => {
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  const visibleHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  const origin = `http://${visibleHost}:${actualPort}`;
  console.log(`FormPilot fixtures: ${origin}/`);
  console.log(`Plain contact: ${origin}/fixtures/plain/contact.html`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}

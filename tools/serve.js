// A small static server for the app: `npm run serve`, then open http://localhost:8000.
// Serves the repository root. No caching headers, so a reload always gets fresh files
// (the service worker still caches; bump APP_VERSION or use a private window to bypass it).

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.PORT) || 8000;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary",
  ".wasm": "application/wasm",
};

async function resolve(urlPath) {
  const rel = normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, "");
  const file = join(ROOT, rel);
  if (file !== ROOT.replace(/[/\\]$/, "") && !file.startsWith(ROOT)) return null; // no escaping the root
  if (rel.split(sep).some((part) => part.startsWith("."))) return null; // no .git, .github
  try {
    const s = await stat(file);
    return s.isDirectory() ? join(file, "index.html") : file;
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  const file = await resolve(path);
  try {
    if (!file) throw new Error("not found");
    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type": TYPES[extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found\n");
  }
  console.log(`${res.statusCode} ${req.method} ${path}`);
});

server.listen(PORT, () => {
  console.log(`Wings: http://localhost:${PORT}/`);
});

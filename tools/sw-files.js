// node tools/sw-files.js: rewrites the service worker's FILES list (sw.js) from what the app needs:
// the pages, icons, everything under src/ and data/, the models in assets/models/, and the
// Three.js files the pages import. tests/smoke.test.js checks the list is complete and exists.

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const under = (dir) =>
  readdirSync(join(ROOT, dir)).flatMap((name) => {
    const p = join(dir, name);
    return statSync(join(ROOT, p)).isDirectory() ? under(p) : [p];
  });

const pages = ["./", "index.html", ...["hangar.html"].filter((p) => { try { return statSync(join(ROOT, p)); } catch { return false; } })];
const files = [
  ...pages,
  "manifest.webmanifest",
  ...under("icons").filter((f) => f.endsWith(".png")),
  ...under("src"),
  ...under("data"),
  ...under("assets/models").filter((f) => f.endsWith(".glb") || f.endsWith(".png")), // models and livery textures
  "vendor/three/three.module.js",
  "vendor/three/three.core.js",
  ...under("vendor/three/addons"),
].map((f) => f.split("\\").join("/"));

const sw = readFileSync(join(ROOT, "sw.js"), "utf8");
const body = files.map((f) => `  "${f}",`).join("\n");
const next = sw.replace(/const FILES = \[\n[\s\S]*?\n\];/, `const FILES = [\n${body}\n];`);
writeFileSync(join(ROOT, "sw.js"), next);
console.log(`sw.js caches ${files.length} files`);


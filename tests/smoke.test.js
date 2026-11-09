// Smoke test: the version is consistent everywhere it appears, and every data file parses.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_VERSION } from "../src/version.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), "utf8");

function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? filesUnder(p) : [p];
  });
}

test("APP_VERSION is a version number", () => {
  assert.match(APP_VERSION, /^\d+\.\d+\.\d+$/);
});

test("APP_VERSION matches the top entry of CHANGELOG.md", () => {
  const top = read("CHANGELOG.md").match(/^## +\[?(\d+\.\d+\.\d+)/m);
  assert.ok(top, "CHANGELOG.md has no '## x.y.z' entry");
  assert.equal(top[1], APP_VERSION);
});

test("the service worker's cache name contains APP_VERSION", () => {
  const sw = read("sw.js");
  const version = sw.match(/const VERSION = "([^"]+)"/);
  assert.ok(version, "sw.js has no VERSION constant");
  assert.equal(version[1], APP_VERSION);
  const cache = sw.match(/const CACHE = `([^`]+)`/);
  assert.ok(cache, "sw.js has no CACHE constant");
  assert.ok(cache[1].replace("${VERSION}", version[1]).includes(APP_VERSION));
});

test("every JSON file in data/ parses", () => {
  const files = filesUnder(join(ROOT, "data")).filter((f) => f.endsWith(".json"));
  assert.ok(files.length > 0, "no JSON files found in data/");
  for (const f of files) {
    assert.doesNotThrow(() => JSON.parse(readFileSync(f, "utf8")), `${f} does not parse`);
  }
});

test("no JSON object in data/ repeats a key (JSON.parse would silently keep the last)", () => {
  for (const f of filesUnder(join(ROOT, "data")).filter((x) => x.endsWith(".json"))) {
    // Walk the text: at each object's depth, collect its keys.
    const text = readFileSync(f, "utf8");
    const stack = [];
    const re = /"((?:[^"\\]|\\.)*)"\s*(:)?|[{}\[\]]/g;
    for (let m; (m = re.exec(text)); ) {
      if (m[0] === "{") stack.push(new Set());
      else if (m[0] === "[") stack.push(null);
      else if (m[0] === "}" || m[0] === "]") stack.pop();
      else if (m[2] && stack.at(-1)) {
        assert.ok(!stack.at(-1).has(m[1]), `${f}: key "${m[1]}" appears twice in one object`);
        stack.at(-1).add(m[1]);
      }
    }
  }
});

test("every icon the app names exists, at the size it claims", () => {
  const pngSize = (file) => {
    const b = readFileSync(join(ROOT, file));
    assert.equal(b.toString("ascii", 1, 4), "PNG", `${file} is not a PNG`);
    return [b.readUInt32BE(16), b.readUInt32BE(20)];
  };
  const manifest = JSON.parse(read("manifest.webmanifest"));
  for (const icon of manifest.icons) {
    const [w, h] = icon.sizes.split("x").map(Number);
    assert.deepEqual(pngSize(icon.src), [w, h], icon.src);
  }
  const touch = read("index.html").match(/rel="apple-touch-icon" href="([^"]+)"/);
  assert.ok(touch, "index.html has no apple-touch-icon");
  assert.deepEqual(pngSize(touch[1]), [180, 180], touch[1]);
});

test("the service worker caches every file the app needs, and each one exists", () => {
  const sw = read("sw.js");
  const files = [...sw.match(/const FILES = \[([\s\S]*?)\];/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  for (const f of files) {
    if (f === "./") continue;
    assert.doesNotThrow(() => statSync(join(ROOT, f)), `sw.js caches ${f}, which doesn't exist`);
  }
  const needed = ["src", "data"].flatMap((d) => filesUnder(join(ROOT, d))).map((f) => f.slice(ROOT.length).replace(/^[\/]/, ""));
  for (const f of needed) assert.ok(files.includes(f), `sw.js doesn't cache ${f}`);
  assert.ok(files.includes("assets/models/twin-ii-acro.glb"), "sw.js doesn't cache the model");
});

test("the deploy publishes everything the service worker caches", () => {
  const cp = read(".github/workflows/deploy.yml").match(/cp -r ([^\n]+) _site\//)[1].split(/\s+/);
  const sw = read("sw.js");
  const tops = new Set([...sw.match(/const FILES = \[([\s\S]*?)\];/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1].split("/")[0]).filter((t) => t && t !== "."));
  for (const t of tops) assert.ok(cp.includes(t), `the deploy doesn't copy ${t}`);
});

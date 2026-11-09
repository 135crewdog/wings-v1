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

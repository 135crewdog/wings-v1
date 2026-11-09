// Service worker: keeps the app working offline and lets it install to the home screen.
// The cache name carries APP_VERSION (src/version.js); tests/smoke.test.js checks they match.
// A new version installs, takes over at once and deletes every older Wings cache.

const VERSION = "0.1.2";
const CACHE = `wings-${VERSION}`;

const FILES = [
  "./",
  "index.html",
  "hangar.html",
  "manifest.webmanifest",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "src/app.js",
  "src/input/assists.js",
  "src/input/controls.js",
  "src/input/curves.js",
  "src/input/gamepad.js",
  "src/input/keyboard.js",
  "src/input/tilt.js",
  "src/render/aircraft.js",
  "src/render/camera.js",
  "src/render/frames.js",
  "src/render/shadow-math.js",
  "src/render/sun.js",
  "src/render/surfaces.js",
  "src/render/world.js",
  "src/sim/aero.js",
  "src/sim/atmosphere.js",
  "src/sim/body.js",
  "src/sim/card.js",
  "src/sim/contact.js",
  "src/sim/eigen.js",
  "src/sim/handling.js",
  "src/sim/performance.js",
  "src/sim/sim.js",
  "src/sim/thrust.js",
  "src/sim/trim.js",
  "src/sim/vec.js",
  "src/ui/figures.js",
  "src/ui/hangar.js",
  "src/ui/readouts.js",
  "src/version.js",
  "src/world/ground.js",
  "data/aircraft/super-cub.json",
  "data/aircraft/twin-ii-acro.json",
  "data/places/test-grid.json",
  "data/roster.json",
  "data/surfaces.json",
  "assets/models/super-cub.glb",
  "assets/models/super-cub_bush-red.png",
  "assets/models/super-cub_cub-yellow.png",
  "assets/models/twin-ii-acro.glb",
  "assets/models/twin-ii-acro_cadet-red.png",
  "assets/models/twin-ii-acro_club-white.png",
  "vendor/three/three.module.js",
  "vendor/three/three.core.js",
  "vendor/three/addons/loaders/GLTFLoader.js",
  "vendor/three/addons/utils/BufferGeometryUtils.js",
  "vendor/three/addons/utils/SkeletonUtils.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: "reload" }))))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("wings-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache first, then the network. Files fetched later (cards, models) join this version's cache.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
  );
});

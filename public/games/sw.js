// Games app service worker - keeps every game on the device (so they work offline) and holds back a new
// version until the player taps "Update now" in the app.
const VERSION = "2026.10.21.2245";
const CACHE = "games-" + VERSION;
const FILES = [
  "/games/",
  "/games/index.html",
  "/games/manifest.json",
  "/games/play/pacman.html",
  "/games/play/traffic.html",
  "/games/play/arcade.html",
  "/games/play/coin-flip.html",
  "/games/play/spin-wheel.html",
  "/games/play/goldrush-learning.html",
  "/games/play/cursor-maker.html",
  "/games/icons/arcade.png",
  "/games/icons/click.png",
  "/games/icons/coin.png",
  "/games/icons/cursormaker.png",
  "/games/icons/goldrush.png",
  "/games/icons/icon-192.png",
  "/games/icons/icon-512.png",
  "/games/icons/learning.png",
  "/games/icons/maskable-512.png",
  "/games/icons/pacman.png",
  "/games/icons/reddot.png",
  "/games/icons/traffic.png",
  "/games/icons/wheel.png",
  "/games/icons/zombies.png"
];
self.addEventListener("install", e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" }))))));
self.addEventListener("message", e => { if (e.data === "update-now") self.skipWaiting(); });
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("games-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || !url.pathname.startsWith("/games/")) return;   // leaderboards etc. go to the internet
  e.respondWith(caches.open(CACHE).then(c => c.match(e.request, { ignoreSearch: true })).then(hit => hit || fetch(e.request)));
});

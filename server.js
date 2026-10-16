// Lesson Studio server: serves the app (and English Coach at /english), saves lessons, and relays live
// messages (slides, answers, chat, screen-share signaling) inside private rooms. Each teacher gets a
// room code; only people with that code see that lesson. No extra packages needed.
// Runs on your own computer (Start Lesson Studio.bat) or on a host like Render (uses $PORT).
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");

const PORT = Number(process.env.PORT) || 8787;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const LESSONS = path.join(ROOT, "lessons");
fs.mkdirSync(LESSONS, { recursive: true });

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

const safeName = n => String(n || "").replace(/[^\p{L}\p{N} _.-]/gu, "").trim().slice(0, 80);
// rooms are simple names used in the link: /daniel, /babushka-lessons
const RESERVED = new Set(["english", "api", "ws", "index", "public"]);
const cleanCode = c => String(c || "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
const validRoom = c => c.length >= 2 && !RESERVED.has(c);
const newCode = () => { let c; do { c = "class-" + crypto.randomBytes(3).toString("hex"); } while (rooms.has(c)); return c; };

function readBody(req, limit, cb) {
  const chunks = []; let size = 0;
  req.on("data", c => { size += c.length; if (size > limit) { req.destroy(); return; } chunks.push(c); });
  req.on("end", () => cb(Buffer.concat(chunks).toString("utf8")));
}

// saved lessons live per room: lessons/<ROOM>/<name>.json
function lessonDir(room) { const d = path.join(LESSONS, room); fs.mkdirSync(d, { recursive: true }); return d; }

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const json = (code, obj) => { res.writeHead(code, { "Content-Type": TYPES[".json"] }); res.end(JSON.stringify(obj)); };
  if (url.pathname.startsWith("/api/lessons")) {
    const room = cleanCode(url.searchParams.get("room"));
    if (!validRoom(room)) return json(400, { error: "room name needed" });
    const dir = lessonDir(room);
    if (url.pathname === "/api/lessons" && req.method === "GET") {
      const list = fs.readdirSync(dir).filter(f => f.endsWith(".json")).map(f => ({ name: f.slice(0, -5), saved: fs.statSync(path.join(dir, f)).mtimeMs }))
        .sort((a, b) => b.saved - a.saved);
      return json(200, list);
    }
    const m = url.pathname.match(/^\/api\/lessons\/(.+)$/);
    const name = m && safeName(decodeURIComponent(m[1]));
    if (!name) return json(400, { error: "bad name" });
    const file = path.join(dir, name + ".json");
    if (req.method === "GET") { if (!fs.existsSync(file)) return json(404, {}); res.writeHead(200, { "Content-Type": TYPES[".json"] }); return res.end(fs.readFileSync(file)); }
    if (req.method === "POST") return readBody(req, 50 * 1024 * 1024, body => {
      try { JSON.parse(body); fs.writeFileSync(file, body); json(200, { ok: true }); } catch (e) { json(400, { error: "bad json" }); }
    });
    if (req.method === "DELETE") { if (fs.existsSync(file)) fs.unlinkSync(file); return json(200, { ok: true }); }
    return json(405, {});
  }
  if (url.pathname === "/api/info") return json(200, { addresses: lanAddresses(), port: PORT, hosted: !!process.env.PORT });
  // ---- static files ( /english -> English Coach )
  let p = url.pathname;
  if (p === "/") p = "/index.html";
  if (p === "/english" || p === "/english/") p = "/english/index.html";
  else if (/^\/[a-z0-9-]{2,32}\/?$/i.test(p) && validRoom(cleanCode(p))) p = "/index.html";   // /daniel -> the app, joining room "daniel"
  const file = path.normalize(path.join(PUBLIC, decodeURIComponent(p)));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
  fs.createReadStream(file).pipe(res);
});

// ---------------------------------------------------------------- rooms
// room = { code, clients:Set, state:{lesson, slide, follow, chat}, empty:time }
const rooms = new Map();
function getRoom(code) {
  let r = rooms.get(code);
  if (!r) { r = { code, clients: new Set(), state: { lesson: null, slide: 0, follow: true, chat: [] }, empty: Date.now() }; rooms.set(code, r); }
  return r;
}
// forget rooms nobody has used for 12 hours
setInterval(() => { for (const [k, r] of rooms) if (!r.clients.size && Date.now() - r.empty > 12 * 3600e3) rooms.delete(k); }, 3600e3).unref();

// ---------------------------------------------------------------- minimal WebSocket (RFC 6455)
server.on("upgrade", (req, socket) => {
  if (req.url !== "/ws" || req.headers.upgrade?.toLowerCase() !== "websocket") return socket.destroy();
  const key = req.headers["sec-websocket-key"];
  const accept = crypto.createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n");
  const client = { socket, id: crypto.randomUUID().slice(0, 8), role: "student", name: "?", room: null, buf: Buffer.alloc(0), parts: [] };
  socket.setNoDelay(true);
  socket.setKeepAlive(true, 30000);
  socket.on("data", d => { client.buf = Buffer.concat([client.buf, d]); readFrames(client); });
  socket.on("close", () => leave(client));
  socket.on("error", () => leave(client));
});
// hosts close quiet connections, so ping everyone every 25 s
setInterval(() => { for (const r of rooms.values()) for (const c of r.clients) sendRaw(c, Buffer.alloc(0), 9); }, 25000).unref();

function readFrames(c) {
  for (;;) {
    const b = c.buf; if (b.length < 2) return;
    const fin = (b[0] & 0x80) !== 0, op = b[0] & 0x0f, masked = (b[1] & 0x80) !== 0;
    let len = b[1] & 0x7f, off = 2;
    if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
    if (len > 60 * 1024 * 1024) return c.socket.destroy();
    const maskOff = off; if (masked) off += 4;
    if (b.length < off + len) return;
    let payload = b.subarray(off, off + len);
    if (masked) { const mask = b.subarray(maskOff, maskOff + 4); payload = Buffer.from(payload); for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3]; }
    c.buf = b.subarray(off + len);
    if (op === 8) { c.socket.end(); return; }
    if (op === 9) { sendRaw(c, payload, 10); continue; }
    if (op === 10) continue;
    if (op === 1 || op === 0) {
      c.parts.push(payload);
      if (fin) { const text = Buffer.concat(c.parts).toString("utf8"); c.parts = []; try { onMessage(c, JSON.parse(text)); } catch (e) { /* ignore bad message */ } }
    }
  }
}

function sendRaw(c, data, op = 1) {
  const len = data.length; let head;
  if (len < 126) { head = Buffer.from([0x80 | op, len]); }
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  try { c.socket.write(Buffer.concat([head, data])); } catch (e) { /* closed */ }
}
const send = (c, obj) => sendRaw(c, Buffer.from(JSON.stringify(obj), "utf8"));
const broadcast = (room, obj, except) => { for (const c of room.clients) if (c !== except) send(c, obj); };
const roster = room => [...room.clients].map(c => ({ id: c.id, role: c.role, name: c.name, lang: c.lang }));

function leave(c) {
  const room = c.room; if (!room || !room.clients.delete(c)) return;
  if (!room.clients.size) room.empty = Date.now();
  broadcast(room, { type: "roster", people: roster(room) });
  broadcast(room, { type: "left", id: c.id });
}

function onMessage(c, msg) {
  if (msg.type === "hello") {
    c.role = msg.role === "teacher" ? "teacher" : "student"; c.name = String(msg.name || "?").slice(0, 30); c.lang = msg.lang;
    let code = cleanCode(msg.room);
    if (!validRoom(code)) { if (c.role === "student") { send(c, { type: "noroom", room: code }); return; } code = newCode(); }
    if (c.room) leave(c);
    c.room = getRoom(code); c.room.clients.add(c);
    send(c, { type: "welcome", id: c.id, room: code, state: c.room.state });
    broadcast(c.room, { type: "roster", people: roster(c.room) });
    return;
  }
  const room = c.room; if (!room) return;
  const st = room.state;
  switch (msg.type) {
    case "lesson":
      if (c.role !== "teacher") return;
      st.lesson = msg.lesson; st.slide = msg.slide || 0;
      broadcast(room, { type: "lesson", lesson: st.lesson, slide: st.slide }, c);
      break;
    case "slide":
      if (c.role !== "teacher") return;
      st.slide = msg.slide; st.follow = msg.follow !== false;
      broadcast(room, { type: "slide", slide: st.slide, follow: st.follow }, c);
      break;
    case "answer":
      for (const t of room.clients) if (t.role === "teacher") send(t, { type: "answer", from: c.id, name: c.name, slide: msg.slide, value: msg.value });
      break;
    case "chat": {
      const line = { from: c.id, name: c.name, role: c.role, text: String(msg.text || "").slice(0, 2000), time: Date.now() };
      st.chat.push(line); if (st.chat.length > 200) st.chat.shift();
      broadcast(room, { type: "chat", line });
      break;
    }
    case "pointer": case "ink":
      if (c.role === "teacher") broadcast(room, msg, c);
      break;
    case "rtc":
      for (const t of room.clients) if (t.id === msg.to) send(t, { type: "rtc", from: c.id, data: msg.data });
      break;
    case "share-stop":
      broadcast(room, { type: "share-stop", from: c.id }, c);
      break;
    case "call-join": case "call-leave":
      broadcast(room, { type: msg.type, from: c.id, name: c.name }, c);
      break;
  }
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || [])
    if (a.family === "IPv4" && !a.internal) out.push(a.address);
  return out;
}

server.listen(PORT, "0.0.0.0", () => {
  console.log("\n  Lesson Studio is running!\n");
  console.log("  Teacher (this computer):  http://localhost:" + PORT);
  for (const a of lanAddresses()) console.log("  Student (same Wi-Fi):     http://" + a + ":" + PORT + "/<teacher-name>");
  console.log("  English Coach:            http://localhost:" + PORT + "/english");
  console.log("\n  Keep this window open while you use the app. Close it to stop.\n");
});

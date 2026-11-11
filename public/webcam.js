"use strict";

const $ = id => document.getElementById(id);
const room = new URLSearchParams(location.search).get("room") || "";
const secret = new URLSearchParams(location.hash.slice(1));
const hostToken = secret.get("host") || "";
const hostPassword = secret.get("password") || "";
const isHost = /^[a-f0-9]{64}$/i.test(hostToken) && !!hostPassword;
let passwordProof = "", ws = null, myId = "", hostId = "", live = false, watching = false, local = null;
let reconnectTimer = null, joined = false;
const peers = new Map(), recorders = new Map();
let relay = null;

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", data))].map(b => b.toString(16).padStart(2, "0")).join("");
}
const send = obj => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); };
const viewerUrl = () => `${location.origin}/webcam?room=${room}`;

function show(id) { for (const e of document.querySelectorAll("main>section")) e.classList.add("hidden"); $(id).classList.remove("hidden"); }
function setText(id, text) { $(id).textContent = text; }
function relayMimes() {
  return ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm"]
    .filter(m => window.MediaRecorder?.isTypeSupported?.(m) && window.MediaSource?.isTypeSupported?.(m));
}

$("createRoom").onclick = async () => {
  const password = $("newPassword").value;
  if (password.length < 8) return setText("createError", "Use a password with at least 8 characters.");
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
  const id = (await sha256(token)).slice(0, 32);
  location.href = `${location.origin}/webcam?room=${id}#host=${token}&password=${encodeURIComponent(password)}`;
};
$("newPassword").addEventListener("keydown", e => { if (e.key === "Enter") $("createRoom").click(); });

$("unlock").onclick = async () => {
  const password = $("viewerPassword").value;
  if (!password) return setText("loginError", "Enter the password first.");
  $("unlock").disabled = true; setText("loginError", "Checking password…");
  passwordProof = await sha256(room + ":" + password);
  connect();
};
$("viewerPassword").addEventListener("keydown", e => { if (e.key === "Enter") $("unlock").click(); });

async function connect() {
  clearTimeout(reconnectTimer);
  if (!passwordProof) passwordProof = await sha256(room + ":" + hostPassword);
  if (ws && ws.readyState < 2) { ws.onclose = null; ws.close(); }
  joined = false;
  ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws");
  ws.binaryType = "arraybuffer";
  ws.onopen = () => send({ type: "camera-hello", room, role: isHost ? "host" : "viewer", hostToken: isHost ? hostToken : undefined, proof: passwordProof });
  ws.onmessage = event => { if (typeof event.data === "string") { try { onMessage(JSON.parse(event.data)); } catch (_) {} } else onRelayData(event.data); };
  ws.onclose = () => {
    joined = false;
    if (isHost) { setText("hostStatus", "Connection lost — reconnecting…"); $("hostDot").className = "dot"; }
    else if (passwordProof) { setText("viewerStatus", "Connection lost — reconnecting…"); $("viewerDot").className = "dot"; }
    reconnectTimer = setTimeout(connect, 2500);
  };
  ws.onerror = () => ws.close();
}

async function onMessage(msg) {
  if (msg.type === "camera-error") {
    const errors = {
      "wrong-password": "That password is incorrect.", "too-many-attempts": "Too many wrong attempts. Wait one minute and try again.",
      "host-already-connected": "This broadcaster link is already open somewhere else.", "bad-host-link": "This broadcaster link is invalid.",
      "room-full": "This camera room already has 20 viewers."
    };
    if (isHost) setText("hostError", errors[msg.error] || "Could not open the camera room.");
    else { show("loginCard"); setText("loginError", errors[msg.error] || "Could not enter this camera room."); $("unlock").disabled = false; }
    return;
  }
  if (msg.type === "camera-welcome") {
    joined = true; myId = msg.id; hostId = msg.hostId || ""; live = !!msg.live;
    if (isHost) {
      setText("hostStatus", local ? "Camera is live over the internet" : "Secure room ready — camera is off");
      $("hostDot").className = "dot " + (local ? "live" : "on");
      if (local) send({ type: "camera-start" });
    } else {
      show("viewerCard"); setText("loginError", ""); updateViewerState();
    }
    return;
  }
  if (msg.type === "camera-roster") {
    hostId = msg.people.find(p => p.role === "host")?.id || hostId;
    if (isHost) {
      const viewers = msg.people.filter(p => p.role === "viewer");
      setText("viewerCount", `${viewers.length} viewer${viewers.length === 1 ? "" : "s"}`);
      const ids = new Set(viewers.map(v => v.id));
      for (const id of [...peers.keys()]) if (!ids.has(id)) closePeer(id);
      for (const id of [...recorders.keys()]) if (!ids.has(id)) stopRecorder(id);
    }
    return;
  }
  if (msg.type === "camera-live") { live = true; hostId = msg.hostId || hostId; updateViewerState(); if (watching) askToWatch(); return; }
  if (msg.type === "camera-offline") { live = false; hostId = ""; closeViewerMedia(); updateViewerState(); return; }
  if (msg.type === "camera-watch" && isHost && local) { await offerTo(msg.from); return; }
  if (msg.type === "camera-signal") { await onSignal(msg.from, msg.data); return; }
  if (msg.type === "camera-relay-request" && isHost && local) { startRecorder(msg.from, msg.relayMimes || []); return; }
  if (msg.type === "camera-relay-start" && !isHost) { prepareRelay(msg.from, msg.mime); return; }
}

function updateViewerState() {
  if (isHost || !joined) return;
  $("viewerDot").className = "dot " + (live ? "live" : "on");
  setText("viewerStatus", live ? "Camera is live" : (hostId ? "Broadcaster connected — camera is off" : "Waiting for broadcaster"));
  setText("viewerBadge", live ? (watching ? "CONNECTING…" : "CAMERA IS LIVE") : "WAITING FOR CAMERA");
  $("viewerBadge").className = "badge" + (live ? " liveBadge" : "");
  $("watchCamera").disabled = !live || watching;
}

$("startCamera").onclick = async () => {
  setText("hostError", "");
  try {
    local = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } },
      audio: $("includeMic").checked
    });
    $("hostVideo").srcObject = local; await $("hostVideo").play();
    $("startCamera").disabled = true; $("stopCamera").disabled = false; $("includeMic").disabled = true;
    $("hostBadge").textContent = "LIVE"; $("hostBadge").className = "badge liveBadge"; $("hostDot").className = "dot live";
    setText("hostStatus", "Camera is live over the internet"); send({ type: "camera-start" });
  } catch (e) { setText("hostError", e.name === "NotAllowedError" ? "Camera permission was not allowed." : "Could not start the camera: " + e.message); }
};
$("stopCamera").onclick = stopCamera;
function stopCamera() {
  for (const t of local?.getTracks() || []) t.stop(); local = null; $("hostVideo").srcObject = null;
  for (const id of [...peers.keys()]) closePeer(id); for (const id of [...recorders.keys()]) stopRecorder(id);
  $("startCamera").disabled = false; $("stopCamera").disabled = true; $("includeMic").disabled = false;
  $("hostBadge").textContent = "CAMERA OFF"; $("hostBadge").className = "badge"; $("hostDot").className = "dot on";
  setText("hostStatus", "Secure room ready — camera is off"); send({ type: "camera-stop" });
}

$("watchCamera").onclick = () => { watching = true; $("watchCamera").disabled = true; setText("viewerBadge", "CONNECTING…"); askToWatch(); $("viewerVideo").play().catch(() => {}); };
function askToWatch() { if (live && joined) send({ type: "camera-watch", relayMimes: relayMimes() }); }

async function newPeer(id) {
  closePeer(id);
  const pc = new RTCPeerConnection(await RTC.config(false));
  const item = { pc, pending: [], timer: null }; peers.set(id, item);
  pc.onicecandidate = e => { if (e.candidate) send({ type: "camera-signal", to: id, data: { candidate: e.candidate } }); };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "connected") { clearTimeout(item.timer); if (!isHost) { setText("viewerStatus", "Watching securely"); setText("viewerBadge", "LIVE"); } }
    if (["failed", "disconnected"].includes(pc.connectionState) && !isHost) requestRelay();
  };
  if (!isHost) pc.ontrack = e => { $("viewerVideo").srcObject = e.streams[0]; $("viewerVideo").play().catch(() => {}); };
  item.timer = setTimeout(() => { if (!["connected"].includes(pc.connectionState)) { if (!isHost) requestRelay(); } }, 14000);
  return item;
}

async function offerTo(id) {
  if (!local) return;
  const item = await newPeer(id); for (const track of local.getTracks()) item.pc.addTrack(track, local);
  const offer = await item.pc.createOffer(); await item.pc.setLocalDescription(offer); await RTC.tuneSenders(item.pc, 900);
  send({ type: "camera-signal", to: id, data: { description: item.pc.localDescription } });
}
async function onSignal(from, data) {
  let item = peers.get(from);
  if (data.description?.type === "offer" && !isHost) {
    item = item || await newPeer(from); hostId = from; await item.pc.setRemoteDescription(data.description);
    const answer = await item.pc.createAnswer(); await item.pc.setLocalDescription(answer);
    send({ type: "camera-signal", to: from, data: { description: item.pc.localDescription } });
  } else if (data.description && item) await item.pc.setRemoteDescription(data.description);
  if (data.candidate) {
    if (!item) item = await newPeer(from);
    try { if (item.pc.remoteDescription) await item.pc.addIceCandidate(data.candidate); else item.pending.push(data.candidate); } catch (_) {}
  }
  if (item?.pc.remoteDescription && item.pending.length) for (const c of item.pending.splice(0)) try { await item.pc.addIceCandidate(c); } catch (_) {}
}
function closePeer(id) { const item = peers.get(id); if (item) { clearTimeout(item.timer); try { item.pc.close(); } catch (_) {} peers.delete(id); } }

function requestRelay() {
  if (!watching || relay) return;
  closePeer(hostId); setText("viewerStatus", "Using secure fallback connection…");
  send({ type: "camera-relay-request", relayMimes: relayMimes() });
}
function startRecorder(id, viewerMimes) {
  stopRecorder(id);
  const mime = viewerMimes.find(m => MediaRecorder.isTypeSupported(m)); if (!mime) return;
  let rec; try { rec = new MediaRecorder(local, { mimeType: mime, videoBitsPerSecond: 550000, audioBitsPerSecond: 48000 }); } catch (_) { return; }
  const head = new TextEncoder().encode(id.padEnd(8).slice(0, 8));
  rec.ondataavailable = async e => {
    if (!e.data.size || ws?.readyState !== WebSocket.OPEN || ws.bufferedAmount > 1800000) return;
    const body = new Uint8Array(await e.data.arrayBuffer()), out = new Uint8Array(8 + body.length); out.set(head); out.set(body, 8); ws.send(out.buffer);
  };
  rec.start(350); recorders.set(id, rec); send({ type: "camera-relay-start", to: id, mime });
}
function stopRecorder(id) { const r = recorders.get(id); if (r && r.state !== "inactive") try { r.stop(); } catch (_) {} recorders.delete(id); }

function prepareRelay(from, mime) {
  closeViewerMedia();
  if (!MediaSource.isTypeSupported(mime)) return setText("viewerError", "This browser cannot use the fallback video format. Try Chrome.");
  const ms = new MediaSource(), url = URL.createObjectURL(ms); relay = { from, ms, url, sb: null, queue: [] };
  $("viewerVideo").srcObject = null; $("viewerVideo").src = url;
  ms.addEventListener("sourceopen", () => {
    try { relay.sb = ms.addSourceBuffer(mime); relay.sb.mode = "sequence"; relay.sb.addEventListener("updateend", pumpRelay); pumpRelay(); }
    catch (e) { setText("viewerError", "Fallback player could not start: " + e.message); }
  });
  setText("viewerStatus", "Watching through secure internet relay"); setText("viewerBadge", "LIVE · RELAY"); $("viewerVideo").play().catch(() => {});
}
function onRelayData(buffer) {
  if (!relay) return; const bytes = new Uint8Array(buffer), from = new TextDecoder("latin1").decode(bytes.slice(0, 8)).trim();
  if (from !== relay.from) return; relay.queue.push(bytes.slice(8)); if (relay.queue.length > 50) relay.queue.splice(0, relay.queue.length - 50); pumpRelay();
}
function pumpRelay() {
  const r = relay, sb = r?.sb, video = $("viewerVideo"); if (!sb || sb.updating || !r.queue.length || r.ms.readyState !== "open") return;
  try {
    if (video.buffered.length) { const end = video.buffered.end(video.buffered.length - 1); if (end - video.currentTime > 1.7) video.currentTime = end - .3; }
    sb.appendBuffer(r.queue.shift()); video.play().catch(() => {});
  } catch (_) { r.queue.shift(); }
}
function closeViewerMedia() {
  for (const id of [...peers.keys()]) closePeer(id);
  if (relay) { try { URL.revokeObjectURL(relay.url); } catch (_) {} relay = null; }
  const v = $("viewerVideo"); v.pause(); v.srcObject = null; v.removeAttribute("src"); v.load();
  watching = false;
}

$("copyLink").onclick = async () => { await navigator.clipboard.writeText($("viewerLink").value); setText("copyLink", "Copied!"); setTimeout(() => setText("copyLink", "Copy link"), 1500); };
addEventListener("beforeunload", () => { if (isHost && local) stopCamera(); });

(async function init() {
  if (!/^[a-f0-9]{32}$/i.test(room)) return show("createCard");
  if (isHost) {
    if ((await sha256(hostToken)).slice(0, 32) !== room) { show("createCard"); return setText("createError", "That broadcaster link is invalid."); }
    show("hostCard"); $("viewerLink").value = viewerUrl(); connect();
  } else show("loginCard");
})();

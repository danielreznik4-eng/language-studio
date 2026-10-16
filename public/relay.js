// Relay mode for video calls: used when a direct WebRTC connection can't be made (strict mobile networks,
// firewalls) and no TURN server is configured. Each side records its camera + microphone in short pieces
// (MediaRecorder, WebM) and sends them through the site's own wss:// connection; the other side plays them
// with Media Source Extensions. Works anywhere the website works (HTTPS / port 443), about 1 s behind live.
"use strict";
const Relay = {
  out: new Map(),   // peer id -> MediaRecorder sending to them
  inn: new Map(),   // peer id -> { ms, sb, queue, video, mime }

  mime() {
    const list = ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm"];
    return list.find(m => window.MediaRecorder?.isTypeSupported?.(m) && window.MediaSource?.isTypeSupported?.(m)) || "";
  },
  supported() { return !!this.mime(); },
  active(id) { return this.out.has(id) || this.inn.has(id); },

  // start sending my camera to this person (and ask them to do the same)
  start(id, askBack) {
    if (!Call.local || this.out.has(id)) return;
    Call.closePc(id);   // stop the failed direct connection so sound isn't doubled if it wakes up
    const mime = this.mime(); if (!mime) { Diag.log("relay-unsupported", {}); return; }
    let rec;
    try { rec = new MediaRecorder(Call.local, { mimeType: mime, videoBitsPerSecond: 350000, audioBitsPerSecond: 32000 }); }
    catch (e) { Diag.log("relay-recorder-error", { name: e.name, msg: e.message }); return; }
    const head = new TextEncoder().encode(id.padEnd(8).slice(0, 8));
    rec.ondataavailable = async e => {
      if (!e.data.size || Net.ws?.readyState !== 1) return;
      if (Net.ws.bufferedAmount > 1500000) return;   // the network is behind: skip this piece rather than pile up delay
      const body = new Uint8Array(await e.data.arrayBuffer()), msg = new Uint8Array(8 + body.length);
      msg.set(head); msg.set(body, 8);
      Net.ws.send(msg.buffer);
    };
    rec.onerror = e => Diag.log("relay-recorder-error", { msg: String(e.error?.message || e.error) });
    rec.start(300);
    this.out.set(id, rec);
    Net.send({ type: "rtc", to: id, data: { kind: "call", relay: "start", mime, askBack: !!askBack } });
    Diag.log("relay-send-start", { to: Call.names.get(id) || id, mime });
    Call.badge(id, "🔁 relay 443");
  },
  stopSending(id) { const r = this.out.get(id); if (r && r.state !== "inactive") try { r.stop(); } catch (e) { /* stopped */ } this.out.delete(id); },
  stop(id) {
    this.stopSending(id);
    const r = this.inn.get(id); if (r) { try { if (r.ms.readyState === "open") r.ms.endOfStream(); } catch (e) { /* closed */ } URL.revokeObjectURL(r.url); this.inn.delete(id); }
  },
  stopAll() { for (const id of new Set([...this.out.keys(), ...this.inn.keys()])) this.stop(id); },

  // the other side started relaying to me: get ready to play it, and send mine back
  onStart(from, data) {
    const old = this.inn.get(from); if (old) { URL.revokeObjectURL(old.url); this.inn.delete(from); }
    this.prepare(from, data.mime);
    if (!this.out.has(from)) this.start(from, false);   // already sending? keep going (no restart loop)
  },
  // camera/microphone changed: restart my recordings (the receivers reset their players)
  restartAll() { for (const id of [...this.out.keys()]) { this.stopSending(id); this.start(id, false); } },

  prepare(from, mime) {
    const ms = new MediaSource(), url = URL.createObjectURL(ms);
    const r = { ms, url, sb: null, queue: [], mime: mime || this.mime(), lastTrim: 0 };
    this.inn.set(from, r);
    Call.tile(from, null, Call.names.get(from) || App.people.find(p => p.id === from)?.name || "?", false);
    const v = document.querySelector("#tile-" + from + " video");
    if (v) { v.srcObject = null; v.src = url; v.play().catch(() => {}); r.video = v; }
    ms.addEventListener("sourceopen", () => {
      try { r.sb = ms.addSourceBuffer(r.mime); r.sb.mode = "sequence"; r.sb.addEventListener("updateend", () => this.pump(r)); this.pump(r); }
      catch (e) { Diag.log("relay-player-error", { name: e.name, msg: e.message, mime: r.mime }); }
    });
    Call.badge(from, "🔁 relay 443");
  },

  onData(from, bytes) {
    if (!this.inn.has(from)) this.prepare(from);
    const r = this.inn.get(from);
    r.queue.push(bytes);
    if (r.queue.length > 60) r.queue.splice(0, r.queue.length - 60);
    this.pump(r);
  },

  pump(r) {
    const sb = r.sb; if (!sb || sb.updating || !r.queue.length || r.ms.readyState !== "open") return;
    const v = r.video;
    try {
      // stay close to live: jump ahead if more than 1.5 s behind, and drop played video older than 15 s
      if (v && v.buffered.length) {
        const end = v.buffered.end(v.buffered.length - 1);
        if (end - v.currentTime > 1.5) v.currentTime = end - 0.3;
        if (v.paused) v.play().catch(() => {});
        if (v.currentTime - v.buffered.start(0) > 15 && Date.now() - r.lastTrim > 5000) { r.lastTrim = Date.now(); sb.remove(0, v.currentTime - 5); return; }
      }
      sb.appendBuffer(r.queue.shift());
    } catch (e) {
      if (e.name === "QuotaExceededError" && v) { try { sb.remove(0, Math.max(0, v.currentTime - 2)); } catch (x) { /* busy */ } }
      else Diag.log("relay-append-error", { name: e.name, msg: e.message });
    }
  },
};

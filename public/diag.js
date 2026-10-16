// Call diagnostics: a small in-memory log of what happens around a video call (devices, permissions, ICE,
// route, media flow). It is sent to the room's server (and shown to the teacher) so problems on another
// person's device can be seen. IP addresses are removed; no passwords or TURN credentials are logged.
"use strict";
const Diag = {
  lines: [], started: Date.now(), sentAt: 0,

  scrub(v) {   // drop IP addresses and long tokens
    return JSON.parse(JSON.stringify(v ?? null, (k, x) => {
      if (k === "credential" || k === "username" || k === "candidate" || k === "address" || k === "ip" || k === "relatedAddress") return undefined;
      if (typeof x === "string") return x.replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, "x.x.x.x").replace(/\b[0-9a-f]{0,4}(:[0-9a-f]{0,4}){3,7}\b/gi, "[ipv6]");
      return x;
    }));
  },
  log(event, data) {
    const line = { t: ((Date.now() - this.started) / 1000).toFixed(1), event, data: this.scrub(data) };
    this.lines.push(line); if (this.lines.length > 400) this.lines.shift();
    if (/fail|error|lost|denied/i.test(event)) this.send("auto: " + event);
  },
  env() {
    const c = navigator.connection || {};
    return { ua: navigator.userAgent, lang: navigator.language, secure: window.isSecureContext, screen: screen.width + "x" + screen.height,
      net: c.effectiveType, saveData: c.saveData, role: App.role, room: App.room, mediaDevices: !!navigator.mediaDevices, webrtc: typeof RTCPeerConnection };
  },
  // send the report (at most every 10 s automatically; a button press always sends)
  send(reason, force) {
    if (!force && Date.now() - this.sentAt < 10000) return;
    this.sentAt = Date.now();
    Net.send({ type: "diag", reason, name: App.name, env: this.scrub(this.env()), lines: this.lines.slice(-250) });
  },

  // follow one peer connection: states, gathered candidate types, chosen route, and whether media arrives
  watchPeer(pc, who) {
    const gathered = {};
    pc.addEventListener("icecandidate", e => {
      if (!e.candidate) { this.log("ice-gathering-done", { who, gathered }); return; }
      const c = e.candidate, k = (c.type || "?") + "/" + (c.protocol || "?") + (c.relayProtocol ? "/" + c.relayProtocol : "");
      gathered[k] = (gathered[k] || 0) + 1;
    });
    pc.addEventListener("icecandidateerror", e => this.log("ice-candidate-error", { who, url: String(e.url || "").replace(/\?.*/, ""), code: e.errorCode, text: e.errorText }));
    pc.addEventListener("iceconnectionstatechange", () => this.log("ice-" + pc.iceConnectionState, { who }));
    pc.addEventListener("connectionstatechange", () => this.log("conn-" + pc.connectionState, { who }));
    pc.addEventListener("signalingstatechange", () => this.log("signaling-" + pc.signalingState, { who }));
    pc.addEventListener("track", e => this.log("remote-track", { who, kind: e.track.kind, muted: e.track.muted }));
    // media check after 8 s and 20 s: are bytes and frames really arriving?
    for (const delay of [8000, 20000]) setTimeout(async () => {
      if (pc.connectionState === "closed") return;
      try {
        const stats = await pc.getStats(), out = { who, route: await RTC.route(pc) };
        stats.forEach(r => {
          if (r.type === "inbound-rtp") out["in-" + r.kind] = { bytes: r.bytesReceived, frames: r.framesDecoded, lost: r.packetsLost };
          if (r.type === "outbound-rtp") out["out-" + r.kind] = { bytes: r.bytesSent, frames: r.framesEncoded };
        });
        this.log("media-check-" + delay / 1000 + "s", out);
        if (delay === 20000) this.send("auto: 20s check");
      } catch (e) { this.log("stats-error", { who, e: String(e) }); }
    }, delay);
  },
};
addEventListener("error", e => Diag.log("js-error", { msg: e.message, at: (e.filename || "").split("/").pop() + ":" + e.lineno }));
addEventListener("unhandledrejection", e => Diag.log("js-rejection", { msg: String(e.reason?.message || e.reason) }));

// Shared WebRTC setup for video calls and screen sharing.
// Media is always encrypted with DTLS-SRTP (browsers do not allow turning it off). Signaling goes over the
// page's WebSocket, which is wss:// when the site is on https.
// ICE tries, in order of preference: direct (host / UDP), STUN-discovered UDP, then the TURN relay over
// UDP 3478, TCP 3478 and TLS on TCP 443 (turns:) - so calls still work on networks that only allow HTTPS.
// If a connection breaks: ICE restart first, then a rebuild that uses only the relay.
"use strict";
const RTC = {
  servers: null, expires: 0,

  async iceServers() {
    if (this.servers && Date.now() < this.expires - 120000) return this.servers;
    const list = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] }];
    let ttl = 600;
    try {
      const r = await fetch("/api/turn", { cache: "no-store" });
      if (r.ok) {
        const j = await r.json(); ttl = j.ttl || 600;
        if (j.urls?.length) list.push({ urls: j.urls, username: j.username, credential: j.credential });
      }
    } catch (e) { ttl = 60; }
    this.servers = list; this.expires = Date.now() + ttl * 1000;
    return list;
  },
  hasTurn() { return (this.servers || []).some(s => [].concat(s.urls).some(u => /^turns?:/i.test(u))); },

  async config(relayOnly) {
    const iceServers = await this.iceServers();
    return {
      iceServers,
      iceTransportPolicy: relayOnly && this.hasTurn() ? "relay" : "all",
      bundlePolicy: "max-bundle",       // one transport for audio+video: fewer ports to get through filters
      rtcpMuxPolicy: "require",
      iceCandidatePoolSize: 2,          // start gathering (incl. TURN allocation) before the offer
    };
  },

  // Keep a connection alive. onRecover(level): 1 = do an ICE restart, 2 = rebuild relay-only. Returns a stop function.
  watch(pc, onRecover, onGiveUp) {
    let timer = null, level = 0, stopped = false;
    const check = () => {
      if (stopped) return;
      const st = pc.iceConnectionState;
      clearTimeout(timer);
      if (st === "connected" || st === "completed") { level = 0; return; }
      if (st === "disconnected") timer = setTimeout(() => { if (pc.iceConnectionState === "disconnected") escalate(); }, 5000);
      if (st === "failed") escalate();
    };
    const escalate = () => {
      if (stopped) return;
      level++;
      if (level <= 2) onRecover(level);
      else { stopped = true; onGiveUp && onGiveUp(); }
    };
    pc.addEventListener("iceconnectionstatechange", check);
    // a connection that never manages to connect also counts as failed
    const first = setTimeout(() => { if (!["connected", "completed"].includes(pc.iceConnectionState)) escalate(); }, 15000);
    return () => { stopped = true; clearTimeout(timer); clearTimeout(first); };
  },

  // Cap the video bitrate so a slow or relayed link doesn't stall; keep the frame rate smooth.
  async tuneSenders(pc, maxKbps = 900) {
    for (const s of pc.getSenders()) {
      if (s.track?.kind !== "video") continue;
      try {
        const p = s.getParameters(); p.encodings = p.encodings?.length ? p.encodings : [{}];
        p.encodings[0].maxBitrate = maxKbps * 1000; p.degradationPreference = "maintain-framerate";
        await s.setParameters(p);
      } catch (e) { /* not supported */ }
    }
  },

  // What route is this connection using, and is it encrypted? (for the little badge on each video)
  async route(pc) {
    try {
      const stats = await pc.getStats(); let pair = null, transport = null; const cands = {};
      stats.forEach(r => {
        if (r.type === "transport") transport = r;
        if (r.type === "local-candidate" || r.type === "remote-candidate") cands[r.id] = r;
      });
      stats.forEach(r => { if (r.type === "candidate-pair" && (r.id === transport?.selectedCandidatePairId || (r.nominated && r.state === "succeeded"))) pair = pair || r; });
      if (!pair) return null;
      const loc = cands[pair.localCandidateId] || {}, rem = cands[pair.remoteCandidateId] || {};
      const relay = loc.candidateType === "relay" || rem.candidateType === "relay";
      return {
        relay, protocol: relay ? (loc.relayProtocol || loc.protocol) : loc.protocol,
        direct: loc.candidateType === "host" && rem.candidateType === "host",
        dtls: transport?.dtlsState, cipher: transport?.srtpCipher, rtt: pair.currentRoundTripTime,
      };
    } catch (e) { return null; }
  },
  describe(r) {
    if (!r) return "…";
    const how = r.relay ? "relay " + (r.protocol === "tls" ? "TLS/443" : String(r.protocol || "").toUpperCase()) : r.direct ? "direct" : "P2P";
    const lock = r.dtls === "connected" ? "🔒" : "";
    return lock + how + (r.rtt != null ? " · " + Math.round(r.rtt * 1000) + "ms" : "");
  },
};

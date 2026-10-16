// Video call: everyone in the room who presses "Video call" sees and hears each other (camera + microphone).
// People already in the call connect to each newcomer (they make the offer); the server only passes messages.
// Connection setup, recovery and the TURN relay live in rtc.js.
"use strict";
const Call = {
  local: null, peers: new Map(), names: new Map(), micOn: true, camOn: true, statsTimer: null,

  async toggle() { return this.local ? this.hangUp() : this.join(); },

  // pick devices: the saved choice, else a real camera (virtual cameras usually show only black)
  async devices() {
    const all = await navigator.mediaDevices.enumerateDevices();
    const cams = all.filter(d => d.kind === "videoinput"), mics = all.filter(d => d.kind === "audioinput");
    const saved = store.get("ls-devices", {});
    const cam = cams.find(d => d.deviceId === saved.cam) || cams.find(d => !/virtual|obs|snap|xsplit|nvidia broadcast/i.test(d.label)) || cams[0];
    const mic = mics.find(d => d.deviceId === saved.mic) || mics.find(d => d.deviceId === "default") || mics[0];
    return { cams, mics, cam: cam?.deviceId, mic: mic?.deviceId };
  },
  constraints(camId, micId) {
    return {
      video: camId ? { deviceId: { exact: camId }, width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 30 } } : { width: { ideal: 640 }, height: { ideal: 360 } },
      audio: micId ? { deviceId: { exact: micId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true } : { echoCancellation: true, noiseSuppression: true },
    };
  },
  explain(e) {
    if (!window.isSecureContext) return tr("callNeedsHttps");
    if (e?.name === "NotReadableError" || e?.name === "TrackStartError") return tr("callBusy");
    if (e?.name === "NotAllowedError") return tr("callBlocked");
    return tr("callNoDevices");
  },

  async join() {
    this.stopRing();
    Diag.log("call-join-start", Diag.env());
    if (!window.isSecureContext) { Diag.log("call-error-insecure", {}); toast(tr("callNeedsHttps"), 6000); return; }
    let first;
    const want = { video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 30 } },
                   audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } };
    try { first = await navigator.mediaDevices.getUserMedia(want); }
    catch (e) {
      Diag.log("getusermedia-error-video", { name: e.name, msg: e.message });
      try { first = await navigator.mediaDevices.getUserMedia({ audio: want.audio }); toast(this.explain(e), 6000); }
      catch (e2) { Diag.log("getusermedia-error-audio", { name: e2.name, msg: e2.message }); toast(this.explain(e2), 6000); return; }
    }
    const d = await this.devices();
    const vt = first.getVideoTracks()[0];
    Diag.log("getusermedia-ok", { video: vt ? { label: vt.label, settings: vt.getSettings() } : null, audio: first.getAudioTracks()[0]?.label,
      cams: d.cams.map(c => c.label), mics: d.mics.length });
    this.local = first;
    // switch cameras only if the browser picked a virtual (black) camera, or the person chose another one before
    const saved = store.get("ls-devices", {}).cam;
    const isVirtual = vt && /virtual|obs|snap|xsplit|nvidia broadcast/i.test(vt.label);
    const target = saved && d.cams.some(c => c.deviceId === saved) ? saved : isVirtual ? d.cam : null;
    if (vt && target && target !== vt.getSettings().deviceId) {
      try {
        vt.stop(); first.removeTrack(vt);   // phones can't open two cameras at once
        const s = await navigator.mediaDevices.getUserMedia({ video: this.constraints(target).video });
        first.addTrack(s.getVideoTracks()[0]);
        Diag.log("camera-switched", { to: s.getVideoTracks()[0].label });
      } catch (e) {
        Diag.log("camera-switch-error", { name: e.name });
        try { const s = await navigator.mediaDevices.getUserMedia({ video: want.video }); first.addTrack(s.getVideoTracks()[0]); } catch (x) { /* audio only */ }
      }
    }
    this.micOn = true; this.camOn = this.local.getVideoTracks().length > 0;
    RTC.iceServers().then(list => Diag.log("ice-servers", { stun: true, turn: RTC.hasTurn(), urls: list.flatMap(s => [].concat(s.urls)).map(u => u.replace(/\?.*/, "")) }));
    this.window(); this.tile("me", this.local, tr("you"), true); this.pickers();
    Net.send({ type: "call-join" });
    this.buttons();
    clearInterval(this.statsTimer); this.statsTimer = setInterval(() => this.badges(), 3000);
  },
  hangUp() {
    Diag.log("call-hangup", {}); Diag.send("hang up", true); Relay.stopAll();
    // don't ring again for the call I just left
    this.rangFor = App.people.filter(p => p.inCall && p.id !== App.myId).map(p => p.id).sort().join(",");
    Net.send({ type: "call-leave" });
    for (const id of [...this.peers.keys()]) this.close(id);
    if (this.local) this.local.getTracks().forEach(t => t.stop());
    this.local = null; clearInterval(this.statsTimer);
    document.getElementById("callwin")?.remove();
    this.buttons();
  },

  // ---------------------------------------------------------------- connections
  // entry = { pc, offerer, stopWatch }
  async connect(id, { offerer, relayOnly }) {
    this.close(id, true);
    const pc = new RTCPeerConnection(await RTC.config(relayOnly));
    const entry = { pc, offerer, relayOnly: !!relayOnly };
    Diag.log("peer-created", { who: this.names.get(id) || id, offerer, relayOnly: !!relayOnly, turn: RTC.hasTurn() });
    Diag.watchPeer(pc, this.names.get(id) || id);
    this.local.getTracks().forEach(t => pc.addTrack(t, this.local));
    pc.onicecandidate = e => { if (e.candidate) Net.send({ type: "rtc", to: id, data: { kind: "call", ice: e.candidate } }); };
    pc.ontrack = e => this.tile(id, e.streams[0], this.names.get(id) || App.people.find(p => p.id === id)?.name || "?", false);
    pc.onconnectionstatechange = () => { if (pc.connectionState === "connected") RTC.tuneSenders(pc); };
    // only the side that made the offer drives recovery, so both sides never restart at once
    entry.stopWatch = RTC.watch(pc, level => offerer && this.recover(id, level), () => {
      // nothing direct worked (either side may decide): switch to relay through the website
      Diag.log("call-lost-direct", { who: this.names.get(id) || id });
      if (Relay.supported()) Relay.start(id, true); else this.badge(id, "⚠ " + tr("callLost"));
    });
    this.peers.set(id, entry);
    return entry;
  },
  closePc(id) { const e = this.peers.get(id); if (!e) return; e.stopWatch?.(); e.pc.close(); this.peers.delete(id); },
  close(id, keepTile) {
    this.closePc(id);
    if (!keepTile) { Relay.stop(id); document.getElementById("tile-" + id)?.remove(); }
  },
  async offer(id, opts = {}) {
    const e = opts.reuse && this.peers.get(id) ? this.peers.get(id) : await this.connect(id, { offerer: true, relayOnly: opts.relayOnly });
    await e.pc.setLocalDescription(await e.pc.createOffer(opts.reuse ? { iceRestart: true } : {}));
    Net.send({ type: "rtc", to: id, data: { kind: "call", sdp: e.pc.localDescription, relayOnly: e.relayOnly } });
  },
  // level 1: ICE restart on the same connection; level 2: new connection that uses only the TURN relay
  async recover(id, level) {
    if (!this.local || !this.peers.has(id) || Relay.active(id)) return;
    if (level >= 2 && !RTC.hasTurn()) { Diag.log("fallback-relay-443", { who: this.names.get(id) || id }); Relay.start(id, true); return; }
    this.badge(id, level === 1 ? "↻ " + tr("reconnecting") : "↻ relay");
    Diag.log("recover-level-" + level, { who: this.names.get(id) || id });
    try {
      if (level === 1) { this.peers.get(id).pc.restartIce?.(); await this.offer(id, { reuse: true }); }
      else { RTC.expires = 0; await this.offer(id, { relayOnly: true }); }   // fresh TURN credentials too
    } catch (e) { /* the watchdog escalates again */ }
  },

  // someone joined: if I'm in the call, I phone them
  async onJoin(from, name) {
    this.names.set(from, name);
    if (!this.local) return;   // the roster update rings for me (checkOngoing)
    await this.offer(from);
  },
  onLeave(from) { this.close(from); },

  // someone is already in a call when I arrive (or the call list changed): ring once, and light up the button
  checkOngoing() {
    const others = App.people.filter(p => p.inCall && p.id !== App.myId);
    for (const id of ["b-call", "b-call2"]) { const b = $(id); if (b && !this.local) b.style.boxShadow = others.length ? "0 0 0 3px var(--good)" : ""; }
    if (!others.length) { this.rangFor = null; this.stopRing(); return; }   // call over: next call rings again
    if (this.local) return;
    const key = others.map(p => p.id).sort().join(",");
    if (this.rangFor === key) return;   // already rang (or declined) for this call
    this.rangFor = key;
    this.ring(others.map(p => p.name).join(", "));
  },

  // ---------------------------------------------------------------- incoming call screen
  ring(name) {
    Diag.log("incoming-call", { from: name });
    this.stopRing();
    const o = document.createElement("div"); o.id = "ringwin";
    o.style.cssText = "position:fixed;top:0;right:0;bottom:0;left:0;z-index:80;background:rgba(10,14,22,.82);display:flex;align-items:center;justify-content:center;padding:20px";
    o.innerHTML = `<div style="background:var(--panel);color:var(--ink);border-radius:20px;padding:28px 24px;text-align:center;max-width:360px;width:100%">
      <div style="font-size:56px">📞</div><h2 style="margin:8px 0">${esc(name)}</h2><p class="muted" style="margin:0 0 20px">${tr("callingYou")}</p>
      <div class="row" style="justify-content:center;gap:14px">
        <button class="btn" id="ring-yes" style="background:var(--good);font-size:20px;padding:14px 24px">✅ ${tr("answer")}</button>
        <button class="btn danger" id="ring-no" style="font-size:20px;padding:14px 20px">✖</button></div></div>`;
    document.body.appendChild(o);
    $("ring-yes").onclick = () => this.join();
    $("ring-no").onclick = () => { Diag.log("incoming-declined", {}); this.stopRing(); };   // rangFor stays set: no re-ring for this call
    // ringtone (allowed once the page has been touched; silent otherwise)
    try {
      const ac = new AudioContext(); this.ringAudio = ac;
      const beep = () => { const g = ac.createGain(), osc = ac.createOscillator(); osc.frequency.value = 660; g.gain.value = 0.08; osc.connect(g); g.connect(ac.destination); osc.start(); osc.stop(ac.currentTime + 0.4); };
      beep(); this.ringTimer = setInterval(beep, 1500);
      navigator.vibrate?.([400, 200, 400]);
    } catch (e) { /* no sound */ }
    setTimeout(() => this.stopRing(), 45000);
  },
  stopRing() {
    clearInterval(this.ringTimer); this.ringTimer = null;
    try { this.ringAudio?.close(); } catch (e) { /* closed */ } this.ringAudio = null;
    document.getElementById("ringwin")?.remove();
  },

  async signal(from, data) {
    if (!this.local) return;
    if (data.relay === "start") { Diag.log("relay-receive-start", { from: this.names.get(from) || from, mime: data.mime }); Relay.onStart(from, data); return; }
    if (Relay.active(from) && data.sdp) return;   // already on relay: ignore late direct-connection attempts
    let e = this.peers.get(from);
    if (data.sdp) {
      if (data.sdp.type === "offer") {
        // renegotiation / ICE restart reuses a live connection; anything else (new, failed, relay rebuild) starts fresh
        const reuse = e && !data.relayOnly && e.pc.signalingState === "stable" && !["failed", "closed"].includes(e.pc.connectionState);
        if (!reuse) e = await this.connect(from, { offerer: false, relayOnly: data.relayOnly });
        await e.pc.setRemoteDescription(data.sdp);
        await e.pc.setLocalDescription(await e.pc.createAnswer());
        Net.send({ type: "rtc", to: from, data: { kind: "call", sdp: e.pc.localDescription } });
      } else if (e) await e.pc.setRemoteDescription(data.sdp);
    } else if (data.ice && e) { try { await e.pc.addIceCandidate(data.ice); } catch (x) { /* late or stale candidate */ } }
  },

  // camera / microphone dropdowns in the call window; switching replaces the track for everyone
  async pickers() {
    const box = $("cw-devs"); if (!box) return;
    const d = await this.devices();
    const curCam = this.local.getVideoTracks()[0]?.getSettings().deviceId, curMic = this.local.getAudioTracks()[0]?.getSettings().deviceId;
    const opt = (list, cur, none) => (list.length ? list : [{ deviceId: "", label: none }]).map((x, i) => `<option value="${esc(x.deviceId)}" ${x.deviceId === cur ? "selected" : ""}>${esc(x.label || none + " " + (i + 1))}</option>`).join("");
    box.innerHTML = `<select id="cw-cam-sel" title="${esc(tr("camera"))}" style="flex:1;min-width:0">${opt(d.cams, curCam, "📷")}</select>
      <select id="cw-mic-sel" title="${esc(tr("microphone"))}" style="flex:1;min-width:0">${opt(d.mics, curMic, "🎤")}</select>`;
    const swap = async (kind, id) => {
      const saved = store.get("ls-devices", {}); saved[kind === "video" ? "cam" : "mic"] = id; store.set("ls-devices", saved);
      try {
        const c = this.constraints(kind === "video" ? id : null, kind === "audio" ? id : null);
        const s = await navigator.mediaDevices.getUserMedia(kind === "video" ? { video: c.video } : { audio: c.audio });
        const track = kind === "video" ? s.getVideoTracks()[0] : s.getAudioTracks()[0];
        const old = kind === "video" ? this.local.getVideoTracks()[0] : this.local.getAudioTracks()[0];
        if (old) { this.local.removeTrack(old); old.stop(); }
        this.local.addTrack(track); track.enabled = kind === "video" ? this.camOn : this.micOn;
        for (const { pc } of this.peers.values()) {
          const sender = pc.getSenders().find(x => x.track?.kind === kind);
          if (sender) sender.replaceTrack(track);
        }
        this.tile("me", this.local, tr("you"), true);
        Relay.restartAll();
      } catch (e) { toast(this.explain(e), 6000); }
    };
    $("cw-cam-sel").onchange = e => swap("video", e.target.value);
    $("cw-mic-sel").onchange = e => swap("audio", e.target.value);
  },

  // ---------------------------------------------------------------- the call window
  window() {
    document.getElementById("callwin")?.remove();
    const w = document.createElement("div"); w.id = "callwin"; w.className = "float";
    const phone = innerWidth < 640;
    Object.assign(w.style, phone ? { left: "6px", right: "6px", bottom: "6px", width: "auto", zIndex: 70 } : { right: "16px", bottom: "16px", width: "min(420px, 92vw)", zIndex: 70 });
    w.innerHTML = `<div class="fh"><b>📞 ${tr("videoCall")}</b><span class="row">
      <button class="btn small ghost" id="cw-mic"></button><button class="btn small ghost" id="cw-cam"></button>
      <button class="btn small ghost" id="cw-big" title="${esc(tr("bigger"))}">⤢</button><button class="btn small ghost" id="cw-log" title="${esc(tr("sendReport"))}">📋</button><button class="btn small danger" id="cw-end">${tr("hangUp")}</button></span></div>
      <div id="cw-devs" class="row" style="padding:6px 6px 0;flex-wrap:nowrap"></div>
      <div id="cw-tiles" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));grid-gap:6px;padding:6px"></div>
      <div id="cw-big-controls">
        <div><button id="cb-mic"></button><small>${tr("microphone")}</small></div>
        <div><button id="cb-cam"></button><small>${tr("camera")}</small></div>
        <div><button id="cb-min">⬇</button><small>${tr("toLesson")}</small></div>
        <div><button id="cb-end">📞</button><small>${tr("hangUp")}</small></div></div>`;
    if (document.body.classList.contains("simple")) w.classList.add("full");
    document.body.appendChild(w); draggable(w);
    const paint = () => {
      $("cw-mic").textContent = $("cb-mic").textContent = this.micOn ? "🎤" : "🔇";
      $("cw-cam").textContent = this.camOn ? "📷" : "🚫📷"; $("cb-cam").textContent = this.camOn ? "📷" : "🚫";
      $("cb-mic").style.background = this.micOn ? "#333" : "#d64545"; $("cb-cam").style.background = this.camOn ? "#333" : "#d64545";
    };
    $("cb-mic").onclick = () => $("cw-mic").click(); $("cb-cam").onclick = () => $("cw-cam").click(); $("cb-end").onclick = () => this.hangUp();
    // shrink to a small window to look at the lesson; tap the small window to make it big again
    $("cb-min").onclick = () => { w.classList.remove("full"); w.querySelector(".fh").style.display = ""; };
    w.addEventListener("click", e => { if (document.body.classList.contains("simple") && !w.classList.contains("full") && e.target.closest("#cw-tiles")) w.classList.add("full"); });
    $("cw-mic").onclick = () => { this.micOn = !this.micOn; this.local.getAudioTracks().forEach(t => t.enabled = this.micOn); paint(); };
    $("cw-cam").onclick = () => { this.camOn = !this.camOn; this.local.getVideoTracks().forEach(t => t.enabled = this.camOn); paint(); };
    $("cw-big").onclick = () => { const big = w.style.width.startsWith("min(420"); w.style.width = big ? "min(900px, 96vw)" : "min(420px, 92vw)"; };
    $("cw-end").onclick = () => this.hangUp();
    $("cw-log").onclick = () => { Diag.send("button", true); toast(tr("reportSent")); };
    paint();
  },
  tile(id, stream, name, mine) {
    const box = $("cw-tiles"); if (!box) return;
    let t = document.getElementById("tile-" + id);
    if (!t) {
      t = document.createElement("div"); t.id = "tile-" + id; t.style.cssText = "position:relative;background:#000;border-radius:8px;overflow:hidden;height:0;padding-bottom:56.25%";
      t.innerHTML = `<video autoplay playsinline ${mine ? "muted" : ""} style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;${mine ? "transform:scaleX(-1)" : ""}"></video>
        <span style="position:absolute;left:6px;bottom:4px;color:#fff;font-size:12px;background:#0008;padding:1px 6px;border-radius:5px">${esc(name)}</span>
        ${mine ? "" : `<span class="route" style="position:absolute;right:6px;top:4px;color:#fff;font-size:11px;background:#0008;padding:1px 6px;border-radius:5px">…</span>`}`;
      box.appendChild(t);
    }
    const v = t.querySelector("video");
    if (stream && v.srcObject !== stream) v.srcObject = stream;
    v.play().catch(() => { /* starts after the next click */ });
  },
  badge(id, text) { const b = document.querySelector("#tile-" + id + " .route"); if (b) b.textContent = text; },
  async badges() {
    for (const [id, { pc }] of this.peers) if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") this.badge(id, RTC.describe(await RTC.route(pc)));
    for (const id of Relay.inn.keys()) this.badge(id, "🔒🔁 relay 443");
  },
  buttons() {
    if (typeof simpleLabels === "function") simpleLabels();
    for (const id of ["b-call", "b-call2"]) { const b = $(id); if (b) { b.textContent = this.local ? tr("hangUp") : tr("videoCallBtn"); b.classList.toggle("danger", !!this.local); b.classList.toggle("ghost", !this.local); } }
  },
};

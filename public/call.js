// Video call: everyone in the room who presses "Video call" sees and hears each other (camera + microphone).
// People already in the call connect to each newcomer directly (WebRTC); the server only passes messages.
"use strict";
const Call = {
  local: null, peers: new Map(), names: new Map(), micOn: true, camOn: true,
  ICE: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],

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
      video: camId ? { deviceId: { exact: camId }, width: { ideal: 640 }, height: { ideal: 360 } } : { width: { ideal: 640 }, height: { ideal: 360 } },
      audio: micId ? { deviceId: { exact: micId }, echoCancellation: true, noiseSuppression: true } : { echoCancellation: true, noiseSuppression: true },
    };
  },
  explain(e) {
    if (location.protocol === "http:" && !["localhost", "127.0.0.1"].includes(location.hostname)) return tr("callNeedsHttps");
    if (e?.name === "NotReadableError" || e?.name === "TrackStartError") return tr("callBusy");
    if (e?.name === "NotAllowedError") return tr("callBlocked");
    return tr("callNoDevices");
  },

  async join() {
    let first;
    try { first = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); }   // asks permission once
    catch (e) {
      try { first = await navigator.mediaDevices.getUserMedia({ audio: true }); toast(this.explain(e), 6000); }   // camera failed: audio only
      catch (e2) { toast(this.explain(e2), 6000); return; }
    }
    // now that labels are visible, switch to the real camera if the browser picked a virtual one
    const d = await this.devices();
    const curCam = first.getVideoTracks()[0]?.getSettings().deviceId;
    this.local = first;
    if (first.getVideoTracks().length && d.cam && d.cam !== curCam) {
      try { const better = await navigator.mediaDevices.getUserMedia(this.constraints(d.cam, d.mic)); first.getTracks().forEach(t => t.stop()); this.local = better; } catch (e) { /* keep the first one */ }
    }
    this.micOn = true; this.camOn = this.local.getVideoTracks().length > 0;
    this.window(); this.tile("me", this.local, tr("you"), true); this.pickers();
    Net.send({ type: "call-join" });
    this.buttons();
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
        for (const pc of this.peers.values()) {
          const sender = pc.getSenders().find(x => x.track?.kind === kind || (!x.track && kind === "video"));
          if (sender) sender.replaceTrack(track); else pc.addTrack(track, this.local);
        }
        this.tile("me", this.local, tr("you"), true);
      } catch (e) { toast(this.explain(e), 6000); }
    };
    $("cw-cam-sel").onchange = e => swap("video", e.target.value);
    $("cw-mic-sel").onchange = e => swap("audio", e.target.value);
  },

  hangUp() {
    Net.send({ type: "call-leave" });
    for (const pc of this.peers.values()) pc.close();
    this.peers.clear();
    if (this.local) this.local.getTracks().forEach(t => t.stop());
    this.local = null;
    document.getElementById("callwin")?.remove();
    this.buttons();
  },

  // someone joined: if I'm in the call, I phone them
  async onJoin(from, name) {
    this.names.set(from, name);
    if (!this.local) { toast("📞 " + name + " " + tr("callStarted"), 4000); return; }
    const pc = this.peer(from);
    await pc.setLocalDescription(await pc.createOffer());
    Net.send({ type: "rtc", to: from, data: { kind: "call", sdp: pc.localDescription } });
  },
  onLeave(from) { this.peers.get(from)?.close(); this.peers.delete(from); document.getElementById("tile-" + from)?.remove(); },

  peer(id) {
    this.peers.get(id)?.close();
    const pc = new RTCPeerConnection({ iceServers: this.ICE });
    this.local.getTracks().forEach(t => pc.addTrack(t, this.local));
    pc.onicecandidate = e => { if (e.candidate) Net.send({ type: "rtc", to: id, data: { kind: "call", ice: e.candidate } }); };
    pc.ontrack = e => this.tile(id, e.streams[0], this.names.get(id) || App.people.find(p => p.id === id)?.name || "?", false);
    pc.onconnectionstatechange = () => { if (["failed", "closed"].includes(pc.connectionState)) this.onLeave(id); };
    this.peers.set(id, pc);
    return pc;
  },

  async signal(from, data) {
    if (!this.local) return;
    let pc = this.peers.get(from);
    if (data.sdp) {
      if (data.sdp.type === "offer") pc = this.peer(from);
      if (!pc) return;
      await pc.setRemoteDescription(data.sdp);
      if (data.sdp.type === "offer") { await pc.setLocalDescription(await pc.createAnswer()); Net.send({ type: "rtc", to: from, data: { kind: "call", sdp: pc.localDescription } }); }
    } else if (data.ice && pc) { try { await pc.addIceCandidate(data.ice); } catch (e) { /* late */ } }
  },

  // ---------------------------------------------------------------- the call window
  window() {
    document.getElementById("callwin")?.remove();
    const w = document.createElement("div"); w.id = "callwin"; w.className = "float";
    Object.assign(w.style, { right: "16px", bottom: "16px", width: "min(420px, 92vw)" });
    w.innerHTML = `<div class="fh"><b>📞 ${tr("videoCall")}</b><span class="row">
      <button class="btn small ghost" id="cw-mic"></button><button class="btn small ghost" id="cw-cam"></button>
      <button class="btn small ghost" id="cw-big" title="${esc(tr("bigger"))}">⤢</button><button class="btn small danger" id="cw-end">${tr("hangUp")}</button></span></div>
      <div id="cw-devs" class="row" style="padding:6px 6px 0;flex-wrap:nowrap"></div>
      <div id="cw-tiles" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:6px;padding:6px"></div>`;
    document.body.appendChild(w); draggable(w);
    const paint = () => { $("cw-mic").textContent = this.micOn ? "🎤" : "🔇"; $("cw-cam").textContent = this.camOn ? "📷" : "🚫📷"; };
    $("cw-mic").onclick = () => { this.micOn = !this.micOn; this.local.getAudioTracks().forEach(t => t.enabled = this.micOn); paint(); };
    $("cw-cam").onclick = () => { this.camOn = !this.camOn; this.local.getVideoTracks().forEach(t => t.enabled = this.camOn); paint(); };
    $("cw-big").onclick = () => { const big = w.style.width.startsWith("min(420"); w.style.width = big ? "min(900px, 96vw)" : "min(420px, 92vw)"; };
    $("cw-end").onclick = () => this.hangUp();
    paint();
  },
  tile(id, stream, name, mine) {
    const box = $("cw-tiles"); if (!box) return;
    let t = document.getElementById("tile-" + id);
    if (!t) {
      t = document.createElement("div"); t.id = "tile-" + id; t.style.cssText = "position:relative;background:#000;border-radius:8px;overflow:hidden;aspect-ratio:16/9";
      t.innerHTML = `<video autoplay playsinline ${mine ? "muted" : ""} style="width:100%;height:100%;object-fit:cover;${mine ? "transform:scaleX(-1)" : ""}"></video>
        <span style="position:absolute;left:6px;bottom:4px;color:#fff;font-size:12px;background:#0008;padding:1px 6px;border-radius:5px">${esc(name)}</span>`;
      box.appendChild(t);
    }
    const v = t.querySelector("video");
    if (v.srcObject !== stream) v.srcObject = stream;
    v.play().catch(() => { /* starts after the next click */ });
  },
  buttons() {
    for (const id of ["b-call", "b-call2"]) { const b = $(id); if (b) { b.textContent = this.local ? tr("hangUp") : tr("videoCallBtn"); b.classList.toggle("danger", !!this.local); b.classList.toggle("ghost", !this.local); } }
  },
};

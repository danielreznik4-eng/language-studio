// Video call: everyone in the room who presses "Video call" sees and hears each other (camera + microphone).
// People already in the call connect to each newcomer directly (WebRTC); the server only passes messages.
"use strict";
const Call = {
  local: null, peers: new Map(), names: new Map(), micOn: true, camOn: true,
  ICE: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],

  async toggle() { return this.local ? this.hangUp() : this.join(); },

  async join() {
    try { this.local = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360 }, audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) {
      try { this.local = await navigator.mediaDevices.getUserMedia({ audio: true }); this.camOn = false; }   // no camera: audio only
      catch (e2) { toast(location.protocol === "http:" && !["localhost", "127.0.0.1"].includes(location.hostname) ? tr("callNeedsHttps") : tr("callNoDevices"), 5000); this.local = null; return; }
    }
    this.micOn = true; this.camOn = this.local.getVideoTracks().length > 0;
    this.window(); this.tile("me", this.local, tr("you"), true);
    Net.send({ type: "call-join" });
    this.buttons();
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
    t.querySelector("video").srcObject = stream;
  },
  buttons() {
    for (const id of ["b-call", "b-call2"]) { const b = $(id); if (b) { b.textContent = this.local ? tr("hangUp") : tr("videoCallBtn"); b.classList.toggle("danger", !!this.local); b.classList.toggle("ghost", !this.local); } }
  },
};

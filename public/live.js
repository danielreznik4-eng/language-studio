// Live lesson: sync slides to students, answers back to the teacher, chat, screen sharing (WebRTC) and translation.
"use strict";
// is this text in the other language? (Russian reader: has English words; English reader: has Russian letters)
function needsTr(text) {
  const s = String(text || "");
  return LANG === "ru" ? /[a-z]{2,}/i.test(s) && !/[а-яё]/i.test(s) : /[а-яё]/i.test(s);
}

const Live = {
  trCache: new Map(), trPending: new Set(), trOff: new Set(), trBusy: false,
  autoTr: store.get("ls-autotr", true), chatTr: store.get("ls-chattr", true),
  async trText(text) {
    const key = LANG + "|" + text;
    if (this.trCache.has(key)) return this.trCache.get(key);
    const r = await fetch("/api/translate?to=" + LANG + "&q=" + encodeURIComponent(text));
    if (!r.ok) throw new Error("translate");
    const out = (await r.json()).text || text;
    this.trCache.set(key, out); return out;
  },
  // cached translation now, or null and fetch it, then call redraw()
  trLater(text, redraw) {
    const key = LANG + "|" + text;
    if (this.trCache.has(key)) return this.trCache.get(key);
    if (!this.trPending.has(key)) { this.trPending.add(key); this.trText(text).then(redraw, () => {}).finally(() => this.trPending.delete(key)); }
    return null;
  },
  chat: [], timer: null, stream: null, peers: new Map(), joinUrls: [], pointer: null, texts: null, translating: false,

  pushLesson() {
    if (App.role !== "teacher") return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => Net.send({ type: "lesson", lesson: lesson(), slide: App.slide }), 300);
  },
  pushSlide() { if (App.role === "teacher") Net.send({ type: "slide", slide: App.slide, follow: true }); },

  // ---------------------------------------------------------------- incoming messages
  bind() {
    Net.on("welcome", m => {
      App.myId = m.id; this.chat = m.state.chat || []; App.room = m.room;
      if (Call.local) { Diag.log("reconnected-in-call", {}); Net.send({ type: "call-join" }); }   // after a reconnect, tell the room I'm still in the call
      if (App.role === "teacher") store.set("ls-room", m.room);
      history.replaceState(null, "", "/" + m.room);
      if (App.role === "teacher") { this.pushLesson(); }
      else { App.live.lesson = m.state.lesson; App.live.teacherSlide = m.state.slide; if (App.live.follow) App.live.slide = m.state.slide; renderStudent(); }
      renderSide();
    });
    Net.on("roster", m => {
      const before = new Set(App.people.map(p => p.id)); App.people = m.people;
      Call.checkOngoing();
      if (App.role === "teacher" && this.stream) for (const p of m.people) if (p.role === "student" && !before.has(p.id)) this.call(p.id);
      renderSide();
    });
    Net.on("noroom", () => { showStartError(tr("noRoom")); });
    Net.on("left", m => { Call.onLeave(m.id); const pc = this.peers.get(m.id); if (pc) { pc.close(); this.peers.delete(m.id); } });
    Net.on("lesson", m => { if (App.role !== "student") return; App.live.lesson = m.lesson; App.live.teacherSlide = m.slide; if (App.live.follow) App.live.slide = m.slide; this.texts = null; renderStudent(); });
    Net.on("slide", m => { if (App.role !== "student") return; App.live.teacherSlide = m.slide; if (App.live.follow) { App.live.slide = m.slide; this.texts = null; } renderStudent(); });
    Net.on("answer", m => {
      if (App.role !== "teacher") return;
      const sid = lesson()?.slides[m.slide]?.id || "s" + m.slide;
      (App.answers[sid] = App.answers[sid] || {})[m.from] = { name: m.name, value: m.value };
      renderSide(); toast("✉ " + m.name);
    });
    Net.on("chat", m => {
      this.chat.push(m.line); if (this.chat.length > 200) this.chat.shift(); this.drawChat();
      if (m.line.from !== App.myId) { beep(); if (!document.body.classList.contains("chatopen")) { this.unread = (this.unread || 0) + 1; simpleLabels(); } }
    });
    Net.on("pointer", m => { this.pointer = m.on ? [m.x, m.y] : null; drawPointer(); });
    Net.on("rtc", m => m.data?.kind === "call" ? Call.signal(m.from, m.data) : this.signal(m.from, m.data));
    Net.on("call-join", m => Call.onJoin(m.from, m.name));
    Net.on("diag", m => { if (App.role === "teacher") toast("📋 " + tr("reports") + ": " + m.from + " (" + m.reason + ")", 3000); });
    Net.on("call-leave", m => Call.onLeave(m.from));
    Net.on("share-stop", () => { const v = $("remote"); if (v) v.srcObject = null; this.remoteStream = null; renderSide(); });
  },

  // ---------------------------------------------------------------- screen sharing (teacher -> students)
  async toggleShare() {
    if (this.stream) return this.stopShare();
    try { this.stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true }); }
    catch (e) { return; }
    this.stream.getVideoTracks()[0].onended = () => this.stopShare();
    for (const p of App.people) if (p.role === "student") this.call(p.id);
    $("b-share").textContent = tr("stopShare"); toast(tr("shareNote"), 4000);
  },
  stopShare() {
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null; for (const pc of this.peers.values()) pc.close(); this.peers.clear();
    Net.send({ type: "share-stop" }); $("b-share").textContent = tr("share");
  },
  async newPeer(id, relayOnly) {
    const pc = new RTCPeerConnection(await RTC.config(relayOnly));
    Diag.watchPeer(pc, "screen:" + id);
    pc.onicecandidate = e => { if (e.candidate) Net.send({ type: "rtc", to: id, data: { ice: e.candidate } }); };
    pc.ontrack = e => { this.remoteStream = e.streams[0]; renderSide(); };
    this.peers.set(id, pc); return pc;
  },
  async call(id) {
    const old = this.peers.get(id); if (old) { old._stop?.(); old.close(); }
    const pc = await this.newPeer(id, arguments[1]);
    this.stream.getTracks().forEach(t => pc.addTrack(t, this.stream));
    // teacher side drives recovery: ICE restart, then a relay-only rebuild
    pc._stop = RTC.watch(pc, async level => {
      if (!this.stream || this.peers.get(id) !== pc) return;
      try { if (level === 1) { pc.restartIce?.(); await pc.setLocalDescription(await pc.createOffer({ iceRestart: true })); Net.send({ type: "rtc", to: id, data: { sdp: pc.localDescription } }); }
            else { RTC.expires = 0; await this.call(id, true); } } catch (e) { /* watchdog escalates */ }
    });
    await pc.setLocalDescription(await pc.createOffer());
    Net.send({ type: "rtc", to: id, data: { sdp: pc.localDescription, relayOnly: !!arguments[1] } });
  },
  async signal(from, data) {
    let pc = this.peers.get(from);
    if (data.sdp) {
      if (data.sdp.type === "offer") {
        const reuse = pc && !data.relayOnly && pc.signalingState === "stable" && !["failed", "closed"].includes(pc.connectionState);
        if (!reuse) { if (pc) pc.close(); pc = await this.newPeer(from, data.relayOnly); }
      }
      if (!pc) return;
      await pc.setRemoteDescription(data.sdp);
      if (data.sdp.type === "offer") { await pc.setLocalDescription(await pc.createAnswer()); Net.send({ type: "rtc", to: from, data: { sdp: pc.localDescription } }); }
    } else if (data.ice && pc) { try { await pc.addIceCandidate(data.ice); } catch (e) { /* late candidate */ } }
  },

  // ---------------------------------------------------------------- chat
  chatHTML() {
    return `<div class="panel row" style="justify-content:space-between"><h3>💬 ${tr("chat")}</h3><label class="muted" style="font-size:12px"><input type="checkbox" id="chat-tr" ${this.chatTr ? "checked" : ""}> 🌐 ${tr("autoTranslate")}</label></div><div class="chat"><div class="chatlog" id="chatlog"></div>
      <div class="chatin"><input type="text" id="chatin" placeholder="${esc(tr("typeMsg"))}" maxlength="2000"><button class="btn" id="chatsend">➤</button></div></div>`;
  },
  bindChat() {
    const send = () => { const i = $("chatin"), t = i.value.trim(); if (!t) return; Net.send({ type: "chat", text: t }); i.value = ""; };
    $("chatsend").onclick = send; $("chatin").onkeydown = e => { if (e.key === "Enter") send(); };
    $("chat-tr").onchange = e => { this.chatTr = e.target.checked; store.set("ls-chattr", this.chatTr); this.drawChat(); };
    this.drawChat();
  },
  drawChat() {
    const log = $("chatlog"); if (!log) return;
    log.innerHTML = this.chat.map(l => `<div class="msg ${l.from === App.myId ? "me" : ""}"><b>${esc(l.name)}${l.role === "teacher" ? " 🎓" : ""}</b>
      <span class="muted" style="font-size:11px">${new Date(l.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span><div>${esc(l.text)}</div>${this.chatLine(l)}</div>`).join("");
    log.scrollTop = log.scrollHeight;
  },

  // translation line under a chat message from someone else
  chatLine(l) {
    if (!this.chatTr || l.from === App.myId || !needsTr(l.text)) return "";
    const t = this.trLater(l.text, () => this.drawChat());
    return `<div class="muted" style="font-style:italic;font-size:13px;margin-top:2px">🌐 ${t ? esc(t) : "…"}</div>`;
  },

  // ---------------------------------------------------------------- slide translation (student); auto = runs by itself
  async translate(auto) {
    const s = studentSlide(); if (!s) return;
    if (!auto && this.texts) { this.texts = null; this.trOff.add(s.id); renderStudent(); return; }
    if (!auto) this.trOff.delete(s.id);
    const items = s.objects.filter(o => o.type === "text").map(o => [o.id, o.text]);
    const q = s.question; if (q && q.type !== "none") { items.push(["q:prompt", q.prompt]); q.options.forEach((o, i) => items.push(["q:" + i, o.text])); }
    if (!items.some(([, text]) => needsTr(text))) { if (!auto) toast(tr("alreadyMine")); return; }
    if (!auto) toast(tr("translating"));
    const out = {};
    try {
      for (const [id, text] of items) out[id] = needsTr(text) ? await this.trText(text) : text;
      if (studentSlide()?.id !== s.id) return;   // the teacher moved on meanwhile
      this.texts = out; renderStudent();
    } catch (e) { if (!auto) toast(tr("translateFail")); }
  },
};

function beep() {
  try { const a = new AudioContext(), o = a.createOscillator(), g = a.createGain(); o.frequency.value = 880; g.gain.value = 0.05; o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + 0.08); } catch (e) { /* no audio */ }
}

// ---------------------------------------------------------------- side panel (both roles)
function renderSide() {
  const side = $("side"); if (!side || !App.role) return;
  const people = `<div class="panel peoplepanel"><h3>👥 ${tr("people")}</h3><div class="people">${App.people.map(p =>
    `<div class="person"><span>${p.role === "teacher" ? "🎓" : "🙋"} ${esc(p.name)}${p.id === App.myId ? " ✦" : ""}</span><span class="muted">${p.lang === "ru" ? "RU" : "EN"}</span></div>`).join("")}</div></div>`;
  if (App.role === "teacher") {
    const s = slide(), ans = App.answers[s?.id] || {}, q = s?.question;
    const right = v => {
      if (!q || q.type === "none") return null;
      if (q.type === "choice") { const r = q.options.find(o => o.right); return r ? r.text === v : null; }
      if (!q.answer) return null;
      return q.type === "number" ? (() => { const a = answerValue(v), b = answerValue(q.answer); return a != null && b != null && Math.abs(a - b) < 1e-9; })() : String(v).trim().toLowerCase() === q.answer.trim().toLowerCase();
    };
    side.innerHTML = propsHTML()
      + `<div class="panel"><h3>🔗 ${tr("room")}: <span style="color:var(--acc)">/${esc(App.room || "…")}</span> <button class="btn small ghost" id="b-room">${tr("changeLink")}</button></h3>
          <div class="muted" style="font-size:12px">${tr("shareLink")}</div>${Live.joinUrls.map(u => `<div class="row"><b style="word-break:break-all;flex:1">${esc(u)}</b><button class="btn small ghost" data-copy="${esc(u)}">${tr("copy")}</button></div>`).join("") || "<span class='muted'>…</span>"}</div>`
      + people
      + `<div class="panel"><h3>✉ ${tr("answers")}</h3><div class="answers">${Object.values(ans).map(a => { const ok = right(a.value);
          const trd = needsTr(a.value) ? Live.trLater(a.value, renderSide) : null;
          return `<div class="ans ${ok === true ? "ok" : ok === false ? "no" : ""}"><b>${esc(a.name)}:</b> ${esc(a.value)} ${ok === true ? "✔" : ok === false ? "✖" : ""}${trd ? `<div class="muted" style="font-style:italic">🌐 ${esc(trd)}</div>` : ""}</div>`; }).join("") || `<span class="muted">${tr("noAnswers")}</span>`}</div></div>`
      + Live.chatHTML();
    bindProps();
    const br = $("b-room"); if (br) br.onclick = changeRoom;
    side.querySelectorAll("[data-copy]").forEach(b => b.onclick = () => { navigator.clipboard?.writeText(b.dataset.copy).then(() => toast(tr("copied"))).catch(() => {}); });
  } else {
    side.innerHTML = (Live.remoteStream ? `<div class="panel"><h3>🖥 ${tr("teacherScreen")}</h3><video id="remote" autoplay playsinline controls muted></video></div>` : "")
      + people + Live.chatHTML();
    const v = $("remote"); if (v && Live.remoteStream) { v.srcObject = Live.remoteStream; v.muted = false; }
  }
  Live.bindChat();
}

// ---------------------------------------------------------------- student view
function studentSlide() { const L = App.live.lesson; return L?.slides[Math.min(App.live.slide, L.slides.length - 1)]; }

function renderStudent() {
  if (App.role !== "student") return;
  const L = App.live.lesson, box = $("slidebox"), tb = $("toolbar"), qb = $("qbox");
  $("tabs").innerHTML = L ? `<div class="tab on"><span>${esc(L.name)}</span></div>` : "";
  $("b-follow").textContent = App.live.follow ? tr("follow") : tr("free");
  if (!L) { box.innerHTML = `<div style="padding:40px;text-align:center" class="muted">${tr("waiting")}</div>`; box.style.width = "auto"; box.style.height = "auto"; tb.innerHTML = ""; qb.innerHTML = ""; return; }
  const s = studentSlide();
  tb.innerHTML = `<button class="tool" id="sv-prev">◀</button><span>${tr("slide")} ${App.live.slide + 1} / ${L.slides.length}</span><button class="tool" id="sv-next">▶</button>
    ${App.live.slide !== App.live.teacherSlide ? `<button class="btn small" id="sv-back">↩ ${tr("follow")}</button>` : ""}
    <label class="muted" style="font-size:13px"><input type="checkbox" id="sv-auto" ${Live.autoTr ? "checked" : ""}> 🌐 ${tr("autoTranslate")}</label>
    ${s.objects.filter(o => o.type === "model").map((o, i) => `<button class="btn small ghost" data-model="${o.id}">${tr("open3d")} ${i + 1}</button>`).join("")}`;
  $("sv-prev").onclick = () => { App.live.follow = false; App.live.slide = Math.max(0, App.live.slide - 1); Live.texts = null; renderStudent(); };
  $("sv-next").onclick = () => { App.live.follow = false; App.live.slide = Math.min(L.slides.length - 1, App.live.slide + 1); Live.texts = null; renderStudent(); };
  const back = $("sv-back"); if (back) back.onclick = () => { App.live.follow = true; App.live.slide = App.live.teacherSlide; Live.texts = null; renderStudent(); };
  tb.querySelectorAll("[data-model]").forEach(b => b.onclick = () => Cad.open(s.objects.find(o => o.id === b.dataset.model), true));
  box.innerHTML = slideSVG(s, { texts: Live.texts }); fitBox(box); drawPointer();
  $("b-translate").textContent = Live.texts ? tr("original") : tr("translate");
  const au = $("sv-auto"); if (au) au.onchange = e => { Live.autoTr = e.target.checked; store.set("ls-autotr", Live.autoTr); if (!Live.autoTr) Live.texts = null; renderStudent(); };
  if (Live.autoTr && !L.noTranslate && !Live.texts && !Live.trOff.has(s.id) && !Live.trBusy) { Live.trBusy = true; Live.translate(true).finally(() => { Live.trBusy = false; }); }
  // question
  const q = s.question, mine = App.live.answered[s.id];
  if (!q || q.type === "none") { qb.innerHTML = ""; return; }
  const T2 = id => Live.texts?.[id];
  qb.innerHTML = `<b>❓ ${esc(T2("q:prompt") || q.prompt)}</b>` + (q.type === "choice"
    ? q.options.map((o, i) => `<button class="opt ${mine === o.text ? "picked" : ""}" data-o="${esc(o.text)}">${esc(T2("q:" + i) || o.text)}</button>`).join("")
    : `<div class="row" style="margin-top:6px"><input type="text" inputmode="${q.type === "number" ? "decimal" : "text"}" id="sa" placeholder="${esc(tr("yourAnswer"))}" value="${esc(mine || "")}" style="flex:1">
       <button class="btn" id="sa-send">${tr("send")}</button></div>`)
    + (mine ? `<div class="muted" style="margin-top:4px">${tr("sent")}</div>` : "");
  const submit = v => { if (!String(v).trim()) return; App.live.answered[s.id] = String(v); Net.send({ type: "answer", slide: App.live.slide, value: String(v) }); renderStudent(); };
  qb.querySelectorAll("[data-o]").forEach(b => b.onclick = () => submit(b.dataset.o));
  const sa = $("sa"); if (sa) { $("sa-send").onclick = () => submit(sa.value); sa.onkeydown = e => { if (e.key === "Enter") submit(sa.value); }; }
}

// red laser dot from the teacher
function drawPointer() {
  for (const box of [$("slidebox"), document.querySelector("#present .slidebox")]) {
    const svg = box?.querySelector("svg"); if (!svg) continue;
    svg.querySelector("#laser")?.remove();
    if (Live.pointer) svg.insertAdjacentHTML("beforeend", `<circle id="laser" cx="${Live.pointer[0]}" cy="${Live.pointer[1]}" r="12" fill="#ff2a2a" opacity=".85"><animate attributeName="r" values="10;15;10" dur="1s" repeatCount="indefinite"/></circle>`);
  }
}

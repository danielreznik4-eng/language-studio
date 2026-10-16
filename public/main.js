// Start screen, header buttons, open/save, present mode, language switching.
"use strict";

// link name for a room: "Даниил Р." -> "daniil-r"
function roomSlug(s) {
  const map = { а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"yo",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"kh",ц:"ts",ч:"ch",ш:"sh",щ:"shch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya" };
  return String(s || "").toLowerCase().split("").map(c => map[c] ?? c).join("").replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
}

// links opened inside WhatsApp / Telegram / Viber etc. often block the camera: ask to open in Chrome
(function inAppWarning() {
  const ua = navigator.userAgent;
  if (/FBAN|FBAV|Instagram|Line\/|Telegram|WhatsApp|Viber|; wv\)/i.test(ua)) {
    const b = $("inapp");
    b.textContent = "⚠ Откройте эту ссылку в браузере Chrome (меню ⋮ → «Открыть в Chrome»), иначе видеозвонок может не работать. / Open this link in Chrome for video calls.";
    b.classList.remove("hidden");
  }
})();

(function start() {
  const saved = store.get("ls-me", {});
  const qs = new URLSearchParams(location.search);
  // the room comes from the link: /daniel  (old links: ?room=daniel)
  const pathRoom = roomSlug(decodeURIComponent(location.pathname.slice(1).replace(/\/$/, "")));
  const linkRoom = pathRoom || roomSlug(qs.get("room") || "");
  // Russian unless this person picked English before, or the link says ?lang=en
  const linkLang = qs.get("lang");
  LANG = linkLang === "en" || linkLang === "ru" ? linkLang : saved.lang || "ru";
  // a link means "student", unless it is this teacher's own room
  let role = linkRoom && !(saved.role === "teacher" && store.get("ls-room", "") === linkRoom) ? "student" : saved.role || null;
  let paint = () => {
    $("s-sub").textContent = tr("sub"); $("s-teacher").textContent = tr("teacher"); $("s-teacher-d").textContent = tr("teacherD");
    $("s-student").textContent = tr("student"); $("s-student-d").textContent = tr("studentD");
    $("s-room-l").textContent = tr("roomCode"); $("s-room-box").classList.toggle("hidden", role !== "student" || !!linkRoom);
    $("s-name-l").textContent = tr("name"); $("s-lang-l").textContent = tr("lang"); $("s-go").textContent = tr("go");
    document.querySelectorAll(".role").forEach(b => b.classList.toggle("on", b.dataset.role === role));
    $("s-go").disabled = !role || !$("s-name").value.trim() || (role === "student" && roomSlug($("s-room").value).length < 2);
  };
  $("s-name").value = saved.name || ""; $("s-lang").value = LANG;
  $("s-room").value = linkRoom || (saved.role === "student" ? saved.room || "" : "");
  $("s-room").oninput = paint;
  let err = ""; try { err = sessionStorage.getItem("ls-err") || ""; sessionStorage.removeItem("ls-err"); } catch (e) { /* none */ }
  if (err) { $("s-err").textContent = err; $("s-err").classList.remove("hidden"); }
  document.querySelectorAll(".role").forEach(b => b.onclick = () => { role = b.dataset.role; paint(); });
  $("s-name").oninput = paint;
  $("s-lang").onchange = e => { LANG = e.target.value; paint(); };
  $("s-go").onclick = () => {
    App.role = role; App.name = $("s-name").value.trim();
    App.room = role === "student" ? roomSlug($("s-room").value) : (store.get("ls-room", "") || roomSlug(App.name));
    store.set("ls-me", { role, name: App.name, lang: LANG, room: role === "student" ? App.room : undefined });
    $("start").classList.add("hidden"); $("app").classList.remove("hidden");
    init();
  };
  // phones opening a lesson link get the simple start screen
  const phone = matchMedia("(max-width: 760px)").matches || /Android|iPhone|iPod/i.test(navigator.userAgent);
  App.phone = phone;
  if (linkRoom && role === "student" && phone) {
    document.body.classList.add("simplestart");
    const p0 = paint; paint = () => { p0(); $("s-name-l").textContent = tr("whatName"); $("s-go").textContent = tr("enterLesson"); };
  }
  paint();
  // came back to the same lesson link: go straight in
  if (linkRoom && role === "student" && saved.role === "student" && saved.name && saved.room === linkRoom) $("s-go").click();
})();

// big-button layout for students on phones
function simpleMode() {
  document.body.classList.remove("simplestart"); document.body.classList.add("simple");
  App.live.follow = true; Live.autoTr = true;
  $("sb-call").onclick = () => Call.toggle();
  $("sb-chat").onclick = () => { document.body.classList.toggle("chatopen"); Live.unread = 0; simpleLabels(); if (document.body.classList.contains("chatopen")) setTimeout(() => $("chatin")?.focus(), 50); };
  const readBtn = { set textContent(v) { $("sb-read").textContent = v === "⏹" ? "⏹ " + tr("stop") : "🔊 " + tr("sbRead"); } };
  $("sb-read").onclick = () => Speak.read(studentSlide(), Live.texts, readBtn);
  simpleLabels();
}
function simpleLabels() {
  if (!document.body.classList.contains("simple")) return;
  $("sb-call").textContent = Call.local ? "✖ " + tr("hangUp") : "📞 " + tr("sbCall");
  $("sb-call").classList.toggle("end", !!Call.local);
  const open = document.body.classList.contains("chatopen");
  $("sb-chat").innerHTML = (open ? "⬅ " + tr("sbBack") : "💬 " + tr("chat")) + (Live.unread && !open ? `<span class="dot">${Live.unread}</span>` : "");
  if (!Speak.on) $("sb-read").textContent = "🔊 " + tr("sbRead");
}

// teacher: pick a different link name, e.g. /grandma-lessons
function changeRoom() {
  const n = roomSlug(prompt(tr("newLink"), App.room) || "");
  if (n.length < 2 || n === App.room) return;
  App.room = n; store.set("ls-room", n); Net.ws?.close();   // reconnects into the new room
}
function init() {
  $("h-lang").value = LANG;
  $("h-lang").onchange = e => { LANG = e.target.value; store.set("ls-me", Object.assign(store.get("ls-me", {}), { lang: LANG })); relabel(); };
  Live.bind(); Net.connect();
  if (App.role === "teacher") {
    const t = store.get("ls-tabs", null);
    App.lessons = t?.lessons?.length ? t.lessons : [newLesson()]; App.cur = Math.min(t?.cur || 0, App.lessons.length - 1);
    $("h-student").classList.add("hidden");
    $("b-open").onclick = openDialog; $("b-save").onclick = saveLesson;
    $("b-cad").onclick = () => Cad.open(null); $("b-eng").onclick = () => EngLessons.open(); $("b-calc").onclick = () => Calc.open();
    $("b-speak").onclick = () => Speak.read(slide(), null, $("b-speak"));
    $("b-share").onclick = () => Live.toggleShare(); $("b-call").onclick = () => Call.toggle(); $("b-present").onclick = () => Present.open();
    slideOps(); bindEditor(); renderToolbar();
    fetch("/api/info").then(r => r.json()).then(j => {
      const local = ["localhost", "127.0.0.1"].includes(location.hostname);
      const bases = local ? j.addresses.map(a => "http://" + a + ":" + j.port) : [location.origin];
      Object.defineProperty(Live, "joinUrls", { configurable: true, get: () => App.room ? bases.map(b => b + "/" + App.room) : [] });
      renderSide();
    }).catch(() => {});
  } else {
    $("h-teacher").classList.add("hidden"); $("left").classList.add("hidden"); $("main").classList.add("student");
    $("b-calc2").onclick = () => Calc.open(); $("b-call2").onclick = () => Call.toggle(); $("b-translate").onclick = () => Live.translate();
    $("b-speak2").onclick = () => Speak.read(studentSlide(), Live.texts, $("b-speak2"));
    $("b-follow").onclick = () => { App.live.follow = !App.live.follow; if (App.live.follow) App.live.slide = App.live.teacherSlide; renderStudent(); };
    if (App.phone || new URLSearchParams(location.search).has("simple")) simpleMode();
  }
  relabel();
}

// redraw every label in the chosen language
function relabel() {
  document.documentElement.lang = LANG;
  $("b-speak") && ($("b-speak").title = tr("readAloud")); $("b-speak2") && ($("b-speak2").title = tr("readAloud"));
  Call.buttons(); simpleLabels();
  $("h-who").textContent = (App.role === "teacher" ? "🎓 " + tr("teacherRole") : "🙋 " + tr("studentRole")) + ": " + App.name;
  setConn(Net.open);
  if (App.role === "teacher") {
    $("b-eng").textContent = "📘 " + tr("engLessons"); $("b-open").textContent = tr("open"); $("b-save").textContent = tr("save"); $("b-present").textContent = tr("present");
    $("b-share").textContent = Live.stream ? tr("stopShare") : tr("share");
    renderToolbar(); renderEditor();
  } else {
    $("b-translate").textContent = Live.texts ? tr("original") : tr("translate");
    renderStudent(); renderSide();
  }
}

// a student typed a room code that has no open lesson: back to the start screen with a message
function showStartError(msg) {
  try { sessionStorage.setItem("ls-err", msg); } catch (e) { /* none */ }
  location.href = "/" + encodeURIComponent(App.room);
}

// ---------------------------------------------------------------- open / save
async function saveLesson() {
  const name = prompt(tr("lessonName"), lesson().name); if (!name) return;
  lesson().name = name.trim(); autosave(); renderTabs(); Live.pushLesson();
  try {
    const r = await fetch("/api/lessons/" + encodeURIComponent(lesson().name) + "?room=" + App.room, { method: "POST", body: JSON.stringify(lesson()) });
    toast(r.ok ? tr("savedOk") : "✖");
  } catch (e) { toast("✖ " + tr("offline")); }
}

async function openDialog() {
  let list = []; try { list = await (await fetch("/api/lessons?room=" + App.room)).json(); } catch (e) { /* offline */ }
  const win = document.createElement("div"); win.className = "float"; Object.assign(win.style, { left: "50%", top: "90px", transform: "translateX(-50%)", width: "min(460px, 94vw)" });
  win.innerHTML = `<div class="fh"><b>📂 ${tr("lessons")}</b><button class="btn small ghost" id="od-x">✕</button></div>
    <div style="padding:10px;max-height:60vh;overflow:auto">${list.length ? list.map(l => `<div class="row" style="justify-content:space-between;margin:4px 0">
      <button class="btn ghost" data-open="${esc(l.name)}" style="flex:1;text-align:left">${esc(l.name)} <span class="muted">${new Date(l.saved).toLocaleString()}</span></button>
      <button class="btn small ghost" data-del="${esc(l.name)}">🗑</button></div>`).join("") : `<p class="muted">${tr("noLessons")}</p>`}
    <div class="row" style="margin-top:10px"><button class="btn ghost" id="od-import">${tr("importFile")}</button><button class="btn ghost" id="od-export">${tr("exportFile")}</button></div></div>`;
  document.body.appendChild(win);
  const close = () => win.remove();
  win.querySelector("#od-x").onclick = close;
  win.querySelectorAll("[data-open]").forEach(b => b.onclick = async () => {
    const L = await (await fetch("/api/lessons/" + encodeURIComponent(b.dataset.open) + "?room=" + App.room)).json();
    L.id = L.id || uid(); App.lessons.push(L); App.cur = App.lessons.length - 1; App.slide = 0; App.sel = null; autosave(); renderEditor(); Live.pushLesson(); close();
  });
  win.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => { if (!confirm(tr("del") + ": " + b.dataset.del + "?")) return; await fetch("/api/lessons/" + encodeURIComponent(b.dataset.del) + "?room=" + App.room, { method: "DELETE" }); close(); openDialog(); });
  win.querySelector("#od-export").onclick = () => {
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(lesson())], { type: "application/json" }));
    a.download = lesson().name + ".lesson.json"; a.click();
  };
  win.querySelector("#od-import").onclick = () => {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".json,application/json";
    inp.onchange = () => { const f = inp.files[0]; if (!f) return; f.text().then(t => { try { const L = JSON.parse(t); if (!L.slides) throw 0; App.lessons.push(L); App.cur = App.lessons.length - 1; App.slide = 0; autosave(); renderEditor(); Live.pushLesson(); close(); } catch (e) { toast("✖"); } }); };
    inp.click();
  };
}

// ---------------------------------------------------------------- present mode (also perfect for Discord screen share)
const Present = {
  laser: false, last: 0,
  open() {
    const p = $("present"); p.classList.remove("hidden");
    p.innerHTML = `<div class="slidebox"></div><div class="pbar"><button class="btn ghost" id="pr-prev">◀</button><span class="btn ghost" id="pr-n"></span>
      <button class="btn ghost" id="pr-next">▶</button><button class="btn ghost" id="pr-speak">🔊</button><button class="btn ghost" id="pr-laser">🔴 ${tr("laser")}</button><button class="btn ghost" id="pr-x">${tr("exitPresent")}</button></div>`;
    $("pr-prev").onclick = () => this.go(-1); $("pr-next").onclick = () => this.go(1);
    $("pr-laser").onclick = () => { this.laser = !this.laser; $("pr-laser").classList.toggle("on", this.laser); if (!this.laser) { Net.send({ type: "pointer", on: false }); Live.pointer = null; drawPointer(); } };
    $("pr-x").onclick = () => this.close();
    $("pr-speak").onclick = () => Speak.read(slide(), null, $("pr-speak"));
    p.querySelector(".slidebox").addEventListener("click", e => { if (!this.laser) this.go(1); });
    p.addEventListener("mousemove", e => {
      if (!this.laser || Date.now() - this.last < 30) return; this.last = Date.now();
      const svg = p.querySelector("svg"), r = svg.getBoundingClientRect();
      const x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height;
      Live.pointer = [x, y]; drawPointer(); Net.send({ type: "pointer", on: true, x, y });
    });
    try { p.requestFullscreen?.(); } catch (e) { /* not allowed */ }
    this.draw();
  },
  draw() {
    const p = $("present"), box = p.querySelector(".slidebox");
    box.innerHTML = slideSVG(slide()); fitBox(box); drawPointer();
    $("pr-n").textContent = (App.slide + 1) + " / " + lesson().slides.length;
  },
  go(d) { const n = Math.max(0, Math.min(lesson().slides.length - 1, App.slide + d)); if (n === App.slide) return; App.slide = n; App.sel = null; this.draw(); Live.pushSlide(); },
  close() { $("present").classList.add("hidden"); if (document.fullscreenElement) document.exitFullscreen?.(); Net.send({ type: "pointer", on: false }); renderEditor(); }
};
addEventListener("keydown", e => {
  if ($("present").classList.contains("hidden")) return;
  if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(e.key)) { e.preventDefault(); Present.go(1); }
  if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) { e.preventDefault(); Present.go(-1); }
  if (e.key === "Escape") Present.close();
});
document.addEventListener("fullscreenchange", () => { if (!$("present").classList.contains("hidden")) setTimeout(() => Present.draw(), 100); });
addEventListener("resize", () => { if (!$("present").classList.contains("hidden")) Present.draw(); });

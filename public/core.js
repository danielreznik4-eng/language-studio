// Shared state, the lesson format, small helpers and the live connection.
"use strict";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const clone = o => JSON.parse(JSON.stringify(o));
const W = 1280, H = 720;   // every slide is 1280 x 720

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* full or blocked */ } }
};

function toast(text, ms = 1800) {
  const t = document.createElement("div"); t.className = "toast"; t.textContent = text;
  document.body.appendChild(t); setTimeout(() => t.remove(), ms);
}

// ---------------------------------------------------------------- lesson format
// lesson = { id, name, slides: [slide] }
// slide  = { id, bg, objects: [obj], question: { type: none|choice|text|number, prompt, options:[{text,right}], answer } }
// obj    = { id, type: rect|ellipse|tri|star|line|arrow|poly|path|text|image|model, ...geometry and style }
function newSlide() { return { id: uid(), bg: "#ffffff", objects: [], question: { type: "none", prompt: "", options: [], answer: "" } }; }
function newLesson(name) {
  const s = newSlide();
  s.objects.push({ id: uid(), type: "text", x: 120, y: 260, w: 1040, text: name || tr("newLesson"), size: 72, color: "#1c2230", bold: true });
  return { id: uid(), name: name || tr("newLesson"), slides: [s] };
}

const App = {
  role: null, name: "", myId: null, room: "",
  lessons: [],     // open tabs (teacher)
  cur: 0,          // active tab
  slide: 0,        // active slide in the active tab
  tool: "select",
  sel: null,       // selected object id
  live: { lesson: null, slide: 0, follow: true, teacherSlide: 0, answered: {} },   // student side
  answers: {},     // teacher side: slideId -> { studentId: {name, value} }
  people: [],
};
const lesson = () => App.lessons[App.cur];
const slide = () => lesson()?.slides[App.slide];

function autosave() { if (App.role === "teacher") store.set("ls-tabs", { lessons: App.lessons, cur: App.cur }); }

// ---------------------------------------------------------------- live connection
const Net = {
  ws: null, open: false, queue: [], handlers: {},
  connect() {
    const ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws");
    this.ws = ws;
    ws.onopen = () => {
      this.open = true; setConn(true);
      ws.send(JSON.stringify({ type: "hello", role: App.role, name: App.name, lang: LANG, room: App.room }));
      for (const m of this.queue.splice(0)) ws.send(m);
    };
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } (this.handlers[m.type] || (() => {}))(m); };
    ws.onclose = () => { this.open = false; setConn(false); setTimeout(() => this.connect(), 2000); };
    ws.onerror = () => ws.close();
  },
  send(obj) { const s = JSON.stringify(obj); if (this.open) this.ws.send(s); else if (obj.type === "chat") this.queue.push(s); },
  on(type, fn) { this.handlers[type] = fn; }
};
function setConn(on) { const el = $("h-conn"); if (el) { el.textContent = on ? tr("connected") : tr("offline"); el.style.color = on ? "var(--good)" : "var(--bad)"; } }

// make a floating window draggable by its header
function draggable(win) {
  const head = win.querySelector(".fh"); if (!head) return;
  head.onpointerdown = e => {
    if (e.target.closest("button")) return;
    const r = win.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    const mv = ev => { win.style.left = Math.max(0, ev.clientX - dx) + "px"; win.style.top = Math.max(0, ev.clientY - dy) + "px"; win.style.right = "auto"; };
    const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); };
    addEventListener("pointermove", mv); addEventListener("pointerup", up);
  };
}

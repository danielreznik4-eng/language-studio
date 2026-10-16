// Slide rendering (SVG) and the teacher's slide editor.
"use strict";

// ---------------------------------------------------------------- geometry
function bbox(o) {
  if (MATH_TYPES.includes(o.type)) return mathBBox(o);
  if (o.type === "line" || o.type === "arrow") return { x: Math.min(o.x1, o.x2), y: Math.min(o.y1, o.y2), w: Math.abs(o.x2 - o.x1), h: Math.abs(o.y2 - o.y1) };
  if (o.type === "poly" || o.type === "path") {
    const xs = o.points.map(p => p[0]), ys = o.points.map(p => p[1]);
    const x = Math.min(...xs), y = Math.min(...ys); return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  if (o.type === "text") return { x: o.x, y: o.y, w: o.w, h: wrapText(o.text, o.w, o.size).length * o.size * 1.25 };
  return { x: o.x, y: o.y, w: o.w, h: o.h };
}

function wrapText(text, width, size) {
  const max = Math.max(1, Math.floor(width / (size * 0.53)));
  const out = [];
  for (const para of String(text || "").split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      if ((line + " " + word).trim().length > max && line) { out.push(line); line = word; }
      else line = (line ? line + " " : "") + word;
    }
    out.push(line);
  }
  return out;
}

function starPoints(x, y, w, h) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.4 : 1;
    pts.push([x + w / 2 + Math.cos(a) * r * w / 2, y + h / 2 + Math.sin(a) * r * h / 2]);
  }
  return pts;
}

const pts = list => list.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");

// ---------------------------------------------------------------- rendering
// texts: optional map objId -> replacement text (used for the student's translation)
function objSVG(o, texts) {
  const style = `fill="${o.fill || "none"}" stroke="${o.stroke || "none"}" stroke-width="${o.sw ?? 0}" opacity="${o.op ?? 1}"`;
  const id = `data-id="${o.id}"`;
  switch (o.type) {
    case "rect": return `<rect ${id} x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" rx="${o.rx || 0}" ${style}/>`;
    case "ellipse": return `<ellipse ${id} cx="${o.x + o.w / 2}" cy="${o.y + o.h / 2}" rx="${o.w / 2}" ry="${o.h / 2}" ${style}/>`;
    case "tri": return `<polygon ${id} points="${pts([[o.x + o.w / 2, o.y], [o.x + o.w, o.y + o.h], [o.x, o.y + o.h]])}" ${style} stroke-linejoin="round"/>`;
    case "star": return `<polygon ${id} points="${pts(starPoints(o.x, o.y, o.w, o.h))}" ${style} stroke-linejoin="round"/>`;
    case "poly": return `<polygon ${id} points="${pts(o.points)}" ${style} stroke-linejoin="round"/>`;
    case "path": return `<polyline ${id} points="${pts(o.points)}" fill="none" stroke="${o.stroke}" stroke-width="${o.sw}" opacity="${o.op ?? 1}" stroke-linecap="round" stroke-linejoin="round"/>`;
    case "line": return `<line ${id} x1="${o.x1}" y1="${o.y1}" x2="${o.x2}" y2="${o.y2}" stroke="${o.stroke}" stroke-width="${o.sw}" opacity="${o.op ?? 1}" stroke-linecap="round"/>`;
    case "arrow": {
      const a = Math.atan2(o.y2 - o.y1, o.x2 - o.x1), L = 18 + o.sw * 2.5;
      const head = [[o.x2, o.y2], [o.x2 - L * Math.cos(a - 0.45), o.y2 - L * Math.sin(a - 0.45)], [o.x2 - L * Math.cos(a + 0.45), o.y2 - L * Math.sin(a + 0.45)]];
      const ex = o.x2 - L * 0.7 * Math.cos(a), ey = o.y2 - L * 0.7 * Math.sin(a);
      return `<g ${id} opacity="${o.op ?? 1}"><line x1="${o.x1}" y1="${o.y1}" x2="${ex}" y2="${ey}" stroke="${o.stroke}" stroke-width="${o.sw}" stroke-linecap="round"/><polygon points="${pts(head)}" fill="${o.stroke}"/></g>`;
    }
    case "text": {
      const lines = wrapText(texts?.[o.id] ?? o.text, o.w, o.size), b = bbox(o);
      return `<g ${id}><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${Math.max(b.h, o.size)}" fill="transparent"/>` +
        `<text x="${o.x}" y="${o.y}" font-size="${o.size}" fill="${o.color}" font-weight="${o.bold ? 700 : 400}" opacity="${o.op ?? 1}" font-family="Segoe UI, sans-serif">` +
        lines.map((l, i) => `<tspan x="${o.x}" dy="${i ? o.size * 1.25 : o.size}">${esc(l) || " "}</tspan>`).join("") + `</text></g>`;
    }
    case "image": return `<image ${id} href="${o.src}" x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" opacity="${o.op ?? 1}" preserveAspectRatio="xMidYMid meet"/>`;
    case "model": return `<g ${id}><image href="${o.src}" x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" preserveAspectRatio="xMidYMid meet"/>` +
      `<rect x="${o.x + 8}" y="${o.y + 8}" width="54" height="26" rx="6" fill="#3b6cf0"/><text x="${o.x + 35}" y="${o.y + 27}" font-size="16" fill="#fff" text-anchor="middle" font-family="Segoe UI">3D</text></g>`;
    default: if (MATH_TYPES.includes(o.type)) return mathObjSVG(o, id);
  }
  return "";
}

function slideSVG(s, opts = {}) {
  if (!s) return "";
  let body = `<rect x="0" y="0" width="${W}" height="${H}" fill="${s.bg || "#fff"}" data-bg="1"/>`;
  for (const o of s.objects) body += objSVG(o, opts.texts);
  if (opts.selected) {
    const o = s.objects.find(x => x.id === opts.selected);
    if (o) {
      const b = bbox(o);
      body += `<rect x="${b.x - 6}" y="${b.y - 6}" width="${b.w + 12}" height="${b.h + 12}" fill="none" stroke="#3b6cf0" stroke-width="2" stroke-dasharray="8 5" pointer-events="none"/>`;
      body += `<rect data-handle="1" x="${b.x + b.w}" y="${b.y + b.h}" width="16" height="16" fill="#3b6cf0" stroke="#fff" stroke-width="2" style="cursor:nwse-resize"/>`;
    }
  }
  if (opts.extra) body += opts.extra;
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}

// fit a 16:9 slide box inside its parent
function fitBox(box) {
  const p = box.parentElement, pw = p.clientWidth - 24, ph = p.clientHeight - 24;
  const scale = Math.max(0.1, Math.min(pw / W, ph / H));
  box.style.width = W * scale + "px"; box.style.height = H * scale + "px";
}

// ---------------------------------------------------------------- editor (teacher)
const Ed = {
  hist: [], fut: [],
  draft: null,   // shape being drawn
  style: { fill: "#ffd84d", stroke: "#1c2230", sw: 4, color: "#1c2230", size: 40 },

  commit() {   // call BEFORE changing the lesson, for undo
    this.hist.push(JSON.stringify(lesson())); if (this.hist.length > 80) this.hist.shift(); this.fut = [];
  },
  changed() { autosave(); renderEditor(); Live.pushLesson(); },
  undo() { if (!this.hist.length) return; this.fut.push(JSON.stringify(lesson())); App.lessons[App.cur] = JSON.parse(this.hist.pop()); this.fixSlide(); this.changed(); },
  redo() { if (!this.fut.length) return; this.hist.push(JSON.stringify(lesson())); App.lessons[App.cur] = JSON.parse(this.fut.pop()); this.fixSlide(); this.changed(); },
  fixSlide() { App.slide = Math.min(App.slide, lesson().slides.length - 1); if (!slide().objects.some(o => o.id === App.sel)) App.sel = null; },
  selObj() { return slide()?.objects.find(o => o.id === App.sel); },
};

const TOOLS = [
  ["select", "🖱", "tSelect", "v"], ["text", "T", "tText", "t"], ["rect", "▭", "tRect", "r"], ["ellipse", "◯", "tEllipse", "o"],
  ["tri", "△", "tTri", ""], ["star", "☆", "tStar", ""], ["line", "╱", "tLine", "l"], ["arrow", "➜", "tArrow", "a"],
  ["poly", "✎◇", "tPoly", "p"], ["pen", "🖌", "tPen", "b"], ["erase", "🧽", "tErase", "e"],
];
const SWATCH = ["#1c2230", "#ffffff", "#e53935", "#fb8c00", "#ffd84d", "#43a047", "#1e88e5", "#8e24aa", "#6d4c41", "#9e9e9e"];

function renderToolbar() {
  const tb = $("toolbar");
  tb.innerHTML = TOOLS.map(([k, ic, tip]) => `<button class="tool ${App.tool === k ? "on" : ""}" data-tool="${k}" title="${esc(tr(tip))}">${ic}</button>`).join("")
    + `<button class="tool" id="t-img" title="${esc(tr("tImage"))}">🖼</button><span class="sep"></span>`
    + [["math", "∑", "tMath"], ["fracpie", "◔", "tPie"], ["fracbar", "▤", "tBar"], ["numline", "↔", "tNumline"], ["graph", "📈", "tGraph"]]
      .map(([k, ic, tip]) => `<button class="tool" data-math="${k}" title="${esc(tr(tip))}">${ic}</button>`).join("") + `<span class="sep"></span>`
    + SWATCH.map(c => `<button class="tool" data-color="${c}" title="${c}" style="background:${c};min-width:24px;height:26px"></button>`).join("")
    + `<span class="sep"></span><button class="tool" id="t-undo" title="${esc(tr("undo"))}">↶</button><button class="tool" id="t-redo" title="${esc(tr("redo"))}">↷</button>`;
  tb.querySelectorAll("[data-tool]").forEach(b => b.onclick = () => setTool(b.dataset.tool));
  tb.querySelectorAll("[data-color]").forEach(b => b.onclick = () => applyColor(b.dataset.color));
  $("t-img").onclick = () => $("imgfile").click();
  tb.querySelectorAll("[data-math]").forEach(b => b.onclick = () => {
    if (b.dataset.math === "math") return MathPanel.open(null);
    Ed.commit(); const o = newMathObj(b.dataset.math, 200, 160); slide().objects.push(o); App.sel = o.id; setTool("select"); Ed.changed();
  });
  $("t-undo").onclick = () => Ed.undo(); $("t-redo").onclick = () => Ed.redo();
}

function setTool(t) { App.tool = t; Ed.draft = null; if (t !== "select") App.sel = null; renderToolbar(); renderEditor(); }

// a swatch click colors the selected thing, or sets the color for new shapes
function applyColor(c) {
  const o = Ed.selObj();
  if (o) {
    Ed.commit();
    if (o.type === "text") o.color = c;
    else if (["line", "arrow", "path"].includes(o.type)) o.stroke = c;
    else o.fill = c;
    Ed.changed();
  } else { Ed.style.fill = c; Ed.style.color = c; if (App.tool === "pen" || App.tool === "line" || App.tool === "arrow") Ed.style.stroke = c; renderSide(); }
}

function renderThumbs() {
  const L = lesson();
  $("thumbs").innerHTML = L.slides.map((s, i) => `<div class="thumb ${i === App.slide ? "on" : ""}" data-i="${i}"><span class="n">${i + 1}</span>${slideSVG(s)}</div>`).join("");
  $("thumbs").querySelectorAll(".thumb").forEach(t => t.onclick = () => { App.slide = +t.dataset.i; App.sel = null; Ed.draft = null; renderEditor(); Live.pushSlide(); });
}

function renderEditor() {
  if (App.role !== "teacher" || !lesson()) return;
  renderTabs(); renderThumbs();
  const box = $("slidebox");
  let extra = "";
  const d = Ed.draft;
  if (d && d.type === "poly-draft" && d.points.length) extra = `<polyline points="${pts([...d.points, d.cursor || d.points[d.points.length - 1]])}" fill="none" stroke="#3b6cf0" stroke-width="3" stroke-dasharray="6 4"/>`;
  else if (d && d.obj) extra = objSVG(d.obj);
  box.innerHTML = slideSVG(slide(), { selected: App.tool === "select" ? App.sel : null, extra });
  fitBox(box);
  box.style.cursor = App.tool === "select" ? "default" : App.tool === "erase" ? "not-allowed" : "crosshair";
  renderQuestionEditor(); renderSide();
}

// client -> slide coordinates
function slidePoint(e) {
  const svg = $("slidebox").querySelector("svg"), r = svg.getBoundingClientRect();
  return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height];
}

function moveObj(o, dx, dy) {
  if (o.type === "line" || o.type === "arrow") { o.x1 += dx; o.x2 += dx; o.y1 += dy; o.y2 += dy; }
  else if (o.type === "poly" || o.type === "path") o.points = o.points.map(p => [p[0] + dx, p[1] + dy]);
  else { o.x += dx; o.y += dy; }
}

function resizeObj(o, start, nx, ny) {   // start = copy of the object when resizing began
  const b = bbox(start);
  if (o.type === "line" || o.type === "arrow") { o.x2 = nx; o.y2 = ny; return; }
  if (o.type === "poly" || o.type === "path") {
    const sx = Math.max(10, nx - b.x) / Math.max(1, b.w), sy = Math.max(10, ny - b.y) / Math.max(1, b.h);
    o.points = start.points.map(p => [b.x + (p[0] - b.x) * sx, b.y + (p[1] - b.y) * sy]); return;
  }
  if (o.type === "text") { o.w = Math.max(60, nx - o.x); return; }
  if (o.type === "math") { o.size = Math.max(12, Math.round(start.size * Math.max(10, ny - o.y) / Math.max(10, b.h))); return; }
  if (o.type === "numline") { o.w = Math.max(100, nx - o.x); return; }
  o.w = Math.max(10, nx - o.x); o.h = Math.max(10, ny - o.y);
}

function bindEditor() {
  const box = $("slidebox");
  let drag = null;
  box.addEventListener("pointerdown", e => {
    if (App.role !== "teacher" || e.button !== 0) return;
    const [x, y] = slidePoint(e), t = e.target, id = t.closest("[data-id]")?.dataset.id, tool = App.tool;
    box.setPointerCapture(e.pointerId);
    if (tool === "select") {
      if (t.dataset.handle && Ed.selObj()) { Ed.commit(); drag = { mode: "resize", start: clone(Ed.selObj()) }; return; }
      App.sel = id || null; renderEditor();
      if (id) { Ed.commit(); drag = { mode: "move", last: [x, y], moved: false }; }
      return;
    }
    if (tool === "erase") { if (id) { Ed.commit(); slide().objects = slide().objects.filter(o => o.id !== id); Ed.changed(); } drag = { mode: "erase" }; return; }
    if (tool === "text") { e.preventDefault(); openTextEditor(null, x, y); return; }
    if (tool === "poly") {
      if (!Ed.draft) Ed.draft = { type: "poly-draft", points: [] };
      Ed.draft.points.push([x, y]); renderEditor(); return;
    }
    const st = Ed.style;
    let obj;
    if (tool === "pen") obj = { id: uid(), type: "path", points: [[x, y]], stroke: st.stroke, sw: Math.max(2, st.sw), op: 1 };
    else if (tool === "line" || tool === "arrow") obj = { id: uid(), type: tool, x1: x, y1: y, x2: x, y2: y, stroke: st.stroke, sw: st.sw };
    else obj = { id: uid(), type: tool, x, y, w: 0, h: 0, fill: st.fill, stroke: st.stroke, sw: st.sw };
    Ed.draft = { obj, start: [x, y] };
    drag = { mode: "draw" };
  });
  box.addEventListener("pointermove", e => {
    if (App.role !== "teacher") return;
    const [x, y] = slidePoint(e);
    if (Ed.draft?.type === "poly-draft") { Ed.draft.cursor = [x, y]; renderEditorLight(); return; }
    if (!drag) return;
    if (drag.mode === "move") {
      const o = Ed.selObj(); if (!o) return;
      moveObj(o, x - drag.last[0], y - drag.last[1]); drag.last = [x, y]; drag.moved = true; renderEditorLight();
    } else if (drag.mode === "resize") {
      resizeObj(Ed.selObj(), drag.start, x, y); renderEditorLight();
    } else if (drag.mode === "erase") {
      const id = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-id]")?.dataset.id;
      if (id) { Ed.commit(); slide().objects = slide().objects.filter(o => o.id !== id); renderEditorLight(); }
    } else if (drag.mode === "draw" && Ed.draft) {
      const o = Ed.draft.obj, [sx, sy] = Ed.draft.start;
      if (o.type === "path") { const l = o.points[o.points.length - 1]; if (Math.hypot(x - l[0], y - l[1]) > 3) o.points.push([x, y]); }
      else if (o.type === "line" || o.type === "arrow") { o.x2 = x; o.y2 = y; if (e.shiftKey) snapAngle(o); }
      else { o.x = Math.min(sx, x); o.y = Math.min(sy, y); o.w = Math.abs(x - sx); o.h = Math.abs(y - sy); if (e.shiftKey) { o.w = o.h = Math.max(o.w, o.h); } }
      renderEditorLight();
    }
  });
  const end = () => {
    if (!drag) return;
    const mode = drag.mode; drag = null;
    if (mode === "draw" && Ed.draft?.obj) {
      const o = Ed.draft.obj; Ed.draft = null;
      if (o.type === "path" && o.points.length < 2) o.points.push([o.points[0][0] + 1, o.points[0][1] + 1]);
      if (!["path", "line", "arrow"].includes(o.type) && (o.w < 8 || o.h < 8)) { o.w = 220; o.h = 140; }
      if ((o.type === "line" || o.type === "arrow") && Math.hypot(o.x2 - o.x1, o.y2 - o.y1) < 8) { o.x2 = o.x1 + 200; }
      Ed.commit(); slide().objects.push(o); if (o.type !== "path") { App.sel = o.id; }
      Ed.changed(); return;
    }
    if (mode === "move" || mode === "resize" || mode === "erase") Ed.changed();
  };
  box.addEventListener("pointerup", end); box.addEventListener("pointercancel", end);
  box.addEventListener("dblclick", e => {
    if (App.role !== "teacher") return;
    if (Ed.draft?.type === "poly-draft") { finishPoly(); return; }
    const id = e.target.closest("[data-id]")?.dataset.id, o = slide().objects.find(x => x.id === id);
    if (o?.type === "text") openTextEditor(o);
    if (o?.type === "model") Cad.open(o);
    if (o?.type === "math") MathPanel.open(o);
  });
}

function snapAngle(o) {
  const a = Math.atan2(o.y2 - o.y1, o.x2 - o.x1), L = Math.hypot(o.x2 - o.x1, o.y2 - o.y1), s = Math.round(a / (Math.PI / 4)) * Math.PI / 4;
  o.x2 = o.x1 + Math.cos(s) * L; o.y2 = o.y1 + Math.sin(s) * L;
}

// redraw just the slide (fast, while dragging)
function renderEditorLight() {
  let extra = ""; const d = Ed.draft;
  if (d && d.type === "poly-draft" && d.points.length) extra = `<polyline points="${pts([...d.points, d.cursor || d.points[d.points.length - 1]])}" fill="none" stroke="#3b6cf0" stroke-width="3" stroke-dasharray="6 4"/>` +
    d.points.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="5" fill="#3b6cf0"/>`).join("");
  else if (d && d.obj) extra = objSVG(d.obj);
  $("slidebox").innerHTML = slideSVG(slide(), { selected: App.tool === "select" ? App.sel : null, extra });
}

function finishPoly() {
  const d = Ed.draft; Ed.draft = null;
  if (!d || d.points.length < 3) { renderEditor(); return; }
  const st = Ed.style;
  Ed.commit();
  const o = { id: uid(), type: "poly", points: d.points, fill: st.fill, stroke: st.stroke, sw: st.sw };
  slide().objects.push(o); App.sel = o.id; App.tool = "select"; renderToolbar(); Ed.changed();
}

function openTextEditor(o, x, y) {
  const box = $("slidebox"), r = box.getBoundingClientRect(), k = r.width / W;
  const isNew = !o;
  if (isNew) o = { id: uid(), type: "text", x, y, w: 600, text: "", size: Ed.style.size, color: Ed.style.color, bold: false };
  const ta = document.createElement("textarea");
  ta.className = "textedit"; ta.value = o.text;
  Object.assign(ta.style, { left: o.x * k + "px", top: o.y * k + "px", width: o.w * k + "px", height: Math.max(o.size * 2.6, 80) * k + "px", fontSize: o.size * k + "px", color: o.color, fontWeight: o.bold ? 700 : 400 });
  box.appendChild(ta); ta.focus();
  const done = () => {
    const text = ta.value.replace(/\s+$/, ""); ta.remove();
    if (!text) { if (!isNew) { Ed.commit(); slide().objects = slide().objects.filter(x => x.id !== o.id); Ed.changed(); } else renderEditor(); return; }
    Ed.commit(); o.text = text; if (isNew) slide().objects.push(o);
    App.sel = o.id; App.tool = "select"; renderToolbar(); Ed.changed();
  };
  ta.addEventListener("blur", done, { once: true });
  ta.addEventListener("keydown", e => { if (e.key === "Escape") ta.blur(); e.stopPropagation(); });
}

// pictures: shrink big ones so lessons stay small
$("imgfile").addEventListener("change", e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    const img = new Image();
    img.onload = () => {
      const max = 1400, k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const src = c.toDataURL(f.type === "image/png" ? "image/png" : "image/jpeg", 0.85);
      const fit = Math.min(640 / c.width, 400 / c.height, 1);
      Ed.commit();
      const o = { id: uid(), type: "image", src, x: 320, y: 160, w: Math.round(c.width * fit), h: Math.round(c.height * fit) };
      slide().objects.push(o); App.sel = o.id; setTool("select"); Ed.changed();
    };
    img.src = rd.result;
  };
  rd.readAsDataURL(f);
});

// ---------------------------------------------------------------- properties + question editor
function propsHTML() {
  const o = Ed.selObj();
  if (!o) {
    return `<div class="panel props"><h3>${tr("props")}</h3><p class="muted">${tr("nothingSel")}</p>
      <label>${tr("background")} <input type="color" id="p-bg" value="${slide().bg || "#ffffff"}"></label>
      <label>${tr("fill")} <input type="color" id="p-dfill" value="${Ed.style.fill}"></label>
      <label>${tr("stroke")} <input type="color" id="p-dstroke" value="${Ed.style.stroke}"></label>
      <label>${tr("width")} <input type="range" id="p-dsw" min="0" max="30" value="${Ed.style.sw}"></label>
      <label>${tr("fontSize")} <input type="number" id="p-dsize" min="8" max="300" value="${Ed.style.size}" style="width:70px"></label></div>`;
  }
  const isMath = MATH_TYPES.includes(o.type);
  const hasFill = !isMath && !["line", "arrow", "path", "text", "image", "model"].includes(o.type);
  const hasStroke = !["text", "image", "model", "math", "graph"].includes(o.type);
  return `<div class="panel props"><h3>${tr("props")}</h3>
    ${hasFill ? `<label>${tr("fill")} <span class="row"><input type="color" id="p-fill" value="${o.fill && o.fill !== "none" ? o.fill : "#ffffff"}"><button class="btn small ghost" id="p-nofill">${tr("noFill")}</button></span></label>` : ""}
    ${hasStroke ? `<label>${tr("stroke")} <input type="color" id="p-stroke" value="${o.stroke && o.stroke !== "none" ? o.stroke : "#000000"}"></label>
      <label>${tr("width")} <input type="range" id="p-sw" min="0" max="30" value="${o.sw || 0}"></label>` : ""}
    ${o.type === "text" ? `<label>${tr("fill")} <input type="color" id="p-color" value="${o.color}"></label>
      <label>${tr("fontSize")} <input type="number" id="p-size" min="8" max="300" value="${o.size}" style="width:70px"></label>
      <label>${tr("bold")} <input type="checkbox" id="p-bold" ${o.bold ? "checked" : ""}></label>` : ""}
    ${isMath ? mathPropsHTML(o) : ""}
    <label>${tr("opacity")} <input type="range" id="p-op" min="10" max="100" value="${Math.round((o.op ?? 1) * 100)}"></label>
    <div class="row"><button class="btn small ghost" id="p-front">${tr("front")}</button><button class="btn small ghost" id="p-back">${tr("back")}</button>
    <button class="btn small ghost" id="p-dup">${tr("dup")}</button><button class="btn small danger" id="p-del">${tr("del")}</button></div></div>`;
}

function bindProps() {
  const o = Ed.selObj(), set = (fn) => { Ed.commit(); fn(); Ed.changed(); };
  const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
  if (!o) {
    on("p-bg", "change", e => set(() => slide().bg = e.target.value));
    on("p-dfill", "change", e => Ed.style.fill = e.target.value);
    on("p-dstroke", "change", e => Ed.style.stroke = e.target.value);
    on("p-dsw", "change", e => Ed.style.sw = +e.target.value);
    on("p-dsize", "change", e => Ed.style.size = +e.target.value);
    return;
  }
  if (MATH_TYPES.includes(o.type)) bindMathProps(o, set);
  on("p-fill", "change", e => set(() => o.fill = e.target.value));
  on("p-nofill", "click", () => set(() => o.fill = "none"));
  on("p-stroke", "change", e => set(() => o.stroke = e.target.value));
  on("p-sw", "change", e => set(() => o.sw = +e.target.value));
  on("p-color", "change", e => set(() => o.color = e.target.value));
  on("p-size", "change", e => set(() => o.size = Math.max(8, +e.target.value)));
  on("p-bold", "change", e => set(() => o.bold = e.target.checked));
  on("p-op", "change", e => set(() => o.op = +e.target.value / 100));
  on("p-front", "click", () => set(() => { const a = slide().objects; a.push(a.splice(a.indexOf(o), 1)[0]); }));
  on("p-back", "click", () => set(() => { const a = slide().objects; a.unshift(a.splice(a.indexOf(o), 1)[0]); }));
  on("p-dup", "click", () => duplicateSelected());
  on("p-del", "click", () => deleteSelected());
}

function duplicateSelected() {
  const o = Ed.selObj(); if (!o) return;
  Ed.commit(); const c = clone(o); c.id = uid(); moveObj(c, 24, 24); slide().objects.push(c); App.sel = c.id; Ed.changed();
}
function deleteSelected() {
  if (!App.sel) return;
  Ed.commit(); slide().objects = slide().objects.filter(x => x.id !== App.sel); App.sel = null; Ed.changed();
}

function renderQuestionEditor() {
  const q = slide().question || (slide().question = { type: "none", prompt: "", options: [], answer: "" });
  const qb = $("qbox");
  qb.innerHTML = `<div class="row"><b>❓ ${tr("question")}</b>
    <select id="q-type">${[["none", "qNone"], ["choice", "qChoice"], ["text", "qText"], ["number", "qNumber"]].map(([v, k]) => `<option value="${v}" ${q.type === v ? "selected" : ""}>${tr(k)}</option>`).join("")}</select>
    ${q.type !== "none" ? `<input type="text" id="q-prompt" placeholder="${esc(tr("qPrompt"))}" value="${esc(q.prompt)}" style="flex:1;min-width:200px">` : ""}</div>
    ${q.type === "choice" ? `<textarea id="q-opts" rows="3" style="width:100%;margin-top:6px" placeholder="${esc(tr("qOptions"))}">${esc(q.options.map(o => (o.right ? "*" : "") + o.text).join("\n"))}</textarea>` : ""}
    ${q.type === "text" || q.type === "number" ? `<input type="text" id="q-ans" style="margin-top:6px;width:100%" placeholder="${esc(tr("qAnswer"))}" value="${esc(q.answer)}">` : ""}`;
  const save = fn => { Ed.commit(); fn(); autosave(); Live.pushLesson(); renderThumbs(); };
  $("q-type").onchange = e => { save(() => q.type = e.target.value); renderQuestionEditor(); };
  const p = $("q-prompt"); if (p) p.onchange = e => save(() => q.prompt = e.target.value);
  const op = $("q-opts"); if (op) op.onchange = e => save(() => q.options = e.target.value.split("\n").map(s => s.trim()).filter(Boolean).map(s => ({ text: s.replace(/^\*\s*/, ""), right: s.startsWith("*") })));
  const an = $("q-ans"); if (an) an.onchange = e => save(() => q.answer = e.target.value);
}

// ---------------------------------------------------------------- tabs and slides
function renderTabs() {
  $("tabs").innerHTML = App.lessons.map((L, i) => `<div class="tab ${i === App.cur ? "on" : ""}" data-i="${i}" title="${esc(L.name)}"><span>${esc(L.name)}</span><button class="x" data-x="${i}">✕</button></div>`).join("")
    + `<div class="tab" id="tab-new" title="${esc(tr("newLesson"))}"><span>＋</span></div>`;
  $("tabs").querySelectorAll(".tab[data-i]").forEach(t => {
    t.onclick = e => { if (e.target.dataset.x) return; App.cur = +t.dataset.i; App.slide = 0; App.sel = null; Ed.hist = []; Ed.fut = []; autosave(); renderEditor(); Live.pushLesson(); };
    t.ondblclick = () => { const n = prompt(tr("lessonName"), lesson().name); if (n) { lesson().name = n.trim(); autosave(); renderTabs(); Live.pushLesson(); } };
  });
  $("tabs").querySelectorAll("[data-x]").forEach(b => b.onclick = () => {
    if (!confirm(tr("confirmClose"))) return;
    App.lessons.splice(+b.dataset.x, 1);
    if (!App.lessons.length) App.lessons.push(newLesson());
    App.cur = Math.min(App.cur, App.lessons.length - 1); App.slide = 0; App.sel = null; autosave(); renderEditor(); Live.pushLesson();
  });
  $("tab-new").onclick = () => { App.lessons.push(newLesson()); App.cur = App.lessons.length - 1; App.slide = 0; App.sel = null; autosave(); renderEditor(); Live.pushLesson(); };
}

function slideOps() {
  $("b-addslide").onclick = () => { Ed.commit(); lesson().slides.splice(App.slide + 1, 0, newSlide()); App.slide++; App.sel = null; Ed.changed(); Live.pushSlide(); };
  $("b-dupslide").onclick = () => { Ed.commit(); const c = clone(slide()); c.id = uid(); c.objects.forEach(o => o.id = uid()); lesson().slides.splice(App.slide + 1, 0, c); App.slide++; Ed.changed(); Live.pushSlide(); };
  $("b-delslide").onclick = () => { if (lesson().slides.length < 2 || !confirm(tr("confirmDelSlide"))) return; Ed.commit(); lesson().slides.splice(App.slide, 1); App.slide = Math.max(0, App.slide - 1); App.sel = null; Ed.changed(); Live.pushSlide(); };
  $("b-upslide").onclick = () => { if (App.slide < 1) return; Ed.commit(); const a = lesson().slides; [a[App.slide - 1], a[App.slide]] = [a[App.slide], a[App.slide - 1]]; App.slide--; Ed.changed(); };
  $("b-downslide").onclick = () => { const a = lesson().slides; if (App.slide >= a.length - 1) return; Ed.commit(); [a[App.slide + 1], a[App.slide]] = [a[App.slide], a[App.slide + 1]]; App.slide++; Ed.changed(); };
}

// keyboard shortcuts for the editor
addEventListener("keydown", e => {
  if (App.role !== "teacher" || !$("present").classList.contains("hidden") || !$("cad").classList.contains("hidden")) return;
  if (e.target.closest("input, textarea, select")) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); Ed.undo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === "y") { e.preventDefault(); Ed.redo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === "d") { e.preventDefault(); duplicateSelected(); return; }
  if (k === "delete" || k === "backspace") { deleteSelected(); return; }
  if (k === "escape") { Ed.draft = null; App.sel = null; renderEditor(); return; }
  if (k === "enter" && Ed.draft?.type === "poly-draft") { finishPoly(); return; }
  const o = Ed.selObj();
  if (o && k.startsWith("arrow")) {
    e.preventDefault(); const s = e.shiftKey ? 20 : 4;
    Ed.commit(); moveObj(o, k === "arrowleft" ? -s : k === "arrowright" ? s : 0, k === "arrowup" ? -s : k === "arrowdown" ? s : 0); Ed.changed(); return;
  }
  const t = TOOLS.find(x => x[3] === k); if (t && !e.ctrlKey) setTool(t[0]);
});
addEventListener("resize", () => { const b = $("slidebox"); if (b && b.innerHTML) fitBox(b); });

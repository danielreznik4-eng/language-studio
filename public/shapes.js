// Shape library, rotate/flip/label/dash/shadow for slide objects, 8-way resize + rotate handles,
// and the right-click menu in the slide editor.
"use strict";

// ---------------------------------------------------------------- shape library (drawn inside the box x,y,w,h)
function shapeD(kind, x, y, w, h, o = {}) {
  const P = (fx, fy) => (x + fx * w).toFixed(1) + " " + (y + fy * h).toFixed(1);
  const poly = list => "M" + list.map(([a, b]) => P(a, b)).join(" L") + " Z";
  const A = (rx, ry, large, sweep, fx, fy) => `A ${(rx * w).toFixed(1)} ${(ry * h).toFixed(1)} 0 ${large} ${sweep} ${P(fx, fy)}`;
  const star = (n, inner) => { const l = []; for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, r = i % 2 ? inner : 1; l.push([0.5 + Math.cos(a) * r / 2, 0.5 + Math.sin(a) * r / 2]); } return poly(l); };
  const ngon = n => { const l = []; for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / n; l.push([0.5 + Math.cos(a) / 2, 0.5 + Math.sin(a) / 2]); } return poly(l); };
  const rot = (list, f) => list.map(f);
  const right = [[0, .3], [.6, .3], [.6, 0], [1, .5], [.6, 1], [.6, .7], [0, .7]];
  switch (kind) {
    case "roundrect": { const r = Math.min(w, h) * (o.round ?? 0.18), R = Math.min(r, w / 2, h / 2);
      return `M${x + R} ${y} H${x + w - R} Q${x + w} ${y} ${x + w} ${y + R} V${y + h - R} Q${x + w} ${y + h} ${x + w - R} ${y + h} H${x + R} Q${x} ${y + h} ${x} ${y + h - R} V${y + R} Q${x} ${y} ${x + R} ${y} Z`; }
    case "diamond": return poly([[.5, 0], [1, .5], [.5, 1], [0, .5]]);
    case "pentagon": return ngon(5);
    case "hexagon": return poly([[.25, 0], [.75, 0], [1, .5], [.75, 1], [.25, 1], [0, .5]]);
    case "octagon": return poly([[.3, 0], [.7, 0], [1, .3], [1, .7], [.7, 1], [.3, 1], [0, .7], [0, .3]]);
    case "parallelogram": return poly([[.25, 0], [1, 0], [.75, 1], [0, 1]]);
    case "trapezoid": return poly([[.2, 0], [.8, 0], [1, 1], [0, 1]]);
    case "rtriangle": return poly([[0, 0], [1, 1], [0, 1]]);
    case "star4": return star(4, 0.4);
    case "star6": return star(6, 0.55);
    case "star8": return star(8, 0.6);
    case "heart": return `M${P(.5, .28)} C${P(.5, .08)} ${P(.12, -.02)} ${P(.05, .22)} C${P(-.02, .45)} ${P(.25, .68)} ${P(.5, 1)} C${P(.75, .68)} ${P(1.02, .45)} ${P(.95, .22)} C${P(.88, -.02)} ${P(.5, .08)} ${P(.5, .28)} Z`;
    case "cloud": return `M${P(.22, .9)} ${A(.18, .2, 0, 1, .12, .5)} ${A(.2, .22, 0, 1, .42, .22)} ${A(.24, .26, 0, 1, .82, .3)} ${A(.18, .22, 0, 1, .88, .75)} ${A(.16, .18, 0, 1, .7, .9)} Z`;
    case "speech": return `M${P(.08, 0)} H${x + .92 * w} Q${P(1, 0)} ${P(1, .1)} V${y + .62 * h} Q${P(1, .72)} ${P(.92, .72)} H${x + .45 * w} L${P(.22, 1)} L${P(.28, .72)} H${x + .08 * w} Q${P(0, .72)} ${P(0, .62)} V${y + .1 * h} Q${P(0, 0)} ${P(.08, 0)} Z`;
    case "thought": return `M${P(0, .38)} ${A(.5, .36, 1, 1, 1, .38)} ${A(.5, .36, 1, 1, 0, .38)} Z M${P(.2, .86)} ${A(.06, .06, 1, 1, .32, .86)} ${A(.06, .06, 1, 1, .2, .86)} Z M${P(.06, .96)} ${A(.035, .035, 1, 1, .13, .96)} ${A(.035, .035, 1, 1, .06, .96)} Z`;
    case "arrowR": return poly(right);
    case "arrowL": return poly(rot(right, ([a, b]) => [1 - a, b]));
    case "arrowU": return poly(rot(right, ([a, b]) => [b, 1 - a]));
    case "arrowD": return poly(rot(right, ([a, b]) => [b, a]));
    case "arrow2": return poly([[0, .5], [.25, 0], [.25, .3], [.75, .3], [.75, 0], [1, .5], [.75, 1], [.75, .7], [.25, .7], [.25, 1]]);
    case "chevron": return poly([[0, 0], [.7, 0], [1, .5], [.7, 1], [0, 1], [.3, .5]]);
    case "plus": return poly([[.35, 0], [.65, 0], [.65, .35], [1, .35], [1, .65], [.65, .65], [.65, 1], [.35, 1], [.35, .65], [0, .65], [0, .35], [.35, .35]]);
    case "xmark": return poly([[.15, 0], [.5, .35], [.85, 0], [1, .15], [.65, .5], [1, .85], [.85, 1], [.5, .65], [.15, 1], [0, .85], [.35, .5], [0, .15]]);
    case "check": return poly([[0, .55], [.15, .4], [.38, .62], [.85, .1], [1, .25], [.38, .9]]);
    case "moon": return `M${P(.62, 0)} ${A(.5, .5, 1, 0, .62, 1)} ${A(.38, .5, 1, 1, .62, 0)} Z`;
    case "lightning": return poly([[.55, 0], [.15, .56], [.45, .56], [.3, 1], [.88, .4], [.56, .4], [.78, 0]]);
    case "ring": return `M${P(0, .5)} ${A(.5, .5, 1, 1, 1, .5)} ${A(.5, .5, 1, 1, 0, .5)} Z M${P(.22, .5)} ${A(.28, .28, 1, 0, .78, .5)} ${A(.28, .28, 1, 0, .22, .5)} Z`;
    case "semicircle": return `M${P(0, 1)} ${A(.5, 1, 0, 1, 1, 1)} Z`;
    case "drop": return `M${P(.5, 0)} C${P(.5, 0)} ${P(.92, .45)} ${P(.92, .64)} ${A(.42, .36, 1, 1, .08, .64)} C${P(.08, .45)} ${P(.5, 0)} ${P(.5, 0)} Z`;
    case "banner": return poly([[0, 0], [1, 0], [.86, .5], [1, 1], [0, 1], [.14, .5]]);
    case "cylinder": return `M${P(0, .15)} ${A(.5, .15, 0, 1, 1, .15)} V${y + .85 * h} ${A(.5, .15, 0, 1, 0, .85)} Z M${P(0, .15)} ${A(.5, .15, 0, 0, 1, .15)}`;
    case "frame": return `M${P(0, 0)} H${x + w} V${y + h} H${x} Z M${P(.15, .15)} V${y + .85 * h} H${x + .85 * w} V${y + .15 * h} Z`;
    case "cross45": return poly([[.3, 0], [.7, 0], [.7, .3], [1, .3], [1, .7], [.7, .7], [.7, 1], [.3, 1], [.3, .7], [0, .7], [0, .3], [.3, .3]]);
    case "sun": { const l = []; for (let i = 0; i < 24; i++) { const a = -Math.PI / 2 + i * Math.PI / 12, r = i % 2 ? .62 : 1; l.push([.5 + Math.cos(a) * r / 2, .5 + Math.sin(a) * r / 2]); } return poly(l); }
  }
  return poly([[0, 0], [1, 0], [1, 1], [0, 1]]);
}

const SHAPES = [
  ["rect", "Прямоугольник", "Rectangle"], ["roundrect", "Скруглённый", "Rounded box"], ["ellipse", "Круг", "Circle"], ["tri", "Треугольник", "Triangle"],
  ["rtriangle", "Прямоуг. треугольник", "Right triangle"], ["diamond", "Ромб", "Diamond"], ["pentagon", "Пятиугольник", "Pentagon"], ["hexagon", "Шестиугольник", "Hexagon"],
  ["octagon", "Восьмиугольник", "Octagon"], ["parallelogram", "Параллелограмм", "Parallelogram"], ["trapezoid", "Трапеция", "Trapezoid"], ["semicircle", "Полукруг", "Semicircle"],
  ["star", "Звезда", "Star"], ["star4", "Звезда 4", "4-point star"], ["star6", "Звезда 6", "6-point star"], ["star8", "Звезда 8", "8-point star"],
  ["heart", "Сердце", "Heart"], ["cloud", "Облако", "Cloud"], ["speech", "Реплика", "Speech bubble"], ["thought", "Мысль", "Thought bubble"],
  ["arrowR", "Стрелка вправо", "Arrow right"], ["arrowL", "Стрелка влево", "Arrow left"], ["arrowU", "Стрелка вверх", "Arrow up"], ["arrowD", "Стрелка вниз", "Arrow down"],
  ["arrow2", "Двойная стрелка", "Double arrow"], ["chevron", "Шеврон", "Chevron"], ["plus", "Плюс", "Plus"], ["xmark", "Крестик", "X"],
  ["check", "Галочка", "Check mark"], ["moon", "Луна", "Moon"], ["sun", "Солнце", "Sun"], ["lightning", "Молния", "Lightning"],
  ["ring", "Кольцо", "Ring"], ["drop", "Капля", "Drop"], ["banner", "Лента", "Banner"], ["cylinder", "Цилиндр", "Cylinder"], ["frame", "Рамка", "Frame"],
];
const shapeName = k => { const s = SHAPES.find(x => x[0] === k); return s ? (LANG === "ru" ? s[1] : s[2]) : k; };
// little preview icon of a shape for menus
function shapeIcon(k) {
  const d = k === "rect" ? shapeD("frame", 3, 3, 26, 26).split(" M")[0] : k === "ellipse" ? `M3 16 A13 13 0 1 1 29 16 A13 13 0 1 1 3 16 Z` : k === "tri" ? "M16 3 L29 29 L3 29 Z" : k === "star" ? shapeD("star4", 3, 3, 26, 26).replace(/.*/, () => { const l = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? .4 : 1; l.push((16 + Math.cos(a) * r * 13).toFixed(1) + " " + (16 + Math.sin(a) * r * 13).toFixed(1)); } return "M" + l.join(" L") + " Z"; }) : shapeD(k, 3, 3, 26, 26);
  return `<svg viewBox="0 0 32 32" width="30" height="30"><path d="${d}" fill="currentColor" fill-opacity=".25" stroke="currentColor" stroke-width="1.6" fill-rule="evenodd" stroke-linejoin="round"/></svg>`;
}

// which objects use a box (x,y,w,h) and can rotate, flip and hold a label
const BOX_TYPES = ["rect", "ellipse", "tri", "star", "shape", "image", "model", "fracpie", "fracbar", "graph"];
const LABEL_TYPES = ["rect", "ellipse", "tri", "star", "shape", "poly"];
const canRotate = o => !["line", "arrow"].includes(o.type);

// ---------------------------------------------------------------- extra drawing around any object
function centerOf(o) { const b = bbox(o); return [b.x + b.w / 2, b.y + b.h / 2]; }
function transformAttr(o) {
  if (!canRotate(o) || (!o.rot && !o.fx && !o.fy)) return "";
  const [cx, cy] = centerOf(o);
  return ` transform="translate(${cx} ${cy}) rotate(${o.rot || 0}) scale(${o.fx ? -1 : 1} ${o.fy ? -1 : 1}) translate(${-cx} ${-cy})"`;
}
function rotateAttr(o) {   // rotation only (labels don't mirror)
  if (!canRotate(o) || !o.rot) return "";
  const [cx, cy] = centerOf(o);
  return ` transform="rotate(${o.rot} ${cx} ${cy})"`;
}
function labelSVG(o, texts) {
  const text = texts?.[o.id + ":label"] ?? o.label;
  if (!text || !LABEL_TYPES.includes(o.type)) return "";
  const b = bbox(o), size = o.lsize || 32, lines = wrapText(text, Math.max(40, b.w * 0.86), size);
  const top = b.y + b.h / 2 - (lines.length * size * 1.2) / 2 + size * 0.85;
  return `<text x="${b.x + b.w / 2}" y="${top}" font-size="${size}" fill="${o.lcolor || "#1c2230"}" text-anchor="middle" font-weight="${o.lbold === false ? 400 : 600}" font-family="Segoe UI, sans-serif" pointer-events="none">` +
    lines.map((l, i) => `<tspan x="${b.x + b.w / 2}" dy="${i ? size * 1.2 : 0}">${esc(l) || " "}</tspan>`).join("") + `</text>`;
}
// wrap the plain drawing of an object with rotation, flip, shadow and its label
function decorate(o, inner, texts) {
  const dash = o.dash && o.sw ? ` stroke-dasharray="${o.sw * 3} ${o.sw * 2}"` : "";
  if (dash) inner = inner.replace(/<(rect|ellipse|polygon|path|polyline|line)\b/, m => m + dash);
  const shadow = o.shadow ? ` filter="url(#ls-shadow)"` : "";
  return `<g${rotateAttr(o)}${shadow}><g${o.fx || o.fy ? transformAttr(Object.assign({}, o, { rot: 0 })) : ""}>${inner}</g>${labelSVG(o, texts)}</g>`;
}
const SVG_DEFS = `<defs><filter id="ls-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="5" dy="7" stdDeviation="6" flood-color="#000" flood-opacity=".3"/></filter></defs>`;

// selection box: dashed outline, 8 resize handles, rotate handle (or the two ends of a line)
function selectionSVG(o) {
  const H = (k, x, y, cur) => `<rect data-handle="${k}" x="${x - 8}" y="${y - 8}" width="16" height="16" rx="3" fill="#fff" stroke="#3b6cf0" stroke-width="3" style="cursor:${cur}"/>`;
  if (o.type === "line" || o.type === "arrow")
    return H("p1", o.x1, o.y1, "move") + H("p2", o.x2, o.y2, "move");
  const b = bbox(o), x = b.x - 6, y = b.y - 6, w = b.w + 12, h = b.h + 12;
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#3b6cf0" stroke-width="2" stroke-dasharray="8 5" pointer-events="none"/>`;
  if (o.lock) return `<g${rotateAttr(o)}>${s}<text x="${x + w - 4}" y="${y - 10}" font-size="26" text-anchor="end">🔒</text></g>`;
  const handles = [["nw", x, y, "nwse-resize"], ["n", x + w / 2, y, "ns-resize"], ["ne", x + w, y, "nesw-resize"], ["e", x + w, y + h / 2, "ew-resize"],
    ["se", x + w, y + h, "nwse-resize"], ["s", x + w / 2, y + h, "ns-resize"], ["sw", x, y + h, "nesw-resize"], ["w", x, y + h / 2, "ew-resize"]];
  const only = o.type === "numline" ? ["e", "w"] : o.type === "text" ? ["e", "w", "se", "nw", "ne", "sw"] : o.type === "math" ? ["se", "nw", "ne", "sw"] : null;
  for (const hd of handles) if (!only || only.includes(hd[0])) s += H(...hd);
  if (canRotate(o)) s += `<line x1="${x + w / 2}" y1="${y}" x2="${x + w / 2}" y2="${y - 40}" stroke="#3b6cf0" stroke-width="2"/>` +
    `<circle data-handle="rot" cx="${x + w / 2}" cy="${y - 48}" r="11" fill="#3b6cf0" stroke="#fff" stroke-width="3" style="cursor:grab"/>`;
  return `<g${rotateAttr(o)}>${s}</g>`;
}

// ---------------------------------------------------------------- handle dragging
// rotate a point around a center
const rotPt = ([px, py], [cx, cy], deg) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [cx + (px - cx) * c - (py - cy) * s, cy + (px - cx) * s + (py - cy) * c]; };

// apply a new box to an object (keeps its type's rules)
function setBox(o, start, nb, handle) {
  const b = bbox(start);
  if (o.type === "text" && handle && handle.length === 2) {   // corner: bigger / smaller text
    const k = nb.w / Math.max(1, b.w);
    o.size = Math.max(8, Math.min(400, Math.round(start.size * k))); o.w = Math.max(60, Math.round(start.w * k)); o.x = nb.x; o.y = nb.y; return;
  }
  if (o.type === "poly" || o.type === "path") {
    const sx = nb.w / Math.max(1, b.w), sy = nb.h / Math.max(1, b.h);
    o.points = start.points.map(p => [nb.x + (p[0] - b.x) * sx, nb.y + (p[1] - b.y) * sy]); return;
  }
  if (o.type === "text") { o.x = nb.x; o.y = nb.y; o.w = Math.max(60, nb.w); return; }
  if (o.type === "math") { o.size = Math.max(12, Math.round(start.size * nb.h / Math.max(10, b.h))); o.x = nb.x; o.y = nb.y; return; }
  if (o.type === "numline") { o.x = nb.x; o.w = Math.max(100, nb.w); return; }
  o.x = nb.x; o.y = nb.y; o.w = nb.w; o.h = nb.h;
}

// drag a resize handle; works on rotated objects too (math is done in the object's own frame)
function dragHandle(o, start, handle, px, py, keepRatio) {
  if (handle === "p1") { o.x1 = px; o.y1 = py; return; }
  if (handle === "p2") { o.x2 = px; o.y2 = py; return; }
  const b = bbox(start), c = [b.x + b.w / 2, b.y + b.h / 2], rot = start.rot || 0;
  if (handle === "rot") {
    let deg = Math.atan2(py - c[1], px - c[0]) * 180 / Math.PI + 90;
    if (keepRatio) deg = Math.round(deg / 15) * 15;   // Shift snaps to 15°
    o.rot = ((Math.round(deg) % 360) + 360) % 360; return;
  }
  const [lx, ly] = rotPt([px, py], c, -rot);   // pointer in the unrotated frame
  let x1 = b.x, y1 = b.y, x2 = b.x + b.w, y2 = b.y + b.h;
  if (handle.includes("w")) x1 = Math.min(lx, x2 - 10); if (handle.includes("e")) x2 = Math.max(lx, x1 + 10);
  if (handle.includes("n")) y1 = Math.min(ly, y2 - 10); if (handle.includes("s")) y2 = Math.max(ly, y1 + 10);
  if ((keepRatio || start.type === "text") && handle.length === 2 && b.w && b.h) {   // Shift on a corner keeps the proportions
    const k = Math.max((x2 - x1) / b.w, (y2 - y1) / b.h);
    if (handle.includes("w")) x1 = x2 - b.w * k; else x2 = x1 + b.w * k;
    if (handle.includes("n")) y1 = y2 - b.h * k; else y2 = y1 + b.h * k;
  }
  let nb = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  if (rot) {   // keep the opposite corner still on screen
    const ax = handle.includes("w") ? b.x + b.w : handle.includes("e") ? b.x : b.x + b.w / 2;
    const ay = handle.includes("n") ? b.y + b.h : handle.includes("s") ? b.y : b.y + b.h / 2;
    const before = rotPt([ax, ay], c, rot);
    const nc = [nb.x + nb.w / 2, nb.y + nb.h / 2], after = rotPt([ax, ay], nc, rot);
    nb = { x: nb.x + before[0] - after[0], y: nb.y + before[1] - after[1], w: nb.w, h: nb.h };
  }
  setBox(o, start, nb, handle);
}

// ---------------------------------------------------------------- shape picker (toolbar button and right-click)
function shapeGrid(onPick) {
  return `<div class="shapegrid">${SHAPES.map(([k]) => `<button data-shape="${k}" title="${esc(shapeName(k))}">${shapeIcon(k)}</button>`).join("")}</div>`;
}
function newShape(kind, x, y, w = 220, h = 160) {
  const st = Ed.style, base = { id: uid(), x, y, w, h, fill: st.fill, stroke: st.stroke, sw: st.sw };
  if (["rect", "ellipse", "tri", "star"].includes(kind)) return Object.assign(base, { type: kind });
  return Object.assign(base, { type: "shape", kind });
}
function openShapePicker(anchor) {
  closeCtx();
  const m = document.createElement("div"); m.id = "ctxmenu"; m.className = "ctx";
  const r = anchor.getBoundingClientRect();
  m.innerHTML = `<div class="ctxh">${tr("shapes")}</div>${shapeGrid()}`;
  document.body.appendChild(m); placeMenu(m, r.left, r.bottom + 4);
  m.querySelectorAll("[data-shape]").forEach(b => b.onclick = () => { Ed.shapeKind = b.dataset.shape; closeCtx(); setTool("shape"); toast(tr("drawShape")); });
}

// ---------------------------------------------------------------- right-click menu
function closeCtx() { document.getElementById("ctxmenu")?.remove(); }
function placeMenu(m, x, y) {
  const vw = innerWidth, vh = innerHeight, r = m.getBoundingClientRect();
  m.style.left = Math.max(4, Math.min(x, vw - r.width - 4)) + "px"; m.style.top = Math.max(4, Math.min(y, vh - r.height - 4)) + "px";
}
addEventListener("pointerdown", e => { if (!e.target.closest("#ctxmenu")) closeCtx(); }, true);
addEventListener("keydown", e => { if (e.key === "Escape") closeCtx(); });

function openCtxMenu(e) {
  if (App.role !== "teacher") return;
  e.preventDefault(); closeCtx();
  const [sx, sy] = slidePoint(e);
  const id = e.target.closest("[data-id]")?.dataset.id;
  const o = id ? slide().objects.find(x => x.id === id) : null;
  if (o) { App.sel = o.id; setTool("select"); }
  const colors = ["#1c2230", "#ffffff", "#e53935", "#fb8c00", "#ffd84d", "#43a047", "#1e88e5", "#8e24aa", "#ec407a", "#9e9e9e", "none"];
  const swatches = (kind) => `<div class="ctxcolors">${colors.map(c => `<button data-${kind}="${c}" title="${c === "none" ? tr("noFill") : c}" style="background:${c === "none" ? "repeating-linear-gradient(45deg,#fff 0 4px,#e33 4px 6px)" : c}"></button>`).join("")}</div>`;
  const item = (act, label, extra = "") => `<button class="ctxi" data-act="${act}">${label}${extra}</button>`;
  const hasFill = o && !["line", "arrow", "path", "text", "image", "model", "math", "graph", "numline"].includes(o.type);
  const m = document.createElement("div"); m.id = "ctxmenu"; m.className = "ctx";
  if (o) {
    m.innerHTML =
      `<div class="ctxh">${esc(o.type === "shape" ? shapeName(o.kind) : o.type === "text" ? tr("tText") : shapeName(o.type))}${o.lock ? " 🔒" : ""}</div>` +
      item("copy", "📋 " + tr("copy"), "<kbd>Ctrl+C</kbd>") + item("paste", "📥 " + tr("paste"), "<kbd>Ctrl+V</kbd>") +
      item("dup", "⧉ " + tr("dup"), "<kbd>Ctrl+D</kbd>") + item("del", "🗑 " + tr("del"), "<kbd>Del</kbd>") + `<hr>` +
      (LABEL_TYPES.includes(o.type) ? item("label", "✏️ " + tr("textInShape")) + item("pic", "🖼 " + tr("pictureInside")) + (o.img ? item("nopic", "✖ " + tr("removePicture")) : "") : "") +
      (o.type === "text" ? item("edittext", "✏️ " + tr("editText")) + `<div class="ctxrow">${tr("fontSize")} <button data-act="fs-">A−</button><b>${o.size}</b><button data-act="fs+">A+</button>
        <label><input type="checkbox" data-act="bold" ${o.bold ? "checked" : ""}> <b>${tr("bold")}</b></label></div>` : "") +
      (o.type === "image" ? item("replacepic", "🖼 " + tr("replacePicture")) : "") +
      (o.type === "shape" || ["rect", "ellipse", "tri", "star"].includes(o.type) ? item("change", "🔁 " + tr("changeShape") + " ▸") + `<div id="ctx-change" class="hidden">${shapeGrid()}</div>` : "") +
      (hasFill ? `<div class="ctxl">${tr("fill")}</div>` + swatches("fill") : "") +
      (o.type === "text" ? `<div class="ctxl">${tr("fill")}</div>` + swatches("tcolor") : "") +
      (!["text", "image", "model", "math", "graph"].includes(o.type) ? `<div class="ctxl">${tr("stroke")}</div>` + swatches("stroke") +
        `<div class="ctxrow">${tr("width")} <button data-act="sw-">−</button><b>${o.sw || 0}</b><button data-act="sw+">+</button>
          <label><input type="checkbox" data-act="dash" ${o.dash ? "checked" : ""}> ${tr("dashed")}</label></div>` : "") + `<hr>` +
      (canRotate(o) ? `<div class="ctxrow">${item("rotl", "⟲ 90°")}${item("rotr", "⟳ 90°")}${item("flipx", "⇋ " + tr("flipH"))}${item("flipy", "⇵ " + tr("flipV"))}</div>` : "") +
      `<div class="ctxrow">${item("front", "⬆ " + tr("front"))}${item("back", "⬇ " + tr("back"))}</div>` +
      `<div class="ctxrow"><label><input type="checkbox" data-act="shadow" ${o.shadow ? "checked" : ""}> ${tr("shadow")}</label>
        <label><input type="checkbox" data-act="lock" ${o.lock ? "checked" : ""}> 🔒 ${tr("lock")}</label></div>` +
      `<div class="ctxrow">${tr("opacity")} <input type="range" min="10" max="100" value="${Math.round((o.op ?? 1) * 100)}" data-act="op" style="flex:1"></div>`;
  } else {
    m.innerHTML = `<div class="ctxh">${tr("slide")}</div>` +
      `<div class="ctxl">${tr("insertShape")}</div>${shapeGrid()}` + `<hr>` +
      item("addtext", "T " + tr("addTextHere")) + item("addpic", "🖼 " + tr("insertPicture")) + item("paste", "📥 " + tr("paste"), "<kbd>Ctrl+V</kbd>") +
      `<div class="ctxl">${tr("background")}</div>` + swatches("bg");
  }
  document.body.appendChild(m); placeMenu(m, e.clientX, e.clientY);
  const change = fn => { Ed.commit(); fn(); Ed.changed(); };
  const keep = () => { closeCtx(); openCtxMenu(Object.assign({}, e, { preventDefault() {}, target: document.querySelector(`[data-id="${o?.id}"]`) || e.target })); };
  m.querySelectorAll("[data-shape]").forEach(b => b.onclick = () => {
    if (o && m.querySelector("#ctx-change") && b.closest("#ctx-change")) {   // change the kind, keep the box and style
      change(() => { const k = b.dataset.shape; if (["rect", "ellipse", "tri", "star"].includes(k)) { o.type = k; delete o.kind; } else { o.type = "shape"; o.kind = k; } });
    } else { const s = newShape(b.dataset.shape, sx - 110, sy - 80); change(() => { slide().objects.push(s); App.sel = s.id; }); }
    closeCtx();
  });
  m.querySelectorAll("[data-fill]").forEach(b => b.onclick = () => { change(() => o.fill = b.dataset.fill); });
  m.querySelectorAll("[data-stroke]").forEach(b => b.onclick = () => { change(() => { o.stroke = b.dataset.stroke; if (b.dataset.stroke !== "none" && !o.sw) o.sw = 3; }); });
  m.querySelectorAll("[data-tcolor]").forEach(b => b.onclick = () => { change(() => o.color = b.dataset.tcolor === "none" ? "#1c2230" : b.dataset.tcolor); });
  m.querySelectorAll("[data-bg]").forEach(b => b.onclick = () => { change(() => slide().bg = b.dataset.bg === "none" ? "#ffffff" : b.dataset.bg); closeCtx(); });
  m.querySelectorAll("[data-act]").forEach(b => {
    const act = b.dataset.act;
    const run = () => {
      switch (act) {
        case "copy": Ed.clip = clone(o); toast(tr("copied")); closeCtx(); break;
        case "paste": pasteObj(o ? null : [sx, sy]); closeCtx(); break;
        case "dup": duplicateSelected(); closeCtx(); break;
        case "del": deleteSelected(); closeCtx(); break;
        case "label": closeCtx(); openLabelEditor(o); break;
        case "edittext": closeCtx(); openTextEditor(o); break;
        case "addtext": closeCtx(); openTextEditor(null, sx, sy); break;
        case "addpic": closeCtx(); Ed.picAt = [sx, sy]; Ed.picTarget = null; $("imgfile").click(); break;
        case "pic": closeCtx(); Ed.picTarget = o; $("imgfile").click(); break;
        case "nopic": change(() => delete o.img); closeCtx(); break;
        case "replacepic": closeCtx(); Ed.picTarget = null; Ed.replaceImg = o; $("imgfile").click(); break;
        case "fs-": change(() => o.size = Math.max(8, Math.round(o.size / 1.15))); keep(); break;
        case "fs+": change(() => o.size = Math.min(400, Math.round(o.size * 1.15))); keep(); break;
        case "change": m.querySelector("#ctx-change").classList.toggle("hidden"); placeMenu(m, parseFloat(m.style.left), parseFloat(m.style.top)); break;
        case "sw-": change(() => o.sw = Math.max(0, (o.sw || 0) - 1)); keep(); break;
        case "sw+": change(() => o.sw = Math.min(40, (o.sw || 0) + 1)); keep(); break;
        case "rotl": change(() => o.rot = (((o.rot || 0) - 90) % 360 + 360) % 360); break;
        case "rotr": change(() => o.rot = ((o.rot || 0) + 90) % 360); break;
        case "flipx": change(() => o.fx = !o.fx); break;
        case "flipy": change(() => o.fy = !o.fy); break;
        case "front": change(() => { const a = slide().objects; a.push(a.splice(a.indexOf(o), 1)[0]); }); break;
        case "back": change(() => { const a = slide().objects; a.unshift(a.splice(a.indexOf(o), 1)[0]); }); break;
      }
    };
    if (b.type === "checkbox") b.onchange = () => change(() => { o[act] = b.checked; });
    else if (b.type === "range") b.onchange = () => change(() => { o.op = +b.value / 100; });
    else b.onclick = run;
  });
}

function pasteObj(at) {
  if (!Ed.clip) return;
  const c = clone(Ed.clip); c.id = uid();
  if (at) { const b = bbox(c); moveObj(c, at[0] - b.x - b.w / 2, at[1] - b.y - b.h / 2); } else moveObj(c, 30, 30);
  Ed.commit(); slide().objects.push(c); App.sel = c.id; Ed.clip = clone(c); Ed.changed();
}

// text inside a shape
function openLabelEditor(o) {
  const box = $("slidebox"), k = box.getBoundingClientRect().width / W, b = bbox(o);
  const ta = document.createElement("textarea"); ta.className = "textedit"; ta.value = o.label || "";
  const size = o.lsize || 32;
  Object.assign(ta.style, { left: (b.x + b.w * 0.07) * k + "px", top: (b.y + b.h / 2 - size) * k + "px", width: b.w * 0.86 * k + "px", height: Math.max(size * 2.4, 60) * k + "px", fontSize: size * k + "px", textAlign: "center" });
  box.appendChild(ta); ta.focus();
  const done = () => { const t = ta.value.trim(); ta.remove(); Ed.commit(); o.label = t; Ed.changed(); };
  ta.addEventListener("blur", done, { once: true });
  ta.addEventListener("keydown", ev => { if (ev.key === "Escape" || (ev.key === "Enter" && !ev.shiftKey)) { ev.preventDefault(); ta.blur(); } ev.stopPropagation(); });
}

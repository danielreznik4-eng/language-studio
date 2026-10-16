// Math on slides: pretty math writing (stacked fractions, powers, roots), fraction circles and bars,
// number lines and function graphs. Also fraction helpers used by the calculator and answer checking.
"use strict";

// ---------------------------------------------------------------- fractions
function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; }

// nearest simple fraction to x (continued fractions), or null if x isn't close to one
function toFraction(x, maxDen = 10000) {
  if (!isFinite(x)) return null;
  const sign = x < 0 ? -1 : 1; x = Math.abs(x);
  let h1 = 1, h0 = 0, k1 = 0, k0 = 1, b = x;
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(b);
    [h1, h0] = [a * h1 + h0, h1]; [k1, k0] = [a * k1 + k0, k1];
    if (k1 > maxDen) { h1 = h0; k1 = k0; break; }
    if (Math.abs(x - h1 / k1) < 1e-9 * Math.max(1, x)) break;
    b = 1 / (b - a); if (!isFinite(b)) break;
  }
  if (Math.abs(x - h1 / k1) > 1e-9 * Math.max(1, x)) return null;
  return { n: sign * h1, d: k1 };
}

// "3/4", "1 1/2" (mixed) or "5" ; returns math source text the renderer understands
function fractionText(x, mixed) {
  const f = toFraction(x); if (!f) return null;
  if (f.d === 1) return String(f.n);
  if (mixed && Math.abs(f.n) > f.d) {
    const whole = Math.trunc(f.n / f.d), rest = Math.abs(f.n % f.d);
    return whole + " " + rest + "/" + f.d;
  }
  return f.n + "/" + f.d;
}

// value of an answer like "1/2", "0.5", "1 1/2", "2/4" (null if it isn't a number)
function answerValue(s) {
  s = String(s).trim().replace(",", ".");
  const mixed = /^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (mixed) { const w = +mixed[1]; return w + Math.sign(w || 1) * (+mixed[2] / +mixed[3]); }
  try { const v = Calc.evaluate(s); return isFinite(v) ? v : null; } catch (e) { return null; }
}

// ---------------------------------------------------------------- math writing (layout engine)
// Source syntax: a/b = stacked fraction, x^2 = power, x_1 = small below, sqrt(x) = root, ( ) groups,
// * = ×, pi = π, <= >= != +- and words like deg, inf. A space between a number and a fraction makes a mixed number.
const MATH_SYMBOLS = { "*": "×", "<=": "≤", ">=": "≥", "!=": "≠", "+-": "±", pi: "π", deg: "°", inf: "∞", theta: "θ", alpha: "α", beta: "β", delta: "Δ", sum: "Σ", "->": "→" };

function mathTokens(src) {
  const out = []; let i = 0; const s = String(src);
  while (i < s.length) {
    const c = s[i];
    if (c === " ") { out.push({ t: "space" }); while (s[i] === " ") i++; continue; }
    const two = s.slice(i, i + 2);
    if (["<=", ">=", "!=", "+-", "->"].includes(two)) { out.push({ t: "sym", v: MATH_SYMBOLS[two] }); i += 2; continue; }
    if (/\d/.test(c) || (c === "." && /\d/.test(s[i + 1] || ""))) { const m = /^\d*\.?\d+/.exec(s.slice(i)); out.push({ t: "num", v: m[0] }); i += m[0].length; continue; }
    if (/[a-zA-Zа-яА-ЯёЁ]/.test(c)) {
      const m = /^[a-zA-Zа-яА-ЯёЁ]+/.exec(s.slice(i))[0];
      if (m === "sqrt" || m === "root") { out.push({ t: "sqrt" }); i += m.length; continue; }
      if (MATH_SYMBOLS[m]) { out.push({ t: "sym", v: MATH_SYMBOLS[m] }); i += m.length; continue; }
      if (["sin", "cos", "tan", "log", "ln", "lim", "max", "min"].includes(m)) { out.push({ t: "fn", v: m }); i += m.length; continue; }
      out.push({ t: "var", v: c }); i++; continue;   // single letters are variables: 2xy = 2·x·y
    }
    if (c === "(" || c === ")" || c === "{" || c === "}") { out.push({ t: c === "(" || c === "{" ? "open" : "close", br: c === "(" || c === ")" }); i++; continue; }
    if (c === "/" || c === "^" || c === "_") { out.push({ t: c }); i++; continue; }
    out.push({ t: "sym", v: MATH_SYMBOLS[c] || c }); i++;
  }
  return out;
}

// parse into nodes: row = [node], node = {k:"txt",v,italic} | {k:"frac",a,b} | {k:"sup",base,e} | {k:"sub",base,e} | {k:"sqrt",a} | {k:"group",a,br}
function mathParse(tokens) {
  let i = 0;
  const atom = () => {
    const t = tokens[i];
    if (!t) return null;
    if (t.t === "num") { i++; return { k: "txt", v: t.v }; }
    if (t.t === "var") { i++; return { k: "txt", v: t.v, italic: true }; }
    if (t.t === "fn") { i++; return { k: "txt", v: t.v }; }
    if (t.t === "sym") { i++; return { k: "txt", v: t.v, op: true }; }
    if (t.t === "sqrt") { i++; const a = atom(); return { k: "sqrt", a: a?.k === "group" ? a.a : (a ? [a] : []) }; }
    if (t.t === "open") { const br = t.br; i++; const a = row(true); if (tokens[i]?.t === "close") i++; return { k: "group", a, br }; }
    return null;
  };
  const postfix = () => {
    let n = atom(); if (!n) return null;
    for (;;) {
      const t = tokens[i];
      if (t?.t === "^" || t?.t === "_") { i++; const e = atom(); n = { k: t.t === "^" ? "sup" : "sub", base: n, e: e?.k === "group" ? e.a : (e ? [e] : []) }; }
      else return n;
    }
  };
  const row = (inGroup) => {
    const out = [];
    while (i < tokens.length) {
      const t = tokens[i];
      if (t.t === "close") { if (inGroup) return out; i++; continue; }
      if (t.t === "space") { i++; out.push({ k: "gap" }); continue; }
      if (t.t === "/") {   // fraction: previous item over the next item
        i++;
        let prev = out.pop(); while (prev?.k === "gap") prev = out.pop();
        const next = postfix();
        const unwrap = n => n ? (n.k === "group" && n.br ? n.a : [n]) : [];
        out.push({ k: "frac", a: unwrap(prev), b: unwrap(next) }); continue;
      }
      const n = postfix(); if (n) out.push(n); else i++;
    }
    return out;
  };
  return row(false);
}

// layout: returns {w, up, down, draw(x, baseline) -> svg}
function mathLayout(nodes, size, color) {
  const charW = (ch, italic) => size * (/[ilj1.,:;!|']/.test(ch) ? 0.32 : /[mwMW]/.test(ch) ? 0.82 : /[×÷±≤≥≠=+\-→]/.test(ch) ? 0.72 : 0.56) * (italic ? 1.02 : 1);
  const font = `font-family="Cambria Math, Cambria, Times New Roman, serif"`;
  const items = nodes.map(n => one(n));
  function one(n) {
    switch (n.k) {
      case "gap": return { w: size * 0.25, up: 0, down: 0, draw: () => "" };
      case "txt": {
        const pad = n.op ? size * 0.18 : 0;
        const w = [...n.v].reduce((s, c) => s + charW(c, n.italic), 0) + pad * 2;
        return { w, up: size * 0.72, down: size * 0.22, draw: (x, y) => `<text x="${x + pad}" y="${y}" font-size="${size}" fill="${color}" ${font}${n.italic ? ' font-style="italic"' : ""}>${esc(n.v)}</text>` };
      }
      case "frac": {
        const A = mathLayout(n.a, size * 0.82, color), B = mathLayout(n.b, size * 0.82, color);
        const w = Math.max(A.w, B.w) + size * 0.3, axis = size * 0.3, gap = size * 0.12, line = Math.max(1.5, size * 0.055);
        return { w, up: axis + gap + A.down + A.up, down: -axis + gap + B.up + B.down,
          draw: (x, y) => A.draw(x + (w - A.w) / 2, y - axis - gap - A.down) + B.draw(x + (w - B.w) / 2, y - axis + gap + B.up) +
            `<line x1="${x + size * 0.05}" y1="${y - axis}" x2="${x + w - size * 0.05}" y2="${y - axis}" stroke="${color}" stroke-width="${line}"/>` };
      }
      case "sup": case "sub": {
        const base = one(n.base), E = mathLayout(n.e, size * 0.62, color), sup = n.k === "sup";
        const shift = sup ? base.up - size * 0.25 : size * 0.25;
        return { w: base.w + E.w + size * 0.04, up: sup ? Math.max(base.up, shift + E.up) : base.up, down: sup ? base.down : Math.max(base.down, shift + E.down),
          draw: (x, y) => base.draw(x, y) + E.draw(x + base.w + size * 0.02, sup ? y - shift : y + shift) };
      }
      case "sqrt": {
        const A = mathLayout(n.a, size, color), lw = Math.max(1.5, size * 0.06), hook = size * 0.55, top = A.up + size * 0.14;
        return { w: hook + A.w + size * 0.12, up: top + lw, down: A.down + size * 0.04,
          draw: (x, y) => `<path d="M${x} ${y - size * 0.25} L${x + hook * 0.3} ${y - size * 0.35} L${x + hook * 0.62} ${y + A.down} L${x + hook} ${y - top} L${x + hook + A.w + size * 0.12} ${y - top}" fill="none" stroke="${color}" stroke-width="${lw}" stroke-linejoin="round"/>` + A.draw(x + hook + size * 0.04, y) };
      }
      case "group": {
        const A = mathLayout(n.a, size, color);
        if (!n.br) return A;
        const h = A.up + A.down, pw = size * 0.32, sc = Math.max(1, h / (size * 0.95));
        const paren = (x, y, ch) => `<text x="${x}" y="${y + A.down - (h - size * 0.95 * sc) / 2 - size * 0.2 * sc}" font-size="${size * sc}" fill="${color}" ${font}>${ch}</text>`;
        return { w: A.w + pw * 2, up: A.up, down: A.down, draw: (x, y) => paren(x, y, "(") + A.draw(x + pw, y) + paren(x + pw + A.w, y, ")") };
      }
    }
    return { w: 0, up: 0, down: 0, draw: () => "" };
  }
  const w = items.reduce((s, b) => s + b.w, 0);
  return { w, up: Math.max(size * 0.72, ...items.map(b => b.up)), down: Math.max(size * 0.22, ...items.map(b => b.down)),
    draw: (x, y) => { let cx = x, out = ""; for (const b of items) { out += b.draw(cx, y); cx += b.w; } return out; } };
}

function mathBox(o) { const L = mathLayout(mathParse(mathTokens(o.src)), o.size, o.color); return { L, w: Math.max(L.w, 20), h: L.up + L.down }; }

// ---------------------------------------------------------------- slide objects
function mathObjSVG(o, id) {
  switch (o.type) {
    case "math": {
      const { L, w, h } = mathBox(o);
      return `<g ${id}><rect x="${o.x}" y="${o.y}" width="${w}" height="${h}" fill="transparent"/>${L.draw(o.x, o.y + L.up)}</g>`;
    }
    case "fracpie": {
      const cx = o.x + o.w / 2, cy = o.y + o.h / 2, r = Math.min(o.w, o.h) / 2 - (o.sw || 0), n = Math.max(1, o.n | 0);
      let s = `<g ${id}>`;
      if (n === 1) s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${o.k >= 1 ? o.fill : "#fff"}" stroke="${o.stroke}" stroke-width="${o.sw}"/>`;
      else for (let i = 0; i < n; i++) {
        const a0 = -Math.PI / 2 + i * 2 * Math.PI / n, a1 = a0 + 2 * Math.PI / n;
        s += `<path d="M${cx} ${cy} L${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)} Z" fill="${i < o.k ? o.fill : "#ffffff"}" stroke="${o.stroke}" stroke-width="${o.sw}" stroke-linejoin="round"/>`;
      }
      if (o.label) s += mathLayout(mathParse(mathTokens(o.k + "/" + n)), Math.max(18, o.h * 0.16), o.stroke).draw(cx - o.h * 0.08, o.y + o.h + o.h * 0.22);
      return s + `</g>`;
    }
    case "fracbar": {
      const n = Math.max(1, o.n | 0), cw = o.w / n;
      let s = `<g ${id}>`;
      for (let i = 0; i < n; i++) s += `<rect x="${o.x + i * cw}" y="${o.y}" width="${cw}" height="${o.h}" fill="${i < o.k ? o.fill : "#ffffff"}" stroke="${o.stroke}" stroke-width="${o.sw}"/>`;
      if (o.label) s += mathLayout(mathParse(mathTokens(o.k + "/" + n)), Math.max(18, o.h * 0.5), o.stroke).draw(o.x + o.w + 16, o.y + o.h * 0.75);
      return s + `</g>`;
    }
    case "numline": {
      const lo = answerValue(o.min) ?? 0, hi = answerValue(o.max) ?? 1, step = Math.abs(answerValue(o.step) || 1);
      const y = o.y + o.h / 2, X = v => o.x + (v - lo) / (hi - lo || 1) * o.w, fs = o.size || 24;
      let s = `<g ${id}><rect x="${o.x - 10}" y="${o.y}" width="${o.w + 20}" height="${o.h}" fill="transparent"/>` +
        `<line x1="${o.x - 12}" y1="${y}" x2="${o.x + o.w + 12}" y2="${y}" stroke="${o.stroke}" stroke-width="${o.sw}"/>` +
        `<polygon points="${o.x + o.w + 24},${y} ${o.x + o.w + 10},${y - 8} ${o.x + o.w + 10},${y + 8}" fill="${o.stroke}"/>`;
      const count = Math.min(200, Math.round((hi - lo) / step));
      for (let i = 0; i <= count; i++) {
        const v = lo + i * step, x = X(v);
        s += `<line x1="${x}" y1="${y - 12}" x2="${x}" y2="${y + 12}" stroke="${o.stroke}" stroke-width="${Math.max(2, o.sw * 0.7)}"/>`;
        const label = o.frac ? (fractionText(v, true) ?? String(+v.toFixed(3))) : String(+v.toFixed(3));
        const L = mathLayout(mathParse(mathTokens(label)), fs, o.stroke);
        s += L.draw(x - L.w / 2, y + 22 + L.up);
      }
      for (const p of String(o.points || "").split(/[;,]+/).map(t => answerValue(t)).filter(v => v != null))
        s += `<circle cx="${X(p)}" cy="${y}" r="9" fill="${o.fill}" stroke="${o.stroke}" stroke-width="2"/>`;
      return s + `</g>`;
    }
    case "graph": {
      const { x, y, w, h } = o, X = v => x + (v - o.xmin) / (o.xmax - o.xmin) * w, Y = v => y + h - (v - o.ymin) / (o.ymax - o.ymin) * h;
      let s = `<g ${id}><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ffffff" stroke="#c9d1de"/>`;
      const stepOf = span => { const r = span / 10, p = Math.pow(10, Math.floor(Math.log10(r))); return [1, 2, 5, 10].map(m => m * p).find(v => v >= r); };
      const sx = stepOf(o.xmax - o.xmin), sy = stepOf(o.ymax - o.ymin);
      for (let v = Math.ceil(o.xmin / sx) * sx; v <= o.xmax + 1e-9; v += sx) s += `<line x1="${X(v)}" y1="${y}" x2="${X(v)}" y2="${y + h}" stroke="#e6eaf0"/>` + (Math.abs(v) > 1e-9 && o.ymin <= 0 && o.ymax >= 0 ? `<text x="${X(v)}" y="${Y(0) + 18}" font-size="14" text-anchor="middle" fill="#667">${+v.toFixed(4)}</text>` : "");
      for (let v = Math.ceil(o.ymin / sy) * sy; v <= o.ymax + 1e-9; v += sy) s += `<line x1="${x}" y1="${Y(v)}" x2="${x + w}" y2="${Y(v)}" stroke="#e6eaf0"/>` + (Math.abs(v) > 1e-9 && o.xmin <= 0 && o.xmax >= 0 ? `<text x="${X(0) - 6}" y="${Y(v) + 5}" font-size="14" text-anchor="end" fill="#667">${+v.toFixed(4)}</text>` : "");
      if (o.ymin <= 0 && o.ymax >= 0) s += `<line x1="${x}" y1="${Y(0)}" x2="${x + w}" y2="${Y(0)}" stroke="#334" stroke-width="2"/>`;
      if (o.xmin <= 0 && o.xmax >= 0) s += `<line x1="${X(0)}" y1="${y}" x2="${X(0)}" y2="${y + h}" stroke="#334" stroke-width="2"/>`;
      const colors = ["#e53935", "#1e88e5", "#43a047", "#8e24aa", "#fb8c00"];
      s += `<clipPath id="clip-${o.id}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath><g clip-path="url(#clip-${o.id})">`;
      (o.fns || []).forEach((f, fi) => {
        if (!f.trim()) return;
        let path = "", pen = false;
        for (let i = 0; i <= 400; i++) {
          const vx = o.xmin + (o.xmax - o.xmin) * i / 400;
          let vy; try { vy = Calc.evaluate(f.replace(/^\s*y\s*=/i, ""), { x: vx }); } catch (e) { vy = NaN; }
          if (!isFinite(vy) || Math.abs(vy) > 1e6) { pen = false; continue; }
          path += (pen ? "L" : "M") + X(vx).toFixed(1) + " " + Y(vy).toFixed(1) + " "; pen = true;
        }
        s += `<path d="${path}" fill="none" stroke="${colors[fi % colors.length]}" stroke-width="3"/>`;
      });
      s += `</g>`;
      (o.fns || []).forEach((f, fi) => { if (f.trim()) s += `<text x="${x + 10}" y="${y + 24 + fi * 22}" font-size="18" fill="${colors[fi % colors.length]}" font-family="Cambria Math, serif">y = ${esc(f.replace(/^\s*y\s*=/i, ""))}</text>`; });
      return s + `</g>`;
    }
  }
  return "";
}

function mathBBox(o) {
  if (o.type === "math") { const b = mathBox(o); return { x: o.x, y: o.y, w: b.w, h: b.h }; }
  return { x: o.x, y: o.y, w: o.w, h: o.h };
}

const MATH_TYPES = ["math", "fracpie", "fracbar", "numline", "graph"];

function newMathObj(type, x, y) {
  const base = { id: uid(), type, x, y };
  if (type === "fracpie") return Object.assign(base, { w: 240, h: 240, n: 4, k: 1, fill: "#ff8a3d", stroke: "#1c2230", sw: 3, label: true });
  if (type === "fracbar") return Object.assign(base, { w: 480, h: 70, n: 5, k: 2, fill: "#4f7cff", stroke: "#1c2230", sw: 3, label: true });
  if (type === "numline") return Object.assign(base, { w: 800, h: 110, min: "0", max: "2", step: "1/4", frac: true, points: "", fill: "#e53935", stroke: "#1c2230", sw: 4, size: 24 });
  if (type === "graph") return Object.assign(base, { w: 560, h: 420, xmin: -5, xmax: 5, ymin: -5, ymax: 5, fns: ["x^2", "2x+1"] });
  return Object.assign(base, { src: "1/2 + 1/4 = 3/4", size: 56, color: "#1c2230" });
}

// properties panel rows for math objects (returns html), and binding
function mathPropsHTML(o) {
  const row = (label, html) => `<label>${label} ${html}</label>`;
  switch (o.type) {
    case "math": return `<label style="display:block">${tr("mathSrc")}<textarea id="mp-src" rows="2" style="width:100%">${esc(o.src)}</textarea></label>
      ${row(tr("fontSize"), `<input type="number" id="mp-size" min="12" max="300" value="${o.size}" style="width:70px">`)}
      ${row(tr("fill"), `<input type="color" id="mp-color" value="${o.color}">`)}<button class="btn small ghost" id="mp-edit">∑ ${tr("mathEditor")}</button>`;
    case "fracpie": case "fracbar": return row(tr("parts"), `<input type="number" id="mp-n" min="1" max="60" value="${o.n}" style="width:70px">`) +
      row(tr("shaded"), `<input type="number" id="mp-k" min="0" max="${o.n}" value="${o.k}" style="width:70px">`) +
      row(tr("fill"), `<input type="color" id="mp-fill" value="${o.fill}">`) + row(tr("showLabel"), `<input type="checkbox" id="mp-label" ${o.label ? "checked" : ""}>`);
    case "numline": return row(tr("from"), `<input type="text" id="mp-min" value="${esc(o.min)}" style="width:80px">`) + row(tr("to"), `<input type="text" id="mp-max" value="${esc(o.max)}" style="width:80px">`) +
      row(tr("stepBy"), `<input type="text" id="mp-step" value="${esc(o.step)}" style="width:80px">`) + row(tr("asFractions"), `<input type="checkbox" id="mp-frac" ${o.frac ? "checked" : ""}>`) +
      row(tr("dots"), `<input type="text" id="mp-points" value="${esc(o.points)}" placeholder="1/2; 3/4" style="width:110px">`);
    case "graph": return `<label style="display:block">${tr("functions")}<textarea id="mp-fns" rows="3" style="width:100%">${esc((o.fns || []).join("\n"))}</textarea></label>` +
      row("x", `<span><input type="number" id="mp-xmin" value="${o.xmin}" style="width:60px"> … <input type="number" id="mp-xmax" value="${o.xmax}" style="width:60px"></span>`) +
      row("y", `<span><input type="number" id="mp-ymin" value="${o.ymin}" style="width:60px"> … <input type="number" id="mp-ymax" value="${o.ymax}" style="width:60px"></span>`);
  }
  return "";
}
function bindMathProps(o, set) {
  const on = (id, fn) => { const el = $(id); if (el) el.addEventListener("change", e => set(() => fn(e.target))); };
  on("mp-src", t => o.src = t.value); on("mp-size", t => o.size = Math.max(12, +t.value)); on("mp-color", t => o.color = t.value);
  on("mp-n", t => { o.n = Math.max(1, Math.min(60, +t.value | 0)); o.k = Math.min(o.k, o.n); }); on("mp-k", t => o.k = Math.max(0, Math.min(o.n, +t.value | 0)));
  on("mp-fill", t => o.fill = t.value); on("mp-label", t => o.label = t.checked);
  on("mp-min", t => o.min = t.value); on("mp-max", t => o.max = t.value); on("mp-step", t => o.step = t.value); on("mp-frac", t => o.frac = t.checked); on("mp-points", t => o.points = t.value);
  on("mp-fns", t => o.fns = t.value.split("\n")); ["xmin", "xmax", "ymin", "ymax"].forEach(k => on("mp-" + k, t => { const v = +t.value; if (isFinite(v)) o[k] = v; if (o.xmax <= o.xmin) o.xmax = o.xmin + 1; if (o.ymax <= o.ymin) o.ymax = o.ymin + 1; }));
  const ed = $("mp-edit"); if (ed) ed.onclick = () => MathPanel.open(o);
}

// ---------------------------------------------------------------- math editor window (templates + live preview)
const MathPanel = {
  templates: [["a/b", "□/□", "frac"], ["2 1/2", "2 ½", "mixed"], ["x^2", "x²", "power"], ["x_1", "x₁", "sub"], ["sqrt(x)", "√x", "root"], ["(a+b)/c", "(a+b)/c", "group"],
    ["*", "×"], ["÷", "÷"], ["+-", "±"], ["<=", "≤"], [">=", "≥"], ["!=", "≠"], ["pi", "π"], ["deg", "°"], ["inf", "∞"], ["theta", "θ"], ["->", "→"]],
  open(target) {
    document.getElementById("mathwin")?.remove();
    const win = document.createElement("div"); win.id = "mathwin"; win.className = "float";
    Object.assign(win.style, { left: "50%", top: "80px", transform: "translateX(-50%)", width: "min(560px, 94vw)" });
    win.innerHTML = `<div class="fh"><b>∑ ${tr("mathEditor")}</b><button class="btn small ghost" id="mw-x">✕</button></div>
      <div style="padding:10px;display:flex;flex-direction:column;gap:8px">
        <div class="row">${this.templates.map((t, i) => `<button class="btn small ghost" data-t="${i}" title="${esc(t[0])}">${esc(t[1])}</button>`).join("")}</div>
        <textarea id="mw-src" rows="2" style="width:100%;font-size:18px">${esc(target ? target.src : "3/4 + 1/8 = 7/8")}</textarea>
        <div class="muted" style="font-size:12px">${tr("mathHelp")}</div>
        <div id="mw-prev" style="background:#fff;border:1px solid var(--line);border-radius:10px;min-height:110px;display:flex;align-items:center;justify-content:center;overflow:auto"></div>
        <div class="row" style="justify-content:flex-end"><button class="btn" id="mw-ok">${target ? tr("update") : tr("toSlide")}</button></div></div>`;
    document.body.appendChild(win); draggable(win);
    const src = $("mw-src"), prev = () => {
      const o = { src: src.value, size: 56, color: "#1c2230" }, b = mathBox(o);
      $("mw-prev").innerHTML = `<svg viewBox="-10 -10 ${b.w + 20} ${b.h + 20}" style="height:${Math.min(160, b.h + 20)}px;max-width:100%">${b.L.draw(0, b.L.up)}</svg>`;
    };
    src.oninput = prev; prev(); src.focus();
    win.querySelectorAll("[data-t]").forEach(bt => bt.onclick = () => {
      const t = this.templates[+bt.dataset.t][0], a = src.selectionStart, z = src.selectionEnd;
      src.value = src.value.slice(0, a) + t + src.value.slice(z); src.focus(); src.selectionStart = src.selectionEnd = a + t.length; prev();
    });
    $("mw-x").onclick = () => win.remove();
    $("mw-ok").onclick = () => {
      if (!src.value.trim()) return;
      Ed.commit();
      if (target && slide().objects.includes(target)) target.src = src.value;
      else { const o = newMathObj("math", 140, 140); o.src = src.value; slide().objects.push(o); App.sel = o.id; }
      win.remove(); setTool("select"); Ed.changed();
    };
  }
};

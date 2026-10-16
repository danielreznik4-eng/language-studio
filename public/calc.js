// Scientific calculator (safe parser, no eval). The teacher can drop the result onto the slide.
"use strict";
const Calc = {
  expr: "", ans: 0, deg: true, frac: false,

  // recursive-descent parser: expr = term (+|- term)*, term = power (*|/|% power)*, power = unary (^ power)?, unary = -unary | call
  evaluate(src, vars) {
    const s = src.replace(/×/g, "*").replace(/÷/g, "/").replace(/π/g, "pi").replace(/√/g, "sqrt");
    let i = 0;
    const peek = () => s[i], skip = () => { while (s[i] === " ") i++; };
    const num = () => { skip(); const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i)); if (!m) throw 0; i += m[0].length; return parseFloat(m[0]); };
    const rad = x => this.deg ? x * Math.PI / 180 : x, unrad = x => this.deg ? x * 180 / Math.PI : x;
    const F = { sin: x => Math.sin(rad(x)), cos: x => Math.cos(rad(x)), tan: x => Math.tan(rad(x)),
      asin: x => unrad(Math.asin(x)), acos: x => unrad(Math.acos(x)), atan: x => unrad(Math.atan(x)),
      sqrt: Math.sqrt, cbrt: Math.cbrt, log: Math.log10, ln: Math.log, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil };
    const atom = () => {
      skip();
      if (peek() === "(") { i++; const v = expr(); skip(); if (s[i] !== ")") throw 0; i++; return v; }
      const m = /^[a-z]+/i.exec(s.slice(i));
      if (m) {
        const w = m[0].toLowerCase();
        if (w === "pi") { i += 2; return Math.PI; } if (w === "ans") { i += 3; return this.ans; }
        if (F[w]) { i += w.length; const a = unary(); return F[w](a); }
        // a function name glued after a variable, like "xsin(x)", or a single letter variable / e
        if (vars && w[0] in vars) { i += 1; return vars[w[0]]; }
        if (w[0] === "e") { i += 1; return Math.E; }
        throw 0;
      }
      return num();
    };
    const post = () => { let v = atom(); skip(); while (s[i] === "!") { i++; let f = 1; for (let k = 2; k <= v; k++) f *= k; v = f; skip(); } return v; };
    const unary = () => { skip(); if (s[i] === "-") { i++; return -unary(); } if (s[i] === "+") { i++; return unary(); } return post(); };
    const power = () => { const b = unary(); skip(); if (s[i] === "^") { i++; return Math.pow(b, power()); } return b; };
    const term = () => { let v = power(); for (;;) { skip(); const c = s[i]; if (c === "*") { i++; v *= power(); } else if (c === "/") { i++; v /= power(); } else if (c === "%") { i++; v %= power(); } else if (c === "(" || /[a-z\d.]/i.test(c || "")) { v *= power(); } else return v; } };
    const expr = () => { let v = term(); for (;;) { skip(); if (s[i] === "+") { i++; v += term(); } else if (s[i] === "-") { i++; v -= term(); } else return v; } };
    const v = expr(); skip(); if (i < s.length) throw 0;
    return v;
  },
  fmt(v) { if (!isFinite(v)) return String(v); const r = Math.round(v * 1e10) / 1e10; return Math.abs(r) >= 1e12 || (Math.abs(r) < 1e-6 && r !== 0) ? r.toExponential(6) : String(r); },

  keys: ["sin", "cos", "tan", "√", "^", "asin", "acos", "atan", "log", "ln", "(", ")", "π", "e", "!", "7", "8", "9", "÷", "⌫", "4", "5", "6", "×", "C", "1", "2", "3", "-", "ans", "0", ".", "%", "+", "="],

  open() {
    const win = $("calc"); win.classList.remove("hidden");
    win.innerHTML = `<div class="fh"><b>🧮 ${tr("calc")}</b><span class="row"><button class="btn small ghost" id="c-frac" title="${esc(tr("fracMode"))}">${this.frac ? "a/b" : "0.5"}</button><button class="btn small ghost" id="c-deg">${this.deg ? "DEG" : "RAD"}</button>
      ${App.role === "teacher" ? `<button class="btn small ghost" id="c-slide">${tr("toSlide")}</button>` : ""}<button class="btn small ghost" id="c-x">✕</button></span></div>
      <div class="cdisp"><div class="expr" id="c-expr"></div><div class="res" id="c-res">0</div></div>
      <div class="ckeys">${this.keys.map(k => `<button class="${/^[+\-×÷^%]$/.test(k) ? "op" : k === "=" ? "eq" : ""}" data-k="${k}">${k}</button>`).join("")}</div>`;
    draggable(win);
    $("c-x").onclick = () => win.classList.add("hidden");
    $("c-deg").onclick = () => { this.deg = !this.deg; $("c-deg").textContent = this.deg ? "DEG" : "RAD"; this.show(); };
    $("c-frac").onclick = () => { this.frac = !this.frac; $("c-frac").textContent = this.frac ? "a/b" : "0.5"; this.show(); };
    const cs = $("c-slide"); if (cs) cs.onclick = () => this.toSlide();
    win.querySelectorAll("[data-k]").forEach(b => b.onclick = () => this.press(b.dataset.k));
    this.show();
  },
  press(k) {
    if (k === "C") this.expr = "";
    else if (k === "⌫") this.expr = this.expr.slice(0, -1);
    else if (k === "=") { try { this.ans = this.evaluate(this.expr); this.last = this.expr + " = " + this.fmt(this.ans); this.expr = this.fmt(this.ans); } catch (e) { this.error = true; } }
    else if (["sin", "cos", "tan", "asin", "acos", "atan", "log", "ln", "√"].includes(k)) this.expr += k + "(";
    else this.expr += k;
    this.show();
  },
  show() {
    if (!$("c-expr")) return;
    $("c-expr").textContent = this.last && this.expr === this.fmt(this.ans) ? this.last : this.expr;
    let res = "";
    try {
      const v = this.expr ? this.evaluate(this.expr) : 0;
      res = this.fmt(v);
      if (this.frac) { const f = fractionText(v, true); if (f && f !== res) res = f.replace(" ", " ") + "  (" + res + ")"; }
    } catch (e) { res = this.error ? "?" : "…"; }
    this.error = false;
    $("c-res").textContent = res;
  },
  toSlide() {
    if (!slide()) return;
    let v = null; try { v = this.evaluate(this.expr || "0"); } catch (e) { /* show as typed */ }
    const shown = v == null ? "" : (this.frac && fractionText(v, true)) || this.fmt(v);
    const src = (this.expr || "0").replace(/×/g, "*").replace(/÷/g, "/").replace(/√/g, "sqrt").replace(/π/g, "pi") + (v == null ? "" : " = " + shown);
    Ed.commit(); const o = Object.assign(newMathObj("math", 120, 540), { src, size: 48 });
    slide().objects.push(o); App.sel = o.id; Ed.changed();
  }
};
addEventListener("keydown", e => {
  const win = $("calc"); if (win.classList.contains("hidden") || e.target.closest("input, textarea, select")) return;
  if (!win.matches(":hover")) return;   // only type into the calculator while the mouse is over it
  const map = { "*": "×", "/": "÷", "Enter": "=", "Backspace": "⌫", "Escape": "C" };
  const k = map[e.key] || e.key;
  if (/^[\d.+\-^%()!e]$/.test(k) || ["×", "÷", "=", "⌫", "C"].includes(k)) { e.preventDefault(); e.stopPropagation(); Calc.press(k); }
}, true);

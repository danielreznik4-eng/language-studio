// 3D CAD mode (three.js): add parts, sketch a custom shape and extrude it, move/rotate/size with handles,
// snap to grid, export STL for 3D printing, and put the model on a slide. Students can turn models around.
"use strict";
const CDN = [
  "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js",
  "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js",
  "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/TransformControls.js",
  "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/exporters/STLExporter.js",
];
function loadScripts(list) {
  return list.reduce((p, src) => p.then(() => new Promise((ok, fail) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok();
    const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s);
  })), Promise.resolve());
}

addEventListener("keydown", e => {
  if (!Cad.three || Cad.readOnly || $("cad").classList.contains("hidden") || e.target.closest("input, textarea, select") || $("sketch")) return;
  const k = e.key.toLowerCase(), g = Cad.three.gizmo;
  if (k === "w") g.setMode("translate"); else if (k === "e") g.setMode("rotate"); else if (k === "r") g.setMode("scale");
  else if ((k === "delete" || k === "backspace") && Cad.sel) { Cad.parts = Cad.parts.filter(p => p.id !== Cad.sel); Cad.select(null); }
  else if (k === "escape") Cad.select(null);
});

const Cad = {
  parts: [], sel: null, target: null, readOnly: false, snap: true,
  three: null,   // { renderer, scene, camera, orbit, gizmo, meshes: Map }

  async open(slideObj, readOnly = false) {
    this.target = slideObj || null; this.readOnly = readOnly;
    this.parts = slideObj?.scene ? clone(slideObj.scene) : [];
    this.sel = null;
    const win = $("cad"); win.classList.remove("hidden");
    win.innerHTML = `<header><h1>🧊 ${tr("cad")}</h1><span class="muted" id="cad-msg"></span><div class="spacer"></div>
      ${readOnly ? "" : `<button class="btn ghost" id="cad-stl">${tr("stl")}</button><button class="btn" id="cad-slide">${tr("toSlide3d")}</button>`}
      <button class="btn ghost" id="cad-x">${tr("close")}</button></header>
      <div id="cadview"><div id="cad3d"></div><aside class="side" id="cadside" ${readOnly ? 'style="display:none"' : ""}></aside></div>`;
    if (readOnly) $("cadview").style.gridTemplateColumns = "1fr";
    $("cad-x").onclick = () => this.close();
    if (!readOnly) { $("cad-stl").onclick = () => this.exportSTL(); $("cad-slide").onclick = () => this.toSlide(); }
    try { await loadScripts(CDN); } catch (e) { $("cad-msg").textContent = tr("cadNeedsNet"); return; }
    this.init3D();
    this.rebuild();
    this.side();
  },

  close() {
    if (this.three) { cancelAnimationFrame(this.three.raf); this.three.renderer.dispose(); this.three = null; }
    $("cad").classList.add("hidden"); $("cad").innerHTML = "";
  },

  init3D() {
    const host = $("cad3d"), w = host.clientWidth, h = host.clientHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(devicePixelRatio); renderer.setSize(w, h); host.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0xf2f4f8);
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 1000); camera.position.set(6, 6, 8);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 0.7); sun.position.set(5, 10, 7); scene.add(sun);
    const grid = new THREE.GridHelper(20, 40, 0x8899aa, 0xccd3de); scene.add(grid);
    const orbit = new THREE.OrbitControls(camera, renderer.domElement); orbit.target.set(0, 0.5, 0); orbit.update();
    const gizmo = new THREE.TransformControls(camera, renderer.domElement);
    gizmo.addEventListener("dragging-changed", e => orbit.enabled = !e.value);
    gizmo.addEventListener("objectChange", () => this.fromMesh());
    scene.add(gizmo);
    this.three = { renderer, scene, camera, orbit, gizmo, meshes: new Map(), group: new THREE.Group() };
    scene.add(this.three.group);
    this.applySnap();
    // click to select
    let down = null;
    renderer.domElement.addEventListener("pointerdown", e => down = [e.clientX, e.clientY]);
    renderer.domElement.addEventListener("pointerup", e => {
      if (this.readOnly || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4 || gizmo.dragging) return;
      const r = renderer.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster(); ray.setFromCamera({ x: (e.clientX - r.left) / r.width * 2 - 1, y: -(e.clientY - r.top) / r.height * 2 + 1 }, camera);
      const hit = ray.intersectObjects([...this.three.meshes.values()])[0];
      this.select(hit ? hit.object.userData.id : null);
    });
    const onResize = () => { if (!this.three) return; const W2 = host.clientWidth, H2 = host.clientHeight; renderer.setSize(W2, H2); camera.aspect = W2 / H2; camera.updateProjectionMatrix(); };
    addEventListener("resize", onResize);
    const loop = () => { if (!this.three) return; this.three.raf = requestAnimationFrame(loop); renderer.render(scene, camera); };
    loop();
  },

  applySnap() {
    const g = this.three?.gizmo; if (!g) return;
    g.setTranslationSnap(this.snap ? 0.25 : null); g.setRotationSnap(this.snap ? THREE.MathUtils.degToRad(15) : null); g.setScaleSnap(this.snap ? 0.1 : null);
  },

  geometry(p) {
    switch (p.kind) {
      case "box": return new THREE.BoxGeometry(1, 1, 1);
      case "sphere": return new THREE.SphereGeometry(0.5, 40, 24);
      case "cylinder": return new THREE.CylinderGeometry(0.5, 0.5, 1, 40);
      case "cone": return new THREE.ConeGeometry(0.5, 1, 40);
      case "torus": return new THREE.TorusGeometry(0.5, 0.18, 20, 50);
      case "plane": return new THREE.BoxGeometry(2, 0.1, 2);
      case "extrude": {
        const shape = new THREE.Shape(p.points.map(([x, y]) => new THREE.Vector2(x, y)));
        const g = new THREE.ExtrudeGeometry(shape, { depth: p.depth || 1, bevelEnabled: false });
        g.rotateX(-Math.PI / 2);   // sketch lies flat, extrude goes up
        return g;
      }
    }
  },

  rebuild() {
    const t = this.three; if (!t) return;
    t.gizmo.detach();
    for (const m of t.meshes.values()) { t.group.remove(m); m.geometry.dispose(); }
    t.meshes.clear();
    for (const p of this.parts) {
      const m = new THREE.Mesh(this.geometry(p), new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.55, metalness: 0.1 }));
      m.position.fromArray(p.pos); m.rotation.fromArray(p.rot); m.scale.fromArray(p.scale);
      m.userData.id = p.id; t.group.add(m); t.meshes.set(p.id, m);
    }
    if (this.sel && t.meshes.has(this.sel) && !this.readOnly) t.gizmo.attach(t.meshes.get(this.sel));
  },

  fromMesh() {   // gizmo moved a mesh: copy it back into the part
    const p = this.parts.find(x => x.id === this.sel), m = this.three?.meshes.get(this.sel); if (!p || !m) return;
    p.pos = m.position.toArray(); p.rot = [m.rotation.x, m.rotation.y, m.rotation.z]; p.scale = m.scale.toArray();
    this.side(true);
  },

  add(kind, extra) {
    const colors = ["#4f7cff", "#ff8a3d", "#3dbb6f", "#e04f5f", "#9b59b6", "#f1c40f"];
    const p = Object.assign({ id: uid(), kind, pos: [0, kind === "plane" ? 0.05 : 0.5, 0], rot: [0, 0, 0], scale: [1, 1, 1], color: colors[this.parts.length % colors.length] }, extra || {});
    if (kind === "extrude") p.pos = [0, 0, 0];
    this.parts.push(p); this.sel = p.id; this.rebuild(); this.side();
  },

  select(id) { this.sel = id; this.rebuild(); this.side(); },

  side(valuesOnly) {
    const el = $("cadside"); if (!el || this.readOnly) return;
    const p = this.parts.find(x => x.id === this.sel);
    if (valuesOnly && p) { ["x", "y", "z"].forEach((a, i) => { const f = $("cp-" + a); if (f && document.activeElement !== f) f.value = p.pos[i].toFixed(2); }); return; }
    el.innerHTML = `<div class="panel"><h3>+</h3><div class="row">
      ${["box", "sphere", "cylinder", "cone", "torus", "plane"].map(k => `<button class="btn small ghost" data-add="${k}">${tr(k)}</button>`).join("")}</div>
      <div class="row" style="margin-top:6px"><button class="btn small" id="cad-sketch">${tr("sketch")}</button></div></div>
      <div class="panel"><h3>🖐</h3><div class="row">
      <button class="btn small ghost" data-mode="translate">${tr("move")}</button><button class="btn small ghost" data-mode="rotate">${tr("rotate")}</button>
      <button class="btn small ghost" data-mode="scale">${tr("scale")}</button></div>
      <label class="row" style="margin-top:6px"><input type="checkbox" id="cad-snap" ${this.snap ? "checked" : ""}> ${tr("snap")}</label></div>
      <div class="panel props"><h3>${tr("selected")}</h3>${p ? `
      <label>${tr("color")} <input type="color" id="cp-color" value="${p.color}"></label>
      <label>X <input type="number" step="0.25" id="cp-x" value="${p.pos[0].toFixed(2)}" style="width:80px"></label>
      <label>Y <input type="number" step="0.25" id="cp-y" value="${p.pos[1].toFixed(2)}" style="width:80px"></label>
      <label>Z <input type="number" step="0.25" id="cp-z" value="${p.pos[2].toFixed(2)}" style="width:80px"></label>
      <div class="row"><button class="btn small ghost" id="cp-dup">${tr("dup")}</button><button class="btn small danger" id="cp-del">${tr("del")}</button></div>`
      : `<p class="muted">${tr("noneSel")}</p>`}</div>`;
    el.querySelectorAll("[data-add]").forEach(b => b.onclick = () => this.add(b.dataset.add));
    el.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => this.three?.gizmo.setMode(b.dataset.mode));
    $("cad-snap").onchange = e => { this.snap = e.target.checked; this.applySnap(); };
    $("cad-sketch").onclick = () => this.sketch();
    if (p) {
      $("cp-color").oninput = e => { p.color = e.target.value; this.three.meshes.get(p.id).material.color.set(p.color); };
      ["x", "y", "z"].forEach((a, i) => $("cp-" + a).onchange = e => { p.pos[i] = +e.target.value; this.rebuild(); });
      $("cp-dup").onclick = () => { const c = clone(p); c.id = uid(); c.pos[0] += 1.2; this.parts.push(c); this.select(c.id); };
      $("cp-del").onclick = () => { this.parts = this.parts.filter(x => x !== p); this.select(null); };
    }
  },

  // draw a custom 2D outline on a grid, then extrude it into a 3D part
  sketch() {
    const host = $("cad3d"), size = 520, cell = 26;   // 20 x 20 grid, each cell = 0.25 units
    const ov = document.createElement("div"); ov.id = "sketch";
    ov.innerHTML = `<b>${tr("sketchHelp")}</b><canvas width="${size}" height="${size}"></canvas>
      <div class="row">${tr("depth")} <input type="number" id="sk-depth" value="1" step="0.25" min="0.1" style="width:80px">
      <button class="btn" id="sk-ok">${tr("extrude")}</button><button class="btn ghost" id="sk-x">${tr("cancel")}</button></div>`;
    host.appendChild(ov);
    const cv = ov.querySelector("canvas"), g = cv.getContext("2d"); let pts = [], mouse = null;
    const snapPt = e => { const r = cv.getBoundingClientRect(); return [Math.round((e.clientX - r.left) * size / r.width / cell) * cell, Math.round((e.clientY - r.top) * size / r.height / cell) * cell]; };
    const draw = () => {
      g.clearRect(0, 0, size, size); g.strokeStyle = "#dde3ec"; g.lineWidth = 1;
      for (let i = 0; i <= size; i += cell) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, size); g.moveTo(0, i); g.lineTo(size, i); g.stroke(); }
      g.strokeStyle = "#9aa6ba"; g.beginPath(); g.moveTo(size / 2, 0); g.lineTo(size / 2, size); g.moveTo(0, size / 2); g.lineTo(size, size / 2); g.stroke();
      if (!pts.length) return;
      g.fillStyle = "rgba(59,108,240,.18)"; g.strokeStyle = "#3b6cf0"; g.lineWidth = 3;
      g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); if (mouse) g.lineTo(mouse[0], mouse[1]); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = "#3b6cf0"; pts.forEach(p => { g.beginPath(); g.arc(p[0], p[1], 5, 0, 7); g.fill(); });
    };
    const finish = () => {
      if (pts.length < 3) return;
      const unit = 0.25 / cell, points = pts.map(([x, y]) => [(x - size / 2) * unit, (y - size / 2) * unit]);
      ov.remove(); removeEventListener("keydown", key, true);
      this.add("extrude", { points, depth: Math.max(0.1, +$("sk-depth")?.value || 1) });
    };
    const key = e => { if (e.key === "Enter") { e.preventDefault(); finish(); } if (e.key === "Escape") { ov.remove(); removeEventListener("keydown", key, true); } };
    addEventListener("keydown", key, true);
    cv.onclick = e => { pts.push(snapPt(e)); draw(); };
    cv.ondblclick = e => { e.preventDefault(); if (pts.length > 3) pts.pop(); finish(); };
    cv.onmousemove = e => { mouse = snapPt(e); draw(); };
    $("sk-ok").onclick = finish; $("sk-x").onclick = () => { ov.remove(); removeEventListener("keydown", key, true); };
    draw();
  },

  exportSTL() {
    if (!this.three) return;
    const stl = new THREE.STLExporter().parse(this.three.group);
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([stl], { type: "model/stl" }));
    a.download = (lesson()?.name || "model") + ".stl"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },

  toSlide() {
    if (!this.three || !slide()) return;
    this.three.gizmo.detach(); this.three.renderer.render(this.three.scene, this.three.camera);
    const src = this.three.renderer.domElement.toDataURL("image/png");
    Ed.commit();
    if (this.target && slide().objects.includes(this.target)) { this.target.src = src; this.target.scene = clone(this.parts); }
    else {
      const o = { id: uid(), type: "model", src, scene: clone(this.parts), x: 340, y: 120, w: 600, h: 400 };
      slide().objects.push(o); App.sel = o.id;
    }
    this.close(); setTool("select"); Ed.changed();
  }
};

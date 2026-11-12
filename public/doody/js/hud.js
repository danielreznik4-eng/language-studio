// Call of Doody - HUD (Chat 4). Everything about other modules is guarded.
(function () {
  'use strict';
  const COD = window.COD;

  let root = null;
  const E = {};            // element refs
  const cache = new Map(); // el -> last text/html
  const styleCache = new WeakMap(); // separate style values for every element
  let mini = null, miniCtx = null, big = null, bigCtx = null;
  let bigOpen = false;
  let hitTimer = 0, flashTimer = 0, bannerTimer = 0, dmgAlpha = 0;
  let respawnLeft = 0;
  let visTimer = 0;
  const visible = new Set();
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  const feed = [];

  function mk(tag, id, cls, parent) {
    const e = document.createElement(tag);
    if (id) e.id = id;
    if (cls) e.className = cls;
    (parent || root).appendChild(e);
    return e;
  }
  function setText(el, s) { if (cache.get(el) !== s) { cache.set(el, s); el.textContent = s; } }
  function setHtml(el, s) { if (cache.get(el) !== s) { cache.set(el, s); el.innerHTML = s; } }
  function setStyle(el, prop, v) {
    let styles = styleCache.get(el);
    if (!styles) { styles = {}; styleCache.set(el, styles); }
    if (styles[prop] !== v) { styles[prop] = v; el.style[prop] = v; }
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function teamCss(t) { const T = COD.TEAMS && COD.TEAMS[t]; return T ? T.css : '#ccc'; }
  function rarCss(r) { const R = COD.RARITY && COD.RARITY[r]; return R ? R.css : '#fff'; }
  function player() { return COD.player || null; }
  function fmtTime(s) { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function wName(inst) {
    if (!inst) return '';
    try { if (COD.weapons && COD.weapons.displayName) return COD.weapons.displayName(inst); } catch (e) {}
    return (inst.def && inst.def.name) || inst.defId || 'Weapon';
  }

  function build() {
    root = document.getElementById('hud-root');
    if (!root) { root = document.createElement('div'); root.id = 'hud-root'; document.body.appendChild(root); }
    const w = mk('div', 'hud-main', 'hud-wrap');
    root = w; // all children go into the wrapper
    E.wrap = w;

    E.scope = mk('div', 'hud-scope', 'hud-abs');
    E.dmg = mk('div', 'hud-dmg', 'hud-abs');
    const cr = mk('div', 'hud-cross', 'hud-abs');
    for (let i = 0; i < 4; i++) cr.appendChild(document.createElement('i'));
    E.cross = cr;
    E.hit = mk('div', 'hud-hit', 'hud-abs hud-shadow');

    // minimap
    const mm = mk('div', 'hud-mini', 'hud-abs');
    mini = document.createElement('canvas'); mini.width = 170; mini.height = 170; mm.appendChild(mini);
    miniCtx = mini.getContext('2d');
    E.points = mk('div', 'hud-points', 'hud-abs');
    E.ptEls = [];
    ['A', 'B', 'C'].forEach(id => {
      const p = mk('div', null, 'hud-pt', E.points);
      p.appendChild(document.createElement('span')).textContent = id;
      p.appendChild(document.createElement('b'));
      E.ptEls.push(p);
    });

    // top centre
    const top = mk('div', 'hud-top', 'hud-abs hud-shadow');
    E.phase = mk('div', 'hud-phase', '', top);
    E.clock = mk('div', 'hud-clock', '', top);
    E.next = mk('div', 'hud-next', '', top);
    E.lives = mk('div', 'hud-lives', '', top);
    E.captxt = mk('div', 'hud-captxt', '', top);
    const cb = mk('div', 'hud-capbar', '', top);
    E.capfill = document.createElement('b'); cb.appendChild(E.capfill); E.capbar = cb;

    E.feed = mk('div', 'hud-feed', 'hud-abs hud-shadow');

    // weapon box
    const wp = mk('div', 'hud-weap', 'hud-abs hud-shadow');
    E.slots = mk('div', 'hud-slots', '', wp);
    E.slotEls = [];
    for (let i = 0; i < 5; i++) { const s = mk('div', null, 'hud-slot empty', E.slots); E.slotEls.push(s); }
    E.wname = mk('div', 'hud-wname', '', wp);
    E.ammo = mk('div', 'hud-ammo', '', wp);
    E.gren = mk('div', 'hud-gren', '', wp);

    // vitals
    const v = mk('div', 'hud-vitals', 'hud-abs hud-shadow');
    E.plates = mk('div', 'hud-plates', '', v);
    E.pips = [];
    for (let i = 0; i < 4; i++) { const p = mk('div', null, 'hud-pip', E.plates); E.pips.push(p); }
    E.spare = mk('span', null, '', E.plates);
    const hb = mk('div', 'hud-hpbar', '', v);
    E.hpfill = document.createElement('b'); hb.appendChild(E.hpfill);
    E.hptxt = mk('div', 'hud-hptxt', '', hb);
    E.inv = mk('div', 'hud-inv', '', v);

    E.prompt = mk('div', 'hud-prompt', 'hud-abs hud-shadow');
    E.flash = mk('div', 'hud-flash', 'hud-abs hud-shadow');
    E.banner = mk('div', 'hud-banner', 'hud-abs hud-shadow');
    E.resp = mk('div', 'hud-resp', 'hud-abs hud-shadow');
    E.score = mk('div', 'hud-score', 'hud-abs');

    E.bigwrap = mk('div', 'hud-bigmap', 'hud-abs');
    big = document.createElement('canvas'); big.width = 640; big.height = 640; E.bigwrap.appendChild(big);
    bigCtx = big.getContext('2d');
  }

  // ---------- minimap drawing ----------
  function drawMap(ctx, cw, ch, rotate, viewRadius) {
    const p = player();
    const W = COD.world;
    const SIZE = (W && W.SIZE) || 260;
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#0b2540'; ctx.fillRect(0, 0, cw, ch);
    let cx = 0, cz = 0, yaw = 0;
    if (p && p.pos) { if (rotate) { cx = p.pos.x; cz = p.pos.z; } yaw = p.yaw || 0; }
    const s = (Math.min(cw, ch) / 2) / viewRadius; // px per metre
    ctx.save();
    ctx.translate(cw / 2, ch / 2);
    if (rotate) ctx.rotate(yaw);
    ctx.scale(s, s);
    ctx.translate(-cx, -cz);
    if (W && W.minimapCanvas) {
      try { ctx.drawImage(W.minimapCanvas, -SIZE, -SIZE, SIZE * 2, SIZE * 2); } catch (e) {}
    }
    const r = 1 / s; // one pixel in world units
    const dot = (pos, rad, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(pos.x, pos.z, rad * r, 0, 6.283); ctx.fill(); };
    // control points
    const gm = COD.gamemode;
    const pts = (gm && gm.points) || (W && W.controlPoints) || [];
    for (let i = 0; i < pts.length; i++) {
      const pt = pts[i]; if (!pt || !pt.pos) continue;
      const col = (pt.owner >= 0) ? teamCss(pt.owner) : '#cccccc';
      ctx.lineWidth = 2 * r; ctx.strokeStyle = col; ctx.fillStyle = col + '55';
      ctx.beginPath(); ctx.arc(pt.pos.x, pt.pos.z, (pt.radius || 8), 0, 6.283); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.translate(pt.pos.x, pt.pos.z); if (rotate) ctx.rotate(-yaw);
      ctx.fillStyle = '#fff'; ctx.font = 'bold ' + (13 * r) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(pt.id || '?', 0, 0); ctx.restore();
    }
    // chests (unopened)
    const L = COD.loot;
    if (L && L.chests) {
      for (let i = 0; i < L.chests.length; i++) {
        const c = L.chests[i]; if (!c || c.opened || !c.pos) continue;
        dot(c.pos, c.type === 'super' ? 3.5 : 2.5, c.type === 'super' ? '#fbbf24' : '#a3a3a3');
      }
    }
    // vehicles
    const V = COD.vehicles;
    if (V && V.list) {
      for (let i = 0; i < V.list.length; i++) {
        const v = V.list[i]; if (v && v.pos) dot(v.pos, 3, v.type === 'boat' ? '#22d3ee' : '#f97316');
      }
    }
    // actors
    const acts = COD.actors || [];
    for (let i = 0; i < acts.length; i++) {
      const a = acts[i];
      if (!a || a === p || !a.alive || !a.pos) continue;
      const mine = p && a.team === p.team && a.kind !== 'drone';
      if (mine) dot(a.pos, 3.5, teamCss(a.team));
      else if (visible.has(a)) dot(a.pos, 3.5, a.kind === 'drone' ? '#ff00ff' : '#ff3030');
    }
    // player arrow
    if (p && p.pos) {
      ctx.save(); ctx.translate(p.pos.x, p.pos.z);
      ctx.rotate(-yaw); // cancel map rotation on minimap; show heading on big map
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1 * r;
      ctx.beginPath(); ctx.moveTo(0, -7 * r); ctx.lineTo(5 * r, 5 * r); ctx.lineTo(0, 2 * r); ctx.lineTo(-5 * r, 5 * r); ctx.closePath();
      ctx.fill(); ctx.stroke(); ctx.restore();
    }
    ctx.restore();
  }

  // ---------- visibility (throttled LOS for enemy dots) ----------
  function updateVisible() {
    const p = player(); visible.clear();
    if (!p || !p.pos) return;
    const W = COD.world;
    const acts = COD.actors || [];
    COD.eyePos(p, tmpA);
    for (let i = 0; i < acts.length; i++) {
      const a = acts[i];
      if (!a || a === p || !a.alive || !a.pos || a.hidden) continue;
      if (a.team === p.team && a.kind !== 'drone') continue;
      const dx = a.pos.x - p.pos.x, dz = a.pos.z - p.pos.z;
      if (dx * dx + dz * dz > 120 * 120) continue;
      let ok = true;
      if (W && W.lineOfSight) {
        tmpB.copy(a.pos); tmpB.y += (a.kind === 'drone') ? 0 : 1.2;
        try { ok = W.lineOfSight(tmpA, tmpB); } catch (e) { ok = true; }
      }
      if (ok) visible.add(a);
    }
  }

  // ---------- events ----------
  function onDamage(d) {
    const p = player(); if (!p || !d) return;
    if (d.target === p) { dmgAlpha = Math.min(1, dmgAlpha + 0.35 + (d.amount || 0) / 100); }
    if (d.attacker === p && d.target !== p) {
      E.hit.textContent = d.headshot ? '✖' : '✕'; // heavy X / X
      E.hit.className = 'hud-abs hud-shadow show ' + (d.headshot ? 'head' : 'body');
      hitTimer = 0.18;
    }
  }
  function onKill(d) {
    const p = player(); if (!d) return;
    if (d.attacker === p && d.victim !== p) {
      E.hit.textContent = '☠';
      E.hit.className = 'hud-abs hud-shadow show kill';
      hitTimer = 0.5;
    }
    if (d.victim === p) { respawnLeft = (COD.config && COD.config.respawnDelay) || 5; }
    addFeed(d);
  }
  function addFeed(d) {
    const v = d.victim, a = d.attacker;
    if (!v) return;
    let wn = d.weaponId || '';
    try { const df = COD.weapons && COD.weapons.DEFS && COD.weapons.DEFS[wn]; if (df && df.name) wn = df.name; } catch (e) {}
    if (wn === 'drone') wn = 'Drone';
    const row = document.createElement('div'); row.className = 'hud-fi';
    const an = a ? '<span style="color:' + teamCss(a.team) + '">' + esc(a.name || (a.kind === 'drone' ? 'Drone' : '?')) + '</span>' : '';
    const vn = '<span style="color:' + teamCss(v.team) + '">' + esc(v.name || (v.kind === 'drone' ? 'Drone' : '?')) + '</span>';
    row.innerHTML = (a && a !== v ? an : '') + '<em>' + esc(wn || '☠') + (d.headshot ? ' ◎' : '') + '</em>' + vn;
    E.feed.appendChild(row);
    feed.push({ el: row, t: 6 });
    while (E.feed.children.length > 6) { E.feed.removeChild(E.feed.firstChild); feed.shift(); }
  }
  function showBanner(text) {
    E.banner.textContent = text; E.banner.className = 'hud-abs hud-shadow show'; bannerTimer = 3;
  }

  // ---------- scoreboard ----------
  function buildScore() {
    const p = player();
    const gm = COD.gamemode;
    const acts = (COD.actors || []).filter(a => a && a.kind !== 'drone');
    const tc = (COD.config && COD.config.teamCount) || 4;
    let html = '<h2>SCOREBOARD</h2>';
    for (let t = 0; t < tc; t++) {
      const mem = acts.filter(a => a.team === t).sort((a, b) => (b.score || 0) - (a.score || 0));
      if (!mem.length) continue;
      const T = COD.TEAMS[t] || { name: 'Team ' + t, css: '#ccc' };
      let ts = 0; mem.forEach(m => ts += (m.score || 0));
      html += '<div class="hud-st"><table><tr><td class="hud-th" colspan="2" style="color:' + T.css + '">' + esc(T.name) + ' Team</td>' +
        '<th>Kills</th><th>Deaths</th><th>Score</th><th>Lives</th></tr>';
      mem.forEach(m => {
        const lv = m.eliminated ? 'OUT' : (m.lives === Infinity || m.lives === undefined ? '∞' : m.lives);
        html += '<tr class="' + (m === p ? 'me ' : '') + (!m.alive ? 'dead' : '') + '"><td colspan="2">' + esc(m.name || 'Bot') + '</td><td>' + (m.kills || 0) + '</td><td>' + (m.deaths || 0) + '</td><td>' + (m.score || 0) + '</td><td>' + lv + '</td></tr>';
      });
      html += '</table></div>';
    }
    const dr = (COD.actors || []).filter(a => a && a.kind === 'drone' && a.alive).length;
    if (dr) html += '<div style="text-align:center;opacity:.8">Drones alive: ' + dr + '</div>';
    return html;
  }

  // ---------- update ----------
  function update(dt) {
    if (!root) return;
    const running = COD.state && COD.state.running;
    E.wrap.classList.toggle('on', !!running);
    if (!running) return;
    const p = player();
    const inp = COD.input;

    // timers
    if (hitTimer > 0) { hitTimer -= dt; if (hitTimer <= 0) E.hit.className = 'hud-abs hud-shadow'; }
    if (flashTimer > 0) { flashTimer -= dt; if (flashTimer <= 0) E.flash.classList.remove('show'); }
    if (bannerTimer > 0) { bannerTimer -= dt; if (bannerTimer <= 0) E.banner.classList.remove('show'); }
    if (dmgAlpha > 0) { dmgAlpha = Math.max(0, dmgAlpha - dt * 1.5); }
    setStyle(E.dmg, 'opacity', dmgAlpha.toFixed(2));
    for (let i = feed.length - 1; i >= 0; i--) {
      const f = feed[i]; f.t -= dt;
      if (f.t < 0.5) f.el.classList.add('out');
      if (f.t <= 0) { if (f.el.parentNode) f.el.parentNode.removeChild(f.el); feed.splice(i, 1); }
    }

    // M toggles big map, Tab holds scoreboard
    if (inp && inp.pressed && inp.pressed('KeyM')) bigOpen = !bigOpen;
    const showScore = !!(inp && inp.keys && inp.keys['Tab']);
    setStyle(E.score, 'display', showScore ? 'block' : 'none');
    if (showScore) setHtml(E.score, buildScore());
    setStyle(E.bigwrap, 'display', bigOpen ? 'block' : 'none');

    visTimer -= dt;
    if (visTimer <= 0) { visTimer = 0.25; try { updateVisible(); } catch (e) {} }
    try { drawMap(miniCtx, 170, 170, true, 55); } catch (e) {}
    if (bigOpen) { try { drawMap(bigCtx, 640, 640, false, ((COD.world && COD.world.SIZE) || 260)); } catch (e) {} }

    // match info
    const gm = COD.gamemode;
    if (gm) {
      const ph = gm.phase || 1;
      const names = ['', 'PHASE 1 - INFINITE LIVES', 'PHASE 2 - DRONES, 5 LIVES', 'FINAL PHASE - 1 LIFE'];
      setText(E.phase, names[ph] || '');
      setText(E.clock, fmtTime(gm.time || 0));
      setText(E.next, ph < 3 && gm.timeToNextPhase !== undefined ? 'Next phase in ' + fmtTime(gm.timeToNextPhase) : '');
      if (gm.points) {
        for (let i = 0; i < 3; i++) {
          const pt = gm.points[i], el = E.ptEls[i]; if (!pt || !el) continue;
          const col = pt.owner >= 0 ? teamCss(pt.owner) : '#888';
          setStyle(el, 'borderColor', col);
          const bar = el.lastChild;
          setStyle(bar, 'background', pt.capTeam >= 0 ? teamCss(pt.capTeam) : col);
          setStyle(bar, 'width', Math.round(Math.max(0, Math.min(1, pt.progress || 0)) * 100) + '%');
        }
        // capture bar for the point the player stands in
        let inPt = null;
        if (p && p.pos) for (let i = 0; i < gm.points.length; i++) {
          const pt = gm.points[i]; if (!pt || !pt.pos) continue;
          const dx = p.pos.x - pt.pos.x, dz = p.pos.z - pt.pos.z;
          if (dx * dx + dz * dz < (pt.radius || 8) * (pt.radius || 8)) { inPt = pt; break; }
        }
        if (inPt) {
          const own = inPt.owner >= 0 ? COD.TEAMS[inPt.owner].name : 'nobody';
          setText(E.captxt, 'Point ' + inPt.id + ' - held by ' + own);
          setStyle(E.captxt, 'display', 'block'); setStyle(E.capbar, 'display', 'block');
          setStyle(E.capfill, 'width', Math.round((inPt.progress || 0) * 100) + '%');
          setStyle(E.capfill, 'background', inPt.capTeam >= 0 ? teamCss(inPt.capTeam) : '#fff');
        } else { setStyle(E.captxt, 'display', 'none'); setStyle(E.capbar, 'display', 'none'); }
      }
    }
    if (!p) return;

    // lives
    if (p.eliminated) setText(E.lives, 'ELIMINATED');
    else setText(E.lives, 'Lives: ' + (p.lives === Infinity || p.lives === undefined ? '∞' : p.lives));

    // vitals
    const hpPct = Math.max(0, Math.min(100, (p.hp / (p.maxHp || 100)) * 100));
    setStyle(E.hpfill, 'width', hpPct + '%');
    setStyle(E.hpfill, 'background', hpPct > 60 ? '#22c55e' : hpPct > 30 ? '#eab308' : '#ef4444');
    setText(E.hptxt, Math.ceil(Math.max(0, p.hp)));
    const worn = Math.ceil((p.armor || 0) / 25 - 1e-6);
    for (let i = 0; i < 4; i++) E.pips[i].classList.toggle('on', i < worn);
    setText(E.spare, '  +' + (p.plates || 0) + ' spare');
    setText(E.inv, '✚ ' + (p.medkits || 0) + '   ● Gold ' + (p.gold || 0));

    // weapon
    const inst = COD.currentWeapon ? COD.currentWeapon(p) : null;
    for (let i = 0; i < 5; i++) {
      const w = p.weapons && p.weapons[i], el = E.slotEls[i];
      setText(el, w ? (i + 1) + ' ' + wName(w) : (i + 1) + ' -');
      setStyle(el, 'color', w ? rarCss(w.rarity) : '#fff');
      el.classList.toggle('sel', i === p.weaponIndex);
      el.classList.toggle('empty', !w);
    }
    if (inst) {
      setText(E.wname, wName(inst) + (inst.reloading ? ' (reloading)' : ''));
      setStyle(E.wname, 'color', rarCss(inst.rarity));
      const t = inst.def && inst.def.ammoType;
      const res = t && p.ammo ? p.ammo[t] : 0;
      const mag = inst.stats && inst.stats.magSize;
      setHtml(E.ammo, (inst.ammoInMag === undefined ? '-' : inst.ammoInMag) + ' <small>/ ' + (res === undefined ? 0 : res) + (mag ? '' : '') + '</small>');
    } else { setText(E.wname, ''); setHtml(E.ammo, ''); }
    const gc = p.grenades ? p.grenades.length : 0;
    setText(E.gren, gc ? '● Grenades x' + gc + (p.grenades.length ? ' (' + (COD.RARITY[p.grenades[p.grenades.length - 1]] || { name: '' }).name + ')' : '') : '');

    // crosshair / scope
    const ads = p.fp ? p.fp.ads : 0;
    const scoped = !!(p.fp && p.fp.scoped);
    const mortarOpen = COD.mortar && COD.mortar.isOpen;
    setStyle(E.cross, 'display', (ads > 0.3 || scoped || !p.alive || mortarOpen) ? 'none' : 'block');
    setStyle(E.scope, 'display', scoped ? 'block' : 'none');

    // respawn / eliminated
    if (!p.alive) {
      if (p.eliminated) {
        setHtml(E.resp, 'ELIMINATED<small>Spectating your team</small>');
      } else {
        respawnLeft = Math.max(0, respawnLeft - dt);
        setHtml(E.resp, 'YOU DIED<small>Respawning in ' + Math.ceil(respawnLeft) + '...</small>');
      }
      setStyle(E.resp, 'display', 'block');
    } else setStyle(E.resp, 'display', 'none');
  }

  // ---------- public ----------
  function setPrompt(text) {
    if (!E.prompt) return;
    if (text) { setText(E.prompt, text); setStyle(E.prompt, 'display', 'block'); }
    else setStyle(E.prompt, 'display', 'none');
  }
  function flash(text) {
    if (!E.flash) return;
    E.flash.textContent = text; E.flash.classList.add('show'); flashTimer = 2;
  }

  function init() {
    build();
    COD.on('damage', onDamage);
    COD.on('kill', onKill);
    COD.on('spawn', d => { if (d && d.actor === player()) { respawnLeft = 0; } });
    COD.on('message', d => { if (d && d.text) showBanner(d.text); });
    COD.on('pointCaptured', d => {
      if (d && d.point && d.team >= 0) flash('Point ' + d.point.id + ' captured by ' + COD.TEAMS[d.team].name);
    });
    COD.on('phase', d => {
      if (!d) return;
      showBanner(d.phase === 1 ? 'PHASE 1' : d.phase === 2 ? 'PHASE 2 - DRONES INCOMING' : 'FINAL PHASE - ONE LIFE');
    });
    COD.on('gameOver', d => {
      if (d && COD.TEAMS[d.winner]) showBanner(COD.TEAMS[d.winner].name.toUpperCase() + ' TEAM WINS');
    });
    COD.on('chestOpened', d => { if (d && d.actor === player()) flash('Chest opened'); });
  }

  COD.hud = { init: init, update: update, setPrompt: setPrompt, flash: flash };
})();

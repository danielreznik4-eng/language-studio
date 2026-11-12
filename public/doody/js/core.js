/* Call of Doody - core.js : shared names, events, actors, damage, interactables, sfx */
(function () {
  'use strict';

  // Colour pipeline: linear working space, sRGB output (set on the renderer in main.js)
  if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;

  const COD = window.COD = window.COD || {};

  COD.config = { gfx: 'high', teamSize: 5, teamCount: 4, mode: 'normal', phaseTimes: [0, 300, 1200], captureTime: 8, respawnDelay: 5 };
  COD.state = { running: false, uiMode: false, time: 0, cameraOverride: null };
  COD.scene = null; COD.camera = null; COD.renderer = null;
  COD.actors = [];
  COD.player = null;

  COD.TEAMS = [
    { name: 'Blue',  color: 0x3b82f6, css: '#3b82f6' },
    { name: 'Red',   color: 0xef4444, css: '#ef4444' },
    { name: 'Green', color: 0x22c55e, css: '#22c55e' },
    { name: 'Gold',  color: 0xeab308, css: '#eab308' }
  ];
  COD.RARITY = [
    { name: 'Common',    mult: 1.0, color: 0xb0b0b0, css: '#b0b0b0' },
    { name: 'Uncommon',  mult: 1.2, color: 0x3ecf5a, css: '#3ecf5a' },
    { name: 'Rare',      mult: 1.4, color: 0x3b8cff, css: '#3b8cff' },
    { name: 'Epic',      mult: 1.6, color: 0xa855f7, css: '#a855f7' },
    { name: 'Legendary', mult: 1.8, color: 0xf59e0b, css: '#f59e0b' }
  ];
  COD.AMMO_TYPES = ['pistol', 'smg', 'rifle', 'shell', 'sniper', 'rocket', 'mortar'];
  COD.START_AMMO = { pistol: 500, smg: 500, rifle: 500, shell: 500, sniper: 500, rocket: 2, mortar: 1 };

  // ---------------------------------------------------------------- events
  const handlers = {};
  COD.on = function (name, fn) { (handlers[name] || (handlers[name] = [])).push(fn); };
  COD.off = function (name, fn) {
    const l = handlers[name]; if (!l) return;
    const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1);
  };
  COD.emit = function (name, data) {
    const l = handlers[name]; if (!l) return;
    const copy = l.slice();
    for (let i = 0; i < copy.length; i++) {
      try { copy[i](data || {}); } catch (e) { console.error('[COD] handler error for "' + name + '"', e); }
    }
  };

  // ---------------------------------------------------------------- helpers
  COD.rand = function (a, b) { return a + Math.random() * (b - a); };
  COD.randInt = function (a, b) { return Math.floor(a + Math.random() * (b - a + 1)); };
  COD.pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  COD.clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };
  COD.lerp = function (a, b, t) { return a + (b - a) * t; };
  COD.dist2D = function (a, b) {
    const pa = a.pos || a, pb = b.pos || b;
    const dx = pa.x - pb.x, dz = pa.z - pb.z;
    return Math.sqrt(dx * dx + dz * dz);
  };
  COD.sameTeam = function (a, b) {
    if (!a || !b) return false;
    return a.team >= 0 && a.team === b.team;
  };
  COD.forward = function (yaw, pitch, out) {
    const cp = Math.cos(pitch);
    out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
    return out;
  };
  COD.currentWeapon = function (actor) {
    if (!actor || !actor.weapons) return null;
    return actor.weapons[actor.weaponIndex] || null;
  };
  COD.eyePos = function (actor, out) {
    out = out || new THREE.Vector3();
    out.copy(actor.pos);
    if (actor.kind !== 'drone') out.y += actor.height - 0.1;
    return out;
  };

  // ---------------------------------------------------------------- actors
  let nextId = 1;
  COD.makeActor = function (opts) {
    opts = opts || {};
    const kind = opts.kind || 'bot';
    const drone = kind === 'drone';
    return {
      id: nextId++, kind: kind, name: opts.name || kind, team: drone ? -1 : (opts.team != null ? opts.team : 0),
      pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0,
      radius: drone ? 0.6 : 0.4, height: drone ? 0.6 : 1.8,
      hp: 100, maxHp: 100, armor: 0, plates: 0, medkits: 0, gold: 0,
      alive: true, lives: Infinity, eliminated: false, god: false,
      hidden: null, vehicle: null,
      weapons: [], weaponIndex: 0,
      ammo: Object.assign({}, COD.START_AMMO),
      grenades: [],
      crouching: false, sprinting: false, onGround: true,
      fp: { ads: 0, scoped: false },
      kills: 0, deaths: 0, score: 0,
      mesh: null
    };
  };

  COD.wearPlate = function (actor) {
    if (!actor || actor.plates <= 0 || actor.armor >= 100) return false;
    actor.plates--;
    actor.armor = Math.min(100, actor.armor + 25);
    COD.sfx('pickup');
    return true;
  };
  COD.useMedkit = function (actor) {
    if (!actor || actor.medkits <= 0 || actor.hp >= actor.maxHp || !actor.alive) return false;
    actor.medkits--;
    actor.hp = actor.maxHp;
    COD.sfx('pickup');
    return true;
  };

  // ---------------------------------------------------------------- combat
  COD.combat = {
    damage: function (target, amount, info) {
      info = info || {};
      if (!target || !target.alive || target.god || !(amount > 0)) return false;
      const attacker = info.attacker || null;
      if (attacker && attacker !== target && COD.sameTeam(attacker, target)) return false;
      if (attacker && attacker === target) amount *= 0.5;

      let hpDmg = amount;
      if (target.armor > 0) {
        const absorbed = Math.min(target.armor, amount);
        target.armor -= absorbed;
        hpDmg = amount - absorbed;
      }
      target.hp -= hpDmg;
      COD.emit('damage', { target: target, attacker: attacker, amount: amount, headshot: !!info.headshot, weaponId: info.weaponId, point: info.point });

      if (target.hp <= 0) {
        target.hp = 0;
        target.alive = false;
        target.deaths++;
        if (attacker && attacker !== target) {
          attacker.kills++;
          attacker.score += 100 + (info.headshot ? 50 : 0);
        }
        COD.sfx('death', target.pos);
        COD.emit('kill', { victim: target, attacker: attacker, weaponId: info.weaponId, headshot: !!info.headshot });
      }
      return true;
    }
  };

  // ---------------------------------------------------------------- interactables
  const interactables = [];
  COD.interact = {
    add: function (it) {
      if (it.enabled === undefined) it.enabled = true;
      if (it.radius === undefined) it.radius = 2.5;
      interactables.push(it);
      return it;
    },
    remove: function (it) {
      const i = interactables.indexOf(it);
      if (i >= 0) interactables.splice(i, 1);
    },
    nearest: function (actor) {
      if (!actor) return null;
      let best = null, bestD = Infinity;
      const p = actor.pos;
      for (let i = 0; i < interactables.length; i++) {
        const it = interactables[i];
        const en = typeof it.enabled === 'function' ? it.enabled(actor) : it.enabled;
        if (!en || !it.pos) continue;
        const dx = it.pos.x - p.x, dz = it.pos.z - p.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d > it.radius || Math.abs(it.pos.y - p.y) > 4) continue;
        if (d < bestD) { bestD = d; best = it; }
      }
      return best;
    },
    list: interactables
  };

  // ---------------------------------------------------------------- sound (WebAudio synth)
  let ac = null, master = null, noiseBuf = null;
  function audio() {
    if (ac) return ac;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain(); master.gain.value = 0.4; master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ac = null; }
    return ac;
  }
  COD.audioResume = function () { const a = audio(); if (a && a.state === 'suspended') a.resume(); };

  function noise(t0, dur, vol, freq, q, type) {
    const src = ac.createBufferSource(); src.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq; f.Q.value = q || 0.7;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.02);
  }
  function tone(t0, dur, vol, f0, f1, wave) {
    const o = ac.createOscillator(); o.type = wave || 'sine';
    o.frequency.setValueAtTime(f0, t0);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  const lastPlayed = {};
  let engineT = 0;
  COD.sfx = function (name, pos) {
    const a = audio();
    if (!a || a.state === 'suspended') { if (a && a.state === 'suspended') a.resume(); if (!a || a.state !== 'running') return; }
    // distance attenuation for positional sounds
    let vol = 1;
    if (pos && COD.camera) {
      const cp = COD.camera.position;
      const dx = pos.x - cp.x, dy = pos.y - cp.y, dz = pos.z - cp.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      vol = 1 / (1 + d * 0.04);
      if (vol < 0.03) return;
    }
    const now = a.currentTime;
    if (lastPlayed[name] && now - lastPlayed[name] < 0.025) return; // rate limit
    lastPlayed[name] = now;
    try {
      switch (name) {
        case 'shot': noise(now, 0.12, 0.7 * vol, 2800, 0.8); tone(now, 0.09, 0.4 * vol, 180, 60, 'square'); break;
        case 'shotgun': noise(now, 0.28, 0.9 * vol, 1800, 0.6); tone(now, 0.2, 0.5 * vol, 110, 40, 'sawtooth'); break;
        case 'sniper': noise(now, 0.4, 0.9 * vol, 1400, 0.5); tone(now, 0.3, 0.6 * vol, 90, 30, 'sawtooth'); break;
        case 'explosion': noise(now, 1.1, 1.0 * vol, 700, 0.5); tone(now, 0.8, 0.8 * vol, 80, 25, 'sine'); break;
        case 'reload': tone(now, 0.05, 0.3 * vol, 900, 500, 'square'); tone(now + 0.35, 0.06, 0.3 * vol, 500, 900, 'square'); noise(now + 0.2, 0.05, 0.2 * vol, 3000, 1, 'highpass'); break;
        case 'hit': tone(now, 0.06, 0.35 * vol, 1200, 800, 'square'); break;
        case 'headshot': tone(now, 0.09, 0.45 * vol, 1800, 1100, 'square'); tone(now + 0.04, 0.08, 0.3 * vol, 2400, 1500, 'sine'); break;
        case 'glass': noise(now, 0.35, 0.6 * vol, 6000, 1, 'highpass'); tone(now, 0.15, 0.2 * vol, 3000, 1500, 'triangle'); break;
        case 'chest': tone(now, 0.12, 0.3 * vol, 300, 200, 'square'); tone(now + 0.1, 0.25, 0.3 * vol, 500, 900, 'triangle'); break;
        case 'pickup': tone(now, 0.08, 0.3 * vol, 600, 900, 'sine'); tone(now + 0.07, 0.1, 0.3 * vol, 900, 1200, 'sine'); break;
        case 'engine':
          if (now - engineT < 0.1) return; engineT = now;
          tone(now, 0.12, 0.12 * vol, 70, 60, 'sawtooth'); break;
        case 'capture': tone(now, 0.15, 0.35 * vol, 520, 520, 'triangle'); tone(now + 0.15, 0.15, 0.35 * vol, 660, 660, 'triangle'); tone(now + 0.3, 0.3, 0.35 * vol, 880, 880, 'triangle'); break;
        case 'death': tone(now, 0.5, 0.4 * vol, 300, 60, 'sawtooth'); break;
        case 'drone': tone(now, 0.2, 0.15 * vol, 400, 320, 'sawtooth'); break;
        default: break;
      }
    } catch (e) { /* audio must never break the game */ }
  };
})();

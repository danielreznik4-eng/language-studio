// loot.js - chests, loot rolls, give(), ground pickups, upgrade stations. Owner: Chat 7.
(function () {
  'use strict';
  const COD = window.COD;

  const UPGRADE_COST = [150, 300, 600, 1200]; // cost to go from rarity i -> i+1
  const NORMAL_WEIGHTS = [15, 35, 35, 12, 3];
  const SUPER_WEIGHTS = [0, 0, 10, 55, 35];
  const CHEST_STYLE = {
    normal: { body: 0x7a4a22, trim: 0x3a2410, name: 'Chest' },
    armor:  { body: 0x2f7d3a, trim: 0x173f1d, name: 'Armor crate' },
    super:  { body: 0xe0b020, trim: 0x7a5a00, name: 'SUPER CHEST' },
    custom: { body: 0x2a62c8, trim: 0x12295a, name: 'Special chest' },
  };

  let root = null;       // THREE.Group for everything we add
  const chests = [];
  const pickups = [];
  const stations = [];
  const geo = {};
  const matCache = {};
  let panel = null, panelState = null;

  function mat(color, emissive) {
    const k = color + '_' + (emissive || 0);
    if (!matCache[k]) {
      matCache[k] = new THREE.MeshStandardMaterial({ color: color, roughness: 0.7, metalness: 0.2,
        emissive: emissive || 0x000000, emissiveIntensity: emissive ? 0.6 : 0 });
    }
    return matCache[k];
  }

  // ---------- rolling ----------
  function rollRarity(weights) {
    let total = 0, i;
    for (i = 0; i < weights.length; i++) total += weights[i];
    let r = Math.random() * total;
    for (i = 0; i < weights.length; i++) { r -= weights[i]; if (r < 0) return i; }
    return weights.length - 1;
  }
  function normalWeaponIds() {
    const W = COD.weapons;
    if (!W || !W.LIST) return [];
    return W.LIST.filter(function (id) { const d = W.DEFS[id]; return d && d.cls !== 'rpg' && d.cls !== 'mortar'; });
  }
  function rollWeapon(weights) {
    const ids = normalWeaponIds();
    return { kind: 'weapon', defId: COD.pick(ids), rarity: rollRarity(weights || NORMAL_WEIGHTS) };
  }
  function ammoFor(defId, amount) {
    const d = COD.weapons && COD.weapons.DEFS[defId];
    return { kind: 'ammo', ammoType: d ? d.ammoType : 'rifle', amount: amount };
  }

  function rollChest(type) {
    const items = [];
    let w, i;
    if (type === 'normal') {
      w = rollWeapon(NORMAL_WEIGHTS);
      items.push(w, ammoFor(w.defId, COD.randInt(60, 150)));
      items.push({ kind: 'gold', amount: COD.randInt(20, 60) });
    } else if (type === 'armor') {
      items.push({ kind: 'plates', amount: 16 }, { kind: 'medkit', amount: 1 });
    } else if (type === 'super') {
      for (i = 0; i < 2; i++) {
        w = rollWeapon(SUPER_WEIGHTS);
        items.push(w, ammoFor(w.defId, COD.randInt(80, 200)));
      }
      items.push({ kind: 'gold', amount: COD.randInt(300, 600) });
      items.push({ kind: 'ammo', ammoType: 'rocket', amount: COD.randInt(1, 2) });
      items.push({ kind: 'ammo', ammoType: 'mortar', amount: COD.randInt(1, 2) });
    } else { // custom
      const r = Math.floor(Math.random() * 3), rar = COD.randInt(0, 4);
      if (r === 0) items.push({ kind: 'grenade', rarity: rar, amount: 3 });
      else if (r === 1) items.push({ kind: 'weapon', defId: 'rpg', rarity: rar }, { kind: 'ammo', ammoType: 'rocket', amount: 2 });
      else items.push({ kind: 'weapon', defId: 'mortar', rarity: rar }, { kind: 'ammo', ammoType: 'mortar', amount: 2 });
    }
    return items;
  }

  // ---------- giving ----------
  function weaponScore(inst) {
    return inst.rarity * 100 + (inst.def ? (inst.def.damage || 0) * (inst.def.rpm || 60) / 600 : 0);
  }
  function describe(item) {
    switch (item.kind) {
      case 'weapon': {
        const d = COD.weapons && COD.weapons.DEFS[item.defId];
        return COD.RARITY[item.rarity].name + ' ' + (d ? d.name : item.defId);
      }
      case 'ammo': return '+' + item.amount + ' ' + item.ammoType + ' ammo';
      case 'gold': return '+' + item.amount + ' gold';
      case 'plates': return '+' + item.amount + ' armor plates';
      case 'medkit': return '+' + item.amount + ' medkit';
      case 'grenade': return item.amount + 'x ' + COD.RARITY[item.rarity].name + ' grenade';
    }
    return '?';
  }

  function give(actor, item) {
    if (!actor || !item) return false;
    let ok = true;
    switch (item.kind) {
      case 'weapon': ok = giveWeapon(actor, item.defId, item.rarity, item.inst); break;
      case 'ammo': actor.ammo[item.ammoType] = (actor.ammo[item.ammoType] || 0) + item.amount; break;
      case 'gold': actor.gold = (actor.gold || 0) + item.amount; break;
      case 'plates':
        actor.plates = (actor.plates || 0) + item.amount;
        for (let i = 0; i < 4; i++) { if (!COD.wearPlate || !COD.wearPlate(actor)) break; }
        break;
      case 'medkit': actor.medkits = (actor.medkits || 0) + item.amount; break;
      case 'grenade':
        for (let g = 0; g < item.amount; g++) actor.grenades.push(item.rarity);
        break;
      default: ok = false;
    }
    if (ok) COD.emit('pickup', { actor: actor, item: item });
    return ok;
  }

  function giveWeapon(actor, defId, rarity, existing) {
    const W = COD.weapons;
    if (!W) return false;
    const ws = actor.weapons;
    const def = W.DEFS[defId];
    // special single-copy weapons: upgrade rarity instead of carrying two
    if (def && (def.cls === 'rpg' || def.cls === 'mortar')) {
      for (let i = 0; i < ws.length; i++) {
        if (ws[i].defId === defId) {
          if (rarity > ws[i].rarity) { ws[i].rarity = rarity; W.refresh(ws[i]); }
          return true;
        }
      }
    }
    const inst = existing || W.create(defId, rarity);
    if (ws.length < 5) { ws.push(inst); return true; }
    if (actor.kind === 'player') { spawnPickup(inst, actor.pos); return true; }
    // bot: replace worst weapon if the new one is better
    let worst = 0;
    for (let j = 1; j < ws.length; j++) if (weaponScore(ws[j]) < weaponScore(ws[worst])) worst = j;
    if (weaponScore(inst) > weaponScore(ws[worst])) { ws[worst] = inst; return true; }
    return false;
  }

  // ---------- chests ----------
  function sRGB(t) { t.encoding = THREE.sRGBEncoding; return t; }
  function woodTex(base) {
    const k = 'wood' + base;
    if (geo[k]) return geo[k];
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const x = c.getContext('2d');
    const r = (base >> 16) & 255, g = (base >> 8) & 255, b = base & 255;
    for (let i = 0; i < 6; i++) {
      const sh = 0.82 + Math.random() * 0.3;
      x.fillStyle = 'rgb(' + Math.min(255, r * sh | 0) + ',' + Math.min(255, g * sh | 0) + ',' + Math.min(255, b * sh | 0) + ')';
      x.fillRect(0, i * 21.4, 128, 22);
      x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(0, i * 21.4, 128, 1.5);
    }
    for (let n = 0; n < 160; n++) {
      x.fillStyle = 'rgba(0,0,0,' + Math.random() * 0.12 + ')';
      x.fillRect(Math.random() * 128, Math.random() * 128, 10 + Math.random() * 30, 1);
    }
    return (geo[k] = sRGB(new THREE.CanvasTexture(c)));
  }
  function beamTex() {
    if (geo.beamTex) return geo.beamTex;
    const c = document.createElement('canvas'); c.width = 8; c.height = 128;
    const x = c.getContext('2d');
    const gr = x.createLinearGradient(0, 128, 0, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 8, 128);
    return (geo.beamTex = sRGB(new THREE.CanvasTexture(c)));
  }
  function glowMat(color, opacity) {
    return new THREE.MeshBasicMaterial({ color: color, map: beamTex(), transparent: true, opacity: opacity,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true });
  }
  function shadowize(o, on) {
    o.traverse(function (m) { if (m.isMesh && !(m.material && m.material.transparent)) m.castShadow = on; });
  }
  function highGfx() { return !COD.config || COD.config.gfx !== 'low'; }

  const BEAM_COLOR = { normal: 0xffc766, armor: 0x44ff88, super: 0xffd633, custom: 0x55aaff };

  function buildChestMesh(type) {
    const st = CHEST_STYLE[type] || CHEST_STYLE.normal;
    const g = new THREE.Group();
    const body = new THREE.Group(); g.add(body);
    const sup = type === 'super';
    const woodM = new THREE.MeshStandardMaterial({ map: woodTex(st.body), roughness: sup ? 0.3 : 0.8, metalness: sup ? 0.7 : 0.0 });
    const iron = sup ? new THREE.MeshStandardMaterial({ color: 0xf5c518, roughness: 0.25, metalness: 0.95 })
      : new THREE.MeshStandardMaterial({ color: 0x2d3036, roughness: 0.45, metalness: 0.85 });
    // body
    const base = new THREE.Mesh(geo.cBody, woodM); base.position.y = 0.25; body.add(base);
    const inside = new THREE.Mesh(geo.cInside, mat(0x1a1008)); inside.position.y = 0.47; body.add(inside);
    [-0.36, 0.36].forEach(function (x) {
      const b = new THREE.Mesh(geo.cBand, iron); b.position.set(x, 0.25, 0); body.add(b);
    });
    [[-0.5, -0.3], [0.5, -0.3], [-0.5, 0.3], [0.5, 0.3]].forEach(function (p) {
      const cb = new THREE.Mesh(geo.cCorner, iron); cb.position.set(p[0], 0.25, p[1]); body.add(cb);
    });
    const foot = new THREE.Mesh(geo.cFoot, iron); foot.position.set(0, 0.03, 0); body.add(foot);
    // lid (hinge at back-top edge)
    const lid = new THREE.Group(); lid.position.set(0, 0.5, -0.3); g.add(lid);
    const arch = new THREE.Mesh(geo.cArch, woodM); arch.position.z = 0.3; lid.add(arch);
    const lidBottom = new THREE.Mesh(geo.cLidBottom, mat(0x1a1008)); lidBottom.position.set(0, 0.01, 0.3); lid.add(lidBottom);
    [-0.36, 0.36].forEach(function (x) {
      const lb = new THREE.Mesh(geo.cLidBand, iron); lb.position.set(x, 0, 0.3); lid.add(lb);
    });
    const plate = new THREE.Mesh(geo.cPlate, iron); plate.position.set(0, -0.04, 0.62); lid.add(plate);
    const lockM = new THREE.MeshStandardMaterial({ color: sup ? 0xff4444 : 0xd4af37, roughness: 0.3, metalness: 0.9,
      emissive: sup ? 0x660000 : 0x000000, emissiveIntensity: 0.8 });
    const lock = new THREE.Mesh(geo.cLock, lockM); lock.position.set(0, -0.14, 0.65); lid.add(lock);
    const shackle = new THREE.Mesh(geo.cShackle, iron); shackle.position.set(0, -0.06, 0.65); lid.add(shackle);
    if (sup) {
      const jewels = [0xff3355, 0x33aaff, 0x33ff88];
      for (let j = 0; j < 3; j++) {
        const jw = new THREE.Mesh(geo.cJewel, new THREE.MeshStandardMaterial({ color: jewels[j], emissive: jewels[j], emissiveIntensity: 0.7, roughness: 0.1, metalness: 0.2 }));
        jw.position.set(-0.28 + j * 0.28, 0.27, 0.35); lid.add(jw);
      }
      // coins inside (hidden while closed)
      const coinM = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.25, metalness: 0.95, emissive: 0x6a4a00, emissiveIntensity: 0.5 });
      const heap = new THREE.Mesh(geo.cHeap, coinM); heap.position.set(0, 0.42, 0); heap.scale.set(1, 0.5, 0.7); body.add(heap);
      for (let k = 0; k < 14; k++) {
        const co = new THREE.Mesh(geo.cCoin, coinM);
        co.position.set((Math.random() - 0.5) * 0.7, 0.55 + Math.random() * 0.04, (Math.random() - 0.5) * 0.35);
        co.rotation.set(Math.random() * 0.8, Math.random() * 3, Math.random() * 0.8);
        body.add(co);
      }
    }
    const big = sup ? 1.25 : 1;
    g.scale.setScalar(big);
    // glow beam + ground ring while closed
    const bc = BEAM_COLOR[type] || 0xffffff;
    const beam = new THREE.Mesh(geo.beam, glowMat(bc, sup ? 0.5 : 0.32));
    beam.position.y = sup ? 1.9 : 1.5; beam.scale.setScalar(1 / big); g.add(beam);
    const ring = new THREE.Mesh(geo.glowRing, new THREE.MeshBasicMaterial({ color: bc, transparent: true, opacity: 0.45,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; g.add(ring);
    shadowize(g, highGfx());
    g.userData.lid = lid; g.userData.beam = beam; g.userData.ring = ring;
    return g;
  }

  function addChest(spot) {
    const c = { type: spot.type || 'normal', pos: spot.pos.clone(), yaw: spot.yaw || 0, opened: false,
      mesh: null, lidAngle: 0, lidTarget: 0, it: null };
    c.mesh = buildChestMesh(c.type);
    c.mesh.position.copy(c.pos);
    c.mesh.rotation.y = c.yaw;
    root.add(c.mesh);
    const st = CHEST_STYLE[c.type] || CHEST_STYLE.normal;
    c.it = COD.interact.add({ pos: c.pos, radius: 2.5, enabled: true,
      prompt: function () { return 'Open ' + st.name.toLowerCase().replace('super chest', 'SUPER CHEST'); },
      onUse: function (actor) { open(c, actor); } });
    chests.push(c);
    return c;
  }

  function open(chest, actor) {
    if (!chest || chest.opened) return null;
    chest.opened = true;
    chest.lidTarget = -1.9;
    if (chest.mesh.userData.beam) { chest.mesh.userData.beam.visible = false; chest.mesh.userData.ring.visible = false; }
    if (chest.it) chest.it.enabled = false;
    const items = rollChest(chest.type);
    const shown = [];
    for (let i = 0; i < items.length; i++) {
      give(actor, items[i]);
      if (items[i].kind !== 'ammo' || chest.type === 'normal') shown.push(describe(items[i]));
    }
    COD.sfx('chest', chest.pos);
    COD.emit('chestOpened', { chest: chest, actor: actor, items: items });
    if (actor === COD.player && COD.hud && COD.hud.flash) COD.hud.flash(shown.join('  |  '));
    return items;
  }

  function restockAll() {
    for (let i = 0; i < chests.length; i++) {
      const c = chests[i];
      c.opened = false; c.lidTarget = 0;
      if (c.mesh.userData.beam) { c.mesh.userData.beam.visible = true; c.mesh.userData.ring.visible = true; }
      if (c.it) c.it.enabled = true;
    }
  }

  // ---------- ground pickups ----------
  function spawnPickup(inst, near, exact) {
    const p = { inst: inst, pos: new THREE.Vector3(near.x + (exact ? 0 : COD.rand(-0.6, 0.6)), 0, near.z + (exact ? 0 : COD.rand(-0.6, 0.6))),
      mesh: new THREE.Group(), t: Math.random() * 6, it: null, baseY: 0 };
    const gy = COD.world ? COD.world.heightAt(p.pos.x, p.pos.z) : near.y;
    p.baseY = Math.max(gy, near.y - 0.5) + 0.5;
    p.pos.y = p.baseY - 0.5;
    const col = COD.RARITY[inst.rarity].color;
    const gun = new THREE.Group(); p.mesh.add(gun);
    if (COD.viewmodel && COD.viewmodel.buildWeaponMesh) {
      try {
        const m = COD.viewmodel.buildWeaponMesh(inst.def ? inst.def.cls : 'pistol', inst.rarity);
        m.scale.setScalar(1.4); gun.add(m);
      } catch (e) { gun.add(new THREE.Mesh(geo.fallbackGun, mat(col))); }
    } else gun.add(new THREE.Mesh(geo.fallbackGun, mat(col)));
    if (highGfx()) shadowize(gun, true);
    const ring = new THREE.Mesh(geo.ring, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = -0.45; p.mesh.add(ring);
    const pbeam = new THREE.Mesh(geo.pbeam, glowMat(col, 0.35)); pbeam.position.y = 0.4; p.mesh.add(pbeam);
    p.gun = gun; p.ring = ring; p.beam = pbeam;
    p.mesh.position.set(p.pos.x, p.baseY, p.pos.z);
    root.add(p.mesh);
    p.it = COD.interact.add({ pos: p.pos, radius: 2.2, enabled: true,
      prompt: function () { return 'Pick up ' + (COD.weapons ? COD.weapons.displayName(p.inst) : 'weapon'); },
      onUse: function (actor) { usePickup(p, actor); } });
    pickups.push(p);
    return p;
  }

  function removePickup(p) {
    COD.interact.remove(p.it);
    root.remove(p.mesh);
    const i = pickups.indexOf(p);
    if (i >= 0) pickups.splice(i, 1);
  }

  function usePickup(p, actor) {
    const ws = actor.weapons;
    const pos = p.pos.clone(); pos.y = p.baseY;
    removePickup(p);
    if (ws.length < 5) {
      ws.push(p.inst);
      actor.weaponIndex = ws.length - 1;
    } else {
      const idx = Math.min(actor.weaponIndex || 0, ws.length - 1);
      const old = ws[idx];
      ws[idx] = p.inst;
      spawnPickup(old, pos);
    }
    COD.sfx('pickup', pos);
    COD.emit('swap', { actor: actor });
    COD.emit('pickup', { actor: actor, item: { kind: 'weapon', defId: p.inst.defId, rarity: p.inst.rarity, inst: p.inst } });
  }

  // ---------- upgrades ----------
  function upgradeCost(inst) { return inst.rarity >= 4 ? null : UPGRADE_COST[inst.rarity]; }

  function upgrade(actor, inst, free) {
    if (!inst || inst.rarity >= 4) return false;
    const cost = UPGRADE_COST[inst.rarity];
    if (!free) {
      if ((actor.gold || 0) < cost) return false;
      actor.gold -= cost;
    }
    inst.rarity++;
    COD.weapons.refresh(inst);
    COD.sfx('pickup');
    return true;
  }

  function attach(actor, inst, slot, key, free) {
    const A = COD.weapons && COD.weapons.ATTACHMENTS;
    if (!inst || !A || !A[slot] || !A[slot][key]) return false;
    if (inst[slot] === key) return false;
    const cost = A[slot][key].cost || 0;
    if (!free) {
      if ((actor.gold || 0) < cost) return false;
      actor.gold -= cost;
    }
    inst[slot] = key;
    COD.weapons.refresh(inst);
    COD.sfx('pickup');
    return true;
  }

  function holoTex() {
    if (geo.holoTex) return geo.holoTex;
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(255,170,30,0.12)'; x.fillRect(0, 0, 256, 128);
    x.strokeStyle = 'rgba(255,190,60,0.95)'; x.lineWidth = 4; x.strokeRect(4, 4, 248, 120);
    x.fillStyle = 'rgba(255,200,80,1)'; x.font = 'bold 40px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('UPGRADE', 128, 44);
    x.font = 'bold 20px Arial'; x.fillText('RARITY  -  SCOPES  -  MAGS', 128, 88);
    x.fillStyle = 'rgba(255,200,80,0.18)';
    for (let y = 0; y < 128; y += 4) x.fillRect(0, y, 256, 1);
    return (geo.holoTex = sRGB(new THREE.CanvasTexture(c)));
  }
  function buildStationMesh() {
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0x4a515d, roughness: 0.45, metalness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.6, metalness: 0.6 });
    const top = new THREE.MeshStandardMaterial({ color: 0x9aa3b0, roughness: 0.25, metalness: 0.9 });
    const glowM = new THREE.MeshStandardMaterial({ color: 0xffaa22, emissive: 0xffaa22, emissiveIntensity: 1.2, roughness: 0.4 });
    const bench = new THREE.Mesh(geo.bench, steel); bench.position.y = 0.5; g.add(bench);
    const topM = new THREE.Mesh(geo.benchTop, top); topM.position.y = 1.05; g.add(topM);
    [-1, 1].forEach(function (s) {
      const strip = new THREE.Mesh(geo.strip, glowM); strip.position.set(s * 0.91, 0.5, 0.41); g.add(strip);
      const foot = new THREE.Mesh(geo.stFoot, dark); foot.position.set(s * 0.8, 0.05, 0); g.add(foot);
    });
    const vice = new THREE.Mesh(geo.vice, dark); vice.position.set(-0.6, 1.18, 0.1); g.add(vice);
    const rack = new THREE.Mesh(geo.rackBoard, dark); rack.position.set(0, 1.55, -0.38); g.add(rack);
    for (let i = 0; i < 4; i++) {
      const tool = new THREE.Mesh(geo.tool, top); tool.position.set(-0.45 + i * 0.3, 1.55, -0.33); tool.rotation.z = (i % 2 ? 0.3 : -0.2); g.add(tool);
    }
    const proj = new THREE.Mesh(geo.projector, dark); proj.position.set(0.5, 1.13, 0.05); g.add(proj);
    const lens = new THREE.Mesh(geo.projLens, glowM); lens.position.set(0.5, 1.2, 0.05); g.add(lens);
    const holo = new THREE.Mesh(geo.holo, new THREE.MeshBasicMaterial({ map: holoTex(), transparent: true, opacity: 0.85,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true }));
    holo.position.set(0, 2.45, -0.1); g.add(holo);
    const beamUp = new THREE.Mesh(geo.projBeam, glowMat(0xffaa22, 0.3)); beamUp.position.set(0.5, 1.7, 0.05); g.add(beamUp);
    const orbit = new THREE.Mesh(geo.orbit, glowM); orbit.position.set(0, 1.5, 0.15); g.add(orbit);
    shadowize(g, highGfx());
    g.userData.holo = holo; g.userData.orbit = orbit; g.userData.beam = beamUp;
    return g;
  }

  function addStation(spot) {
    const s = { pos: spot.pos.clone(), yaw: spot.yaw || 0, mesh: buildStationMesh(), it: null };
    s.mesh.position.copy(s.pos); s.mesh.rotation.y = s.yaw;
    root.add(s.mesh);
    s.it = COD.interact.add({ pos: s.pos, radius: 3, enabled: true, prompt: 'Use upgrade station',
      onUse: function (actor) { openPanel(actor); } });
    stations.push(s);
  }

  // ---------- upgrade panel ----------
  function injectCss() {
    if (document.getElementById('loot-style')) return;
    const st = document.createElement('style');
    st.id = 'loot-style';
    st.textContent =
      '#loot-panel{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:460px;max-height:86vh;overflow:auto;' +
      'background:rgba(12,14,20,.94);border:2px solid #f59e0b;border-radius:10px;color:#eee;font:15px Arial,sans-serif;padding:16px 20px;' +
      'pointer-events:auto;display:none;z-index:50}' +
      '#loot-panel h2{margin:0 0 4px;color:#f59e0b;font-size:22px}' +
      '#loot-panel .loot-gold{color:#facc15;font-weight:bold;margin-bottom:8px}' +
      '#loot-panel .loot-wep{font-size:18px;font-weight:bold;margin:6px 0 10px}' +
      '#loot-panel h3{margin:12px 0 4px;font-size:14px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px}' +
      '#loot-panel button{display:block;width:100%;text-align:left;margin:4px 0;padding:8px 10px;background:#1f2937;color:#eee;' +
      'border:1px solid #4b5563;border-radius:6px;cursor:pointer;font-size:14px}' +
      '#loot-panel button:hover:not(:disabled){background:#374151;border-color:#f59e0b}' +
      '#loot-panel button:disabled{opacity:.45;cursor:default}' +
      '#loot-panel button.loot-on{border-color:#3ecf5a;background:#143320}' +
      '#loot-panel .loot-close{text-align:center;margin-top:12px;background:#7f1d1d}' +
      '#loot-panel .loot-msg{color:#f87171;min-height:18px;margin-top:6px}';
    document.head.appendChild(st);
  }

  function ensurePanel() {
    if (panel) return;
    injectCss();
    panel = document.createElement('div');
    panel.id = 'loot-panel';
    (document.getElementById('ui-root') || document.body).appendChild(panel);
    window.addEventListener('keydown', function (e) {
      if (panelState && (e.code === 'Escape')) closePanel();
    });
  }

  function openPanel(actor) {
    ensurePanel();
    panelState = { actor: actor, msg: '' };
    if (COD.input && COD.input.setUIMode) COD.input.setUIMode(true);
    renderPanel();
    panel.style.display = 'block';
  }

  function closePanel() {
    if (!panelState) return;
    panelState = null;
    panel.style.display = 'none';
    if (COD.input && COD.input.setUIMode) COD.input.setUIMode(false);
  }

  function renderPanel() {
    if (!panelState) return;
    const actor = panelState.actor;
    const inst = COD.currentWeapon(actor);
    const W = COD.weapons;
    panel.innerHTML = '';
    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    panel.appendChild(el('h2', '', 'UPGRADE STATION'));
    panel.appendChild(el('div', 'loot-gold', 'Gold: ' + (actor.gold || 0)));
    if (!inst || !W) {
      panel.appendChild(el('div', 'loot-wep', 'No weapon in hand.'));
    } else {
      const w = el('div', 'loot-wep', W.displayName(inst));
      w.style.color = COD.RARITY[inst.rarity].css;
      panel.appendChild(w);
      function btn(label, enabled, on, fn) {
        const b = el('button', on ? 'loot-on' : '', label);
        b.disabled = !enabled;
        b.addEventListener('click', function () { fn(); renderPanel(); });
        panel.appendChild(b);
      }
      // rarity
      panel.appendChild(el('h3', '', 'Rarity'));
      const cost = upgradeCost(inst);
      if (cost == null) btn('Maximum rarity (Legendary)', false, true, function () {});
      else btn('Upgrade to ' + COD.RARITY[inst.rarity + 1].name + ' - ' + cost + ' gold', (actor.gold || 0) >= cost, false,
        function () { if (!upgrade(actor, inst)) panelState.msg = 'Not enough gold.'; else panelState.msg = ''; });
      // attachments
      const A = W.ATTACHMENTS || {};
      const cls = inst.def && inst.def.cls;
      if (cls !== 'rpg' && cls !== 'mortar') {
        [['scope', 'Scope'], ['mag', 'Magazine']].forEach(function (pair) {
          const slot = pair[0], group = A[slot];
          if (!group) return;
          panel.appendChild(el('h3', '', pair[1]));
          Object.keys(group).forEach(function (key) {
            const a = group[key];
            const equipped = inst[slot] === key;
            const price = a.cost || 0;
            btn((a.name || key) + (equipped ? '  (equipped)' : ' - ' + price + ' gold'),
              !equipped && (actor.gold || 0) >= price, equipped,
              function () { if (!attach(actor, inst, slot, key)) panelState.msg = 'Not enough gold.'; else panelState.msg = ''; });
          });
        });
      }
    }
    panel.appendChild(el('div', 'loot-msg', panelState.msg));
    const c = el('button', 'loot-close', 'Close (Esc)');
    c.addEventListener('click', closePanel);
    panel.appendChild(c);
  }

  // ---------- module ----------
  function init() {
    geo.cBody = new THREE.BoxGeometry(1.0, 0.5, 0.6);
    geo.cInside = new THREE.BoxGeometry(0.9, 0.02, 0.5);
    geo.cBand = new THREE.BoxGeometry(0.09, 0.52, 0.64);
    geo.cCorner = new THREE.BoxGeometry(0.1, 0.54, 0.1);
    geo.cFoot = new THREE.BoxGeometry(1.06, 0.06, 0.66);
    { const ag = new THREE.CylinderGeometry(0.3, 0.3, 1.0, 14, 1, false, 0, Math.PI); ag.rotateZ(Math.PI / 2); geo.cArch = ag; }
    geo.cLidBottom = new THREE.BoxGeometry(1.0, 0.03, 0.6);
    { const lg = new THREE.CylinderGeometry(0.315, 0.315, 0.09, 14, 1, false, 0, Math.PI); lg.rotateZ(Math.PI / 2); geo.cLidBand = lg; }
    geo.cPlate = new THREE.BoxGeometry(0.16, 0.2, 0.03);
    geo.cLock = new THREE.BoxGeometry(0.1, 0.1, 0.05);
    geo.cShackle = new THREE.TorusGeometry(0.04, 0.012, 6, 10);
    geo.cJewel = new THREE.OctahedronGeometry(0.06);
    geo.cHeap = new THREE.SphereGeometry(0.4, 12, 8);
    geo.cCoin = new THREE.CylinderGeometry(0.06, 0.06, 0.012, 10);
    geo.beam = new THREE.CylinderGeometry(0.32, 0.45, 3.0, 12, 1, true);
    geo.pbeam = new THREE.CylinderGeometry(0.12, 0.25, 1.6, 10, 1, true);
    geo.glowRing = new THREE.RingGeometry(0.55, 0.95, 28);
    geo.ring = new THREE.RingGeometry(0.35, 0.55, 24);
    geo.fallbackGun = new THREE.BoxGeometry(0.1, 0.15, 0.6);
    geo.bench = new THREE.BoxGeometry(1.8, 1.0, 0.8);
    geo.benchTop = new THREE.BoxGeometry(2.0, 0.1, 0.95);
    geo.strip = new THREE.BoxGeometry(0.04, 0.7, 0.02);
    geo.stFoot = new THREE.BoxGeometry(0.25, 0.1, 0.9);
    geo.vice = new THREE.BoxGeometry(0.3, 0.2, 0.25);
    geo.rackBoard = new THREE.BoxGeometry(1.6, 0.6, 0.06);
    geo.tool = new THREE.BoxGeometry(0.06, 0.45, 0.04);
    geo.projector = new THREE.CylinderGeometry(0.14, 0.18, 0.12, 12);
    geo.projLens = new THREE.CylinderGeometry(0.07, 0.07, 0.04, 12);
    geo.holo = new THREE.PlaneGeometry(1.8, 0.9);
    geo.projBeam = new THREE.CylinderGeometry(0.05, 0.22, 1.1, 10, 1, true);
    geo.orbit = new THREE.TorusGeometry(0.28, 0.018, 6, 28);
    root = new THREE.Group();
    root.name = 'loot-root';
    COD.scene.add(root);

    const W = COD.world || {};
    (W.chestSpots || []).forEach(addChest);
    (W.stationSpots || []).forEach(addStation);
    COD.on('phase', restockAll);
    COD.on('matchStart', function () { if (panelState) closePanel(); });
    COD.on('kill', function (d) { if (panelState && d.victim === panelState.actor) closePanel(); });
    restockAll();
  }

  function update(dt) {
    const t = COD.state.time;
    for (let i = 0; i < chests.length; i++) {
      const c = chests[i];
      if (Math.abs(c.lidAngle - c.lidTarget) > 0.001) {
        c.lidAngle += (c.lidTarget - c.lidAngle) * Math.min(1, dt * 8);
        c.mesh.userData.lid.rotation.x = c.lidAngle;
      }
      if (!c.opened) {
        const ud = c.mesh.userData, base = c.type === 'super' ? 0.5 : 0.32;
        ud.beam.material.opacity = base * (0.75 + 0.25 * Math.sin(t * 2.2 + i));
        ud.ring.material.opacity = 0.35 + 0.15 * Math.sin(t * 2.2 + i);
      }
    }
    for (let j = 0; j < pickups.length; j++) {
      const p = pickups[j];
      p.t += dt;
      p.mesh.position.y = p.baseY + Math.sin(p.t * 2) * 0.08;
      if (p.gun) p.gun.rotation.y += dt * 1.2;
      if (p.ring) { const k = 1 + 0.12 * Math.sin(p.t * 3); p.ring.scale.set(k, k, 1); p.ring.rotation.z += dt; }
      if (p.beam) p.beam.material.opacity = 0.3 + 0.1 * Math.sin(p.t * 3);
    }
    for (let k = 0; k < stations.length; k++) {
      const ud = stations[k].mesh.userData;
      ud.holo.material.opacity = 0.75 + 0.15 * Math.sin(t * 7 + k) * Math.sin(t * 1.3);
      ud.holo.position.y = 2.45 + Math.sin(t * 1.5 + k) * 0.04;
      ud.orbit.rotation.x += dt * 1.4; ud.orbit.rotation.y += dt * 0.9;
      ud.orbit.position.y = 1.5 + Math.sin(t * 2 + k) * 0.06;
      ud.beam.material.opacity = 0.22 + 0.08 * Math.sin(t * 4);
    }
    if (panelState && panelState.actor.alive === false) closePanel();
  }

  COD.loot = {
    init: init, update: update,
    chests: chests, pickups: pickups, stations: stations,
    UPGRADE_COST: UPGRADE_COST,
    rollWeapon: rollWeapon, rollChest: rollChest,
    give: give, open: open, restockAll: restockAll,
    spawnPickup: spawnPickup, upgrade: upgrade, attach: attach, upgradeCost: upgradeCost,
    openPanel: openPanel, closePanel: closePanel, describe: describe,
  };
})();

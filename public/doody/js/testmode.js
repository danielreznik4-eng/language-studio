// Call of Doody - Test Mode menu (Chat 4). Active only when COD.config.mode === 'test'.
(function () {
  'use strict';
  const COD = window.COD;

  let menu = null, status = null, badge = null, open = false;
  let selWeapon = null, selRarity = 0, selGrenRarity = 0;
  let godBtn = null;

  function active() { return COD.config && COD.config.mode === 'test'; }
  function P() { return COD.player; }
  function say(t) { if (status) status.textContent = t; if (COD.hud && COD.hud.flash) COD.hud.flash(t); }

  function ahead(dist) {
    const p = P(); const v = new THREE.Vector3();
    v.set(-Math.sin(p.yaw) * dist, 0, -Math.cos(p.yaw) * dist).add(p.pos);
    if (COD.world && COD.world.heightAt) v.y = Math.max(COD.world.heightAt(v.x, v.z), p.pos.y - 1);
    return v;
  }

  function giveWeapon(defId, rarity) {
    const p = P(); if (!p) return;
    const item = { kind: 'weapon', defId: defId, rarity: rarity };
    if (COD.loot && COD.loot.give) { COD.loot.give(p, item); }
    else if (COD.weapons && p.weapons.length < 5) { p.weapons.push(COD.weapons.create(defId, rarity)); }
    else { say('Cannot give weapon (loot missing / slots full)'); return; }
    say('Gave ' + COD.RARITY[rarity].name + ' ' + defId);
  }

  function fillAmmo() {
    const p = P(); if (!p) return;
    COD.AMMO_TYPES.forEach(t => { p.ammo[t] = Math.max(p.ammo[t] || 0, (t === 'rocket' || t === 'mortar') ? 20 : 999); });
    say('Ammo filled (999, rare ammo 20)');
  }
  function addAmmo(t) {
    const p = P(); if (!p) return;
    p.ammo[t] = (p.ammo[t] || 0) + ((t === 'rocket' || t === 'mortar') ? 10 : 500);
    say('+ ' + t + ' ammo');
  }

  function spawnVehicle(type) {
    const p = P();
    if (!COD.vehicles || !COD.vehicles.spawn) { say('Vehicles module missing'); return; }
    const pos = ahead(type === 'boat' ? 12 : 7);
    if (type === 'boat' && COD.world && COD.world.isWater && !COD.world.isWater(pos.x, pos.z)) { say('Boat needs water: stand near the shore'); }
    COD.vehicles.spawn(type, pos, p.yaw);
    say('Spawned ' + type);
  }

  function spawnDrone() {
    if (!COD.drones || !COD.drones.spawnDrone) { say('Drones module missing'); return; }
    const pos = ahead(12); pos.y = P().pos.y + 10;
    COD.drones.spawnDrone(pos); say('Spawned a drone');
  }

  function setPhase(n) {
    if (COD.gamemode && COD.gamemode.setPhase) { COD.gamemode.setPhase(n); say('Phase ' + n); }
    else say('Gamemode missing');
  }

  function tp(pos, label) {
    const p = P(); if (!p || !pos) return;
    if (p.vehicle && COD.vehicles) COD.vehicles.exit(p, true);
    if (p.hidden && COD.buildings) COD.buildings.leaveHiding(p);
    p.pos.set(pos.x, pos.y + 0.3, pos.z); p.vel.set(0, 0, 0);
    p.pitch = 0;
    say('Teleported to ' + label);
  }
  // Locate bank / museum from super-chest positions (4 = bank, 3 = museum).
  function superGroups() {
    const spots = ((COD.world && COD.world.chestSpots) || []).filter(s => s.type === 'super');
    if (!spots.length) return null;
    const groups = [];
    spots.forEach(s => {
      let g = groups.find(gr => gr.c.distanceTo(s.pos) < 40);
      if (!g) { g = { c: s.pos.clone(), items: [] }; groups.push(g); }
      g.items.push(s);
    });
    let bank = groups.find(g => g.items.length === 4), mus = groups.find(g => g.items.length === 3);
    if (!bank) bank = groups[0]; if (!mus) mus = groups[1] || groups[0];
    return { bank: bank.items[0].pos, museum: mus.items[0].pos };
  }
  function tpPoint(i) {
    const pts = (COD.gamemode && COD.gamemode.points) || (COD.world && COD.world.controlPoints) || [];
    if (!pts[i]) { say('Point missing'); return; }
    tp(pts[i].pos, 'point ' + pts[i].id);
  }
  function tpLandmark(which) {
    const g = superGroups();
    if (!g) { say('Chest spots not ready'); return; }
    tp(g[which], which);
  }

  function upgradeHeld(max) {
    const p = P(); const inst = COD.currentWeapon && COD.currentWeapon(p);
    if (!inst) { say('No weapon held'); return; }
    const gold = p.gold; p.gold = 1e7;
    try {
      if (COD.loot && COD.loot.upgrade) {
        COD.loot.upgrade(p, inst);
        if (max) {
          for (let i = 0; i < 4; i++) COD.loot.upgrade(p, inst);
          if (COD.loot.attach) {
            const A = COD.weapons && COD.weapons.ATTACHMENTS;
            if (A && A.scope) COD.loot.attach(p, inst, 'scope', A.scope.sniper ? 'sniper' : (A.scope.acog ? 'acog' : 'reddot'));
            if (A && A.mag) COD.loot.attach(p, inst, 'mag', 'drum');
          }
        }
      } else {
        inst.rarity = max ? 4 : Math.min(4, inst.rarity + 1);
        if (COD.weapons && COD.weapons.refresh) COD.weapons.refresh(inst);
      }
    } finally { p.gold = gold; }
    say('Upgraded to ' + COD.RARITY[inst.rarity].name);
  }

  // ---------- UI helpers ----------
  function el(tag, parent, text, cls) {
    const e = document.createElement(tag);
    if (text) e.textContent = text;
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }
  function btn(parent, text, fn) {
    const b = el('button', parent, text);
    b.addEventListener('click', e => { e.stopPropagation(); try { fn(b); } catch (err) { say('Error: ' + err.message); } });
    return b;
  }
  function section(title) { el('h3', menu, title); return el('div', menu, '', 'test-row'); }
  function select(parent, opts, onChange) {
    const s = el('select', parent);
    opts.forEach(o => { const op = el('option', s, o.label); op.value = o.value; });
    s.addEventListener('change', () => onChange(s.value));
    return s;
  }

  function buildMenu() {
    const ui = document.getElementById('ui-root') || document.body;
    badge = el('div', ui, 'TEST MODE - press T for the cheat menu'); badge.id = 'test-badge';
    menu = el('div', ui); menu.id = 'test-menu';
    menu.addEventListener('mousedown', e => e.stopPropagation());
    el('h2', menu, 'TEST MODE');
    const x = btn(menu, 'Close (T / Esc)', closeMenu); x.className = 'test-x';

    // weapons
    let row = section('Give weapon');
    const ids = (COD.weapons && COD.weapons.LIST) || [];
    selWeapon = ids[0] || null;
    const wsel = select(row, ids.map(i => ({ value: i, label: i })), v => { selWeapon = v; });
    select(row, COD.RARITY.map((r, i) => ({ value: i, label: r.name })), v => { selRarity = +v; });
    btn(row, 'Give', () => { if (selWeapon) giveWeapon(selWeapon, selRarity); else say('No weapons loaded'); });
    menu._wsel = wsel;

    row = section('Ammo');
    btn(row, 'Fill ALL ammo', fillAmmo);
    COD.AMMO_TYPES.forEach(t => btn(row, '+ ' + t, () => addAmmo(t)));

    row = section('Grenades');
    select(row, COD.RARITY.map((r, i) => ({ value: i, label: r.name })), v => { selGrenRarity = +v; });
    btn(row, '+1 grenade', () => { P().grenades.push(selGrenRarity); say('+1 ' + COD.RARITY[selGrenRarity].name + ' grenade'); });
    btn(row, '+5 grenades', () => { for (let i = 0; i < 5; i++) P().grenades.push(selGrenRarity); say('+5 grenades'); });

    row = section('Gold, armor, health');
    btn(row, '+1000 gold', () => { P().gold += 1000; say('+1000 gold'); });
    btn(row, '+10000 gold', () => { P().gold += 10000; say('+10000 gold'); });
    btn(row, '+4 plates', () => { P().plates += 4; say('+4 plates'); });
    btn(row, '+16 plates', () => { P().plates += 16; say('+16 plates'); });
    btn(row, 'Wear 4 plates now', () => { const p = P(); p.armor = 100; say('Armor full'); });
    btn(row, '+3 medkits', () => { P().medkits += 3; say('+3 medkits'); });
    btn(row, 'Heal full', () => { P().hp = P().maxHp; say('Healed'); });
    godBtn = btn(row, 'God mode: OFF', b => { const p = P(); p.god = !p.god; b.textContent = 'God mode: ' + (p.god ? 'ON' : 'OFF'); b.classList.toggle('on', p.god); say('God mode ' + (p.god ? 'on' : 'off')); });

    row = section('Vehicles and drones');
    btn(row, 'Spawn car', () => spawnVehicle('car'));
    btn(row, 'Spawn boat', () => spawnVehicle('boat'));
    btn(row, 'Spawn drone', spawnDrone);

    row = section('Phase');
    btn(row, 'Phase 1 (infinite lives)', () => setPhase(1));
    btn(row, 'Phase 2 (drones, 5 lives)', () => setPhase(2));
    btn(row, 'Phase 3 (1 life)', () => setPhase(3));

    row = section('Teleport');
    btn(row, 'Bank', () => tpLandmark('bank'));
    btn(row, 'Museum', () => tpLandmark('museum'));
    btn(row, 'Point A', () => tpPoint(0));
    btn(row, 'Point B', () => tpPoint(1));
    btn(row, 'Point C', () => tpPoint(2));

    row = section('World and weapon');
    btn(row, 'Restock all chests', () => { if (COD.loot && COD.loot.restockAll) { COD.loot.restockAll(); say('Chests restocked'); } else say('Loot module missing'); });
    btn(row, 'Free upgrade held weapon', () => upgradeHeld(false));
    btn(row, 'Max upgrade held weapon', () => upgradeHeld(true));

    status = el('div', menu, 'Ready.'); status.id = 'test-status';
  }

  function openMenu() {
    if (!menu || open || COD.state.uiMode || (COD.gamemode && COD.gamemode.over)) return;
    // refresh weapon list in case weapons loaded late
    const ids = (COD.weapons && COD.weapons.LIST) || [];
    if (menu._wsel && menu._wsel.options.length !== ids.length) {
      menu._wsel.innerHTML = '';
      ids.forEach(i => { const o = el('option', menu._wsel, i); o.value = i; });
      selWeapon = ids[0] || null;
    }
    open = true; menu.classList.add('open');
    if (COD.input && COD.input.setUIMode) COD.input.setUIMode(true);
  }
  function closeMenu() {
    if (!menu || !open) return;
    open = false; menu.classList.remove('open');
    if (COD.input && COD.input.setUIMode) COD.input.setUIMode(false);
  }

  function init() {
    if (!active()) return;
    buildMenu();
    window.addEventListener('keydown', e => {
      if (e.code === 'Escape' && open) closeMenu();
    });
  }

  function update() {
    if (!menu || !active()) return;
    const run = COD.state && COD.state.running;
    badge.style.display = run ? 'block' : 'none';
    if (!run) return;
    const inp = COD.input;
    if (inp && inp.pressed && inp.pressed('KeyT')) { if (open) closeMenu(); else openMenu(); }
    if (godBtn && P()) {
      const t = 'God mode: ' + (P().god ? 'ON' : 'OFF');
      if (godBtn.textContent !== t) { godBtn.textContent = t; godBtn.classList.toggle('on', !!P().god); }
    }
  }

  COD.testmode = { init: init, update: update, open: openMenu, close: closeMenu };
})();

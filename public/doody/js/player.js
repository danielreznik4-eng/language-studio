/* Call of Doody - player.js (Chat 5)
   COD.player (the actor) + COD.playerCtl (controller: movement, camera, weapons, use keys). */
(function () {
  'use strict';
  const COD = window.COD;
  const V3 = THREE.Vector3;

  const WALK = 5, SPRINT = 8, CROUCH = 2.5, SWIM = 2.5, GRAV = 22, JUMP = 6.8, SENS = 0.0022;
  const STAND_H = 1.8, CROUCH_H = 1.1;

  let P = null;
  const tmpO = new V3(), tmpD = new V3(), tmpDelta = new V3(), tmpUp = new V3(), tmpPos = new V3();
  const S = {
    camEye: 1.7, bobT: 0, recoilP: 0, recoilY: 0, landDip: 0, roll: 0,
    wasAlive: true, deadT: 0, swapT: 0, grenCd: 0, vault: null,
    blockedT: 0, blockedRef: null, lastPrompt: undefined, hideT: 0, prevHidden: null,
    loadout: false, specIdx: 0, wasGround: true, prevVy: 0, needReset: false
  };

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function key(c) { const i = COD.input; return !!(i && i.keys && i.keys[c]); }
  function pressed(c) { const i = COD.input; return !!(i && i.pressed && i.pressed(c)); }

  function setPrompt(txt) {
    if (txt === S.lastPrompt) return;
    S.lastPrompt = txt;
    if (COD.hud && COD.hud.setPrompt) COD.hud.setPrompt(txt);
  }

  function giveLoadout() {
    if (!COD.weapons || !COD.weapons.create) return;
    P.weapons.length = 0;
    P.weapons.push(COD.weapons.create('ar_m4', 0));
    P.weapons.push(COD.weapons.create('pistol_m9', 0));
    P.weaponIndex = 0;
    P.grenades.length = 0;
    P.grenades.push(0, 0);
    S.loadout = true;
  }

  function resetForSpawn() {
    P.vel.set(0, 0, 0);
    P.fp.ads = 0; P.fp.scoped = false;
    P.crouching = false; P.sprinting = false; P.height = STAND_H;
    S.camEye = STAND_H - 0.1; S.deadT = 0; S.vault = null; S.swapT = 0;
    S.recoilP = S.recoilY = S.landDip = S.roll = 0;
    P.pitch = 0;
    const len = Math.hypot(P.pos.x, P.pos.z);
    if (len > 5) P.yaw = Math.atan2(P.pos.x / len, P.pos.z / len); // face the island centre
    for (let i = 0; i < P.weapons.length; i++) if (P.weapons[i]) P.weapons[i].reloading = false;
    S.needReset = false;
  }

  function init() {
    P = COD.makeActor({ kind: 'player', team: 0, name: 'You' });
    COD.player = P;
    COD.actors.push(P);
    if (COD.camera) COD.camera.rotation.order = 'YXZ';
    giveLoadout();
    COD.on('fire', function (d) {
      if (!d || d.actor !== P) return;
      const r = d.inst && d.inst.stats ? d.inst.stats.recoil : 1;
      const k = Math.min(r || 1, 10) * 0.0045 * (1 - 0.4 * P.fp.ads);
      S.recoilP += k;
      P.pitch = Math.min(1.45, P.pitch + k * 0.5);
      S.recoilY += (Math.random() - 0.5) * k * 0.8;
    });
    COD.on('spawn', function (d) { if (d && d.actor === P) S.needReset = true; });
  }

  // ---------- helpers ----------
  function zoomOf(inst) {
    if (!inst) return 1;
    const c = inst.def && inst.def.cls;
    if (c === 'mortar') return 1;
    return clamp((inst.stats && inst.stats.zoom) || (inst.def && inst.def.adsZoom) || 1, 1, 10);
  }

  function look(dt, ui, inst) {
    const inp = COD.input;
    if (ui || !inp || !inp.mouse || (inp.locked === false && !inp.touchActive)) return;
    const m = inp.mouse;
    const s = SENS / (1 + (zoomOf(inst) - 1) * P.fp.ads * 0.85);
    P.yaw -= m.dx * s;
    P.pitch -= m.dy * s;
    P.pitch = clamp(P.pitch, -1.45, 1.45);
    if (P.yaw > Math.PI) P.yaw -= 2 * Math.PI; else if (P.yaw < -Math.PI) P.yaw += 2 * Math.PI;
  }

  function selectWeapon(i) {
    if (i === P.weaponIndex || !P.weapons[i] || S.swapT > 0.12) return;
    const old = P.weapons[P.weaponIndex];
    if (old) old.reloading = false;
    P.weaponIndex = i;
    S.swapT = 0.4;
    P.fp.ads = 0; P.fp.scoped = false;
    COD.emit('swap', { actor: P });
  }

  function handleSwapKeys(ui) {
    if (ui) return;
    if (pressed('KeyQ')) { dropWeapon(); return; }
    for (let i = 0; i < 5; i++) if (pressed('Digit' + (i + 1))) { selectWeapon(i); return; }
    const w = COD.input && COD.input.mouse ? COD.input.mouse.wheel : 0;
    const n = P.weapons.length;
    if (w && n > 1) {
      const dir = w > 0 ? 1 : -1;
      selectWeapon((P.weaponIndex + dir + n) % n);
    }
  }

  function dropWeapon() {
    const inst = COD.currentWeapon(P);
    if (!inst || !COD.loot || !COD.loot.spawnPickup) return;
    COD.eyePos(P, tmpO);
    COD.forward(P.yaw, 0, tmpD);
    const hit = COD.world && COD.world.raycast ? COD.world.raycast(tmpO, tmpD, 1.5) : null;
    const distance = hit ? Math.max(0, hit.dist - 0.75) : 1.5;
    tmpPos.copy(P.pos).addScaledVector(tmpD, distance);
    // Keep the complete instance: rarity, attachments and loaded rounds survive pickup.
    COD.loot.spawnPickup(inst, tmpPos, true);
    inst.reloading = false;
    P.weapons.splice(P.weaponIndex, 1);
    P.weaponIndex = Math.max(0, Math.min(P.weaponIndex, P.weapons.length - 1));
    P.fp.ads = 0; P.fp.scoped = false;
    S.swapT = 0.4;
    COD.emit('swap', { actor: P });
    if (COD.hud) COD.hud.flash('Dropped ' + COD.weapons.displayName(inst) + ' - E to pick up');
  }

  function startReload(inst) {
    if (!inst || inst.reloading || !COD.weapons) return;
    const mag = inst.stats ? inst.stats.magSize : inst.def.magSize;
    if (inst.ammoInMag >= mag) return;
    if ((P.ammo[inst.def.ammoType] || 0) <= 0) return;
    COD.weapons.reload(P, inst);
  }

  function handleWeapon(dt, ui, inst, canAct) {
    const m = COD.input && COD.input.mouse ? COD.input.mouse : { left: false, right: false, leftPressed: false };
    const cls = inst && inst.def && inst.def.cls;
    // ADS
    let wantAds = !ui && canAct && !!inst && m.right && !P.sprinting && S.swapT < 0.2 && !S.vault && cls !== 'mortar';
    const target = wantAds ? 1 : 0;
    const step = dt / 0.16;
    P.fp.ads = P.fp.ads < target ? Math.min(target, P.fp.ads + step) : Math.max(target, P.fp.ads - step * 1.3);
    P.fp.scoped = !!inst && P.fp.ads > 0.9 && (inst.scope === 'sniper' || cls === 'sniper');
    if (ui || !canAct) return;

    if (inst && pressed('KeyR')) startReload(inst);

    const fireHeld = inst && m.left && (inst.def.auto || m.leftPressed);
    if (fireHeld && S.swapT <= 0 && !S.vault && !inst.reloading) {
      if (inst.ammoInMag <= 0) {
        if (m.leftPressed || inst.def.auto) startReload(inst);
      } else if (COD.weapons) {
        COD.eyePos(P, tmpO);
        COD.forward(P.yaw + S.recoilY, P.pitch + S.recoilP, tmpD);
        COD.weapons.tryFire(P, inst, tmpO, tmpD);
      }
    } else if (inst && inst.ammoInMag <= 0 && !inst.reloading && S.swapT <= 0 && P.ammo[inst.def.ammoType] > 0 && cls !== 'mortar') {
      startReload(inst); // auto reload on empty
    }

    // grenade
    if (pressed('KeyG') && S.grenCd <= 0 && P.grenades.length > 0 && COD.projectiles && !S.vault) {
      const rar = P.grenades.pop();
      COD.eyePos(P, tmpO);
      COD.forward(P.yaw, P.pitch + 0.12, tmpD);
      COD.projectiles.throwGrenade(P, tmpO.clone(), tmpD.clone(), rar);
      S.grenCd = 0.8;
      if (COD.viewmodel && COD.viewmodel.playThrow) COD.viewmodel.playThrow();
    }
    // armor / medkit
    if (pressed('KeyF') && COD.wearPlate) { if (COD.wearPlate(P) && COD.sfx) COD.sfx('pickup'); }
    if (pressed('KeyH') && COD.useMedkit) { if (COD.useMedkit(P) && COD.sfx) COD.sfx('pickup'); }
  }

  function canStand() {
    if (!COD.world || !COD.world.raycast) return true;
    tmpPos.set(P.pos.x, P.pos.y + CROUCH_H - 0.1, P.pos.z);
    tmpUp.set(0, 1, 0);
    return !COD.world.raycast(tmpPos, tmpUp, STAND_H - CROUCH_H + 0.15);
  }

  function startVault(c) {
    // distance along look direction to leave the box
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    let tExit = 1.0;
    if (c && c.min && c.max) {
      let tmin = -Infinity, tmax = Infinity;
      const ax = [[P.pos.x, fx, c.min.x, c.max.x], [P.pos.z, fz, c.min.z, c.max.z]];
      let ok = true;
      for (let i = 0; i < 2; i++) {
        const o = ax[i][0], d = ax[i][1], lo = ax[i][2], hi = ax[i][3];
        if (Math.abs(d) < 1e-5) { if (o < lo || o > hi) ok = false; continue; }
        let t1 = (lo - o) / d, t2 = (hi - o) / d;
        if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      }
      if (ok && tmax > tmin && tmax > 0) tExit = tmax;
      else tExit = 1.2;
    }
    const dist = clamp(tExit + P.radius + 0.25, 1.0, 4.5);
    const top = c && c.max ? c.max.y : P.pos.y + 1.0;
    S.vault = {
      t: 0, dur: 0.5, sx: P.pos.x, sz: P.pos.z, sy: P.pos.y,
      tx: P.pos.x + fx * dist, tz: P.pos.z + fz * dist,
      rise: Math.max(0.3, top - P.pos.y + 0.12)
    };
    P.vel.set(0, 0, 0);
  }

  function updateVault(dt) {
    const v = S.vault;
    v.t += dt;
    const u = clamp(v.t / v.dur, 0, 1);
    const e = u * u * (3 - 2 * u);
    P.pos.x = v.sx + (v.tx - v.sx) * e;
    P.pos.z = v.sz + (v.tz - v.sz) * e;
    P.pos.y = v.sy + v.rise * Math.min(1, Math.sin(Math.PI * u) * 1.5);
    P.onGround = false;
    if (u >= 1) {
      S.vault = null;
      P.vel.set(0, 0, 0);
      P.pos.y = v.sy;
      tmpDelta.set(0, 0.0, 0);
      if (COD.world) COD.world.resolveMove(P.pos, tmpDelta, P.radius, P.height);
    }
  }

  function handleMove(dt, ui, inst) {
    const w = COD.world;
    // crouch
    const wantCrouch = !ui && (key('KeyC') || key('ControlLeft') || key('ControlRight'));
    if (wantCrouch) P.crouching = true;
    else if (P.crouching && canStand()) P.crouching = false;
    P.height = P.crouching ? CROUCH_H : STAND_H;

    // input vector
    let ix = 0, iz = 0;
    if (!ui) {
      if (key('KeyW')) iz += 1;
      if (key('KeyS')) iz -= 1;
      if (key('KeyD')) ix += 1;
      if (key('KeyA')) ix -= 1;
    }
    const il = Math.hypot(ix, iz);
    if (il > 1) { ix /= il; iz /= il; }
    const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw);
    const wx = -sy * iz + cy * ix, wz = -cy * iz - sy * ix;
    S.roll = S.roll + ((-ix * 0.012) - S.roll) * Math.min(1, dt * 8);

    // sprint
    const m = COD.input && COD.input.mouse ? COD.input.mouse : { left: false, right: false };
    P.sprinting = !ui && key('ShiftLeft') && iz > 0 && P.onGround && !P.crouching && !m.right && !m.left && !S.vault;

    // swimming?
    const h = w ? w.heightAt(P.pos.x, P.pos.z) : 0;
    const swimming = h < -0.9 && P.pos.y < -0.2;

    let speed = P.crouching ? CROUCH : P.sprinting ? SPRINT : WALK;
    if (swimming) speed = SWIM;
    else if (P.fp.ads > 0.3) speed *= 0.65;

    if (S.vault) { updateVault(dt); return; }

    const ac = P.onGround || swimming ? 12 : 2.5;
    const k = Math.min(1, ac * dt);
    P.vel.x += (wx * speed - P.vel.x) * k;
    P.vel.z += (wz * speed - P.vel.z) * k;

    if (swimming) {
      P.vel.y = (-0.9 - P.pos.y) * 4;
    } else {
      P.vel.y -= GRAV * dt;
      if (P.vel.y < -40) P.vel.y = -40;
      if (!ui && P.onGround && pressed('Space')) {
        // A nearby window can be broken and vaulted over its low sill.
        COD.eyePos(P, tmpO);
        COD.forward(P.yaw, 0, tmpD);
        const ahead = w && w.raycast ? w.raycast(tmpO, tmpD, P.radius + 1.1) : null;
        const pane = ahead && ahead.collider;
        if (!P.crouching && pane && pane.type === 'window' && pane.min.y - P.pos.y <= 1.2) {
          if (pane.onHit) pane.onHit(1, { attacker: P, weaponId: 'vault', point: ahead.point });
          if (!pane.enabled) {
            startVault({ min: pane.min, max: new V3(pane.max.x, pane.min.y, pane.max.z) });
            S.blockedT = 0;
            return;
          }
        }
        if (S.blockedT > 0 && S.blockedRef && S.blockedRef.type === 'low' && !P.crouching) {
          startVault(S.blockedRef);
          S.blockedT = 0;
          return;
        }
        P.vel.y = JUMP;
        P.onGround = false;
      }
    }

    const beforeY = P.pos.y;
    S.prevVy = P.vel.y;
    tmpDelta.set(P.vel.x * dt, P.vel.y * dt, P.vel.z * dt);
    const res = w ? w.resolveMove(P.pos, tmpDelta, P.radius, P.height) : { onGround: true, blocked: null };
    P.onGround = swimming ? true : !!res.onGround;
    if (P.onGround && P.vel.y < 0 && !swimming) P.vel.y = 0;
    if (P.vel.y > 0 && P.pos.y - beforeY < tmpDelta.y * 0.4) P.vel.y = 0; // bumped head
    if (res.blocked) { S.blockedRef = res.blocked; S.blockedT = 0.25; }
    else S.blockedT = Math.max(0, S.blockedT - dt);
    // landing dip
    if (P.onGround && !S.wasGround && S.prevVy < -5) S.landDip = Math.min(0.3, -S.prevVy * 0.025);
    S.wasGround = P.onGround;
  }

  function handleUse(ui) {
    if (ui) { setPrompt(null); return; }
    const e = pressed('KeyE');
    if (P.vehicle) { setPrompt(P.vehicle.auto ? null : '[E] Exit vehicle'); return; }
    if (P.hidden) {
      setPrompt('[E] Leave hiding spot');
      if (e && S.hideT <= 0 && COD.buildings && COD.buildings.leaveHiding) COD.buildings.leaveHiding(P);
      return;
    }
    const it = COD.interact ? COD.interact.nearest(P) : null;
    if (it) {
      const txt = typeof it.prompt === 'function' ? it.prompt(P) : it.prompt;
      setPrompt(txt ? '[E] ' + txt : null);
      if (e && it.onUse) it.onUse(P);
    } else setPrompt(null);
  }

  // ---------- camera ----------
  const camPos = new V3();
  function applyCamera(px, py, pz, pitch, yaw, roll) {
    const cam = COD.camera;
    if (!cam) return;
    cam.position.set(px, py, pz);
    cam.rotation.set(pitch, yaw, roll, 'YXZ');
  }

  function spectate(dt) {
    let mate = null;
    const list = [];
    for (let i = 0; i < COD.actors.length; i++) {
      const a = COD.actors[i];
      if (a !== P && a.team === P.team && a.kind !== 'drone' && a.alive && !a.eliminated) list.push(a);
    }
    if (list.length) {
      if (pressed('KeyE') || (COD.input && COD.input.mouse && COD.input.mouse.leftPressed)) S.specIdx++;
      mate = list[S.specIdx % list.length];
    }
    if (!mate) { applyCamera(P.pos.x, P.pos.y + 3, P.pos.z, -0.3, P.yaw, 0); return; }
    const fx = -Math.sin(mate.yaw), fz = -Math.cos(mate.yaw);
    applyCamera(mate.pos.x - fx * 3.5, mate.pos.y + 2.4, mate.pos.z - fz * 3.5, mate.pitch * 0.3 - 0.12, mate.yaw, 0);
  }

  // Third-person chase camera used while riding a car or boat (orbits with the mouse).
  const chaseT = new V3(), chaseD = new V3();
  function chaseCamera(dt, pitch, yaw) {
    const v = P.vehicle, boat = v.type === 'boat', w = COD.world;
    let dist = boat ? 9 : 7;
    chaseT.set(v.pos.x, (boat ? 0 : v.pos.y) + (boat ? 2.4 : 1.9), v.pos.z);
    const cp = Math.cos(pitch);
    chaseD.set(Math.sin(yaw) * cp, -Math.sin(pitch), Math.cos(yaw) * cp);   // from target back to camera
    if (w && w.raycast) {
      const hit = w.raycast(chaseT, chaseD, dist + 0.5, true);
      if (hit) dist = Math.max(1.5, hit.dist - 0.5);
    }
    let x = chaseT.x + chaseD.x * dist, y = chaseT.y + chaseD.y * dist, z = chaseT.z + chaseD.z * dist;
    const gy = w && w.groundAt ? w.groundAt(x, z) : 0;
    if (y < gy + 0.7) y = gy + 0.7;
    applyCamera(x, y, z, pitch, yaw, 0);
  }

  function updateCamera(dt) {
    const cam = COD.camera;
    if (!cam) return;
    // recoil recovery
    const rec = Math.exp(-dt * 8);
    S.recoilP *= rec; S.recoilY *= rec;
    S.landDip *= Math.exp(-dt * 9);

    if (!P.alive) {
      S.deadT += dt;
      const k = Math.min(1, S.deadT * 2.5);
      applyCamera(P.pos.x, P.pos.y + 1.7 - 1.35 * k, P.pos.z, P.pitch * (1 - k) - 0.25 * k, P.yaw, 0.7 * k);
      return;
    }
    let eyeY, pitch = P.pitch + S.recoilP, yaw = P.yaw + S.recoilY, roll = S.roll;
    if (P.vehicle) {
      eyeY = P.pos.y + 1.0;
    } else if (P.hidden) {
      const target = P.hidden.eyePos ? P.hidden.eyePos.y - P.pos.y : STAND_H - 0.1;
      S.camEye += (target - S.camEye) * Math.min(1, dt * 10);
      eyeY = P.pos.y + S.camEye;
    } else {
      const target = P.height - 0.1;
      S.camEye += (target - S.camEye) * Math.min(1, dt * 12);
      eyeY = P.pos.y + S.camEye - S.landDip;
    }
    if (P.vehicle && !P.vehicle.destroyed) { return; } // vehicles.js owns the camera while riding
    let bx = 0, by = 0;
    if (!P.vehicle && !P.hidden && !S.vault) {
      const sp = Math.hypot(P.vel.x, P.vel.z);
      if (P.onGround && sp > 0.5) {
        S.bobT += dt * (sp * 1.5);
        const a = 0.012 * Math.min(1, sp / 5) * (1 - 0.8 * P.fp.ads) * (P.sprinting ? 1.4 : 1);
        by = Math.sin(S.bobT * 2) * a;
        bx = Math.cos(S.bobT) * a * 0.8;
      }
    }
    if (S.vault) {
      const u = clamp(S.vault.t / S.vault.dur, 0, 1);
      roll += Math.sin(Math.PI * u) * 0.06;
      eyeY -= Math.sin(Math.PI * u) * 0.1;
    }
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    applyCamera(P.pos.x + bx * cy, eyeY + by, P.pos.z - bx * sy, pitch, yaw, roll);
  }

  // ---------- update ----------
  function update(dt) {
    if (!P) return;
    const st = COD.state;
    if (S.needReset) resetForSpawn();
    if (!S.loadout) giveLoadout();
    if (S.grenCd > 0) S.grenCd -= dt;
    if (S.swapT > 0) S.swapT -= dt;
    if (S.hideT > 0) S.hideT -= dt;

    if (!st.running) { updateCamera(dt); return; }

    // dead / eliminated
    if (P.alive && !S.wasAlive) { resetForSpawn(); }
    S.wasAlive = P.alive;
    if (!P.alive || P.eliminated) {
      P.sprinting = false; P.fp.ads = 0; P.fp.scoped = false;
      setPrompt(null);
      if (P.eliminated) spectate(dt); else updateCamera(dt);
      return;
    }

    const ui = !!st.uiMode;
    let inst = COD.currentWeapon ? COD.currentWeapon(P) : P.weapons[P.weaponIndex];
    const inVeh = !!P.vehicle, hid = !!P.hidden;

    // hiding transitions
    if (hid && S.prevHidden !== P.hidden) {
      S.hideT = 0.3;
      P.yaw = P.hidden.yaw == null ? P.yaw : P.hidden.yaw;
      P.pitch = 0;
      P.crouching = false; P.vel.set(0, 0, 0);
      P.fp.ads = 0; P.fp.scoped = false;
    }
    S.prevHidden = P.hidden;

    look(dt, ui, inst);

    if (inVeh) {
      P.sprinting = false; P.fp.ads = 0; P.fp.scoped = false;
      S.vault = null;
      // ease the view back behind the vehicle when the mouse is idle
      const mm = COD.input && COD.input.mouse;
      if (mm && (mm.dx || mm.dy)) S.vehIdle = 0; else S.vehIdle = (S.vehIdle || 0) + dt;
      if (S.vehIdle > 1.2 && P.vehicle && Math.abs(P.vehicle.speed) > 2) {
        let d = P.vehicle.yaw - P.yaw;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        const k = Math.min(1, dt * 2.5);
        P.yaw += d * k; P.pitch += (-0.2 - P.pitch) * k;
      }
    } else if (hid) {
      P.vel.set(0, 0, 0);
      P.sprinting = false; P.fp.ads = 0; P.fp.scoped = false;
      if (P.hidden.viewPos) P.pos.copy(P.hidden.viewPos);
      const cy = P.hidden.yaw || 0;
      let d = P.yaw - cy;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      P.yaw = cy + clamp(d, -0.9, 0.9);
      P.pitch = clamp(P.pitch, -0.5, 0.5);
    } else {
      handleSwapKeys(ui);
      inst = COD.currentWeapon ? COD.currentWeapon(P) : P.weapons[P.weaponIndex];
      handleMove(dt, ui, inst);
      handleWeapon(dt, ui, inst, true);
    }
    handleUse(ui);
    updateCamera(dt);
  }

  COD.playerCtl = { init: init, update: update };
})();

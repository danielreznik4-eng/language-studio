// drones.js - AI drones (Owner: Chat 8). COD.drones = { init, update, spawnWave, spawnDrone, list }
(function () {
  'use strict';
  const COD = window.COD;

  const drones = [];
  const MAX_ALIVE = 8;
  let T = 0, phase = 1, waveT = 120;
  const _want = new THREE.Vector3(), _dv = new THREE.Vector3(), _dir = new THREE.Vector3(),
    _tp = new THREE.Vector3(), _end = new THREE.Vector3();

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function wrapAng(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

  let geo = null, M = null;
  const _q = new THREE.Quaternion(), _down = new THREE.Vector3(0, -1, 0), _ld = new THREE.Vector3();
  // ---- spark particles (one pooled Points object) ----
  const NSP = 96;
  let sparkPts = null, sparkPos = null, sparkVel = null, sparkLife = null, sparkNext = 0, sparkActive = 0;
  function initSparks() {
    sparkPos = new Float32Array(NSP * 3); sparkVel = new Float32Array(NSP * 3); sparkLife = new Float32Array(NSP);
    for (let i = 0; i < NSP; i++) sparkPos[i * 3 + 1] = -1000;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const cg = c.getContext('2d'), gr = cg.createRadialGradient(16, 16, 0, 16, 16, 15);
    gr.addColorStop(0, 'rgba(255,230,160,1)'); gr.addColorStop(0.4, 'rgba(255,150,40,0.7)'); gr.addColorStop(1, 'rgba(255,100,0,0)');
    cg.fillStyle = gr; cg.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
    const mat = new THREE.PointsMaterial({ color: 0xffa040, map: tex, size: 0.12, transparent: true, opacity: 0.95,
      alphaTest: 0.02, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    sparkPts = new THREE.Points(g, mat);
    sparkPts.frustumCulled = false;
    COD.scene.add(sparkPts);
  }
  function burst(pos, n, speed) {
    if (!sparkPts) return;
    for (let k = 0; k < n; k++) {
      const i = sparkNext; sparkNext = (sparkNext + 1) % NSP;
      sparkPos[i * 3] = pos.x; sparkPos[i * 3 + 1] = pos.y; sparkPos[i * 3 + 2] = pos.z;
      const a = Math.random() * 6.283, u = Math.random() * 2 - 1, r = Math.sqrt(1 - u * u), s = speed * (0.4 + Math.random() * 0.8);
      sparkVel[i * 3] = Math.cos(a) * r * s; sparkVel[i * 3 + 1] = u * s * 0.8 + 2; sparkVel[i * 3 + 2] = Math.sin(a) * r * s;
      sparkLife[i] = 0.3 + Math.random() * 0.4;
    }
    sparkActive = 1.2;
  }
  function updateSparks(dt) {
    if (!sparkPts || sparkActive <= 0) return;
    sparkActive -= dt;
    for (let i = 0; i < NSP; i++) {
      if (sparkLife[i] <= 0) continue;
      sparkLife[i] -= dt;
      if (sparkLife[i] <= 0) { sparkPos[i * 3 + 1] = -1000; continue; }
      sparkVel[i * 3 + 1] -= 14 * dt;
      sparkPos[i * 3] += sparkVel[i * 3] * dt; sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt; sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
      sparkActive = Math.max(sparkActive, 0.1);
    }
    sparkPts.geometry.attributes.position.needsUpdate = true;
  }

  function ensureGeo() {
    if (geo) return;
    geo = {
      hull: new THREE.SphereGeometry(0.34, 14, 10),
      dome: new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      cam: new THREE.SphereGeometry(0.1, 10, 8),
      arm: new THREE.BoxGeometry(0.62, 0.05, 0.08),
      motor: new THREE.CylinderGeometry(0.07, 0.08, 0.1, 10),
      blade: new THREE.BoxGeometry(0.56, 0.012, 0.07),
      blur: new THREE.CircleGeometry(0.3, 20),
      led: new THREE.SphereGeometry(0.035, 6, 5),
      gun: new THREE.BoxGeometry(0.05, 0.05, 0.22),
      // search-light cone: apex at origin, opening downward (-Y), 14 m long
      cone: new THREE.ConeGeometry(1.5, 14, 16, 1, true).translate(0, -7, 0)
    };
    M = {
      hull: new THREE.MeshStandardMaterial({ color: 0x30343b, roughness: 0.45, metalness: 0.6 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.6, metalness: 0.4 }),
      accent: new THREE.MeshStandardMaterial({ color: 0x7a1414, roughness: 0.5, metalness: 0.3 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x111820, roughness: 0.1, metalness: 0.9 }),
      blade: new THREE.MeshStandardMaterial({ color: 0x20232a, roughness: 0.5, metalness: 0.2 }),
      blur: new THREE.MeshBasicMaterial({ color: 0x9aa3b0, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
      cone: new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.08, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
    };
  }
  function buildMesh() {
    ensureGeo();
    const g = new THREE.Group();
    function add(geom, mat, x, y, z, parent, shadow) {
      const m = new THREE.Mesh(geom, mat); m.position.set(x, y, z); (parent || g).add(m);
      if (shadow !== false) m.castShadow = true;
      return m;
    }
    const hull = add(geo.hull, M.hull, 0, 0, 0); hull.scale.set(1, 0.55, 1.15);
    add(geo.dome, M.accent, 0, 0.1, 0.02).scale.set(1, 0.8, 1.1);
    const cam = add(geo.cam, M.glass, 0, -0.14, -0.16);
    const eye = add(geo.led, new THREE.MeshBasicMaterial({ color: 0xff2222 }), 0, -0.02, -0.38, null, false);
    eye.scale.setScalar(2.2);
    add(geo.gun, M.dark, 0, -0.17, -0.28);
    const rotors = [], blades = [];
    const o = 0.34;
    [[o, o], [-o, o], [o, -o], [-o, -o]].forEach(function (p, i) {
      const arm = add(geo.arm, M.hull, p[0] / 2, 0, p[1] / 2);
      arm.rotation.y = Math.atan2(-p[1], p[0]);
      arm.scale.x = 0.9;
      add(geo.motor, M.dark, p[0], 0.04, p[1]);
      const rg = new THREE.Group(); rg.position.set(p[0], 0.1, p[1]); g.add(rg);
      const b1 = add(geo.blade, M.blade, 0, 0, 0, rg), b2 = add(geo.blade, M.blade, 0, 0, 0, rg);
      b2.rotation.y = Math.PI / 2;
      const blur = add(geo.blur, M.blur, 0, 0.005, 0, g, false);
      blur.rotation.x = -Math.PI / 2; blur.position.set(p[0], 0.1, p[1]);
      rotors.push(rg);
    });
    // blinking LEDs: front pair red, rear pair green (own materials per drone)
    const ledF = new THREE.MeshBasicMaterial({ color: 0xff2222 }), ledR = new THREE.MeshBasicMaterial({ color: 0x22ff44 });
    add(geo.led, ledF, 0.34, 0.0, -0.34, null, false); add(geo.led, ledF, -0.34, 0.0, -0.34, null, false);
    add(geo.led, ledR, 0.34, 0.0, 0.34, null, false); add(geo.led, ledR, -0.34, 0.0, 0.34, null, false);
    // search-light cone (mesh, not a real light)
    const lightG = new THREE.Group(); lightG.position.set(0, -0.12, -0.16); g.add(lightG);
    const cone = new THREE.Mesh(geo.cone, M.cone); cone.frustumCulled = false; lightG.add(cone);
    g.userData = { rotors: rotors, ledF: ledF, ledR: ledR, lightG: lightG, hull: hull };
    return g;
  }

  function groundAt(x, z) {
    const W = COD.world;
    return Math.max(0, (W && W.heightAt) ? W.heightAt(x, z) : 0);
  }

  function spawnDrone(pos) {
    const d = COD.makeActor({ kind: 'drone', team: -1, name: 'Drone' });
    d.hp = 60; d.maxHp = 60; d.radius = 0.6; d.height = 0.6; d.lives = 1;
    if (pos) d.pos.copy(pos);
    else { const a = Math.random() * 6.283; d.pos.set(Math.cos(a) * 340, 35, Math.sin(a) * 340); }
    d.mesh = buildMesh();
    d.mesh.position.copy(d.pos);
    COD.scene.add(d.mesh);
    d.ai = {
      tgt: null, second: null, los: false, noLos: 0, thinkT: Math.random() * 0.3, retargetT: 0,
      hover: rnd(8, 14), ang: Math.random() * 6.283, angSpeed: rnd(0.3, 0.7) * (Math.random() < 0.5 ? -1 : 1),
      orbit: rnd(14, 22), fireT: rnd(0.8, 1.6), burst: 3, bob: Math.random() * 6.283, exploded: false, spin: 0
    };
    COD.actors.push(d);
    drones.push(d);
    return d;
  }

  function aliveCount() {
    let n = 0;
    for (let i = 0; i < drones.length; i++) if (drones[i].alive) n++;
    return n;
  }

  function spawnWave(n) {
    n = Math.min(n | 0, MAX_ALIVE - aliveCount());
    if (n <= 0) return;
    const base = Math.random() * 6.283;
    for (let i = 0; i < n; i++) {
      const a = base + rnd(-0.4, 0.4);
      const r = rnd(320, 360);
      spawnDrone(new THREE.Vector3(Math.cos(a) * r, rnd(30, 45), Math.sin(a) * r));
    }
    COD.emit('message', { text: 'DRONES INBOUND' });
    COD.sfx('drone');
  }

  function validTarget(a) {
    return a.kind !== 'drone' && a.alive && !a.eliminated && !a.hidden;
  }

  function think(d) {
    const ai = d.ai;
    if (ai.tgt && !validTarget(ai.tgt)) { ai.tgt = null; ai.los = false; }
    ai.retargetT -= 0.3;
    // nearest + second nearest
    let best = null, bd = 1e9, sec = null, sd = 1e9;
    const A = COD.actors;
    for (let i = 0; i < A.length; i++) {
      const a = A[i];
      if (!validTarget(a)) continue;
      const dd = d.pos.distanceTo(a.pos);
      if (dd < bd) { sec = best; sd = bd; best = a; bd = dd; }
      else if (dd < sd) { sec = a; sd = dd; }
    }
    ai.second = sec;
    if (!ai.tgt || ai.retargetT <= 0) {
      if (best && best !== ai.tgt) { ai.tgt = best; ai.noLos = 0; }
      ai.retargetT = 5;
    }
    if (!ai.tgt) { ai.los = false; return; }
    // one raycast per think (~3/s)
    const t = ai.tgt, W = COD.world;
    _tp.set(t.pos.x, t.pos.y + t.height * 0.7, t.pos.z);
    ai.los = (d.pos.distanceTo(t.pos) < 95) && (W && W.lineOfSight ? !!W.lineOfSight(d.pos, _tp) : true);
    if (ai.los) ai.noLos = 0;
    else {
      ai.noLos += 0.3;
      if (ai.noLos > 3 && ai.second) { ai.tgt = ai.second; ai.noLos = 0; ai.retargetT = 5; }
    }
  }

  function fire(d) {
    const ai = d.ai, t = ai.tgt;
    if (!t) return;
    _tp.set(t.pos.x, t.pos.y + t.height * 0.7, t.pos.z);
    const dist = d.pos.distanceTo(_tp);
    const err = 0.7 + dist * 0.03;
    _tp.x += (Math.random() - 0.5) * 2 * err; _tp.y += (Math.random() - 0.5) * 2 * err; _tp.z += (Math.random() - 0.5) * 2 * err;
    _dir.copy(_tp).sub(d.pos).normalize();
    let hit = null;
    if (COD.weapons && COD.weapons.hitscan) { try { hit = COD.weapons.hitscan(d, d.pos, _dir, 100); } catch (e) { hit = null; } }
    if (hit && hit.point) _end.copy(hit.point); else _end.copy(d.pos).addScaledVector(_dir, 60);
    if (COD.projectiles && COD.projectiles.spawnTracer) COD.projectiles.spawnTracer(d.pos.clone(), _end.clone());
    if (hit) {
      const dmg = phase >= 3 ? 10 : 8;
      if (hit.actor) {
        if (hit.actor.kind !== 'drone' && hit.actor.alive) {
          COD.combat.damage(hit.actor, dmg, { attacker: d, weaponId: 'drone', headshot: false, point: hit.point });
        }
      } else if (hit.collider && hit.collider.onHit) {
        try { hit.collider.onHit(dmg, { attacker: d, weaponId: 'drone', point: hit.point }); } catch (e) { /* ignore */ }
      }
    }
  }

  function removeDrone(i) {
    const d = drones[i];
    if (d.mesh) { if (d.mesh.parent) d.mesh.parent.remove(d.mesh); }
    const k = COD.actors.indexOf(d);
    if (k >= 0) COD.actors.splice(k, 1);
    drones.splice(i, 1);
  }

  function updateDrone(d, dt) {
    const ai = d.ai, m = d.mesh;
    ai.thinkT -= dt;
    if (ai.thinkT <= 0) { ai.thinkT = 0.3; think(d); }
    const speed = phase >= 3 ? 14 : 12;
    const t = ai.tgt;
    if (t) {
      ai.ang += dt * ai.angSpeed;
      const R = ai.los ? ai.orbit : 0;
      _want.x = t.pos.x + Math.cos(ai.ang) * R;
      _want.z = t.pos.z + Math.sin(ai.ang) * R;
      _want.y = Math.max(groundAt(_want.x, _want.z) + ai.hover, t.pos.y + (ai.los ? 7 : 9));
    } else {
      _want.set(0, groundAt(0, 0) + 20, 0);
    }
    _dv.copy(_want).sub(d.pos);
    const dl = _dv.length();
    if (dl > 0.01) _dv.multiplyScalar(Math.min(speed, dl * 1.2) / dl);
    d.vel.lerp(_dv, 1 - Math.exp(-2.5 * dt));
    d.pos.addScaledVector(d.vel, dt);
    ai.bob += dt * 2;
    // keep clear of the ground
    const minY = groundAt(d.pos.x, d.pos.z) + 5;
    if (d.pos.y < minY) d.pos.y = minY;
    // face target, else direction of travel
    let wantYaw = d.yaw;
    if (t && ai.los) wantYaw = Math.atan2(-(t.pos.x - d.pos.x), -(t.pos.z - d.pos.z));
    else if (Math.abs(d.vel.x) + Math.abs(d.vel.z) > 0.5) wantYaw = Math.atan2(-d.vel.x, -d.vel.z);
    const dy = wrapAng(wantYaw - d.yaw);
    d.yaw += Math.max(-3 * dt, Math.min(3 * dt, dy));
    // shooting
    if (t && ai.los && d.pos.distanceTo(t.pos) < 85) {
      ai.fireT -= dt;
      if (ai.fireT <= 0) {
        if (ai.burst === 3) COD.sfx('drone', d.pos);
        fire(d);
        ai.burst--;
        if (ai.burst <= 0) { ai.burst = 3; ai.fireT = rnd(1.0, 1.8); } else ai.fireT = 0.12;
      }
    }
    // visuals
    m.position.set(d.pos.x, d.pos.y + Math.sin(ai.bob) * 0.12, d.pos.z);
    m.rotation.y = d.yaw;
    m.rotation.x = COD.clamp((d.vel.x * -Math.sin(d.yaw) + d.vel.z * -Math.cos(d.yaw)) * -0.02, -0.3, 0.3);
    ai.spin += dt * 40;
    const ud = m.userData, rs = ud.rotors;
    for (let i = 0; i < rs.length; i++) rs[i].rotation.y = ai.spin * (i % 2 ? 1 : -1);
    // blinking LEDs
    const on = Math.sin(T * 7 + ai.bob) > 0;
    ud.ledF.color.setHex(on ? 0xff2222 : 0x300808);
    ud.ledR.color.setHex(on ? 0x103a18 : 0x22ff44);
    // search-light cone: aim at the target, else straight down
    const lg = ud.lightG;
    if (t && ai.los) {
      _ld.set(t.pos.x - m.position.x, t.pos.y + t.height * 0.5 - m.position.y, t.pos.z - m.position.z);
      const len = _ld.length() || 1;
      _ld.multiplyScalar(1 / len);
      _q.copy(m.quaternion).invert();
      _ld.applyQuaternion(_q);
      lg.scale.y = COD.clamp(len / 14, 0.3, 2);
      lg.scale.x = lg.scale.z = COD.clamp(len / 14, 0.5, 1.3);
    } else {
      _ld.set(0, -1, 0).applyQuaternion(_q.copy(m.quaternion).invert());
      lg.scale.set(0.8, 0.7, 0.8);
    }
    _q.setFromUnitVectors(_down, _ld);
    lg.quaternion.slerp(_q, 1 - Math.exp(-6 * dt));
  }

  function init() {
    COD.on('phase', function (e) {
      const p = e && e.phase;
      if (!p) return;
      phase = p;
      if (p === 1) {                                  // back to phase 1 (test mode): clear drones
        for (let i = drones.length - 1; i >= 0; i--) removeDrone(i);
      } else if (p === 2) {
        spawnWave(6);
        waveT = 120;
      }
    });
    initSparks();
    COD.on('damage', function (e) {
      const t = e && e.target;
      if (t && t.kind === 'drone' && t.alive) burst(e.point || t.pos, 6, 7);
    });
    COD.on('kill', function (e) {
      const v = e && e.victim;
      if (v && v.kind === 'drone' && v.ai) v.ai.dying = true;
    });
  }

  function update(dt) {
    T += dt;
    updateSparks(dt);
    if (phase >= 2) {
      waveT -= dt;
      if (waveT <= 0) { waveT = 120; spawnWave(4); }
    }
    for (let i = drones.length - 1; i >= 0; i--) {
      const d = drones[i];
      try {
        if (!d.alive) {
          if (!d.ai.exploded) {
            d.ai.exploded = true;
            burst(d.pos, 40, 14);
            if (COD.projectiles && COD.projectiles.explode) {
              try { COD.projectiles.explode(d.pos.clone(), 3, 25, d, 'drone'); } catch (e) { /* ignore */ }
            }
            COD.sfx('explosion', d.pos);
          }
          removeDrone(i);
        } else updateDrone(d, dt);
      } catch (e) {
        if (!update.warned) { update.warned = true; console.error('drone error', e); }
      }
    }
  }

  COD.drones = { init: init, update: update, spawnWave: spawnWave, spawnDrone: spawnDrone, list: drones };
})();

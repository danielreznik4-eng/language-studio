/* Call of Doody - gamemode.js : teams, control points, phases, lives, respawns, win conditions */
(function () {
  'use strict';
  const COD = window.COD;

  const BOT_NAMES = ['Ghost', 'Viper', 'Rook', 'Maverick', 'Shadow', 'Bishop', 'Havoc', 'Reaper', 'Nomad', 'Falcon',
    'Tank', 'Blaze', 'Cobra', 'Dozer', 'Echo', 'Frost', 'Gizmo', 'Hawk', 'Iron', 'Jinx'];

  const gm = COD.gamemode = {
    teams: [],
    points: [],
    phase: 1,
    time: 0,
    timeToNextPhase: 300,
    over: false,
    winner: -1,
    started: false,
    respawnQueue: [],

    init: function () {
      const cfg = COD.config;
      gm.teams = [];
      gm.points = [];
      gm.respawnQueue = [];
      gm.phase = 1; gm.time = 0; gm.over = false; gm.winner = -1; gm.started = false;
      gm.timeToNextPhase = cfg.phaseTimes[1] - 0;

      for (let i = 0; i < cfg.teamCount; i++) {
        gm.teams.push({ id: i, name: COD.TEAMS[i].name, color: COD.TEAMS[i].color, actors: [] });
      }

      const cps = (COD.world && COD.world.controlPoints) || [];
      for (let i = 0; i < cps.length; i++) {
        gm.points.push({ id: cps[i].id, pos: cps[i].pos, radius: cps[i].radius || 8, owner: -1, progress: 0, capTeam: -1 });
      }

      // fill the teams
      let n = 0;
      for (let t = 0; t < cfg.teamCount; t++) {
        const team = gm.teams[t];
        for (let s = 0; s < cfg.teamSize; s++) {
          if (t === 0 && s === 0) {
            if (COD.player) team.actors.push(COD.player);
            else console.warn('[gamemode] COD.player missing');
            continue;
          }
          let bot = null;
          if (COD.bots && COD.bots.spawnBot) {
            try { bot = COD.bots.spawnBot(t, BOT_NAMES[n++ % BOT_NAMES.length]); } catch (e) { console.error('[gamemode] spawnBot failed', e); }
          }
          if (bot) team.actors.push(bot);
        }
      }

      // boat landings
      const spawns = (COD.world && COD.world.teamSpawns) || [];
      for (let t = 0; t < gm.teams.length; t++) {
        const sp = spawns[t];
        const team = gm.teams[t];
        if (!sp) { console.warn('[gamemode] no teamSpawn for team', t); continue; }
        for (let i = 0; i < team.actors.length; i++) {
          team.actors[i].pos.copy(sp.from);
          team.actors[i].yaw = sp.yaw || 0;
        }
        let landed = false;
        if (COD.vehicles && COD.vehicles.startBoatLanding) {
          try { COD.vehicles.startBoatLanding(t, team.actors, sp.from, sp.to); landed = true; }
          catch (e) { console.error('[gamemode] startBoatLanding failed', e); }
        }
        if (!landed) {
          for (let i = 0; i < team.actors.length; i++) {
            const a = team.actors[i];
            a.pos.copy(sp.to);
            a.pos.x += COD.rand(-3, 3); a.pos.z += COD.rand(-3, 3);
            if (COD.world && COD.world.heightAt) a.pos.y = Math.max(0, COD.world.heightAt(a.pos.x, a.pos.z));
          }
        }
      }

      COD.on('kill', gm.onKill);
    },

    // ---------------------------------------------------------------- spawning
    spawnPos: function (team, out) {
      out = out || new THREE.Vector3();
      const sp = COD.world && COD.world.teamSpawns && COD.world.teamSpawns[team];
      if (!sp) { out.set(0, 5, 0); return out; }
      for (let tries = 0; tries < 8; tries++) {
        out.copy(sp.to);
        out.x += COD.rand(-5, 5); out.z += COD.rand(-5, 5);
        if (!COD.world.isWater || !COD.world.isWater(out.x, out.z)) break;
      }
      if (COD.world.heightAt) out.y = Math.max(0, COD.world.heightAt(out.x, out.z));
      return out;
    },

    respawn: function (actor) {
      if (!actor || actor.kind === 'drone' || actor.eliminated) return;
      if (actor.hidden) { if (actor.hidden.occupant === actor) actor.hidden.occupant = null; actor.hidden = null; }
      if (actor.vehicle && COD.vehicles && COD.vehicles.exit) { try { COD.vehicles.exit(actor); } catch (e) { /* ignore */ } }
      actor.vehicle = null;
      gm.spawnPos(actor.team, actor.pos);
      actor.vel.set(0, 0, 0);
      actor.hp = actor.maxHp;
      actor.armor = 0;
      actor.alive = true;
      actor.crouching = false; actor.sprinting = false; actor.onGround = true;
      actor.fp.ads = 0; actor.fp.scoped = false;
      const sp = COD.world && COD.world.teamSpawns && COD.world.teamSpawns[actor.team];
      if (sp && sp.yaw !== undefined) actor.yaw = sp.yaw + Math.PI; // face inland
      actor.pitch = 0;
      actor.respawnTimer = 0;
      COD.emit('spawn', { actor: actor });
    },

    respawnTimeLeft: function (actor) { return actor && actor.respawnTimer > 0 ? actor.respawnTimer : 0; },

    // ---------------------------------------------------------------- lives
    onKill: function (e) {
      const v = e.victim;
      if (!v || v.kind === 'drone' || gm.over) return;
      if (v.hidden) { if (v.hidden.occupant === v) v.hidden.occupant = null; v.hidden = null; }
      v.lives -= 1;
      if (v.lives <= 0) {
        v.eliminated = true;
        v.lives = 0;
        v.respawnTimer = 0;
        COD.emit('eliminated', { actor: v });
        if (v === COD.player) COD.emit('message', { text: 'ELIMINATED' });
        gm.checkLastTeam();
      } else {
        v.respawnTimer = COD.config.respawnDelay;
        gm.respawnQueue.push(v);
      }
    },

    checkLastTeam: function () {
      if (gm.over) return;
      let alive = 0, last = -1;
      for (let t = 0; t < gm.teams.length; t++) {
        const list = gm.teams[t].actors;
        let any = false;
        for (let i = 0; i < list.length; i++) if (!list[i].eliminated) { any = true; break; }
        if (any) { alive++; last = t; }
      }
      if (alive === 1) gm.endGame(last);
      else if (alive === 0) gm.endGame(-1);
    },

    endGame: function (winner) {
      if (gm.over) return;
      gm.over = true;
      gm.winner = winner;
      COD.emit('gameOver', { winner: winner });
    },

    // ---------------------------------------------------------------- phases
    applyPhase: function (n) {
      gm.phase = n;
      const all = COD.actors;
      for (let i = 0; i < all.length; i++) {
        const a = all[i];
        if (a.kind === 'drone' || a.eliminated) continue;
        if (n === 1) a.lives = Infinity;
        else if (n === 2) a.lives = 5;
        else a.lives = 1;
      }
      const pt = COD.config.phaseTimes;
      gm.timeToNextPhase = n < 3 ? Math.max(0, pt[n] - gm.time) : 0;
      COD.emit('phase', { phase: n });
      const names = ['', 'PHASE 1 - UNLIMITED LIVES', 'PHASE 2 - DRONES INBOUND - 5 LIVES', 'FINAL PHASE - ONE LIFE'];
      COD.emit('message', { text: names[n] });
    },

    setPhase: function (n) {
      n = COD.clamp(Math.round(n), 1, 3);
      gm.time = COD.config.phaseTimes[n - 1];
      COD.state.time = gm.time;
      gm.applyPhase(n);
    },

    // ---------------------------------------------------------------- update
    update: function (dt) {
      if (!gm.teams.length) return;

      if (!gm.started) {
        gm.started = true;
        COD.emit('matchStart', {});
        gm.applyPhase(1);
        for (let i = 0; i < COD.actors.length; i++) if (COD.actors[i].kind !== 'drone') COD.emit('spawn', { actor: COD.actors[i] });
      }
      if (gm.over) return;

      gm.time += dt;
      COD.state.time = gm.time;

      const pt = COD.config.phaseTimes;
      if (gm.phase < 3 && gm.time >= pt[gm.phase]) gm.applyPhase(gm.phase + 1);
      gm.timeToNextPhase = gm.phase < 3 ? Math.max(0, pt[gm.phase] - gm.time) : 0;

      // respawns
      for (let i = gm.respawnQueue.length - 1; i >= 0; i--) {
        const a = gm.respawnQueue[i];
        if (a.eliminated || a.alive) { gm.respawnQueue.splice(i, 1); continue; }
        a.respawnTimer -= dt;
        if (a.respawnTimer <= 0) { gm.respawnQueue.splice(i, 1); gm.respawn(a); }
      }

      gm.updateCapture(dt);
    },

    updateCapture: function (dt) {
      const ct = COD.config.captureTime;
      const present = [];
      for (let p = 0; p < gm.points.length; p++) {
        const pt = gm.points[p];
        present.length = 0;
        let count = 0, team = -1, contested = false;
        for (let i = 0; i < COD.actors.length; i++) {
          const a = COD.actors[i];
          if (a.kind === 'drone' || !a.alive || a.hidden || a.eliminated) continue;
          const dx = a.pos.x - pt.pos.x, dz = a.pos.z - pt.pos.z;
          if (dx * dx + dz * dz > pt.radius * pt.radius || Math.abs(a.pos.y - pt.pos.y) > 8) continue;
          if (team === -1) team = a.team;
          else if (team !== a.team) contested = true;
          count++;
        }
        if (count === 0 || contested) continue;

        if (pt.progress <= 0) { pt.capTeam = team; pt.progress = 0; if (pt.owner !== -1 && pt.owner !== team) pt.owner = -1; }
        if (pt.capTeam === team) {
          if (pt.progress < 1) {
            pt.progress = Math.min(1, pt.progress + dt / ct);
            if (pt.progress >= 1 && pt.owner !== team) {
              pt.owner = team;
              COD.sfx('capture');
              COD.emit('pointCaptured', { point: pt, team: team });
              COD.emit('message', { text: COD.TEAMS[team].name.toUpperCase() + ' CAPTURED POINT ' + pt.id });
              gm.checkPointsWin();
            }
          }
        } else {
          pt.progress -= dt / ct;
          if (pt.progress <= 0) { pt.progress = 0; pt.owner = -1; }
        }
      }
    },

    checkPointsWin: function () {
      if (gm.over || !gm.points.length) return;
      const o = gm.points[0].owner;
      if (o < 0) return;
      for (let i = 1; i < gm.points.length; i++) if (gm.points[i].owner !== o) return;
      gm.endGame(o);
    }
  };
})();

/* Call of Doody - viewmodel.js (Chat 5)
   Weapon meshes (also used by bots / loot) + first-person gun, gloved hands and animations.
   Graphics pass 2026-11-11: detailed standard-material guns, fingers, muzzle flash sprite. */
(function () {
  'use strict';
  const COD = window.COD;
  const V3 = THREE.Vector3;

  // ---------- canvas textures ----------
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  let woodTex = null, flashTex = null, streakTex = null;
  function getWoodTex() {
    if (!woodTex) woodTex = canvasTex(64, 64, function (x, w, h) {
      x.fillStyle = '#7b4a25'; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) {
        x.strokeStyle = 'rgba(' + (40 + Math.random() * 40 | 0) + ',20,5,' + (0.15 + Math.random() * 0.25) + ')';
        x.lineWidth = 1 + Math.random() * 1.5;
        const y = Math.random() * h;
        x.beginPath(); x.moveTo(0, y); x.bezierCurveTo(w * .3, y + Math.random() * 6 - 3, w * .6, y + Math.random() * 6 - 3, w, y + Math.random() * 4 - 2); x.stroke();
      }
    });
    return woodTex;
  }
  function getFlashTex() {
    if (!flashTex) flashTex = canvasTex(128, 128, function (x, w, h) {
      const g = x.createRadialGradient(64, 64, 2, 64, 64, 62);
      g.addColorStop(0, 'rgba(255,255,230,1)'); g.addColorStop(.25, 'rgba(255,220,120,.9)');
      g.addColorStop(.6, 'rgba(255,140,40,.35)'); g.addColorStop(1, 'rgba(255,100,20,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      x.translate(64, 64);
      x.fillStyle = 'rgba(255,230,150,.85)';
      for (let i = 0; i < 6; i++) {
        x.rotate(Math.PI / 3);
        x.beginPath(); x.moveTo(0, -4); x.lineTo(58 - (i % 2) * 14, 0); x.lineTo(0, 4); x.closePath(); x.fill();
      }
    });
    return flashTex;
  }
  function getStreakTex() {
    if (!streakTex) streakTex = canvasTex(64, 32, function (x, w, h) {
      const g = x.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(255,255,220,1)'); g.addColorStop(.4, 'rgba(255,190,80,.7)'); g.addColorStop(1, 'rgba(255,120,30,0)');
      x.fillStyle = g;
      x.beginPath(); x.moveTo(0, h / 2 - 3); x.lineTo(w, h / 2 - 9); x.lineTo(w, h / 2 + 9); x.lineTo(0, h / 2 + 3); x.closePath(); x.fill();
    });
    return streakTex;
  }

  // ---------- shared geometry / material caches ----------
  const geoCache = {}, matCache = {}, accCache = {};
  function box(w, h, d) {
    const k = 'b' + w + ',' + h + ',' + d;
    return geoCache[k] || (geoCache[k] = new THREE.BoxGeometry(w, h, d));
  }
  // cylinder along Z. rf = radius at the front (-Z), rr = radius at the rear (+Z)
  function cyl(rf, rr, len, seg) {
    const k = 'c' + rf + ',' + rr + ',' + len + ',' + (seg || 12);
    if (!geoCache[k]) { const g = new THREE.CylinderGeometry(rr, rf, len, seg || 12); g.rotateX(Math.PI / 2); geoCache[k] = g; }
    return geoCache[k];
  }
  function vcyl(r, h, seg) {
    const k = 'v' + r + ',' + h + ',' + (seg || 10);
    return geoCache[k] || (geoCache[k] = new THREE.CylinderGeometry(r, r, h, seg || 10));
  }
  function cone(r, len) {
    const k = 'k' + r + ',' + len;
    if (!geoCache[k]) { const g = new THREE.ConeGeometry(r, len, 14); g.rotateX(-Math.PI / 2); geoCache[k] = g; }
    return geoCache[k];
  }
  function sph(r) {
    const k = 's' + r;
    return geoCache[k] || (geoCache[k] = new THREE.SphereGeometry(r, 10, 8));
  }
  const MATDEF = {
    steel: [0x2b2e33, .6, .38], gun: [0x4a4f58, .55, .45], poly: [0x1d1d20, 0, .72],
    dark: [0x0e0f11, .3, .5], wood: [0x8a5a30, 0, .62], brass: [0xb08d3a, .8, .3],
    olive: [0x4f5a2f, .15, .6], shell: [0xaa2222, 0, .55], glove: [0x3a3d42, 0, .8],
    knuckle: [0x6a6d72, .1, .5], sleeve: [0x5a604a, 0, .92], cuff: [0x3b3f34, 0, .8]
  };
  function mat(key) {
    if (typeof key === 'number') key = 'gun';
    let m = matCache[key];
    if (m) return m;
    if (key === 'lens') {
      m = new THREE.MeshStandardMaterial({ color: 0x1b6fa8, roughness: .05, metalness: .2, transparent: true, opacity: .75, emissive: 0x0b3a5c });
    } else if (key === 'reddot') {
      m = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
    } else if (key === 'fiber') {
      m = new THREE.MeshBasicMaterial({ color: 0x66ff66 });
    } else {
      const d = MATDEF[key] || MATDEF.gun;
      m = new THREE.MeshStandardMaterial({ color: d[0], metalness: d[1], roughness: d[2] });
      m.emissive = new THREE.Color(d[0]).multiplyScalar(.14);
      if (key === 'wood') m.map = getWoodTex();
    }
    matCache[key] = m;
    return m;
  }
  function accMat(c) {
    if (!accCache[c]) {
      const m = new THREE.MeshStandardMaterial({ color: c, roughness: .4, metalness: .3 });
      m.emissive = new THREE.Color(c).multiplyScalar(.7);
      accCache[c] = m;
    }
    return accCache[c];
  }
  function put(g, geo, key, x, y, z, rx, ry, rz) {
    const m = new THREE.Mesh(geo, key === 'acc' ? accMat(g.userData.accent) : mat(key));
    m.position.set(x || 0, y || 0, z || 0);
    if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
    g.add(m);
    return m;
  }
  // shorthand: B(box) C(z-cylinder, front radius, rear radius)
  function B(g, w, h, d, key, x, y, z, rx, ry, rz) { return put(g, box(w, h, d), key, x, y, z, rx, ry, rz); }
  function C(g, r, len, key, x, y, z, seg) { return put(g, cyl(r, r, len, seg), key, x, y, z); }
  function CT(g, rf, rr, len, key, x, y, z, seg) { return put(g, cyl(rf, rr, len, seg), key, x, y, z); }

  // ---------- attachments ----------
  function addScope(g, kind, ry, rz) {
    const ud = g.userData;
    if (kind === 'reddot') {
      B(g, .03, .008, .06, 'dark', 0, ry + .004, rz);               // mount
      B(g, .034, .006, .052, 'steel', 0, ry + .012, rz);
      B(g, .004, .036, .05, 'steel', .016, ry + .03, rz);            // side walls
      B(g, .004, .036, .05, 'steel', -.016, ry + .03, rz);
      B(g, .034, .006, .052, 'steel', 0, ry + .05, rz);              // hood top
      B(g, .028, .03, .003, 'lens', 0, ry + .03, rz - .022);
      put(g, box(.004, .004, .002), 'reddot', 0, ry + .032, rz - .02);
      ud.sightY = ry + .032;
    } else if (kind === 'acog') {
      B(g, .028, .012, .1, 'dark', 0, ry + .006, rz);
      CT(g, .02, .017, .11, 'steel', 0, ry + .032, rz);
      CT(g, .026, .02, .03, 'dark', 0, ry + .032, rz - .065);        // objective
      CT(g, .02, .026, .03, 'dark', 0, ry + .032, rz + .065);        // eyepiece
      C(g, .019, .004, 'lens', 0, ry + .032, rz - .082);
      B(g, .008, .008, .09, 'fiber', 0, ry + .058, rz);              // fibre optic
      B(g, .014, .016, .022, 'dark', 0, ry + .052, rz + .005);
      ud.sightY = ry + .032;
    } else { // 'sniper' optic
      B(g, .03, .02, .03, 'dark', 0, ry + .01, rz - .06);
      B(g, .03, .02, .03, 'dark', 0, ry + .01, rz + .06);
      C(g, .028, .26, 'gun', 0, ry + .045, rz);
      CT(g, .04, .03, .06, 'dark', 0, ry + .045, rz - .16);
      CT(g, .03, .036, .05, 'dark', 0, ry + .045, rz + .15);
      C(g, .038, .004, 'lens', 0, ry + .045, rz - .19);
      put(g, vcyl(.01, .03), 'steel', 0, ry + .084, rz);
      put(g, vcyl(.01, .03), 'steel', .04, ry + .045, rz, 0, 0, Math.PI / 2);
      ud.sightY = ry + .045;
    }
  }

  // ---------- weapon meshes ----------
  // Gun points toward -Z, origin at the grip. userData: muzzle, muzzleZ, sightY, railY, railZ,
  // mag (Mesh or null), magPos, hand (support hand rest), gripPos, loadPos, cls
  function buildWeaponMesh(cls, rarity, opts) {
    opts = opts || {};
    const r = COD.RARITY ? COD.RARITY[Math.max(0, Math.min(4, rarity | 0))] : { color: 0xb0b0b0 };
    const g = new THREE.Group();
    g.userData.accent = r.color;
    const ud = g.userData;
    ud.cls = cls;
    ud.mag = null;
    let i;
    switch (cls) {
      case 'pistol':
        B(g, .032, .036, .19, 'steel', 0, .052, -.075);                    // slide
        B(g, .022, .006, .17, 'gun', 0, .074, -.075);                      // slide top
        for (i = 0; i < 4; i++) B(g, .034, .03, .004, 'dark', 0, .054, -.005 - i * .012); // serrations
        for (i = 0; i < 3; i++) B(g, .034, .014, .003, 'dark', 0, .056, -.12 - i * .014);
        B(g, .03, .026, .17, 'poly', 0, .022, -.065);                      // frame
        B(g, .026, .01, .05, 'poly', 0, .0, -.12);                         // dust cover rail
        C(g, .0075, .03, 'dark', 0, .052, -.178, 8);                       // barrel tip
        B(g, .008, .006, .06, 'steel', 0, -.008, -.045);                   // trigger guard bottom
        B(g, .008, .026, .006, 'poly', 0, .003, -.075);                    // guard front
        B(g, .006, .018, .006, 'dark', 0, .008, -.03);                     // trigger
        B(g, .034, .1, .048, 'poly', 0, -.05, .03, .2);                    // grip
        B(g, .036, .02, .052, 'poly', 0, -.098, .045, .2);                 // magwell flare
        B(g, .006, .02, .008, 'dark', 0, .084, .012);                      // rear sight
        B(g, .006, .014, .006, 'dark', 0, .08, -.165);                     // front sight
        B(g, .0345, .006, .09, 'acc', 0, .072, -.07);                      // rarity stripe
        B(g, .002, .05, .03, 'acc', .0175, -.045, .03, .2);
        ud.mag = B(g, .026, .1, .036, 'steel', 0, -.07, .04, .2);
        B(ud.mag, .03, .01, .042, 'poly', 0, -.05, 0);
        ud.magPos = new V3(0, -.07, .04);
        ud.muzzleZ = -.21; ud.sightY = .088; ud.railY = .077; ud.railZ = -.07;
        ud.hand = new V3(-.03, -.07, .035); ud.gripPos = new V3(.0, -.06, .035);
        break;
      case 'smg':
        B(g, .05, .07, .27, 'steel', 0, 0, -.1);                           // receiver
        B(g, .04, .012, .25, 'gun', 0, .041, -.1);                         // top cover
        C(g, .027, .13, 'gun', 0, .004, -.3, 14);                          // shroud
        for (i = 0; i < 4; i++) B(g, .018, .006, .012, 'dark', 0, .03, -.26 - i * .03); // vents
        C(g, .0105, .08, 'steel', 0, .004, -.405, 10);                     // barrel
        C(g, .016, .12, 'dark', 0, .004, -.47, 12);                        // suppressor
        B(g, .005, .005, .2, 'steel', .02, .012, .2);                      // folding stock wires
        B(g, .005, .005, .2, 'steel', -.02, .012, .2);
        B(g, .044, .075, .014, 'poly', 0, .012, .31);                      // butt pad
        B(g, .034, .094, .05, 'poly', 0, -.08, .02, .25);                  // grip
        B(g, .008, .006, .05, 'steel', 0, -.04, -.03);                     // trigger guard
        B(g, .006, .016, .006, 'dark', 0, -.03, -.01);
        B(g, .012, .012, .045, 'steel', .032, .02, -.17);                  // charging handle
        B(g, .004, .024, .05, 'dark', .026, .015, -.06);                   // ejection port
        B(g, .054, .008, .18, 'acc', 0, .047, -.1);                        // rarity stripe
        B(g, .01, .03, .016, 'steel', 0, .064, -.02);                      // rear sight
        B(g, .008, .034, .008, 'steel', 0, .064, -.36);                    // front sight
        ud.mag = B(g, .03, .16, .045, 'steel', 0, -.14, -.1, -.1);
        B(ud.mag, .034, .01, .05, 'poly', 0, -.08, 0);
        for (i = 0; i < 4; i++) B(ud.mag, .032, .003, .047, 'dark', 0, .05 - i * .03, 0);
        ud.magPos = new V3(0, -.14, -.1);
        ud.muzzleZ = -.53; ud.sightY = .1; ud.railY = .052; ud.railZ = -.1;
        ud.hand = new V3(0, -.06, -.28); ud.gripPos = new V3(0, -.08, .02);
        break;
      case 'shotgun':
        B(g, .052, .078, .26, 'steel', 0, 0, -.1);                         // receiver
        B(g, .004, .02, .08, 'dark', .027, .01, -.06);                     // ejection port
        B(g, .054, .02, .1, 'dark', 0, -.045, -.05);                       // loading port guard
        C(g, .0185, .66, 'steel', 0, .018, -.62, 14);                      // barrel
        B(g, .008, .006, .6, 'dark', 0, .039, -.62);                       // vent rib
        C(g, .015, .56, 'gun', 0, -.032, -.56, 12);                        // magazine tube
        C(g, .019, .012, 'dark', 0, -.032, -.84, 10);                      // tube cap
        B(g, .066, .052, .17, 'wood', 0, -.04, -.5);                       // pump
        for (i = 0; i < 5; i++) B(g, .068, .054, .005, 'dark', 0, -.04, -.44 - i * .03);
        B(g, .072, .008, .05, 'acc', 0, -.012, -.5);                       // rarity band
        B(g, .048, .1, .3, 'wood', 0, -.02, .28, .1);                      // stock
        B(g, .05, .11, .012, 'dark', 0, -.025, .435, .1);                  // butt plate
        B(g, .034, .09, .046, 'wood', 0, -.075, .03, .25);                 // pistol grip
        B(g, .008, .006, .06, 'steel', 0, -.048, -.03);                    // trigger guard
        B(g, .006, .016, .006, 'dark', 0, -.036, -.01);
        for (i = 0; i < 3; i++) {                                           // side-saddle shells
          put(g, vcyl(.0075, .035, 8), 'shell', .03, .018 - i * .02, -.04, 0, 0, 0);
          put(g, vcyl(.0078, .008, 8), 'brass', .03, .0 - i * .02 + .0, -.04);
        }
        put(g, sph(.007), 'dark', 0, .044, -.945);                         // bead sight
        ud.magPos = null;
        ud.muzzleZ = -.96; ud.sightY = .08; ud.railY = .045; ud.railZ = -.1;
        ud.hand = new V3(0, -.05, -.5); ud.gripPos = new V3(0, -.08, .03);
        ud.loadPos = new V3(0, -.07, -.06);
        break;
      case 'sniper':
        B(g, .05, .075, .34, 'steel', 0, 0, -.1);                          // receiver
        B(g, .04, .01, .3, 'gun', 0, .042, -.1);
        CT(g, .011, .016, .72, 'steel', 0, .01, -.8, 14);                  // tapered barrel
        CT(g, .021, .021, .07, 'dark', 0, .01, -1.15, 12);                 // muzzle brake
        for (i = 0; i < 3; i++) B(g, .05, .008, .008, 'steel', 0, .01, -1.13 - i * .02);
        B(g, .05, .11, .34, 'poly', 0, -.02, .3, .08);                     // stock
        B(g, .04, .03, .13, 'poly', 0, .05, .28, .08);                     // cheek riser
        B(g, .052, .12, .016, 'dark', 0, -.015, .47, .08);                 // recoil pad
        B(g, .052, .012, .22, 'acc', 0, .062, .3, .08);                    // rarity stripe on stock
        B(g, .054, .05, .16, 'poly', 0, -.04, -.35);                       // forend
        B(g, .008, .008, .32, 'steel', .026, -.075, -.6);                  // folded bipod
        B(g, .008, .008, .32, 'steel', -.026, -.075, -.6);
        B(g, .05, .012, .012, 'steel', .05, .02, .02);                     // bolt handle
        put(g, sph(.015), 'dark', .078, .02, .02);
        B(g, .008, .006, .06, 'steel', 0, -.048, .0);                      // trigger guard
        B(g, .034, .09, .046, 'poly', 0, -.075, .06, .25);
        addScope(g, 'sniper', .085, -.12);                                 // built-in optic
        C(g, .0305, .012, 'acc', 0, .13, -.2);                             // accent ring
        ud.mag = B(g, .035, .07, .07, 'poly', 0, -.075, -.1);
        ud.magPos = new V3(0, -.075, -.1);
        ud.muzzleZ = -1.2; ud.sightY = .13; ud.railY = .085; ud.railZ = -.12; ud.builtInScope = true;
        ud.hand = new V3(0, -.06, -.5); ud.gripPos = new V3(0, -.08, .06);
        break;
      case 'rpg':
        C(g, .045, 1.0, 'gun', 0, .02, -.3, 16);                           // tube
        C(g, .048, .34, 'wood', 0, .02, -.1, 16);                          // heat shield wrap
        CT(g, .09, .045, .12, 'steel', 0, .02, .31, 16);                   // rear flare
        CT(g, .06, .045, .08, 'steel', 0, .02, -.8, 16);                   // front lip
        C(g, .06, .16, 'olive', 0, .02, -.86, 14);                         // warhead body
        put(g, cone(.06, .2), 'olive', 0, .02, -1.04);                     // nose
        C(g, .049, .03, 'acc', 0, .02, -.5, 16);                           // rarity ring
        B(g, .034, .1, .048, 'poly', 0, -.07, .0, .2);                     // rear grip
        B(g, .03, .09, .04, 'poly', 0, -.07, -.3);                         // fore grip
        B(g, .008, .006, .05, 'steel', 0, -.04, -.03);
        B(g, .015, .04, .06, 'steel', .045, .075, -.1);                    // optic
        B(g, .008, .03, .008, 'steel', 0, .085, -.7);
        B(g, .01, .01, .05, 'brass', 0, .07, .0);
        ud.magPos = null;
        ud.muzzleZ = -1.1; ud.sightY = .1; ud.railY = .07; ud.railZ = -.1;
        ud.hand = new V3(0, -.09, -.3); ud.gripPos = new V3(0, -.09, .0);
        ud.loadPos = new V3(0, .02, -.85);
        break;
      case 'mortar':
        C(g, .07, .6, 'gun', 0, .02, -.3, 16);
        CT(g, .09, .07, .06, 'steel', 0, .02, -.6, 16);                    // muzzle collar
        C(g, .076, .04, 'acc', 0, .02, -.45, 16);
        B(g, .2, .03, .2, 'steel', 0, -.02, .02);                          // base plate
        for (i = 0; i < 4; i++) B(g, .02, .02, .02, 'dark', (i % 2 ? .08 : -.08), -.04, (i < 2 ? -.06 : .1));
        B(g, .02, .02, .34, 'steel', .1, -.08, -.28, 0, -.2);              // bipod legs
        B(g, .02, .02, .34, 'steel', -.1, -.08, -.28, 0, .2);
        B(g, .04, .03, .04, 'dark', 0, -.06, -.32);
        B(g, .034, .1, .048, 'poly', 0, -.08, .0, .2);
        put(g, vcyl(.025, .03, 14), 'brass', 0, .1, -.12);                 // sight dial
        B(g, .01, .04, .01, 'steel', 0, .125, -.12);
        ud.magPos = null;
        ud.muzzleZ = -.65; ud.sightY = .13; ud.railY = .1; ud.railZ = -.12;
        ud.hand = new V3(0, -.09, -.3); ud.gripPos = new V3(0, -.09, .0);
        ud.loadPos = new V3(0, .05, -.6);
        break;
      default: // 'ar'
        B(g, .052, .06, .3, 'gun', 0, .022, -.15);                         // upper receiver
        B(g, .05, .052, .2, 'steel', 0, -.026, -.1);                       // lower receiver
        B(g, .022, .008, .3, 'steel', 0, .058, -.15);                      // top rail
        for (i = 0; i < 9; i++) B(g, .026, .005, .008, 'dark', 0, .062, -.03 - i * .033);
        B(g, .004, .024, .05, 'dark', .027, .03, -.1);                     // ejection port
        B(g, .01, .01, .035, 'steel', .03, .045, -.04);                    // forward assist
        C(g, .034, .3, 'poly', 0, .012, -.46, 14);                         // handguard
        for (i = 0; i < 4; i++) {                                           // vent slots
          B(g, .07, .008, .018, 'dark', 0, .012, -.35 - i * .06);
        }
        B(g, .01, .008, .28, 'steel', 0, .045, -.46);                      // handguard top rail
        B(g, .004, .016, .2, 'acc', .0345, .012, -.46);                    // rarity stripes
        B(g, .004, .016, .2, 'acc', -.0345, .012, -.46);
        C(g, .0095, .2, 'steel', 0, .012, -.74, 10);                       // barrel
        B(g, .022, .026, .03, 'dark', 0, .03, -.64);                       // gas block
        B(g, .006, .045, .006, 'dark', 0, .06, -.64);                      // front sight post
        C(g, .016, .06, 'dark', 0, .012, -.86, 10);                        // flash hider
        for (i = 0; i < 3; i++) B(g, .034, .004, .01, 'steel', 0, .012, -.845 - i * .015);
        C(g, .016, .2, 'dark', 0, .012, .2, 10);                           // buffer tube
        B(g, .044, .088, .15, 'poly', 0, -.005, .265, .05);                // stock
        B(g, .046, .1, .014, 'dark', 0, -.005, .345, .05);                 // butt pad
        B(g, .034, .095, .046, 'poly', 0, -.085, .03, .3);                 // pistol grip
        B(g, .008, .006, .05, 'steel', 0, -.05, -.025);                    // trigger guard
        B(g, .006, .016, .006, 'dark', 0, -.04, -.01);
        B(g, .04, .04, .075, 'steel', 0, -.06, -.12);                      // magwell
        B(g, .028, .012, .026, 'steel', 0, .056, .0);                      // charging handle
        B(g, .012, .03, .012, 'steel', 0, .074, -.02);                     // rear sight
        ud.mag = B(g, .034, .17, .058, 'poly', 0, -.14, -.12, -.15);
        for (i = 0; i < 4; i++) B(ud.mag, .036, .003, .06, 'dark', 0, .05 - i * .03, 0);
        B(ud.mag, .038, .01, .062, 'steel', 0, -.085, 0);
        ud.magPos = new V3(0, -.14, -.12);
        ud.muzzleZ = -.9; ud.sightY = .108; ud.railY = .062; ud.railZ = -.14;
        ud.hand = new V3(0, -.04, -.42); ud.gripPos = new V3(0, -.09, .03);
        break;
    }
    // optional scope attachment (non-sniper classes)
    if (opts.scope && opts.scope !== 'none' && !ud.builtInScope && cls !== 'rpg' && cls !== 'mortar') {
      addScope(g, opts.scope, ud.railY, ud.railZ);
    }
    // magazine size look
    if (ud.mag && opts.mag === 'extended') { ud.mag.scale.set(1, 1.35, 1); ud.mag.position.y -= ud.mag.geometry.parameters.height * .17; }
    else if (ud.mag && opts.mag === 'drum') { ud.mag.scale.set(1.7, 1.05, 1.9); ud.mag.position.y -= ud.mag.geometry.parameters.height * .03; }
    if (ud.mag) ud.magPos = ud.mag.position.clone();
    const mz = new THREE.Object3D();
    mz.position.set(0, ud.railY - .03, ud.muzzleZ);
    g.add(mz);
    ud.muzzle = mz;
    g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; } });
    return g;
  }

  // ---------- first-person model (gun + gloved hands + sleeves) ----------
  const sleeveGeo = (function () {
    const g = new THREE.CylinderGeometry(.68, .5, 1, 12); g.rotateX(Math.PI / 2); return g;
  })();
  const cuffGeo = (function () {
    const g = new THREE.CylinderGeometry(.5, .5, 1, 12); g.rotateX(Math.PI / 2); return g;
  })();
  const _z = new V3(0, 0, 1), _dir = new V3(), _mid = new V3(), _st = new V3();
  function placeLimb(mesh, a, b, w) {
    _dir.subVectors(b, a);
    const len = _dir.length();
    if (len < 1e-5) return;
    _dir.multiplyScalar(1 / len);
    _mid.addVectors(a, b).multiplyScalar(.5);
    mesh.position.copy(_mid);
    mesh.quaternion.setFromUnitVectors(_z, _dir);
    mesh.scale.set(w, w, len);
  }
  // sleeve starts a little behind the glove (so the wrist/cuff shows)
  function placeArm(mesh, hand, far, w) {
    _dir.subVectors(far, hand).normalize();
    _st.copy(hand).addScaledVector(_dir, .05);
    placeLimb(mesh, _st, far, w);
  }

  // right hand wrapped around the pistol grip, fingers curled on the front, thumb on the side
  function makeRightHand(gp) {
    const h = new THREE.Group();
    const add = function (w, hh, d, key, x, y, z, rz) {
      const m = new THREE.Mesh(box(w, hh, d), mat(key));
      m.position.set(gp.x + x, gp.y + y, gp.z + z);
      if (rz) m.rotation.z = rz;
      h.add(m);
    };
    add(.052, .075, .022, 'glove', 0, .0, .03);                       // palm behind the grip
    add(.054, .02, .03, 'knuckle', 0, .03, .03);
    for (let i = 0; i < 4; i++) {                                        // fingers across the front
      add(.05, .016, .026, 'glove', 0, .03 - i * .02, -.022);
      add(.052, .006, .004, 'knuckle', 0, .03 - i * .02, -.036);
    }
    add(.016, .016, .05, 'glove', -.03, .035, -.01);                    // thumb
    add(.04, .03, .03, 'glove', 0, .06, .03);                           // web of thumb
    return h;
  }
  // left (support) hand under the handguard: palm below, fingers wrapped up the LEFT side
  // (the side the camera sees) with fingertips over the top, thumb on the far side. Origin = handguard centre - .05 y.
  function makeLeftHand() {
    const h = new THREE.Group();
    const add = function (w, hh, d, key, x, y, z, rx, rz) {
      const m = new THREE.Mesh(box(w, hh, d), mat(key));
      m.position.set(x, y, z);
      if (rx) m.rotation.x = rx;
      if (rz) m.rotation.z = rz;
      h.add(m);
    };
    add(.075, .03, .105, 'glove', 0, -.03, 0);                           // palm under the guard
    add(.08, .014, .035, 'knuckle', 0, -.03, -.06);                      // heel/knuckle strip
    for (let i = 0; i < 4; i++) {
      const z = .036 - i * .024;
      add(.016, .06, .021, 'glove', -.046, .02, z);                      // finger up the left side
      add(.036, .016, .021, 'glove', -.026, .06, z, 0, 0);               // fingertip over the top
      add(.004, .012, .018, 'knuckle', -.056, .035, z);                  // knuckle highlight
    }
    add(.02, .02, .06, 'glove', .04, .0, -.01);                          // thumb on the far side
    return h;
  }

  let flashObj = null;
  function getFlash() {
    if (flashObj) return flashObj;
    const g = new THREE.Group();
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getFlashTex(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: true
    }));
    sp.scale.set(.2, .2, .2);
    g.add(sp);
    const sm = new THREE.MeshBasicMaterial({ map: getStreakTex(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const pgA = new THREE.PlaneGeometry(.3, .08); pgA.rotateY(Math.PI / 2);
    const pgB = new THREE.PlaneGeometry(.3, .08); pgB.rotateX(Math.PI / 2); pgB.rotateY(Math.PI / 2);
    [pgA, pgB].forEach(function (pg) {
      const p = new THREE.Mesh(pg, sm);
      p.position.z = -.16;
      g.add(p);
    });
    // one shared short-lived light
    const light = new THREE.PointLight(0xffb060, 0, 7, 2);
    light.position.z = -.08;
    g.add(light);
    g.userData.sprite = sp; g.userData.light = light;
    g.visible = false;
    flashObj = g;
    return g;
  }

  function buildFP(cls, rarity, opts) {
    const gun = buildWeaponMesh(cls, rarity, opts);
    const ud = gun.userData;
    const grp = new THREE.Group();
    grp.add(gun);
    const fp = { group: grp, gun: gun, ud: ud, mag: ud.mag };
    fp.handR = makeRightHand(ud.gripPos);
    grp.add(fp.handR);
    fp.armR = new THREE.Mesh(sleeveGeo, mat('sleeve'));
    fp.cuffR = new THREE.Mesh(cuffGeo, mat('cuff')); grp.add(fp.cuffR);
    grp.add(fp.armR);
    const w0 = new V3(ud.gripPos.x, ud.gripPos.y - .02, ud.gripPos.z + .03);
    _dir.set(.28, -.42, .6).normalize();
    _st.copy(w0).addScaledVector(_dir, .05);
    placeLimb(fp.armR, _st, new V3(w0.x + .28, w0.y - .42, w0.z + .6), .09);
    _st.copy(w0).addScaledVector(_dir, .015);
    placeLimb(fp.cuffR, _st, new V3(w0.x + _dir.x * .06, w0.y + _dir.y * .06, w0.z + _dir.z * .06), .074);
    fp.handL = makeLeftHand();
    grp.add(fp.handL);
    fp.armL = new THREE.Mesh(sleeveGeo, mat('sleeve'));
    fp.cuffL = new THREE.Mesh(cuffGeo, mat('cuff')); grp.add(fp.cuffL);
    grp.add(fp.armL);
    fp.flash = getFlash();               // shared, re-parented on attach
    grp.traverse(function (o) { o.frustumCulled = false; o.castShadow = false; o.receiveShadow = false; });
    return fp;
  }

  // ---------- state ----------
  let root = null, pivot = null, baseFov = 75;
  const modelCache = {};
  let cur = null;          // current fp model
  let curInst = null;
  let t = 0;
  let bobPhase = 0, sprintBlend = 0, swayY = 0, swayX = 0, lastYaw = 0, lastPitch = 0;
  let kickZ = 0, kickRot = 0, flashT = 0;
  let swap = null;         // {t, dur, switched}
  let reload = null;       // {t, dur}
  let throwT = 0;
  let adsE = 0;
  const hand = new V3(), magOff = new V3();
  const _a = new V3(), _b = new V3(), _c = new V3(), _arm = new V3();
  let magVis = true;
  let tilt = 0;

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function ease(k) { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); }

  function getInst(p) {
    if (COD.currentWeapon) return COD.currentWeapon(p);
    return p.weapons ? p.weapons[p.weaponIndex] || null : null;
  }

  function modelFor(inst) {
    const cls = (inst.def && inst.def.cls) || 'ar';
    const key = (inst.defId || cls) + '|' + inst.rarity + '|' + inst.scope + '|' + inst.mag;
    let m = modelCache[key];
    if (!m) { m = modelCache[key] = buildFP(cls, inst.rarity | 0, { scope: inst.scope, mag: inst.mag }); }
    return m;
  }

  function attach(inst) {
    if (cur) pivot.remove(cur.group);
    cur = null;
    curInst = inst;
    if (!inst) return;
    cur = modelFor(inst);
    pivot.add(cur.group);
    if (cur.mag) { cur.mag.visible = true; cur.mag.position.copy(cur.ud.magPos); }
    cur.group.add(cur.flash);
    cur.flash.position.set(0, cur.ud.railY - .03, cur.ud.muzzleZ - .01);
    cur.flash.visible = false;
    cur.flash.userData.light.intensity = 0;
    magVis = true;
  }

  // reload pose: fills hand, magOff, magVis, tilt for progress u (0..1)
  function reloadPose(u) {
    const ud = cur.ud;
    hand.copy(ud.hand);
    magOff.set(0, 0, 0);
    magVis = true;
    tilt = 0;
    if (ud.mag && ud.magPos) {
      const mp = ud.magPos;
      _a.set(mp.x, mp.y - .06, mp.z);                 // hand on mag
      _b.set(mp.x - .03, mp.y - .34, mp.z + .08);     // pulled down
      _c.set(mp.x - .05, mp.y - .55, mp.z + .12);     // out of sight
      if (u < .2) { const k = ease(u / .2); hand.lerpVectors(ud.hand, _a, k); tilt = k; }
      else if (u < .4) { const k = ease((u - .2) / .2); hand.lerpVectors(_a, _b, k); magOff.subVectors(hand, _a); tilt = 1; }
      else if (u < .55) { const k = ease((u - .4) / .15); hand.lerpVectors(_b, _c, k); magVis = false; tilt = 1; }
      else if (u < .72) { const k = ease((u - .55) / .17); hand.lerpVectors(_c, _a, k); magOff.subVectors(hand, _a); tilt = 1; }
      else if (u < .82) { hand.copy(_a); tilt = 1; }
      else { const k = ease((u - .82) / .18); hand.lerpVectors(_a, ud.hand, k); tilt = 1 - k; }
    } else if (ud.loadPos) {
      const n = ud.cls === 'shotgun' ? 3 : 1;
      const local = (u * n) % 1;
      const k = Math.sin(Math.PI * Math.min(1, local));
      hand.lerpVectors(ud.hand, ud.loadPos, k);
      tilt = .7 * Math.sin(Math.PI * clamp(u, 0, 1));
    }
  }

  // ---------- init ----------
  function init() {
    root = new THREE.Group();
    root.name = 'viewmodel';
    pivot = new THREE.Group();
    root.add(pivot);
    root.visible = false;
    if (COD.camera) {
      COD.camera.add(root);
      baseFov = COD.camera.fov || 75;
    }
    COD.on('fire', function (d) {
      if (!d || d.actor !== COD.player || !cur) return;
      const st = d.inst && d.inst.stats;
      const rec = st ? Math.min(6, st.recoil || 1) : 1;
      const cls = cur.ud.cls;
      const m = cls === 'shotgun' ? 2 : cls === 'sniper' ? 2.5 : (cls === 'rpg' || cls === 'mortar') ? 3 : cls === 'pistol' ? 1.1 : 1;
      kickZ = Math.min(.14, kickZ + (.02 + .008 * rec) * m * (1 - .5 * adsE));
      kickRot = Math.min(.35, kickRot + (.015 + .006 * rec) * m * (1 - .4 * adsE));
      flashT = .05;
    });
    COD.on('reload', function (d) {
      if (!d || d.actor !== COD.player) return;
      reload = { t: 0, dur: Math.max(.3, d.time || (d.inst && d.inst.stats && d.inst.stats.reloadTime) || 2) };
    });
    COD.on('swap', function (d) {
      if (!d || d.actor !== COD.player) return;
      reload = null;
      swap = { t: 0, switched: false };
    });
    COD.on('spawn', function (d) {
      if (d && d.actor === COD.player) { reload = null; swap = null; throwT = 0; kickZ = kickRot = 0; }
    });
  }

  function playThrow() { throwT = .55; }

  // ---------- update ----------
  function update(dt) {
    const p = COD.player;
    if (!root || !p) return;
    t += dt;

    const inst = getInst(p);
    const mortarOpen = COD.mortar && COD.mortar.isOpen;
    let show = p.alive && !p.eliminated && !p.vehicle && !p.hidden && !mortarOpen && !!inst &&
      !(COD.state && COD.state.cameraOverride);
    const fpState = p.fp || { ads: 0, scoped: false };
    if (!show) {
      root.visible = false;
      if (COD.camera && Math.abs(COD.camera.fov - baseFov) > .01 && !(COD.state && COD.state.cameraOverride)) {
        COD.camera.fov = baseFov; COD.camera.updateProjectionMatrix();
      }
      lastYaw = p.yaw; lastPitch = p.pitch;
      return;
    }

    // weapon changed without a swap event (pickup / test mode): treat as a swap
    if (!cur) attach(inst);
    else if (inst !== curInst && !swap) swap = { t: 0, switched: false };
    // rebuild if attachments / rarity changed on the same instance
    if (cur && inst === curInst && modelFor(inst) !== cur) { attach(inst); }

    // swap animation
    let swapLow = 0;
    if (swap) {
      swap.t += dt;
      const LOW = .17, RAISE = .23;
      if (swap.t < LOW) swapLow = ease(swap.t / LOW);
      else {
        if (!swap.switched) { swap.switched = true; attach(inst); reload = reload && inst.reloading ? reload : null; }
        swapLow = 1 - ease((swap.t - LOW) / RAISE);
        if (swap.t >= LOW + RAISE) swap = null;
      }
    }
    if (!cur) { root.visible = false; return; }

    // sprint / ADS / movement
    const ads = clamp(fpState.ads || 0, 0, 1);
    adsE = ease(ads);
    sprintBlend = lerp(sprintBlend, p.sprinting ? 1 : 0, Math.min(1, dt * 9));
    const sp = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z);
    const moving = p.onGround && !p.crouching ? clamp(sp / 5, 0, 1.6) : (p.onGround ? clamp(sp / 5, 0, 1) * .6 : 0);
    bobPhase += dt * (p.sprinting ? 11 : 8) * (sp > .3 ? 1 : 0);
    const bobScale = moving * (p.sprinting ? 1.5 : 1) * (1 - .85 * adsE);

    // view sway from look changes
    let dyaw = p.yaw - lastYaw;
    if (dyaw > Math.PI) dyaw -= 2 * Math.PI; else if (dyaw < -Math.PI) dyaw += 2 * Math.PI;
    const dpitch = p.pitch - lastPitch;
    lastYaw = p.yaw; lastPitch = p.pitch;
    const sk = Math.min(1, dt * 9);
    const ty = dt > 0 ? clamp(-dyaw / dt * .012, -.09, .09) : 0;
    const tx = dt > 0 ? clamp(-dpitch / dt * .012, -.07, .07) : 0;
    swayY = lerp(swayY, ty * (1 - .7 * adsE), sk);
    swayX = lerp(swayX, tx * (1 - .7 * adsE), sk);

    // spring-back of recoil
    const rk = Math.min(1, dt * 13);
    kickZ = lerp(kickZ, 0, rk);
    kickRot = lerp(kickRot, 0, rk);

    // reload progress
    tilt = 0; magVis = true; magOff.set(0, 0, 0); hand.copy(cur.ud.hand);
    if (reload) {
      reload.t += dt;
      if (reload.t >= reload.dur || (reload.t > .15 && inst.reloading === false)) reload = null;
      else reloadPose(reload.t / reload.dur);
    }

    // throw dip
    let throwK = 0;
    if (throwT > 0) { throwT -= dt; throwK = Math.sin(Math.PI * clamp(1 - throwT / .55, 0, 1)); }

    // ---- compose pose ----
    const ud = cur.ud;
    const adsW = adsE * (1 - .7 * tilt);
    let px = lerp(.16, 0, adsW), py = lerp(-.185, -ud.sightY, adsW), pz = lerp(-.48, -.32, adsW);
    let rx = 0, ry = 0, rz = 0;
    // sprint pose
    const sw = sprintBlend * (1 - adsE);
    px = lerp(px, .13, sw); py = lerp(py, -.3, sw); pz = lerp(pz, -.28, sw);
    rx += -.4 * sw; ry += .6 * sw; rz += .3 * sw;
    // idle breathing + walk bob
    const br = Math.sin(t * 1.6) * .0025 * (1 - .8 * adsE);
    py += br;
    px += Math.cos(bobPhase) * .012 * bobScale;
    py += Math.abs(Math.sin(bobPhase)) * -.014 * bobScale + Math.sin(bobPhase * 2) * .004 * bobScale * (p.sprinting ? 1 : 0);
    rz += Math.cos(bobPhase) * .02 * bobScale;
    if (!p.onGround) { py -= .015; rx += .02; }
    // sway
    ry += swayY; rx += swayX; px += swayY * .5; py += swayX * .4;
    // recoil
    pz += kickZ; rx += kickRot; py += kickRot * .08;
    // reload tilt
    rz += .35 * tilt; rx += .22 * tilt; px -= .04 * tilt; py += .03 * tilt;
    // swap lowering
    py -= .36 * swapLow; rx -= .7 * swapLow; ry += .2 * swapLow;
    // throw
    py -= .2 * throwK; rx -= .5 * throwK; px -= .08 * throwK;

    pivot.position.set(px, py, pz);
    pivot.rotation.set(rx, ry, rz);

    // hands / mag
    cur.handL.position.copy(hand);
    const rs = root.scale.x || 1;
    _arm.set(-.4 / rs - pivot.position.x, -.85 / rs - pivot.position.y, -.7 / rs - pivot.position.z);
    placeArm(cur.armL, hand, _arm, .09);
    _dir.subVectors(_arm, hand).normalize();
    _st.copy(hand).addScaledVector(_dir, .02);
    _mid.copy(hand).addScaledVector(_dir, .065);
    placeLimb(cur.cuffL, _st, _mid, .08);
    if (cur.mag) {
      cur.mag.visible = magVis;
      cur.mag.position.copy(ud.magPos).add(magOff);
    }

    // muzzle flash (shared sprite + streaks + one tiny light)
    const fl = cur.flash;
    if (flashT > 0) {
      flashT -= dt;
      fl.visible = flashT > 0;
      if (fl.visible) {
        const k = .6 + Math.random() * .8;
        const sc = (cur.ud.cls === 'shotgun' || cur.ud.cls === 'sniper' || cur.ud.cls === 'rpg' ? .34 : .22) * k;
        fl.userData.sprite.scale.set(sc, sc, sc);
        fl.userData.sprite.material.rotation = Math.random() * 6.28;
        fl.rotation.z = Math.random() * 6.28;
        fl.userData.light.intensity = 1.6 * k;
      } else fl.userData.light.intensity = 0;
    } else if (fl.visible) { fl.visible = false; fl.userData.light.intensity = 0; }

    // FOV + gun scale compensation
    let zoom = 1;
    const st = inst.stats;
    const cls = inst.def && inst.def.cls;
    if (cls !== 'mortar') zoom = clamp((st && st.zoom) || (inst.def && inst.def.adsZoom) || 1, 1, 10);
    const zoomNow = lerp(1, zoom, adsE);
    const tanB = Math.tan(baseFov * Math.PI / 360);
    const fov = 2 * Math.atan(tanB / zoomNow) * 180 / Math.PI + 4 * sprintBlend * (1 - adsE);
    if (COD.camera && Math.abs(COD.camera.fov - fov) > .01) { COD.camera.fov = fov; COD.camera.updateProjectionMatrix(); }
    const sc = 1 / zoomNow;
    root.scale.set(sc, sc, sc);

    // hide gun fully behind a sniper scope overlay
    root.visible = !(fpState.scoped && adsE > .95);
  }

  COD.viewmodel = {
    init: init,
    update: update,
    buildWeaponMesh: buildWeaponMesh,
    playThrow: playThrow,
    get root() { return root; }
  };
})();

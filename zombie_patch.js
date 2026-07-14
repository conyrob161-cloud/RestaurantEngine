(() => {
  if (window.__rzZombiePatchActive || !window.THREE) return;
  window.__rzZombiePatchActive = true;

  const originalRender = THREE.WebGLRenderer.prototype.render;
  const zombies = [];
  const soldiers = [];
  const effects = [];
  const meta = new WeakMap();
  const zombieStates = new WeakMap();
  const pathPoints = [
    { x: 10.5, z: 0.9 },
    { x: 10.5, z: 7.2 },
    { x: 10.5, z: 10.5 },
    { x: 10.5, z: 17.4 },
  ];

  let sceneRef = null;
  let cameraRef = null;
  let worldBuilt = false;
  let lastFrame = performance.now();
  let lastSpawnAt = 0;
  let lastNightState = null;
  let nightIndex = 0;
  let bossSpawnedThisNight = false;
  const startTime = performance.now();
  const cycleMs = 180000;
  const dayRatio = 0.64;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerpAngle = (a, b, t) => {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  };
  const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
  const rand = (seed) => {
    let x = (seed ^ 0x9e3779b9) >>> 0;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
  const randRange = (seed, a, b) => a + (b - a) * rand(seed);

  function makeMat(color, roughness = 0.96) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, flatShading: true, side: THREE.DoubleSide });
  }

  function box(parent, w, h, d, color, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), makeMat(color));
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  function faceTexture(seed, kind) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const ctx = c.getContext('2d');
    const skin = kind === 'boss' ? '#8cae77' : ['#92b57c', '#8daa78', '#9bb884'][seed % 3];
    const hood = kind === 'boss' ? '#64407b' : ['#495d41', '#3f5438', '#546a49'][seed % 3];
    ctx.fillStyle = skin;
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = hood;
    ctx.fillRect(0, 0, 128, 28);
    ctx.fillRect(8, 20, 24, 26);
    ctx.fillRect(96, 20, 24, 26);
    ctx.fillStyle = '#102010';
    ctx.fillRect(34, 50, 12, 12);
    ctx.fillRect(82, 50, 12, 12);
    ctx.fillStyle = '#f3e9c8';
    ctx.fillRect(37, 52, 3, 3);
    ctx.fillRect(85, 52, 3, 3);
    ctx.fillStyle = kind === 'boss' ? '#2d143e' : '#3a1d16';
    ctx.fillRect(50, 80, kind === 'boss' ? 32 : 28, 6);
    ctx.fillStyle = kind === 'boss' ? '#5f2f88' : '#5c2a22';
    ctx.fillRect(46, 76, kind === 'boss' ? 40 : 36, 3);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }

  function makeLabelSprite(text, bg = '#111827', fg = '#fff', scaleX = 1.6, scaleY = 0.6) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = bg;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.beginPath();
    const rr = 28;
    ctx.moveTo(24 + rr, 44);
    ctx.lineTo(488 - rr, 44);
    ctx.quadraticCurveTo(488, 44, 488, 44 + rr);
    ctx.lineTo(488, 212 - rr);
    ctx.quadraticCurveTo(488, 212, 488 - rr, 212);
    ctx.lineTo(24 + rr, 212);
    ctx.quadraticCurveTo(24, 212, 24, 212 - rr);
    ctx.lineTo(24, 44 + rr);
    ctx.quadraticCurveTo(24, 44, 24 + rr, 44);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 54px system-ui, Arial';
    ctx.fillText(text, 256, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.scale.set(scaleX, scaleY, 1);
    return sprite;
  }

  function makePathSegment(x, z, len = 0.66, width = 1.15) {
    return new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.06, len),
      new THREE.MeshStandardMaterial({ color: 0x3a2f29, roughness: 1 })
    );
  }

  function createPath(scene) {
    if (scene.userData.__rzPathBuilt) return;
    scene.userData.__rzPathBuilt = true;
    const g = new THREE.Group();
    g.name = '__rzPath';
    const pathMat = new THREE.MeshStandardMaterial({ color: 0x362923, roughness: 1 });
    const curbMat = new THREE.MeshStandardMaterial({ color: 0x67513f, roughness: 1 });
    for (let z = 1; z <= 17.3; z += 0.72) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.05, 0.66), pathMat);
      seg.position.set(10.5, 0.03, z);
      g.add(seg);
      const left = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.66), curbMat);
      left.position.set(9.98, 0.08, z);
      g.add(left);
      const right = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.66), curbMat);
      right.position.set(11.02, 0.08, z);
      g.add(right);
    }
    const entrance = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 1.2), new THREE.MeshStandardMaterial({ color: 0x4f3b2d, roughness: 1 }));
    entrance.position.set(10.5, 0.04, 7.4);
    g.add(entrance);
    const sign = makeLabelSprite('Cesta k restauraci', '#121826', '#fff', 2.2, 0.7);
    sign.position.set(10.5, 2.8, 6.4);
    g.add(sign);
    scene.add(g);
  }

  function makeZombie(seed, x, z, boss = false) {
    const g = new THREE.Group();
    g.name = boss ? '__rz_boss' : '__rz_zombie';
    g.position.set(x, 0, z);
    g.userData.type = boss ? 'bossZombie' : 'zombie';
    g.userData.hp = boss ? 28 : 6;
    g.userData.maxHp = g.userData.hp;
    g.userData.boss = boss;
    g.userData.dead = false;
    g.userData.phase = rand(seed) * Math.PI * 2;
    g.userData.walkSeed = seed;
    g.userData.pathIndex = 0;
    g.userData.speed = boss ? 0.26 : 0.42 + rand(seed) * 0.12;
    g.userData.damage = boss ? 6 : 1;
    g.userData.hitFlash = 0;
    g.scale.setScalar(boss ? 1.65 : 1.02);

    const bodyColor = boss ? 0x4f365f : [0x45613d, 0x3c5a34, 0x4f6b45][seed % 3];
    const pantsColor = boss ? 0x23212f : [0x1d2230, 0x242a39, 0x1f2733][seed % 3];
    const skinColor = boss ? 0x94bc8f : [0x92b57c, 0x8daa78, 0x9bb884][seed % 3];

    const body = new THREE.Group();
    box(body, 0.52, boss ? 0.78 : 0.62, 0.28, bodyColor, 0, boss ? 0.72 : 0.66, 0);
    box(body, 0.22, boss ? 0.28 : 0.24, 0.18, boss ? 0x715080 : 0x5d7e4f, 0, boss ? 1.18 : 1.00, 0.02);
    g.add(body);

    const head = new THREE.Group();
    const headCube = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.42, 0.42),
      [makeMat(skinColor), makeMat(skinColor), makeMat(skinColor), makeMat(skinColor), new THREE.MeshBasicMaterial({ map: faceTexture(seed, boss ? 'boss' : 'zombie'), side: THREE.FrontSide }), makeMat(skinColor)]
    );
    headCube.position.y = boss ? 1.42 : 1.28;
    head.add(headCube);
    box(head, boss ? 0.46 : 0.34, boss ? 0.12 : 0.08, boss ? 0.46 : 0.34, boss ? 0x64407b : [0x3f5438, 0x495d41, 0x546a49][seed % 3], 0, boss ? 1.58 : 1.44, 0);
    if (boss) box(head, 0.56, 0.08, 0.56, 0x3a2147, 0, 1.72, 0);
    g.add(head);

    const armL = new THREE.Group();
    box(armL, 0.14, boss ? 0.76 : 0.56, 0.14, skinColor, 0, boss ? -0.32 : -0.28, 0);
    armL.position.set(-0.31, boss ? 1.10 : 1.00, 0);
    armL.rotation.z = -0.18;
    g.add(armL);

    const armR = new THREE.Group();
    box(armR, 0.14, boss ? 0.76 : 0.56, 0.14, skinColor, 0, boss ? -0.32 : -0.28, 0);
    armR.position.set(0.31, boss ? 1.10 : 1.00, 0);
    armR.rotation.z = 0.18;
    g.add(armR);

    const legL = new THREE.Group();
    box(legL, 0.16, boss ? 0.68 : 0.60, 0.16, pantsColor, 0, -0.30, 0);
    box(legL, 0.20, 0.06, 0.30, 0x11151c, 0, -0.56, 0.05);
    legL.position.set(-0.13, boss ? 0.44 : 0.36, 0);
    g.add(legL);

    const legR = new THREE.Group();
    box(legR, 0.16, boss ? 0.68 : 0.60, 0.16, pantsColor, 0, -0.30, 0);
    box(legR, 0.20, 0.06, 0.30, 0x11151c, 0, -0.56, 0.05);
    legR.position.set(0.13, boss ? 0.44 : 0.36, 0);
    g.add(legR);

    if (boss) {
      const crown = new THREE.Group();
      box(crown, 0.58, 0.12, 0.58, 0x6e4f8e, 0, 1.98, 0);
      [
        [-0.22, 2.12], [0, 2.28], [0.22, 2.12],
      ].forEach(([x2, y2], i) => {
        box(crown, 0.12, 0.28 + i * 0.04, 0.12, 0x8b67af, x2, y2, 0);
      });
      g.add(crown);
    }

    const hpLabel = makeLabelSprite(boss ? 'BOSS' : 'ZOMBIE', boss ? '#38164f' : '#142b16', '#fff', boss ? 1.7 : 1.5, 0.55);
    hpLabel.position.set(0, boss ? 2.55 : 2.25, 0);
    g.add(hpLabel);

    return { group: g, body, head, armL, armR, legL, legR, boss };
  }

  function makeSoldier(seed, x, z) {
    const g = new THREE.Group();
    g.name = '__rz_soldier';
    g.position.set(x, 0, z);
    g.userData.type = 'soldier';
    g.userData.cooldown = 0;
    g.userData.seed = seed;
    g.scale.setScalar(1.0);

    const body = new THREE.Group();
    box(body, 0.52, 0.68, 0.28, 0x4c6a4c, 0, 0.72, 0);
    box(body, 0.24, 0.18, 0.16, 0x3d523c, 0, 1.12, 0.02);
    g.add(body);

    const head = new THREE.Group();
    const headCube = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.42, 0.42),
      [makeMat(0xf0ceb1), makeMat(0xf0ceb1), makeMat(0xf0ceb1), makeMat(0xf0ceb1), new THREE.MeshBasicMaterial({ map: faceTexture(seed + 2, 'zombie'), side: THREE.FrontSide }), makeMat(0xf0ceb1)]
    );
    headCube.position.y = 1.32;
    head.add(headCube);
    box(head, 0.36, 0.10, 0.34, 0x3a4e3a, 0, 1.48, 0);
    g.add(head);

    const armL = new THREE.Group();
    box(armL, 0.12, 0.50, 0.12, 0xf0ceb1, 0, -0.24, 0);
    armL.position.set(-0.30, 0.98, 0);
    g.add(armL);

    const armR = new THREE.Group();
    box(armR, 0.12, 0.50, 0.12, 0xf0ceb1, 0, -0.24, 0);
    armR.position.set(0.30, 0.98, 0);
    g.add(armR);

    const legL = new THREE.Group();
    box(legL, 0.16, 0.58, 0.16, 0x24324c, 0, -0.28, 0);
    box(legL, 0.18, 0.06, 0.26, 0x10141b, 0, -0.54, 0.04);
    legL.position.set(-0.13, 0.36, 0);
    g.add(legL);

    const legR = new THREE.Group();
    box(legR, 0.16, 0.58, 0.16, 0x24324c, 0, -0.28, 0);
    box(legR, 0.18, 0.06, 0.26, 0x10141b, 0, -0.54, 0.04);
    legR.position.set(0.13, 0.36, 0);
    g.add(legR);

    const gun = new THREE.Group();
    box(gun, 0.36, 0.08, 0.10, 0x222831, 0.10, 1.02, 0.20);
    box(gun, 0.16, 0.08, 0.10, 0x2f3944, -0.08, 0.98, 0.20);
    g.add(gun);

    return { group: g, body, head, armL, armR, legL, legR, gun };
  }

  function findSceneTargets(scene) {
    const targets = [];
    scene.traverse((o) => {
      if (!o || !o.userData) return;
      if (o.userData.type === 'player' || o.userData.type === 'customer') targets.push(o);
    });
    return targets;
  }

  function getWorldPos(obj) {
    const p = new THREE.Vector3();
    obj.getWorldPosition(p);
    return p;
  }

  function updateBadge(state) {
    let el = document.getElementById('__rz_badge');
    if (!el) {
      el = document.createElement('div');
      el.id = '__rz_badge';
      el.style.position = 'fixed';
      el.style.top = '14px';
      el.style.right = '14px';
      el.style.zIndex = '9999';
      el.style.pointerEvents = 'none';
      el.style.background = 'rgba(8, 17, 31, 0.78)';
      el.style.border = '1px solid rgba(255,255,255,0.10)';
      el.style.borderRadius = '16px';
      el.style.padding = '10px 12px';
      el.style.color = '#fff';
      el.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
      el.style.fontSize = '13px';
      el.style.lineHeight = '1.35';
      el.style.backdropFilter = 'blur(8px)';
      el.style.boxShadow = '0 16px 50px rgba(0,0,0,0.30)';
      document.body.appendChild(el);
    }
    el.innerHTML = `<strong>${state.night ? 'NOC' : 'DEN'}</strong> · noc ${state.nightCount}<br>zombie ${zombies.length} · vojáci ${soldiers.length}<br>HP restaurace ${state.baseHp}`;
  }

  function flash(color = 'rgba(255,70,70,0.18)') {
    let el = document.getElementById('__rz_flash');
    if (!el) {
      el = document.createElement('div');
      el.id = '__rz_flash';
      el.style.position = 'fixed';
      el.style.inset = '0';
      el.style.pointerEvents = 'none';
      el.style.zIndex = '9998';
      el.style.opacity = '0';
      el.style.transition = 'opacity 180ms ease';
      document.body.appendChild(el);
    }
    el.style.background = color;
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = '0'; }, 160);
  }

  function addEffect(obj, ttl = 0.2) {
    effects.push({ obj, ttl });
    sceneRef.add(obj);
  }

  function spawnBeam(from, to, color = 0xa8e6ff) {
    const geom = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 });
    const line = new THREE.Line(geom, mat);
    addEffect(line, 0.12);
  }

  function spawnDust(x, z, color = 0xd1b38f) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ color, transparent: true, opacity: 0.9 }));
    s.scale.set(0.3, 0.3, 1);
    s.position.set(x, 0.25, z);
    addEffect(s, 0.4);
  }

  function pickSpawnPoint() {
    const lane = 10.5 + randRange(performance.now() | 0, -2.2, 2.2);
    return { x: clamp(lane, 2.0, 18.0), z: 0.95 };
  }

  function spawnZombie(scene, boss = false) {
    const seed = (performance.now() * 1000) | 0 ^ (zombies.length * 971);
    const p = pickSpawnPoint();
    const zombie = makeZombie(seed, p.x, p.z, boss);
    scene.add(zombie.group);
    zombies.push(zombie);
    return zombie;
  }

  function spawnSoldiers(scene) {
    if (soldiers.length) return;
    const positions = [
      { x: 12.4, z: 13.1 },
      { x: 7.6, z: 13.6 },
    ];
    positions.forEach((p, i) => {
      const s = makeSoldier(500 + i * 33, p.x, p.z);
      s.group.rotation.y = i === 0 ? -0.7 : 0.7;
      scene.add(s.group);
      soldiers.push(s);
    });
  }

  function buildWorld(scene) {
    if (worldBuilt) return;
    worldBuilt = true;
    createPath(scene);
    spawnSoldiers(scene);
    for (let i = 0; i < 2; i++) spawnZombie(scene, false);
    state.nextSpawnAt = performance.now() + 8000;
    state.baseHp = 100;
    state.night = false;
    state.nightCount = 0;
  }

  function cycleState(now) {
    const phase = ((now - startTime) % cycleMs) / cycleMs;
    const night = phase >= dayRatio;
    const dayPhase = night ? (phase - dayRatio) / Math.max(0.001, 1 - dayRatio) : phase / dayRatio;
    return { phase, night, dayPhase };
  }

  function clampZombieToPath(z) {
    z.group.position.x = clamp(z.group.position.x, 1.0, 19.0);
    z.group.position.z = clamp(z.group.position.z, 0.85, 19.0);
  }

  function maybeDamageTarget(z, nearest, now) {
    if (!nearest) return;
    if (nearest.dist > 0.9) return;
    flash(z.boss ? 'rgba(255,70,70,0.24)' : 'rgba(255,70,70,0.14)');
    spawnDust(nearest.p.x, nearest.p.z, z.boss ? 0xe6a8ff : 0xffd18a);
    state.baseHp = Math.max(0, state.baseHp - z.damage);
    const target = nearest.obj;
    if (target && typeof target.traverse === 'function') {
      target.traverse((o) => {
        if (!o || !o.material || !o.material.color) return;
        if (!o.userData) o.userData = {};
        if (!o.userData.__rzOriginalColor) o.userData.__rzOriginalColor = o.material.color.clone();
        o.material.color.offsetHSL(-0.08, 0.18, -0.02);
      });
      setTimeout(() => {
        target.traverse((o) => {
          if (!o || !o.material || !o.userData?.__rzOriginalColor) return;
          o.material.color.copy(o.userData.__rzOriginalColor);
          delete o.userData.__rzOriginalColor;
        });
      }, 500);
    }
  }

  function killZombie(index, x, z, boss = false) {
    const zed = zombies[index];
    if (!zed || zed.group.userData.dead) return;
    zed.group.userData.dead = true;
    zed.alive = false;
    sceneRef.remove(zed.group);
    zombies.splice(index, 1);
    spawnDust(x, z, boss ? 0xcfa7ff : 0xcaa57c);
  }

  function fireSoldier(soldier, zombie) {
    const from = getWorldPos(soldier.group);
    const to = getWorldPos(zombie.group);
    from.y += 1.0;
    to.y += zombie.boss ? 1.7 : 1.35;
    spawnBeam(from, to, zombie.boss ? 0xd8a8ff : 0x9fdfff);
    const damage = zombie.boss ? 3 : 1;
    zombie.group.userData.hp -= damage;
    zombie.group.userData.hitFlash = 0.12;
    zombie.group.traverse((o) => {
      if (o.isMesh && o.material && o.material.color) o.material.emissive = new THREE.Color(zombie.boss ? 0x220033 : 0x112200);
    });
    if (zombie.group.userData.hp <= 0) {
      const pos = zombie.group.position.clone();
      killZombie(zombies.indexOf(zombie), pos.x, pos.z, zombie.boss);
    }
  }

  function updateSoldiers(dt) {
    for (const soldier of soldiers) {
      soldier.group.rotation.y = lerpAngle(soldier.group.rotation.y || 0, Math.sin(performance.now() * 0.0005 + soldier.group.userData.seed) * 0.2, dt * 2);
      soldier.group.position.y = Math.sin(performance.now() * 0.004 + soldier.group.userData.seed) * 0.01;
      soldier.userData.cooldown = Math.max(0, (soldier.userData.cooldown || 0) - dt);
      const soldierPos = getWorldPos(soldier.group);
      soldierPos.y += 1.0;
      let best = null;
      let bestD = Infinity;
      for (const zombie of zombies) {
        if (!zombie.alive) continue;
        const zp = getWorldPos(zombie.group);
        const d = dist2(soldierPos.x, soldierPos.z, zp.x, zp.z);
        if (d < 7.8 && d < bestD) { bestD = d; best = zombie; }
      }
      if (best && soldier.userData.cooldown <= 0) {
        fireSoldier(soldier, best);
        soldier.userData.cooldown = best.boss ? 0.42 : 0.7;
      }
    }
  }

  function updateEffects(dt) {
    for (const fx of effects) fx.ttl -= dt;
    for (let i = effects.length - 1; i >= 0; i--) {
      const fx = effects[i];
      if (fx.ttl > 0) continue;
      if (fx.obj.geometry) fx.obj.geometry.dispose?.();
      if (fx.obj.material) {
        if (Array.isArray(fx.obj.material)) fx.obj.material.forEach((m) => m.dispose?.());
        else fx.obj.material.dispose?.();
      }
      sceneRef?.remove(fx.obj);
      effects.splice(i, 1);
    }
  }

  function updateZombies(dt, now) {
    const targets = findSceneTargets(sceneRef);
    const player = targets.find((o) => o.userData.type === 'player') || null;

    for (let i = zombies.length - 1; i >= 0; i--) {
      const z = zombies[i];
      if (!z.alive) {
        zombies.splice(i, 1);
        continue;
      }
      const g = z.group;
      const pos = g.position;
      const waypoint = pathPoints[Math.min(z.group.userData.pathIndex || 0, pathPoints.length - 1)];
      let targetX = waypoint.x;
      let targetZ = waypoint.z;
      if ((z.group.userData.pathIndex || 0) >= pathPoints.length - 1 && player) {
        const p = getWorldPos(player);
        targetX = p.x;
        targetZ = p.z;
      }
      const dx = targetX - pos.x;
      const dz = targetZ - pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const speed = z.group.userData.speed * (state.night ? 1.18 : 0.9) * (z.boss ? 0.85 : 1.0);
      pos.x += (dx / d) * speed * dt;
      pos.z += (dz / d) * speed * dt;
      pos.y = Math.sin(now * 0.004 + z.group.userData.phase) * 0.016;
      g.rotation.y = lerpAngle(g.rotation.y || 0, Math.atan2(dx, dz), Math.min(1, dt * 8));
      clampZombieToPath(z);

      const sway = Math.sin(now * 0.012 + z.group.userData.phase) * (z.boss ? 0.45 : 0.7);
      z.armL.rotation.x = 0.04 + sway * 0.32;
      z.armR.rotation.x = -0.04 - sway * 0.32;
      z.legL.rotation.x = -0.08 - sway * 0.52;
      z.legR.rotation.x = 0.08 + sway * 0.52;
      z.body.rotation.z = Math.sin(now * 0.003 + z.group.userData.phase) * (z.boss ? 0.01 : 0.02);
      z.head.rotation.y = Math.sin(now * 0.002 + z.group.userData.phase) * 0.03;
      if (z.group.userData.hitFlash > 0) {
        z.group.userData.hitFlash -= dt;
        z.group.scale.setScalar((z.boss ? 1.65 : 1.02) + 0.05 * Math.sin(now * 0.05));
      } else {
        z.group.scale.setScalar(z.boss ? 1.65 : 1.02);
      }

      if ((z.group.userData.pathIndex || 0) < pathPoints.length - 1) {
        if (dist2(pos.x, pos.z, waypoint.x, waypoint.z) < 0.6) z.group.userData.pathIndex = (z.group.userData.pathIndex || 0) + 1;
      }

      const nearest = targets.reduce((best, obj) => {
        const p = getWorldPos(obj);
        const d2 = dist2(pos.x, pos.z, p.x, p.z);
        if (!best || d2 < best.dist) return { obj, dist: d2, p };
        return best;
      }, null);

      if (nearest && nearest.dist < 0.9) maybeDamageTarget(z.group.userData, nearest, now);
      if (z.group.userData.hp <= 0) {
        killZombie(i, pos.x, pos.z, z.boss);
      }
    }
  }

  function spawnController(scene, now) {
    const cycle = (now - startTime) % cycleMs;
    const night = cycle >= cycleMs * dayRatio;
    const dayPhase = night ? (cycle - cycleMs * dayRatio) / (cycleMs * (1 - dayRatio)) : cycle / (cycleMs * dayRatio);
    const state = {
      night,
      dayPhase,
      nightCount,
      baseHp: window.__rzDefenseBaseHp ?? 100,
    };

    if (lastNightState === null) lastNightState = night;
    if (lastNightState !== night) {
      lastNightState = night;
      if (night) {
        nightIndex += 1;
        bossSpawnedThisNight = false;
        lastSpawnAt = now - 2000;
        flash('rgba(90,70,255,0.10)');
      }
    }

    const spawnDelay = night ? (4800 + randRange((now / 97) | 0, 0, 2600)) : (11000 + randRange((now / 77) | 0, 0, 5200));
    if (now - lastSpawnAt >= spawnDelay) {
      lastSpawnAt = now;
      const count = night ? (Math.random() < 0.35 ? 2 : 1) : 1;
      for (let i = 0; i < count; i++) spawnZombie(scene, false);
    }

    if (night && !bossSpawnedThisNight && nightIndex > 0 && nightIndex % 4 === 0) {
      bossSpawnedThisNight = true;
      spawnZombie(scene, true);
    }

    return state;
  }

  function updateBadgeState(state) {
    let el = document.getElementById('__rz_badge');
    if (!el) {
      el = document.createElement('div');
      el.id = '__rz_badge';
      el.style.position = 'fixed';
      el.style.top = '14px';
      el.style.right = '14px';
      el.style.zIndex = '9999';
      el.style.pointerEvents = 'none';
      el.style.background = 'rgba(8, 17, 31, 0.78)';
      el.style.border = '1px solid rgba(255,255,255,0.10)';
      el.style.borderRadius = '16px';
      el.style.padding = '10px 12px';
      el.style.color = '#fff';
      el.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
      el.style.fontSize = '13px';
      el.style.lineHeight = '1.35';
      el.style.backdropFilter = 'blur(8px)';
      el.style.boxShadow = '0 16px 50px rgba(0,0,0,0.30)';
      document.body.appendChild(el);
    }
    el.innerHTML = `<strong>${state.night ? 'NOC' : 'DEN'}</strong> · noc ${nightIndex}<br>zombie ${zombies.length} · vojáci ${soldiers.length}<br>HP restaurace ${Math.max(0, state.baseHp | 0)}`;
  }

  function hitRestaurant(z, damage) {
    const current = window.__rzDefenseBaseHp ?? 100;
    const next = Math.max(0, current - damage);
    window.__rzDefenseBaseHp = next;
    flash(z.boss ? 'rgba(255,80,80,0.25)' : 'rgba(255,80,80,0.14)');
  }

  function maybeApplyRestaurantHit(zombie, nearest) {
    if (!nearest || nearest.dist > 0.9) return;
    hitRestaurant(zombie, zombie.damage);
    spawnDust(nearest.p.x, nearest.p.z, zombie.boss ? 0xe6a8ff : 0xffd18a);
  }

  function touchTarget(target) {
    if (!target || !target.userData || target.userData.__rzTouched) return;
    target.userData.__rzTouched = true;
    target.traverse((o) => {
      if (!o || !o.material || !o.material.color) return;
      if (!o.userData) o.userData = {};
      if (!o.userData.__rzOriginalColor) o.userData.__rzOriginalColor = o.material.color.clone();
      o.material.color.offsetHSL(-0.07, 0.15, -0.02);
    });
    setTimeout(() => {
      target.traverse((o) => {
        if (!o || !o.material || !o.userData?.__rzOriginalColor) return;
        o.material.color.copy(o.userData.__rzOriginalColor);
        delete o.userData.__rzOriginalColor;
      });
      delete target.userData.__rzTouched;
    }, 1200);
  }

  function updateEffectsAndTargetTouch(dt) {
    updateEffects(dt);
  }

  function update(dt, now) {
    if (!sceneRef) return;
    if (!worldBuilt) {
      buildWorld(sceneRef);
      window.__rzDefenseBaseHp = 100;
    }

    const state = spawnController(sceneRef, now);
    updateZombies(dt, now);
    updateSoldiers(dt);
    updateEffectsAndTargetTouch(dt);

    const targets = findSceneTargets(sceneRef);
    for (const z of zombies) {
      if (!z.alive) continue;
      const pos = z.group.position;
      const nearest = targets.reduce((best, obj) => {
        const p = getWorldPos(obj);
        const d2 = dist2(pos.x, pos.z, p.x, p.z);
        if (!best || d2 < best.dist) return { obj, dist: d2, p };
        return best;
      }, null);
      maybeApplyRestaurantHit(z.group.userData, nearest);
      if (nearest && nearest.dist < 1.0) touchTarget(nearest.obj);
    }

    updateBadgeState({ night: state.night, baseHp: window.__rzDefenseBaseHp ?? 100 });
  }

  THREE.WebGLRenderer.prototype.render = function patchedRender(scene, camera) {
    sceneRef = sceneRef || scene;
    cameraRef = cameraRef || camera;
    const now = performance.now();
    const dt = Math.min(0.033, (now - lastFrame) / 1000 || 0.016);
    lastFrame = now;
    update(dt, now);
    return originalRender.call(this, scene, camera);
  };

  window.RZZombiePatch = {
    get scene() { return sceneRef; },
    get camera() { return cameraRef; },
    get zombies() { return zombies; },
    get soldiers() { return soldiers; },
    get nightIndex() { return nightIndex; },
  };
})();

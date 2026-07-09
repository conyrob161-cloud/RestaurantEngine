(() => {
  if (window.__rzZombiePatchActive || !window.THREE) return;
  window.__rzZombiePatchActive = true;

  const originalRender = THREE.WebGLRenderer.prototype.render;
  const roots = new Set();
  const zombies = [];
  const meta = new WeakMap();
  let sceneRef = null;
  let cameraRef = null;
  let lastSpawnAt = 0;
  let lastFrame = performance.now();

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerpAngle = (a, b, t) => {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  };
  const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

  function mat(color, roughness = 0.96) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, flatShading: true, side: THREE.DoubleSide });
  }

  function box(parent, w, h, d, color, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  function zombieFace(seed) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    const skin = ['#95b37f', '#8daa78', '#9bb884'][seed % 3];
    const hood = ['#495d41', '#3f5438', '#546a49'][seed % 3];
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
    ctx.fillStyle = '#3a1d16';
    ctx.fillRect(50, 80, 28, 6);
    ctx.fillStyle = '#5c2a22';
    ctx.fillRect(46, 76, 36, 3);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }

  function makeZombie(seed, x, z) {
    const g = new THREE.Group();
    g.name = '__rz_zombie';
    g.position.set(x, 0, z);
    g.userData.type = 'zombie';

    const bodyColor = [0x45613d, 0x3c5a34, 0x4f6b45][seed % 3];
    const pantsColor = [0x1d2230, 0x242a39, 0x1f2733][seed % 3];
    const skinColor = [0x92b57c, 0x8daa78, 0x9bb884][seed % 3];

    const body = new THREE.Group();
    box(body, 0.52, 0.62, 0.28, bodyColor, 0, 0.66, 0);
    box(body, 0.22, 0.24, 0.18, 0x5d7e4f, 0, 1.00, 0.02);
    g.add(body);

    const head = new THREE.Group();
    const headCube = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), [
      mat(skinColor), mat(skinColor), mat(skinColor), mat(skinColor),
      new THREE.MeshBasicMaterial({ map: zombieFace(seed), side: THREE.FrontSide }),
      mat(skinColor),
    ]);
    headCube.position.y = 1.28;
    head.add(headCube);
    box(head, 0.34, 0.08, 0.34, [0x3f5438, 0x495d41, 0x546a49][seed % 3], 0, 1.44, 0);
    g.add(head);

    const armL = new THREE.Group();
    box(armL, 0.14, 0.56, 0.14, skinColor, 0, -0.28, 0);
    armL.position.set(-0.31, 1.00, 0);
    armL.rotation.z = -0.18;
    g.add(armL);

    const armR = new THREE.Group();
    box(armR, 0.14, 0.56, 0.14, skinColor, 0, -0.28, 0);
    armR.position.set(0.31, 1.00, 0);
    armR.rotation.z = 0.18;
    g.add(armR);

    const legL = new THREE.Group();
    box(legL, 0.16, 0.60, 0.16, pantsColor, 0, -0.30, 0);
    box(legL, 0.20, 0.06, 0.30, 0x11151c, 0, -0.56, 0.05);
    legL.position.set(-0.13, 0.36, 0);
    g.add(legL);

    const legR = new THREE.Group();
    box(legR, 0.16, 0.60, 0.16, pantsColor, 0, -0.30, 0);
    box(legR, 0.20, 0.06, 0.30, 0x11151c, 0, -0.56, 0.05);
    legR.position.set(0.13, 0.36, 0);
    g.add(legR);

    const t = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.22), mat(0x11151c));
    t.position.set(0, 0.02, 0.06);
    g.add(t);

    g.scale.setScalar(1.02);
    return { group: g, body, head, armL, armR, legL, legR, seed, phase: rand(seed), speed: 0.45 + rand(seed) * 0.15, target: null, alive: true, hitFlash: 0 };
  }

  function rand(seed) {
    let x = (seed ^ 0x9e3779b9) >>> 0;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return (x >>> 0) / 4294967296;
  }

  function collectTargets(scene) {
    const targets = [];
    scene.traverse((o) => {
      if (!o || !o.userData) return;
      if (o.userData.type === 'player' || o.userData.type === 'customer') {
        targets.push(o);
      }
    });
    return targets;
  }

  function zombieSpawnPoint() {
    const side = Math.floor(Math.random() * 4);
    const min = 1.4;
    const max = 18.6;
    if (side === 0) return { x: min + Math.random() * (max - min), z: 1.2 };
    if (side === 1) return { x: min + Math.random() * (max - min), z: 18.8 };
    if (side === 2) return { x: 1.2, z: min + Math.random() * (max - min) };
    return { x: 18.8, z: min + Math.random() * (max - min) };
  }

  function ensureZombies(scene) {
    if (zombies.length) return;
    for (let i = 0; i < 3; i++) {
      const s = zombieSpawnPoint();
      const z = makeZombie(100 + i * 17, s.x, s.z);
      scene.add(z.group);
      zombies.push(z);
    }
  }

  function nearestTarget(zombie, targets) {
    let best = null;
    let bestD = Infinity;
    for (const t of targets) {
      const p = new THREE.Vector3();
      t.getWorldPosition(p);
      const d = dist2(zombie.group.position.x, zombie.group.position.z, p.x, p.z);
      if (d < bestD) { bestD = d; best = { obj: t, dist: d, p }; }
    }
    return best;
  }

  function touchTarget(target) {
    if (!target || !target.userData || target.userData.__rzZombieTouched) return;
    target.userData.__rzZombieTouched = true;
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
      delete target.userData.__rzZombieTouched;
    }, 1600);
  }

  function update(dt) {
    if (!sceneRef) return;
    ensureZombies(sceneRef);
    const targets = collectTargets(sceneRef);
    for (const z of zombies) {
      if (!z.alive) continue;
      const nearest = nearestTarget(z, targets);
      const roamX = 10 + Math.sin((performance.now() * 0.00025) + z.phase) * 3.2;
      const roamZ = 10 + Math.cos((performance.now() * 0.00018) + z.phase) * 4.0;
      const tx = nearest ? nearest.p.x : roamX;
      const tz = nearest ? nearest.p.z : roamZ;
      const dx = tx - z.group.position.x;
      const dz = tz - z.group.position.z;
      const d = Math.hypot(dx, dz) || 1;
      const speed = z.speed * (nearest && nearest.dist < 6 ? 1.35 : 1.0);
      z.group.position.x += (dx / d) * speed * dt;
      z.group.position.z += (dz / d) * speed * dt;
      z.group.position.x = clamp(z.group.position.x, 1.0, 19.0);
      z.group.position.z = clamp(z.group.position.z, 1.0, 19.0);
      z.group.rotation.y = lerpAngle(z.group.rotation.y || 0, Math.atan2(dx, dz), Math.min(1, dt * 9));
      z.group.position.y = Math.sin(performance.now() * 0.004 + z.phase) * 0.015;
      const sway = Math.sin(performance.now() * 0.01 + z.phase) * 0.7;
      z.armL.rotation.x = 0.02 + sway * 0.35;
      z.armR.rotation.x = -0.02 - sway * 0.35;
      z.legL.rotation.x = -0.08 - sway * 0.55;
      z.legR.rotation.x = 0.08 + sway * 0.55;
      z.body.rotation.z = Math.sin(performance.now() * 0.004 + z.phase) * 0.02;
      z.head.rotation.y = Math.sin(performance.now() * 0.002 + z.phase) * 0.03;
      if (nearest && nearest.dist < 0.95) touchTarget(nearest.obj);
      if (z.hitFlash > 0) z.hitFlash -= dt;
    }
    if (performance.now() - lastSpawnAt > 22000 && zombies.length < 5) {
      lastSpawnAt = performance.now();
      const s = zombieSpawnPoint();
      const z = makeZombie(200 + zombies.length * 11, s.x, s.z);
      sceneRef.add(z.group);
      zombies.push(z);
    }
  }

  THREE.WebGLRenderer.prototype.render = function patchedRender(scene, camera) {
    sceneRef = sceneRef || scene;
    cameraRef = cameraRef || camera;
    const now = performance.now();
    const dt = Math.min(0.033, (now - lastFrame) / 1000 || 0.016);
    lastFrame = now;
    update(dt);
    return originalRender.call(this, scene, camera);
  };

  window.RZZombiePatch = {
    get scene() { return sceneRef; },
    get camera() { return cameraRef; },
  };
})();
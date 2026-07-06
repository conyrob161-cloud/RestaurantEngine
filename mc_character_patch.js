(() => {
  if (window.__rzMCCharacterPatchActive || !window.THREE) return;
  window.__rzMCCharacterPatchActive = true;

  const TARGET_TYPES = new Set(['player', 'chef', 'customer']);
  const roots = new Set();
  const meta = new WeakMap();
  const originalAdd = THREE.Object3D.prototype.add;
  const clock = new THREE.Clock();
  const tmpPos = new THREE.Vector3();

  const norm = (v) => String(v || '').trim().toLowerCase();
  const hash = (text) => {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };
  const rand = (seed, salt = 0) => {
    let x = (seed ^ (salt * 0x9e3779b9)) >>> 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
  const pick = (arr, seed, salt = 0) => arr[Math.floor(rand(seed, salt) * arr.length) % arr.length];
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerpAngle = (a, b, t) => {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  };

  const skin = [0xf1cfb5, 0xeec7aa, 0xe7bf9f, 0xdcae87];
  const hair = [0x2c2a28, 0x3f2e24, 0x5e452f, 0x1c1f27, 0x6b4f3a];
  const pants = [0x1d2230, 0x22262d, 0x272a31, 0x2c2f35, 0x1b1f28];
  const player = [0x4d78b5, 0x3b82f6, 0x2f6fad, 0x5f87d8];
  const customer = [0x5f7dd6, 0xd96c6c, 0x4c9b72, 0x9e78d2, 0xdb8b47, 0x5a9bdb];
  const chef = [0xf8f4eb, 0xf1eee7, 0xf6f1e7];
  const faceTex = new Map();

  function makeMat(color) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.98,
      metalness: 0,
      flatShading: true,
      side: THREE.DoubleSide,
    });
  }

  function box(parent, w, h, d, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), makeMat(color));
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    parent.add(m);
    return m;
  }

  function makeFaceTexture(role, seed) {
    const key = `${role}:${seed % 24}`;
    if (faceTex.has(key)) return faceTex.get(key);

    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');

    const skinColor = `#${pick(skin, seed, 1).toString(16).padStart(6, '0')}`;
    const hairColor = `#${pick(hair, seed, 2).toString(16).padStart(6, '0')}`;
    const eye = '#141414';
    const mouth = role === 'chef' ? '#7f4539' : '#6d4337';

    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = skinColor;
    ctx.fillRect(0, 0, 128, 128);

    ctx.fillStyle = hairColor;
    ctx.fillRect(0, 0, 128, 26);

    if (role === 'chef') {
      ctx.fillStyle = '#f9f9f4';
      ctx.fillRect(12, 0, 104, 20);
      ctx.fillRect(28, 0, 72, 28);
    } else if (role === 'player') {
      ctx.fillStyle = '#24324c';
      ctx.fillRect(10, 0, 108, 22);
      ctx.fillStyle = '#8ecae6';
      ctx.fillRect(14, 16, 100, 6);
    }

    ctx.fillStyle = skinColor;
    ctx.fillRect(14, 26, 100, 90);

    ctx.fillStyle = eye;
    ctx.fillRect(34, 52, 10, 10);
    ctx.fillRect(84, 52, 10, 10);
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(36, 54, 3, 3);
    ctx.fillRect(86, 54, 3, 3);

    ctx.fillStyle = '#2b211b';
    ctx.fillRect(32, 44, 18, 3);
    ctx.fillRect(78, 44, 18, 3);

    ctx.fillStyle = 'rgba(60,40,30,0.55)';
    ctx.fillRect(61, 60, 6, 10);

    ctx.fillStyle = mouth;
    if (role === 'chef') ctx.fillRect(44, 86, 40, 4);
    else if (seed % 3 === 0) ctx.fillRect(42, 84, 44, 4);
    else {
      ctx.fillRect(44, 82, 40, 4);
      ctx.fillRect(46, 86, 36, 2);
    }

    ctx.fillStyle = skinColor;
    ctx.fillRect(6, 46, 8, 24);
    ctx.fillRect(114, 46, 8, 24);

    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    faceTex.set(key, tex);
    return tex;
  }

  function clearSpritesKeep(root) {
    const sprites = root.children.filter((c) => c.isSprite);
    root.clear();
    for (const s of sprites) root.add(s);
  }

  function rebuild(root) {
    if (!root || !TARGET_TYPES.has(norm(root.userData?.type)) || root.userData.__mcBuilt) return;

    const role = norm(root.userData.type);
    const seed = hash(`${root.userData.type}:${root.position.x.toFixed(3)}:${root.position.z.toFixed(3)}`);

    clearSpritesKeep(root);

    const bodyColor = role === 'chef' ? 0xf8f6f0 : role === 'player' ? 0x4d78b5 : pick(customer, seed, 3);
    const hairColor = role === 'chef' ? 0x1f1f1f : role === 'player' ? 0x24324c : pick(hair, seed, 2);
    const skinColor = pick(skin, seed, 1);

    const bodyMat = makeMat(bodyColor);
    const skinMat = makeMat(skinColor);
    const faceMat = new THREE.MeshBasicMaterial({
      map: makeFaceTexture(role, seed),
      transparent: false,
      side: THREE.FrontSide,
    });

    const body = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.58, 0.26), bodyMat);
    torso.position.y = 0.62;
    body.add(torso);
    root.add(body);

    const head = new THREE.Group();
    const headCube = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), [skinMat.clone(), skinMat.clone(), skinMat.clone(), skinMat.clone(), faceMat, skinMat.clone()]);
    headCube.position.y = 1.10;
    head.add(headCube);

    if (role === 'chef') {
      const hatMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82 });
      box(head, 0.34, 0.12, 0.34, 0xffffff, 0, 1.34, 0);
      box(head, 0.16, 0.20, 0.16, 0xffffff, -0.10, 1.46, 0);
      box(head, 0.20, 0.24, 0.20, 0xffffff, 0, 1.54, 0);
      box(head, 0.16, 0.20, 0.16, 0xffffff, 0.10, 1.46, 0);
      box(body, 0.22, 0.28, 0.04, 0xe8d9c2, 0, 0.34, 0.15);
      box(body, 0.10, 0.03, 0.03, 0xb58b5d, 0, 0.20, 0.18);
    } else if (role === 'player') {
      box(head, 0.34, 0.12, 0.28, 0x24324c, 0, 1.34, 0);
      box(head, 0.38, 0.05, 0.18, 0x8ecae6, 0, 1.28, 0.14);
    } else {
      const style = seed % 4;
      if (style === 0) {
        box(head, 0.34, 0.12, 0.34, hairColor, 0, 1.34, 0);
        box(head, 0.28, 0.08, 0.28, hairColor, 0, 1.40, -0.02);
      } else if (style === 1) {
        box(head, 0.34, 0.10, 0.34, hairColor, 0, 1.34, 0);
        box(head, 0.14, 0.16, 0.10, hairColor, -0.12, 1.28, 0.10);
        box(head, 0.12, 0.14, 0.10, hairColor, 0.10, 1.30, 0.08);
      } else if (style === 2) {
        box(head, 0.34, 0.12, 0.34, hairColor, 0, 1.34, 0);
        box(head, 0.20, 0.22, 0.18, hairColor, 0, 1.42, 0.02);
      } else {
        box(head, 0.34, 0.10, 0.34, hairColor, 0, 1.34, 0);
        box(head, 0.12, 0.16, 0.10, hairColor, -0.12, 1.40, -0.02);
        box(head, 0.14, 0.20, 0.12, hairColor, 0.02, 1.46, 0);
        box(head, 0.10, 0.16, 0.10, hairColor, 0.14, 1.39, 0.02);
      }
    }
    root.add(head);

    const armMat = makeMat(skinColor);
    const armL = new THREE.Group();
    box(armL, 0.14, 0.52, 0.14, skinColor, 0, -0.26, 0);
    armL.position.set(-0.30, 0.96, 0);
    root.add(armL);

    const armR = new THREE.Group();
    box(armR, 0.14, 0.52, 0.14, skinColor, 0, -0.26, 0);
    armR.position.set(0.30, 0.96, 0);
    root.add(armR);

    const legMat = makeMat(role === 'chef' ? 0x1f1f1f : 0x1d2230);
    const legL = new THREE.Group();
    box(legL, 0.16, 0.60, 0.16, role === 'chef' ? 0x1f1f1f : 0x1d2230, 0, -0.30, 0);
    box(legL, 0.20, 0.06, 0.30, role === 'chef' ? 0x1f1f1f : 0x11151c, 0, -0.56, 0.05);
    legL.position.set(-0.13, 0.28, 0);
    root.add(legL);

    const legR = new THREE.Group();
    box(legR, 0.16, 0.60, 0.16, role === 'chef' ? 0x1f1f1f : 0x1d2230, 0, -0.30, 0);
    box(legR, 0.20, 0.06, 0.30, role === 'chef' ? 0x1f1f1f : 0x11151c, 0, -0.56, 0.05);
    legR.position.set(0.13, 0.28, 0);
    root.add(legR);

    root.bodyMat = bodyMat;
    root.headMat = skinMat;
    root.parts = { body, head, armL, armR, legL, legR };
    root.scale.setScalar(role === 'customer' ? 0.86 : 0.90);
    root.userData.__mcBuilt = true;

    if (role === 'customer') {
      const pos = root.position;
      const originalSet = pos.set.bind(pos);
      root.__mcTarget = pos.clone();
      root.__mcSmoothed = pos.clone();
      root.__mcLastTarget = pos.clone();
      pos.set = function setSmooth(x, y, z) {
        root.__mcTarget.set(x, y, z);
        if (typeof y === 'number') root.__mcTarget.y = y;
        root.__mcSmoothed.lerp(root.__mcTarget, 0.28);
        originalSet(root.__mcSmoothed.x, root.__mcSmoothed.y, root.__mcSmoothed.z);
        const dx = root.__mcTarget.x - root.__mcLastTarget.x;
        const dz = root.__mcTarget.z - root.__mcLastTarget.z;
        if (Math.abs(dx) + Math.abs(dz) > 0.0001) {
          const targetAngle = Math.atan2(dx, dz);
          root.rotation.y = lerpAngle(root.rotation.y || 0, targetAngle, 0.28);
        }
        root.__mcLastTarget.copy(root.__mcTarget);
        return pos;
      };
    }

    const parts = root.parts;
    meta.set(root, {
      seed,
      phase: rand(seed, 7) * Math.PI * 2,
      time: rand(seed, 13) * 1000,
      last: root.getWorldPosition(new THREE.Vector3()),
      speed: 0,
      parts,
      bodyMat,
      skinMat,
      role,
    });
    roots.add(root);
  }

  function animate(root, info, dt) {
    const t = info.time;
    const phase = info.phase;
    const walk = info.speed > 0.02;
    const parts = info.parts;
    if (!parts) return;

    const idleBob = Math.sin(t * 2 + phase) * 0.008;
    const stride = walk ? Math.sin(t * 7 + phase) : Math.sin(t * 1.8 + phase) * 0.12;

    if (parts.body) {
      parts.body.rotation.z = walk ? Math.sin(t * 7 + phase) * 0.015 : 0;
      parts.body.position.y = idleBob;
    }
    if (parts.head) {
      parts.head.rotation.y = walk ? Math.sin(t * 1.6 + phase) * 0.02 : 0;
      parts.head.rotation.x = walk ? 0 : Math.sin(t * 1.4 + phase) * 0.01;
    }
    if (parts.armL) { parts.armL.rotation.x = 0.10 + stride * 0.85; parts.armL.rotation.z = 0; }
    if (parts.armR) { parts.armR.rotation.x = -0.10 - stride * 0.85; parts.armR.rotation.z = 0; }
    if (parts.legL) { parts.legL.rotation.x = -0.08 - stride * 0.95; parts.legL.rotation.z = 0; }
    if (parts.legR) { parts.legR.rotation.x = 0.08 + stride * 0.95; parts.legR.rotation.z = 0; }
  }

  function tick() {
    const dt = clock.getDelta();
    for (const root of roots) {
      const info = meta.get(root);
      if (!info) continue;
      root.getWorldPosition(tmpPos);
      info.speed = tmpPos.distanceTo(info.last) / Math.max(dt, 1 / 60);
      info.last.copy(tmpPos);
      info.time += dt;
      animate(root, info, dt);
    }
    requestAnimationFrame(tick);
  }

  THREE.Object3D.prototype.add = function patchedAdd(...objs) {
    for (const obj of objs) {
      if (obj && typeof obj === 'object') rebuild(obj);
    }
    return originalAdd.apply(this, objs);
  };

  // Catch anything already attached very early.
  setTimeout(() => {
    if (THREE.Object3D.prototype.add !== patchedAdd) {
      THREE.Object3D.prototype.add = function patchedAdd(...objs) {
        for (const obj of objs) {
          if (obj && typeof obj === 'object') rebuild(obj);
        }
        return originalAdd.apply(this, objs);
      };
    }
  }, 0);

  requestAnimationFrame(tick);
})();
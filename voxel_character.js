(() => {
  if (window.__rzVoxelCharacterActive || !window.THREE) return;
  window.__rzVoxelCharacterActive = true;

  const TARGET_TYPES = new Set(['player', 'chef', 'customer']);
  const roots = new Set();
  const state = new WeakMap();
  const add = THREE.Object3D.prototype.add;
  const clock = new THREE.Clock();

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
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
  const pick = (arr, seed, salt = 0) => arr[Math.floor(rand(seed, salt) * arr.length) % arr.length];

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

  function makeBox(parent, w, h, d, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
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

    // Head base
    ctx.fillStyle = skinColor;
    ctx.fillRect(0, 0, 128, 128);

    // Hair cap / hat area
    ctx.fillStyle = hairColor;
    ctx.fillRect(0, 0, 128, 34);

    if (role === 'chef') {
      ctx.fillStyle = '#f9f9f4';
      ctx.fillRect(14, 0, 100, 24);
      ctx.fillRect(28, 0, 72, 32);
    } else if (role === 'player') {
      ctx.fillStyle = '#22314a';
      ctx.fillRect(10, 0, 108, 24);
      ctx.fillStyle = '#8ecae6';
      ctx.fillRect(14, 18, 100, 8);
    }

    // Face zone
    ctx.fillStyle = skinColor;
    ctx.fillRect(16, 28, 96, 88);

    // Eyes
    ctx.fillStyle = eye;
    ctx.fillRect(36, 54, 10, 10);
    ctx.fillRect(82, 54, 10, 10);
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(38, 56, 3, 3);
    ctx.fillRect(84, 56, 3, 3);

    // Brows
    ctx.fillStyle = '#2b211b';
    ctx.fillRect(34, 46, 18, 3);
    ctx.fillRect(76, 46, 18, 3);

    // Nose
    ctx.fillStyle = 'rgba(60,40,30,0.55)';
    ctx.fillRect(61, 62, 6, 12);

    // Mouth
    ctx.fillStyle = mouth;
    if (role === 'chef') {
      ctx.fillRect(44, 88, 40, 4);
    } else if (seed % 3 === 0) {
      ctx.fillRect(42, 86, 44, 4);
    } else {
      ctx.fillRect(44, 84, 40, 4);
      ctx.fillRect(46, 88, 36, 2);
    }

    // Ears / cheeks
    ctx.fillStyle = skinColor;
    ctx.fillRect(8, 48, 8, 24);
    ctx.fillRect(112, 48, 8, 24);

    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    tex.colorSpace = THREE.SRGBColorSpace;
    faceTex.set(key, tex);
    return tex;
  }

  function makeHeadMaterial(role, seed) {
    const skinColor = pick(skin, seed, 1);
    const face = new THREE.MeshBasicMaterial({
      map: makeFaceTexture(role, seed),
      transparent: false,
      side: THREE.FrontSide,
    });
    const skinMat = makeMat(skinColor);
    // BoxGeometry order: right, left, top, bottom, front, back
    return [skinMat, skinMat, skinMat, skinMat, face, skinMat];
  }

  function clearKeepSprites(root) {
    const sprites = root.children.filter((c) => c.isSprite);
    root.clear();
    for (const s of sprites) root.add(s);
  }

  function buildCharacter(root, seed) {
    const role = norm(root.userData.type);
    const g = new THREE.Group();
    g.name = '__rz_voxel_character';

    const bodyColor = role === 'player' ? pick(player, seed, 3) : role === 'chef' ? pick(chef, seed, 3) : pick(customer, seed, 3);
    const pantsColor = pick(pants, seed, 4);
    const skinColor = pick(skin, seed, 1);
    const hairColor = pick(hair, seed, 2);

    const parts = {
      body: new THREE.Group(),
      head: new THREE.Group(),
      armL: new THREE.Group(),
      armR: new THREE.Group(),
      legL: new THREE.Group(),
      legR: new THREE.Group(),
      face: null,
    };

    // Torso silhouette: wide shoulders -> chest -> waist -> hips.
    makeBox(parts.body, 0.56, 0.18, 0.26, bodyColor, 0, 0.84, 0);
    makeBox(parts.body, 0.46, 0.22, 0.26, bodyColor, 0, 0.58, 0);
    makeBox(parts.body, 0.34, 0.20, 0.24, bodyColor, 0, 0.32, 0);
    makeBox(parts.body, 0.40, 0.18, 0.24, pantsColor, 0, 0.08, 0);

    // Head cube with face texture on the front side.
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), makeHeadMaterial(role, seed));
    head.position.set(0, 1.10, 0);
    parts.head.add(head);
    parts.face = head;

    // Hair / hats as separate voxel blocks.
    if (role === 'chef') {
      makeBox(parts.head, 0.34, 0.12, 0.34, 0xf9f9f4, 0, 1.36, 0);
      makeBox(parts.head, 0.18, 0.20, 0.18, 0xf9f9f4, -0.10, 1.48, 0);
      makeBox(parts.head, 0.22, 0.24, 0.22, 0xf9f9f4, 0, 1.54, 0);
      makeBox(parts.head, 0.18, 0.20, 0.18, 0xf9f9f4, 0.10, 1.48, 0);
      makeBox(parts.body, 0.24, 0.34, 0.06, 0xe8d9c2, 0, 0.34, 0.15); // apron
      makeBox(parts.body, 0.12, 0.03, 0.03, 0xb58b5d, 0, 0.16, 0.18); // apron tie
    } else if (role === 'player') {
      makeBox(parts.head, 0.34, 0.11, 0.34, 0x22314a, 0, 1.34, 0);
      makeBox(parts.head, 0.36, 0.04, 0.18, 0x8ecae6, 0, 1.28, 0.14); // cap brim
    } else {
      // simple voxel hair cap
      makeBox(parts.head, 0.34, 0.12, 0.34, hairColor, 0, 1.34, 0);
      makeBox(parts.head, 0.30, 0.06, 0.30, hairColor, 0, 1.39, -0.03);
    }

    // Limbs: blocky and Minecraft-like.
    makeBox(parts.armL, 0.16, 0.46, 0.16, role === 'chef' ? 0xfdfbf7 : bodyColor, 0, 0, 0);
    makeBox(parts.armR, 0.16, 0.46, 0.16, role === 'chef' ? 0xfdfbf7 : bodyColor, 0, 0, 0);
    makeBox(parts.legL, 0.16, 0.46, 0.16, pantsColor, 0, 0, 0);
    makeBox(parts.legR, 0.16, 0.46, 0.16, pantsColor, 0, 0, 0);

    // Hands / shoes can be simple blocks; keep the silhouette crisp.
    makeBox(parts.armL, 0.08, 0.08, 0.08, skinColor, 0, -0.25, 0);
    makeBox(parts.armR, 0.08, 0.08, 0.08, skinColor, 0, -0.25, 0);
    if (role !== 'chef') {
      makeBox(parts.legL, 0.14, 0.06, 0.22, 0x11151c, 0, -0.25, 0);
      makeBox(parts.legR, 0.14, 0.06, 0.22, 0x11151c, 0, -0.25, 0);
    }

    // Pose and scale.
    parts.body.position.set(0, 0, 0);
    parts.head.position.set(0, 0, 0);
    parts.armL.position.set(-0.32, 0.58, 0);
    parts.armR.position.set(0.32, 0.58, 0);
    parts.legL.position.set(-0.13, -0.32, 0);
    parts.legR.position.set(0.13, -0.32, 0);

    g.add(parts.body, parts.head, parts.armL, parts.armR, parts.legL, parts.legR);
    g.scale.setScalar(1.35);
    root.add(g);

    if (role !== 'chef') {
      // small shadow-ish foot if we want more readibility.
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.20), makeMat(0x11151c));
      shoe.position.set(0, -0.28, 0.03);
      parts.legL.add(shoe.clone());
      parts.legR.add(shoe);
    }

    return parts;
  }

  function saveBase(parts) {
    const base = {};
    for (const [key, obj] of Object.entries(parts)) {
      if (!obj || !obj.position) continue;
      base[key] = { p: obj.position.clone(), r: obj.rotation.clone(), s: obj.scale.clone() };
    }
    return base;
  }

  function restoreBase(parts, base) {
    for (const [key, obj] of Object.entries(parts)) {
      if (!obj || !base[key]) continue;
      obj.position.copy(base[key].p);
      obj.rotation.copy(base[key].r);
      obj.scale.copy(base[key].s);
    }
  }

  function attach(root) {
    if (!root || !TARGET_TYPES.has(norm(root.userData?.type)) || root.userData.__rzVoxelBuilt) return;
    clearKeepSprites(root);
    const seed = hash(`${root.userData.type}:${root.position.x.toFixed(3)}:${root.position.z.toFixed(3)}`);
    const parts = buildCharacter(root, seed);

    root.userData.__rzVoxelBuilt = true;
    state.set(root, {
      seed,
      phase: rand(seed, 7) * Math.PI * 2,
      time: rand(seed, 13) * 1000,
      mode: 'idle',
      speed: 0,
      last: root.getWorldPosition(new THREE.Vector3()),
      parts,
      base: saveBase(parts),
    });
    roots.add(root);
  }

  THREE.Object3D.prototype.add = function patchedAdd(...objs) {
    for (const obj of objs) {
      if (obj && typeof obj === 'object') attach(obj);
    }
    return add.apply(this, objs);
  };

  function animate(parts, info) {
    const t = info.time;
    const phase = info.phase;
    const walk = info.mode === 'walk';
    const eat = info.mode === 'eat';
    const idle = info.mode === 'idle';
    const stride = walk ? Math.sin(t * 7 + phase) : 0;

    if (parts.body) {
      parts.body.rotation.z = walk ? Math.sin(t * 7 + phase) * 0.02 : 0;
      parts.body.rotation.y = walk ? Math.sin(t * 7 + phase) * 0.012 : 0;
      parts.body.position.y = idle ? Math.sin(t * 2.0 + phase) * 0.012 : walk ? Math.sin(t * 7 + phase) * 0.016 : 0;
    }
    if (parts.head) {
      parts.head.rotation.y = walk ? Math.sin(t * 1.6 + phase) * 0.02 : 0;
      parts.head.rotation.x = eat ? 0.04 + Math.sin(t * 5 + phase) * 0.012 : 0;
    }

    if (parts.armL) {
      parts.armL.rotation.z = 0.08 + stride * 0.38;
      parts.armL.rotation.x = eat ? -0.06 : 0;
    }
    if (parts.armR) {
      parts.armR.rotation.z = -0.08 - stride * 0.38;
      parts.armR.rotation.x = eat ? -0.14 : 0;
    }
    if (parts.legL) parts.legL.rotation.z = 0.05 + stride * 0.5;
    if (parts.legR) parts.legR.rotation.z = -0.05 - stride * 0.5;

    if (parts.face && parts.face.material && parts.face.material.map) {
      parts.face.material.map.needsUpdate = true;
    }
  }

  function tick() {
    const dt = clock.getDelta();
    for (const root of roots) {
      const info = state.get(root);
      if (!info) continue;
      const pos = root.getWorldPosition(new THREE.Vector3());
      info.speed = pos.distanceTo(info.last) / Math.max(dt, 1 / 60);
      info.last.copy(pos);
      info.time += dt;
      info.mode = info.speed > 0.03 ? 'walk' : (norm(root.userData.type) === 'customer' && info.time % 100 > 1.1 ? 'eat' : 'idle');
      restoreBase(info.parts, info.base);
      animate(info.parts, info);
    }
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
})();
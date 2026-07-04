(() => {
  if (window.__rzCharacterOverhaulActive) return;
  window.__rzCharacterOverhaulActive = true;
  if (!window.THREE) return;

  const TARGET_TYPES = new Set(['player', 'chef', 'customer']);
  const roots = new Set();
  const states = new WeakMap();
  const add = THREE.Object3D.prototype.add;
  const clock = new THREE.Clock();

  const norm = (v) => String(v || '').trim().toLowerCase();
  const hashString = (text) => {
    let h = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
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

  const playerColors = [0x4d78b5, 0x3b82f6, 0x2f6fad, 0x5f87d8];
  const customerColors = [0x5f7dd6, 0xd96c6c, 0x4c9b72, 0x9e78d2, 0xdb8b47, 0x5a9bdb];
  const chefCoats = [0xf8f4eb, 0xf1eee7, 0xf6f1e7];
  const pantsColors = [0x1d2230, 0x22262d, 0x272a31, 0x2c2f35];
  const hairColors = [0x2c2a28, 0x3f2e24, 0x5e452f, 0x1c1f27, 0x6b4f3a];
  const skinColors = [0xf1cfb5, 0xeec7aa, 0xe7bf9f, 0xdcae87];

  const roleTextureCache = new Map();

  function mat(color, roughness = 0.95, emissive = 0x000000) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness: 0,
      emissive,
      emissiveIntensity: emissive ? 0.05 : 0,
      flatShading: true,
      side: THREE.DoubleSide,
    });
  }

  function mesh(parent, geometry, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const m = new THREE.Mesh(geometry, mat(color));
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.scale.set(sx, sy, sz);
    parent.add(m);
    return m;
  }

  function makeFaceTexture(role, seed) {
    const key = `${role}:${seed % 12}`;
    if (roleTextureCache.has(key)) return roleTextureCache.get(key);

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const skin = `#${pick(skinColors, seed, 1).toString(16).padStart(6, '0')}`;
    const hair = `#${pick(hairColors, seed, 2).toString(16).padStart(6, '0')}`;
    const eye = '#141414';
    const mouth = role === 'chef' ? '#7f4539' : role === 'customer' ? '#8b4e3f' : '#6f4b41';
    const blush = role === 'customer' ? 'rgba(255,170,160,0.16)' : 'rgba(255,180,150,0.10)';

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(128, 128);

    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(0, 8, 88, 104, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.ellipse(0, -28, 92, 68, 0, Math.PI, Math.PI * 2);
    ctx.fill();

    if (role === 'chef') {
      ctx.fillStyle = '#f9f9f4';
      ctx.beginPath();
      ctx.ellipse(0, -62, 70, 42, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-48, -64, 96, 26);
    }

    if (role === 'player') {
      ctx.fillStyle = '#22314a';
      ctx.beginPath();
      ctx.arc(0, -34, 54, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-56, -38, 112, 28);
      ctx.fillStyle = '#8ecae6';
      ctx.fillRect(-64, -10, 128, 12);
    }

    ctx.fillStyle = eye;
    ctx.beginPath();
    ctx.arc(-30, 10, 8, 0, Math.PI * 2);
    ctx.arc(30, 10, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f5f5f5';
    ctx.beginPath();
    ctx.arc(-28, 8, 3, 0, Math.PI * 2);
    ctx.arc(32, 8, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#2a201a';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-42, -8); ctx.lineTo(-18, -10);
    ctx.moveTo(18, -10); ctx.lineTo(42, -8);
    ctx.stroke();

    ctx.strokeStyle = mouth;
    ctx.lineWidth = 6;
    ctx.beginPath();
    if (role === 'chef') {
      ctx.moveTo(-18, 44); ctx.quadraticCurveTo(0, 54, 18, 44);
    } else if (role === 'customer' && seed % 3 === 0) {
      ctx.moveTo(-18, 48); ctx.lineTo(18, 48);
    } else {
      ctx.moveTo(-16, 44); ctx.quadraticCurveTo(0, 58, 16, 44);
    }
    ctx.stroke();

    ctx.fillStyle = blush;
    ctx.beginPath();
    ctx.ellipse(-48, 28, 18, 10, -0.2, 0, Math.PI * 2);
    ctx.ellipse(48, 28, 18, 10, 0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(-84, 8, 10, 18, 0, 0, Math.PI * 2);
    ctx.ellipse(84, 8, 10, 18, 0, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    texture.colorSpace = THREE.SRGBColorSpace;
    roleTextureCache.set(key, texture);
    return texture;
  }

  function makeFoot(color) {
    const g = new THREE.Group();
    mesh(g, new THREE.BoxGeometry(0.18, 0.05, 0.28), color, 0, 0.01, 0);
    mesh(g, new THREE.BoxGeometry(0.12, 0.06, 0.16), color, 0, 0.06, 0.04);
    return g;
  }

  function buildCharacter(root, seed) {
    const role = norm(root.userData.type);
    const group = new THREE.Group();
    group.name = '__rz_character';

    const skin = pick(skinColors, seed, 1);
    const hair = pick(hairColors, seed, 2);
    const bodyColor = role === 'player' ? pick(playerColors, seed, 3) : role === 'chef' ? pick(chefCoats, seed, 3) : pick(customerColors, seed, 3);
    const pants = pick(pantsColors, seed, 4);

    const parts = {
      group,
      torso: new THREE.Group(),
      head: new THREE.Group(),
      armL: new THREE.Group(),
      armR: new THREE.Group(),
      legL: new THREE.Group(),
      legR: new THREE.Group(),
      face: null,
    };

    mesh(parts.torso, new THREE.CylinderGeometry(0.26, 0.31, 0.36, 6), bodyColor, 0, 0.95, 0);
    mesh(parts.torso, new THREE.CylinderGeometry(0.22, 0.26, 0.24, 6), bodyColor, 0, 0.62, 0);
    mesh(parts.torso, new THREE.BoxGeometry(0.38, 0.20, 0.24), pants, 0, 0.30, 0);

    if (role === 'chef') {
      mesh(parts.torso, new THREE.BoxGeometry(0.42, 0.56, 0.10), 0xe8d9c2, 0, 0.58, 0.16);
      mesh(parts.torso, new THREE.BoxGeometry(0.14, 0.03, 0.03), 0xb58b5d, 0, 0.28, 0.20);
    }

    mesh(parts.head, new THREE.SphereGeometry(0.30, 10, 8), skin, 0, 0.26, 0, 0, 0, 0, 1.0, 1.02, 0.98);

    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(0.40, 0.42),
      new THREE.MeshBasicMaterial({
        map: makeFaceTexture(role, seed),
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    face.position.set(0, 0.00, 0.29);
    parts.head.add(face);
    parts.face = face;

    if (role === 'chef') {
      mesh(parts.head, new THREE.CylinderGeometry(0.18, 0.18, 0.12, 6), 0xf9f9f4, 0, 0.44, 0, 0, 0, 0);
      mesh(parts.head, new THREE.SphereGeometry(0.12, 8, 6), 0xf9f9f4, -0.08, 0.56, 0);
      mesh(parts.head, new THREE.SphereGeometry(0.15, 8, 6), 0xf9f9f4, 0.00, 0.64, 0);
      mesh(parts.head, new THREE.SphereGeometry(0.12, 8, 6), 0xf9f9f4, 0.08, 0.56, 0);
    } else if (role === 'player') {
      mesh(parts.head, new THREE.BoxGeometry(0.30, 0.11, 0.24), 0x22314a, 0, 0.42, 0.00);
      mesh(parts.head, new THREE.BoxGeometry(0.36, 0.04, 0.12), 0x8ecae6, 0, 0.36, 0.15);
    } else {
      mesh(parts.head, new THREE.SphereGeometry(0.26, 10, 8), hair, 0, 0.42, -0.04, 0, 0, 0, 1.03, 0.72, 0.88);
    }

    mesh(parts.armL, new THREE.CylinderGeometry(0.08, 0.09, 0.42, 6), role === 'chef' ? 0xfdfbf7 : bodyColor, 0, 0.00, 0, 0, 0, Math.PI / 2);
    mesh(parts.armR, new THREE.CylinderGeometry(0.08, 0.09, 0.42, 6), role === 'chef' ? 0xfdfbf7 : bodyColor, 0, 0.00, 0, 0, 0, Math.PI / 2);
    mesh(parts.legL, new THREE.CylinderGeometry(0.09, 0.10, 0.46, 6), pants, 0, 0.00, 0, 0, 0, Math.PI / 2);
    mesh(parts.legR, new THREE.CylinderGeometry(0.09, 0.10, 0.46, 6), pants, 0, 0.00, 0, 0, 0, Math.PI / 2);

    parts.torso.position.set(0, 0.00, 0);
    parts.head.position.set(0, 0.62, 0.01);
    parts.armL.position.set(-0.26, 0.64, 0);
    parts.armL.rotation.z = 0.15;
    parts.armR.position.set(0.26, 0.64, 0);
    parts.armR.rotation.z = -0.15;
    parts.legL.position.set(-0.12, -0.27, 0);
    parts.legL.rotation.z = 0.06;
    parts.legR.position.set(0.12, -0.27, 0);
    parts.legR.rotation.z = -0.06;

    if (role !== 'chef') {
      const footColor = role === 'player' ? 0x10131a : 0x1d2230;
      const footL = makeFoot(footColor);
      const footR = makeFoot(footColor);
      footL.position.set(0, -0.28, 0.02);
      footR.position.set(0, -0.28, 0.02);
      parts.legL.add(footL);
      parts.legR.add(footR);
    }

    group.add(parts.torso, parts.head, parts.armL, parts.armR, parts.legL, parts.legR);
    group.scale.setScalar(1.12);
    root.add(group);

    return parts;
  }

  function hideOldMeshTree(root) {
    root.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh || o.isSprite) o.visible = false;
    });
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

  function styleRoot(root) {
    if (!root || !root.userData || !TARGET_TYPES.has(norm(root.userData.type)) || root.userData.__rzEnhanced) return;
    hideOldMeshTree(root);
    const seed = hashString(`${root.userData.type}:${root.position.x.toFixed(3)}:${root.position.z.toFixed(3)}`);
    const parts = buildCharacter(root, seed);

    root.userData.__rzEnhanced = true;
    states.set(root, {
      seed,
      phase: rand(seed, 7) * Math.PI * 2,
      time: rand(seed, 13) * 1000,
      mode: 'idle',
      speed: 0,
      lastPos: root.getWorldPosition(new THREE.Vector3()),
      parts,
      base: saveBase(parts),
    });
    roots.add(root);
  }

  THREE.Object3D.prototype.add = function patchedAdd(...objs) {
    for (const obj of objs) {
      if (obj && typeof obj === 'object') styleRoot(obj);
    }
    return add.apply(this, objs);
  };

  function animate(parts, info) {
    const t = info.time;
    const phase = info.phase;
    const walking = info.mode === 'walk';
    const eating = info.mode === 'eat';
    const idle = info.mode === 'idle';

    if (parts.torso) {
      parts.torso.rotation.z = walking ? Math.sin(t * 10 + phase) * 0.05 : 0;
      parts.torso.position.y = idle ? Math.sin(t * 2.0 + phase) * 0.02 : walking ? Math.sin(t * 10 + phase) * 0.03 : 0;
    }
    if (parts.head) {
      parts.head.rotation.z = walking ? Math.sin(t * 10 + phase + 0.5) * 0.06 : Math.sin(t * 1.4 + phase) * 0.02;
      parts.head.rotation.x = eating ? 0.07 + Math.sin(t * 5.5 + phase) * 0.02 : 0;
      parts.head.position.y = 0.62 + (idle ? Math.sin(t * 2.0 + phase) * 0.01 : walking ? Math.sin(t * 10 + phase) * 0.02 : 0);
    }
    if (parts.armL) {
      parts.armL.rotation.z = 0.15 + (walking ? Math.sin(t * 10 + phase) * 0.45 : eating ? -0.05 : 0);
      parts.armL.rotation.x = eating ? -0.08 : 0;
    }
    if (parts.armR) {
      parts.armR.rotation.z = -0.15 + (walking ? -Math.sin(t * 10 + phase) * 0.45 : eating ? -0.75 : 0);
      parts.armR.rotation.x = eating ? -0.15 : 0;
    }
    if (parts.legL) parts.legL.rotation.z = 0.06 + (walking ? Math.sin(t * 10 + phase) * 0.52 : 0);
    if (parts.legR) parts.legR.rotation.z = -0.06 + (walking ? -Math.sin(t * 10 + phase) * 0.52 : 0);
  }

  function tick() {
    const dt = clock.getDelta();
    for (const root of roots) {
      const info = states.get(root);
      if (!info) continue;
      const pos = root.getWorldPosition(new THREE.Vector3());
      info.speed = pos.distanceTo(info.lastPos) / Math.max(dt, 1 / 60);
      info.lastPos.copy(pos);
      info.time += dt;
      info.mode = info.speed > 0.03 ? 'walk' : (norm(root.userData.type) === 'customer' && info.time % 100 > 1.1 ? 'eat' : 'idle');
      restoreBase(info.parts, info.base);
      animate(info.parts, info);
    }
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
})();
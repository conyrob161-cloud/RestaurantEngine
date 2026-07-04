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

  const playerPalettes = [0x4d78b5, 0x3b82f6, 0x2f6fad, 0x5f87d8];
  const customerPalettes = [0x5f7dd6, 0xd96c6c, 0x4c9b72, 0x9e78d2, 0xdb8b47, 0x5a9bdb];
  const chefCoats = [0xf8f4eb, 0xf1eee7, 0xf6f1e7];
  const pantsPalettes = [0x1d2230, 0x22262d, 0x272a31, 0x2c2f35];
  const hairPalettes = [0x2c2a28, 0x3f2e24, 0x5e452f, 0x1c1f27, 0x6b4f3a];
  const skinPalette = [0xf1cfb5, 0xeec7aa, 0xe7bf9f, 0xdcae87];

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

  function makeFace(head, seed, skin, hairColor, role) {
    const face = new THREE.Group();
    face.name = '__rz_face';

    const shell = mesh(face, new THREE.SphereGeometry(0.27, 10, 8), skin, 0, 0.02, 0, 0, 0, 0, 1.0, 1.08, 0.98);
    const hair = mesh(face, new THREE.SphereGeometry(0.25, 10, 8), hairColor, 0, 0.14, -0.02, 0, 0, 0, 1.03, 0.75, 0.85);
    const eyeMat = mat(0x101010, 0.2);
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), eyeMat);
    eyeL.position.set(-0.08, 0.03, 0.26);
    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), eyeMat);
    eyeR.position.set(0.08, 0.03, 0.26);
    face.add(eyeL, eyeR);

    if (seed % 3 === 0) {
      const browMat = mat(0x241b17, 0.8);
      const browL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.01, 0.015), browMat);
      const browR = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.01, 0.015), browMat);
      browL.position.set(-0.08, 0.08, 0.24);
      browR.position.set(0.08, 0.08, 0.24);
      face.add(browL, browR);
    }

    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.015, 0.02), mat(0x7a4035, 0.85));
    mouth.position.set(0, -0.10, 0.26);
    face.add(mouth);

    if (seed % 4 === 0) {
      const nose = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.03), mat(skin, 0.9));
      nose.position.set(0, -0.01, 0.28);
      face.add(nose);
    }

    if (role === 'chef') {
      const hat = new THREE.Group();
      const base = mesh(hat, new THREE.CylinderGeometry(0.16, 0.16, 0.10, 6), 0xf9f9f4, 0, 0.06, 0);
      const puffL = mesh(hat, new THREE.SphereGeometry(0.11, 8, 6), 0xf9f9f4, -0.08, 0.18, 0);
      const puffM = mesh(hat, new THREE.SphereGeometry(0.14, 8, 6), 0xf9f9f4, 0, 0.26, 0);
      const puffR = mesh(hat, new THREE.SphereGeometry(0.11, 8, 6), 0xf9f9f4, 0.08, 0.18, 0);
      hat.position.set(0, 0.37, 0);
      face.add(hat);
    }

    if (role === 'player') {
      const cap = new THREE.Group();
      mesh(cap, new THREE.BoxGeometry(0.30, 0.11, 0.24), 0x22314a, 0, 0.04, 0);
      mesh(cap, new THREE.BoxGeometry(0.36, 0.04, 0.12), 0x8ecae6, 0, -0.02, 0.15);
      cap.position.set(0, 0.33, 0.05);
      face.add(cap);
    }

    head.add(face);
    return face;
  }

  function buildCharacter(root, seed) {
    const role = norm(root.userData.type);
    const group = new THREE.Group();
    group.name = '__rz_character';

    const skin = pick(skinPalette, seed, 1);
    const hairColor = pick(hairPalettes, seed, 2);
    const shirtColor = role === 'player' ? pick(playerPalettes, seed, 3) : role === 'chef' ? pick(chefCoats, seed, 3) : pick(customerPalettes, seed, 3);
    const pantsColor = pick(pantsPalettes, seed, 4);

    const parts = {
      group,
      torso: new THREE.Group(),
      head: new THREE.Group(),
      armL: new THREE.Group(),
      armR: new THREE.Group(),
      legL: new THREE.Group(),
      legR: new THREE.Group(),
      chest: null,
      waist: null,
      pelvis: null,
      neck: null,
    };

    parts.pelvis = mesh(parts.torso, new THREE.BoxGeometry(0.40, 0.20, 0.26), pantsColor, 0, 0.26, 0);
    parts.waist = mesh(parts.torso, new THREE.CylinderGeometry(0.22, 0.26, 0.26, 6), shirtColor, 0, 0.58, 0);
    parts.chest = mesh(parts.torso, new THREE.CylinderGeometry(0.27, 0.34, 0.42, 6), shirtColor, 0, 0.98, 0);
    parts.neck = mesh(parts.head, new THREE.CylinderGeometry(0.06, 0.07, 0.10, 6), skin, 0, 0.00, 0);
    const headShell = mesh(parts.head, new THREE.SphereGeometry(0.30, 10, 8), skin, 0, 0.24, 0, 0, 0, 0, 1.0, 1.02, 0.98);
    const hair = mesh(parts.head, new THREE.SphereGeometry(0.27, 10, 8), hairColor, 0, 0.35, -0.02, 0, 0, 0, 1.03, 0.75, 0.86);

    if (role === 'chef') {
      mesh(parts.torso, new THREE.BoxGeometry(0.42, 0.54, 0.10), 0xe8d9c2, 0, 0.56, 0.16);
      mesh(parts.torso, new THREE.BoxGeometry(0.14, 0.03, 0.03), 0xb58b5d, 0, 0.28, 0.20);
      mesh(parts.torso, new THREE.BoxGeometry(0.18, 0.10, 0.025), 0xd6c7ae, 0, 0.45, 0.22);
    }

    makeFace(parts.head, seed, skin, hairColor, role);

    mesh(parts.armL, new THREE.CylinderGeometry(0.08, 0.09, 0.42, 6), role === 'chef' ? 0xfdfbf7 : shirtColor, 0, 0, 0, 0, 0, Math.PI / 2);
    mesh(parts.armR, new THREE.CylinderGeometry(0.08, 0.09, 0.42, 6), role === 'chef' ? 0xfdfbf7 : shirtColor, 0, 0, 0, 0, 0, Math.PI / 2);

    mesh(parts.legL, new THREE.CylinderGeometry(0.09, 0.10, 0.48, 6), pantsColor, 0, 0, 0, 0, 0, Math.PI / 2);
    mesh(parts.legR, new THREE.CylinderGeometry(0.09, 0.10, 0.48, 6), pantsColor, 0, 0, 0, 0, 0, Math.PI / 2);

    // Build a visually balanced low-poly body centered around the root origin.
    parts.torso.position.set(0, 0.00, 0);
    parts.head.position.set(0, 0.64, 0.02);
    parts.armL.position.set(-0.28, 0.62, 0);
    parts.armL.rotation.z = 0.15;
    parts.armR.position.set(0.28, 0.62, 0);
    parts.armR.rotation.z = -0.15;
    parts.legL.position.set(-0.12, -0.26, 0);
    parts.legL.rotation.z = 0.06;
    parts.legR.position.set(0.12, -0.26, 0);
    parts.legR.rotation.z = -0.06;

    group.add(parts.torso, parts.head, parts.armL, parts.armR, parts.legL, parts.legR);

    // Scale and nudge the character into a sensible standing size.
    group.scale.setScalar(1.15);
    group.position.set(0, 0, 0);
    root.add(group);

    return parts;
  }

  function hideOldMeshTree(root) {
    root.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh || o.isSprite) {
        o.visible = false;
      }
    });
  }

  function saveBase(parts) {
    const base = {};
    for (const [key, obj] of Object.entries(parts)) {
      if (!obj || !obj.position) continue;
      base[key] = {
        p: obj.position.clone(),
        r: obj.rotation.clone(),
        s: obj.scale.clone(),
      };
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
      parts.torso.position.y = idle ? Math.sin(t * 2.0 + phase) * 0.03 : walking ? Math.sin(t * 10 + phase) * 0.03 : 0;
    }
    if (parts.head) {
      parts.head.rotation.z = walking ? Math.sin(t * 10 + phase + 0.5) * 0.06 : Math.sin(t * 1.4 + phase) * 0.02;
      parts.head.rotation.x = eating ? 0.08 + Math.sin(t * 5.5 + phase) * 0.02 : 0;
      parts.head.position.y = 0.64 + (idle ? Math.sin(t * 2.0 + phase) * 0.01 : walking ? Math.sin(t * 10 + phase) * 0.02 : 0);
    }
    if (parts.armL) {
      parts.armL.rotation.z = 0.15 + (walking ? Math.sin(t * 10 + phase) * 0.5 : eating ? -0.05 : 0);
      parts.armL.rotation.x = eating ? -0.12 : 0;
    }
    if (parts.armR) {
      parts.armR.rotation.z = -0.15 + (walking ? -Math.sin(t * 10 + phase) * 0.5 : eating ? -0.8 : 0);
      parts.armR.rotation.x = eating ? -0.2 : 0;
    }
    if (parts.legL) parts.legL.rotation.z = 0.06 + (walking ? Math.sin(t * 10 + phase) * 0.55 : 0);
    if (parts.legR) parts.legR.rotation.z = -0.06 + (walking ? -Math.sin(t * 10 + phase) * 0.55 : 0);
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
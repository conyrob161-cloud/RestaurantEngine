(() => {
  if (window.__rzCharacterOverhaulActive) return;
  window.__rzCharacterOverhaulActive = true;
  if (!window.THREE) return;

  const TARGET_TYPES = new Set(['player', 'chef', 'customer']);
  const roots = new Set();
  const states = new WeakMap();
  const baseTransforms = new WeakMap();
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
  const legPalettes = [0x1d2230, 0x22262d, 0x272a31, 0x2c2f35];
  const hairPalettes = [0x2c2a28, 0x3f2e24, 0x5e452f, 0x1c1f27, 0x6b4f3a];
  const skinPalette = [0xf1cfb5, 0xeec7aa, 0xe7bf9f, 0xdcae87];

  function makeMaterial(color, roughness = 0.95, metalness = 0.0, emissive = 0x000000) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      emissive,
      emissiveIntensity: emissive ? 0.06 : 0.0,
      flatShading: true,
    });
  }

  function cloneMaterial(material, color, roughness, metalness, emissive) {
    if (Array.isArray(material)) return material.map((m) => cloneMaterial(m, color, roughness, metalness, emissive));
    const out = material ? material.clone() : makeMaterial(color, roughness, metalness, emissive);
    if (color !== undefined) out.color = new THREE.Color(color);
    if (roughness !== undefined) out.roughness = roughness;
    if (metalness !== undefined) out.metalness = metalness;
    if (emissive !== undefined) out.emissive = new THREE.Color(emissive);
    out.flatShading = true;
    out.side = THREE.DoubleSide;
    return out;
  }

  function setPartMaterial(mesh, color, roughness = 0.95, metalness = 0.0, emissive = 0x000000) {
    if (!mesh || !(mesh.isMesh || mesh.isSkinnedMesh)) return;
    mesh.material = cloneMaterial(mesh.material, color, roughness, metalness, emissive);
  }

  function addMesh(parent, geometry, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const mesh = new THREE.Mesh(geometry, makeMaterial(color));
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.scale.set(sx, sy, sz);
    parent.add(mesh);
    return mesh;
  }

  function makeEyes(seed, skin) {
    const g = new THREE.Group();
    const eyeMat = makeMaterial(0x111111, 0.3, 0.0, 0x000000);
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), eyeMat);
    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), eyeMat);
    eyeL.position.set(-0.08, 0.03, 0.26);
    eyeR.position.set(0.08, 0.03, 0.26);
    g.add(eyeL, eyeR);

    if (seed % 3 === 0) {
      const browMat = makeMaterial(0x241b17, 0.8);
      const browL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.01, 0.015), browMat);
      const browR = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.01, 0.015), browMat);
      browL.position.set(-0.08, 0.08, 0.24);
      browR.position.set(0.08, 0.08, 0.24);
      g.add(browL, browR);
    }

    const mouthMat = makeMaterial(0x7a4035, 0.85);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.015, 0.02), mouthMat);
    mouth.position.set(0, -0.10, 0.26);
    g.add(mouth);

    if (seed % 4 === 0) {
      const nose = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.03), makeMaterial(skin, 0.96));
      nose.position.set(0, -0.01, 0.28);
      g.add(nose);
    }

    return g;
  }

  function makeFoot(color) {
    const g = new THREE.Group();
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.24), makeMaterial(color, 0.98));
    sole.position.y = 0.01;
    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), makeMaterial(color, 0.98));
    toe.position.set(0, 0.00, 0.10);
    toe.scale.set(1.2, 0.8, 1.0);
    g.add(sole, toe);
    return g;
  }

  function makeTorso(role, seed, roleColor) {
    const g = new THREE.Group();
    const chestColor = role === 'chef' ? pick(chefCoats, seed, 1) : roleColor;
    const waistColor = role === 'chef' ? 0xf4efe4 : roleColor;
    const pelvisColor = role === 'chef' ? 0xe8d9c2 : role === 'player' ? roleColor : roleColor;

    const chest = addMesh(g, new THREE.CylinderGeometry(0.26, 0.34, 0.38, 6), chestColor, 0, 0.94, 0);
    chest.scale.set(1.0, 1.0, 0.96);
    const waist = addMesh(g, new THREE.CylinderGeometry(0.22, 0.26, 0.28, 6), waistColor, 0, 0.66, 0);
    waist.scale.set(1.0, 1.0, 0.96);
    const pelvis = addMesh(g, new THREE.BoxGeometry(0.38, 0.22, 0.24), pelvisColor, 0, 0.40, 0);
    pelvis.scale.set(1.0, 1.0, 1.0);

    if (role === 'chef') {
      const apron = addMesh(g, new THREE.BoxGeometry(0.42, 0.54, 0.10), 0xe8d9c2, 0, 0.58, 0.16);
      apron.scale.set(1.0, 1.0, 1.0);
      const tie = addMesh(g, new THREE.BoxGeometry(0.12, 0.03, 0.03), 0xb58b5d, 0, 0.31, 0.16);
      tie.scale.set(1.0, 1.0, 1.0);
    }

    if (role === 'player') {
      const hood = addMesh(g, new THREE.SphereGeometry(0.22, 8, 6), 0x21314b, 0, 1.18, -0.08);
      hood.scale.set(1.0, 0.85, 0.88);
    }

    return g;
  }

  function saveBase(root, parts) {
    if (baseTransforms.has(root)) return baseTransforms.get(root);
    const base = {};
    for (const [key, mesh] of Object.entries(parts)) {
      if (!mesh || !mesh.position) continue;
      base[key] = {
        p: mesh.position.clone(),
        r: mesh.rotation.clone(),
        s: mesh.scale.clone(),
      };
    }
    baseTransforms.set(root, base);
    return base;
  }

  function restoreBase(parts, base) {
    for (const [key, mesh] of Object.entries(parts)) {
      const b = base[key];
      if (!mesh || !b) continue;
      mesh.position.copy(b.p);
      mesh.rotation.copy(b.r);
      mesh.scale.copy(b.s);
    }
  }

  function detectParts(root) {
    const parts = {
      body: null,
      head: null,
      hair: null,
      armL: null,
      armR: null,
      legL: null,
      legR: null,
      shoeL: null,
      shoeR: null,
      hat: null,
      label: null,
    };

    root.traverse((o) => {
      if (o.isSprite) parts.label = o;
      if (!o.isMesh && !o.isSkinnedMesh) return;
      const y = o.position?.y ?? 0;
      const x = o.position?.x ?? 0;
      const geo = o.geometry?.type || '';
      if (y > 2.0) { if (!parts.hat) parts.hat = o; return; }
      if (y > 1.45 && geo === 'SphereGeometry' && !parts.head) { parts.head = o; return; }
      if (y > 1.45 && geo === 'SphereGeometry') { parts.hair = o; return; }
      if (y > 0.85 && geo === 'CylinderGeometry' && x < 0) { parts.armL = o; return; }
      if (y > 0.85 && geo === 'CylinderGeometry') { parts.armR = o; return; }
      if (y > 0.18 && geo === 'CylinderGeometry' && x < 0) { parts.legL = o; return; }
      if (y > 0.18 && geo === 'CylinderGeometry') { parts.legR = o; return; }
      if (y <= 0.18 && geo === 'BoxGeometry' && x < 0) { parts.shoeL = o; return; }
      if (y <= 0.18 && geo === 'BoxGeometry') { parts.shoeR = o; return; }
      if (!parts.body) parts.body = o;
    });

    return parts;
  }

  function makeFaceOnHead(head, seed, skin, hairColor, role) {
    const face = new THREE.Group();
    face.name = '__rz_face';

    const headScale = role === 'chef' ? 1.12 : 1.10;
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), makeMaterial(skin, 0.96));
    shell.scale.set(1.0, headScale, 0.98);
    shell.position.set(0, 0.02, 0.00);
    face.add(shell);

    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), makeMaterial(hairColor, 0.98));
    hair.scale.set(1.03, 0.76, 0.86);
    hair.position.set(0, 0.15, -0.02);
    face.add(hair);

    const eyes = makeEyes(seed, skin);
    eyes.position.set(0, 0.02, 0.02);
    face.add(eyes);

    if (role === 'chef') {
      const hat = new THREE.Group();
      const base = addMesh(hat, new THREE.CylinderGeometry(0.16, 0.16, 0.10, 6), 0xf9f9f4, 0, 0, 0);
      base.position.y = 0.06;
      const puff1 = addMesh(hat, new THREE.SphereGeometry(0.11, 8, 6), 0xf9f9f4, -0.08, 0.18, 0.00);
      const puff2 = addMesh(hat, new THREE.SphereGeometry(0.14, 8, 6), 0xf9f9f4, 0.00, 0.26, 0.00);
      const puff3 = addMesh(hat, new THREE.SphereGeometry(0.11, 8, 6), 0xf9f9f4, 0.08, 0.18, 0.00);
      hat.position.set(0, 0.37, 0.00);
      face.add(hat);
    }

    if (role === 'player') {
      const cap = new THREE.Group();
      const crown = addMesh(cap, new THREE.BoxGeometry(0.30, 0.11, 0.24), 0x22314a, 0, 0.04, 0.00);
      const brim = addMesh(cap, new THREE.BoxGeometry(0.36, 0.04, 0.12), 0x8ecae6, 0, -0.02, 0.15);
      cap.position.set(0, 0.32, 0.05);
      face.add(cap);
    }

    if (seed % 2 === 0) {
      const mouth = addMesh(face, new THREE.BoxGeometry(0.10, 0.015, 0.02), 0x7a4035, 0, -0.10, 0.26);
      mouth.scale.set(1.0, 1.0, 1.0);
    }

    if (seed % 4 === 0) {
      const nose = addMesh(face, new THREE.BoxGeometry(0.03, 0.05, 0.03), skin, 0, -0.01, 0.28);
    }

    face.position.set(0, 0.03, 0.02);
    head.add(face);
    return face;
  }

  function applyRoleStyle(root, parts, seed) {
    const role = norm(root.userData.type);
    const bodyColor = role === 'player' ? pick(playerPalettes, seed, 1) : role === 'chef' ? pick(chefCoats, seed, 2) : pick(customerPalettes, seed, 3);
    const hairColor = pick(hairPalettes, seed, 4);
    const skin = pick(skinPalette, seed, 5);
    const pantsColor = pick(legPalettes, seed, 6);

    setPartMaterial(parts.body, bodyColor, 0.98);
    setPartMaterial(parts.head, skin, 0.96);
    if (parts.hair) setPartMaterial(parts.hair, hairColor, 0.98);
    setPartMaterial(parts.legL, pantsColor, 1.0);
    setPartMaterial(parts.legR, pantsColor, 1.0);
    if (parts.shoeL) parts.shoeL.visible = false;
    if (parts.shoeR) parts.shoeR.visible = false;

    if (parts.body) {
      const torso = makeTorso(role, seed, bodyColor);
      torso.position.set(0, 0, 0.01);
      parts.body.add(torso);
    }

    if (parts.head) {
      makeFaceOnHead(parts.head, seed, skin, hairColor, role);
    }

    if (parts.armL) {
      const sleeve = addMesh(parts.armL, new THREE.CylinderGeometry(0.08, 0.09, 0.43, 6), bodyColor, 0, 0, 0);
      sleeve.scale.set(0.96, 1.0, 0.96);
      if (role === 'chef') sleeve.material = makeMaterial(0xfdfbf7, 0.95);
    }
    if (parts.armR) {
      const sleeve = addMesh(parts.armR, new THREE.CylinderGeometry(0.08, 0.09, 0.43, 6), bodyColor, 0, 0, 0);
      sleeve.scale.set(0.96, 1.0, 0.96);
      if (role === 'chef') sleeve.material = makeMaterial(0xfdfbf7, 0.95);
    }

    if (parts.legL) {
      const foot = makeFoot(role === 'player' ? 0x1b2030 : role === 'chef' ? 0x141414 : 0x1d2230);
      foot.position.set(0, -0.62, 0.02);
      foot.scale.set(1.0, 0.9, 1.0);
      parts.legL.add(foot);
    }
    if (parts.legR) {
      const foot = makeFoot(role === 'player' ? 0x1b2030 : role === 'chef' ? 0x141414 : 0x1d2230);
      foot.position.set(0, -0.62, 0.02);
      foot.scale.set(1.0, 0.9, 1.0);
      parts.legR.add(foot);
    }

    if (role === 'chef' && parts.body) {
      const apronTie = addMesh(parts.body, new THREE.BoxGeometry(0.15, 0.03, 0.03), 0xb58b5d, 0, 0.28, 0.20);
      const apronPocket = addMesh(parts.body, new THREE.BoxGeometry(0.18, 0.10, 0.025), 0xd6c7ae, 0, 0.45, 0.22);
      apronTie.scale.set(1.0, 1.0, 1.0);
      apronPocket.scale.set(1.0, 1.0, 1.0);
    }

    if (role === 'customer' && parts.body && seed % 2 === 1) {
      const scarf = addMesh(parts.body, new THREE.BoxGeometry(0.18, 0.05, 0.06), 0xffffff, 0, 0.76, 0.20);
      scarf.material = makeMaterial(pick([0xe9e9e9, 0xdfe9f1, 0xf5e1df], seed, 7), 0.9);
    }
  }

  function animateDetails(info) {
    const { parts, t, phase, mode } = info;
    const walking = mode === 'walk';
    const eating = mode === 'eat';
    const idle = mode === 'idle';

    if (parts.body) {
      parts.body.rotation.z += walking ? Math.sin(t * 10 + phase) * 0.012 : 0;
      parts.body.rotation.x += eating ? 0.03 + Math.sin(t * 6 + phase) * 0.015 : 0;
      parts.body.position.y += idle ? Math.sin(t * 2.0 + phase) * 0.005 : walking ? Math.sin(t * 10 + phase) * 0.010 : 0;
    }
    if (parts.head) {
      parts.head.rotation.z += walking ? Math.sin(t * 10 + phase + 0.5) * 0.03 : Math.sin(t * 1.4 + phase) * 0.012;
      parts.head.rotation.x += eating ? 0.04 + Math.sin(t * 5.5 + phase) * 0.015 : 0;
      parts.head.position.y += idle ? Math.sin(t * 2.0 + phase) * 0.003 : walking ? Math.sin(t * 10 + phase) * 0.008 : 0;
    }
    if (parts.hair) parts.hair.rotation.z += walking ? Math.sin(t * 10 + phase + 0.2) * 0.02 : Math.sin(t * 1.2 + phase) * 0.008;
    if (parts.armL) {
      parts.armL.rotation.z += walking ? Math.sin(t * 10 + phase) * 0.22 : eating ? -0.05 : 0;
      parts.armL.rotation.x += eating ? -0.08 : 0;
    }
    if (parts.armR) {
      parts.armR.rotation.z += walking ? -Math.sin(t * 10 + phase) * 0.22 : eating ? -0.70 : 0;
      parts.armR.rotation.x += eating ? -0.14 : 0;
    }
    if (parts.legL) parts.legL.rotation.z += walking ? Math.sin(t * 10 + phase) * 0.32 : 0;
    if (parts.legR) parts.legR.rotation.z += walking ? -Math.sin(t * 10 + phase) * 0.32 : 0;
    if (parts.label) parts.label.position.y += walking ? Math.sin(t * 10 + phase) * 0.008 : Math.sin(t * 1.6 + phase) * 0.006;
  }

  function enhanceRoot(root) {
    if (!root || !root.userData || !TARGET_TYPES.has(norm(root.userData.type)) || root.userData.__rzEnhanced) return;
    const seed = hashString(`${root.userData.type}:${root.position.x.toFixed(3)}:${root.position.z.toFixed(3)}`);
    const parts = detectParts(root);
    const base = saveBase(root, parts);

    applyRoleStyle(root, parts, seed);

    root.userData.__rzEnhanced = true;
    states.set(root, {
      seed,
      phase: rand(seed, 7) * Math.PI * 2,
      t: rand(seed, 13) * 1000,
      mode: 'idle',
      speed: 0,
      lastPos: root.getWorldPosition(new THREE.Vector3()),
      parts,
      base,
    });
    roots.add(root);
  }

  THREE.Object3D.prototype.add = function patchedAdd(...objs) {
    for (const obj of objs) {
      if (obj && typeof obj === 'object') enhanceRoot(obj);
    }
    return add.apply(this, objs);
  };

  function tick() {
    const dt = clock.getDelta();
    for (const root of roots) {
      const info = states.get(root);
      if (!info) continue;
      const pos = root.getWorldPosition(new THREE.Vector3());
      info.speed = pos.distanceTo(info.lastPos) / Math.max(dt, 1 / 60);
      info.lastPos.copy(pos);
      info.t += dt;
      info.mode = info.speed > 0.03 ? 'walk' : (norm(root.userData.type) === 'customer' && info.t % 100 > 1.1 ? 'eat' : 'idle');
      restoreBase(info.parts, info.base);
      animateDetails(info);
    }
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
})();
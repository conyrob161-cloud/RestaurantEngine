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

  const playerPalettes = [0x4d78b5, 0x3b82f6, 0x2f6fad, 0x5f87d8];
  const customerPalettes = [0x5f7dd6, 0xd96c6c, 0x4c9b72, 0x9e78d2, 0xdb8b47, 0x5a9bdb];
  const legPalettes = [0x1d2230, 0x22262d, 0x272a31, 0x2c2f35];
  const hairPalettes = [0x2c2a28, 0x3f2e24, 0x5e452f, 0x1c1f27, 0x6b4f3a];
  const skinPalette = [0xf1cfb5, 0xeec7aa, 0xe7bf9f, 0xdcae87];

  function makeMaterial(color, roughness = 0.95, metalness = 0.0, emissive = 0x000000) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      emissive,
      emissiveIntensity: emissive ? 0.08 : 0.0,
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

    const candidates = [];
    root.traverse((o) => {
      if (o.isSprite) parts.label = o;
      if (o.isMesh || o.isSkinnedMesh) candidates.push(o);
    });

    for (const mesh of candidates) {
      const y = mesh.position?.y ?? 0;
      const x = mesh.position?.x ?? 0;
      const geo = mesh.geometry?.type || '';

      if (y > 2.0) {
        if (!parts.hat) parts.hat = mesh;
        continue;
      }
      if (y > 1.45 && geo === 'SphereGeometry' && !parts.head) {
        parts.head = mesh;
        continue;
      }
      if (y > 1.45 && geo === 'SphereGeometry') {
        parts.hair = mesh;
        continue;
      }
      if (y > 0.85 && geo === 'CylinderGeometry' && x < 0) {
        parts.armL = mesh;
        continue;
      }
      if (y > 0.85 && geo === 'CylinderGeometry') {
        parts.armR = mesh;
        continue;
      }
      if (y > 0.18 && geo === 'CylinderGeometry' && x < 0) {
        parts.legL = mesh;
        continue;
      }
      if (y > 0.18 && geo === 'CylinderGeometry') {
        parts.legR = mesh;
        continue;
      }
      if (y <= 0.18 && geo === 'BoxGeometry' && x < 0) {
        parts.shoeL = mesh;
        continue;
      }
      if (y <= 0.18 && geo === 'BoxGeometry') {
        parts.shoeR = mesh;
        continue;
      }
      if (!parts.body) parts.body = mesh;
    }

    return parts;
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

  function makeBoot(color) {
    const g = new THREE.Group();
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.35), makeMaterial(color, 0.98));
    sole.position.y = 0.02;
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.10, 0.22), makeMaterial(color, 0.96));
    top.position.set(0, 0.08, -0.03);
    g.add(sole, top);
    return g;
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
    return g;
  }

  function addCustomerStyle(root, parts, seed) {
    const bodyColor = customerPalettes[seed % customerPalettes.length];
    const hairColor = hairPalettes[(seed + 1) % hairPalettes.length];
    const pantsColor = legPalettes[(seed + 2) % legPalettes.length];
    const skin = skinPalette[(seed + 3) % skinPalette.length];

    setPartMaterial(parts.body, bodyColor, 0.98);
    setPartMaterial(parts.head, skin, 0.96);
    if (parts.hair) setPartMaterial(parts.hair, hairColor, 0.98);
    setPartMaterial(parts.legL, pantsColor, 1.0);
    setPartMaterial(parts.legR, pantsColor, 1.0);
    setPartMaterial(parts.shoeL, 0x111318, 1.0);
    setPartMaterial(parts.shoeR, 0x111318, 1.0);

    const jacket = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.36, 0.86, 6), makeMaterial(bodyColor, 0.92));
    jacket.position.set(0, 0.82, 0);
    if (parts.body) parts.body.add(jacket);

    if (parts.body) {
      const collar = new THREE.Mesh(new THREE.RingGeometry(0.11, 0.18, 6), makeMaterial(0xfaf4e8, 0.9));
      collar.rotation.x = -Math.PI / 2;
      collar.position.set(0, 1.14, 0.10);
      parts.body.add(collar);
    }

    if (parts.head) {
      const eyes = makeEyes(seed, skin);
      parts.head.add(eyes);
      if (seed % 2 === 0) {
        const glassesMat = makeMaterial(0x101010, 0.35);
        const frameL = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 6, 10), glassesMat);
        const frameR = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 6, 10), glassesMat);
        const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.008, 0.008), glassesMat);
        frameL.position.set(-0.08, 0.02, 0.25);
        frameR.position.set(0.08, 0.02, 0.25);
        bridge.position.set(0, 0.02, 0.25);
        parts.head.add(frameL, frameR, bridge);
      }
    }

    if (parts.armL) parts.armL.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.38, 6), makeMaterial(bodyColor, 0.94)));
    if (parts.armR) parts.armR.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.38, 6), makeMaterial(bodyColor, 0.94)));
    if (parts.shoeL) parts.shoeL.add(makeBoot(0x15181f));
    if (parts.shoeR) parts.shoeR.add(makeBoot(0x15181f));
  }

  function addChefStyle(root, parts, seed) {
    const jacketColor = 0xf8f4eb;
    const apronColor = 0xe8d9c2;
    const hatColor = 0xf9f9f4;
    const skin = skinPalette[(seed + 1) % skinPalette.length];
    const hairColor = hairPalettes[(seed + 2) % hairPalettes.length];

    setPartMaterial(parts.body, jacketColor, 0.95);
    setPartMaterial(parts.head, skin, 0.96);
    if (parts.hair) setPartMaterial(parts.hair, hairColor, 0.98);
    setPartMaterial(parts.legL, 0x191919, 1.0);
    setPartMaterial(parts.legR, 0x191919, 1.0);
    setPartMaterial(parts.shoeL, 0x141414, 1.0);
    setPartMaterial(parts.shoeR, 0x141414, 1.0);

    const apron = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.58, 0.12), makeMaterial(apronColor, 0.96));
    apron.position.set(0, 0.58, 0.22);
    if (parts.body) parts.body.add(apron);

    const apronTie = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.03), makeMaterial(0xb58b5d, 0.92));
    apronTie.position.set(0, 0.28, 0.22);
    if (parts.body) parts.body.add(apronTie);

    if (parts.head) {
      const chefHat = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 6), makeMaterial(hatColor, 0.85));
      base.position.y = 0.05;
      chefHat.add(base);
      const puffs = [
        [-0.10, 0.18, 0],
        [0.00, 0.26, 0],
        [0.10, 0.18, 0],
      ];
      for (const [x, y, z] of puffs) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), makeMaterial(hatColor, 0.8));
        puff.position.set(x, y, z);
        chefHat.add(puff);
      }
      chefHat.position.set(0, 0.84, 0);
      parts.head.add(chefHat);
      parts.head.add(makeEyes(seed, skin));
    }

    if (parts.armL) parts.armL.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.40, 6), makeMaterial(0xfdfbf7, 0.95)));
    if (parts.armR) parts.armR.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.40, 6), makeMaterial(0xfdfbf7, 0.95)));
    if (parts.shoeL) parts.shoeL.add(makeBoot(0x141414));
    if (parts.shoeR) parts.shoeR.add(makeBoot(0x141414));
  }

  function addPlayerStyle(root, parts, seed) {
    const hoodieColor = playerPalettes[seed % playerPalettes.length];
    const hoodShadow = playerPalettes[(seed + 1) % playerPalettes.length];
    const skin = skinPalette[(seed + 2) % skinPalette.length];
    const hairColor = hairPalettes[(seed + 3) % hairPalettes.length];

    setPartMaterial(parts.body, hoodieColor, 0.96);
    setPartMaterial(parts.head, skin, 0.96);
    if (parts.hair) setPartMaterial(parts.hair, hairColor, 0.98);
    setPartMaterial(parts.legL, legPalettes[(seed + 1) % legPalettes.length], 1.0);
    setPartMaterial(parts.legR, legPalettes[(seed + 2) % legPalettes.length], 1.0);
    setPartMaterial(parts.shoeL, 0x10131a, 1.0);
    setPartMaterial(parts.shoeR, 0x10131a, 1.0);

    const hoodie = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.36, 0.88, 6), makeMaterial(hoodieColor, 0.95));
    hoodie.position.set(0, 0.82, 0);
    if (parts.body) parts.body.add(hoodie);

    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), makeMaterial(hoodShadow, 0.96));
    hood.scale.set(1.0, 0.90, 0.92);
    hood.position.set(0, 1.14, -0.10);
    if (parts.body) parts.body.add(hood);

    if (parts.head) {
      parts.head.add(makeEyes(seed, skin));
      const cap = new THREE.Group();
      const crown = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.26), makeMaterial(0x22314a, 0.85));
      crown.position.y = 0.04;
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.05, 0.16), makeMaterial(0x8ecae6, 0.82));
      brim.position.set(0, -0.02, 0.16);
      cap.add(crown, brim);
      cap.position.set(0, 0.88, 0.01);
      parts.head.add(cap);
    }

    if (parts.armL) parts.armL.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.43, 6), makeMaterial(hoodieColor, 0.95)));
    if (parts.armR) parts.armR.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.43, 6), makeMaterial(hoodieColor, 0.95)));
    if (parts.shoeL) parts.shoeL.add(makeBoot(0x10131a));
    if (parts.shoeR) parts.shoeR.add(makeBoot(0x10131a));
  }

  function animateDetails(root, parts, info) {
    const t = info.time;
    const walking = info.mode === 'walk';
    const eating = info.mode === 'eat';
    const idle = info.mode === 'idle';

    if (parts.body) {
      parts.body.rotation.z += walking ? Math.sin(t * 10 + info.phase) * 0.02 : 0;
      parts.body.rotation.x += eating ? 0.05 + Math.sin(t * 6 + info.phase) * 0.02 : 0;
      parts.body.position.y += idle ? Math.sin(t * 2.0 + info.phase) * 0.006 : walking ? Math.sin(t * 10 + info.phase) * 0.012 : 0;
    }
    if (parts.head) {
      parts.head.rotation.z += walking ? Math.sin(t * 10 + info.phase + 0.5) * 0.035 : Math.sin(t * 1.4 + info.phase) * 0.015;
      parts.head.rotation.x += eating ? 0.06 + Math.sin(t * 5.5 + info.phase) * 0.02 : 0;
      parts.head.position.y += idle ? Math.sin(t * 2.0 + info.phase) * 0.004 : walking ? Math.sin(t * 10 + info.phase) * 0.01 : 0;
    }
    if (parts.hair) parts.hair.rotation.z += walking ? Math.sin(t * 10 + info.phase + 0.2) * 0.03 : Math.sin(t * 1.2 + info.phase) * 0.01;
    if (parts.armL) {
      parts.armL.rotation.z += walking ? Math.sin(t * 10 + info.phase) * 0.28 : eating ? -0.08 : 0;
      parts.armL.rotation.x += eating ? -0.12 : 0;
    }
    if (parts.armR) {
      parts.armR.rotation.z += walking ? -Math.sin(t * 10 + info.phase) * 0.28 : eating ? -0.85 : 0;
      parts.armR.rotation.x += eating ? -0.22 : 0;
    }
    if (parts.legL) parts.legL.rotation.z += walking ? Math.sin(t * 10 + info.phase) * 0.38 : 0;
    if (parts.legR) parts.legR.rotation.z += walking ? -Math.sin(t * 10 + info.phase) * 0.38 : 0;
    if (parts.shoeL) parts.shoeL.rotation.z += walking ? Math.sin(t * 10 + info.phase) * 0.12 : 0;
    if (parts.shoeR) parts.shoeR.rotation.z += walking ? -Math.sin(t * 10 + info.phase) * 0.12 : 0;
    if (parts.label) parts.label.position.y += walking ? Math.sin(t * 10 + info.phase) * 0.01 : Math.sin(t * 1.6 + info.phase) * 0.008;
  }

  function enhanceRoot(root) {
    if (!root || !root.userData || !TARGET_TYPES.has(norm(root.userData.type)) || root.userData.__rzEnhanced) return;
    const seed = hashString(`${root.userData.type}:${root.position.x.toFixed(3)}:${root.position.z.toFixed(3)}`);
    const parts = detectParts(root);
    const base = saveBase(root, parts);

    if (root.userData.type === 'chef') addChefStyle(root, parts, seed);
    else if (root.userData.type === 'player') addPlayerStyle(root, parts, seed);
    else addCustomerStyle(root, parts, seed);

    root.userData.__rzEnhanced = true;
    states.set(root, {
      seed,
      phase: rand(seed, 7) * Math.PI * 2,
      time: rand(seed, 13) * 1000,
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
      info.time += dt;
      info.mode = info.speed > 0.03 ? 'walk' : (norm(root.userData.type) === 'customer' && info.time % 100 > 1.1 ? 'eat' : 'idle');
      restoreBase(info.parts, info.base);
      animateDetails(root, info.parts, info);
    }
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
})();
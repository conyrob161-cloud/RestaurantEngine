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
  const faceTextures = new Map();

  function mat(color, roughness = 0.95, emissive = 0x000000) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness: 0,
      emissive,
      emissiveIntensity: emissive ? 0.04 : 0,
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

  function faceTexture(role, seed) {
    const key = `${role}:${seed % 16}`;
    if (faceTextures.has(key)) return faceTextures.get(key);

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const skin = `#${pick(skinColors, seed, 1).toString(16).padStart(6, '0')}`;
    const hair = `#${pick(hairColors, seed, 2).toString(16).padStart(6, '0')}`;
    const eye = '#111111';
    const mouth = role === 'chef' ? '#82483c' : '#6d4337';
    const cheek = role === 'customer' ? 'rgba(255,180,170,0.16)' : 'rgba(255,190,170,0.10)';

    ctx.clearRect(0, 0, 256, 256);

    // subtle hair silhouette at the top so the face can stay simple and readable
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.ellipse(128, 80, 92, 66, 0, Math.PI, Math.PI * 2);
    ctx.fill();

    if (role === 'chef') {
      ctx.fillStyle = '#f9f9f4';
      ctx.beginPath();
      ctx.ellipse(128, 66, 72, 38, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(64, 50, 128, 28);
    }

    if (role === 'player') {
      ctx.fillStyle = '#22314a';
      ctx.beginPath();
      ctx.arc(128, 72, 56, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(70, 56, 116, 24);
      ctx.fillStyle = '#8ecae6';
      ctx.fillRect(58, 76, 140, 10);
    }

    // face area in the lower center
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(128, 140, 72, 84, 0, 0, Math.PI * 2);
    ctx.fill();

    // ears
    ctx.beginPath();
    ctx.ellipse(56, 146, 10, 18, -0.1, 0, Math.PI * 2);
    ctx.ellipse(200, 146, 10, 18, 0.1, 0, Math.PI * 2);
    ctx.fill();

    // eyes
    ctx.fillStyle = eye;
    ctx.beginPath();
    ctx.arc(104, 132, 7, 0, Math.PI * 2);
    ctx.arc(152, 132, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f5f5f5';
    ctx.beginPath();
    ctx.arc(102, 130, 2.5, 0, Math.PI * 2);
    ctx.arc(154, 130, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // brows
    ctx.strokeStyle = '#2b211b';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(88, 118); ctx.lineTo(110, 116);
    ctx.moveTo(146, 116); ctx.lineTo(168, 118);
    ctx.stroke();

    // nose
    ctx.strokeStyle = 'rgba(60,40,30,0.5)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(128, 136); ctx.lineTo(128, 150);
    ctx.stroke();

    // mouth
    ctx.strokeStyle = mouth;
    ctx.lineWidth = 5;
    ctx.beginPath();
    if (role === 'chef') {
      ctx.moveTo(110, 170); ctx.quadraticCurveTo(128, 180, 146, 170);
    } else if (seed % 3 === 0) {
      ctx.moveTo(112, 170); ctx.lineTo(144, 170);
    } else {
      ctx.moveTo(112, 166); ctx.quadraticCurveTo(128, 182, 144, 166);
    }
    ctx.stroke();

    ctx.fillStyle = cheek;
    ctx.beginPath();
    ctx.ellipse(86, 154, 16, 9, -0.2, 0, Math.PI * 2);
    ctx.ellipse(170, 154, 16, 9, 0.2, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    texture.colorSpace = THREE.SRGBColorSpace;
    faceTextures.set(key, texture);
    return texture;
  }

  function makeFoot(color) {
    const g = new THREE.Group();
    mesh(g, new THREE.BoxGeometry(0.16, 0.05, 0.26), color, 0, 0.01, 0);
    mesh(g, new THREE.BoxGeometry(0.11, 0.05, 0.15), color, 0, 0.05, 0.04);
    return g;
  }

  function hideOldMeshTree(root) {
    root.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh || o.isSprite) o.visible = false;
    });
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
      chest: new THREE.Group(),
      head: new THREE.Group(),
      armL: new THREE.Group(),
      armR: new THREE.Group(),
      legL: new THREE.Group(),
      legR: new THREE.Group(),
      body: new THREE.Group(),
      face: null,
    };

    // torso: chest / waist / hips
    mesh(parts.body, new THREE.CylinderGeometry(0.25, 0.30, 0.34, 6), bodyColor, 0, 0.72, 0);
    mesh(parts.body, new THREE.CylinderGeometry(0.22, 0.25, 0.24, 6), bodyColor, 0, 0.46, 0);
    mesh(parts.body, new THREE.BoxGeometry(0.36, 0.18, 0.22), pants, 0, 0.20, 0);

    if (role === 'chef') {
      mesh(parts.body, new THREE.BoxGeometry(0.40, 0.52, 0.10), 0xe8d9c2, 0, 0.46, 0.16);
      mesh(parts.body, new THREE.BoxGeometry(0.13, 0.03, 0.03), 0xb58b5d, 0, 0.18, 0.20);
    }

    // head and face
    mesh(parts.head, new THREE.SphereGeometry(0.23, 10, 8), skin, 0, 0.98, 0.02, 0, 0, 0, 1.0, 1.06, 0.98);
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.36),
      new THREE.MeshBasicMaterial({
        map: faceTexture(role, seed),
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    face.position.set(0, 0.98, 0.25);
    parts.head.add(face);
    parts.face = face;

    // simple hair / hats
    if (role === 'chef') {
      mesh(parts.head, new THREE.CylinderGeometry(0.15, 0.15, 0.10, 6), 0xf9f9f4, 0, 1.16, 0);
      mesh(parts.head, new THREE.SphereGeometry(0.11, 8, 6), 0xf9f9f4, -0.08, 1.24, 0);
      mesh(parts.head, new THREE.SphereGeometry(0.14, 8, 6), 0xf9f9f4, 0.00, 1.30, 0);
      mesh(parts.head, new THREE.SphereGeometry(0.11, 8, 6), 0xf9f9f4, 0.08, 1.24, 0);
    } else if (role === 'player') {
      mesh(parts.head, new THREE.BoxGeometry(0.28, 0.10, 0.22), 0x22314a, 0, 1.18, 0.00);
      mesh(parts.head, new THREE.BoxGeometry(0.34, 0.04, 0.10), 0x8ecae6, 0, 1.13, 0.14);
    } else {
      mesh(parts.head, new THREE.SphereGeometry(0.22, 10, 8), hair, 0, 1.16, -0.03, 0, 0, 0, 1.02, 0.70, 0.88);
    }

    // limbs: simple, readable proportions
    mesh(parts.armL, new THREE.CylinderGeometry(0.07, 0.08, 0.34, 6), role === 'chef' ? 0xfdfbf7 : bodyColor, 0, 0, 0, 0, 0, Math.PI / 2);
    mesh(parts.armR, new THREE.CylinderGeometry(0.07, 0.08, 0.34, 6), role === 'chef' ? 0xfdfbf7 : bodyColor, 0, 0, 0, 0, 0, Math.PI / 2);
    mesh(parts.legL, new THREE.CylinderGeometry(0.08, 0.09, 0.40, 6), pants, 0, 0, 0, 0, 0, Math.PI / 2);
    mesh(parts.legR, new THREE.CylinderGeometry(0.08, 0.09, 0.40, 6), pants, 0, 0, 0, 0, 0, Math.PI / 2);

    // pose: a bit wider shoulders, narrower head, longer legs.
    parts.body.position.set(0, 0, 0);
    parts.head.position.set(0, 0, 0);
    parts.armL.position.set(-0.24, 0.62, 0);
    parts.armR.position.set(0.24, 0.62, 0);
    parts.legL.position.set(-0.11, -0.22, 0);
    parts.legR.position.set(0.11, -0.22, 0);

    // Attach children to the root group in a centered layout.
    group.add(parts.body, parts.head, parts.armL, parts.armR, parts.legL, parts.legR);
    group.position.set(0, 0, 0);
    group.scale.setScalar(1.08);
    root.add(group);

    // role extras without changing silhouette too much
    if (role === 'chef') {
      const apron = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.30, 0.03), mat(0xe8d9c2, 0.95));
      apron.position.set(0, 0.36, 0.16);
      parts.body.add(apron);
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
    const walk = info.mode === 'walk';
    const eat = info.mode === 'eat';
    const idle = info.mode === 'idle';

    // body and head: subtle breathing / bobbing
    if (parts.body) {
      parts.body.rotation.z = walk ? Math.sin(t * 8 + phase) * 0.03 : 0;
      parts.body.position.y = idle ? Math.sin(t * 2.0 + phase) * 0.015 : walk ? Math.sin(t * 8 + phase) * 0.02 : 0;
    }
    if (parts.head) {
      parts.head.rotation.z = walk ? Math.sin(t * 8 + phase + 0.35) * 0.035 : Math.sin(t * 1.2 + phase) * 0.01;
      parts.head.rotation.x = eat ? 0.05 + Math.sin(t * 5 + phase) * 0.015 : 0;
      parts.head.position.y = 0;
    }

    // natural walk: arms move opposite to legs
    const stride = walk ? Math.sin(t * 8 + phase) : 0;
    const armSwing = stride * 0.45;
    const elbowSwing = stride * 0.18;
    const legSwing = stride * 0.55;
    const kneeSwing = stride * 0.20;

    if (parts.armL) {
      parts.armL.rotation.z = 0.08 + armSwing;
      parts.armL.rotation.x = eat ? -0.08 : 0;
    }
    if (parts.armR) {
      parts.armR.rotation.z = -0.08 - armSwing;
      parts.armR.rotation.x = eat ? -0.18 : 0;
    }
    if (parts.legL) {
      parts.legL.rotation.z = 0.04 + legSwing;
      parts.legL.rotation.x = kneeSwing * 0.1;
    }
    if (parts.legR) {
      parts.legR.rotation.z = -0.04 - legSwing;
      parts.legR.rotation.x = -kneeSwing * 0.1;
    }

    // small upper-body counter motion makes the cycle feel less floaty.
    if (parts.body && walk) {
      parts.body.rotation.y = Math.sin(t * 8 + phase) * 0.02;
    }

    // texture / face adjustment for idle and eating
    if (parts.face && eat) {
      parts.face.rotation.x = 0.08;
      parts.face.rotation.y = 0;
    } else if (parts.face) {
      parts.face.rotation.x = 0;
    }
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
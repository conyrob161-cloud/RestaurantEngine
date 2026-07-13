(() => {
  if (window.__rzMCCharacterPatchActive || !window.THREE) return;
  window.__rzMCCharacterPatchActive = true;

  const TARGET_TYPES = new Set(['player', 'chef', 'customer']);
  const roots = new Set();
  const meta = new WeakMap();
  const originalAdd = THREE.Object3D.prototype.add;
  const clock = new THREE.Clock();
  const tmpPos = new THREE.Vector3();
  const chefLoader = new THREE.GLTFLoader();
  const chefModelPromiseCache = new Map();

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
  const faceTex = new Map();

  function makeMat(color, roughness = 0.98) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, flatShading: true, side: THREE.DoubleSide });
  }

  function box(parent, w, h, d, color, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), makeMat(color));
    m.position.set(x, y, z);
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
    else { ctx.fillRect(44, 82, 40, 4); ctx.fillRect(46, 86, 36, 2); }
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

  function clearKeepSprites(root) {
    const sprites = root.children.filter((c) => c.isSprite);
    root.clear();
    for (const s of sprites) root.add(s);
  }

  function createShadow(opacity = 0.18, radius = 0.4) {
    const s = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity })
    );
    s.rotation.x = -Math.PI / 2;
    s.position.y = 0.01;
    return s;
  }

  function fitModel(model) {
    model.traverse((obj) => {
      if (obj && obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    const box3 = new THREE.Box3().setFromObject(model);
    const size = box3.getSize(new THREE.Vector3());
    const center = box3.getCenter(new THREE.Vector3());
    const height = Math.max(size.y, 0.001);
    const scale = 1.95 / height;
    model.scale.setScalar(scale);
    model.position.sub(center);
    model.position.multiplyScalar(scale);
    const box4 = new THREE.Box3().setFromObject(model);
    model.position.y -= box4.min.y;
  }

  function loadChefModel() {
    if (!chefModelPromiseCache.has('chef')) {
      chefModelPromiseCache.set('chef', new Promise((resolve, reject) => {
        chefLoader.load('Meshy_AI_Meshy_Merged_Animations.glb', resolve, undefined, reject);
      }));
    }
    return chefModelPromiseCache.get('chef');
  }

  function attachChefModel(root) {
    if (!root || root.userData.__chefModelApplied) return;
    root.userData.__chefModelApplied = true;

    const wrapper = root.userData.__chefWrapper || new THREE.Group();
    wrapper.name = '__rzChefModelWrapper';
    root.userData.__chefWrapper = wrapper;

    while (root.children.length) root.remove(root.children[0]);
    root.add(createShadow(0.18, 0.42));
    root.add(wrapper);

    loadChefModel().then((gltf) => {
      if (!root || !root.userData.__chefModelApplied) return;
      while (wrapper.children.length) wrapper.remove(wrapper.children[0]);
      const source = gltf.scene || gltf.scenes?.[0];
      const model = THREE.SkeletonUtils && typeof THREE.SkeletonUtils.clone === 'function'
        ? THREE.SkeletonUtils.clone(source)
        : source.clone(true);
      model.name = '__rzChefModel';
      fitModel(model);
      wrapper.add(model);

      const clips = Array.isArray(gltf.animations) ? gltf.animations : [];
      if (clips.length) {
        const mixer = new THREE.AnimationMixer(model);
        const clip = clips.find((c) => /idle/i.test(c.name || '')) || clips[0];
        mixer.clipAction(clip).play();
        model.userData.__chefMixer = mixer;
      }
    }).catch((err) => console.warn('Chef model load failed:', err));
  }

  function buildChef(root) {
    root.userData.__mcBuilt = true;
    root.userData.__chefModelApplied = false;
    root.visible = true;
    attachChefModel(root);
  }

  function buildHumanoid(root, role, seed) {
    clearKeepSprites(root);

    const bodyColor = role === 'player' ? pick(player, seed, 3) : pick(customer, seed, 3);
    const hairColor = role === 'player' ? 0x24324c : pick(hair, seed, 2);
    const skinColor = pick(skin, seed, 1);
    const bodyMat = makeMat(bodyColor);
    const skinMat = makeMat(skinColor);
    const faceMat = new THREE.MeshBasicMaterial({ map: makeFaceTexture(role, seed), side: THREE.FrontSide });

    const visual = new THREE.Group();
    visual.position.y = 0.30;
    root.add(createShadow(0.18, 0.4));
    root.add(visual);

    const body = new THREE.Group();
    box(body, 0.50, 0.58, 0.26, bodyColor, 0, 0.62, 0);
    visual.add(body);

    const head = new THREE.Group();
    const headCube = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.42, 0.42),
      [skinMat.clone(), skinMat.clone(), skinMat.clone(), skinMat.clone(), faceMat, skinMat.clone()]
    );
    headCube.position.y = 1.22;
    head.add(headCube);

    if (role === 'player') {
      box(head, 0.34, 0.12, 0.28, 0x24324c, 0, 1.50, 0);
      box(head, 0.38, 0.05, 0.18, 0x8ecae6, 0, 1.44, 0.14);
    } else {
      const style = seed % 4;
      if (style === 0) {
        box(head, 0.34, 0.12, 0.34, hairColor, 0, 1.46, 0);
        box(head, 0.28, 0.08, 0.28, hairColor, 0, 1.52, -0.02);
      } else if (style === 1) {
        box(head, 0.34, 0.10, 0.34, hairColor, 0, 1.46, 0);
        box(head, 0.14, 0.16, 0.10, hairColor, -0.12, 1.40, 0.10);
        box(head, 0.12, 0.14, 0.10, hairColor, 0.10, 1.42, 0.08);
      } else if (style === 2) {
        box(head, 0.34, 0.12, 0.34, hairColor, 0, 1.46, 0);
        box(head, 0.20, 0.22, 0.18, hairColor, 0, 1.56, 0.02);
      } else {
        box(head, 0.34, 0.10, 0.34, hairColor, 0, 1.46, 0);
        box(head, 0.12, 0.16, 0.10, hairColor, -0.12, 1.52, -0.02);
        box(head, 0.14, 0.20, 0.12, hairColor, 0.02, 1.58, 0);
        box(head, 0.10, 0.16, 0.10, hairColor, 0.14, 1.51, 0.02);
      }
    }
    visual.add(head);

    const armL = new THREE.Group();
    box(armL, 0.14, 0.52, 0.14, skinColor, 0, -0.26, 0);
    armL.position.set(-0.30, 1.02, 0);
    visual.add(armL);

    const armR = new THREE.Group();
    box(armR, 0.14, 0.52, 0.14, skinColor, 0, -0.26, 0);
    armR.position.set(0.30, 1.02, 0);
    visual.add(armR);

    const legColor = role === 'player' ? 0x1d2230 : pick(pants, seed, 4);
    const shoeColor = role === 'player' ? 0x11151c : 0x11151c;
    const legL = new THREE.Group();
    box(legL, 0.16, 0.60, 0.16, legColor, 0, -0.30, 0);
    box(legL, 0.20, 0.06, 0.30, shoeColor, 0, -0.56, 0.05);
    legL.position.set(-0.13, 0.37, 0);
    visual.add(legL);

    const legR = new THREE.Group();
    box(legR, 0.16, 0.60, 0.16, legColor, 0, -0.30, 0);
    box(legR, 0.20, 0.06, 0.30, shoeColor, 0, -0.56, 0.05);
    legR.position.set(0.13, 0.37, 0);
    visual.add(legR);

    root.bodyMat = bodyMat;
    root.headMat = skinMat;
    root.parts = { visual, body, head, armL, armR, legL, legR };
    root.scale.setScalar(role === 'customer' ? 1.04 : 1.14);
    root.userData.__mcBuilt = true;

    if (role === 'customer') {
      root.__mcTarget = root.position.clone();
      root.__mcSmoothed = root.position.clone();
      root.__mcLastTarget = root.position.clone();
      const pos = root.position;
      const originalSet = pos.set.bind(pos);
      pos.set = function setSmooth(x, y, z) {
        root.__mcTarget.set(x, y, z);
        if (typeof y === 'number') root.__mcTarget.y = y;
        root.__mcSmoothed.lerp(root.__mcTarget, 0.28);
        originalSet(root.__mcSmoothed.x, root.__mcSmoothed.y, root.__mcSmoothed.z);
        const dx = root.__mcTarget.x - root.__mcLastTarget.x;
        const dz = root.__mcTarget.z - root.__mcLastTarget.z;
        if (Math.abs(dx) + Math.abs(dz) > 0.0001) {
          root.rotation.y = lerpAngle(root.rotation.y || 0, Math.atan2(dx, dz), 0.28);
        }
        root.__mcLastTarget.copy(root.__mcTarget);
        return pos;
      };
    }

    meta.set(root, {
      phase: rand(seed, 7) * Math.PI * 2,
      time: rand(seed, 13) * 1000,
      last: root.getWorldPosition(new THREE.Vector3()),
      speed: 0,
      parts: root.parts,
      role,
    });
    roots.add(root);
  }

  function rebuild(root) {
    if (!root || !TARGET_TYPES.has(norm(root.userData?.type)) || root.userData.__mcBuilt) return;
    const role = norm(root.userData.type);
    const seed = hash(`${root.userData.type}:${root.position.x.toFixed(3)}:${root.position.z.toFixed(3)}`);

    if (role === 'chef') {
      buildChef(root);
      return;
    }

    buildHumanoid(root, role, seed);
  }

  function animate(root, info) {
    const t = info.time;
    const phase = info.phase;
    const parts = info.parts;
    const moving = info.speed > 0.02;
    const idleBob = Math.sin(t * 2 + phase) * 0.01;
    const stride = moving ? Math.sin(t * 7 + phase) : Math.sin(t * 1.8 + phase) * 0.12;

    if (parts.visual) parts.visual.position.y = 0.30 + idleBob;
    if (parts.body) {
      parts.body.rotation.z = moving ? Math.sin(t * 7 + phase) * 0.015 : 0;
      parts.body.position.y = idleBob * 0.5;
    }
    if (parts.head) {
      parts.head.rotation.y = moving ? Math.sin(t * 1.6 + phase) * 0.02 : 0;
      parts.head.rotation.x = moving ? 0 : Math.sin(t * 1.4 + phase) * 0.01;
    }

    if (parts.armL) { parts.armL.rotation.x = 0.10 + stride * 0.85; parts.armL.rotation.z = 0; }
    if (parts.armR) { parts.armR.rotation.x = -0.10 - stride * 0.85; parts.armR.rotation.z = 0; }
    if (parts.legL) { parts.legL.rotation.x = -0.08 - stride * 0.95; parts.legL.rotation.z = 0; }
    if (parts.legR) { parts.legR.rotation.x = 0.08 + stride * 0.95; parts.legR.rotation.z = 0; }

    if (info.role === 'chef' && parts.head) parts.head.rotation.z = Math.sin(t * 1.1 + phase) * 0.01;
    if (info.role === 'player' && parts.head) parts.head.rotation.z = Math.sin(t * 1.2 + phase) * 0.008;
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
      animate(root, info);
    }
    requestAnimationFrame(tick);
  }

  THREE.Object3D.prototype.add = function patchedAdd(...objs) {
    for (const obj of objs) {
      if (obj && typeof obj === 'object') rebuild(obj);
    }
    return originalAdd.apply(this, objs);
  };

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

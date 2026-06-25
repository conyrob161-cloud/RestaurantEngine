(() => {
  if (!window.THREE) return;

  const originalRender = THREE.WebGLRenderer.prototype.render;
  const builtRoots = new WeakSet();
  const rigByRoot = new WeakMap();
  const prevPos = new WeakMap();

  const TYPE = {
    PLAYER: 'player',
    CHEF: 'chef',
    CUSTOMER: 'customer',
  };

  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  function hashString(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function pickCustomerPalette(seed) {
    const palettes = [
      { shirt: 0x5f7dd6, pants: 0x2f3644, skin: 0xf1ccb0, accent: 0xffc857 },
      { shirt: 0xd96c6c, pants: 0x3d2f3d, skin: 0xefc8a4, accent: 0x8fe08f },
      { shirt: 0x4c9b72, pants: 0x2c3943, skin: 0xe9c5aa, accent: 0xf2d56b },
      { shirt: 0x9e78d2, pants: 0x40324f, skin: 0xeec7aa, accent: 0x7ee0ff },
      { shirt: 0x729f5d, pants: 0x3d4331, skin: 0xe5c0a3, accent: 0xc8d18a },
    ];
    return palettes[hashString(seed) % palettes.length];
  }

  function makeMat(color, roughness = 0.92, metalness = 0.0) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
  }

  function makeCube(w, h, d, color, roughness = 0.92) {
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), makeMat(color, roughness));
  }

  function makeEye() {
    return new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), makeMat(0x111111, 1.0));
  }

  function findRoot(mesh) {
    let root = mesh;
    while (root.parent && root.parent.parent) root = root.parent;
    return root;
  }

  function findOriginalMesh(root, predicate) {
    let found = null;
    root.traverse((obj) => {
      if (found || !obj.isMesh || !obj.geometry) return;
      if (predicate(obj)) found = obj;
    });
    return found;
  }

  function isOriginalCharacter(root) {
    const body = findOriginalMesh(root, (m) => {
      const g = m.geometry;
      return g.type === 'CylinderGeometry' && g.parameters && Math.abs(g.parameters.height - 0.92) < 0.22;
    });
    const head = findOriginalMesh(root, (m) => {
      const g = m.geometry;
      return g.type === 'SphereGeometry' && g.parameters && Math.abs(g.parameters.radius - 0.28) < 0.12;
    });
    return !!(body && head);
  }

  function detectType(root, bodyMesh) {
    const hex = bodyMesh?.material?.color?.getHex?.() ?? 0;
    if (hex === 0x355d9d) return TYPE.PLAYER;
    if (hex === 0x8f5f43) return TYPE.CHEF;
    return TYPE.CUSTOMER;
  }

  function createShadow(color = 0x000000, opacity = 0.18, scale = 0.46) {
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(scale, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    return shadow;
  }

  function makeHead(skinColor, variantSeed, type) {
    const head = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.33, 0), makeMat(skinColor, 0.92));
    skull.rotation.y = Math.PI * 0.13;
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.12), makeMat(skinColor, 0.96));
    face.position.set(0, -0.03, 0.24);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.14), makeMat(skinColor, 0.96));
    jaw.position.set(0, -0.17, 0.1);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.08), makeMat(skinColor, 0.95));
    nose.position.set(0, 0.0, 0.3);
    const eyeL = makeEye();
    const eyeR = makeEye();
    eyeL.position.set(-0.09, 0.04, 0.27);
    eyeR.position.set(0.09, 0.04, 0.27);
    const earL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.04), makeMat(skinColor, 0.96));
    const earR = earL.clone();
    earL.position.set(-0.31, 0.02, 0.01);
    earR.position.set(0.31, 0.02, 0.01);
    head.add(skull, face, jaw, nose, eyeL, eyeR, earL, earR);
    head.userData.eyeL = eyeL;
    head.userData.eyeR = eyeR;
    head.userData.blinkSeed = variantSeed;
    return head;
  }

  function makeHat(type, accentColor) {
    const hat = new THREE.Group();
    if (type === TYPE.CHEF) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 6), makeMat(0xffffff, 0.76));
      const puff1 = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), makeMat(0xffffff, 0.76));
      const puff2 = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), makeMat(0xffffff, 0.76));
      const puff3 = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), makeMat(0xffffff, 0.76));
      puff1.position.set(-0.08, 0.2, 0.0);
      puff2.position.set(0.0, 0.34, 0.02);
      puff3.position.set(0.09, 0.2, 0.0);
      band.position.y = -0.02;
      hat.add(band, puff1, puff2, puff3);
      return hat;
    }

    if (type === TYPE.PLAYER) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.26), makeMat(0x24324c, 0.86));
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.16), makeMat(accentColor, 0.82));
      brim.position.set(0, -0.02, 0.14);
      cap.position.y = 0.06;
      hat.add(cap, brim);
      return hat;
    }

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.14, 6), makeMat(accentColor, 0.8));
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), makeMat(accentColor, 0.8));
    top.position.y = 0.13;
    hat.add(cap, top);
    return hat;
  }

  function makeTorso(type, palette) {
    const torso = new THREE.Group();
    const shirtColor = type === TYPE.CHEF ? 0xf8f6f0 : palette.shirt;
    const pantsColor = type === TYPE.CHEF ? 0x70533d : palette.pants;
    const accent = type === TYPE.CHEF ? 0xc6b08f : palette.accent;

    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.36), makeMat(shirtColor, 0.93));
    chest.position.y = 0.42;
    const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.16, 0.36), makeMat(shirtColor, 0.93));
    shoulders.position.y = 0.72;
    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.22, 0.28), makeMat(pantsColor, 0.98));
    hips.position.y = 0.12;
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, 0.16), makeMat(accent, 0.88));
    collar.position.set(0, 0.66, 0.14);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.05, 0.18), makeMat(0x1b1d27, 1.0));
    belt.position.y = 0.22;
    torso.add(chest, shoulders, hips, collar, belt);

    if (type === TYPE.CHEF) {
      const apron = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.48, 0.07), makeMat(0xf2efe6, 0.95));
      apron.position.set(0, 0.18, 0.2);
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.09, 0.02), makeMat(0xdad2c4, 0.95));
      pocket.position.set(0, 0.11, 0.24);
      torso.add(apron, pocket);
    }

    if (type === TYPE.PLAYER) {
      const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.34, 0.14), makeMat(0x2b4672, 0.92));
      backpack.position.set(0, 0.4, -0.26);
      torso.add(backpack);
    }

    return torso;
  }

  function makeArms(type, palette) {
    const group = new THREE.Group();
    const shirt = makeMat(type === TYPE.CHEF ? 0xf8f6f0 : palette.shirt, 0.94);
    const skin = makeMat(palette.skin, 0.95);
    const glove = makeMat(type === TYPE.CUSTOMER ? 0x2f3644 : 0x23304a, 0.96);

    function buildArm(side) {
      const arm = new THREE.Group();
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.36, 0.12), shirt.clone());
      const fore = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.32, 0.11), skin.clone());
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.14), glove.clone());
      upper.position.y = -0.18;
      fore.position.y = -0.52;
      hand.position.y = -0.8;
      arm.add(upper, fore, hand);
      arm.position.set(side * 0.42, 0.72, 0);
      arm.rotation.z = side * -0.1;
      return arm;
    }

    group.add(buildArm(-1), buildArm(1));
    return group;
  }

  function makeLegs(type, palette) {
    const group = new THREE.Group();
    const pants = makeMat(type === TYPE.CHEF ? 0x70533d : palette.pants, 0.98);
    const shoe = makeMat(type === TYPE.CHEF ? 0x1d1f27 : 0x1d2230, 1.0);

    function buildLeg(side) {
      const leg = new THREE.Group();
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.4, 0.16), pants.clone());
      const calf = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.34, 0.13), pants.clone());
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.28), shoe.clone());
      thigh.position.y = -0.22;
      calf.position.y = -0.57;
      boot.position.y = -0.82;
      leg.add(thigh, calf, boot);
      leg.position.set(side * 0.17, 0.23, 0.01);
      leg.rotation.z = side * 0.04;
      return leg;
    }

    group.add(buildLeg(-1), buildLeg(1));
    return group;
  }

  function buildRig(root, type, palette, skinColor, variantSeed) {
    const rigRoot = new THREE.Group();
    rigRoot.name = 'character_overhaul_rig';
    rigRoot.scale.setScalar(type === TYPE.CHEF ? 1.06 : type === TYPE.PLAYER ? 1.16 : 1.03);

    const shadow = createShadow();
    rigRoot.add(shadow);

    const torso = makeTorso(type, { ...palette, skin: skinColor });
    const head = makeHead(skinColor, variantSeed, type);
    const arms = makeArms(type, { ...palette, skin: skinColor });
    const legs = makeLegs(type, { ...palette, skin: skinColor });
    const hat = makeHat(type, palette.accent);

    torso.position.y = 0.0;
    head.position.y = 1.02;
    arms.position.y = 0.0;
    legs.position.y = 0.0;
    hat.position.y = 1.52;

    rigRoot.add(torso, head, arms, legs, hat);

    if (type === TYPE.PLAYER) {
      const badge = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.02), makeMat(0xffffff, 0.85));
      badge.position.set(0.16, 0.52, 0.18);
      torso.add(badge);
    }

    if (type === TYPE.CUSTOMER) {
      const littleBack = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.1), makeMat(0x3a4d3a, 0.95));
      littleBack.position.set(-0.02, 0.36, -0.24);
      torso.add(littleBack);
    }

    root.userData.characterOverhaulRig = {
      root,
      rigRoot,
      type,
      torso,
      head,
      arms,
      legs,
      hat,
      shadow,
      headBaseY: head.position.y,
      torsoBaseY: torso.position.y,
      hatBaseY: hat.position.y,
      blinkSeed: hashString(root.uuid + type),
    };

    root.add(rigRoot);
    root.scale.setScalar(type === TYPE.PLAYER ? 1.08 : 1.0);
  }

  function hideOriginalMeshes(root) {
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      if (obj.geometry && obj.geometry.type === 'CircleGeometry') return;
      obj.visible = false;
    });
  }

  function animate(root, now, dt) {
    const rig = root.userData.characterOverhaulRig;
    if (!rig) return;

    const current = root.position.clone();
    const previous = prevPos.get(root) || current.clone();
    const moved = current.distanceTo(previous);
    prevPos.set(root, current);

    const speed = clamp01(moved / Math.max(dt, 0.016) / 2.15);
    const walk = Math.sin(now * 0.012 + rig.blinkSeed * 0.0001 + root.position.x * 0.19 + root.position.z * 0.13);
    const sway = walk * (0.32 + speed * 0.7);
    const bob = Math.sin(now * 0.0064 + rig.blinkSeed * 0.0002) * (0.012 + speed * 0.02);
    const blink = 0.5 + 0.5 * Math.max(0, Math.sin(now * 0.0037 + rig.blinkSeed * 0.0003));

    rig.torso.position.y = rig.torsoBaseY + bob * 0.45;
    rig.head.position.y = rig.headBaseY + bob * 1.6;
    rig.hat.position.y = rig.hatBaseY + bob * 1.2;
    rig.torso.rotation.x = bob * 0.7;
    rig.torso.rotation.z = sway * 0.05;
    rig.head.rotation.x = -bob * 0.45;
    rig.head.rotation.y = Math.sin(now * 0.002 + rig.blinkSeed * 0.0001) * 0.04;

    const leftArm = rig.arms.children[0];
    const rightArm = rig.arms.children[1];
    leftArm.rotation.x = 0.14 + sway;
    rightArm.rotation.x = 0.14 - sway;
    leftArm.rotation.z = 0.1;
    rightArm.rotation.z = -0.1;

    const leftLeg = rig.legs.children[0];
    const rightLeg = rig.legs.children[1];
    leftLeg.rotation.x = -0.08 - sway * 0.92;
    rightLeg.rotation.x = -0.08 + sway * 0.92;
    leftLeg.rotation.z = 0.03;
    rightLeg.rotation.z = -0.03;

    const eyeL = rig.head.userData.eyeL;
    const eyeR = rig.head.userData.eyeR;
    if (eyeL && eyeR) {
      eyeL.scale.y = blink;
      eyeR.scale.y = blink;
    }
  }

  function upgradeRoot(root) {
    if (!root || builtRoots.has(root) || !isOriginalCharacter(root)) return;
    const body = findOriginalMesh(root, (m) => m.geometry.type === 'CylinderGeometry' && m.geometry.parameters && Math.abs(m.geometry.parameters.height - 0.92) < 0.22);
    const head = findOriginalMesh(root, (m) => m.geometry.type === 'SphereGeometry' && m.geometry.parameters && Math.abs(m.geometry.parameters.radius - 0.28) < 0.12);
    if (!body || !head) return;

    const type = detectType(root, body);
    const palette = type === TYPE.CUSTOMER
      ? pickCustomerPalette(root.uuid + root.position.x.toFixed(2) + root.position.z.toFixed(2))
      : {
          shirt: type === TYPE.CHEF ? 0xf8f6f0 : 0x4d78b5,
          pants: type === TYPE.CHEF ? 0x70533d : 0x24324c,
          skin: type === TYPE.CHEF ? 0xf0ceb1 : 0xf0ceb1,
          accent: type === TYPE.CHEF ? 0xc6b08f : 0x8ecae6,
        };
    const skinColor = type === TYPE.CUSTOMER ? 0xe6c0a5 : 0xf0ceb1;

    hideOriginalMeshes(root);
    buildRig(root, type, palette, skinColor, root.uuid);
    builtRoots.add(root);
    rigByRoot.set(root, true);
  }

  THREE.WebGLRenderer.prototype.render = function patchedRender(scene, camera) {
    const now = performance.now();
    const dt = Math.min(0.033, Math.max(0.001, (now - (window.__characterOverhaulLast || now)) / 1000));
    window.__characterOverhaulLast = now;

    scene.traverse((obj) => {
      if (!obj.isMesh) return;
      const root = findRoot(obj);
      if (!builtRoots.has(root) && isOriginalCharacter(root)) upgradeRoot(root);
    });

    scene.traverse((obj) => {
      if (obj.userData && obj.userData.characterOverhaulRig) animate(obj, now, dt);
    });

    return originalRender.call(this, scene, camera);
  };

  console.log('[Restaurant Zombie] character_overhaul.js loaded');
})();
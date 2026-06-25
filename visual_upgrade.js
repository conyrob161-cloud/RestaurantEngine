(() => {
  if (!window.THREE) return;

  const originalRender = THREE.WebGLRenderer.prototype.render;
  const builtRoots = new WeakSet();
  const rigByRoot = new WeakMap();
  const prevPosition = new WeakMap();

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

  function randFrom(text, min, max) {
    const h = hashString(text);
    const n = (h % 10000) / 10000;
    return min + (max - min) * n;
  }

  function pickCustomerPalette(seed) {
    const palettes = [
      { shirt: 0x5f7dd6, pants: 0x2f3644, skin: 0xf1ccb0, accent: 0xffc857 },
      { shirt: 0xd96c6c, pants: 0x3d2f3d, skin: 0xefc8a4, accent: 0x8fe08f },
      { shirt: 0x4c9b72, pants: 0x2c3943, skin: 0xe9c5aa, accent: 0xf2d56b },
      { shirt: 0x9e78d2, pants: 0x40324f, skin: 0xeec7aa, accent: 0x7ee0ff },
    ];
    return palettes[hashString(seed) % palettes.length];
  }

  function findRoot(mesh) {
    let root = mesh;
    while (root.parent && root.parent.parent) root = root.parent;
    return root;
  }

  function findMesh(root, predicate) {
    let found = null;
    root.traverse((obj) => {
      if (found || !obj.isMesh || !obj.geometry) return;
      if (predicate(obj)) found = obj;
    });
    return found;
  }

  function isOriginalCharacter(root) {
    const body = findMesh(root, (m) => {
      const g = m.geometry;
      return g.type === 'CylinderGeometry' && g.parameters && Math.abs(g.parameters.height - 0.92) < 0.2;
    });
    const head = findMesh(root, (m) => {
      const g = m.geometry;
      return g.type === 'SphereGeometry' && g.parameters && Math.abs(g.parameters.radius - 0.28) < 0.1;
    });
    return !!(body && head);
  }

  function detectType(root, bodyMesh) {
    const hex = bodyMesh?.material?.color?.getHex?.() ?? 0;
    if (hex === 0x355d9d) return TYPE.PLAYER;
    if (hex === 0x8f5f43) return TYPE.CHEF;
    return TYPE.CUSTOMER;
  }

  function makeMat(color, roughness = 0.92, metalness = 0.0) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
  }

  function makeBox(w, h, d, color, roughness = 0.92) {
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), makeMat(color, roughness));
  }

  function makeCapsule(color, length = 0.5, radius = 0.1) {
    return new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 6), makeMat(color, 0.96));
  }

  function makeEye(color = 0x111111) {
    return new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), makeMat(color, 1.0));
  }

  function makeHead(color, skinTone, variantSeed) {
    const head = new THREE.Group();
    const skull = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.31, 0),
      makeMat(skinTone, 0.9)
    );
    skull.rotation.y = Math.PI * 0.14;

    const face = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.18, 0.12),
      makeMat(skinTone, 0.95)
    );
    face.position.set(0, -0.04, 0.23);

    const nose = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.05, 0.08),
      makeMat(skinTone, 0.96)
    );
    nose.position.set(0, 0.0, 0.29);

    const eyeL = makeEye();
    const eyeR = makeEye();
    eyeL.position.set(-0.085, 0.04, 0.27);
    eyeR.position.set(0.085, 0.04, 0.27);

    const earL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.04), makeMat(skinTone, 0.96));
    const earR = earL.clone();
    earL.position.set(-0.29, 0.02, 0.01);
    earR.position.set(0.29, 0.02, 0.01);

    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.16), makeMat(skinTone, 0.95));
    jaw.position.set(0, -0.16, 0.08);

    head.add(skull, face, nose, eyeL, eyeR, earL, earR, jaw);
    head.userData.eyeL = eyeL;
    head.userData.eyeR = eyeR;
    head.userData.blinkSeed = variantSeed;
    return head;
  }

  function makeHat(type, accentColor) {
    const hat = new THREE.Group();
    if (type === TYPE.CHEF || type === TYPE.PLAYER) {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 6), makeMat(0xffffff, 0.75));
      const puff1 = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), makeMat(0xffffff, 0.75));
      const puff2 = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), makeMat(0xffffff, 0.75));
      const puff3 = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), makeMat(0xffffff, 0.75));
      puff1.position.set(-0.08, 0.22, 0.0);
      puff2.position.set(0.0, 0.34, 0.02);
      puff3.position.set(0.09, 0.22, 0.0);
      hat.add(base, puff1, puff2, puff3);
      if (type === TYPE.PLAYER) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.17), makeMat(accentColor, 0.85));
        band.position.set(0, -0.03, 0);
        hat.add(band);
      }
    } else {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.14, 6), makeMat(accentColor, 0.8));
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), makeMat(accentColor, 0.8));
      top.position.y = 0.13;
      hat.add(cap, top);
    }
    return hat;
  }

  function makeTorso(type, palette, seed) {
    const body = new THREE.Group();

    const torsoColor = type === TYPE.PLAYER ? 0x4d78b5 : palette.shirt;
    const pantsColor = type === TYPE.PLAYER ? 0x24324c : palette.pants;
    const accent = type === TYPE.PLAYER ? 0x8ecae6 : palette.accent;

    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.62, 0.32), makeMat(torsoColor, 0.92));
    chest.position.y = 0.4;

    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.26), makeMat(pantsColor, 0.98));
    hips.position.y = 0.06;

    const shoulderL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.16), makeMat(torsoColor, 0.92));
    const shoulderR = shoulderL.clone();
    shoulderL.position.set(-0.34, 0.56, 0);
    shoulderR.position.set(0.34, 0.56, 0);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.12, 6), makeMat(palette.skin, 0.95));
    neck.position.y = 0.82;

    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.16), makeMat(accent, 0.9));
    collar.position.set(0, 0.66, 0.14);

    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.05, 0.18), makeMat(0x1b1d27, 1.0));
    belt.position.y = 0.16;

    body.add(chest, hips, shoulderL, shoulderR, neck, collar, belt);
    body.userData.variantSeed = seed;
    return body;
  }

  function makeArms(type, palette) {
    const group = new THREE.Group();
    const shirt = makeMat(type === TYPE.PLAYER ? 0x4d78b5 : palette.shirt, 0.94);
    const skin = makeMat(palette.skin, 0.95);
    const glove = makeMat(type === TYPE.CUSTOMER ? 0x2f3644 : 0x23304a, 0.96);

    function arm(side) {
      const root = new THREE.Group();
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.34, 0.11), shirt.clone());
      const elbow = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.24, 0.1), skin.clone());
      const fore = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), shirt.clone());
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.14), glove.clone());
      upper.position.y = -0.17;
      elbow.position.y = -0.42;
      fore.position.y = -0.63;
      hand.position.y = -0.82;
      root.add(upper, elbow, fore, hand);
      root.position.x = side * 0.37;
      root.position.y = 0.72;
      root.rotation.z = side * -0.1;
      return root;
    }

    group.add(arm(-1), arm(1));
    return group;
  }

  function makeLegs(type, palette) {
    const group = new THREE.Group();
    const pants = makeMat(type === TYPE.PLAYER ? 0x24324c : palette.pants, 0.98);
    const shoe = makeMat(type === TYPE.PLAYER ? 0x141722 : 0x1e212b, 1.0);

    function leg(side) {
      const root = new THREE.Group();
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.38, 0.14), pants.clone());
      const calf = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.34, 0.12), pants.clone());
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.26), shoe.clone());
      thigh.position.y = -0.2;
      calf.position.y = -0.56;
      boot.position.y = -0.83;
      root.add(thigh, calf, boot);
      root.position.x = side * 0.15;
      root.position.y = 0.22;
      root.rotation.z = side * 0.04;
      return root;
    }

    group.add(leg(-1), leg(1));
    return group;
  }

  function makeChefApron(palette) {
    const apron = new THREE.Group();
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.06), makeMat(0xf3efe5, 0.94));
    cloth.position.set(0, 0.18, 0.18);
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.02), makeMat(0xd9d1c2, 0.95));
    pocket.position.set(0, 0.1, 0.22);
    const strapL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.03), makeMat(0xc9b99f, 0.92));
    const strapR = strapL.clone();
    strapL.position.set(-0.15, 0.48, 0.17);
    strapR.position.set(0.15, 0.48, 0.17);
    apron.add(cloth, pocket, strapL, strapR);
    return apron;
  }

  function upgradeCharacter(root) {
    if (!root || builtRoots.has(root) || !isOriginalCharacter(root)) return;

    const body = findMesh(root, (m) => m.geometry.type === 'CylinderGeometry' && m.geometry.parameters && Math.abs(m.geometry.parameters.height - 0.92) < 0.2);
    const head = findMesh(root, (m) => m.geometry.type === 'SphereGeometry' && m.geometry.parameters && Math.abs(m.geometry.parameters.radius - 0.28) < 0.1);
    if (!body || !head) return;

    const type = detectType(root, body);
    const palette = type === TYPE.CUSTOMER
      ? pickCustomerPalette(root.uuid + root.position.x.toFixed(2) + root.position.z.toFixed(2))
      : {
          shirt: type === TYPE.CHEF ? 0xffffff : 0x4d78b5,
          pants: type === TYPE.CHEF ? 0x6d4c3a : 0x24324c,
          skin: body.material?.color ? body.material.color.clone().offsetHSL(0, 0.0, 0.08).getHex() : 0xf0ceb1,
          accent: type === TYPE.CHEF ? 0xc7b28a : 0x8ecae6,
        };

    const skinColor = body.material?.color ? body.material.color.clone().offsetHSL(0, 0.0, 0.15).getHex() : 0xf0ceb1;
    const variantSeed = root.uuid;

    const rig = new THREE.Group();
    rig.name = 'stage1CharacterRig';
    root.add(rig);

    const torso = makeTorso(type, { ...palette, skin: skinColor }, variantSeed);
    const headRig = makeHead(type === TYPE.CHEF ? 0xffffff : palette.shirt, skinColor, variantSeed);
    const arms = makeArms(type, { ...palette, skin: skinColor });
    const legs = makeLegs(type, { ...palette, skin: skinColor });

    torso.position.y = 0.0;
    headRig.position.y = 1.02;
    arms.position.y = 0.0;
    legs.position.y = 0.0;

    rig.add(torso, headRig, arms, legs);

    if (type === TYPE.CHEF) {
      const apron = makeChefApron(palette);
      apron.position.y = 0.08;
      rig.add(apron);
    }

    if (type === TYPE.PLAYER) {
      const pack = new THREE.Group();
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.12), makeMat(0x27406d, 0.96));
      const flap = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.14), makeMat(0x4d78b5, 0.92));
      bag.position.set(0, 0.42, -0.24);
      flap.position.set(0, 0.58, -0.18);
      pack.add(bag, flap);
      rig.add(pack);
    }

    const hat = makeHat(type, palette.accent);
    hat.position.y = 1.49;
    rig.add(hat);

    // Hide original placeholder meshes while keeping the root and shadow intact.
    body.visible = false;
    head.visible = false;
    const originalHat = findMesh(root, (m) => m !== body && m !== head && m.geometry.type === 'CylinderGeometry' && m.geometry.parameters && m.geometry.parameters.height < 0.45);
    if (originalHat) originalHat.visible = false;

    root.userData.stage1Rig = {
      root,
      rig,
      type,
      torso,
      headRig,
      arms,
      legs,
      hat,
      torsoBaseY: torso.position.y,
      headBaseY: headRig.position.y,
      armsBaseY: arms.position.y,
      legsBaseY: legs.position.y,
      blinkSeed: hashString(root.uuid),
    };
    builtRoots.add(root);
  }

  function animateCharacter(root, now, dt) {
    const rig = root.userData.stage1Rig;
    if (!rig) return;

    const current = root.position.clone();
    const previous = prevPosition.get(root) || current.clone();
    const moved = current.distanceTo(previous);
    prevPosition.set(root, current);

    const speed = clamp01(moved / Math.max(dt, 0.016) / 2.15);
    const walk = Math.sin(now * 0.012 + rig.blinkSeed * 0.0001 + root.position.x * 0.23 + root.position.z * 0.17);
    const sway = walk * (0.36 + speed * 0.68);
    const bob = Math.sin(now * 0.007 + rig.blinkSeed * 0.0002) * (0.012 + speed * 0.02);
    const blink = 0.5 + 0.5 * Math.max(0, Math.sin(now * 0.0037 + rig.blinkSeed * 0.0003));

    rig.headRig.position.y = rig.headBaseY + bob * 1.6;
    rig.torso.position.y = rig.torsoBaseY + bob * 0.6;
    rig.hat.position.y = 1.49 + bob * 1.2;

    // torso motion and shoulder roll
    rig.torso.rotation.x = bob * 0.8;
    rig.torso.rotation.z = sway * 0.05;

    // arms
    const leftArm = rig.arms.children[0];
    const rightArm = rig.arms.children[1];
    leftArm.rotation.x = 0.12 + sway;
    rightArm.rotation.x = 0.12 - sway;
    leftArm.rotation.z = 0.10;
    rightArm.rotation.z = -0.10;

    // legs
    const leftLeg = rig.legs.children[0];
    const rightLeg = rig.legs.children[1];
    leftLeg.rotation.x = -0.08 - sway * 0.95;
    rightLeg.rotation.x = -0.08 + sway * 0.95;
    leftLeg.rotation.z = 0.03;
    rightLeg.rotation.z = -0.03;

    // slight head nod
    rig.headRig.rotation.x = -bob * 0.45;
    rig.headRig.rotation.y = Math.sin(now * 0.002 + rig.blinkSeed * 0.0001) * 0.04;

    const eyeL = rig.headRig.userData.eyeL;
    const eyeR = rig.headRig.userData.eyeR;
    if (eyeL && eyeR) {
      eyeL.scale.y = blink;
      eyeR.scale.y = blink;
    }
  }

  THREE.WebGLRenderer.prototype.render = function patchedRender(scene, camera) {
    const now = performance.now();
    const dt = Math.min(0.033, Math.max(0.001, (now - (window.__stage1VisualLast || now)) / 1000));
    window.__stage1VisualLast = now;

    scene.traverse((obj) => {
      if (!obj.isMesh) return;
      const root = findRoot(obj);
      if (!builtRoots.has(root) && isOriginalCharacter(root)) upgradeCharacter(root);
    });

    scene.traverse((obj) => {
      if (obj.userData && obj.userData.stage1Rig) animateCharacter(obj, now, dt);
    });

    return originalRender.call(this, scene, camera);
  };

  console.log('[Restaurant Zombie] visual_upgrade.js stage 1 loaded');
})();
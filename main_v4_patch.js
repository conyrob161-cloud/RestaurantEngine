(() => {
  if (!window.THREE) return;
  if (window.__restaurantZombieSoftPatch) return;
  window.__restaurantZombieSoftPatch = true;

  if (!window.createTableVisual) {
    window.createTableVisual = function createTableVisual() {
      const group = new THREE.Group();
      const top = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.12, 0.9),
        new THREE.MeshStandardMaterial({ color: 0xc49a6c, roughness: 0.95 })
      );
      top.position.y = 0.72;
      const legMat = new THREE.MeshStandardMaterial({ color: 0x6d4c3a, roughness: 0.95 });
      const legs = [[-0.55, 0.35], [0.55, 0.35], [-0.55, -0.35], [0.55, -0.35]].map(([x, z]) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.74, 0.08), legMat);
        leg.position.set(x, 0.37, z);
        return leg;
      });
      group.add(top, ...legs);
      return group;
    };
  }

  const originalRender = THREE.WebGLRenderer.prototype.render;
  const upgradedRoots = new WeakSet();
  const prevPos = new WeakMap();

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

  function paletteFor(type, seedText = '') {
    const customerPalettes = [
      { shirt: 0x5f7dd6, pants: 0x2f3644, skin: 0xf1ccb0, accent: 0xffc857 },
      { shirt: 0xd96c6c, pants: 0x3d2f3d, skin: 0xefc8a4, accent: 0x8fe08f },
      { shirt: 0x4c9b72, pants: 0x2c3943, skin: 0xe9c5aa, accent: 0xf2d56b },
      { shirt: 0x9e78d2, pants: 0x40324f, skin: 0xeec7aa, accent: 0x7ee0ff },
      { shirt: 0x729f5d, pants: 0x3d4331, skin: 0xe5c0a3, accent: 0xc8d18a },
    ];
    if (type === 'player') return { shirt: 0x4d78b5, pants: 0x24324c, skin: 0xf0ceb1, accent: 0x8ecae6 };
    if (type === 'chef') return { shirt: 0xf8f6f0, pants: 0x70533d, skin: 0xf0ceb1, accent: 0xc6b08f };
    let h = 0;
    for (const ch of seedText) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return customerPalettes[h % customerPalettes.length];
  }

  function mat(color, roughness = 0.92) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.0 });
  }

  function findRoot(obj) {
    let root = obj;
    while (root.parent && root.parent.parent) root = root.parent;
    return root;
  }

  function hideOriginalMeshes(root) {
    root.traverse((obj) => {
      if (obj.isMesh) obj.visible = false;
    });
  }

  function buildSoftRig(type, palette, seedText) {
    const rig = new THREE.Group();
    rig.name = 'soft_character_rig';
    rig.position.y = 0.47;

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.46;
    rig.add(shadow);

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.58, 4, 6), mat(type === 'chef' ? 0xf8f6f0 : palette.shirt, 0.92));
    body.position.y = 0.92;
    rig.add(body);

    const hips = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.18, 4, 6), mat(type === 'chef' ? 0x70533d : palette.pants, 0.98));
    hips.position.y = 0.34;
    rig.add(hips);

    const head = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.31, 8, 6), mat(palette.skin, 0.95));
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.12), mat(palette.skin, 0.96));
    face.position.set(0, -0.03, 0.24);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.08), mat(palette.skin, 0.95));
    nose.position.set(0, 0.0, 0.3);
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), mat(0x111111, 1.0));
    const eyeR = eyeL.clone();
    eyeL.position.set(-0.09, 0.04, 0.27);
    eyeR.position.set(0.09, 0.04, 0.27);
    head.add(skull, face, nose, eyeL, eyeR);
    head.position.y = 1.78;
    rig.add(head);

    const armL = new THREE.Group();
    const armR = new THREE.Group();
    const upperArmColor = type === 'chef' ? 0xf8f6f0 : palette.shirt;
    const lowerArmColor = palette.skin;
    const handColor = type === 'customer' ? palette.accent : 0x1d2230;

    function addArm(side) {
      const arm = new THREE.Group();
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.26, 4, 6), mat(upperArmColor, 0.94));
      const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.24, 4, 6), mat(lowerArmColor, 0.95));
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mat(handColor, 0.96));
      upper.position.y = -0.18;
      lower.position.y = -0.48;
      hand.position.y = -0.72;
      arm.add(upper, lower, hand);
      arm.position.set(side * 0.42, 1.0, 0);
      arm.rotation.z = side * -0.12;
      return arm;
    }
    const leftArm = addArm(-1);
    const rightArm = addArm(1);
    armL.add(leftArm);
    armR.add(rightArm);
    rig.add(armL, armR);

    const legL = new THREE.Group();
    const legR = new THREE.Group();
    const pantsColor = type === 'chef' ? 0x70533d : palette.pants;
    const shoeColor = type === 'chef' ? 0x1d1f27 : 0x1d2230;

    function addLeg(side) {
      const leg = new THREE.Group();
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.26, 4, 6), mat(pantsColor, 0.98));
      const calf = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.22, 4, 6), mat(pantsColor, 0.98));
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.24), mat(shoeColor, 1.0));
      thigh.position.y = -0.18;
      calf.position.y = -0.45;
      shoe.position.y = -0.68;
      leg.add(thigh, calf, shoe);
      leg.position.set(side * 0.15, 0.22, 0.01);
      leg.rotation.z = side * 0.04;
      return leg;
    }
    const leftLeg = addLeg(-1);
    const rightLeg = addLeg(1);
    legL.add(leftLeg);
    legR.add(rightLeg);
    rig.add(legL, legR);

    const hat = new THREE.Group();
    if (type === 'chef') {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 6), mat(0xffffff, 0.78));
      const puff1 = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), mat(0xffffff, 0.78));
      const puff2 = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), mat(0xffffff, 0.78));
      const puff3 = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), mat(0xffffff, 0.78));
      puff1.position.set(-0.08, 0.2, 0);
      puff2.position.set(0, 0.34, 0.02);
      puff3.position.set(0.09, 0.2, 0);
      band.position.y = -0.02;
      hat.add(band, puff1, puff2, puff3);
      hat.position.y = 2.14;
    } else if (type === 'player') {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.26), mat(0x24324c, 0.86));
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.16), mat(palette.accent, 0.84));
      brim.position.set(0, -0.02, 0.14);
      cap.position.y = 0.06;
      hat.add(cap, brim);
      hat.position.y = 1.99;
      const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.34, 0.14), mat(0x2b4672, 0.92));
      backpack.position.set(0, 0.42, -0.23);
      rig.add(backpack);
    } else {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.14, 6), mat(palette.accent, 0.82));
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat(palette.accent, 0.82));
      top.position.y = 0.13;
      hat.add(cap, top);
      hat.position.y = 1.97;
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.1), mat(palette.accent, 0.94));
      bag.position.set(-0.03, 0.42, -0.22);
      rig.add(bag);
    }
    rig.add(hat);

    const apron = type === 'chef'
      ? new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.48, 0.07), mat(0xf2efe6, 0.95))
      : null;
    if (apron) {
      apron.position.set(0, 0.36, 0.18);
      rig.add(apron);
    }

    return {
      rig,
      body,
      hips,
      head,
      armL,
      armR,
      legL,
      legR,
      hat,
      eyeL,
      eyeR,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      blinkSeed: hashString(seedText + type),
      type,
    };
  }

  function upgradeRoot(root) {
    if (!root || upgradedRoots.has(root) || !root.userData || !root.userData.characterType) return;
    hideOriginalMeshes(root);
    const type = root.userData.characterType;
    const palette = paletteFor(type, `${root.userData.seed || root.uuid}:${root.position.x.toFixed(2)}:${root.position.z.toFixed(2)}`);
    const soft = buildSoftRig(type, palette, root.userData.seed || root.uuid);
    root.add(soft.rig);
    root.userData.softRig = soft;
    root.userData.rig = { armL: soft.leftArm, armR: soft.rightArm };
    upgradedRoots.add(root);
  }

  function animateRoot(root, now, dt) {
    const soft = root.userData && root.userData.softRig;
    if (!soft) return;

    const current = root.position.clone();
    const previous = prevPos.get(root) || current.clone();
    prevPos.set(root, current);
    const moved = current.distanceTo(previous);
    const speed = clamp01(moved / Math.max(dt, 0.016) / 2.2);
    const walk = Math.sin(now * 0.012 + soft.blinkSeed * 0.0001 + root.position.x * 0.2 + root.position.z * 0.17);
    const swing = walk * (0.34 + speed * 0.72);
    const bob = Math.sin(now * 0.006 + soft.blinkSeed * 0.0002) * (0.01 + speed * 0.018);
    const blink = 0.5 + 0.5 * Math.max(0, Math.sin(now * 0.0038 + soft.blinkSeed * 0.0003));

    soft.body.position.y = 0.92 + bob * 0.3;
    soft.hips.position.y = 0.34 + bob * 0.15;
    soft.head.position.y = 1.78 + bob * 0.9;
    soft.body.rotation.x = bob * 0.28;
    soft.body.rotation.z = swing * 0.03;
    soft.head.rotation.x = -bob * 0.18;
    soft.head.rotation.y = Math.sin(now * 0.0016 + soft.blinkSeed * 0.0001) * 0.05;

    soft.leftArm.rotation.x = 0.08 + swing;
    soft.rightArm.rotation.x = 0.08 - swing;
    soft.leftArm.rotation.z = 0.12;
    soft.rightArm.rotation.z = -0.12;

    soft.leftLeg.rotation.x = -0.05 - swing * 0.95;
    soft.rightLeg.rotation.x = -0.05 + swing * 0.95;
    soft.leftLeg.rotation.z = 0.03;
    soft.rightLeg.rotation.z = -0.03;

    if (soft.eyeL && soft.eyeR) {
      soft.eyeL.scale.y = blink;
      soft.eyeR.scale.y = blink;
    }

    if (root.userData.rig) {
      root.userData.rig.armL = soft.leftArm;
      root.userData.rig.armR = soft.rightArm;
    }
  }

  THREE.WebGLRenderer.prototype.render = function patchedRender(scene, camera) {
    const now = performance.now();
    const dt = Math.min(0.033, Math.max(0.001, (now - (window.__restaurantZombieSoftPatchLast || now)) / 1000));
    window.__restaurantZombieSoftPatchLast = now;

    scene.traverse((obj) => {
      if (!obj.isMesh) return;
      const root = findRoot(obj);
      if (root && root.userData && root.userData.characterType && !upgradedRoots.has(root)) {
        upgradeRoot(root);
      }
    });

    scene.traverse((obj) => {
      const root = findRoot(obj);
      if (root && root.userData && root.userData.softRig) {
        animateRoot(root, now, dt);
      }
    });

    return originalRender.call(this, scene, camera);
  };

  console.log('[Restaurant Zombie] soft character patch loaded');
})();
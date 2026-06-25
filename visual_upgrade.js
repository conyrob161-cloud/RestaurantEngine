(() => {
  if (!window.THREE) return;

  const originalRender = THREE.WebGLRenderer.prototype.render;
  const seenRoots = new WeakSet();
  const prevPos = new WeakMap();

  function isCharacterRoot(root) {
    let hasBody = false;
    let hasHead = false;
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry) return;
      const g = obj.geometry;
      if (g.type === 'CylinderGeometry' && g.parameters) {
        if (Math.abs(g.parameters.height - 0.92) < 0.18) hasBody = true;
      }
      if (g.type === 'SphereGeometry' && g.parameters) {
        if (Math.abs(g.parameters.radius - 0.28) < 0.08) hasHead = true;
      }
    });
    return hasBody && hasHead;
  }

  function findRootFromMesh(mesh) {
    let root = mesh;
    while (root.parent && root.parent.parent) root = root.parent;
    return root;
  }

  function makeLimb(material) {
    return new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.52, 0.12),
      material.clone()
    );
  }

  function makeEye(material) {
    return new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 8, 6),
      material.clone()
    );
  }

  function upgradeCharacter(root) {
    if (!root || seenRoots.has(root) || !isCharacterRoot(root)) return;
    seenRoots.add(root);

    const meshes = [];
    root.traverse((obj) => {
      if (obj.isMesh) meshes.push(obj);
    });

    const body = meshes.find((m) => m.geometry?.type === 'CylinderGeometry' && m.geometry?.parameters && Math.abs(m.geometry.parameters.height - 0.92) < 0.18);
    const head = meshes.find((m) => m.geometry?.type === 'SphereGeometry' && m.geometry?.parameters && Math.abs(m.geometry.parameters.radius - 0.28) < 0.08);
    const hat = meshes.find((m) => m !== body && m !== head && m.geometry?.type === 'CylinderGeometry' && m.geometry?.parameters && m.geometry.parameters.height < 0.45);

    if (!body || !head) return;

    const bodyColor = body.material?.color ? body.material.color.clone() : new THREE.Color(0x355d9d);
    const limbMat = new THREE.MeshStandardMaterial({
      color: bodyColor.clone().multiplyScalar(0.92),
      roughness: 0.96,
      metalness: 0.0,
    });
    const shoeMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x1f2430),
      roughness: 1.0,
      metalness: 0.0,
    });
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 1.0,
      metalness: 0.0,
    });

    const armL = makeLimb(limbMat);
    const armR = makeLimb(limbMat);
    const legL = makeLimb(limbMat);
    const legR = makeLimb(limbMat);
    const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.24), shoeMat);
    const shoeR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.24), shoeMat);

    armL.position.set(-0.43, 0.72, 0);
    armR.position.set(0.43, 0.72, 0);
    legL.position.set(-0.16, 0.24, 0.01);
    legR.position.set(0.16, 0.24, 0.01);
    shoeL.position.set(0, -0.30, 0.02);
    shoeR.position.set(0, -0.30, 0.02);
    shoeL.rotation.x = 0.08;
    shoeR.rotation.x = -0.08;

    legL.add(shoeL);
    legR.add(shoeR);
    root.add(armL, armR, legL, legR);

    const eyeL = makeEye(eyeMat);
    const eyeR = makeEye(eyeMat);
    eyeL.position.set(-0.08, 0.03, 0.27);
    eyeR.position.set(0.08, 0.03, 0.27);
    head.add(eyeL, eyeR);

    const rig = {
      body,
      head,
      hat,
      armL,
      armR,
      legL,
      legR,
      eyeL,
      eyeR,
      baseHeadY: head.position.y,
      baseBodyY: body.position.y,
      baseHatY: hat ? hat.position.y : null,
      baseArmLY: armL.position.y,
      baseArmRY: armR.position.y,
      baseLegLY: legL.position.y,
      baseLegRY: legR.position.y,
      blinkPhase: Math.random() * Math.PI * 2,
    };

    root.userData.visualRig = rig;
    root.userData.visualRigBuilt = true;
  }

  function animateCharacter(root, now, dt) {
    const rig = root.userData.visualRig;
    if (!rig) return;

    const current = root.position.clone();
    const previous = prevPos.get(root) || current.clone();
    const moved = current.distanceTo(previous);
    prevPos.set(root, current);

    const speedFactor = clamp01(moved / Math.max(dt, 0.016) / 2.2);
    const walk = Math.sin(now * 0.012 + root.position.x * 0.3 + root.position.z * 0.17);
    const swing = walk * (0.55 + speedFactor * 0.55);
    const subtle = Math.sin(now * 0.004 + rig.blinkPhase) * 0.04;

    rig.armL.rotation.x = 0.1 + swing;
    rig.armR.rotation.x = 0.1 - swing;
    rig.armL.rotation.z = 0.12;
    rig.armR.rotation.z = -0.12;
    rig.legL.rotation.x = -0.15 - swing * 0.75;
    rig.legR.rotation.x = -0.15 + swing * 0.75;
    rig.legL.rotation.z = 0.04;
    rig.legR.rotation.z = -0.04;

    rig.body.rotation.x = subtle * 0.4;
    rig.head.position.y = rig.baseHeadY + Math.sin(now * 0.006 + rig.blinkPhase) * 0.018 + speedFactor * 0.01;
    rig.body.position.y = rig.baseBodyY + Math.sin(now * 0.006 + rig.blinkPhase) * 0.01;
    if (rig.hat) rig.hat.position.y = rig.baseHatY + Math.sin(now * 0.006 + rig.blinkPhase) * 0.015;

    const blink = 0.45 + 0.55 * Math.max(0, Math.sin(now * 0.0035 + rig.blinkPhase));
    rig.eyeL.scale.y = blink;
    rig.eyeR.scale.y = blink;
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  THREE.WebGLRenderer.prototype.render = function upgradedRender(scene, camera) {
    const now = performance.now();
    const dt = Math.min(0.033, Math.max(0.001, (now - (window.__visualUpgradeLast || now)) / 1000));
    window.__visualUpgradeLast = now;

    scene.traverse((obj) => {
      if (!obj.isMesh) return;
      const root = findRootFromMesh(obj);
      if (!root.userData.visualRigBuilt && isCharacterRoot(root)) upgradeCharacter(root);
    });

    scene.traverse((obj) => {
      if (!obj.userData || !obj.userData.visualRig) return;
      animateCharacter(obj, now, dt);
    });

    return originalRender.call(this, scene, camera);
  };

  console.log('[Restaurant Zombie] visual_upgrade.js loaded');
})();
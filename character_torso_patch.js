(() => {
  if (window.__rzTorsoPatchActive || !window.THREE) return;
  window.__rzTorsoPatchActive = true;

  const add = THREE.Object3D.prototype.add;
  const done = new WeakSet();

  function mesh(parent, geometry, material, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geometry, material.clone());
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  function findCharacter(node) {
    if (!node) return null;
    if (node.name === '__rz_character') return node;
    for (const child of node.children || []) {
      const found = findCharacter(child);
      if (found) return found;
    }
    return null;
  }

  function bodyColorFrom(group) {
    for (const child of group.children || []) {
      if (child?.material?.color) return child.material.color.clone();
      for (const grand of child?.children || []) {
        if (grand?.material?.color) return grand.material.color.clone();
      }
    }
    return new THREE.Color(0x4d78b5);
  }

  function patchTorso(char) {
    if (!char || done.has(char)) return;
    const body = char.children?.[0];
    if (!body || !body.isGroup) return;
    done.add(char);

    const role = String(char.parent?.userData?.type || '').toLowerCase();
    const bodyColor = bodyColorFrom(body);
    const pantsColor = new THREE.Color(0x2a3140);

    body.clear();

    const segmentMaterial = new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.95,
      metalness: 0,
      flatShading: true,
      side: THREE.DoubleSide,
    });
    const pantsMaterial = new THREE.MeshStandardMaterial({
      color: pantsColor,
      roughness: 0.98,
      metalness: 0,
      flatShading: true,
      side: THREE.DoubleSide,
    });

    mesh(body, new THREE.BoxGeometry(0.58, 0.18, 0.30), segmentMaterial, 0, 0.86, 0);
    mesh(body, new THREE.BoxGeometry(0.48, 0.24, 0.28), segmentMaterial, 0, 0.60, 0);
    mesh(body, new THREE.BoxGeometry(0.36, 0.20, 0.26), segmentMaterial, 0, 0.34, 0);
    mesh(body, new THREE.BoxGeometry(0.42, 0.18, 0.26), pantsMaterial, 0, 0.08, 0);

    if (role === 'chef') {
      const apronMat = new THREE.MeshStandardMaterial({
        color: 0xe8d9c2,
        roughness: 0.95,
        metalness: 0,
        flatShading: true,
        side: THREE.DoubleSide,
      });
      mesh(body, new THREE.BoxGeometry(0.22, 0.28, 0.03), apronMat, 0, 0.30, 0.16);
      mesh(body, new THREE.BoxGeometry(0.13, 0.03, 0.03), new THREE.MeshStandardMaterial({
        color: 0xb58b5d, roughness: 0.95, metalness: 0, flatShading: true, side: THREE.DoubleSide,
      }), 0, 0.12, 0.20);
    }

    char.scale.setScalar(1.0);
  }

  function scan(root) {
    const char = findCharacter(root);
    if (!char || char.userData.__rzTorsoPatched) return;
    patchTorso(char);
    char.userData.__rzTorsoPatched = true;
  }

  THREE.Object3D.prototype.add = function patchedAdd(...objs) {
    const result = add.apply(this, objs);
    queueMicrotask(() => {
      for (const obj of objs) scan(obj);
    });
    return result;
  };

  window.RZTorsoPatch = { scan };
})();
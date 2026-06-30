(() => {
  const used = new WeakSet();

  function hashString(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function paletteFor(seedText) {
    const palettes = [
      { body: 0x4f7dc8, skin: 0xf2cfb1, hair: 0x1e1e1e, accent: 0x79aef2 },
      { body: 0x2ec77f, skin: 0xf2cfb1, hair: 0x1e1e1e, accent: 0x8ce69f },
      { body: 0xe24c4b, skin: 0xf2cfb1, hair: 0x1e1e1e, accent: 0xff8f7a },
      { body: 0xf0c74f, skin: 0xf2cfb1, hair: 0x1e1e1e, accent: 0xffda80 },
      { body: 0x9b59b6, skin: 0xf2cfb1, hair: 0x1e1e1e, accent: 0xc79be0 },
      { body: 0xec7c3c, skin: 0xf2cfb1, hair: 0x1e1e1e, accent: 0xffa15e },
    ];
    return palettes[hashString(seedText) % palettes.length];
  }

  function makeCustomerModel(seedText) {
    const palette = paletteFor(seedText);
    const root = new THREE.Group();
    root.name = 'customerModel';

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.44, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    root.add(shadow);

    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.27, 0.62, 4, 8),
      new THREE.MeshStandardMaterial({ color: palette.body, roughness: 0.92 })
    );
    body.position.y = 0.82;
    root.add(body);

    const belly = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 10, 8),
      new THREE.MeshStandardMaterial({ color: palette.accent, roughness: 0.9 })
    );
    belly.position.set(0, 0.7, 0.14);
    belly.scale.set(1.2, 0.9, 0.72);
    root.add(belly);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 12, 10),
      new THREE.MeshStandardMaterial({ color: palette.skin, roughness: 0.96 })
    );
    head.position.y = 1.76;
    root.add(head);

    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 12, 10),
      new THREE.MeshStandardMaterial({ color: palette.hair, roughness: 0.95 })
    );
    hair.scale.set(1.02, 0.72, 0.96);
    hair.position.set(0, 1.8, -0.01);
    root.add(hair);

    const armMat = new THREE.MeshStandardMaterial({ color: palette.skin, roughness: 0.96 });
    [
      [-1, -0.58, 1.03, -0.12],
      [1, 0.58, 1.03, 0.12],
    ].forEach(([side, x, y, zrot]) => {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.52, 6), armMat);
      arm.position.set(x, y, 0);
      arm.rotation.z = side * 0.42;
      root.add(arm);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), armMat);
      hand.position.set(x + side * 0.18, 0.85, 0.04 * side);
      root.add(hand);
    });

    const legMat = new THREE.MeshStandardMaterial({ color: 0x1d2230, roughness: 1 });
    [
      [-0.16, 0.08],
      [0.16, 0.08],
    ].forEach(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.46, 6), legMat);
      leg.position.set(x, 0.28, z);
      root.add(leg);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.34), legMat);
      shoe.position.set(x, 0.05, z + 0.08);
      root.add(shoe);
    });

    const hatBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.23, 0.23, 0.12, 6),
      new THREE.MeshStandardMaterial({ color: palette.body, roughness: 0.82 })
    );
    hatBase.position.y = 1.98;
    root.add(hatBase);

    const hatTop = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 6),
      new THREE.MeshStandardMaterial({ color: palette.body, roughness: 0.82 })
    );
    hatTop.position.y = 2.12;
    root.add(hatTop);

    return root;
  }

  function applyCustomerModel(customerRoot) {
    if (!customerRoot || !customerRoot.userData || customerRoot.userData.characterType !== 'customer') return;
    if (used.has(customerRoot)) return;
    used.add(customerRoot);

    customerRoot.clear();
    const model = makeCustomerModel(customerRoot.userData.seed || 'customer');
    model.position.y = 0;
    model.rotation.y = Math.PI;
    customerRoot.add(model);
    customerRoot.userData.rig = null;
    customerRoot.scale.setScalar(1.1);
  }

  const originalAdd = THREE.Scene.prototype.add;
  THREE.Scene.prototype.add = function patchedAdd(...objects) {
    const result = originalAdd.apply(this, objects);
    for (const object of objects) applyCustomerModel(object);
    return result;
  };
})();
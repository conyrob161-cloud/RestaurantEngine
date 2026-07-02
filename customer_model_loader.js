(() => {
  const MODEL_URL = './Character%20Base.glb';
  const customerRoots = new Set();
  const originalAdd = THREE.Object3D.prototype.add;
  let template = null;

  function hideOldParts(root) {
    for (const child of root.children) {
      if (child.isSprite) continue;
      if (child.geometry?.type === 'CircleGeometry') continue;
      child.visible = false;
    }
  }

  function attachModel(root) {
    if (!template || root.userData.__baseAttached) return;
    root.userData.__baseAttached = true;
    hideOldParts(root);

    const model = template.clone(true);
    model.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const scale = size.y > 0 ? 1.7 / size.y : 1;
    model.scale.setScalar(scale);
    model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    root.add(model);
  }

  THREE.Object3D.prototype.add = function patchedAdd(...objs) {
    for (const obj of objs) {
      if (obj && obj.userData && obj.userData.type === 'customer') {
        customerRoots.add(obj);
        attachModel(obj);
      }
    }
    return originalAdd.apply(this, objs);
  };

  const loader = new THREE.GLTFLoader();
  loader.load(MODEL_URL, (gltf) => {
    template = gltf.scene || gltf.scenes?.[0] || null;
    if (!template) return;
    template.updateMatrixWorld(true);
    for (const root of customerRoots) attachModel(root);
  }, undefined, (err) => {
    console.warn('Character Base.glb load failed:', err);
  });
})();
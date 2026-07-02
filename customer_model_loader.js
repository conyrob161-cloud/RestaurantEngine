(() => {
  const MODEL_URL = encodeURI('./Character Base.glb');
  const customers = new Set();
  const meshToCustomer = new WeakMap();
  const applied = new WeakSet();
  let template = null;

  const originalPush = Array.prototype.push;
  Array.prototype.push = function patchedPush(...items) {
    for (const item of items) {
      if (item && typeof item === 'object' && item.mesh && item.table && item.order && item.remaining && typeof item.state === 'string') {
        customers.add(item.mesh);
        meshToCustomer.set(item.mesh, item);
        if (template) attachModel(item.mesh);
      }
    }
    return originalPush.apply(this, items);
  };

  function getCharacterState(root) {
    const customer = meshToCustomer.get(root);
    if (!customer) return 'idle';
    if (customer.state === 'walking' || customer.state === 'leaving') return 'walk';
    if (customer.state === 'eating') return 'eat';
    return 'idle';
  }

  function clearProceduralMesh(root) {
    for (const child of root.children) {
      if (child.isSprite) continue;
      if (child.geometry?.type === 'CircleGeometry') continue;
      child.visible = false;
    }
  }

  function attachModel(root) {
    if (!template || applied.has(root)) return;
    applied.add(root);

    clearProceduralMesh(root);

    const wrapper = new THREE.Group();
    wrapper.name = 'CharacterBaseWrapper';

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

    const targetHeight = 1.7;
    const scale = size.y > 0 ? targetHeight / size.y : 1;
    wrapper.scale.setScalar(scale);
    wrapper.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    wrapper.add(model);

    root.add(wrapper);
    root.userData.__characterBaseWrapper = wrapper;
    root.userData.__characterBaseScale = scale;
  }

  function animate() {
    const now = performance.now() / 1000;
    for (const root of customers) {
      const wrapper = root.userData.__characterBaseWrapper;
      if (!wrapper) continue;
      const state = getCharacterState(root);
      const phase = root.userData.__characterBasePhase || (root.userData.__characterBasePhase = Math.random() * Math.PI * 2);
      const bob = state === 'walk' ? Math.abs(Math.sin(now * 10 + phase)) * 0.03 : Math.sin(now * 2.2 + phase) * 0.01;

      wrapper.position.y = (-wrapper.position.y) + (state === 'eat' ? 0 : 0);
      wrapper.rotation.set(0, 0, 0);
      wrapper.position.y += bob;
      if (state === 'walk') {
        wrapper.rotation.z = Math.sin(now * 10 + phase) * 0.05;
      } else if (state === 'eat') {
        wrapper.rotation.x = 0.18 + Math.sin(now * 6 + phase) * 0.03;
        wrapper.position.y -= 0.04;
      } else {
        wrapper.rotation.x = Math.sin(now * 1.3 + phase) * 0.01;
      }
    }
    requestAnimationFrame(animate);
  }

  const loader = new THREE.GLTFLoader();
  loader.load(
    MODEL_URL,
    (gltf) => {
      template = gltf.scene || gltf.scenes?.[0] || null;
      if (!template) return;
      template.scale.setScalar(1);
      template.updateMatrixWorld(true);
      for (const mesh of customers) attachModel(mesh);
    },
    undefined,
    (err) => {
      console.warn('Character model load failed:', err);
    }
  );

  requestAnimationFrame(animate);
})();
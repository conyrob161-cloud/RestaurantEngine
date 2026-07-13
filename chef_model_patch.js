(() => {
  if (window.__rzChefModelPatchActive || !window.THREE) return;
  window.__rzChefModelPatchActive = true;

  const MODEL_URL = 'Meshy_AI_Meshy_Merged_Animations.glb';
  const loader = new THREE.GLTFLoader();
  const clock = new THREE.Clock();
  const mixers = [];
  let sceneApplied = null;
  let loading = null;
  let completed = false;

  const waitForScene = () => {
    const scene = window.RZZombiePatch?.scene || null;
    if (!scene) {
      requestAnimationFrame(waitForScene);
      return;
    }
    if (sceneApplied === scene) {
      requestAnimationFrame(waitForScene);
      return;
    }
    sceneApplied = scene;
    applyToScene(scene);
    requestAnimationFrame(waitForScene);
  };

  const createShadow = () => new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 })
  );

  function findChefRoot(scene) {
    let root = null;
    scene.traverse((obj) => {
      if (root) return;
      if (obj && obj.userData && obj.userData.type === 'chef') root = obj;
    });
    return root;
  }

  function cloneScene(scene) {
    if (THREE.SkeletonUtils && typeof THREE.SkeletonUtils.clone === 'function') {
      return THREE.SkeletonUtils.clone(scene);
    }
    return scene.clone(true);
  }

  function fitModel(model) {
    model.traverse((obj) => {
      if (obj && obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const height = Math.max(size.y, 0.001);
    const scale = 1.95 / height;

    model.scale.setScalar(scale);
    model.position.sub(center);
    model.position.multiplyScalar(scale);

    const box2 = new THREE.Box3().setFromObject(model);
    model.position.y -= box2.min.y;
  }

  function attachChefModel(root, gltf) {
    if (!root || root.userData.__chefModelApplied) return;
    root.userData.__chefModelApplied = true;
    root.userData.type = 'chef3d';

    while (root.children.length) root.remove(root.children[0]);

    const shadow = createShadow();
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    root.add(shadow);

    const wrapper = new THREE.Group();
    wrapper.name = '__rzChefModelWrapper';
    root.add(wrapper);

    const model = cloneScene(gltf.scene || gltf.scenes?.[0]);
    model.name = '__rzChefModel';
    fitModel(model);
    wrapper.add(model);

    const clips = Array.isArray(gltf.animations) ? gltf.animations : [];
    if (clips.length > 0) {
      const mixer = new THREE.AnimationMixer(model);
      const preferred = clips.find((clip) => /idle/i.test(clip.name || '')) || clips[0];
      const action = mixer.clipAction(preferred);
      action.play();
      mixers.push(mixer);
    }
  }

  function applyToScene(scene) {
    if (completed) return;
    const chef = findChefRoot(scene);
    if (!chef || chef.userData.__chefModelApplied) return;

    if (!loading) {
      loading = new Promise((resolve, reject) => {
        loader.load(MODEL_URL, resolve, undefined, reject);
      });
    }

    loading.then((gltf) => {
      const currentScene = window.RZZombiePatch?.scene || scene;
      const currentChef = findChefRoot(currentScene);
      if (!currentChef || currentChef.userData.__chefModelApplied) return;
      attachChefModel(currentChef, gltf);
      completed = true;
    }).catch((err) => {
      console.warn('Chef model load failed:', err);
    });
  }

  function tick() {
    const dt = Math.min(0.033, clock.getDelta() || 0.016);
    for (const mixer of mixers) mixer.update(dt);
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(waitForScene);
  requestAnimationFrame(tick);
})();

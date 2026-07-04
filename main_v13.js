(() => {
  if (window.__rzCharacterPatchActive) return;
  window.__rzCharacterPatchActive = true;

  const MODEL_URLS = [
    './Hoodie Character.glb',
    './Hoodie%20Character.glb',
    './assets/Hoodie Character.glb',
  ];
  const TARGET_TYPES = new Set(['player', 'chef', 'customer']);
  const cache = new Map();
  const roots = new Set();
  const infos = new Map();
  const mixers = new Set();
  const clock = new THREE.Clock();
  let depsPromise = null;

  const add = THREE.Object3D.prototype.add;
  const norm = (v) => String(v || '').trim().toLowerCase();

  function loadScript(src, check) {
    if (check()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => (check() ? resolve() : reject(new Error(`Failed to expose ${src}`)));
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
  }

  async function ensureDeps() {
    if (THREE.GLTFLoader && THREE.SkeletonUtils?.clone) return;
    if (!depsPromise) {
      depsPromise = Promise.all([
        loadScript('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/js/loaders/GLTFLoader.js', () => !!THREE.GLTFLoader),
        loadScript('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/js/utils/SkeletonUtils.js', () => !!THREE.SkeletonUtils?.clone),
      ]);
    }
    await depsPromise;
  }

  function pickUrl(root) {
    return root?.userData?.characterModel || root?.userData?.characterModelUrl || MODEL_URLS[0];
  }

  function loadTemplate(url) {
    if (cache.has(url)) return cache.get(url);
    const promise = (async () => {
      await ensureDeps();
      if (!THREE.GLTFLoader) throw new Error('GLTFLoader missing');
      const loader = new THREE.GLTFLoader();
      return await new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
    })();
    cache.set(url, promise);
    return promise;
  }

  function cloneScene(scene) {
    return THREE.SkeletonUtils?.clone ? THREE.SkeletonUtils.clone(scene) : scene.clone(true);
  }

  function makeShadow() {
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(0.38, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.01;
    return mesh;
  }

  function applyMaterials(root) {
    root.traverse((o) => {
      if (!(o.isMesh || o.isSkinnedMesh)) return;
      o.visible = true;
      o.frustumCulled = false;
      o.castShadow = true;
      o.receiveShadow = true;
      if (o.material) {
        const m = Array.isArray(o.material) ? o.material.map((x) => x.clone()) : o.material.clone();
        if (Array.isArray(m)) m.forEach((x) => (x.side = THREE.DoubleSide));
        else {
          m.side = THREE.DoubleSide;
          if ('skinning' in m) m.skinning = !!o.isSkinnedMesh;
        }
        o.material = m;
      }
    });
  }

  function fitToHeight(root, target = 1.8) {
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const scale = size.y > 0 ? target / size.y : 1;
    root.scale.setScalar(scale);
    root.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    return scale;
  }

  function pickClip(anims, state) {
    if (!anims?.length) return null;
    const want = norm(state || 'idle');
    const aliases = want === 'walk' ? ['walk', 'run', 'move'] : want === 'eat' ? ['eat', 'interact', 'chew', 'drink'] : ['idle', 'stand', 'wait', 'rest'];
    for (const alias of aliases) {
      const clip = anims.find((a) => norm(a.name).includes(alias));
      if (clip) return clip;
    }
    return anims[0];
  }

  function playState(info, state) {
    if (!info.mixer || !info.anims?.length) return;
    const targetClip = pickClip(info.anims, state);
    if (!targetClip) return;
    const next = info.mixer.clipAction(targetClip);
    next.reset().fadeIn(0.15).play();
    info.action = next;
    info.state = state;
  }

  function setCharacterModel(root, gltf, url) {
    if (infos.has(root) || !root || !root.parent) return;
    const oldSprites = root.children.filter((c) => c.isSprite);
    root.clear();
    root.add(makeShadow());
    for (const sprite of oldSprites) root.add(sprite);

    const model = cloneScene(gltf.scene);
    applyMaterials(model);
    fitToHeight(model, 1.8);
    root.add(model);

    const info = {
      root,
      model,
      anims: gltf.animations || [],
      mixer: null,
      action: null,
      state: 'idle',
      idleSeconds: 0,
      lastPos: root.getWorldPosition(new THREE.Vector3()),
      url,
    };

    if (info.anims.length) {
      info.mixer = new THREE.AnimationMixer(model);
      mixers.add(info.mixer);
      playState(info, 'idle');
    }

    root.userData.characterModelLoaded = true;
    root.userData.characterModelUrl = url;
    infos.set(root, info);
    roots.add(root);
  }

  function attach(root) {
    if (!root || infos.has(root) || !TARGET_TYPES.has(norm(root.userData?.type))) return;
    const url = pickUrl(root);
    root.userData.characterModel = url;
    loadTemplate(url)
      .then((gltf) => setCharacterModel(root, gltf, url))
      .catch((err) => console.warn('[GLB loader] failed', url, err));
  }

  function inferState(root, info, dt) {
    const manual = root.userData?.characterState || root.userData?.animState || root.userData?.glbState;
    if (manual) return norm(manual);
    const pos = root.getWorldPosition(new THREE.Vector3());
    const speed = pos.distanceTo(info.lastPos) / Math.max(dt, 1 / 60);
    info.lastPos.copy(pos);
    if (speed > 0.03) {
      info.idleSeconds = 0;
      return 'walk';
    }
    info.idleSeconds += dt;
    if (norm(root.userData?.type) === 'customer' && info.idleSeconds > 1.1) return 'eat';
    return 'idle';
  }

  function step() {
    const dt = clock.getDelta();
    for (const mixer of mixers) mixer.update(dt);
    for (const root of roots) {
      const info = infos.get(root);
      if (!info || !info.mixer) continue;
      const next = inferState(root, info, dt);
      if (info.state === next) continue;
      const clip = pickClip(info.anims, next);
      if (!clip) continue;
      if (info.action) info.action.fadeOut(0.15);
      const action = info.mixer.clipAction(clip);
      action.reset().fadeIn(0.15).play();
      info.action = action;
      info.state = next;
    }
    requestAnimationFrame(step);
  }

  THREE.Object3D.prototype.add = function patchedAdd(...objs) {
    for (const obj of objs) {
      if (obj && typeof obj === 'object' && TARGET_TYPES.has(norm(obj.userData?.type))) {
        attach(obj);
      }
    }
    return add.apply(this, objs);
  };

  window.RZCharacterPatch = {
    reload() {
      cache.clear();
      depsPromise = null;
    },
  };

  document.write('<script src="character_overhaul.js?v=1"><\/script>');
  document.write('<script src="character_torso_patch.js?v=1"><\/script>');
  requestAnimationFrame(step);
})();
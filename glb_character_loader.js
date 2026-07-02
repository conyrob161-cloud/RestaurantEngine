(() => {
  const MODEL_URLS = ['./Hoodie Character.glb', './assets/Hoodie Character.glb'];
  const TYPES = new Set(['player', 'chef', 'customer']);
  const add = THREE.Object3D.prototype.add;
  const cache = new Map();
  const roots = new Set();
  const infos = new Map();
  const mixers = new Set();
  const clock = new THREE.Clock();

  function norm(v) { return String(v || '').trim().toLowerCase(); }
  function pickUrl(root) { return root?.userData?.characterModel || root?.userData?.characterModelUrl || MODEL_URLS[0]; }
  function pickClip(anims, state) {
    if (!anims?.length) return null;
    const want = norm(state || 'idle');
    const aliases = want === 'walk' ? ['walk', 'run', 'move'] : want === 'eat' ? ['eat', 'interact', 'chew', 'drink'] : ['idle', 'stand', 'wait', 'rest'];
    for (const a of aliases) {
      const clip = anims.find((x) => norm(x.name).includes(a));
      if (clip) return clip;
    }
    return anims[0];
  }
  function fit(root, target = 1.8) {
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size); box.getCenter(center);
    const s = size.y > 0 ? target / size.y : 1;
    root.scale.setScalar(s);
    root.position.set(-center.x * s, -box.min.y * s, -center.z * s);
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
  function load(url) {
    if (cache.has(url)) return cache.get(url);
    const p = new Promise((resolve, reject) => {
      if (!THREE.GLTFLoader) return reject(new Error('GLTFLoader missing'));
      new THREE.GLTFLoader().load(url, resolve, undefined, reject);
    });
    cache.set(url, p);
    return p;
  }
  function attach(root) {
    if (!root || infos.has(root) || !TYPES.has(norm(root.userData?.type))) return;
    const url = pickUrl(root);
    load(url).then((gltf) => {
      for (const c of root.children.slice()) if (!c.isSprite) c.visible = false;
      const model = gltf.scene.clone(true);
      applyMaterials(model);
      fit(model);
      root.add(model);
      const info = { anims: gltf.animations || [], mixer: null, action: null, state: 'idle', idle: 0, last: root.getWorldPosition(new THREE.Vector3()) };
      if (info.anims.length) {
        info.mixer = new THREE.AnimationMixer(model);
        mixers.add(info.mixer);
        const clip = pickClip(info.anims, 'idle');
        if (clip) info.action = info.mixer.clipAction(clip).reset().play();
      }
      infos.set(root, info);
      roots.add(root);
    }).catch((err) => console.warn('[GLB loader] failed', url, err));
  }
  function state(root, info, dt) {
    const manual = root.userData?.characterState || root.userData?.animState || root.userData?.glbState;
    if (manual) return norm(manual);
    const pos = root.getWorldPosition(new THREE.Vector3());
    const speed = pos.distanceTo(info.last) / Math.max(dt, 1 / 60);
    info.last.copy(pos);
    if (speed > 0.03) { info.idle = 0; return 'walk'; }
    info.idle += dt;
    if (norm(root.userData?.type) === 'customer' && info.idle > 1.1) return 'eat';
    return 'idle';
  }
  function step() {
    const dt = clock.getDelta();
    for (const m of mixers) m.update(dt);
    for (const root of roots) {
      const info = infos.get(root); if (!info || !info.mixer) continue;
      const next = state(root, info, dt);
      if (info.state === next) continue;
      info.state = next;
      const clip = pickClip(info.anims, next);
      if (!clip) continue;
      const action = info.mixer.clipAction(clip);
      if (info.action && info.action !== action) info.action.fadeOut(0.15);
      action.reset().fadeIn(0.15).play();
      info.action = action;
    }
    requestAnimationFrame(step);
  }
  THREE.Object3D.prototype.add = function patchedAdd(...objs) {
    for (const o of objs) if (o && typeof o === 'object' && TYPES.has(norm(o.userData?.type))) attach(o);
    return add.apply(this, objs);
  };
  window.RZCharacterSystem = { attach, setModelUrl(url) { if (url && !MODEL_URLS.includes(url)) MODEL_URLS.unshift(url); }, reload() { cache.clear(); } };
  requestAnimationFrame(step);
})();
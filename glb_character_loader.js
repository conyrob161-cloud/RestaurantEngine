(() => {
  const MODEL_URLS = ['./Hoodie Character.glb', './assets/Hoodie Character.glb'];
  const TYPES = new Set(['player', 'chef', 'customer']);
  const add = THREE.Object3D.prototype.add;
  const cache = new Map();
  const roots = new Set();
  const infos = new Map();
  const mixers = new Set();
  const clock = new THREE.Clock();
  let depsState = 'CHYBÍ';
  let depsPromise = null;

  const diag = document.createElement('div');
  diag.id = 'rz-diag';
  diag.style.cssText = [
    'position:fixed', 'left:12px', 'top:12px', 'z-index:99999', 'max-width:min(92vw,380px)',
    'padding:12px 14px', 'border-radius:14px', 'background:rgba(8,13,22,.88)',
    'color:#e5eefc', 'font:12px/1.45 system-ui,Segoe UI,Roboto,sans-serif',
    'box-shadow:0 12px 30px rgba(0,0,0,.35)', 'border:1px solid rgba(255,255,255,.12)',
    'pointer-events:auto', 'backdrop-filter:blur(10px)'
  ].join(';');
  diag.innerHTML = `
    <div style="font-weight:900;font-size:14px;margin-bottom:6px;">3D diagnostika</div>
    <div id="rz-d-state">Stav: čekám</div>
    <div id="rz-d-url">Model: —</div>
    <div id="rz-d-count">Postavy: 0</div>
    <div id="rz-d-assets">GLTFLoader: —</div>
    <div id="rz-d-anim">Animace: —</div>
    <div id="rz-d-last" style="opacity:.78;margin-top:4px;white-space:pre-wrap;">—</div>
    <button id="rz-d-hide" style="margin-top:8px;border:0;border-radius:999px;padding:8px 12px;font-weight:800;background:#ffd166;color:#111827;cursor:pointer;">Skrýt</button>
  `;
  const attachDiag = () => {
    if (!document.getElementById('rz-diag') && document.body) document.body.appendChild(diag);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attachDiag, { once: true });
  else attachDiag();
  diag.querySelector('#rz-d-hide').addEventListener('click', () => (diag.style.display = 'none'));

  const els = {
    state: () => diag.querySelector('#rz-d-state'),
    url: () => diag.querySelector('#rz-d-url'),
    count: () => diag.querySelector('#rz-d-count'),
    assets: () => diag.querySelector('#rz-d-assets'),
    anim: () => diag.querySelector('#rz-d-anim'),
    last: () => diag.querySelector('#rz-d-last'),
  };
  const set = (k, v) => { const e = els[k](); if (e) e.textContent = v; };
  const norm = (v) => String(v || '').trim().toLowerCase();
  const pickUrl = (root) => root?.userData?.characterModel || root?.userData?.characterModelUrl || MODEL_URLS[0];
  const updateCount = () => set('count', `Postavy: ${infos.size} | sledované kořeny: ${roots.size}`);
  const updateAssets = () => set('assets', `GLTFLoader: ${THREE.GLTFLoader ? 'OK' : depsState} | SkeletonUtils: ${THREE.SkeletonUtils?.clone ? 'OK' : depsState}`);
  const updateAnim = (text) => set('anim', text);
  const updateLast = (text) => set('last', text);
  const setState = (text) => set('state', `Stav: ${text}`);

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
    return s;
  }

  function cloneScene(scene) {
    return THREE.SkeletonUtils?.clone ? THREE.SkeletonUtils.clone(scene) : scene.clone(true);
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

  async function ensureDeps() {
    if (THREE.GLTFLoader && THREE.SkeletonUtils?.clone) {
      depsState = 'OK';
      updateAssets();
      return;
    }
    if (!depsPromise) {
      depsState = 'NAČÍTÁM';
      updateAssets();
      setState('načítám podpůrné knihovny');
      updateLast('Čekám na GLTFLoader / SkeletonUtils');
      depsPromise = (async () => {
        const tasks = [];
        if (!THREE.GLTFLoader) {
          tasks.push(import('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js').then((m) => {
            THREE.GLTFLoader = m.GLTFLoader;
          }));
        }
        if (!THREE.SkeletonUtils?.clone) {
          tasks.push(import('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/SkeletonUtils.js').then((m) => {
            THREE.SkeletonUtils = m.SkeletonUtils;
          }));
        }
        await Promise.all(tasks);
        depsState = 'OK';
        updateAssets();
        setState('podpůrné knihovny připraveny');
      })().catch((err) => {
        depsState = 'CHYBÍ';
        updateAssets();
        setState('chyba podpůrných knihoven');
        updateLast(String(err?.message || err));
        throw err;
      });
    }
    return depsPromise;
  }

  async function load(url) {
    if (cache.has(url)) return cache.get(url);
    setState(`načítám ${url}`);
    set('url', `Model: ${url}`);
    const p = (async () => {
      await ensureDeps();
      if (!THREE.GLTFLoader) throw new Error('GLTFLoader missing after import');
      const loader = new THREE.GLTFLoader();
      return await new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
    })();
    cache.set(url, p);
    return p;
  }

  function attach(root) {
    if (!root || infos.has(root) || !TYPES.has(norm(root.userData?.type))) return;
    const url = pickUrl(root);
    updateCount();
    load(url).then((gltf) => {
      setState(`model načten: ${url}`);
      set('url', `Model: ${url}`);
      set('last', `meshes: ${gltf.scene?.children?.length ?? 0}\nanimace: ${(gltf.animations || []).length}`);
      for (const c of root.children.slice()) if (!c.isSprite) c.visible = false;
      const model = cloneScene(gltf.scene);
      applyMaterials(model);
      const scale = fit(model);
      root.add(model);
      const info = { anims: gltf.animations || [], mixer: null, action: null, state: 'idle', idle: 0, last: root.getWorldPosition(new THREE.Vector3()), modelScale: scale };
      if (info.anims.length) {
        info.mixer = new THREE.AnimationMixer(model);
        mixers.add(info.mixer);
        const clip = pickClip(info.anims, 'idle');
        if (clip) {
          info.action = info.mixer.clipAction(clip).reset().play();
          updateAnim(`idle: ${clip.name || 'clip'} | všech: ${info.anims.length}`);
        }
      } else {
        updateAnim('žádné animace v GLB');
      }
      infos.set(root, info);
      roots.add(root);
      updateCount();
      updateLast(`připojeno k ${root.userData.type}\nscale: ${scale.toFixed(3)}`);
    }).catch((err) => {
      depsState = 'CHYBÍ';
      updateAssets();
      setState(`chyba při načítání ${url}`);
      updateLast(String(err?.message || err));
      console.warn('[GLB loader] failed', url, err);
    });
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
      updateAnim(`${next}: ${clip.name || 'clip'} | animace: ${info.anims.length}`);
    }
    requestAnimationFrame(step);
  }

  THREE.Object3D.prototype.add = function patchedAdd(...objs) {
    for (const o of objs) if (o && typeof o === 'object' && TYPES.has(norm(o.userData?.type))) attach(o);
    return add.apply(this, objs);
  };

  window.RZCharacterSystem = {
    attach,
    setModelUrl(url) { if (url && !MODEL_URLS.includes(url)) MODEL_URLS.unshift(url); set('url', `Model: ${url}`); },
    reload() { cache.clear(); depsPromise = null; depsState = 'CHYBÍ'; updateAssets(); setState('cache smazán, čekám na nové připojení'); },
  };

  updateAssets();
  updateCount();
  setState('čekám na postavy');
  requestAnimationFrame(step);
})();
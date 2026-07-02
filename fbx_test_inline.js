(() => {
  const urls = ['./Smooth_Male_Casual%20(1).fbx', './Smooth_Male_Casual (1).fbx'];
  const btn = document.createElement('button');
  btn.textContent = 'TEST FBX';
  btn.style.cssText = 'position:fixed;top:16px;right:16px;z-index:10000;border:0;border-radius:999px;padding:12px 16px;font:900 14px system-ui;background:#8fe08f;color:#0f172a;box-shadow:0 10px 24px rgba(0,0,0,.28);cursor:pointer';

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;display:none;z-index:9999;background:rgba(9,12,20,.96);overflow:hidden';
  overlay.innerHTML = `
    <div style="position:absolute;left:16px;top:16px;right:16px;max-width:560px;background:rgba(15,23,42,.88);border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:14px 16px;color:#fff;box-shadow:0 12px 30px rgba(0,0,0,.35);backdrop-filter:blur(10px);font:system-ui;">
      <div style="font-size:18px;font-weight:900;margin-bottom:6px;">FBX test</div>
      <div id="fbxStatus" style="font-size:14px;line-height:1.5;">Připraveno.</div>
      <div style="font-size:12px;opacity:.72;margin-top:8px;">Soubor: Smooth_Male_Casual (1).fbx</div>
      <div style="font-size:12px;opacity:.72;margin-top:2px;">Když se tady model ukáže, je FBX v pořádku a problém je jen v hlavní hře.</div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
        <button id="fbxLoad" style="border:0;border-radius:999px;padding:10px 14px;font-weight:800;background:#ffd166;color:#111827;cursor:pointer;">Načíst model</button>
        <button id="fbxClose" style="border:0;border-radius:999px;padding:10px 14px;font-weight:800;background:#e5e7eb;color:#111827;cursor:pointer;">Zpět do hry</button>
      </div>
    </div>
    <div id="fbxMount" style="position:absolute;inset:0;"></div>`;
  document.body.append(btn, overlay);

  const statusEl = overlay.querySelector('#fbxStatus');
  const loadBtn = overlay.querySelector('#fbxLoad');
  const closeBtn = overlay.querySelector('#fbxClose');
  const mount = overlay.querySelector('#fbxMount');

  let renderer = null, scene = null, camera = null, modelRoot = null, mixer = null, clock = new THREE.Clock(), started = false;

  const status = (t) => { statusEl.textContent = t; };
  const meshes = (root) => { let n = 0; root.traverse((o) => { if (o.isMesh) n++; }); return n; };
  const fit = (model, h = 2.0) => {
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3(), center = new THREE.Vector3();
    box.getSize(size); box.getCenter(center);
    const s = size.y > 0 ? h / size.y : 1;
    model.scale.setScalar(s);
    model.position.set(-center.x * s, -box.min.y * s, -center.z * s);
    return s;
  };

  function ensureScene() {
    if (renderer) return;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    scene.fog = new THREE.Fog(0x0f172a, 14, 40);
    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 2.3, 6.4);
    camera.lookAt(0, 1.4, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 1.5));
    const dir = new THREE.DirectionalLight(0xffffff, 1.9); dir.position.set(4, 8, 5); scene.add(dir);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(2.4, 48), new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2; scene.add(floor);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.07, 10, 28), new THREE.MeshStandardMaterial({ color: 0x8fe08f, emissive: 0x163016, roughness: 0.5 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.05; scene.add(ring);

    const resize = () => {
      const w = mount.clientWidth || window.innerWidth;
      const h = mount.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);

    if (!started) {
      started = true;
      const animate = () => {
        requestAnimationFrame(animate);
        if (!renderer) return;
        if (mixer) mixer.update(clock.getDelta());
        if (modelRoot) modelRoot.rotation.y += 0.006;
        renderer.render(scene, camera);
      };
      animate();
    }
  }

  function clearModel() {
    if (modelRoot && scene) scene.remove(modelRoot);
    modelRoot = null;
    mixer = null;
    clock = new THREE.Clock();
  }

  function loadModel(i = 0) {
    ensureScene();
    if (!THREE.FBXLoader) { status('FBXLoader chybí.'); return; }
    if (i >= urls.length) { status('Model se nenačetl z žádné cesty.'); return; }
    status('Zkouším: ' + urls[i]);
    const loader = new THREE.FBXLoader();
    loader.load(urls[i], (fbx) => {
      clearModel();
      modelRoot = new THREE.Group();
      fbx.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      const s = fit(fbx, 2.15);
      modelRoot.add(fbx);
      scene.add(modelRoot);
      const c = Array.isArray(fbx.animations) ? fbx.animations.length : 0;
      status(`Načteno: mesh ${meshes(fbx)}, animace ${c}, scale ${s.toFixed(3)}`);
      if (c > 0) { mixer = new THREE.AnimationMixer(fbx); mixer.clipAction(fbx.animations[0]).reset().play(); }
    }, undefined, () => loadModel(i + 1));
  }

  btn.addEventListener('click', () => { overlay.style.display = 'block'; ensureScene(); status('Připraveno. Klepni na „Načíst model“.'); });
  loadBtn.addEventListener('click', () => loadModel(0));
  closeBtn.addEventListener('click', () => { overlay.style.display = 'none'; });
})();
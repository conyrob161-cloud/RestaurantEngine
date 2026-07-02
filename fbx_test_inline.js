(() => {
  const urls = ['./Smooth_Male_Casual%20(1).fbx', './Smooth_Male_Casual (1).fbx'];

  const btn = document.createElement('button');
  btn.textContent = 'TEST FBX';
  btn.style.cssText = 'position:fixed;top:16px;right:16px;z-index:10000;border:0;border-radius:999px;padding:12px 16px;font:900 14px system-ui;background:#8fe08f;color:#0f172a;box-shadow:0 10px 24px rgba(0,0,0,.28);cursor:pointer';

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;display:none;z-index:9999;background:rgba(9,12,20,.96);overflow:hidden';
  overlay.innerHTML = `
    <div style="position:absolute;left:16px;top:16px;right:16px;max-width:760px;background:rgba(15,23,42,.88);border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:14px 16px;color:#fff;box-shadow:0 12px 30px rgba(0,0,0,.35);backdrop-filter:blur(10px);font:system-ui;pointer-events:auto;">
      <div style="font-size:18px;font-weight:900;margin-bottom:6px;">FBX test</div>
      <div id="fbxStatus" style="font-size:14px;line-height:1.5;">Připraveno.</div>
      <div id="fbxStats" style="font-size:12px;opacity:.72;margin-top:4px;">—</div>
      <div style="font-size:12px;opacity:.72;margin-top:8px;">Soubor: Smooth_Male_Casual (1).fbx</div>
      <div style="font-size:12px;opacity:.72;margin-top:2px;">Táhni prstem pro otáčení. Tlačítka níže fungují i když gesta zlobí.</div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;align-items:center;">
        <button id="fbxLoad" style="border:0;border-radius:999px;padding:10px 14px;font-weight:800;background:#ffd166;color:#111827;cursor:pointer;">Načíst model</button>
        <button id="fbxFit" style="border:0;border-radius:999px;padding:10px 14px;font-weight:800;background:#60a5fa;color:#111827;cursor:pointer;">Vycentrovat</button>
        <button id="fbxReset" style="border:0;border-radius:999px;padding:10px 14px;font-weight:800;background:#e5e7eb;color:#111827;cursor:pointer;">Reset kamery</button>
        <button id="fbxLeft" style="border:0;border-radius:999px;padding:10px 14px;font-weight:800;background:#e5e7eb;color:#111827;cursor:pointer;">←</button>
        <button id="fbxRight" style="border:0;border-radius:999px;padding:10px 14px;font-weight:800;background:#e5e7eb;color:#111827;cursor:pointer;">→</button>
        <button id="fbxUp" style="border:0;border-radius:999px;padding:10px 14px;font-weight:800;background:#e5e7eb;color:#111827;cursor:pointer;">↑</button>
        <button id="fbxDown" style="border:0;border-radius:999px;padding:10px 14px;font-weight:800;background:#e5e7eb;color:#111827;cursor:pointer;">↓</button>
        <button id="fbxZoomOut" style="border:0;border-radius:999px;padding:10px 14px;font-weight:800;background:#e5e7eb;color:#111827;cursor:pointer;">−</button>
        <button id="fbxZoomIn" style="border:0;border-radius:999px;padding:10px 14px;font-weight:800;background:#e5e7eb;color:#111827;cursor:pointer;">+</button>
        <button id="fbxClose" style="border:0;border-radius:999px;padding:10px 14px;font-weight:800;background:#e5e7eb;color:#111827;cursor:pointer;">Zpět do hry</button>
      </div>
    </div>
    <div id="fbxMount" style="position:absolute;inset:0;touch-action:none;pointer-events:auto;"></div>`;
  document.body.append(btn, overlay);

  const statusEl = overlay.querySelector('#fbxStatus');
  const statsEl = overlay.querySelector('#fbxStats');
  const loadBtn = overlay.querySelector('#fbxLoad');
  const fitBtn = overlay.querySelector('#fbxFit');
  const resetBtn = overlay.querySelector('#fbxReset');
  const leftBtn = overlay.querySelector('#fbxLeft');
  const rightBtn = overlay.querySelector('#fbxRight');
  const upBtn = overlay.querySelector('#fbxUp');
  const downBtn = overlay.querySelector('#fbxDown');
  const zoomOutBtn = overlay.querySelector('#fbxZoomOut');
  const zoomInBtn = overlay.querySelector('#fbxZoomIn');
  const closeBtn = overlay.querySelector('#fbxClose');
  const mount = overlay.querySelector('#fbxMount');

  let renderer = null;
  let scene = null;
  let camera = null;
  let modelRoot = null;
  let mixer = null;
  let clock = new THREE.Clock();
  let started = false;

  const orbit = {
    target: new THREE.Vector3(0, 1.2, 0),
    theta: Math.PI * 0.25,
    phi: Math.PI * 0.43,
    radius: 6.4,
    minRadius: 0.8,
    maxRadius: 60,
  };

  const pointer = { dragging: false, lastX: 0, lastY: 0 };
  const modelMeta = { meshes: 0, clips: 0, scale: 1 };

  const status = (t) => { statusEl.textContent = t; };
  const stats = () => { statsEl.textContent = `Meshes: ${modelMeta.meshes} | Animace: ${modelMeta.clips} | Scale: ${modelMeta.scale.toFixed(3)} | Radius: ${orbit.radius.toFixed(2)} | θ ${orbit.theta.toFixed(2)} | φ ${orbit.phi.toFixed(2)}`; };
  const countMeshes = (root) => { let n = 0; root.traverse((o) => { if (o.isMesh) n += 1; }); return n; };

  const fitModel = (model, h = 2.0) => {
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const s = size.y > 0 ? h / size.y : 1;
    model.scale.setScalar(s);
    model.position.set(-center.x * s, -box.min.y * s, -center.z * s);
    modelMeta.meshes = countMeshes(model);
    modelMeta.clips = Array.isArray(model.animations) ? model.animations.length : 0;
    modelMeta.scale = s;
    orbit.target.set(0, Math.max(0.75, size.y * 0.45 * s), 0);
    orbit.radius = Math.max(3.5, Math.max(size.x, size.y, size.z) * s * 1.7);
    orbit.theta = Math.PI * 0.25;
    orbit.phi = Math.PI * 0.42;
    stats();
    return s;
  };

  function updateCamera() {
    if (!camera) return;
    orbit.phi = Math.min(Math.PI - 0.001, Math.max(0.001, orbit.phi));
    orbit.radius = Math.min(orbit.maxRadius, Math.max(orbit.minRadius, orbit.radius));
    const sinPhiRadius = Math.sin(orbit.phi) * orbit.radius;
    camera.position.set(
      orbit.target.x + sinPhiRadius * Math.sin(orbit.theta),
      orbit.target.y + Math.cos(orbit.phi) * orbit.radius,
      orbit.target.z + sinPhiRadius * Math.cos(orbit.theta)
    );
    camera.lookAt(orbit.target);
    stats();
  }

  function fitCameraToModel() {
    if (!modelRoot || !camera) return;
    const box = new THREE.Box3().setFromObject(modelRoot);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    orbit.target.copy(center);
    const maxDim = Math.max(size.x, size.y, size.z);
    orbit.radius = Math.max(3.2, maxDim * 2.1);
    orbit.theta = Math.PI * 0.25;
    orbit.phi = Math.PI * 0.42;
    updateCamera();
    status(`Vycentrováno: ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}`);
  }

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
    const dir = new THREE.DirectionalLight(0xffffff, 1.9);
    dir.position.set(4, 8, 5);
    scene.add(dir);

    const floor = new THREE.Mesh(new THREE.CircleGeometry(2.4, 48), new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.07, 10, 28), new THREE.MeshStandardMaterial({ color: 0x8fe08f, emissive: 0x163016, roughness: 0.5 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.05;
    scene.add(ring);

    const resize = () => {
      const w = mount.clientWidth || window.innerWidth;
      const h = mount.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);

    const startDrag = (e) => {
      pointer.dragging = true;
      pointer.lastX = e.clientX;
      pointer.lastY = e.clientY;
      e.preventDefault();
    };
    const moveDrag = (e) => {
      if (!pointer.dragging) return;
      const dx = e.clientX - pointer.lastX;
      const dy = e.clientY - pointer.lastY;
      pointer.lastX = e.clientX;
      pointer.lastY = e.clientY;
      orbit.theta -= dx * 0.006;
      orbit.phi -= dy * 0.005;
      updateCamera();
    };
    const endDrag = () => { pointer.dragging = false; };
    mount.addEventListener('pointerdown', startDrag);
    mount.addEventListener('pointermove', moveDrag);
    mount.addEventListener('pointerup', endDrag);
    mount.addEventListener('pointercancel', endDrag);
    window.addEventListener('pointerup', endDrag);

    mount.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        pointer.dragging = true;
        pointer.lastX = e.touches[0].clientX;
        pointer.lastY = e.touches[0].clientY;
      }
    }, { passive: true });
    mount.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1 && pointer.dragging) {
        e.preventDefault();
        const t = e.touches[0];
        const dx = t.clientX - pointer.lastX;
        const dy = t.clientY - pointer.lastY;
        pointer.lastX = t.clientX;
        pointer.lastY = t.clientY;
        orbit.theta -= dx * 0.006;
        orbit.phi -= dy * 0.005;
        updateCamera();
      }
    }, { passive: false });
    mount.addEventListener('touchend', () => { pointer.dragging = false; }, { passive: true });

    mount.addEventListener('wheel', (e) => {
      e.preventDefault();
      orbit.radius *= e.deltaY > 0 ? 1.08 : 0.92;
      updateCamera();
    }, { passive: false });

    if (!started) {
      started = true;
      const animate = () => {
        requestAnimationFrame(animate);
        if (!renderer) return;
        const dt = clock.getDelta();
        if (mixer) mixer.update(dt);
        if (modelRoot) modelRoot.rotation.y += 0.006;
        updateCamera();
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
    modelMeta.meshes = 0;
    modelMeta.clips = 0;
    modelMeta.scale = 1;
    stats();
  }

  function loadModel(i = 0) {
    ensureScene();
    if (!THREE.FBXLoader) { status('FBXLoader chybí.'); return; }
    if (i >= urls.length) { status('Model se nenačetl z žádné cesty.'); return; }

    status('Zkouším: ' + urls[i]);
    const loader = new THREE.FBXLoader();
    loader.load(
      urls[i],
      (fbx) => {
        clearModel();
        modelRoot = new THREE.Group();
        fbx.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        const scale = fitModel(fbx, 2.15);
        modelRoot.add(fbx);
        scene.add(modelRoot);

        const clipCount = Array.isArray(fbx.animations) ? fbx.animations.length : 0;
        status(`Načteno: mesh ${modelMeta.meshes}, animace ${clipCount}, scale ${scale.toFixed(3)} | táhni nebo použij tlačítka`);
        if (clipCount > 0) {
          mixer = new THREE.AnimationMixer(fbx);
          mixer.clipAction(fbx.animations[0]).reset().play();
        }
        fitCameraToModel();
      },
      undefined,
      () => loadModel(i + 1)
    );
  }

  btn.addEventListener('click', () => {
    overlay.style.display = 'block';
    ensureScene();
    status('Připraveno. Klepni na „Načíst model“.');
    stats();
  });
  loadBtn.addEventListener('click', () => loadModel(0));
  fitBtn.addEventListener('click', () => fitCameraToModel());
  resetBtn.addEventListener('click', () => { orbit.theta = Math.PI * 0.25; orbit.phi = Math.PI * 0.42; updateCamera(); status('Kamera resetována'); });
  leftBtn.addEventListener('click', () => { orbit.theta -= 0.12; updateCamera(); });
  rightBtn.addEventListener('click', () => { orbit.theta += 0.12; updateCamera(); });
  upBtn.addEventListener('click', () => { orbit.phi -= 0.08; updateCamera(); });
  downBtn.addEventListener('click', () => { orbit.phi += 0.08; updateCamera(); });
  zoomOutBtn.addEventListener('click', () => { orbit.radius *= 1.12; updateCamera(); });
  zoomInBtn.addEventListener('click', () => { orbit.radius *= 0.88; updateCamera(); });
  closeBtn.addEventListener('click', () => { overlay.style.display = 'none'; });
})();
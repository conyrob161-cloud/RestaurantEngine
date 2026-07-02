(() => {
  const urls = ['./Smooth_Male_Casual%20(1).fbx', './Smooth_Male_Casual (1).fbx'];

  const btn = document.createElement('button');
  btn.textContent = 'TEST FBX';
  btn.style.cssText = 'position:fixed;top:16px;right:16px;z-index:10000;border:0;border-radius:999px;padding:12px 16px;font:900 14px system-ui;background:#8fe08f;color:#0f172a;box-shadow:0 10px 24px rgba(0,0,0,.28);cursor:pointer';

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;display:none;z-index:9999;background:rgba(9,12,20,.96);overflow:hidden';
  overlay.innerHTML = `
    <div style="position:absolute;left:16px;top:16px;right:16px;max-width:620px;background:rgba(15,23,42,.88);border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:14px 16px;color:#fff;box-shadow:0 12px 30px rgba(0,0,0,.35);backdrop-filter:blur(10px);font:system-ui;">
      <div style="font-size:18px;font-weight:900;margin-bottom:6px;">FBX test</div>
      <div id="fbxStatus" style="font-size:14px;line-height:1.5;">Připraveno.</div>
      <div style="font-size:12px;opacity:.72;margin-top:8px;">Soubor: Smooth_Male_Casual (1).fbx</div>
      <div style="font-size:12px;opacity:.72;margin-top:2px;">Táhni prstem pro otáčení, kolečkem nebo tlačítky pro zoom. Dvojitý stisk na tlačítku načtení model znovu vycentruje.</div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;align-items:center;">
        <button id="fbxLoad" style="border:0;border-radius:999px;padding:10px 14px;font-weight:800;background:#ffd166;color:#111827;cursor:pointer;">Načíst model</button>
        <button id="fbxFit" style="border:0;border-radius:999px;padding:10px 14px;font-weight:800;background:#60a5fa;color:#111827;cursor:pointer;">Vycentrovat</button>
        <button id="fbxZoomOut" style="border:0;border-radius:999px;padding:10px 14px;font-weight:800;background:#e5e7eb;color:#111827;cursor:pointer;">−</button>
        <button id="fbxZoomIn" style="border:0;border-radius:999px;padding:10px 14px;font-weight:800;background:#e5e7eb;color:#111827;cursor:pointer;">+</button>
        <button id="fbxClose" style="border:0;border-radius:999px;padding:10px 14px;font-weight:800;background:#e5e7eb;color:#111827;cursor:pointer;">Zpět do hry</button>
      </div>
    </div>
    <div id="fbxMount" style="position:absolute;inset:0;touch-action:none;"></div>`;
  document.body.append(btn, overlay);

  const statusEl = overlay.querySelector('#fbxStatus');
  const loadBtn = overlay.querySelector('#fbxLoad');
  const fitBtn = overlay.querySelector('#fbxFit');
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
    minRadius: 1.2,
    maxRadius: 20,
  };

  let modelInfo = {
    box: null,
    center: new THREE.Vector3(),
    size: new THREE.Vector3(),
    scale: 1,
  };

  const pointer = {
    dragging: false,
    lastX: 0,
    lastY: 0,
    pinchDist: 0,
  };

  const status = (t) => { statusEl.textContent = t; };
  const meshes = (root) => { let n = 0; root.traverse((o) => { if (o.isMesh) n++; }); return n; };

  const fit = (model, h = 2.0) => {
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const s = size.y > 0 ? h / size.y : 1;
    model.scale.setScalar(s);
    model.position.set(-center.x * s, -box.min.y * s, -center.z * s);
    modelInfo = { box, center, size, scale: s };
    orbit.target.set(0, Math.max(0.75, size.y * 0.45 * s), 0);
    orbit.radius = Math.max(3.5, Math.max(size.x, size.y, size.z) * s * 1.7);
    orbit.theta = Math.PI * 0.25;
    orbit.phi = Math.PI * 0.42;
    return s;
  };

  function updateCamera() {
    if (!camera) return;
    const eps = 0.001;
    const phi = Math.min(Math.PI - eps, Math.max(eps, orbit.phi));
    orbit.phi = phi;
    orbit.radius = Math.min(orbit.maxRadius, Math.max(orbit.minRadius, orbit.radius));

    const sinPhiRadius = Math.sin(phi) * orbit.radius;
    camera.position.set(
      orbit.target.x + sinPhiRadius * Math.sin(orbit.theta),
      orbit.target.y + Math.cos(phi) * orbit.radius,
      orbit.target.z + sinPhiRadius * Math.cos(orbit.theta)
    );
    camera.lookAt(orbit.target);
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
    orbit.radius = Math.max(3.2, maxDim * 1.9);
    orbit.theta = Math.PI * 0.25;
    orbit.phi = Math.PI * 0.42;
    updateCamera();
    status(`Vycentrováno: velikost ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}`);
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

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(2.4, 48),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.95 })
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.15, 0.07, 10, 28),
      new THREE.MeshStandardMaterial({ color: 0x8fe08f, emissive: 0x163016, roughness: 0.5 })
    );
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

    mount.addEventListener('pointerdown', (e) => {
      pointer.dragging = true;
      pointer.lastX = e.clientX;
      pointer.lastY = e.clientY;
      mount.setPointerCapture?.(e.pointerId);
    });

    mount.addEventListener('pointermove', (e) => {
      if (!pointer.dragging) return;
      const dx = e.clientX - pointer.lastX;
      const dy = e.clientY - pointer.lastY;
      pointer.lastX = e.clientX;
      pointer.lastY = e.clientY;
      orbit.theta -= dx * 0.006;
      orbit.phi -= dy * 0.005;
      updateCamera();
    });

    const endDrag = () => { pointer.dragging = false; pointer.pinchDist = 0; };
    mount.addEventListener('pointerup', endDrag);
    mount.addEventListener('pointercancel', endDrag);
    mount.addEventListener('pointerleave', endDrag);

    mount.addEventListener('wheel', (e) => {
      e.preventDefault();
      const scale = e.deltaY > 0 ? 1.08 : 0.92;
      orbit.radius *= scale;
      updateCamera();
    }, { passive: false });

    mount.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pointer.pinchDist = Math.hypot(dx, dy);
      }
    }, { passive: true });

    mount.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        if (pointer.pinchDist > 0) {
          const factor = pointer.pinchDist / dist;
          orbit.radius *= factor;
          updateCamera();
        }
        pointer.pinchDist = dist;
      }
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
  }

  function loadModel(i = 0) {
    ensureScene();
    if (!THREE.FBXLoader) {
      status('FBXLoader chybí.');
      return;
    }
    if (i >= urls.length) {
      status('Model se nenačetl z žádné cesty.');
      return;
    }

    status('Zkouším: ' + urls[i]);
    const loader = new THREE.FBXLoader();
    loader.load(
      urls[i],
      (fbx) => {
        clearModel();
        modelRoot = new THREE.Group();
        fbx.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        const s = fit(fbx, 2.15);
        modelRoot.add(fbx);
        scene.add(modelRoot);

        const c = Array.isArray(fbx.animations) ? fbx.animations.length : 0;
        status(`Načteno: mesh ${meshes(fbx)}, animace ${c}, scale ${s.toFixed(3)} | táhni pro otáčení, +/− pro zoom`);
        if (c > 0) {
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
  });
  loadBtn.addEventListener('click', () => loadModel(0));
  fitBtn.addEventListener('click', () => fitCameraToModel());
  zoomOutBtn.addEventListener('click', () => { orbit.radius *= 1.12; updateCamera(); });
  zoomInBtn.addEventListener('click', () => { orbit.radius *= 0.88; updateCamera(); });
  closeBtn.addEventListener('click', () => { overlay.style.display = 'none'; });
})();
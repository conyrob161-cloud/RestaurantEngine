(() => {
  const THREE_READY = () => !!(window.THREE && THREE.GLTFLoader && THREE.OrbitControls);
  const statusEl = document.getElementById('status');
  const dropHint = document.getElementById('dropHint');
  const clipList = document.getElementById('clipList');
  const speed = document.getElementById('speed');
  const speedLabel = document.getElementById('speedLabel');

  const ui = {
    fileInput: document.getElementById('fileInput'),
    btnReset: document.getElementById('btnReset'),
    btnCenter: document.getElementById('btnCenter'),
    btnPlay: document.getElementById('btnPlay'),
    btnPause: document.getElementById('btnPause'),
    chkGrid: document.getElementById('chkGrid'),
    chkAxes: document.getElementById('chkAxes'),
    chkWire: document.getElementById('chkWire'),
    chkSkeleton: document.getElementById('chkSkeleton'),
    chkAutoRotate: document.getElementById('chkAutoRotate'),
    chkEnv: document.getElementById('chkEnv'),
    stMeshes: document.getElementById('stMeshes'),
    stMats: document.getElementById('stMats'),
    stVerts: document.getElementById('stVerts'),
    stFaces: document.getElementById('stFaces'),
    stBones: document.getElementById('stBones'),
    stClips: document.getElementById('stClips'),
  };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1020);
  scene.fog = new THREE.Fog(0x0b1020, 30, 180);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 5000);
  camera.position.set(2.6, 2.0, 3.6);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  document.getElementById('viewport').appendChild(renderer.domElement);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 1, 0);
  controls.autoRotate = false;

  const ambient = new THREE.AmbientLight(0xffffff, 0.35);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0xeaf3ff, 0x1b2740, 1.8);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(5, 8, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x8cc8ff, 0.9);
  rim.position.set(-6, 2, -4);
  scene.add(rim);

  const grid = new THREE.GridHelper(20, 20, 0x4f6487, 0x2d3850);
  scene.add(grid);

  const axes = new THREE.AxesHelper(2);
  axes.visible = false;
  scene.add(axes);

  const clock = new THREE.Clock();
  const loader = new THREE.GLTFLoader();

  let root = null;
  let mixer = null;
  let actions = [];
  let clips = [];
  let activeClip = -1;
  let skeletonHelper = null;
  let originalMaterials = new Map();
  let currentUrl = null;
  let playing = true;

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function resize() {
    const w = document.getElementById('viewport').clientWidth || window.innerWidth;
    const h = document.getElementById('viewport').clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  function fmt(n) {
    return Number(n || 0).toLocaleString('cs-CZ');
  }

  function updateStats() {
    let meshes = 0;
    let mats = new Set();
    let verts = 0;
    let faces = 0;
    let bones = 0;

    if (root) {
      root.traverse((o) => {
        if (!(o && (o.isMesh || o.isSkinnedMesh))) return;
        meshes += 1;
        const geom = o.geometry;
        if (geom) {
          const pos = geom.getAttribute ? geom.getAttribute('position') : null;
          if (pos) verts += pos.count;
          if (geom.index) faces += geom.index.count / 3;
          else if (pos) faces += pos.count / 3;
        }
        const mm = Array.isArray(o.material) ? o.material : [o.material];
        mm.forEach((m) => m && mats.add(m));
        if (o.isSkinnedMesh && o.skeleton && o.skeleton.bones) bones = Math.max(bones, o.skeleton.bones.length);
      });
    }

    ui.stMeshes.textContent = fmt(meshes);
    ui.stMats.textContent = fmt(mats.size);
    ui.stVerts.textContent = fmt(verts);
    ui.stFaces.textContent = fmt(Math.round(faces));
    ui.stBones.textContent = fmt(bones);
    ui.stClips.textContent = fmt(clips.length);
  }

  function clearScene() {
    if (root) scene.remove(root);
    if (skeletonHelper) scene.remove(skeletonHelper);
    root = null;
    mixer = null;
    actions = [];
    clips = [];
    activeClip = -1;
    skeletonHelper = null;
    originalMaterials = new Map();
    clipList.innerHTML = '<div class="empty">Zatím žádná animace.</div>';
    updateStats();
  }

  function fitCameraToObject(object3D) {
    const box = new THREE.Box3().setFromObject(object3D);
    if (box.isEmpty()) return;

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxSize = Math.max(size.x, size.y, size.z);
    const fitDistance = maxSize / (2 * Math.tan((Math.PI * camera.fov) / 360));
    const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();

    controls.target.copy(center);
    camera.position.copy(center.clone().add(dir.multiplyScalar(Math.max(fitDistance * 1.4, 2.5))));
    camera.near = Math.max(maxSize / 100, 0.01);
    camera.far = Math.max(maxSize * 100, 5000);
    camera.updateProjectionMatrix();
    controls.update();
  }

  function centerModel(object3D) {
    const box = new THREE.Box3().setFromObject(object3D);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    object3D.position.sub(center);
  }

  function resetCamera() {
    if (!root) return;
    fitCameraToObject(root);
    setStatus('Kamera resetována');
  }

  function setWireframe(enabled) {
    if (!root) return;
    root.traverse((o) => {
      if (!(o && (o.isMesh || o.isSkinnedMesh))) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((mat) => {
        if (!mat) return;
        if (enabled) {
          if (!originalMaterials.has(mat)) originalMaterials.set(mat, mat.clone ? mat.clone() : mat);
          mat.wireframe = true;
          mat.needsUpdate = true;
        } else {
          const orig = originalMaterials.get(mat);
          mat.wireframe = orig && typeof orig.wireframe === 'boolean' ? orig.wireframe : false;
          mat.needsUpdate = true;
        }
      });
    });
  }

  function setSkeleton(enabled) {
    if (!root) return;
    if (skeletonHelper) skeletonHelper.visible = enabled;
    if (!skeletonHelper) {
      let skinned = null;
      root.traverse((o) => {
        if (!skinned && o.isSkinnedMesh) skinned = o;
      });
      if (skinned) {
        skeletonHelper = new THREE.SkeletonHelper(skinned);
        skeletonHelper.visible = enabled;
        scene.add(skeletonHelper);
      }
    }
  }

  function buildClipList() {
    if (!clips.length) {
      clipList.innerHTML = '<div class="empty">Zatím žádná animace.</div>';
      return;
    }

    clipList.innerHTML = '';
    clips.forEach((clip, index) => {
      const item = document.createElement('div');
      item.className = 'clip' + (index === activeClip ? ' active' : '');
      item.innerHTML = `<div><div class="name"></div><div class="dur"></div></div><div class="play">▶</div>`;
      item.querySelector('.name').textContent = clip.name || `Animation ${index + 1}`;
      item.querySelector('.dur').textContent = `Délka ${clip.duration.toFixed(2)} s`;
      item.addEventListener('click', () => playClip(index));
      clipList.appendChild(item);
    });
  }

  function refreshClipUI() {
    [...clipList.querySelectorAll('.clip')].forEach((el, idx) => {
      el.classList.toggle('active', idx === activeClip);
    });
  }

  function playClip(index) {
    if (!mixer || !actions[index]) return;
    actions.forEach((a) => a.stop());
    actions[index].reset().play();
    activeClip = index;
    refreshClipUI();
    setStatus(`Přehrávám: ${clips[index].name || `Animation ${index + 1}`}`);
    playing = true;
  }

  function pauseAll() {
    if (mixer) mixer.timeScale = 0;
    playing = false;
    setStatus('Pozastaveno');
  }

  function playAll() {
    if (mixer) mixer.timeScale = parseFloat(speed.value);
    playing = true;
    setStatus('Přehrává se');
  }

  function applyEnv(enabled) {
    ambient.visible = enabled;
    hemi.visible = enabled;
    key.visible = enabled;
    rim.visible = enabled;
  }

  function loadModel(url, label = url) {
    if (!url) return;
    clearScene();
    setStatus(`Načítám ${label}…`);

    loader.load(
      url,
      (gltf) => {
        root = gltf.scene || gltf.scenes[0];
        scene.add(root);
        clips = gltf.animations || [];

        if (clips.length) {
          mixer = new THREE.AnimationMixer(root);
          actions = clips.map((clip) => mixer.clipAction(clip));
          buildClipList();
          playClip(0);
        } else {
          buildClipList();
        }

        centerModel(root);
        fitCameraToObject(root);
        setWireframe(ui.chkWire.checked);
        setSkeleton(ui.chkSkeleton.checked);
        applyEnv(ui.chkEnv.checked);
        updateStats();
        setStatus(`Načteno: ${label}`);
      },
      (evt) => {
        if (evt && evt.total) {
          const pct = Math.round((evt.loaded / evt.total) * 100);
          setStatus(`Načítám ${label}… ${pct}%`);
        }
      },
      (err) => {
        console.error(err);
        setStatus('Chyba při načítání modelu');
      }
    );
  }

  function loadFromFile(file) {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith('.glb') && !name.endsWith('.gltf')) {
      setStatus('Vyber .glb nebo .gltf');
      return;
    }
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = URL.createObjectURL(file);
    loadModel(currentUrl, file.name);
  }

  function playFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const model = params.get('model');
    const autoplay = params.get('autoplay');
    if (model) {
      loadModel(model, model.split('/').pop() || model);
      if (autoplay === '0') pauseAll();
    }
  }

  ui.fileInput.addEventListener('change', (e) => {
    loadFromFile(e.target.files && e.target.files[0]);
  });

  ui.btnReset.addEventListener('click', resetCamera);
  ui.btnCenter.addEventListener('click', () => { if (root) { centerModel(root); fitCameraToObject(root); setStatus('Model vycentrován'); } });
  ui.btnPlay.addEventListener('click', () => { if (activeClip >= 0) playClip(activeClip); else playAll(); });
  ui.btnPause.addEventListener('click', pauseAll);

  ui.chkGrid.addEventListener('change', () => { grid.visible = ui.chkGrid.checked; });
  ui.chkAxes.addEventListener('change', () => { axes.visible = ui.chkAxes.checked; });
  ui.chkWire.addEventListener('change', () => { setWireframe(ui.chkWire.checked); });
  ui.chkSkeleton.addEventListener('change', () => { setSkeleton(ui.chkSkeleton.checked); });
  ui.chkAutoRotate.addEventListener('change', () => { controls.autoRotate = ui.chkAutoRotate.checked; });
  ui.chkEnv.addEventListener('change', () => { applyEnv(ui.chkEnv.checked); });

  speed.addEventListener('input', () => {
    speedLabel.textContent = `Speed ${parseFloat(speed.value).toFixed(1)}×`;
    if (mixer) mixer.timeScale = playing ? parseFloat(speed.value) : 0;
  });

  function bindDropEvents() {
    ['dragenter', 'dragover'].forEach((evt) => {
      window.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropHint.style.display = 'flex';
      });
    });
    ['dragleave', 'drop'].forEach((evt) => {
      window.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropHint.style.display = 'none';
      });
    });
    window.addEventListener('drop', (e) => {
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) loadFromFile(file);
    });
  }

  window.addEventListener('resize', resize);
  bindDropEvents();
  resize();
  playFromQuery();

  if (!THREE_READY()) {
    setStatus('Knihovny se ještě nenačetly');
  } else {
    setStatus('Připraveno');
  }

  function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    if (mixer && playing && mixer.timeScale !== 0) mixer.update(delta);
    if (skeletonHelper && skeletonHelper.visible) skeletonHelper.update();
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  window.__modelViewer = {
    loadModel,
    loadFromFile,
    resetCamera,
    scene,
    camera,
    renderer,
    controls,
  };
})();

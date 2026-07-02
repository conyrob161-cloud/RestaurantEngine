(() => {
  const MODEL_URLS = [
    'https://raw.githubusercontent.com/conyrob161-cloud/RestaurantEngine/main/Character%20Base.glb',
    './Character%20Base.glb',
    './Character Base.glb'
  ];

  let template = null;
  let injected = false;

  function makeLabelSprite(text, bg = '#111827', fg = '#ffffff') {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const ctx = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;

    const roundRect = (x, y, w, h, r) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    };

    const draw = (value) => {
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.fillStyle = bg;
      roundRect(24, 44, 464, 168, 32);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.fillStyle = fg;
      ctx.font = '900 52px system-ui, Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(value, 256, 128);
      tex.needsUpdate = true;
    };

    draw(text);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.scale.set(2.6, 1.0, 1);
    return { sprite, draw };
  }

  function tryInject(scene) {
    if (!template || injected || !scene) return;
    injected = true;

    const group = new THREE.Group();
    group.name = 'model_scene_probe';
    group.position.set(10, 0, 12.8);
    group.rotation.y = Math.PI * 0.45;

    const clone = template.clone(true);
    clone.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const targetHeight = 1.9;
    const scale = size.y > 0 ? targetHeight / size.y : 1;
    clone.scale.setScalar(scale);
    clone.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);

    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.78, 0.78, 0.08, 12),
      new THREE.MeshStandardMaterial({ color: 0x3b4d7a, roughness: 0.92 })
    );
    pad.position.y = 0.04;
    group.add(pad);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.86, 0.05, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0x8fe08f, emissive: 0x1d3f1d, roughness: 0.5 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.12;
    group.add(ring);

    group.add(clone);

    const label = makeLabelSprite('CHARACTER BASE TEST', '#111827', '#ffffff');
    label.sprite.position.set(0, 2.45, 0);
    group.add(label.sprite);

    scene.add(group);
    console.log('Character Base.glb injected into scene');
  }

  function loadTemplate(index = 0) {
    if (index >= MODEL_URLS.length) {
      console.warn('Character Base.glb load failed from all URLs.');
      return;
    }
    const loader = new THREE.GLTFLoader();
    loader.load(
      MODEL_URLS[index],
      (gltf) => {
        template = gltf.scene || gltf.scenes?.[0] || null;
        if (!template) return;
        template.updateMatrixWorld(true);
      },
      undefined,
      () => loadTemplate(index + 1)
    );
  }

  const originalRender = THREE.WebGLRenderer.prototype.render;
  THREE.WebGLRenderer.prototype.render = function patchedRender(scene, camera) {
    if (template && !injected) tryInject(scene);
    return originalRender.call(this, scene, camera);
  };

  loadTemplate();
})();
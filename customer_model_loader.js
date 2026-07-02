(() => {
  console.log('[FBX TEST] customer_model_loader.js loaded');

  const MODEL_URLS = [
    './Smooth_Male_Casual%20(1).fbx',
    './Smooth_Male_Casual (1).fbx',
  ];

  const sceneState = {
    template: null,
    probe: null,
    statusLabel: null,
    statusText: 'FBX TEST: loading…',
    injected: false,
  };

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
      ctx.font = '900 50px system-ui, Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(value, 256, 128);
      tex.needsUpdate = true;
    };

    draw(text);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.scale.set(3.4, 1.3, 1);
    return { sprite, draw };
  }

  function countMeshes(root) {
    let count = 0;
    root.traverse((obj) => {
      if (obj.isMesh) count += 1;
    });
    return count;
  }

  function updateStatus(text) {
    sceneState.statusText = text;
    if (sceneState.statusLabel) sceneState.statusLabel.draw(text);
  }

  function makeProbe(scene) {
    if (sceneState.injected || !sceneState.template || !scene) return;
    sceneState.injected = true;

    const group = new THREE.Group();
    group.name = 'fbx_diagnostic_probe';
    group.position.set(10, 0, 12.8);
    group.rotation.y = Math.PI * 0.45;

    const clone = sceneState.template.clone(true);
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
    const scale = size.y > 0 ? 2.2 / size.y : 1;
    clone.scale.setScalar(scale);
    clone.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    group.add(clone);

    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 0.95, 0.08, 12),
      new THREE.MeshStandardMaterial({ color: 0x3b4d7a, roughness: 0.92 })
    );
    pad.position.y = 0.04;
    group.add(pad);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.05, 0.06, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0x8fe08f, emissive: 0x1d3f1d, roughness: 0.5 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.12;
    group.add(ring);

    const label = makeLabelSprite(sceneState.statusText, '#111827', '#ffffff');
    label.sprite.position.set(0, 2.8, 0);
    group.add(label.sprite);
    sceneState.statusLabel = label;

    scene.add(group);
    sceneState.probe = group;
    console.log('[FBX TEST] probe injected into scene', { meshCount: countMeshes(clone), animationCount: sceneState.template.animations?.length || 0, scale });
  }

  function loadModel(index = 0) {
    if (index >= MODEL_URLS.length) {
      console.warn('[FBX TEST] all FBX URLs failed to load');
      updateStatus('FBX FAIL');
      return;
    }

    if (!THREE.FBXLoader) {
      console.error('[FBX TEST] THREE.FBXLoader is missing');
      updateStatus('FBX LOADER MISSING');
      return;
    }

    console.log('[FBX TEST] trying', MODEL_URLS[index]);
    const loader = new THREE.FBXLoader();
    loader.load(
      MODEL_URLS[index],
      (fbx) => {
        sceneState.template = fbx;
        const meshes = countMeshes(fbx);
        const clips = Array.isArray(fbx.animations) ? fbx.animations.length : 0;
        console.log('[FBX TEST] loaded', { meshes, clips, name: fbx.name || '(unnamed)' });
        updateStatus(`FBX OK  M${meshes} A${clips}`);
      },
      undefined,
      (err) => {
        console.warn('[FBX TEST] load failed for', MODEL_URLS[index], err);
        loadModel(index + 1);
      }
    );
  }

  const originalRender = THREE.WebGLRenderer.prototype.render;
  THREE.WebGLRenderer.prototype.render = function patchedRender(scene, camera) {
    if (sceneState.template) makeProbe(scene);
    return originalRender.call(this, scene, camera);
  };

  loadModel();
})();
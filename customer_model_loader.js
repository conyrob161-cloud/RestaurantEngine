(() => {
  const MODEL_URL = './Smooth_Male_Casual%20(1).fbx';
  const customerRoots = new Set();
  const rootToMixer = new WeakMap();
  const rootToModel = new WeakMap();
  const originalAdd = THREE.Object3D.prototype.add;
  const clock = new THREE.Clock();
  let template = null;
  let templateAnimations = [];
  let probeAdded = false;

  function hideOldParts(root) {
    for (const child of root.children) {
      if (child.isSprite) continue;
      if (child.geometry?.type === 'CircleGeometry') continue;
      child.visible = false;
    }
  }

  function fitToHeight(model, targetHeight = 1.8) {
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const scale = size.y > 0 ? targetHeight / size.y : 1;
    model.scale.setScalar(scale);
    model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    return scale;
  }

  function createLabelSprite(text, bg = '#111827', fg = '#ffffff') {
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
    sprite.scale.set(2.7, 1.05, 1);
    return { sprite, draw };
  }

  function attachFBX(root) {
    if (!template || rootToModel.has(root)) return;
    hideOldParts(root);

    const model = template.clone(true);
    model.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    fitToHeight(model, 1.8);
    root.add(model);
    rootToModel.set(root, model);

    if (templateAnimations.length) {
      const mixer = new THREE.AnimationMixer(model);
      const clip = templateAnimations[0];
      const action = mixer.clipAction(clip);
      action.reset().play();
      rootToMixer.set(root, mixer);
    }
  }

  function addProbe(scene) {
    if (!template || probeAdded || !scene) return;
    probeAdded = true;

    const group = new THREE.Group();
    group.name = 'fbx_model_probe';
    group.position.set(10, 0, 12.8);
    group.rotation.y = Math.PI * 0.45;

    const model = template.clone(true);
    model.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    fitToHeight(model, 2.0);
    group.add(model);

    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.8, 0.08, 12),
      new THREE.MeshStandardMaterial({ color: 0x3b4d7a, roughness: 0.92 })
    );
    pad.position.y = 0.04;
    group.add(pad);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.88, 0.05, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0x8fe08f, emissive: 0x1d3f1d, roughness: 0.5 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.12;
    group.add(ring);

    const label = createLabelSprite('FBX MODEL TEST', '#111827', '#ffffff');
    label.sprite.position.set(0, 2.45, 0);
    group.add(label.sprite);

    scene.add(group);
  }

  THREE.Object3D.prototype.add = function patchedAdd(...objs) {
    for (const obj of objs) {
      if (obj && obj.userData && obj.userData.type === 'customer') {
        customerRoots.add(obj);
        attachFBX(obj);
      }
    }
    return originalAdd.apply(this, objs);
  };

  function loadTemplate(index = 0) {
    if (index >= 2) {
      console.warn('FBX load failed from all URLs.');
      return;
    }
    const urls = [MODEL_URL, './Smooth_Male_Casual (1).fbx'];
    const loader = new THREE.FBXLoader();
    loader.load(
      urls[index],
      (fbx) => {
        template = fbx;
        templateAnimations = Array.isArray(fbx.animations) ? fbx.animations : [];
        template.updateMatrixWorld(true);
        for (const root of customerRoots) attachFBX(root);
      },
      undefined,
      () => loadTemplate(index + 1)
    );
  }

  const originalRender = THREE.WebGLRenderer.prototype.render;
  THREE.WebGLRenderer.prototype.render = function patchedRender(scene, camera) {
    if (template) addProbe(scene);
    return originalRender.call(this, scene, camera);
  };

  function tick() {
    const dt = clock.getDelta();
    for (const mixer of rootToMixer.values()) {
      mixer.update(dt);
    }
    requestAnimationFrame(tick);
  }

  loadTemplate();
  requestAnimationFrame(tick);
})();
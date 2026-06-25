(() => {
  const stick = document.getElementById('stick');
  const nub = document.getElementById('nub');
  const app = document.getElementById('app');
  const rendererProto = THREE.WebGLRenderer.prototype;
  const originalRender = rendererProto.render;

  stick.style.position = 'fixed';
  stick.style.left = '0px';
  stick.style.top = '0px';
  stick.style.transform = 'translate(-9999px,-9999px)';
  stick.style.opacity = '0';
  stick.style.pointerEvents = 'auto';
  stick.style.transition = 'opacity 120ms ease';
  stick.style.zIndex = '50';

  function isUiTarget(target) {
    return !!target.closest('.hud, .top-actions, .footer, button');
  }

  function forward(type, e) {
    const evt = new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: e.pointerId,
      pointerType: e.pointerType || 'touch',
      clientX: e.clientX,
      clientY: e.clientY,
      pressure: e.pressure || 0.5,
      isPrimary: true,
    });
    stick.dispatchEvent(evt);
  }

  function showStick(x, y) {
    stick.style.left = `${x}px`;
    stick.style.top = `${y}px`;
    stick.style.transform = 'translate(-50%, -50%)';
    stick.style.opacity = '1';
  }

  function hideStick() {
    stick.style.opacity = '0';
    stick.style.transform = 'translate(-9999px,-9999px)';
    nub.style.transform = 'translate(-50%, -50%)';
  }

  let activePointer = null;

  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    if (e.clientX > window.innerWidth * 0.58) return;
    if (isUiTarget(e.target)) return;

    activePointer = e.pointerId;
    showStick(e.clientX, e.clientY);
    forward('pointerdown', e);
    e.preventDefault();
  }, { passive: false });

  window.addEventListener('pointermove', (e) => {
    if (activePointer !== e.pointerId) return;
    forward('pointermove', e);
  }, { passive: false });

  function endPointer(e) {
    if (activePointer !== e.pointerId) return;
    forward(e.type, e);
    activePointer = null;
    hideStick();
  }

  window.addEventListener('pointerup', endPointer, { passive: false });
  window.addEventListener('pointercancel', endPointer, { passive: false });

  function findPlayerRoot(scene) {
    let found = null;
    scene.traverse((obj) => {
      if (found || !obj.isMesh || !obj.material || !obj.material.color) return;
      if (obj.material.color.getHex && obj.material.color.getHex() === 0x355d9d) {
        let p = obj;
        while (p.parent && p.parent.parent) p = p.parent;
        found = p;
      }
    });
    return found;
  }

  let playerRoot = null;
  let last = performance.now();

  rendererProto.render = function patchedRender(scene, camera) {
    const now = performance.now();
    const dt = Math.min(0.033, Math.max(0.001, (now - last) / 1000));
    last = now;

    if (!playerRoot || !playerRoot.parent) playerRoot = findPlayerRoot(scene);

    if (playerRoot) {
      const target = new THREE.Vector3(playerRoot.position.x, 0.9, playerRoot.position.z);
      const desired = new THREE.Vector3(target.x + 11.5, 17.5, target.z + 11.5);
      const t = 1 - Math.pow(0.001, dt);
      camera.position.lerp(desired, t);
      camera.lookAt(target);
    }

    return originalRender.call(this, scene, camera);
  };

  app.addEventListener('contextmenu', (e) => e.preventDefault());
})();
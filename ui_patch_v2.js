(() => {
  const stick = document.getElementById('stick');
  const nub = document.getElementById('nub');
  const app = document.getElementById('app');

  if (!stick || !nub || !app || !window.THREE) return;

  stick.style.position = 'fixed';
  stick.style.left = '0px';
  stick.style.top = '0px';
  stick.style.transform = 'translate(-9999px,-9999px)';
  stick.style.opacity = '0';
  stick.style.pointerEvents = 'auto';
  stick.style.transition = 'opacity 120ms ease';
  stick.style.zIndex = '70';

  app.style.touchAction = 'none';

  let lastScene = null;
  let lastCamera = null;
  let playerRoot = null;

  function isUiTarget(target) {
    return !!(target && typeof target.closest === 'function' && target.closest('.hud, .top-actions, .footer, button'));
  }

  function findPlayerRoot(scene) {
    let found = null;
    scene.traverse((obj) => {
      if (found || !obj.isMesh || !obj.material || !obj.material.color || typeof obj.material.color.getHex !== 'function') return;
      const hex = obj.material.color.getHex();
      if (hex === 0x355d9d || hex === 0x27406d || hex === 0x4f7dc8) {
        let root = obj;
        while (root.parent && root.parent.parent) root = root.parent;
        found = root;
      }
    });
    return found;
  }

  function syncCamera(camera) {
    if (!camera || !playerRoot || !playerRoot.parent) return;
    const pos = playerRoot.position;
    const target = new THREE.Vector3(pos.x, 0.95, pos.z);
    const desired = new THREE.Vector3(pos.x + 11.5, 17.2, pos.z + 11.5);
    camera.position.lerp(desired, 0.12);
    camera.lookAt(target);
  }

  const originalRender = THREE.WebGLRenderer.prototype.render;
  THREE.WebGLRenderer.prototype.render = function patchedRender(scene, camera) {
    lastScene = scene;
    lastCamera = camera;
    if (!playerRoot || !playerRoot.parent) playerRoot = findPlayerRoot(scene);
    syncCamera(camera);
    return originalRender.call(this, scene, camera);
  };

  (function rafSync() {
    if (lastScene && (!playerRoot || !playerRoot.parent)) {
      playerRoot = findPlayerRoot(lastScene);
    }
    if (lastCamera) syncCamera(lastCamera);
    requestAnimationFrame(rafSync);
  })();

  function forward(type, e) {
    try {
      const evt = new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: e.pointerId,
        pointerType: e.pointerType || 'touch',
        clientX: e.clientX,
        clientY: e.clientY,
        pressure: e.pressure || 0.5,
        isPrimary: true
      });
      stick.dispatchEvent(evt);
    } catch (err) {
      // Fallback for older browsers.
      const evt = document.createEvent('Event');
      evt.initEvent(type, true, true);
      evt.pointerId = e.pointerId;
      evt.pointerType = e.pointerType || 'touch';
      evt.clientX = e.clientX;
      evt.clientY = e.clientY;
      stick.dispatchEvent(evt);
    }
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
    if (isUiTarget(e.target)) return;
    if (e.clientX > window.innerWidth * 0.58) return;
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

  // Small visual proof the patch loaded.
  console.log('[Restaurant Zombie] UI patch v2 loaded');
})();
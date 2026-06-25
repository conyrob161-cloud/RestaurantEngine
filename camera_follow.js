(() => {
  if (!window.THREE) return;

  const isUiTarget = (target) => !!(target && typeof target.closest === 'function' && target.closest('.hud, .top-actions, .footer, button'));

  const findPlayerRoot = (scene) => {
    let found = null;
    scene.traverse((obj) => {
      if (found || !obj.isMesh || !obj.material || !obj.material.color || typeof obj.material.color.getHex !== 'function') return;
      const hex = obj.material.color.getHex();
      if (hex === 0x355d9d || hex === 0x4f7dc8 || hex === 0x27406d) {
        let root = obj;
        while (root.parent && root.parent.parent) root = root.parent;
        found = root;
      }
    });
    return found;
  };

  let playerRoot = null;
  let lastScene = null;
  let lastCamera = null;

  const syncCamera = (camera) => {
    if (!camera || !playerRoot || !playerRoot.parent) return;
    const pos = playerRoot.position;
    const targetX = pos.x;
    const targetY = 0.95;
    const targetZ = pos.z;
    const desiredX = pos.x + 11.5;
    const desiredY = 16.8;
    const desiredZ = pos.z + 11.5;
    camera.position.x += (desiredX - camera.position.x) * 0.12;
    camera.position.y += (desiredY - camera.position.y) * 0.12;
    camera.position.z += (desiredZ - camera.position.z) * 0.12;
    camera.lookAt(targetX, targetY, targetZ);
  };

  const originalRender = THREE.WebGLRenderer.prototype.render;
  THREE.WebGLRenderer.prototype.render = function patchedRender(scene, camera) {
    lastScene = scene;
    lastCamera = camera;
    if (!playerRoot || !playerRoot.parent) playerRoot = findPlayerRoot(scene);
    syncCamera(camera);
    return originalRender.call(this, scene, camera);
  };

  const raf = () => {
    if (lastScene && (!playerRoot || !playerRoot.parent)) playerRoot = findPlayerRoot(lastScene);
    if (lastCamera) syncCamera(lastCamera);
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);

  window.addEventListener('pointerdown', (e) => {
    if (!e || e.pointerType !== 'touch' || isUiTarget(e.target)) return;
    // No-op here: this file only keeps the camera in sync.
  }, { passive: true });

  console.log('[Restaurant Zombie] camera_follow.js loaded');
})();
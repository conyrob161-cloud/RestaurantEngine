(() => {
  const makeBadgeTexture = () => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'rgba(165, 28, 28, 0.92)';
    ctx.fillRect(40, 40, 432, 176);
    ctx.strokeStyle = 'rgba(255, 226, 153, 0.95)';
    ctx.lineWidth = 10;
    ctx.strokeRect(40, 40, 432, 176);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 92px system-ui, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('HOST', 256, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  };

  const badgeTexture = makeBadgeTexture();

  const markCustomer = (obj) => {
    if (!obj || !obj.isObject3D) return;
    if (obj.userData?.__customerVisiblePatched) return;
    if (obj.userData?.type !== 'customer') return;

    obj.userData.__customerVisiblePatched = true;
    obj.scale.setScalar(1.45);
    obj.position.y = Math.max(obj.position.y, 0.55);
    obj.renderOrder = 1000;
    obj.traverse((child) => {
      child.renderOrder = 1000;
      if (child.material) {
        child.material.depthTest = false;
        child.material.transparent = true;
      }
    });

    const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTexture, transparent: true, depthTest: false }));
    marker.position.set(0, 4.7, 0);
    marker.scale.set(2.6, 1.3, 1);
    marker.renderOrder = 1002;
    obj.add(marker);
  };

  const originalAdd = THREE.Scene.prototype.add;
  THREE.Scene.prototype.add = function addPatched(...objects) {
    const result = originalAdd.apply(this, objects);
    for (const object of objects) markCustomer(object);
    return result;
  };
})();
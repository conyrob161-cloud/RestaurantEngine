(() => {
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
      if (child.material) child.material.depthTest = false;
    });

    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 2.1, 8),
      new THREE.MeshStandardMaterial({ color: 0xff4d4d, emissive: 0x661111, roughness: 0.35 })
    );
    beacon.position.y = 3.05;
    beacon.renderOrder = 1001;
    obj.add(beacon);

    const topper = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 1.05, 8),
      new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0x664400, roughness: 0.3 })
    );
    topper.position.y = 4.35;
    topper.renderOrder = 1001;
    obj.add(topper);
  };

  const originalAdd = THREE.Scene.prototype.add;
  THREE.Scene.prototype.add = function addPatched(...objects) {
    const result = originalAdd.apply(this, objects);
    for (const object of objects) markCustomer(object);
    return result;
  };
})();
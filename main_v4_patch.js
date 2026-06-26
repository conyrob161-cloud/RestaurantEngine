(() => {
  function createTableVisual() {
    const group = new THREE.Group();
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.12, 0.9),
      new THREE.MeshStandardMaterial({ color: 0xc49a6c, roughness: 0.95 })
    );
    top.position.y = 0.72;

    const legMat = new THREE.MeshStandardMaterial({ color: 0x6d4c3a, roughness: 0.95 });
    const legs = [
      [-0.55, 0.35], [0.55, 0.35], [-0.55, -0.35], [0.55, -0.35]
    ].map(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.74, 0.08), legMat);
      leg.position.set(x, 0.37, z);
      return leg;
    });

    group.add(top, ...legs);
    return group;
  }

  // Make the helper available to main_v4.js without changing its structure.
  window.createTableVisual = createTableVisual;
})();
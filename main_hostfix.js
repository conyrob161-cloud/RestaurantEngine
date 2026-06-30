(() => {
  const SOURCE_URL = 'main_v5.js?v=4';

  function patchSource(src) {
    const needle = '    scene.add(customer);\n';
    const patch = [
      '    scene.add(customer);',
      '    customer.visible = true;',
      '    customer.scale.setScalar(1.12);',
      '    customer.position.y = 0.08;',
      '    const beacon = new THREE.Mesh(',
      '      new THREE.ConeGeometry(0.18, 0.95, 8),',
      '      new THREE.MeshStandardMaterial({ color: 0xff4d4d, emissive: 0x661111, roughness: 0.35 })',
      '    );',
      '    beacon.position.y = 2.95;',
      '    customer.add(beacon);',
      ''
    ].join('\n');

    if (!src.includes(needle)) {
      throw new Error('Customer spawn marker not found in source');
    }
    return src.replace(needle, patch);
  }

  async function load() {
    try {
      const res = await fetch(SOURCE_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to fetch source: ${res.status}`);
      const src = await res.text();
      const patched = patchSource(src);
      (0, eval)(patched);
    } catch (err) {
      console.error(err);
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:#10131a;color:#fff;font:16px system-ui;padding:24px;text-align:center;z-index:9999';
      box.innerHTML = '<div><h1>Nelze spustit hru</h1><p>Patch loader nenačetl skript.</p></div>';
      document.body.appendChild(box);
    }
  }

  load();
})();
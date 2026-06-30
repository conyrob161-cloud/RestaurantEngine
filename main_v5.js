(() => {
  const SOURCE_URL = 'https://raw.githubusercontent.com/conyrob161-cloud/RestaurantEngine/0caa85079451623cd7d0b454f78d4bbf785f2d3b/main_v5.js';

  const patchSource = (src) => {
    src = src.replace(
      /function makeLabelSprite\(text, bg = '#111827', fg = '#fff', scaleX = 2\.6, scaleY = 1\.15\) \{[\s\S]*?return \{ sprite, draw \};\n  \}/,
      `function makeLabelSprite(text, bg = '#111827', fg = '#fff', scaleX = 2.6, scaleY = 1.15) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const ctx = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    const draw = (value, drawBg = bg, drawFg = fg) => {
      ctx.clearRect(0, 0, c.width, c.height);
      const lines = String(value).split('\\n');
      const fontSize = lines.length > 1 ? 42 : 56;
      const lineHeight = fontSize + 8;
      const totalHeight = lines.length * lineHeight;
      const startY = 128 - totalHeight / 2 + lineHeight / 2;
      ctx.fillStyle = drawBg; roundedRectPath(ctx, 24, 44, 464, 168, 32); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 6; ctx.stroke();
      ctx.fillStyle = drawFg; ctx.font = \`900 \${fontSize}px system-ui, Arial\`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      lines.forEach((line, i) => ctx.fillText(line, 256, startY + i * lineHeight));
      tex.needsUpdate = true;
    };
    draw(text);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.scale.set(scaleX, scaleY, 1);
    return { sprite, draw };
  }`
    );

    const marker = `  function updateTableVisuals(table) {
    table.stackModel.count = table.stack;
    table.stackModel.setCount(table.stack);
    table.stackLabel.draw(String(table.stack));
    table.capLabel.draw(String(table.capacity));
  }

`;
    const helper = `  function updateCustomerLabel(customer) {
    if (!customer.infoLabel) return;
    const order = Math.max(0, customer.order || 0);
    const eaten = clamp(customer.eaten || 0, 0, order);
    let timeText = 'přichází';
    let bg = '#334155';

    if (customer.state === 'waiting') {
      const remaining = Math.max(0, Math.ceil(customer.waitTimer || 0));
      const total = Math.max(customer.waitTotal || 1, 1);
      const ratio = clamp((customer.waitTimer || 0) / total, 0, 1);
      timeText = `\${remaining}s`;
      bg = ratio > 0.55 ? '#1f6f3f' : ratio > 0.25 ? '#8a6d1d' : '#8b1d1d';
    } else if (customer.state === 'eating') {
      const remaining = Math.max(0, Math.ceil(customer.waitTimer || 0));
      timeText = `\${remaining}s`;
      bg = '#1f6f3f';
    } else if (customer.state === 'leaving') {
      timeText = 'odchází';
      bg = '#334155';
    }

    customer.infoLabel.draw(`🍕 \${eaten}/\${order}\\n⏱ \${timeText}`, bg, '#fff');
    customer.infoLabel.sprite.visible = !customer.dead && customer.state !== 'leaving';
  }

`;
    if (!src.includes(marker)) throw new Error('updateTableVisuals marker not found');
    src = src.replace(marker, marker + helper);

    src = src.replace(
      `  function spawnCustomer(manual = false) {
    const table = tables.find(t => t.active && !t.occupied);
    if (!table) { if (manual) toast('Žádný volný stůl', 'Nejdřív postav nový stůl.'); return false; }
    const idSeed = 'cust-' + Math.random().toString(36).slice(2);
    const customer = makeCharacter('customer', idSeed);
    customer.scale.setScalar(0.98);
    customer.position.set(WORLD.entrance.gx + 0.5, 0, WORLD.entrance.gz + 0.5);
    scene.add(customer);
    const order = 1 + Math.floor(Math.random() * 3);
    const reward = order === 1 ? 15 : order === 2 ? 35 : 60;
    const c = { id: idSeed, table, x: WORLD.entrance.gx + 0.5, z: WORLD.entrance.gz + 0.5, state: 'walking', waitTimer: 18 + Math.random() * 10, eatTimer: 0, payTimer: 0, order, eaten: 0, reward, path: [], pathIndex: 0, mesh: customer, paid: false, dead: false };
    table.occupied = true; table.customerId = c.id; updateTableVisuals(table); rebuildBlockedMap(); c.path = findPath(worldToCell(c.x, c.z), table.seat); state.customers.push(c); if (manual) toast('Host přišel', 'Přivolán ke stolu.'); return true;
  }`,
      `  function spawnCustomer(manual = false) {
    const table = tables.find(t => t.active && !t.occupied);
    if (!table) { if (manual) toast('Žádný volný stůl', 'Nejdřív postav nový stůl.'); return false; }
    const idSeed = 'cust-' + Math.random().toString(36).slice(2);
    const customer = makeCharacter('customer', idSeed);
    customer.scale.setScalar(0.98);
    customer.position.set(WORLD.entrance.gx + 0.5, 0, WORLD.entrance.gz + 0.5);
    const infoLabel = makeLabelSprite('🍕 0/1\\n⏱ přichází', '#334155', '#fff', 1.9, 0.9);
    infoLabel.sprite.position.set(0, 2.78, 0);
    infoLabel.sprite.renderOrder = 999;
    customer.add(infoLabel.sprite);
    customer.userData.infoLabel = infoLabel;
    scene.add(customer);
    const order = 1 + Math.floor(Math.random() * 3);
    const reward = order === 1 ? 15 : order === 2 ? 35 : 60;
    const waitTotal = 18 + Math.random() * 10;
    const c = { id: idSeed, table, x: WORLD.entrance.gx + 0.5, z: WORLD.entrance.gz + 0.5, state: 'walking', waitTimer: 0, waitTotal, eatTimer: 0, payTimer: 0, order, eaten: 0, reward, path: [], pathIndex: 0, mesh: customer, paid: false, dead: false, infoLabel };
    table.occupied = true; table.customerId = c.id; updateTableVisuals(table); rebuildBlockedMap(); c.path = findPath(worldToCell(c.x, c.z), table.seat); updateCustomerLabel(c); state.customers.push(c); if (manual) toast('Host přišel', 'Přivolán ke stolu.'); return true;
  }`
    );

    src = src.replace(
      `c.state = 'waiting'; c.waitTimer = 18 + Math.random() * 10; toast('Host sedí', \`Objednal \${c.order} pizzu.\`);`,
      `c.state = 'waiting'; c.waitTimer = c.waitTotal; toast('Host sedí', \`Objednal \${c.order} pizzu.\`); updateCustomerLabel(c);`
    );

    src = src.replace(
      `      else { c.waitTimer -= dt; if (c.waitTimer <= 0) { c.state = 'leaving'; c.path = findPath(worldToCell(c.x, c.z), WORLD.entrance); c.pathIndex = 0; state.rep = Math.max(0, state.rep - 1); c.table.occupied = false; c.table.customerId = null; updateTableVisuals(c.table); rebuildBlockedMap(); toast('Host odchází', 'Příliš dlouhé čekání.'); } }`,
      `      else { c.waitTimer -= dt; updateCustomerLabel(c); if (c.waitTimer <= 0) { c.state = 'leaving'; c.path = findPath(worldToCell(c.x, c.z), WORLD.entrance); c.pathIndex = 0; state.rep = Math.max(0, state.rep - 1); c.table.stack = 0; c.table.occupied = false; c.table.customerId = null; updateTableVisuals(c.table); rebuildBlockedMap(); updateCustomerLabel(c); toast('Host odchází', 'Příliš dlouhé čekání.'); } }`
    );

    src = src.replace(
      `      if (c.eatTimer <= 0) {
        if (c.table.stack > 0 && c.eaten < c.order) { c.table.stack -= 1; c.eaten += 1; updateTableVisuals(c.table); createParticle('-pizza', c.table.gx + 0.5, c.table.gz + 0.5, '#ffcf6f'); }
        if (c.eaten >= c.order) { payAndLeave(c); return; }
        c.state = (c.table.stack > c.eaten) ? 'eating' : 'waiting'; c.eatTimer = 0.4;
      }`,
      `      if (c.eatTimer <= 0) {
        if (c.table.stack > 0 && c.eaten < c.order) { c.table.stack -= 1; c.eaten += 1; updateTableVisuals(c.table); createParticle('-pizza', c.table.gx + 0.5, c.table.gz + 0.5, '#ffcf6f'); updateCustomerLabel(c); }
        if (c.eaten >= c.order) { payAndLeave(c); return; }
        c.state = (c.table.stack > c.eaten) ? 'eating' : 'waiting'; c.eatTimer = 0.4; updateCustomerLabel(c);
      }`
    );

    src = src.replace(
      `    createParticle(\`+\${customer.reward}\`, customer.table.gx + 0.5, customer.table.gz + 0.5, '#8fe08f');
    customer.table.occupied = false;
    customer.table.customerId = null;
    updateTableVisuals(customer.table);
    rebuildBlockedMap();
    customer.state = 'leaving';`,
      `    createParticle(\`+\${customer.reward}\`, customer.table.gx + 0.5, customer.table.gz + 0.5, '#8fe08f');
    customer.table.stack = 0;
    customer.table.occupied = false;
    customer.table.customerId = null;
    updateTableVisuals(customer.table);
    rebuildBlockedMap();
    customer.state = 'leaving';
    updateCustomerLabel(customer);`
    );

    src = src.replace(
      `    c.mesh.position.set(c.x, 0, c.z);
    updateCharacterAnimation(c.mesh, c.state);
  }`,
      `    updateCustomerLabel(c);
    c.mesh.position.set(c.x, 0, c.z);
    updateCharacterAnimation(c.mesh, c.state);
  }`
    );

    src = src.replace(
      `toast('Stable v13', 'Zbylé pizzy na stolech se teď počítají pro další hosty.');`,
      `toast('Stable v14', 'Hosté mají objednávku i čas nad hlavou.');`
    );

    return src;
  };

  const load = async () => {
    try {
      const res = await fetch(SOURCE_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to fetch source: ${res.status}`);
      const original = await res.text();
      const patched = patchSource(original);
      (0, eval)(patched);
    } catch (err) {
      console.error(err);
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:#10131a;color:#fff;font:16px system-ui;padding:24px;text-align:center;z-index:9999';
      box.innerHTML = '<div><h1>Nelze spustit hru</h1><p>Patch loader nenačetl původní skript.</p></div>';
      document.body.appendChild(box);
    }
  };

  load();
})();
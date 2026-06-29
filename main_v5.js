(() => {
  const canvas = document.getElementById('game');
  const ui = {
    money: document.getElementById('money'),
    stock: document.getElementById('stock'),
    carry: document.getElementById('carry'),
    oven: document.getElementById('oven'),
    waiting: document.getElementById('waiting'),
    rep: document.getElementById('rep'),
    toast: document.getElementById('toast'),
    spawnBtn: document.getElementById('spawnBtn'),
    buyStockBtn: document.getElementById('buyStockBtn'),
    upgradeCarryBtn: document.getElementById('upgradeCarryBtn'),
    upgradeOvenBtn: document.getElementById('upgradeOvenBtn'),
    saveBtn: document.getElementById('saveBtn'),
    resetBtn: document.getElementById('resetBtn'),
    actionBtn: document.getElementById('actionBtn'),
    stick: document.getElementById('stick'),
    nub: document.getElementById('nub'),
  };

  const SAVE_KEY = 'restaurant-zombie-stable-v13';
  const GRID_W = 20;
  const GRID_H = 20;
  const START_ACTIVE_TABLES = 2;
  const BUILD_SPOTS = [
    { gx: 5, gz: 9, cost: 60 },
    { gx: 14, gz: 9, cost: 75 },
    { gx: 5, gz: 14, cost: 90 },
    { gx: 14, gz: 14, cost: 110 },
    { gx: 3, gz: 11, cost: 130 },
    { gx: 16, gz: 11, cost: 150 },
  ];

  const WORLD = {
    stock: { gx: 3, gz: 3 },
    oven: { gx: 6, gz: 4 },
    counter: { gx: 9, gz: 4 },
    cash: { gx: 16, gz: 3 },
    entrance: { gx: 10, gz: 18 },
  };

  const state = {
    money: 25,
    stock: 8,
    carry: 0,
    carryCap: 5,
    rep: 0,
    ovenLevel: 1,
    player: { x: 10.5, z: 17.5, angle: 0, speed: 3.8 },
    keys: {},
    touch: { active: false, id: null, cx: 0, cy: 0, dx: 0, dz: 0, max: 78 },
    customers: [],
    particles: [],
    lastSpawn: 0,
    ovenTimer: 0,
    emergencyAt: 0,
    adCooldownAt: 0,
  };

  const blocked = Array.from({ length: GRID_H }, () => Array(GRID_W).fill(false));
  const tables = [];
  const buildMarkers = [];
  let renderer, scene, camera, player, chef, carryStack, ovenStack;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
  const cellCenter = (gx, gz) => ({ x: gx + 0.5, z: gz + 0.5 });
  const worldToCell = (x, z) => ({ gx: Math.floor(x), gz: Math.floor(z) });
  const hashString = (text) => { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

  function toast(title, sub = '') {
    ui.toast.innerHTML = `<strong>${title}</strong>${sub ? `<div class="small">${sub}</div>` : ''}`;
    ui.toast.classList.add('show');
    clearTimeout(ui.toast._timer);
    ui.toast._timer = setTimeout(() => ui.toast.classList.remove('show'), 1500);
  }

  function roundedRectPath(ctx, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  function makeCanvasTexture(drawFn, size = 256) {
    const c = document.createElement('canvas'); c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    drawFn(ctx, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  function makeLabelSprite(text, bg = '#111827', fg = '#fff', scaleX = 2.6, scaleY = 1.15) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const ctx = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    const draw = (value) => {
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.fillStyle = bg; roundedRectPath(ctx, 24, 44, 464, 168, 32); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 6; ctx.stroke();
      ctx.fillStyle = fg; ctx.font = '900 56px system-ui, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(value, 256, 128);
      tex.needsUpdate = true;
    };
    draw(text);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.scale.set(scaleX, scaleY, 1);
    return { sprite, draw };
  }

  function makeStack(max = 12, spin = 0) {
    const group = new THREE.Group();
    const items = [];
    for (let i = 0; i < max; i++) {
      const pizza = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.06, 6), new THREE.MeshStandardMaterial({ color: 0xc47a3a, roughness: 0.96 }));
      const cheese = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.03, 6), new THREE.MeshStandardMaterial({ color: 0xf0ca78, roughness: 0.92 }));
      cheese.position.y = 0.04; pizza.add(cheese); pizza.visible = false; pizza.position.y = i * 0.055; pizza.rotation.y = i * 0.43 + spin; items.push(pizza); group.add(pizza);
    }
    function setCount(count) { const n = clamp(count, 0, max); items.forEach((m, i) => { m.visible = i < n; m.position.y = i * 0.055; }); group.visible = n > 0; }
    return { group, setCount, items, max, count: 0 };
  }

  function createShadow(opacity = 0.18, radius = 0.38) {
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.01; return shadow;
  }

  function paletteFor(type, seedText = '') {
    if (type === 'player') return { body: 0x4d78b5, skin: 0xf0ceb1, accent: 0x8ecae6, hair: 0x253047 };
    if (type === 'chef') return { body: 0xf8f6f0, skin: 0xf0ceb1, accent: 0xc6b08f, hair: 0x1f1f1f };
    const sets = [
      { body: 0x5f7dd6, skin: 0xf1ccb0, accent: 0xffc857, hair: 0x3f2e24 },
      { body: 0xd96c6c, skin: 0xefc8a4, accent: 0x8fe08f, hair: 0x2c2a28 },
      { body: 0x4c9b72, skin: 0xe9c5aa, accent: 0xf2d56b, hair: 0x5e452f },
      { body: 0x9e78d2, skin: 0xeec7aa, accent: 0x7ee0ff, hair: 0x1c1f27 },
      { body: 0x729f5d, skin: 0xe5c0a3, accent: 0xc8d18a, hair: 0x50372b },
    ];
    let h = 0; for (const ch of seedText) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return sets[h % sets.length];
  }

  function makeFaceTexture(seed, skin, hair) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256; const ctx = c.getContext('2d');
    ctx.fillStyle = `#${skin.toString(16).padStart(6, '0')}`; ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = `#${hair.toString(16).padStart(6, '0')}`; const variant = seed % 4;
    ctx.beginPath(); ctx.ellipse(128, 92, 95, 92, 0, Math.PI, 0); ctx.fill();
    if (variant === 1) { ctx.fillRect(28, 52, 36, 112); ctx.fillRect(192, 52, 36, 112); }
    else if (variant === 2) { ctx.beginPath(); ctx.ellipse(128, 74, 70, 34, 0, 0, Math.PI * 2); ctx.fill(); }
    else if (variant === 3) { ctx.beginPath(); ctx.ellipse(128, 74, 86, 46, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(46, 60, 24, 54); ctx.fillRect(186, 60, 24, 54); }
    ctx.fillStyle = '#141414'; ctx.beginPath(); ctx.arc(88, 126, 11, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(168, 126, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(240,120,120,0.18)'; ctx.beginPath(); ctx.arc(72, 150, 16, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(184, 150, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(175,120,100,0.95)'; roundedRectPath(ctx, 121, 136, 14, 26, 7); ctx.fill();
    ctx.strokeStyle = '#6b2b2b'; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(128, 172, 18, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true; return tex;
  }

  function makeCharacter(type, seedText) {
    const palette = paletteFor(type, seedText);
    const root = new THREE.Group();
    root.userData.type = type; root.userData.seed = seedText; root.add(createShadow(0.18, 0.4));
    const rig = new THREE.Group(); rig.position.y = 0.15; root.add(rig);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8), new THREE.MeshStandardMaterial({ color: palette.body, roughness: 0.92 }));
    body.scale.set(0.82, 1.08, 0.72); body.position.y = 0.78; rig.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshStandardMaterial({ color: palette.skin, map: makeFaceTexture(hashString(seedText), palette.skin, palette.hair), roughness: 0.95 }));
    head.position.y = 1.78; rig.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), new THREE.MeshStandardMaterial({ color: palette.hair, roughness: 0.95 }));
    hair.scale.set(1.0, 0.72, 0.92); hair.position.set(0, 1.82, -0.02); rig.add(hair);

    function makeHand(side) {
      const g = new THREE.Group();
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.14, 6), new THREE.MeshStandardMaterial({ color: palette.body, roughness: 0.94 }));
      cuff.rotation.z = Math.PI / 2; cuff.position.x = side * -0.05;
      const palmMat = new THREE.MeshStandardMaterial({ color: palette.skin, roughness: 0.96 });
      const palm = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), palmMat);
      const finger1 = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), palmMat);
      const finger2 = finger1.clone(); const finger3 = finger1.clone();
      palm.position.x = 0.1; finger1.position.set(0.16, 0.035, 0.03); finger2.position.set(0.16, 0.0, 0.0); finger3.position.set(0.16, -0.035, -0.03);
      g.add(cuff, palm, finger1, finger2, finger3); g.position.set(side * 0.58, 1.04, 0); g.rotation.z = side * 0.1; return g;
    }

    function makeFoot(side) {
      const g = new THREE.Group(); const shoeMat = new THREE.MeshStandardMaterial({ color: type === 'chef' ? 0x1f1f1f : 0x1d2230, roughness: 1 });
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.34), shoeMat);
      const toe = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), shoeMat);
      shoe.position.y = 0.02; toe.position.set(0.09, 0.02, 0.13); g.add(shoe, toe); g.position.set(side * 0.17, 0.08, 0.02); return g;
    }

    const handL = makeHand(-1), handR = makeHand(1), footL = makeFoot(-1), footR = makeFoot(1);
    rig.add(handL, handR, footL, footR);
    const hat = new THREE.Group();
    if (type === 'chef') {
      const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78 });
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 6), white);
      const p1 = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), white);
      const p2 = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), white);
      const p3 = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), white);
      p1.position.set(-0.08, 0.2, 0); p2.position.set(0, 0.34, 0.02); p3.position.set(0.09, 0.2, 0); band.position.y = -0.02; hat.add(band, p1, p2, p3); hat.position.y = 2.18;
      const apron = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.48, 0.07), new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.95 }));
      apron.position.set(0, 0.28, 0.2); const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.09, 0.02), new THREE.MeshStandardMaterial({ color: 0xd9d1c2, roughness: 0.95 })); pocket.position.set(0, 0.2, 0.24); rig.add(apron, pocket);
    } else if (type === 'player') {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.28), new THREE.MeshStandardMaterial({ color: 0x24324c, roughness: 0.86 }));
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.05, 0.18), new THREE.MeshStandardMaterial({ color: palette.accent, roughness: 0.84 }));
      brim.position.set(0, -0.02, 0.16); cap.position.y = 0.06; hat.add(cap, brim); hat.position.y = 2.02;
      const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.34, 0.14), new THREE.MeshStandardMaterial({ color: 0x2b4672, roughness: 0.92 })); backpack.position.set(0, 0.42, -0.23); rig.add(backpack);
    } else {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.14, 6), new THREE.MeshStandardMaterial({ color: palette.accent, roughness: 0.82 }));
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshStandardMaterial({ color: palette.accent, roughness: 0.82 })); top.position.y = 0.13; hat.add(cap, top); hat.position.y = 1.98;
      const badge = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.03), new THREE.MeshStandardMaterial({ color: palette.accent, roughness: 0.95 })); badge.position.set(0.06, 0.48, 0.28); rig.add(badge);
    }
    rig.add(hat);
    root.userData.rig = { body, head, hair, rig, handL, handR, footL, footR, hat, blinkSeed: hashString(seedText + type) };
    return root;
  }

  function updateCharacterAnimation(root, stateName) {
    const rig = root.userData.rig;
    if (!rig || !rig.body || !rig.head || !rig.hair || !rig.handL || !rig.handR || !rig.footL || !rig.footR || !rig.hat) return;
    const t = performance.now();
    const moving = stateName === 'walking' || stateName === 'leaving';
    const speedFactor = moving ? (stateName === 'walking' ? 1 : 1.15) : 0.25;
    const walk = Math.sin(t * 0.012 + rig.blinkSeed * 0.0001 + root.position.x * 0.2 + root.position.z * 0.17);
    const swing = walk * (0.12 + speedFactor * 0.34);
    const bob = Math.sin(t * 0.006 + rig.blinkSeed * 0.0002) * (0.008 + speedFactor * 0.015);
    rig.body.position.y = 0.78 + bob * 0.25;
    rig.head.position.y = 1.78 + bob * 0.8;
    rig.hair.position.y = 1.82 + bob * 0.8;
    rig.rig.position.y = 0.15 + bob * 0.15;
    rig.handL.rotation.z = -0.12 + swing;
    rig.handR.rotation.z = 0.12 - swing;
    rig.footL.rotation.x = -0.12 - swing * 0.3;
    rig.footR.rotation.x = -0.12 + swing * 0.3;
    if (rig.footL.children[0]) rig.footL.children[0].rotation.y = swing * 0.5;
    if (rig.footR.children[0]) rig.footR.children[0].rotation.y = -swing * 0.5;
    rig.hat.rotation.y = Math.sin(t * 0.0016 + rig.blinkSeed * 0.0001) * 0.03;
  }

  function block(gx, gz) { if (gx >= 0 && gz >= 0 && gx < GRID_W && gz < GRID_H) blocked[gz][gx] = true; }
  function cellBlocked(gx, gz) { return gx < 0 || gz < 0 || gx >= GRID_W || gz >= GRID_H || blocked[gz][gx]; }
  function canOccupy(x, z, radius = 0.30) {
    const points = [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius], [radius, radius], [radius, -radius], [-radius, radius], [-radius, -radius]];
    for (const [dx, dz] of points) { const c = worldToCell(x + dx, z + dz); if (cellBlocked(c.gx, c.gz)) return false; }
    return true;
  }

  function rebuildBlockedMap() {
    for (let z = 0; z < GRID_H; z++) for (let x = 0; x < GRID_W; x++) blocked[z][x] = false;
    for (let x = 0; x < GRID_W; x++) { block(x, 0); block(x, GRID_H - 1); }
    for (let z = 0; z < GRID_H; z++) { block(0, z); block(GRID_W - 1, z); }
    for (let x = 1; x < GRID_W - 1; x++) if (x !== WORLD.entrance.gx) block(x, 7);
    for (let z = 1; z < 7; z++) { block(4, z); block(15, z); }
    block(WORLD.stock.gx, WORLD.stock.gz); block(WORLD.oven.gx, WORLD.oven.gz); block(WORLD.counter.gx, WORLD.counter.gz); block(WORLD.cash.gx, WORLD.cash.gz);
    for (const t of tables) if (t.active) block(t.gx, t.gz);
  }

  function findPath(start, goal) {
    const queue = [start]; const prev = new Map(); const seen = new Set([`${start.gx},${start.gz}`]);
    while (queue.length) {
      const cur = queue.shift();
      if (cur.gx === goal.gx && cur.gz === goal.gz) {
        const path = [cur]; let key = `${cur.gx},${cur.gz}`;
        while (prev.has(key)) { const p = prev.get(key); path.push(p); key = `${p.gx},${p.gz}`; }
        return path.reverse();
      }
      const next = [{ gx: cur.gx + 1, gz: cur.gz }, { gx: cur.gx - 1, gz: cur.gz }, { gx: cur.gx, gz: cur.gz + 1 }, { gx: cur.gx, gz: cur.gz - 1 }];
      for (const n of next) {
        const key = `${n.gx},${n.gz}`; if (seen.has(key) || cellBlocked(n.gx, n.gz)) continue; seen.add(key); prev.set(key, cur); queue.push(n);
      }
    }
    return [];
  }

  function tryFindSafeSpotAround(x, z) {
    const offsets = [[1.25, 0], [-1.25, 0], [0, 1.25], [0, -1.25], [0.9, 0.9], [0.9, -0.9], [-0.9, 0.9], [-0.9, -0.9], [1.6, 0], [-1.6, 0], [0, 1.6], [0, -1.6]];
    for (const [dx, dz] of offsets) { const nx = x + dx, nz = z + dz; if (canOccupy(nx, nz)) return { x: nx, z: nz }; }
    if (canOccupy(WORLD.entrance.gx + 0.5, WORLD.entrance.gz + 0.5)) return { x: WORLD.entrance.gx + 0.5, z: WORLD.entrance.gz + 0.5 };
    return null;
  }

  function makeTableVisual() {
    const group = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.9), new THREE.MeshStandardMaterial({ color: 0xc49a6c, roughness: 0.95 })); top.position.y = 0.72;
    const legMat = new THREE.MeshStandardMaterial({ color: 0x6d4c3a, roughness: 0.95 });
    [[-0.55, 0.35], [0.55, 0.35], [-0.55, -0.35], [0.55, -0.35]].forEach(([x, z]) => { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.74, 0.08), legMat); leg.position.set(x, 0.37, z); group.add(leg); });
    group.add(top); return group;
  }

  function createChair() {
    const group = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.36), new THREE.MeshStandardMaterial({ color: 0x8f654b, roughness: 0.95 })); seat.position.y = 0.42;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.06), new THREE.MeshStandardMaterial({ color: 0x7a573f, roughness: 0.95 })); back.position.set(0, 0.68, -0.14);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x6d4c3a, roughness: 0.95 });
    [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]].forEach(([x, z]) => { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.42, 0.04), legMat); leg.position.set(x, 0.21, z); group.add(leg); });
    group.add(seat, back); return group;
  }

  function buildTable(slot, active = false) {
    const table = { gx: slot.gx, gz: slot.gz, seat: { gx: slot.gx, gz: slot.gz + 1 }, cost: slot.cost, active, capacity: 10, stack: 0, customerId: null, occupied: false, group: new THREE.Group(), stackModel: makeStack(12), ring: null, stackLabel: null, capLabel: null };
    const root = table.group; root.position.set(slot.gx + 0.5, 0, slot.gz + 0.5); root.userData.table = table; root.add(makeTableVisual());
    const chairA = createChair(); chairA.position.set(0, 0, 0.68); chairA.rotation.y = Math.PI; const chairB = createChair(); chairB.position.set(0, 0, -0.68); root.add(chairA, chairB);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 8, 24), new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0x664400, roughness: 0.5 }));
    ring.rotation.x = Math.PI / 2; ring.position.set(0, 0.08, 0); ring.visible = false; root.add(ring);
    const stack = makeStack(12); stack.group.position.set(0, 0.82, 0); root.add(stack.group);
    const stackLabel = makeLabelSprite('0', '#1f2937', '#fff', 0.9, 0.45); stackLabel.sprite.position.set(0, 1.85, 0); root.add(stackLabel.sprite);
    const capLabel = makeLabelSprite('10', '#1f2937', '#fff', 0.9, 0.45); capLabel.sprite.position.set(0.55, 1.85, 0.1); root.add(capLabel.sprite);
    table.stackModel = stack; table.ring = ring; table.stackLabel = stackLabel; table.capLabel = capLabel;
    return table;
  }

  function createBuildMarker(table) {
    const group = new THREE.Group();
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x73ef73, emissive: 0x225522, roughness: 0.45 })); arrow.position.y = 1.05; group.add(arrow);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x2e8c2e, roughness: 0.6 })); stem.position.y = 0.62; group.add(stem);
    const label = makeLabelSprite(`Stůl ${table.cost}`, '#143214', '#dfffe0', 1.9, 0.7); label.sprite.position.y = 1.65; group.add(label.sprite);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 8, 20), new THREE.MeshStandardMaterial({ color: 0x73ef73, emissive: 0x225522, roughness: 0.4 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.28; group.add(ring);
    group.position.set(table.gx + 0.5, 0, table.gz + 0.5); group.userData.table = table; group.userData.arrow = arrow; group.userData.label = label; group.userData.ring = ring; return group;
  }

  function updateTableVisuals(table) {
    table.stackModel.count = table.stack;
    table.stackModel.setCount(table.stack);
    table.stackLabel.draw(String(table.stack));
    table.capLabel.draw(String(table.capacity));
  }

  function createScene() {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x16202d);
    scene.fog = new THREE.Fog(0x16202d, 18, 34);

    camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(14.5, 18.5, 15.5); camera.lookAt(10, 0.8, 10);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x314053, 1.35));
    const dir = new THREE.DirectionalLight(0xffffff, 1.8); dir.position.set(10, 18, 6); scene.add(dir);
    const fill = new THREE.DirectionalLight(0xffd8ad, 0.55); fill.position.set(-8, 6, -8); scene.add(fill);

    const floorTex = makeCanvasTexture((ctx, w, h) => {
      ctx.fillStyle = '#d6ba83'; ctx.fillRect(0, 0, w, h);
      const tile = w / 8;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { ctx.fillStyle = (x + y) % 2 === 0 ? '#e5cd9c' : '#d8b779'; ctx.fillRect(x * tile, y * tile, tile, tile); ctx.fillStyle = 'rgba(0,0,0,0.03)'; ctx.fillRect(x * tile, y * tile, tile, tile); }
      ctx.strokeStyle = 'rgba(90,60,35,0.18)'; ctx.lineWidth = 4; ctx.strokeRect(2, 2, w - 4, h - 4);
    });
    floorTex.repeat.set(2, 2);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.position.set(10, 0, 10); floor.receiveShadow = true; scene.add(floor);
    const grid = new THREE.GridHelper(20, 20, 0x8c6a43, 0xc7b088); grid.position.y = 0.03; scene.add(grid);

    for (let gx = 0; gx < GRID_W; gx++) { if (gx !== WORLD.entrance.gx) scene.add(addWallSegment(gx + 0.5, 0.5, 1, 2.6, 0x8f5f43)); scene.add(addWallSegment(gx + 0.5, 19.5, 1, 2.6, 0x8f5f43)); }
    for (let gz = 0; gz < GRID_H; gz++) { scene.add(addWallSegment(0.5, gz + 0.5, 1, 2.6, 0x8f5f43)); scene.add(addWallSegment(19.5, gz + 0.5, 1, 2.6, 0x8f5f43)); }
    for (let gx = 1; gx < GRID_W - 1; gx++) if (gx !== WORLD.entrance.gx) scene.add(addWallSegment(gx + 0.5, 7.5, 1, 2.2, 0x89593f));
    for (let gz = 1; gz < 7; gz++) { scene.add(addWallSegment(4.5, gz + 0.5, 1, 2.2, 0x89593f)); scene.add(addWallSegment(15.5, gz + 0.5, 1, 2.2, 0x89593f)); }

    const sign = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.45, 0.2), new THREE.MeshStandardMaterial({ color: 0x22314a, emissive: 0x0c1320, roughness: 0.6 })); sign.position.set(10, 2.1, 8.2); scene.add(sign);
    const signLabel = makeLabelSprite('RESTAURANT ENGINE 3D', '#111827', '#fff', 2.1, 0.8); signLabel.sprite.position.set(10, 2.9, 8.3); scene.add(signLabel.sprite);

    const stockCrate = new THREE.Group();
    for (let i = 0; i < 3; i++) { const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.8), new THREE.MeshStandardMaterial({ color: 0x5e452f, roughness: 1 })); box.position.set((i % 2) * 0.1, 0.25 + i * 0.18, (i % 2) * 0.04); stockCrate.add(box); }
    stockCrate.position.set(WORLD.stock.gx + 0.5, 0, WORLD.stock.gz + 0.5); scene.add(stockCrate);

    const ovenBody = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 1.0), new THREE.MeshStandardMaterial({ color: 0xa25136, roughness: 0.95 })); ovenBody.position.set(WORLD.oven.gx + 0.5, 0.45, WORLD.oven.gz + 0.5); scene.add(ovenBody);
    const ovenTop = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.16, 0.92), new THREE.MeshStandardMaterial({ color: 0xf1d19b, roughness: 0.95 })); ovenTop.position.set(WORLD.oven.gx + 0.5, 0.98, WORLD.oven.gz + 0.5); scene.add(ovenTop);
    ovenStack = makeStack(12, 0.1); ovenStack.group.position.set(WORLD.oven.gx + 0.5, 1.08, WORLD.oven.gz + 0.5); scene.add(ovenStack.group);

    const counter = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.95, 0.8), new THREE.MeshStandardMaterial({ color: 0x4f7f68, roughness: 0.95 })); counter.position.set(WORLD.counter.gx + 0.5, 0.48, WORLD.counter.gz + 0.5); scene.add(counter);
    const counterTop = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.12, 0.86), new THREE.MeshStandardMaterial({ color: 0xdde8dd, roughness: 0.95 })); counterTop.position.set(WORLD.counter.gx + 0.5, 0.98, WORLD.counter.gz + 0.5); scene.add(counterTop);
    const cashDesk = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.0, 0.85), new THREE.MeshStandardMaterial({ color: 0x647cff, roughness: 0.95 })); cashDesk.position.set(WORLD.cash.gx + 0.5, 0.5, WORLD.cash.gz + 0.5); scene.add(cashDesk);

    player = makeCharacter('player', 'player-main'); player.position.set(state.player.x, 0, state.player.z); scene.add(player);
    carryStack = makeStack(12, 0.25); carryStack.group.position.set(0, 1.48, 0.02); player.add(carryStack.group);
    chef = makeCharacter('chef', 'chef-main'); chef.position.set(WORLD.oven.gx + 1.8, 0, WORLD.oven.gz + 1.0); chef.scale.setScalar(0.94); scene.add(chef);

    tables.length = 0; buildMarkers.length = 0;
    for (const spot of BUILD_SPOTS) {
      const table = buildTable(spot, tables.length < START_ACTIVE_TABLES); tables.push(table);
      if (table.active) scene.add(table.group); else { const marker = createBuildMarker(table); buildMarkers.push(marker); scene.add(marker); }
      updateTableVisuals(table);
    }
    rebuildBlockedMap();
  }

  function addWallSegment(x, z, length, height, color) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, height, 1), new THREE.MeshStandardMaterial({ color, roughness: 0.98 }));
    mesh.position.set(x, height / 2, z); mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
  }

  function updatePlayer(dt) {
    let dx = 0, dz = 0;
    if (state.keys['w'] || state.keys['arrowup']) dz -= 1;
    if (state.keys['s'] || state.keys['arrowdown']) dz += 1;
    if (state.keys['a'] || state.keys['arrowleft']) dx -= 1;
    if (state.keys['d'] || state.keys['arrowright']) dx += 1;
    if (state.touch.active) { dx += state.touch.dx; dz += state.touch.dz; }
    const len = Math.hypot(dx, dz);
    if (len > 0.001) {
      dx /= len; dz /= len;
      const nx = state.player.x + dx * state.player.speed * dt;
      const nz = state.player.z + dz * state.player.speed * dt;
      if (canOccupy(nx, state.player.z)) state.player.x = nx;
      if (canOccupy(state.player.x, nz)) state.player.z = nz;
      state.player.angle = Math.atan2(dx, dz);
    }
    player.position.set(state.player.x, 0, state.player.z);
    player.rotation.y = state.player.angle;
    carryStack.group.visible = state.carry > 0;
  }

  function updateChef() { const r = chef.userData.rig; if (!r) return; const t = performance.now(); r.handL.rotation.z = -0.18 + Math.sin(t * 0.004) * 0.08; r.handR.rotation.z = 0.18 - Math.sin(t * 0.004) * 0.08; chef.rotation.y = Math.sin(t * 0.0012) * 0.08; }

  function updateOven(dt) {
    state.ovenTimer += dt;
    const interval = Math.max(1.5, 4.4 - state.ovenLevel * 0.35);
    while (state.ovenTimer >= interval) {
      state.ovenTimer -= interval;
      if (state.stock > 0 && ovenStack.count < ovenStack.max) {
        state.stock -= 1; ovenStack.count += 1; ovenStack.setCount(ovenStack.count); createParticle('+pizza', WORLD.oven.gx + 0.5, WORLD.oven.gz + 0.5, '#ffd166');
      } else break;
    }
  }

  function createParticle(text, x, z, color) {
    const p = makeLabelSprite(text, '#111827', color || '#fff', 1.8, 0.8); p.sprite.position.set(x, 1.6, z); scene.add(p.sprite); state.particles.push({ sprite: p.sprite, life: 1, speed: 0.4 });
  }

  function updateParticles(dt) {
    for (const p of state.particles) { p.life -= dt; p.sprite.position.y += dt * p.speed; p.sprite.material.opacity = clamp(p.life, 0, 1); }
    for (let i = state.particles.length - 1; i >= 0; i--) { const p = state.particles[i]; if (p.life > 0) continue; scene.remove(p.sprite); if (p.sprite.material.map && p.sprite.material.map.dispose) p.sprite.material.map.dispose(); p.sprite.material.dispose(); state.particles.splice(i, 1); }
  }

  function updateBuildMarkers() {
    const now = performance.now();
    for (const marker of buildMarkers) {
      if (!marker.visible) continue;
      const { arrow, ring, label } = marker.userData;
      arrow.rotation.y = now * 0.002; arrow.position.y = 1.05 + Math.sin(now * 0.003) * 0.05; ring.rotation.z = now * 0.004;
      const alpha = dist(state.player.x, state.player.z, marker.position.x, marker.position.z) < 2.2 ? 1 : 0.72;
      arrow.material.emissiveIntensity = alpha; ring.material.emissiveIntensity = alpha; label.sprite.material.opacity = alpha;
    }
  }

  function updateTables() { const now = performance.now(); for (const t of tables) { if (!t.active) continue; t.ring.visible = dist(state.player.x, state.player.z, t.gx + 0.5, t.gz + 0.5) < 1.8; t.ring.position.y = 0.08 + Math.sin(now * 0.004 + t.gx) * 0.02; } }
  function updateCamera(dt) { const px = state.player.x, pz = state.player.z; const t = 1 - Math.pow(0.001, dt); camera.position.x += (px + 11.5 - camera.position.x) * t; camera.position.y += (16.8 - camera.position.y) * t; camera.position.z += (pz + 11.5 - camera.position.z) * t; camera.lookAt(px, 0.95, pz); }

  function updateCustomer(c, dt) {
    if (c.dead) return;
    if (c.state === 'walking' || c.state === 'leaving') {
      if (!c.path.length) c.path = findPath(worldToCell(c.x, c.z), c.state === 'walking' ? c.table.seat : WORLD.entrance);
      const node = c.path[c.pathIndex];
      if (node) {
        const target = cellCenter(node.gx, node.gz); const dx = target.x - c.x, dz = target.z - c.z; const d = Math.hypot(dx, dz);
        if (d < 0.05) {
          if (c.pathIndex < c.path.length - 1) c.pathIndex += 1;
          else if (c.state === 'walking') {
            c.state = 'waiting'; c.waitTimer = 18 + Math.random() * 10; toast('Host sedí', `Objednal ${c.order} pizzu.`);
            if (c.table.stack > c.eaten) { c.state = 'eating'; c.eatTimer = 0.08; }
          } else {
            c.dead = true; scene.remove(c.mesh);
          }
        } else {
          const speed = c.state === 'walking' ? 1.9 : 2.2; c.x += (dx / d) * speed * dt; c.z += (dz / d) * speed * dt; c.mesh.position.set(c.x, 0, c.z); c.mesh.rotation.y = Math.atan2(dx, dz);
        }
      }
    } else if (c.state === 'waiting') {
      if (c.table.stack > c.eaten) { c.state = 'eating'; c.eatTimer = 0.06; }
      else { c.waitTimer -= dt; if (c.waitTimer <= 0) { c.state = 'leaving'; c.path = findPath(worldToCell(c.x, c.z), WORLD.entrance); c.pathIndex = 0; state.rep = Math.max(0, state.rep - 1); c.table.occupied = false; c.table.customerId = null; updateTableVisuals(c.table); rebuildBlockedMap(); toast('Host odchází', 'Příliš dlouhé čekání.'); } }
    } else if (c.state === 'eating') {
      c.eatTimer -= dt;
      if (c.eatTimer <= 0) {
        if (c.table.stack > 0 && c.eaten < c.order) { c.table.stack -= 1; c.eaten += 1; updateTableVisuals(c.table); createParticle('-pizza', c.table.gx + 0.5, c.table.gz + 0.5, '#ffcf6f'); }
        if (c.eaten >= c.order) { payAndLeave(c); return; }
        c.state = (c.table.stack > c.eaten) ? 'eating' : 'waiting'; c.eatTimer = 0.4;
      }
    }
    c.mesh.position.set(c.x, 0, c.z);
    updateCharacterAnimation(c.mesh, c.state);
  }

  function payAndLeave(customer) {
    if (customer.paid) return;
    customer.paid = true;
    state.money += customer.reward;
    state.rep += 1;
    createParticle(`+${customer.reward}`, customer.table.gx + 0.5, customer.table.gz + 0.5, '#8fe08f');
    customer.table.occupied = false;
    customer.table.customerId = null;
    updateTableVisuals(customer.table);
    rebuildBlockedMap();
    customer.state = 'leaving';
    customer.path = findPath(worldToCell(customer.x, customer.z), WORLD.entrance);
    customer.pathIndex = 0;
    toast('Host zaplatil', `+${customer.reward}`);
  }

  function updateTable() {
    // placeholder: logic handled in updateCustomer and interactions
  }

  function updateHUD() {
    ui.money.textContent = Math.floor(state.money);
    ui.stock.textContent = state.stock;
    ui.carry.textContent = `${state.carry}/${state.carryCap}`;
    ui.oven.textContent = ovenStack.count;
    ui.waiting.textContent = state.customers.filter(c => !c.dead && c.state !== 'leaving').length;
    ui.rep.textContent = state.rep;
    ui.upgradeCarryBtn.textContent = `Kapacita (${15 * state.carryCap})`;
    ui.upgradeOvenBtn.textContent = `Pec (${20 * state.ovenLevel})`;
  }

  function nearestTable() { let best = null, bestD = Infinity; for (const t of tables) if (t.active) { const c = cellCenter(t.gx, t.gz); const d = dist(state.player.x, state.player.z, c.x, c.z); if (d < bestD) { bestD = d; best = t; } } return best; }
  function nearestBuildMarker() { let best = null, bestD = Infinity; for (const marker of buildMarkers) if (marker.visible) { const p = marker.position; const d = dist(state.player.x, state.player.z, p.x, p.z); if (d < bestD) { bestD = d; best = marker; } } return best; }

  function buildTableFromMarker(marker) {
    const table = marker.userData.table; if (table.active) return;
    if (state.money < table.cost) return toast('Málo peněz', `Potřebuješ ${table.cost}.`);
    const safe = tryFindSafeSpotAround(marker.position.x, marker.position.z); if (!safe) return toast('Není kam ustoupit', 'Nejdřív se odsuň od místa stavby.');
    state.money -= table.cost; state.player.x = safe.x; state.player.z = safe.z; player.position.set(safe.x, 0, safe.z); table.active = true; scene.add(table.group); marker.visible = false; rebuildBlockedMap(); toast('Stůl postaven', `Za ${table.cost}.`);
  }

  function collectFromOven() {
    if (dist(state.player.x, state.player.z, WORLD.oven.gx + 0.5, WORLD.oven.gz + 0.5) > 1.25) return false;
    const take = Math.min(ovenStack.count, state.carryCap - state.carry);
    if (take <= 0) return toast(ovenStack.count === 0 ? 'V peci nic není' : 'Máš plnou kapacitu'), true;
    ovenStack.count -= take; state.carry += take; ovenStack.setCount(ovenStack.count); carryStack.setCount(state.carry); createParticle('+' + take, WORLD.oven.gx + 0.5, WORLD.oven.gz + 0.5, '#ffd166'); toast('Pizza naložena', `Vzato ${take}.`); return true;
  }

  function serveTable(table, customer) {
    if (state.carry <= 0) return toast('Nemáš pizzu'), true;
    if (customer.state === 'leaving') return toast('Host už odchází'), true;
    state.carry -= 1; table.stack += 1; customer.eaten = customer.eaten || 0; carryStack.setCount(state.carry); updateTableVisuals(table); createParticle('-pizza', table.gx + 0.5, table.gz + 0.5, '#ffcf6f'); toast('Pizza podána', 'Na stůl přibyla další pizza.');
    if (customer.state === 'waiting' || customer.state === 'walking') { customer.state = 'eating'; customer.eatTimer = 0.1; }
    return true;
  }

  function interact() {
    const marker = nearestBuildMarker();
    if (marker && dist(state.player.x, state.player.z, marker.position.x, marker.position.z) < 1.7) return buildTableFromMarker(marker);
    const table = nearestTable();
    if (table) {
      const c = cellCenter(table.gx, table.gz);
      if (dist(state.player.x, state.player.z, c.x, c.z) < 1.6) {
        const customer = state.customers.find(x => x.table === table && !x.dead);
        if (customer && serveTable(table, customer)) return;
      }
    }
    if (collectFromOven()) return;
    if (dist(state.player.x, state.player.z, WORLD.stock.gx + 0.5, WORLD.stock.gz + 0.5) < 1.25) return buyStock();
    if (dist(state.player.x, state.player.z, WORLD.counter.gx + 0.5, WORLD.counter.gz + 0.5) < 1.25) return upgradeCarry();
    if (dist(state.player.x, state.player.z, WORLD.cash.gx + 0.5, WORLD.cash.gz + 0.5) < 1.25) return upgradeOven();
    toast('Nic k akci', 'Přibliž se ke stolu, stavbě, peci nebo skladu.');
  }

  function hasFreeTable() { return tables.some(t => t.active && !t.occupied); }

  function spawnCustomer(manual = false) {
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
    table.occupied = true; table.customerId = c.id; table.stack = 0; updateTableVisuals(table); rebuildBlockedMap(); c.path = findPath(worldToCell(c.x, c.z), table.seat); state.customers.push(c); if (manual) toast('Host přišel', 'Přivolán ke stolu.'); return true;
  }

  function buyStock() {
    if (state.money >= 5) { state.money -= 5; state.stock += 5; createParticle('+5', WORLD.stock.gx + 0.5, WORLD.stock.gz + 0.5, '#8fe08f'); toast('Suroviny koupeny'); return; }
    const now = performance.now();
    if (now >= state.emergencyAt) { state.stock += 3; state.emergencyAt = now + 30000; createParticle('+3', WORLD.stock.gx + 0.5, WORLD.stock.gz + 0.5, '#8fe08f'); toast('Nouzové suroviny', 'Dostals 3 zdarma, aby se hra nezasekla.'); return; }
    toast('Málo peněz', 'Počkej na nouzové doplnění nebo reklamu.');
  }
  function upgradeCarry() { const cost = 15 * state.carryCap; if (state.money < cost) return toast('Málo peněz', `Potřebuješ ${cost}.`); state.money -= cost; state.carryCap += 2; toast('Kapacita zvýšena', 'Uneseš více pizz.'); }
  function upgradeOven() { const cost = 20 * state.ovenLevel; if (state.money < cost) return toast('Málo peněz', `Potřebuješ ${cost}.`); state.money -= cost; state.ovenLevel += 1; toast('Pec vylepšena', 'Pec bude rychlejší.'); }

  function save() {
    const data = { money: state.money, stock: state.stock, carry: state.carry, carryCap: state.carryCap, rep: state.rep, ovenLevel: state.ovenLevel, player: { x: state.player.x, z: state.player.z, angle: state.player.angle }, oven: { stack: ovenStack.count, timer: state.ovenTimer }, tables: tables.map(t => ({ active: t.active, capacity: t.capacity, stack: t.stack })) };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data)); toast('Uloženo');
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY); if (!raw) return;
      const data = JSON.parse(raw);
      if (typeof data.money === 'number') state.money = data.money;
      if (typeof data.stock === 'number') state.stock = data.stock;
      if (typeof data.carry === 'number') state.carry = data.carry;
      if (typeof data.carryCap === 'number') state.carryCap = data.carryCap;
      if (typeof data.rep === 'number') state.rep = data.rep;
      if (typeof data.ovenLevel === 'number') state.ovenLevel = data.ovenLevel;
      if (data.player) { if (typeof data.player.x === 'number') state.player.x = data.player.x; if (typeof data.player.z === 'number') state.player.z = data.player.z; if (typeof data.player.angle === 'number') state.player.angle = data.player.angle; }
      if (data.oven) { if (typeof data.oven.stack === 'number') ovenStack.count = data.oven.stack; if (typeof data.oven.timer === 'number') state.ovenTimer = data.oven.timer; }
      if (Array.isArray(data.tables)) data.tables.forEach((src, i) => { if (!tables[i]) return; tables[i].active = !!src.active; tables[i].capacity = typeof src.capacity === 'number' ? src.capacity : tables[i].capacity; tables[i].stack = typeof src.stack === 'number' ? src.stack : tables[i].stack; if (tables[i].active) scene.add(tables[i].group); else { const marker = buildMarkers[i]; if (marker) marker.visible = true; } updateTableVisuals(tables[i]); });
      rebuildBlockedMap();
    } catch (err) { console.warn(err); }
  }

  function reset() {
    localStorage.removeItem(SAVE_KEY);
    state.money = 25; state.stock = 8; state.carry = 0; state.carryCap = 5; state.rep = 0; state.ovenLevel = 1; state.player.x = 10.5; state.player.z = 17.5; state.player.angle = 0; state.ovenTimer = 0; state.customers.slice().forEach(c => scene.remove(c.mesh)); state.customers.length = 0; state.particles.slice().forEach(p => scene.remove(p.sprite)); state.particles.length = 0;
    tables.forEach((t, i) => { t.stack = 0; t.customerId = null; t.occupied = false; t.active = i < START_ACTIVE_TABLES; if (t.active && !scene.children.includes(t.group)) scene.add(t.group); const marker = buildMarkers[i]; if (marker) marker.visible = !t.active; updateTableVisuals(t); });
    ovenStack.count = 0; ovenStack.setCount(0); carryStack.setCount(0); rebuildBlockedMap(); toast('Reset hotov');
  }

  function setupJoystick() {
    ui.stick.style.position = 'fixed'; ui.stick.style.left = '0px'; ui.stick.style.top = '0px'; ui.stick.style.transform = 'translate(-9999px,-9999px)'; ui.stick.style.opacity = '0'; ui.stick.style.pointerEvents = 'none'; ui.stick.style.zIndex = '70'; ui.nub.style.transform = 'translate(-50%, -50%)'; ui.nub.style.pointerEvents = 'none';
    window.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') return; if (e.target && typeof e.target.closest === 'function' && e.target.closest('.hud, .top-actions, .footer, button')) return; if (e.clientX > window.innerWidth * 0.58) return; state.touch.active = true; state.touch.id = e.pointerId; state.touch.cx = e.clientX; state.touch.cy = e.clientY; ui.stick.style.left = `${e.clientX}px`; ui.stick.style.top = `${e.clientY}px`; ui.stick.style.transform = 'translate(-50%, -50%)'; ui.stick.style.opacity = '1'; setStick(0, 0); e.preventDefault(); }, { passive: false });
    window.addEventListener('pointermove', (e) => { if (!state.touch.active || e.pointerId !== state.touch.id) return; setStick(e.clientX - state.touch.cx, e.clientY - state.touch.cy); e.preventDefault(); }, { passive: false });
    const end = (e) => { if (!state.touch.active || e.pointerId !== state.touch.id) return; hideStick(); e.preventDefault(); };
    window.addEventListener('pointerup', end, { passive: false }); window.addEventListener('pointercancel', end, { passive: false });
  }
  function setStick(dx, dz) { const max = state.touch.max; const len = Math.hypot(dx, dz); if (len > max) { dx = dx / len * max; dz = dz / len * max; } ui.nub.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dz}px)`; state.touch.dx = dx / max; state.touch.dz = dz / max; }
  function hideStick() { state.touch.active = false; state.touch.id = null; state.touch.dx = 0; state.touch.dz = 0; ui.stick.style.opacity = '0'; ui.stick.style.transform = 'translate(-9999px,-9999px)'; ui.nub.style.transform = 'translate(-50%, -50%)'; }

  function onKeyDown(e) { state.keys[e.key.toLowerCase()] = true; if (e.key.toLowerCase() === 'e' || e.key === ' ') { e.preventDefault(); interact(); } }
  function onKeyUp(e) { state.keys[e.key.toLowerCase()] = false; }

  function makeRewardButton() {
    const btn = document.createElement('button'); btn.id = 'adRewardBtn'; btn.className = 'secondary'; btn.style.marginLeft = '8px'; btn.textContent = 'Reklama +5';
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); const now = performance.now(); if (now < state.adCooldownAt) return toast('Reklama ještě není připravená', `${Math.ceil((state.adCooldownAt - now) / 1000)} s`); state.money += 5; state.adCooldownAt = now + 30000; toast('Odměna za reklamu', '+5 peněz'); });
    btn.addEventListener('click', (e) => { e.preventDefault(); btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); });
    return btn;
  }

  function hasFreeTable() { return tables.some(t => t.active && !t.occupied); }
  function spawnLoop(dt) { state.lastSpawn += dt; if (state.lastSpawn > 8.5) { if (hasFreeTable()) { if (spawnCustomer(false)) state.lastSpawn = 0; } else state.lastSpawn = 7.5; } }

  function updateLoop(now) {
    try {
      const dt = Math.min(0.033, ((now || 0) - (updateLoop.last || now)) / 1000 || 0.016);
      updateLoop.last = now || performance.now();
      updatePlayer(dt); updateChef(); updateOven(dt); spawnLoop(dt);
      for (const c of state.customers) updateCustomer(c, dt);
      for (let i = state.customers.length - 1; i >= 0; i--) if (state.customers[i].dead) state.customers.splice(i, 1);
      updateParticles(dt); updateTables(); updateBuildMarkers(); updateHUD(); updateCamera(dt); renderer.render(scene, camera);
    } catch (err) { console.error(err); toast('Chyba běhu', 'Zkusil jsem pokračovat.'); }
    requestAnimationFrame(updateLoop);
  }

  function init() {
    createScene(); setupJoystick(); ui.spawnBtn.addEventListener('click', () => spawnCustomer(true)); ui.buyStockBtn.addEventListener('click', buyStock); ui.upgradeCarryBtn.addEventListener('click', upgradeCarry); ui.upgradeOvenBtn.addEventListener('click', upgradeOven); ui.saveBtn.addEventListener('click', save); ui.resetBtn.addEventListener('click', reset); ui.actionBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); interact(); }); ui.actionBtn.addEventListener('touchstart', (e) => { e.preventDefault(); interact(); }, { passive: false }); ui.actionBtn.addEventListener('click', (e) => { e.preventDefault(); interact(); }); ui.actionBtn.style.touchAction = 'manipulation'; document.querySelector('.top-actions')?.appendChild(makeRewardButton()); load(); state.player.x = clamp(state.player.x, 1.2, GRID_W - 1.2); state.player.z = clamp(state.player.z, 1.2, GRID_H - 1.2); player.position.set(state.player.x, 0, state.player.z); ovenStack.setCount(ovenStack.count); carryStack.setCount(state.carry); toast('Engine ready', 'Verze se zbylou pizzou na stolech.'); window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp); window.addEventListener('resize', () => { renderer.setSize(window.innerWidth, window.innerHeight, false); camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75)); }); requestAnimationFrame(updateLoop);
  }

  function interact() {
    const marker = nearestBuildMarker();
    if (marker && dist(state.player.x, state.player.z, marker.position.x, marker.position.z) < 1.7) return buildTableFromMarker(marker);
    const table = nearestTable();
    if (table) {
      const c = cellCenter(table.gx, table.gz);
      if (dist(state.player.x, state.player.z, c.x, c.z) < 1.6) {
        const customer = state.customers.find(x => x.table === table && !x.dead);
        if (customer && serveTable(table, customer)) return;
      }
    }
    if (collectFromOven()) return;
    if (dist(state.player.x, state.player.z, WORLD.stock.gx + 0.5, WORLD.stock.gz + 0.5) < 1.25) return buyStock();
    if (dist(state.player.x, state.player.z, WORLD.counter.gx + 0.5, WORLD.counter.gz + 0.5) < 1.25) return upgradeCarry();
    if (dist(state.player.x, state.player.z, WORLD.cash.gx + 0.5, WORLD.cash.gz + 0.5) < 1.25) return upgradeOven();
    toast('Nic k akci', 'Přibliž se ke stolu, stavbě, peci nebo skladu.');
  }

  function updateTableVisuals(table) { table.stackModel.count = table.stack; table.stackModel.setCount(table.stack); table.stackLabel.draw(String(table.stack)); table.capLabel.draw(String(table.capacity)); }
  function updateHUD() { ui.money.textContent = Math.floor(state.money); ui.stock.textContent = state.stock; ui.carry.textContent = `${state.carry}/${state.carryCap}`; ui.oven.textContent = ovenStack.count; ui.waiting.textContent = state.customers.filter(c => !c.dead && c.state !== 'leaving').length; ui.rep.textContent = state.rep; ui.upgradeCarryBtn.textContent = `Kapacita (${15 * state.carryCap})`; ui.upgradeOvenBtn.textContent = `Pec (${20 * state.ovenLevel})`; }

  function buyStock() { if (state.money >= 5) { state.money -= 5; state.stock += 5; createParticle('+5', WORLD.stock.gx + 0.5, WORLD.stock.gz + 0.5, '#8fe08f'); toast('Suroviny koupeny'); return; } const now = performance.now(); if (now >= state.emergencyAt) { state.stock += 3; state.emergencyAt = now + 30000; createParticle('+3', WORLD.stock.gx + 0.5, WORLD.stock.gz + 0.5, '#8fe08f'); toast('Nouzové suroviny', 'Dostals 3 zdarma, aby se hra nezasekla.'); return; } toast('Málo peněz', 'Počkej na nouzové doplnění nebo reklamu.'); }
  function upgradeCarry() { const cost = 15 * state.carryCap; if (state.money < cost) return toast('Málo peněz', `Potřebuješ ${cost}.`); state.money -= cost; state.carryCap += 2; toast('Kapacita zvýšena', 'Uneseš více pizz.'); }
  function upgradeOven() { const cost = 20 * state.ovenLevel; if (state.money < cost) return toast('Málo peněz', `Potřebuješ ${cost}.`); state.money -= cost; state.ovenLevel += 1; toast('Pec vylepšena', 'Pec bude rychlejší.'); }

  function load() { try { const raw = localStorage.getItem(SAVE_KEY); if (!raw) return; const data = JSON.parse(raw); if (typeof data.money === 'number') state.money = data.money; if (typeof data.stock === 'number') state.stock = data.stock; if (typeof data.carry === 'number') state.carry = data.carry; if (typeof data.carryCap === 'number') state.carryCap = data.carryCap; if (typeof data.rep === 'number') state.rep = data.rep; if (typeof data.ovenLevel === 'number') state.ovenLevel = data.ovenLevel; if (data.player) { if (typeof data.player.x === 'number') state.player.x = data.player.x; if (typeof data.player.z === 'number') state.player.z = data.player.z; if (typeof data.player.angle === 'number') state.player.angle = data.player.angle; } if (data.oven) { if (typeof data.oven.stack === 'number') ovenStack.count = data.oven.stack; if (typeof data.oven.timer === 'number') state.ovenTimer = data.oven.timer; } if (Array.isArray(data.tables)) data.tables.forEach((src, i) => { if (!tables[i]) return; tables[i].active = !!src.active; tables[i].capacity = typeof src.capacity === 'number' ? src.capacity : tables[i].capacity; tables[i].stack = typeof src.stack === 'number' ? src.stack : tables[i].stack; if (tables[i].active) scene.add(tables[i].group); else { const marker = buildMarkers[i]; if (marker) marker.visible = true; } updateTableVisuals(tables[i]); }); rebuildBlockedMap(); } catch (err) { console.warn(err); } }
  function save() { const data = { money: state.money, stock: state.stock, carry: state.carry, carryCap: state.carryCap, rep: state.rep, ovenLevel: state.ovenLevel, player: { x: state.player.x, z: state.player.z, angle: state.player.angle }, oven: { stack: ovenStack.count, timer: state.ovenTimer }, tables: tables.map(t => ({ active: t.active, capacity: t.capacity, stack: t.stack })) }; localStorage.setItem(SAVE_KEY, JSON.stringify(data)); toast('Uloženo'); }
  function reset() { localStorage.removeItem(SAVE_KEY); state.money = 25; state.stock = 8; state.carry = 0; state.carryCap = 5; state.rep = 0; state.ovenLevel = 1; state.player.x = 10.5; state.player.z = 17.5; state.player.angle = 0; state.ovenTimer = 0; state.customers.slice().forEach(c => scene.remove(c.mesh)); state.customers.length = 0; state.particles.slice().forEach(p => scene.remove(p.sprite)); state.particles.length = 0; tables.forEach((t, i) => { t.stack = 0; t.customerId = null; t.occupied = false; t.active = i < START_ACTIVE_TABLES; if (t.active && !scene.children.includes(t.group)) scene.add(t.group); const marker = buildMarkers[i]; if (marker) marker.visible = !t.active; updateTableVisuals(t); }); ovenStack.count = 0; ovenStack.setCount(0); carryStack.setCount(0); rebuildBlockedMap(); toast('Reset hotov'); }

  function setupJoystick() { ui.stick.style.position = 'fixed'; ui.stick.style.left = '0px'; ui.stick.style.top = '0px'; ui.stick.style.transform = 'translate(-9999px,-9999px)'; ui.stick.style.opacity = '0'; ui.stick.style.pointerEvents = 'none'; ui.stick.style.zIndex = '70'; ui.nub.style.transform = 'translate(-50%, -50%)'; ui.nub.style.pointerEvents = 'none'; window.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') return; if (e.target && typeof e.target.closest === 'function' && e.target.closest('.hud, .top-actions, .footer, button')) return; if (e.clientX > window.innerWidth * 0.58) return; state.touch.active = true; state.touch.id = e.pointerId; state.touch.cx = e.clientX; state.touch.cy = e.clientY; ui.stick.style.left = `${e.clientX}px`; ui.stick.style.top = `${e.clientY}px`; ui.stick.style.transform = 'translate(-50%, -50%)'; ui.stick.style.opacity = '1'; setStick(0, 0); e.preventDefault(); }, { passive: false }); window.addEventListener('pointermove', (e) => { if (!state.touch.active || e.pointerId !== state.touch.id) return; setStick(e.clientX - state.touch.cx, e.clientY - state.touch.cy); e.preventDefault(); }, { passive: false }); const end = (e) => { if (!state.touch.active || e.pointerId !== state.touch.id) return; hideStick(); e.preventDefault(); }; window.addEventListener('pointerup', end, { passive: false }); window.addEventListener('pointercancel', end, { passive: false }); }
  function setStick(dx, dz) { const max = state.touch.max; const len = Math.hypot(dx, dz); if (len > max) { dx = dx / len * max; dz = dz / len * max; } ui.nub.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dz}px)`; state.touch.dx = dx / max; state.touch.dz = dz / max; }
  function hideStick() { state.touch.active = false; state.touch.id = null; state.touch.dx = 0; state.touch.dz = 0; ui.stick.style.opacity = '0'; ui.stick.style.transform = 'translate(-9999px,-9999px)'; ui.nub.style.transform = 'translate(-50%, -50%)'; }
  function onKeyDown(e) { state.keys[e.key.toLowerCase()] = true; if (e.key.toLowerCase() === 'e' || e.key === ' ') { e.preventDefault(); interact(); } }
  function onKeyUp(e) { state.keys[e.key.toLowerCase()] = false; }

  function makeRewardButton() { const btn = document.createElement('button'); btn.id = 'adRewardBtn'; btn.className = 'secondary'; btn.style.marginLeft = '8px'; btn.textContent = 'Reklama +5'; btn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); const now = performance.now(); if (now < state.adCooldownAt) return toast('Reklama ještě není připravená', `${Math.ceil((state.adCooldownAt - now) / 1000)} s`); state.money += 5; state.adCooldownAt = now + 30000; toast('Odměna za reklamu', '+5 peněz'); }); btn.addEventListener('click', (e) => { e.preventDefault(); btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); }); return btn; }

  function init() {
    createScene(); setupJoystick(); ui.spawnBtn.addEventListener('click', () => spawnCustomer(true)); ui.buyStockBtn.addEventListener('click', buyStock); ui.upgradeCarryBtn.addEventListener('click', upgradeCarry); ui.upgradeOvenBtn.addEventListener('click', upgradeOven); ui.saveBtn.addEventListener('click', save); ui.resetBtn.addEventListener('click', reset); ui.actionBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); interact(); }); ui.actionBtn.addEventListener('touchstart', (e) => { e.preventDefault(); interact(); }, { passive: false }); ui.actionBtn.addEventListener('click', (e) => { e.preventDefault(); interact(); }); ui.actionBtn.style.touchAction = 'manipulation'; document.querySelector('.top-actions')?.appendChild(makeRewardButton()); load(); state.player.x = clamp(state.player.x, 1.2, GRID_W - 1.2); state.player.z = clamp(state.player.z, 1.2, GRID_H - 1.2); player.position.set(state.player.x, 0, state.player.z); ovenStack.setCount(ovenStack.count); carryStack.setCount(state.carry); toast('Stable v13', 'Zbylé pizzy na stolech se teď počítají pro další hosty.'); window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp); window.addEventListener('resize', () => { renderer.setSize(window.innerWidth, window.innerHeight, false); camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75)); }); requestAnimationFrame(updateLoop);
  }

  init();
})();
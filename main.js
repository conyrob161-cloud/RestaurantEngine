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
    nub: document.getElementById('nub')
  };

  const SAVE_KEY = 'restaurant-engine-3d-v1';
  const GRID_W = 20;
  const GRID_H = 20;
  const ROOM_HALF = 10;
  const RENDER_SCALE = 1.8;

  const world = {
    stock: { gx: 3, gz: 3 },
    oven: { gx: 6, gz: 4, stack: 0, timer: 0, interval: 4.1, maxStack: 8 },
    counter: { gx: 9, gz: 4 },
    cash: { gx: 16, gz: 3 },
    entrance: { gx: 10, gz: 18 }
  };

  const tables = [
    { gx: 6, gz: 9, seat: { gx: 6, gz: 10 }, occupied: false, bill: 0, customerId: null, ring: null },
    { gx: 13, gz: 9, seat: { gx: 13, gz: 10 }, occupied: false, bill: 0, customerId: null, ring: null },
    { gx: 6, gz: 14, seat: { gx: 6, gz: 15 }, occupied: false, bill: 0, customerId: null, ring: null },
    { gx: 13, gz: 14, seat: { gx: 13, gz: 15 }, occupied: false, bill: 0, customerId: null, ring: null }
  ];

  const blocked = Array.from({ length: GRID_H }, () => Array(GRID_W).fill(false));
  const state = {
    money: 25,
    stock: 8,
    carry: 0,
    carryCap: 5,
    rep: 0,
    ovenLevel: 1,
    player: { x: 10.5, z: 17.5, speed: 3.8 },
    keys: {},
    touch: { active: false, id: null, dx: 0, dz: 0, cx: 0, cy: 0 },
    customers: [],
    selectedTable: 0,
    particles: [],
    lastSpawn: 0
  };

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function dist(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }
  function cellCenter(gx, gz) { return { x: gx + 0.5, z: gz + 0.5 }; }
  function worldToCell(x, z) { return { gx: Math.floor(x), gz: Math.floor(z) }; }
  function cellBlocked(gx, gz) {
    if (gx < 0 || gz < 0 || gx >= GRID_W || gz >= GRID_H) return true;
    return blocked[gz][gx];
  }

  function block(gx, gz) {
    if (gx >= 0 && gz >= 0 && gx < GRID_W && gz < GRID_H) blocked[gz][gx] = true;
  }

  function buildBlockedMap() {
    for (let gx = 0; gx < GRID_W; gx++) {
      block(gx, 0);
      block(gx, GRID_H - 1);
    }
    for (let gz = 0; gz < GRID_H; gz++) {
      block(0, gz);
      block(GRID_W - 1, gz);
    }
    for (let gx = 1; gx < GRID_W - 1; gx++) {
      if (gx !== world.entrance.gx) block(gx, 7);
    }
    for (let gz = 1; gz < 7; gz++) {
      block(4, gz);
      block(15, gz);
    }
    block(world.stock.gx, world.stock.gz);
    block(world.oven.gx, world.oven.gz);
    block(world.counter.gx, world.counter.gz);
    block(world.cash.gx, world.cash.gz);
    for (const t of tables) block(t.gx, t.gz);
  }
  buildBlockedMap();

  function canOccupy(x, z, radius = 0.22) {
    const samples = [
      [0, 0],
      [radius, 0],
      [-radius, 0],
      [0, radius],
      [0, -radius],
      [radius, radius],
      [radius, -radius],
      [-radius, radius],
      [-radius, -radius]
    ];
    return samples.every(([dx, dz]) => {
      const c = worldToCell(x + dx, z + dz);
      return !cellBlocked(c.gx, c.gz);
    });
  }

  function makeCanvasTexture(drawFn, size = 256) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    drawFn(ctx, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    return tex;
  }

  function makeLabelSprite(text, bg = '#111827', fg = '#ffffff') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;

    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.scale.set(2.6, 1.3, 1);

    function roundRect(x, y, w, h, r) {
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
    }

    function draw(value) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(0,0,0,0)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = bg;
      roundRect(24, 44, 464, 168, 32);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.fillStyle = fg;
      ctx.font = '900 56px system-ui, Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(value, 256, 128);
      tex.needsUpdate = true;
    }

    draw(text);
    return { sprite, draw };
  }

  function makePizza() {
    const group = new THREE.Group();
    const crust = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.24, 0.06, 6),
      new THREE.MeshStandardMaterial({ color: 0xc47a3a, roughness: 0.95 })
    );
    const cheese = new THREE.Mesh(
      new THREE.CylinderGeometry(0.19, 0.21, 0.03, 6),
      new THREE.MeshStandardMaterial({ color: 0xf0ca78, roughness: 0.9 })
    );
    cheese.position.y = 0.04;
    crust.add(cheese);
    group.add(crust);
    return group;
  }

  function makePizzaStack(max = 8) {
    const group = new THREE.Group();
    const pizzas = [];
    for (let i = 0; i < max; i++) {
      const pizza = makePizza();
      pizza.position.y = 0.02 * i;
      pizza.rotation.y = i * 0.4;
      pizza.visible = i < 0;
      pizzas.push(pizza);
      group.add(pizza);
    }
    function setCount(count) {
      pizzas.forEach((p, i) => {
        p.visible = i < count;
        p.position.y = 0.02 * i;
      });
      group.visible = count > 0;
    }
    setCount(0);
    return { group, setCount };
  }

  function makeCharacter(primary = 0x3b82f6, skin = 0xf2d1b5) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: primary, roughness: 0.9 });
    const headMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.95 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.92, 6), bodyMat);
    body.position.y = 0.52;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), headMat);
    head.position.y = 1.10;
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.22, 0.18, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }));
    hat.position.y = 1.34;
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.34, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    group.add(shadow, body, head, hat);
    return { group, bodyMat, headMat };
  }

  function makeTableMesh() {
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

  function makeChair() {
    const group = new THREE.Group();
    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.08, 0.36),
      new THREE.MeshStandardMaterial({ color: 0x8f654b, roughness: 0.95 })
    );
    seat.position.y = 0.42;
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.34, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x7a573f, roughness: 0.95 })
    );
    back.position.set(0, 0.68, -0.14);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x6d4c3a, roughness: 0.95 });
    const legs = [
      [-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]
    ].map(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.42, 0.04), legMat);
      leg.position.set(x, 0.21, z);
      return leg;
    });
    group.add(seat, back, ...legs);
    return group;
  }

  function addWallSegment(x, z, length, height, horizontal, color) {
    const mesh = new THREE.Mesh(
      horizontal ? new THREE.BoxGeometry(length, height, 1) : new THREE.BoxGeometry(1, height, length),
      new THREE.MeshStandardMaterial({ color, roughness: 0.98 })
    );
    mesh.position.set(x, height / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  function makeStaticProp(geometry, color, position, rotationY = 0) {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
    mesh.position.set(position.x, position.y, position.z);
    mesh.rotation.y = rotationY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x16202d);
  scene.fog = new THREE.Fog(0x16202d, 18, 34);

  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(14.5, 18.5, 15.5);
  camera.lookAt(10, 0.8, 10);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x314053, 1.4);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 1.9);
  dir.position.set(10, 18, 6);
  dir.castShadow = true;
  dir.shadow.mapSize.width = 1024;
  dir.shadow.mapSize.height = 1024;
  dir.shadow.camera.near = 1;
  dir.shadow.camera.far = 50;
  dir.shadow.camera.left = -18;
  dir.shadow.camera.right = 18;
  dir.shadow.camera.top = 18;
  dir.shadow.camera.bottom = -18;
  scene.add(dir);

  const fill = new THREE.DirectionalLight(0xffd8ad, 0.55);
  fill.position.set(-8, 6, -8);
  scene.add(fill);

  const floorTexture = makeCanvasTexture((ctx, w, h) => {
    ctx.fillStyle = '#d6ba83';
    ctx.fillRect(0, 0, w, h);
    const tile = w / 8;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#e5cd9c' : '#d8b779';
        ctx.fillRect(x * tile, y * tile, tile, tile);
        ctx.fillStyle = 'rgba(0,0,0,0.03)';
        ctx.fillRect(x * tile, y * tile, tile, tile);
      }
    }
    ctx.strokeStyle = 'rgba(90,60,35,0.18)';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);
  }, 256);
  floorTexture.repeat.set(2, 2);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(10, 0, 10);
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(20, 20, 0x8c6a43, 0xc7b088);
  grid.position.y = 0.03;
  scene.add(grid);

  for (let gx = 0; gx < GRID_W; gx++) {
    if (gx !== world.entrance.gx) addWallSegment(gx + 0.5, 0.5, 1, 2.6, false, 0x8f5f43);
    addWallSegment(gx + 0.5, 19.5, 1, 2.6, false, 0x8f5f43);
  }
  for (let gz = 0; gz < GRID_H; gz++) {
    addWallSegment(0.5, gz + 0.5, 1, 2.6, false, 0x8f5f43);
    addWallSegment(19.5, gz + 0.5, 1, 2.6, false, 0x8f5f43);
  }
  for (let gx = 1; gx < GRID_W - 1; gx++) {
    if (gx === 10) continue;
    addWallSegment(gx + 0.5, 7.5, 1, 2.2, false, 0x89593f);
  }
  for (let gz = 1; gz < 7; gz++) {
    addWallSegment(4.5, gz + 0.5, 1, 2.2, false, 0x89593f);
    addWallSegment(15.5, gz + 0.5, 1, 2.2, false, 0x89593f);
  }

  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(4.8, 0.45, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x22314a, emissive: 0x0c1320, roughness: 0.6 })
  );
  sign.position.set(10, 2.1, 8.2);
  sign.castShadow = true;
  scene.add(sign);

  const signLabel = makeLabelSprite('RESTAURANT ENGINE 3D', '#111827', '#ffffff');
  signLabel.sprite.position.set(10, 2.9, 8.3);
  scene.add(signLabel.sprite);

  const stockCrate = new THREE.Group();
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x5e452f, roughness: 1 });
  for (let i = 0; i < 3; i++) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.8), crateMat);
    box.position.set((i % 2) * 0.1, 0.25 + i * 0.18, (i % 2) * 0.04);
    box.castShadow = true;
    box.receiveShadow = true;
    stockCrate.add(box);
  }
  stockCrate.position.set(world.stock.gx + 0.5, 0, world.stock.gz + 0.5);
  scene.add(stockCrate);

  const oven = new THREE.Group();
  const ovenBody = makeStaticProp(new THREE.BoxGeometry(1.2, 0.9, 1.0), 0xa25136, { x: world.oven.gx + 0.5, y: 0.45, z: world.oven.gz + 0.5 });
  const ovenTop = makeStaticProp(new THREE.BoxGeometry(1.15, 0.16, 0.92), 0xf1d19b, { x: world.oven.gx + 0.5, y: 0.98, z: world.oven.gz + 0.5 });
  oven.add(ovenBody, ovenTop);
  scene.add(oven);

  const ovenTray = new THREE.Group();
  ovenTray.position.set(world.oven.gx + 0.5, 1.08, world.oven.gz + 0.5);
  ovenTray.rotation.y = 0.25;
  scene.add(ovenTray);
  const ovenPizzas = makePizzaStack(8);
  ovenPizzas.group.position.set(0, 0, 0);
  ovenTray.add(ovenPizzas.group);

  const counter = makeStaticProp(new THREE.BoxGeometry(1.7, 0.95, 0.8), 0x4f7f68, { x: world.counter.gx + 0.5, y: 0.48, z: world.counter.gz + 0.5 });
  const counterTop = makeStaticProp(new THREE.BoxGeometry(1.75, 0.12, 0.86), 0xdde8dd, { x: world.counter.gx + 0.5, y: 0.98, z: world.counter.gz + 0.5 });
  scene.add(counter, counterTop);

  const cashDesk = makeStaticProp(new THREE.BoxGeometry(1.35, 1.0, 0.85), 0x647cff, { x: world.cash.gx + 0.5, y: 0.5, z: world.cash.gz + 0.5 });
  const cashScreen = makeStaticProp(new THREE.BoxGeometry(0.55, 0.35, 0.08), 0xeaf1ff, { x: world.cash.gx + 0.72, y: 1.08, z: world.cash.gz + 0.4 });
  scene.add(cashDesk, cashScreen);

  const playerModel = makeCharacter(0x355d9d, 0xf0ceb1);
  playerModel.group.position.set(state.player.x, 0, state.player.z);
  scene.add(playerModel.group);

  const playerCarry = makePizzaStack(5);
  playerCarry.group.position.set(0, 1.45, 0.02);
  playerModel.group.add(playerCarry.group);

  const tableObjects = tables.map((t, index) => {
    const group = new THREE.Group();
    const table = makeTableMesh();
    group.add(table);
    const chairA = makeChair();
    chairA.position.set(0, 0, 0.68);
    chairA.rotation.y = Math.PI;
    const chairB = makeChair();
    chairB.position.set(0, 0, -0.68);
    group.add(chairA, chairB);
    group.position.set(t.gx + 0.5, 0, t.gz + 0.5);
    scene.add(group);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.9, 0.06, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0x664400, roughness: 0.5 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(t.gx + 0.5, 0.08, t.gz + 0.5);
    ring.visible = false;
    scene.add(ring);
    t.ring = ring;

    const bill = makeLabelSprite('€0', '#1f2937', '#ffffff');
    bill.sprite.position.set(t.gx + 0.5, 1.9, t.gz + 0.5);
    bill.sprite.visible = false;
    scene.add(bill.sprite);
    t.billLabel = bill;

    return { group, ring, bill };
  });

  const particles = [];
  function addParticle(x, z, text, color = '#ffffff') {
    const sprite = makeLabelSprite(text, '#111827', color);
    sprite.sprite.position.set(x, 1.6, z);
    sprite.sprite.scale.set(1.8, 0.9, 1);
    scene.add(sprite.sprite);
    particles.push({ sprite: sprite.sprite, life: 1, speed: 0.55 });
  }

  const customers = [];

  function toast(title, sub = '') {
    ui.toast.innerHTML = `<strong>${title}</strong>${sub ? `<div class="small">${sub}</div>` : ''}`;
    ui.toast.classList.add('show');
    clearTimeout(ui.toast._timer);
    ui.toast._timer = setTimeout(() => ui.toast.classList.remove('show'), 1500);
  }

  function save() {
    const data = {
      money: state.money,
      stock: state.stock,
      carry: state.carry,
      carryCap: state.carryCap,
      rep: state.rep,
      ovenLevel: state.ovenLevel,
      player: { x: state.player.x, z: state.player.z },
      oven: { stack: world.oven.stack, timer: world.oven.timer },
      tables: tables.map(t => ({ occupied: t.occupied, bill: t.bill }))
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    toast('Uloženo');
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (typeof data.money === 'number') state.money = data.money;
      if (typeof data.stock === 'number') state.stock = data.stock;
      if (typeof data.carry === 'number') state.carry = data.carry;
      if (typeof data.carryCap === 'number') state.carryCap = data.carryCap;
      if (typeof data.rep === 'number') state.rep = data.rep;
      if (typeof data.ovenLevel === 'number') state.ovenLevel = data.ovenLevel;
      if (data.player) {
        if (typeof data.player.x === 'number') state.player.x = data.player.x;
        if (typeof data.player.z === 'number') state.player.z = data.player.z;
      }
      if (data.oven) {
        if (typeof data.oven.stack === 'number') world.oven.stack = data.oven.stack;
        if (typeof data.oven.timer === 'number') world.oven.timer = data.oven.timer;
      }
      if (Array.isArray(data.tables)) {
        data.tables.forEach((src, i) => {
          if (!tables[i]) return;
          tables[i].occupied = !!src.occupied;
          tables[i].bill = src.bill || 0;
        });
      }
    } catch (err) {
      console.warn(err);
    }
  }

  function reset() {
    localStorage.removeItem(SAVE_KEY);
    state.money = 25;
    state.stock = 8;
    state.carry = 0;
    state.carryCap = 5;
    state.rep = 0;
    state.ovenLevel = 1;
    state.player.x = 10.5;
    state.player.z = 17.5;
    world.oven.stack = 0;
    world.oven.timer = 0;
    customers.forEach(c => scene.remove(c.mesh));
    customers.length = 0;
    state.particles.length = 0;
    tables.forEach(t => {
      t.occupied = false;
      t.bill = 0;
      t.customerId = null;
      if (t.billLabel) t.billLabel.sprite.visible = false;
    });
    updateStacks();
    toast('Reset hotov');
  }

  function bfs(start, goal) {
    const queue = [start];
    const prev = new Map();
    const seen = new Set([`${start.gx},${start.gz}`]);
    while (queue.length) {
      const cur = queue.shift();
      if (cur.gx === goal.gx && cur.gz === goal.gz) {
        const path = [cur];
        let key = `${cur.gx},${cur.gz}`;
        while (prev.has(key)) {
          const p = prev.get(key);
          path.push(p);
          key = `${p.gx},${p.gz}`;
        }
        return path.reverse();
      }
      const next = [
        { gx: cur.gx + 1, gz: cur.gz },
        { gx: cur.gx - 1, gz: cur.gz },
        { gx: cur.gx, gz: cur.gz + 1 },
        { gx: cur.gx, gz: cur.gz - 1 }
      ];
      for (const n of next) {
        const key = `${n.gx},${n.gz}`;
        if (seen.has(key) || cellBlocked(n.gx, n.gz)) continue;
        seen.add(key);
        prev.set(key, cur);
        queue.push(n);
      }
    }
    return [];
  }

  function recalcPath(c) {
    const start = worldToCell(c.x, c.z);
    const goal = c.state === 'leaving' ? world.entrance : tables[c.tableIndex].seat;
    c.path = bfs(start, goal);
    c.pathIndex = 0;
  }

  function refreshCustomerLook(c) {
    const body = c.mesh.userData.bodyMat;
    const head = c.mesh.userData.headMat;
    const palette = {
      walking: [0x4f7dc8, 0xf4d7bc],
      waitingPizza: [0x4f7dc8, 0xf4d7bc],
      eating: [0xffca6a, 0xf7e6be],
      paying: [0xff9f43, 0xffe0c0],
      leaving: [0xe05d5d, 0xffd0d0]
    };
    const [bodyColor, headColor] = palette[c.state] || palette.walking;
    body.color.setHex(bodyColor);
    head.color.setHex(headColor);
  }

  function spawnCustomer(manual = false) {
    const slot = tables.findIndex(t => !t.occupied);
    if (slot === -1) {
      if (manual) toast('Žádný volný stůl', 'Nejdřív obsluž hosty.');
      return;
    }
    const customer = makeCharacter(0x4f7dc8, 0xf4d7bc);
    customer.group.scale.setScalar(0.95);
    customer.group.position.set(world.entrance.gx + 0.5, 0, world.entrance.gz + 0.5);
    scene.add(customer.group);

    const c = {
      id: String(Math.random()).slice(2),
      tableIndex: slot,
      x: world.entrance.gx + 0.5,
      z: world.entrance.gz + 0.5,
      state: 'walking',
      waitTimer: 55 + Math.random() * 10,
      eatTimer: 0,
      payTimer: 0,
      reward: 0,
      path: [],
      pathIndex: 0,
      mesh: customer.group
    };
    c.mesh.userData = { bodyMat: customer.bodyMat, headMat: customer.headMat };
    refreshCustomerLook(c);
    tables[slot].occupied = true;
    tables[slot].customerId = c.id;
    tables[slot].bill = 0;
    customers.push(c);
    recalcPath(c);
    toast('Zákazník přišel', manual ? 'Přivolán ke stolu.' : 'Míří k místu.');
  }

  function updateStacks() {
    ovenPizzas.setCount(world.oven.stack);
    playerCarry.setCount(state.carry);
  }

  function updateOven(dt) {
    world.oven.interval = Math.max(1.7, 4.5 - state.ovenLevel * 0.38);
    world.oven.timer += dt;
    while (world.oven.timer >= world.oven.interval) {
      world.oven.timer -= world.oven.interval;
      if (state.stock > 0 && world.oven.stack < world.oven.maxStack) {
        state.stock -= 1;
        world.oven.stack += 1;
        addParticle(world.oven.gx + 0.5, world.oven.gz + 0.5, '+pizza', '#ffd166');
      } else {
        break;
      }
    }
    updateStacks();
  }

  function buyStock() {
    if (state.money < 5) {
      toast('Málo peněz', 'Potřebuješ 5.');
      return;
    }
    state.money -= 5;
    state.stock += 5;
    addParticle(world.stock.gx + 0.5, world.stock.gz + 0.5, '+5', '#8fe08f');
    toast('Suroviny koupeny');
  }

  function upgradeCarry() {
    const cost = 15 * state.carryCap;
    if (state.money < cost) {
      toast('Málo peněz', `Potřebuješ ${cost}.`);
      return;
    }
    state.money -= cost;
    state.carryCap += 2;
    toast('Kapacita zvýšena', 'Uneseš více pizz.');
  }

  function upgradeOven() {
    const cost = 20 * state.ovenLevel;
    if (state.money < cost) {
      toast('Málo peněz', `Potřebuješ ${cost}.`);
      return;
    }
    state.money -= cost;
    state.ovenLevel += 1;
    toast('Pec vylepšena', 'Pec bude rychlejší.');
  }

  function collectFromOven() {
    if (dist(state.player.x, state.player.z, world.oven.gx + 0.5, world.oven.gz + 0.5) > 1.25) return false;
    const take = Math.min(world.oven.stack, state.carryCap - state.carry);
    if (take <= 0) {
      toast(world.oven.stack === 0 ? 'V peci nic není' : 'Máš plnou kapacitu');
      return true;
    }
    world.oven.stack -= take;
    state.carry += take;
    addParticle(world.oven.gx + 0.5, world.oven.gz + 0.5, `+${take}`, '#ffd166');
    toast('Pizza naložena', `Vzato ${take}.`);
    updateStacks();
    return true;
  }

  function serveAtTable(table, c) {
    if (state.carry <= 0) {
      toast('Nemáš pizzu');
      return true;
    }
    state.carry -= 1;
    c.state = 'eating';
    c.eatTimer = 5.8 + Math.random() * 2.6;
    c.reward = 12 + state.ovenLevel * 2;
    table.bill = c.reward;
    table.billLabel.draw(`€${table.bill}`);
    table.billLabel.sprite.visible = true;
    refreshCustomerLook(c);
    addParticle(table.seat.gx + 0.5, table.seat.gz + 0.5, '-pizza', '#ffcf6f');
    toast('Pizza podána', 'Host jí.');
    updateStacks();
    return true;
  }

  function nearestTableIndex() {
    let best = 0;
    let bestD = Infinity;
    tables.forEach((t, i) => {
      const target = cellCenter(t.gx, t.gz);
      const d = dist(state.player.x, state.player.z, target.x, target.z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  function interact() {
    const nearest = nearestTableIndex();
    const table = tables[nearest];
    const seated = customers.find(c => c.tableIndex === nearest && c.state === 'waitingPizza');
    if (seated && dist(state.player.x, state.player.z, table.seat.gx + 0.5, table.seat.gz + 0.5) < 1.5) {
      serveAtTable(table, seated);
      return;
    }
    if (collectFromOven()) return;
    if (dist(state.player.x, state.player.z, world.stock.gx + 0.5, world.stock.gz + 0.5) < 1.25) return buyStock();
    if (dist(state.player.x, state.player.z, world.counter.gx + 0.5, world.counter.gz + 0.5) < 1.25) return upgradeCarry();
    if (dist(state.player.x, state.player.z, world.cash.gx + 0.5, world.cash.gz + 0.5) < 1.25) return upgradeOven();
    toast('Nic k akci', 'Přibliž se ke stolu, peci nebo skladu.');
  }

  function updatePlayer(dt) {
    let dx = 0;
    let dz = 0;
    if (state.keys['w'] || state.keys['arrowup']) dz -= 1;
    if (state.keys['s'] || state.keys['arrowdown']) dz += 1;
    if (state.keys['a'] || state.keys['arrowleft']) dx -= 1;
    if (state.keys['d'] || state.keys['arrowright']) dx += 1;
    if (state.touch.active) {
      dx += state.touch.dx;
      dz += state.touch.dz;
    }
    const len = Math.hypot(dx, dz);
    if (len > 0.001) {
      dx /= len;
      dz /= len;
      const speed = state.player.speed;
      const nx = state.player.x + dx * speed * dt;
      const nz = state.player.z + dz * speed * dt;
      if (canOccupy(nx, state.player.z)) state.player.x = nx;
      if (canOccupy(state.player.x, nz)) state.player.z = nz;
      const angle = Math.atan2(dx, dz);
      playerModel.group.rotation.y = angle;
    }
    playerModel.group.position.set(state.player.x, 0, state.player.z);
    playerCarry.group.position.y = 1.42 + Math.sin(performance.now() * 0.008) * 0.01;
  }

  function updateCustomer(c, dt) {
    if (c.state === 'walking' || c.state === 'leaving') {
      if (!c.path.length) recalcPath(c);
      const node = c.path[c.pathIndex];
      if (node) {
        const target = cellCenter(node.gx, node.gz);
        const dx = target.x - c.x;
        const dz = target.z - c.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.05) {
          if (c.pathIndex < c.path.length - 1) {
            c.pathIndex += 1;
          } else {
            if (c.state === 'walking') {
              c.state = 'waitingPizza';
              c.waitTimer = 50 + Math.random() * 10;
              refreshCustomerLook(c);
              toast('Host sedí', 'Čeká na objednávku.');
            } else if (c.state === 'leaving') {
              const table = tables[c.tableIndex];
              table.occupied = false;
              table.bill = 0;
              table.customerId = null;
              if (table.billLabel) table.billLabel.sprite.visible = false;
              scene.remove(c.mesh);
              c.dead = true;
            }
          }
        } else {
          const speed = c.state === 'walking' ? 1.9 : 2.2;
          c.x += (dx / d) * speed * dt;
          c.z += (dz / d) * speed * dt;
          c.mesh.position.set(c.x, 0, c.z);
          c.mesh.rotation.y = Math.atan2(dx, dz);
        }
      }
    } else if (c.state === 'waitingPizza') {
      c.waitTimer -= dt;
      if (c.waitTimer <= 0) {
        c.state = 'leaving';
        state.rep = Math.max(0, state.rep - 1);
        refreshCustomerLook(c);
        recalcPath(c);
        toast('Host odchází', 'Příliš dlouhé čekání.');
      }
    } else if (c.state === 'eating') {
      c.eatTimer -= dt;
      if (c.eatTimer <= 0) {
        c.state = 'paying';
        c.payTimer = 1.8;
        refreshCustomerLook(c);
        toast('Host dojídá', `Účtenka €${c.reward}`);
      }
    } else if (c.state === 'paying') {
      c.payTimer -= dt;
      if (c.payTimer <= 0) {
        const table = tables[c.tableIndex];
        state.money += c.reward;
        state.rep += 1;
        addParticle(table.seat.gx + 0.5, table.seat.gz + 0.5, `+${c.reward}`, '#8fe08f');
        table.bill = 0;
        if (table.billLabel) table.billLabel.sprite.visible = false;
        c.state = 'leaving';
        refreshCustomerLook(c);
        recalcPath(c);
        toast('Host zaplatil', `+${c.reward}`);
      }
    }
    c.mesh.position.set(c.x, 0, c.z);
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.life -= dt;
      p.sprite.position.y += dt * p.speed;
      p.sprite.material.opacity = clamp(p.life, 0, 1);
    }
    while (particles.length && particles[0].life <= 0) {
      const p = particles.shift();
      scene.remove(p.sprite);
      p.sprite.material.map?.dispose?.();
      p.sprite.material.dispose();
    }
  }

  function updateHUD() {
    ui.money.textContent = Math.floor(state.money);
    ui.stock.textContent = state.stock;
    ui.carry.textContent = `${state.carry}/${state.carryCap}`;
    ui.oven.textContent = world.oven.stack;
    ui.waiting.textContent = state.customers.filter(c => c.state === 'waitingPizza').length;
    ui.rep.textContent = state.rep;
    ui.upgradeCarryBtn.textContent = `Kapacita (${15 * state.carryCap})`;
    ui.upgradeOvenBtn.textContent = `Pec (${20 * state.ovenLevel})`;
  }

  function updateSelectionRing() {
    let best = 0;
    let bestD = Infinity;
    tables.forEach((t, i) => {
      const target = cellCenter(t.gx, t.gz);
      const d = dist(state.player.x, state.player.z, target.x, target.z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    state.selectedTable = best;
    tables.forEach((t, i) => {
      if (!t.ring) return;
      t.ring.visible = i === best;
      t.ring.position.y = 0.08 + Math.sin(performance.now() * 0.004 + i) * 0.02;
    });
  }

  function spawnLoop(dt) {
    state.lastSpawn += dt;
    if (state.lastSpawn > 8.5 && customers.filter(c => !c.dead).length < 4) {
      spawnCustomer(false);
      state.lastSpawn = 0;
    }
  }

  function gameLoop(now) {
    const dt = Math.min(0.033, ((now || 0) - (gameLoop.last || now)) / 1000 || 0.016);
    gameLoop.last = now || performance.now();

    updatePlayer(dt);
    updateOven(dt);
    spawnLoop(dt);

    for (const c of customers) updateCustomer(c, dt);
    for (let i = customers.length - 1; i >= 0; i--) {
      if (customers[i].dead) customers.splice(i, 1);
    }

    updateParticles(dt);
    updateSelectionRing();
    updateHUD();
    renderer.render(scene, camera);
    requestAnimationFrame(gameLoop);
  }

  addEventListener('keydown', e => {
    state.keys[e.key.toLowerCase()] = true;
    if (e.key.toLowerCase() === 'e' || e.key === ' ') {
      e.preventDefault();
      interact();
    }
  });
  addEventListener('keyup', e => state.keys[e.key.toLowerCase()] = false);

  const setStick = (dx, dz) => {
    const max = 56;
    const nx = clamp(dx, -max, max);
    const nz = clamp(dz, -max, max);
    ui.nub.style.transform = `translate(${nx}px, ${nz}px)`;
    state.touch.dx = nx / max;
    state.touch.dz = nz / max;
  };

  ui.stick.addEventListener('pointerdown', e => {
    state.touch.active = true;
    state.touch.id = e.pointerId;
    ui.stick.setPointerCapture(e.pointerId);
    const rect = ui.stick.getBoundingClientRect();
    state.touch.cx = rect.left + rect.width / 2;
    state.touch.cy = rect.top + rect.height / 2;
    setStick(e.clientX - state.touch.cx, e.clientY - state.touch.cy);
  });
  ui.stick.addEventListener('pointermove', e => {
    if (!state.touch.active || e.pointerId !== state.touch.id) return;
    setStick(e.clientX - state.touch.cx, e.clientY - state.touch.cy);
  });
  const releaseStick = () => {
    state.touch.active = false;
    state.touch.id = null;
    state.touch.dx = 0;
    state.touch.dz = 0;
    ui.nub.style.transform = 'translate(-50%, -50%)';
  };
  ui.stick.addEventListener('pointerup', releaseStick);
  ui.stick.addEventListener('pointercancel', releaseStick);

  ui.actionBtn.addEventListener('click', interact);
  ui.spawnBtn.addEventListener('click', () => spawnCustomer(true));
  ui.buyStockBtn.addEventListener('click', buyStock);
  ui.upgradeCarryBtn.addEventListener('click', upgradeCarry);
  ui.upgradeOvenBtn.addEventListener('click', upgradeOven);
  ui.saveBtn.addEventListener('click', save);
  ui.resetBtn.addEventListener('click', reset);

  addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  });

  load();
  state.player.x = clamp(state.player.x, 1.2, GRID_W - 1.2);
  state.player.z = clamp(state.player.z, 1.2, GRID_H - 1.2);
  playerModel.group.position.set(state.player.x, 0, state.player.z);
  updateStacks();
  toast('3D engine ready', 'Nový základ je v prohlížeči.');
  requestAnimationFrame(gameLoop);
})();
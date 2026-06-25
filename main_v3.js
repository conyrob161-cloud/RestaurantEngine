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

  const SAVE_KEY = 'restaurant-zombie-v4';
  const GRID_W = 20;
  const GRID_H = 20;
  const WORLD = {
    stock: { gx: 3, gz: 3 },
    oven: { gx: 6, gz: 4 },
    counter: { gx: 9, gz: 4 },
    cash: { gx: 16, gz: 3 },
    entrance: { gx: 10, gz: 18 }
  };
  const TABLE_SPOTS = [
    { gx: 6, gz: 9 },
    { gx: 13, gz: 9 },
    { gx: 6, gz: 14 },
    { gx: 13, gz: 14 },
    { gx: 3, gz: 12 },
    { gx: 16, gz: 12 },
    { gx: 3, gz: 15 },
    { gx: 16, gz: 15 }
  ];

  const blocked = Array.from({ length: GRID_H }, () => Array(GRID_W).fill(false));
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
    selectedTable: 0
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
  const cellCenter = (gx, gz) => ({ x: gx + 0.5, z: gz + 0.5 });
  const worldToCell = (x, z) => ({ gx: Math.floor(x), gz: Math.floor(z) });
  const cellBlocked = (gx, gz) => gx < 0 || gz < 0 || gx >= GRID_W || gz >= GRID_H || blocked[gz][gx];

  function block(gx, gz) {
    if (gx >= 0 && gz >= 0 && gx < GRID_W && gz < GRID_H) blocked[gz][gx] = true;
  }

  function rebuildBlockedMap() {
    for (let gx = 0; gx < GRID_W; gx++) {
      block(gx, 0);
      block(gx, GRID_H - 1);
    }
    for (let gz = 0; gz < GRID_H; gz++) {
      block(0, gz);
      block(GRID_W - 1, gz);
    }
    for (let gx = 1; gx < GRID_W - 1; gx++) {
      if (gx !== WORLD.entrance.gx) block(gx, 7);
    }
    for (let gz = 1; gz < 7; gz++) {
      block(4, gz);
      block(15, gz);
    }
    block(WORLD.stock.gx, WORLD.stock.gz);
    block(WORLD.oven.gx, WORLD.oven.gz);
    block(WORLD.counter.gx, WORLD.counter.gz);
    block(WORLD.cash.gx, WORLD.cash.gz);
    tables.forEach(t => { if (t.active) block(t.gx, t.gz); });
  }

  function canOccupy(x, z, radius = 0.22) {
    const samples = [
      [0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius],
      [radius, radius], [radius, -radius], [-radius, radius], [-radius, -radius]
    ];
    return samples.every(([dx, dz]) => {
      const c = worldToCell(x + dx, z + dz);
      return !cellBlocked(c.gx, c.gz);
    });
  }

  function makeCanvasTexture(drawFn, size = 256) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    drawFn(ctx, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    return tex;
  }

  function makeLabelSprite(text, bg = '#111827', fg = '#ffffff', scaleX = 2.5, scaleY = 1.2) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const ctx = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;

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
      ctx.clearRect(0, 0, c.width, c.height);
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
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.scale.set(scaleX, scaleY, 1);
    return { sprite, draw };
  }

  function createPizzaMesh() {
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

  function createStack(max = 12, spin = 0) {
    const group = new THREE.Group();
    const items = [];
    for (let i = 0; i < max; i++) {
      const mesh = createPizzaMesh();
      mesh.visible = false;
      mesh.position.y = i * 0.055;
      mesh.rotation.y = i * 0.43 + spin;
      items.push(mesh);
      group.add(mesh);
    }
    function setCount(count) {
      const visibleCount = clamp(count, 0, max);
      items.forEach((m, i) => {
        m.visible = i < visibleCount;
        m.position.y = i * 0.055;
      });
      group.visible = visibleCount > 0;
    }
    return { group, setCount, items, max, count: 0 };
  }

  function createCharacter(primary = 0x355d9d, skin = 0xf0ceb1, chef = false) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: primary, roughness: 0.9 });
    const headMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.95 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.92, 6), bodyMat);
    body.position.y = 0.52;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), headMat);
    head.position.y = 1.1;
    const hat = new THREE.Mesh(
      chef ? new THREE.CylinderGeometry(0.24, 0.2, 0.34, 6) : new THREE.CylinderGeometry(0.2, 0.22, 0.18, 6),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 })
    );
    hat.position.y = chef ? 1.44 : 1.34;
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.34, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    group.add(shadow, body, head, hat);
    return { group, bodyMat, headMat, body, head, hat };
  }

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

  function createChair() {
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

  function createTable(spot, active) {
    const table = {
      gx: spot.gx,
      gz: spot.gz,
      seat: { gx: spot.gx, gz: spot.gz + 1 },
      active: !!active,
      capacity: 10,
      stack: 0,
      customerId: null,
      occupied: false,
      bill: 0,
      upgradeLevel: 1,
      group: new THREE.Group(),
      stackModel: createStack(12),
      ring: null,
      stackLabel: null,
      capLabel: null
    };

    const root = table.group;
    root.add(createTableVisual());

    const chairA = createChair();
    chairA.position.set(0, 0, 0.68);
    chairA.rotation.y = Math.PI;
    const chairB = createChair();
    chairB.position.set(0, 0, -0.68);
    root.add(chairA, chairB);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.9, 0.06, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0x664400, roughness: 0.5 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 0.08, 0);
    ring.visible = false;
    root.add(ring);

    const stack = createStack(12);
    stack.group.position.set(0, 0.82, 0);
    root.add(stack.group);

    const stackLabel = makeLabelSprite('0', '#1f2937', '#ffffff', 0.9, 0.45);
    stackLabel.sprite.position.set(0, 1.85, 0);
    root.add(stackLabel.sprite);

    const capLabel = makeLabelSprite('10', '#1f2937', '#ffffff', 0.9, 0.45);
    capLabel.sprite.position.set(0.55, 1.85, 0.1);
    root.add(capLabel.sprite);

    table.stackModel = stack;
    table.ring = ring;
    table.stackLabel = stackLabel;
    table.capLabel = capLabel;
    return table;
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
    if (gx !== WORLD.entrance.gx) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 2.6, 1), new THREE.MeshStandardMaterial({ color: 0x8f5f43, roughness: 0.98 }));
      wall.position.set(gx + 0.5, 1.3, 0.5);
      scene.add(wall);
    }
    const wallBottom = new THREE.Mesh(new THREE.BoxGeometry(1, 2.6, 1), new THREE.MeshStandardMaterial({ color: 0x8f5f43, roughness: 0.98 }));
    wallBottom.position.set(gx + 0.5, 1.3, 19.5);
    scene.add(wallBottom);
  }
  for (let gz = 0; gz < GRID_H; gz++) {
    const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(1, 2.6, 1), new THREE.MeshStandardMaterial({ color: 0x8f5f43, roughness: 0.98 }));
    wallLeft.position.set(0.5, 1.3, gz + 0.5);
    scene.add(wallLeft);
    const wallRight = new THREE.Mesh(new THREE.BoxGeometry(1, 2.6, 1), new THREE.MeshStandardMaterial({ color: 0x8f5f43, roughness: 0.98 }));
    wallRight.position.set(19.5, 1.3, gz + 0.5);
    scene.add(wallRight);
  }
  for (let gx = 1; gx < GRID_W - 1; gx++) {
    if (gx === WORLD.entrance.gx) continue;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 2.2, 1), new THREE.MeshStandardMaterial({ color: 0x89593f, roughness: 0.98 }));
    wall.position.set(gx + 0.5, 1.1, 7.5);
    scene.add(wall);
  }
  for (let gz = 1; gz < 7; gz++) {
    const wallA = new THREE.Mesh(new THREE.BoxGeometry(1, 2.2, 1), new THREE.MeshStandardMaterial({ color: 0x89593f, roughness: 0.98 }));
    wallA.position.set(4.5, 1.1, gz + 0.5);
    scene.add(wallA);
    const wallB = new THREE.Mesh(new THREE.BoxGeometry(1, 2.2, 1), new THREE.MeshStandardMaterial({ color: 0x89593f, roughness: 0.98 }));
    wallB.position.set(15.5, 1.1, gz + 0.5);
    scene.add(wallB);
  }

  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(4.8, 0.45, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x22314a, emissive: 0x0c1320, roughness: 0.6 })
  );
  sign.position.set(10, 2.1, 8.2);
  scene.add(sign);
  const signLabel = makeLabelSprite('RESTAURANT ZOMBIE', '#111827', '#ffffff', 2.0, 0.8);
  signLabel.sprite.position.set(10, 2.9, 8.3);
  scene.add(signLabel.sprite);

  const stockCrate = new THREE.Group();
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x5e452f, roughness: 1 });
  for (let i = 0; i < 3; i++) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.8), crateMat);
    box.position.set((i % 2) * 0.1, 0.25 + i * 0.18, (i % 2) * 0.04);
    stockCrate.add(box);
  }
  stockCrate.position.set(WORLD.stock.gx + 0.5, 0, WORLD.stock.gz + 0.5);
  scene.add(stockCrate);

  const ovenBody = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 1.0), new THREE.MeshStandardMaterial({ color: 0xa25136, roughness: 0.95 }));
  ovenBody.position.set(WORLD.oven.gx + 0.5, 0.45, WORLD.oven.gz + 0.5);
  scene.add(ovenBody);
  const ovenTop = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.16, 0.92), new THREE.MeshStandardMaterial({ color: 0xf1d19b, roughness: 0.95 }));
  ovenTop.position.set(WORLD.oven.gx + 0.5, 0.98, WORLD.oven.gz + 0.5);
  scene.add(ovenTop);
  const ovenTray = new THREE.Group();
  ovenTray.position.set(WORLD.oven.gx + 0.5, 1.08, WORLD.oven.gz + 0.5);
  ovenTray.rotation.y = 0.25;
  scene.add(ovenTray);

  const counter = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.95, 0.8), new THREE.MeshStandardMaterial({ color: 0x4f7f68, roughness: 0.95 }));
  counter.position.set(WORLD.counter.gx + 0.5, 0.48, WORLD.counter.gz + 0.5);
  scene.add(counter);
  const counterTop = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.12, 0.86), new THREE.MeshStandardMaterial({ color: 0xdde8dd, roughness: 0.95 }));
  counterTop.position.set(WORLD.counter.gx + 0.5, 0.98, WORLD.counter.gz + 0.5);
  scene.add(counterTop);

  const cashDesk = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.0, 0.85), new THREE.MeshStandardMaterial({ color: 0x647cff, roughness: 0.95 }));
  cashDesk.position.set(WORLD.cash.gx + 0.5, 0.5, WORLD.cash.gz + 0.5);
  scene.add(cashDesk);
  const cashScreen = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.35, 0.08), new THREE.MeshStandardMaterial({ color: 0xeaf1ff, roughness: 0.8 }));
  cashScreen.position.set(WORLD.cash.gx + 0.72, 1.08, WORLD.cash.gz + 0.4);
  scene.add(cashScreen);

  const playerModel = createCharacter(0x355d9d, 0xf0ceb1, true);
  playerModel.group.position.set(state.player.x, 0, state.player.z);
  scene.add(playerModel.group);

  const carryStack = createStack(12, 0.25);
  carryStack.group.position.set(0, 1.45, 0.02);
  playerModel.group.add(carryStack.group);

  const tables = TABLE_SPOTS.map((spot, index) => createTable(spot, index < 4));
  tables.forEach(table => {
    table.group.position.set(table.gx + 0.5, 0, table.gz + 0.5);
    scene.add(table.group);
    if (table.active) block(table.gx, table.gz);
  });

  const chefModel = createCharacter(0x8f5f43, 0xf0ceb1, true);
  chefModel.group.scale.setScalar(0.9);
  chefModel.group.position.set(WORLD.oven.gx + 1.8, 0, WORLD.oven.gz + 1.0);
  scene.add(chefModel.group);
  const chefStation = { group: chefModel.group, timer: 0, cycle: 2.2 };

  const worldOvenStack = createStack(12, 0.1);
  worldOvenStack.group.position.set(0, 0, 0);
  ovenTray.add(worldOvenStack.group);

  const particles = [];
  const customers = state.customers;

  function toast(title, sub = '') {
    ui.toast.innerHTML = '<strong>' + title + '</strong>' + (sub ? '<div class="small">' + sub + '</div>' : '');
    ui.toast.classList.add('show');
    clearTimeout(ui.toast._timer);
    ui.toast._timer = setTimeout(() => ui.toast.classList.remove('show'), 1500);
  }

  function createParticle(text, x, z, color) {
    const p = makeLabelSprite(text, '#111827', color || '#ffffff', 1.8, 0.8);
    p.sprite.position.set(x, 1.6, z);
    scene.add(p.sprite);
    particles.push({ sprite: p.sprite, life: 1, speed: 0.4 });
  }

  function updateStacks() {
    carryStack.setCount(state.carry);
    worldOvenStack.setCount(worldOvenStack.count);
    tables.forEach(updateTableStack);
  }

  function updateTableStack(table) {
    table.stackModel.setCount(table.stack);
    table.stackLabel.draw(String(table.stack));
    table.capLabel.draw(String(table.capacity));
  }

  function updateCustomerLook(c) {
    const palette = {
      walking: [0x4f7dc8, 0xf4d7bc],
      waiting: [0x4f7dc8, 0xf4d7bc],
      eating: [0xffca6a, 0xf7e6be],
      paying: [0xff9f43, 0xffe0c0],
      leaving: [0xe05d5d, 0xffd0d0]
    };
    const pair = palette[c.state] || palette.walking;
    c.bodyMat.color.setHex(pair[0]);
    c.headMat.color.setHex(pair[1]);
  }

  function createPath(start, goal) {
    const queue = [start];
    const prev = new Map();
    const seen = new Set([start.gx + ',' + start.gz]);
    while (queue.length) {
      const cur = queue.shift();
      if (cur.gx === goal.gx && cur.gz === goal.gz) {
        const path = [cur];
        let key = cur.gx + ',' + cur.gz;
        while (prev.has(key)) {
          const p = prev.get(key);
          path.push(p);
          key = p.gx + ',' + p.gz;
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
        const key = n.gx + ',' + n.gz;
        if (seen.has(key) || cellBlocked(n.gx, n.gz)) continue;
        seen.add(key);
        prev.set(key, cur);
        queue.push(n);
      }
    }
    return [];
  }

  function findNearestActiveTable() {
    let best = null;
    let bestD = Infinity;
    tables.forEach(table => {
      if (!table.active) return;
      const c = cellCenter(table.gx, table.gz);
      const d = dist(state.player.x, state.player.z, c.x, c.z);
      if (d < bestD) {
        bestD = d;
        best = table;
      }
    });
    return best;
  }

  function spawnCustomer(manual) {
    const table = tables.find(t => t.active && !t.occupied);
    if (!table) {
      if (manual) toast('Žádný volný stůl', 'Nejdřív otevři nový stůl.');
      return;
    }
    const model = createCharacter(0x4f7dc8, 0xf4d7bc, false);
    model.group.scale.setScalar(0.95);
    model.group.position.set(WORLD.entrance.gx + 0.5, 0, WORLD.entrance.gz + 0.5);
    scene.add(model.group);
    const customer = {
      id: String(Math.random()).slice(2),
      table: table,
      x: WORLD.entrance.gx + 0.5,
      z: WORLD.entrance.gz + 0.5,
      state: 'walking',
      waitTimer: 18 + Math.random() * 10,
      eatTimer: 0,
      payTimer: 0,
      order: 2 + Math.floor(Math.random() * 3),
      eaten: 0,
      reward: 15 + Math.floor(Math.random() * 8),
      path: [],
      pathIndex: 0,
      mesh: model.group,
      bodyMat: model.bodyMat,
      headMat: model.headMat
    };
    table.occupied = true;
    table.customerId = customer.id;
    table.stack = 0;
    updateTableStack(table);
    customer.path = createPath(worldToCell(customer.x, customer.z), table.seat);
    customers.push(customer);
    updateCustomerLook(customer);
    toast('Host přišel', manual ? 'Přivolán ke stolu.' : 'Míří ke stolu.');
  }

  function updateOven(dt) {
    state.ovenTimer += dt;
    const interval = Math.max(1.5, 4.4 - state.ovenLevel * 0.35);
    while (state.ovenTimer >= interval) {
      state.ovenTimer -= interval;
      if (state.stock > 0 && worldOvenStack.count < worldOvenStack.max) {
        state.stock -= 1;
        worldOvenStack.count += 1;
        createParticle('+pizza', WORLD.oven.gx + 0.5, WORLD.oven.gz + 0.5, '#ffd166');
      } else {
        break;
      }
    }
    worldOvenStack.setCount(worldOvenStack.count);
  }

  function collectFromOven() {
    const d = dist(state.player.x, state.player.z, WORLD.oven.gx + 0.5, WORLD.oven.gz + 0.5);
    if (d > 1.25) return false;
    const take = Math.min(worldOvenStack.count, state.carryCap - state.carry);
    if (take <= 0) {
      toast(worldOvenStack.count === 0 ? 'V peci nic není' : 'Máš plnou kapacitu');
      return true;
    }
    worldOvenStack.count -= take;
    state.carry += take;
    createParticle('+' + take, WORLD.oven.gx + 0.5, WORLD.oven.gz + 0.5, '#ffd166');
    worldOvenStack.setCount(worldOvenStack.count);
    carryStack.setCount(state.carry);
    toast('Pizza naložena', 'Vzato ' + take + '.');
    return true;
  }

  function buyStock() {
    if (state.money < 5) {
      toast('Málo peněz', 'Potřebuješ 5.');
      return;
    }
    state.money -= 5;
    state.stock += 5;
    createParticle('+5', WORLD.stock.gx + 0.5, WORLD.stock.gz + 0.5, '#8fe08f');
    toast('Suroviny koupeny');
  }

  function upgradeCarry() {
    const cost = 15 * state.carryCap;
    if (state.money < cost) {
      toast('Málo peněz', 'Potřebuješ ' + cost + '.');
      return;
    }
    state.money -= cost;
    state.carryCap += 2;
    toast('Kapacita zvýšena', 'Uneseš více pizz.');
  }

  function upgradeOven() {
    const cost = 20 * state.ovenLevel;
    if (state.money < cost) {
      toast('Málo peněz', 'Potřebuješ ' + cost + '.');
      return;
    }
    state.money -= cost;
    state.ovenLevel += 1;
    toast('Pec vylepšena', 'Pec bude rychlejší.');
  }

  function buyTable() {
    const inactive = tables.find(t => !t.active);
    if (!inactive) {
      toast('Všechny stoly už jsou otevřené');
      return;
    }
    const cost = 40 + tables.filter(t => t.active).length * 20;
    if (state.money < cost) {
      toast('Málo peněz', 'Potřebuješ ' + cost + '.');
      return;
    }
    state.money -= cost;
    inactive.active = true;
    block(inactive.gx, inactive.gz);
    scene.add(inactive.group);
    updateTableStack(inactive);
    toast('Nový stůl otevřen', 'Cena ' + cost + '.');
  }

  function upgradeTable() {
    const table = findNearestActiveTable();
    if (!table) {
      toast('Žádný stůl poblíž');
      return;
    }
    const cost = 25 + table.upgradeLevel * 20;
    if (state.money < cost) {
      toast('Málo peněz', 'Potřebuješ ' + cost + '.');
      return;
    }
    state.money -= cost;
    table.upgradeLevel += 1;
    table.capacity += 5;
    updateTableStack(table);
    toast('Stůl vylepšen', 'Kapacita ' + table.capacity + '.');
  }

  function serveTable(table, customer) {
    if (state.carry <= 0) {
      toast('Nemáš pizzu');
      return true;
    }
    if (table.stack >= table.capacity) {
      toast('Stůl je plný');
      return true;
    }
    state.carry -= 1;
    table.stack += 1;
    updateStacks();
    createParticle('-pizza', table.gx + 0.5, table.gz + 0.5, '#ffcf6f');
    toast('Pizza podána', 'Na stůl přibyla další pizza.');
    if (customer.state === 'waiting' && table.stack > customer.eaten) {
      customer.state = 'eating';
      customer.eatTimer = 1.4;
      updateCustomerLook(customer);
    }
    return true;
  }

  function interact() {
    const nearestTable = findNearestActiveTable();
    if (nearestTable) {
      const c = cellCenter(nearestTable.gx, nearestTable.gz);
      if (dist(state.player.x, state.player.z, c.x, c.z) < 1.6) {
        const customer = customers.find(x => x.table === nearestTable && !x.dead);
        if (customer && serveTable(nearestTable, customer)) return;
      }
    }
    if (collectFromOven()) return;
    if (dist(state.player.x, state.player.z, WORLD.stock.gx + 0.5, WORLD.stock.gz + 0.5) < 1.25) return buyStock();
    if (dist(state.player.x, state.player.z, WORLD.counter.gx + 0.5, WORLD.counter.gz + 0.5) < 1.25) return upgradeCarry();
    if (dist(state.player.x, state.player.z, WORLD.cash.gx + 0.5, WORLD.cash.gz + 0.5) < 1.25) return upgradeOven();
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
      const nx = state.player.x + dx * state.player.speed * dt;
      const nz = state.player.z + dz * state.player.speed * dt;
      if (canOccupy(nx, state.player.z)) state.player.x = nx;
      if (canOccupy(state.player.x, nz)) state.player.z = nz;
      state.player.angle = Math.atan2(dx, dz);
    }
    playerModel.group.position.set(state.player.x, 0, state.player.z);
    playerModel.group.rotation.y = state.player.angle;
    carryStack.group.position.y = 1.45 + Math.sin(performance.now() * 0.008) * 0.01;
  }

  function updateCustomer(c, dt) {
    if (c.state === 'walking' || c.state === 'leaving') {
      if (!c.path.length) c.path = createPath(worldToCell(c.x, c.z), c.state === 'walking' ? c.table.seat : WORLD.entrance);
      const node = c.path[c.pathIndex];
      if (node) {
        const target = cellCenter(node.gx, node.gz);
        const dx = target.x - c.x;
        const dz = target.z - c.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.05) {
          if (c.pathIndex < c.path.length - 1) {
            c.pathIndex += 1;
          } else if (c.state === 'walking') {
            c.state = 'waiting';
            c.waitTimer = 18 + Math.random() * 10;
            updateCustomerLook(c);
            toast('Host sedí', 'Objednal ' + c.order + ' pizz.');
          } else {
            c.dead = true;
            c.table.occupied = false;
            c.table.customerId = null;
            c.table.stack = 0;
            updateTableStack(c.table);
            scene.remove(c.mesh);
          }
        } else {
          const speed = c.state === 'walking' ? 1.9 : 2.2;
          c.x += (dx / d) * speed * dt;
          c.z += (dz / d) * speed * dt;
          c.mesh.position.set(c.x, 0, c.z);
          c.mesh.rotation.y = Math.atan2(dx, dz);
        }
      }
    } else if (c.state === 'waiting') {
      c.waitTimer -= dt;
      if (c.waitTimer <= 0) {
        c.state = 'leaving';
        c.path = createPath(worldToCell(c.x, c.z), WORLD.entrance);
        c.pathIndex = 0;
        state.rep = Math.max(0, state.rep - 1);
        updateCustomerLook(c);
        toast('Host odchází', 'Příliš dlouhé čekání.');
      } else if (c.table.stack > c.eaten) {
        c.state = 'eating';
        c.eatTimer = 1.4;
        updateCustomerLook(c);
      }
    } else if (c.state === 'eating') {
      c.eatTimer -= dt;
      if (c.eatTimer <= 0) {
        if (c.table.stack > 0) {
          c.table.stack -= 1;
          c.eaten += 1;
          updateTableStack(c.table);
          createParticle('-pizza', c.table.gx + 0.5, c.table.gz + 0.5, '#ffcf6f');
        }
        if (c.eaten >= c.order) {
          c.state = 'paying';
          c.payTimer = 1.3;
          updateCustomerLook(c);
          toast('Host dojídá', 'Účtenka €' + c.reward);
        } else {
          c.state = 'waiting';
          updateCustomerLook(c);
        }
      }
    } else if (c.state === 'paying') {
      c.payTimer -= dt;
      if (c.payTimer <= 0) {
        state.money += c.reward;
        state.rep += 1;
        createParticle('+' + c.reward, c.table.gx + 0.5, c.table.gz + 0.5, '#8fe08f');
        c.state = 'leaving';
        c.path = createPath(worldToCell(c.x, c.z), WORLD.entrance);
        c.pathIndex = 0;
        updateCustomerLook(c);
        toast('Host zaplatil', '+' + c.reward);
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
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      if (p.life > 0) continue;
      scene.remove(p.sprite);
      if (p.sprite.material.map && p.sprite.material.map.dispose) p.sprite.material.map.dispose();
      p.sprite.material.dispose();
      particles.splice(i, 1);
    }
  }

  function updateHUD() {
    ui.money.textContent = Math.floor(state.money);
    ui.stock.textContent = state.stock;
    ui.carry.textContent = state.carry + '/' + state.carryCap;
    ui.oven.textContent = worldOvenStack.count;
    ui.waiting.textContent = customers.filter(c => c.state === 'waiting').length;
    ui.rep.textContent = state.rep;
    ui.upgradeCarryBtn.textContent = 'Kapacita (' + (15 * state.carryCap) + ')';
    ui.upgradeOvenBtn.textContent = 'Pec (' + (20 * state.ovenLevel) + ')';
  }

  function updateSelectionRing() {
    let best = 0;
    let bestD = Infinity;
    tables.forEach((t, i) => {
      if (!t.active) return;
      const c = cellCenter(t.gx, t.gz);
      const d = dist(state.player.x, state.player.z, c.x, c.z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    state.selectedTable = best;
    tables.forEach((t, i) => {
      if (!t.active) return;
      t.ring.visible = i === best;
      t.ring.position.y = 0.08 + Math.sin(performance.now() * 0.004 + i) * 0.02;
    });
  }

  function updateKitchen(dt) {
    chefStation.timer += dt;
    const interval = Math.max(1.5, 4.4 - state.ovenLevel * 0.35);
    if (chefStation.timer >= interval) {
      chefStation.timer -= interval;
      if (state.stock > 0 && worldOvenStack.count < worldOvenStack.max) {
        state.stock -= 1;
        worldOvenStack.count += 1;
        createParticle('+pizza', WORLD.oven.gx + 0.5, WORLD.oven.gz + 0.5, '#ffd166');
        worldOvenStack.setCount(worldOvenStack.count);
      }
    }
    chefModel.group.rotation.y = Math.sin(performance.now() * 0.001) * 0.12;
    chefModel.group.position.y = Math.sin(performance.now() * 0.006) * 0.03;
  }

  function spawnLoop(dt) {
    state.lastSpawn += dt;
    if (state.lastSpawn > 8.5 && customers.filter(c => !c.dead).length < 4) {
      spawnCustomer(false);
      state.lastSpawn = 0;
    }
  }

  function updateCamera(dt) {
    const px = state.player.x;
    const pz = state.player.z;
    const targetX = px;
    const targetY = 0.95;
    const targetZ = pz;
    const desiredX = px + 11.5;
    const desiredY = 16.8;
    const desiredZ = pz + 11.5;
    const t = 1 - Math.pow(0.001, dt);
    camera.position.x += (desiredX - camera.position.x) * t;
    camera.position.y += (desiredY - camera.position.y) * t;
    camera.position.z += (desiredZ - camera.position.z) * t;
    camera.lookAt(targetX, targetY, targetZ);
  }

  function gameLoop(now) {
    const dt = Math.min(0.033, ((now || 0) - (gameLoop.last || now)) / 1000 || 0.016);
    gameLoop.last = now || performance.now();

    updatePlayer(dt);
    updateKitchen(dt);
    updateOven(dt);
    spawnLoop(dt);

    for (const c of customers) updateCustomer(c, dt);
    for (let i = customers.length - 1; i >= 0; i--) {
      if (customers[i].dead) customers.splice(i, 1);
    }

    updateParticles(dt);
    updateSelectionRing();
    updateHUD();
    updateCamera(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(gameLoop);
  }

  function setStick(dx, dz) {
    const max = state.touch.max;
    const len = Math.hypot(dx, dz);
    if (len > max) {
      dx = dx / len * max;
      dz = dz / len * max;
    }
    ui.nub.style.transform = 'translate(-50%, -50%) translate(' + dx + 'px, ' + dz + 'px)';
    state.touch.dx = dx / max;
    state.touch.dz = dz / max;
  }

  function hideStick() {
    state.touch.active = false;
    state.touch.id = null;
    state.touch.dx = 0;
    state.touch.dz = 0;
    ui.stick.style.opacity = '0';
    ui.stick.style.transform = 'translate(-9999px,-9999px)';
    ui.nub.style.transform = 'translate(-50%, -50%)';
  }

  function isUiTarget(target) {
    return !!(target && typeof target.closest === 'function' && target.closest('.hud, .top-actions, .footer, button'));
  }

  function setupFloatingJoystick() {
    ui.stick.style.position = 'fixed';
    ui.stick.style.left = '0px';
    ui.stick.style.top = '0px';
    ui.stick.style.transform = 'translate(-9999px,-9999px)';
    ui.stick.style.opacity = '0';
    ui.stick.style.pointerEvents = 'none';
    ui.stick.style.zIndex = '70';
    ui.nub.style.transform = 'translate(-50%, -50%)';
    ui.nub.style.pointerEvents = 'none';

    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      if (isUiTarget(e.target)) return;
      if (e.clientX > window.innerWidth * 0.58) return;
      state.touch.active = true;
      state.touch.id = e.pointerId;
      state.touch.cx = e.clientX;
      state.touch.cy = e.clientY;
      ui.stick.style.left = e.clientX + 'px';
      ui.stick.style.top = e.clientY + 'px';
      ui.stick.style.transform = 'translate(-50%, -50%)';
      ui.stick.style.opacity = '1';
      setStick(0, 0);
      e.preventDefault();
    }, { passive: false });

    window.addEventListener('pointermove', (e) => {
      if (!state.touch.active || e.pointerId !== state.touch.id) return;
      setStick(e.clientX - state.touch.cx, e.clientY - state.touch.cy);
      e.preventDefault();
    }, { passive: false });

    const end = (e) => {
      if (!state.touch.active || e.pointerId !== state.touch.id) return;
      hideStick();
      e.preventDefault();
    };
    window.addEventListener('pointerup', end, { passive: false });
    window.addEventListener('pointercancel', end, { passive: false });
  }

  function addButtonHandlers() {
    ui.spawnBtn.addEventListener('click', () => spawnCustomer(true));
    ui.buyStockBtn.addEventListener('click', buyStock);
    ui.upgradeCarryBtn.addEventListener('click', upgradeCarry);
    ui.upgradeOvenBtn.addEventListener('click', upgradeOven);
    ui.saveBtn.addEventListener('click', save);
    ui.resetBtn.addEventListener('click', reset);
    ui.actionBtn.addEventListener('click', interact);
  }

  function onKeyDown(e) {
    state.keys[e.key.toLowerCase()] = true;
    if (e.key.toLowerCase() === 'e' || e.key === ' ') {
      e.preventDefault();
      interact();
    }
  }

  function onKeyUp(e) {
    state.keys[e.key.toLowerCase()] = false;
  }

  function save() {
    const data = {
      money: state.money,
      stock: state.stock,
      carry: state.carry,
      carryCap: state.carryCap,
      rep: state.rep,
      ovenLevel: state.ovenLevel,
      player: { x: state.player.x, z: state.player.z, angle: state.player.angle },
      oven: { stack: worldOvenStack.count, timer: state.ovenTimer },
      tables: tables.map(t => ({ active: t.active, capacity: t.capacity, stack: t.stack, upgradeLevel: t.upgradeLevel }))
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
        if (typeof data.player.angle === 'number') state.player.angle = data.player.angle;
      }
      if (data.oven && typeof data.oven.stack === 'number') worldOvenStack.count = data.oven.stack;
      if (data.oven && typeof data.oven.timer === 'number') state.ovenTimer = data.oven.timer;
      if (Array.isArray(data.tables)) {
        data.tables.forEach((src, i) => {
          if (!tables[i]) return;
          tables[i].active = !!src.active;
          tables[i].capacity = typeof src.capacity === 'number' ? src.capacity : tables[i].capacity;
          tables[i].stack = typeof src.stack === 'number' ? src.stack : tables[i].stack;
          tables[i].upgradeLevel = typeof src.upgradeLevel === 'number' ? src.upgradeLevel : tables[i].upgradeLevel;
          if (tables[i].active) scene.add(tables[i].group);
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
    state.player.angle = 0;
    state.ovenTimer = 0;
    customers.slice().forEach(c => scene.remove(c.mesh));
    customers.length = 0;
    particles.slice().forEach(p => scene.remove(p.sprite));
    particles.length = 0;
    tables.forEach((t, i) => {
      t.stack = 0;
      t.customerId = null;
      t.occupied = false;
      t.upgradeLevel = 1;
      t.capacity = 10;
      t.active = i < 4;
      if (t.active && !scene.children.includes(t.group)) scene.add(t.group);
      updateTableStack(t);
    });
    worldOvenStack.count = 0;
    worldOvenStack.setCount(0);
    updateStacks();
    rebuildBlockedMap();
    toast('Reset hotov');
  }

  function init() {
    rebuildBlockedMap();
    setupFloatingJoystick();
    addButtonHandlers();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', () => {
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    });

    load();
    state.player.x = clamp(state.player.x, 1.2, GRID_W - 1.2);
    state.player.z = clamp(state.player.z, 1.2, GRID_H - 1.2);
    playerModel.group.position.set(state.player.x, 0, state.player.z);
    tables.forEach(t => updateTableStack(t));
    worldOvenStack.setCount(worldOvenStack.count);
    updateStacks();
    toast('Engine ready', 'Kamera a joystick jsou přímo v hlavním enginu.');
    requestAnimationFrame(gameLoop);
  }

  init();
})();
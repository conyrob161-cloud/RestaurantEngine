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
    upgradeTableBtn: document.getElementById('upgradeTableBtn'),
    buyTableBtn: document.getElementById('buyTableBtn'),
    upgradeOvenBtn: document.getElementById('upgradeOvenBtn'),
    saveBtn: document.getElementById('saveBtn'),
    resetBtn: document.getElementById('resetBtn'),
    actionBtn: document.getElementById('actionBtn'),
    stick: document.getElementById('stick'),
    nub: document.getElementById('nub'),
  };

  const GRID_W = 20;
  const GRID_H = 20;
  const SAVE_KEY = 'restaurant-zombie-v3';
  const WORLD = {
    stock: { gx: 3, gz: 3 },
    oven: { gx: 6, gz: 4 },
    counter: { gx: 9, gz: 4 },
    cash: { gx: 16, gz: 3 },
    entrance: { gx: 10, gz: 18 },
  };

  const tableSpots = [
    { gx: 6, gz: 9 },
    { gx: 13, gz: 9 },
    { gx: 6, gz: 14 },
    { gx: 13, gz: 14 },
    { gx: 3, gz: 12 },
    { gx: 16, gz: 12 },
    { gx: 3, gz: 15 },
    { gx: 16, gz: 15 },
  ];

  const blocked = Array.from({ length: GRID_H }, () => Array(GRID_W).fill(false));

  const state = {
    money: 25,
    stock: 8,
    carry: 0,
    carryCap: 5,
    rep: 0,
    ovenLevel: 1,
    player: { x: 10.5, z: 17.5, angle: 0, speed: 3.8, bob: 0 },
    keys: {},
    touch: { active: false, id: null, dx: 0, dz: 0, cx: 0, cy: 0, max: 72 },
    customers: [],
    chefs: [],
    lastSpawn: 0,
    selectedTable: 0,
    particles: [],
    ovenTimer: 0,
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
    for (const t of tables) {
      if (t.active) block(t.gx, t.gz);
    }
  }

  function canOccupy(x, z, radius = 0.22) {
    const samples = [
      [0, 0],
      [radius, 0], [-radius, 0], [0, radius], [0, -radius],
      [radius, radius], [radius, -radius], [-radius, radius], [-radius, -radius],
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
      new THREE.MeshStandardMaterial({ color: 0xc47a3a, roughness: 0.95 }),
    );
    const cheese = new THREE.Mesh(
      new THREE.CylinderGeometry(0.19, 0.21, 0.03, 6),
      new THREE.MeshStandardMaterial({ color: 0xf0ca78, roughness: 0.9 }),
    );
    cheese.position.y = 0.04;
    crust.add(cheese);
    group.add(crust);
    return group;
  }

  function createStack(max = 10, colorShift = 0) {
    const group = new THREE.Group();
    const items = [];
    for (let i = 0; i < max; i++) {
      const mesh = createPizzaMesh();
      mesh.visible = false;
      mesh.position.y = i * 0.055;
      mesh.rotation.y = i * 0.43 + colorShift;
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
      new THREE.MeshStandardMaterial({ color: chef ? 0xffffff : 0xf4f4f4, roughness: 0.8 }),
    );
    hat.position.y = chef ? 1.44 : 1.34;
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.34, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 }),
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
      new THREE.MeshStandardMaterial({ color: 0xc49a6c, roughness: 0.95 }),
    );
    top.position.y = 0.72;
    const legMat = new THREE.MeshStandardMaterial({ color: 0x6d4c3a, roughness: 0.95 });
    const legs = [
      [-0.55, 0.35], [0.55, 0.35], [-0.55, -0.35], [0.55, -0.35],
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
      new THREE.MeshStandardMaterial({ color: 0x8f654b, roughness: 0.95 }),
    );
    seat.position.y = 0.42;
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.34, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x7a573f, roughness: 0.95 }),
    );
    back.position.set(0, 0.68, -0.14);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x6d4c3a, roughness: 0.95 });
    const legs = [
      [-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14],
    ].map(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.42, 0.04), legMat);
      leg.position.set(x, 0.21, z);
      return leg;
    });
    group.add(seat, back, ...legs);
    return group;
  }

  function createTable(spot, active = true) {
    const table = {
      gx: spot.gx,
      gz: spot.gz,
      seat: { gx: spot.gx, gz: spot.gz + 1 },
      active,
      capacity: 10,
      stack: 0,
      customerId: null,
      occupied: false,
      bill: 0,
      group: new THREE.Group(),
      stackModel: createStack(12),
      ring: null,
      capLabel: null,
      stackLabel: null,
      upgradeLevel: 1,
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
      new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0x664400, roughness: 0.5 }),
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
    capLabel.sprite.visible = true;
    root.add(capLabel.sprite);

    table.ring = ring;
    table.stackModel = stack;
    table.stackLabel = stackLabel;
    table.capLabel = capLabel;

    return table;
  }

  function placeTableInScene(table) {
    table.group.position.set(table.gx + 0.5, 0, table.gz + 0.5);
    if (!scene.children.includes(table.group)) scene.add(table.group);
    block(table.gx, table.gz);
  }

  function updateTableStack(table) {
    table.stackModel.setCount(table.stack);
    table.stackLabel.draw(String(table.stack));
    table.capLabel.draw(String(table.capacity));
  }

  function createParticle(text, x, z, color = '#fff') {
    const p = makeLabelSprite(text, '#111827', color, 1.8, 0.8);
    p.sprite.position.set(x, 1.6, z);
    scene.add(p.sprite);
    state.particles.push({ sprite: p.sprite, life: 1, speed: 0.4, tex: p });
  }

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
      player: { x: state.player.x, z: state.player.z, angle: state.player.angle },
      oven: { stack: worldOvenStack.count, timer: state.ovenTimer },
      tables: tables.map(t => ({
        active: t.active,
        capacity: t.capacity,
        stack: t.stack,
        upgradeLevel: t.upgradeLevel,
      })),
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
      if (Array.isArray(data.tables)) {
        data.tables.forEach((src, i) => {
          if (!tables[i]) return;
          tables[i].active = !!src.active;
          tables[i].capacity = typeof src.capacity === 'number' ? src.capacity : tables[i].capacity;
          tables[i].stack = typeof src.stack === 'number' ? src.stack : tables[i].stack;
          tables[i].upgradeLevel = typeof src.upgradeLevel === 'number' ? src.upgradeLevel : tables[i].upgradeLevel;
        });
      }
      if (data.oven && typeof data.oven.stack === 'number') worldOvenStack.count = data.oven.stack;
      if (data.oven && typeof data.oven.timer === 'number') state.ovenTimer = data.oven.timer;
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
    state.customers.forEach(c => scene.remove(c.mesh));
    state.customers.length = 0;
    state.particles.forEach(p => scene.remove(p.sprite));
    state.particles.length = 0;
    tables.forEach((t, i) => {
      t.stack = 0;
      t.customerId = null;
      t.occupied = false;
      if (i < 4) t.active = true;
      else t.active = false;
    });
    worldOvenStack.count = 0;
    rebuildBlockedMap();
    updateCarryStack();
    tables.forEach(updateTableStack);
    toast('Reset hotov');
  }

  function createPath(start, goal) {
    const queue = [start];
    const seen = new Set([`${start.gx},${start.gz}`]);
    const prev = new Map();
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
      const neighbors = [
        { gx: cur.gx + 1, gz: cur.gz },
        { gx: cur.gx - 1, gz: cur.gz },
        { gx: cur.gx, gz: cur.gz + 1 },
        { gx: cur.gx, gz: cur.gz - 1 },
      ];
      for (const n of neighbors) {
        const key = `${n.gx},${n.gz}`;
        if (seen.has(key) || cellBlocked(n.gx, n.gz)) continue;
        seen.add(key);
        prev.set(key, cur);
        queue.push(n);
      }
    }
    return [];
  }

  function activateSelectedTable() {
    const inactive = tables.find(t => !t.active);
    if (!inactive) {
      toast('Více stolů už nejsou', 'Všechny sloty jsou plné.');
      return;
    }
    const activeCount = tables.filter(t => t.active).length;
    const cost = 40 + activeCount * 20;
    if (state.money < cost) {
      toast('Málo peněz', `Potřebuješ ${cost}.`);
      return;
    }
    state.money -= cost;
    inactive.active = true;
    placeTableInScene(inactive);
    toast('Nový stůl', `Cena ${cost}.`);
  }

  function upgradeNearestTable() {
    const table = findNearestActiveTable();
    if (!table) {
      toast('Žádný stůl poblíž');
      return;
    }
    const cost = 25 + table.upgradeLevel * 20;
    if (state.money < cost) {
      toast('Málo peněz', `Potřebuješ ${cost}.`);
      return;
    }
    state.money -= cost;
    table.upgradeLevel += 1;
    table.capacity += 5;
    table.capLabel.draw(String(table.capacity));
    toast('Stůl vylepšen', `Kapacita ${table.capacity}.`);
  }

  function findNearestActiveTable() {
    let best = null;
    let bestD = Infinity;
    for (const table of tables) {
      if (!table.active) continue;
      const c = cellCenter(table.gx, table.gz);
      const d = dist(state.player.x, state.player.z, c.x, c.z);
      if (d < bestD) {
        bestD = d;
        best = table;
      }
    }
    return best;
  }

  function spawnCustomer(manual = false) {
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
      table,
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
      headMat: model.headMat,
    };
    table.occupied = true;
    table.customerId = customer.id;
    table.stack = 0;
    updateTableStack(table);
    customer.path = createPath(worldToCell(customer.x, customer.z), table.seat);
    customer.pathIndex = 0;
    refreshCustomerLook(customer);
    state.customers.push(customer);
    toast('Host přišel', manual ? 'Přivolán ke stolu.' : 'Míří ke stolu.');
  }

  function refreshCustomerLook(c) {
    const palette = {
      walking: [0x4f7dc8, 0xf4d7bc],
      waiting: [0x4f7dc8, 0xf4d7bc],
      eating: [0xffca6a, 0xf7e6be],
      paying: [0xff9f43, 0xffe0c0],
      leaving: [0xe05d5d, 0xffd0d0],
    };
    const [bodyColor, headColor] = palette[c.state] || palette.walking;
    c.bodyMat.color.setHex(bodyColor);
    c.headMat.color.setHex(headColor);
  }

  function updateOven(dt) {
    state.ovenTimer += dt;
    const interval = Math.max(1.5, 4.4 - state.ovenLevel * 0.35);
    while (state.ovenTimer >= interval) {
      state.ovenTimer -= interval;
      if (state.stock > 0 && worldOvenStack.count < worldOvenStack.max) {
        state.stock -= 1;
        worldOvenStack.count += 1;
        worldOvenStack.setCount(worldOvenStack.count);
        createParticle('+pizza', WORLD.oven.gx + 0.5, WORLD.oven.gz + 0.5, '#ffd166');
      } else {
        break;
      }
    }
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
    worldOvenStack.setCount(worldOvenStack.count);
    state.carry += take;
    updateCarryStack();
    createParticle(`+${take}`, WORLD.oven.gx + 0.5, WORLD.oven.gz + 0.5, '#ffd166');
    toast('Pizza naložena', `Vzato ${take}.`);
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
      toast('Málo peněz', `Potřebuješ ${cost}.`);
      return;
    }
    state.money -= cost;
    state.carryCap += 2;
    updateCarryStack();
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
    toast('Pec vylepšena', 'Pec je rychlejší.');
  }

  function serveTable(table) {
    const customer = state.customers.find(c => c.table === table && c.state !== 'leaving');
    if (!customer) {
      toast('U stolu nikdo není');
      return true;
    }
    if (state.carry <= 0) {
      toast('Nemáš pizzu');
      return true;
    }
    if (table.stack >= table.capacity) {
      toast('Stůl je plný');
      return true;
    }

    state.carry -= 1;
    updateCarryStack();
    table.stack += 1;
    updateTableStack(table);
    createParticle('-pizza', table.gx + 0.5, table.gz + 0.5, '#ffcf6f');
    toast('Pizza podána', 'Na stůl přibyla další pizza.');
    if (customer.state === 'waiting' && table.stack > customer.eaten) {
      customer.state = 'eating';
      customer.eatTimer = 1.6;
      refreshCustomerLook(customer);
    }
    return true;
  }

  function interact() {
    const nearestTable = findNearestActiveTable();
    if (nearestTable) {
      const c = cellCenter(nearestTable.gx, nearestTable.gz);
      if (dist(state.player.x, state.player.z, c.x, c.z) < 1.6 && serveTable(nearestTable)) return;
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
      const speed = state.player.speed;
      const nx = state.player.x + dx * speed * dt;
      const nz = state.player.z + dz * speed * dt;
      if (canOccupy(nx, state.player.z)) state.player.x = nx;
      if (canOccupy(state.player.x, nz)) state.player.z = nz;
      state.player.angle = Math.atan2(dx, dz);
      state.player.bob += dt * 10;
    } else {
      state.player.bob *= 0.92;
    }
    playerModel.group.position.set(state.player.x, 0, state.player.z);
    playerModel.group.rotation.y = state.player.angle;
    playerModel.head.position.y = 1.1 + Math.sin(performance.now() * 0.01) * 0.01;
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
          } else {
            if (c.state === 'walking') {
              c.state = 'waiting';
              c.waitTimer = 18 + Math.random() * 10;
              refreshCustomerLook(c);
              toast('Host sedí', `Objednal ${c.order} pizz.`);
            } else {
              c.dead = true;
              c.table.occupied = false;
              c.table.customerId = null;
              c.table.stack = 0;
              updateTableStack(c.table);
              scene.remove(c.mesh);
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
    } else if (c.state === 'waiting') {
      c.waitTimer -= dt;
      if (c.waitTimer <= 0) {
        c.state = 'leaving';
        c.path = createPath(worldToCell(c.x, c.z), WORLD.entrance);
        c.pathIndex = 0;
        state.rep = Math.max(0, state.rep - 1);
        refreshCustomerLook(c);
        toast('Host odchází', 'Příliš dlouhé čekání.');
      } else if (c.table.stack > c.eaten) {
        c.state = 'eating';
        c.eatTimer = 1.4;
        refreshCustomerLook(c);
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
          refreshCustomerLook(c);
          toast('Host dojídá', `Účtenka €${c.reward}`);
        } else {
          c.state = 'waiting';
          refreshCustomerLook(c);
        }
      }
    } else if (c.state === 'paying') {
      c.payTimer -= dt;
      if (c.payTimer <= 0) {
        state.money += c.reward;
        state.rep += 1;
        createParticle(`+${c.reward}`, c.table.gx + 0.5, c.table.gz + 0.5, '#8fe08f');
        c.state = 'leaving';
        c.path = createPath(worldToCell(c.x, c.z), WORLD.entrance);
        c.pathIndex = 0;
        refreshCustomerLook(c);
        toast('Host zaplatil', `+${c.reward}`);
      }
    }
    c.mesh.position.set(c.x, 0, c.z);
  }

  function updateParticles(dt) {
    for (const p of state.particles) {
      p.life -= dt;
      p.sprite.position.y += dt * p.speed;
      p.sprite.material.opacity = clamp(p.life, 0, 1);
    }
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      if (p.life > 0) continue;
      scene.remove(p.sprite);
      p.sprite.material.map?.dispose?.();
      p.sprite.material.dispose();
      state.particles.splice(i, 1);
    }
  }

  function updateHUD() {
    ui.money.textContent = Math.floor(state.money);
    ui.stock.textContent = state.stock;
    ui.carry.textContent = `${state.carry}/${state.carryCap}`;
    ui.oven.textContent = worldOvenStack.count;
    ui.waiting.textContent = state.customers.filter(c => c.state === 'waiting').length;
    ui.rep.textContent = state.rep;
    ui.buyTableBtn.textContent = `Nový stůl (${40 + tables.filter(t => t.active).length * 20})`;
    ui.upgradeTableBtn.textContent = `Stůl (${findNearestActiveTable()?.capacity || 0})`;
    ui.upgradeCarryBtn.textContent = `Kapacita (${15 * state.carryCap})`;
    ui.upgradeOvenBtn.textContent = `Pec (${20 * state.ovenLevel})`;
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
    if (chefStation.timer >= chefStation.cycle) {
      chefStation.timer -= chefStation.cycle;
      if (state.stock > 0 && worldOvenStack.count < worldOvenStack.max) {
        state.stock -= 1;
        worldOvenStack.count += 1;
        worldOvenStack.setCount(worldOvenStack.count);
        createParticle('+pizza', WORLD.oven.gx + 0.5, WORLD.oven.gz + 0.5, '#ffd166');
      }
    }
    chefStation.group.rotation.y = Math.sin(performance.now() * 0.001) * 0.12;
    chefStation.group.position.y = Math.sin(performance.now() * 0.006) * 0.03;
  }

  function spawnLoop(dt) {
    state.lastSpawn += dt;
    if (state.lastSpawn > 8.5 && state.customers.filter(c => !c.dead).length < 4) {
      spawnCustomer(false);
      state.lastSpawn = 0;
    }
  }

  function updateCamera(dt) {
    const px = state.player.x;
    const pz = state.player.z;
    const target = new THREE.Vector3(px, 0.9, pz);
    const desired = new THREE.Vector3(px + 11.5, 16.8, pz + 11.5);
    const lerp = 1 - Math.pow(0.001, dt);
    camera.position.lerp(desired, lerp);
    camera.lookAt(target);
  }

  function gameLoop(now) {
    const dt = Math.min(0.033, ((now || 0) - (gameLoop.last || now)) / 1000 || 0.016);
    gameLoop.last = now || performance.now();

    updatePlayer(dt);
    updateKitchen(dt);
    updateOven(dt);
    spawnLoop(dt);

    for (const c of state.customers) updateCustomer(c, dt);
    for (let i = state.customers.length - 1; i >= 0; i--) {
      if (state.customers[i].dead) state.customers.splice(i, 1);
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
    const nx = clamp(dx, -max, max);
    const nz = clamp(dz, -max, max);
    ui.nub.style.transform = `translate(-50%, -50%) translate(${nx}px, ${nz}px)`;
    state.touch.dx = nx / max;
    state.touch.dz = nz / max;
  }

  function clearStick() {
    state.touch.active = false;
    state.touch.id = null;
    state.touch.dx = 0;
    state.touch.dz = 0;
    ui.nub.style.transform = 'translate(-50%, -50%)';
    ui.stick.style.opacity = '0';
    ui.stick.style.transform = 'translate(-9999px,-9999px)';
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
      ui.stick.style.left = `${e.clientX}px`;
      ui.stick.style.top = `${e.clientY}px`;
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
      clearStick();
      e.preventDefault();
    };
    window.addEventListener('pointerup', end, { passive: false });
    window.addEventListener('pointercancel', end, { passive: false });
  }

  function addButtonHandlers() {
    ui.spawnBtn.addEventListener('click', () => spawnCustomer(true));
    ui.buyStockBtn.addEventListener('click', buyStock);
    ui.upgradeCarryBtn.addEventListener('click', upgradeCarry);
    ui.upgradeTableBtn.addEventListener('click', upgradeNearestTable);
    ui.buyTableBtn.addEventListener('click', activateSelectedTable);
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

  function init() {
    rebuildBlockedMap();
    buildScene();
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
    updateCarryStack();
    tables.forEach((t) => {
      if (t.active && !scene.children.includes(t.group)) placeTableInScene(t);
      updateTableStack(t);
    });
    worldOvenStack.setCount(worldOvenStack.count);
    toast('Engine ready', 'Kamera, joystick a stacky jsou přepsané.');
    requestAnimationFrame(gameLoop);
  }

  init();
})();
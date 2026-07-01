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

  const SAVE_KEY = 'restaurant-engine-v9';
  const GRID_W = 20;
  const GRID_H = 20;
  const START_ACTIVE_TABLES = 2;
  const FOOD = ['pizza', 'burger'];
  const FOOD_EMOJI = { pizza: '🍕', burger: '🍔' };
  const WORLD = {
    stock: { gx: 3, gz: 3 },
    pizza: { gx: 6, gz: 4 },
    burger: { gx: 8, gz: 4 },
    trash: { gx: 13, gz: 4 },
    counter: { gx: 11, gz: 4 },
    cash: { gx: 16, gz: 3 },
    entrance: { gx: 10, gz: 18 },
  };
  const BUILD_SPOTS = [
    { gx: 5, gz: 9, cost: 60 },
    { gx: 14, gz: 9, cost: 75 },
    { gx: 5, gz: 14, cost: 90 },
    { gx: 14, gz: 14, cost: 110 },
    { gx: 3, gz: 11, cost: 130 },
    { gx: 16, gz: 11, cost: 150 },
  ];

  const state = {
    money: 25,
    stock: 10,
    carryCap: 6,
    rep: 0,
    player: { x: 10.5, z: 17.5, angle: 0, speed: 3.8 },
    keys: {},
    touch: { active: false, id: null, cx: 0, cy: 0, dx: 0, dz: 0, max: 78 },
    customers: [],
    particles: [],
    tray: [],
    lastSpawn: 0,
    stationTimers: { pizza: 0, burger: 0 },
    stationCounts: { pizza: 0, burger: 0 },
    stationLevels: { pizza: 1, burger: 1 },
    emergencyAt: 0,
    adCooldownAt: 0,
  };

  const blocked = Array.from({ length: GRID_H }, () => Array(GRID_W).fill(false));
  const tables = [];
  const buildMarkers = [];
  const stationStacks = {};
  let renderer, scene, camera, player, chef;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
  const cellCenter = (gx, gz) => ({ x: gx + 0.5, z: gz + 0.5 });
  const worldToCell = (x, z) => ({ gx: Math.floor(x), gz: Math.floor(z) });
  const hashString = (text) => {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };
  const trayCount = () => state.tray.length;
  const traySummary = () => state.tray.length ? state.tray.map((t) => FOOD_EMOJI[t]).join('') : '—';

  function toast(title, sub = '') {
    ui.toast.innerHTML = `<strong>${title}</strong>${sub ? `<div class="small">${sub}</div>` : ''}`;
    ui.toast.classList.add('show');
    clearTimeout(ui.toast._t);
    ui.toast._t = setTimeout(() => ui.toast.classList.remove('show'), 1500);
  }

  function roundedRect(ctx, x, y, w, h, r) {
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
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    drawFn(ctx, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  function makeLabelSprite(text, bg = '#111827', fg = '#fff', scaleX = 2.4, scaleY = 1.0) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const ctx = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    const draw = (value) => {
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.fillStyle = bg;
      roundedRect(ctx, 24, 44, 464, 168, 32);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.fillStyle = fg;
      ctx.font = '900 54px system-ui, Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(value, 256, 128);
      tex.needsUpdate = true;
    };
    draw(text);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.scale.set(scaleX, scaleY, 1);
    return { sprite, draw };
  }

  function makeFoodMesh(type) {
    const g = new THREE.Group();
    if (type === 'pizza') {
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.26, 0.06, 6),
        new THREE.MeshStandardMaterial({ color: 0xc47a3a, roughness: 0.96 })
      );
      const cheese = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.22, 0.03, 6),
        new THREE.MeshStandardMaterial({ color: 0xf0ca78, roughness: 0.92 })
      );
      cheese.position.y = 0.04;
      g.add(base, cheese);
    } else {
      const bunTop = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0xe1b46f, roughness: 0.96 })
      );
      const patty = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.06, 0.18),
        new THREE.MeshStandardMaterial({ color: 0x7a4b2d, roughness: 1 })
      );
      const bunBot = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0xd9a95a, roughness: 0.96 })
      );
      bunTop.position.y = 0.10;
      patty.position.y = 0.02;
      bunBot.position.y = -0.05;
      g.add(bunBot, patty, bunTop);
    }
    return g;
  }

  function makeStack(max = 10, type = 'pizza') {
    const group = new THREE.Group();
    const items = [];
    for (let i = 0; i < max; i++) {
      const mesh = makeFoodMesh(type);
      mesh.visible = false;
      mesh.position.y = i * 0.055;
      mesh.rotation.y = i * 0.43;
      items.push(mesh);
      group.add(mesh);
    }
    function setCount(count) {
      const n = clamp(count, 0, max);
      items.forEach((m, i) => {
        m.visible = i < n;
        m.position.y = i * 0.055;
      });
      group.visible = n > 0;
    }
    return { group, setCount, items, max, count: 0 };
  }

  function createShadow(opacity = 0.18, radius = 0.38) {
    const s = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity })
    );
    s.rotation.x = -Math.PI / 2;
    s.position.y = 0.01;
    return s;
  }

  function makeFaceTexture(seed, skin, hair) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = skin;
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = hair;
    const v = seed % 4;
    ctx.beginPath();
    ctx.ellipse(128, 92, 92, 90, 0, Math.PI, 0);
    ctx.fill();
    if (v === 1) {
      ctx.fillRect(28, 50, 36, 112);
      ctx.fillRect(192, 50, 36, 112);
    } else if (v === 2) {
      ctx.beginPath();
      ctx.ellipse(128, 74, 70, 34, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (v === 3) {
      ctx.beginPath();
      ctx.ellipse(128, 74, 86, 46, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#141414';
    ctx.beginPath();
    ctx.arc(88, 126, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(168, 126, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(175,120,100,0.95)';
    roundedRect(ctx, 121, 136, 14, 26, 7);
    ctx.fill();
    ctx.strokeStyle = '#6b2b2b';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(128, 172, 18, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }

  function makeCharacter(type, seedText) {
    const seed = hashString(seedText);
    const root = new THREE.Group();
    root.userData.type = type;
    root.add(createShadow(0.18, 0.4));

    const bodyColor = type === 'chef'
      ? '#f8f6f0'
      : type === 'player'
        ? '#4d78b5'
        : ['#5f7dd6', '#d96c6c', '#4c9b72', '#9e78d2'][seed % 4];
    const hairColor = type === 'chef'
      ? '#1f1f1f'
      : type === 'player'
        ? '#253047'
        : ['#3f2e24', '#2c2a28', '#5e452f', '#1c1f27'][seed % 4];
    const skin = '#f0ceb1';

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.3, 0.82, 6),
      new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.95 })
    );
    body.position.y = 0.82;
    root.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 12, 10),
      new THREE.MeshStandardMaterial({ color: skin, map: makeFaceTexture(seed, skin, hairColor), roughness: 0.95 })
    );
    head.position.y = 1.72;
    root.add(head);

    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 12, 10),
      new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.96 })
    );
    hair.scale.set(1.0, 0.72, 0.96);
    hair.position.set(0, 1.78, -0.01);
    root.add(hair);

    const armMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.96 });
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.5, 6), armMat);
    armL.position.set(-0.38, 1.0, 0);
    armL.rotation.z = -0.35;
    root.add(armL);
    const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.5, 6), armMat);
    armR.position.set(0.38, 1.0, 0);
    armR.rotation.z = 0.35;
    root.add(armR);

    const legMat = new THREE.MeshStandardMaterial({ color: type === 'chef' ? '#1f1f1f' : '#1d2230', roughness: 1 });
    const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.45, 6), legMat);
    legL.position.set(-0.13, 0.28, 0);
    root.add(legL);
    const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.45, 6), legMat);
    legR.position.set(0.13, 0.28, 0);
    root.add(legR);
    const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.32), legMat);
    shoeL.position.set(-0.13, 0.03, 0.07);
    root.add(shoeL);
    const shoeR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.32), legMat);
    shoeR.position.set(0.13, 0.03, 0.07);
    root.add(shoeR);

    const hat = new THREE.Group();
    if (type === 'chef') {
      const mat = new THREE.MeshStandardMaterial({ color: '#fff', roughness: 0.8 });
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 6), mat);
      band.position.y = -0.03;
      hat.add(band);
      [0.16, 0.34, 0.16].forEach((y, i) => {
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.14 + (i === 1 ? 0.02 : 0), 8, 6), mat);
        p.position.set((i - 1) * 0.08, y, 0);
        hat.add(p);
      });
      hat.position.y = 2.15;
    } else if (type === 'player') {
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.12, 0.28),
        new THREE.MeshStandardMaterial({ color: '#24324c', roughness: 0.86 })
      );
      cap.position.y = 0.04;
      hat.add(cap);
      const brim = new THREE.Mesh(
        new THREE.BoxGeometry(0.38, 0.05, 0.18),
        new THREE.MeshStandardMaterial({ color: '#8ecae6', roughness: 0.84 })
      );
      brim.position.set(0, -0.02, 0.16);
      hat.add(brim);
      hat.position.y = 2.0;
    }
    root.add(hat);
    root.userData.hat = hat;
    root.userData.seed = seed;
    return root;
  }

  function makeTableVisual() {
    const g = new THREE.Group();
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.12, 0.9),
      new THREE.MeshStandardMaterial({ color: '#c49a6c', roughness: 0.95 })
    );
    top.position.y = 0.72;
    g.add(top);
    const legMat = new THREE.MeshStandardMaterial({ color: '#6d4c3a', roughness: 0.95 });
    [[-0.55, 0.35], [0.55, 0.35], [-0.55, -0.35], [0.55, -0.35]].forEach(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.74, 0.08), legMat);
      leg.position.set(x, 0.37, z);
      g.add(leg);
    });
    return g;
  }

  function createChair() {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.08, 0.36),
      new THREE.MeshStandardMaterial({ color: '#8f654b', roughness: 0.95 })
    );
    seat.position.y = 0.42;
    g.add(seat);
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.34, 0.06),
      new THREE.MeshStandardMaterial({ color: '#7a573f', roughness: 0.95 })
    );
    back.position.set(0, 0.68, -0.14);
    g.add(back);
    const legMat = new THREE.MeshStandardMaterial({ color: '#6d4c3a', roughness: 0.95 });
    [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]].forEach(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.42, 0.04), legMat);
      leg.position.set(x, 0.21, z);
      g.add(leg);
    });
    return g;
  }

  function buildTable(slot, active = false) {
    const table = {
      gx: slot.gx,
      gz: slot.gz,
      seat: { gx: slot.gx, gz: slot.gz + 1 },
      cost: slot.cost,
      active,
      capacity: 10,
      items: [],
      customerId: null,
      occupied: false,
      group: new THREE.Group(),
      itemGroup: new THREE.Group(),
      label: null,
    };
    const root = table.group;
    root.position.set(slot.gx + 0.5, 0, slot.gz + 0.5);
    root.userData.table = table;
    root.add(makeTableVisual());
    const chairA = createChair();
    chairA.position.set(0, 0, 0.68);
    chairA.rotation.y = Math.PI;
    const chairB = createChair();
    chairB.position.set(0, 0, -0.68);
    root.add(chairA, chairB);
    table.itemGroup.position.set(0, 0.82, 0);
    root.add(table.itemGroup);
    const label = makeLabelSprite('0', '#1f2937', '#fff', 0.9, 0.45);
    label.sprite.position.set(0, 1.85, 0);
    root.add(label.sprite);
    table.label = label;
    return table;
  }

  function createBuildMarker(table) {
    const g = new THREE.Group();
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.5, 8),
      new THREE.MeshStandardMaterial({ color: '#73ef73', emissive: '#225522', roughness: 0.45 })
    );
    arrow.position.y = 1.05;
    g.add(arrow);
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8),
      new THREE.MeshStandardMaterial({ color: '#2e8c2e', roughness: 0.6 })
    );
    stem.position.y = 0.62;
    g.add(stem);
    const label = makeLabelSprite(`Stůl ${table.cost}`, '#143214', '#dfffe0', 1.9, 0.7);
    label.sprite.position.y = 1.65;
    g.add(label.sprite);
    g.position.set(table.gx + 0.5, 0, table.gz + 0.5);
    g.userData.table = table;
    g.userData.arrow = arrow;
    g.userData.label = label;
    return g;
  }

  function updateTableVisuals(table) {
    while (table.itemGroup.children.length) table.itemGroup.remove(table.itemGroup.children[0]);
    table.items.forEach((item, idx) => {
      const mesh = makeFoodMesh(item);
      mesh.position.set((idx % 5) * 0.14 - 0.28, 0.02, Math.floor(idx / 5) * 0.14 - 0.07);
      mesh.rotation.y = idx * 0.2;
      mesh.scale.setScalar(0.8);
      table.itemGroup.add(mesh);
    });
    table.label.draw(String(table.items.length));
  }

  function updateCarryHUD() {
    ui.carry.textContent = traySummary();
  }

  function orderText(customer) {
    const parts = [];
    FOOD.forEach((type) => {
      for (let i = 0; i < customer.need[type]; i++) parts.push(FOOD_EMOJI[type]);
    });
    return parts.length ? parts.join('') : 'OK';
  }

  function rebuildBlockedMap() {
    for (let z = 0; z < GRID_H; z++) for (let x = 0; x < GRID_W; x++) blocked[z][x] = false;
    for (let x = 0; x < GRID_W; x++) {
      blocked[0][x] = true;
      blocked[GRID_H - 1][x] = true;
    }
    for (let z = 0; z < GRID_H; z++) {
      blocked[z][0] = true;
      blocked[z][GRID_W - 1] = true;
    }
    for (let x = 1; x < GRID_W - 1; x++) if (x !== WORLD.entrance.gx) blocked[7][x] = true;
    for (let z = 1; z < 7; z++) {
      blocked[z][4] = true;
      blocked[z][15] = true;
    }
    [WORLD.stock, WORLD.pizza, WORLD.burger, WORLD.trash, WORLD.counter, WORLD.cash].forEach((p) => {
      blocked[p.gz][p.gx] = true;
    });
    tables.forEach((t) => { if (t.active) blocked[t.gz][t.gx] = true; });
  }

  function cellBlocked(gx, gz) {
    return gx < 0 || gz < 0 || gx >= GRID_W || gz >= GRID_H || blocked[gz][gx];
  }

  function canOccupy(x, z, radius = 0.3) {
    const pts = [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius], [radius, radius], [radius, -radius], [-radius, radius], [-radius, -radius]];
    return pts.every(([dx, dz]) => {
      const c = worldToCell(x + dx, z + dz);
      return !cellBlocked(c.gx, c.gz);
    });
  }

  function findPath(start, goal) {
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
        { gx: cur.gx, gz: cur.gz - 1 },
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

  function tryFindSafeSpotAround(x, z) {
    const offsets = [[1.25, 0], [-1.25, 0], [0, 1.25], [0, -1.25], [0.9, 0.9], [0.9, -0.9], [-0.9, 0.9], [-0.9, -0.9]];
    for (const [dx, dz] of offsets) {
      const nx = x + dx;
      const nz = z + dz;
      if (canOccupy(nx, nz)) return { x: nx, z: nz };
    }
    return canOccupy(WORLD.entrance.gx + 0.5, WORLD.entrance.gz + 0.5) ? { x: WORLD.entrance.gx + 0.5, z: WORLD.entrance.gz + 0.5 } : null;
  }

  function addWallSegment(x, z, h, color) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(1, h, 1),
      new THREE.MeshStandardMaterial({ color, roughness: 0.98 })
    );
    m.position.set(x, h / 2, z);
    return m;
  }

  function createParticle(text, x, z, color) {
    const p = makeLabelSprite(text, '#111827', color || '#fff', 1.8, 0.8);
    p.sprite.position.set(x, 1.6, z);
    scene.add(p.sprite);
    state.particles.push({ sprite: p.sprite, life: 1, speed: 0.4 });
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

  function updateTables() {
    tables.forEach((t) => {
      if (!t.active) return;
      t.label.sprite.material.opacity = dist(state.player.x, state.player.z, t.gx + 0.5, t.gz + 0.5) < 2.2 ? 1 : 0.72;
    });
  }

  function updateCamera(dt) {
    const t = 1 - Math.pow(0.001, dt);
    camera.position.x += (state.player.x + 11.5 - camera.position.x) * t;
    camera.position.y += (16.8 - camera.position.y) * t;
    camera.position.z += (state.player.z + 11.5 - camera.position.z) * t;
    camera.lookAt(state.player.x, 0.95, state.player.z);
  }

  function updateCarryText() {
    ui.carry.textContent = `${traySummary()}  ${trayCount()}/${state.carryCap}`;
  }

  function updateHUD() {
    ui.money.textContent = Math.floor(state.money);
    ui.stock.textContent = state.stock;
    ui.rep.textContent = state.rep;
    ui.waiting.textContent = state.customers.filter((c) => !c.dead && c.state !== 'leaving').length;
    ui.oven.textContent = `P${state.stationCounts.pizza} / B${state.stationCounts.burger}`;
    ui.upgradeCarryBtn.textContent = `Kapacita (${15 * state.carryCap})`;
    ui.upgradeOvenBtn.textContent = `Kuchyň (${20 * Math.max(state.stationLevels.pizza, state.stationLevels.burger)})`;
    updateCarryText();
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
    camera.position.set(14.5, 18.5, 15.5);
    camera.lookAt(10, 0.8, 10);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x314053, 1.35));
    const dir = new THREE.DirectionalLight(0xffffff, 1.8);
    dir.position.set(10, 18, 6);
    scene.add(dir);
    const fill = new THREE.DirectionalLight(0xffd8ad, 0.55);
    fill.position.set(-8, 6, -8);
    scene.add(fill);

    const floorTex = makeCanvasTexture((ctx, w, h) => {
      ctx.fillStyle = '#d6ba83';
      ctx.fillRect(0, 0, w, h);
      const tile = w / 8;
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          ctx.fillStyle = (x + y) % 2 === 0 ? '#e5cd9c' : '#d8b779';
          ctx.fillRect(x * tile, y * tile, tile, tile);
        }
      }
      ctx.strokeStyle = 'rgba(90,60,35,0.18)';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, w - 4, h - 4);
    });
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 1 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(10, 0, 10);
    floor.receiveShadow = true;
    scene.add(floor);
    scene.add(new THREE.GridHelper(20, 20, 0x8c6a43, 0xc7b088));

    for (let gx = 0; gx < GRID_W; gx++) {
      if (gx !== WORLD.entrance.gx) scene.add(addWallSegment(gx + 0.5, 0.5, 2.6, 0x8f5f43));
      scene.add(addWallSegment(gx + 0.5, 19.5, 2.6, 0x8f5f43));
    }
    for (let gz = 0; gz < GRID_H; gz++) {
      scene.add(addWallSegment(0.5, gz + 0.5, 2.6, 0x8f5f43));
      scene.add(addWallSegment(19.5, gz + 0.5, 2.6, 0x8f5f43));
    }
    for (let gx = 1; gx < GRID_W - 1; gx++) if (gx !== WORLD.entrance.gx) scene.add(addWallSegment(gx + 0.5, 7.5, 2.2, 0x89593f));
    for (let gz = 1; gz < 7; gz++) {
      scene.add(addWallSegment(4.5, gz + 0.5, 2.2, 0x89593f));
      scene.add(addWallSegment(15.5, gz + 0.5, 2.2, 0x89593f));
    }

    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(4.8, 0.45, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x22314a, emissive: 0x0c1320, roughness: 0.6 })
    );
    sign.position.set(10, 2.1, 8.2);
    scene.add(sign);
    const title = makeLabelSprite('RESTAURANT ENGINE 3D', '#111827', '#fff', 2.1, 0.8);
    title.sprite.position.set(10, 2.9, 8.3);
    scene.add(title.sprite);

    const stock = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.5, 0.8),
        new THREE.MeshStandardMaterial({ color: 0x5e452f, roughness: 1 })
      );
      box.position.set((i % 2) * 0.1, 0.25 + i * 0.18, (i % 2) * 0.04);
      stock.add(box);
    }
    stock.position.set(WORLD.stock.gx + 0.5, 0, WORLD.stock.gz + 0.5);
    scene.add(stock);

    const pizzaOven = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.9, 1.0),
      new THREE.MeshStandardMaterial({ color: 0xa25136, roughness: 0.95 })
    );
    pizzaOven.position.set(WORLD.pizza.gx + 0.5, 0.45, WORLD.pizza.gz + 0.5);
    scene.add(pizzaOven);
    const burgerGrill = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.9, 1.0),
      new THREE.MeshStandardMaterial({ color: 0x5670a0, roughness: 0.95 })
    );
    burgerGrill.position.set(WORLD.burger.gx + 0.5, 0.45, WORLD.burger.gz + 0.5);
    scene.add(burgerGrill);
    const trash = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.33, 0.9, 8),
      new THREE.MeshStandardMaterial({ color: 0x444b57, roughness: 0.9 })
    );
    trash.position.set(WORLD.trash.gx + 0.5, 0.45, WORLD.trash.gz + 0.5);
    scene.add(trash);
    const trashLabel = makeLabelSprite('KOŠ', '#2d313b', '#fff', 1.2, 0.55);
    trashLabel.sprite.position.set(WORLD.trash.gx + 0.5, 1.7, WORLD.trash.gz + 0.5);
    scene.add(trashLabel.sprite);

    const ovenTop = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 0.16, 0.92),
      new THREE.MeshStandardMaterial({ color: 0xf1d19b, roughness: 0.95 })
    );
    ovenTop.position.set(WORLD.pizza.gx + 0.5, 0.98, WORLD.pizza.gz + 0.5);
    scene.add(ovenTop);
    const grillTop = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 0.16, 0.92),
      new THREE.MeshStandardMaterial({ color: 0xbfd4ff, roughness: 0.95 })
    );
    grillTop.position.set(WORLD.burger.gx + 0.5, 0.98, WORLD.burger.gz + 0.5);
    scene.add(grillTop);

    stationStacks.pizza = makeStack(10, 'pizza');
    stationStacks.pizza.group.position.set(WORLD.pizza.gx + 0.5, 1.08, WORLD.pizza.gz + 0.5);
    scene.add(stationStacks.pizza.group);
    stationStacks.burger = makeStack(10, 'burger');
    stationStacks.burger.group.position.set(WORLD.burger.gx + 0.5, 1.08, WORLD.burger.gz + 0.5);
    scene.add(stationStacks.burger.group);

    const pizzaLabel = makeLabelSprite('PEC', '#3d2417', '#fff', 1.2, 0.55);
    pizzaLabel.sprite.position.set(WORLD.pizza.gx + 0.5, 1.7, WORLD.pizza.gz + 0.5);
    scene.add(pizzaLabel.sprite);
    const grillLabel = makeLabelSprite('GRIL', '#1f3553', '#fff', 1.2, 0.55);
    grillLabel.sprite.position.set(WORLD.burger.gx + 0.5, 1.7, WORLD.burger.gz + 0.5);
    scene.add(grillLabel.sprite);

    const counter = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.95, 0.8),
      new THREE.MeshStandardMaterial({ color: 0x4f7f68, roughness: 0.95 })
    );
    counter.position.set(WORLD.counter.gx + 0.5, 0.48, WORLD.counter.gz + 0.5);
    scene.add(counter);
    const counterTop = new THREE.Mesh(
      new THREE.BoxGeometry(1.75, 0.12, 0.86),
      new THREE.MeshStandardMaterial({ color: 0xdde8dd, roughness: 0.95 })
    );
    counterTop.position.set(WORLD.counter.gx + 0.5, 0.98, WORLD.counter.gz + 0.5);
    scene.add(counterTop);
    const cash = new THREE.Mesh(
      new THREE.BoxGeometry(1.35, 1.0, 0.85),
      new THREE.MeshStandardMaterial({ color: 0x647cff, roughness: 0.95 })
    );
    cash.position.set(WORLD.cash.gx + 0.5, 0.5, WORLD.cash.gz + 0.5);
    scene.add(cash);

    player = makeCharacter('player', 'player');
    player.position.set(state.player.x, 0, state.player.z);
    scene.add(player);
    chef = makeCharacter('chef', 'chef');
    chef.position.set(WORLD.pizza.gx + 1.8, 0, WORLD.pizza.gz + 1.0);
    chef.scale.setScalar(0.94);
    scene.add(chef);

    tables.length = 0;
    buildMarkers.length = 0;
    for (const spot of BUILD_SPOTS) {
      const t = buildTable(spot, tables.length < START_ACTIVE_TABLES);
      tables.push(t);
      if (t.active) {
        scene.add(t.group);
      } else {
        const m = createBuildMarker(t);
        buildMarkers.push(m);
        scene.add(m);
      }
      updateTableVisuals(t);
    }

    rebuildBlockedMap();
  }

  function nearestBuildMarker() {
    let best = null;
    let bestD = Infinity;
    for (const m of buildMarkers) {
      if (!m.visible) continue;
      const d = dist(state.player.x, state.player.z, m.position.x, m.position.z);
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    return best;
  }

  function nearestTable() {
    let best = null;
    let bestD = Infinity;
    for (const t of tables) {
      if (!t.active) continue;
      const c = cellCenter(t.gx, t.gz);
      const d = dist(state.player.x, state.player.z, c.x, c.z);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  function hasFreeTable() {
    return tables.some((t) => t.active && !t.occupied);
  }

  function updateStations(dt) {
    ['pizza', 'burger'].forEach((type) => {
      const level = state.stationLevels[type];
      const interval = type === 'pizza' ? Math.max(1.5, 4.2 - level * 0.25) : Math.max(2.0, 5.2 - level * 0.22);
      state.stationTimers[type] += dt;
      while (state.stationTimers[type] >= interval) {
        state.stationTimers[type] -= interval;
        if (state.stock > 0 && state.stationCounts[type] < 10) {
          state.stock -= 1;
          state.stationCounts[type] += 1;
          stationStacks[type].setCount(state.stationCounts[type]);
          createParticle(type === 'pizza' ? '+🍕' : '+🍔', WORLD[type].gx + 0.5, WORLD[type].gz + 0.5, type === 'pizza' ? '#ffd166' : '#ffb36a');
        } else {
          break;
        }
      }
    });
  }

  function pickupFromStation(type) {
    const p = WORLD[type];
    if (dist(state.player.x, state.player.z, p.gx + 0.5, p.gz + 0.5) > 1.25) return false;
    if (state.tray.length >= state.carryCap) return toast('Tác je plný', 'Nejdřív něco polož nebo vyhoď.'), true;
    if (state.stationCounts[type] <= 0) return toast('Nic hotové není'), true;
    state.stationCounts[type] -= 1;
    stationStacks[type].setCount(state.stationCounts[type]);
    state.tray.push(type);
    updateCarryHUD();
    createParticle('+' + FOOD_EMOJI[type], p.gx + 0.5, p.gz + 0.5, type === 'pizza' ? '#ffd166' : '#ffb36a');
    toast('Vzato', FOOD_EMOJI[type]);
    return true;
  }

  function emptyTray() {
    if (!state.tray.length) return toast('Tác je prázdný'), true;
    const count = state.tray.length;
    state.tray.length = 0;
    updateCarryHUD();
    createParticle(`-${count}`, WORLD.trash.gx + 0.5, WORLD.trash.gz + 0.5, '#9aa7bd');
    toast('Vyhozeno', `Koš vyhodil ${count} položek.`);
    return true;
  }

  function serveToCustomer(table, customer) {
    const idx = state.tray.findIndex((item) => customer.need[item] > 0);
    if (idx < 0) return toast('Na tácu není to, co host chce.'), true;
    if (table.items.length >= table.capacity) return toast('Stůl je plný', 'Max 10 položek.'), true;
    const item = state.tray.splice(idx, 1)[0];
    table.items.push(item);
    updateTableVisuals(table);
    updateCarryHUD();
    createParticle('-' + FOOD_EMOJI[item], table.gx + 0.5, table.gz + 0.5, '#ffcf6f');
    if (customer.state === 'waiting' && customer.canEat()) {
      customer.state = 'eating';
      customer.eatTimer = 3;
    }
    toast('Podáno', FOOD_EMOJI[item]);
    return true;
  }

  function collectFromWorld() {
    if (pickupFromStation('pizza')) return true;
    if (pickupFromStation('burger')) return true;
    if (dist(state.player.x, state.player.z, WORLD.trash.gx + 0.5, WORLD.trash.gz + 0.5) < 1.25) return emptyTray();
    if (dist(state.player.x, state.player.z, WORLD.stock.gx + 0.5, WORLD.stock.gz + 0.5) < 1.25) return buyStock();
    if (dist(state.player.x, state.player.z, WORLD.counter.gx + 0.5, WORLD.counter.gz + 0.5) < 1.25) return upgradeCarry();
    if (dist(state.player.x, state.player.z, WORLD.cash.gx + 0.5, WORLD.cash.gz + 0.5) < 1.25) return upgradeKitchen();
    return false;
  }

  function buildTableFromMarker(marker) {
    const table = marker.userData.table;
    if (table.active) return;
    if (state.money < table.cost) return toast('Málo peněz', `Potřebuješ ${table.cost}.`);
    const safe = tryFindSafeSpotAround(marker.position.x, marker.position.z);
    if (!safe) return toast('Není kam ustoupit', 'Odsuň se od místa stavby.');
    state.money -= table.cost;
    state.player.x = safe.x;
    state.player.z = safe.z;
    player.position.set(safe.x, 0, safe.z);
    table.active = true;
    scene.add(table.group);
    marker.visible = false;
    rebuildBlockedMap();
    toast('Stůl postaven', `Za ${table.cost}.`);
  }

  function spawnCustomer(manual = false) {
    const table = tables.find((t) => t.active && !t.occupied);
    if (!table) {
      if (manual) toast('Žádný volný stůl', 'Nejdřív postav nový stůl.');
      return false;
    }
    const idSeed = 'cust-' + Math.random().toString(36).slice(2);
    const customerMesh = makeCharacter('customer', idSeed);
    customerMesh.scale.setScalar(0.98);
    customerMesh.position.set(WORLD.entrance.gx + 0.5, 0, WORLD.entrance.gz + 0.5);
    scene.add(customerMesh);

    const order = [];
    const count = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) order.push(FOOD[Math.floor(Math.random() * FOOD.length)]);
    const need = { pizza: 0, burger: 0 };
    order.forEach((t) => need[t]++);

    const customer = {
      id: idSeed,
      table,
      mesh: customerMesh,
      x: WORLD.entrance.gx + 0.5,
      z: WORLD.entrance.gz + 0.5,
      state: 'walking',
      waitTimer: 18 + Math.random() * 10,
      eatTimer: 3,
      path: [],
      pathIndex: 0,
      dead: false,
      paid: false,
      order,
      need,
      remaining: { pizza: need.pizza, burger: need.burger },
      canEat() {
        return table.items.some((item) => this.remaining[item] > 0);
      },
    };
    table.occupied = true;
    table.customerId = idSeed;
    updateTableVisuals(table);
    rebuildBlockedMap();
    customer.path = findPath(worldToCell(customer.x, customer.z), table.seat);
    state.customers.push(customer);
    if (manual) toast('Host přišel', order.map((x) => FOOD_EMOJI[x]).join(' '));
    return true;
  }

  function leaveCustomer(customer, reason) {
    if (customer.dead) return;
    customer.state = 'leaving';
    customer.table.occupied = false;
    customer.table.customerId = null;
    updateTableVisuals(customer.table);
    rebuildBlockedMap();
    toast('Host odchází', reason);
    customer.path = findPath(worldToCell(customer.x, customer.z), WORLD.entrance);
    customer.pathIndex = 0;
    state.rep = Math.max(0, state.rep - 1);
  }

  function payAndLeave(customer) {
    if (customer.paid) return;
    customer.paid = true;
    const reward = 18 + customer.order.length * 14;
    state.money += reward;
    state.rep += 1;
    createParticle(`+${reward}`, customer.table.gx + 0.5, customer.table.gz + 0.5, '#8fe08f');
    customer.table.occupied = false;
    customer.table.customerId = null;
    updateTableVisuals(customer.table);
    rebuildBlockedMap();
    customer.state = 'leaving';
    customer.path = findPath(worldToCell(customer.x, customer.z), WORLD.entrance);
    customer.pathIndex = 0;
    toast('Host zaplatil', `+${reward}`);
  }

  function updateCustomer(customer, dt) {
    if (customer.dead) return;

    if (!customer.label) {
      customer.label = makeLabelSprite(orderText(customer), '#111827', '#fff', 1.6, 0.6);
      customer.mesh.add(customer.label.sprite);
      customer.label.sprite.position.set(0, 2.65, 0);
    }
    const txt = orderText(customer);
    if (customer._labelText !== txt) {
      customer._labelText = txt;
      customer.label.draw(txt);
    }
    customer.label.sprite.position.set(0, 2.65, 0);

    if (customer.state === 'walking' || customer.state === 'leaving') {
      if (!customer.path.length) customer.path = findPath(worldToCell(customer.x, customer.z), customer.state === 'walking' ? customer.table.seat : WORLD.entrance);
      const node = customer.path[customer.pathIndex];
      if (node) {
        const target = cellCenter(node.gx, node.gz);
        const dx = target.x - customer.x;
        const dz = target.z - customer.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.05) {
          if (customer.pathIndex < customer.path.length - 1) {
            customer.pathIndex += 1;
          } else if (customer.state === 'walking') {
            customer.state = 'waiting';
            customer.waitTimer = 18 + Math.random() * 10;
            toast('Host sedí', orderText(customer));
            if (customer.canEat()) {
              customer.state = 'eating';
              customer.eatTimer = 3;
            }
          } else {
            customer.dead = true;
            scene.remove(customer.mesh);
          }
        } else {
          const speed = customer.state === 'walking' ? 1.9 : 2.2;
          customer.x += (dx / d) * speed * dt;
          customer.z += (dz / d) * speed * dt;
          customer.mesh.position.set(customer.x, 0, customer.z);
          customer.mesh.rotation.y = Math.atan2(dx, dz);
        }
      }
    } else if (customer.state === 'waiting') {
      if (customer.canEat()) {
        customer.state = 'eating';
        customer.eatTimer = 3;
      } else {
        customer.waitTimer -= dt;
        if (customer.waitTimer <= 0) leaveCustomer(customer, 'Příliš dlouhé čekání.');
      }
    } else if (customer.state === 'eating') {
      customer.eatTimer -= dt;
      if (customer.eatTimer <= 0) {
        const next = customer.table.items.find((item) => customer.remaining[item] > 0);
        if (next) {
          customer.remaining[next] -= 1;
          const idx = customer.table.items.indexOf(next);
          if (idx >= 0) customer.table.items.splice(idx, 1);
          updateTableVisuals(customer.table);
          createParticle('-' + FOOD_EMOJI[next], customer.table.gx + 0.5, customer.table.gz + 0.5, '#ffcf6f');
        }
        if (customer.remaining.pizza + customer.remaining.burger <= 0) {
          payAndLeave(customer);
          return;
        }
        customer.eatTimer = 3;
        customer.state = customer.canEat() ? 'eating' : 'waiting';
      }
    }

    customer.mesh.position.set(customer.x, 0, customer.z);
  }

  function buyStock() {
    if (state.money >= 5) {
      state.money -= 5;
      state.stock += 5;
      createParticle('+5', WORLD.stock.gx + 0.5, WORLD.stock.gz + 0.5, '#8fe08f');
      toast('Suroviny koupeny');
      return true;
    }
    const now = performance.now();
    if (now >= state.emergencyAt) {
      state.stock += 3;
      state.emergencyAt = now + 30000;
      createParticle('+3', WORLD.stock.gx + 0.5, WORLD.stock.gz + 0.5, '#8fe08f');
      toast('Nouzové suroviny', 'Dostal jsi 3 zdarma.');
      return true;
    }
    toast('Málo peněz', 'Počkej na nouzové doplnění nebo reklamu.');
    return true;
  }

  function upgradeCarry() {
    const cost = 15 * state.carryCap;
    if (state.money < cost) return toast('Málo peněz', `Potřebuješ ${cost}.`), true;
    state.money -= cost;
    state.carryCap += 2;
    toast('Kapacita zvýšena', 'Uneseš více jídla.');
    return true;
  }

  function upgradeKitchen() {
    const cost = 20 * Math.max(state.stationLevels.pizza, state.stationLevels.burger);
    if (state.money < cost) return toast('Málo peněz', `Potřebuješ ${cost}.`), true;
    state.money -= cost;
    state.stationLevels.pizza += 1;
    state.stationLevels.burger += 1;
    toast('Kuchyň vylepšena', 'Pec i gril jsou rychlejší.');
    return true;
  }

  function save() {
    const data = {
      money: state.money,
      stock: state.stock,
      carryCap: state.carryCap,
      rep: state.rep,
      player: { x: state.player.x, z: state.player.z, angle: state.player.angle },
      tray: state.tray,
      stationCounts: state.stationCounts,
      stationTimers: state.stationTimers,
      stationLevels: state.stationLevels,
      tables: tables.map((t) => ({ active: t.active, items: t.items })),
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
      if (typeof data.carryCap === 'number') state.carryCap = data.carryCap;
      if (typeof data.rep === 'number') state.rep = data.rep;
      if (data.player) {
        if (typeof data.player.x === 'number') state.player.x = data.player.x;
        if (typeof data.player.z === 'number') state.player.z = data.player.z;
        if (typeof data.player.angle === 'number') state.player.angle = data.player.angle;
      }
      if (Array.isArray(data.tray)) state.tray = data.tray.filter((x) => FOOD.includes(x));
      if (data.stationCounts) {
        state.stationCounts.pizza = data.stationCounts.pizza || 0;
        state.stationCounts.burger = data.stationCounts.burger || 0;
      }
      if (data.stationTimers) {
        state.stationTimers.pizza = data.stationTimers.pizza || 0;
        state.stationTimers.burger = data.stationTimers.burger || 0;
      }
      if (data.stationLevels) {
        state.stationLevels.pizza = data.stationLevels.pizza || 1;
        state.stationLevels.burger = data.stationLevels.burger || 1;
      }
      if (Array.isArray(data.tables)) {
        data.tables.forEach((src, i) => {
          if (!tables[i]) return;
          tables[i].active = !!src.active;
          tables[i].items = Array.isArray(src.items) ? src.items.filter((x) => FOOD.includes(x)) : [];
          if (tables[i].active) scene.add(tables[i].group);
          else {
            const m = buildMarkers[i];
            if (m) m.visible = true;
          }
          updateTableVisuals(tables[i]);
        });
      }
      stationStacks.pizza.setCount(state.stationCounts.pizza);
      stationStacks.burger.setCount(state.stationCounts.burger);
      updateCarryHUD();
      rebuildBlockedMap();
    } catch (e) {
      console.warn(e);
    }
  }

  function reset() {
    localStorage.removeItem(SAVE_KEY);
    state.money = 25;
    state.stock = 10;
    state.carryCap = 6;
    state.rep = 0;
    state.player.x = 10.5;
    state.player.z = 17.5;
    state.player.angle = 0;
    state.stationCounts.pizza = 0;
    state.stationCounts.burger = 0;
    state.stationTimers.pizza = 0;
    state.stationTimers.burger = 0;
    state.stationLevels.pizza = 1;
    state.stationLevels.burger = 1;
    state.tray = [];
    state.customers.slice().forEach((c) => scene.remove(c.mesh));
    state.customers.length = 0;
    state.particles.slice().forEach((p) => scene.remove(p.sprite));
    state.particles.length = 0;
    tables.forEach((t, i) => {
      t.items = [];
      t.customerId = null;
      t.occupied = false;
      t.active = i < START_ACTIVE_TABLES;
      if (t.active && !scene.children.includes(t.group)) scene.add(t.group);
      if (buildMarkers[i]) buildMarkers[i].visible = !t.active;
      updateTableVisuals(t);
    });
    stationStacks.pizza.setCount(0);
    stationStacks.burger.setCount(0);
    rebuildBlockedMap();
    updateCarryHUD();
    toast('Reset hotov');
  }

  function interact() {
    const marker = nearestBuildMarker();
    if (marker && dist(state.player.x, state.player.z, marker.position.x, marker.position.z) < 1.7) {
      return buildTableFromMarker(marker);
    }
    const table = nearestTable();
    if (table) {
      const c = cellCenter(table.gx, table.gz);
      if (dist(state.player.x, state.player.z, c.x, c.z) < 1.6) {
        const customer = state.customers.find((x) => x.table === table && !x.dead);
        if (customer && serveToCustomer(table, customer)) return;
      }
    }
    if (collectFromWorld()) return;
    toast('Nic k akci', 'Přibliž se ke stolu, stavbě, peci, grilu, koši nebo skladu.');
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
    player.position.set(state.player.x, 0, state.player.z);
    player.rotation.y = state.player.angle;
  }

  function updateChef() {
    const t = performance.now();
    chef.rotation.y = Math.sin(t * 0.0012) * 0.08;
  }

  function spawnLoop(dt) {
    state.lastSpawn += dt;
    if (state.lastSpawn > 8.5) {
      if (hasFreeTable()) {
        if (spawnCustomer(false)) state.lastSpawn = 0;
      } else {
        state.lastSpawn = 7.5;
      }
    }
  }

  function updateLoop(now) {
    try {
      const dt = Math.min(0.033, ((now || 0) - (updateLoop.last || now)) / 1000 || 0.016);
      updateLoop.last = now || performance.now();
      updatePlayer(dt);
      updateChef();
      updateStations(dt);
      spawnLoop(dt);
      state.customers.forEach((c) => updateCustomer(c, dt));
      state.customers = state.customers.filter((c) => !c.dead);
      updateParticles(dt);
      updateTables();
      updateCamera(dt);
      updateHUD();
      renderer.render(scene, camera);
    } catch (err) {
      console.error(err);
      toast('Chyba běhu', 'Zkusil jsem pokračovat.');
    }
    requestAnimationFrame(updateLoop);
  }

  function setupJoystick() {
    ui.stick.style.position = 'fixed';
    ui.stick.style.left = '0px';
    ui.stick.style.top = '0px';
    ui.stick.style.transform = 'translate(-9999px,-9999px)';
    ui.stick.style.opacity = '0';
    ui.stick.style.pointerEvents = 'none';
    ui.stick.style.zIndex = '70';
    ui.nub.style.transform = 'translate(-50%, -50%)';
    ui.nub.style.pointerEvents = 'none';

    const setStick = (dx, dz) => {
      const max = state.touch.max;
      const len = Math.hypot(dx, dz);
      if (len > max) {
        dx = (dx / len) * max;
        dz = (dz / len) * max;
      }
      ui.nub.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dz}px)`;
      state.touch.dx = dx / max;
      state.touch.dz = dz / max;
    };
    const hide = () => {
      state.touch.active = false;
      state.touch.id = null;
      state.touch.dx = 0;
      state.touch.dz = 0;
      ui.stick.style.opacity = '0';
      ui.stick.style.transform = 'translate(-9999px,-9999px)';
      ui.nub.style.transform = 'translate(-50%, -50%)';
    };

    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      if (e.target && typeof e.target.closest === 'function' && e.target.closest('.hud, .top-actions, .footer, button')) return;
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

    window.addEventListener('pointerup', (e) => {
      if (!state.touch.active || e.pointerId !== state.touch.id) return;
      hide();
      e.preventDefault();
    }, { passive: false });
    window.addEventListener('pointercancel', hide, { passive: false });
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
    createScene();
    setupJoystick();
    ui.spawnBtn.addEventListener('click', () => spawnCustomer(true));
    ui.buyStockBtn.addEventListener('click', buyStock);
    ui.upgradeCarryBtn.addEventListener('click', upgradeCarry);
    ui.upgradeOvenBtn.addEventListener('click', upgradeKitchen);
    ui.saveBtn.addEventListener('click', save);
    ui.resetBtn.addEventListener('click', reset);
    ui.actionBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); interact(); });
    ui.actionBtn.addEventListener('touchstart', (e) => { e.preventDefault(); interact(); }, { passive: false });
    ui.actionBtn.addEventListener('click', (e) => { e.preventDefault(); interact(); });
    ui.actionBtn.style.touchAction = 'manipulation';

    const rewardBtn = document.createElement('button');
    rewardBtn.className = 'secondary';
    rewardBtn.style.marginLeft = '8px';
    rewardBtn.textContent = 'Reklama +5';
    rewardBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const now = performance.now();
      if (now < state.adCooldownAt) return toast('Reklama ještě není připravená', `${Math.ceil((state.adCooldownAt - now) / 1000)} s`);
      state.money += 5;
      state.adCooldownAt = now + 30000;
      toast('Odměna za reklamu', '+5 peněz');
    });
    document.querySelector('.top-actions')?.appendChild(rewardBtn);

    load();
    state.player.x = clamp(state.player.x, 1.2, GRID_W - 1.2);
    state.player.z = clamp(state.player.z, 1.2, GRID_H - 1.2);
    player.position.set(state.player.x, 0, state.player.z);
    updateCarryHUD();
    updateHUD();
    toast('Stable v9', 'Tác, koš a odebírání po jednom jsou aktivní.');
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', () => {
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    });
    requestAnimationFrame(updateLoop);
  }

  init();
})();
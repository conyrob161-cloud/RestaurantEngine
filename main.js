(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

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

  const TILE_W = 64;
  const TILE_H = 32;
  const GRID_W = 20;
  const GRID_H = 20;
  const SAVE_KEY = 'restaurant-engine-save-v1';

  const map = Array.from({ length: GRID_H }, () => Array(GRID_W).fill(0));
  const tables = [
    { gx: 6, gz: 9, occupied: false, customerId: null, waitingMoney: 0, serveCount: 0 },
    { gx: 13, gz: 9, occupied: false, customerId: null, waitingMoney: 0, serveCount: 0 },
    { gx: 6, gz: 14, occupied: false, customerId: null, waitingMoney: 0, serveCount: 0 },
    { gx: 13, gz: 14, occupied: false, customerId: null, waitingMoney: 0, serveCount: 0 }
  ];

  const world = {
    stock: { gx: 3, gz: 3 },
    oven: { gx: 6, gz: 4, stack: 0, timer: 0, interval: 4.2, maxStack: 10 },
    counter: { gx: 9, gz: 4 },
    cash: { gx: 16, gz: 3 },
    entrance: { gx: 10, gz: 18 },
    exit: { gx: 10, gz: 19 },
  };

  const state = {
    money: 25,
    stock: 8,
    carry: 0,
    carryCap: 5,
    rep: 0,
    ovenLevel: 1,
    player: { x: 10, z: 18, vx: 0, vz: 0, walk: 0 },
    customers: [],
    keys: {},
    touch: { active: false, id: null, dx: 0, dz: 0, cx: 0, cy: 0 },
    selectedTable: 0,
    lastSpawn: 0,
    particles: []
  };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }
  function tileToScreen(x, z) {
    const ox = canvas.width / 2 - (state.player.x - state.player.z) * (TILE_W / 2);
    const oy = canvas.height / 2 - (state.player.x + state.player.z) * (TILE_H / 2) + 20;
    return { x: (x - z) * (TILE_W / 2) + ox, y: (x + z) * (TILE_H / 2) + oy };
  }
  function worldToCell(x, z) {
    return { gx: Math.floor(x), gz: Math.floor(z) };
  }
  function cellBlocked(gx, gz) {
    if (gx < 0 || gz < 0 || gx >= GRID_W || gz >= GRID_H) return true;
    return map[gz][gx] === 1;
  }
  function mark(gx, gz) {
    if (gx >= 0 && gz >= 0 && gx < GRID_W && gz < GRID_H) map[gz][gx] = 1;
  }

  function buildMap() {
    for (let gx = 0; gx < GRID_W; gx++) {
      mark(gx, 0); mark(gx, GRID_H - 1);
    }
    for (let gz = 0; gz < GRID_H; gz++) {
      mark(0, gz); mark(GRID_W - 1, gz);
    }
    for (let gx = 1; gx < GRID_W - 1; gx++) if (gx !== world.entrance.gx) mark(gx, 7);
    for (let gz = 1; gz < 7; gz++) { mark(4, gz); mark(15, gz); }
    mark(world.stock.gx, world.stock.gz);
    mark(world.oven.gx, world.oven.gz);
    mark(world.counter.gx, world.counter.gz);
    mark(world.cash.gx, world.cash.gz);
    for (const t of tables) mark(t.gx, t.gz);
  }

  buildMap();

  function resize() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.floor(innerWidth * dpr);
    canvas.height = Math.floor(innerHeight * dpr);
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  addEventListener('resize', resize);
  resize();

  function toast(title, sub = '') {
    ui.toast.innerHTML = `<strong>${title}</strong>${sub ? `<div class="small">${sub}</div>` : ''}`;
    ui.toast.classList.add('show');
    clearTimeout(ui.toast._t);
    ui.toast._t = setTimeout(() => ui.toast.classList.remove('show'), 1600);
  }

  function addParticle(x, z, text, color) {
    state.particles.push({ x, z, text, color, life: 1 });
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
      tables: tables.map(t => ({ occupied: t.occupied, customerId: t.customerId, waitingMoney: t.waitingMoney, serveCount: t.serveCount }))
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
          tables[i].customerId = src.customerId || null;
          tables[i].waitingMoney = src.waitingMoney || 0;
          tables[i].serveCount = src.serveCount || 0;
        });
      }
    } catch (e) {
      console.warn(e);
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
    state.player.x = 10;
    state.player.z = 18;
    world.oven.stack = 0;
    world.oven.timer = 0;
    state.customers = [];
    state.particles = [];
    tables.forEach(t => { t.occupied = false; t.customerId = null; t.waitingMoney = 0; t.serveCount = 0; });
    toast('Reset hotov');
  }

  function bfs(start, goal) {
    const queue = [start];
    const seen = new Set([`${start.gx},${start.gz}`]);
    const prev = new Map();
    while (queue.length) {
      const cur = queue.shift();
      if (cur.gx === goal.gx && cur.gz === goal.gz) {
        const path = [cur];
        let k = `${cur.gx},${cur.gz}`;
        while (prev.has(k)) {
          const p = prev.get(k);
          path.push(p);
          k = `${p.gx},${p.gz}`;
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

  function recalcPath(c) {
    const start = worldToCell(c.x, c.z);
    const goal = c.state === 'leaving'
      ? { gx: world.exit.gx, gz: world.exit.gz }
      : { gx: tables[c.tableIndex].gx, gz: tables[c.tableIndex].gz };
    c.path = bfs(start, goal);
    c.pathIndex = 0;
  }

  function spawnCustomer(manual = false) {
    const free = tables.findIndex(t => !t.occupied);
    if (free === -1) {
      if (manual) toast('Žádný volný stůl', 'Nejdřív obsluž hosty.');
      return;
    }
    const c = {
      id: String(Math.random()).slice(2),
      tableIndex: free,
      state: 'walking',
      x: world.entrance.gx,
      z: world.entrance.gz,
      waitTimer: 50 + Math.random() * 10,
      eatTimer: 0,
      path: [],
      pathIndex: 0,
      walk: 0,
    };
    tables[free].occupied = true;
    tables[free].customerId = c.id;
    tables[free].waitingMoney = 0;
    tables[free].serveCount = 0;
    recalcPath(c);
    state.customers.push(c);
    toast('Zákazník přišel', manual ? 'Přivolán ke stolu.' : 'Míří ke stolu.');
  }

  function updateOven(dt) {
    world.oven.interval = Math.max(1.8, 4.4 - state.ovenLevel * 0.35);
    world.oven.timer += dt;
    while (world.oven.timer >= world.oven.interval) {
      world.oven.timer -= world.oven.interval;
      if (state.stock > 0 && world.oven.stack < world.oven.maxStack) {
        state.stock--;
        world.oven.stack++;
        addParticle(world.oven.gx, world.oven.gz, '+pizza', '#c6592b');
      } else {
        break;
      }
    }
  }

  function collectFromOven() {
    const d = dist(state.player.x, state.player.z, world.oven.gx, world.oven.gz);
    if (d > 1.3) return false;
    const take = Math.min(world.oven.stack, state.carryCap - state.carry);
    if (take <= 0) {
      toast(world.oven.stack === 0 ? 'V peci nic není' : 'Máš plnou kapacitu');
      return true;
    }
    world.oven.stack -= take;
    state.carry += take;
    addParticle(world.oven.gx, world.oven.gz, `+${take}`, '#ffd166');
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
    addParticle(world.stock.gx, world.stock.gz, '+5', '#8fe08f');
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

  function tryServeTable() {
    const idx = state.selectedTable;
    const t = tables[idx];
    if (dist(state.player.x, state.player.z, t.gx, t.gz) > 1.4) return false;

    if (t.waitingMoney > 0) {
      state.money += t.waitingMoney;
      addParticle(t.gx, t.gz, `+${t.waitingMoney}`, '#8fe08f');
      t.waitingMoney = 0;
      toast('Vybrané peníze');
      return true;
    }

    const c = state.customers.find(x => x.tableIndex === idx && x.state === 'waitingPizza');
    if (c && state.carry > 0) {
      c.state = 'eating';
      c.eatTimer = 6 + Math.random() * 3;
      state.carry--;
      addParticle(t.gx, t.gz, '-pizza', '#c6592b');
      toast('Pizza podána', 'Host jí.');
      return true;
    }

    return false;
  }

  function interact() {
    if (tryServeTable()) return;
    if (collectFromOven()) return;
    if (dist(state.player.x, state.player.z, world.stock.gx, world.stock.gz) < 1.3) return buyStock();
    if (dist(state.player.x, state.player.z, world.counter.gx, world.counter.gz) < 1.3) return upgradeCarry();
    if (dist(state.player.x, state.player.z, world.cash.gx, world.cash.gz) < 1.3) return upgradeOven();
    toast('Nic k akci', 'Přibliž se ke skladu, peci nebo stolu.');
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
      state.player.walk += dt * 10;
      const speed = 3.6;
      const nx = state.player.x + dx * speed * dt;
      const nz = state.player.z + dz * speed * dt;
      const cx = worldToCell(nx, state.player.z);
      const cz = worldToCell(state.player.x, nz);
      if (!cellBlocked(cx.gx, cx.gz)) state.player.x = clamp(nx, 1.1, GRID_W - 2.1);
      if (!cellBlocked(cz.gx, cz.gz)) state.player.z = clamp(nz, 1.1, GRID_H - 2.1);
    } else {
      state.player.walk *= 0.95;
    }
  }

  function updateCustomer(c, dt) {
    c.walk += dt * (c.state === 'eating' ? 0.3 : 8);
    if (c.state === 'walking' || c.state === 'leaving') {
      if (!c.path.length || c.pathIndex >= c.path.length) recalcPath(c);
      if (c.path.length) {
        const node = c.path[Math.min(c.pathIndex, c.path.length - 1)];
        const dx = node.gx - c.x;
        const dz = node.gz - c.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.06) {
          if (c.pathIndex < c.path.length - 1) c.pathIndex++;
          else if (c.state === 'walking') {
            c.state = 'waitingPizza';
            c.waitTimer = 55 + Math.random() * 10;
            toast('Zákazník sedí', 'Čeká na pizzu.');
          } else if (c.state === 'leaving') {
            const t = tables[c.tableIndex];
            t.occupied = false;
            t.customerId = null;
            t.waitingMoney = 0;
            t.serveCount = 0;
            c.state = 'gone';
          }
        } else {
          const speed = c.state === 'walking' ? 1.9 : 2.3;
          c.x += (dx / d) * speed * dt;
          c.z += (dz / d) * speed * dt;
        }
      }
    } else if (c.state === 'waitingPizza') {
      c.waitTimer -= dt;
      if (c.waitTimer <= 0) {
        c.state = 'leaving';
        state.rep = Math.max(0, state.rep - 1);
        recalcPath(c);
        toast('Zákazník odchází', 'Ztráta reputace.');
      }
    } else if (c.state === 'eating') {
      c.eatTimer -= dt;
      if (c.eatTimer <= 0) {
        const reward = 12 + state.ovenLevel * 2;
        tables[c.tableIndex].waitingMoney += reward;
        state.rep += 1;
        c.state = 'leaving';
        recalcPath(c);
        toast('Zákazník zaplatil', `+${reward}`);
      }
    }
  }

  function updateParticles(dt) {
    for (const p of state.particles) p.life -= dt * 0.6;
    state.particles = state.particles.filter(p => p.life > 0);
  }

  function updateUI() {
    ui.money.textContent = Math.floor(state.money);
    ui.stock.textContent = state.stock;
    ui.carry.textContent = `${state.carry}/${state.carryCap}`;
    ui.oven.textContent = world.oven.stack;
    ui.waiting.textContent = state.customers.filter(c => c.state === 'waitingPizza').length;
    ui.rep.textContent = state.rep;
    ui.upgradeCarryBtn.textContent = `Kapacita (${15 * state.carryCap})`;
    ui.upgradeOvenBtn.textContent = `Pec (${20 * state.ovenLevel})`;
    state.selectedTable = closestTable();
  }

  function closestTable() {
    let best = 0;
    let bestD = Infinity;
    tables.forEach((t, i) => {
      const d = dist(state.player.x, state.player.z, t.gx, t.gz);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  function drawDiamond(x, y, w, h, fill, stroke = null) {
    ctx.beginPath();
    ctx.moveTo(x, y - h / 2);
    ctx.lineTo(x + w / 2, y);
    ctx.lineTo(x, y + h / 2);
    ctx.lineTo(x - w / 2, y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  function drawWall(gx, gz, height, base) {
    const p = tileToScreen(gx + 0.5, gz + 0.5);
    const topY = p.y - height * 24;
    const left = { x: p.x - TILE_W / 2, y: p.y };
    const right = { x: p.x + TILE_W / 2, y: p.y };
    const top = { x: p.x, y: topY };

    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(top.x, top.y);
    ctx.lineTo(right.x, right.y);
    ctx.lineTo(p.x, p.y + TILE_H / 2);
    ctx.closePath();
    ctx.fillStyle = base;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(top.x, top.y);
    ctx.lineTo(top.x, top.y + TILE_H / 2);
    ctx.lineTo(left.x, left.y + TILE_H / 2);
    ctx.closePath();
    ctx.fillStyle = '#5b3b2b';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(right.x, right.y);
    ctx.lineTo(right.x, right.y + TILE_H / 2);
    ctx.lineTo(top.x, top.y + TILE_H / 2);
    ctx.closePath();
    ctx.fillStyle = '#7d533d';
    ctx.fill();
  }

  function drawFloorTile(gx, gz) {
    const p = tileToScreen(gx + 0.5, gz + 0.5);
    const parity = (gx + gz) % 2;
    drawDiamond(p.x, p.y, TILE_W, TILE_H, parity ? '#ecd3ab' : '#e3c58f', 'rgba(0,0,0,.06)');
  }

  function drawTable(t, selected) {
    const p = tileToScreen(t.gx + 0.5, t.gz + 0.5);
    ctx.save();
    ctx.translate(p.x, p.y);
    drawDiamond(0, 2, TILE_W * 1.05, TILE_H * 0.65, selected ? '#f0d8b0' : '#dfbf8b', 'rgba(0,0,0,.1)');
    ctx.fillStyle = '#6a4f3e';
    ctx.fillRect(-6, -12, 12, 24);
    ctx.fillRect(-24, -2, 48, 4);
    if (t.waitingMoney > 0) {
      ctx.fillStyle = '#2f9e55';
      ctx.fillRect(-10, -42, 20, 16);
      ctx.fillStyle = '#fff';
      ctx.font = '900 10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`€${t.waitingMoney}`, 0, -30);
    }
    ctx.restore();
  }

  function drawEntity(x, z, body, top, label) {
    const p = tileToScreen(x + 0.5, z + 0.5);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.beginPath();
    ctx.ellipse(0, 18, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = top;
    ctx.beginPath();
    ctx.arc(0, -18, 10, 0, Math.PI * 2);
    ctx.fill();

    if (label) {
      ctx.fillStyle = '#1b1b1b';
      ctx.font = '900 10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(label, 0, -30);
    }
    ctx.restore();
  }

  function drawStack(x, z, count) {
    const p = tileToScreen(x + 0.5, z + 0.5);
    ctx.save();
    ctx.translate(p.x, p.y - 24);
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = i % 2 ? '#c6592b' : '#ffd166';
      ctx.beginPath();
      ctx.arc(0, -i * 7, 10 - i * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function render() {
    const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
    sky.addColorStop(0, '#233552');
    sky.addColorStop(1, '#10131a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const visible = [];
    for (let gz = 0; gz < GRID_H; gz++) {
      for (let gx = 0; gx < GRID_W; gx++) {
        visible.push({ gx, gz, z: gx + gz });
      }
    }
    visible.sort((a, b) => a.z - b.z);

    for (const c of visible) drawFloorTile(c.gx, c.gz);

    // Outer walls and inner walls for the room.
    for (let gx = 0; gx < GRID_W; gx++) {
      if (gx !== world.entrance.gx) drawWall(gx, 0, 2.6, '#916047');
      drawWall(gx, GRID_H - 1, 2.6, '#916047');
    }
    for (let gz = 0; gz < GRID_H; gz++) {
      drawWall(0, gz, 2.6, '#916047');
      drawWall(GRID_W - 1, gz, 2.6, '#916047');
    }
    for (let gx = 1; gx < GRID_W - 1; gx++) {
      if (gx === 10) continue;
      drawWall(gx, 7, 2.2, '#8e5d44');
    }
    for (let gz = 1; gz < 7; gz++) {
      drawWall(4, gz, 2.2, '#8e5d44');
      drawWall(15, gz, 2.2, '#8e5d44');
    }

    // Props.
    drawEntity(world.stock.gx, world.stock.gz, '#6fd0ff', '#dbf5ff', 'SKLAD');
    drawEntity(world.oven.gx, world.oven.gz, '#ff8c66', '#ffd5c4', 'PEC');
    drawEntity(world.counter.gx, world.counter.gz, '#8fe08f', '#e7ffd5', 'KAPACITA');
    drawEntity(world.cash.gx, world.cash.gz, '#9fb7ff', '#e9efff', 'UPGRADE');
    drawStack(world.oven.gx, world.oven.gz, world.oven.stack);

    for (let i = 0; i < tables.length; i++) drawTable(tables[i], i === state.selectedTable);

    // Customers.
    for (const c of state.customers) {
      if (c.state === 'gone') continue;
      const body = c.state === 'eating' ? '#ffcf6f' : c.state === 'leaving' ? '#ff7a7a' : '#5577cc';
      const top = c.state === 'eating' ? '#fff2cc' : '#d8e4ff';
      drawEntity(c.x, c.z, body, top, c.state === 'waitingPizza' ? Math.ceil(c.waitTimer) + 's' : '');
      if (c.state === 'eating') drawStack(c.x, c.z, 1);
    }

    // Player.
    drawEntity(state.player.x, state.player.z, '#27406d', '#f2d1b5', '');
    drawStack(state.player.x, state.player.z, state.carry);

    // Particles.
    for (const p of state.particles) {
      const s = tileToScreen(p.x + 0.5, p.z + 0.5);
      ctx.save();
      ctx.globalAlpha = clamp(p.life, 0, 1);
      ctx.fillStyle = p.color;
      ctx.font = '900 14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(p.text, s.x, s.y - 20 - (1 - p.life) * 20);
      ctx.restore();
    }

    // Soft vignette.
    const v = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) * 0.15, canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,.24)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function loop(now) {
    const dt = Math.min(0.033, (now - (loop.last || now)) / 1000);
    loop.last = now;

    updatePlayer(dt);
    updateOven(dt);

    state.lastSpawn += dt;
    if (state.lastSpawn > 9 && state.customers.length < 4) {
      spawnCustomer(false);
      state.lastSpawn = 0;
    }

    for (const c of state.customers) updateCustomer(c, dt);
    state.customers = state.customers.filter(c => c.state !== 'gone');
    updateParticles(dt);
    updateUI();
    render();

    requestAnimationFrame(loop);
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
    const max = 54;
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
    const r = ui.stick.getBoundingClientRect();
    state.touch.cx = r.left + r.width / 2;
    state.touch.cy = r.top + r.height / 2;
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

  load();
  state.player.x = clamp(state.player.x, 1.1, GRID_W - 2.1);
  state.player.z = clamp(state.player.z, 1.1, GRID_H - 2.1);
  toast('Engine ready', 'První hratelný základ je na světě.');
  requestAnimationFrame(loop);
})();
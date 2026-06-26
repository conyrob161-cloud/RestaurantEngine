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

  const SAVE_KEY = 'restaurant-zombie-v5';
  const GRID_W = 20;
  const GRID_H = 20;
  const TABLE_SLOTS = [
    { gx: 6, gz: 9 }, { gx: 13, gz: 9 }, { gx: 6, gz: 14 }, { gx: 13, gz: 14 },
    { gx: 3, gz: 12 }, { gx: 16, gz: 12 }, { gx: 3, gz: 15 }, { gx: 16, gz: 15 },
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
    for (const t of tables) if (t.active) block(t.gx, t.gz);
  }

  function canOccupy(x, z, radius = 0.22) {
    const points = [
      [0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius],
      [radius, radius], [radius, -radius], [-radius, radius], [-radius, -radius],
    ];
    return points.every(([dx, dz]) => {
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

  function makeLabelSprite(text, bg = '#111827', fg = '#fff', scaleX = 2.6, scaleY = 1.15) {
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

  function makeStack(max = 12, spin = 0) {
    const group = new THREE.Group();
    const items = [];
    for (let i = 0; i < max; i++) {
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.24, 0.06, 6),
        new THREE.MeshStandardMaterial({ color: 0xc47a3a, roughness: 0.96 })
      );
      const cheese = new THREE.Mesh(
        new THREE.CylinderGeometry(0.19, 0.21, 0.03, 6),
        new THREE.MeshStandardMaterial({ color: 0xf0ca78, roughness: 0.92 })
      );
      cheese.position.y = 0.04;
      base.add(cheese);
      base.visible = false;
      base.position.y = i * 0.055;
      base.rotation.y = i * 0.43 + spin;
      items.push(base);
      group.add(base);
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

  function toast(title, sub = '') {
    ui.toast.innerHTML = `<strong>${title}</strong>${sub ? `<div class="small">${sub}</div>` : ''}`;
    ui.toast.classList.add('show');
    clearTimeout(ui.toast._timer);
    ui.toast._timer = setTimeout(() => ui.toast.classList.remove('show'), 1500);
  }

  function createShadow() {
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.38, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    return shadow;
  }

  function buildCharacter(type, palette, seed) {
    const root = new THREE.Group();
    root.userData.characterType = type;
    root.userData.seed = seed;

    const shirt = new THREE.MeshStandardMaterial({ color: palette.shirt, roughness: 0.94 });
    const pants = new THREE.MeshStandardMaterial({ color: palette.pants, roughness: 0.98 });
    const skin = new THREE.MeshStandardMaterial({ color: palette.skin, roughness: 0.95 });
    const accent = new THREE.MeshStandardMaterial({ color: palette.accent, roughness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1d2230, roughness: 1.0 });

    const shadow = createShadow();
    root.add(shadow);

    const body = new THREE.Group();
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), shirt.clone());
    chest.position.y = 0.44;
    const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.16, 0.38), shirt.clone());
    shoulders.position.y = 0.72;
    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.22, 0.28), pants.clone());
    hips.position.y = 0.12;
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.05, 0.18), dark.clone());
    belt.position.y = 0.22;
    body.add(chest, shoulders, hips, belt);

    const head = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 0), skin.clone());
    skull.rotation.y = 0.25;
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.12), skin.clone());
    face.position.set(0, -0.03, 0.24);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.14), skin.clone());
    jaw.position.set(0, -0.17, 0.1);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.08), skin.clone());
    nose.position.set(0, 0.0, 0.3);
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), dark.clone());
    const eyeR = eyeL.clone();
    eyeL.position.set(-0.09, 0.04, 0.27);
    eyeR.position.set(0.09, 0.04, 0.27);
    head.add(skull, face, jaw, nose, eyeL, eyeR);

    const armL = new THREE.Group();
    const armR = new THREE.Group();
    const upperArmL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.34, 0.12), shirt.clone());
    const upperArmR = upperArmL.clone();
    const lowerArmL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.3, 0.11), skin.clone());
    const lowerArmR = lowerArmL.clone();
    const handL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.14), type === 'customer' ? accent.clone() : dark.clone());
    const handR = handL.clone();
    upperArmL.position.y = -0.18; lowerArmL.position.y = -0.50; handL.position.y = -0.78;
    upperArmR.position.y = -0.18; lowerArmR.position.y = -0.50; handR.position.y = -0.78;
    armL.add(upperArmL, lowerArmL, handL);
    armR.add(upperArmR, lowerArmR, handR);
    armL.position.set(-0.42, 0.72, 0);
    armR.position.set(0.42, 0.72, 0);

    const legL = new THREE.Group();
    const legR = new THREE.Group();
    const thighL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.40, 0.16), pants.clone());
    const thighR = thighL.clone();
    const calfL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.34, 0.13), pants.clone());
    const calfR = calfL.clone();
    const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.28), dark.clone());
    const bootR = bootL.clone();
    thighL.position.y = -0.22; calfL.position.y = -0.57; bootL.position.y = -0.82;
    thighR.position.y = -0.22; calfR.position.y = -0.57; bootR.position.y = -0.82;
    legL.add(thighL, calfL, bootL);
    legR.add(thighR, calfR, bootR);
    legL.position.set(-0.17, 0.23, 0.01);
    legR.position.set(0.17, 0.23, 0.01);

    const hat = new THREE.Group();
    if (type === 'chef') {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78 }));
      const puff1 = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78 }));
      const puff2 = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78 }));
      const puff3 = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78 }));
      puff1.position.set(-0.08, 0.2, 0); puff2.position.set(0, 0.34, 0.02); puff3.position.set(0.09, 0.2, 0);
      band.position.y = -0.02;
      hat.add(band, puff1, puff2, puff3);
    } else if (type === 'player') {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.26), new THREE.MeshStandardMaterial({ color: 0x24324c, roughness: 0.86 }));
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.16), accent.clone());
      brim.position.set(0, -0.02, 0.14);
      cap.position.y = 0.06;
      hat.add(cap, brim);
      const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.34, 0.14), new THREE.MeshStandardMaterial({ color: 0x2b4672, roughness: 0.92 }));
      backpack.position.set(0, 0.38, -0.26);
      body.add(backpack);
    } else {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.14, 6), accent.clone());
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), accent.clone());
      top.position.y = 0.13;
      hat.add(cap, top);
    }
    hat.position.y = 1.52;

    if (type === 'chef') {
      const apron = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.48, 0.07), new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.95 }));
      apron.position.set(0, 0.18, 0.2);
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.09, 0.02), new THREE.MeshStandardMaterial({ color: 0xd9d1c2, roughness: 0.95 }));
      pocket.position.set(0, 0.1, 0.24);
      body.add(apron, pocket);
    }

    if (type === 'customer') {
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.1), new THREE.MeshStandardMaterial({ color: palette.accent, roughness: 0.95 }));
      bag.position.set(-0.02, 0.36, -0.24);
      body.add(bag);
    }

    root.add(body, head, armL, armR, legL, legR, hat);

    root.userData.rig = {
      type,
      body,
      head,
      armL,
      armR,
      legL,
      legR,
      hat,
      eyeL,
      eyeR,
      baseHeadY: head.position.y,
      baseBodyY: body.position.y,
      baseHatY: hat.position.y,
      blinkSeed: Math.random() * Math.PI * 2,
    };

    root.position.set(0, 0, 0);
    return root;
  }

  function paletteFor(type, seedText = '') {
    if (type === 'player') return { shirt: 0x4d78b5, pants: 0x24324c, skin: 0xf0ceb1, accent: 0x8ecae6 };
    if (type === 'chef') return { shirt: 0xf8f6f0, pants: 0x70533d, skin: 0xf0ceb1, accent: 0xc6b08f };
    const sets = [
      { shirt: 0x5f7dd6, pants: 0x2f3644, skin: 0xf1ccb0, accent: 0xffc857 },
      { shirt: 0xd96c6c, pants: 0x3d2f3d, skin: 0xefc8a4, accent: 0x8fe08f },
      { shirt: 0x4c9b72, pants: 0x2c3943, skin: 0xe9c5aa, accent: 0xf2d56b },
      { shirt: 0x9e78d2, pants: 0x40324f, skin: 0xeec7aa, accent: 0x7ee0ff },
      { shirt: 0x729f5d, pants: 0x3d4331, skin: 0xe5c0a3, accent: 0xc8d18a },
    ];
    let h = 0;
    for (const ch of seedText) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return sets[h % sets.length];
  }

  function hidePlaceholderMeshes(root) {
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      if (obj.geometry?.type === 'CircleGeometry') return;
      obj.visible = false;
    });
  }

  function upgradeExistingCharacter(root) {
    if (root.userData.upgradedCharacter) return;
    const body = root.children.flatMap ? null : null;
    const bodyMesh = findFirstMesh(root, (m) => m.geometry?.type === 'CylinderGeometry' && m.geometry?.parameters && Math.abs(m.geometry.parameters.height - 0.92) < 0.22);
    const headMesh = findFirstMesh(root, (m) => m.geometry?.type === 'SphereGeometry' && m.geometry?.parameters && Math.abs(m.geometry.parameters.radius - 0.28) < 0.12);
    if (!bodyMesh || !headMesh) return;

    const hex = bodyMesh.material?.color?.getHex?.() ?? 0;
    const type = hex === 0x355d9d ? 'player' : hex === 0x8f5f43 ? 'chef' : 'customer';
    const palette = paletteFor(type, root.uuid + root.position.x.toFixed(2) + root.position.z.toFixed(2));
    hidePlaceholderMeshes(root);
    const rig = buildCharacter(type, palette, root.uuid);
    root.add(rig);
    root.userData.upgradedCharacter = true;
    root.userData.rig = rig.userData.rig;
    root.userData.characterType = type;
  }

  function findFirstMesh(root, predicate) {
    let found = null;
    root.traverse((obj) => {
      if (found || !obj.isMesh || !obj.geometry) return;
      if (predicate(obj)) found = obj;
    });
    return found;
  }

  function characterFactory(type, seedText) {
    const palette = paletteFor(type, seedText);
    return buildCharacter(type, palette, seedText);
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

  const hemi = new THREE.HemisphereLight(0xffffff, 0x314053, 1.35);
  scene.add(hemi);
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
        ctx.fillStyle = 'rgba(0,0,0,0.03)';
        ctx.fillRect(x * tile, y * tile, tile, tile);
      }
    }
    ctx.strokeStyle = 'rgba(90,60,35,0.18)';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);
  });
  floorTex.repeat.set(2, 2);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(10, 0, 10);
  scene.add(floor);

  const grid = new THREE.GridHelper(20, 20, 0x8c6a43, 0xc7b088);
  grid.position.y = 0.03;
  scene.add(grid);

  // walls and kitchen partitions
  for (let gx = 0; gx < GRID_W; gx++) {
    if (gx !== WORLD.entrance.gx) scene.add(makeWall(gx + 0.5, 0.5, 2.6));
    scene.add(makeWall(gx + 0.5, 19.5, 2.6));
  }
  for (let gz = 0; gz < GRID_H; gz++) {
    scene.add(makeWall(0.5, gz + 0.5, 2.6));
    scene.add(makeWall(19.5, gz + 0.5, 2.6));
  }
  for (let gx = 1; gx < GRID_W - 1; gx++) if (gx !== WORLD.entrance.gx) scene.add(makeWall(gx + 0.5, 7.5, 2.2));
  for (let gz = 1; gz < 7; gz++) {
    scene.add(makeWall(4.5, gz + 0.5, 2.2));
    scene.add(makeWall(15.5, gz + 0.5, 2.2));
  }

  function makeWall(x, z, h) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(1, h, 1),
      new THREE.MeshStandardMaterial({ color: 0x89593f, roughness: 0.98 })
    );
    wall.position.set(x, h / 2, z);
    return wall;
  }

  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(4.8, 0.45, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x22314a, roughness: 0.6 })
  );
  sign.position.set(10, 2.1, 8.2);
  scene.add(sign);
  const signLabel = makeLabelSprite('RESTAURANT ZOMBIE', '#111827', '#fff', 2.1, 0.8);
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

  const player = characterFactory('player', 'player-main');
  player.position.set(state.player.x, 0, state.player.z);
  scene.add(player);

  const carryStack = makeStack(12, 0.25);
  carryStack.group.position.set(0, 1.45, 0.02);
  player.add(carryStack.group);

  const chef = characterFactory('chef', 'chef-main');
  chef.position.set(WORLD.oven.gx + 1.8, 0, WORLD.oven.gz + 1.0);
  chef.scale.setScalar(0.94);
  scene.add(chef);

  function makeTable(spot, active = true) {
    const table = {
      gx: spot.gx,
      gz: spot.gz,
      seat: { gx: spot.gx, gz: spot.gz + 1 },
      active,
      capacity: 10,
      stack: 0,
      customerId: null,
      occupied: false,
      upgradeLevel: 1,
      group: new THREE.Group(),
      stackModel: makeStack(12),
      ring: null,
      stackLabel: null,
      capLabel: null,
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

    const stack = makeStack(12);
    stack.group.position.set(0, 0.82, 0);
    root.add(stack.group);

    const stackLabel = makeLabelSprite('0', '#1f2937', '#fff', 0.9, 0.45);
    stackLabel.sprite.position.set(0, 1.85, 0);
    root.add(stackLabel.sprite);

    const capLabel = makeLabelSprite('10', '#1f2937', '#fff', 0.9, 0.45);
    capLabel.sprite.position.set(0.55, 1.85, 0.1);
    root.add(capLabel.sprite);

    table.stackModel = stack;
    table.ring = ring;
    table.stackLabel = stackLabel;
    table.capLabel = capLabel;
    return table;
  }

  function createChair() {
    const group = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.36), new THREE.MeshStandardMaterial({ color: 0x8f654b, roughness: 0.95 }));
    seat.position.y = 0.42;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.06), new THREE.MeshStandardMaterial({ color: 0x7a573f, roughness: 0.95 }));
    back.position.set(0, 0.68, -0.14);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x6d4c3a, roughness: 0.95 });
    const legs = [ [-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14] ].map(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.42, 0.04), legMat);
      leg.position.set(x, 0.21, z);
      return leg;
    });
    group.add(seat, back, ...legs);
    return group;
  }

  function createPizzaParticle(text, x, z, color) {
    const p = makeLabelSprite(text, '#111827', color || '#fff', 1.8, 0.8);
    p.sprite.position.set(x, 1.6, z);
    scene.add(p.sprite);
    state.particles.push({ sprite: p.sprite, life: 1, speed: 0.4 });
  }

  function updateTableVisuals(table) {
    table.stackModel.setCount(table.stack);
    table.stackLabel.draw(String(table.stack));
    table.capLabel.draw(String(table.capacity));
  }

  function updateHud() {
    ui.money.textContent = Math.floor(state.money);
    ui.stock.textContent = state.stock;
    ui.carry.textContent = `${state.carry}/${state.carryCap}`;
    ui.oven.textContent = Math.max(0, Math.floor(ovenStack.count));
    ui.waiting.textContent = state.customers.filter(c => c.state === 'waiting').length;
    ui.rep.textContent = state.rep;
    ui.upgradeCarryBtn.textContent = `Kapacita (${15 * state.carryCap})`;
    ui.upgradeOvenBtn.textContent = `Pec (${20 * state.ovenLevel})`;
    if (adBtn) {
      const remaining = Math.max(0, Math.ceil((state.adCooldownAt - performance.now()) / 1000));
      adBtn.textContent = remaining > 0 ? `Reklama (${remaining}s)` : 'Reklama +5';
    }
  }

  function createPath(start, goal) {
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
        { gx: cur.gx + 1, gz: cur.gz }, { gx: cur.gx - 1, gz: cur.gz },
        { gx: cur.gx, gz: cur.gz + 1 }, { gx: cur.gx, gz: cur.gz - 1 },
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

  function findNearestTable() {
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
    carryStack.group.position.y = 1.45 + Math.sin(performance.now() * 0.008) * 0.01;
  }

  function updateChef(dt) {
    chef.userData.rig.armL.rotation.x = 0.15 + Math.sin(performance.now() * 0.004) * 0.12;
    chef.userData.rig.armR.rotation.x = 0.15 - Math.sin(performance.now() * 0.004) * 0.12;
    chef.rotation.y = Math.sin(performance.now() * 0.0012) * 0.08;
    chef.position.y = Math.sin(performance.now() * 0.006) * 0.02;
  }

  function updateOven(dt) {
    state.ovenTimer += dt;
    const interval = Math.max(1.5, 4.4 - state.ovenLevel * 0.35);
    while (state.ovenTimer >= interval) {
      state.ovenTimer -= interval;
      if (state.stock > 0 && ovenStack.count < ovenStack.max) {
        state.stock -= 1;
        ovenStack.count += 1;
        ovenStack.setCount(ovenStack.count);
        createPizzaParticle('+pizza', WORLD.oven.gx + 0.5, WORLD.oven.gz + 0.5, '#ffd166');
      } else break;
    }
  }

  function collectFromOven() {
    const d = dist(state.player.x, state.player.z, WORLD.oven.gx + 0.5, WORLD.oven.gz + 0.5);
    if (d > 1.25) return false;
    const take = Math.min(ovenStack.count, state.carryCap - state.carry);
    if (take <= 0) {
      toast(ovenStack.count === 0 ? 'V peci nic není' : 'Máš plnou kapacitu');
      return true;
    }
    ovenStack.count -= take;
    state.carry += take;
    ovenStack.setCount(ovenStack.count);
    carryStack.setCount(state.carry);
    createPizzaParticle('+' + take, WORLD.oven.gx + 0.5, WORLD.oven.gz + 0.5, '#ffd166');
    toast('Pizza naložena', `Vzato ${take}.`);
    return true;
  }

  function buyStock() {
    if (state.money >= 5) {
      state.money -= 5;
      state.stock += 5;
      createPizzaParticle('+5', WORLD.stock.gx + 0.5, WORLD.stock.gz + 0.5, '#8fe08f');
      toast('Suroviny koupeny');
      return;
    }
    const now = performance.now();
    if (now >= state.emergencyAt) {
      state.stock += 3;
      state.emergencyAt = now + 30000;
      createPizzaParticle('+3', WORLD.stock.gx + 0.5, WORLD.stock.gz + 0.5, '#8fe08f');
      toast('Nouzové suroviny', 'Dostals 3 zdarma, aby se hra nezasekla.');
      return;
    }
    toast('Málo peněz', 'Počkej na nouzové doplnění nebo reklamu.');
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

  function addTable() {
    const next = tables.find(t => !t.active);
    if (!next) {
      toast('Všechny stoly jsou už otevřené');
      return;
    }
    const cost = 40 + tables.filter(t => t.active).length * 20;
    if (state.money < cost) {
      toast('Málo peněz', `Potřebuješ ${cost}.`);
      return;
    }
    state.money -= cost;
    next.active = true;
    scene.add(next.group);
    block(next.gx, next.gz);
    updateTableVisuals(next);
    toast('Nový stůl otevřen', `Cena ${cost}.`);
  }

  function upgradeTable() {
    const table = findNearestTable();
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
    updateTableVisuals(table);
    toast('Stůl vylepšen', `Kapacita ${table.capacity}.`);
  }

  function payAndLeave(customer) {
    if (customer.paid) return;
    customer.paid = true;
    state.money += customer.reward;
    state.rep += 1;
    createPizzaParticle('+' + customer.reward, customer.table.gx + 0.5, customer.table.gz + 0.5, '#8fe08f');
    customer.table.stack = 0;
    customer.table.occupied = false;
    customer.table.customerId = null;
    updateTableVisuals(customer.table);
    customer.state = 'leaving';
    customer.path = createPath(worldToCell(customer.x, customer.z), WORLD.entrance);
    customer.pathIndex = 0;
    toast('Host zaplatil', `+${customer.reward}`);
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
    carryStack.setCount(state.carry);
    updateTableVisuals(table);
    createPizzaParticle('-pizza', table.gx + 0.5, table.gz + 0.5, '#ffcf6f');
    toast('Pizza podána', 'Na stůl přibyla další pizza.');
    if (customer.state === 'waiting' && table.stack > customer.eaten) {
      customer.state = 'eating';
      customer.eatTimer = 1.25;
    }
    return true;
  }

  function interact() {
    const nearest = findNearestTable();
    if (nearest) {
      const c = cellCenter(nearest.gx, nearest.gz);
      if (dist(state.player.x, state.player.z, c.x, c.z) < 1.6) {
        const customer = state.customers.find(x => x.table === nearest && !x.dead);
        if (customer && serveTable(nearest, customer)) return;
      }
    }
    if (collectFromOven()) return;
    if (dist(state.player.x, state.player.z, WORLD.stock.gx + 0.5, WORLD.stock.gz + 0.5) < 1.25) return buyStock();
    if (dist(state.player.x, state.player.z, WORLD.counter.gx + 0.5, WORLD.counter.gz + 0.5) < 1.25) return upgradeCarry();
    if (dist(state.player.x, state.player.z, WORLD.cash.gx + 0.5, WORLD.cash.gz + 0.5) < 1.25) return upgradeOven();
    toast('Nic k akci', 'Přibliž se ke stolu, peci nebo skladu.');
  }

  function spawnCustomer(manual = false) {
    const table = tables.find(t => t.active && !t.occupied);
    if (!table) {
      if (manual) toast('Žádný volný stůl', 'Nejdřív otevři nový stůl.');
      return;
    }
    const idSeed = 'cust-' + Math.random().toString(36).slice(2);
    const customer = characterFactory('customer', idSeed);
    customer.scale.setScalar(0.98);
    customer.position.set(WORLD.entrance.gx + 0.5, 0, WORLD.entrance.gz + 0.5);
    scene.add(customer);
    const reward = 15 + Math.floor(Math.random() * 8);
    const order = 2 + Math.floor(Math.random() * 3);
    const c = {
      id: idSeed,
      table,
      x: WORLD.entrance.gx + 0.5,
      z: WORLD.entrance.gz + 0.5,
      state: 'walking',
      waitTimer: 18 + Math.random() * 10,
      eatTimer: 0,
      payTimer: 0,
      order,
      eaten: 0,
      reward,
      path: [],
      pathIndex: 0,
      mesh: customer,
      paid: false,
    };
    table.occupied = true;
    table.customerId = c.id;
    table.stack = 0;
    updateTableVisuals(table);
    c.path = createPath(worldToCell(c.x, c.z), table.seat);
    state.customers.push(c);
    toast('Host přišel', manual ? 'Přivolán ke stolu.' : 'Míří ke stolu.');
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
          if (c.pathIndex < c.path.length - 1) c.pathIndex += 1;
          else if (c.state === 'walking') {
            c.state = 'waiting';
            c.waitTimer = 18 + Math.random() * 10;
            toast('Host sedí', `Objednal ${c.order} pizz.`);
          } else {
            c.dead = true;
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
        c.table.occupied = false;
        c.table.customerId = null;
        c.table.stack = 0;
        updateTableVisuals(c.table);
        toast('Host odchází', 'Příliš dlouhé čekání.');
      } else if (c.table.stack > c.eaten) {
        c.state = 'eating';
        c.eatTimer = 1.25;
      }
    } else if (c.state === 'eating') {
      c.eatTimer -= dt;
      if (c.eatTimer <= 0) {
        if (c.table.stack > 0) {
          c.table.stack -= 1;
          c.eaten += 1;
          updateTableVisuals(c.table);
          createPizzaParticle('-pizza', c.table.gx + 0.5, c.table.gz + 0.5, '#ffcf6f');
        }
        if (c.eaten >= c.order) {
          payAndLeave(c);
        } else {
          c.state = 'waiting';
        }
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
      if (p.sprite.material.map?.dispose) p.sprite.material.map.dispose();
      p.sprite.material.dispose();
      state.particles.splice(i, 1);
    }
  }

  function updateTables(dt) {
    for (const t of tables) {
      if (!t.active) continue;
      t.ring.visible = dist(state.player.x, state.player.z, t.gx + 0.5, t.gz + 0.5) < 1.8;
      t.ring.position.y = 0.08 + Math.sin(performance.now() * 0.004 + t.gx) * 0.02;
    }
  }

  function updateCamera(dt) {
    const px = state.player.x;
    const pz = state.player.z;
    const desiredX = px + 11.5;
    const desiredY = 16.8;
    const desiredZ = pz + 11.5;
    const t = 1 - Math.pow(0.001, dt);
    camera.position.x += (desiredX - camera.position.x) * t;
    camera.position.y += (desiredY - camera.position.y) * t;
    camera.position.z += (desiredZ - camera.position.z) * t;
    camera.lookAt(px, 0.95, pz);
  }

  function makeRewardButton() {
    const btn = document.createElement('button');
    btn.id = 'adRewardBtn';
    btn.className = 'secondary';
    btn.style.marginLeft = '8px';
    btn.textContent = 'Reklama +5';
    btn.addEventListener('click', () => {
      const now = performance.now();
      if (now < state.adCooldownAt) {
        toast('Reklama ještě není připravená', `${Math.ceil((state.adCooldownAt - now) / 1000)} s`);
        return;
      }
      state.money += 5;
      state.adCooldownAt = now + 30000;
      toast('Odměna za reklamu', '+5 peněz');
    });
    return btn;
  }

  const adBtn = makeRewardButton();
  document.querySelector('.top-actions')?.appendChild(adBtn);

  function addButtons() {
    ui.spawnBtn.addEventListener('click', () => spawnCustomer(true));
    ui.buyStockBtn.addEventListener('click', buyStock);
    ui.upgradeCarryBtn.addEventListener('click', upgradeCarry);
    ui.upgradeOvenBtn.addEventListener('click', upgradeOven);
    ui.saveBtn.addEventListener('click', save);
    ui.resetBtn.addEventListener('click', reset);
    ui.actionBtn.addEventListener('click', interact);
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
      oven: { stack: ovenStack.count, timer: state.ovenTimer },
      tables: tables.map(t => ({ active: t.active, capacity: t.capacity, stack: t.stack, upgradeLevel: t.upgradeLevel })),
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
      if (data.oven && typeof data.oven.stack === 'number') ovenStack.count = data.oven.stack;
      if (data.oven && typeof data.oven.timer === 'number') state.ovenTimer = data.oven.timer;
      if (Array.isArray(data.tables)) {
        data.tables.forEach((src, i) => {
          if (!tables[i]) return;
          tables[i].active = !!src.active;
          tables[i].capacity = typeof src.capacity === 'number' ? src.capacity : tables[i].capacity;
          tables[i].stack = typeof src.stack === 'number' ? src.stack : tables[i].stack;
          tables[i].upgradeLevel = typeof src.upgradeLevel === 'number' ? src.upgradeLevel : tables[i].upgradeLevel;
          if (tables[i].active) scene.add(tables[i].group);
          updateTableVisuals(tables[i]);
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
    state.customers.slice().forEach(c => scene.remove(c.mesh));
    state.customers.length = 0;
    state.particles.slice().forEach(p => scene.remove(p.sprite));
    state.particles.length = 0;
    tables.forEach((t, i) => {
      t.stack = 0;
      t.customerId = null;
      t.occupied = false;
      t.upgradeLevel = 1;
      t.capacity = 10;
      t.active = i < 4;
      if (t.active && !scene.children.includes(t.group)) scene.add(t.group);
      updateTableVisuals(t);
    });
    ovenStack.count = 0;
    ovenStack.setCount(0);
    toast('Reset hotov');
  }

  function updateLoop(now) {
    const dt = Math.min(0.033, ((now || 0) - (updateLoop.last || now)) / 1000 || 0.016);
    updateLoop.last = now || performance.now();

    updatePlayer(dt);
    updateChef(dt);
    updateOven(dt);
    state.lastSpawn += dt;
    if (state.lastSpawn > 8.5 && state.customers.filter(c => !c.dead).length < 4) {
      spawnCustomer(false);
      state.lastSpawn = 0;
    }

    for (const c of state.customers) updateCustomer(c, dt);
    for (let i = state.customers.length - 1; i >= 0; i--) if (state.customers[i].dead) state.customers.splice(i, 1);

    updateParticles(dt);
    updateTables(dt);
    updateHud();
    updateCamera(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(updateLoop);
  }

  function setStick(dx, dz) {
    const max = state.touch.max;
    const len = Math.hypot(dx, dz);
    if (len > max) {
      dx = (dx / len) * max;
      dz = (dz / len) * max;
    }
    ui.nub.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dz}px)`;
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
      hideStick();
      e.preventDefault();
    };
    window.addEventListener('pointerup', end, { passive: false });
    window.addEventListener('pointercancel', end, { passive: false });
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

  function initWorld() {
    rebuildBlockedMap();
    for (const slot of TABLE_SLOTS) {
      const table = makeTable(slot, tables.length < 4);
      tables.push(table);
      if (table.active) scene.add(table.group);
      updateTableVisuals(table);
    }
    ovenStack.setCount(0);
    carryStack.setCount(0);
  }

  const ovenStack = makeStack(12, 0.1);
  ovenStack.group.position.set(0, 0, 0);
  ovenTray.add(ovenStack.group);

  initWorld();
  setupJoystick();
  addButtons();
  load();

  state.player.x = clamp(state.player.x, 1.2, GRID_W - 1.2);
  state.player.z = clamp(state.player.z, 1.2, GRID_H - 1.2);
  player.position.set(state.player.x, 0, state.player.z);
  ovenStack.setCount(ovenStack.count);
  carryStack.setCount(state.carry);
  toast('Engine ready', 'Nové modely, opravené platby a bezpečná ekonomika.');
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  });
  requestAnimationFrame(updateLoop);
})();
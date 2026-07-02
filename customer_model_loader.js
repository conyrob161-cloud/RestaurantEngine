(() => {
  const MODEL_CANDIDATES = [
    { key: 'smooth', url: './Smooth_Male_Casual (1).fbx' },
    { key: 'smooth-encoded', url: './Smooth_Male_Casual%20(1).fbx' },
    { key: 'hoodie', url: './Casual_Hoodie.fbx' },
  ];

  const CHARACTER_TYPES = new Set(['player', 'chef', 'customer']);
  const STATE_ALIASES = {
    idle: ['idle', 'stand', 'wait', 'rest', 'pose'],
    walk: ['walk', 'run', 'jog', 'move', 'moveforward'],
    eat: ['eat', 'bite', 'chew', 'drink', 'consume'],
  };

  const originalAdd = THREE.Object3D.prototype.add;
  const templateCache = new Map();
  const pendingRoots = new Set();
  const rootState = new WeakMap();
  const activeMixers = new Set();
  const clock = new THREE.Clock();

  let defaultModelKey = MODEL_CANDIDATES[0].key;
  let forceNeutralMaterials = false;

  function normalizeKey(value) {
    return String(value || '').trim().toLowerCase();
  }

  function getCandidateByKey(key) {
    const normalized = normalizeKey(key);
    return MODEL_CANDIDATES.find((c) => normalizeKey(c.key) === normalized || normalizeKey(c.url) === normalized);
  }

  function pickModelUrl(root) {
    const preferred = root?.userData?.characterModel || root?.userData?.characterModelUrl || root?.userData?.fbxModel;
    const preferredCandidate = getCandidateByKey(preferred);
    if (preferredCandidate) return preferredCandidate.url;
    const defaultCandidate = getCandidateByKey(defaultModelKey);
    return defaultCandidate?.url || MODEL_CANDIDATES[0].url;
  }

  function countMeshes(root) {
    let n = 0;
    root.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) n += 1;
    });
    return n;
  }

  function countBones(root) {
    let n = 0;
    root.traverse((o) => {
      if (o.isBone) n += 1;
    });
    return n;
  }

  function cloneMaterial(material, isSkinned) {
    if (Array.isArray(material)) {
      return material.map((m) => cloneMaterial(m, isSkinned));
    }

    if (!material) {
      const fallback = new THREE.MeshStandardMaterial({
        color: 0xbdbdbd,
        roughness: 0.9,
        metalness: 0.0,
        side: THREE.DoubleSide,
      });
      fallback.skinning = !!isSkinned;
      return fallback;
    }

    const cloned = material.clone();
    cloned.side = THREE.DoubleSide;
    if ('skinning' in cloned) cloned.skinning = !!isSkinned;
    return cloned;
  }

  function applyVisibleMaterials(root) {
    root.traverse((o) => {
      if (!(o.isMesh || o.isSkinnedMesh)) return;
      o.visible = true;
      o.castShadow = true;
      o.receiveShadow = true;
      if (forceNeutralMaterials) {
        const mat = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
        if (o.isSkinnedMesh) mat.skinning = true;
        o.material = mat;
        return;
      }
      o.material = cloneMaterial(o.material, o.isSkinnedMesh);
    });
  }

  function fitToHeight(root, targetHeight = 1.8) {
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const scale = size.y > 0 ? targetHeight / size.y : 1;
    root.scale.setScalar(scale);
    root.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    return { box, size, center, scale };
  }

  function pickAnimationClip(animations, state) {
    if (!animations || !animations.length) return null;
    const normalizedState = normalizeKey(state || 'idle');
    const aliases = STATE_ALIASES[normalizedState] || [normalizedState];

    for (const alias of aliases) {
      const clip = animations.find((a) => normalizeKey(a.name).includes(alias));
      if (clip) return clip;
    }

    return animations[0];
  }

  function ensureActionSet(info) {
    if (info.actions) return info.actions;
    info.actions = new Map();
    if (!info.template?.animations?.length || !info.mixer) return info.actions;

    for (const clip of info.template.animations) {
      const action = info.mixer.clipAction(clip);
      action.enabled = true;
      action.clampWhenFinished = true;
      action.loop = THREE.LoopRepeat;
      info.actions.set(clip.name || `clip-${info.actions.size}`, action);
    }
    return info.actions;
  }

  function transitionToState(info, state) {
    const normalized = normalizeKey(state || 'idle');
    if (info.currentState === normalized) return;
    info.currentState = normalized;

    if (!info.mixer || !info.template?.animations?.length) return;

    const targetClip = pickAnimationClip(info.template.animations, normalized);
    if (!targetClip) return;

    const nextAction = info.mixer.clipAction(targetClip);
    if (info.currentAction && info.currentAction !== nextAction) {
      info.currentAction.fadeOut(0.15);
    }
    nextAction.reset().fadeIn(0.15).play();
    info.currentAction = nextAction;
  }

  function inferState(root, info, dt) {
    const manual = root.userData?.characterState || root.userData?.animState || root.userData?.fbxState;
    if (manual) return normalizeKey(manual);

    const currentPosition = root.getWorldPosition(new THREE.Vector3());
    const speed = currentPosition.distanceTo(info.lastPosition) / Math.max(dt, 1 / 60);
    info.lastPosition.copy(currentPosition);

    if (speed > 0.03) {
      info.idleSeconds = 0;
      return 'walk';
    }

    info.idleSeconds += dt;
    if (root.userData?.type === 'customer' && info.idleSeconds > 1.1) return 'eat';
    return 'idle';
  }

  function attachToRoot(root, template, templateUrl) {
    if (!root || rootState.has(root)) return;

    for (const child of root.children.slice()) {
      if (!child.isSprite) child.visible = false;
    }

    const instance = template.clone(true);
    instance.name = `FBXCharacter:${templateUrl}`;
    instance.userData.__fbxInstance = true;
    applyVisibleMaterials(instance);

    const { scale } = fitToHeight(instance, 1.8);
    root.add(instance);

    const info = {
      root,
      template,
      templateUrl,
      instance,
      mixer: null,
      actions: null,
      currentAction: null,
      currentState: 'idle',
      idleSeconds: 0,
      lastPosition: root.getWorldPosition(new THREE.Vector3()),
      scale,
    };

    if (template.animations?.length) {
      info.mixer = new THREE.AnimationMixer(instance);
      activeMixers.add(info.mixer);
      ensureActionSet(info);
      transitionToState(info, inferState(root, info, 0));
    }

    rootState.set(root, info);
    return info;
  }

  async function loadTemplate(url) {
    if (templateCache.has(url)) return templateCache.get(url);

    const loader = new THREE.FBXLoader();
    const promise = new Promise((resolve, reject) => {
      loader.load(
        url,
        (fbx) => resolve(fbx),
        undefined,
        (err) => reject(err),
      );
    });
    templateCache.set(url, promise);
    return promise;
  }

  function queuePendingRoots(root) {
    if (CHARACTER_TYPES.has(normalizeKey(root?.userData?.type))) {
      pendingRoots.add(root);
      return true;
    }
    return false;
  }

  function attachPendingRoots(template, templateUrl) {
    for (const root of Array.from(pendingRoots)) {
      if (!rootState.has(root) && CHARACTER_TYPES.has(normalizeKey(root?.userData?.type))) {
        attachToRoot(root, template, templateUrl);
      }
      pendingRoots.delete(root);
    }
  }

  function tryAttachRoot(root) {
    if (!CHARACTER_TYPES.has(normalizeKey(root?.userData?.type))) return;
    if (rootState.has(root)) return;

    const templateUrl = pickModelUrl(root);
    const templatePromise = loadTemplate(templateUrl).catch(() => null);

    templatePromise.then((template) => {
      if (template) {
        attachToRoot(root, template, templateUrl);
      } else {
        pendingRoots.add(root);
      }
    });
  }

  THREE.Object3D.prototype.add = function patchedAdd(...objs) {
    for (const obj of objs) {
      if (obj && typeof obj === 'object' && queuePendingRoots(obj)) {
        tryAttachRoot(obj);
      }
    }
    return originalAdd.apply(this, objs);
  };

  function preloadModels() {
    for (const candidate of MODEL_CANDIDATES) {
      loadTemplate(candidate.url)
        .then((template) => {
          attachPendingRoots(template, candidate.url);
        })
        .catch(() => {});
    }
  }

  function tick() {
    const dt = clock.getDelta();
    for (const mixer of activeMixers) mixer.update(dt);

    for (const [root, info] of Array.from(rootState.entries?.() || [])) {
      if (!root || !info) continue;
      const state = inferState(root, info, dt);
      transitionToState(info, state);
      if (info.mixer) info.mixer.update(0); // keep action state live; dt already applied globally
    }

    requestAnimationFrame(tick);
  }

  window.RZFBXCharacters = {
    setDefaultModel(modelKeyOrUrl) {
      defaultModelKey = getCandidateByKey(modelKeyOrUrl)?.key || defaultModelKey;
    },
    setNeutralMaterials(enabled = true) {
      forceNeutralMaterials = !!enabled;
    },
    attach(root, modelKeyOrUrl) {
      if (!root || rootState.has(root)) return null;
      const preferred = getCandidateByKey(modelKeyOrUrl);
      const candidateUrl = preferred?.url || pickModelUrl(root);
      return loadTemplate(candidateUrl)
        .then((template) => attachToRoot(root, template, candidateUrl))
        .catch(() => null);
    },
    reload() {
      templateCache.clear();
      preloadModels();
    },
  };

  preloadModels();
  requestAnimationFrame(tick);
})();
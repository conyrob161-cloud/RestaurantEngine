(() => {
  if (window.__safeRafInstalled) return;
  window.__safeRafInstalled = true;

  function isLikelyCharacterRig(value) {
    return !!(
      value &&
      typeof value === 'object' &&
      value.body &&
      value.head &&
      value.rig &&
      value.handL &&
      value.handR &&
      value.footL &&
      value.footR &&
      value.hat &&
      typeof value.blinkSeed !== 'undefined'
    );
  }

  function attachHairIfMissing(value) {
    if (!isLikelyCharacterRig(value) || value.hair) return;
    const rigGroup = value.rig;
    if (!rigGroup || !Array.isArray(rigGroup.children)) return;
    const hair = rigGroup.children.find((child) => (
      child &&
      child.isMesh &&
      child.position &&
      child.scale &&
      child.position.y > 1.6 &&
      child.scale.y < 0.9
    ));
    if (hair) value.hair = hair;
  }

  // Intercept rig object creation so the game gets a hair reference even if
  // the main file forgets to include it in userData.rig.
  if (!Object.getOwnPropertyDescriptor(Object.prototype, 'rig')) {
    Object.defineProperty(Object.prototype, 'rig', {
      configurable: true,
      enumerable: false,
      get() {
        return this.__restaurantRig;
      },
      set(value) {
        attachHairIfMissing(value);
        Object.defineProperty(this, '__restaurantRig', {
          value,
          writable: true,
          configurable: true,
          enumerable: false,
        });
      },
    });
  }

  const nativeRaf = window.requestAnimationFrame.bind(window);
  const nativeCaf = window.cancelAnimationFrame.bind(window);
  const scheduled = new Map();

  function safeRequestAnimationFrame(callback) {
    const wrapped = (timestamp) => {
      scheduled.delete(id);
      try {
        callback(timestamp);
      } catch (error) {
        console.error('[runtime_patch_v1] RAF callback failed:', error);
        // Keep the game alive by scheduling the same callback again.
        setTimeout(() => {
          try {
            safeRequestAnimationFrame(callback);
          } catch (retryError) {
            console.error('[runtime_patch_v1] RAF retry failed:', retryError);
          }
        }, 0);
      }
    };

    const id = nativeRaf(wrapped);
    scheduled.set(id, wrapped);
    return id;
  }

  function safeCancelAnimationFrame(id) {
    scheduled.delete(id);
    return nativeCaf(id);
  }

  window.requestAnimationFrame = safeRequestAnimationFrame;
  window.cancelAnimationFrame = safeCancelAnimationFrame;

  window.addEventListener('error', (event) => {
    console.error('[runtime_patch_v1] window error:', event.error || event.message || event);
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('[runtime_patch_v1] unhandled rejection:', event.reason);
  });
})();
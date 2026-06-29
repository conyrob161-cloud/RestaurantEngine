(() => {
  if (window.__safeRafInstalled) return;
  window.__safeRafInstalled = true;

  const nativeRaf = window.requestAnimationFrame.bind(window);
  const nativeCaf = window.cancelAnimationFrame.bind(window);
  const scheduled = new Map();
  let nextId = 1;

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
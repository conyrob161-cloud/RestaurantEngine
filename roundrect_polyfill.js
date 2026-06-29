(() => {
  if (window.__restaurantPolyfillInstalled) return;
  window.__restaurantPolyfillInstalled = true;

  // Canvas roundRect polyfill for older browsers.
  if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
      const radius = Array.isArray(r) ? r[0] : r;
      this.beginPath();
      this.moveTo(x + radius, y);
      this.lineTo(x + w - radius, y);
      this.quadraticCurveTo(x + w, y, x + w, y + radius);
      this.lineTo(x + w, y + h - radius);
      this.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
      this.lineTo(x + radius, y + h);
      this.quadraticCurveTo(x, y + h, x, y + h - radius);
      this.lineTo(x, y + radius);
      this.quadraticCurveTo(x, y, x + radius, y);
      this.closePath();
    };
  }

  // Keep animation frames alive if a frame callback throws.
  const nativeRAF = window.requestAnimationFrame.bind(window);
  const nativeCAF = window.cancelAnimationFrame.bind(window);

  window.requestAnimationFrame = function(cb) {
    return nativeRAF((ts) => {
      try {
        cb(ts);
      } catch (err) {
        console.error('[polyfill] frame error:', err);
        setTimeout(() => {
          try {
            window.requestAnimationFrame(cb);
          } catch (retryErr) {
            console.error('[polyfill] retry failed:', retryErr);
          }
        }, 0);
      }
    });
  };

  window.cancelAnimationFrame = function(id) {
    return nativeCAF(id);
  };

  window.addEventListener('error', (event) => {
    console.error('[polyfill] window error:', event.error || event.message || event);
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('[polyfill] unhandled rejection:', event.reason);
  });
})();
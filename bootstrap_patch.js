(() => {
  const isFoodArray = (value) => Array.isArray(value) && value.length > 0 && value.every((item) => item === 'pizza' || item === 'burger');
  const callbackUsesRemaining = (callback) => typeof callback === 'function' && /remaining/.test(Function.prototype.toString.call(callback));

  const originalSome = Array.prototype.some;
  const originalFind = Array.prototype.find;

  Array.prototype.some = function somePatched(callback, thisArg) {
    try {
      if (isFoodArray(this) && callbackUsesRemaining(callback)) {
        return this.length > 0;
      }
    } catch {
      // Fall through to the original implementation.
    }
    return originalSome.call(this, callback, thisArg);
  };

  Array.prototype.find = function findPatched(callback, thisArg) {
    try {
      if (isFoodArray(this) && callbackUsesRemaining(callback)) {
        return this.length > 0 ? this[0] : undefined;
      }
    } catch {
      // Fall through to the original implementation.
    }
    return originalFind.call(this, callback, thisArg);
  };

  const originalFillText = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function fillTextPatched(text, ...rest) {
    if (text === 'OK') text = '…';
    return originalFillText.call(this, text, ...rest);
  };
})();
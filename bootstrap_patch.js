(() => {
  const originalPush = Array.prototype.push;

  const isCustomerShape = (value) => {
    if (!value || typeof value !== 'object') return false;
    return Boolean(value.table && value.mesh && value.remaining && value.order && typeof value.state === 'string');
  };

  const isServeWrite = () => {
    const stack = new Error().stack || '';
    return stack.includes('serveToCustomer');
  };

  const installRemainingGuards = (customer) => {
    const remaining = customer.remaining;
    if (!remaining || remaining.__guarded) return;

    const backing = {
      pizza: Number(remaining.pizza) || 0,
      burger: Number(remaining.burger) || 0,
    };

    Object.defineProperty(remaining, '__guarded', { value: true, enumerable: false });

    for (const type of ['pizza', 'burger']) {
      Object.defineProperty(remaining, type, {
        configurable: true,
        enumerable: true,
        get() {
          return backing[type];
        },
        set(next) {
          if (isServeWrite()) {
            return;
          }
          backing[type] = Math.max(0, Number(next) || 0);
        },
      });
    }
  };

  Array.prototype.push = function pushPatched(...items) {
    for (const item of items) {
      if (isCustomerShape(item)) {
        installRemainingGuards(item);
      }
    }
    return originalPush.apply(this, items);
  };
})();
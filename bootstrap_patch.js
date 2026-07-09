(() => {
  const originalPush = Array.prototype.push;

  const isCustomerShape = (value) => Boolean(value && typeof value === 'object' && value.table && value.mesh && value.remaining && value.order && typeof value.state === 'string');
  const inServeToCustomer = () => (new Error().stack || '').includes('serveToCustomer');

  const installGuards = (customer) => {
    const remaining = customer.remaining;
    if (!remaining || remaining.__patched) return;

    const backing = {
      pizza: Number(remaining.pizza) || 0,
      burger: Number(remaining.burger) || 0,
    };

    Object.defineProperty(remaining, '__patched', { value: true, enumerable: false });

    for (const type of ['pizza', 'burger']) {
      Object.defineProperty(remaining, type, {
        configurable: true,
        enumerable: true,
        get() {
          if (inServeToCustomer()) {
            const servedOnTable = Array.isArray(customer.table?.items)
              ? customer.table.items.filter((item) => item === type).length
              : 0;
            return Math.max(0, backing[type] - servedOnTable);
          }
          return backing[type];
        },
        set(next) {
          if (inServeToCustomer()) return;
          backing[type] = Math.max(0, Number(next) || 0);
        },
      });
    }
  };

  Array.prototype.push = function patchedPush(...items) {
    for (const item of items) {
      if (isCustomerShape(item)) installGuards(item);
    }
    return originalPush.apply(this, items);
  };

  document.write('<script src="zombie_patch.js?v=1"><\/script>');
})();
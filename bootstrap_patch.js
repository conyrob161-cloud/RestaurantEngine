(async () => {
  const SOURCE_URL = 'https://cdn.jsdelivr.net/gh/conyrob161-cloud/RestaurantEngine@main/main_v12.js';

  const patchSource = (source) => {
    const replacement = `function serveToCustomer(table, customer) {
    let moved = 0;
    for (const type of FOOD) {
      while (customer.remaining[type] > 0 && state.tray.includes(type)) {
        const idx = state.tray.indexOf(type);
        state.tray.splice(idx, 1);
        table.items.push(type);
        moved += 1;
      }
    }
    if (!moved) return toast('Na tácu není to, co host chce.'), true;
    updateTableVisuals(table);
    updateCarryText();
    if (customer.state !== 'leaving' && customer.canEat()) {
      customer.state = 'eating';
      if (!customer.eatTimer || customer.eatTimer <= 0) customer.eatTimer = 3;
    }
    toast('Podáno', `Předáno ${moved}×`);
    return true;
  }

  function collectFromWorld() {`;

    const pattern = /function serveToCustomer\(table, customer\) \{[\s\S]*?function collectFromWorld\(\) \{/;
    if (!pattern.test(source)) {
      throw new Error('Nenalezen blok serveToCustomer pro opravu.');
    }
    return source.replace(pattern, replacement);
  };

  try {
    const response = await fetch(SOURCE_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Nelze načíst ${SOURCE_URL}: ${response.status}`);
    const source = await response.text();
    const patched = patchSource(source);
    const script = document.createElement('script');
    script.textContent = patched;
    document.head.appendChild(script);
  } catch (error) {
    console.error(error);
    const fallback = document.createElement('script');
    fallback.src = SOURCE_URL;
    document.head.appendChild(fallback);
  }
})();
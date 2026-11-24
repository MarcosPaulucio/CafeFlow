const screens = [
  ['dashboard', './views/dashboard.html'],
  ['clients', './views/clients.html'],
  ['services', './views/services.html'],
  ['warehouse', './views/warehouse.html'],
  ['queue', './views/queue.html'],
  ['quotation', './views/quotation.html'],
  ['backup', './views/backup.html']
];

async function loadScreens(host) {
  const sections = await Promise.all(screens.map(async ([id, path]) => {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Não foi possível carregar a tela "${id}".`);
    const documentFragment = new DOMParser().parseFromString(await response.text(), 'text/html');
    const section = documentFragment.body.firstElementChild;
    if (documentFragment.body.children.length !== 1 || section?.tagName !== 'SECTION' || section.id !== id || !section.classList.contains('view')) {
      throw new Error(`A tela "${id}" está em um formato inválido.`);
    }
    return document.importNode(section, true);
  }));
  host.replaceChildren(...sections);
}

const host = document.getElementById('viewHost');
try {
  await loadScreens(host);
  await import('./app.js?v=26');
} catch (error) {
  console.error(error);
  const message = document.createElement('p');
  message.className = 'view-load-error';
  message.setAttribute('role', 'alert');
  message.textContent = `Não foi possível iniciar o CafeFlow: ${error.message}`;
  host.replaceChildren(message);
}

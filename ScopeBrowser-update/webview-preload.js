// Runs inside every web page tab. Bridges Scope Lens and the browser.
const { ipcRenderer } = require('electron');

// Scope Lens button pressed: tell Scope Lens on this page to start.
ipcRenderer.on('scope-lens-start', () => {
  window.postMessage({ __scopeBrowser: 'lens-start' }, '*');
});

// Scope Lens asks for a screenshot of the page.
window.addEventListener('message', async (e) => {
  const d = e.data;
  if (!d || d.__scopeBrowser !== 'capture-request' || typeof d.id !== 'string') return;
  let reply;
  try { reply = await ipcRenderer.invoke('lens-capture'); }
  catch (err) { reply = { error: err.message }; }
  window.postMessage({ __scopeBrowser: 'capture-result', id: d.id, ...reply }, '*');
});

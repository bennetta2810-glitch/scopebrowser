const { contextBridge, ipcRenderer } = require('electron');

const webviewPreload = ipcRenderer.sendSync('webview-preload-path');

contextBridge.exposeInMainWorld('scope', {
  webviewPreload,
  armLens: (id) => ipcRenderer.send('lens-arm', id),
  extensions: () => ipcRenderer.invoke('extensions-list'),
  openPopup: (id) => ipcRenderer.send('open-popup', id),
  openExtensionsFolder: () => ipcRenderer.send('open-extensions-folder'),
  addExtension: () => ipcRenderer.send('add-extension'),
  setCompact: (on) => ipcRenderer.send('set-compact', on),
  onCommand: (cb) => ipcRenderer.on('cmd', (_e, cmd, arg) => cb(cmd, arg))
});

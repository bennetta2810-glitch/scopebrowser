const { app, BrowserWindow, session, ipcMain, Menu, nativeTheme, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

let mainWindow = null;
let extensions = []; // { id, name, popupUrl, builtIn }
const backgroundPages = []; // hidden windows that run extension background scripts

function extensionFolder() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'ScopeLens')
    : path.join(__dirname, 'ScopeLens');
}

// Extra extensions live here: ~/Library/Application Support/Scope Browser/Extensions
function userExtensionsFolder() {
  return path.join(app.getPath('userData'), 'Extensions');
}

async function loadOne(dir, builtIn) {
  // Folders copied from Chrome include a "_metadata" folder that blocks loading.
  const meta = path.join(dir, '_metadata');
  if (fs.existsSync(meta)) {
    try { fs.rmSync(meta, { recursive: true, force: true }); } catch {}
  }
  try {
    const loader = session.defaultSession.extensions || session.defaultSession;
    const ext = await loader.loadExtension(dir, { allowFileAccess: true });
    const m = ext.manifest || {};
    // Page the button opens: the popup, or else a side panel, options page or setup.html
    const popup = (m.action && m.action.default_popup) ||
                  (m.browser_action && m.browser_action.default_popup) ||
                  (m.side_panel && m.side_panel.default_path) ||
                  (m.options_ui && m.options_ui.page) ||
                  m.options_page ||
                  (fs.existsSync(path.join(dir, 'setup.html')) ? 'setup.html' : null);
    // Extensions that ship a bg.html get it run in a hidden window as their background.
    if (fs.existsSync(path.join(dir, 'bg.html'))) {
      const bg = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } });
      bg.loadURL(`chrome-extension://${ext.id}/bg.html`);
      backgroundPages.push(bg);
    }
    extensions.push({
      id: ext.id,
      name: ext.name || path.basename(dir),
      builtIn,
      popupUrl: popup ? `chrome-extension://${ext.id}/${popup.replace(/^\//, '')}` : null
    });
  } catch (err) {
    console.error(`Could not load extension in ${dir}:`, err.message);
  }
}

// Finds manifest.json directly in a folder, or one level down
// (Chrome stores extensions as <id>/<version>/manifest.json).
function findExtensionDir(dir) {
  if (fs.existsSync(path.join(dir, 'manifest.json'))) return dir;
  for (const sub of fs.readdirSync(dir, { withFileTypes: true })) {
    const inner = path.join(dir, sub.name);
    if (sub.isDirectory() && fs.existsSync(path.join(inner, 'manifest.json'))) return inner;
  }
  return null;
}

function isScopeLens(dir) {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    const gecko = m.browser_specific_settings && m.browser_specific_settings.gecko;
    return (gecko && gecko.id === 'scope-ai-lens@scopeai.oneapp.dev') || /^scope (ai|lens)/i.test(m.name || '');
  } catch {
    return false;
  }
}

async function loadExtensions() {
  const builtInDir = extensionFolder();
  if (fs.existsSync(path.join(builtInDir, 'manifest.json'))) await loadOne(builtInDir, true);

  const userDir = userExtensionsFolder();
  fs.mkdirSync(userDir, { recursive: true });
  for (const entry of fs.readdirSync(userDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const folder = path.join(userDir, entry.name);
    const dir = findExtensionDir(folder);
    if (!dir) continue;
    // Scope Lens is built in, so any other copy of it is old: delete it.
    if (isScopeLens(dir)) {
      try { fs.rmSync(folder, { recursive: true, force: true }); } catch {}
      continue;
    }
    await loadOne(dir, false);
  }
}

// Lets you pick an extension folder, copies it into Scope Browser, then restarts
async function addExtension() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose an extension folder',
    message: 'Choose the folder that contains the extension (it has a manifest.json inside).',
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths.length) return;

  const picked = result.filePaths[0];
  if (!findExtensionDir(picked)) {
    await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      message: 'That folder isn’t an extension.',
      detail: 'Choose the folder that has a manifest.json file inside it, or the folder one level above it.'
    });
    return;
  }

  const target = path.join(userExtensionsFolder(), path.basename(picked));
  fs.mkdirSync(userExtensionsFolder(), { recursive: true });
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(picked, target, { recursive: true });

  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    buttons: ['Restart now', 'Later'],
    defaultId: 0,
    message: 'Extension added.',
    detail: 'Restart Scope Browser to turn it on.'
  });
  if (response === 0) {
    app.relaunch();
    app.exit(0);
  }
}

function openExtensionsFolder() {
  const dir = userExtensionsFolder();
  fs.mkdirSync(dir, { recursive: true });
  shell.openPath(dir);
}

function send(cmd, arg) {
  if (mainWindow) mainWindow.webContents.send('cmd', cmd, arg);
}

function buildMenu() {
  const template = [
    { role: 'appMenu' },
    {
      label: 'File',
      submenu: [
        { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => send('new-tab') },
        { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: () => send('close-tab') },
        { label: 'Open Location', accelerator: 'CmdOrCtrl+L', click: () => send('focus-address') },
        { type: 'separator' },
        { label: 'Add Extension…', click: addExtension },
        { label: 'Open Extensions Folder', click: openExtensionsFolder }
      ]
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => send('reload') },
        { label: 'Back', accelerator: 'CmdOrCtrl+[', click: () => send('back') },
        { label: 'Forward', accelerator: 'CmdOrCtrl+]', click: () => send('forward') },
        { type: 'separator' },
        { label: 'Next Tab', accelerator: 'Ctrl+Tab', click: () => send('next-tab') },
        { label: 'Previous Tab', accelerator: 'Ctrl+Shift+Tab', click: () => send('prev-tab') },
        { type: 'separator' },
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('toggle-sidebar') },
        { label: 'Scope Lens', accelerator: 'Alt+Shift+S', click: () => send('lens-start') },
        { role: 'togglefullscreen' }
      ]
    },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 720,
    minHeight: 480,
    title: 'Scope Browser',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 22 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f1217' : '#eceff5',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true
    }
  });
  mainWindow.loadFile('index.html');
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (process.platform !== 'darwin') app.quit();
  });
}

ipcMain.handle('extensions-list', () =>
  extensions.map(({ id, name, builtIn, popupUrl }) => ({ id, name, builtIn, hasPopup: Boolean(popupUrl) }))
);

// No id = open Scope Lens
ipcMain.on('open-popup', (_e, id) => {
  const ext = id ? extensions.find((x) => x.id === id) : extensions.find((x) => x.builtIn);
  if (!ext || !ext.popupUrl || !mainWindow) return;
  const popup = new BrowserWindow({ width: 400, height: 600, parent: mainWindow, title: ext.name });
  popup.loadURL(ext.popupUrl);
});

ipcMain.on('open-extensions-folder', openExtensionsFolder);

// ---------- Scope Lens bridge ----------
ipcMain.on('webview-preload-path', (e) => {
  e.returnValue = pathToFileURL(path.join(__dirname, 'webview-preload.js')).href;
});

// Pages may only be screenshotted for a while after you press the Scope Lens button.
const lensArmed = new Map(); // webContents id -> expiry time
ipcMain.on('lens-arm', (_e, id) => { lensArmed.set(id, Date.now() + 30 * 60 * 1000); });

ipcMain.handle('lens-capture', async (e) => {
  const until = lensArmed.get(e.sender.id);
  if (!until || Date.now() > until) return { error: 'Press the Scope Lens button first.' };
  try {
    const image = await e.sender.capturePage();
    return { dataUrl: image.toDataURL() };
  } catch (err) {
    return { error: err.message };
  }
});
ipcMain.on('add-extension', addExtension);

ipcMain.on('set-compact', (_e, on) => {
  if (mainWindow && process.platform === 'darwin') mainWindow.setWindowButtonVisibility(!on);
});

// Links that want a new window open as a new tab instead
app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() === 'webview') {
    contents.setWindowOpenHandler(({ url }) => {
      send('open-tab', url);
      return { action: 'deny' };
    });
  }
});

app.whenReady().then(async () => {
  buildMenu();
  await loadExtensions();
  createWindow();
  app.on('activate', () => {
    if (!mainWindow) createWindow();
  });
});

// Hidden background windows keep running, so quit based on the main window instead.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', () => {
  for (const bg of backgroundPages) { try { bg.destroy(); } catch {} }
});

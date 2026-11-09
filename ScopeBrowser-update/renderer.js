// Change these to set the start page and search engine.
const HOME_URL = 'https://scopeai.oneapp.dev';
const SEARCH_URL = 'https://www.google.com/search?q=';

const SPACE_COLORS = ['#2f5ff5', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#64748b'];
const STORE_KEY = 'scope-browser-state-v1';

const $ = (id) => document.getElementById(id);
const sidebar = $('sidebar');
const tabList = $('tab-list');
const pages = $('pages');
const address = $('address');
const wsBar = $('workspaces');
const wsName = $('workspace-name');
const loadBar = $('load-bar');
const webviews = new Map();

let state = loadState();

// ---------- State ----------

function uid() { return Math.random().toString(36).slice(2, 10); }

function makeTab(url = HOME_URL) { return { id: uid(), url, title: 'New tab' }; }

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (saved && saved.workspaces && saved.workspaces.length) return saved;
  } catch {}
  const tab = makeTab();
  const space = { id: uid(), name: 'Home', color: SPACE_COLORS[0], tabs: [tab], activeTabId: tab.id };
  return { workspaces: [space], activeWsId: space.id, compact: false };
}

function save() {
  try {
    const skip = new Set(['loading', 'ready']);
    localStorage.setItem(STORE_KEY, JSON.stringify(state, (k, v) => (skip.has(k) ? undefined : v)));
  } catch {}
}

function space() { return state.workspaces.find((w) => w.id === state.activeWsId) || state.workspaces[0]; }
function activeTab() { const w = space(); return w.tabs.find((t) => t.id === w.activeTabId) || w.tabs[0]; }
function activeView() { const t = activeTab(); return t ? webviews.get(t.id) : null; }
function findTab(id) {
  for (const w of state.workspaces) {
    const t = w.tabs.find((x) => x.id === id);
    if (t) return { w, t };
  }
  return null;
}

function spaceColor(w) {
  return w.color || SPACE_COLORS[Math.max(0, state.workspaces.indexOf(w)) % SPACE_COLORS.length];
}

// Shows just the site name in the address bar until you click it
function prettyUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'chrome-extension:') return 'Extension page';
    return u.hostname.replace(/^www\./, '') || url;
  } catch {
    return url || '';
  }
}

function toUrl(text) {
  text = text.trim();
  if (!text) return HOME_URL;
  if (/^(https?|chrome-extension|file):\/\//.test(text)) return text;
  if (text.includes(' ') || !text.includes('.')) return SEARCH_URL + encodeURIComponent(text);
  return 'https://' + text;
}

// ---------- Web pages ----------

function getView(tab) {
  let wv = webviews.get(tab.id);
  if (wv) return wv;

  wv = document.createElement('webview');
  wv.className = 'page hidden';
  wv.setAttribute('preload', window.scope.webviewPreload);
  wv.setAttribute('src', tab.url || HOME_URL);

  const changed = () => {
    save();
    renderTabs();
    if (tab.id === activeTab().id) syncChrome();
  };
  const navigated = (e) => {
    if (e.isMainFrame === false) return;
    tab.url = e.url;
    changed();
  };

  wv.addEventListener('page-title-updated', (e) => { tab.title = e.title; changed(); });
  wv.addEventListener('page-favicon-updated', (e) => { tab.favicon = e.favicons[0]; changed(); });
  wv.addEventListener('did-navigate', navigated);
  wv.addEventListener('did-navigate-in-page', navigated);
  wv.addEventListener('did-start-loading', () => { tab.loading = true; changed(); });
  wv.addEventListener('did-stop-loading', () => { tab.loading = false; changed(); });
  wv.addEventListener('dom-ready', () => { tab.ready = true; changed(); });

  pages.appendChild(wv);
  webviews.set(tab.id, wv);
  return wv;
}

function showActive() {
  const current = getView(activeTab());
  for (const wv of webviews.values()) wv.classList.toggle('hidden', wv !== current);
  renderTabs();
  syncChrome();
}

function syncChrome() {
  const tab = activeTab();
  const wv = activeView();
  if (document.activeElement !== address) address.value = prettyUrl(tab.url);
  let back = false, fwd = false;
  if (wv && tab.ready) {
    try { back = wv.canGoBack(); fwd = wv.canGoForward(); } catch {}
  }
  $('back').disabled = !back;
  $('forward').disabled = !fwd;
  loadBar.classList.toggle('on', Boolean(tab.loading));
  document.title = `${tab.title || 'New tab'} - Scope Browser`;
}

// ---------- Tabs ----------

function newTab(url = HOME_URL) {
  const tab = makeTab(url);
  const w = space();
  w.tabs.push(tab);
  w.activeTabId = tab.id;
  save();
  showActive();
}

function closeTab(id) {
  const found = findTab(id);
  if (!found) return;
  const { w, t } = found;
  const index = w.tabs.indexOf(t);
  w.tabs.splice(index, 1);
  const wv = webviews.get(id);
  if (wv) { wv.remove(); webviews.delete(id); }
  if (!w.tabs.length) w.tabs.push(makeTab());
  if (w.activeTabId === id) w.activeTabId = w.tabs[Math.min(index, w.tabs.length - 1)].id;
  save();
  showActive();
}

function selectTab(id) {
  space().activeTabId = id;
  save();
  showActive();
}

function cycleTab(dir) {
  const w = space();
  const i = w.tabs.findIndex((t) => t.id === w.activeTabId);
  selectTab(w.tabs[(i + dir + w.tabs.length) % w.tabs.length].id);
}

function renderTabs() {
  const w = space();
  if (document.activeElement !== wsName) wsName.textContent = w.name;
  $('space-dot').style.background = spaceColor(w);

  tabList.replaceChildren(...w.tabs.map((t) => {
    const li = document.createElement('li');
    li.className = 'tab' + (t.id === w.activeTabId ? ' active' : '') + (t.loading ? ' loading' : '');
    li.title = t.title || t.url;

    let icon;
    if (t.loading) {
      icon = Object.assign(document.createElement('span'), { className: 'favicon spin' });
    } else if (t.favicon) {
      icon = document.createElement('img');
      icon.className = 'favicon';
      icon.alt = '';
      icon.src = t.favicon;
      icon.onerror = () => { icon.replaceWith(Object.assign(document.createElement('span'), { className: 'favicon blank' })); };
    } else {
      icon = Object.assign(document.createElement('span'), { className: 'favicon blank' });
    }

    const label = Object.assign(document.createElement('span'), {
      className: 'tab-title',
      textContent: t.title || t.url || 'New tab'
    });

    const close = Object.assign(document.createElement('button'), { className: 'tab-close', textContent: '×', title: 'Close tab (⌘W)' });
    close.setAttribute('aria-label', 'Close tab');
    close.onclick = (e) => { e.stopPropagation(); closeTab(t.id); };

    li.onclick = () => selectTab(t.id);
    li.onauxclick = (e) => { if (e.button === 1) closeTab(t.id); };
    li.append(icon, label, close);
    return li;
  }));

  renderSpaces();
}

// ---------- Spaces ----------

function renderSpaces() {
  const buttons = state.workspaces.map((w) => {
    const b = document.createElement('button');
    b.className = 'ws' + (w.id === state.activeWsId ? ' active' : '');
    const dot = Object.assign(document.createElement('span'), { className: 'dot' });
    dot.style.background = spaceColor(w);
    b.append(dot);
    b.title = `${w.name} (right-click to delete)`;
    b.onclick = () => switchSpace(w.id);
    b.oncontextmenu = (e) => { e.preventDefault(); deleteSpace(w.id); };
    return b;
  });
  const add = Object.assign(document.createElement('button'), { className: 'ws add', textContent: '+', title: 'New space' });
  add.onclick = addSpace;
  wsBar.replaceChildren(...buttons, add);
}

function switchSpace(id) {
  state.activeWsId = id;
  save();
  showActive();
}

function addSpace() {
  const n = state.workspaces.length;
  const tab = makeTab();
  const w = { id: uid(), name: `Space ${n + 1}`, color: SPACE_COLORS[n % SPACE_COLORS.length], tabs: [tab], activeTabId: tab.id };
  state.workspaces.push(w);
  switchSpace(w.id);
}

function deleteSpace(id) {
  if (state.workspaces.length < 2) return;
  const w = state.workspaces.find((x) => x.id === id);
  const count = w.tabs.length;
  if (!confirm(`Delete the space “${w.name}” and its ${count} tab${count === 1 ? '' : 's'}?`)) return;
  for (const t of w.tabs) {
    const wv = webviews.get(t.id);
    if (wv) { wv.remove(); webviews.delete(t.id); }
  }
  state.workspaces = state.workspaces.filter((x) => x !== w);
  if (state.activeWsId === id) state.activeWsId = state.workspaces[0].id;
  save();
  showActive();
}

wsName.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); wsName.blur(); }
  if (e.key === 'Escape') { wsName.textContent = space().name; wsName.blur(); }
});
wsName.addEventListener('blur', () => {
  const name = wsName.textContent.trim();
  if (name) { space().name = name; save(); }
  renderTabs();
});

// ---------- Compact mode ----------

function setCompact(on) {
  state.compact = on;
  document.body.classList.toggle('compact', on);
  sidebar.classList.remove('peek');
  window.scope.setCompact(on);
  $('compact').title = on ? 'Show sidebar (⌘⇧S)' : 'Hide sidebar (⌘⇧S)';
  save();
}

$('hotzone').addEventListener('mouseenter', () => sidebar.classList.add('peek'));
sidebar.addEventListener('mouseleave', () => {
  if (document.activeElement !== address && document.activeElement !== wsName) sidebar.classList.remove('peek');
});

// ---------- Controls ----------

address.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const url = toUrl(address.value);
    const tab = activeTab();
    tab.url = url;
    activeView().loadURL(url);
    address.blur();
    if (state.compact) sidebar.classList.remove('peek');
  }
  if (e.key === 'Escape') { address.blur(); }
});
// Full address while editing, just the site name otherwise
address.addEventListener('focus', () => {
  address.value = activeTab().url || '';
  setTimeout(() => address.select(), 0);
});
address.addEventListener('blur', () => { address.value = prettyUrl(activeTab().url); });

$('back').onclick = () => { const wv = activeView(); if (wv && wv.canGoBack()) wv.goBack(); };
$('forward').onclick = () => { const wv = activeView(); if (wv && wv.canGoForward()) wv.goForward(); };
$('reload').onclick = () => activeView()?.reload();
$('compact').onclick = () => setCompact(!state.compact);
$('new-tab').onclick = () => { newTab(); address.focus(); };
// Starts Scope Lens on the current page (like clicking the extension in Chrome)
function startLens() {
  const wv = activeView();
  const tab = activeTab();
  if (!wv || !tab.ready || $('lens').disabled) return;
  if (state.compact) sidebar.classList.remove('peek');
  window.scope.armLens(wv.getWebContentsId());
  wv.focus();
  wv.send('scope-lens-start');
}
$('lens').onclick = startLens;

// ---------- Extensions ----------

const extMenu = $('ext-menu');
let extList = [];

function renderExtMenu() {
  const items = extList.map((ext) => {
    const b = Object.assign(document.createElement('button'), { className: 'ext-item', textContent: ext.name });
    if (ext.hasPopup) {
      b.onclick = () => { window.scope.openPopup(ext.id); extMenu.hidden = true; };
    } else {
      b.disabled = true;
      b.title = 'No popup. This extension still runs on web pages.';
    }
    return b;
  });
  if (!items.length) {
    items.push(Object.assign(document.createElement('div'), { className: 'ext-empty', textContent: 'No extensions yet' }));
  }
  const divider = Object.assign(document.createElement('div'), { className: 'ext-divider' });
  const add = Object.assign(document.createElement('button'), { className: 'ext-item', textContent: 'Add extension…' });
  add.onclick = () => { window.scope.addExtension(); extMenu.hidden = true; };
  const folder = Object.assign(document.createElement('button'), { className: 'ext-item', textContent: 'Open extensions folder' });
  folder.onclick = () => { window.scope.openExtensionsFolder(); extMenu.hidden = true; };
  extMenu.replaceChildren(...items, divider, add, folder);
}

$('ext-btn').onclick = (e) => { e.stopPropagation(); extMenu.hidden = !extMenu.hidden; };
document.addEventListener('click', (e) => { if (!e.target.closest('.ext-wrap')) extMenu.hidden = true; });

window.scope.extensions().then((list) => {
  extList = list;
  const lens = list.find((x) => x.builtIn);
  $('lens').disabled = !lens;
  renderExtMenu();
});

window.scope.onCommand((cmd, arg) => {
  switch (cmd) {
    case 'new-tab':
      newTab();
      if (state.compact) sidebar.classList.add('peek');
      address.focus();
      break;
    case 'close-tab': closeTab(space().activeTabId); break;
    case 'focus-address':
      if (state.compact) sidebar.classList.add('peek');
      address.focus();
      break;
    case 'reload': activeView()?.reload(); break;
    case 'back': $('back').click(); break;
    case 'forward': $('forward').click(); break;
    case 'next-tab': cycleTab(1); break;
    case 'prev-tab': cycleTab(-1); break;
    case 'toggle-sidebar': setCompact(!state.compact); break;
    case 'open-tab': newTab(arg); break;
    case 'lens-start': startLens(); break;
  }
});

// ---------- Start ----------

setCompact(Boolean(state.compact));
showActive();

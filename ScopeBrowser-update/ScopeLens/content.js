(() => {
  const alive = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (_) { return false; } };
  const STALE_MSG = "Scope AI was reloaded or updated. Refresh this page (F5) and try again.";
  if (window.__snapAI) {
    let ok = false;
    try { ok = !!(window.__snapAI.alive && window.__snapAI.alive()); } catch (_) {}
    if (ok) { window.__snapAI.start(); return; }
    // Leftover copy from before the extension was reloaded: its connection is dead. Discard it.
    const old = document.getElementById("snap-ai-host");
    if (old) old.remove();
    delete window.__snapAI;
  }

  const state = { b64: null, thumb: null, history: [], extra: [], busy: false };
  let host, root, overlay, panel, msgs, input, sendBtn;

  const CSS = `
  :host{all:initial}
  *{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  .overlay{position:fixed;inset:0;z-index:2147483646;cursor:crosshair;background:rgba(0,0,0,.25)}
  .sel{position:fixed;border:2px solid #4285f4;background:rgba(66,133,244,.12);box-shadow:0 0 0 9999px rgba(0,0,0,.45);display:none;pointer-events:none}
  .bar{position:fixed;top:14px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;z-index:2}
  .hint{background:#202124;color:#fff;padding:8px 14px;border-radius:999px;font-size:13px;pointer-events:none;white-space:nowrap}
  .fullbtn{border:0;background:#1a73e8;color:#fff;padding:8px 14px;border-radius:999px;font-size:13px;cursor:pointer;white-space:nowrap}
  .fullbtn:hover{background:#1765cc}
  .panel{position:fixed;top:16px;right:16px;width:390px;min-width:300px;min-height:320px;z-index:2147483647;
    display:flex;flex-direction:column;background:#fff;color:#202124;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.35);overflow:hidden;font-size:14px;line-height:1.5}
  .head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #e8eaed;background:#f8f9fa}
  .head b{font-size:14px;line-height:1.1}
  .ttl{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
  .sub{font-size:8.5px;letter-spacing:.03em;color:#5f6368;line-height:1.2}
  .sub i{font-style:normal;font-weight:700;color:#1a73e8}
  .ib{border:0;background:transparent;cursor:pointer;padding:6px 8px;border-radius:8px;font-size:13px;color:#3c4043}
  .ib:hover{background:#e8eaed}
  .logo{width:26px;height:26px;display:block;flex:none;object-fit:contain}
  .status{color:#5f6368;font-size:13px;margin-left:4px;animation:p 1.6s ease-in-out infinite}
  @keyframes p{0%,100%{opacity:1}50%{opacity:.45}}
  .thumb{padding:10px 12px 0}
  .thumb img{max-width:100%;max-height:140px;border-radius:10px;border:1px solid #e8eaed;display:block}
  .msgs{flex:1;overflow:auto;padding:10px 12px;display:flex;flex-direction:column;gap:10px;min-height:80px}
  .m{padding:8px 12px;border-radius:12px;max-width:100%;word-wrap:break-word;overflow-wrap:anywhere}
  .m.user{background:#e8f0fe;align-self:flex-end}
  .m.ai{background:#f1f3f4;align-self:stretch}
  .m.err{background:#fce8e6;color:#a50e0e;align-self:stretch}
  .m p{margin:0 0 8px}.m p:last-child{margin:0}
  .m ul,.m ol{margin:4px 0 8px;padding-left:20px}
  .m h4{margin:6px 0 4px;font-size:14px}
  .m code{background:#e0e3e7;padding:1px 4px;border-radius:4px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px}
  .m pre{background:#202124;color:#f1f3f4;padding:8px 10px;border-radius:8px;overflow:auto;margin:6px 0}
  .m pre code{background:transparent;padding:0;color:inherit}
  .chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 8px}
  .chip{border:1px solid #dadce0;background:#fff;border-radius:999px;padding:4px 10px;font-size:12px;cursor:pointer}
  .chip:hover{background:#f1f3f4}
  .row{display:flex;gap:8px;padding:10px 12px;border-top:1px solid #e8eaed}
  textarea{flex:1;resize:none;border:1px solid #dadce0;border-radius:10px;padding:8px 10px;font-size:14px;max-height:100px;outline:none}
  textarea:focus{border-color:#4285f4}
  .send{border:0;background:#1a73e8;color:#fff;border-radius:10px;padding:0 14px;cursor:pointer;font-size:14px}
  .send:disabled{opacity:.5;cursor:default}
  .attach{border:1px solid #dadce0;background:#fff;color:#5f6368;border-radius:10px;padding:0 10px;cursor:pointer;font-size:16px}
  .attach:hover{background:#f1f3f4}
  .atts{display:none;flex-wrap:wrap;gap:6px;padding:8px 12px 0;border-top:1px solid #e8eaed}
  .atts.on{display:flex}
  .att{position:relative}
  .att img{width:52px;height:52px;object-fit:cover;border-radius:8px;border:1px solid #e8eaed;display:block}
  .att button{position:absolute;top:-6px;right:-6px;width:18px;height:18px;border:0;border-radius:50%;background:#202124;color:#fff;font-size:12px;line-height:18px;padding:0;cursor:pointer}
  .m .sent{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
  .m .sent img{width:44px;height:44px;object-fit:cover;border-radius:6px;border:1px solid rgba(0,0,0,.12)}
  .dots span{display:inline-block;width:6px;height:6px;margin-right:4px;border-radius:50%;background:#80868b;animation:b 1s infinite}
  .dots span:nth-child(2){animation-delay:.15s}.dots span:nth-child(3){animation-delay:.3s}
  @keyframes b{0%,80%,100%{opacity:.25}40%{opacity:1}}
  a.lnk{color:#1a73e8;cursor:pointer;text-decoration:underline}
  .login{display:block;width:100%;height:440px;max-height:calc(100vh - 110px);border:0;background:transparent}
  .ask-hint{color:#5f6368;font-size:13px;padding:2px 2px 0}

  .chips{padding-top:2px}
  .writer{padding:0 12px 10px;border-top:1px solid #e8eaed}
  .wbtns{display:flex;gap:8px;margin-top:10px}
  .wbtns button{font:inherit;font-size:14px;border-radius:10px;cursor:pointer;padding:9px 12px;border:1px solid #c4c7c5;background:#fff;color:#202124}
  .wbtns button:hover:not(:disabled){background:#f1f3f4}
  .wbtns button:disabled{opacity:.45;cursor:default}
  .wbtns .wgo{flex:1;border:0;background:#1a73e8;color:#fff;font-weight:600;line-height:1.25}
  .wbtns .wgo:hover:not(:disabled){background:#1765cc}
  .wbtns .wgo.stop{background:#d93025}
  .wspeed{display:flex;align-items:center;gap:10px;margin-top:10px;font-size:13px;color:#5f6368;white-space:nowrap}
  .wspeed b{color:#3c4043}
  .wspeed input{flex:1;min-width:0;accent-color:#1a73e8}
  .wstat{margin-top:6px;font-size:12px;color:#5f6368;min-height:16px}
  .wstat.err{color:#a50e0e}
  .pickbar{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:2147483646;background:#202124;color:#fff;padding:8px 14px;border-radius:999px;font-size:13px;pointer-events:none;white-space:nowrap}
  .hl{position:fixed;z-index:2147483645;pointer-events:none;border:2px solid #1a73e8;background:rgba(26,115,232,.12);border-radius:4px;display:none}
  .head{cursor:grab;user-select:none;-webkit-user-select:none;touch-action:none}
  .head .ib{cursor:pointer}
  .ib svg{display:block;pointer-events:none}
  .panel.docked{border-radius:0;box-shadow:0 0 14px rgba(0,0,0,.28)}
  .panel.docked.dr{border-left:1px solid #dadce0}.panel.docked.dl{border-right:1px solid #dadce0}
  .panel.fixedh .login{flex:1;height:auto;max-height:none;min-height:0}
  .panel.busy,.panel.busy .head{user-select:none;-webkit-user-select:none}
  .panel.busy .head{cursor:grabbing}
  .panel.busy iframe{pointer-events:none}
  .rz{position:absolute;z-index:6;touch-action:none}
  .rz[data-d="n"]{top:0;left:14px;right:14px;height:6px;cursor:ns-resize}
  .rz[data-d="s"]{bottom:0;left:14px;right:14px;height:6px;cursor:ns-resize}
  .rz[data-d="e"]{right:0;top:14px;bottom:14px;width:6px;cursor:ew-resize}
  .rz[data-d="w"]{left:0;top:14px;bottom:14px;width:6px;cursor:ew-resize}
  .rz[data-d="ne"]{top:0;right:0;width:14px;height:14px;cursor:nesw-resize}
  .rz[data-d="sw"]{bottom:0;left:0;width:14px;height:14px;cursor:nesw-resize}
  .rz[data-d="nw"]{top:0;left:0;width:14px;height:14px;cursor:nwse-resize}
  .rz[data-d="se"]{bottom:0;right:0;width:14px;height:14px;cursor:nwse-resize}
  .panel.docked .rz{display:none}
  .panel.docked.dr .rz[data-d="w"]{display:block;top:0;bottom:0;width:7px}
  .panel.docked.dl .rz[data-d="e"]{display:block;top:0;bottom:0;width:7px}
  .panel.docked .rz[data-d]:hover{background:rgba(66,133,244,.45)}
  .dz{position:fixed;top:0;bottom:0;z-index:2147483646;display:none;background:rgba(66,133,244,.16);border:2px dashed #4285f4;pointer-events:none}
  @media (prefers-color-scheme:dark){.panel.docked.dr{border-color:#3c4043}.panel.docked.dl{border-color:#3c4043}}
  @media (prefers-color-scheme:dark){
    .writer{border-color:#3c4043}.wbtns button{background:#292a2d;color:#e8eaed;border-color:#5f6368}.wbtns button:hover:not(:disabled){background:#3c4043}
    .wbtns .wgo{background:#1a73e8;color:#fff;border:0}.wspeed,.wstat{color:#9aa0a6}.wspeed b{color:#e8eaed}.wstat.err{color:#f6aea9}
  }
  @media (prefers-color-scheme:dark){
    .panel{background:#202124;color:#e8eaed}.head{background:#292a2d;border-color:#3c4043}.ib{color:#bdc1c6}.ib:hover{background:#3c4043}
    .thumb img{border-color:#3c4043}.m.user{background:#2b3a55}.m.ai{background:#2d2e31}.m.err{background:#4a1f1d;color:#f6aea9}
    .m code{background:#3c4043}.chip{background:#292a2d;border-color:#3c4043;color:#e8eaed}.chip:hover{background:#3c4043}
    .row{border-color:#3c4043}textarea{background:#292a2d;color:#e8eaed;border-color:#3c4043}.status{color:#9aa0a6}.ask-hint{color:#9aa0a6}.sub{color:#9aa0a6}.sub i{color:#8ab4f8}
  }`;

  function md(src) {
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const blocks = [];
    src = src.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, l, c) => {
      blocks.push("<pre><code>" + esc(c.trim()) + "</code></pre>");
      return "\u0000" + (blocks.length - 1) + "\u0000";
    });
    let out = esc(src)
      .replace(/`([^`\n]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
      .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?]|$)/g, "$1<i>$2</i>");
    let html = "", list = null;
    const close = () => { if (list) { html += `</${list}>`; list = null; } };
    for (const ln of out.split("\n")) {
      let m;
      if ((m = ln.match(/^\s*[-*•]\s+(.*)/))) { if (list !== "ul") { close(); html += "<ul>"; list = "ul"; } html += "<li>" + m[1] + "</li>"; }
      else if ((m = ln.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== "ol") { close(); html += "<ol>"; list = "ol"; } html += "<li>" + m[1] + "</li>"; }
      else if ((m = ln.match(/^#{1,6}\s+(.*)/))) { close(); html += "<h4>" + m[1] + "</h4>"; }
      else if (!ln.trim()) close();
      else { close(); html += "<p>" + ln + "</p>"; }
    }
    close();
    return html.replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[i]);
  }

  function ensureHost() {
    if (host && host.isConnected) return;
    host = document.createElement("div");
    host.id = "snap-ai-host";
    root = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = CSS;
    root.appendChild(style);
    document.documentElement.appendChild(host);
    // Squeeze the page when a docked panel appears, and give it back when the panel goes away.
    new MutationObserver(() => syncSqueeze()).observe(root, { childList: true });
  }

  async function start() {
    let st = {};
    try { st = await chrome.runtime.sendMessage({ type: "auth:status" }) || {}; }
    catch (e) { ensureHost(); openPanel(null); addMsg("err", alive() ? "Extension error: " + e.message : STALE_MSG); return; }
    // Not signed in, no Scope Max plan, or no key: the panel shows the right screen.
    if (!st.signedIn || !st.hasAccess || !st.hasKey) { showSetup(); return; }
    beginSelect();
  }

  // Sign-in and settings live in an extension page inside an iframe in the panel,
  // so the website can't read your password or key.
  let setupPanel = null, chatHidden = false;
  function showSetup(note) {
    ensureHost();
    host.style.display = "";
    if (overlay) { overlay.remove(); overlay = null; }
    if (setupPanel) setupPanel.remove();
    chatHidden = !!(panel && state.b64);
    if (panel) { if (chatHidden) panel.style.display = "none"; else { panel.remove(); panel = null; } }
    setupPanel = document.createElement("div");
    setupPanel.className = "panel";
    setupPanel.innerHTML = `
      <div class="head"><img class="logo" alt=""><div class="ttl"><b>Scope AI</b><span class="sub"><i>S</i>patial <i>C</i>ognition &amp; <i>O</i>ptical <i>P</i>rocessing <i>E</i>ngine</span></div><button class="ib" data-a="dock"></button><button class="ib" data-a="close">✕</button></div>
      ${note ? '<div class="m err" style="margin:10px 12px 0"></div>' : ""}
      <iframe class="login" title="Scope AI sign in and settings"></iframe>`;
    try { setupPanel.querySelector(".logo").src = chrome.runtime.getURL("icons/icon128.png"); } catch (_) {}
    if (note) setupPanel.querySelector(".m.err").textContent = note;
    setupPanel.querySelector(".login").src = chrome.runtime.getURL("setup.html");
    setupPanel.addEventListener("click", (e) => {
      const a = e.target.dataset && e.target.dataset.a;
      if (a === "close") closeSetup(false);
      if (a === "dock") toggleDock();
    });
    wirePanel(setupPanel);
    root.appendChild(setupPanel);
  }
  function closeSetup(done) {
    if (setupPanel) { setupPanel.remove(); setupPanel = null; }
    if (panel && chatHidden) {
      panel.style.display = "";
      chatHidden = false;
      if (input) input.focus();
    } else if (done) {
      beginSelect();
    }
  }
  // The settings page tells us (through the background) when you press "Save & start".
  chrome.runtime.onMessage.addListener((m) => {
    if (m && m.type === "scope:setup-done") closeSetup(true);
    if (m && m.type === "scope:signed-out") {
      if (panel) { panel.remove(); panel = null; }
      chatHidden = false;
      state.b64 = null; state.history = []; state.extra = [];
      if (!setupPanel) showSetup();
    }
  });

  function beginSelect() {
    ensureHost();
    host.style.display = "";
    if (overlay) overlay.remove();
    overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.innerHTML = '<div class="sel"></div><div class="bar"><div class="hint">Drag to select an area · Esc to cancel</div><button class="fullbtn" type="button">⛶ Whole screen (Enter)</button></div>';
    root.appendChild(overlay);
    const sel = overlay.querySelector(".sel");
    let sx, sy, dragging = false;

    const rectOf = (x, y) => ({
      x: Math.min(sx, x), y: Math.min(sy, y), w: Math.abs(x - sx), h: Math.abs(y - sy)
    });
    const cancel = () => {
      overlay && overlay.remove(); overlay = null;
      window.removeEventListener("keydown", onKey, true);
    };
    const full = () => { cancel(); snap({ x: 0, y: 0, w: window.innerWidth, h: window.innerHeight }); };
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); cancel(); }
      else if (e.key === "Enter" && !dragging) { e.preventDefault(); full(); }
    };
    window.addEventListener("keydown", onKey, true);
    const fullBtn = overlay.querySelector(".fullbtn");
    fullBtn.addEventListener("mousedown", (e) => e.stopPropagation());
    fullBtn.addEventListener("mouseup", (e) => e.stopPropagation());
    fullBtn.addEventListener("click", (e) => { e.stopPropagation(); full(); });

    overlay.addEventListener("mousedown", (e) => {
      e.preventDefault(); dragging = true; sx = e.clientX; sy = e.clientY;
      Object.assign(sel.style, { display: "block", left: sx + "px", top: sy + "px", width: "0px", height: "0px" });
      overlay.style.background = "transparent";
    });
    overlay.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const r = rectOf(e.clientX, e.clientY);
      Object.assign(sel.style, { left: r.x + "px", top: r.y + "px", width: r.w + "px", height: r.h + "px" });
    });
    overlay.addEventListener("mouseup", async (e) => {
      if (!dragging) return;
      dragging = false;
      const r = rectOf(e.clientX, e.clientY);
      cancel();
      if (r.w < 8 || r.h < 8) return;
      await snap(r);
    });
  }

  async function snap(r) {
    try {
      // hide our UI so it isn't in the screenshot
      host.style.display = "none";
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      await new Promise((res) => setTimeout(res, 80));
      let cap;
      try { cap = await chrome.runtime.sendMessage({ type: "capture" }); }
      catch (e) { cap = { error: alive() ? e.message : STALE_MSG }; }
      host.style.display = "";
      if (!cap || !cap.dataUrl) {
        openPanel(null);
        addMsg("err", "Couldn't capture the page: " + ((cap && cap.error) || "unknown error"));
        return;
      }
      const bmp = await createImageBitmap(await (await fetch(cap.dataUrl)).blob());
      const k = bmp.width / window.innerWidth;
      const cw = Math.max(1, Math.round(r.w * k)), ch = Math.max(1, Math.round(r.h * k));
      const sc = Math.min(1, 1800 / Math.max(cw, ch)); // keep the upload small so answers start sooner
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(cw * sc)); canvas.height = Math.max(1, Math.round(ch * sc));
      canvas.getContext("2d").drawImage(bmp, Math.round(r.x * k), Math.round(r.y * k), cw, ch, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL("image/jpeg", 0.85);
      state.b64 = url.split(",")[1];
      state.thumb = url;
      state.history = []; state.lastAnswer = ""; state.extra = [];
      openPanel(url);
      const h = document.createElement("div");
      h.className = "ask-hint";
      h.textContent = "Type your question about this selection below.";
      msgs.appendChild(h);
    } catch (e) {
      host.style.display = "";
      openPanel(null);
      addMsg("err", "Snap failed: " + e.message);
    } finally {
      if (host) host.style.display = "";
    }
  }

  function openPanel(thumbUrl) {
    ensureHost();
    if (panel) panel.remove();
    panel = document.createElement("div");
    panel.className = "panel";
    panel.innerHTML = `
      <div class="head"><img class="logo" alt=""><div class="ttl"><b>Scope AI</b><span class="sub"><i>S</i>patial <i>C</i>ognition &amp; <i>O</i>ptical <i>P</i>rocessing <i>E</i>ngine</span></div><button class="ib" data-a="new">⌖ New</button><button class="ib" data-a="settings" title="Account and settings">⚙</button><button class="ib" data-a="dock"></button><button class="ib" data-a="close">✕</button></div>
      ${thumbUrl ? '<div class="thumb"><img alt="selection"></div>' : ""}
      <div class="msgs"></div>
      <div class="chips">
        <button class="chip" data-chip="explain">Explain this</button>
        <button class="chip" data-chip="solve">Solve / answer it</button>
        <button class="chip" data-chip="buy">Where can I buy this?</button>
      </div>
      <div class="writer">
        <div class="wbtns">
          <button class="wgo" data-a="write" disabled>Write answer in page</button>
          <button class="wpause" data-a="pause" disabled>Pause</button>
          <button class="wpick" data-a="pick">Choose answer field</button>
        </div>
        <div class="wspeed"><span>Typing speed: <b class="wv">30 WPM</b></span><input class="wrange" type="range" min="5" max="1500" step="5" value="30" aria-label="Typing speed in words per minute"></div>
        <div class="wstat"></div>
      </div>
      <div class="atts"></div>
      <div class="row"><button class="attach" type="button" title="Add images" aria-label="Add images">&#128206;</button><input class="file" type="file" accept="image/*" multiple style="display:none"><textarea rows="1" placeholder="Ask a question about this…"></textarea><button class="send">Send</button></div>`;
    try { panel.querySelector(".logo").src = chrome.runtime.getURL("icons/icon128.png"); } catch (_) {}
    if (thumbUrl) panel.querySelector(".thumb img").src = thumbUrl;
    msgs = panel.querySelector(".msgs");
    input = panel.querySelector("textarea");
    sendBtn = panel.querySelector(".send");
    panel.addEventListener("click", (e) => {
      const a = e.target.dataset && e.target.dataset.a;
      if (a === "close") { writerStop(true); panel.remove(); panel = null; }
      if (a === "new") { writerStop(true); panel.remove(); panel = null; start(); }
      if (a === "settings") showSetup();
      if (a === "dock") toggleDock();
      if (a === "write") (W.running ? writerStop(false) : writerStart());
      if (a === "pause") writerPause();
      if (a === "pick") pickField();
      const chip = e.target.dataset && e.target.dataset.chip;
      if (chip && state.b64 && !state.busy) ask(CHIPS[chip].prompt, CHIPS[chip].label);
    });
    // Keep keyboard focus in the page's text field when pressing writer buttons.
    panel.querySelector(".writer").addEventListener("mousedown", (e) => { if (e.target.tagName === "BUTTON") e.preventDefault(); });
    const range = panel.querySelector(".wrange");
    range.addEventListener("input", () => { setWpm(Number(range.value)); });
    range.addEventListener("change", () => { chrome.storage.local.set({ wpm: W.wpm }).catch(() => {}); writerRefocus(); });
    chrome.storage.local.get("wpm").then((v) => { if (v && v.wpm) { setWpm(Number(v.wpm)); range.value = W.wpm; } }).catch(() => {});
    updateWriter();
    sendBtn.addEventListener("click", submit);
    const fileIn = panel.querySelector(".file"), attsEl = panel.querySelector(".atts");
    panel.querySelector(".attach").addEventListener("click", () => fileIn.click());
    fileIn.addEventListener("change", async () => { await addImages(fileIn.files); fileIn.value = ""; });
    attsEl.addEventListener("click", (e) => {
      const i = e.target.dataset && e.target.dataset.rm;
      if (i != null) { state.extra.splice(Number(i), 1); renderAtts(); }
    });
    input.addEventListener("paste", (e) => {
      const files = [...((e.clipboardData && e.clipboardData.files) || [])].filter((f) => f.type.startsWith("image/"));
      if (files.length) { e.preventDefault(); addImages(files); }
    });
    panel.addEventListener("dragover", (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) e.preventDefault(); });
    panel.addEventListener("drop", (e) => {
      const files = [...((e.dataTransfer && e.dataTransfer.files) || [])].filter((f) => f.type.startsWith("image/"));
      if (files.length) { e.preventDefault(); addImages(files); }
    });
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
    });
    input.addEventListener("keyup", (e) => e.stopPropagation());
    input.addEventListener("keypress", (e) => e.stopPropagation());
    input.addEventListener("input", () => { input.style.height = "auto"; input.style.height = Math.min(100, input.scrollHeight) + "px"; });
    wirePanel(panel);
    root.appendChild(panel);
    input.focus();
  }

  // ---- Extra images (add as many as you like, after the page scan) ----
  const MAX_EXTRA = 8;
  function renderAtts() {
    const el = panel && panel.querySelector(".atts");
    if (!el) return;
    el.innerHTML = "";
    state.extra.forEach((a, i) => {
      const d = document.createElement("div"); d.className = "att";
      const im = document.createElement("img"); im.src = a.url;
      const x = document.createElement("button"); x.textContent = "\u00d7"; x.dataset.rm = i; x.title = "Remove"; x.type = "button";
      d.append(im, x); el.appendChild(d);
    });
    el.classList.toggle("on", state.extra.length > 0);
  }
  async function addImages(files) {
    for (const f of [...files]) {
      if (!f.type.startsWith("image/")) continue;
      if (state.extra.length >= MAX_EXTRA) { addMsg("err", "You can add up to " + MAX_EXTRA + " images per message."); break; }
      try {
        const bmp = await createImageBitmap(f);
        const sc = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(bmp.width * sc)); c.height = Math.max(1, Math.round(bmp.height * sc));
        const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
        const url = c.toDataURL("image/jpeg", 0.85);
        state.extra.push({ url, b64: url.split(",")[1] });
      } catch (_) { addMsg("err", "Couldn't read " + (f.name || "that image") + "."); }
    }
    renderAtts();
  }

  function addMsg(kind, text) {
    const d = document.createElement("div");
    d.className = "m " + kind;
    if (kind === "ai") d.innerHTML = md(text); else d.textContent = text;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
    return d;
  }

  function submit() {
    const t = input.value.trim();
    if (!t) return;
    input.value = ""; input.style.height = "auto";
    ask(t);
  }

  // One attempt over a port. Pings the background every 10s so Chrome doesn't put the
  // service worker to sleep mid-answer (the cause of "Lost connection").
  function askOnce(contents, onDelta) {
    return new Promise((resolve) => {
      let port, finished = false, got = false, ping = 0;
      const stop = () => { if (ping) clearInterval(ping); ping = 0; };
      try { port = chrome.runtime.connect({ name: "ask" }); }
      catch (e) { return resolve({ error: "EXT", message: alive() ? "Extension error: " + e.message : STALE_MSG }); }
      port.onMessage.addListener((m) => {
        if (m.type === "delta") { got = true; onDelta(m.text); }
        else if (m.type === "done") { finished = true; stop(); resolve(m.result); }
      });
      port.onDisconnect.addListener(() => {
        stop();
        if (!finished) resolve({ error: "EXT", lost: true, got, message: alive() ? "Lost connection to the extension. Try again." : STALE_MSG });
      });
      try { port.postMessage({ contents }); }
      catch (e) { stop(); return resolve({ error: "EXT", lost: alive(), message: alive() ? "Extension error: " + e.message : STALE_MSG }); }
      ping = setInterval(() => { try { port.postMessage({ type: "ping" }); } catch (_) { stop(); } }, 10000);
    });
  }

  // If the connection drops (service worker restarted), wake it up and retry automatically.
  async function askStream(contents, onDelta, onReset) {
    let r;
    for (let attempt = 0; attempt < 3; attempt++) {
      r = await askOnce(contents, onDelta);
      if (!(r && r.lost) || !alive()) return r;
      if (onReset) onReset();
      try { await chrome.runtime.sendMessage({ type: "ping" }); } catch (_) {}
      await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
    }
    return r;
  }

  async function ask(text, label) {
    if (state.busy || !state.b64) return;
    state.busy = true; sendBtn.disabled = true;
    const hint = msgs.querySelector(".ask-hint");
    if (hint) hint.remove();
    const um = addMsg("user", label || text);
    const sentImgs = state.extra; state.extra = []; renderAtts();
    if (sentImgs.length) {
      const row = document.createElement("div"); row.className = "sent";
      sentImgs.forEach((a) => { const im = document.createElement("img"); im.src = a.url; row.appendChild(im); });
      um.appendChild(row);
    }
    const parts = [{ text }];
    sentImgs.slice().reverse().forEach((a) => parts.unshift({ inline_data: { mime_type: "image/jpeg", data: a.b64 } }));
    if (state.history.length === 0) parts.unshift({ inline_data: { mime_type: "image/jpeg", data: state.b64 } });
    state.history.push({ role: "user", parts });
    const loading = document.createElement("div");
    loading.className = "m ai";
    loading.innerHTML = '<span class="dots"><span></span><span></span><span></span></span><span class="status">Thinking…</span>';
    msgs.appendChild(loading);
    msgs.scrollTop = msgs.scrollHeight;
    const STAGES = ["Thinking…", "Looking at the image…", "Reading the details…", "Working it out…", "Putting the answer together…"];
    const statusEl = loading.querySelector(".status");
    let si = 0;
    const stageTimer = setInterval(() => {
      si = Math.min(si + 1, STAGES.length - 1);
      statusEl.textContent = STAGES[si];
    }, 2000);

    // Show the answer as it streams in
    let live = null, acc = "", raf = 0;
    const paint = () => { raf = 0; if (live) { live.innerHTML = md(acc); msgs.scrollTop = msgs.scrollHeight; } };
    const resp = await askStream(state.history, (t) => {
      acc += t;
      if (!live) {
        clearInterval(stageTimer);
        loading.remove();
        live = document.createElement("div");
        live.className = "m ai";
        msgs.appendChild(live);
      }
      if (!raf) raf = requestAnimationFrame(paint);
    }, () => { acc = ""; if (live) live.innerHTML = ""; });
    if (raf) cancelAnimationFrame(raf);
    clearInterval(stageTimer);
    loading.remove();

    if (resp && resp.text) {
      if (live) live.innerHTML = md(resp.text); else addMsg("ai", resp.text);
      state.history.push({ role: "model", parts: [{ text: resp.text }] });
      state.lastAnswer = resp.text;
      updateWriter();
      msgs.scrollTop = msgs.scrollHeight;
      if (resp.note) {
        const n = document.createElement("div");
        n.style.cssText = "font-size:11px;opacity:.6;margin-top:-4px";
        n.textContent = resp.note;
        msgs.appendChild(n);
      }
    } else {
      if (live) live.remove();
      state.history.pop(); // let the user retry this turn
      state.extra = sentImgs.concat(state.extra); renderAtts();
      if (resp && (resp.error === "NO_AUTH" || resp.error === "NO_TIER")) {
        state.busy = false;
        sendBtn.disabled = false;
        showSetup(resp.error === "NO_AUTH" ? resp.message : null);
        return;
      }
      const d = addMsg("err", (resp && resp.message) || "Something went wrong.");
      if (resp && (resp.error === "NO_KEY" || resp.error === "BAD_KEY" || resp.error === "NO_PLAN")) {
        const a = document.createElement("a");
        a.className = "lnk"; a.textContent = " Open settings";
        a.onclick = () => showSetup();
        d.appendChild(a);
      }
    }
    state.busy = false; sendBtn.disabled = false;
    input && input.focus();
  }


  /* ===================== Write the answer into the page ===================== */
  const CHIPS = {
    explain: { label: "Explain this", prompt: "Explain what this is." },
    solve: { label: "Solve / answer it", prompt: "Solve this or answer the question shown. Reply with ONLY the final answer as plain text, ready to paste into a document: no preamble, no markdown, no explanation." },
    buy: { label: "Where can I buy this?", prompt: "Identify the product shown and say where it can usually be bought, with typical retailers and a rough price range if you know it. Don't invent exact links." }
  };
  const W = { target: null, docs: false, free: false, focusEl: null, label: "", text: "", pos: 0, running: false, paused: false, wpm: 30, owed: 0, last: 0, gen: 0, useDbg: false, picking: null, code: false, api: null, prevLine: "", line: "", fresh: true };
  const isDocsHost = () => location.hostname === "docs.google.com";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $w = (s) => panel && panel.querySelector(s);

  function plain(md) {
    return String(md || "")
      .replace(/\r\n?/g, "\n")
      .replace(/[\u200B\uFEFF\u00A0]/g, (c) => (c === "\u00A0" ? " " : ""))
      .replace(/```[\w-]*\n?([\s\S]*?)```/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?]|$)/g, "$1$2")
      .replace(/`([^`\n]+)`/g, "$1")
      .replace(/__([^_\n]+)__/g, "$1")
      .replace(/\[([^\]\n]+)\]\((https?:[^)\s]+)\)/g, "$1 ($2)")
      .replace(/^\s{0,3}>\s?/gm, "")
      .replace(/^\s*[*•]\s+/gm, "- ")
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  function setWpm(n) {
    W.wpm = Math.max(5, Math.min(1500, Math.round(n) || 30));
    const v = $w(".wv"); if (v) v.textContent = W.wpm + " WPM";
  }
  function wstat(t, err) { const s = $w(".wstat"); if (s) { s.textContent = t || ""; s.className = "wstat" + (err ? " err" : ""); } }
  function updateWriter() {
    if (!panel) return;
    const has = !!state.lastAnswer, ready = !!(W.target || W.docs || W.free);
    const go = $w(".wgo"), pa = $w(".wpause");
    go.disabled = W.running ? false : !(has && ready);
    go.textContent = W.running ? "Stop" : "Write answer in page";
    go.classList.toggle("stop", W.running);
    pa.disabled = !W.running;
    pa.textContent = W.paused ? "Resume" : "Pause";
    if (W.running) return;
    if (!ready) wstat("Choose a writable field on the page before inserting an answer.");
    else if (!has) wstat("Field chosen (" + W.label + "). Ask a question first. The answer is what gets typed.");
    else wstat("Ready to type into: " + W.label + "." + (W.free || W.docs ? " Make sure your cursor is blinking where you want it (in Slides, double-click into the text box first)." : ""));
  }

  // ---- choosing the field ----
  function editableOf(el) {
    try {
      const root = el && el.closest && el.closest(CODE_ROOT);
      if (root) {
        const inp = root.querySelector("textarea.inputarea, .native-edit-context, textarea.ace_text-input, .CodeMirror textarea, .cm-content, textarea, [contenteditable='true']");
        if (inp) return inp;
      }
    } catch (_) {}
    for (let n = el; n && n.nodeType === 1; n = n.parentElement || (n.getRootNode && n.getRootNode().host) || null) {
      const t = n.tagName;
      if (t === "TEXTAREA") return n.disabled || n.readOnly ? null : n;
      if (t === "INPUT") {
        const ty = (n.type || "text").toLowerCase();
        // Include text-like and specialized input fields, while excluding controls
        // that are not intended to receive typed text.
        const nonText = ["button", "checkbox", "radio", "submit", "reset", "image", "file", "hidden", "range"];
        return !n.disabled && !n.readOnly && !nonText.includes(ty) ? n : null;
      }
      if (n.isContentEditable) { while (n.parentElement && n.parentElement.isContentEditable) n = n.parentElement; return n; }
      if (n.getAttribute) {
        const role = n.getAttribute("role");
        if (["textbox", "searchbox", "combobox"].includes(role) || n.getAttribute("aria-multiline") === "true") return n;
      }
      // Common custom rich-text editors that do not consistently expose role=textbox.
      if (n.matches && n.matches("[data-lexical-editor='true'], .ProseMirror, .ql-editor, .tiptap, [contenteditable='true']")) return n;
    }
    return null;
  }
  function absRect(el) {
    const r = el.getBoundingClientRect(); let x = r.left, y = r.top;
    let w = el.ownerDocument.defaultView;
    while (w && w.frameElement) { const f = w.frameElement.getBoundingClientRect(); x += f.left; y += f.top; w = w.frameElement.ownerDocument.defaultView; }
    return { x, y, w: r.width, h: r.height };
  }
  function labelOf(el) {
    if (!el) return "Google Docs";
    const n = el.getAttribute && (el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.name || el.id);
    return (n ? n.slice(0, 40) + " " : "") + "(" + (el.tagName === "TEXTAREA" || el.tagName === "INPUT" ? "text box" : "editor") + ")";
  }
  function framesWindows(win, out, depth) {
    out.push(win);
    if (depth > 3) return out;
    let frames = [];
    try { frames = win.document.querySelectorAll("iframe,frame"); } catch (_) {}
    for (const f of frames) { try { if (f.contentWindow && f.contentDocument) framesWindows(f.contentWindow, out, depth + 1); } catch (_) {} }
    return out;
  }
  function pickField() {
    if (W.picking) { W.picking(); return; }
    if (W.running) writerStop(false);
    ensureHost();
    const bar = document.createElement("div"); bar.className = "pickbar";
    bar.textContent = "Click where the answer should go (text box, Docs, Slides, any editor) · Esc to cancel";
    const hl = document.createElement("div"); hl.className = "hl";
    root.appendChild(bar); root.appendChild(hl);
    const wins = framesWindows(window, [], 0);
    const pick = $w('[data-a="pick"]'); if (pick) pick.textContent = "Cancel";
    const done = () => {
      for (const w of wins) for (const t of ["mousemove", "mousedown", "click", "keydown"]) { try { w.removeEventListener(t, handlers[t], true); } catch (_) {} }
      bar.remove(); hl.remove(); W.picking = null;
      const p = $w('[data-a="pick"]'); if (p) p.textContent = "Choose answer field";
    };
    const real = (e) => (e.composedPath ? e.composedPath()[0] : e.target);
    const handlers = {
      mousemove(e) {
        const el = real(e);
        if (!el || el === host) { hl.style.display = "none"; return; }
        const t = editableOf(el) || el;
        const r = absRect(t);
        Object.assign(hl.style, { display: "block", left: r.x + "px", top: r.y + "px", width: r.w + "px", height: r.h + "px" });
      },
      mousedown(e) {
        const el = real(e);
        if (!el || el === host || (e.target === host)) return; // clicks on our own panel
        const ed = editableOf(el);
        if (!isDocsHost() && !ed && el.closest && el.closest("a[href],button,[role=button],summary")) {
          // don't trigger links or buttons while choosing
          e.preventDefault(); e.stopPropagation(); bar.textContent = "Click in the text area, not a link or button."; return;
        }
        // Preserve the original broad picker behavior: a page area can be selected
        // even when it is not a standard input. Firefox can type natively into the
        // editable targets above; canvas/non-editable surfaces remain selection-only.
        W.docs = false;
        W.target = ed || null;
        W.free = !W.target;
        W.useDbg = false;
        W.label = W.target ? labelOf(W.target) : "selected page area (native typing where supported)";
        W.focusEl = null;
        done(); updateWriter(); // the click itself still goes through, so the cursor lands where you clicked
        setTimeout(() => {
          let a = document.activeElement;
          while (a && (a.tagName === "IFRAME" || a.tagName === "FRAME")) { try { if (!a.contentDocument || !a.contentDocument.activeElement) break; a = a.contentDocument.activeElement; } catch (_) { break; } }
          if (a && a !== document.body && a !== host) W.focusEl = a;
        }, 200);
      },
      click(e) {
        const el = real(e);
        if (el && el !== host && e.target !== host && !isDocsHost() && !editableOf(el) && el.closest && el.closest("a[href],button,[role=button],summary")) { e.preventDefault(); e.stopPropagation(); }
      },
      keydown(e) { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(); } }
    };
    for (const w of wins) for (const t of Object.keys(handlers)) { try { w.addEventListener(t, handlers[t], true); } catch (_) {} }
    W.picking = done;
  }

  // ---- typing ----
  function writerRefocus() {
    try {
      if (W.focusEl && W.focusEl.isConnected && !W.target) { W.focusEl.focus({ preventScroll: true }); return; }
      if (W.docs) {
        const f = document.querySelector(".docs-texteventtarget-iframe");
        const b = f && f.contentDocument && (f.contentDocument.querySelector("[contenteditable]") || f.contentDocument.body);
        if (b) b.focus();
        return;
      }
      const el = W.target; if (!el || !el.isConnected) return;
      const doc = el.ownerDocument;
      if (doc.activeElement === el || (el.contains && el.contains(doc.activeElement))) return;
      el.focus({ preventScroll: true });
      if (el.isContentEditable) {
        const s = doc.getSelection();
        if (!s.rangeCount || !el.contains(s.anchorNode)) { const r = doc.createRange(); r.selectNodeContents(el); r.collapse(false); s.removeAllRanges(); s.addRange(r); }
      }
    } catch (_) {}
  }
  const CODE_SEL = ".ace_text-input,textarea[spellcheck='false'][autocapitalize='off'],.monaco-editor,.cm-editor,.CodeMirror,.ace_editor,.view-lines,[data-language],[class*='code-editor'],[class*='CodeEditor']";
  function isCodeEditor(el) { try { return !!(el && el.closest && el.closest(CODE_SEL)); } catch (_) { return false; } }
  const CODE_ROOT = ".monaco-editor,.ace_editor,.CodeMirror,.cm-editor";
  // ---- Direct editor access (exact formatting) ----
  // Firefox lets content scripts reach the page's own editor object through wrappedJSObject. Inserting through the
  // editor's API skips auto-indent, auto-closing brackets and Enter handling entirely, so the code lands exactly as written.
  function editorApi(el) {
    try {
      const root = el && el.closest && el.closest(CODE_ROOT);
      if (!root || !root.wrappedJSObject) return null;
      const win = root.ownerDocument.defaultView, pw = win.wrappedJSObject;
      const clone = (o) => (typeof cloneInto === "function" ? cloneInto(o, win) : o);
      if (root.classList.contains("CodeMirror")) { // CodeMirror 5
        const cm = root.wrappedJSObject.CodeMirror;
        if (cm && cm.replaceSelection) return { name: "CodeMirror", insert(t) { cm.replaceSelection(t); try { cm.scrollIntoView(); } catch (_) {} } };
      }
      if (root.classList.contains("cm-editor")) { // CodeMirror 6
        const c = root.querySelector(".cm-content"), cv = c && c.wrappedJSObject && (c.wrappedJSObject.cmView || c.wrappedJSObject.cmTile);
        const view = cv && (cv.view || (cv.rootView && cv.rootView.view) || (cv.root && cv.root.view));
        if (view && view.dispatch) return { name: "CodeMirror 6", insert(t) { view.dispatch(view.state.replaceSelection(t)); try { view.dispatch(clone({ scrollIntoView: true })); } catch (_) {} } };
      }
      if (root.classList.contains("ace_editor")) { // Ace
        let ed = root.wrappedJSObject.env && root.wrappedJSObject.env.editor;
        if (!ed && pw.ace && pw.ace.edit) { try { ed = pw.ace.edit(root); } catch (_) {} }
        if (ed && ed.session) return { name: "Ace", insert(t) {
          const end = ed.session.insert(ed.getCursorPosition(), t);
          try { ed.clearSelection(); } catch (_) {}
          ed.moveCursorToPosition(end);
          try { ed.renderer.scrollCursorIntoView(); } catch (_) {}
        } };
      }
      if (root.classList.contains("monaco-editor")) { // Monaco (only when the page exposes window.monaco)
        const m = pw.monaco && pw.monaco.editor;
        const eds = m && m.getEditors ? Array.from(m.getEditors()) : [];
        const ed = eds.find((e) => { try { const n = e.getDomNode(); return n === root.wrappedJSObject || root.contains(n) || (n && n.contains(root)); } catch (_) { return false; } });
        if (ed) return { name: "Monaco", insert(t) {
          const s = ed.getSelection();
          const range = { startLineNumber: s.startLineNumber, startColumn: s.startColumn, endLineNumber: s.endLineNumber, endColumn: s.endColumn };
          ed.executeEdits("scope-ai", clone([{ range, text: t, forceMoveMarkers: true }]));
          const lines = t.split("\n"), line = s.startLineNumber + lines.length - 1;
          const column = lines.length > 1 ? lines[lines.length - 1].length + 1 : s.startColumn + t.length;
          ed.setPosition(clone({ lineNumber: line, column }));
          try { ed.revealPosition(clone({ lineNumber: line, column })); } catch (_) {}
        } };
      }
    } catch (_) {}
    return null;
  }
  // ---- Fallback: read the editor's real indentation after each Enter and correct it ----
  function caretLineText(el) {
    try {
      const root = el.closest && el.closest(CODE_ROOT); if (!root) return null;
      if (root.classList.contains("cm-editor")) {
        const s = el.ownerDocument.getSelection(), n = s && s.anchorNode;
        const ln = n && (n.nodeType === 1 ? n : n.parentElement); const line = ln && ln.closest(".cm-line");
        return line ? line.textContent : null;
      }
      const cur = Array.from(root.querySelectorAll(".cursors-layer .cursor, .ace_cursor-layer .ace_cursor, .CodeMirror-cursors .CodeMirror-cursor"))
        .find((c) => c.getBoundingClientRect().height > 0);
      if (!cur) return null;
      const cr = cur.getBoundingClientRect(), y = cr.top + cr.height / 2;
      for (const l of root.querySelectorAll(".view-lines .view-line, .ace_text-layer .ace_line, .CodeMirror-code pre.CodeMirror-line")) {
        const r = l.getBoundingClientRect();
        if (r.height > 0 && y >= r.top && y < r.bottom) return l.textContent.replace(/[\u00a0\u00b7\u2192]/g, " ");
      }
    } catch (_) {}
    return null;
  }
  const frame = (w) => new Promise((r) => (w || window).requestAnimationFrame(() => r()));
  // Backspace as a key event. Code editors (Monaco in particular) keep their hidden textarea empty, so
  // execCommand("delete") does nothing there. They do react to a Backspace keydown, so send that first,
  // and only let the browser delete if no editor handled the key.
  function backspace(el, doc) {
    const tgt = doc.activeElement && doc.activeElement !== doc.body ? doc.activeElement : el;
    const KE = doc.defaultView.KeyboardEvent;
    const o = { key: "Backspace", code: "Backspace", keyCode: 8, which: 8, bubbles: true, cancelable: true, composed: true };
    const notHandled = tgt.dispatchEvent(new KE("keydown", o));
    tgt.dispatchEvent(new KE("keyup", o));
    if (notHandled) runCmd(doc, "delete");
  }
  // After Enter, look at the line the editor really made and fix its indent. Never more than a handful of frames.
  async function fixIndent(el, doc, want) {
    const w = doc.defaultView;
    let t = null;
    for (let i = 0; i < 3 && t == null; i++) { await frame(w); t = caretLineText(el); }
    if (t != null && t.trim() !== "") { await frame(w); t = caretLineText(el); } // stale read of the previous line
    if (t == null || t.trim() !== "") {
      // Can't see the editor's lines: predict its auto-indent instead (keeps the previous indent, +1 level after ":" or an open bracket).
      W.blind = true;
      const have = expectedIndent(W.prevLine);
      if (want > have) insertRaw(el, doc, " ".repeat(want - have));
      else for (let d = 0; d < Math.ceil((have - want) / 4); d++) backspace(el, doc); // Backspace in leading spaces removes one indent level
      return;
    }
    let last = -1, stuck = 0;
    for (let tries = 0; tries < 16; tries++) {
      const have = indentOf(t);
      if (have === want) return;
      if (have === last && ++stuck >= 2) return; // editor ignores us: give up rather than freeze
      if (have !== last) stuck = 0;
      last = have;
      if (have > want) backspace(el, doc); else insertRaw(el, doc, " ".repeat(want - have));
      await frame(w);
      t = caretLineText(el);
      if (t == null || t.trim() !== "") return;
    }
  }
  // Code editors type through a tiny invisible textarea. A visible textarea is a plain box with no auto-indent.
  function isProxyInput(el) {
    try {
      if (el.tagName !== "TEXTAREA") return false;
      const r = el.getBoundingClientRect(), cs = el.ownerDocument.defaultView.getComputedStyle(el);
      return r.width < 8 || r.height < 8 || Number(cs.opacity) === 0 || cs.color === "transparent" || el.closest("[class*='editor' i]") != null;
    } catch (_) { return false; }
  }
  function writeMode() {
    if (W.api) return W.api.name + " direct";
    const r = W.target && W.target.closest && W.target.closest(CODE_ROOT);
    const n = !r ? "code" : r.classList.contains("monaco-editor") ? "Monaco" : r.classList.contains("ace_editor") ? "Ace" : r.classList.contains("cm-editor") ? "CodeMirror 6" : "CodeMirror";
    return n + (W.blind ? " keys, guessed indent" : " keys, measured indent");
  }
  async function measuredInsert(t) {
    const el = W.target, doc = el.ownerDocument, parts = t.split("\n");
    for (let i = 0; i < parts.length; i++) {
      let seg = parts[i];
      if (i > 0) {
        if (W.line.trim() !== "") W.prevLine = W.line;
        if (!insertRaw(el, doc, "\n")) return false;
        W.line = "";
        if (seg === "") continue;
        const want = indentOf(seg); seg = seg.replace(/^[ \t]+/, "");
        await fixIndent(el, doc, want);
        W.line = " ".repeat(want);
      } else if (W.fresh && seg !== "") {
        // very first line of the answer: type its indent as-is
        W.fresh = false;
      }
      for (const ch of seg) if (!insertRaw(el, doc, ch)) return false;
      W.line += seg;
    }
    return true;
  }
  function indentOf(line) { return (line.match(/^[ \t]*/)[0].replace(/\t/g, "    ")).length; }
  // Code editors auto-indent after Enter. Work out what indent the editor will have given us,
  // so we only type or delete the difference instead of stacking indentation on top of it.
  function expectedIndent(prev) {
    const base = indentOf(prev), tr = prev.trimEnd();
    return base + (/[:{(\[]$/.test(tr) ? 4 : 0);
  }
  // Editors like CodeMirror, Monaco, Ace and Lexical cancel the native "beforeinput" and make the edit themselves, so
  // execCommand() reports false even though the edit DID happen. The old "cmdA || cmdB || cmdC" chains then ran the next
  // command as well, which is why a single Enter was typed two or three times. runCmd() also watches for beforeinput and
  // counts the edit as done if the editor saw it, so the fallbacks only run when nothing happened at all.
  function runCmd(doc, cmd, val) {
    let seen = false;
    const h = () => { seen = true; };
    doc.addEventListener("beforeinput", h, true);
    let ok = false;
    try { ok = val === undefined ? doc.execCommand(cmd) : doc.execCommand(cmd, false, val); } catch (_) {}
    doc.removeEventListener("beforeinput", h, true);
    return !!(ok || seen);
  }
  function newline(doc, el) {
    if (el.tagName === "INPUT") return runCmd(doc, "insertText", " ");
    if (el.tagName === "TEXTAREA") return runCmd(doc, "insertText", "\n");
    if (W.code) return runCmd(doc, "insertLineBreak") || runCmd(doc, "insertParagraph") || runCmd(doc, "insertText", "\n");
    return runCmd(doc, "insertParagraph") || runCmd(doc, "insertLineBreak");
  }
  // Ace / CodeMirror / Monaco type into a hidden <textarea>. A lone "\n" triggers their auto-indent, which on top of the
  // answer's own indentation made every line drift to the right. Fix: send "newline + indent + first character" as ONE
  // insertion (editors only auto-indent for a bare newline) and everything else one character at a time, exactly like
  // real typing, so auto-closing brackets and quotes behave normally.
  function insertRaw(el, doc, str) {
    let ok = runCmd(doc, "insertText", str);
    if (!ok) {
      const s = el.selectionStart == null ? el.value.length : el.selectionStart, e = el.selectionEnd == null ? s : el.selectionEnd;
      const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set;
      set.call(el, el.value.slice(0, s) + str + el.value.slice(e));
      el.setSelectionRange(s + str.length, s + str.length);
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: str }));
      ok = true;
    }
    return ok;
  }
  // Code editors (Ace, CodeMirror, Monaco) insert pasted text exactly as given: no auto-indent, no auto-closed brackets.
  // So in code editors each chunk is delivered as a paste event. If nothing handles it (plain field), we fall back.
  // Tidies code before it is typed: tabs -> 4 spaces, consistent indent levels, no trailing spaces,
  // no stray blank lines, one blank line before top-level def/class.
  function formatCode(text) {
    const lines = text.replace(/\r/g, "").replace(/\t/g, "    ").split("\n").map((l) => l.replace(/\s+$/, ""));
    const pyish = lines.some((l) => /^\s*(def|class|if|elif|else|for|while|try|except|with)\b.*:\s*$/.test(l));
    const out = []; let stack = [0];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l === "") { if (out.length && out[out.length - 1] !== "" && !/:\s*$/.test(out[out.length - 1])) out.push(""); continue; }
      let line = l;
      if (pyish) {
        const ind = l.match(/^ */)[0].length;
        while (stack.length > 1 && stack[stack.length - 1] > ind) stack.pop();
        const prev = out.filter((x) => x !== "").pop() || "";
        if (ind > stack[stack.length - 1] && /:\s*$/.test(prev)) stack.push(ind);
        line = " ".repeat((stack.length - 1) * 4) + l.trimStart();
        if (/^(def|class)\b/.test(line) && out.length && out[out.length - 1] !== "") out.push("");
      }
      out.push(line);
    }
    while (out.length && out[out.length - 1] === "") out.pop();
    return out.join("\n");
  }
  // Shape the answer for the kind of field it is going into, so we never press Enter more times than needed.
  function prepareText(text, el, code) {
    if (code) return formatCode(text);
    const tag = el && el.tagName;
    if (tag === "INPUT") return text.replace(/\s*\n+\s*/g, " ").trim();   // single-line field: no Enters at all
    if (tag === "TEXTAREA") return text.replace(/\n{3,}/g, "\n\n");       // plain multi-line: keep one blank line max
    // Rich-text / contenteditable: one Enter already starts a new paragraph with its own spacing,
    // so a blank line between paragraphs would just add an empty paragraph.
    return text.replace(/\n{2,}/g, "\n");
  }
  function pasteInsert(el, t) {
    try {
      const doc = el.ownerDocument, tgt = doc.activeElement && doc.activeElement !== doc.body ? doc.activeElement : el;
      const dt = new DataTransfer(); dt.setData("text/plain", t);
      const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true, composed: true });
      return tgt.dispatchEvent(ev) === false; // false = a handler took it (preventDefault)
    } catch (_) { return false; }
  }
  const looksLikeCode = (x) => /^( {2,}|\t)\S/m.test(x) && /(\bdef |\bfunction |\bclass |\bfor |\bif |[{};]|:\s*$)/m.test(x);
  function tokenInsert(t) {
    const el = W.target, doc = el.ownerDocument;
    const toks = t.match(/\n+[ \t]*\S?|[^\n]/g) || [];
    for (const tok of toks) if (!insertRaw(el, doc, tok)) return false;
    return true;
  }
  function nativeInsert(t) {
    if (W.code && pasteInsert(W.target, t)) return true;
    if (W.code && W.target.tagName === "TEXTAREA") return tokenInsert(t);
    const el = W.target, doc = el.ownerDocument, field = el.tagName === "INPUT" || el.tagName === "TEXTAREA";
    const smart = W.code && el.tagName !== "TEXTAREA" && el.tagName !== "INPUT";
    const parts = t.split("\n");
    for (let i = 0; i < parts.length; i++) {
      let seg = parts[i];
      if (smart && W.fresh && seg !== "") {
        // Start of a line: the editor already auto-indented, so only fix the difference.
        const want = indentOf(seg), have = expectedIndent(W.prevLine);
        seg = seg.replace(/^[ \t]+/, "");
        if (want > have) seg = " ".repeat(want - have) + seg;
        else for (let d = 0; d < have - want; d++) doc.execCommand("delete");
        W.line = " ".repeat(want);
        W.fresh = false;
      }
      if (seg) {
        let ok = runCmd(doc, "insertText", seg);
        if (!ok && field) {
          const s = el.selectionStart == null ? el.value.length : el.selectionStart, e = el.selectionEnd == null ? s : el.selectionEnd;
          const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set;
          set.call(el, el.value.slice(0, s) + seg + el.value.slice(e));
          el.setSelectionRange(s + seg.length, s + seg.length);
          el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: seg }));
          ok = true;
        }
        if (!ok) return false;
        W.line += seg.replace(/^ +/, (m) => (smart && W.line === " ".repeat(W.line.length) ? "" : m));
        W.fresh = false;
      }
      if (i < parts.length - 1) {
        if (W.line.trim() !== "") W.prevLine = W.line;
        if (!newline(doc, el)) return false;
        W.line = ""; W.fresh = true;
      }
    }
    return true;
  }
  async function insertChunk(t) {
    if (!W.useDbg) {
      // Some custom controls only expose their editable element after the click.
      if (!W.target && W.focusEl) W.target = editableOf(W.focusEl);
      if (!W.target || !W.target.isConnected) return "That page area can be selected, but Firefox can only type into supported editable fields. Try an input, textarea, or contenteditable editor.";
      writerRefocus();
      if (W.code && W.api) {
        try { W.api.insert(t); return ""; } catch (_) { W.api = null; } // API failed: drop to keystroke typing
      }
      if (W.code && !W.target.isContentEditable && ((W.target.closest && W.target.closest(CODE_ROOT)) || W.proxy)) {
        if (await measuredInsert(t)) return "";
      } else if (nativeInsert(t)) return "";
      return "This editor does not accept standard text insertion in Firefox. Try a regular text field or contenteditable editor. Canvas-based editors such as Google Docs are not supported by this Firefox build.";
    }
    let r;
    try { r = await chrome.runtime.sendMessage({ type: "write:type", text: t }); }
    catch (e) { return alive() ? "Extension error: " + e.message : STALE_MSG; }
    return r && r.error ? r.error : "";
  }
  async function writerStart() {
    if (W.running || !state.lastAnswer || !(W.target || W.docs || W.free)) return;
    const fenced = /```/.test(state.lastAnswer);
    W.text = plain(state.lastAnswer); W.pos = 0; W.owed = 0;
    W.code = !!W.target && (isCodeEditor(W.target) || (W.target.tagName === "TEXTAREA" && (looksLikeCode(W.text) || (fenced && /\n/.test(W.text)))));
    W.proxy = !!W.target && isProxyInput(W.target); // hidden textarea that feeds a code editor we don't know by name
    W.blind = false;
    W.api = W.target ? editorApi(W.target) : null;
    if (W.api) W.code = true;
    W.text = prepareText(W.text, W.target, W.code);
    W.prevLine = ""; W.line = ""; W.fresh = true; W.paused = false; W.running = true;
    W.gen++; writerRefocus(); W.last = performance.now(); updateWriter(); runLoop(W.gen);
  }
  async function runLoop(gen) {
    while (W.running && !W.paused && gen === W.gen) {
      const now = performance.now();
      W.owed = Math.min(W.owed + (now - W.last) / 1000 * (W.wpm * 5 / 60), W.wpm * 5 / 60 * 1.5); // WPM = 5 characters per word; at most 1.5 s of catch-up
      W.last = now;
      const n = Math.floor(W.owed);
      if (n > 0) {
        W.owed -= n;
        let end = W.pos + n;
        if (W.code) { // never cut "newline + indent + first character" apart
          for (;;) {
            const nl = W.text.lastIndexOf("\n", end - 1);
            if (nl < 0 || !/^[ \t]*$/.test(W.text.slice(nl + 1, end))) break;
            while (end < W.text.length && /[ \t]/.test(W.text[end])) end++;
            if (end < W.text.length) { const c = W.text[end]; end++; if (c !== "\n") break; } else break;
          }
        }
        const chunk = W.text.slice(W.pos, end);
        const err = await insertChunk(chunk);
        if (gen !== W.gen) return;
        W.pos += chunk.length;
        if (err) { writerEnd(); wstat(err, true); return; }
        wstat("Typing… " + Math.min(W.pos, W.text.length) + " / " + W.text.length + " characters" + (W.code ? " · " + writeMode() : ""));
        if (W.pos >= W.text.length) { writerEnd(); wstat("Done. Typed " + W.text.length + " characters." + (W.code ? " (" + writeMode() + ")" : "")); return; }
      }
      await sleep(15);
    }
  }
  function writerEnd() {
    W.running = false; W.paused = false; W.gen++;
    // No debugger session is used in the Firefox build.
    updateWriter();
  }
  function writerPause() {
    if (!W.running) return;
    W.paused = !W.paused;
    if (W.paused) { W.gen++; wstat("Paused at " + W.pos + " / " + W.text.length + " characters."); }
    else { W.gen++; W.last = performance.now(); writerRefocus(); runLoop(W.gen); }
    updateWriter();
  }
  function writerStop(silent) {
    if (W.picking) W.picking();
    if (!W.running) return;
    const at = W.pos, total = W.text.length;
    writerEnd();
    if (!silent) wstat("Stopped at " + at + " / " + total + " characters.");
  }

  /* ===================== Panel layout: dock, move, resize ===================== */
  // Default: docked to the right edge like Google Lens, and the page is squeezed to fit beside it.
  // Drag the title bar to float it (drop on a screen edge to dock again), drag its edges to resize.
  const P = { mode: "right", side: "right", dw: 400, fx: null, fy: 16, fw: 390, fh: 0 };
  const MINW = 300, MINH = 320;
  const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(+v) ? +v : lo));
  const SQP = ["width", "margin-left", "margin-right"];
  const SQ = { key: "", t: 0 };
  const ICON_DOCK = '<svg width="14" height="14" viewBox="0 0 14 14"><rect x="1.5" y="2" width="11" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="8" y="2" width="4.5" height="10" fill="currentColor"/></svg>';
  const ICON_FLOAT = '<svg width="14" height="14" viewBox="0 0 14 14"><rect x="4.5" y="1.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2 5v6.5A1.5 1.5 0 0 0 3.5 13H10" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';

  try {
    chrome.storage.local.get("panelPrefs").then((v) => {
      if (v && v.panelPrefs) { Object.assign(P, v.panelPrefs); if (!["right", "left", "float"].includes(P.mode)) P.mode = "right"; if (panel || setupPanel) layoutAll(); }
    }).catch(() => {});
  } catch (_) {}
  const savePrefs = () => { try { chrome.storage.local.set({ panelPrefs: P }).catch(() => {}); } catch (_) {} };

  function clampPrefs() {
    const vw = window.innerWidth, vh = window.innerHeight;
    P.dw = Math.round(clampN(P.dw, MINW, Math.max(MINW, Math.min(vw * 0.7, 900))));
    P.fw = Math.round(clampN(P.fw, MINW, Math.max(MINW, vw - 16)));
    P.fh = P.fh ? Math.round(clampN(P.fh, MINH, Math.max(MINH, vh - 16))) : 0;
    if (P.fx == null) P.fx = Math.max(8, vw - P.fw - 16);
    P.fx = Math.round(clampN(P.fx, 80 - P.fw, vw - 80));
    P.fy = Math.round(clampN(P.fy, 0, Math.max(0, vh - 40)));
  }

  function pingResize() {
    clearTimeout(SQ.t);
    SQ.t = setTimeout(() => { try { window.dispatchEvent(new Event("resize")); } catch (_) {} }, 120);
  }

  // Shrinks the page so it sits beside the docked panel (and puts it back when the panel goes away).
  function syncSqueeze() {
    if (!alive()) return;
    const de = document.documentElement;
    const open = [panel, setupPanel].some((p) => p && p.isConnected);
    let orig = {};
    try { orig = JSON.parse(de.getAttribute("data-scope-orig") || "{}"); } catch (_) {}
    const setOrig = (k) => { const v = orig[k]; if (v && v[0]) de.style.setProperty(k, v[0], v[1]); else de.style.removeProperty(k); };
    if (!(open && P.mode !== "float")) {
      if (de.hasAttribute("data-scope-orig")) {
        SQP.forEach(setOrig);
        de.removeAttribute("data-scope-orig");
        SQ.key = ""; pingResize();
      }
      return;
    }
    if (!de.hasAttribute("data-scope-orig")) {
      for (const k of SQP) orig[k] = [de.style.getPropertyValue(k), de.style.getPropertyPriority(k)];
      de.setAttribute("data-scope-orig", JSON.stringify(orig));
    }
    de.style.setProperty("width", "calc(100% - " + P.dw + "px)", "important");
    if (P.mode === "left") de.style.setProperty("margin-left", P.dw + "px", "important"); else setOrig("margin-left");
    setOrig("margin-right");
    const key = P.mode + ":" + P.dw;
    if (key !== SQ.key) { SQ.key = key; pingResize(); }
  }

  function layoutOne(el) {
    if (!el) return;
    const s = el.style, dock = P.mode !== "float";
    el.classList.toggle("docked", dock);
    el.classList.toggle("dl", P.mode === "left");
    el.classList.toggle("dr", P.mode === "right");
    el.classList.toggle("fixedh", dock || !!P.fh);
    s.maxWidth = "none";
    if (dock) {
      s.top = "0"; s.bottom = "0"; s.height = ""; s.maxHeight = "none"; s.width = P.dw + "px";
      s.left = P.mode === "left" ? "0" : "auto"; s.right = P.mode === "right" ? "0" : "auto";
    } else {
      s.top = P.fy + "px"; s.left = P.fx + "px"; s.right = "auto"; s.bottom = "auto";
      s.width = P.fw + "px"; s.height = P.fh ? P.fh + "px" : "";
      s.maxHeight = Math.max(MINH, window.innerHeight - P.fy - 8) + "px";
    }
    const b = el.querySelector('[data-a="dock"]');
    if (b) {
      const tag = dock ? "f" : "d" + P.side;
      if (b.dataset.m !== tag) {
        b.dataset.m = tag;
        b.innerHTML = dock ? ICON_FLOAT : ICON_DOCK;
        b.title = dock ? "Float this panel (or drag the title bar)" : "Dock to the side (or drag the title bar to a screen edge)";
        b.style.transform = !dock && P.side === "left" ? "scaleX(-1)" : "";
      }
    }
  }

  function layoutAll() { clampPrefs(); layoutOne(panel); layoutOne(setupPanel); syncSqueeze(); }

  function toggleDock() {
    if (P.mode === "float") P.mode = P.side === "left" ? "left" : "right";
    else { P.side = P.mode; P.mode = "float"; P.fx = P.side === "left" ? 16 : window.innerWidth - P.fw - 16; P.fy = 16; }
    layoutAll(); savePrefs();
  }

  let dz = null;
  function showDz(side) {
    if (!side) { if (dz) { dz.remove(); dz = null; } return; }
    if (!dz) { dz = document.createElement("div"); dz.className = "dz"; root.appendChild(dz); }
    Object.assign(dz.style, { display: "block", width: P.dw + "px", left: side === "left" ? "0" : "auto", right: side === "right" ? "0" : "auto" });
  }

  function onDown(e) {
    if (e.button !== 0 || !alive()) return;
    const el = e.currentTarget, t = e.target;
    const d = t.classList && t.classList.contains("rz") ? t.dataset.d : null;
    const head = !d && t.closest && t.closest(".head") && !t.closest("button");
    if (!d && !head) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const S = { sx: e.clientX, sy: e.clientY, x: r.left, y: r.top, w: r.width, h: r.height, dw: P.dw, moved: false, zone: "", ox: 0, oy: 0 };
    try { t.setPointerCapture(e.pointerId); } catch (_) {}
    const move = (ev) => {
      const dx = ev.clientX - S.sx, dy = ev.clientY - S.sy;
      if (d) {
        if (!S.moved) { S.moved = true; el.classList.add("busy"); }
        if (P.mode !== "float") {
          if (d === "w") P.dw = S.dw - dx; else if (d === "e") P.dw = S.dw + dx;
        } else {
          let x = S.x, y = S.y, w = S.w, h = S.h;
          if (d.includes("e")) w = S.w + dx;
          if (d.includes("w")) w = S.w - dx;
          if (d.includes("s")) h = S.h + dy;
          if (d.includes("n")) h = S.h - dy;
          w = clampN(w, MINW, window.innerWidth - 16); h = clampN(h, MINH, window.innerHeight - 16);
          if (d.includes("w")) x = S.x + S.w - w;
          if (d.includes("n")) y = S.y + S.h - h;
          Object.assign(P, { fx: x, fy: y, fw: w, fh: h });
        }
        layoutAll();
        return;
      }
      if (!S.moved) {
        if (Math.hypot(dx, dy) < 5) return;
        S.moved = true; el.classList.add("busy");
        let fx = P.fx, fy = P.fy;
        if (P.mode !== "float") { // pull it off the side, keeping the grab point under the cursor
          P.side = P.mode; P.mode = "float";
          fx = S.sx - (S.w ? (S.sx - S.x) / S.w : 0.5) * P.fw; fy = Math.max(0, S.sy - 18);
        }
        S.ox = S.sx - fx; S.oy = S.sy - fy;
      }
      P.fx = ev.clientX - S.ox; P.fy = ev.clientY - S.oy;
      S.zone = ev.clientX < 48 ? "left" : ev.clientX > window.innerWidth - 48 ? "right" : "";
      showDz(S.zone);
      layoutAll();
    };
    const up = () => {
      t.removeEventListener("pointermove", move);
      t.removeEventListener("pointerup", up);
      t.removeEventListener("pointercancel", up);
      try { t.releasePointerCapture(e.pointerId); } catch (_) {}
      el.classList.remove("busy");
      showDz("");
      if (S.moved && !d && S.zone) { P.mode = S.zone; P.side = S.zone; layoutAll(); }
      if (S.moved) savePrefs();
    };
    t.addEventListener("pointermove", move);
    t.addEventListener("pointerup", up);
    t.addEventListener("pointercancel", up);
  }

  function wirePanel(el) {
    for (const d of ["n", "s", "e", "w", "ne", "nw", "se", "sw"]) {
      const h = document.createElement("div"); h.className = "rz"; h.dataset.d = d; el.appendChild(h);
    }
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("dblclick", (e) => {
      const t = e.target;
      if (t.closest && t.closest(".head") && !t.closest("button")) toggleDock();
    });
    clampPrefs(); layoutOne(el);
  }

  window.addEventListener("resize", () => { if (alive() && (panel || setupPanel)) layoutAll(); });

  window.__snapAI = { start, alive };
  start();
})();

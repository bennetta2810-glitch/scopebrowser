// Runs only on the Scope AI website. Reads the plan the website saved
// (localStorage "scope-tier-v1-<uid>") and passes it to the extension.
(() => {
  let last = "";
  function scan() {
    try {
      if (!chrome.runtime || !chrome.runtime.id) return clearInterval(timer);
      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i), m = k && k.match(/^scope-tier-v1-(.+)$/);
        if (m && m[1] !== "guest") out[m[1]] = localStorage.getItem(k);
      }
      const j = JSON.stringify(out);
      if (j !== last) { last = j; chrome.runtime.sendMessage({ type: "site:tiers", tiers: out }).catch(() => {}); }
    } catch (_) {}
  }
  const timer = setInterval(scan, 2000);
  scan();
})();

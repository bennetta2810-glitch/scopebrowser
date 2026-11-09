/* ================= Scope AI account (same Firebase project as the website) ================= */
const FIREBASE = {
  apiKey: "AIzaSyA3ZbMtiy0eFEIoU-2WfhB1_sDRnqU0QXM",
  projectId: "scopeai-993fa"
};
// Where people create an account. Change this to your real website address.
const WEBSITE_URL = "https://scopeai.oneapp.dev/#/account";
const PRICING_URL = "https://scopeai.oneapp.dev/#/pricing";
// Scope Lens (this extension) is a Scope Max feature.
const REQUIRED_TIER = "max";
const TIER_NAMES = { free: "Scope Free", pro: "Scope Pro", max: "Scope Max" };
const TIER_RECHECK_MS = 60 * 1000; // re-check the plan at most once a minute
// Set to true to only allow accounts with an active membership (members/{uid}.active === true).
const REQUIRE_MEMBERSHIP = false;

const AUTH_MSGS = {
  EMAIL_NOT_FOUND: "Wrong email or password.",
  INVALID_PASSWORD: "Wrong email or password.",
  INVALID_LOGIN_CREDENTIALS: "Wrong email or password.",
  INVALID_EMAIL: "Enter a valid email address.",
  USER_DISABLED: "This account has been disabled.",
  TOO_MANY_ATTEMPTS_TRY_LATER: "Too many attempts. Wait a bit and try again.",
  MISSING_PASSWORD: "Enter your password."
};
function authMsg(code) {
  const c = String(code || "").split(" ")[0].split(":")[0];
  return AUTH_MSGS[c] || ("Sign-in failed (" + (code || "unknown error") + ").");
}

async function getSession() {
  const { session } = await chrome.storage.local.get("session");
  return session || null;
}
async function setSession(s) {
  if (s) await chrome.storage.local.set({ session: s });
  else await chrome.storage.local.remove("session");
}

function normTier(t) {
  t = String(t || "").trim().toLowerCase();
  return t === "max" || t === "pro" || t === "free" ? t : "";
}
function tierName(t) { return TIER_NAMES[t] || "Scope Free"; }
function lockedMessage(s) {
  if (s.tierUnknown)
    return "Scope AI couldn't check your plan right now. Scope Lens needs Scope Max ($9.99/month). Try again in a moment.";
  return "You don't have access to Scope Lens. It's a Scope Max feature ($9.99/month), and your account is on " +
    tierName(s.tier) + ". Upgrade to Scope Max on scopeai.oneapp.dev to use the extension. Already on Max? " +
    "Open scopeai.oneapp.dev signed in with this same account, then try again.";
}

async function fsGet(path, token) {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE.projectId}/databases/(default)/documents/${path}`;
    const res = await fetch(url, { headers: { Authorization: "Bearer " + token } });
    if (res.status === 404) return { missing: true };
    if (!res.ok) return { failed: true };
    return { fields: (await res.json()).fields || {} };
  } catch (_) { return { failed: true }; }
}

// Reads the account's membership like the website does:
//  - members/{uid}                    : admin-managed (active, accessCode, optional tier)
//  - users/{uid}/settings/membership   : the plan the website saves (tier: free | pro | max)
async function checkMembership(s) {
  const uid = encodeURIComponent(s.uid);
  const [m, u] = await Promise.all([
    fsGet("members/" + uid, s.idToken),
    fsGet("users/" + uid + "/settings/membership", s.idToken)
  ]);

  let adminTier = "";
  if (m.missing) { s.member = false; s.memberKey = ""; }
  else if (m.fields) {
    const f = m.fields;
    s.member = !!(f.active && f.active.booleanValue === true);
    s.memberKey = s.member && f.accessCode && f.accessCode.stringValue ? f.accessCode.stringValue : "";
    adminTier = f.tier ? normTier(f.tier.stringValue) : "";
  } // failed: keep what we had

  let userTier = "";
  if (u.fields) userTier = normTier(u.fields.tier && u.fields.tier.stringValue) || "free";

  // The plan the Scope AI website saved for this account in this browser (read by sitesync.js).
  const { siteTiers } = await chrome.storage.local.get("siteTiers");
  const siteTier = normTier(siteTiers && siteTiers[s.uid]);

  const tier = adminTier || userTier || siteTier || (u.missing ? "free" : "");
  if (tier) {
    s.tier = tier;
    s.tierUnknown = false;
  } else {
    // Couldn't read either document (network or Firestore rules). Don't unlock anything.
    s.tier = s.tier || "free";
    s.tierUnknown = true;
  }
  s.memberCheckedAt = Date.now();
  return s;
}
function hasAccess(s) { return !!s && !s.tierUnknown && s.tier === REQUIRED_TIER; }

async function signIn(email, password) {
  let res, data;
  try {
    res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    });
    data = await res.json();
  } catch (e) {
    return { error: "NETWORK", message: "Network error: " + e.message };
  }
  if (!res.ok) return { error: "AUTH", message: authMsg(data && data.error && data.error.message) };
  let s = {
    uid: data.localId,
    email: data.email,
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    expiresAt: Date.now() + (Number(data.expiresIn) - 60) * 1000
  };
  s = await checkMembership(s);
  await setSession(s);
  return { ok: true, email: s.email, member: !!s.member, tier: s.tier, hasAccess: hasAccess(s) };
}

async function resetPassword(email) {
  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${FIREBASE.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestType: "PASSWORD_RESET", email })
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return { error: "AUTH", message: authMsg(d.error && d.error.message) };
    }
    return { ok: true };
  } catch (e) {
    return { error: "NETWORK", message: "Network error: " + e.message };
  }
}

// Returns a signed-in session with a fresh ID token, or null if the user must sign in again.
let refreshing = null;
async function ensureAuth(forceCheck) {
  const s = await getSession();
  if (!s) return null;
  if (Date.now() < s.expiresAt) {
    if (forceCheck || !s.memberCheckedAt || Date.now() - s.memberCheckedAt > TIER_RECHECK_MS) {
      const n = await checkMembership(s);
      await setSession(n);
      return n;
    }
    return s;
  }
  if (!refreshing) {
    refreshing = (async () => {
      let res;
      try {
        res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE.apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(s.refreshToken)
        });
      } catch (e) {
        throw new Error("Network error while checking your account: " + e.message);
      }
      if (!res.ok) { await setSession(null); return null; } // account deleted/disabled or token revoked
      const d = await res.json();
      let n = Object.assign({}, s, {
        idToken: d.id_token,
        refreshToken: d.refresh_token,
        expiresAt: Date.now() + (Number(d.expires_in) - 60) * 1000
      });
      n = await checkMembership(n);
      await setSession(n);
      return n;
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
}

/* ============================================================================================ */

const DEFAULT_MODEL = "gemini-3.5-flash";
// Old model names Google retired for new users -> current replacements
const MODEL_MIGRATE = {
  "gemini-2.5-flash": "gemini-3.5-flash",
  "gemini-2.5-flash-lite": "gemini-3.5-flash-lite"
};

async function startOnTab(tab) {
  if (!tab || !tab.id) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
  } catch (e) {
    // chrome:// pages, the Web Store, and some PDFs can't be scripted
    chrome.action.setBadgeText({ text: "!", tabId: tab.id });
    chrome.action.setBadgeBackgroundColor({ color: "#d93025", tabId: tab.id });
    setTimeout(() => chrome.action.setBadgeText({ text: "", tabId: tab.id }), 2500);
  }
}

chrome.action.onClicked.addListener(startOnTab);


// Models that rejected the "low thinking" setting; we skip it for them from then on.
const noThink = new Set();

async function askGemini(contents, onDelta) {
  let session;
  try { session = await ensureAuth(); }
  catch (e) { return { error: "NETWORK", message: e.message }; }
  if (!session) return { error: "NO_AUTH", message: "Sign in with your Scope AI account to use the extension." };
  if (!hasAccess(session)) return { error: "NO_TIER", message: lockedMessage(session) };
  if (REQUIRE_MEMBERSHIP && !session.member)
    return { error: "NO_PLAN", message: "Your Scope AI account doesn't have an active membership. Upgrade on the website, then try again." };

  const loc = await chrome.storage.local.get(["apiKey", "model", "language"]);
  const syn = loc.apiKey ? {} : await chrome.storage.sync.get(["apiKey", "model", "language"]).catch(() => ({}));
  const { model, language } = loc.apiKey ? loc : syn;
  // Your own key in Options wins; otherwise use the membership access code from your account.
  const apiKey = (loc.apiKey || syn.apiKey || session.memberKey || "").trim();
  if (!apiKey) return { error: "NO_KEY", message: "No key for this account yet. Open settings and paste your key." };
  const key = apiKey;
  if (/[^\x21-\x7E]/.test(key))
    return { error: "BAD_KEY", message: "The saved key has invalid characters (maybe a hidden character). Copy the key again and paste it in settings." };

  const sys =
    "You are a visual assistant like Google Lens. The user selects part of a web page and you explain it. " +
    "Identify what is shown (objects, people only by visible context, products, places, code, charts, math, text). " +
    "Read and translate any text if useful. Be clear and concise, use short paragraphs or bullet points, " +
    "and answer follow-up questions using the image as context. " +
    "If the user asks you to solve or answer something so it can be written into a document or form, reply with ONLY the final answer as plain text (no markdown, no preamble, no commentary)." +
    (language && language.trim() ? ` Always reply in ${language.trim()}.` : "");

  const useModel = MODEL_MIGRATE[(model || "").trim()] || (model || "").trim() || DEFAULT_MODEL;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function callModel(m) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:streamGenerateContent?alt=sse`;
    let think = !noThink.has(m);
    for (let attempt = 0; attempt < 2; attempt++) {
      const payload = { systemInstruction: { parts: [{ text: sys }] }, contents };
      if (think) payload.generationConfig = { thinkingConfig: { thinkingLevel: "low" } };
      let res;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify(payload)
        });
      } catch (e) {
        return { retry: true, error: "NETWORK", message: "Network error: " + e.message };
      }

      if (!res.ok) {
        let data = null;
        try { data = await res.json(); } catch (_) {}
        const apiMsg = data && data.error && data.error.message ? data.error.message : res.statusText;
        // This model doesn't support the thinking setting: remember that and retry right away without it.
        if (think && res.status === 400 && /think/i.test(apiMsg)) { think = false; noThink.add(m); continue; }
        if (res.status === 429) return { retry: true, error: "RATE", message: "Too many requests (429). Wait a minute and try again." };
        if (res.status === 500 || res.status === 503 || res.status === 504)
          return { retry: true, error: "BUSY", message: "Gemini is busy right now (" + res.status + "). Try again in a moment." };
        if (res.status === 400 && /API key/i.test(apiMsg))
          return { error: "BAD_KEY", message: "The key was rejected. Check it in settings." };
        if (res.status === 404)
          return { retry: true, error: "MODEL", message: `Model "${m}" isn't available. Open settings and try gemini-3.5-flash or gemini-3.5-flash-lite.` };
        return { error: "HTTP", message: `Error ${res.status}: ${apiMsg}` };
      }

      // Read the streamed answer and pass each piece on as soon as it arrives.
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "", text = "", reason = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);
            if (!line.startsWith("data:")) continue;
            const j = line.slice(5).trim();
            if (!j || j === "[DONE]") continue;
            let ev;
            try { ev = JSON.parse(j); } catch (_) { continue; }
            const c = ev.candidates && ev.candidates[0];
            if (c && c.content && c.content.parts) {
              const t = c.content.parts.filter((p) => !p.thought).map((p) => p.text || "").join("");
              if (t) { text += t; onDelta && onDelta(t); }
            }
            if (c && c.finishReason) reason = c.finishReason;
            if (ev.promptFeedback && ev.promptFeedback.blockReason) reason = ev.promptFeedback.blockReason;
          }
        }
      } catch (e) {
        if (text) return { text };
        return { retry: true, error: "NETWORK", message: "Connection dropped: " + e.message };
      }
      if (!text) return { error: "EMPTY", message: "Gemini returned no text (" + (reason || "empty response") + ")." };
      return { text };
    }
    return { error: "HTTP", message: "Gemini rejected the request." };
  }

  // Try the chosen model (twice, in case of a brief spike), then fall back to lighter models.
  const chain = [useModel, useModel, "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]
    .filter((m, i, a) => i === 0 || m !== a[i - 1]);
  let last = null;
  for (let i = 0; i < chain.length; i++) {
    const r = await callModel(chain[i]);
    if (r.text) {
      if (chain[i] !== useModel) r.note = "Answered by " + chain[i] + " because " + useModel + " was busy.";
      return r;
    }
    last = r;
    if (!r.retry) return r;
    if (i < chain.length - 1) await sleep(i === 0 ? 600 : 250);
  }
  return last;
}

// Answers stream back over a port so text can appear as it is generated.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "ask") return;
  let closed = false;
  port.onDisconnect.addListener(() => { closed = true; });
  port.onMessage.addListener(async (msg) => {
    if (!msg || msg.type === "ping" || !msg.contents) return; // keep-alive ping from the page
    // Keep the service worker awake for the whole answer (MV3 sleeps after ~30s of quiet).
    const keep = setInterval(() => { try { chrome.runtime.getPlatformInfo(() => {}); } catch (_) {} }, 20000);
    try { await handleAsk(port, msg, () => closed); } finally { clearInterval(keep); }
  });
});
async function handleAsk(port, msg, isClosed) {
  {
    const send = (m) => { if (!isClosed()) { try { port.postMessage(m); } catch (_) {} } };
    let result;
    try { result = await askGemini(msg.contents, (t) => send({ type: "delta", text: t })); }
    catch (e) { result = { error: "EXT", message: "Extension error: " + e.message }; }
    send({ type: "done", result });
    try { port.disconnect(); } catch (_) {}
  }
}


/* Firefox build: Firefox does not implement Chrome's debugger API.
   Normal text fields and contenteditable editors are typed by content.js directly.
   Canvas-based editors such as Google Docs cannot receive trusted keystrokes here. */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "ping") { sendResponse({ ok: true }); return; }
  if (msg.type === "write:type" || msg.type === "write:end") {
    sendResponse({ error: "Advanced keystroke typing is not available in Firefox. Choose a normal text field or contenteditable editor instead." });
    return;
  }
  if (msg.type === "site:tiers") {
    // Sent by sitesync.js from the Scope AI website: { uid: "free" | "pro" | "max" }
    (async () => {
      const clean = {};
      for (const [uid, t] of Object.entries(msg.tiers || {})) { const n = normTier(t); if (n) clean[uid] = n; }
      await chrome.storage.local.set({ siteTiers: clean });
      const s = await getSession();
      if (s && Date.now() < s.expiresAt) await setSession(await checkMembership(s));
    })();
    return;
  }
  if (msg.type === "capture") {
    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" })
      .then((dataUrl) => sendResponse({ dataUrl }))
      .catch((e) => sendResponse({ error: e.message }));
    return true;
  }
  if (msg.type === "setup:done" || msg.type === "setup:signedout") {
    if (sender.tab && sender.tab.id != null)
      chrome.tabs.sendMessage(sender.tab.id, { type: msg.type === "setup:done" ? "scope:setup-done" : "scope:signed-out" }).catch(() => {});
    return;
  }
  if (msg.type === "auth:signin") {
    signIn(String(msg.email || "").trim(), String(msg.password || "")).then(sendResponse);
    return true;
  }
  if (msg.type === "auth:reset") {
    resetPassword(String(msg.email || "").trim()).then(sendResponse);
    return true;
  }
  if (msg.type === "auth:signout") {
    setSession(null).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === "auth:status") {
    (async () => {
      let s;
      try { s = await ensureAuth(!!msg.fresh); } catch (_) { s = await getSession(); }
      if (!s) return sendResponse({ signedIn: false, signupUrl: WEBSITE_URL, pricingUrl: PRICING_URL });
      const loc = await chrome.storage.local.get("apiKey");
      const syn = loc.apiKey ? {} : await chrome.storage.sync.get("apiKey").catch(() => ({}));
      const hasOwnKey = !!((loc.apiKey || syn.apiKey || "").trim());
      sendResponse({ signedIn: true, email: s.email, member: !!s.member, hasMemberKey: !!s.memberKey,
        hasKey: hasOwnKey || !!s.memberKey, signupUrl: WEBSITE_URL, pricingUrl: PRICING_URL,
        requireMembership: REQUIRE_MEMBERSHIP,
        tier: s.tier || "free", tierName: tierName(s.tier), tierUnknown: !!s.tierUnknown,
        hasAccess: hasAccess(s), lockedMessage: hasAccess(s) ? "" : lockedMessage(s) });
    })();
    return true;
  }
});

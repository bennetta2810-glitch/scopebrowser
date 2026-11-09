const $ = (id) => document.getElementById(id);
const MIG = { "gemini-2.5-flash": "gemini-3.5-flash", "gemini-2.5-flash-lite": "gemini-3.5-flash-lite" };
const send = (m) => new Promise((res) => chrome.runtime.sendMessage(m, (r) => res(r || {})));
const say = (t, c) => { $("msg").textContent = t || ""; $("msg").className = "msg " + (c || ""); };
let hasMemberKey = false;

async function render(fresh) {
  const st = await send({ type: "auth:status", fresh: !!fresh });
  $("loading").hidden = true;
  $("signup").href = st.signupUrl || "#";
  const locked = !!st.signedIn && !st.hasAccess;
  $("login").hidden = !!st.signedIn;
  $("locked").hidden = !locked;
  $("settings").hidden = !st.signedIn || locked;
  if (!st.signedIn) { $("em").focus(); return; }

  if (locked) {
    $("lwho").textContent = st.email;
    $("ltier").textContent = st.tierUnknown ? "Plan unknown" : (st.tierName || "Scope Free");
    $("upgrade").href = st.pricingUrl || st.signupUrl || "#";
    $("ltitle").textContent = st.tierUnknown ? "We couldn't check your plan" : "You don't have access to Scope Lens";
    $("ltext").textContent = st.tierUnknown
      ? "Scope Lens is a Scope Max feature. Check your connection and try again."
      : "Scope Lens is a Scope Max feature. Your account is on " + (st.tierName || "Scope Free") +
        ". Upgrade to Scope Max on the Scope AI website, then come back here.";
    return;
  }

  $("who").textContent = st.email;
  $("plan").hidden = !st.member;
  hasMemberKey = !!st.hasMemberKey;
  $("kopt").textContent = hasMemberKey ? "(optional, your membership key is used if blank)" : "(required)";
  if (st.requireMembership && !st.member)
    say("This account doesn't have an active membership. Upgrade on the website to use Scope AI.", "err");

  let v = await chrome.storage.local.get(["apiKey", "model", "language"]);
  if (!v.apiKey) {
    try { const sv = await chrome.storage.sync.get(["apiKey", "model", "language"]); if (sv.apiKey) v = sv; } catch (_) {}
  }
  $("k").value = v.apiKey || "";
  $("m").value = MIG[v.model] || v.model || "gemini-3.5-flash";
  $("l").value = v.language || "";
  ($("k").value || hasMemberKey ? $("save") : $("k")).focus();
}

$("lf").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("em").value.trim(), password = $("pw").value;
  if (!/^\S+@\S+\.\S+$/.test(email)) return say("Enter a valid email address.", "err");
  if (!password) return say("Enter your password.", "err");
  $("go").disabled = true; say("Signing in…");
  const r = await send({ type: "auth:signin", email, password });
  $("go").disabled = false;
  if (!r.ok) return say(r.message || "Sign-in failed.", "err");
  $("pw").value = ""; say("");
  render(); // Scope Max: step 2 (key, model, language). Otherwise: the "no access" screen.
});

$("forgot").addEventListener("click", async () => {
  const email = $("em").value.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return say("Enter your email above first.", "err");
  const r = await send({ type: "auth:reset", email });
  say(r.ok ? "If that email has an account, a reset link is on its way." : (r.message || "Couldn't send the reset email."), r.ok ? "ok" : "err");
});

$("save").addEventListener("click", async () => {
  const raw = $("k").value.trim();
  const key = raw.replace(/[^\x21-\x7E]/g, "");
  $("k").value = key;
  if (!key && !hasMemberKey) { $("k").focus(); return say("Paste your key to continue.", "err"); }
  const data = { model: $("m").value.trim() || "gemini-3.5-flash", language: $("l").value.trim() };
  if (key) data.apiKey = key;
  else { await chrome.storage.local.remove("apiKey"); try { await chrome.storage.sync.remove("apiKey"); } catch (_) {} }
  await chrome.storage.local.set(data);
  say("Saved ✓", "ok");
  chrome.runtime.sendMessage({ type: "setup:done" });
});

$("out").addEventListener("click", async () => {
  await send({ type: "auth:signout" });
  chrome.runtime.sendMessage({ type: "setup:signedout" });
  say("");
  render();
});

render(true);

$("recheck").addEventListener("click", async () => {
  $("recheck").disabled = true; say("Checking your plan…");
  await render(true);
  $("recheck").disabled = false;
  say($("locked").hidden ? "Scope Max is active. You're all set ✓" : "Your account still doesn't have Scope Max.", $("locked").hidden ? "ok" : "err");
});

$("lout").addEventListener("click", async () => {
  await send({ type: "auth:signout" });
  chrome.runtime.sendMessage({ type: "setup:signedout" });
  say("");
  render();
});

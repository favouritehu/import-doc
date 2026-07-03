// Import Desk Tracker — grab the active tab's text, send it to the Import Desk
// API; the server AI-extracts ETA/vessel/events and auto-matches the shipment by
// the container/BL number on the page. Token from the team password, cached.

const $ = (id) => document.getElementById(id);

const DEFAULT_SERVER = 'https://import.favouritehub.in';

async function cfg() {
  const st = await chrome.storage.local.get(['server', 'token']);
  return { server: (st.server || DEFAULT_SERVER).replace(/\/$/, ''), token: st.token || '' };
}

function show(kind, msg) {
  const el = $('result');
  el.className = kind;
  el.textContent = msg;
}

async function login(server, password) {
  const res = await fetch(`${server}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error('Wrong team password');
  const j = await res.json();
  await chrome.storage.local.set({ token: j.token || '' });
  return j.token || '';
}

async function pageText() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const [r] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => document.body ? document.body.innerText.slice(0, 60000) : '',
  });
  return { text: r?.result || '', url: tab.url || '' };
}

async function capture() {
  const btn = $('send');
  btn.disabled = true;
  btn.textContent = 'Reading page…';
  try {
    let { server, token } = await cfg();
    const password = $('password').value.trim();
    if ($('server').value.trim()) {
      server = $('server').value.trim().replace(/\/$/, '');
      await chrome.storage.local.set({ server });
    }
    if (!token && !password) {
      $('settings').style.display = 'block';
      show('err', 'Enter the team password once (settings), then send again.');
      return;
    }
    if (password) token = await login(server, password);

    const { text, url } = await pageText();
    if (text.trim().length < 40) {
      show('err', 'This page has no readable tracking text.');
      return;
    }
    btn.textContent = 'Sending to Import Desk…';
    let res = await fetch(`${server}/api/tracking/capture`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ text, url }),
    });
    if (res.status === 401) {
      // token stale — force re-login
      await chrome.storage.local.set({ token: '' });
      $('settings').style.display = 'block';
      show('err', 'Session expired — enter the team password and send again.');
      return;
    }
    const j = await res.json();
    if (!res.ok) throw new Error(j.message || `Server error ${res.status}`);
    if (j.matched) {
      const bits = Object.entries(j.applied || {})
        .map(([k, v]) => `${k}: ${v}`)
        .join(' · ');
      show('ok', `Updated ${j.matched.fileNumber}${bits ? ` — ${bits}` : ' (no new values found)'}`);
    } else {
      show('err', 'No matching shipment — add this container/BL number to an import file first.');
    }
  } catch (e) {
    show('err', e.message || 'Failed');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send this page to Import Desk';
  }
}

(async () => {
  const { server, token } = await cfg();
  $('server').value = server;
  if (!token) $('settings').style.display = 'block';
  $('toggle').addEventListener('click', () => {
    const s = $('settings');
    s.style.display = s.style.display === 'block' ? 'none' : 'block';
  });
  $('send').addEventListener('click', capture);
})();

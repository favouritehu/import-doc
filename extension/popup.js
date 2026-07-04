// Import Desk widget: a mini control tower in the toolbar. Shows the shipments
// that need eyes (overdue / arriving soon first) with their latest milestone, one
// tap opens the file. Keeps the one-click page capture (tracking page -> AI ->
// shipment auto-update). Token comes from the team password, cached in storage.

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

// ── dates: support ISO 2026-07-03 and "3 Jul 2026" ──
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
function parseDate(s) {
  if (!s || typeof s !== 'string') return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/);
  if (m && MONTHS[m[2].toLowerCase()] !== undefined) return Date.UTC(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  return null;
}
function daysTo(s) {
  const t = parseDate(s);
  if (t === null) return null;
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((t - today) / 86400000);
}

function supplierLabel(f) {
  const first = f.invoices && f.invoices[0] ? f.invoices[0].supplier : '';
  const extra = (f.invoices || []).length - 1;
  return extra > 0 ? `${first} +${extra}` : first || f.fileNumber;
}

function lineFor(f) {
  if (f.arrivedOn) return { text: 'Arrived', color: 'var(--green)', rank: 3 };
  const d = daysTo(f.eta);
  if (d === null) return { text: 'No ETA', color: 'rgba(255,255,255,.45)', rank: 4 };
  if (d < 0) return { text: `Overdue ${Math.abs(d)}d`, color: 'var(--red)', rank: 0 };
  if (d === 0) return { text: 'Arrives today', color: 'var(--red)', rank: 0 };
  if (d <= 4) return { text: `In ${d}d`, color: 'var(--red)', rank: 1 };
  return { text: `In ${d}d`, color: 'var(--green)', rank: 2 };
}

async function loadWidget() {
  const { server, token } = await cfg();
  $('open').href = server;
  if (!token) {
    $('settings').style.display = 'block';
    $('empty').style.display = 'block';
    $('empty').textContent = 'Enter the team password once, then reopen.';
    return;
  }
  let files = [];
  try {
    const res = await fetch(`${server}/api/files`, { headers: { authorization: `Bearer ${token}` } });
    if (res.status === 401) {
      await chrome.storage.local.set({ token: '' });
      $('settings').style.display = 'block';
      $('empty').style.display = 'block';
      $('empty').textContent = 'Session expired — enter the team password again.';
      return;
    }
    files = (await res.json()).files || [];
  } catch {
    $('empty').style.display = 'block';
    $('empty').textContent = 'Cannot reach the server.';
    return;
  }

  const rows = files
    .filter((f) => f.status !== 'closed')
    .map((f) => ({ f, line: lineFor(f) }))
    .sort((a, b) => a.line.rank - b.line.rank || (daysTo(a.f.eta) ?? 999) - (daysTo(b.f.eta) ?? 999))
    .slice(0, 6);

  const urgent = rows.filter((r) => r.line.rank <= 1).length;
  $('urgent').textContent = urgent ? `${urgent} urgent` : '';

  const list = $('list');
  list.textContent = '';
  if (!rows.length) {
    $('empty').style.display = 'block';
    $('empty').textContent = 'No open shipments.';
    return;
  }
  for (const { f, line } of rows) {
    const btn = document.createElement('button');
    btn.className = 'row';
    const dotColor = line.rank <= 1 ? '#DC3A45' : line.rank === 3 || line.rank === 2 ? '#16A34A' : '#94A3B8';
    const meta = [f.fileNumber, f.lastTrackingEvent || ''].filter(Boolean).join(' · ');
    btn.innerHTML = `
      <span class="r1">
        <span class="dot" style="background:${dotColor}"></span>
        <span class="party"></span>
        <span class="line" style="color:${line.color}"></span>
      </span>
      <span class="r2 mono"></span>`;
    btn.querySelector('.party').textContent = supplierLabel(f);
    btn.querySelector('.line').textContent = line.text;
    btn.querySelector('.r2').textContent = meta;
    btn.addEventListener('click', () => chrome.tabs.create({ url: `${server}/?file=${f.id}` }));
    list.appendChild(btn);
  }
}

async function pageText() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const [r] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => (document.body ? document.body.innerText.slice(0, 60000) : ''),
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
    if (password) {
      token = await login(server, password);
      void loadWidget();
    }

    const { text, url } = await pageText();
    if (text.trim().length < 40) {
      show('err', 'This page has no readable tracking text.');
      return;
    }
    btn.textContent = 'Sending to Import Desk…';
    const res = await fetch(`${server}/api/tracking/capture`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ text, url }),
    });
    if (res.status === 401) {
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
      void loadWidget();
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
  const { server } = await cfg();
  $('server').value = server;
  $('toggle').addEventListener('click', () => {
    const s = $('settings');
    s.style.display = s.style.display === 'block' ? 'none' : 'block';
  });
  $('send').addEventListener('click', capture);
  $('open').addEventListener('click', async (e) => {
    e.preventDefault();
    const { server } = await cfg();
    chrome.tabs.create({ url: server });
  });
  void loadWidget();
})();

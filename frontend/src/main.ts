/**
 * DiskStation Monitor — Frontend entry point
 * All window functions declared via global interface extension — no casting needed.
 */

import L from 'leaflet';

// ── Extend Window to accept our global functions ──────────────────────────────
declare global {
  interface Window {
    showPage: (id: string) => void;
    handleLogout: () => Promise<void>;
    openAddDevice: () => void;
    closeAddDevice: () => void;
    submitAddDevice: () => Promise<void>;
    viewDevice: (id: string) => void;
    removeDevice: (id: string) => Promise<void>;
    ackAlert: (id: string) => void;
    dismissAlert: (id: string) => void;
    dismissAllAlerts: () => void;
    revokeToken: (deviceId: string) => void;
    saveSmtp: () => Promise<void>;
    downloadData: () => Promise<void>;
    deleteAccount: () => Promise<void>;
  }
}

// ── Config ────────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const API: string = (import.meta as any).env?.VITE_API_URL ?? 'http://localhost:3001';

// ── Auth guard ────────────────────────────────────────────────────────────────
if (!sessionStorage.getItem('dsm-access-token')) {
  window.location.href = '/dsm-auth.html';
}

// ── Theme ─────────────────────────────────────────────────────────────────────
const saved = localStorage.getItem('dsm-theme') || 'dark';
document.body.setAttribute('data-theme', saved);
const themeBtn = document.getElementById('themeBtn');
if (themeBtn) {
  themeBtn.textContent = saved === 'dark' ? '🌙' : '☀️';
  themeBtn.addEventListener('click', () => {
    const t = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', t);
    localStorage.setItem('dsm-theme', t);
    themeBtn.textContent = t === 'dark' ? '🌙' : '☀️';
  });
}

// ── User avatar ───────────────────────────────────────────────────────────────
const userEmail = sessionStorage.getItem('dsm-current-user') || '';
const avatarBtn = document.getElementById('avatarBtn') as HTMLButtonElement | null;
const dropdown  = document.getElementById('userDropdown');
const emailEl   = document.getElementById('userEmail');
if (avatarBtn && userEmail) {
  avatarBtn.textContent = userEmail[0].toUpperCase();
  if (emailEl) emailEl.textContent = userEmail;
}
avatarBtn?.addEventListener('click', e => { e.stopPropagation(); dropdown?.classList.toggle('open'); });
document.addEventListener('click', () => dropdown?.classList.remove('open'));

// ── Navigation ────────────────────────────────────────────────────────────────
window.showPage = (id: string) => {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
  document.getElementById(`nav-${id.replace('Page', '')}`)?.classList.add('active');
  if (id === 'mapPage')      initMap();
  if (id === 'alertsPage')   void loadAlerts();
  if (id === 'securityPage') void loadSecurity();
};

// ── API helper ────────────────────────────────────────────────────────────────
async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const t = sessionStorage.getItem('dsm-access-token');
  const res = await fetch(`${API}${path}`, {
    ...opts,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}`, ...(opts.headers ?? {}) },
  });
  if (res.status === 401) {
    const refresh = await fetch(`${API}/auth/refresh`, { method: 'POST', credentials: 'include' });
    if (refresh.ok) {
      const data = await refresh.json() as { accessToken: string };
      sessionStorage.setItem('dsm-access-token', data.accessToken);
      return api<T>(path, opts);
    }
    sessionStorage.clear();
    window.location.href = '/dsm-auth.html';
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string };
    throw new Error(err.error || 'Request failed');
  }
  return res.json() as Promise<T>;
}

// ── Logout ────────────────────────────────────────────────────────────────────
window.handleLogout = async () => {
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* ok */ }
  sessionStorage.clear();
  window.location.href = '/dsm-auth.html';
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface PollResult {
  outcome: string; latency_ms: number; ip_observed: string; polled_at: string;
  connections?: { total?: number };
}
interface Device {
  id: string; serial: string; name: string; model: string;
  ip_address: string; port: number; status: string;
  dsm_version: string | null; latitude: number | null; longitude: number | null;
  last_poll: PollResult | null;
}
interface Alert {
  id: string; severity: 'critical' | 'warning' | 'info';
  title: string; message: string; device_name: string;
  created_at: string; acknowledged_at: string | null;
}
interface TokenRecord {
  device_id: string; device_name: string; serial: string;
  label: string; created_at: string; revoked_at: string | null;
}
interface AccessLogRecord {
  event_type: string; ip_address: string; success: boolean; created_at: string;
}

// ── Fleet ─────────────────────────────────────────────────────────────────────
let devices: Device[] = [];

async function loadFleet() {
  try {
    const data = await api<{ devices: Device[] }>('/api/devices');
    devices = data.devices;
    renderFleetTable(devices);
    updateSummaryStrip(devices);
    appendPollLog(devices);
  } catch (err) { console.error('[fleet]', err); }
}

function set(id: string, val: string | number) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(val);
}

function renderFleetTable(devs: Device[]) {
  const tbody = document.getElementById('deviceTableBody');
  if (!tbody) return;
  if (devs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:48px">
      No devices registered yet.<br><small style="margin-top:8px;display:block">Click "+ Add Device" to get started.</small>
    </td></tr>`;
    return;
  }
  tbody.innerHTML = devs.map(d => {
    const sc = d.status === 'online' ? 'online' : d.status === 'offline' ? 'offline' : 'unknown';
    const p  = d.last_poll;
    const tl = Array.from({ length: 20 }, (_, i) =>
      `<div class="poll-tick ${i === 8 ? 'slow' : 'ok'}"></div>`).join('');
    const conns = p?.connections?.total ?? '—';
    return `<tr>
      <td><span class="status-dot ${sc}"></span>${d.status[0].toUpperCase() + d.status.slice(1)}</td>
      <td><strong>${d.name}</strong><br><small style="color:var(--muted)">${d.serial}</small></td>
      <td><span class="tag">${d.model || '—'}</span></td>
      <td>${d.ip_address}:${d.port}</td>
      <td>${d.dsm_version ?? '—'}</td>
      <td><div class="poll-timeline">${tl}</div>${p ? `<small style="color:var(--muted);font-size:10px">${p.latency_ms}ms</small>` : ''}</td>
      <td>${conns}</td>
      <td>
        <button class="btn-sm" onclick="viewDevice('${d.id}')">View</button>
        <button class="btn-sm" onclick="removeDevice('${d.id}')">Remove</button>
      </td>
    </tr>`;
  }).join('');
}

function updateSummaryStrip(devs: Device[]) {
  const online = devs.filter(d => d.status === 'online').length;
  const offline = devs.filter(d => d.status === 'offline').length;
  set('statTotal', devs.length); set('statOnline', online); set('statOffline', offline);
  set('c-total', devs.length);   set('c-online', online);   set('c-offline', offline);
}

function appendPollLog(devs: Device[]) {
  const log = document.getElementById('pollLog');
  if (!log) return;
  const entries = devs.filter(d => d.last_poll).slice(0, 10).map(d => {
    const p = d.last_poll!;
    return `<div class="poll-log-entry">
      <span class="log-time">${new Date(p.polled_at).toLocaleTimeString()}</span>
      <span class="log-device">${d.name}</span>
      <span class="log-status ${p.outcome}">${p.outcome.toUpperCase()}</span>
      <span class="log-latency">${p.latency_ms}ms</span>
    </div>`;
  }).join('');
  log.innerHTML = entries || '<div class="poll-log-entry"><span class="log-time">No polls yet…</span></div>';
  const online = devs.filter(d => d.status === 'online');
  const lats   = online.map(d => d.last_poll?.latency_ms ?? 0).filter(Boolean);
  const avgLat = lats.length ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : 0;
  set('pe-healthy', online.length);
  set('pe-latency', avgLat || '—');
  set('pe-rate',    `${devs.length ? Math.round(online.length / devs.length * 100) : 0}%`);
  set('pe-last',    new Date().toLocaleTimeString());
}

// ── Map ───────────────────────────────────────────────────────────────────────
let mapInitialized = false;
let leafletMap: L.Map | null = null;

function initMap() {
  if (mapInitialized) return;
  mapInitialized = true;
  const el = document.getElementById('fleetMap');
  if (!el) return;
  leafletMap = L.map('fleetMap').setView([20, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors', maxZoom: 18,
  }).addTo(leafletMap);
  devices.forEach(d => {
    if (d.latitude != null && d.longitude != null) {
      const color = d.status === 'online' ? '#34c17a' : d.status === 'offline' ? '#e05252' : '#f5a623';
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:14px;height:14px;background:${color};border-radius:50%;border:2px solid #fff;box-shadow:0 0 6px ${color}"></div>`,
        iconSize: [14, 14], iconAnchor: [7, 7],
      });
      L.marker([d.latitude, d.longitude], { icon })
        .addTo(leafletMap!)
        .bindPopup(`<strong>${d.name}</strong><br>${d.serial}<br>${d.ip_address}:${d.port}<br>Status: ${d.status}`);
    }
  });
}

// ── Alerts ────────────────────────────────────────────────────────────────────
async function loadAlerts() {
  const list = document.getElementById('alertsList');
  if (!list) return;
  try {
    const data   = await api<{ alerts: Alert[] }>('/api/alerts');
    const alerts = data.alerts;
    const badge  = document.getElementById('alertBadge');
    if (badge) { badge.textContent = String(alerts.length); badge.style.display = alerts.length ? '' : 'none'; }
    set('statAlerts', alerts.length); set('c-alerts', alerts.length);
    if (alerts.length === 0) { list.innerHTML = `<div style="color:var(--muted);text-align:center;padding:48px">✅ No active alerts</div>`; return; }
    const icons: Record<string, string> = { critical: '🔴', warning: '🟡', info: '🔵' };
    list.innerHTML = alerts.map(a => `
      <div class="alert-item" id="alert-${a.id}">
        <span class="alert-severity">${icons[a.severity] ?? '🔵'}</span>
        <div style="flex:1">
          <div class="alert-title">${a.title}</div>
          <div class="alert-meta">${a.device_name || 'System'} · ${new Date(a.created_at).toLocaleString()}</div>
          ${a.message ? `<div style="font-size:12px;margin-top:4px;color:var(--muted)">${a.message}</div>` : ''}
        </div>
        <div class="alert-actions">
          ${!a.acknowledged_at ? `<button class="btn-sm" onclick="ackAlert('${a.id}')">Ack</button>` : ''}
          <button class="btn-sm" onclick="dismissAlert('${a.id}')">Dismiss</button>
        </div>
      </div>`).join('');
  } catch { list.innerHTML = `<div style="color:var(--muted)">Failed to load alerts.</div>`; }
}

window.ackAlert       = (id) => { void api(`/api/alerts/${id}/acknowledge`, { method: 'PATCH' }).then(() => loadAlerts()); };
window.dismissAlert   = (id) => { void api(`/api/alerts/${id}`, { method: 'DELETE' }).then(() => { document.getElementById(`alert-${id}`)?.remove(); }); };
window.dismissAllAlerts = () => { void api('/api/alerts', { method: 'DELETE' }).then(() => loadAlerts()); };

// ── Security ──────────────────────────────────────────────────────────────────
async function loadSecurity() {
  try {
    const [toks, logs] = await Promise.all([
      api<{ tokens: TokenRecord[] }>('/api/security/tokens'),
      api<{ logs: AccessLogRecord[] }>('/api/security/access-log'),
    ]);
    const tb = document.getElementById('tokenTableBody');
    if (tb) tb.innerHTML = toks.tokens.map(t => `<tr>
      <td>${t.device_name}</td><td><code style="font-size:11px">${t.serial}</code></td>
      <td>${t.label}</td><td>${new Date(t.created_at).toLocaleDateString()}</td>
      <td><span style="color:${t.revoked_at ? 'var(--red)' : 'var(--green)'}">${t.revoked_at ? 'Revoked' : 'Active'}</span></td>
      <td>${!t.revoked_at ? `<button class="btn-sm" style="color:var(--red)" onclick="revokeToken('${t.device_id}')">Revoke</button>` : '—'}</td>
    </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px">No tokens</td></tr>';
    const lb = document.getElementById('accessLogBody');
    if (lb) lb.innerHTML = logs.logs.map(l => `<tr>
      <td>${l.event_type}</td><td>${l.ip_address || '—'}</td>
      <td style="color:${l.success ? 'var(--green)' : 'var(--red)'}">${l.success ? 'Success' : 'Failed'}</td>
      <td>${new Date(l.created_at).toLocaleString()}</td>
    </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:24px">No logs</td></tr>';
  } catch { /* ok */ }
}

window.revokeToken = (deviceId) => {
  if (!confirm('Revoke this token? Polling will stop until a new token is registered.')) return;
  void api(`/api/devices/${deviceId}/token`, { method: 'DELETE' }).then(() => loadSecurity());
};

// ── Add Device ────────────────────────────────────────────────────────────────
window.openAddDevice  = () => document.getElementById('addDeviceModal')?.classList.add('open');
window.closeAddDevice = () => document.getElementById('addDeviceModal')?.classList.remove('open');

window.submitAddDevice = async () => {
  const g = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null)?.value.trim() ?? '';
  const serial = g('devSerial'), name = g('devName'), ipAddress = g('devIp');
  const port = Number(g('devPort')) || 5001, protocol = g('devProtocol');
  const token = g('devToken'), scopeRaw = g('devScope'), locationName = g('devLocation');
  const msgEl = document.getElementById('addDeviceMsg');
  const btn   = document.getElementById('addDeviceBtn') as HTMLButtonElement | null;
  if (!serial || !name || !ipAddress || !token) {
    if (msgEl) { msgEl.textContent = 'Serial, name, IP, and token are required.'; msgEl.style.display = 'block'; }
    return;
  }
  const scanScope = scopeRaw ? scopeRaw.split('\n').map(s => s.trim()).filter(Boolean) : [];
  if (btn) { btn.disabled = true; btn.textContent = 'Registering…'; }
  try {
    await api('/api/devices', { method: 'POST', body: JSON.stringify({ serial, name, ipAddress, port, protocol, token, scanScope, locationName }) });
    window.closeAddDevice();
    void loadFleet();
    if (msgEl) msgEl.style.display = 'none';
  } catch (err) {
    if (msgEl) { msgEl.textContent = (err as Error).message; msgEl.style.display = 'block'; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Register Device'; }
  }
};

window.viewDevice   = (_id) => window.showPage('integrityPage');
window.removeDevice = async (id) => {
  if (!confirm('Remove this device? All poll history will be deleted.')) return;
  try { await api(`/api/devices/${id}`, { method: 'DELETE' }); void loadFleet(); } catch { /* ok */ }
};

// ── Settings ──────────────────────────────────────────────────────────────────
window.saveSmtp = async () => {
  const g = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value.trim() ?? '';
  const msg = document.getElementById('smtpMsg');
  try {
    await api('/api/settings/smtp', { method: 'PUT', body: JSON.stringify({
      host: g('smtpHost'), port: Number(g('smtpPort')) || 587,
      username: g('smtpUser'), password: g('smtpPass'), fromName: g('smtpFromName'),
    })});
    if (msg) msg.style.display = 'block';
  } catch { /* ok */ }
};

window.downloadData = async () => {
  try {
    const t   = sessionStorage.getItem('dsm-access-token');
    const res = await fetch(`${API}/api/account/export`, { headers: { Authorization: `Bearer ${t ?? ''}` }, credentials: 'include' });
    const a   = document.createElement('a');
    a.href     = URL.createObjectURL(await res.blob());
    a.download = 'dsm-data-export.json';
    a.click();
  } catch { /* ok */ }
};

window.deleteAccount = async () => {
  if (prompt('Type DELETE to permanently erase your account:') !== 'DELETE') return;
  try {
    await api('/api/account', { method: 'DELETE', body: JSON.stringify({ confirm: 'DELETE' }) });
    sessionStorage.clear();
    window.location.href = '/dsm-auth.html';
  } catch { /* ok */ }
};

// ── Boot ──────────────────────────────────────────────────────────────────────
void loadFleet();
setInterval(() => { void loadFleet(); }, 8000);

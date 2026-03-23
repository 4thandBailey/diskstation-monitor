/**
 * DiskStation Monitor — Frontend entry point
 * Handles: auth guard, API calls, fleet table, map, alerts, security page
 */

import L from 'leaflet';

const API = (import.meta as Record<string, unknown>).env?.VITE_API_URL as string || 'http://localhost:3001';

// ── Auth guard ────────────────────────────────────────────────────────────────
const token = sessionStorage.getItem('dsm-access-token');
if (!token) {
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

// ── User dropdown ─────────────────────────────────────────────────────────────
const email = sessionStorage.getItem('dsm-current-user') || '';
const avatarBtn = document.getElementById('avatarBtn') as HTMLButtonElement;
const dropdown  = document.getElementById('userDropdown');
const userEmailEl = document.getElementById('userEmail');

if (avatarBtn && email) {
  avatarBtn.textContent = email[0].toUpperCase();
  if (userEmailEl) userEmailEl.textContent = email;
}

avatarBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  dropdown?.classList.toggle('open');
});
document.addEventListener('click', () => dropdown?.classList.remove('open'));

// ── Navigation ────────────────────────────────────────────────────────────────
(window as Record<string, unknown>).showPage = (id: string) => {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
  const navKey = id.replace('Page', '');
  document.getElementById(`nav-${navKey}`)?.classList.add('active');

  // Load page-specific data
  if (id === 'mapPage') initMap();
  if (id === 'alertsPage') loadAlerts();
  if (id === 'securityPage') loadSecurity();
};

// ── API helper ────────────────────────────────────────────────────────────────
async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const t = sessionStorage.getItem('dsm-access-token');
  const res = await fetch(`${API}${path}`, {
    ...opts,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${t}`,
      ...(opts.headers || {}),
    },
  });

  if (res.status === 401) {
    // Try to refresh
    const refresh = await fetch(`${API}/auth/refresh`, { method: 'POST', credentials: 'include' });
    if (refresh.ok) {
      const data = await refresh.json();
      sessionStorage.setItem('dsm-access-token', data.accessToken);
      return api<T>(path, opts); // retry once
    }
    sessionStorage.clear();
    window.location.href = '/dsm-auth.html';
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }

  return res.json();
}

// ── Logout ────────────────────────────────────────────────────────────────────
(window as Record<string, unknown>).handleLogout = async () => {
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* ok */ }
  sessionStorage.clear();
  window.location.href = '/dsm-auth.html';
};

// ── Load fleet ────────────────────────────────────────────────────────────────
let devices: Device[] = [];

interface Device {
  id: string;
  serial: string;
  name: string;
  model: string;
  ip_address: string;
  port: number;
  protocol: string;
  status: string;
  dsm_version: string | null;
  latitude: number | null;
  longitude: number | null;
  location_name: string | null;
  last_poll: PollResult | null;
}

interface PollResult {
  outcome: string;
  latency_ms: number;
  ip_observed: string;
  polled_at: string;
  cpu_percent?: number;
  ram_percent?: number;
  connections?: Record<string, unknown>;
}

async function loadFleet() {
  try {
    const data = await api<{ devices: Device[] }>('/api/devices');
    devices = data.devices;
    renderFleetTable(devices);
    updateSummaryStrip(devices);
    appendPollLog(devices);
  } catch (err) {
    console.error('[fleet]', err);
  }
}

function renderFleetTable(devs: Device[]) {
  const tbody = document.getElementById('deviceTableBody');
  if (!tbody) return;

  if (devs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:48px">
      No devices registered yet.<br><small style="margin-top:8px;display:block">Click "+ Add Device" to register your first Synology appliance.</small>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = devs.map(d => {
    const statusClass = d.status === 'online' ? 'online' : d.status === 'offline' ? 'offline' : 'unknown';
    const poll = d.last_poll;
    const timeline = generateTimeline(d.id);
    const conns = (poll?.connections as Record<string, unknown>)?.total ?? '—';

    return `<tr>
      <td><span class="status-dot ${statusClass}"></span>${capitalize(d.status)}</td>
      <td><strong>${d.name}</strong><br><small style="color:var(--muted)">${d.serial}</small></td>
      <td><span class="tag">${d.model || '—'}</span></td>
      <td>${d.ip_address}:${d.port}</td>
      <td>${d.dsm_version || '—'}</td>
      <td>
        <div class="poll-timeline">${timeline}</div>
        ${poll ? `<small style="color:var(--muted);font-size:10px">${poll.latency_ms}ms</small>` : ''}
      </td>
      <td>${conns}</td>
      <td>
        <button class="btn-sm" onclick="viewDevice('${d.id}')">View</button>
        <button class="btn-sm" onclick="removeDevice('${d.id}')">Remove</button>
      </td>
    </tr>`;
  }).join('');
}

function generateTimeline(deviceId: string): string {
  // Placeholder — in a full implementation, fetch 20-tick history per device
  const outcomes = ['ok','ok','ok','ok','ok','ok','ok','ok','slow','ok','ok','ok','ok','ok','ok','ok','ok','ok','ok','ok'];
  return outcomes.map(o => `<div class="poll-tick ${o}" title="${o}"></div>`).join('');
}

function updateSummaryStrip(devs: Device[]) {
  const online  = devs.filter(d => d.status === 'online').length;
  const offline = devs.filter(d => d.status === 'offline').length;

  const set = (id: string, val: string | number) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(val);
  };

  set('statTotal',   devs.length);
  set('statOnline',  online);
  set('statOffline', offline);
  set('c-total',     devs.length);
  set('c-online',    online);
  set('c-offline',   offline);
}

function appendPollLog(devs: Device[]) {
  const log = document.getElementById('pollLog');
  if (!log) return;

  const entries = devs
    .filter(d => d.last_poll)
    .slice(0, 10)
    .map(d => {
      const p = d.last_poll!;
      const t = new Date(p.polled_at).toLocaleTimeString();
      return `<div class="poll-log-entry">
        <span class="log-time">${t}</span>
        <span class="log-device">${d.name}</span>
        <span class="log-status ${p.outcome}">${p.outcome.toUpperCase()}</span>
        <span class="log-latency">${p.latency_ms}ms</span>
      </div>`;
    }).join('');

  log.innerHTML = entries || '<div class="poll-log-entry"><span class="log-time">No polls yet…</span></div>';

  // Poll summary
  if (devs.length > 0) {
    const online = devs.filter(d => d.status === 'online');
    const latencies = online.map(d => d.last_poll?.latency_ms || 0).filter(Boolean);
    const avgLat = latencies.length ? Math.round(latencies.reduce((a,b) => a+b,0) / latencies.length) : 0;
    const rate = devs.length ? Math.round((online.length / devs.length) * 100) : 0;

    const set = (id: string, val: string | number) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(val);
    };
    set('pe-healthy', online.length);
    set('pe-latency', avgLat || '—');
    set('pe-rate', `${rate}%`);
    set('pe-last', new Date().toLocaleTimeString());
  }
}

// ── Fleet map ─────────────────────────────────────────────────────────────────
let mapInitialized = false;
let leafletMap: L.Map | null = null;

function initMap() {
  if (mapInitialized) return;
  mapInitialized = true;

  const el = document.getElementById('fleetMap');
  if (!el) return;

  leafletMap = L.map('fleetMap', { zoomControl: true }).setView([20, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 18,
  }).addTo(leafletMap);

  devices.forEach(d => {
    if (d.latitude && d.longitude) {
      const color = d.status === 'online' ? '#34c17a' : d.status === 'offline' ? '#e05252' : '#f5a623';
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:14px;height:14px;background:${color};border-radius:50%;border:2px solid #fff;box-shadow:0 0 6px ${color}"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      L.marker([d.latitude, d.longitude], { icon })
        .addTo(leafletMap!)
        .bindPopup(`<strong>${d.name}</strong><br>${d.serial}<br>${d.ip_address}:${d.port}<br>Status: ${d.status}`);
    }
  });
}

// ── Alerts ────────────────────────────────────────────────────────────────────
interface Alert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  device_name: string;
  created_at: string;
  acknowledged_at: string | null;
}

async function loadAlerts() {
  const list = document.getElementById('alertsList');
  if (!list) return;

  try {
    const data = await api<{ alerts: Alert[] }>('/api/alerts');
    const alerts = data.alerts;

    // Update badge
    const badge = document.getElementById('alertBadge');
    const statAlerts = document.getElementById('statAlerts');
    if (badge) { badge.textContent = String(alerts.length); badge.style.display = alerts.length ? '' : 'none'; }
    if (statAlerts) statAlerts.textContent = String(alerts.length);
    document.getElementById('c-alerts')!.textContent = String(alerts.length);

    if (alerts.length === 0) {
      list.innerHTML = `<div style="color:var(--muted);text-align:center;padding:48px">✅ No active alerts</div>`;
      return;
    }

    const icons: Record<string, string> = { critical: '🔴', warning: '🟡', info: '🔵' };
    list.innerHTML = alerts.map(a => `
      <div class="alert-item" id="alert-${a.id}">
        <span class="alert-severity">${icons[a.severity] || '🔵'}</span>
        <div style="flex:1">
          <div class="alert-title">${a.title}</div>
          <div class="alert-meta">${a.device_name || 'System'} · ${new Date(a.created_at).toLocaleString()}</div>
          ${a.message ? `<div style="font-size:12px;margin-top:4px;color:var(--muted)">${a.message}</div>` : ''}
        </div>
        <div class="alert-actions">
          ${!a.acknowledged_at ? `<button class="btn-sm" onclick="ackAlert('${a.id}')">Ack</button>` : ''}
          <button class="btn-sm" onclick="dismissAlert('${a.id}')">Dismiss</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = `<div style="color:var(--muted)">Failed to load alerts.</div>`;
  }
}

(window as Record<string, unknown>).ackAlert = async (id: string) => {
  try {
    await api(`/api/alerts/${id}/acknowledge`, { method: 'PATCH' });
    loadAlerts();
  } catch { /* ok */ }
};

(window as Record<string, unknown>).dismissAlert = async (id: string) => {
  try {
    await api(`/api/alerts/${id}`, { method: 'DELETE' });
    document.getElementById(`alert-${id}`)?.remove();
  } catch { /* ok */ }
};

(window as Record<string, unknown>).dismissAllAlerts = async () => {
  try {
    await api('/api/alerts', { method: 'DELETE' });
    loadAlerts();
  } catch { /* ok */ }
};

// ── Security ──────────────────────────────────────────────────────────────────
async function loadSecurity() {
  try {
    const [tokens, logs] = await Promise.all([
      api<{ tokens: TokenRecord[] }>('/api/security/tokens'),
      api<{ logs: AccessLogRecord[] }>('/api/security/access-log'),
    ]);

    const tokenBody = document.getElementById('tokenTableBody');
    if (tokenBody) {
      tokenBody.innerHTML = tokens.tokens.map(t => `<tr>
        <td>${t.device_name}</td>
        <td><code style="font-size:11px">${t.serial}</code></td>
        <td>${t.label}</td>
        <td>${new Date(t.created_at).toLocaleDateString()}</td>
        <td><span style="color:${t.revoked_at ? 'var(--red)' : 'var(--green)'}">${t.revoked_at ? 'Revoked' : 'Active'}</span></td>
        <td>${!t.revoked_at ? `<button class="btn-sm" style="color:var(--red)" onclick="revokeToken('${t.device_id}')">Revoke</button>` : '—'}</td>
      </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px">No tokens</td></tr>';
    }

    const logBody = document.getElementById('accessLogBody');
    if (logBody) {
      logBody.innerHTML = logs.logs.map(l => `<tr>
        <td>${l.event_type}</td>
        <td>${l.ip_address || '—'}</td>
        <td style="color:${l.success ? 'var(--green)' : 'var(--red)'}">${l.success ? 'Success' : 'Failed'}</td>
        <td>${new Date(l.created_at).toLocaleString()}</td>
      </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:24px">No logs</td></tr>';
    }
  } catch { /* ok */ }
}

interface TokenRecord { device_id: string; device_name: string; serial: string; label: string; created_at: string; revoked_at: string | null; }
interface AccessLogRecord { event_type: string; ip_address: string; success: boolean; created_at: string; }

(window as Record<string, unknown>).revokeToken = async (deviceId: string) => {
  if (!confirm('Revoke this token? The device will stop polling until a new token is registered.')) return;
  try {
    await api(`/api/devices/${deviceId}/token`, { method: 'DELETE' });
    loadSecurity();
  } catch { /* ok */ }
};

// ── Add Device ────────────────────────────────────────────────────────────────
(window as Record<string, unknown>).openAddDevice  = () => document.getElementById('addDeviceModal')?.classList.add('open');
(window as Record<string, unknown>).closeAddDevice = () => document.getElementById('addDeviceModal')?.classList.remove('open');

(window as Record<string, unknown>).submitAddDevice = async () => {
  const serial   = (document.getElementById('devSerial') as HTMLInputElement).value.trim();
  const name     = (document.getElementById('devName')   as HTMLInputElement).value.trim();
  const ipAddress= (document.getElementById('devIp')     as HTMLInputElement).value.trim();
  const port     = Number((document.getElementById('devPort') as HTMLInputElement).value) || 5001;
  const protocol = (document.getElementById('devProtocol') as HTMLSelectElement).value;
  const token    = (document.getElementById('devToken')  as HTMLInputElement).value.trim();
  const scopeRaw = (document.getElementById('devScope')  as HTMLTextAreaElement).value.trim();
  const locationName = (document.getElementById('devLocation') as HTMLInputElement).value.trim();

  const msgEl = document.getElementById('addDeviceMsg');
  const btn   = document.getElementById('addDeviceBtn') as HTMLButtonElement;

  if (!serial || !name || !ipAddress || !token) {
    if (msgEl) { msgEl.textContent = 'Serial, name, IP, and token are required.'; msgEl.style.display = 'block'; }
    return;
  }

  const scanScope = scopeRaw ? scopeRaw.split('\n').map(s => s.trim()).filter(Boolean) : [];

  btn.disabled = true;
  btn.textContent = 'Registering…';

  try {
    await api('/api/devices', {
      method: 'POST',
      body: JSON.stringify({ serial, name, ipAddress, port, protocol, token, scanScope, locationName }),
    });

    (window as Record<string, unknown>).closeAddDevice?.();
    loadFleet();
    if (msgEl) msgEl.style.display = 'none';
  } catch (err) {
    if (msgEl) { msgEl.textContent = (err as Error).message; msgEl.style.display = 'block'; }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Register Device';
  }
};

(window as Record<string, unknown>).removeDevice = async (id: string) => {
  if (!confirm('Remove this device? All poll history and integrity logs will be deleted.')) return;
  try {
    await api(`/api/devices/${id}`, { method: 'DELETE' });
    loadFleet();
  } catch { /* ok */ }
};

(window as Record<string, unknown>).viewDevice = (id: string) => {
  (window as Record<string, unknown>).showPage?.('integrityPage');
  // TODO: load per-device integrity detail
};

// ── Settings ──────────────────────────────────────────────────────────────────
(window as Record<string, unknown>).saveSmtp = async () => {
  const host     = (document.getElementById('smtpHost')     as HTMLInputElement).value.trim();
  const port     = Number((document.getElementById('smtpPort') as HTMLInputElement).value) || 587;
  const username = (document.getElementById('smtpUser')     as HTMLInputElement).value.trim();
  const password = (document.getElementById('smtpPass')     as HTMLInputElement).value;
  const fromName = (document.getElementById('smtpFromName') as HTMLInputElement).value.trim();
  const msg      = document.getElementById('smtpMsg');

  try {
    await api('/api/settings/smtp', { method: 'PUT', body: JSON.stringify({ host, port, username, password, fromName }) });
    if (msg) msg.style.display = 'block';
  } catch { /* ok */ }
};

(window as Record<string, unknown>).downloadData = async () => {
  try {
    const t = sessionStorage.getItem('dsm-access-token');
    const res = await fetch(`${API}/api/account/export`, { headers: { Authorization: `Bearer ${t}` }, credentials: 'include' });
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'dsm-data-export.json'; a.click();
    URL.revokeObjectURL(url);
  } catch { /* ok */ }
};

(window as Record<string, unknown>).deleteAccount = async () => {
  const confirm1 = prompt('Type DELETE to permanently erase your account and all data:');
  if (confirm1 !== 'DELETE') return;
  try {
    await api('/api/account', { method: 'DELETE', body: JSON.stringify({ confirm: 'DELETE' }) });
    sessionStorage.clear();
    window.location.href = '/dsm-auth.html';
  } catch { /* ok */ }
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}

// ── Boot ──────────────────────────────────────────────────────────────────────
loadFleet();

// Auto-refresh fleet every 8 seconds
setInterval(loadFleet, 8000);

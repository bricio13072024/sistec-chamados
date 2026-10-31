'use strict';
/* SISTEC Chamados — interface (SPA sem dependências) */

// ============================================================ utilidades
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const linkify = s => esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
const pad = n => String(n).padStart(2, '0');
const OPEN = ['aberto', 'em_andamento', 'aguardando'];

const state = {
  me: null, meta: null, users: [], usersById: {}, online: new Set(), rooms: [],
  currentRoom: null, es: null, route: null, ticketFilter: { status: null, priority: '', q: '', station: '' },
  ticketFiles: [], appName: 'SISTEC Chamados',
};
const isAdmin = () => state.me?.role === 'admin';

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method, credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* sem corpo */ }
  if (res.status === 401 && path !== '/login') { showLogin(); throw new Error(data?.error || 'Sessão expirada'); }
  if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
  return data;
}

// ---- datas
const fmtDT = iso => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtTime = iso => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
function fmtDay(iso) {
  const d = new Date(iso), t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((t - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { weekday: diff < 7 ? 'long' : undefined, day: '2-digit', month: 'long' });
}
function timeAgo(iso) {
  if (!iso) return 'nunca';
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `há ${Math.floor(s / 86400)} dia${s >= 172800 ? 's' : ''}`;
  return new Date(iso).toLocaleDateString('pt-BR');
}
function dur(ms) {
  const m = Math.max(1, Math.round(ms / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h${m % 60 ? ` ${pad(m % 60)}min` : ''}`;
  return `${Math.floor(h / 24)} dias`;
}
function dueInfo(t) {
  if (!OPEN.includes(t.status)) return { cls: '', text: fmtDT(t.dueAt) };
  const diff = new Date(t.dueAt) - Date.now();
  if (diff < 0) return { cls: 'late', text: `Atrasado há ${dur(-diff)}` };
  return { cls: diff < 2 * 3600e3 ? 'soon' : '', text: `Vence em ${dur(diff)}` };
}
const toLocalInput = iso => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtSize = b => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`;

// ---- ícones (traço)
const IC = {
  dash: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  list: '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  menu: '<path d="M3 12h18M3 6h18M3 18h18"/>',
  clip: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>',
  refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/>',
  back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  hash: '<path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18"/>',
  tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><path d="M7 7h.01"/>',
  tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
};
const icon = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n] || ''}</svg>`;

// ---- avatares
const AV_COLORS = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#0d9488', '#4f46e5', '#0891b2', '#65a30d', '#c026d3', '#475569'];
function initials(u) {
  if (!u) return '?';
  if (/^sistec\d+$/i.test(u.username || '') && /^Estação /.test(u.name)) return (u.username || '').slice(-2);
  const p = String(u.name || u.username).trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}
function avatar(u, { size = '', dot = false } = {}) {
  if (!u) return `<span class="avatar ${size}" style="background:#94a3b8">${icon('tool')}</span>`;
  let h = 0; for (const c of String(u.username || u.id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const bg = u.role === 'admin' ? '#0f172a' : AV_COLORS[h % AV_COLORS.length];
  return `<span class="avatar ${size}" style="background:${bg}">${esc(initials(u))}${dot ? `<i class="online-dot ${state.online.has(u.id) ? 'on' : ''}" data-online-uid="${u.id}"></i>` : ''}</span>`;
}
const statusLabel = k => state.meta?.statuses.find(s => s.key === k)?.label || k;
const prioLabel = k => state.meta?.priorities.find(s => s.key === k)?.label || k;
const statusBadge = k => `<span class="badge st-${k}">${esc(statusLabel(k))}</span>`;
const prioBadge = k => `<span class="pr pr-${k}"><i><b></b><b></b><b></b><b></b></i>${esc(prioLabel(k))}</span>`;
const stationTag = s => `<span class="station">${esc(String(s).toUpperCase())}</span>`;

// ---- toasts, modais
function toast(title, text = '', type = 'info', onClick) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<div><b>${esc(title)}</b>${text ? `<span>${esc(text)}</span>` : ''}</div>`;
  el.onclick = () => { el.remove(); onClick?.(); };
  $('#toasts').append(el);
  setTimeout(() => el.remove(), type === 'err' ? 7000 : 5000);
}
function openModal({ title, desc = '', body = '', foot = '', closable = true, wide = false }) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true" ${wide ? 'style="max-width:620px"' : ''}>
    <div class="modal-head"><h3>${esc(title)}</h3>${desc ? `<p>${desc}</p>` : ''}</div>
    <div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div>`;
  const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape' && closable) close(); };
  if (closable) bg.addEventListener('mousedown', e => { if (e.target === bg) close(); });
  document.addEventListener('keydown', onKey);
  $('#modal-root').append(bg);
  setTimeout(() => $('input,textarea,select', bg)?.focus(), 30);
  return { el: bg, close };
}
function confirmDialog(title, desc, okLabel = 'Confirmar', danger = false) {
  return new Promise(resolve => {
    const m = openModal({ title, desc, foot: `<button class="btn" data-x>Cancelar</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(okLabel)}</button>` });
    $('[data-x]', m.el).onclick = () => { m.close(); resolve(false); };
    $('[data-ok]', m.el).onclick = () => { m.close(); resolve(true); };
  });
}
async function withBusy(btn, fn) {
  const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = 'Aguarde…';
  try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = old; }
}

// ---- anexos (leitura local → base64)
const MAX_FILE = 10 * 1024 * 1024;
function readFiles(fileList) {
  return Promise.all([...fileList].map(f => new Promise(resolve => {
    if (f.size > MAX_FILE) { toast('Arquivo muito grande', `${f.name} passa de 10 MB`, 'err'); return resolve(null); }
    const r = new FileReader();
    r.onload = () => resolve({ name: f.name || `print-${Date.now()}.png`, type: f.type || 'application/octet-stream', size: f.size, data: r.result });
    r.onerror = () => resolve(null);
    r.readAsDataURL(f);
  }))).then(a => a.filter(Boolean));
}
const fileChips = (files, attr = 'data-rm') => files.map((f, i) => `<span class="file-chip">${icon('clip')}<span title="${esc(f.name)}">${esc(f.name)}</span><small class="muted">${fmtSize(f.size)}</small><button type="button" ${attr}="${i}" aria-label="Remover">×</button></span>`).join('');
function attachmentsHtml(list) {
  if (!list?.length) return '';
  return `<div class="att-grid">${list.map(a => a.mime.startsWith('image/')
    ? `<a class="att img" href="/api/attachments/${a.id}" target="_blank" title="${esc(a.filename)}"><img src="/api/attachments/${a.id}" alt="${esc(a.filename)}" loading="lazy"><span>${esc(a.filename)}</span></a>`
    : `<a class="att" href="/api/attachments/${a.id}${a.mime === 'application/pdf' ? '' : '?download'}" target="_blank">${icon('clip')}<span>${esc(a.filename)}</span><small class="muted">${fmtSize(a.size)}</small></a>`).join('')}</div>`;
}

// ---- som e título (avisos de mensagens)
let audioCtx;
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(880, audioCtx.currentTime); o.frequency.setValueAtTime(1175, audioCtx.currentTime + 0.09);
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.15, audioCtx.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.3);
    o.connect(g).connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + 0.32);
  } catch { /* sem áudio */ }
}
function updateTitle() {
  const n = state.rooms.reduce((s, r) => s + r.unread, 0);
  document.title = `${n ? `(${n}) ` : ''}${state.appName}`;
  const b = $('#chat-badge');
  if (b) { b.textContent = n > 99 ? '99+' : n; b.classList.toggle('hidden', !n); }
}

// ============================================================ login e primeiro acesso
async function showLogin() {
  state.es?.close(); state.es = null; state.me = null;
  $('#app').classList.add('hidden');
  $('#modal-root').innerHTML = '';
  $('#login-screen').classList.remove('hidden');
  try {
    const p = await fetch('/api/public').then(r => r.json());
    state.appName = p.appName; $$('.app-name').forEach(e => e.textContent = p.appName); document.title = p.appName;
    $('#station-list').innerHTML = p.stations.map(s => `<option value="${esc(s)}">`).join('');
  } catch { /* offline */ }
  $('[name=username]', $('#login-form')).focus();
}
$('#login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, btn = $('button', f);
  $('#login-error').textContent = '';
  try {
    await withBusy(btn, () => api('/login', { method: 'POST', body: { username: f.username.value.trim(), password: f.password.value } }));
    f.password.value = '';
    boot();
  } catch (err) { $('#login-error').textContent = err.message; }
});

function onboarding() {
  return new Promise(resolve => {
    const me = state.me;
    const defaultName = /^Estação /.test(me.name) ? '' : me.name;
    const m = openModal({
      title: `Bem-vindo(a) à estação ${me.username.toUpperCase()}`, closable: false,
      desc: 'Primeiro acesso: informe quem usa esta estação e o e-mail que vai receber as notificações dos chamados. Depois, crie sua senha.',
      body: `<form id="ob-form">
        <div class="field"><label>Seu nome completo<input name="name" value="${esc(defaultName)}" required placeholder="ex.: Ana Souza"></label></div>
        <div class="field"><label>Seu e-mail<input name="email" type="email" value="${esc(me.email)}" required placeholder="nome@empresa.com.br"></label></div>
        <div class="field"><label>Senha atual<input name="current" type="password" required placeholder="A senha inicial informada pelo TI"></label></div>
        <div class="grid-2"><div class="field"><label>Nova senha<input name="password" type="password" minlength="6" required></label></div>
        <div class="field"><label>Confirmar nova senha<input name="confirm" type="password" minlength="6" required></label></div></div>
        <div class="form-error" id="ob-err"></div></form>`,
      foot: `<button class="btn" data-out>Sair</button><button class="btn btn-primary" form="ob-form" type="submit">Salvar e continuar</button>`,
    });
    $('[data-out]', m.el).onclick = () => logout();
    $('#ob-form').onsubmit = async e => {
      e.preventDefault();
      const f = e.target;
      if (f.password.value !== f.confirm.value) { $('#ob-err').textContent = 'As senhas não conferem'; return; }
      try {
        const r = await api('/me/setup', { method: 'POST', body: { name: f.name.value, email: f.email.value, current: f.current.value, password: f.password.value } });
        state.me = r.user; m.close(); resolve();
      } catch (err) { $('#ob-err').textContent = err.message; }
    };
  });
}

async function logout() {
  try { await api('/logout', { method: 'POST' }); } catch { /* já saiu */ }
  location.hash = '';
  showLogin();
}

// ============================================================ inicialização
async function boot() {
  let me;
  try { me = await api('/me'); } catch { return showLogin(); }
  state.me = me.user; state.online = new Set(me.online);
  $('#login-screen').classList.add('hidden');
  if (state.me.mustChange) await onboarding();
  try {
    state.meta = await api('/meta');
    state.appName = state.meta.appName; $$('.app-name').forEach(e => e.textContent = state.appName);
    await Promise.all([loadUsers(), loadRooms()]);
  } catch (err) { toast('Erro ao carregar', err.message, 'err'); return; }
  renderShell();
  connectStream();
  $('#app').classList.remove('hidden');
  if (!location.hash || location.hash === '#') location.hash = '#/dashboard'; else route();
}
async function loadUsers() {
  state.users = await api('/users');
  state.usersById = Object.fromEntries(state.users.map(u => [u.id, u]));
}
async function loadRooms() { state.rooms = await api('/chat/rooms'); updateTitle(); }

function renderShell() {
  const me = state.me;
  const link = (href, ic, label, extra = '') => `<a class="nav-link" href="${href}" data-nav="${href.split('/')[1]}">${icon(ic)}<span>${label}</span>${extra}</a>`;
  $('#nav').innerHTML = [
    link('#/dashboard', 'dash', 'Painel'),
    link('#/chamados', 'list', isAdmin() ? 'Todos os chamados' : 'Meus chamados'),
    link('#/novo', 'plus', 'Abrir chamado'),
    link('#/chat', 'chat', 'Chat interno', '<span class="badge-count hidden" id="chat-badge"></span>'),
    isAdmin() ? `<div class="nav-section">Supervisão</div>${link('#/usuarios', 'monitor', 'Estações e usuários')}${link('#/config', 'settings', 'Configurações')}` : '',
  ].join('');
  $('#sidebar-user').innerHTML = `${avatar(me)}<a class="who" href="#/perfil" style="text-decoration:none"><b>${esc(me.name)}</b><span>${isAdmin() ? 'Supervisor de TI' : esc(me.username.toUpperCase())}</span></a>
    <button class="icon-btn" id="logout-btn" title="Sair">${icon('logout')}</button>`;
  $('#logout-btn').onclick = logout;
  $('#menu-btn').innerHTML = icon('menu');
  $('#menu-btn').onclick = () => $('#sidebar').classList.toggle('open');
  updateTitle();
}

// ============================================================ tempo real
function connectStream() {
  state.es?.close();
  const es = new EventSource('/api/stream');
  state.es = es;
  es.onopen = () => $('#conn').classList.add('on');
  es.onerror = () => $('#conn').classList.remove('on');
  es.addEventListener('presence', e => {
    state.online = new Set(JSON.parse(e.data).online);
    $$('[data-online-uid]').forEach(el => el.classList.toggle('on', state.online.has(Number(el.dataset.onlineUid))));
    $$('[data-presence-uid]').forEach(el => { const on = state.online.has(Number(el.dataset.presenceUid)); el.className = on ? 'pill-on' : 'pill-off'; el.textContent = on ? 'Online' : `Visto ${timeAgo(state.usersById[el.dataset.presenceUid]?.lastSeen)}`; });
  });
  es.addEventListener('chat', e => onChatMessage(JSON.parse(e.data)));
  es.addEventListener('typing', e => onTyping(JSON.parse(e.data)));
  es.addEventListener('ticket', e => onTicketEvent(JSON.parse(e.data)));
}

function onTicketEvent(d) {
  const mine = d.by === state.me.id;
  if (!mine) {
    const go = () => location.hash = `#/chamado/${d.id}`;
    if (d.action === 'created' && isAdmin()) { toast(`Novo chamado ${d.code}`, `${String(d.station).toUpperCase()} — ${d.title}`, 'info', go); beep(); }
    else if (d.action === 'comment') { toast(`Nova mensagem no ${d.code}`, d.byName, 'info', go); beep(); }
    else if (d.action === 'updated' && !isAdmin()) toast('Seu chamado foi atualizado', 'Clique para ver', 'info', go);
    else if (d.action === 'overdue' && isAdmin()) toast(`Prazo vencido: ${d.code}`, d.title, 'err', go);
  }
  const r = state.route?.name;
  if (r === 'dashboard' || r === 'tickets') route({ quiet: true });
  else if (r === 'ticket' && Number(state.route.m[1]) === d.id && !mine) route({ quiet: true });
}

// ============================================================ roteador
const ROUTES = [
  { re: /^#\/dashboard$/, name: 'dashboard', nav: 'dashboard', fn: viewDashboard },
  { re: /^#\/chamados$/, name: 'tickets', nav: 'chamados', fn: viewTickets },
  { re: /^#\/chamado\/(\d+)$/, name: 'ticket', nav: 'chamados', fn: viewTicket },
  { re: /^#\/novo$/, name: 'new', nav: 'novo', fn: viewNew },
  { re: /^#\/chat(?:\/(.+))?$/, name: 'chat', nav: 'chat', fn: viewChat, flush: true },
  { re: /^#\/usuarios$/, name: 'users', nav: 'usuarios', fn: viewUsers, admin: true },
  { re: /^#\/config$/, name: 'settings', nav: 'config', fn: viewSettings, admin: true },
  { re: /^#\/perfil$/, name: 'profile', nav: 'perfil', fn: viewProfile },
];
let routeSeq = 0;
async function route(opts = {}) {
  if (!state.me || !state.meta) return;
  $('#sidebar').classList.remove('open');
  const [path, qs] = (location.hash || '#/dashboard').split('?');
  const params = new URLSearchParams(qs || '');
  const r = ROUTES.find(x => x.re.test(path));
  if (!r || (r.admin && !isAdmin())) { location.hash = '#/dashboard'; return; }
  const m = r.re.exec(path);
  $$('.nav-link').forEach(a => a.classList.toggle('active', a.dataset.nav === r.nav));
  const leavingChat = state.route?.name === 'chat' && r.name !== 'chat';
  if (leavingChat) state.currentRoom = null;
  state.route = { name: r.name, m, params };
  const view = $('#view');
  view.className = 'view' + (r.flush ? ' flush' : '');
  const seq = ++routeSeq;
  if (!opts.quiet && r.name !== 'chat') view.innerHTML = '<div class="loading">Carregando…</div>';
  try { await r.fn(m, params, { seq, quiet: !!opts.quiet }); }
  catch (err) { if (seq === routeSeq) view.innerHTML = `<div class="page"><div class="card empty"><b>Não foi possível carregar</b>${esc(err.message)}</div></div>`; }
}
window.addEventListener('hashchange', () => route());
const setTitle = t => { $('#page-title').textContent = t; };
const stale = ctx => ctx.seq !== routeSeq;

// Mantém o que o usuário estava digitando quando a tela atualiza sozinha
function captureDirty() { return $$('[data-keep]').filter(el => el.dataset.dirty).map(el => [el.dataset.keep, el.value]); }
function restoreDirty(list) { for (const [k, v] of list) { const el = $(`[data-keep="${k}"]`); if (el) { el.value = v; el.dataset.dirty = '1'; } } }
document.addEventListener('input', e => { if (e.target.dataset?.keep) e.target.dataset.dirty = '1'; });

// ============================================================ painel
async function viewDashboard(m, params, ctx) {
  setTitle(isAdmin() ? 'Painel da supervisão' : `Olá, ${state.me.name.split(' ')[0]}`);
  const [s, tickets] = await Promise.all([api('/stats'), api('/tickets?status=abertos')]);
  if (stale(ctx)) return;
  const kpi = (label, value, sub, href, color) => `<a class="card kpi" href="${href}"><div class="kpi-label"><span class="dot" style="background:${color}"></span>${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></a>`;
  const maxDay = Math.max(1, ...s.daily.map(d => d.count));
  const niceMax = maxDay <= 4 ? 4 : Math.ceil(maxDay / 5) * 5;
  const totalCat = Math.max(1, ...s.byCategory.map(c => c.c));
  const attention = tickets.slice().sort((a, b) => a.dueAt.localeCompare(b.dueAt)).slice(0, 8);
  const totalStation = Math.max(1, ...s.byStation.map(c => c.total));

  $('#view').innerHTML = `<div class="page section-gap">
    ${!state.me.email ? `<div class="alert alert-warn">Você ainda não cadastrou seu e-mail, então não vai receber as notificações. <a href="#/perfil">Cadastrar agora</a></div>` : ''}
    <div class="kpis">
      ${kpi('Abertos', s.byStatus.aberto, 'aguardando atendimento', '#/chamados?status=aberto', 'var(--primary)')}
      ${kpi('Em andamento', s.byStatus.em_andamento, 'sendo atendidos', '#/chamados?status=em_andamento', 'var(--amber)')}
      ${kpi('Aguardando usuário', s.byStatus.aguardando, 'precisam de retorno', '#/chamados?status=aguardando', 'var(--violet)')}
      ${kpi('Atrasados', `<span style="color:${s.overdue ? 'var(--danger)' : 'inherit'}">${s.overdue}</span>`, 'prazo vencido', '#/chamados?status=atrasados', 'var(--danger)')}
      ${kpi('Resolvidos no mês', s.resolvedMonth, `${s.byStatus.fechado} fechados no total`, '#/chamados?status=resolvido', 'var(--ok)')}
    </div>
    <div class="dash-grid">
      <div class="card"><div class="card-head"><h3>Chamados abertos por dia — últimos 14 dias</h3><span class="muted small">${s.daily.reduce((a, d) => a + d.count, 0)} no período</span></div>
        <div class="card-body">
          <div style="display:flex;gap:8px"><div style="display:flex;flex-direction:column;justify-content:space-between;height:170px;padding-top:10px;font-size:11px;color:var(--muted);text-align:right;width:20px"><span>${niceMax}</span><span>${niceMax / 2}</span><span>0</span></div>
          <div style="flex:1;min-width:0"><div class="bars">${s.daily.map(d => `<div class="bar-col"><div class="bar" style="height:${(d.count / niceMax) * 100}%"></div><span class="tip">${new Date(d.date).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}: <b>${d.count}</b> chamado${d.count === 1 ? '' : 's'}</span></div>`).join('')}</div>
          <div class="bars-axis">${s.daily.map((d, i) => `<span>${i % 2 === 1 || i === 13 ? new Date(d.date).getDate() : ''}</span>`).join('')}</div></div></div>
        </div></div>
      <div class="card"><div class="card-head"><h3>Por categoria</h3></div><div class="card-body">
        ${s.byCategory.length ? `<div class="hbar-list">${s.byCategory.slice(0, 7).map(c => `<div class="hbar-row" title="${esc(c.category)}: ${c.c}"><span>${esc(c.category)}</span><div class="track"><div class="fill" style="width:${(c.c / totalCat) * 100}%"></div></div><b>${c.c}</b></div>`).join('')}</div>` : '<div class="muted">Nenhum chamado ainda.</div>'}
      </div></div>
    </div>
    <div class="dash-grid">
      <div class="card"><div class="card-head"><h3>Precisam de atenção</h3><a class="btn btn-sm" href="#/chamados?status=abertos">Ver todos</a></div>
        ${attention.length ? `<div class="table-wrap"><table class="table"><tbody>${attention.map(t => { const d = dueInfo(t); return `<tr class="clickable" data-href="#/chamado/${t.id}">
          <td><div class="t-title">${esc(t.title)}</div><div class="t-sub"><span class="mono">${t.code}</span> · ${stationTag(t.station)}${isAdmin() ? ` · ${esc(t.userName)}` : ''}</div></td>
          <td>${prioBadge(t.priority)}</td><td>${statusBadge(t.status)}</td><td class="due ${d.cls}">${d.text}</td></tr>`; }).join('')}</tbody></table></div>`
          : `<div class="empty"><b>Tudo em dia 🎉</b>Nenhum chamado em aberto.</div>`}
      </div>
      <div class="section-gap" style="align-content:start">
        <div class="card"><div class="card-head"><h3>Indicadores</h3></div><div class="card-body"><div class="grid-2">
          <div><div class="muted small">Tempo médio de solução</div><div style="font-size:24px;font-weight:700;margin-top:4px">${s.avgHours == null ? '—' : s.avgHours < 1 ? `${Math.round(s.avgHours * 60)} min` : `${s.avgHours.toFixed(1).replace('.', ',')} h`}</div></div>
          <div><div class="muted small">Resolvidos no prazo</div><div style="font-size:24px;font-weight:700;margin-top:4px">${s.onTime == null ? '—' : `${s.onTime}%`}</div></div>
        </div></div></div>
        ${isAdmin() ? `<div class="card"><div class="card-head"><h3>Estações com mais chamados</h3></div><div class="card-body">
          ${s.byStation.length ? `<div class="hbar-list">${s.byStation.slice(0, 6).map(r => `<a class="hbar-row" href="#/chamados?station=${esc(r.station)}&status=todos" style="color:inherit;text-decoration:none" title="${r.abertos} em aberto"><span class="station">${esc(r.station.toUpperCase())}</span><div class="track"><div class="fill" style="width:${(r.total / totalStation) * 100}%"></div></div><b>${r.total}</b></a>`).join('')}</div>` : '<div class="muted">Nenhum chamado ainda.</div>'}
        </div></div>`
        : `<a class="card card-pad" href="#/novo" style="display:flex;gap:14px;align-items:center;text-decoration:none;color:inherit;background:var(--primary-50);border-color:#c7d7fe"><span class="avatar" style="background:var(--primary)">${icon('plus')}</span><div><b>Precisa de ajuda?</b><div class="muted">Abra um novo chamado para o suporte de TI.</div></div></a>`}
      </div>
    </div>
  </div>`;
  $$('#view tr[data-href]').forEach(tr => tr.onclick = () => location.hash = tr.dataset.href);
}

// ============================================================ lista de chamados
async function viewTickets(m, params, ctx) {
  setTitle(isAdmin() ? 'Todos os chamados' : 'Meus chamados');
  const f = state.ticketFilter;
  if (params.has('status')) f.status = params.get('status');
  if (params.has('station')) f.station = params.get('station');
  if (!f.status) f.status = isAdmin() ? 'abertos' : 'todos';
  const hadFocus = document.activeElement?.id === 't-search';
  const tickets = await api('/tickets');
  if (stale(ctx)) return;
  const tabs = [['abertos', 'Em aberto'], ['aberto', 'Abertos'], ['em_andamento', 'Em andamento'], ['aguardando', 'Aguardando'], ['atrasados', 'Atrasados'], ['resolvido', 'Resolvidos'], ['fechado', 'Fechados'], ['todos', 'Todos']];
  const match = (t, st) => st === 'todos' ? true : st === 'abertos' ? OPEN.includes(t.status) : st === 'atrasados' ? t.overdue : t.status === st;
  const stations = [...new Set(tickets.map(t => t.station))].sort();

  $('#view').innerHTML = `<div class="page">
    <div class="toolbar">
      <div class="tabs" id="tabs">${tabs.map(([k, l]) => `<button class="tab ${f.status === k ? 'active' : ''}" data-st="${k}">${l}<span class="n">${tickets.filter(t => match(t, k)).length}</span></button>`).join('')}</div>
    </div>
    <div class="toolbar">
      <input class="search" id="t-search" placeholder="Buscar por número, título, descrição${isAdmin() ? ', estação ou nome' : ''}…" value="${esc(f.q)}">
      <select id="t-prio"><option value="">Todas as prioridades</option>${state.meta.priorities.map(p => `<option value="${p.key}" ${f.priority === p.key ? 'selected' : ''}>${p.label}</option>`).join('')}</select>
      ${isAdmin() ? `<select id="t-station"><option value="">Todas as estações</option>${stations.map(s => `<option value="${esc(s)}" ${f.station === s ? 'selected' : ''}>${esc(s.toUpperCase())}</option>`).join('')}</select>` : ''}
      <a class="btn btn-primary" href="#/novo">${icon('plus')} Novo chamado</a>
    </div>
    <div class="card" id="t-table"></div></div>`;

  const draw = () => {
    const q = f.q.trim().toLowerCase();
    const rows = tickets.filter(t => match(t, f.status) && (!f.priority || t.priority === f.priority) && (!f.station || t.station === f.station)
      && (!q || [t.code, t.title, t.description, t.station, t.userName, t.category].some(v => String(v).toLowerCase().includes(q))));
    $('#t-table').innerHTML = rows.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Chamado</th>${isAdmin() ? '<th>Estação / solicitante</th>' : ''}<th>Categoria</th><th>Prioridade</th><th>Status</th><th>Prazo</th><th>Atualizado</th></tr></thead>
      <tbody>${rows.map(t => { const d = dueInfo(t); return `<tr class="clickable" data-href="#/chamado/${t.id}">
        <td><div class="t-title">${esc(t.title)}</div><div class="t-sub"><span class="mono">${t.code}</span>${t.comments ? ` · ${icon('chat').replace('<svg', '<svg style="width:12px;height:12px;vertical-align:-2px"')} ${t.comments}` : ''}</div></td>
        ${isAdmin() ? `<td>${stationTag(t.station)}<div class="t-sub">${esc(t.userName)}</div></td>` : ''}
        <td><span class="tag">${esc(t.category)}</span></td><td>${prioBadge(t.priority)}</td><td>${statusBadge(t.status)}</td>
        <td class="due ${d.cls}">${d.text}</td><td class="muted nowrap" title="${fmtDT(t.updatedAt)}">${timeAgo(t.updatedAt)}</td></tr>`; }).join('')}</tbody></table></div>`
      : `<div class="empty"><b>Nenhum chamado aqui</b>${tickets.length ? 'Tente outro filtro.' : 'Quando um chamado for aberto, ele aparece nesta lista.'}</div>`;
    $$('#t-table tr[data-href]').forEach(tr => tr.onclick = () => location.hash = tr.dataset.href);
  };
  draw();
  $$('#tabs .tab').forEach(b => b.onclick = () => { f.status = b.dataset.st; $$('#tabs .tab').forEach(x => x.classList.toggle('active', x === b)); draw(); });
  $('#t-search').oninput = e => { f.q = e.target.value; draw(); };
  $('#t-prio').onchange = e => { f.priority = e.target.value; draw(); };
  if ($('#t-station')) $('#t-station').onchange = e => { f.station = e.target.value; draw(); };
  if (!ctx.quiet || hadFocus) { const s = $('#t-search'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
}

// ============================================================ novo chamado
async function viewNew(m, params, ctx) {
  setTitle('Abrir chamado');
  const me = state.me;
  let files = [];
  const pr = state.meta.priorities;
  const sla = h => h < 24 ? `até ${h}h` : `até ${Math.round(h / 24)} dia${h >= 48 ? 's' : ''}`;
  $('#view').innerHTML = `<div class="page"><div class="new-grid">
    <form class="card" id="new-form"><div class="card-head"><h3>Descreva o problema</h3></div><div class="card-body">
      ${isAdmin() ? `<div class="field"><label>Abrir em nome de<select name="forUserId"><option value="">Eu mesmo (${esc(me.name)})</option>${state.users.filter(u => u.role !== 'admin' && u.active).map(u => `<option value="${u.id}">${esc(u.username.toUpperCase())} — ${esc(u.name)}</option>`).join('')}</select></label></div>` : ''}
      <div class="field"><label>Título do chamado<input name="title" maxlength="150" required placeholder="ex.: Impressora não imprime / Sem acesso à internet"></label></div>
      <div class="field"><label>Categoria<select name="category" required><option value="">Selecione…</option>${state.meta.categories.map(c => `<option>${esc(c)}</option>`).join('')}</select></label></div>
      <div class="field"><label>Prioridade</label><div class="prio-options">${pr.map(p => `<label class="prio-opt"><input type="radio" name="priority" value="${p.key}" ${p.key === 'media' ? 'checked' : ''}>${p.label}<small>${sla(p.slaHours)}</small></label>`).join('')}</div>
        <div class="field-hint">O prazo de atendimento é calculado pela prioridade. Use <b>Crítica</b> só quando o trabalho estiver totalmente parado.</div></div>
      <div class="field"><label>Descrição do problema<textarea name="description" rows="7" required placeholder="O que aconteceu? Desde quando? Aparece alguma mensagem de erro? O que você já tentou fazer?"></textarea></label></div>
      <div class="field"><label>Anexos <span class="muted" style="font-weight:400">(opcional — prints, fotos, PDFs)</span></label>
        <div class="dropzone" id="dz">${icon('clip')} Arraste arquivos aqui, clique para escolher ou cole um print com <b>Ctrl+V</b></div>
        <input type="file" id="dz-input" multiple hidden><div class="files" id="dz-files"></div></div>
      <div class="form-error" id="new-err"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end"><a class="btn" href="#/chamados">Cancelar</a><button class="btn btn-primary" type="submit">${icon('send')} Abrir chamado</button></div>
    </div></form>
    <div class="section-gap">
      <div class="card"><div class="card-head"><h3>Identificação</h3></div><div class="card-body">
        <div class="identity">${avatar(me)}<div><div class="station" style="font-size:13px">${esc(me.username.toUpperCase())}</div><b>${esc(me.name)}</b><div class="muted small">${esc(me.email || 'sem e-mail cadastrado')}</div></div></div>
        ${me.email ? '<p class="muted small" style="margin:12px 0 0">Você e o supervisor de TI receberão por e-mail cada atualização deste chamado.</p>' : '<div class="alert alert-warn" style="margin-top:12px">Sem e-mail cadastrado você não recebe notificações. <a href="#/perfil">Cadastrar</a></div>'}
      </div></div>
      <div class="card"><div class="card-head"><h3>Dicas para um atendimento rápido</h3></div><div class="card-body">
        <ul class="tips"><li>Um problema por chamado.</li><li>Copie a mensagem de erro exata.</li><li>Envie um print da tela (tecla <b>PrtSc</b> e depois <b>Ctrl+V</b> aqui).</li><li>Diga se outras pessoas têm o mesmo problema.</li></ul>
      </div></div>
    </div></div></div>`;

  const drawFiles = () => { $('#dz-files').innerHTML = fileChips(files); $$('#dz-files [data-rm]').forEach(b => b.onclick = () => { files.splice(Number(b.dataset.rm), 1); drawFiles(); }); };
  const add = async list => { files = files.concat(await readFiles(list)).slice(0, 6); drawFiles(); };
  const dz = $('#dz');
  dz.onclick = () => $('#dz-input').click();
  $('#dz-input').onchange = e => { add(e.target.files); e.target.value = ''; };
  dz.ondragover = e => { e.preventDefault(); dz.classList.add('drag'); };
  dz.ondragleave = () => dz.classList.remove('drag');
  dz.ondrop = e => { e.preventDefault(); dz.classList.remove('drag'); add(e.dataTransfer.files); };
  const onPaste = e => { if (state.route?.name !== 'new') return document.removeEventListener('paste', onPaste); const fl = [...(e.clipboardData?.files || [])]; if (fl.length) { e.preventDefault(); add(fl); } };
  document.addEventListener('paste', onPaste);

  $('#new-form').onsubmit = async e => {
    e.preventDefault();
    const f = e.target, btn = $('button[type=submit]', f);
    $('#new-err').textContent = '';
    try {
      const t = await withBusy(btn, () => api('/tickets', { method: 'POST', body: {
        title: f.title.value, category: f.category.value, priority: f.priority.value, description: f.description.value,
        forUserId: f.forUserId?.value ? Number(f.forUserId.value) : undefined, attachments: files,
      } }));
      toast(`Chamado ${t.code} aberto`, `Prazo: ${fmtDT(t.dueAt)}`, 'ok');
      location.hash = `#/chamado/${t.id}`;
    } catch (err) { $('#new-err').textContent = err.message; }
  };
  if (!ctx.quiet) $('[name=title]').focus();
}

// ============================================================ detalhe do chamado
async function viewTicket(m, params, ctx) {
  const id = Number(m[1]);
  const keep = ctx.quiet ? captureDirty() : [];
  const scroll = $('#view').scrollTop;
  const t = await api(`/tickets/${id}`);
  if (stale(ctx)) return;
  setTitle(`${t.code}`);
  if (!ctx.quiet || state.ticketFilesFor !== id) { state.ticketFiles = []; state.ticketFilesFor = id; }
  const d = dueInfo(t);
  const owner = state.usersById[t.userId] || { id: t.userId, username: t.station, name: t.userName, role: 'user' };
  const createdAtt = t.attachments.filter(a => a.eventId === t.events.find(e => e.type === 'created')?.id);
  const isOpen = OPEN.includes(t.status);
  const chatTarget = isAdmin() ? owner : state.users.find(u => u.role === 'admin');

  const evHtml = e => {
    const who = e.user ? `<b>${esc(e.user.name)}</b>` : '<b>Sistema</b>';
    const meta = (txt, ic, color = '') => `<div class="tl-item"><span class="tl-icon" ${color}>${icon(ic)}</span><div class="tl-body"><div class="tl-meta" style="padding-top:8px">${txt}<time title="${fmtDT(e.createdAt)}">${fmtDT(e.createdAt)}</time></div>${attachmentsHtml(t.attachments.filter(a => a.eventId === e.id && e.type !== 'created'))}</div></div>`;
    switch (e.type) {
      case 'created': return meta(`${who} abriu o chamado${e.body ? ` <span class="muted">(${esc(e.body)})</span>` : ''}`, 'plus', 'style="background:var(--primary-50);color:var(--primary)"');
      case 'comment': return `<div class="tl-item">${avatar(e.user)}<div class="tl-body"><div class="tl-meta">${who}${e.user?.role === 'admin' ? ' <span class="tag">Suporte TI</span>' : ''}<time>${fmtDT(e.createdAt)}</time></div>
        ${e.body ? `<div class="tl-comment ${e.user?.role === 'admin' ? 'from-admin' : ''}">${linkify(e.body)}</div>` : ''}${attachmentsHtml(t.attachments.filter(a => a.eventId === e.id))}</div></div>`;
      case 'status': { const [a, b] = e.body.split('>'); return meta(`${who} mudou o status ${statusBadge(a)} → ${statusBadge(b)}`, b === 'resolvido' || b === 'fechado' ? 'check' : 'refresh', b === 'resolvido' ? 'style="background:var(--ok-bg);color:var(--ok)"' : ''); }
      case 'priority': { const [, b] = e.body.split('>'); return meta(`${who} alterou a prioridade para ${prioBadge(b)}`, 'flag'); }
      case 'category': return meta(`${who} alterou a categoria para <span class="tag">${esc(e.body)}</span>`, 'tag');
      case 'deadline': return meta(`${who} definiu o prazo para <b>${fmtDT(e.body)}</b>`, 'clock');
      case 'solution': return meta(`${who} ${e.body ? 'registrou a solução' : 'removeu a solução'}`, 'tool', 'style="background:var(--ok-bg);color:var(--ok)"');
      case 'overdue': return meta('<b style="color:var(--danger)">Prazo de atendimento vencido</b> — supervisor e usuário notificados por e-mail', 'alert', 'style="background:var(--danger-bg);color:var(--danger)"');
      default: return '';
    }
  };

  $('#view').innerHTML = `<div class="page">
    <a href="#/chamados" class="muted" style="display:inline-flex;gap:6px;align-items:center;margin-bottom:12px">${icon('back').replace('<svg', '<svg style="width:16px;height:16px"')} Voltar para a lista</a>
    <div class="detail-head"><div><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="code">${t.code}</span>${statusBadge(t.status)}${prioBadge(t.priority)}${t.overdue ? '<span class="badge" style="background:var(--danger-bg);color:var(--danger)">Atrasado</span>' : ''}</div>
      <h2>${esc(t.title)}</h2><div class="muted" style="margin-top:4px">Aberto por <b style="color:var(--text)">${esc(t.userName)}</b> na estação ${stationTag(t.station)} em ${fmtDT(t.createdAt)}</div></div>
      ${chatTarget ? `<a class="btn" href="#/chat/${dmRoomWith(chatTarget.id)}">${icon('chat')} Conversar com ${isAdmin() ? 'o usuário' : 'o suporte'}</a>` : ''}</div>
    <div class="detail">
      <div class="section-gap">
        <div class="card"><div class="card-head"><h3>Descrição do problema</h3><span class="tag">${esc(t.category)}</span></div><div class="card-body"><div class="desc">${linkify(t.description)}</div>${attachmentsHtml(createdAtt)}</div></div>
        ${t.solution ? `<div class="solution-box"><h4>✓ Solução do problema</h4><div class="desc">${linkify(t.solution)}</div></div>` : ''}
        ${!isAdmin() && t.status === 'resolvido' ? `<div class="confirm-box"><p><b>O problema foi resolvido?</b><br><span class="muted">Confirme para encerrar o chamado, ou reabra se ainda estiver com problema.</span></p>
          <button class="btn" data-act="aberto">Ainda com problema</button><button class="btn btn-ok" data-act="fechado">${icon('check')} Sim, resolvido</button></div>` : ''}
        ${!isAdmin() && t.status === 'fechado' ? `<div class="alert alert-info">Este chamado está encerrado. O problema voltou? <a href="#" data-act="aberto">Reabrir chamado</a></div>` : ''}
        <div class="card"><div class="card-head"><h3>Histórico e mensagens</h3><span class="muted small">${t.events.filter(e => e.type === 'comment').length} mensagens</span></div>
          <div class="card-body"><div class="timeline">${t.events.map(evHtml).join('')}</div>
          <form id="cm-form" class="composer" style="margin-top:14px">
            <textarea name="body" data-keep="comment-${id}" placeholder="${isAdmin() ? 'Escreva para o usuário… (ele recebe por e-mail)' : 'Adicione uma informação ou responda o suporte…'}"></textarea>
            <div class="composer-bar"><button type="button" class="btn btn-ghost btn-sm" id="cm-attach">${icon('clip')} Anexar</button><input type="file" id="cm-file" multiple hidden><div class="files" id="cm-files" style="margin:0"></div>
            <span class="spacer"></span><span class="muted small">Ctrl+Enter envia</span><button class="btn btn-primary btn-sm" type="submit">${icon('send')} Enviar</button></div>
          </form></div></div>
      </div>
      <div class="section-gap">
        <div class="card"><div class="card-head"><h3>Detalhes</h3></div><div class="card-body" style="padding-top:8px;padding-bottom:8px"><div class="info-list">
          <div class="info-row"><span>Status</span><span>${statusBadge(t.status)}</span></div>
          <div class="info-row"><span>Prioridade</span><span>${prioBadge(t.priority)}</span></div>
          <div class="info-row"><span>Prazo</span><span><div>${fmtDT(t.dueAt)}</div>${isOpen ? `<div class="due ${d.cls}" style="font-size:12px">${d.text}</div>` : ''}</span></div>
          <div class="info-row"><span>Estação</span><span>${stationTag(t.station)}</span></div>
          <div class="info-row"><span>Solicitante</span><span>${esc(t.userName)}</span></div>
          ${isAdmin() ? `<div class="info-row"><span>E-mail</span><span style="font-weight:400">${t.userEmail ? `<a href="mailto:${esc(t.userEmail)}">${esc(t.userEmail)}</a>` : '<span style="color:var(--warn)">não cadastrado</span>'}</span></div>` : ''}
          <div class="info-row"><span>Aberto em</span><span>${fmtDT(t.createdAt)}</span></div>
          ${t.resolvedAt ? `<div class="info-row"><span>Resolvido em</span><span>${fmtDT(t.resolvedAt)}<div class="muted small" style="font-weight:400">em ${dur(new Date(t.resolvedAt) - new Date(t.createdAt))}</div></span></div>` : ''}
        </div></div></div>
        ${isAdmin() ? `<form class="card" id="adm-form"><div class="card-head"><h3>Atendimento</h3></div><div class="card-body">
          ${t.status === 'aberto' ? `<button type="button" class="btn btn-block" style="margin-bottom:14px" data-quick="em_andamento">${icon('tool')} Iniciar atendimento</button>` : ''}
          <div class="field"><label>Status<select name="status" data-keep="st-${id}">${state.meta.statuses.map(s => `<option value="${s.key}" ${s.key === t.status ? 'selected' : ''}>${s.label}</option>`).join('')}</select></label></div>
          <div class="grid-2"><div class="field"><label>Prioridade<select name="priority" data-keep="pr-${id}">${state.meta.priorities.map(p => `<option value="${p.key}" ${p.key === t.priority ? 'selected' : ''}>${p.label}</option>`).join('')}</select></label></div>
          <div class="field"><label>Categoria<select name="category" data-keep="ca-${id}">${state.meta.categories.map(c => `<option ${c === t.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label></div></div>
          <div class="field"><label>Prazo<input type="datetime-local" name="dueAt" data-keep="du-${id}" value="${toLocalInput(t.dueAt)}"></label></div>
          <div class="field"><label>Solução do problema<textarea name="solution" rows="5" data-keep="so-${id}" placeholder="O que foi feito para resolver? (obrigatório para marcar como resolvido)">${esc(t.solution)}</textarea></label></div>
          <div class="form-error" id="adm-err"></div>
          <div style="display:grid;gap:8px"><button class="btn btn-primary" type="submit">Salvar alterações</button>
          ${isOpen ? `<button class="btn btn-ok" type="button" data-quick="resolvido">${icon('check')} Salvar e marcar como resolvido</button>` : ''}</div>
          <p class="muted small" style="margin:10px 0 0">O usuário e você recebem um e-mail a cada alteração.</p>
        </div></form>` : ''}
      </div>
    </div></div>`;

  restoreDirty(keep);
  if (ctx.quiet) $('#view').scrollTop = scroll;

  // ações do usuário: fechar / reabrir
  $$('[data-act]').forEach(b => b.onclick = async e => {
    e.preventDefault();
    const st = b.dataset.act;
    if (st === 'aberto') {
      const ok = await confirmDialog('Reabrir chamado?', 'O suporte será avisado de que o problema continua. Depois, use a caixa de mensagens para explicar o que está acontecendo.', 'Reabrir');
      if (!ok) return;
    }
    try { await api(`/tickets/${id}`, { method: 'PATCH', body: { status: st } }); toast(st === 'fechado' ? 'Chamado encerrado. Obrigado!' : 'Chamado reaberto', '', 'ok'); route({ quiet: true }); }
    catch (err) { toast('Erro', err.message, 'err'); }
  });

  // comentário
  const cm = $('#cm-form');
  const drawFiles = () => { $('#cm-files').innerHTML = fileChips(state.ticketFiles); $$('#cm-files [data-rm]').forEach(b => b.onclick = () => { state.ticketFiles.splice(Number(b.dataset.rm), 1); drawFiles(); }); };
  drawFiles();
  $('#cm-attach').onclick = () => $('#cm-file').click();
  $('#cm-file').onchange = async e => { state.ticketFiles = state.ticketFiles.concat(await readFiles(e.target.files)).slice(0, 6); e.target.value = ''; drawFiles(); };
  cm.body.addEventListener('paste', async e => { const fl = [...(e.clipboardData?.files || [])]; if (fl.length) { e.preventDefault(); state.ticketFiles = state.ticketFiles.concat(await readFiles(fl)).slice(0, 6); drawFiles(); } });
  cm.body.addEventListener('keydown', e => { if (e.key === 'Enter' && e.ctrlKey) cm.requestSubmit(); });
  cm.onsubmit = async e => {
    e.preventDefault();
    const btn = $('button[type=submit]', cm);
    if (!cm.body.value.trim() && !state.ticketFiles.length) return cm.body.focus();
    try {
      await withBusy(btn, () => api(`/tickets/${id}/comments`, { method: 'POST', body: { body: cm.body.value, attachments: state.ticketFiles } }));
      cm.body.value = ''; delete cm.body.dataset.dirty; state.ticketFiles = [];
      await route({ quiet: true });
      $('#view').scrollTop = $('#view').scrollHeight;
    } catch (err) { toast('Não foi possível enviar', err.message, 'err'); }
  };

  // formulário do supervisor
  const af = $('#adm-form');
  if (af) {
    const save = async (extra = {}) => {
      $('#adm-err').textContent = '';
      const body = { status: af.status.value, priority: af.priority.value, category: af.category.value, dueAt: new Date(af.dueAt.value).toISOString(), solution: af.solution.value, ...extra };
      if (body.status === 'resolvido' && !body.solution.trim()) { $('#adm-err').textContent = 'Descreva a solução antes de marcar como resolvido.'; af.solution.focus(); return; }
      try {
        await api(`/tickets/${id}`, { method: 'PATCH', body });
        $$('[data-keep]', af).forEach(el => delete el.dataset.dirty);
        toast('Chamado atualizado', state.usersById[t.userId]?.email || t.userEmail ? 'Usuário notificado por e-mail' : 'Usuário sem e-mail cadastrado', 'ok');
        route({ quiet: true });
      } catch (err) { $('#adm-err').textContent = err.message; }
    };
    af.onsubmit = e => { e.preventDefault(); if (!af.dueAt.value) { $('#adm-err').textContent = 'Informe o prazo'; return; } save(); };
    $$('[data-quick]', af).forEach(b => b.onclick = () => save({ status: b.dataset.quick }));
  }
}

// ============================================================ chat interno
const dmRoomWith = uid => `dm:${Math.min(uid, state.me.id)}:${Math.max(uid, state.me.id)}`;
const roomInfo = room => state.rooms.find(r => r.room === room);
let typingTimer = null, lastTypingSent = 0;

async function viewChat(m) {
  setTitle('Chat interno');
  const room = m[1] ? decodeURIComponent(m[1]) : null;
  if (!$('#chat-root')) {
    $('#view').innerHTML = `<div class="chat" id="chat-root">
      <div class="chat-list"><div class="chat-list-head"><input id="room-search" placeholder="Buscar estação ou pessoa…"></div><div class="chat-rooms" id="rooms"></div></div>
      <div class="chat-pane" id="chat-pane"></div></div>`;
    $('#room-search').oninput = drawRooms;
    await loadRooms();
  }
  state.currentRoom = room;
  $('#chat-root').classList.toggle('in-room', !!room);
  drawRooms();
  if (room) await openRoom(room);
  else $('#chat-pane').innerHTML = `<div class="chat-empty">${icon('chat').replace('<svg', '<svg style="width:40px;height:40px;opacity:.4"')}<b style="color:var(--text)">Selecione uma conversa</b><span>Fale com toda a equipe no canal Geral ou com uma estação específica.</span></div>`;
}

function drawRooms() {
  const el = $('#rooms'); if (!el) return;
  const q = ($('#room-search')?.value || '').trim().toLowerCase();
  const list = state.rooms.filter(r => !q || `${r.name} ${r.username || ''}`.toLowerCase().includes(q))
    .slice().sort((a, b) => (b.room === 'geral') - (a.room === 'geral') || (b.role === 'admin') - (a.role === 'admin') || (b.last?.createdAt || '').localeCompare(a.last?.createdAt || '') || String(a.username).localeCompare(String(b.username)));
  el.innerHTML = list.map(r => {
    const u = r.type === 'dm' ? state.usersById[r.userId] || { id: r.userId, username: r.username, name: r.name, role: r.role } : null;
    const av = u ? avatar(u, { dot: true }) : `<span class="avatar" style="background:var(--primary)">${icon('hash')}</span>`;
    const title = r.type === 'dm' ? (r.role === 'admin' ? `${esc(r.name)} <span class="tag" style="font-size:10px">TI</span>` : `<span class="station">${esc(r.username.toUpperCase())}</span> ${/^Estação /.test(r.name) ? '' : `· ${esc(r.name)}`}`) : '<b>Geral</b> <span class="muted small">— toda a equipe</span>';
    const prev = r.last ? `${r.last.senderId === state.me.id ? 'Você: ' : ''}${esc(r.last.body)}` : '<i>Nenhuma mensagem</i>';
    return `<a class="room ${r.room === state.currentRoom ? 'active' : ''} ${r.unread ? 'unread' : ''}" href="#/chat/${r.room}">${av}<div class="r-main">
      <div class="r-top"><span class="r-name">${title}</span><span class="r-time">${r.last ? (fmtDay(r.last.createdAt) === 'Hoje' ? fmtTime(r.last.createdAt) : fmtDay(r.last.createdAt)) : ''}</span></div>
      <div class="r-last"><span style="overflow:hidden;text-overflow:ellipsis">${prev}</span>${r.unread ? `<span class="badge-count">${r.unread}</span>` : ''}</div></div></a>`;
  }).join('') || '<div class="empty">Nenhuma conversa encontrada</div>';
}

async function openRoom(room) {
  const r = roomInfo(room);
  if (!r) { $('#chat-pane').innerHTML = '<div class="chat-empty">Conversa não encontrada.</div>'; return; }
  const u = r.type === 'dm' ? state.usersById[r.userId] : null;
  const sub = r.type === 'dm'
    ? `<span data-presence-uid="${r.userId}" class="${state.online.has(r.userId) ? 'pill-on' : 'pill-off'}">${state.online.has(r.userId) ? 'Online' : `Visto ${timeAgo(u?.lastSeen)}`}</span>`
    : `<span>${state.users.filter(x => x.active).length} participantes · ${state.online.size} online</span>`;
  $('#chat-pane').innerHTML = `<div class="chat-head"><a class="icon-btn chat-back" href="#/chat">${icon('back')}</a>
      ${u ? avatar(u, { dot: true }) : `<span class="avatar" style="background:var(--primary)">${icon('hash')}</span>`}
      <div class="who"><b>${r.type === 'dm' ? `${esc(r.name)}${r.role !== 'admin' ? ` <span class="station">${esc(r.username.toUpperCase())}</span>` : ''}` : 'Geral — toda a equipe'}</b>${sub}</div></div>
    <div class="messages" id="msgs"><div class="loading">Carregando…</div></div>
    <div class="typing" id="typing"></div>
    <form class="chat-input" id="chat-form">
      <button type="button" class="icon-btn" id="ch-attach" title="Enviar arquivo">${icon('clip')}</button><input type="file" id="ch-file" hidden>
      <textarea name="body" rows="1" placeholder="Escreva uma mensagem…" title="Enter envia · Shift+Enter quebra linha"></textarea>
      <button class="btn btn-primary" type="submit" title="Enviar">${icon('send')}</button></form>`;

  const msgs = await api(`/chat/${encodeURIComponent(room)}/messages`);
  if (state.currentRoom !== room) return;
  const box = $('#msgs');
  box.innerHTML = msgs.length ? '' : `<div class="chat-empty" id="no-msgs" style="background:none"><span>Nenhuma mensagem ainda. Diga olá! 👋</span></div>`;
  msgs.forEach(msg => appendMsg(msg));
  box.scrollTop = box.scrollHeight;
  box.dataset.first = msgs[0]?.id || '';
  box.onscroll = async () => {
    if (box.scrollTop > 40 || !box.dataset.first || box.dataset.loading) return;
    box.dataset.loading = '1';
    const older = await api(`/chat/${encodeURIComponent(room)}/messages?before=${box.dataset.first}`).catch(() => []);
    if (older.length && state.currentRoom === room) {
      const h = box.scrollHeight;
      const frag = document.createElement('div');
      let prev = null; frag.innerHTML = older.map(o => { const s = msgHtml(o, prev); prev = o; return s; }).join('');
      const firstSep = box.querySelector('.day-sep');
      if (firstSep && prev && fmtDay(prev.createdAt) === firstSep.textContent) firstSep.remove();
      box.prepend(...frag.childNodes);
      box.scrollTop = box.scrollHeight - h;
      box.dataset.first = older[0].id;
    } else box.dataset.first = '';
    delete box.dataset.loading;
  };
  markRead(room);

  const form = $('#chat-form'), ta = form.body;
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; };
  ta.addEventListener('input', () => {
    grow();
    if (Date.now() - lastTypingSent > 3000 && ta.value.trim()) { lastTypingSent = Date.now(); api(`/chat/${encodeURIComponent(room)}/typing`, { method: 'POST' }).catch(() => {}); }
  });
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  const send = async (body, attachment) => {
    try { const msg = await api(`/chat/${encodeURIComponent(room)}/messages`, { method: 'POST', body: { body, attachment } }); onChatMessage(msg); }
    catch (err) { toast('Mensagem não enviada', err.message, 'err'); }
  };
  form.onsubmit = e => { e.preventDefault(); const v = ta.value.trim(); if (!v) return; ta.value = ''; grow(); send(v); lastTypingSent = 0; };
  ta.addEventListener('paste', async e => { const fl = [...(e.clipboardData?.files || [])]; if (fl.length) { e.preventDefault(); for (const f of await readFiles(fl.slice(0, 1))) send('', f); } });
  $('#ch-attach').onclick = () => $('#ch-file').click();
  $('#ch-file').onchange = async e => { for (const f of await readFiles(e.target.files)) send('', f); e.target.value = ''; };
  ta.focus();
}

function msgHtml(msg, prev) {
  const mine = msg.senderId === state.me.id;
  const sender = state.usersById[msg.senderId] || { id: msg.senderId, username: msg.senderUsername || '?', name: msg.senderName || 'Usuário' };
  const newDay = !prev || fmtDay(prev.createdAt) !== fmtDay(msg.createdAt);
  const cont = !newDay && prev && prev.senderId === msg.senderId && new Date(msg.createdAt) - new Date(prev.createdAt) < 5 * 60e3;
  const a = msg.attachment;
  const att = a ? (a.mime.startsWith('image/') ? `<a href="/api/attachments/${a.id}" target="_blank"><img src="/api/attachments/${a.id}" alt="${esc(a.filename)}"></a>`
    : `<a href="/api/attachments/${a.id}${a.mime === 'application/pdf' ? '' : '?download'}" target="_blank">📎 ${esc(a.filename)} <small>(${fmtSize(a.size)})</small></a>`) : '';
  const showName = !mine && !cont && msg.room === 'geral';
  const label = sender.role === 'admin' ? `${sender.name} · TI` : /^Estação /.test(sender.name) ? String(sender.username).toUpperCase() : `${sender.name} · ${String(sender.username).toUpperCase()}`;
  return `${newDay ? `<div class="day-sep">${fmtDay(msg.createdAt)}</div>` : ''}<div class="msg ${mine ? 'me' : ''} ${cont ? 'cont' : ''}" data-mid="${msg.id}" data-sender="${msg.senderId}" data-at="${msg.createdAt}">
    ${mine ? '' : avatar(sender, { size: 'sm' })}<div class="bubble">${showName ? `<span class="sender">${esc(label)}</span>` : ''}${att}${msg.body ? linkify(msg.body) : ''}<time>${fmtTime(msg.createdAt)}</time></div></div>`;
}
function appendMsg(msg) {
  const box = $('#msgs'); if (!box || box.querySelector(`[data-mid="${msg.id}"]`)) return;
  $('#no-msgs')?.remove();
  const last = [...box.querySelectorAll('.msg')].pop();
  const prev = last ? { senderId: Number(last.dataset.sender), createdAt: last.dataset.at } : null;
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  box.insertAdjacentHTML('beforeend', msgHtml(msg, prev));
  if (nearBottom || msg.senderId === state.me.id) box.scrollTop = box.scrollHeight;
  $$('img', box).forEach(img => { if (!img.complete) img.onload = () => { if (nearBottom || msg.senderId === state.me.id) box.scrollTop = box.scrollHeight; }; });
}
function markRead(room) {
  const r = roomInfo(room);
  if (r && r.unread) { r.unread = 0; updateTitle(); drawRooms(); }
  api(`/chat/${encodeURIComponent(room)}/read`, { method: 'POST' }).catch(() => {});
}

function onChatMessage(msg) {
  let r = roomInfo(msg.room);
  if (!r) { loadRooms().then(drawRooms); return; }
  r.last = { body: msg.body || '📎 Anexo', senderId: msg.senderId, createdAt: msg.createdAt };
  const viewing = state.route?.name === 'chat' && state.currentRoom === msg.room;
  if (viewing) {
    appendMsg(msg);
    if (msg.senderId !== state.me.id) { $('#typing').textContent = ''; if (document.hidden) { r.unread++; beep(); } else markRead(msg.room); }
  } else if (msg.senderId !== state.me.id) {
    r.unread++;
    beep();
    const sender = state.usersById[msg.senderId];
    const who = sender ? (sender.role === 'admin' ? sender.name : `${sender.username.toUpperCase()}${/^Estação /.test(sender.name) ? '' : ` · ${sender.name}`}`) : 'Nova mensagem';
    toast(msg.room === 'geral' ? `${who} no Geral` : who, msg.body || '📎 Anexo', 'info', () => location.hash = `#/chat/${msg.room}`);
  }
  updateTitle();
  drawRooms();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.route?.name === 'chat' && state.currentRoom) markRead(state.currentRoom); });

function onTyping(d) {
  if (state.route?.name !== 'chat' || state.currentRoom !== d.room) return;
  const u = state.usersById[d.userId];
  const name = u ? (/^Estação /.test(u.name) ? u.username.toUpperCase() : u.name.split(' ')[0]) : d.name;
  $('#typing').textContent = `${name} está digitando…`;
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => { const t = $('#typing'); if (t) t.textContent = ''; }, 4000);
}

// ============================================================ estações e usuários (supervisor)
async function viewUsers(m, params, ctx) {
  setTitle('Estações e usuários');
  await loadUsers();
  if (stale(ctx)) return;
  const users = state.users;
  const noEmail = users.filter(u => u.active && !u.email).length;
  $('#view').innerHTML = `<div class="page section-gap">
    <div class="kpis" style="grid-template-columns:repeat(4,1fr)">
      <div class="card kpi"><div class="kpi-label">Estações cadastradas</div><div class="kpi-value">${users.filter(u => u.role !== 'admin').length}</div></div>
      <div class="card kpi"><div class="kpi-label"><span class="dot" style="background:#22c55e"></span>Online agora</div><div class="kpi-value">${users.filter(u => state.online.has(u.id)).length}</div></div>
      <div class="card kpi"><div class="kpi-label">Primeiro acesso pendente</div><div class="kpi-value">${users.filter(u => u.mustChange && u.active).length}</div></div>
      <div class="card kpi"><div class="kpi-label"><span class="dot" style="background:var(--warn)"></span>Sem e-mail</div><div class="kpi-value">${noEmail}</div></div>
    </div>
    <div class="alert alert-info">Senha inicial das estações: <b class="mono">sistec@123</b> — no primeiro acesso cada usuário informa nome, e-mail e cria a própria senha.</div>
    <div class="card"><div class="card-head"><h3>Estações de trabalho</h3><button class="btn btn-primary btn-sm" id="new-user">${icon('plus')} Nova estação</button></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Estação</th><th>Usuário</th><th>E-mail</th><th>Situação</th><th>Chamados</th><th></th></tr></thead><tbody>
    ${users.map(u => `<tr style="${u.active ? '' : 'opacity:.5'}">
      <td><div style="display:flex;gap:10px;align-items:center">${avatar(u, { size: 'sm', dot: true })}<span class="station" style="font-size:13px">${esc(u.username.toUpperCase())}</span></div></td>
      <td><b>${esc(u.name)}</b>${u.role === 'admin' ? ' <span class="tag">Supervisor</span>' : ''}${u.mustChange ? '<div class="t-sub">Aguardando primeiro acesso</div>' : ''}</td>
      <td>${u.email ? esc(u.email) : '<span style="color:var(--warn)">não cadastrado</span>'}</td>
      <td>${!u.active ? '<span class="pill-off">Desativado</span>' : `<span data-presence-uid="${u.id}" class="${state.online.has(u.id) ? 'pill-on' : 'pill-off'}">${state.online.has(u.id) ? 'Online' : `Visto ${timeAgo(u.lastSeen)}`}</span>`}</td>
      <td>${u.totalTickets ? `<a href="#/chamados?station=${esc(u.username)}&status=todos">${u.openTickets} abertos / ${u.totalTickets}</a>` : '<span class="muted">—</span>'}</td>
      <td class="nowrap" style="text-align:right">
        ${u.id !== state.me.id ? `<a class="btn btn-ghost btn-sm" href="#/chat/${dmRoomWith(u.id)}" title="Conversar">${icon('chat')}</a>` : ''}
        <button class="btn btn-ghost btn-sm" data-edit="${u.id}" title="Editar">${icon('edit')}</button>
        <button class="btn btn-ghost btn-sm" data-reset="${u.id}" title="Redefinir senha">${icon('lock')}</button></td></tr>`).join('')}
    </tbody></table></div></div></div>`;

  $('#new-user').onclick = () => {
    const next = `sistec${String(users.filter(u => /^sistec\d+$/.test(u.username)).reduce((mx, u) => Math.max(mx, Number(u.username.slice(6))), 0) + 1).padStart(3, '0')}`;
    const md = openModal({ title: 'Nova estação de trabalho', body: `<form id="nu-form">
      <div class="field"><label>Nome da estação (usuário de login)<input name="username" value="${next}" required pattern="[a-zA-Z0-9._-]{3,30}"></label></div>
      <div class="field"><label>Nome do usuário<input name="name" placeholder="Opcional — o usuário pode preencher no primeiro acesso"></label></div>
      <div class="field"><label>E-mail<input name="email" type="email" placeholder="Opcional"></label></div>
      <div class="form-error" id="nu-err"></div></form>`,
      foot: '<button class="btn" data-x>Cancelar</button><button class="btn btn-primary" form="nu-form" type="submit">Criar estação</button>' });
    $('[data-x]', md.el).onclick = md.close;
    $('#nu-form').onsubmit = async e => {
      e.preventDefault(); const f = e.target;
      try { const r = await api('/users', { method: 'POST', body: { username: f.username.value, name: f.name.value || undefined, email: f.email.value } }); md.close(); toast('Estação criada', `Senha inicial: ${r.password}`, 'ok'); await loadRooms(); route({ quiet: true }); }
      catch (err) { $('#nu-err').textContent = err.message; }
    };
  };
  $$('[data-edit]').forEach(b => b.onclick = () => {
    const u = state.usersById[b.dataset.edit];
    const md = openModal({ title: `Editar ${u.username.toUpperCase()}`, body: `<form id="eu-form">
      <div class="field"><label>Nome<input name="name" value="${esc(u.name)}" required></label></div>
      <div class="field"><label>E-mail para notificações<input name="email" type="email" value="${esc(u.email || '')}"></label></div>
      ${u.id !== state.me.id ? `<label class="check"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}> Estação ativa (pode entrar no sistema)</label>` : ''}
      <div class="form-error" id="eu-err"></div></form>`,
      foot: '<button class="btn" data-x>Cancelar</button><button class="btn btn-primary" form="eu-form" type="submit">Salvar</button>' });
    $('[data-x]', md.el).onclick = md.close;
    $('#eu-form').onsubmit = async e => {
      e.preventDefault(); const f = e.target;
      try { await api(`/users/${u.id}`, { method: 'PUT', body: { name: f.name.value, email: f.email.value, active: f.active ? f.active.checked : true } }); md.close(); toast('Usuário atualizado', '', 'ok'); route({ quiet: true }); }
      catch (err) { $('#eu-err').textContent = err.message; }
    };
  });
  $$('[data-reset]').forEach(b => b.onclick = async () => {
    const u = state.usersById[b.dataset.reset];
    if (!await confirmDialog(`Redefinir senha de ${u.username.toUpperCase()}?`, 'A senha volta para a senha inicial e o usuário precisará criar uma nova no próximo acesso.', 'Redefinir', true)) return;
    try { const r = await api(`/users/${u.id}/reset-password`, { method: 'POST' }); if (u.id === state.me.id) return logout(); openModal({ title: 'Senha redefinida', body: `<p>Nova senha temporária de <b>${esc(u.username.toUpperCase())}</b>:</p><p style="font-size:22px" class="mono"><b>${esc(r.password)}</b></p>`, foot: '<button class="btn btn-primary" onclick="this.closest(\'.modal-bg\').remove()">Ok</button>' }); route({ quiet: true }); }
    catch (err) { toast('Erro', err.message, 'err'); }
  });
}

// ============================================================ configurações (supervisor)
async function viewSettings(m, params, ctx) {
  setTitle('Configurações');
  const [s, emails] = await Promise.all([api('/settings'), api('/emails')]);
  if (stale(ctx)) return;
  const emailStatus = { enviado: ['Enviado', 'st-resolvido'], erro: ['Erro', 'st-aberto" style="background:var(--danger-bg);color:var(--danger)'], nao_enviado: ['Não enviado', 'st-fechado'] };
  $('#view').innerHTML = `<div class="page section-gap" style="max-width:980px">
    ${!s.smtp_host ? '<div class="alert alert-warn"><b>E-mail ainda não configurado.</b> Os chamados funcionam normalmente, mas ninguém recebe notificações até você preencher o servidor de e-mail abaixo.</div>' : ''}
    ${!state.me.email ? '<div class="alert alert-warn">Cadastre o seu e-mail no <a href="#/perfil">Perfil</a> para receber os avisos de novos chamados.</div>' : ''}
    <form class="card" id="cfg-form"><div class="card-head"><h3>${icon('mail').replace('<svg', '<svg style="width:18px;height:18px;vertical-align:-3px;margin-right:6px"')}Servidor de e-mail (SMTP)</h3>
      <div style="display:flex;gap:6px;flex-wrap:wrap"><span class="muted small" style="align-self:center">Preencher para:</span>
      <button type="button" class="btn btn-sm" data-preset="gmail">Gmail</button><button type="button" class="btn btn-sm" data-preset="outlook">Outlook / Hotmail</button><button type="button" class="btn btn-sm" data-preset="o365">Microsoft 365</button></div></div>
      <div class="card-body">
        <div class="grid-3"><div class="field" style="grid-column:span 2"><label>Servidor SMTP<input name="smtp_host" value="${esc(s.smtp_host)}" placeholder="smtp.gmail.com"></label></div>
        <div class="field"><label>Porta<input name="smtp_port" type="number" value="${esc(s.smtp_port)}"></label></div></div>
        <div class="grid-2"><div class="field"><label>Usuário (e-mail da conta)<input name="smtp_user" value="${esc(s.smtp_user)}" autocomplete="off"></label></div>
        <div class="field"><label>Senha<input name="smtp_pass" type="password" value="${esc(s.smtp_pass)}" autocomplete="new-password"></label><div class="field-hint">No Gmail use uma <b>senha de app</b> (Conta Google → Segurança → Senhas de app).</div></div></div>
        <div class="grid-2"><div class="field"><label>Remetente<input name="smtp_from" value="${esc(s.smtp_from)}" placeholder='"Suporte TI" &lt;ti@empresa.com.br&gt;'></label><div class="field-hint">Se ficar vazio, usa o usuário acima.</div></div>
        <div class="field"><label>&nbsp;</label><label class="check" style="margin-top:14px"><input type="checkbox" name="smtp_secure" ${s.smtp_secure === '1' ? 'checked' : ''}> Usar SSL direto (porta 465)</label></div></div>
      </div>
      <div class="card-head" style="border-top:1px solid var(--border)"><h3>Sistema</h3></div>
      <div class="card-body"><div class="grid-2">
        <div class="field"><label>Nome do sistema<input name="app_name" value="${esc(s.app_name)}"></label></div>
        <div class="field"><label>Endereço do sistema na rede<input name="app_url" value="${esc(s.app_url)}" placeholder="${esc(s.app_url_auto)} (automático)"></label><div class="field-hint">Usado no botão "Abrir chamado" dos e-mails. Deixe vazio para usar o IP deste servidor automaticamente (${esc(s.app_url_auto)}).</div></div></div></div>
      <div class="card-head" style="border-top:1px solid var(--border)"><h3>Prazos de atendimento por prioridade (em horas)</h3></div>
      <div class="card-body"><div class="grid-3" style="grid-template-columns:repeat(4,1fr)">
        ${state.meta.priorities.map(p => `<div class="field"><label>${prioBadge(p.key)}<input type="number" min="1" max="720" name="sla_${p.key}" value="${esc(s[`sla_${p.key}`])}"></label></div>`).join('')}</div>
        <div class="field-hint">Vale para os próximos chamados. O prazo de cada chamado pode ser ajustado manualmente na tela dele.</div>
        <div class="form-error" id="cfg-err"></div>
        <div style="display:flex;justify-content:flex-end"><button class="btn btn-primary" type="submit">Salvar configurações</button></div></div>
    </form>
    <div class="card"><div class="card-head"><h3>Testar envio</h3></div><div class="card-body"><form id="test-form" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
      <label style="flex:1;min-width:240px">Enviar e-mail de teste para<input name="to" type="email" value="${esc(state.me.email)}" placeholder="seu@email.com" required></label>
      <button class="btn" type="submit">${icon('send')} Enviar teste</button></form><p class="muted small" style="margin:10px 0 0">Salve as configurações antes de testar.</p></div></div>
    <div class="card"><div class="card-head"><h3>Últimos e-mails</h3><span class="muted small">${emails.length} registros</span></div>
      ${emails.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Para</th><th>Assunto</th><th>Situação</th></tr></thead><tbody>
      ${emails.map(e => `<tr><td class="nowrap muted">${fmtDT(e.created_at)}</td><td>${esc(e.to_addr)}</td><td>${esc(e.subject)}</td><td><span class="badge ${emailStatus[e.status]?.[1] || ''}">${emailStatus[e.status]?.[0] || esc(e.status)}</span>${e.error ? `<div class="t-sub" style="max-width:260px">${esc(e.error)}</div>` : ''}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">Nenhum e-mail ainda.</div>'}</div>
  </div>`;

  const f = $('#cfg-form');
  const presets = { gmail: ['smtp.gmail.com', 587], outlook: ['smtp-mail.outlook.com', 587], o365: ['smtp.office365.com', 587] };
  $$('[data-preset]').forEach(b => b.onclick = () => { const [h, p] = presets[b.dataset.preset]; f.smtp_host.value = h; f.smtp_port.value = p; f.smtp_secure.checked = false; f.smtp_user.focus(); });
  f.onsubmit = async e => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(f)); body.smtp_secure = f.smtp_secure.checked ? '1' : '0';
    try { await withBusy($('button[type=submit]', f), () => api('/settings', { method: 'PUT', body })); toast('Configurações salvas', '', 'ok'); state.meta = await api('/meta'); state.appName = state.meta.appName; $$('.app-name').forEach(x => x.textContent = state.appName); updateTitle(); route({ quiet: true }); }
    catch (err) { $('#cfg-err').textContent = err.message; }
  };
  $('#test-form').onsubmit = async e => {
    e.preventDefault();
    try { await withBusy($('button', e.target), () => api('/settings/test-email', { method: 'POST', body: { to: e.target.to.value } })); toast('E-mail de teste enviado', 'Confira a caixa de entrada (e o spam)', 'ok'); }
    catch (err) { toast('Falha no envio', err.message, 'err'); }
    route({ quiet: true });
  };
}

// ============================================================ perfil
async function viewProfile() {
  setTitle('Meu perfil');
  const me = state.me;
  $('#view').innerHTML = `<div class="page section-gap" style="max-width:720px">
    <div class="card card-pad" style="display:flex;gap:16px;align-items:center">${avatar(me, { size: 'lg' })}
      <div><div class="station" style="font-size:13px">${esc(me.username.toUpperCase())}</div><h2 style="font-size:20px">${esc(me.name)}</h2><div class="muted">${isAdmin() ? 'Supervisor de TI' : 'Estação de trabalho'}</div></div></div>
    <form class="card" id="pf-form"><div class="card-head"><h3>Dados pessoais</h3></div><div class="card-body">
      <div class="field"><label>Nome<input name="name" value="${esc(me.name)}" required></label></div>
      <div class="field"><label>E-mail para notificações<input name="email" type="email" value="${esc(me.email)}" placeholder="nome@empresa.com.br"></label><div class="field-hint">É para este e-mail que vão os avisos de abertura, andamento, prazo e solução dos chamados.</div></div>
      <div class="form-error" id="pf-err"></div><div style="display:flex;justify-content:flex-end"><button class="btn btn-primary" type="submit">Salvar</button></div></div></form>
    <form class="card" id="pw-form"><div class="card-head"><h3>Alterar senha</h3></div><div class="card-body">
      <div class="field"><label>Senha atual<input name="current" type="password" required autocomplete="current-password"></label></div>
      <div class="grid-2"><div class="field"><label>Nova senha<input name="password" type="password" minlength="6" required autocomplete="new-password"></label></div>
      <div class="field"><label>Confirmar nova senha<input name="confirm" type="password" minlength="6" required autocomplete="new-password"></label></div></div>
      <div class="form-error" id="pw-err"></div><div style="display:flex;justify-content:flex-end"><button class="btn" type="submit">${icon('lock')} Alterar senha</button></div></div></form></div>`;
  $('#pf-form').onsubmit = async e => {
    e.preventDefault(); const f = e.target;
    try { const r = await api('/me', { method: 'PUT', body: { name: f.name.value, email: f.email.value } }); state.me = r.user; renderShell(); await loadUsers(); toast('Perfil atualizado', '', 'ok'); route(); }
    catch (err) { $('#pf-err').textContent = err.message; }
  };
  $('#pw-form').onsubmit = async e => {
    e.preventDefault(); const f = e.target;
    if (f.password.value !== f.confirm.value) { $('#pw-err').textContent = 'As senhas não conferem'; return; }
    try { await api('/me/password', { method: 'POST', body: { current: f.current.value, password: f.password.value } }); f.reset(); $('#pw-err').textContent = ''; toast('Senha alterada', '', 'ok'); }
    catch (err) { $('#pw-err').textContent = err.message; }
  };
}

// Atualiza contadores de prazo a cada minuto
setInterval(() => { const r = state.route?.name; if ((r === 'dashboard' || r === 'tickets') && !document.hidden && !$('.modal-bg') && document.activeElement?.tagName !== 'INPUT') route({ quiet: true }); }, 60000);

boot();

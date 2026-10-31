// SISTEC Chamados — servidor de chamados internos + chat
// Rode com: node server.js   (ou dê dois cliques em iniciar.bat)
import express from 'express';
import nodemailer from 'nodemailer';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'anexos');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const DEFAULT_USER_PW = 'sistec@123';
const DEFAULT_ADMIN_PW = 'admin@123';
const STATUS = ['aberto', 'em_andamento', 'aguardando', 'resolvido', 'fechado'];
const STATUS_LABEL = { aberto: 'Aberto', em_andamento: 'Em andamento', aguardando: 'Aguardando usuário', resolvido: 'Resolvido', fechado: 'Fechado' };
const PRIORITIES = ['baixa', 'media', 'alta', 'critica'];
const PRIORITY_LABEL = { baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica' };
const CATEGORIES = ['Hardware', 'Software', 'Rede / Internet', 'Impressora', 'E-mail', 'Acesso / Senha', 'Sistema interno', 'Telefonia', 'Outros'];
const OPEN_STATUSES = ['aberto', 'em_andamento', 'aguardando'];

// ---------------------------------------------------------------- banco
const db = new DatabaseSync(path.join(DATA_DIR, 'chamados.db'));
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user',
  password_hash TEXT NOT NULL,
  must_change_pw INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  last_seen TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  station TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aberto',
  due_at TEXT NOT NULL,
  solution TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT,
  overdue_notified INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ticket_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  type TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room TEXT NOT NULL,
  sender_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room, id);
CREATE TABLE IF NOT EXISTS chat_reads (
  user_id INTEGER NOT NULL,
  room TEXT NOT NULL,
  last_read_id INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, room)
);
CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
  event_id INTEGER,
  message_id INTEGER,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  stored TEXT NOT NULL,
  uploaded_by INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS email_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_addr TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
`);

const now = () => new Date().toISOString();
const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);

function hashPw(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
}
function checkPw(pw, stored) {
  const [salt, h] = String(stored).split(':');
  if (!salt || !h) return false;
  const a = crypto.scryptSync(String(pw), salt, 64);
  const b = Buffer.from(h, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function lanIp() {
  const nets = Object.values(os.networkInterfaces()).flat().filter(n => n && n.family === 'IPv4' && !n.internal);
  const good = nets.find(n => /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(n.address));
  return (good || nets.find(n => !n.address.startsWith('169.254')) || { address: 'localhost' }).address;
}

// Dados iniciais: supervisor + 20 estações
if (!one('SELECT id FROM users LIMIT 1')) {
  const t = now();
  run(`INSERT INTO users (username,name,email,role,password_hash,must_change_pw,created_at) VALUES (?,?,?,?,?,1,?)`,
    'fabricio', 'Fabricio Pereira', '', 'admin', hashPw(DEFAULT_ADMIN_PW), t);
  for (let i = 1; i <= 20; i++) {
    const u = `sistec${String(i).padStart(3, '0')}`;
    run(`INSERT INTO users (username,name,email,role,password_hash,must_change_pw,created_at) VALUES (?,?,?,?,?,1,?)`,
      u, `Estação ${u.toUpperCase()}`, '', 'user', hashPw(DEFAULT_USER_PW), t);
  }
}
const DEFAULT_SETTINGS = {
  app_name: 'SISTEC Chamados',
  app_url: '', // vazio = detecta o IP do servidor automaticamente

  smtp_host: '', smtp_port: '587', smtp_secure: '0', smtp_user: '', smtp_pass: '', smtp_from: '',
  sla_baixa: '72', sla_media: '24', sla_alta: '8', sla_critica: '4',
};
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) run('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)', k, v);
const getSettings = () => {
  const s = Object.fromEntries(all('SELECT key,value FROM settings').map(r => [r.key, r.value]));
  s.app_url_auto = `http://${lanIp()}:${PORT}`;
  if (!s.app_url) s.app_url = s.app_url_auto;
  return s;
};

// ---------------------------------------------------------------- e-mail
const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ticketCode = id => `CH-${String(id).padStart(5, '0')}`;
const fmtDate = iso => iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

function emailHtml({ heading, intro, ticket, extra = '', s }) {
  const statusColors = { aberto: '#2563eb', em_andamento: '#d97706', aguardando: '#7c3aed', resolvido: '#16a34a', fechado: '#475569' };
  const link = `${s.app_url}/#/chamado/${ticket.id}`;
  const row = (k, v) => `<tr><td style="padding:6px 0;color:#64748b;width:140px;vertical-align:top">${k}</td><td style="padding:6px 0;color:#0f172a">${v}</td></tr>`;
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
<tr><td style="background:#0f172a;padding:20px 28px;color:#fff;font-size:18px;font-weight:600">${escHtml(s.app_name)}</td></tr>
<tr><td style="padding:28px">
<div style="font-size:20px;font-weight:600;color:#0f172a;margin-bottom:6px">${escHtml(heading)}</div>
<div style="color:#475569;margin-bottom:20px">${escHtml(intro)}</div>
<div style="border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px">
<div style="font-size:13px;color:#64748b">${ticketCode(ticket.id)}</div>
<div style="font-size:17px;font-weight:600;color:#0f172a;margin:2px 0 12px">${escHtml(ticket.title)}</div>
<table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
${row('Status', `<span style="background:${statusColors[ticket.status]};color:#fff;padding:2px 10px;border-radius:99px;font-size:12px">${STATUS_LABEL[ticket.status]}</span>`)}
${row('Estação', escHtml(ticket.station.toUpperCase()))}
${row('Solicitante', escHtml(ticket.user_name))}
${row('Categoria', escHtml(ticket.category))}
${row('Prioridade', PRIORITY_LABEL[ticket.priority])}
${row('Prazo', fmtDate(ticket.due_at))}
</table></div>
${extra}
<div style="margin-top:24px"><a href="${link}" style="background:#2563eb;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600;display:inline-block">Abrir chamado</a></div>
</td></tr>
<tr><td style="padding:14px 28px;background:#f8fafc;color:#94a3b8;font-size:12px">Mensagem automática do sistema de chamados internos. Não responda este e-mail.</td></tr>
</table></td></tr></table></body></html>`;
}
const textBlock = (title, body) => `<div style="margin-top:18px"><div style="font-weight:600;color:#0f172a;margin-bottom:6px">${escHtml(title)}</div><div style="white-space:pre-wrap;color:#334155;background:#f8fafc;border-left:3px solid #2563eb;padding:10px 14px;border-radius:4px">${escHtml(body)}</div></div>`;

function transport(s) {
  if (!s.smtp_host) return null;
  return nodemailer.createTransport({
    host: s.smtp_host, port: Number(s.smtp_port) || 587, secure: s.smtp_secure === '1',
    auth: s.smtp_user ? { user: s.smtp_user, pass: s.smtp_pass } : undefined,
    tls: { rejectUnauthorized: false },
  });
}
async function sendMail(toList, subject, html) {
  const to = [...new Set(toList.filter(e => e && /@/.test(e)).map(e => e.trim().toLowerCase()))];
  if (!to.length) return { ok: false, error: 'Nenhum destinatário com e-mail cadastrado' };
  const s = getSettings();
  const tr = transport(s);
  if (!tr) {
    run('INSERT INTO email_log (to_addr,subject,status,error,created_at) VALUES (?,?,?,?,?)', to.join(', '), subject, 'nao_enviado', 'SMTP não configurado', now());
    return { ok: false, error: 'SMTP não configurado' };
  }
  try {
    await tr.sendMail({ from: s.smtp_from || s.smtp_user, to: to.join(', '), subject, html });
    run('INSERT INTO email_log (to_addr,subject,status,created_at) VALUES (?,?,?,?)', to.join(', '), subject, 'enviado', now());
    return { ok: true };
  } catch (e) {
    run('INSERT INTO email_log (to_addr,subject,status,error,created_at) VALUES (?,?,?,?,?)', to.join(', '), subject, 'erro', String(e.message || e), now());
    console.error('[e-mail] falha:', e.message);
    return { ok: false, error: e.message };
  }
}
const adminEmails = () => all(`SELECT email FROM users WHERE role='admin' AND active=1 AND email<>''`).map(r => r.email);
const loadTicket = id => one(`SELECT t.*, u.name AS user_name, u.email AS user_email FROM tickets t JOIN users u ON u.id=t.user_id WHERE t.id=?`, id);

// Envia sem travar a resposta da API
function notify(ticketId, { to = 'both', heading, intro, extra = '' }) {
  const t = loadTicket(ticketId);
  if (!t) return;
  const s = getSettings();
  const recipients = to === 'admin' ? adminEmails() : to === 'user' ? [t.user_email] : [...adminEmails(), t.user_email];
  const subject = `[${ticketCode(t.id)}] ${heading} — ${t.title}`;
  sendMail(recipients, subject, emailHtml({ heading, intro, ticket: t, extra, s })).catch(() => {});
}

// ---------------------------------------------------------------- tempo real (SSE)
const clients = new Map(); // userId -> Set<res>
const onlineIds = () => [...clients.keys()];
function emitTo(userIds, event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const id of new Set(userIds)) for (const res of clients.get(id) || []) res.write(payload);
}
const emitAll = (event, data) => emitTo(onlineIds(), event, data);
const adminIds = () => all(`SELECT id FROM users WHERE role='admin' AND active=1`).map(r => r.id);
const emitTicket = (t, extra = {}) => emitTo([t.user_id, ...adminIds()], 'ticket', { id: t.id, ...extra });

// ---------------------------------------------------------------- anexos
const MAX_FILE = 10 * 1024 * 1024;
const INLINE_MIME = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'];
function saveAttachments(list, userId, link) {
  if (!Array.isArray(list)) return [];
  const saved = [];
  for (const f of list.slice(0, 6)) {
    if (!f || typeof f.data !== 'string') continue;
    const buf = Buffer.from(f.data.replace(/^data:[^,]*,/, ''), 'base64');
    if (!buf.length || buf.length > MAX_FILE) continue;
    const name = String(f.name || 'arquivo').replace(/[\\/:*?"<>|\r\n]/g, '_').slice(0, 120);
    const ext = path.extname(name).slice(0, 10).replace(/[^.\w]/g, '');
    const stored = crypto.randomBytes(16).toString('hex') + ext;
    fs.writeFileSync(path.join(UPLOAD_DIR, stored), buf);
    const r = run(`INSERT INTO attachments (ticket_id,event_id,message_id,filename,mime,size,stored,uploaded_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      link.ticketId ?? null, link.eventId ?? null, link.messageId ?? null, name, String(f.type || 'application/octet-stream').slice(0, 100), buf.length, stored, userId, now());
    saved.push(Number(r.lastInsertRowid));
  }
  return saved;
}
const attachmentPub = a => ({ id: a.id, filename: a.filename, mime: a.mime, size: a.size, eventId: a.event_id });

// ---------------------------------------------------------------- app
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '80mb' }));
app.use((req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });
app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));

const parseCookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(p => p.trim()).filter(Boolean).map(p => {
  const i = p.indexOf('='); return [p.slice(0, i), decodeURIComponent(p.slice(i + 1))];
}));
const pubUser = u => ({ id: u.id, username: u.username, name: u.name, email: u.email, role: u.role, mustChange: !!u.must_change_pw, active: !!u.active, lastSeen: u.last_seen });
const fail = (res, code, error) => res.status(code).json({ error });

// Proteção simples contra tentativa de senha
const attempts = new Map();
app.post('/api/login', (req, res) => {
  const ip = req.socket.remoteAddress;
  const a = attempts.get(ip) || { n: 0, t: Date.now() };
  if (Date.now() - a.t > 10 * 60e3) { a.n = 0; a.t = Date.now(); }
  if (a.n >= 10) return fail(res, 429, 'Muitas tentativas. Aguarde alguns minutos.');
  const { username, password } = req.body || {};
  const u = one('SELECT * FROM users WHERE username=?', String(username || '').trim());
  if (!u || !checkPw(password || '', u.password_hash)) { a.n++; attempts.set(ip, a); return fail(res, 401, 'Usuário ou senha incorretos'); }
  if (!u.active) return fail(res, 403, 'Usuário desativado. Fale com o supervisor de TI.');
  attempts.delete(ip);
  const token = crypto.randomBytes(32).toString('hex');
  const exp = new Date(Date.now() + 30 * 864e5).toISOString();
  run('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)', token, u.id, exp);
  run('UPDATE users SET last_seen=? WHERE id=?', now(), u.id);
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 86400}`);
  res.json({ user: pubUser(u) });
});
app.get('/api/public', (req, res) => {
  const s = getSettings();
  res.json({ appName: s.app_name, stations: all(`SELECT username FROM users WHERE active=1 ORDER BY role='admin' DESC, username`).map(r => r.username) });
});

const api = express.Router();
api.use((req, res, next) => {
  const token = parseCookies(req).sid;
  const u = token && one(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>? AND u.active=1`, token, now());
  if (!u) return fail(res, 401, 'Sessão expirada. Entre novamente.');
  req.user = u; req.token = token;
  if (u.must_change_pw && !req.path.startsWith('/me') && req.path !== '/logout' && req.path !== '/stream') return fail(res, 403, 'Complete seu primeiro acesso');
  next();
});
const adminOnly = (req, res, next) => req.user.role === 'admin' ? next() : fail(res, 403, 'Apenas o supervisor de TI');
const isAdmin = req => req.user.role === 'admin';

api.post('/logout', (req, res) => {
  run('DELETE FROM sessions WHERE token=?', req.token);
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0');
  res.json({ ok: true });
});

// ---- perfil
api.get('/me', (req, res) => res.json({ user: pubUser(req.user), online: onlineIds() }));
api.put('/me', (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 80);
  const email = String(req.body.email || '').trim().slice(0, 120);
  if (!name) return fail(res, 400, 'Informe seu nome');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, 'E-mail inválido');
  run('UPDATE users SET name=?, email=? WHERE id=?', name, email, req.user.id);
  res.json({ user: pubUser(one('SELECT * FROM users WHERE id=?', req.user.id)) });
});
api.post('/me/password', (req, res) => {
  const { current, password } = req.body || {};
  if (!checkPw(current || '', req.user.password_hash)) return fail(res, 400, 'Senha atual incorreta');
  if (!password || String(password).length < 6) return fail(res, 400, 'A nova senha precisa ter pelo menos 6 caracteres');
  if (password === current) return fail(res, 400, 'A nova senha deve ser diferente da atual');
  run('UPDATE users SET password_hash=?, must_change_pw=0 WHERE id=?', hashPw(password), req.user.id);
  run('DELETE FROM sessions WHERE user_id=? AND token<>?', req.user.id, req.token);
  res.json({ user: pubUser(one('SELECT * FROM users WHERE id=?', req.user.id)) });
});
// Primeiro acesso: nome, e-mail e nova senha numa tacada só
api.post('/me/setup', (req, res) => {
  const { name, email, current, password } = req.body || {};
  if (!String(name || '').trim()) return fail(res, 400, 'Informe seu nome');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim())) return fail(res, 400, 'Informe um e-mail válido para receber as notificações');
  if (!checkPw(current || '', req.user.password_hash)) return fail(res, 400, 'Senha atual incorreta');
  if (!password || String(password).length < 6) return fail(res, 400, 'A nova senha precisa ter pelo menos 6 caracteres');
  if (password === current) return fail(res, 400, 'A nova senha deve ser diferente da senha inicial');
  run('UPDATE users SET name=?, email=?, password_hash=?, must_change_pw=0 WHERE id=?', String(name).trim().slice(0, 80), String(email).trim().slice(0, 120), hashPw(password), req.user.id);
  res.json({ user: pubUser(one('SELECT * FROM users WHERE id=?', req.user.id)) });
});

// ---- usuários / estações
api.get('/users', (req, res) => {
  const rows = all(`SELECT u.*, (SELECT COUNT(*) FROM tickets t WHERE t.user_id=u.id AND t.status IN ('aberto','em_andamento','aguardando')) AS open_tickets,
    (SELECT COUNT(*) FROM tickets t WHERE t.user_id=u.id) AS total_tickets FROM users u ORDER BY u.role='admin' DESC, u.username`);
  res.json(rows.filter(u => isAdmin(req) || u.active).map(u => ({ ...pubUser(u), email: isAdmin(req) || u.role === 'admin' ? u.email : undefined, openTickets: u.open_tickets, totalTickets: u.total_tickets })));
});
api.post('/users', adminOnly, (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) return fail(res, 400, 'Nome de usuário inválido (use letras, números, ponto ou hífen)');
  if (one('SELECT id FROM users WHERE username=?', username)) return fail(res, 400, 'Esse usuário já existe');
  const role = req.body.role === 'admin' ? 'admin' : 'user';
  const r = run(`INSERT INTO users (username,name,email,role,password_hash,must_change_pw,created_at) VALUES (?,?,?,?,?,1,?)`,
    username, String(req.body.name || `Estação ${username.toUpperCase()}`).trim().slice(0, 80), String(req.body.email || '').trim(), role, hashPw(DEFAULT_USER_PW), now());
  res.json({ id: Number(r.lastInsertRowid), password: DEFAULT_USER_PW });
});
api.put('/users/:id', adminOnly, (req, res) => {
  const u = one('SELECT * FROM users WHERE id=?', req.params.id);
  if (!u) return fail(res, 404, 'Usuário não encontrado');
  const name = String(req.body.name ?? u.name).trim().slice(0, 80);
  const email = String(req.body.email ?? u.email).trim().slice(0, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, 'E-mail inválido');
  let active = req.body.active === undefined ? u.active : (req.body.active ? 1 : 0);
  if (u.id === req.user.id) active = 1;
  run('UPDATE users SET name=?, email=?, active=? WHERE id=?', name || u.name, email, active, u.id);
  if (!active) run('DELETE FROM sessions WHERE user_id=?', u.id);
  res.json({ ok: true });
});
api.post('/users/:id/reset-password', adminOnly, (req, res) => {
  const u = one('SELECT * FROM users WHERE id=?', req.params.id);
  if (!u) return fail(res, 404, 'Usuário não encontrado');
  const pw = u.role === 'admin' ? DEFAULT_ADMIN_PW : DEFAULT_USER_PW;
  run('UPDATE users SET password_hash=?, must_change_pw=1 WHERE id=?', hashPw(pw), u.id);
  run('DELETE FROM sessions WHERE user_id=?', u.id);
  res.json({ password: pw });
});

// ---- chamados
const ticketPub = t => ({
  id: t.id, code: ticketCode(t.id), userId: t.user_id, station: t.station, userName: t.user_name, userEmail: t.user_email,
  title: t.title, category: t.category, priority: t.priority, description: t.description, status: t.status,
  dueAt: t.due_at, solution: t.solution, createdAt: t.created_at, updatedAt: t.updated_at, resolvedAt: t.resolved_at,
  overdue: OPEN_STATUSES.includes(t.status) && t.due_at < now(),
});
function canSee(req, t) { return t && (isAdmin(req) || t.user_id === req.user.id); }
function addEvent(ticketId, userId, type, body = '') {
  return Number(run('INSERT INTO ticket_events (ticket_id,user_id,type,body,created_at) VALUES (?,?,?,?,?)', ticketId, userId, type, body, now()).lastInsertRowid);
}

api.get('/meta', (req, res) => {
  const s = getSettings();
  res.json({
    statuses: STATUS.map(k => ({ key: k, label: STATUS_LABEL[k] })),
    priorities: PRIORITIES.map(k => ({ key: k, label: PRIORITY_LABEL[k], slaHours: Number(s[`sla_${k}`]) })),
    categories: CATEGORIES, appName: s.app_name,
  });
});

api.get('/tickets', (req, res) => {
  const where = []; const params = [];
  if (!isAdmin(req)) { where.push('t.user_id=?'); params.push(req.user.id); }
  const { status, priority, q, station } = req.query;
  if (status === 'abertos') where.push(`t.status IN ('aberto','em_andamento','aguardando')`);
  else if (status === 'atrasados') { where.push(`t.status IN ('aberto','em_andamento','aguardando') AND t.due_at<?`); params.push(now()); }
  else if (STATUS.includes(status)) { where.push('t.status=?'); params.push(status); }
  if (PRIORITIES.includes(priority)) { where.push('t.priority=?'); params.push(priority); }
  if (station && isAdmin(req)) { where.push('t.station=?'); params.push(station); }
  if (q) {
    const term = `%${String(q).trim()}%`; const idNum = Number(String(q).replace(/\D/g, ''));
    where.push('(t.title LIKE ? OR t.description LIKE ? OR t.station LIKE ? OR u.name LIKE ? OR t.id=?)'); params.push(term, term, term, term, idNum || -1);
  }
  const rows = all(`SELECT t.*, u.name AS user_name, u.email AS user_email,
      (SELECT COUNT(*) FROM ticket_events e WHERE e.ticket_id=t.id AND e.type='comment') AS comments
    FROM tickets t JOIN users u ON u.id=t.user_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY CASE WHEN t.status IN ('aberto','em_andamento','aguardando') THEN 0 ELSE 1 END,
      CASE t.priority WHEN 'critica' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END, t.due_at, t.id DESC LIMIT 500`, ...params);
  res.json(rows.map(t => ({ ...ticketPub(t), comments: t.comments })));
});

api.post('/tickets', (req, res) => {
  const title = String(req.body.title || '').trim().slice(0, 150);
  const description = String(req.body.description || '').trim().slice(0, 10000);
  const category = CATEGORIES.includes(req.body.category) ? req.body.category : 'Outros';
  const priority = PRIORITIES.includes(req.body.priority) ? req.body.priority : 'media';
  if (title.length < 4) return fail(res, 400, 'Dê um título ao chamado (mínimo 4 caracteres)');
  if (description.length < 10) return fail(res, 400, 'Descreva o problema com mais detalhes');
  // Supervisor pode abrir chamado em nome de uma estação
  let owner = req.user;
  if (isAdmin(req) && req.body.forUserId) owner = one('SELECT * FROM users WHERE id=? AND active=1', req.body.forUserId) || req.user;
  const s = getSettings();
  const due = new Date(Date.now() + (Number(s[`sla_${priority}`]) || 24) * 3600e3).toISOString();
  const t0 = now();
  const r = run(`INSERT INTO tickets (user_id,station,title,category,priority,description,status,due_at,created_at,updated_at) VALUES (?,?,?,?,?,?,'aberto',?,?,?)`,
    owner.id, owner.username, title, category, priority, description, due, t0, t0);
  const id = Number(r.lastInsertRowid);
  const evId = addEvent(id, req.user.id, 'created', owner.id !== req.user.id ? `Aberto por ${req.user.name} em nome de ${owner.name}` : '');
  saveAttachments(req.body.attachments, req.user.id, { ticketId: id, eventId: evId });
  const t = loadTicket(id);
  notify(id, { heading: 'Novo chamado aberto', intro: `${t.user_name} (${t.station.toUpperCase()}) abriu um chamado. Prazo de atendimento: ${fmtDate(t.due_at)}.`, extra: textBlock('Descrição do problema', t.description) });
  emitTicket(t, { action: 'created', by: req.user.id, code: ticketCode(id), title, station: t.station });
  res.json(ticketPub(t));
});

api.get('/tickets/:id', (req, res) => {
  const t = loadTicket(req.params.id);
  if (!canSee(req, t)) return fail(res, 404, 'Chamado não encontrado');
  const events = all(`SELECT e.*, u.name AS user_name, u.username, u.role FROM ticket_events e LEFT JOIN users u ON u.id=e.user_id WHERE e.ticket_id=? ORDER BY e.id`, t.id);
  const atts = all('SELECT * FROM attachments WHERE ticket_id=? ORDER BY id', t.id).map(attachmentPub);
  res.json({
    ...ticketPub(t), attachments: atts,
    events: events.map(e => ({ id: e.id, type: e.type, body: e.body, createdAt: e.created_at, user: e.user_id ? { id: e.user_id, name: e.user_name, username: e.username, role: e.role } : null })),
  });
});

api.patch('/tickets/:id', (req, res) => {
  const t = loadTicket(req.params.id);
  if (!canSee(req, t)) return fail(res, 404, 'Chamado não encontrado');
  const b = req.body || {};
  const changes = [];
  const set = {};

  if (!isAdmin(req)) {
    // Usuário: confirma a solução (fecha) ou reabre
    if (b.status === 'fechado' && t.status === 'resolvido') set.status = 'fechado';
    else if (b.status === 'aberto' && ['resolvido', 'fechado'].includes(t.status)) set.status = 'aberto';
    else return fail(res, 403, 'Ação não permitida');
  } else {
    if (b.status !== undefined && STATUS.includes(b.status) && b.status !== t.status) set.status = b.status;
    if (b.priority !== undefined && PRIORITIES.includes(b.priority) && b.priority !== t.priority) set.priority = b.priority;
    if (b.category !== undefined && CATEGORIES.includes(b.category) && b.category !== t.category) set.category = b.category;
    if (b.dueAt !== undefined) {
      const d = new Date(b.dueAt);
      if (isNaN(d)) return fail(res, 400, 'Prazo inválido');
      if (d.toISOString() !== t.due_at) set.due_at = d.toISOString();
    }
    if (b.solution !== undefined && String(b.solution).trim() !== t.solution) set.solution = String(b.solution).trim().slice(0, 10000);
    if ((set.status === 'resolvido' || (!set.status && t.status === 'resolvido' && set.solution !== undefined)) && !(set.solution ?? t.solution)) {
      return fail(res, 400, 'Descreva a solução antes de marcar como resolvido');
    }
  }
  if (!Object.keys(set).length) return res.json(ticketPub(t));

  const t1 = now();
  if (set.status) {
    if (['resolvido', 'fechado'].includes(set.status) && !t.resolved_at) set.resolved_at = t1;
    if (OPEN_STATUSES.includes(set.status)) set.resolved_at = null;
  }
  if (set.due_at) set.overdue_notified = 0;
  set.updated_at = t1;
  const cols = Object.keys(set);
  run(`UPDATE tickets SET ${cols.map(c => `${c}=?`).join(', ')} WHERE id=?`, ...cols.map(c => set[c]), t.id);

  if (set.status) { addEvent(t.id, req.user.id, 'status', `${t.status}>${set.status}`); changes.push(`Status: ${STATUS_LABEL[t.status]} → ${STATUS_LABEL[set.status]}`); }
  if (set.priority) { addEvent(t.id, req.user.id, 'priority', `${t.priority}>${set.priority}`); changes.push(`Prioridade: ${PRIORITY_LABEL[set.priority]}`); }
  if (set.category) { addEvent(t.id, req.user.id, 'category', set.category); changes.push(`Categoria: ${set.category}`); }
  if (set.due_at) { addEvent(t.id, req.user.id, 'deadline', set.due_at); changes.push(`Novo prazo: ${fmtDate(set.due_at)}`); }
  if (set.solution !== undefined) { addEvent(t.id, req.user.id, 'solution', set.solution); }

  const nt = loadTicket(t.id);
  if (set.status === 'resolvido') {
    notify(t.id, { heading: 'Chamado resolvido', intro: `O chamado foi resolvido por ${req.user.name}. Confira a solução e confirme no sistema se está tudo certo.`, extra: textBlock('Solução aplicada', nt.solution) });
  } else if (set.status === 'fechado') {
    notify(t.id, { heading: 'Chamado fechado', intro: isAdmin(req) ? `O chamado foi encerrado por ${req.user.name}.` : `${req.user.name} confirmou a solução e encerrou o chamado.`, extra: nt.solution ? textBlock('Solução', nt.solution) : '' });
  } else if (set.status === 'aberto' && !isAdmin(req)) {
    notify(t.id, { heading: 'Chamado reaberto', intro: `${req.user.name} reabriu o chamado: o problema continua.` });
  } else if (changes.length || set.solution !== undefined) {
    const lines = [...changes]; if (set.solution !== undefined && set.solution) lines.push('Solução atualizada');
    notify(t.id, { heading: 'Chamado atualizado', intro: lines.join(' · '), extra: set.solution ? textBlock('Solução', set.solution) : '' });
  }
  emitTicket(nt, { action: 'updated', by: req.user.id });
  res.json(ticketPub(nt));
});

api.post('/tickets/:id/comments', (req, res) => {
  const t = loadTicket(req.params.id);
  if (!canSee(req, t)) return fail(res, 404, 'Chamado não encontrado');
  const body = String(req.body.body || '').trim().slice(0, 10000);
  const hasFiles = Array.isArray(req.body.attachments) && req.body.attachments.length;
  if (!body && !hasFiles) return fail(res, 400, 'Escreva uma mensagem');
  const evId = addEvent(t.id, req.user.id, 'comment', body);
  saveAttachments(req.body.attachments, req.user.id, { ticketId: t.id, eventId: evId });
  // Usuário respondeu enquanto aguardava → volta para "em andamento"
  if (!isAdmin(req) && t.status === 'aguardando') {
    run(`UPDATE tickets SET status='em_andamento' WHERE id=?`, t.id);
    addEvent(t.id, null, 'status', 'aguardando>em_andamento');
  }
  run('UPDATE tickets SET updated_at=? WHERE id=?', now(), t.id);
  notify(t.id, {
    to: isAdmin(req) ? 'user' : 'admin', heading: 'Nova mensagem no chamado',
    intro: `${req.user.name} escreveu no chamado.`, extra: textBlock(`Mensagem de ${req.user.name}`, body || '(anexo enviado)'),
  });
  emitTicket(t, { action: 'comment', by: req.user.id, byName: req.user.name, code: ticketCode(t.id) });
  res.json({ ok: true });
});

api.get('/attachments/:id', (req, res) => {
  const a = one('SELECT * FROM attachments WHERE id=?', req.params.id);
  if (!a) return fail(res, 404, 'Arquivo não encontrado');
  if (a.ticket_id) { if (!canSee(req, loadTicket(a.ticket_id))) return fail(res, 404, 'Arquivo não encontrado'); }
  else if (a.message_id) { const m = one('SELECT room FROM messages WHERE id=?', a.message_id); if (!m || !canRoom(req.user, m.room)) return fail(res, 404, 'Arquivo não encontrado'); }
  const inline = INLINE_MIME.includes(a.mime) && req.query.download === undefined;
  res.setHeader('Content-Type', inline ? a.mime : 'application/octet-stream');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.filename)}`);
  res.setHeader('Cache-Control', 'private, max-age=86400');
  fs.createReadStream(path.join(UPLOAD_DIR, a.stored)).on('error', () => res.end()).pipe(res);
});

// ---- painel
api.get('/stats', (req, res) => {
  const mine = isAdmin(req) ? '' : `AND user_id=${Number(req.user.id)}`;
  const n = now();
  const byStatus = Object.fromEntries(STATUS.map(s => [s, 0]));
  for (const r of all(`SELECT status, COUNT(*) c FROM tickets WHERE 1=1 ${mine} GROUP BY status`)) byStatus[r.status] = r.c;
  const overdue = one(`SELECT COUNT(*) c FROM tickets WHERE status IN ('aberto','em_andamento','aguardando') AND due_at<? ${mine}`, n).c;
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const resolvedMonth = one(`SELECT COUNT(*) c FROM tickets WHERE resolved_at>=? ${mine}`, monthStart.toISOString()).c;
  const closedRows = all(`SELECT created_at, resolved_at, due_at FROM tickets WHERE resolved_at IS NOT NULL ${mine} ORDER BY resolved_at DESC LIMIT 200`);
  const avgHours = closedRows.length ? closedRows.reduce((s, r) => s + (new Date(r.resolved_at) - new Date(r.created_at)), 0) / closedRows.length / 3600e3 : null;
  const onTime = closedRows.length ? Math.round(100 * closedRows.filter(r => r.resolved_at <= r.due_at).length / closedRows.length) : null;
  // Últimos 14 dias (data local do servidor)
  const days = [];
  for (let i = 13; i >= 0; i--) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i); days.push(d); }
  const since = days[0].toISOString();
  const created = all(`SELECT created_at FROM tickets WHERE created_at>=? ${mine}`, since);
  const daily = days.map((d, i) => {
    const end = i < 13 ? days[i + 1] : new Date(8.64e15);
    return { date: d.toISOString(), count: created.filter(r => new Date(r.created_at) >= d && new Date(r.created_at) < end).length };
  });
  const byCategory = all(`SELECT category, COUNT(*) c FROM tickets WHERE 1=1 ${mine} GROUP BY category ORDER BY c DESC`);
  const byStation = isAdmin(req) ? all(`SELECT station, COUNT(*) total, SUM(status IN ('aberto','em_andamento','aguardando')) abertos FROM tickets GROUP BY station ORDER BY total DESC LIMIT 10`) : [];
  res.json({ byStatus, overdue, resolvedMonth, avgHours, onTime, daily, byCategory, byStation });
});

// ---- chat
const dmRoom = (a, b) => `dm:${Math.min(a, b)}:${Math.max(a, b)}`;
function roomMembers(room) {
  if (room === 'geral') return all('SELECT id FROM users WHERE active=1').map(r => r.id);
  const m = /^dm:(\d+):(\d+)$/.exec(room); return m ? [Number(m[1]), Number(m[2])] : [];
}
function canRoom(user, room) {
  if (room === 'geral') return true;
  const m = /^dm:(\d+):(\d+)$/.exec(room);
  return !!m && Number(m[1]) < Number(m[2]) && (Number(m[1]) === user.id || Number(m[2]) === user.id) && !!one('SELECT id FROM users WHERE id=?', Number(m[1]) === user.id ? m[2] : m[1]);
}
function msgPub(m) {
  const att = one('SELECT * FROM attachments WHERE message_id=?', m.id);
  return { id: m.id, room: m.room, senderId: m.sender_id, body: m.body, createdAt: m.created_at, attachment: att ? attachmentPub(att) : null };
}

api.get('/chat/rooms', (req, res) => {
  const me = req.user;
  const others = all(`SELECT id, username, name, role, last_seen FROM users WHERE active=1 AND id<>? ORDER BY role='admin' DESC, username`, me.id);
  const info = room => {
    const last = one('SELECT * FROM messages WHERE room=? ORDER BY id DESC LIMIT 1', room);
    const read = one('SELECT last_read_id FROM chat_reads WHERE user_id=? AND room=?', me.id, room)?.last_read_id || 0;
    const unread = one('SELECT COUNT(*) c FROM messages WHERE room=? AND id>? AND sender_id<>?', room, read, me.id).c;
    return { last: last ? { body: last.body || '📎 Anexo', senderId: last.sender_id, createdAt: last.created_at } : null, unread };
  };
  const rooms = [{ room: 'geral', type: 'group', name: 'Geral — toda a equipe', ...info('geral') },
    ...others.map(o => ({ room: dmRoom(me.id, o.id), type: 'dm', userId: o.id, username: o.username, name: o.name, role: o.role, lastSeen: o.last_seen, ...info(dmRoom(me.id, o.id)) }))];
  res.json(rooms);
});
api.get('/chat/:room/messages', (req, res) => {
  const room = req.params.room;
  if (!canRoom(req.user, room)) return fail(res, 403, 'Conversa não permitida');
  const before = Number(req.query.before) || 9e15;
  const rows = all('SELECT * FROM messages WHERE room=? AND id<? ORDER BY id DESC LIMIT 60', room, before).reverse();
  res.json(rows.map(msgPub));
});
api.post('/chat/:room/messages', (req, res) => {
  const room = req.params.room;
  if (!canRoom(req.user, room)) return fail(res, 403, 'Conversa não permitida');
  const body = String(req.body.body || '').trim().slice(0, 4000);
  const file = req.body.attachment;
  if (!body && !file) return fail(res, 400, 'Mensagem vazia');
  const r = run('INSERT INTO messages (room,sender_id,body,created_at) VALUES (?,?,?,?)', room, req.user.id, body, now());
  const id = Number(r.lastInsertRowid);
  if (file) saveAttachments([file], req.user.id, { messageId: id });
  run('INSERT INTO chat_reads (user_id,room,last_read_id) VALUES (?,?,?) ON CONFLICT(user_id,room) DO UPDATE SET last_read_id=excluded.last_read_id', req.user.id, room, id);
  const msg = { ...msgPub(one('SELECT * FROM messages WHERE id=?', id)), senderName: req.user.name, senderUsername: req.user.username };
  emitTo(roomMembers(room), 'chat', msg);
  res.json(msg);
});
api.post('/chat/:room/read', (req, res) => {
  const room = req.params.room;
  if (!canRoom(req.user, room)) return fail(res, 403, 'Conversa não permitida');
  const last = one('SELECT MAX(id) m FROM messages WHERE room=?', room).m || 0;
  run('INSERT INTO chat_reads (user_id,room,last_read_id) VALUES (?,?,?) ON CONFLICT(user_id,room) DO UPDATE SET last_read_id=excluded.last_read_id', req.user.id, room, last);
  res.json({ ok: true });
});
api.post('/chat/:room/typing', (req, res) => {
  const room = req.params.room;
  if (!canRoom(req.user, room)) return fail(res, 403, 'Conversa não permitida');
  emitTo(roomMembers(room).filter(id => id !== req.user.id), 'typing', { room, userId: req.user.id, name: req.user.name });
  res.json({ ok: true });
});

// ---- tempo real
api.get('/stream', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 3000\n\n');
  const id = req.user.id;
  const wasOnline = clients.has(id);
  if (!wasOnline) clients.set(id, new Set());
  clients.get(id).add(res);
  run('UPDATE users SET last_seen=? WHERE id=?', now(), id);
  if (!wasOnline) emitAll('presence', { online: onlineIds() });
  else res.write(`event: presence\ndata: ${JSON.stringify({ online: onlineIds() })}\n\n`);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    const set = clients.get(id);
    if (!set) return;
    set.delete(res);
    if (!set.size) { clients.delete(id); run('UPDATE users SET last_seen=? WHERE id=?', now(), id); emitAll('presence', { online: onlineIds() }); }
  });
});

// ---- configurações (supervisor)
api.get('/settings', adminOnly, (req, res) => {
  const s = getSettings();
  const saved = one(`SELECT value FROM settings WHERE key='app_url'`)?.value || '';
  res.json({ ...s, app_url: saved, smtp_pass: s.smtp_pass ? '********' : '' });
});
api.put('/settings', adminOnly, (req, res) => {
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (req.body[k] === undefined) continue;
    if (k === 'smtp_pass' && req.body[k] === '********') continue;
    let v = String(req.body[k]).trim();
    if (k.startsWith('sla_')) v = String(Math.max(1, Math.min(720, Number(v) || Number(DEFAULT_SETTINGS[k]))));
    if (k === 'app_url') v = v.replace(/\/+$/, '');
    run('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', k, v);
  }
  res.json({ ok: true });
});
api.post('/settings/test-email', adminOnly, async (req, res) => {
  const to = String(req.body.to || req.user.email || '').trim();
  if (!to) return fail(res, 400, 'Informe um e-mail de destino (ou cadastre o seu no Perfil)');
  const s = getSettings();
  const r = await sendMail([to], `Teste de e-mail — ${s.app_name}`,
    `<div style="font-family:Segoe UI,Arial;padding:24px"><h2 style="color:#0f172a">Funcionou! ✅</h2><p>O ${escHtml(s.app_name)} está enviando e-mails corretamente.</p><p style="color:#64748b">Endereço do sistema: <a href="${escHtml(s.app_url)}">${escHtml(s.app_url)}</a></p></div>`);
  r.ok ? res.json({ ok: true }) : fail(res, 400, `Falha ao enviar: ${r.error}`);
});
api.get('/emails', adminOnly, (req, res) => res.json(all('SELECT * FROM email_log ORDER BY id DESC LIMIT 100')));

app.use('/api', api);
app.use('/api', (req, res) => fail(res, 404, 'Rota não encontrada'));
app.use((err, req, res, next) => {
  console.error(err);
  fail(res, err.type === 'entity.too.large' ? 413 : 500, err.type === 'entity.too.large' ? 'Arquivos muito grandes' : 'Erro interno no servidor');
});

// ---- verificador de prazos: a cada 5 minutos avisa sobre chamados atrasados
function checkOverdue() {
  const rows = all(`SELECT id FROM tickets WHERE status IN ('aberto','em_andamento','aguardando') AND due_at<? AND overdue_notified=0`, now());
  for (const { id } of rows) {
    run('UPDATE tickets SET overdue_notified=1 WHERE id=?', id);
    addEvent(id, null, 'overdue', '');
    const t = loadTicket(id);
    notify(id, { heading: 'Prazo do chamado vencido', intro: `O prazo de atendimento venceu em ${fmtDate(t.due_at)} e o chamado ainda está "${STATUS_LABEL[t.status]}".` });
    emitTicket(t, { action: 'overdue', code: ticketCode(id), title: t.title });
  }
  run('DELETE FROM sessions WHERE expires_at<?', now());
}
setInterval(checkOverdue, 5 * 60e3);
setTimeout(checkOverdue, 10e3);

app.listen(PORT, '0.0.0.0', () => {
  const ip = lanIp();
  console.log('');
  console.log('  ==============================================');
  console.log(`   ${getSettings().app_name} rodando!`);
  console.log(`   Neste PC:        http://localhost:${PORT}`);
  console.log(`   Nas estacoes:    http://${ip}:${PORT}`);
  console.log('  ==============================================');
  console.log('   Mantenha esta janela aberta.');
  console.log('');
});

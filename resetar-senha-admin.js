// Redefine a senha do supervisor para admin@123 (use se esquecer a senha).
// Rode com o sistema parado:  runtime\node.exe resetar-senha-admin.js
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dbPath = path.join(process.env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), 'data'), 'chamados.db');
const db = new DatabaseSync(dbPath);
const salt = crypto.randomBytes(16).toString('hex');
const hash = `${salt}:${crypto.scryptSync('admin@123', salt, 64).toString('hex')}`;
const r = db.prepare(`UPDATE users SET password_hash=?, must_change_pw=1, active=1 WHERE role='admin'`).run(hash);
console.log(r.changes ? 'Senha do supervisor redefinida para: admin@123' : 'Nenhum supervisor encontrado.');

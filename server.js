// Builder Track hub, v1. No dependencies, runs on plain Node (same approach as HQ).
// Start: node server.js   (or double-click "Start Hub.command")
// Pages: /  program page   /apply  application form   /thanks   /admin  applications list (passcode)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 4478;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const APPS_FILE = path.join(DATA_DIR, 'applications.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const HOURS_FILE = path.join(DATA_DIR, 'hours.json');
const { summarize, validHours, validateApplication, validatePrep, cleanPrep, newRecord } = require('./shared');
const BACKUP_DIR = path.join(ROOT, 'backups');
const MAX_BACKUPS = 50;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

function readJSON(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJSON(file, obj) { fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n'); }

function settings() {
  let s = readJSON(SETTINGS_FILE, null);
  if (!s) { s = { passcode: crypto.randomBytes(4).toString('hex'), cohort: 'Cohort one', applicationsOpen: true }; writeJSON(SETTINGS_FILE, s); }
  if (!s.voltaPasscode) { s.voltaPasscode = 'volta-' + crypto.randomBytes(3).toString('hex'); writeJSON(SETTINGS_FILE, s); }
  return s;
}
function backup() {
  if (!fs.existsSync(APPS_FILE)) return;
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(APPS_FILE, path.join(BACKUP_DIR, `applications-${stamp}.json`));
  const list = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('applications-')).sort();
  while (list.length > MAX_BACKUPS) fs.unlinkSync(path.join(BACKUP_DIR, list.shift()));
}
function apps() { return readJSON(APPS_FILE, []); }
function saveApps(list) { backup(); writeJSON(APPS_FILE, list); }

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
function serveFile(res, file) {
  if (!fs.existsSync(file)) return send(res, 404, 'Not found', 'text/plain');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}
function body(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
  });
}
function keyOf(req) { return req.headers['x-passcode'] || new URL(req.url, 'http://x').searchParams.get('key') || ''; }
function authed(req) { return keyOf(req) === settings().passcode; }
function voltaAuthed(req) { return authed(req) || keyOf(req) === settings().voltaPasscode; }
function hours() { return readJSON(HOURS_FILE, []); }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  // API
  if (p === '/api/applications' && req.method === 'POST') {
    let a; try { a = await body(req); } catch { return send(res, 400, { error: 'Bad JSON' }); }
    const problem = validateApplication(a);
    if (problem) return send(res, 400, { error: problem });
    const list = apps();
    const rec = newRecord(a, crypto.randomBytes(5).toString('hex'), crypto.randomBytes(6).toString('hex'));
    list.push(rec); saveApps(list);
    console.log(`[${new Date().toISOString()}] application from ${a.fullName} (${a.organization})`);
    return send(res, 201, { ok: true, id: rec.id });
  }
  if (p === '/api/applications' && req.method === 'GET') {
    if (!authed(req)) return send(res, 401, { error: 'Passcode needed' });
    return send(res, 200, apps());
  }
  const m = p.match(/^\/api\/applications\/([\w-]+)$/);
  if (m && req.method === 'PATCH') {
    if (!authed(req)) return send(res, 401, { error: 'Passcode needed' });
    let patch; try { patch = await body(req); } catch { return send(res, 400, { error: 'Bad JSON' }); }
    const list = apps(); const rec = list.find(r => r.id === m[1]);
    if (!rec) return send(res, 404, { error: 'Not found' });
    for (const k of ['status', 'score', 'notes', 'managerConfirmed', 'managerConfirmedAt', 'interviewAt']) if (patch[k] !== undefined) rec[k] = patch[k];
    rec.updatedAt = new Date().toISOString(); saveApps(list);
    return send(res, 200, rec);
  }
  if (m && req.method === 'DELETE') {
    if (!authed(req)) return send(res, 401, { error: 'Passcode needed' });
    const list = apps(); const i = list.findIndex(r => r.id === m[1]);
    if (i < 0) return send(res, 404, { error: 'Not found' });
    list.splice(i, 1); saveApps(list);
    return send(res, 200, { ok: true });
  }
  if (p === '/api/hours') {
    if (req.method === 'GET') { if (!voltaAuthed(req)) return send(res, 401, { error: 'Passcode needed' }); return send(res, 200, hours()); }
    if (!authed(req)) return send(res, 401, { error: 'Passcode needed' });
    if (req.method === 'POST') {
      let b; try { b = await body(req); } catch { return send(res, 400, { error: 'Bad JSON' }); }
      if (!validHours(b)) return send(res, 400, { error: 'Need a date, a category and hours above zero.' });
      const list = hours(); const entry = { id: 'h-' + crypto.randomBytes(4).toString('hex'), date: b.date, category: b.category, hours: Math.round(Number(b.hours) * 4) / 4, note: String(b.note || '').slice(0, 300), addedAt: new Date().toISOString() };
      list.push(entry); writeJSON(HOURS_FILE, list); return send(res, 201, entry);
    }
    if (req.method === 'DELETE') {
      const id = url.searchParams.get('id'); const list = hours(); const next = list.filter(e => e.id !== id);
      if (next.length === list.length) return send(res, 404, { error: 'Not found' });
      writeJSON(HOURS_FILE, next); return send(res, 200, { ok: true });
    }
  }
  if (p === '/api/prepare') {
    const find = (id, t) => { const list = apps(); const rec = list.find(r => r.id === id); return rec && rec.prepToken && rec.prepToken === t ? { list, rec } : null; };
    if (req.method === 'GET') {
      const f = find(url.searchParams.get('id'), url.searchParams.get('t'));
      if (!f) return send(res, 404, { error: 'Not found' });
      return send(res, 200, { firstName: f.rec.answers.fullName.split(' ')[0], organization: f.rec.answers.organization, payer: f.rec.answers.payer, done: !!f.rec.prep });
    }
    if (req.method === 'POST') {
      let b; try { b = await body(req); } catch { return send(res, 400, { error: 'Bad JSON' }); }
      const f = find(b.id, b.t);
      if (!f) return send(res, 404, { error: 'Not found' });
      const problem = validatePrep(b.answers, f.rec); if (problem) return send(res, 400, { error: problem });
      f.rec.prep = cleanPrep(b.answers); f.rec.prepAt = new Date().toISOString(); if (f.rec.status === 'new' || f.rec.status === 'step two sent') f.rec.status = 'step two in'; saveApps(f.list);
      return send(res, 200, { ok: true });
    }
  }
  if (p === '/api/summary' && req.method === 'GET') {
    if (!voltaAuthed(req)) return send(res, 401, { error: 'Passcode needed' });
    return send(res, 200, summarize(apps(), hours()));
  }
  if (p === '/api/settings' && req.method === 'GET') {
    const s = settings(); return send(res, 200, { cohort: s.cohort, applicationsOpen: s.applicationsOpen });
  }

  // Pages
  const pages = { '/': 'index.html', '/apply': 'apply.html', '/thanks': 'thanks.html', '/admin': 'admin.html', '/volta': 'volta.html', '/prepare': 'prepare.html' };
  if (pages[p]) return serveFile(res, path.join(PUBLIC, pages[p]));
  if (p === '/for-employers') { res.writeHead(302, { Location: '/#employers' }); return res.end(); }
  const safe = path.normalize(p).replace(/^(\.\.[\/\\])+/, '');
  const file = path.join(PUBLIC, safe);
  if (file.startsWith(PUBLIC) && fs.existsSync(file) && fs.statSync(file).isFile()) return serveFile(res, file);
  send(res, 404, 'Not found', 'text/plain');
});

server.listen(PORT, () => {
  const s = settings();
  console.log(`Builder Track hub running at http://localhost:${PORT}`);
  console.log(`Admin: http://localhost:${PORT}/admin  passcode: ${s.passcode}`);
  console.log(`Volta view: http://localhost:${PORT}/volta  passcode: ${s.voltaPasscode}`);
});

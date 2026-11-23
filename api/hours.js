// GET    /api/hours            (admin or Volta passcode) -> all entries
// POST   /api/hours            (admin) -> add {date, category, hours, note}
// DELETE /api/hours?id=...     (admin) -> remove one entry
const crypto = require('crypto');
const { send, authed, voltaAuthed, hoursLog, saveHours } = require('./_lib');
const { validHours } = require('../shared');

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    if (!voltaAuthed(req)) return send(res, 401, { error: 'Passcode needed' });
    return send(res, 200, await hoursLog());
  }
  if (!authed(req)) return send(res, 401, { error: 'Passcode needed' });
  if (req.method === 'POST') {
    const b = req.body || {};
    const hours = Number(b.hours);
    if (!validHours(b)) return send(res, 400, { error: 'Need a date, a category and hours above zero.' });
    const entries = await hoursLog();
    const entry = { id: 'h-' + crypto.randomBytes(4).toString('hex'), date: b.date, category: b.category, hours: Math.round(hours * 4) / 4, note: String(b.note || '').slice(0, 300), addedAt: new Date().toISOString() };
    entries.push(entry); await saveHours(entries);
    return send(res, 201, entry);
  }
  if (req.method === 'DELETE') {
    const id = String(req.query.id || '');
    const entries = await hoursLog(); const next = entries.filter(e => e.id !== id);
    if (next.length === entries.length) return send(res, 404, { error: 'Not found' });
    await saveHours(next);
    return send(res, 200, { ok: true });
  }
  res.setHeader('Allow', 'GET, POST, DELETE');
  return send(res, 405, { error: 'Method not allowed' });
};

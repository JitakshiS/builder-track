// PATCH  /api/applications/:id  (passcode) -> update status, score, notes, cost confirmation
// DELETE /api/applications/:id  (passcode) -> remove an application (test entries, withdrawn by request)
const { send, authed, findApplication, saveApplication, deleteApplication } = require('../_lib');

module.exports = async (req, res) => {
  if (!authed(req)) return send(res, 401, { error: 'Passcode needed' });
  const id = String(req.query.id || '');
  if (!/^app-[a-f0-9]{10}$/.test(id)) return send(res, 400, { error: 'Bad id' });
  const rec = await findApplication(id);
  if (!rec) return send(res, 404, { error: 'Not found' });

  if (req.method === 'PATCH') {
    const patch = req.body || {};
    for (const k of ['status', 'score', 'notes', 'managerConfirmed', 'managerConfirmedAt', 'interviewAt']) if (patch[k] !== undefined) rec[k] = patch[k];
    rec.updatedAt = new Date().toISOString();
    await saveApplication(rec);
    return send(res, 200, rec);
  }
  if (req.method === 'DELETE') {
    await deleteApplication(id);
    return send(res, 200, { ok: true });
  }
  res.setHeader('Allow', 'PATCH, DELETE');
  return send(res, 405, { error: 'Method not allowed' });
};

// Step two, for shortlisted applicants. The link in the invite email carries the application id and its token.
// GET  /api/prepare?id=&t=  -> { firstName, done }
// POST /api/prepare         -> { id, t, answers } saves the four answers
const { send, findApplication, saveApplication, sendEmail } = require('./_lib');
const { validatePrep, cleanPrep } = require('../shared');

async function load(id, t) {
  if (!/^app-[a-f0-9]{10}$/.test(id || '') || !t) return null;
  const rec = await findApplication(id);
  if (!rec || !rec.prepToken || rec.prepToken !== t) return null;
  return rec;
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const rec = await load(req.query.id, req.query.t);
    if (!rec) return send(res, 404, { error: 'Not found' });
    return send(res, 200, { firstName: rec.answers.fullName.split(' ')[0], organization: rec.answers.organization, payer: rec.answers.payer, done: !!rec.prep });
  }
  if (req.method === 'POST') {
    const b = req.body || {};
    const rec = await load(b.id, b.t);
    if (!rec) return send(res, 404, { error: 'Not found' });
    const problem = validatePrep(b.answers, rec);
    if (problem) return send(res, 400, { error: problem });
    rec.prep = cleanPrep(b.answers); rec.prepAt = new Date().toISOString();
    if (rec.status === 'new' || rec.status === 'step two sent') rec.status = 'step two in';
    await saveApplication(rec);
    const notify = (process.env.NOTIFY_TO || '').split(',').map(s => s.trim()).filter(Boolean)[0];
    if (notify) await sendEmail({ to: notify, subject: `Builder Track: ${rec.answers.fullName} sent step two`, text: `${rec.answers.fullName} (${rec.answers.organization}) sent her step-two answers. They're in the hub under her application.\n` }).catch(() => {});
    return send(res, 200, { ok: true });
  }
  res.setHeader('Allow', 'GET, POST');
  return send(res, 405, { error: 'Method not allowed' });
};

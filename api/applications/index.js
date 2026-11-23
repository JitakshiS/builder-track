// GET  /api/applications  (passcode)  -> all applications
// POST /api/applications              -> save a new application (step one), email the team and the applicant
const crypto = require('crypto');
const { send, authed, allApplications, saveApplication, sendEmail } = require('../_lib');
const { validateApplication, teamEmail, applicantEmail, newRecord } = require('../../shared');

const SITE = process.env.SITE_URL || 'https://buildertrack.creativej.me';

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    if (!authed(req)) return send(res, 401, { error: 'Passcode needed' });
    return send(res, 200, await allApplications());
  }
  if (req.method === 'POST') {
    const a = req.body;
    const problem = validateApplication(a);
    if (problem) return send(res, 400, { error: problem });

    const rec = newRecord(a, crypto.randomBytes(5).toString('hex'), crypto.randomBytes(6).toString('hex'));
    await saveApplication(rec);
    console.log(`application from ${a.fullName} (${a.organization}) ${rec.id}`);

    const notify = (process.env.NOTIFY_TO || '').split(',').map(s => s.trim()).filter(Boolean);
    const jobs = [];
    if (notify.length) jobs.push(sendEmail({ to: notify, subject: `Builder Track application: ${a.fullName}, ${a.organization}`, text: teamEmail(rec, SITE), replyTo: a.email }));
    jobs.push(sendEmail({ to: a.email, subject: 'Your Builder Track application is in', text: applicantEmail(a, SITE), replyTo: process.env.REPLY_TO || undefined }));
    await Promise.allSettled(jobs);

    return send(res, 201, { ok: true, id: rec.id });
  }
  res.setHeader('Allow', 'GET, POST');
  return send(res, 405, { error: 'Method not allowed' });
};

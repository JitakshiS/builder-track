// GET /api/summary  (admin or Volta passcode) -> numbers for the Volta page
const { send, voltaAuthed, allApplications, hoursLog, summarize } = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return send(res, 405, { error: 'Method not allowed' }); }
  if (!voltaAuthed(req)) return send(res, 401, { error: 'Passcode needed' });
  const [apps, hours] = await Promise.all([allApplications(), hoursLog()]);
  return send(res, 200, summarize(apps, hours));
};

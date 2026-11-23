// Pure helpers used by both the local server and the Vercel functions.

// The SOW basis: actual hours at $150 up to a 126-hour maximum. Categories match Section 3 of the SOW.
const HOURS_PLAN = [
  ['selection', 'Selection', 9],
  ['setup', 'Program setup', 12],
  ['sessions', 'Sessions', 40],
  ['prep', 'Session prep', 16],
  ['oneonones', 'One-on-ones', 40],
  ['demo', 'Demo night', 3],
  ['after', 'Follow-up and wrap-up', 6],
];
const HOURS_TOTAL = 126;

// Step one: register interest. Who she is, her role, and who would cover the cost.
const REQUIRED = ['fullName', 'email', 'organization', 'role', 'years', 'teamSize', 'payer'];
// Statuses, in pipeline order.
const STATUSES = ['new', 'step two sent', 'step two in', 'call booked', 'offered', 'waitlist', 'confirmed', 'declined', 'withdrawn'];

function validateApplication(a) {
  if (!a || typeof a !== 'object') return 'Bad request';
  const missing = REQUIRED.filter(k => !a[k] || (typeof a[k] === 'string' && !a[k].trim()));
  if (missing.length) return 'Please fill in every required field.';
  const c = a.commit || [];
  if (!c.includes('ready') || !c.includes('accurate')) return 'Please tick the commitment and the statement above the submit button.';
  return null;
}

// Step two: sent by invite to the women selected from step one. The problem and the details.
function validatePrep(p, rec) {
  if (!p || !p.problem || !p.cost || !p.solved || !p.data || !p.buildNext || !Array.isArray(p.tools) || !p.tools.length) return 'Please answer every question.';
  if (rec && rec.answers.payer === 'My organization' && (!p.approverName || !p.approverEmail)) return 'Please tell us who approves the cost at your organization.';
  return null;
}
function cleanPrep(p) {
  const t = (v, n) => String(v || '').slice(0, n);
  return { problem: t(p.problem, 4000), cost: t(p.cost, 500), solved: t(p.solved, 4000), tools: p.tools.map(String).slice(0, 10), data: t(p.data, 200), buildNext: t(p.buildNext, 4000), approverName: t(p.approverName, 200), approverEmail: t(p.approverEmail, 200) };
}

function teamEmail(rec, site) {
  const a = rec.answers;
  return `New Builder Track application

${a.fullName}, ${a.role} at ${a.organization}
${a.email}${a.linkedin ? '\n' + a.linkedin : ''}
Years in field: ${a.years}
Works with: ${a.teamSize}
Who would cover the cost: ${a.payer}${a.focus ? '\nWants to improve: ' + a.focus : ''}

Open it in the hub: ${site}/admin
`;
}

function applicantEmail(a, site) {
  const first = a.fullName.split(' ')[0];
  return `Hi ${first},

Thank you for your interest in Builder Track. Your application is in.

Here's what happens next:

1. I read every application as it comes in. If you're selected for the next step, I'll email you a short set of questions about the problem you'd bring.
2. After that, I'll invite a small group to a 20-minute call.
3. Applications close Friday, December 11, and everyone hears back by Friday, December 18.

If anything changes on your side, or you have a question, just reply to this email.

Jitakshi
Builder Track, with Volta
${site}
`;
}

// Summary for the Volta page: numbers only, plus a light applicant list without answers, scores or notes.
function summarize(apps, hours) {
  const counts = {};
  for (const a of apps) counts[a.status] = (counts[a.status] || 0) + 1;
  const applicants = apps
    .map(a => ({ name: a.answers.fullName, organization: a.answers.organization, role: a.answers.role, status: a.status, submittedAt: a.submittedAt, interviewAt: a.interviewAt || null }))
    .sort((x, y) => y.submittedAt.localeCompare(x.submittedAt));
  const byCat = {}; const byMonth = {}; let total = 0;
  for (const h of hours) { total += h.hours; byCat[h.category] = (byCat[h.category] || 0) + h.hours; const m = h.date.slice(0, 7); byMonth[m] = (byMonth[m] || 0) + h.hours; }
  return {
    updatedAt: new Date().toISOString(),
    applications: { total: apps.length, counts, applicants },
    hours: { total: Math.round(total * 4) / 4, planned: HOURS_TOTAL, plan: HOURS_PLAN.map(([k, label, planned]) => ({ key: k, label, planned, logged: byCat[k] || 0 })), byMonth, entries: [...hours].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30) },
  };
}

function validHours(b) {
  const hours = Number(b.hours);
  return /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') && hours > 0 && HOURS_PLAN.some(([k]) => k === b.category);
}

function newRecord(a, idHex, tokenHex) {
  return { id: 'app-' + idHex, submittedAt: new Date().toISOString(), status: 'new', score: {}, notes: '', managerConfirmed: false, managerConfirmedAt: null, prepToken: tokenHex, prep: null, prepAt: null, answers: a };
}

module.exports = { HOURS_PLAN, HOURS_TOTAL, REQUIRED, STATUSES, validateApplication, validatePrep, cleanPrep, teamEmail, applicantEmail, summarize, validHours, newRecord };

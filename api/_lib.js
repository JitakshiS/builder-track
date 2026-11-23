// Shared helpers for the Vercel functions. Storage is a private Vercel Blob store:
// one JSON file per application under applications/, and one file hours/log.json for the hours log.
const { put, get, list, del } = require('@vercel/blob');

const PREFIX = 'applications/';
const HOURS_FILE = 'hours/log.json';
const ACCESS = 'private';

const { HOURS_PLAN, HOURS_TOTAL, summarize } = require('../shared');

function send(res, status, data) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}
function keyOf(req) { return req.headers['x-passcode'] || (req.query && req.query.key) || ''; }
function authed(req) { return !!process.env.HUB_PASSCODE && keyOf(req) === process.env.HUB_PASSCODE; }
function voltaAuthed(req) { return authed(req) || (!!process.env.VOLTA_PASSCODE && keyOf(req) === process.env.VOLTA_PASSCODE); }

async function readJson(pathname) {
  const r = await get(pathname, { access: ACCESS, useCache: false });
  if (!r || !r.stream) return null;
  return JSON.parse(await new Response(r.stream).text());
}
async function writeJson(pathname, data) {
  await put(pathname, JSON.stringify(data), { access: ACCESS, contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 0 });
}
async function allApplications() {
  const blobs = [];
  let cursor;
  do {
    const page = await list({ prefix: PREFIX, cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  const recs = await Promise.all(blobs.map(b => readJson(b.pathname).catch(() => null)));
  return recs.filter(Boolean);
}
async function findApplication(id) { return readJson(PREFIX + id + '.json').catch(() => null); }
async function saveApplication(rec) { await writeJson(PREFIX + rec.id + '.json', rec); return rec; }
async function deleteApplication(id) { await del(PREFIX + id + '.json'); }

async function hoursLog() { return (await readJson(HOURS_FILE).catch(() => null)) || []; }
async function saveHours(entries) { await writeJson(HOURS_FILE, entries); }

// Email. Resend when RESEND_API_KEY is set (from FROM_EMAIL on a verified domain), otherwise Gmail over SMTP
// when GMAIL_USER and GMAIL_APP_PASSWORD are set. With neither, emails are skipped and logged so the form still works.
async function sendEmail({ to, subject, text, replyTo }) {
  const list = Array.isArray(to) ? to : [to];
  const name = process.env.FROM_NAME || 'Jitakshi Sharma';
  if (process.env.RESEND_API_KEY) {
    const from = `${name} <${process.env.FROM_EMAIL || 'onboarding@resend.dev'}>`;
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: list, subject, text, reply_to: replyTo }),
      });
      if (!r.ok) console.error('[resend failed]', r.status, await r.text());
      return { ok: r.ok };
    } catch (e) { console.error('[resend failed]', e.message); return { ok: false }; }
  }
  const user = process.env.GMAIL_USER, pass = process.env.GMAIL_APP_PASSWORD;
  if (user && pass) {
    const nodemailer = require('nodemailer');
    const transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass } });
    try { await transport.sendMail({ from: `"${name}" <${user}>`, to: list.join(', '), subject, text, replyTo }); return { ok: true }; }
    catch (e) { console.error('[gmail failed]', e.message); return { ok: false }; }
  }
  console.log('[email skipped, no sender configured]', subject, '->', list.join(', '));
  return { skipped: true };
}

module.exports = { send, authed, voltaAuthed, allApplications, findApplication, saveApplication, deleteApplication, hoursLog, saveHours, summarize, sendEmail, HOURS_PLAN, HOURS_TOTAL };

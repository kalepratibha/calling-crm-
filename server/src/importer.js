const { parse } = require('csv-parse/sync');
const XLSX = require('xlsx');
const db = require('./db');
const { normalizePhone } = require('./util');

function decode(buf) {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.toString('utf16le').replace(/^﻿/, '');
  return buf.toString('utf8').replace(/^﻿/, '');
}

function parseCsv(text) {
  const records = parse(text, {
    columns: (h) => h.map((x, i) => String(x || `Column ${i + 1}`).trim()),
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    trim: true,
    delimiter: [',', '\t', ';'],
  });
  return records;
}

function parseXlsx(buf) {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
  return raw.map((r) => {
    const o = {};
    for (const [k, v] of Object.entries(r)) {
      o[String(k).trim()] = v instanceof Date ? v.toISOString() : String(v ?? '').trim();
    }
    return o;
  });
}

function parseFile(buf, filename = '') {
  const isExcel = /\.(xlsx|xls|xlsm)$/i.test(filename);
  const rows = isExcel ? parseXlsx(buf) : parseCsv(decode(buf));
  return finish(rows);
}

function finish(rows) {
  if (!rows.length) throw httpError(400, 'The file has no data rows');
  const columns = Object.keys(rows[0]);
  return { columns, rows };
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// Turn any Google Sheets link into a CSV export link
function toCsvUrl(url) {
  const m = url.match(/spreadsheets\/d\/(?:e\/)?([a-zA-Z0-9-_]+)/);
  if (!m) return url; // assume already a direct CSV link
  if (/\/pub/.test(url) && /output=csv/.test(url)) return url;
  const gid = (url.match(/[#&?]gid=(\d+)/) || [])[1];
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv${gid ? `&gid=${gid}` : ''}`;
}

async function fetchSheet(url) {
  let res;
  try {
    res = await fetch(toCsvUrl(url), { redirect: 'follow' });
  } catch (e) {
    throw httpError(502, 'Could not reach Google Sheets: ' + e.message);
  }
  if (!res.ok) throw httpError(400, `Google Sheet returned ${res.status}. Make sure link sharing is ON (Anyone with the link → Viewer).`);
  const text = await res.text();
  if (/^\s*<(!doctype|html)/i.test(text)) {
    throw httpError(400, 'Sheet is private. In Google Sheets click Share → General access → "Anyone with the link" (Viewer), then try again.');
  }
  return finish(parseCsv(text.replace(/^﻿/, '')));
}

function guessMapping(columns) {
  const lc = columns.map((c) => c.toLowerCase());
  const find = (...res) => {
    for (const re of res) {
      const i = lc.findIndex((c) => re.test(c));
      if (i >= 0) return columns[i];
    }
    return '';
  };
  return {
    nameCol: find(/^full[_ ]?name$/, /^name$/, /client.*name/, /name/),
    phoneCol: find(/^phone[_ ]?number$/, /mobile/, /phone/, /whatsapp/, /contact/, /number/),
  };
}

// Fast bulk import: rows are inserted 300 at a time; numbers that already exist (or repeat inside the file) are skipped.
async function importRows(rows, nameCol, phoneCol, source, label = null) {
  let duplicates = 0, invalid = 0;
  const seen = new Set(), fresh = [];
  for (const r of rows) {
    const mobile = normalizePhone(r[phoneCol]);
    if (!mobile) { invalid++; continue; }
    if (seen.has(mobile)) { duplicates++; continue; }
    seen.add(mobile);
    const name = (String(r[nameCol] || '').trim() || 'Unknown').slice(0, 160);
    const extra = {};
    for (const [k, v] of Object.entries(r)) {
      if (k !== nameCol && k !== phoneCol && v !== '' && v != null) extra[k] = v;
    }
    fresh.push([name, mobile, source, JSON.stringify(extra), label ? String(label).slice(0, 250) : null]);
  }
  let added = 0;
  await db.tx(async (t) => {
    for (let i = 0; i < fresh.length; i += 300) {
      const chunk = fresh.slice(i, i + 300);
      const res = await t.run('INSERT IGNORE INTO leads (name, mobile, source, extra, import_label) VALUES ?', [chunk]);
      added += res.affectedRows;
      duplicates += chunk.length - res.affectedRows;
    }
  });
  // new clients are shared out between the executives straight away (no button needed)
  if (added > 0) require('./inbox').distributeFresh().catch((e) => console.warn('distribution after import failed:', e.message));
  return { added, duplicates, invalid, total: rows.length };
}

module.exports = { parseFile, fetchSheet, guessMapping, importRows, httpError };

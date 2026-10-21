// Connected Google Sheets (for auto-sync) are kept in a small file — NOT in the database.
// Every imported / manually added client lives in ONE table: leads.
const fs = require('fs');
const path = require('path');

const FILE = process.env.SHEET_SOURCES_FILE || path.join(__dirname, '..', 'data', 'sheet-sources.json');

function load() {
  try { const a = JSON.parse(fs.readFileSync(FILE, 'utf8')); return Array.isArray(a) ? a : []; } catch { return []; }
}
function save(list) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2));
}

const list = () => load().sort((a, b) => b.id - a.id);
const get = (id) => load().find((s) => s.id === Number(id));
const findByUrl = (url) => load().find((s) => s.url === url);

function upsert(src) {
  const all = load();
  const i = all.findIndex((s) => s.url === src.url);
  if (i >= 0) { all[i] = { ...all[i], ...src, id: all[i].id }; save(all); return all[i]; }
  const row = { id: all.reduce((m, s) => Math.max(m, s.id), 0) + 1, auto_sync: 1, ...src };
  all.push(row); save(all); return row;
}
function update(id, patch) {
  const all = load(); const i = all.findIndex((s) => s.id === Number(id));
  if (i < 0) return null;
  all[i] = { ...all[i], ...patch }; save(all); return all[i];
}
function remove(id) { save(load().filter((s) => s.id !== Number(id))); }

module.exports = { list, get, findByUrl, upsert, update, remove };

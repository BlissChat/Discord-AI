// plugins/teach.js
// Teach-the-bot plugin: add/list/remove patterns and match patterns in messages
// Stores patterns in the DB table teach_patterns(guild_id, trigger, response, created_at)

const { db } = require('../lib/db'); // lib/db exports `db` (better-sqlite3 instance)

function ensureTable() {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS teach_patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT,
      trigger TEXT,
      response TEXT,
      created_at TEXT
    )`).run();
}

module.exports = {
  init(client, opts) {
    ensureTable();
    console.log('teach plugin initialized');
  },

  addPattern(guildId, trigger, response) {
    ensureTable();
    const t = trigger.toLowerCase();
    const now = new Date().toISOString();
    db.prepare('INSERT INTO teach_patterns (guild_id, trigger, response, created_at) VALUES (?, ?, ?, ?)')
      .run(guildId, t, response, now);
    return true;
  },

  listPatterns(guildId) {
    ensureTable();
    const rows = db.prepare('SELECT id, trigger, response, created_at FROM teach_patterns WHERE guild_id = ? ORDER BY id DESC').all(guildId);
    return rows;
  },

  removePattern(guildId, id) {
    ensureTable();
    const info = db.prepare('SELECT 1 FROM teach_patterns WHERE guild_id = ? AND id = ?').get(guildId, id);
    if (!info) return false;
    db.prepare('DELETE FROM teach_patterns WHERE guild_id = ? AND id = ?').run(guildId, id);
    return true;
  },

  matchPattern(guildId, text) {
    ensureTable();
    if (!text) return null;
    const lower = text.toLowerCase();
    // load patterns for this guild
    const rows = db.prepare('SELECT id, trigger, response FROM teach_patterns WHERE guild_id = ?').all(guildId);
    // naive matching: return the first pattern whose trigger is a substring
    for (const r of rows) {
      if (lower.includes(r.trigger)) {
        return { id: r.id, trigger: r.trigger, response: r.response };
      }
    }
    return null;
  }
};

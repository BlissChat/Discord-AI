// plugins/teach.js
const { db } = require('../lib/db') || require('../lib/db'); // safe require

module.exports = {
  init(client, opts) {
    console.log('teach plugin initialized');
  },

  addPattern(guildId, trigger, response) {
    const t = trigger.toLowerCase();
    db.prepare('INSERT INTO teach_patterns (guild_id, trigger, response) VALUES (?, ?, ?)').run(guildId, t, response);
  },

  matchPattern(guildId, text) {
    const rows = db.prepare('SELECT trigger, response FROM teach_patterns WHERE guild_id = ?').all(guildId);
    const lower = text.toLowerCase();
    for (const r of rows) {
      if (lower.includes(r.trigger)) return { trigger: r.trigger, response: r.response };
    }
    return null;
  }
};

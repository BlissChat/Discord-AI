// plugins/teach.js
const { listPatterns, addPattern, removePattern } = require('../lib/db');

module.exports = {
  init(client, opts) {
    console.log('teach plugin initialized');
  },

  addPattern(guildId, trigger, response) {
    return addPattern(guildId, trigger, response);
  },

  listPatterns(guildId) {
    return listPatterns(guildId);
  },

  removePattern(guildId, id) {
    return removePattern(guildId, id);
  },

  matchPattern(guildId, text) {
    if (!text) return null;
    const rows = listPatterns(guildId);
    const lower = text.toLowerCase();
    for (const r of rows) {
      if (lower.includes(r.trigger)) return { id: r.id, trigger: r.trigger, response: r.response };
    }
    return null;
  }
};

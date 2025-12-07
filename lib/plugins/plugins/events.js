// plugins/events.js
const cron = require('node-cron');
const { getAllSchedules } = require('../lib/db');

module.exports = {
  init(client, opts) {
    console.log('events plugin: scheduling saved tasks');
    const rows = getAllSchedules();
    for (const r of rows) {
      try {
        cron.schedule(r.cron_expr, async () => {
          try {
            const guild = client.guilds.cache.get(r.guild_id);
            if (!guild) return;
            const ch = guild.channels.cache.get(r.channel_id);
            if (ch) await ch.send(r.text);
          } catch (e) {
            console.error('Scheduled job send error', e);
          }
        }, { timezone: 'UTC' });
        console.log('Scheduled:', r.id, r.cron_expr);
      } catch (e) {
        console.error('Failed to schedule row', r, e);
      }
    }
  }
};

// plugins/events.js
const cron = require('node-cron');
const { db } = require('../lib/db');

module.exports = {
  init(client, opts) {
    console.log('events plugin loaded');

    // example: every day at 12:00 UTC
    cron.schedule('0 12 * * *', async () => {
      const rows = db.prepare('SELECT guild_id, config_json FROM server_config').all();
      for (const r of rows) {
        try {
          const cfg = JSON.parse(r.config_json || '{}');
          if (cfg.scheduledAnnouncement && cfg.announcementChannel) {
            const guild = client.guilds.cache.get(r.guild_id);
            if (!guild) continue;
            const ch = guild.channels.cache.get(cfg.announcementChannel);
            if (ch) ch.send(cfg.scheduledAnnouncementText || 'Daily announcement!');
          }
        } catch (e) { console.error('events cron error', e); }
      }
    });
  }
};

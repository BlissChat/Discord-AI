// automations/scheduler.js
const cron = require('node-cron');
const { getAllSchedules } = require('../lib/db');

/**
 * initSchedules(client)
 * - Loads saved schedules from DB and registers cron tasks.
 * Schedules must be stored in DB via lib/db.addSchedule().
 */
function initSchedules(client) {
  const rows = getAllSchedules();
  for (const r of rows) {
    try {
      // r.cron_expr is a cron expression like "0 12 * * *"
      cron.schedule(r.cron_expr, async () => {
        try {
          const guild = client.guilds.cache.get(r.guild_id);
          if (!guild) return;
          const ch = guild.channels.cache.get(r.channel_id);
          if (ch) await ch.send(r.text);
        } catch (e) {
          console.error('Scheduled job error', e);
        }
      }, { timezone: 'UTC' });
      console.log('Scheduled job loaded:', r.id, r.cron_expr);
    } catch (e) {
      console.error('Invalid cron for schedule', r.id, r.cron_expr, e);
    }
  }
}

module.exports = { initSchedules };

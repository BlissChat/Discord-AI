// lib/db.js
const Database = require('better-sqlite3');
const db = new Database('./assistant.db');

function initDB() {
  db.prepare(`CREATE TABLE IF NOT EXISTS user_memory (user_id TEXT PRIMARY KEY, memory_json TEXT)`).run();
  db.prepare(`CREATE TABLE IF NOT EXISTS server_config (guild_id TEXT PRIMARY KEY, config_json TEXT)`).run();
  db.prepare(`CREATE TABLE IF NOT EXISTS teach_patterns (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT, trigger TEXT, response TEXT, created_at TEXT)`).run();
  db.prepare(`CREATE TABLE IF NOT EXISTS analytics (key TEXT PRIMARY KEY, value INTEGER)`).run();
  db.prepare(`CREATE TABLE IF NOT EXISTS schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT, cron_expr TEXT, channel_id TEXT, text TEXT)`).run();
}

function getUserMemory(userId) {
  const row = db.prepare('SELECT memory_json FROM user_memory WHERE user_id = ?').get(userId);
  if (!row) return { notes: [], last_used: null };
  try { return JSON.parse(row.memory_json); } catch { return { notes: [], last_used: null }; }
}
function setUserMemory(userId, obj) {
  const json = JSON.stringify(obj);
  const exists = db.prepare('SELECT 1 FROM user_memory WHERE user_id = ?').get(userId);
  if (exists) db.prepare('UPDATE user_memory SET memory_json = ? WHERE user_id = ?').run(json, userId);
  else db.prepare('INSERT INTO user_memory (user_id, memory_json) VALUES (?, ?)').run(userId, json);
}

const DEFAULT_SERVER = { replyMode: 'mention', allowedChannels: [], onlyQuestions: true, personality: 'standard', admins: [], scheduledAnnouncement: false, announcementChannel: null, scheduledAnnouncementText: null };
function getServerConfig(guildId) {
  if (!guildId) return { ...DEFAULT_SERVER };
  const row = db.prepare('SELECT config_json FROM server_config WHERE guild_id = ?').get(guildId);
  if (!row) return { ...DEFAULT_SERVER };
  try { return { ...DEFAULT_SERVER, ...JSON.parse(row.config_json) }; } catch { return { ...DEFAULT_SERVER }; }
}
function setServerConfig(guildId, config) {
  const json = JSON.stringify(config);
  const exists = db.prepare('SELECT 1 FROM server_config WHERE guild_id = ?').get(guildId);
  if (exists) db.prepare('UPDATE server_config SET config_json = ? WHERE guild_id = ?').run(json, guildId);
  else db.prepare('INSERT INTO server_config (guild_id, config_json) VALUES (?, ?)').run(guildId, json);
}

function bumpStat(key) {
  const row = db.prepare('SELECT value FROM analytics WHERE key = ?').get(key);
  if (row) db.prepare('UPDATE analytics SET value = value + 1 WHERE key = ?').run(key);
  else db.prepare('INSERT INTO analytics (key, value) VALUES (?, 1)').run(key);
}

// teach patterns helpers
function addPattern(guildId, trigger, response) {
  const now = new Date().toISOString();
  db.prepare('INSERT INTO teach_patterns (guild_id, trigger, response, created_at) VALUES (?, ?, ?, ?)').run(guildId, trigger.toLowerCase(), response, now);
}
function listPatterns(guildId) {
  return db.prepare('SELECT id, trigger, response, created_at FROM teach_patterns WHERE guild_id = ? ORDER BY id DESC').all(guildId);
}
function removePattern(guildId, id) {
  db.prepare('DELETE FROM teach_patterns WHERE guild_id = ? AND id = ?').run(guildId, id);
}

// schedules helpers
function addSchedule(guildId, cronExpr, channelId, text) {
  db.prepare('INSERT INTO schedules (guild_id, cron_expr, channel_id, text) VALUES (?, ?, ?, ?)').run(guildId, cronExpr, channelId, text);
}
function getAllSchedules() {
  return db.prepare('SELECT id, guild_id, cron_expr, channel_id, text FROM schedules').all();
}
function removeSchedule(id) {
  db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
}

module.exports = {
  initDB,
  getUserMemory, setUserMemory,
  getServerConfig, setServerConfig,
  bumpStat,
  addPattern, listPatterns, removePattern,
  addSchedule, getAllSchedules, removeSchedule,
  db
};

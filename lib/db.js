// lib/db.js
const Database = require('better-sqlite3');
const db = new Database('./assistant.db');

function initDB() {
  db.prepare(`CREATE TABLE IF NOT EXISTS user_memory (user_id TEXT PRIMARY KEY, memory_json TEXT)`).run();
  db.prepare(`CREATE TABLE IF NOT EXISTS server_config (guild_id TEXT PRIMARY KEY, config_json TEXT)`).run();
  db.prepare(`CREATE TABLE IF NOT EXISTS teach_patterns (guild_id TEXT, trigger TEXT, response TEXT)`).run();
  db.prepare(`CREATE TABLE IF NOT EXISTS analytics (key TEXT PRIMARY KEY, value INTEGER)`).run();
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

const DEFAULT_SERVER = { replyMode: 'mention', allowedChannels: [], onlyQuestions: true, personality: 'standard', admins: [] };
function getServerConfig(guildId) {
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

module.exports = { initDB, getUserMemory, setUserMemory, getServerConfig, setServerConfig, bumpStat, db };

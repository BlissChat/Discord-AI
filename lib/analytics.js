// lib/analytics.js
const { db } = require('./db');

/**
 * Simple analytics wrapper storing integer counters in sqlite analytics table.
 * Keys examples: 'ai_requests', 'teach_responses', 'message_replies'
 */

function bump(key) {
  try {
    const row = db.prepare('SELECT value FROM analytics WHERE key = ?').get(key);
    if (row) db.prepare('UPDATE analytics SET value = value + 1 WHERE key = ?').run(key);
    else db.prepare('INSERT INTO analytics (key, value) VALUES (?, 1)').run(key);
  } catch (e) {
    console.error('Analytics bump failed', e);
  }
}

function getAll() {
  try {
    return db.prepare('SELECT * FROM analytics').all();
  } catch (e) {
    console.error('Analytics getAll failed', e);
    return [];
  }
}

module.exports = { bump, getAll };

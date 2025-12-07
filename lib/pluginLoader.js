// lib/pluginLoader.js
const fs = require('fs');
const path = require('path');

function loadAll(client, ctx = {}) {
  const PLUGINS_DIR = path.join(__dirname, '..', 'plugins');
  if (!fs.existsSync(PLUGINS_DIR)) return;
  for (const file of fs.readdirSync(PLUGINS_DIR)) {
    if (!file.endsWith('.js')) continue;
    const full = path.join(PLUGINS_DIR, file);
    try {
      const plugin = require(full);
      if (plugin && typeof plugin.init === 'function') {
        plugin.init(client, ctx);
        console.log('Loaded plugin:', file);
      } else {
        console.log('Plugin has no init fn, skipping:', file);
      }
    } catch (err) {
      console.error('Failed to load plugin', file, err);
    }
  }
}

module.exports = { loadAll };

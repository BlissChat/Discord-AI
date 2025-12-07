// index.js — main bot loader
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');

const { askAI } = require('./ai');
const db = require('./lib/db');
const pluginLoader = require('./lib/pluginLoader');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID || null;

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID) {
  console.error('Missing DISCORD_TOKEN or DISCORD_CLIENT_ID in environment.');
  process.exit(1);
}

// init DB
db.initDB();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// --- load slash commands ---
const commandsDir = path.join(__dirname, 'commands');
const slashCommands = [];

function loadCommands(dir) {
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir)) {
    const fpath = path.join(dir, file);
    const stat = fs.statSync(fpath);
    if (stat.isDirectory()) loadCommands(fpath);
    else if (file.endsWith('.js')) {
      const mod = require(fpath);
      if (mod && mod.slash) slashCommands.push(mod.slash.toJSON());
    }
  }
}
loadCommands(commandsDir);

// register slash commands
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
(async () => {
  try {
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID, GUILD_ID), { body: slashCommands });
      console.log('Registered guild commands.');
    } else {
      await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), { body: slashCommands });
      console.log('Registered global commands (may take up to 1 hour).');
    }
  } catch (err) {
    console.error('Command registration failed:', err);
  }
})();

// --- plugin loader (loads plugins folder files) ---
pluginLoader.loadAll(client, { db, askAI });

// --- load event handlers from /events ---
const eventsDir = path.join(__dirname, 'events');
if (fs.existsSync(eventsDir)) {
  for (const f of fs.readdirSync(eventsDir)) {
    if (!f.endsWith('.js')) continue;
    const handler = require(path.join(eventsDir, f));
    if (handler && handler.event && typeof handler.run === 'function') {
      client.on(handler.event, (...args) => handler.run(client, ...args));
      console.log('Loaded event:', handler.event, f);
    }
  }
}

// --- ready ---
client.once('ready', () => {
  console.log(`${client.user.tag} ready — Assistant loaded`);
});

// --- start ---
client.login(DISCORD_TOKEN);

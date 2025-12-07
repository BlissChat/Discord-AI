// bot.js — Monolithic Discord AI assistant (Gemini-backed)
// Features: message handler, slash commands, Gemini AI, memory, teach, modes, analytics, scheduler, plugin engine, embeds, smart replies

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Database = require('better-sqlite3');
const cron = require('node-cron');
const express = require('express');

// ---------- Configuration ----------
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GUILD_ID = process.env.GUILD_ID || null; // optional dev guild for instant command registration
const PORT = process.env.PORT || 3000;
const DASH_SECRET = process.env.DASHBOARD_SECRET || '';

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID || !GEMINI_API_KEY) {
  console.error('Missing DISCORD_TOKEN, DISCORD_CLIENT_ID, or GEMINI_API_KEY in environment. Set them in Replit Secrets or .env.');
  process.exit(1);
}

// ---------- Gemini client ----------
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
async function askGemini(prompt, memory = [], opts = {}) {
  // memory: [{ role, content }]
  try {
    const model = genAI.getGenerativeModel({ model: opts.model || 'gemini-1.5-flash' });

    const contents = [];
    for (const m of memory) {
      contents.push({ role: m.role, parts: [{ text: m.content }] });
    }
    contents.push({ role: 'user', parts: [{ text: prompt }] });

    const res = await model.generateContent({
      contents,
      // add options like temperature via opts if wanted
      // temperature: opts.temperature ?? 0.2
    });

    if (!res) return '⚠️ AI returned no response.';
    if (typeof res.response === 'string') return res.response;
    if (res.response && typeof res.response.text === 'function') return res.response.text();
    if (res.output && Array.isArray(res.output) && res.output[0]?.content) {
      const block = res.output[0].content.find(c => (c.type === 'output_text') || (c.mimetype && c.mimetype.startsWith('text/')));
      if (block && block.text) return block.text;
    }
    // fallback stringify
    return String(res.response?.text ?? JSON.stringify(res)).slice(0, 2000);
  } catch (err) {
    console.error('Gemini error', err);
    return '⚠️ AI error — could not generate response.';
  }
}

// ---------- Database (SQLite) ----------
const DB_PATH = path.join(process.cwd(), 'assistant.db');
const db = new Database(DB_PATH);
function initDB() {
  db.prepare(`CREATE TABLE IF NOT EXISTS user_memory (user_id TEXT PRIMARY KEY, memory_json TEXT)`).run();
  db.prepare(`CREATE TABLE IF NOT EXISTS server_config (guild_id TEXT PRIMARY KEY, config_json TEXT)`).run();
  db.prepare(`CREATE TABLE IF NOT EXISTS teach_patterns (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT, trigger TEXT, response TEXT, created_at TEXT)`).run();
  db.prepare(`CREATE TABLE IF NOT EXISTS analytics (key TEXT PRIMARY KEY, value INTEGER)`).run();
  db.prepare(`CREATE TABLE IF NOT EXISTS schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT, cron_expr TEXT, channel_id TEXT, text TEXT)`).run();
}
initDB();

// DB helpers
function getUserMemory(userId) {
  const r = db.prepare('SELECT memory_json FROM user_memory WHERE user_id = ?').get(userId);
  if (!r) return { notes: [], last_used: null };
  try { return JSON.parse(r.memory_json); } catch { return { notes: [], last_used: null }; }
}
function setUserMemory(userId, obj) {
  const json = JSON.stringify(obj);
  const exists = db.prepare('SELECT 1 FROM user_memory WHERE user_id = ?').get(userId);
  if (exists) db.prepare('UPDATE user_memory SET memory_json = ? WHERE user_id = ?').run(json, userId);
  else db.prepare('INSERT INTO user_memory (user_id, memory_json) VALUES (?, ?)').run(userId, json);
}

const DEFAULT_SERVER = { replyMode: 'mention', allowedChannels: [], onlyQuestions: true, personality: 'standard' };
function getServerConfig(guildId) {
  if (!guildId) return { ...DEFAULT_SERVER };
  const r = db.prepare('SELECT config_json FROM server_config WHERE guild_id = ?').get(guildId);
  if (!r) return { ...DEFAULT_SERVER };
  try { return { ...DEFAULT_SERVER, ...JSON.parse(r.config_json) }; } catch { return { ...DEFAULT_SERVER }; }
}
function setServerConfig(guildId, config) {
  const json = JSON.stringify(config);
  const exists = db.prepare('SELECT 1 FROM server_config WHERE guild_id = ?').get(guildId);
  if (exists) db.prepare('UPDATE server_config SET config_json = ? WHERE guild_id = ?').run(json, guildId);
  else db.prepare('INSERT INTO server_config (guild_id, config_json) VALUES (?, ?)').run(guildId, json);
}

// Teach helpers
function addTeachPattern(guildId, trigger, response) {
  const t = trigger.toLowerCase();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO teach_patterns (guild_id, trigger, response, created_at) VALUES (?, ?, ?, ?)').run(guildId, t, response, now);
}
function listTeachPatterns(guildId) {
  return db.prepare('SELECT id, trigger, response, created_at FROM teach_patterns WHERE guild_id = ? ORDER BY id DESC').all(guildId);
}
function removeTeachPattern(guildId, id) {
  db.prepare('DELETE FROM teach_patterns WHERE guild_id = ? AND id = ?').run(guildId, id);
}

// Analytics
function bump(key) {
  const r = db.prepare('SELECT value FROM analytics WHERE key = ?').get(key);
  if (r) db.prepare('UPDATE analytics SET value = value + 1 WHERE key = ?').run(key);
  else db.prepare('INSERT INTO analytics (key, value) VALUES (?, 1)').run(key);
}
function getAnalytics() {
  return db.prepare('SELECT * FROM analytics').all();
}

// Schedules
function addSchedule(guildId, cronExpr, channelId, text) {
  db.prepare('INSERT INTO schedules (guild_id, cron_expr, channel_id, text) VALUES (?, ?, ?, ?)').run(guildId, cronExpr, channelId, text);
}
function getSchedules() {
  return db.prepare('SELECT id, guild_id, cron_expr, channel_id, text FROM schedules').all();
}
function removeSchedule(id) {
  db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
}

// ---------- Utility helpers ----------
function isQuestion(text) {
  if (!text) return false;
  const t = text.trim();
  if (t.endsWith('?')) return true;
  return /^(who|what|when|where|why|how|is|are|do|does|did|can|could|should|would)\b/i.test(t);
}

function systemPrompt(mode) {
  switch ((mode || 'standard').toLowerCase()) {
    case 'formal': return 'You are a helpful, concise, formal assistant. Use polite professional language.';
    case 'funny': return 'You are a witty, friendly assistant with playful jokes when appropriate.';
    case 'gamer': return 'You are a gamer-friendly assistant: casual, upbeat, and focused on gaming tips.';
    default: return 'You are a helpful and concise assistant.';
  }
}

// ---------- Plugin engine (tiny, in-file) ----------
const inMemoryPlugins = []; // each plugin: { name, init(client, ctx) }
function registerPlugin(plugin) {
  if (typeof plugin.init === 'function') inMemoryPlugins.push(plugin);
}
function initPlugins(client, ctx) {
  for (const p of inMemoryPlugins) {
    try { p.init(client, ctx); console.log('Plugin init:', p.name || 'unnamed'); } catch (e) { console.error('Plugin init failed', e); }
  }
}
// Example tiny plugin (shows how plugins can hook into messageCreate)
registerPlugin({
  name: 'example-greeting',
  init(client, ctx) {
    client.on('messageCreate', (msg) => {
      if (msg.author.bot) return;
      if (msg.content.toLowerCase().includes('hello bot')) {
        msg.reply('Hi! I am your AI assistant. Try `/ask` or mention me.');
      }
    });
  }
});

// ---------- Discord bot & commands ----------
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// Define slash commands in-memory
const slashCommands = [
  new SlashCommandBuilder().setName('ping').setDescription('Ping the bot'),
  new SlashCommandBuilder().setName('ask').setDescription('Ask the assistant').addStringOption(o => o.setName('prompt').setDescription('Your question').setRequired(true)),
  new SlashCommandBuilder().setName('teach').setDescription('Teach the bot a pattern (admins)').addStringOption(o => o.setName('trigger').setDescription('Trigger phrase').setRequired(true)).addStringOption(o => o.setName('response').setDescription('Response (use {user})').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('teach-list').setDescription('List taught patterns (admins)').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('teach-remove').setDescription('Remove taught pattern (admins)').addIntegerOption(o => o.setName('id').setDescription('Pattern ID').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('mode').setDescription('Set personality mode for this server (admins)').addStringOption(o => o.setName('mode').setDescription('standard|formal|funny|gamer').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  // scheduler management (admin)
  new SlashCommandBuilder().setName('schedule-add').setDescription('Add scheduled announcement (cron expr)').addStringOption(o => o.setName('cron').setDescription('Cron expression').setRequired(true)).addChannelOption(o => o.setName('channel').setDescription('Channel for announcement').setRequired(true)).addStringOption(o => o.setName('text').setDescription('Message text').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('schedule-list').setDescription('List scheduled announcements (admins)').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('schedule-remove').setDescription('Remove schedule by id (admin)').addIntegerOption(o => o.setName('id').setDescription('Schedule id').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
].map(s => s.toJSON());

// Register slash commands
(async () => {
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  try {
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID, GUILD_ID), { body: slashCommands });
      console.log('Registered guild commands.');
    } else {
      await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), { body: slashCommands });
      console.log('Registered global commands (may take up to 1 hour).');
    }
  } catch (err) {
    console.error('Failed to register commands:', err);
  }
})();

// ---------- Scheduler loader ----------
function initScheduler(client) {
  const rows = getSchedules();
  for (const r of rows) {
    try {
      if (!cron.validate(r.cron_expr)) {
        console.warn('Skipping invalid cron expr for schedule', r.id, r.cron_expr);
        continue;
      }
      cron.schedule(r.cron_expr, async () => {
        try {
          const guild = client.guilds.cache.get(r.guild_id);
          if (!guild) return;
          const ch = guild.channels.cache.get(r.channel_id);
          if (ch) await ch.send(r.text);
        } catch (e) { console.error('Scheduled task error', e); }
      }, { timezone: 'UTC' });
      console.log('Loaded schedule', r.id, r.cron_expr);
    } catch (e) {
      console.error('Failed to schedule', r.id, e);
    }
  }
}

// ---------- Interaction (slash) handling ----------
client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;
    const name = interaction.commandName;

    if (name === 'ping') return interaction.reply({ content: 'Pong!', ephemeral: false });

    if (name === 'ask') {
      const prompt = interaction.options.getString('prompt');
      await interaction.deferReply();
      const mem = getUserMemory(interaction.user.id);
      const memText = (mem.notes || []).slice(-8).join('\n');
      const conf = getServerConfig(interaction.guildId || 'dm');
      const sys = systemPrompt(conf.personality || 'standard');
      const full = `${sys}\n\nRecent memory:\n${memText}\n\nQuestion:\n${prompt}`;
      bump('ai_requests');
      const answer = await askGemini(full, []);
      // embed reply
      const embed = new EmbedBuilder().setTitle('Assistant').setDescription(answer).setColor('#6ea8fe');
      await interaction.editReply({ embeds: [embed] });

      // store memory snippet
      mem.notes = mem.notes || [];
      mem.notes.push(`${new Date().toISOString()}: ${prompt}`);
      if (mem.notes.length > 200) mem.notes.shift();
      setUserMemory(interaction.user.id, mem);
      return;
    }

    if (name === 'teach') {
      if (!interaction.inGuild()) return interaction.reply({ content: 'Use this command in a server.', ephemeral: true });
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) return interaction.reply({ content: 'Manage Server required.', ephemeral: true });
      const trigger = interaction.options.getString('trigger');
      const response = interaction.options.getString('response');
      addTeachPattern(interaction.guildId, trigger, response);
      bump('teach_added');
      return interaction.reply({ content: 'Pattern added.', ephemeral: true });
    }

    if (name === 'teach-list') {
      if (!interaction.inGuild()) return interaction.reply({ content: 'Use this command in a server.', ephemeral: true });
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) return interaction.reply({ content: 'Manage Server required.', ephemeral: true });
      const rows = listTeachPatterns(interaction.guildId);
      if (rows.length === 0) return interaction.reply({ content: 'No patterns found.', ephemeral: true });
      const out = rows.map(r => `#${r.id} • "${r.trigger}" → ${r.response}`).join('\n\n');
      return interaction.reply({ content: `Patterns:\n\n${out}`, ephemeral: true });
    }

    if (name === 'teach-remove') {
      if (!interaction.inGuild()) return interaction.reply({ content: 'Use this command in a server.', ephemeral: true });
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) return interaction.reply({ content: 'Manage Server required.', ephemeral: true });
      const id = interaction.options.getInteger('id');
      removeTeachPattern(interaction.guildId, id);
      bump('teach_removed');
      return interaction.reply({ content: `Removed pattern ${id} (if existed).`, ephemeral: true });
    }

    if (name === 'mode') {
      if (!interaction.inGuild()) return interaction.reply({ content: 'Use in a server.', ephemeral: true });
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) return interaction.reply({ content: 'Manage Server required.', ephemeral: true });
      const mode = interaction.options.getString('mode');
      const conf = getServerConfig(interaction.guildId);
      conf.personality = mode;
      setServerConfig(interaction.guildId, conf);
      return interaction.reply({ content: `Personality set to ${mode}`, ephemeral: true });
    }

    if (name === 'schedule-add') {
      if (!interaction.inGuild()) return interaction.reply({ content: 'Use in a server.', ephemeral: true });
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) return interaction.reply({ content: 'Manage Server required.', ephemeral: true });
      const cronExpr = interaction.options.getString('cron');
      const channel = interaction.options.getChannel('channel');
      const text = interaction.options.getString('text');
      if (!cron.validate(cronExpr)) return interaction.reply({ content: 'Invalid cron expression.', ephemeral: true });
      addSchedule(interaction.guildId, cronExpr, channel.id, text);
      bump('schedules_added');
      return interaction.reply({ content: 'Schedule saved.', ephemeral: true });
    }

    if (name === 'schedule-list') {
      if (!interaction.inGuild()) return interaction.reply({ content: 'Use in a server.', ephemeral: true });
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) return interaction.reply({ content: 'Manage Server required.', ephemeral: true });
      const rows = getSchedules().filter(r => r.guild_id === interaction.guildId);
      if (!rows.length) return interaction.reply({ content: 'No schedules for this server.', ephemeral: true });
      const out = rows.map(r => `#${r.id} • ${r.cron_expr} → <#${r.channel_id}> : ${r.text}`).join('\n\n');
      return interaction.reply({ content: `Schedules:\n\n${out}`, ephemeral: true });
    }

    if (name === 'schedule-remove') {
      if (!interaction.inGuild()) return interaction.reply({ content: 'Use in a server.', ephemeral: true });
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) return interaction.reply({ content: 'Manage Server required.', ephemeral: true });
      const id = interaction.options.getInteger('id');
      removeSchedule(id);
      return interaction.reply({ content: `Removed schedule ${id} (if existed).`, ephemeral: true });
    }

  } catch (err) {
    console.error('interaction error', err);
    try { if (!interaction.replied) await interaction.reply({ content: 'Error processing command.', ephemeral: true }); } catch {}
  }
});

// ---------- Message handler: mention/DM/question + teach + AI ----------
client.on('messageCreate', async (msg) => {
  try {
    if (msg.author.bot) return;

    const isDM = msg.channel.type === 1 || msg.channel.type === 'DM'; // library differences; DM check
    const conf = getServerConfig(msg.guildId || 'dm');

    // Decide reply mode
    let shouldReply = false;
    if (conf.replyMode === 'always') shouldReply = true;
    else if (conf.replyMode === 'mention') shouldReply = msg.mentions.has(client.user);
    else if (conf.replyMode === 'channel') shouldReply = conf.allowedChannels && conf.allowedChannels.includes(msg.channel.id);
    // also reply in DMs
    if (isDM) shouldReply = true;
    if (!shouldReply) return;

    // only questions if configured
    if (conf.onlyQuestions && !isDM && !isQuestion(msg.content)) return;

    // teach patterns
    const patterns = listTeachPatterns(msg.guildId || 'dm');
    const low = (msg.content || '').toLowerCase();
    for (const p of patterns) {
      if (low.includes(p.trigger)) {
        const out = p.response.replace('{user}', `<@${msg.author.id}>`);
        bump('teach_responses');
        return msg.reply({ content: out });
      }
    }

    // build memory & system prompt
    const mem = getUserMemory(msg.author.id);
    const memText = (mem.notes || []).slice(-8).join('\n');
    const sys = systemPrompt(conf.personality || 'standard');
    const prompt = `${sys}\n\nRecent memory:\n${memText}\n\nUser message:\n${msg.content}`;

    await msg.channel.sendTyping();
    bump('ai_requests');
    const reply = await askGemini(prompt, []);
    // embed reply with small footer
    const embed = new EmbedBuilder().setDescription(reply).setColor('#8ecae6').setFooter({ text: 'AI Assistant' });
    await msg.reply({ embeds: [embed] });

    // append to memory
    mem.notes = mem.notes || [];
    mem.notes.push(`${new Date().toISOString()}: ${msg.content}`);
    if (mem.notes.length > 200) mem.notes.shift();
    setUserMemory(msg.author.id, mem);

  } catch (err) {
    console.error('message handler error', err);
  }
});

// ---------- Init plugins + scheduler on ready ----------
client.once('ready', () => {
  console.log(`${client.user.tag} ready — starting plugins & scheduler`);
  // initialize in-file plugins
  initPlugins(client, { db, askGemini });
  // initialize persistent scheduler
  initScheduler(client);
});

// ---------- Minimal dashboard (optional) ----------
const app = express();
app.use(express.json());
function dashAuth(req, res, next) {
  if (!DASH_SECRET) return res.status(500).send('DASHBOARD_SECRET not configured.');
  const key = req.headers['x-dashboard-secret'] || req.query.secret;
  if (!key || key !== DASH_SECRET) return res.status(401).send('Unauthorized');
  next();
}
app.get('/', (req, res) => res.send(`<h2>Bot Dashboard</h2><p>Use /analytics (with secret)</p>`));
app.get('/analytics', dashAuth, (req, res) => res.json(getAnalytics()));
app.get('/teach/:guildId', dashAuth, (req, res) => res.json(listTeachPatterns(req.params.guildId)));
app.post('/teach/:guildId', dashAuth, (req, res) => {
  const { trigger, response } = req.body;
  if (!trigger || !response) return res.status(400).json({ error: 'trigger+response required' });
  addTeachPattern(req.params.guildId, trigger, response);
  res.json({ ok: true });
});
app.listen(PORT, () => console.log(`Dashboard listening on port ${PORT}`));

// ---------- Start the bot ----------
client.login(DISCORD_TOKEN).catch(err => { console.error('Discord login failed', err); process.exit(1); });

/*
------------------------------
Quick setup (Replit or local)
------------------------------
1) Create a new file named `bot.js` and paste this entire file.
2) In Replit: Tools → Secrets add:
   DISCORD_TOKEN, DISCORD_CLIENT_ID, GEMINI_API_KEY, optionally GUILD_ID, DASHBOARD_SECRET, PORT=3000
   Locally: create .env with those variables.

3) Install dependencies:
   npm install discord.js better-sqlite3 @google/generative-ai dotenv node-cron express

4) Run:
   node bot.js

5) Invite bot with:
   https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=bot%20applications.commands&permissions=3072
   (replace YOUR_CLIENT_ID)

Notes:
- For faster slash command testing set GUILD_ID to a dev server id (commands register instantly).
- Replit free plans sleep; use uptime pings or use Railway/Render for 24/7 hosting.
- Do NOT commit your real keys to GitHub. Use Replit Secrets.

If anything errors, paste the exact console output here and I’ll debug it for you.
*/

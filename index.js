// index.js
/* Main orchestrator for Discord AI assistant.
   - Loads plugins in ./plugins
   - Registers slash commands
   - Handles interactions and message mentions
   - Uses lib/ai and lib/db for OpenAI & SQLite helpers
*/

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const { createCompletion, createImage } = require('./lib/ai');
const { initDB, getUserMemory, setUserMemory, getServerConfig, setServerConfig, bumpStat, db } = require('./lib/db');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID || null;

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID) {
  console.error("Please set DISCORD_TOKEN and DISCORD_CLIENT_ID in .env");
  process.exit(1);
}

initDB();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// ---------- Slash command definitions ----------
const commands = [
  new SlashCommandBuilder().setName('ask').setDescription('Ask the assistant a question')
    .addStringOption(o => o.setName('prompt').setDescription('Your question').setRequired(true)).toJSON(),

  new SlashCommandBuilder().setName('mode').setDescription('Set server personality (admins only)')
    .addStringOption(o => o.setName('mode').setDescription('standard|formal|funny').setRequired(true)).toJSON(),

  new SlashCommandBuilder().setName('memory').setDescription('Manage personal memory')
    .addSubcommand(s => s.setName('add').setDescription('Add memory').addStringOption(o => o.setName('text').setRequired(true)))
    .addSubcommand(s => s.setName('show').setDescription('Show memory'))
    .addSubcommand(s => s.setName('clear').setDescription('Clear memory'))
    .toJSON(),

  new SlashCommandBuilder().setName('teach').setDescription('Teach the bot a pattern (admins only)')
    .addStringOption(o => o.setName('trigger').setDescription('Trigger phrase').setRequired(true))
    .addStringOption(o => o.setName('response').setDescription('Response (use {user} for mention)').setRequired(true))
    .toJSON(),

  new SlashCommandBuilder().setName('remind').setDescription('Set a reminder')
    .addStringOption(o => o.setName('time').setDescription('e.g. 10m, 2h').setRequired(true))
    .addStringOption(o => o.setName('note').setDescription('Reminder text').setRequired(true))
    .toJSON(),

  new SlashCommandBuilder().setName('coinflip').setDescription('Flip a coin').toJSON(),

  new SlashCommandBuilder().setName('imagine').setDescription('Generate an image from prompt')
    .addStringOption(o => o.setName('prompt').setDescription('Image prompt').setRequired(true)).toJSON()
];

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
(async () => {
  try {
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID, GUILD_ID), { body: commands });
      console.log('Registered guild commands.');
    } else {
      await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), { body: commands });
      console.log('Registered global commands (may take up to 1 hour).');
    }
  } catch (err) {
    console.error('Command registration failed', err);
  }
})();

// ---------- Plugin loader ----------
const PLUGINS_DIR = path.join(__dirname, 'plugins');
if (!fs.existsSync(PLUGINS_DIR)) fs.mkdirSync(PLUGINS_DIR);
fs.readdirSync(PLUGINS_DIR).forEach(f => {
  if (!f.endsWith('.js')) return;
  try {
    const plugin = require(path.join(PLUGINS_DIR, f));
    if (plugin && typeof plugin.init === 'function') plugin.init(client, { createCompletion, db });
    console.log('Loaded plugin:', f);
  } catch (e) {
    console.error('Failed to load plugin:', f, e);
  }
});

// ---------- Utilities ----------
function systemPromptFor(personality) {
  switch ((personality || 'standard').toLowerCase()) {
    case 'formal':
      return "You are a helpful, concise, formal assistant. Use polite, professional language.";
    case 'funny':
      return "You are a witty, playful assistant — friendly and humorous, but helpful and safe.";
    default:
      return "You are a helpful, clear assistant. Be concise and informative.";
  }
}
const RATE = new Map();
function checkRate(userId) {
  const now = Date.now();
  const window = 60_000;
  const max = 20;
  const arr = RATE.get(userId) || [];
  const filtered = arr.filter(t => now - t < window);
  filtered.push(now);
  RATE.set(userId, filtered);
  return filtered.length <= max;
}
function looksLikeQuestion(text) {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.endsWith('?')) return true;
  const wh = /^(who|what|when|where|why|how|is|are|do|does|did|can|could|should|would)\b/i;
  return wh.test(trimmed);
}

// ---------- Interaction (slash) handler ----------
client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;
    const name = interaction.commandName;

    if (name === 'ask') {
      const prompt = interaction.options.getString('prompt');
      if (!checkRate(interaction.user.id)) return interaction.reply({ content: "Rate limit — try again later.", ephemeral: true });
      await interaction.deferReply();
      bumpStat('asks');
      const conf = getServerConfig(interaction.guildId || 'dm');
      const sys = systemPromptFor(conf.personality);
      const mem = getUserMemory(interaction.user.id);
      const memText = (mem.notes || []).slice(-5).join('\n');
      const messages = [
        { role: 'system', content: sys },
        { role: 'system', content: `Recent memory:\n${memText}` },
        { role: 'user', content: prompt }
      ];
      try {
        const answer = await createCompletion(messages);
        const embed = new EmbedBuilder().setTitle("Assistant").setDescription(answer || "No answer.").setColor("#6ea8fe")
          .setFooter({ text: `Mode: ${conf.personality}` });
        await interaction.editReply({ embeds: [embed] });
      } catch (err) {
        console.error('OpenAI error', err);
        await interaction.editReply('⚠️ Error contacting AI.');
      }
    }

    else if (name === 'mode') {
      const modeVal = interaction.options.getString('mode');
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!member.permissions.has('ManageGuild')) return interaction.reply({ content: "You must have Manage Server to change mode.", ephemeral: true });
      const conf = getServerConfig(interaction.guildId);
      conf.personality = modeVal;
      setServerConfig(interaction.guildId, conf);
      await interaction.reply({ content: `Personality set to **${modeVal}**.` });
    }

    else if (name === 'memory') {
      const sub = interaction.options.getSubcommand();
      if (sub === 'add') {
        const text = interaction.options.getString('text');
        const mem = getUserMemory(interaction.user.id);
        mem.notes = mem.notes || [];
        mem.notes.push(`${new Date().toISOString()}: ${text}`);
        mem.last_used = new Date().toISOString();
        setUserMemory(interaction.user.id, mem);
        await interaction.reply({ content: 'Saved to memory.', ephemeral: true });
      } else if (sub === 'show') {
        const mem = getUserMemory(interaction.user.id);
        const embed = new EmbedBuilder().setTitle('Your Memory').setDescription((mem.notes || []).slice(-10).join('\n') || 'No memory').setColor('#8fd19e');
        await interaction.reply({ embeds: [embed], ephemeral: true });
      } else if (sub === 'clear') {
        setUserMemory(interaction.user.id, { notes: [], last_used: null });
        await interaction.reply({ content: 'Memory cleared.', ephemeral: true });
      }
    }

    else if (name === 'teach') {
      const trigger = interaction.options.getString('trigger');
      const response = interaction.options.getString('response');
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!member.permissions.has('ManageGuild')) return interaction.reply({ content: "Manage Server required.", ephemeral: true });
      const teach = require('./plugins/teach');
      teach.addPattern(interaction.guildId, trigger, response);
      await interaction.reply({ content: 'Pattern added.', ephemeral: true });
    }

    else if (name === 'remind') {
      const time = interaction.options.getString('time');
      const note = interaction.options.getString('note');
      const m = time.match(/^(\d+)([smhd])$/);
      if (!m) return interaction.reply({ content: 'Use format like 10m, 2h, 30s', ephemeral: true });
      const n = parseInt(m[1], 10);
      const unit = m[2];
      let ms = 0;
      if (unit === 's') ms = n * 1000;
      if (unit === 'm') ms = n * 60_000;
      if (unit === 'h') ms = n * 60 * 60_000;
      if (unit === 'd') ms = n * 24 * 60 * 60_000;
      await interaction.reply({ content: `Okay — I'll remind you in ${time}.`, ephemeral: true });
      setTimeout(async () => {
        try {
          const u = await client.users.fetch(interaction.user.id);
          await u.send(`⏰ Reminder: ${note}`);
        } catch (e) { console.error("Remind send failed", e); }
      }, ms);
    }

    else if (name === 'coinflip') {
      const r = Math.random() < 0.5 ? 'Heads' : 'Tails';
      await interaction.reply({ content: `🪙 ${r}` });
    }

    else if (name === 'imagine') {
      const prompt = interaction.options.getString('prompt');
      await interaction.deferReply();
      try {
        const url = await createImage(prompt);
        const embed = new EmbedBuilder().setTitle('Image result').setImage(url).setColor('#b388ff');
        await interaction.editReply({ embeds: [embed] });
      } catch (err) {
        console.error('Image gen error', err);
        await interaction.editReply('Error generating image.');
      }
    }
  } catch (err) {
    console.error('interactionCreate error', err);
  }
});

// ---------- Message listener (smart replies & teach plugin) ----------
client.on('messageCreate', async (msg) => {
  try {
    if (msg.author.bot) return;
    const conf = getServerConfig(msg.guildId || 'dm');
    // allowed channels check
    if (conf.allowedChannels && conf.allowedChannels.length && !conf.allowedChannels.includes(msg.channel.id)) return;
    let shouldReply = false;
    if (conf.replyMode === 'always') shouldReply = true;
    else if (conf.replyMode === 'mention') shouldReply = msg.mentions.has(client.user);
    else if (conf.replyMode === 'channel') shouldReply = conf.allowedChannels && conf.allowedChannels.includes(msg.channel.id);
    if (!shouldReply) return;
    if (conf.onlyQuestions && !looksLikeQuestion(msg.content)) return;
    if (!checkRate(msg.author.id)) return msg.reply('⏳ Slow down — rate limit.');

    // check teach plugin
    const teach = require('./plugins/teach');
    const matched = teach.matchPattern(msg.guildId, msg.content);
    if (matched) {
      const response = matched.response.replace('{user}', `<@${msg.author.id}>`);
      return msg.reply(response);
    }

    // otherwise call AI
    await msg.channel.sendTyping();
    const sys = systemPromptFor(conf.personality);
    const mem = getUserMemory(msg.author.id);
    const memText = (mem.notes || []).slice(-5).join('\n');
    const messages = [
      { role: 'system', content: sys },
      { role: 'system', content: `User memory:\n${memText}` },
      { role: 'user', content: msg.content }
    ];

    try {
      const answer = await createCompletion(messages);
      const embed = new EmbedBuilder().setAuthor({ name: client.user.username }).setDescription(answer || "I don't know.").setColor('#97c1ff');
      await msg.reply({ embeds: [embed] });
      bumpStat('messageReplies');
    } catch (err) {
      console.error('OpenAI failure', err);
      await msg.reply('⚠️ I could not reach the AI. Try again later.');
    }
  } catch (err) {
    console.error('messageCreate handler error', err);
  }
});

client.once('ready', () => {
  console.log(`${client.user.tag} ready — Assistant loaded`);
  console.log('Loaded from', __dirname);
});

client.login(DISCORD_TOKEN);

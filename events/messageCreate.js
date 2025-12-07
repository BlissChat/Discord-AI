// events/messageCreate.js
const { getServerConfig, getUserMemory, setUserMemory, listPatterns } = require('../lib/db');
const { askAI } = require('../ai');
const personality = require('../lib/personality');
const analytics = require('../lib/analytics');

function looksLikeQuestion(text) {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.endsWith('?')) return true;
  const wh = /^(who|what|when|where|why|how|is|are|do|does|did|can|could|should|would)\b/i;
  return wh.test(trimmed);
}

module.exports = {
  event: 'messageCreate',
  run: async (client, msg) => {
    try {
      if (msg.author.bot) return;

      const conf = getServerConfig(msg.guildId || 'dm');

      // channel filter
      if (conf.allowedChannels && conf.allowedChannels.length && !conf.allowedChannels.includes(msg.channel.id)) return;

      // decide whether to reply
      let shouldReply = false;
      if (conf.replyMode === 'always') shouldReply = true;
      else if (conf.replyMode === 'mention') shouldReply = msg.mentions.has(client.user);
      else if (conf.replyMode === 'channel') shouldReply = conf.allowedChannels && conf.allowedChannels.includes(msg.channel.id);
      if (!shouldReply) return;

      // only questions
      if (conf.onlyQuestions && !looksLikeQuestion(msg.content)) return;

      // teach patterns
      const patterns = listPatterns(msg.guildId);
      const lower = msg.content.toLowerCase();
      for (const p of patterns) {
        if (lower.includes(p.trigger)) {
          const out = p.response.replace('{user}', `<@${msg.author.id}>`);
          analytics.bump('teach_responses');
          return msg.reply({ content: out });
        }
      }

      // prepare memory & personality
      const userMem = getUserMemory(msg.author.id);
      const memText = (userMem.notes || []).slice(-8).join('\n');
      const sys = personality.systemPrompt(conf.personality || 'standard');

      // build final prompt
      const prompt = `${sys}\n\nRecent memory:\n${memText}\n\nUser: ${msg.content}`;

      await msg.channel.sendTyping();
      analytics.bump('ai_requests');
      const answer = await askAI(prompt, []);

      // reply
      await msg.reply({ content: answer });

      // persist simple memory snippet
      try {
        userMem.notes = userMem.notes || [];
        userMem.notes.push(`${new Date().toISOString()}: ${msg.content}`);
        if (userMem.notes.length > 200) userMem.notes.shift();
        setUserMemory(msg.author.id, userMem);
      } catch (e) {
        console.error('Memory save failed', e);
      }
    } catch (err) {
      console.error('messageCreate handler error', err);
    }
  }
};

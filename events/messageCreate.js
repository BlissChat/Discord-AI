const { getServerConfig, getUserMemory, setUserMemory, listPatterns } = require('../lib/db');
const { askAI } = require('../lib/ai');

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

      // allowed channel filter
      if (conf.allowedChannels && conf.allowedChannels.length && !conf.allowedChannels.includes(msg.channel.id)) return;

      // decide whether to reply
      let shouldReply = false;
      if (conf.replyMode === 'always') shouldReply = true;
      else if (conf.replyMode === 'mention') shouldReply = msg.mentions.has(client.user);
      else if (conf.replyMode === 'channel') shouldReply = conf.allowedChannels && conf.allowedChannels.includes(msg.channel.id);
      if (!shouldReply) return;

      if (conf.onlyQuestions && !looksLikeQuestion(msg.content)) return;

      // check teach patterns
      const patterns = listPatterns(msg.guildId);
      const lower = msg.content.toLowerCase();
      for (const p of patterns) {
        if (lower.includes(p.trigger)) {
          const out = p.response.replace('{user}', `<@${msg.author.id}>`);
          return msg.reply({ content: out });
        }
      }

      // build memory (very small example usage)
      const userMem = getUserMemory(msg.author.id);
      const memText = (userMem.notes || []).slice(-5).join('\n');

      // call Gemini
      await msg.channel.sendTyping();
      const systemPrompt = `You are a helpful Discord assistant. Keep replies concise.`;
      const prompt = `${systemPrompt}\n\nUser memory:\n${memText}\n\nUser message:\n${msg.content}`;
      const answer = await askAI(prompt, []);

      // send embed-styled reply (simple)
      await msg.reply({ content: answer });

      // optional: save snippet to memory
      userMem.notes = userMem.notes || [];
      userMem.notes.push(`${new Date().toISOString()}: ${msg.content}`);
      if (userMem.notes.length > 50) userMem.notes.shift();
      setUserMemory(msg.author.id, userMem);

    } catch (err) {
      console.error('messageCreate handler error', err);
    }
  }
};


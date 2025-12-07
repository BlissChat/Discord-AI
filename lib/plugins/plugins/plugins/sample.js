// plugins/sample.js
module.exports = {
  init(client, opts) {
    console.log('sample plugin loaded');
    client.on('messageCreate', async (msg) => {
      try {
        if (msg.author.bot) return;
        if (msg.content.toLowerCase().includes('hello bot')) {
          await msg.reply('Hello! I am your AI assistant. Try /ask or mention me.');
        }
      } catch (e) { console.error('sample plugin error', e); }
    });
  }
};

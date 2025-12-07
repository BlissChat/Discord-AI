// plugins/sample.js
module.exports = {
  init(client, opts) {
    console.log('sample plugin loaded');

    // Example: respond to "ping" in messages (if bot is allowed to reply)
    client.on('messageCreate', async (msg) => {
      try {
        if (msg.author.bot) return;
        if (msg.content.toLowerCase().includes('ping the bot')) {
          await msg.reply('Pong! (sample plugin)');
        }
      } catch (e) {
        console.error('sample plugin error', e);
      }
    });
  }
};

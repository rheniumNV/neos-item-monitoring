import _, { identity } from "lodash";
import { sleep } from "./util";
import Discord, {
  TextChannel,
  AnyChannel,
  MessagePayload,
  MessageOptions,
  Intents,
  Message,
} from "discord.js";

export default class DiscordClient {
  private client = new Discord.Client({
    intents: [Intents.FLAGS.GUILD_MESSAGES],
  });
  private isReady = false;

  constructor(init: { token?: string }) {
    this.client.once("ready", () => {
      this.isReady = true;
    });
    this.client.login(init.token);
  }

  private async wait2Ready() {
    while (!this.isReady) {
      await sleep(0.1);
    }
  }

  public async getDiscordChannel(
    guildId: string,
    channelId: string
  ): Promise<AnyChannel | null> {
    await this.wait2Ready();

    const guild = await this.client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId);
    return channel;
  }

  public async sendDiscordMessage(
    channel: AnyChannel,
    message: string | MessagePayload | MessageOptions
  ) {
    await this.wait2Ready();

    if (channel.type !== "GUILD_TEXT") {
      throw new Error(`channel is not TextChannel.`);
    }

    channel.threads;

    return channel.send(message);
  }

  public async sendDiscordThreadMessage(
    targetMessage: Message,
    message: string | MessagePayload | MessageOptions
  ) {
    await this.wait2Ready();

    if (!targetMessage.hasThread) {
      try {
        const threadNameValid =
          !!targetMessage.content && targetMessage.content != "";
        await targetMessage.startThread({
          name: threadNameValid ? targetMessage.content : "thread",
        });
      } catch (e) {}
    }

    if (targetMessage.hasThread) {
      return await targetMessage.thread?.send(message);
    }
  }

  public async deleteThreadCreatedMessages(channel: Discord.TextChannel) {
    const messages = await channel.messages.fetch();
    const threadCreatedMessages = messages
      .map((message) => (message.type === "THREAD_CREATED" ? message.id : ""))
      .filter((id) => id !== "");
    if (threadCreatedMessages.length > 0) {
      await channel.bulkDelete(threadCreatedMessages);
      await this.deleteThreadCreatedMessages(channel);
    }
  }

  public async destroy() {
    await this.client.destroy();
  }
}

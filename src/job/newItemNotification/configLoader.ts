import _ from "lodash";
import moment from "moment";
import { Client } from "@notionhq/client";

const {
  NOTION_TOKEN,
  NOTION_DATABASE_ID,
  CHECK_INTERVAL,
  REQUEST_INTERVAL,
  DISCORD_TOKEN,
  DISCORD_GUILD_ID,
  NEW_ITEM_NOTIFICATION_DISCORD_CHANNEL_ID,
  JOB_REPORT_DISCORD_CHANNEL_ID,
} = process.env;

export async function loadConfig() {
  if (typeof NOTION_TOKEN !== "string") {
    throw new Error(`NOTION_TOKEN is not string.NOTION_TOKEN=${NOTION_TOKEN}`);
  }

  if (typeof NOTION_DATABASE_ID !== "string") {
    throw new Error(
      `NOTION_DATABASE_ID is not string.NOTION_DATABASE_ID=${NOTION_DATABASE_ID}`
    );
  }

  if (typeof DISCORD_TOKEN !== "string") {
    throw new Error(
      `DISCORD_TOKEN is not string.DISCORD_TOKEN=${DISCORD_TOKEN}`
    );
  }

  if (typeof DISCORD_GUILD_ID !== "string") {
    throw new Error(
      `DISCORD_GUILD_ID is no
      t string.DISCORD_GUILD_ID=${DISCORD_GUILD_ID}`
    );
  }

  if (typeof NEW_ITEM_NOTIFICATION_DISCORD_CHANNEL_ID !== "string") {
    throw new Error(
      `NEW_ITEM_NOTIFICATION_DISCORD_CHANNEL_ID is not string.NEW_ITEM_NOTIFICATION_DISCORD_CHANNEL_ID=${NEW_ITEM_NOTIFICATION_DISCORD_CHANNEL_ID}`
    );
  }

  if (typeof JOB_REPORT_DISCORD_CHANNEL_ID !== "string") {
    throw new Error(
      `JOB_REPORT_DISCORD_CHANNEL_ID is not string.JOB_REPORT_DISCORD_CHANNEL_ID=${JOB_REPORT_DISCORD_CHANNEL_ID}`
    );
  }

  const checkInterval = Number(CHECK_INTERVAL) > 0 ? Number(CHECK_INTERVAL) : 7;
  const requestInterval =
    Number(REQUEST_INTERVAL) > 0 ? Number(REQUEST_INTERVAL) : 3;

  const newItemStartTime = moment()
    .startOf("day")
    .subtract(checkInterval, "days");
  const newItemEndTime = moment().startOf("day");

  const firstLinks = (
    await new Client({ auth: NOTION_TOKEN }).databases.query({
      database_id: NOTION_DATABASE_ID,
    })
  )?.results
    .map((page) => {
      return {
        name: _.get(page, ["properties", "Name", "title", 0, "plain_text"]),
        ownerId: _.get(page, [
          "properties",
          "OwnerId",
          "rich_text",
          0,
          "plain_text",
        ]),
        recordId: _.get(page, [
          "properties",
          "RecordId",
          "rich_text",
          0,
          "plain_text",
        ]),
        active: _.get(page, ["properties", "Active", "checkbox"]),
      };
    })
    .filter(({ ownerId, recordId, active }) => ownerId && recordId && active);

  return {
    notionToken: NOTION_TOKEN,
    notionDatabaseId: NOTION_DATABASE_ID,
    checkInterval,
    requestInterval,
    newItemStartTime,
    newItemEndTime,
    firstLinks,
    discordToken: DISCORD_TOKEN,
    discordGuildId: DISCORD_GUILD_ID,
    jobReportDiscordChannelId: JOB_REPORT_DISCORD_CHANNEL_ID,
    newItemNotificationDiscordChannelId:
      NEW_ITEM_NOTIFICATION_DISCORD_CHANNEL_ID,
  };
}

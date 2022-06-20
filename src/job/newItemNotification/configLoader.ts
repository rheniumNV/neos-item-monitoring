import _ from "lodash";
import moment from "moment";
import { Client } from "@notionhq/client";

const {
  NEW_ITEM_NOTIFICATION_DISCORD_WEBHOOK,
  JOB_REPORT_DISCORD_WEBHOOK,
  NOTION_TOKEN,
  NOTION_DATABASE_ID,
  CHECK_INTERVAL,
  REQUEST_INTERVAL,
} = process.env;

export async function loadConfig() {
  if (typeof NEW_ITEM_NOTIFICATION_DISCORD_WEBHOOK !== "string") {
    throw new Error(
      `NEW_ITEM_NOTIFICATION_DISCORD_WEBHOOK is not string.NEW_ITEM_NOTIFICATION_DISCORD_WEBHOOK=${NEW_ITEM_NOTIFICATION_DISCORD_WEBHOOK}`
    );
  }
  if (typeof JOB_REPORT_DISCORD_WEBHOOK !== "string") {
    throw new Error(
      `JOB_REPORT_DISCORD_WEBHOOK is not string.JOB_REPORT_DISCORD_WEBHOOK=${JOB_REPORT_DISCORD_WEBHOOK}`
    );
  }

  if (typeof NOTION_TOKEN !== "string") {
    throw new Error(`NOTION_TOKEN is not string.NOTION_TOKEN=${NOTION_TOKEN}`);
  }

  if (typeof NOTION_DATABASE_ID !== "string") {
    throw new Error(
      `NOTION_DATABASE_ID is not string.NOTION_DATABASE_ID=${NOTION_DATABASE_ID}`
    );
  }

  const checkInterval = Number(CHECK_INTERVAL) > 0 ? Number(CHECK_INTERVAL) : 7;
  const requestInterval =
    Number(REQUEST_INTERVAL) > 0 ? Number(REQUEST_INTERVAL) : 3;

  const newItemStartTime = moment()
    .startOf("day")
    .subtract(checkInterval, "days");
  const newItemEndTime = moment().startOf("day");

  return {
    newItemNotificationDiscordWebhook: NEW_ITEM_NOTIFICATION_DISCORD_WEBHOOK,
    jobReportDiscordWebhook: JOB_REPORT_DISCORD_WEBHOOK,
    notionToken: NOTION_TOKEN,
    notionDatabaseId: NOTION_DATABASE_ID,
    checkInterval,
    requestInterval,
    newItemStartTime,
    newItemEndTime,
    firstLinks: (
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
      .filter(({ ownerId, recordId, active }) => ownerId && recordId && active),
  };
}

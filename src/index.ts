import axios from "axios";
import _ from "lodash";
import { Client } from "@notionhq/client";
import moment from "moment";

const {
  NEW_ITEM_NOTIFICATION_DISCORD_WEBHOOK,
  NOTION_TOKEN,
  NOTION_DATABASE_ID,
  CHECK_INTERVAL,
} = process.env;

type NeosLink = { name: string; ownerId: string; recordId: string };

type NeosObject = {
  id: string;
  path: string;
  name: string;
  ownerId: string;
  creationTime: string;
  assetUri: string;
  thumbnailUri: string;
  link: NeosLink;
};

type NeosRawRecord = {
  id: string;
  name: string;
  ownerId: string;
  path: string;
  assetUri: string;
  recordType: "object" | "link" | "directory";
  tag: string[];
  creationTime: string;
  thumbnailUri: string;
};

async function sleep(waitTime: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, waitTime));
}

async function getNeosRecords(ownerId: string, recordId: string) {
  const ownerType = _.startsWith(ownerId as string, "U-") ? "users" : "groups";
  const { name, path } = (
    await axios.get(
      `https://api.neos.com/api/${ownerType}/${ownerId}/records/${recordId}`
    )
  )?.data;
  const fixedPath = _.join([path, name], "\\");
  const response = await axios.get(
    `https://api.neos.com/api/users/${ownerId}/records?path=${fixedPath}`
  );
  return response.data ?? [];
}

async function resolveLink(link: NeosLink): Promise<{
  links: NeosLink[];
  objects: NeosObject[];
}> {
  const { ownerId, recordId } = link;
  const records = await getNeosRecords(ownerId, recordId);
  const links = records
    .filter(({ recordType }: { recordType: string }) => recordType !== "object")
    .map(({ id, name, ownerId, assetUri, recordType }: NeosRawRecord) =>
      recordType === "link"
        ? {
            name,
            ownerId: _.get(_.split(assetUri, "/"), 3),
            recordId: _.get(_.split(assetUri, "/"), 4),
          }
        : { name, ownerId, recordId: id }
    );
  const objects = records
    .filter(({ recordType }: { recordType: string }) => recordType === "object")
    .map(
      ({
        id,
        path,
        ownerId,
        assetUri,
        name,
        creationTime,
        thumbnailUri,
      }: NeosRawRecord) => ({
        id,
        path,
        ownerId,
        name,
        creationTime,
        assetUri,
        thumbnailUri,
        link,
      })
    );
  return {
    links,
    objects,
  };
}

async function main() {
  if (typeof NEW_ITEM_NOTIFICATION_DISCORD_WEBHOOK !== "string") {
    throw new Error(
      `NEW_ITEM_NOTIFICATION_DISCORD_WEBHOOK is not string.NEW_ITEM_NOTIFICATION_DISCORD_WEBHOOK=${NEW_ITEM_NOTIFICATION_DISCORD_WEBHOOK}`
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
  if (typeof CHECK_INTERVAL !== "string") {
    throw new Error(
      `CHECK_INTERVAL is not string.CHECK_INTERVAL=${CHECK_INTERVAL}`
    );
  }

  const checkInterval = Number(CHECK_INTERVAL);

  const processStartTime = performance.now();

  const newItemStartTime = moment()
    .startOf("day")
    .subtract(checkInterval > 0 ? checkInterval : 3, "days");
  const newItemEndTime = moment().startOf("day");

  console.info(`start checking.(${newItemStartTime}-${newItemEndTime})`);

  const objectMap = new Map<string, any>();
  const linkMap = new Map<string, any>();

  const linkQueue: NeosLink[] = (
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

  console.info("firstLinks:", linkQueue);

  linkQueue.forEach((link) => {
    linkMap.set(`${link.ownerId}/${link.recordId}`, link);
  });

  while (linkQueue.length > 0) {
    const link = _.first(linkQueue) as NeosLink;
    try {
      const startTime = performance.now();
      const result = await resolveLink(link);
      const endTime = performance.now();

      const sleepTime = 1000 - (endTime - startTime);
      if (sleepTime > 0) {
        await sleep(sleepTime);
      }

      result.objects.forEach((object) => {
        objectMap.set(object.id, object);
      });

      result.links.forEach((link) => {
        const key = `${link.ownerId}/${link.recordId}`;
        if (!linkMap.has(key)) {
          linkMap.set(key, link);
          linkQueue.push(link);
        }
      });

      console.info(
        `link resolved. name=${link.name} ownerId=${link.ownerId} recordId=${link.recordId}`
      );
    } catch (e) {
      console.error(
        `link error. name=${link.name} ownerId=${link.ownerId} recordId=${link.recordId} `,
        e
      );
    }

    linkQueue.shift();
  }

  const newItems: any[] = [];
  objectMap.forEach((object) => {
    const { creationTime } = object;
    if (
      moment(creationTime).isAfter(newItemStartTime) &&
      moment(creationTime).isBefore(newItemEndTime)
    ) {
      newItems.push(object);
    }
  });

  console.info("checked link count:", linkMap.size);
  console.info("checked object count:", objectMap.size);
  console.info("newItem count:", newItems.length);
  console.info("newItems:", newItems);

  const embeds = newItems.map((item) => {
    const thumbnailAssetId = _.first(
      _.split(_.last(_.split(item.thumbnailUri, "/")), ".")
    );
    const thumbnailWebUri = `https://cloudxstorage.blob.core.windows.net/assets/${thumbnailAssetId}`;
    return {
      title: item.name,
      thumbnail: {
        url: thumbnailWebUri,
      },
      author: { name: item.ownerId },
      timestamp: item.creationTime,
      fields: [
        { name: "assetUrl", value: item.assetUri },
        {
          name: "inventory",
          value: `[${item.link.name}](https://util.neos.love/inventory/v1/link/${item.link.ownerId}/${item.link.recordId})`,
        },
      ],
    };
  });

  await Promise.all(
    _.chunk(embeds, 10).map((chunkedEmbeds) => {
      return axios
        .post(NEW_ITEM_NOTIFICATION_DISCORD_WEBHOOK, {
          embeds: chunkedEmbeds,
        })
        .catch((e) => {
          console.error("discord webhook error.", e);
        });
    })
  );

  const processEndTime = performance.now();
  console.info(
    `finish checking.(${newItemStartTime}-${newItemEndTime}). processTime: ${
      processEndTime - processStartTime
    }`
  );
}

main();

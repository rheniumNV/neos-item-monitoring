import _ from "lodash";
import moment from "moment";
import { logInfo, logError } from "../../lib/log";
import { sendDiscordMessage } from "../../lib/discord";
import { loadConfig } from "./configLoader";
import { jobCode } from "../../lib/jobCode";
import { getNeosRecords, NeosRawRecord } from "../../lib/neos";
import { sleep } from "../../lib/util";

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
  let jobReportDiscordWebhook = "";
  try {
    const processStartTime = performance.now();

    logInfo(`start job newItemNotification`);

    const {
      newItemNotificationDiscordWebhook,
      jobReportDiscordWebhook: JOB_REPORT_DISCORD_WEBHOOK,
      newItemStartTime,
      newItemEndTime,
      checkInterval,
      firstLinks,
      requestInterval,
    } = await loadConfig();
    jobReportDiscordWebhook = JOB_REPORT_DISCORD_WEBHOOK;

    await sendDiscordMessage(jobReportDiscordWebhook, {
      content: `start checking.(${newItemStartTime}-${newItemEndTime}). checkInterval=${checkInterval}. jobCode=${jobCode}`,
    });

    const objectMap = new Map<string, any>();
    const linkMap = new Map<string, any>();
    const linkQueue: NeosLink[] = firstLinks;

    logInfo("firstLinks:", linkQueue);

    linkQueue.forEach((link) => {
      linkMap.set(`${link.ownerId}/${link.recordId}`, link);
    });

    while (linkQueue.length > 0) {
      const link = _.first(linkQueue) as NeosLink;
      try {
        const startTime = performance.now();
        const result = await resolveLink(link);
        const endTime = performance.now();

        const sleepTime = requestInterval * 1000 - (endTime - startTime);
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

        logInfo(
          `link resolved. name: ${link.name} recordUri: neosrec:///${link.ownerId}/${link.recordId}`
        );
      } catch (e) {
        logError(
          `link error. name: ${link.name} recordUri: neosrec:///${link.ownerId}/${link.recordId}`,
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

    logInfo("checked link count:", linkMap.size);
    logInfo("checked object count:", objectMap.size);
    logInfo("newItem count:", newItems.length);
    logInfo("newItems:", newItems);

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
        return sendDiscordMessage(newItemNotificationDiscordWebhook, {
          embeds: chunkedEmbeds,
        });
      })
    );

    const processEndTime = performance.now();

    await sendDiscordMessage(jobReportDiscordWebhook, {
      content: `finish checking.(${newItemStartTime}-${newItemEndTime}). processTime: ${
        processEndTime - processStartTime
      }. checked link count:${linkMap.size}. checked object count:${
        objectMap.size
      }. new item count:${newItems.length}. jobCode=${jobCode}`,
    });

    logInfo(
      `finish checking.(${newItemStartTime}-${newItemEndTime}). processTime: ${
        processEndTime - processStartTime
      }`
    );
  } catch (e) {
    logError(e);

    await sendDiscordMessage(jobReportDiscordWebhook, {
      content: `unknown error. jobCode=${jobCode}`,
    });
  }
}

main();

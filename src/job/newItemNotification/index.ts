import _ from "lodash";
import moment from "moment";
import { logInfo, logError } from "../../lib/log";
import DiscordClient from "../../lib/discord";
import { loadConfig } from "./configLoader";
import { jobCode } from "../../lib/jobCode";
import { getNeosRecords, NeosRawRecord } from "../../lib/neos";
import { sleep } from "../../lib/util";
import { MessagePayload, MessageOptions } from "discord.js";

type NeosLink = { name: string; ownerId: string; recordId: string };

type NeosObject = {
  id: string;
  path: string;
  name: string;
  ownerId: string;
  creationTime: string;
  assetUri: string;
  thumbnailUri: string;
  lastModifyingUserId: string;
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
        lastModifyingUserId,
      }: NeosRawRecord) => ({
        id,
        path,
        ownerId,
        name,
        creationTime,
        assetUri,
        thumbnailUri,
        lastModifyingUserId,
        link,
      })
    );
  return {
    links,
    objects,
  };
}

function generateEmbed(item: NeosObject) {
  const thumbnailAssetId = _.first(
    _.split(_.last(_.split(item.thumbnailUri, "/")), ".")
  );
  const thumbnailWebUri = `https://cloudxstorage.blob.core.windows.net/assets/${thumbnailAssetId}`;
  return {
    title: item.name,
    thumbnail: {
      url: thumbnailWebUri,
    },
    author: { name: item.lastModifyingUserId },
    timestamp: item.creationTime,
    fields: [
      { name: "assetUrl", value: item.assetUri },
      {
        name: "inventory",
        value: `[${item.link.name}](https://util.neos.love/inventory/v1/link/${item.link.ownerId}/${item.link.recordId})`,
      },
    ],
  };
}

async function main() {
  let messageFunc = async (
    _msg: string | MessagePayload | MessageOptions
  ) => {};
  try {
    const processStartTime = performance.now();

    logInfo(`start job newItemNotification`);

    const {
      newItemStartTime,
      newItemEndTime,
      checkInterval,
      firstLinks,
      requestInterval,
      discordToken,
      discordGuildId,
      jobReportDiscordChannelId,
      newItemNotificationDiscordChannelId,
    } = await loadConfig();

    const discordClient = new DiscordClient({ token: discordToken });
    const newItemNotificationChannel = await discordClient.getDiscordChannel(
      discordGuildId,
      newItemNotificationDiscordChannelId
    );
    const jobReportChannel = await discordClient.getDiscordChannel(
      discordGuildId,
      jobReportDiscordChannelId
    );

    if (!newItemNotificationChannel) {
      throw new Error(
        `newItemNotificationChannel is not found. guildID=${discordGuildId}. channelId=${newItemNotificationChannel}`
      );
    }

    if (!jobReportChannel) {
      throw new Error(
        `jobReportChannel is not found. guildID=${discordGuildId}. channelId=${jobReportChannel}`
      );
    }

    messageFunc = async (msg: string | MessagePayload | MessageOptions) => {
      await discordClient.sendDiscordMessage(jobReportChannel, msg);
    };

    await discordClient.sendDiscordMessage(jobReportChannel, {
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

    const newItems: NeosObject[] = [];
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

    const creators = _.map(
      _.groupBy(newItems, ({ lastModifyingUserId }) => lastModifyingUserId),
      (list, key) => {
        return {
          ownerId: key,
          items: _(list)
            .uniqBy(({ name }) => name)
            .sortBy(({ creationTime }) => creationTime)
            .value(),
        };
      }
    );

    await Promise.all(
      creators.map((creator) => {
        return (async () => {
          const rootMessage = await discordClient.sendDiscordMessage(
            newItemNotificationChannel,
            {
              content: `${creator.items.length} items that ${
                creator.ownerId
              } saved from ${newItemStartTime.format(
                "YYYY M/D"
              )} to ${checkInterval}days.`,
            }
          );

          await Promise.all(
            _.chunk(creator.items, 10).map((items) => {
              return (async () => {
                await discordClient.sendDiscordThreadMessage(rootMessage, {
                  embeds: items.map(generateEmbed),
                });
              })();
            })
          );
        })();
      })
    );

    const processEndTime = performance.now();

    await discordClient.sendDiscordMessage(jobReportChannel, {
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

    await discordClient.destroy();
  } catch (e) {
    logError(e);

    await messageFunc({
      content: `unknown error. jobCode=${jobCode}`,
    });
  }
}

main();

import axios from "axios";
import _ from "lodash";

export type NeosRawRecord = {
  id: string;
  name: string;
  ownerId: string;
  path: string;
  assetUri: string;
  recordType: "object" | "link" | "directory";
  tag: string[];
  creationTime: string;
  thumbnailUri: string;
  lastModifyingUserId: string;
};

export async function getNeosRecords(
  ownerId: string,
  recordId: string
): Promise<NeosRawRecord[]> {
  const ownerType = _.startsWith(ownerId as string, "U-") ? "users" : "groups";
  const { name, path } = (
    await axios.get(
      `https://api.neos.com/api/${ownerType}/${ownerId}/records/${recordId}`
    )
  )?.data;
  const fixedPath = encodeURIComponent(_.join([path, name], "\\"));
  const response = await axios.get(
    `https://api.neos.com/api/users/${ownerId}/records?path=${fixedPath}`
  );
  return response.data ?? [];
}

export type NeosUser = {
  id: string;
  username: string;
  profile: {
    iconUrl: string;
  };
};

export async function getUserInfo(ownerId: string): Promise<NeosUser> {
  return (await axios.get(`https://api.neos.com/api/users/${ownerId}`)).data;
}

export function getIdFromAssetUri(assetUri: string): string | undefined {
  return _.first(_.split(_.last(_.split(assetUri, "/")), "."));
}

export function getWebUrlFromAssetUri(assetUri: string): string {
  return `https://cloudxstorage.blob.core.windows.net/assets/${getIdFromAssetUri(
    assetUri
  )}`;
}

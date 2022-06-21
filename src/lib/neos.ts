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

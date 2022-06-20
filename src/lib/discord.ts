import _ from "lodash";
import axios from "axios";
import { logWarn, logError } from "./log";
import { sleep } from "./util";

export async function sendDiscordMessage(webhookUrl: string, body: any) {
  while (true) {
    try {
      await axios.post(webhookUrl, body);
      return;
    } catch (e) {
      const status = _.get(e, ["response", "status"]);
      const retryAfter = _.get(e, ["response", "data", "retry_after"]);
      if (status === 429 && retryAfter > 0) {
        logWarn(`discord rate limit. retryAfter=${retryAfter}`);
        await sleep(retryAfter + 500);
      } else {
        logError("discord webhook error.", e);
        return;
      }
    }
  }
}

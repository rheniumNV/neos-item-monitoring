import { jobCode } from "./jobCode";

export function logInfo(...arg: any[]) {
  console.info(jobCode, ...arg);
}

export function logWarn(...arg: any[]) {
  console.warn(jobCode, ...arg);
}

export function logError(...arg: any[]) {
  console.error(jobCode, ...arg);
}

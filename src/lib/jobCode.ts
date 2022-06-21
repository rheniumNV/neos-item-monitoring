import moment from "moment";

export const jobCode = `${moment().format("YYYYMMDDHHmmss")}${Math.floor(
  Math.random() * 999
)}`;

import moment from "moment";

export const jobCode = `${moment().format("HHMMss")}${Math.floor(
  Math.random() * 999
)}`;

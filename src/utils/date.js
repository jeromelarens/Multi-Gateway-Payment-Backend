import dayjs from "dayjs";

export const now = () => dayjs();

export const currentDate = () => {
  return dayjs().format("YYYY-MM-DD");
};

export const currentDateTime = () => {
  return dayjs().format("YYYY-MM-DD HH:mm:ss");
};

export const currentTimestamp = () => {
  return dayjs().valueOf();
};

export const addDays = (days) => {
  return dayjs().add(days, "day");
};

export const formatDate = (
  date,
  format = "YYYY-MM-DD HH:mm:ss"
) => {
  return dayjs(date).format(format);
};
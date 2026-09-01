import dayjs from "dayjs";

const generateReceiptNumber = () => {
  const timestamp = dayjs().format("YYYYMMDDHHmmss");
  const random = Math.floor(1000 + Math.random() * 9000);

  return `RCT-${timestamp}-${random}`;
};

export default generateReceiptNumber;
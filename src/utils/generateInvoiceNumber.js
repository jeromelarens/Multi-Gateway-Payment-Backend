import dayjs from "dayjs";

const generateInvoiceNumber = () => {
  const timestamp = dayjs().format("YYYYMMDDHHmmss");
  const random = Math.floor(1000 + Math.random() * 9000);

  return `INV-${timestamp}-${random}`;
};

export default generateInvoiceNumber;
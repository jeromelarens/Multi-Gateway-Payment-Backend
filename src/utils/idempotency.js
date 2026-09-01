import crypto from "crypto";

const generateIdempotencyKey = () => {
  return crypto.randomUUID();
};

export default generateIdempotencyKey;
import { randomUUID } from "crypto";

export const generateUUID = () => {
  return randomUUID();
};

export const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const isProduction = () => {
  return process.env.NODE_ENV === "production";
};

export const isDevelopment = () => {
  return process.env.NODE_ENV === "development";
};
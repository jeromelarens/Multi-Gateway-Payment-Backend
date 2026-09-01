import winston from "winston";

const { combine, timestamp, colorize, printf, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  const content = stack || (typeof message === "object" ? JSON.stringify(message) : message);
  const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  return `${timestamp} [${level}] : ${content}${extra}`;
});

const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",

  format: combine(
    timestamp({
      format: "YYYY-MM-DD HH:mm:ss",
    }),
    errors({ stack: true }),
    colorize(),
    logFormat
  ),

  transports: [
    new winston.transports.Console(),
  ],

  exitOnError: false,
});

export default logger;
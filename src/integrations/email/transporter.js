import nodemailer from "nodemailer";

import env from "../../config/env.js";
import logger from "../../config/logger.js";
import ApiError from "../../utils/ApiError.js";

class EmailTransporter {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: env.emailHost,
      port: env.emailPort,
      secure: false,
      auth: {
        user: env.emailUser,
        pass: env.emailPass,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });
  }

  /*
  |--------------------------------------------------------------------------
  | Verify SMTP Connection
  |--------------------------------------------------------------------------
  */
  async verifyConnection() {
    try {
      await this.transporter.verify();

      logger.info({
        event: "EMAIL_TRANSPORTER_CONNECTED",
        provider: env.emailHost,
      });

      return true;
    } catch (error) {
      logger.error({
        event: "EMAIL_TRANSPORTER_CONNECTION_FAILED",
        error: error.message,
      });

      throw new ApiError(
        500,
        "Unable to connect to email server."
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Send Email
  |--------------------------------------------------------------------------
  */
  async sendMail({
    to,
    subject,
    html,
    text = "",
    attachments = [],
    cc = [],
    bcc = [],
    replyTo,
  }) {
    try {
      const info = await this.transporter.sendMail({
        from: env.emailFrom,

        to,

        cc,

        bcc,

        replyTo,

        subject,

        text,

        html,

        attachments,
      });

      logger.info({
        event: "EMAIL_SENT",
        messageId: info.messageId,
        to,
        subject,
      });

      return {
        success: true,
        messageId: info.messageId,
        response: info.response,
      };
    } catch (error) {
      logger.error({
        event: "EMAIL_SEND_FAILED",
        to,
        subject,
        error: error.stack || error.message,
      });

      throw new ApiError(
        500,
        "Unable to send email."
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Get Transporter
  |--------------------------------------------------------------------------
  */
  getTransporter() {
    return this.transporter;
  }
}

export default new EmailTransporter();
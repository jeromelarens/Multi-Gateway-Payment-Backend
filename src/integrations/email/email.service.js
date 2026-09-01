import path from "path";
import fs from "fs/promises";

import logger from "../../config/logger.js";
import ApiError from "../../utils/ApiError.js";

import transporter from "./transporter.js";
import emailTemplate from "./emailTemplate.js";

class EmailService {
  /*
  |--------------------------------------------------------------------------
  | Payment Method Mapping
  |--------------------------------------------------------------------------
  */
  _mapPaymentMethod(method) {
    const mapping = {
      CARD: "Card",
      UPI: "UPI",
      WALLET: "Wallet",
      NETBANKING: "Net Banking",
    };

    return mapping[method] || method || "Unknown";
  }

  /*
  |--------------------------------------------------------------------------
  | Validate Recipient Email
  |--------------------------------------------------------------------------
  */
  _validateRecipient(email) {
    if (!email || typeof email !== "string") {
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  }

  /*
  |--------------------------------------------------------------------------
  | Validate Attachment Path
  |--------------------------------------------------------------------------
  */
  async _validateAttachment(filePath) {
    if (!filePath || typeof filePath !== "string") {
      return null;
    }

    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      return null;
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Core Send Method
  |--------------------------------------------------------------------------
  */
  async _send(options) {
    const {
      to,
      subject,
      html,
      attachments = [],
    } = options;

    if (!this._validateRecipient(to)) {
      throw new ApiError(400, "Invalid or missing recipient email address.");
    }

    try {
      const info = await transporter.sendMail({
        to: to.trim(),
        subject,
        html,
        attachments,
      });

      // ✅ Logging handled by transporter — no duplicate here

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      logger.error({
        event: "EMAIL_SEND_FAILED",
        to: to.trim(),
        subject,
        error: error.stack || error.message,
      });

      throw new ApiError(500, "Failed to send email.");
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Send Payment Success Email
  |--------------------------------------------------------------------------
  */
  async sendPaymentSuccessEmail(data) {
    const { user, order, payment } = data;

    if (!user?.email) {
      throw new ApiError(400, "User email is required.");
    }

    const html = emailTemplate.paymentSuccess({
      customerName: user.fullName,
      orderNumber: order?.orderNumber,
      amount: order?.amount,
      currency: order?.currency,
      paymentMethod: this._mapPaymentMethod(payment?.method),
      status: payment?.status,
    });

    const subject = `Payment Successful • Order #${order?.orderNumber || "N/A"}`;

    return this._send({
      to: user.email,
      subject,
      html,
    });
  }

  /*
  |--------------------------------------------------------------------------
  | Send Payment Failed Email
  |--------------------------------------------------------------------------
  */
  async sendPaymentFailedEmail(data) {
    const { user, order, payment } = data;

    if (!user?.email) {
      throw new ApiError(400, "User email is required.");
    }

    const html = emailTemplate.paymentFailed({
      customerName: user.fullName,
      orderNumber: order?.orderNumber,
      amount: order?.amount,
      currency: order?.currency,
      failureReason: payment?.failureReason,
      paymentIntentId: payment?.paymentIntentId,
    });

    const subject = `Payment Failed • Order #${order?.orderNumber || "N/A"}`;

    return this._send({
      to: user.email,
      subject,
      html,
    });
  }

  /*
  |--------------------------------------------------------------------------
  | Send Invoice Email
  |--------------------------------------------------------------------------
  */
  async sendInvoiceEmail(data) {
    const { user, order, payment, invoice } = data;

    if (!user?.email) {
      throw new ApiError(400, "User email is required.");
    }

    const html = emailTemplate.invoiceGenerated({
      customerName: user.fullName,
      invoiceNumber: invoice?.invoiceNumber,
      receiptNumber: invoice?.receiptNumber,
      orderNumber: order?.orderNumber,
      amount: order?.amount,
      currency: order?.currency,
      downloadUrl: invoice?.pdfUrl,
      issuedAt: invoice?.issuedAt,
    });

    const attachments = [];

    if (invoice?.pdfUrl) {
      const baseDir = path.resolve(process.cwd(), "storage/invoices");
      const fileName = path.basename(invoice.pdfUrl);
      const filePath = path.join(baseDir, fileName);

      const validatedPath = await this._validateAttachment(filePath);

      if (validatedPath) {
        attachments.push({
          filename: `Invoice-${invoice.invoiceNumber}.pdf`,
          path: validatedPath,
        });

        logger.info({
          event: "EMAIL_ATTACHMENT_ADDED",
          invoiceId: invoice.id,
          filePath: validatedPath,
        });
      } else {
        logger.warn({
          event: "EMAIL_ATTACHMENT_MISSING",
          invoiceId: invoice.id,
          pdfUrl: invoice.pdfUrl,
          attemptedPath: filePath,
        });
      }
    }

    const subject = `Invoice ${invoice?.invoiceNumber || ""}`;

    return this._send({
      to: user.email,
      subject,
      html,
      attachments,
    });
  }

  /*
  |--------------------------------------------------------------------------
  | Send Refund Email
  |--------------------------------------------------------------------------
  */
  async sendRefundEmail(data) {
    const { user, order, payment, refund } = data;

    if (!user?.email) {
      throw new ApiError(400, "User email is required.");
    }

    const html = emailTemplate.refundSuccess({
      customerName: user.fullName,
      refundId: refund?.stripeRefundId || refund?.id,
      refundNumber: refund?.refundNumber,
      orderNumber: order?.orderNumber,
      amount: refund?.amount,
      currency: order?.currency,
      reason: refund?.reason,
      paymentIntentId: payment?.paymentIntentId,
    });

    const subject = `Refund Successful • ${refund?.refundNumber || ""}`;

    return this._send({
      to: user.email,
      subject,
      html,
    });
  }
}

export default new EmailService();
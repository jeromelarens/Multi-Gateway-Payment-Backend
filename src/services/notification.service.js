import logger from "../config/logger.js";

import emailService from "../integrations/email/email.service.js";

class NotificationService {
  /*
  |--------------------------------------------------------------------------
  | Payment Success
  |--------------------------------------------------------------------------
  */
  async sendPaymentSuccess(data) {
    try {
      await emailService.sendPaymentSuccessEmail(data);

      logger.info({
        event: "PAYMENT_SUCCESS_NOTIFICATION_SENT",
        orderId: data?.order?.id,
        userId: data?.user?.id,
      });

      return true;
    } catch (error) {
      logger.error({
        event: "PAYMENT_SUCCESS_NOTIFICATION_FAILED",
        orderId: data?.order?.id,
        userId: data?.user?.id,
        error: error.stack || error.message,
      });

      return false;
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Payment Failed
  |--------------------------------------------------------------------------
  */
  async sendPaymentFailed(data) {
    try {
      await emailService.sendPaymentFailedEmail(data);

      logger.info({
        event: "PAYMENT_FAILED_NOTIFICATION_SENT",
        orderId: data?.order?.id,
        userId: data?.user?.id,
      });

      return true;
    } catch (error) {
      logger.error({
        event: "PAYMENT_FAILED_NOTIFICATION_FAILED",
        orderId: data?.order?.id,
        userId: data?.user?.id,
        error: error.stack || error.message,
      });

      return false;
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Invoice Generated
  |--------------------------------------------------------------------------
  */
  async sendInvoice(data) {
    try {
      await emailService.sendInvoiceEmail(data);

      logger.info({
        event: "INVOICE_NOTIFICATION_SENT",
        invoiceId: data?.invoice?.id,
        userId: data?.user?.id,
      });

      return true;
    } catch (error) {
      logger.error({
        event: "INVOICE_NOTIFICATION_FAILED",
        invoiceId: data?.invoice?.id,
        userId: data?.user?.id,
        error: error.stack || error.message,
      });

      return false;
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Refund Success
  |--------------------------------------------------------------------------
  */
  async sendRefundSuccess(data) {
    try {
      await emailService.sendRefundEmail(data);

      logger.info({
        event: "REFUND_NOTIFICATION_SENT",
        refundId: data?.refund?.id,
        userId: data?.user?.id,
      });

      return true;
    } catch (error) {
      logger.error({
        event: "REFUND_NOTIFICATION_FAILED",
        refundId: data?.refund?.id,
        userId: data?.user?.id,
        error: error.stack || error.message,
      });

      return false;
    }
  }
}

export default new NotificationService();
import crypto from "crypto";
import fs from "fs/promises";

import logger from "../config/logger.js";
import ApiError from "../utils/ApiError.js";

import invoiceRepository from "../repositories/invoice.repository.js";
import orderRepository from "../repositories/order.repository.js";
import invoicePdf from "../integrations/pdf/invoicePdf.js";

import notificationService from "./notification.service.js";

class InvoiceService {
  /*
  |--------------------------------------------------------------------------
  | Generate Invoice Number
  |--------------------------------------------------------------------------
  */
  _generateInvoiceNumber() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const random = String(crypto.randomInt(1000, 9999)).padStart(4, "0");

    return `INV-${year}${month}${day}-${random}`;
  }

  /*
  |--------------------------------------------------------------------------
  | Generate Receipt Number
  |--------------------------------------------------------------------------
  */
  _generateReceiptNumber() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const random = String(crypto.randomInt(1000, 9999)).padStart(4, "0");

    return `REC-${year}${month}${day}-${random}`;
  }

  /*
  |--------------------------------------------------------------------------
  | Create Invoice Record with Retry
  |--------------------------------------------------------------------------
  */
  async _createInvoiceRecord(orderId) {
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      const invoiceNumber = this._generateInvoiceNumber();
      const receiptNumber = this._generateReceiptNumber();

      try {
        const invoice = await invoiceRepository.create({
          invoiceNumber,
          receiptNumber,
          orderId,
        });

        return invoice;
      } catch (dbError) {
        if (
          dbError.code === "P2002" &&
          (dbError.meta?.target?.includes("invoiceNumber") ||
            dbError.meta?.target?.includes("receiptNumber"))
        ) {
          retryCount++;

          logger.warn({
            event: "INVOICE_NUMBER_COLLISION",
            invoiceNumber,
            receiptNumber,
            retryCount,
            maxRetries,
          });

          if (retryCount >= maxRetries) {
            logger.error({
              event: "INVOICE_NUMBER_COLLISION_MAX_RETRIES",
              error: dbError.message,
            });

            throw new ApiError(
              500,
              "Unable to generate unique invoice number after maximum retries."
            );
          }

          continue;
        }

        throw dbError;
      }
    }

    // ✅ Static analyzer safety — should never reach here
    throw new ApiError(500, "Unable to create invoice.");
  }

  /*
  |--------------------------------------------------------------------------
  | Generate PDF and Update Invoice
  |--------------------------------------------------------------------------
  */
  async _generateAndUpdatePdf(invoice, order, payment) {
    /*
    |--------------------------------------------------------------------------
    | Generate PDF
    |--------------------------------------------------------------------------
    */

    let pdfResult = null;

    try {
      pdfResult = await invoicePdf.generate({
        invoice,
        order,
        payment,
        user: order.user,
      });

      logger.info({
        event: "INVOICE_PDF_GENERATED",
        invoiceId: invoice.id,
        fileName: pdfResult.fileName,
        pdfUrl: pdfResult.pdfUrl,
      });
    } catch (pdfError) {
      logger.error({
        event: "INVOICE_PDF_GENERATION_FAILED",
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        error: pdfError.stack || pdfError.message,
      });

      throw new ApiError(500, "Unable to generate invoice PDF.");
    }

    /*
    |--------------------------------------------------------------------------
    | Update Invoice with PDF URL and Issued At
    |--------------------------------------------------------------------------
    */

    let updatedInvoice = null;

    try {
      updatedInvoice = await invoiceRepository.update(invoice.id, {
        pdfUrl: pdfResult.pdfUrl,
        issuedAt: new Date(),
      });

      logger.info({
        event: "INVOICE_UPDATED",
        invoiceId: updatedInvoice.id,
        pdfUrl: pdfResult.pdfUrl,
        issuedAt: updatedInvoice.issuedAt,
      });
    } catch (dbError) {
      // ✅ Safer cleanup: check filePath exists before unlinking
      if (pdfResult?.filePath) {
        try {
          await fs.unlink(pdfResult.filePath);
        } catch {
          // File may not exist — ignore
        }
      }

      logger.error({
        event: "INVOICE_UPDATE_FAILED",
        invoiceId: invoice.id,
        pdfUrl: pdfResult.pdfUrl,
        error: dbError.stack || dbError.message,
      });

      throw new ApiError(500, "Invoice PDF generated but database update failed.");
    }

    /*
    |--------------------------------------------------------------------------
    | Send Invoice Notification (Non-blocking)
    |--------------------------------------------------------------------------
    */

    if (updatedInvoice) {
      try {
        await notificationService.sendInvoice({
          user: order.user,
          order,
          payment,
          invoice: updatedInvoice,
        });

        logger.info({
          event: "INVOICE_NOTIFICATION_SENT",
          invoiceId: updatedInvoice.id,
          userId: order.user?.id,
        });
      } catch (error) {
        logger.error({
          event: "INVOICE_NOTIFICATION_ERROR",
          invoiceId: updatedInvoice.id,
          error: error.stack || error.message,
        });
      }
    }

    return {
      success: true,
      message: "Invoice created successfully.",
      invoice: updatedInvoice,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | Create Invoice
  |--------------------------------------------------------------------------
  */
  async createInvoice(data, authenticatedUserId = null, userRole = "USER") {
    const { orderId } = data;

    /*
    |--------------------------------------------------------------------------
    | Validate Order Exists
    |--------------------------------------------------------------------------
    */

    const order = await orderRepository.findById(orderId);

    if (!order) {
      throw new ApiError(404, "Order not found.");
    }

    // Ownership check: non-admins can only create invoices for their own orders
    if (authenticatedUserId && userRole !== "ADMIN" && order.userId !== authenticatedUserId) {
      throw ApiError.forbidden(
        "Access denied. You do not have permission to generate an invoice for this order.",
        [],
        "AUTHORIZATION_ERROR"
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Validate Payment Exists
    |--------------------------------------------------------------------------
    */

    if (!order.payment) {
      throw new ApiError(404, "Payment not found for this order.");
    }

    const payment = order.payment;

    /*
    |--------------------------------------------------------------------------
    | Validate Payment Status
    |--------------------------------------------------------------------------
    */

    if (payment.status !== "SUCCESS") {
      throw new ApiError(
        400,
        `Payment must be successful to generate an invoice. Current status: ${payment.status}`
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Check Existing Invoice
    |--------------------------------------------------------------------------
    */

    const existingInvoice = await invoiceRepository.findByOrderId(orderId);

    if (existingInvoice) {
      if (!existingInvoice.pdfUrl) {
        logger.info({
          event: "INVOICE_PDF_MISSING_REGENERATING",
          invoiceId: existingInvoice.id,
          orderId,
        });

        return this._generateAndUpdatePdf(existingInvoice, order, payment);
      }

      logger.info({
        event: "INVOICE_ALREADY_EXISTS",
        invoiceId: existingInvoice.id,
        orderId,
      });

      return {
        success: true,
        message: "Invoice already exists for this order.",
        invoice: existingInvoice,
      };
    }

    /*
    |--------------------------------------------------------------------------
    | Create Invoice Record (with retry on collision)
    |--------------------------------------------------------------------------
    */

    const invoice = await this._createInvoiceRecord(orderId);

    logger.info({
      event: "INVOICE_CREATED",
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      receiptNumber: invoice.receiptNumber,
      orderId,
    });

    /*
    |--------------------------------------------------------------------------
    | Generate PDF and Update
    |--------------------------------------------------------------------------
    */

    return this._generateAndUpdatePdf(invoice, order, payment);
  }

  /*
  |--------------------------------------------------------------------------
  | Get Invoice
  |--------------------------------------------------------------------------
  */
  async getInvoice(invoiceId, authenticatedUserId = null, userRole = "USER") {
    const invoice = await invoiceRepository.findById(invoiceId);

    if (!invoice) {
      throw new ApiError(404, "Invoice not found.");
    }

    // Ownership check: non-admins can only view their own invoices
    if (authenticatedUserId && userRole !== "ADMIN" && invoice.order?.userId !== authenticatedUserId) {
      throw ApiError.forbidden(
        "Access denied. You do not have permission to view this invoice.",
        [],
        "AUTHORIZATION_ERROR"
      );
    }

    return invoice;
  }

  /*
  |--------------------------------------------------------------------------
  | Get Order Invoice
  |--------------------------------------------------------------------------
  */
  async getOrderInvoice(orderId, authenticatedUserId = null, userRole = "USER") {
    const order = await orderRepository.findById(orderId);

    if (!order) {
      throw new ApiError(404, "Order not found.");
    }

    // Ownership check: non-admins can only view invoices for their own orders
    if (authenticatedUserId && userRole !== "ADMIN" && order.userId !== authenticatedUserId) {
      throw ApiError.forbidden(
        "Access denied. You do not have permission to view the invoice for this order.",
        [],
        "AUTHORIZATION_ERROR"
      );
    }

    const invoice = await invoiceRepository.findByOrderId(orderId);

    if (!invoice) {
      throw new ApiError(404, "Invoice not found for this order.");
    }

    return invoice;
  }

  /*
  |--------------------------------------------------------------------------
  | Get All Invoices
  |--------------------------------------------------------------------------
  */
  async getAllInvoices(authenticatedUserId = null, userRole = "USER") {
    if (userRole !== "ADMIN") {
      throw ApiError.forbidden(
        "Access denied. Only administrators can view all invoices.",
        [],
        "AUTHORIZATION_ERROR"
      );
    }
    return invoiceRepository.findAll();
  }
}

export default new InvoiceService();
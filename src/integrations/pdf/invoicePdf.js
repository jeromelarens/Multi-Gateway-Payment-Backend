import fs from "fs/promises";
import { createWriteStream } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import PDFDocument from "pdfkit";

import company from "../../config/company.js";
// ✅ FIX 1: Missing logger import
import logger from "../../config/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE_DIR = path.join(__dirname, "../../../storage/invoices");

class InvoicePdf {
  async generate({ invoice, order, payment, user }) {
    let doc = null;
    let writeStream = null;
    let fileName = null;
    let filePath = null;

    try {
      await this._ensureDirectoryExists(STORAGE_DIR);

      fileName = `${invoice.invoiceNumber}.pdf`;
      filePath = path.join(STORAGE_DIR, fileName);
      const pdfUrl = `/invoices/${fileName}`;

      doc = new PDFDocument({ margin: 50 });
      writeStream = createWriteStream(filePath);

      doc.pipe(writeStream);

      this._renderHeader(doc);
      this._renderDivider(doc);
      this._renderInvoiceInfo(doc, invoice);
      this._renderDivider(doc);
      this._renderCustomerDetails(doc, user);
      this._renderDivider(doc);
      this._renderOrderDetails(doc, order);
      this._renderDivider(doc);
      this._renderPaymentDetails(doc, payment);
      this._renderDivider(doc);
      this._renderAmountSummary(doc, order);
      this._renderDivider(doc);
      this._renderTerms(doc);
      this._renderFooter(doc);

      doc.end();

      await this._waitForStream(writeStream);

      return {
        success: true,
        fileName,
        filePath,
        pdfUrl,
      };
    } catch (error) {
      if (writeStream && !writeStream.destroyed) {
        writeStream.destroy();
      }

      // ✅ FIX 2: Delete corrupted PDF if exists
      if (filePath) {
        try {
          await fs.unlink(filePath);
        } catch (unlinkError) {
          // File may not exist — ignore
        }
      }

      logger.error({
        event: "INVOICE_PDF_GENERATION_FAILED",
        invoiceNumber: invoice?.invoiceNumber || "unknown",
        error: error.stack || error.message,
      });

      throw new Error(`Invoice PDF generation failed: ${error.message}`);
    }
  }

  async _ensureDirectoryExists(dirPath) {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  _waitForStream(stream) {
    return new Promise((resolve, reject) => {
      stream.on("finish", resolve);
      stream.on("error", reject);
    });
  }

  _renderHeader(doc) {
    if (company.logo) {
      try {
        doc.image(company.logo, 50, 45, { width: 80 });
        doc.moveDown(2);
      } catch {
        doc.fontSize(10).font("Helvetica-Oblique").text("[Logo]", 50, 50);
      }
    }

    doc.fontSize(20).font("Helvetica-Bold").text(company.name, 50, doc.y);
    doc.fontSize(10).font("Helvetica");

    const addressLines = [
      company.legalName,
      `${company.address}, ${company.city}, ${company.state} - ${company.pincode}`,
      `${company.country}`,
      `Phone: ${company.phone}`,
      `Email: ${company.email}`,
      `Website: ${company.website}`,
    ];

    if (company.gstNumber) {
      addressLines.push(`GST: ${company.gstNumber}`);
    }
    if (company.panNumber) {
      addressLines.push(`PAN: ${company.panNumber}`);
    }
    if (company.cinNumber) {
      addressLines.push(`CIN: ${company.cinNumber}`);
    }

    addressLines.forEach((line) => {
      doc.text(line);
    });

    doc.moveDown(2);
  }

  _renderDivider(doc) {
    doc
      .moveDown(0.5)
      .lineWidth(0.5)
      .moveTo(50, doc.y)
      .lineTo(550, doc.y)
      .stroke()
      .moveDown(0.5);
  }

  _renderInvoiceInfo(doc, invoice) {
    doc.fontSize(16).font("Helvetica-Bold").text("INVOICE", { align: "center" });
    doc.moveDown(0.5);

    doc.fontSize(10).font("Helvetica");

    const issueDate = invoice.issuedAt
      ? new Date(invoice.issuedAt).toLocaleDateString("en-IN", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : new Date().toLocaleDateString("en-IN", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });

    const infoLines = [
      `Invoice Number: ${invoice.invoiceNumber}`,
    ];

    if (invoice.receiptNumber) {
      infoLines.push(`Receipt Number: ${invoice.receiptNumber}`);
    }

    infoLines.push(`Issue Date: ${issueDate}`);

    infoLines.forEach((line) => {
      doc.text(line);
    });

    doc.moveDown(0.5);
  }

  _renderCustomerDetails(doc, user) {
    doc.fontSize(12).font("Helvetica-Bold").text("Customer Details");
    doc.moveDown(0.3);

    doc.fontSize(10).font("Helvetica");

    const customerLines = [
      `Name: ${user.fullName || "N/A"}`,
      `Email: ${user.email || "N/A"}`,
    ];

    if (user.phone) {
      customerLines.push(`Phone: ${user.phone}`);
    }

    customerLines.forEach((line) => {
      doc.text(line);
    });

    doc.moveDown(0.5);
  }

  _renderOrderDetails(doc, order) {
    doc.fontSize(12).font("Helvetica-Bold").text("Order Details");
    doc.moveDown(0.3);

    doc.fontSize(10).font("Helvetica");

    const amount = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: order.currency || company.currency,
    }).format(Number(order.amount));

    const orderLines = [
      `Order Number: ${order.orderNumber}`,
      `Currency: ${order.currency || company.currency}`,
      `Amount: ${amount}`,
    ];

    orderLines.forEach((line) => {
      doc.text(line);
    });

    doc.moveDown(0.5);
  }

  _renderPaymentDetails(doc, payment) {
    doc.fontSize(12).font("Helvetica-Bold").text("Payment Details");
    doc.moveDown(0.3);

    doc.fontSize(10).font("Helvetica");

    const paymentLines = [
      `Payment Intent: ${payment.paymentIntentId || "N/A"}`,
      `Charge ID: ${payment.stripeChargeId || "N/A"}`,
      `Gateway Transaction ID: ${payment.gatewayTransactionId || "N/A"}`,
      `Payment Method: ${payment.paymentMethodId || "N/A"}`,
      `Payment Status: ${payment.status || "N/A"}`,
    ];

    paymentLines.forEach((line) => {
      doc.text(line);
    });

    doc.moveDown(0.5);
  }

  _renderAmountSummary(doc, order) {
    doc.fontSize(12).font("Helvetica-Bold").text("Amount Summary");
    doc.moveDown(0.3);

    doc.fontSize(10).font("Helvetica");

    const amount = Number(order.amount);
    const taxRate = company.gstRate ? company.gstRate / 100 : 0.18;
    // ✅ FIX 4: Round to 2 decimal places to avoid floating point errors
    const subtotal = Number((amount / (1 + taxRate)).toFixed(2));
    const tax = Number((amount - subtotal).toFixed(2));

    const currency = order.currency || company.currency;

    const formatAmount = (value) => {
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency,
      }).format(value);
    };

    const summaryLines = [
      `Subtotal: ${formatAmount(subtotal)}`,
      `Tax (${company.gstRate || 18}% GST): ${formatAmount(tax)}`,
      `Total: ${formatAmount(amount)}`,
    ];

    summaryLines.forEach((line) => {
      doc.text(line);
    });

    doc.moveDown(0.5);
  }

  _renderTerms(doc) {
    doc.fontSize(12).font("Helvetica-Bold").text("Terms & Conditions");
    doc.moveDown(0.3);

    doc.fontSize(9).font("Helvetica");

    if (company.terms && Array.isArray(company.terms) && company.terms.length > 0) {
      company.terms.forEach((term, index) => {
        if (doc.y > 700) {
          doc.addPage();
          // ✅ FIX 3: Add padding after new page
          doc.moveDown();
        }
        doc.text(`${index + 1}. ${term}`);
      });
    } else {
      doc.text("Standard terms and conditions apply.");
    }

    doc.moveDown(0.5);
  }

  _renderFooter(doc) {
    doc.fontSize(8).font("Helvetica-Oblique").text(company.footer || "", {
      align: "center",
    });

    doc.moveDown(0.3);

    if (company.supportEmail || company.supportPhone) {
      const supportLines = [];
      if (company.supportEmail) {
        supportLines.push(`Support Email: ${company.supportEmail}`);
      }
      if (company.supportPhone) {
        supportLines.push(`Support Phone: ${company.supportPhone}`);
      }

      doc.fontSize(8).font("Helvetica");

      supportLines.forEach((line) => {
        doc.text(line, { align: "center" });
      });
    }
  }
}

export default new InvoicePdf();
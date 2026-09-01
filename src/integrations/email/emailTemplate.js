import company from "../../config/company.js";

class EmailTemplate {
  /*
  |--------------------------------------------------------------------------
  | Common Layout
  |--------------------------------------------------------------------------
  */
  _layout(title, content) {
    const year = new Date().getFullYear();
    const companyName = company.name || "Payment Integration";
    const supportEmail = company.supportEmail || "";
    const supportPhone = (company.supportPhone || "").replace(/\s/g, "");

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.08);overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a56db 0%,#3b82f6 100%);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:600;letter-spacing:0.5px;">${companyName}</h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:40px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc;padding:24px 40px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="margin:0 0 8px 0;color:#64748b;font-size:13px;line-height:1.5;">
                Need help? Contact us at
                ${supportEmail ? `<a href="mailto:${supportEmail}" style="color:#1a56db;text-decoration:none;font-weight:500;">${supportEmail}</a>` : ""}
                ${supportEmail && supportPhone ? " or " : ""}
                ${supportPhone ? `<a href="tel:${supportPhone}" style="color:#1a56db;text-decoration:none;font-weight:500;">${company.supportPhone}</a>` : ""}
              </p>
              <p style="margin:0;color:#94a3b8;font-size:12px;">
                &copy; ${year} ${companyName}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  }

  /*
  |--------------------------------------------------------------------------
  | Helper: Format Currency
  |--------------------------------------------------------------------------
  */
  _formatCurrency(amount, currency) {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || company.currency || "INR",
    }).format(Number(amount));
  }

  /*
  |--------------------------------------------------------------------------
  | Helper: Status Badge
  |--------------------------------------------------------------------------
  */
  _statusBadge(text, color) {
    const colors = {
      green: { bg: "#dcfce7", text: "#166534", border: "#bbf7d0" },
      red: { bg: "#fee2e2", text: "#991b1b", border: "#fecaca" },
      blue: { bg: "#dbeafe", text: "#1e40af", border: "#bfdbfe" },
      amber: { bg: "#fef3c7", text: "#92400e", border: "#fde68a" },
    };

    const c = colors[color] || colors.blue;

    return `
      <span style="display:inline-block;padding:6px 16px;background-color:${c.bg};color:${c.text};border:1px solid ${c.border};border-radius:9999px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">
        ${text}
      </span>
    `;
  }

  /*
  |--------------------------------------------------------------------------
  | Helper: Detail Row
  |--------------------------------------------------------------------------
  */
  _detailRow(label, value) {
    return `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:14px;width:40%;vertical-align:top;">${label}</td>
        <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#0f172a;font-size:14px;font-weight:500;width:60%;vertical-align:top;word-break:break-word;">${value}</td>
      </tr>
    `;
  }

  /*
  |--------------------------------------------------------------------------
  | Helper: CTA Button
  |--------------------------------------------------------------------------
  */
  _ctaButton(text, url) {
    return `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;">
        <tr>
          <td style="border-radius:6px;background:linear-gradient(135deg,#1a56db 0%,#3b82f6 100%);text-align:center;">
            <a href="${url}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 32px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:6px;">
              ${text}
            </a>
          </td>
        </tr>
      </table>
    `;
  }

  /*
  |--------------------------------------------------------------------------
  | Payment Success
  |--------------------------------------------------------------------------
  */
  paymentSuccess(data) {
    const {
      customerName,
      orderNumber,
      amount,
      currency,
      paymentMethod,
      status,
    } = data;

    const content = `
      <div style="text-align:center;margin-bottom:32px;">
        <div style="margin-bottom:16px;">${this._statusBadge("Payment Successful", "green")}</div>
        <h2 style="margin:0 0 8px 0;color:#0f172a;font-size:22px;font-weight:600;">Thank You, ${customerName || "Customer"}!</h2>
        <p style="margin:0;color:#64748b;font-size:15px;line-height:1.6;">Your payment has been processed successfully.</p>
      </div>

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px;">
        ${this._detailRow("Customer", customerName || "N/A")}
        ${this._detailRow("Amount", this._formatCurrency(amount, currency))}
        ${this._detailRow("Order Number", orderNumber || "N/A")}
        ${this._detailRow("Payment Method", paymentMethod || "N/A")}
        ${this._detailRow("Payment Status", this._statusBadge(status || "SUCCESS", "green"))}
      </table>

      <p style="margin:24px 0 0 0;color:#64748b;font-size:14px;line-height:1.6;text-align:center;">
        A confirmation receipt has been sent to your registered email. If you have any questions, please contact our support team.
      </p>
    `;

    return this._layout("Payment Successful", content);
  }

  /*
  |--------------------------------------------------------------------------
  | Payment Failed
  |--------------------------------------------------------------------------
  */
  paymentFailed(data) {
    const {
      customerName,
      orderNumber,
      amount,
      currency,
      failureReason,
      paymentIntentId,
    } = data;

    const content = `
      <div style="text-align:center;margin-bottom:32px;">
        <div style="margin-bottom:16px;">${this._statusBadge("Payment Failed", "red")}</div>
        <h2 style="margin:0 0 8px 0;color:#0f172a;font-size:22px;font-weight:600;">Payment Unsuccessful</h2>
        <p style="margin:0;color:#64748b;font-size:15px;line-height:1.6;">We were unable to process your payment. Please review the details below.</p>
      </div>

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px;">
        ${this._detailRow("Customer", customerName || "N/A")}
        ${this._detailRow("Order Number", orderNumber || "N/A")}
        ${this._detailRow("Amount", this._formatCurrency(amount, currency))}
        ${this._detailRow("Payment Intent", paymentIntentId || "N/A")}
        ${this._detailRow("Failure Reason", failureReason || "Unknown payment failure")}
      </table>

      <div style="margin-top:24px;padding:16px;background-color:#fef2f2;border:1px solid #fecaca;border-radius:6px;">
        <p style="margin:0;color:#991b1b;font-size:14px;line-height:1.6;text-align:center;font-weight:500;">
          Please check your payment details and try again. If the issue persists, contact our support team for assistance.
        </p>
      </div>
    `;

    return this._layout("Payment Failed", content);
  }

  /*
  |--------------------------------------------------------------------------
  | Invoice Generated
  |--------------------------------------------------------------------------
  */
  invoiceGenerated(data) {
    const {
      customerName,
      invoiceNumber,
      receiptNumber,
      orderNumber,
      amount,
      currency,
      downloadUrl,
      issuedAt,
    } = data;

    const issueDate = issuedAt
      ? new Date(issuedAt).toLocaleDateString("en-IN", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : new Date().toLocaleDateString("en-IN", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });

    const content = `
      <div style="text-align:center;margin-bottom:32px;">
        <div style="margin-bottom:16px;">${this._statusBadge("Invoice Generated", "blue")}</div>
        <h2 style="margin:0 0 8px 0;color:#0f172a;font-size:22px;font-weight:600;">Your Invoice is Ready</h2>
        <p style="margin:0;color:#64748b;font-size:15px;line-height:1.6;">Thank you for your business, ${customerName || "Customer"}.</p>
      </div>

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px;">
        ${this._detailRow("Invoice Number", invoiceNumber || "N/A")}
        ${this._detailRow("Receipt Number", receiptNumber || "N/A")}
        ${this._detailRow("Order Number", orderNumber || "N/A")}
        ${this._detailRow("Issue Date", issueDate)}
        ${this._detailRow("Amount", this._formatCurrency(amount, currency))}
      </table>

      ${downloadUrl ? this._ctaButton("Download Invoice", downloadUrl) : ""}

      <p style="margin:16px 0 0 0;color:#64748b;font-size:14px;line-height:1.6;text-align:center;">
        Please keep this invoice for your records. For any queries, reach out to our support team.
      </p>
    `;

    return this._layout("Invoice Generated", content);
  }

  /*
  |--------------------------------------------------------------------------
  | Refund Success
  |--------------------------------------------------------------------------
  */
  refundSuccess(data) {
    const {
      customerName,
      refundId,
      refundNumber,
      orderNumber,
      amount,
      currency,
      reason,
      paymentIntentId,
    } = data;

    const content = `
      <div style="text-align:center;margin-bottom:32px;">
        <div style="margin-bottom:16px;">${this._statusBadge("Refund Successful", "amber")}</div>
        <h2 style="margin:0 0 8px 0;color:#0f172a;font-size:22px;font-weight:600;">Refund Successful</h2>
        <p style="margin:0;color:#64748b;font-size:15px;line-height:1.6;">Hi ${customerName || "Customer"}, your refund has been initiated successfully.</p>
      </div>

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px;">
        ${this._detailRow("Refund ID", refundId || "N/A")}
        ${this._detailRow("Refund Number", refundNumber || "N/A")}
        ${this._detailRow("Order Number", orderNumber || "N/A")}
        ${this._detailRow("Payment Intent", paymentIntentId || "N/A")}
        ${this._detailRow("Refund Amount", this._formatCurrency(amount, currency))}
        ${this._detailRow("Reason", reason || "N/A")}
      </table>

      <div style="margin-top:24px;padding:16px;background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;">
        <p style="margin:0;color:#166534;font-size:14px;line-height:1.6;text-align:center;font-weight:500;">
          The refunded amount will be credited to your original payment method within 5–10 business days.
        </p>
      </div>

      <p style="margin:16px 0 0 0;color:#64748b;font-size:14px;line-height:1.6;text-align:center;">
        If you do not see the refund in your account after 10 business days, please contact our support team.
      </p>
    `;

    return this._layout("Refund Successful", content);
  }
}

export default new EmailTemplate();
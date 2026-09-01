import invoiceService from "../services/invoice.service.js";

class InvoiceController {
  /*
  |--------------------------------------------------------------------------
  | Create Invoice
  |--------------------------------------------------------------------------
  */
  async createInvoice(req, res, next) {
    try {
      const currentUserId = req.user?.id || null;
      const userRole = req.user?.role || "USER";
      const result = await invoiceService.createInvoice(req.validatedData, currentUserId, userRole);

      return res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Get Invoice By ID
  |--------------------------------------------------------------------------
  */
  async getInvoice(req, res, next) {
    try {
      const { invoiceId } = req.params;
      const currentUserId = req.user?.id || null;
      const userRole = req.user?.role || "USER";

      const invoice = await invoiceService.getInvoice(invoiceId, currentUserId, userRole);

      return res.status(200).json({
        success: true,
        invoice,
      });
    } catch (error) {
      next(error);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Get Invoice By Order ID
  |--------------------------------------------------------------------------
  */
  async getOrderInvoice(req, res, next) {
    try {
      const { orderId } = req.params;
      const currentUserId = req.user?.id || null;
      const userRole = req.user?.role || "USER";

      const invoice = await invoiceService.getOrderInvoice(orderId, currentUserId, userRole);

      return res.status(200).json({
        success: true,
        invoice,
      });
    } catch (error) {
      next(error);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Get All Invoices
  |--------------------------------------------------------------------------
  */
  async getAllInvoices(req, res, next) {
    try {
      const currentUserId = req.user?.id || null;
      const userRole = req.user?.role || "USER";

      const invoices = await invoiceService.getAllInvoices(currentUserId, userRole);

      return res.status(200).json({
        success: true,
        count: invoices.length,
        invoices,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new InvoiceController();
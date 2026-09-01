import refundService from "../services/refund.service.js";

class RefundController {
  /*
  |--------------------------------------------------------------------------
  | Create Refund
  |--------------------------------------------------------------------------
  */
  async createRefund(req, res, next) {
    try {
      const currentUserId = req.user?.id || null;
      const userRole = req.user?.role || "USER";
      const refund = await refundService.createRefund(req.validatedData, currentUserId, userRole);

      return res.status(201).json(refund);
    } catch (error) {
      next(error);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Get Refund By ID
  |--------------------------------------------------------------------------
  */
  async getRefund(req, res, next) {
    try {
      const { refundId } = req.params;
      const currentUserId = req.user?.id || null;
      const userRole = req.user?.role || "USER";

      const refund = await refundService.getRefund(refundId, currentUserId, userRole);

      return res.status(200).json({
        success: true,
        refund,
      });
    } catch (error) {
      next(error);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Get Refunds By Payment ID
  |--------------------------------------------------------------------------
  */
  async getPaymentRefunds(req, res, next) {
    try {
      const { paymentId } = req.params;
      const currentUserId = req.user?.id || null;
      const userRole = req.user?.role || "USER";

      const refunds = await refundService.getPaymentRefunds(paymentId, currentUserId, userRole);

      return res.status(200).json({
        success: true,
        count: refunds.length,
        refunds,
      });
    } catch (error) {
      next(error);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Get All Refunds
  |--------------------------------------------------------------------------
  */
  async getAllRefunds(req, res, next) {
    try {
      const currentUserId = req.user?.id || null;
      const userRole = req.user?.role || "USER";

      const refunds = await refundService.getAllRefunds(currentUserId, userRole);

      return res.status(200).json({
        success: true,
        count: refunds.length,
        refunds,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new RefundController();
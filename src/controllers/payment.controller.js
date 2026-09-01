import paymentService from "../services/payment.service.js";
import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/apiResponse.js";
import ApiError from "../utils/ApiError.js";

class PaymentController {
  /**
   * Unified Payment Creation (v1)
   * POST /api/v1/payments
   */
  createPayment = asyncHandler(async (req, res) => {
    // Derive user ID strictly from authenticated context to prevent spoofing
    const userId = req.user.id;

    const paymentData = {
      ...req.validatedData,
      userId,
    };

    const result = await paymentService.createPayment(paymentData);

    return ApiResponse.success(
      res,
      "Payment initialized successfully.",
      result,
      201
    );
  });

  /**
   * Get Payment by ID
   * GET /api/v1/payments/:paymentId
   */
  getPayment = asyncHandler(async (req, res) => {
    const { paymentId } = req.params;
    const currentUserId = req.user?.id || null;
    const userRole = req.user?.role || "USER";

    const payment = await paymentService.getPayment(
      paymentId,
      currentUserId,
      userRole
    );

    return ApiResponse.success(
      res,
      "Payment retrieved successfully.",
      payment,
      200
    );
  });

  /**
   * Get Payment History for the Authenticated User
   * GET /api/v1/payments/history
   */
  getPaymentHistory = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;

    const result = await paymentService.getUserPayments(userId, {
      page,
      limit,
    });

    return ApiResponse.success(
      res,
      "Payment history retrieved successfully.",
      result,
      200
    );
  });

  /**
   * Legacy: Create Order
   * POST /api/payment/create-order
   */
  createOrder = asyncHandler(async (req, res) => {
    const userId = req.user?.id || req.validatedData.userId;

    if (!userId) {
      throw ApiError.badRequest("User ID is required.", [], "VALIDATION_ERROR");
    }

    const result = await paymentService.createPayment({
      ...req.validatedData,
      userId,
    });

    return ApiResponse.success(
      res,
      "Order created successfully.",
      result,
      201
    );
  });

  /**
   * Legacy: Get User Payments
   * GET /api/payment/history/:userId
   */
  getUserPayments = asyncHandler(async (req, res) => {
    const { userId } = req.params;

    // If authenticated, enforce ownership on legacy endpoint as well
    if (req.user && req.user.role !== "ADMIN" && req.user.id !== userId) {
      throw ApiError.forbidden(
        "Access denied. You cannot view payment history for another user.",
        [],
        "AUTHORIZATION_ERROR"
      );
    }

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;

    const result = await paymentService.getUserPayments(userId, { page, limit });

    return ApiResponse.success(
      res,
      "Payments fetched successfully.",
      result,
      200
    );
  });
}

export default new PaymentController();
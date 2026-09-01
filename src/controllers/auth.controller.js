import authService from "../services/auth.service.js";
import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/apiResponse.js";

class AuthController {
  register = asyncHandler(async (req, res) => {
    const result = await authService.register(req.validatedData);

    return ApiResponse.success(
      res,
      "User registered successfully.",
      result,
      201
    );
  });

  login = asyncHandler(async (req, res) => {
    const result = await authService.login(req.validatedData);

    return ApiResponse.success(
      res,
      "Logged in successfully.",
      result,
      200
    );
  });

  getMe = asyncHandler(async (req, res) => {
    const user = await authService.getMe(req.user.id);

    return ApiResponse.success(
      res,
      "User profile retrieved successfully.",
      { user },
      200
    );
  });
}

export default new AuthController();

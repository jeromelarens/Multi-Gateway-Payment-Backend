import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import env from "../config/env.js";
import ApiError from "../utils/ApiError.js";
import userRepository from "../repositories/user.repository.js";
import logger from "../config/logger.js";

const SALT_ROUNDS = 12;

class AuthService {
  /**
   * Safely sanitize user object to prevent returning sensitive fields
   */
  _toSafeUser(user) {
    const { password, ...safeUser } = user;
    return safeUser;
  }

  /**
   * Generate signed JWT
   */
  _generateToken(user) {
    return jwt.sign(
      {
        sub: user.id,
        role: user.role,
      },
      env.jwtSecret,
      {
        expiresIn: env.jwtExpiresIn,
      }
    );
  }

  /**
   * Register a new user
   */
  async register(data) {
    const { fullName, email, password, phone } = data;
    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await userRepository.findByEmail(normalizedEmail);
    if (existingUser) {
      throw ApiError.conflict(
        "A user with this email address already exists.",
        [],
        "DUPLICATE_RESOURCE"
      );
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await userRepository.create({
      fullName: fullName.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      phone: phone ? phone.trim() : null,
      role: "USER",
    });

    logger.info({
      event: "USER_REGISTERED",
      userId: user.id,
      email: user.email,
    });

    const token = this._generateToken(user);
    const safeUser = this._toSafeUser(user);

    return {
      user: safeUser,
      token,
    };
  }

  /**
   * Authenticate user and issue JWT
   */
  async login(data) {
    const { email, password } = data;
    const normalizedEmail = email.trim().toLowerCase();

    const user = await userRepository.findByEmail(normalizedEmail);

    // Timing-attack mitigation: always perform a hash check even if user doesn't exist
    if (!user || !user.password) {
      await bcrypt.compare(
        password,
        "$2a$12$e868d4444444444444444.4444444444444444444444444444444"
      );
      throw ApiError.unauthorized(
        "Invalid email or password.",
        [],
        "AUTHENTICATION_ERROR"
      );
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw ApiError.unauthorized(
        "Invalid email or password.",
        [],
        "AUTHENTICATION_ERROR"
      );
    }

    logger.info({
      event: "USER_LOGGED_IN",
      userId: user.id,
      email: user.email,
    });

    const token = this._generateToken(user);
    const safeUser = this._toSafeUser(user);

    return {
      user: safeUser,
      token,
    };
  }

  /**
   * Get user profile by ID
   */
  async getMe(userId) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw ApiError.notFound("User not found.", [], "RESOURCE_NOT_FOUND");
    }

    return this._toSafeUser(user);
  }
}

export default new AuthService();

import auditRepository from "../repositories/audit.repository.js";
import logger from "../config/logger.js";

class AuditService {
  async log({
    actorUserId = null,
    action,
    entityType,
    entityId = null,
    requestId = null,
    ipAddress = null,
    userAgent = null,
    metadata = {},
    tx = null,
  }) {
    try {
      // Strip any accidental sensitive credentials before persisting
      const safeMetadata = { ...metadata };
      delete safeMetadata.password;
      delete safeMetadata.token;
      delete safeMetadata.secretKey;
      delete safeMetadata.webhookSecret;

      const record = await auditRepository.create(
        {
          actorUserId,
          action,
          entityType,
          entityId,
          requestId,
          ipAddress,
          userAgent,
          metadata: safeMetadata,
        },
        tx
      );

      logger.info({
        event: "AUDIT_LOG_ENTRY",
        action,
        entityType,
        entityId,
        actorUserId,
      });

      return record;
    } catch (error) {
      logger.error({
        event: "AUDIT_LOG_FAILED",
        action,
        error: error.message,
      });
      return null;
    }
  }

  async getAuditLogs(filter = {}) {
    const { page = 1, limit = 50, entityType, action, actorUserId } = filter;
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      auditRepository.findAll({ skip, take: limit, entityType, action, actorUserId }),
      auditRepository.countAll({ entityType, action, actorUserId }),
    ]);

    return {
      logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }
}

export default new AuditService();

import prisma from "../config/prisma.js";

class AuditRepository {
  async create(data, tx = null) {
    const db = tx || prisma;
    return db.auditLog.create({
      data,
    });
  }

  async findAll({ skip = 0, take = 50, entityType = null, action = null, actorUserId = null } = {}, tx = null) {
    const db = tx || prisma;
    const where = {};
    if (entityType) where.entityType = entityType;
    if (action) where.action = action;
    if (actorUserId) where.actorUserId = actorUserId;

    return db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        actor: { select: { id: true, email: true, fullName: true, role: true } },
      },
    });
  }

  async countAll({ entityType = null, action = null, actorUserId = null } = {}, tx = null) {
    const db = tx || prisma;
    const where = {};
    if (entityType) where.entityType = entityType;
    if (action) where.action = action;
    if (actorUserId) where.actorUserId = actorUserId;

    return db.auditLog.count({ where });
  }
}

export default new AuditRepository();

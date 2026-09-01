import prisma from "../config/prisma.js";

class WebhookRepository {
  async create(data) {
    try {
      return await prisma.webhookEvent.create({
        data,
      });
    } catch (error) {
      if (error?.code === "P2002") {
        return await this.findByGatewayAndEventId(data.gateway, data.eventId);
      }
      throw error;
    }
  }

  async findById(id) {
    return prisma.webhookEvent.findUnique({
      where: { id },
    });
  }

  async findByGatewayAndEventId(gateway, eventId) {
    return prisma.webhookEvent.findUnique({
      where: {
        gateway_eventId: {
          gateway,
          eventId,
        },
      },
    });
  }

  async findByEventId(eventId) {
    return prisma.webhookEvent.findFirst({
      where: { eventId },
    });
  }

  async updateStatus(id, status, extra = {}) {
    return prisma.webhookEvent.update({
      where: { id },
      data: {
        status,
        ...extra,
      },
    });
  }

  async findUnprocessedEvents() {
    return prisma.webhookEvent.findMany({
      where: {
        status: { in: ["RECEIVED", "RETRYING"] },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async markProcessed(id) {
    return prisma.webhookEvent.update({
      where: { id },
      data: {
        status: "PROCESSED",
        processed: true,
        processedAt: new Date(),
        errorMessage: null,
      },
    });
  }

  async update(id, data) {
    return prisma.webhookEvent.update({
      where: { id },
      data,
    });
  }

  async findAll({ skip = 0, take = 50, status = null, gateway = null } = {}) {
    const where = {};
    if (status) where.status = status;
    if (gateway) where.gateway = gateway;

    return prisma.webhookEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    });
  }

  async delete(id) {
    return prisma.webhookEvent.delete({
      where: { id },
    });
  }
}

export default new WebhookRepository();
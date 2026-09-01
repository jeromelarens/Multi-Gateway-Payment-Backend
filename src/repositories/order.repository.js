import prisma from "../config/prisma.js";

class OrderRepository {
  async create(data) {
    return prisma.order.create({
      data,
    });
  }

  async findById(id) {
    return prisma.order.findUnique({
      where: {
        id,
      },
      include: {
        user: true,
        payment: true,
        invoice: true,
      },
    });
  }

  async findByOrderNumber(orderNumber) {
    return prisma.order.findUnique({
      where: {
        orderNumber,
      },
      include: {
        user: true,
        payment: true,
        invoice: true,
      },
    });
  }

  async findUserOrders(userId) {
    return prisma.order.findMany({
      where: {
        userId,
      },
      include: {
        payment: true,
        invoice: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  async findPendingOrders() {
    return prisma.order.findMany({
      where: {
        status: "PENDING",
      },
      include: {
        user: true,
        payment: true,
        invoice: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });
  }

  async findAll() {
    return prisma.order.findMany({
      include: {
        user: true,
        payment: true,
        invoice: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  async update(id, data) {
    return prisma.order.update({
      where: {
        id,
      },
      data,
    });
  }

  async updateStatus(id, status) {
    return prisma.order.update({
      where: {
        id,
      },
      data: {
        status,
      },
    });
  }

  async updateByOrderNumber(orderNumber, data) {
    return prisma.order.update({
      where: {
        orderNumber,
      },
      data,
    });
  }

  async delete(id) {
    return prisma.order.delete({
      where: {
        id,
      },
    });
  }
}

export default new OrderRepository();
import prisma from "../config/prisma.js";

class InvoiceRepository {
  async create(data) {
    return prisma.invoice.create({
      data,
    });
  }

  async findById(id) {
    return prisma.invoice.findUnique({
      where: {
        id,
      },
      include: {
        order: {
          include: {
            user: true,
            payment: true,
          },
        },
      },
    });
  }

  async findByOrderId(orderId) {
    return prisma.invoice.findUnique({
      where: {
        orderId,
      },
      include: {
        order: {
          include: {
            user: true,
            payment: true,
          },
        },
      },
    });
  }

  async findByInvoiceNumber(invoiceNumber) {
    return prisma.invoice.findUnique({
      where: {
        invoiceNumber,
      },
    });
  }

  async update(id, data) {
    return prisma.invoice.update({
      where: {
        id,
      },
      data,
    });
  }

  async findAll() {
    return prisma.invoice.findMany({
      include: {
        order: {
          include: {
            user: true,
            payment: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  async delete(id) {
    return prisma.invoice.delete({
      where: {
        id,
      },
    });
  }
}

export default new InvoiceRepository();
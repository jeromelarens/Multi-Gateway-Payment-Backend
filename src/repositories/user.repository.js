import prisma from "../config/prisma.js";

class UserRepository {
  async create(data) {
    return prisma.user.create({
      data,
    });
  }

  async findById(id) {
    return prisma.user.findUnique({
      where: {
        id,
      },
    });
  }

  async findByEmail(email) {
    return prisma.user.findUnique({
      where: {
        email,
      },
    });
  }

  async findByStripeCustomerId(stripeCustomerId) {
    return prisma.user.findUnique({
      where: {
        stripeCustomerId,
      },
    });
  }

  async findAll() {
    return prisma.user.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  async update(id, data) {
    return prisma.user.update({
      where: {
        id,
      },
      data,
    });
  }

  async updateStripeCustomer(id, stripeCustomerId) {
    return prisma.user.update({
      where: {
        id,
      },
      data: {
        stripeCustomerId,
      },
    });
  }

  async delete(id) {
    return prisma.user.delete({
      where: {
        id,
      },
    });
  }
}

export default new UserRepository();
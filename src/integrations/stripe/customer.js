import stripe from "./stripe.client.js";

class StripeCustomer {
  async createCustomer({
    name,
    email,
    phone,
    metadata = {},
  }) {
    return stripe.customers.create({
      name,
      email,
      phone,
      metadata,
    });
  }

  async getCustomer(customerId) {
    return stripe.customers.retrieve(customerId);
  }

  async updateCustomer(customerId, data) {
    return stripe.customers.update(customerId, data);
  }

  async deleteCustomer(customerId) {
    return stripe.customers.del(customerId);
  }
}

export default new StripeCustomer();
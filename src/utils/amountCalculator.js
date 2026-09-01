const amountCalculator = ({
  amount,
  tax = 0,
  discount = 0,
}) => {
  const subtotal = Number(amount);

  const taxAmount = (subtotal * tax) / 100;

  const discountAmount = (subtotal * discount) / 100;

  const total = subtotal + taxAmount - discountAmount;

  return {
    subtotal,
    tax,
    taxAmount,
    discount,
    discountAmount,
    total: Number(total.toFixed(2)),
  };
};

export default amountCalculator;
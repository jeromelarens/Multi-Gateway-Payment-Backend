import { Prisma } from "@prisma/client";

/**
 * Convert rupees/dollars to smallest unit (paise/cents)
 * Decimal-safe: avoids floating point errors
 */
export function toSmallestUnit(amount) {
  const decimal = new Prisma.Decimal(amount);
  return decimal.times(100).toNumber();
}

/**
 * Convert smallest unit back to main currency
 */
export function fromSmallestUnit(amount) {
  const decimal = new Prisma.Decimal(amount);
  return decimal.dividedBy(100).toFixed(2);
}
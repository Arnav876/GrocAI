/**
 * Money utilities for GroqAI.
 * All internal arithmetic operates strictly on integer paise.
 * 1 INR = 100 paise.
 */

export function rupeesToPaise(rupees: number): number {
  if (typeof rupees !== "number" || isNaN(rupees)) {
    throw new Error(`Invalid rupees value: ${rupees}`);
  }
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: number): number {
  if (typeof paise !== "number" || isNaN(paise)) {
    throw new Error(`Invalid paise value: ${paise}`);
  }
  return paise / 100;
}

export function formatINR(paiseOrRupees: number, isRupees = false): string {
  const rupees = isRupees ? paiseOrRupees : paiseToRupees(paiseOrRupees);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: rupees % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(rupees);
}

export function formatFeeRangeINR(minPaise: number, maxPaise: number): string {
  const minRupees = paiseToRupees(minPaise);
  const maxRupees = paiseToRupees(maxPaise);
  return `₹${minRupees} – ₹${maxRupees}`;
}

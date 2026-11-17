/**
 * @file estimator.calculator.js
 * @description Pure calculation engine for Henna Time & Cost Estimator.
 * 
 * DESIGN PRINCIPLES:
 * 1. PURE FUNCTION: Zero database, HTTP, or filesystem dependencies.
 * 2. MONEY IN PAISE: All monetary amounts are handled and computed strictly as integers
 *    in the smallest currency unit (paise: ₹1 = 100 paise). No floating-point financial drift.
 * 3. ROUNDING CONVENTION: Consistent Round Half Up arithmetic:
 *    roundHalfUp(x) = Math.floor(x + 0.5) for positive values.
 * 4. TIME ESTIMATION: Total minutes calculated as baseMinutes + (additionalGuests * minutesPerGuest).
 *    Display range created via timeBufferPercent and rounded to the nearest 0.5 hour.
 *    If lowHours === highHours, collapses to a single value.
 * 5. IMMUTABLE OUTPUT: Returns full calculation breakdown, raw numbers, formatted display strings,
 *    and the configVersion used.
 */

/**
 * Perform standard Round-Half-Up arithmetic on positive numbers
 * @param {number} value
 * @returns {number} Integer rounded half-up
 */
function roundHalfUp(value) {
  if (typeof value !== 'number' || isNaN(value)) return 0;
  return value >= 0 ? Math.floor(value + 0.5) : Math.ceil(value - 0.5);
}

/**
 * Format currency string using Intl.NumberFormat
 * @param {number} amountInPaise - Integer amount in paise
 * @param {string} [currency='INR'] - ISO 4217 currency code
 * @param {string} [locale='en-IN'] - BCP 47 locale
 * @returns {string} Formatted currency (e.g., "₹2,500")
 */
function formatCurrency(amountInPaise, currency = 'INR', locale = 'en-IN') {
  const rupees = (Number(amountInPaise) || 0) / 100;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(rupees);
}

/**
 * Round hours to the nearest 0.5 hour
 * @param {number} minutes
 * @returns {number} Hours rounded to nearest 0.5
 */
function roundToNearestHalfHour(minutes) {
  const hours = minutes / 60;
  return Math.round(hours * 2) / 2;
}

/**
 * Format hour number nicely (e.g. 1 -> "1", 3.5 -> "3.5")
 * @param {number} h
 * @returns {string}
 */
function formatHourNumber(h) {
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

/**
 * Produce human-readable time duration display string (e.g. "3 - 3.5 hrs" or "1 hr")
 * @param {number} lowHours
 * @param {number} highHours
 * @returns {string}
 */
function formatDurationDisplay(lowHours, highHours) {
  const lowStr = formatHourNumber(lowHours);
  const highStr = formatHourNumber(highHours);

  if (lowHours === highHours) {
    return `${lowStr} ${lowHours === 1 ? 'hr' : 'hrs'}`;
  }

  return `${lowStr} - ${highStr} hrs`;
}

/**
 * Calculate Henna Time & Cost
 * 
 * @param {Object} params
 * @param {Object} params.config - Estimator configuration
 * @param {string} params.coverageId - Selected coverage slug
 * @param {number} params.guests - Total number of people (min 1: bride only)
 * @returns {Object} Full calculation result breakdown
 * @throws {Error} With .code property for business rule violations
 */
function calculateEstimator({ config, coverageId, guests }) {
  if (!config) {
    const err = new Error('Estimator configuration is required.');
    err.code = 'CONFIG_MISSING';
    err.status = 503;
    throw err;
  }

  if (config.enabled === false) {
    const err = new Error('Henna Time & Cost Estimator is currently disabled for maintenance.');
    err.code = 'ESTIMATOR_DISABLED';
    err.status = 503;
    throw err;
  }

  // 1. Validate & Clamp Guests
  const maxGuests = Number(config.guestRules?.maxGuests) || 15;
  const numGuests = Number(guests);

  if (!Number.isInteger(numGuests) || numGuests < 1 || numGuests > maxGuests) {
    const err = new Error(`Number of guests must be an integer between 1 and ${maxGuests}.`);
    err.code = 'INVALID_GUESTS_COUNT';
    err.status = 400;
    err.details = { minGuests: 1, maxGuests, provided: guests };
    throw err;
  }

  // 2. Validate Coverage
  if (!coverageId || typeof coverageId !== 'string') {
    const err = new Error('A valid coverageId is required.');
    err.code = 'INVALID_COVERAGE_ID';
    err.status = 400;
    throw err;
  }

  const coverages = Array.isArray(config.coverages) ? config.coverages : [];
  const coverage = coverages.find(
    (c) => c.id && c.id.toLowerCase() === coverageId.trim().toLowerCase()
  );

  if (!coverage) {
    const err = new Error(`Coverage option "${coverageId}" does not exist.`);
    err.code = 'COVERAGE_NOT_FOUND';
    err.status = 400;
    throw err;
  }

  if (coverage.active === false) {
    const err = new Error(`Coverage option "${coverage.label || coverageId}" is currently inactive.`);
    err.code = 'COVERAGE_INACTIVE';
    err.status = 400;
    throw err;
  }

  // 3. Guest Rates & Overrides
  // "Additional guests" = total - 1 (min 1 is bride only)
  const additionalGuests = Math.max(0, numGuests - 1);

  const pricePerGuest =
    coverage.guestOverride && typeof coverage.guestOverride.pricePerGuest === 'number'
      ? coverage.guestOverride.pricePerGuest
      : Number(config.guestRules?.pricePerGuest) || 0;

  const minutesPerGuest =
    coverage.guestOverride && typeof coverage.guestOverride.minutesPerGuest === 'number'
      ? coverage.guestOverride.minutesPerGuest
      : Number(config.guestRules?.minutesPerGuest) || 0;

  const basePrice = Number(coverage.basePrice) || 0;
  const baseMinutes = Number(coverage.baseMinutes) || 0;

  // 4. Gross Guest Charges (in paise)
  const grossGuestCharges = additionalGuests * pricePerGuest;

  // 5. Bulk Discount Calculation
  // Applied on guest charges only. Pick the best applicable slab; do NOT stack.
  let bestDiscountPercent = 0;
  let appliedSlab = null;

  const slabs = Array.isArray(config.bulkDiscounts) ? config.bulkDiscounts : [];
  for (const slab of slabs) {
    if (numGuests >= slab.minGuests && slab.percent > bestDiscountPercent) {
      bestDiscountPercent = slab.percent;
      appliedSlab = slab;
    }
  }

  const discountAmount =
    bestDiscountPercent > 0
      ? roundHalfUp((grossGuestCharges * bestDiscountPercent) / 100)
      : 0;

  const netGuestCharges = Math.max(0, grossGuestCharges - discountAmount);

  // 6. Subtotal & Minimum Total
  const subtotalBeforeMinimum = basePrice + netGuestCharges;
  const minimumTotal = Number(config.minimumTotal) || 0;
  const isMinimumApplied = subtotalBeforeMinimum < minimumTotal;
  const minimumAdjustment = isMinimumApplied ? minimumTotal - subtotalBeforeMinimum : 0;
  const subtotal = Math.max(subtotalBeforeMinimum, minimumTotal);

  // 7. Tax (GST) Calculation: Inclusive vs Exclusive
  const taxPercent = Number(config.tax?.percent) || 0;
  const isTaxInclusive = Boolean(config.tax?.inclusive);

  let taxAmount = 0;
  let grandTotal = subtotal;

  if (taxPercent > 0) {
    if (isTaxInclusive) {
      // Prices already include tax. Total stays subtotal; extract internal tax component
      taxAmount = roundHalfUp(subtotal - subtotal / (1 + taxPercent / 100));
      grandTotal = subtotal;
    } else {
      // Tax is exclusive; add tax on top of subtotal
      taxAmount = roundHalfUp((subtotal * taxPercent) / 100);
      grandTotal = subtotal + taxAmount;
    }
  }

  // 8. Time Estimation & Range Buffer
  const totalMinutes = baseMinutes + additionalGuests * minutesPerGuest;
  const bufferPercent =
    typeof config.timeBufferPercent === 'number' ? config.timeBufferPercent : 15;

  const lowMinutes = totalMinutes;
  const highMinutes = roundHalfUp(totalMinutes * (1 + bufferPercent / 100));

  const lowHours = roundToNearestHalfHour(lowMinutes);
  const highHours = roundToNearestHalfHour(highMinutes);
  const timeDisplay = formatDurationDisplay(lowHours, highHours);

  // 9. Format Currencies
  const currency = config.currency || 'INR';

  return {
    coverage: {
      id: coverage.id,
      label: coverage.label,
      description: coverage.description || '',
      basePrice,
      basePriceFormatted: formatCurrency(basePrice, currency),
      baseMinutes,
    },
    guests: {
      total: numGuests,
      additional: additionalGuests,
      pricePerGuest,
      pricePerGuestFormatted: formatCurrency(pricePerGuest, currency),
      minutesPerGuest,
      grossGuestCharges,
      grossGuestChargesFormatted: formatCurrency(grossGuestCharges, currency),
    },
    discount: {
      applied: bestDiscountPercent > 0,
      percent: bestDiscountPercent,
      amount: discountAmount,
      amountFormatted: formatCurrency(discountAmount, currency),
      netGuestCharges,
      netGuestChargesFormatted: formatCurrency(netGuestCharges, currency),
      slab: appliedSlab ? { minGuests: appliedSlab.minGuests, percent: appliedSlab.percent } : null,
    },
    minimumTotal: {
      applied: isMinimumApplied,
      threshold: minimumTotal,
      thresholdFormatted: formatCurrency(minimumTotal, currency),
      adjustment: minimumAdjustment,
      adjustmentFormatted: formatCurrency(minimumAdjustment, currency),
    },
    tax: {
      percent: taxPercent,
      inclusive: isTaxInclusive,
      amount: taxAmount,
      amountFormatted: formatCurrency(taxAmount, currency),
    },
    time: {
      baseMinutes,
      guestMinutes: additionalGuests * minutesPerGuest,
      totalMinutes,
      lowMinutes,
      highMinutes,
      lowHours,
      highHours,
      bufferPercent,
      display: timeDisplay,
    },
    pricing: {
      subtotalBeforeMinimum,
      subtotalBeforeMinimumFormatted: formatCurrency(subtotalBeforeMinimum, currency),
      subtotal,
      subtotalFormatted: formatCurrency(subtotal, currency),
      grandTotal,
      grandTotalFormatted: formatCurrency(grandTotal, currency),
      currency,
    },
    includesText: config.includesText || '',
    configVersion: config.version || 1,
  };
}

module.exports = {
  calculateEstimator,
  roundHalfUp,
  formatCurrency,
  roundToNearestHalfHour,
  formatDurationDisplay,
};

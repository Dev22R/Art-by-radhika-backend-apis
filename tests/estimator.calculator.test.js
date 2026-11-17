const { test, describe } = require('node:test');
const assert = require('node:assert');
const {
  calculateEstimator,
  roundHalfUp,
  formatCurrency,
  roundToNearestHalfHour,
  formatDurationDisplay,
} = require('../src/modules/estimator/estimator.calculator');
const { DEFAULT_ESTIMATOR_CONFIG } = require('../src/seeders/estimator.seeder');

describe('Henna Time & Cost Estimator - Pure Calculator Engine', () => {
  const baseConfig = JSON.parse(JSON.stringify(DEFAULT_ESTIMATOR_CONFIG));

  // 1. Basic coverage tests with 1 guest (Bride only)
  describe('1. Each Coverage with Bride Only (guests = 1)', () => {
    test('Wrist & Palms (wrist): ₹2,500, 60 minutes, collapsed 1 hr display', () => {
      const result = calculateEstimator({
        config: baseConfig,
        coverageId: 'wrist',
        guests: 1,
      });

      assert.strictEqual(result.coverage.basePrice, 250000);
      assert.strictEqual(result.coverage.basePriceFormatted, '₹2,500');
      assert.strictEqual(result.guests.additional, 0);
      assert.strictEqual(result.guests.grossGuestCharges, 0);
      assert.strictEqual(result.discount.amount, 0);
      assert.strictEqual(result.pricing.grandTotal, 250000);
      assert.strictEqual(result.pricing.grandTotalFormatted, '₹2,500');
      assert.strictEqual(result.time.totalMinutes, 60);
      // 60 mins = 1 hr. 15% buffer = 69 mins -> 1.15 hr -> nearest 0.5 hr is 1.0 hr. Collapses!
      assert.strictEqual(result.time.display, '1 hr');
      assert.strictEqual(result.configVersion, 1);
    });

    test('Forearms Both Sides (forearm): ₹4,500, 120 minutes', () => {
      const result = calculateEstimator({
        config: baseConfig,
        coverageId: 'forearm',
        guests: 1,
      });

      assert.strictEqual(result.coverage.basePrice, 450000);
      assert.strictEqual(result.pricing.grandTotal, 450000);
      assert.strictEqual(result.pricing.grandTotalFormatted, '₹4,500');
      assert.strictEqual(result.time.totalMinutes, 120);
      // 120 mins = 2 hrs. 15% buffer = 138 mins -> 2.3 hrs -> nearest 0.5 is 2.5 hrs.
      assert.strictEqual(result.time.display, '2 - 2.5 hrs');
    });

    test('Full Elbow Bridal (full-elbow): ₹7,000, 180 minutes', () => {
      const result = calculateEstimator({
        config: baseConfig,
        coverageId: 'full-elbow',
        guests: 1,
      });

      assert.strictEqual(result.coverage.basePrice, 700000);
      assert.strictEqual(result.pricing.grandTotal, 700000);
      assert.strictEqual(result.pricing.grandTotalFormatted, '₹7,000');
      assert.strictEqual(result.time.totalMinutes, 180);
      // 180 mins = 3 hrs. 15% buffer = 207 mins = 3.45 hrs -> nearest 0.5 is 3.5 hrs.
      assert.strictEqual(result.time.display, '3 - 3.5 hrs');
    });

    test('Royal Arms + Feet (full-bridal-feet): ₹11,000, 300 minutes', () => {
      const result = calculateEstimator({
        config: baseConfig,
        coverageId: 'full-bridal-feet',
        guests: 1,
      });

      assert.strictEqual(result.coverage.basePrice, 1100000);
      assert.strictEqual(result.pricing.grandTotal, 1100000);
      assert.strictEqual(result.pricing.grandTotalFormatted, '₹11,000');
      assert.strictEqual(result.time.totalMinutes, 300);
      assert.strictEqual(result.time.lowHours, 5);
      // 300 * 1.15 = 345 mins = 5.75 hrs -> nearest 0.5 is 6.0 hrs
      assert.strictEqual(result.time.highHours, 6);
      assert.strictEqual(result.time.display, '5 - 6 hrs');
    });
  });

  // 2. Guests increments & Discount Boundaries (4 vs 5, 9 vs 10, 15)
  describe('2. Guests Scaling & Discount Boundaries', () => {
    test('guests = 2 (1 additional guest, 0% discount)', () => {
      const result = calculateEstimator({
        config: baseConfig,
        coverageId: 'wrist',
        guests: 2,
      });

      assert.strictEqual(result.guests.total, 2);
      assert.strictEqual(result.guests.additional, 1);
      assert.strictEqual(result.guests.grossGuestCharges, 50000); // 1 * 500 = ₹500
      assert.strictEqual(result.discount.applied, false);
      assert.strictEqual(result.discount.amount, 0);
      assert.strictEqual(result.pricing.grandTotal, 300000); // 2500 + 500 = ₹3,000
      assert.strictEqual(result.time.totalMinutes, 90); // 60 + 30 = 90 mins
    });

    test('Boundary Check: guests = 4 (3 additional guests, below 5 threshold -> 0% discount)', () => {
      const result = calculateEstimator({
        config: baseConfig,
        coverageId: 'wrist',
        guests: 4,
      });

      assert.strictEqual(result.guests.additional, 3);
      assert.strictEqual(result.guests.grossGuestCharges, 150000); // ₹1,500
      assert.strictEqual(result.discount.applied, false);
      assert.strictEqual(result.discount.percent, 0);
      assert.strictEqual(result.discount.amount, 0);
      assert.strictEqual(result.pricing.grandTotal, 400000); // ₹4,000
    });

    test('Boundary Check: guests = 5 (4 additional guests, exactly 5 threshold -> 10% discount on guest charges)', () => {
      const result = calculateEstimator({
        config: baseConfig,
        coverageId: 'wrist',
        guests: 5,
      });

      assert.strictEqual(result.guests.additional, 4);
      assert.strictEqual(result.guests.grossGuestCharges, 200000); // ₹2,000
      assert.strictEqual(result.discount.applied, true);
      assert.strictEqual(result.discount.percent, 10);
      assert.strictEqual(result.discount.amount, 20000); // 10% of 200000 = ₹200
      assert.strictEqual(result.discount.netGuestCharges, 180000); // ₹1,800
      assert.strictEqual(result.pricing.grandTotal, 430000); // 2500 + 1800 = ₹4,300
    });

    test('Boundary Check: guests = 9 (8 additional guests, below 10 threshold -> 10% discount)', () => {
      const result = calculateEstimator({
        config: baseConfig,
        coverageId: 'wrist',
        guests: 9,
      });

      assert.strictEqual(result.guests.additional, 8);
      assert.strictEqual(result.guests.grossGuestCharges, 400000); // ₹4,000
      assert.strictEqual(result.discount.percent, 10);
      assert.strictEqual(result.discount.amount, 40000); // 10% of 400000 = ₹400
      assert.strictEqual(result.discount.netGuestCharges, 360000); // ₹3,600
      assert.strictEqual(result.pricing.grandTotal, 610000); // 2500 + 3600 = ₹6,100
    });

    test('Boundary Check: guests = 10 (9 additional guests, exactly 10 threshold -> 15% discount)', () => {
      const result = calculateEstimator({
        config: baseConfig,
        coverageId: 'wrist',
        guests: 10,
      });

      assert.strictEqual(result.guests.additional, 9);
      assert.strictEqual(result.guests.grossGuestCharges, 450000); // ₹4,500
      assert.strictEqual(result.discount.applied, true);
      assert.strictEqual(result.discount.percent, 15);
      // 15% of 450000 = 67500 paise (₹675)
      assert.strictEqual(result.discount.amount, 67500);
      assert.strictEqual(result.discount.netGuestCharges, 382500); // ₹3,825
      assert.strictEqual(result.pricing.grandTotal, 632500); // 2500 + 3825 = ₹6,325
    });

    test('Maximum Guests: guests = 15 (14 additional guests, 15% discount)', () => {
      const result = calculateEstimator({
        config: baseConfig,
        coverageId: 'wrist',
        guests: 15,
      });

      assert.strictEqual(result.guests.additional, 14);
      assert.strictEqual(result.guests.grossGuestCharges, 700000); // ₹7,000
      assert.strictEqual(result.discount.percent, 15);
      assert.strictEqual(result.discount.amount, 105000); // ₹1,050
      assert.strictEqual(result.discount.netGuestCharges, 595000); // ₹5,950
      assert.strictEqual(result.pricing.grandTotal, 845000); // 2500 + 5950 = ₹8,450
      assert.strictEqual(result.time.totalMinutes, 60 + 14 * 30); // 480 mins = 8 hrs
    });
  });

  // 3. Minimum Order Total
  describe('3. Minimum Order Total Rule', () => {
    test('Kicks in when calculated subtotal is below minimumTotal', () => {
      const configWithMin = {
        ...baseConfig,
        minimumTotal: 500000, // ₹5,000 minimum
      };

      const result = calculateEstimator({
        config: configWithMin,
        coverageId: 'wrist', // Base price ₹2,500
        guests: 1,
      });

      assert.strictEqual(result.minimumTotal.applied, true);
      assert.strictEqual(result.minimumTotal.threshold, 500000);
      assert.strictEqual(result.minimumTotal.adjustment, 250000);
      assert.strictEqual(result.pricing.subtotalBeforeMinimum, 250000);
      assert.strictEqual(result.pricing.grandTotal, 500000);
      assert.strictEqual(result.pricing.grandTotalFormatted, '₹5,000');
    });

    test('Does not alter total when calculated subtotal exceeds minimumTotal', () => {
      const configWithMin = {
        ...baseConfig,
        minimumTotal: 300000, // ₹3,000 minimum
      };

      const result = calculateEstimator({
        config: configWithMin,
        coverageId: 'full-elbow', // Base price ₹7,000
        guests: 1,
      });

      assert.strictEqual(result.minimumTotal.applied, false);
      assert.strictEqual(result.minimumTotal.adjustment, 0);
      assert.strictEqual(result.pricing.grandTotal, 700000);
    });
  });

  // 4. Tax (GST) Inclusive vs Exclusive
  describe('4. Tax Calculations (Inclusive vs Exclusive)', () => {
    test('Tax Exclusive: Adds GST on top of subtotal', () => {
      const configWithTax = {
        ...baseConfig,
        tax: {
          percent: 18,
          inclusive: false,
        },
      };

      const result = calculateEstimator({
        config: configWithTax,
        coverageId: 'wrist', // ₹2,500 = 250000 paise
        guests: 1,
      });

      // 18% of 250000 = 45000 paise (₹450)
      assert.strictEqual(result.tax.inclusive, false);
      assert.strictEqual(result.tax.percent, 18);
      assert.strictEqual(result.tax.amount, 45000);
      assert.strictEqual(result.tax.amountFormatted, '₹450');
      assert.strictEqual(result.pricing.subtotal, 250000);
      assert.strictEqual(result.pricing.grandTotal, 295000); // ₹2,950
      assert.strictEqual(result.pricing.grandTotalFormatted, '₹2,950');
    });

    test('Tax Inclusive: Grand total stays subtotal; internal tax extracted', () => {
      const configWithTax = {
        ...baseConfig,
        tax: {
          percent: 18,
          inclusive: true,
        },
      };

      const result = calculateEstimator({
        config: configWithTax,
        coverageId: 'wrist', // ₹2,500
        guests: 1,
      });

      assert.strictEqual(result.tax.inclusive, true);
      assert.strictEqual(result.tax.percent, 18);
      // Tax component inside 250,000: 250000 - (250000 / 1.18) = 38136 paise
      assert.strictEqual(result.tax.amount, 38136);
      assert.strictEqual(result.pricing.grandTotal, 250000); // Stays ₹2,500
      assert.strictEqual(result.pricing.grandTotalFormatted, '₹2,500');
    });
  });

  // 5. Rounding convention & edge cases
  describe('5. Rounding (Round Half Up) and Helper Functions', () => {
    test('roundHalfUp correctly rounds half up on positive numbers', () => {
      assert.strictEqual(roundHalfUp(0.5), 1);
      assert.strictEqual(roundHalfUp(0.49), 0);
      assert.strictEqual(roundHalfUp(1.5), 2);
      assert.strictEqual(roundHalfUp(2.5), 3);
      assert.strictEqual(roundHalfUp(10.5), 11);
      assert.strictEqual(roundHalfUp(0), 0);
    });

    test('roundToNearestHalfHour properly snaps to 0.5 step', () => {
      assert.strictEqual(roundToNearestHalfHour(60), 1); // 1.0 hr
      assert.strictEqual(roundToNearestHalfHour(70), 1); // 1.16 hr -> 1.0 hr
      assert.strictEqual(roundToNearestHalfHour(75), 1.5); // 1.25 hr (halfway) -> 1.5 hr
      assert.strictEqual(roundToNearestHalfHour(80), 1.5); // 1.33 hr -> 1.5 hr
      assert.strictEqual(roundToNearestHalfHour(90), 1.5); // 1.5 hr
      assert.strictEqual(roundToNearestHalfHour(110), 2); // 1.83 hr -> 2.0 hr
    });

    test('formatCurrency formats Indian Rupee without decimals', () => {
      assert.strictEqual(formatCurrency(250000, 'INR'), '₹2,500');
      assert.strictEqual(formatCurrency(1100000, 'INR'), '₹11,000');
      assert.strictEqual(formatCurrency(0, 'INR'), '₹0');
    });
  });

  // 6. Per-Coverage Guest Override
  describe('6. Per-Coverage Guest Overrides', () => {
    test('Uses coverage-specific pricePerGuest and minutesPerGuest when present', () => {
      const configWithOverride = JSON.parse(JSON.stringify(baseConfig));
      // Override forearm coverage
      configWithOverride.coverages[1].guestOverride = {
        pricePerGuest: 80000, // ₹800 instead of default ₹500
        minutesPerGuest: 45, // 45 mins instead of default 30 mins
      };

      const result = calculateEstimator({
        config: configWithOverride,
        coverageId: 'forearm',
        guests: 3, // 2 additional guests
      });

      assert.strictEqual(result.guests.pricePerGuest, 80000);
      assert.strictEqual(result.guests.minutesPerGuest, 45);
      assert.strictEqual(result.guests.grossGuestCharges, 160000); // 2 * 800 = ₹1,600
      assert.strictEqual(result.time.totalMinutes, 120 + 2 * 45); // 210 mins
    });
  });

  // 7. Time Range Collapse
  describe('7. Time Range Display & Collapse', () => {
    test('Collapses range when buffer is 0% or low equals high', () => {
      const zeroBufferConfig = {
        ...baseConfig,
        timeBufferPercent: 0,
      };

      const result = calculateEstimator({
        config: zeroBufferConfig,
        coverageId: 'full-elbow', // 180 mins = 3 hrs
        guests: 1,
      });

      assert.strictEqual(result.time.lowHours, 3);
      assert.strictEqual(result.time.highHours, 3);
      assert.strictEqual(result.time.display, '3 hrs');
    });

    test('formatDurationDisplay handles 1 hr singular properly', () => {
      assert.strictEqual(formatDurationDisplay(1, 1), '1 hr');
      assert.strictEqual(formatDurationDisplay(2, 2), '2 hrs');
      assert.strictEqual(formatDurationDisplay(1, 1.5), '1 - 1.5 hrs');
    });
  });

  // 8. Rejections and Error Codes
  describe('8. Input Validation & Error Rejections', () => {
    test('Rejects inactive coverage with COVERAGE_INACTIVE', () => {
      const configWithInactive = JSON.parse(JSON.stringify(baseConfig));
      configWithInactive.coverages[0].active = false; // wrist is inactive

      assert.throws(
        () => {
          calculateEstimator({
            config: configWithInactive,
            coverageId: 'wrist',
            guests: 1,
          });
        },
        (err) => {
          assert.strictEqual(err.code, 'COVERAGE_INACTIVE');
          assert.strictEqual(err.status, 400);
          return true;
        }
      );
    });

    test('Rejects non-existent coverage with COVERAGE_NOT_FOUND', () => {
      assert.throws(
        () => {
          calculateEstimator({
            config: baseConfig,
            coverageId: 'non-existent-coverage',
            guests: 1,
          });
        },
        (err) => {
          assert.strictEqual(err.code, 'COVERAGE_NOT_FOUND');
          assert.strictEqual(err.status, 400);
          return true;
        }
      );
    });

    test('Rejects guests < 1 with INVALID_GUESTS_COUNT', () => {
      assert.throws(
        () => {
          calculateEstimator({
            config: baseConfig,
            coverageId: 'wrist',
            guests: 0,
          });
        },
        (err) => {
          assert.strictEqual(err.code, 'INVALID_GUESTS_COUNT');
          assert.strictEqual(err.status, 400);
          return true;
        }
      );
    });

    test('Rejects guests > maxGuests with INVALID_GUESTS_COUNT', () => {
      assert.throws(
        () => {
          calculateEstimator({
            config: baseConfig,
            coverageId: 'wrist',
            guests: 16, // max is 15
          });
        },
        (err) => {
          assert.strictEqual(err.code, 'INVALID_GUESTS_COUNT');
          assert.strictEqual(err.status, 400);
          return true;
        }
      );
    });

    test('Rejects disabled estimator with ESTIMATOR_DISABLED (503)', () => {
      const disabledConfig = {
        ...baseConfig,
        enabled: false,
      };

      assert.throws(
        () => {
          calculateEstimator({
            config: disabledConfig,
            coverageId: 'wrist',
            guests: 1,
          });
        },
        (err) => {
          assert.strictEqual(err.code, 'ESTIMATOR_DISABLED');
          assert.strictEqual(err.status, 503);
          return true;
        }
      );
    });
  });
});

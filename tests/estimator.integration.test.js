const { test, describe, before } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { Socket } = require('node:net');
const jwt = require('jsonwebtoken');

const app = require('../src/app');
const config = require('../src/config/env');
const User = require('../src/modules/user/user.model');
const {
  EstimatorConfig,
  EstimatorConfigHistory,
  EstimatorEnquiry,
} = require('../src/modules/estimator/estimator.model');
const { DEFAULT_ESTIMATOR_CONFIG } = require('../src/seeders/estimator.seeder');
const { resetLocalCache } = require('../src/modules/estimator/estimator.cache');

describe('Henna Time & Cost Estimator - End-to-End API Integration Suite', () => {
  let adminToken;
  let userToken;

  // In-Memory Database Store for deterministic test execution
  let mockConfigDoc = null;
  const mockHistoryList = [];
  const mockEnquiryList = [];

  /**
   * High-performance in-memory HTTP dispatcher for Express 5
   * Runs directly in-process without TCP network socket restrictions.
   */
  function invokeApp({ method = 'GET', url, headers = {}, body = null }) {
    return new Promise((resolve) => {
      const sock = new Socket();
      sock.remoteAddress = '127.0.0.1';
      const req = new http.IncomingMessage(sock);
      req.ip = '127.0.0.1';
      req.method = method.toUpperCase();
      req.url = url;
      req.originalUrl = url;

      const lowerHeaders = {};
      for (const [k, v] of Object.entries(headers)) {
        lowerHeaders[k.toLowerCase()] = v;
      }

      let payloadStr = null;
      if (body !== null && body !== undefined) {
        payloadStr = typeof body === 'string' ? body : JSON.stringify(body);
        lowerHeaders['content-type'] = lowerHeaders['content-type'] || 'application/json';
        lowerHeaders['content-length'] = Buffer.byteLength(payloadStr).toString();
      }

      req.headers = lowerHeaders;

      const res = new http.ServerResponse(req);
      const chunks = [];

      res.write = function (chunk) {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        return true;
      };

      res.end = function (chunk) {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        const fullBuffer = Buffer.concat(chunks);
        const text = fullBuffer.toString('utf8');
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {}

        resolve({
          status: res.statusCode,
          headers: res.getHeaders(),
          text,
          body: json,
          json: async () => json,
        });
      };

      process.nextTick(() => {
        if (payloadStr) {
          req.push(payloadStr);
        }
        req.push(null);
      });

      app(req, res);
    });
  }

  before(async () => {
    // 0. Set mongoose readyState to 1 and mock redisService to avoid outbound network blocks in sandbox
    const mongoose = require('mongoose');
    mongoose.connection.readyState = 1;

    const redisService = require('../src/services/redis.service');
    redisService.get = async () => null;
    redisService.set = async () => true;
    redisService.del = async () => true;
    redisService.delPattern = async () => true;
    redisService.exists = async () => false;

    // 1. Generate authentic JWT tokens for test roles
    const jwtSecret = config.jwt.secret || 'default-jwt-secret';
    adminToken = jwt.sign(
      { id: '60d0fe4f5311236168a109aa', role: 'admin' },
      jwtSecret,
      { expiresIn: '1h' }
    );
    userToken = jwt.sign(
      { id: '60d0fe4f5311236168a109bb', role: 'user' },
      jwtSecret,
      { expiresIn: '1h' }
    );

    // 2. Mock User.findById for protect middleware
    User.findById = function (id) {
      return {
        select: () => {
          if (String(id) === '60d0fe4f5311236168a109aa') {
            return Promise.resolve({
              _id: '60d0fe4f5311236168a109aa',
              name: 'Master Artist Admin',
              email: 'admin@artbyradhika.com',
              role: 'admin',
              isActive: true,
              toJSON: () => ({
                _id: '60d0fe4f5311236168a109aa',
                name: 'Master Artist Admin',
                email: 'admin@artbyradhika.com',
                role: 'admin',
                isActive: true,
              }),
            });
          }
          if (String(id) === '60d0fe4f5311236168a109bb') {
            return Promise.resolve({
              _id: '60d0fe4f5311236168a109bb',
              name: 'Test Client',
              email: 'client@example.com',
              role: 'user',
              isActive: true,
              toJSON: () => ({
                _id: '60d0fe4f5311236168a109bb',
                name: 'Test Client',
                email: 'client@example.com',
                role: 'user',
                isActive: true,
              }),
            });
          }
          return Promise.resolve(null);
        },
      };
    };

    // 3. Initialize mock configuration state
    mockConfigDoc = {
      ...JSON.parse(JSON.stringify(DEFAULT_ESTIMATOR_CONFIG)),
      toObject: function () {
        return JSON.parse(JSON.stringify(this));
      },
      save: async function () {
        return this;
      },
    };

    // 4. Mock Estimator Mongoose models
    EstimatorConfig.findOne = function () {
      return {
        populate: () => ({
          lean: async () => (mockConfigDoc ? mockConfigDoc.toObject() : null),
        }),
        lean: async () => (mockConfigDoc ? mockConfigDoc.toObject() : null),
        then: (resolve) => resolve(mockConfigDoc),
      };
    };

    EstimatorConfigHistory.find = function () {
      return {
        populate: () => ({
          sort: () => ({
            skip: () => ({
              limit: () => ({
                lean: async () => [...mockHistoryList].reverse(),
              }),
            }),
          }),
        }),
      };
    };

    EstimatorConfigHistory.countDocuments = async () => mockHistoryList.length;

    EstimatorConfigHistory.findOne = async function (filter) {
      if (filter && filter.version) {
        const found = mockHistoryList.find((h) => h.version === filter.version);
        return found || null;
      }
      return null;
    };

    EstimatorConfigHistory.prototype.save = async function () {
      mockHistoryList.push({
        version: this.version,
        snapshot: this.snapshot,
        diff: this.diff,
        changeNote: this.changeNote,
        updatedBy: this.updatedBy,
        createdAt: new Date(),
      });
      return this;
    };

    EstimatorEnquiry.prototype.save = async function () {
      const savedDoc = {
        _id: 'enq_' + (mockEnquiryList.length + 1),
        ...this.toObject(),
        createdAt: new Date(),
      };
      mockEnquiryList.push(savedDoc);
      this._id = savedDoc._id;
      this.createdAt = savedDoc.createdAt;
      return savedDoc;
    };
  });

  // ==========================================
  // PUBLIC ENDPOINTS TESTS
  // ==========================================
  describe('Public Estimator Endpoints', () => {
    test('GET /api/v1/estimator/config: returns active coverages without exposing prices or margins', async () => {
      resetLocalCache();
      const res = await invokeApp({
        method: 'GET',
        url: '/api/v1/estimator/config',
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.enabled, true);
      assert.strictEqual(res.body.data.currency, 'INR');
      assert.strictEqual(res.body.data.maxGuests, 15);
      assert.ok(Array.isArray(res.body.data.coverages));
      assert.strictEqual(res.body.data.coverages.length, 4);

      // Verify strict privacy: No basePrice, discount percentages, or profit margins exposed
      const wrist = res.body.data.coverages.find((c) => c.id === 'wrist');
      assert.ok(wrist);
      assert.strictEqual(wrist.label, 'Wrist & Palms');
      assert.strictEqual(wrist.basePrice, undefined, 'basePrice must NOT be exposed publicly');
      assert.strictEqual(wrist.baseMinutes, undefined, 'baseMinutes must NOT be exposed publicly');
    });

    test('POST /api/v1/estimator/calculate: returns accurate calculation result for valid package', async () => {
      resetLocalCache();
      const res = await invokeApp({
        method: 'POST',
        url: '/api/v1/estimator/calculate',
        body: {
          coverageId: 'full-elbow',
          guests: 5,
        },
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.coverage.id, 'full-elbow');
      assert.strictEqual(res.body.data.guests.total, 5);
      assert.strictEqual(res.body.data.guests.additional, 4);
      // 4 * ₹500 = ₹2,000 (200,000 paise). 5 guests = 10% discount = ₹200 (20,000 paise).
      assert.strictEqual(res.body.data.discount.amount, 20000);
      assert.strictEqual(res.body.data.discount.netGuestCharges, 180000);
      // Base ₹7,000 + Net guest ₹1,800 = ₹8,800 (880,000 paise)
      assert.strictEqual(res.body.data.pricing.grandTotal, 880000);
      assert.strictEqual(res.body.data.pricing.grandTotalFormatted, '₹8,800');
    });

    test('POST /api/v1/estimator/calculate: validation failure on missing or invalid fields returns 400', async () => {
      const res = await invokeApp({
        method: 'POST',
        url: '/api/v1/estimator/calculate',
        body: {
          coverageId: 'wrist',
          guests: -5, // Invalid negative guests
        },
      });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error.code, 'VALIDATION_ERROR');
    });

    test('POST /api/v1/estimator/enquiry: re-calculates quote independently and ignores client tampered price', async () => {
      resetLocalCache();
      const tamperedPrice = 5000; // Client sends ₹50 to try and manipulate price!

      const res = await invokeApp({
        method: 'POST',
        url: '/api/v1/estimator/enquiry',
        body: {
          name: 'Pooja Sharma',
          phone: '+919876543210',
          email: 'pooja@example.com',
          eventDate: '2026-12-15',
          location: 'Udaipur, Rajasthan',
          coverageId: 'wrist',
          guests: 5,
          clientAmount: tamperedPrice, // Attempted tamper
        },
      });

      assert.strictEqual(res.status, 201);
      assert.ok(res.body.data.enquiryId);
      // True calculated price for wrist + 5 guests: ₹2,500 + (4 * 500 - 10%) = ₹4,300 (430,000 paise)
      assert.strictEqual(res.body.data.quote.pricing.grandTotal, 430000);
      assert.strictEqual(res.body.data.quote.pricing.grandTotalFormatted, '₹4,300');
      assert.notStrictEqual(res.body.data.quote.pricing.grandTotal, tamperedPrice);
    });

    test('Estimator Disabled (Maintenance Mode): returns 503 ESTIMATOR_MAINTENANCE', async () => {
      // Temporarily disable estimator
      mockConfigDoc.enabled = false;
      resetLocalCache();

      const resConfig = await invokeApp({
        method: 'GET',
        url: '/api/v1/estimator/config',
      });
      assert.strictEqual(resConfig.status, 503);
      assert.strictEqual(resConfig.body.error.code, 'ESTIMATOR_MAINTENANCE');

      const resCalc = await invokeApp({
        method: 'POST',
        url: '/api/v1/estimator/calculate',
        body: { coverageId: 'wrist', guests: 2 },
      });
      assert.strictEqual(resCalc.status, 503);
      assert.strictEqual(resCalc.body.error.code, 'ESTIMATOR_MAINTENANCE');

      // Re-enable for subsequent tests
      mockConfigDoc.enabled = true;
      resetLocalCache();
    });
  });

  // ==========================================
  // ADMIN ENDPOINTS & ACCESS CONTROL TESTS
  // ==========================================
  describe('Admin Estimator Endpoints & Security', () => {
    test('Admin Auth: Unauthenticated request returns 401 Unauthorized', async () => {
      const res = await invokeApp({
        method: 'GET',
        url: '/api/v1/admin/estimator/config',
      });
      assert.strictEqual(res.status, 401);
    });

    test('Admin Auth: Regular user role token returns 403 Forbidden', async () => {
      const res = await invokeApp({
        method: 'GET',
        url: '/api/v1/admin/estimator/config',
        headers: { Authorization: `Bearer ${userToken}` },
      });
      assert.strictEqual(res.status, 403);
    });

    test('Admin: GET /api/v1/admin/estimator/config returns full configuration with prices', async () => {
      const res = await invokeApp({
        method: 'GET',
        url: '/api/v1/admin/estimator/config',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.data.coverages);
      assert.strictEqual(res.body.data.coverages[0].basePrice, 250000); // Full price visible to Admin
      assert.strictEqual(res.body.data.version, 1);
    });

    test('Admin: Validation failure on PUT config (negative price or duplicate IDs) returns 400', async () => {
      const invalidPayload = {
        ...mockConfigDoc.toObject(),
        version: mockConfigDoc.version,
        coverages: [
          {
            id: 'wrist',
            label: 'Wrist',
            basePrice: -500, // Negative basePrice!
            baseMinutes: 60,
          },
        ],
      };

      const res = await invokeApp({
        method: 'PUT',
        url: '/api/v1/admin/estimator/config',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: invalidPayload,
      });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error.code, 'VALIDATION_ERROR');
    });

    test('Admin Concurrency: Version conflict returns 409 Conflict', async () => {
      const conflictPayload = {
        ...mockConfigDoc.toObject(),
        version: 999, // Stale / mismatched version
      };

      const res = await invokeApp({
        method: 'PUT',
        url: '/api/v1/admin/estimator/config',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: conflictPayload,
      });

      assert.strictEqual(res.status, 409);
      assert.strictEqual(res.body.error.code, 'VERSION_CONFLICT');
    });

    test('Admin: Successful PUT updates config, increments version to 2, and saves history record', async () => {
      const updatePayload = {
        ...mockConfigDoc.toObject(),
        version: 1, // Current version
        minimumTotal: 300000, // Set minimum ₹3,000
        changeNote: 'Added minimum order requirement of ₹3,000',
      };

      const res = await invokeApp({
        method: 'PUT',
        url: '/api/v1/admin/estimator/config',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: updatePayload,
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.version, 2);
      assert.strictEqual(mockConfigDoc.version, 2);
      assert.strictEqual(mockConfigDoc.minimumTotal, 300000);
      assert.strictEqual(mockHistoryList.length, 1);
      assert.strictEqual(mockHistoryList[0].version, 1);
    });

    test('Admin: GET /api/v1/admin/estimator/config/history returns audit logs with diff', async () => {
      const res = await invokeApp({
        method: 'GET',
        url: '/api/v1/admin/estimator/config/history',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.data.history));
      assert.strictEqual(res.body.data.history.length, 1);
      assert.strictEqual(res.body.data.history[0].version, 1);
    });

    test('Admin: POST /api/v1/admin/estimator/config/rollback/1 successfully restores version 1', async () => {
      const res = await invokeApp({
        method: 'POST',
        url: '/api/v1/admin/estimator/config/rollback/1',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      assert.strictEqual(res.status, 200);
      // Restored settings from v1, but version increments to 3
      assert.strictEqual(res.body.data.version, 3);
      assert.strictEqual(res.body.data.minimumTotal, 0); // Reverted back to 0
    });

    test('Admin: POST /api/v1/admin/estimator/preview runs calculate against draft config without saving', async () => {
      const draftConfig = {
        ...mockConfigDoc.toObject(),
        coverages: [
          {
            id: 'promotional-festive',
            label: 'Festive Flash Deal',
            basePrice: 150000, // ₹1,500 promo
            baseMinutes: 45,
            active: true,
            sortOrder: 1,
          },
        ],
      };

      const res = await invokeApp({
        method: 'POST',
        url: '/api/v1/admin/estimator/preview',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          config: draftConfig,
          coverageId: 'promotional-festive',
          guests: 1,
        },
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.preview, true);
      assert.strictEqual(res.body.data.calculation.coverage.id, 'promotional-festive');
      assert.strictEqual(res.body.data.calculation.pricing.grandTotal, 150000);
      assert.strictEqual(res.body.data.calculation.pricing.grandTotalFormatted, '₹1,500');

      // Database config remains untouched!
      assert.strictEqual(mockConfigDoc.coverages.some((c) => c.id === 'promotional-festive'), false);
    });
  });
});

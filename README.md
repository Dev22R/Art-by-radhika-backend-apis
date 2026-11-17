# Redis + Express Production Backend

A high-performance Node.js & Express backend architecture powered by **Redis** for in-memory caching, distributed background job processing with **BullMQ**, and real-time Pub/Sub communication with **Socket.io**.

---

## 📦 Project Analysis & Architecture

Based on [`package.json`](./package.json), the project stack is structured into complementary layers:

| Layer | Packages | Purpose |
|---|---|---|
| **Core Server** | `express` (v5.2.1) | Fast, minimal HTTP web framework for routing & APIs |
| **In-Memory & Queuing** | `redis` (v6.3.0), `bullmq` (v6.3.11) | High-speed caching, session management, TTLs, and distributed asynchronous job processing |
| **Database** | `mongoose` (v9.10.3) | Persistent document data modeling for MongoDB |
| **Real-time** | `socket.io` (v4.8.4) | Bi-directional WebSocket communication (bridged with Redis Pub/Sub) |
| **Security & Middleware** | `helmet`, `cors`, `morgan`, `cookie-parser`, `express-rate-limit`, `bcryptjs`, `jsonwebtoken` | API security headers, CORS policies, access rate limits, and authentication tokens |
| **Validation & Docs** | `joi`, `swagger-ui-express`, `swagger-jsdoc` | Request payload schema validation and interactive OpenAPI/Swagger documentation |
| **Media & Utilities** | `multer`, `cloudinary`, `multer-storage-cloudinary`, `nodemailer`, `uuid`, `dayjs`, `slugify` | File uploads, cloud image storage, email notifications, and string formatting utilities |

---

## 📁 Project Structure

```text
├── index.js                     # Root entry point
├── package.json                 # Dependencies and npm scripts
├── .env                         # Active environment configuration
├── .env.example                 # Environment variables template
├── .gitignore                   # Ignored files (node_modules, .env)
└── src/
    ├── app.js                   # Express application setup, middlewares, swagger
    ├── server.js                # HTTP + Socket.io server bootstrap & graceful shutdown
    ├── config/
    │   ├── env.js               # Centralized configuration
    │   ├── redis.js             # Redis client lifecycle, reconnect backoff, health check
    │   ├── db.js                # MongoDB connection handler (with non-blocking fallback)
    │   └── swagger.js           # OpenAPI / Swagger definition
    ├── middlewares/
    │   ├── cache.middleware.js  # Redis route caching middleware (X-Cache: HIT / MISS)
    │   ├── rateLimiter.js       # Request rate limiting
    │   └── error.middleware.js  # Centralized error handler
    ├── services/
    │   └── redis.service.js     # Redis Service (get, set, del, delPattern, exists, ttl, pub/sub)
    ├── queues/
    │   └── redisQueue.js        # BullMQ Queues and asynchronous background worker
    ├── controllers/
    │   ├── health.controller.js # Server, Redis, and Database health check
    │   └── redisDemo.controller.js # Handlers for cache, slow-query demo, and BullMQ jobs
    └── routes/
        ├── index.js             # Main route aggregator (/api)
        ├── health.routes.js     # Health check route (/api/health)
        └── redis.routes.js      # Redis demo routes (/api/redis)
```

---

## 🚀 Getting Started

### 1. Prerequisites
Ensure you have Redis installed and running locally:
```bash
# Verify Redis is running
redis-cli ping
# Expected response: PONG
```

*(If you are using Docker, you can run `docker run -d -p 6379:6379 redis:alpine`)*

### 2. Configure Environment
Review and adjust variables in `.env`:
```env
PORT=5000
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_DEFAULT_TTL=300
MONGO_URI=mongodb://127.0.0.1:27017/rp_database
```

### 3. Run the Server
```bash
# Development mode (with auto-reload using Node --watch)
npm run dev

# Or standard start
npm start
```

---

## ⚡ API Endpoints & Redis Features

### 1. Health & Status
- **`GET /api/health`**
  Returns real-time health of Express, Redis (`PING -> PONG`), and Database connectivity.

### 2. Redis Key-Value Operations
- **`POST /api/redis/cache`**
  Save a key with optional TTL (seconds):
  ```json
  {
    "key": "user:101",
    "value": { "name": "Alice", "role": "admin" },
    "ttl": 60
  }
  ```
- **`GET /api/redis/cache/:key`**
  Retrieve a value and view remaining TTL seconds.
- **`DELETE /api/redis/cache/:key`**
  Delete a key from Redis.

### 3. Automatic Route Response Caching
- **`GET /api/redis/cached-data`**
  - **First Request (Cache MISS):** Simulates 1.5s heavy compute/query, stores result in Redis, returns `X-Cache: MISS`.
  - **Subsequent Requests (Cache HIT):** Returns instantaneously (<5ms) directly from Redis with `X-Cache: HIT`.

### 4. Background Job Queue (BullMQ)
- **`POST /api/redis/queue-job`**
  Dispatches an asynchronous background task processed by the BullMQ worker:
  ```json
  {
    "taskTitle": "Generate Monthly Financial Report"
  }
  ```

### 5. Redis Pub/Sub & WebSockets
- **`POST /api/redis/publish`**
  Publishes a message to a Redis channel; the server listens and relays it to real-time Socket.io clients.

---

## 🎨 Henna Time & Cost Estimator API

Production-grade backend module powering the interactive Henna Time & Cost Estimator widget.

### Key Architectural Highlights
- **100% Dynamic & Pure:** Zero hardcoded business logic. All pricing rules, durations, discounts, and buffer percentages are dynamically computed from the active database configuration.
- **Integer Paise Arithmetic:** All monetary amounts are computed and stored as integers in paise (`₹1 = 100 paise`), eliminating floating-point rounding drift.
- **Round-Half-Up:** Consistent `Math.floor(x + 0.5)` rounding applied across currency and duration.
- **Time Range Collapse:** Dynamic time buffer (e.g. 15%) produces range strings (e.g. `"3 - 3.5 hrs"`), cleanly collapsing to a single value (`"1 hr"`) when boundaries meet.
- **Optimistic Concurrency Control:** Admin updates require a `version` field; concurrent modifications are safely rejected with `409 Conflict`.
- **Immutable Audit Logging & Rollback:** Every admin write creates an audit entry with a diff of changes and supports one-click rollback.
- **Two-Tier Caching:** In-memory + Redis caching with 60s TTL, instantly invalidated upon admin changes.
- **Rate Limiting & Security:** Public calculate is limited to 60 req/min/IP; enquiry submissions are limited to 5 req/min/IP with HTML/script sanitization.
- **Enquiry Re-Calculation:** Server independently re-calculates quotes and ignores any client-sent prices to prevent tampering.

---

### Seeding & Running Tests

```bash
# Seed initial default Henna Estimator configuration (Idempotent)
npm run seed:estimator

# Run all 39 Estimator unit & integration test suites
npm run test:estimator
```

---

### Calculation Rules Reference

$$\text{additionalGuests} = \max(0, \text{guests} - 1)$$
$$\text{pricePerGuest} = \text{coverage.guestOverride.pricePerGuest} \parallel \text{config.guestRules.pricePerGuest}$$
$$\text{grossGuestCharges} = \text{additionalGuests} \times \text{pricePerGuest}$$
$$\text{discountAmount} = \text{roundHalfUp}\left(\frac{\text{grossGuestCharges} \times \text{bestDiscountPercent}}{100}\right)$$
$$\text{subtotal} = \max\left(\text{coverage.basePrice} + \text{netGuestCharges}, \text{config.minimumTotal}\right)$$

**Duration Calculation:**
$$\text{totalMinutes} = \text{baseMinutes} + (\text{additionalGuests} \times \text{minutesPerGuest})$$
$$\text{highMinutes} = \text{roundHalfUp}(\text{totalMinutes} \times (1 + \text{bufferPercent} / 100))$$
- Both minutes are snapped to the nearest 0.5 hour.
- If `lowHours === highHours`, display collapses to `"X hrs"` (or `"1 hr"`).

---

### API Endpoints Reference

#### 1. Public: Get Estimator Public Config
Returns active coverage options and rules. Base prices, discount percentages, and margins are strictly kept private.
```bash
curl -X GET http://localhost:5000/api/v1/estimator/config
```
**Response (200 OK):**
```json
{
  "data": {
    "coverages": [
      {
        "id": "wrist",
        "label": "Wrist & Palms",
        "description": "Intricate design extending from fingertips to wrists on both palms."
      },
      {
        "id": "forearm",
        "label": "Forearms Both Sides",
        "description": "Traditional motifs covering palms, wrists, and halfway up both forearms."
      },
      {
        "id": "full-elbow",
        "label": "Full Elbow Bridal",
        "description": "Signature bridal layout covering fingers to elbows on both sides with custom elements."
      },
      {
        "id": "full-bridal-feet",
        "label": "Royal Arms + Feet",
        "description": "Royal bridal package: full elbow mehndi on both arms plus matching intricate bridal feet work."
      }
    ],
    "maxGuests": 15,
    "includesText": "Includes 100% pure Rajasthani organic Sojat henna, essential aftercare kit, clove steam, and dark stain guarantee.",
    "currency": "INR",
    "enabled": true,
    "configVersion": 1
  }
}
```

#### 2. Public: Calculate Time & Cost
```bash
curl -X POST http://localhost:5000/api/v1/estimator/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "coverageId": "full-elbow",
    "guests": 5
  }'
```
**Response (200 OK):**
```json
{
  "data": {
    "coverage": {
      "id": "full-elbow",
      "label": "Full Elbow Bridal",
      "basePrice": 700000,
      "basePriceFormatted": "₹7,000",
      "baseMinutes": 180
    },
    "guests": {
      "total": 5,
      "additional": 4,
      "pricePerGuest": 50000,
      "pricePerGuestFormatted": "₹500",
      "minutesPerGuest": 30,
      "grossGuestCharges": 200000,
      "grossGuestChargesFormatted": "₹2,000"
    },
    "discount": {
      "applied": true,
      "percent": 10,
      "amount": 20000,
      "amountFormatted": "₹200",
      "netGuestCharges": 180000,
      "netGuestChargesFormatted": "₹1,800",
      "slab": { "minGuests": 5, "percent": 10 }
    },
    "minimumTotal": {
      "applied": false,
      "threshold": 0,
      "thresholdFormatted": "₹0",
      "adjustment": 0,
      "adjustmentFormatted": "₹0"
    },
    "tax": {
      "percent": 0,
      "inclusive": false,
      "amount": 0,
      "amountFormatted": "₹0"
    },
    "time": {
      "baseMinutes": 180,
      "guestMinutes": 120,
      "totalMinutes": 300,
      "lowMinutes": 300,
      "highMinutes": 345,
      "lowHours": 5,
      "highHours": 6,
      "bufferPercent": 15,
      "display": "5 - 6 hrs"
    },
    "pricing": {
      "subtotal": 880000,
      "subtotalFormatted": "₹8,800",
      "grandTotal": 880000,
      "grandTotalFormatted": "₹8,800",
      "currency": "INR"
    },
    "includesText": "Includes 100% pure Rajasthani organic Sojat henna...",
    "configVersion": 1
  }
}
```

#### 3. Public: Submit Enquiry
```bash
curl -X POST http://localhost:5000/api/v1/estimator/enquiry \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Pooja Sharma",
    "phone": "+919876543210",
    "email": "pooja@example.com",
    "eventDate": "2026-12-15",
    "location": "Udaipur, Rajasthan",
    "notes": "Looking forward to customized portraits on the palms",
    "coverageId": "full-elbow",
    "guests": 5
  }'
```
**Response (201 Created):**
```json
{
  "message": "Enquiry submitted successfully. Our team will contact you shortly.",
  "data": {
    "enquiryId": "673998f02914ba0012e873fa",
    "quote": { ... },
    "createdAt": "2026-11-17T12:00:00.000Z"
  }
}
```

#### 4. Admin: Get Full Configuration
```bash
curl -X GET http://localhost:5000/api/v1/admin/estimator/config \
  -H "Authorization: Bearer <ADMIN_JWT_TOKEN>"
```

#### 5. Admin: Update Configuration (Optimistic Lock)
```bash
curl -X PUT http://localhost:5000/api/v1/admin/estimator/config \
  -H "Authorization: Bearer <ADMIN_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "version": 1,
    "currency": "INR",
    "coverages": [ ... ],
    "guestRules": {
      "pricePerGuest": 60000,
      "minutesPerGuest": 30,
      "maxGuests": 20
    },
    "bulkDiscounts": [
      { "minGuests": 5, "percent": 10 },
      { "minGuests": 10, "percent": 20 }
    ],
    "minimumTotal": 300000,
    "tax": { "percent": 5, "inclusive": false },
    "timeBufferPercent": 15,
    "includesText": "Includes organic Rajasthani henna and clove aftercare",
    "enabled": true,
    "changeNote": "Updated guest rate to ₹600 and added 20% discount slab for 10+ guests"
  }'
```

#### 6. Admin: Rollback Configuration
```bash
curl -X POST http://localhost:5000/api/v1/admin/estimator/config/rollback/1 \
  -H "Authorization: Bearer <ADMIN_JWT_TOKEN>"
```

#### 7. Admin: Preview Draft Configuration
Test a draft configuration against the calculation engine without persisting to the database:
```bash
curl -X POST http://localhost:5000/api/v1/admin/estimator/preview \
  -H "Authorization: Bearer <ADMIN_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "coverages": [
        {
          "id": "festive-special",
          "label": "Festive Special",
          "basePrice": 350000,
          "baseMinutes": 90,
          "active": true
        }
      ],
      "guestRules": { "pricePerGuest": 50000, "minutesPerGuest": 30, "maxGuests": 15 }
    },
    "coverageId": "festive-special",
    "guests": 1
  }'
```

---

## 📖 Swagger Documentation
Once the server is running, visit:
[http://localhost:5000/api-docs](http://localhost:5000/api-docs)

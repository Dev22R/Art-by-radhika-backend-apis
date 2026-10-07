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

## 📖 Swagger Documentation
Once the server is running, visit:
[http://localhost:5000/api-docs](http://localhost:5000/api-docs)

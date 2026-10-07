const redisService = require('../services/redis.service');
const { addJob, QUEUE_NAMES } = require('../queues/redisQueue');

/**
 * Store a key-value pair in Redis
 */
async function setKey(req, res, next) {
  try {
    const { key, value, ttl } = req.body;
    if (!key || value === undefined) {
      return res.status(400).json({ success: false, message: 'Key and value are required.' });
    }

    const success = await redisService.set(key, value, ttl ? parseInt(ttl, 10) : undefined);
    if (!success) {
      return res.status(500).json({ success: false, message: 'Failed to write to Redis.' });
    }

    res.json({
      success: true,
      message: `Key "${key}" stored successfully.`,
      key,
      ttl: ttl || 'default',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieve a value by key from Redis
 */
async function getKey(req, res, next) {
  try {
    const { key } = req.params;
    const value = await redisService.get(key);
    const ttl = await redisService.ttl(key);

    if (value === null) {
      return res.status(404).json({ success: false, message: `Key "${key}" not found in Redis.` });
    }

    res.json({
      success: true,
      key,
      value,
      ttlRemainingSeconds: ttl,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Delete a key from Redis
 */
async function deleteKey(req, res, next) {
  try {
    const { key } = req.params;
    const count = await redisService.del(key);

    res.json({
      success: true,
      message: count > 0 ? `Key "${key}" deleted.` : `Key "${key}" did not exist.`,
      deletedCount: count,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Simulated heavy data endpoint (demonstrates cache performance speedup)
 */
async function getSlowData(req, res) {
  // Simulate slow external API or heavy database query
  await new Promise((resolve) => setTimeout(resolve, 1500));

  res.json({
    success: true,
    data: [
      { id: 1, title: 'Item Alpha', price: 99.99 },
      { id: 2, title: 'Item Beta', price: 149.5 },
      { id: 3, title: 'Item Gamma', price: 29.0 },
    ],
    generatedAt: new Date().toISOString(),
    note: 'If cached, this response will return in <5ms with header X-Cache: HIT',
  });
}

/**
 * Enqueue a BullMQ background task
 */
async function triggerQueueJob(req, res, next) {
  try {
    const { taskTitle, simulateError } = req.body;
    const job = await addJob(QUEUE_NAMES.SAMPLE_TASKS, 'process-report', {
      taskTitle: taskTitle || 'Generate monthly report',
      simulateError: Boolean(simulateError),
      submittedAt: new Date().toISOString(),
    });

    res.status(202).json({
      success: true,
      message: 'Background job enqueued successfully via BullMQ.',
      jobId: job.id,
      queue: QUEUE_NAMES.SAMPLE_TASKS,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Publish message to Redis Pub/Sub channel
 */
async function publishMessage(req, res, next) {
  try {
    const { channel = 'notifications', message } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, message: 'Message payload is required.' });
    }

    const receiverCount = await redisService.publish(channel, {
      payload: message,
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: `Message published to channel "${channel}".`,
      listenersReceivedCount: receiverCount,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  setKey,
  getKey,
  deleteKey,
  getSlowData,
  triggerQueueJob,
  publishMessage,
};

const { Queue, Worker, QueueEvents } = require('bullmq');
const config = require('../config/env');

const redisConnection = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password || undefined,
  ...(config.redis.tls ? { tls: {} } : {}),
};

// Queue names
const QUEUE_NAMES = {
  SAMPLE_TASKS: 'sample-task-queue',
  EMAIL_NOTIFICATIONS: 'email-queue',
};

// Active queue instances
const queues = {};
// Active worker instances
const workers = {};

/**
 * Initialize BullMQ queues and workers
 */
function initQueues() {
  try {
    // 1. Initialize Sample Task Queue
    queues[QUEUE_NAMES.SAMPLE_TASKS] = new Queue(QUEUE_NAMES.SAMPLE_TASKS, {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });

    // 2. Initialize Worker for Sample Task Queue
    workers[QUEUE_NAMES.SAMPLE_TASKS] = new Worker(
      QUEUE_NAMES.SAMPLE_TASKS,
      async (job) => {
        console.log(`[BullMQ Worker] Processing Job ID: ${job.id} | Name: ${job.name}`);
        // Simulate task processing (e.g. data processing, email, report generation)
        if (job.data.simulateError) {
          throw new Error('Simulated task error for BullMQ retry demonstration');
        }
        // Work simulation delay
        await new Promise((resolve) => setTimeout(resolve, 800));

        return {
          processedAt: new Date().toISOString(),
          jobId: job.id,
          result: `Successfully processed task: ${job.data.taskTitle || job.name}`,
        };
      },
      {
        connection: redisConnection,
        concurrency: 5,
      }
    );

    // Worker event listeners
    workers[QUEUE_NAMES.SAMPLE_TASKS].on('completed', (job, returnvalue) => {
      console.log(`[BullMQ Worker] Job ${job.id} completed. Result:`, returnvalue);
    });

    workers[QUEUE_NAMES.SAMPLE_TASKS].on('failed', (job, err) => {
      console.error(`[BullMQ Worker] Job ${job?.id} failed with error:`, err.message);
    });

    workers[QUEUE_NAMES.SAMPLE_TASKS].on('error', (err) => {
      console.warn('[BullMQ Worker] Connection notice:', err.message);
    });

    console.log('[BullMQ] Queues and Workers initialized successfully.');
  } catch (error) {
    console.error('[BullMQ] Initialization error:', error.message);
  }
}

/**
 * Helper to add a job to a queue
 */
async function addJob(queueName, jobName, data = {}, options = {}) {
  const queue = queues[queueName];
  if (!queue) {
    throw new Error(`Queue "${queueName}" is not initialized.`);
  }
  return await queue.add(jobName, data, options);
}

/**
 * Gracefully close workers and queues
 */
async function closeQueues() {
  for (const [name, worker] of Object.entries(workers)) {
    try {
      await worker.close();
      console.log(`[BullMQ] Closed worker: ${name}`);
    } catch (e) {
      console.error(`[BullMQ] Error closing worker ${name}:`, e.message);
    }
  }

  for (const [name, queue] of Object.entries(queues)) {
    try {
      await queue.close();
      console.log(`[BullMQ] Closed queue: ${name}`);
    } catch (e) {
      console.error(`[BullMQ] Error closing queue ${name}:`, e.message);
    }
  }
}

module.exports = {
  QUEUE_NAMES,
  initQueues,
  addJob,
  closeQueues,
};

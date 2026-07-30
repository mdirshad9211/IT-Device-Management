import { Queue, Worker, type Job, type WorkerOptions, type QueueOptions } from "bullmq";
import IORedis from "ioredis";
import { env } from "../../../config/env";

/**
 * Shared Redis connection for BullMQ. BullMQ requires maxRetriesPerRequest
 * to be null on the connection it's given — do not reuse this connection
 * for ad-hoc caching without being aware of that constraint; create a
 * separate ioredis client for caching if that's needed later.
 */
export const redisConnection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

export function createQueue<T = unknown>(name: string, options?: Partial<QueueOptions>): Queue<T> {
  return new Queue<T>(name, { connection: redisConnection, ...options });
}

export function createWorker<T = unknown>(
  name: string,
  processor: (job: Job<T>) => Promise<void>,
  options?: Partial<WorkerOptions>
): Worker<T> {
  return new Worker<T>(name, processor, { connection: redisConnection, ...options });
}

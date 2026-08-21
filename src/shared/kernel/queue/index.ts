/**
 * In-process job queue (no Redis). Jobs run asynchronously in the same
 * Node process with simple exponential backoff retries.
 */

export type JobMeta = {
  id: string;
  attemptsMade: number;
  attempts: number;
};

export type JobProcessor<T> = (data: T, meta: JobMeta) => Promise<void>;

export type QueueAddOptions = {
  jobId?: string;
  attempts?: number;
  /** Ignored — kept for call-site compatibility with former BullMQ opts. */
  backoff?: unknown;
  removeOnComplete?: unknown;
  removeOnFail?: unknown;
  repeat?: unknown;
};

type QueueHandle<T> = {
  name: string;
  add: (jobName: string, data: T, options?: QueueAddOptions) => Promise<string>;
  close: () => Promise<void>;
};

type WorkerHandle = {
  close: () => Promise<void>;
};

type RegisteredWorker = {
  processor: JobProcessor<unknown>;
  closed: boolean;
};

const workers = new Map<string, RegisteredWorker>();
const inFlightByJobId = new Set<string>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForWorker(queueName: string, timeoutMs = 10_000): Promise<RegisteredWorker | null> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const worker = workers.get(queueName);
    if (worker && !worker.closed) return worker;
    await sleep(50);
  }
  return workers.get(queueName) ?? null;
}

async function runWithRetries<T>(
  queueName: string,
  jobId: string,
  data: T,
  attempts: number,
): Promise<void> {
  const worker = await waitForWorker(queueName);
  if (!worker || worker.closed) {
    return;
  }

  let attemptsMade = 0;
  while (attemptsMade < attempts) {
    if (worker.closed) return;
    try {
      await worker.processor(data, { id: jobId, attemptsMade, attempts });
      return;
    } catch {
      attemptsMade += 1;
      if (attemptsMade >= attempts) return;
      const delay = Math.min(30_000, 1000 * 2 ** (attemptsMade - 1));
      await sleep(delay);
    }
  }
}

export function createQueue<T = unknown>(name: string): QueueHandle<T> {
  return {
    name,
    async add(_jobName: string, data: T, options?: QueueAddOptions): Promise<string> {
      const jobId = options?.jobId ?? `${name}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
      const attempts = options?.attempts ?? 5;

      if (inFlightByJobId.has(jobId)) {
        return jobId;
      }
      inFlightByJobId.add(jobId);

      void runWithRetries(name, jobId, data, attempts).finally(() => {
        inFlightByJobId.delete(jobId);
      });

      return jobId;
    },
    async close(): Promise<void> {
      /* no-op: workers own shutdown */
    },
  };
}

export function createWorker<T = unknown>(
  name: string,
  processor: JobProcessor<T>,
): WorkerHandle {
  workers.set(name, {
    processor: processor as JobProcessor<unknown>,
    closed: false,
  });

  return {
    async close(): Promise<void> {
      const current = workers.get(name);
      if (current) current.closed = true;
      workers.delete(name);
    },
  };
}

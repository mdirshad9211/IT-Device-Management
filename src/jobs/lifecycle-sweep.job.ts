import type { Job, Queue, Worker } from "bullmq";
import type { Logger } from "pino";
import { createQueue, createWorker } from "../shared/kernel/queue";
import type { LifecycleSweepService } from "../modules/device/device.sweep.service";

export const LIFECYCLE_SWEEP_QUEUE = "lifecycle-sweep";
export const LIFECYCLE_SWEEP_JOB_NAME = "daily";
export const LIFECYCLE_SWEEP_REPEAT_JOB_ID = "lifecycle-sweep-daily";

export type LifecycleSweepHandles = {
  queue: Queue;
  worker: Worker;
};

/**
 * BullMQ wiring only — business logic lives in Device's LifecycleSweepService
 * (no cross-module repository imports from jobs/).
 */
export async function startLifecycleSweepJob(deps: {
  lifecycleSweepService: LifecycleSweepService;
  logger: Logger;
}): Promise<LifecycleSweepHandles> {
  const queue = createQueue(LIFECYCLE_SWEEP_QUEUE);
  const worker = createWorker(LIFECYCLE_SWEEP_QUEUE, async (_job: Job) => {
    await deps.lifecycleSweepService.run();
  });

  await queue.add(
    LIFECYCLE_SWEEP_JOB_NAME,
    {},
    {
      repeat: { pattern: "0 3 * * *" }, // 03:00 UTC daily
      jobId: LIFECYCLE_SWEEP_REPEAT_JOB_ID,
      removeOnComplete: 50,
      removeOnFail: 50,
    },
  );

  deps.logger.info("lifecycle sweep job scheduled (daily 03:00 UTC)");
  return { queue, worker };
}

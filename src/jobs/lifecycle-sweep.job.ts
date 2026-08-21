import type { Logger } from "pino";
import type { LifecycleSweepService } from "../modules/device/device.sweep.service";

export const LIFECYCLE_SWEEP_QUEUE = "lifecycle-sweep";

export type LifecycleSweepHandles = {
  stop: () => void;
};

/**
 * Schedules the daily discard/hard-delete sweep at 03:00 UTC using an
 * in-process timer (no Redis/BullMQ).
 */
export async function startLifecycleSweepJob(deps: {
  lifecycleSweepService: LifecycleSweepService;
  logger: Logger;
}): Promise<LifecycleSweepHandles> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const run = async () => {
    try {
      await deps.lifecycleSweepService.run();
    } catch (error) {
      deps.logger.error({ err: error }, "lifecycle sweep failed");
    }
  };

  const scheduleNext = () => {
    if (stopped) return;
    const now = new Date();
    const next = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3, 0, 0, 0),
    );
    if (next.getTime() <= now.getTime()) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    const delay = next.getTime() - now.getTime();
    timer = setTimeout(() => {
      void run().finally(() => scheduleNext());
    }, delay);
    timer.unref?.();
  };

  scheduleNext();
  deps.logger.info("lifecycle sweep job scheduled (daily 03:00 UTC, in-process)");
  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}

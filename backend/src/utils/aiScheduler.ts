import { abortable } from "./deadline";

type Priority = "interactive" | "background";
type Job = { priority: Priority; run: () => Promise<void>; cancel: () => void };

/** One active request, bounded queue, and fair priority for interactive work. */
export class AiScheduler {
  private queue: Job[] = [];
  private running = false;
  private interactiveBurst = 0;

  schedule<T>(operation: () => Promise<T>, signal: AbortSignal, priority: Priority): Promise<T> {
    signal.throwIfAborted();
    if (this.queue.length >= 100) return Promise.reject(Object.assign(new Error("Embedding queue is busy."), { status: 503 }));
    return new Promise<T>((resolve, reject) => {
      const abort = () => {
        const index = this.queue.indexOf(job);
        if (index >= 0) this.queue.splice(index, 1);
        reject(signal.reason);
      };
      const job: Job = {
        priority,
        cancel: () => signal.removeEventListener("abort", abort),
        run: async () => {
          try { signal.throwIfAborted(); resolve(await abortable(operation(), signal)); }
          catch (error) { reject(error); }
        },
      };
      signal.addEventListener("abort", abort, { once: true });
      this.queue.push(job);
      void this.drain();
    });
  }

  private async drain() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        const preferred = this.interactiveBurst < 3 ? "interactive" : "background";
        let index = this.queue.findIndex(job => job.priority === preferred);
        if (index < 0) index = 0;
        const job = this.queue.splice(index, 1)[0]!;
        this.interactiveBurst = job.priority === "interactive" ? this.interactiveBurst + 1 : 0;
        job.cancel();
        await job.run();
      }
    } finally { this.running = false; }
  }
}

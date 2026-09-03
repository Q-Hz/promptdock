// Serialize mutations through their response reconciliation, not just IPC dispatch.
// A rejected operation must not prevent the next user action from running.
export class MutationQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(action: () => Promise<T>): Promise<T> {
    const result = this.tail.then(action);
    this.tail = result.catch(() => undefined);
    return result;
  }

  async idle(): Promise<void> {
    let current: Promise<unknown>;
    do {
      current = this.tail;
      await current;
    } while (current !== this.tail);
  }
}

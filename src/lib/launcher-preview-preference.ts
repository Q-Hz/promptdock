import { MutationQueue } from "./mutation-queue.ts";

export const LAUNCHER_PREVIEW_PREF_KEY = "launcher.markdownPreviewOpen";

interface PreferenceStorage {
  read(): Promise<string>;
  write(value: string): Promise<void>;
}

export class LauncherPreviewPreference {
  private open = false;
  private dirty = false;
  private revision = 0;
  private readonly writes = new MutationQueue();
  private readonly storage: PreferenceStorage;

  constructor(storage: PreferenceStorage) {
    this.storage = storage;
  }

  restore(): Promise<boolean> {
    const revision = this.revision;
    return this.writes.run(async () => {
      // Keep an unsaved user choice so an unsuccessful write can be retried on exit.
      if (this.dirty) return this.open;
      const open = await this.storage.read() === "true";
      if (revision === this.revision) this.open = open;
      return this.open;
    });
  }

  save(open: boolean): Promise<void> {
    this.open = open;
    this.dirty = true;
    const revision = ++this.revision;
    return this.writes.run(() => this.persist(open, revision));
  }

  flush(): Promise<void> {
    // Queued after every toggle; retry the latest choice if its write failed.
    return this.writes.run(async () => {
      if (this.dirty) await this.persist(this.open, this.revision);
    });
  }

  private async persist(open: boolean, revision: number): Promise<void> {
    await this.storage.write(String(open));
    if (this.revision === revision) this.dirty = false;
  }
}

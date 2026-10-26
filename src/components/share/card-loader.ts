type Entry = { key: string; file: File | null; promise: Promise<File | null> };

export type CardLoader = {
  peek(key: string): File | null;
  load(key: string): Promise<File | null>;
};

export function createCardLoader(fetchCard: () => Promise<File | null>, beforeShare?: () => Promise<void>): CardLoader {
  let entry: Entry | null = null;
  return {
    peek: (key) => (entry?.key === key ? entry.file : null),
    load: (key) => {
      if (entry?.key === key) return entry.promise;
      const next: Entry = { key, file: null, promise: Promise.resolve(null) };
      next.promise = (async () => {
        let file: File | null = null;
        try {
          await beforeShare?.();
          file = await fetchCard();
        } catch {
          file = null;
        }
        next.file = file;
        if (file === null && entry === next) entry = null;
        return file;
      })();
      entry = next;
      return next.promise;
    },
  };
}

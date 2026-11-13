export type LatestResult<T> = { stale: true } | { stale: false; value: T };

/**
 * 非同期処理をラップし、最後に呼び出したものの結果だけを有効とする。
 * それより前の呼び出しは完了（または失敗）しても `{ stale: true }` を返す。
 */
export function latestOnly<A extends unknown[], T>(
  fn: (...args: A) => Promise<T>,
): (...args: A) => Promise<LatestResult<T>> {
  let seq = 0;
  return async (...args) => {
    const id = ++seq;
    try {
      const value = await fn(...args);
      return id === seq ? { stale: false, value } : { stale: true };
    } catch (e) {
      if (id !== seq) return { stale: true };
      throw e;
    }
  };
}

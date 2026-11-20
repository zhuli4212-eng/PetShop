// The original public trial kept one shop per website directory.
export function readLegacyShop() {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  const directory = new URL('./', import.meta.url).pathname;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('petshop-trial:' + directory);
    let missing = false;
    let finished = false;
    let db;
    const deadline = setTimeout(() => finish(null, Error('读取旧店超时。')), 5000);
    function finish(record, error) {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      db?.close();
      if (error) reject(error);
      else resolve(record);
    }
    request.onupgradeneeded = () => {
      missing = true;
      request.transaction.abort();
    };
    request.onerror = () => finish(null, missing ? null : request.error || Error('无法读取旧店。'));
    request.onblocked = () => finish(null, Error('浏览器的旧店正在使用中。'));
    request.onsuccess = () => {
      db = request.result;
      if (finished) {
        db.close();
        return;
      }
      if (!db.objectStoreNames.contains('shop')) return finish(null);
      try {
        const tx = db.transaction('shop', 'readonly');
        const record = tx.objectStore('shop').get('player');
        tx.oncomplete = () => finish(record.result ?? null);
        tx.onabort = () => finish(null, tx.error || Error('无法读取这个浏览器的旧店。'));
      } catch (error) {
        finish(null, error);
      }
    };
  });
}

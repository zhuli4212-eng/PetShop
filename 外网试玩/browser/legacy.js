// The original public trial kept one shop per website directory.
export function readLegacyShop() {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  const directory = new URL('./', import.meta.url).pathname;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('petshop-trial:' + directory);
    let missing = false;
    request.onupgradeneeded = () => {
      missing = true;
      request.transaction.abort();
    };
    request.onerror = () => missing ? resolve(null) : reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('shop')) {
        db.close();
        resolve(null);
        return;
      }
      const tx = db.transaction('shop', 'readonly');
      const record = tx.objectStore('shop').get('player');
      tx.oncomplete = () => {
        db.close();
        resolve(record.result ?? null);
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error || Error('无法读取这个浏览器的旧店。'));
      };
    };
  });
}

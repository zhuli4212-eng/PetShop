const blobs = new Map();
const urls = new Map();

function assetKey(path) {
  const url = new URL(path, document.baseURI);
  return url.origin === location.origin ? url.pathname : '';
}

function packedUrl(path) {
  const key = assetKey(path);
  const blob = blobs.get(key);
  if (!blob) return path;
  if (!urls.has(key)) urls.set(key, URL.createObjectURL(blob));
  return urls.get(key);
}

function releasePackedAsset(path) {
  const key = assetKey(path);
  const url = urls.get(key);
  if (url) URL.revokeObjectURL(url);
  urls.delete(key);
  blobs.delete(key);
}

async function download(part, controller, progress) {
  let idle;
  const activity = () => {
    clearTimeout(idle);
    idle = setTimeout(() => controller.abort(), 90000);
  };
  activity();
  try {
    const response = await fetch(new URL(part.path, document.baseURI), {
      signal: controller.signal, cache: 'force-cache',
    });
    if (!response.ok) throw new Error('游戏资源下载失败。');
    const reader = response.body?.getReader();
    const chunks = [];
    let received = 0;
    if (reader) {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.byteLength;
          activity();
          progress.transferred(part.path, received);
        }
      } finally {
        reader.releaseLock();
      }
    } else {
      const buffer = await response.arrayBuffer();
      chunks.push(buffer);
      received = buffer.byteLength;
      progress.transferred(part.path, received);
    }
    if (received !== part.bytes) throw new Error('游戏资源下载不完整。');
    return new Blob(chunks);
  } finally {
    clearTimeout(idle);
  }
}

export async function preloadGameResources(manifestPath, progress) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch(manifestPath, { signal: controller.signal, cache: 'force-cache' });
    if (!response.ok) throw new Error('无法获取游戏资源清单。');
    const { parts } = await response.json();
    clearTimeout(timer);
    progress.beginResources(parts.reduce((sum, part) => sum + part.bytes, 0));

    const queue = parts.slice();
    async function downloadParts() {
      while (queue.length) {
        const part = queue.shift();
        const content = await download(part, controller, progress);
        let offset = 0;
        for (const [path, size, type] of part.files) {
          blobs.set(assetKey(path), content.slice(offset, offset + size, type));
          offset += size;
        }
        if (offset !== part.bytes) throw new Error('游戏资源清单不匹配。');
      }
    }
    await Promise.all(Array.from({ length: Math.min(parts.length, 3) }, downloadParts));
    progress.prepareGame();

    window.petshopAssetUrl = packedUrl;
    window.petshopReleasePackedAsset = releasePackedAsset;
    window.petshopInstallAssetCache = manager => {
      const downloader = manager.downloader;
      const downloadAsset = downloader.download.bind(downloader);
      downloader.download = (id, url, type, options, complete) =>
        downloadAsset(id, type === '.woff2' || type === '.ttf' ? url : packedUrl(url), type, options, complete);
    };

    const opening = document.getElementById('login-opening').content;
    const images = [document.querySelector('.shopfront'), ...opening.querySelectorAll('img')];
    await Promise.all(images.map(async img => {
      const ready = new Image();
      ready.src = packedUrl(img.dataset.petshopSrc);
      await ready.decode();
      img.src = ready.src;
    }));
    const audio = document.getElementById('login-music');
    audio.src = packedUrl(audio.dataset.petshopSrc);
  } catch (error) {
    controller.abort();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

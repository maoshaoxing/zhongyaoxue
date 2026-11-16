// 中药学备考全书 - Service Worker
// v8：新增病症找药模式（rpc.js）与页面内嵌学习助手（agent.js），预缓存列表随之调整
const CACHE_NAME = 'zhongyaoxue-v8-20261116';
const RUNTIME_CACHE = 'zhongyaoxue-runtime-v8';

const PRECACHE_URLS = [
  '/zhongyaoxue/',
  '/zhongyaoxue/index.html',
  '/zhongyaoxue/manifest.json',
  '/zhongyaoxue/icons/icon-72x72.png',
  '/zhongyaoxue/icons/icon-96x96.png',
  '/zhongyaoxue/icons/icon-128x128.png',
  '/zhongyaoxue/icons/icon-144x144.png',
  '/zhongyaoxue/icons/icon-152x152.png',
  '/zhongyaoxue/icons/icon-192x192.png',
  '/zhongyaoxue/icons/icon-384x384.png',
  '/zhongyaoxue/icons/icon-512x512.png',
  // 药典检索 + 方药研习
  '/zhongyaoxue/clinical/',
  '/zhongyaoxue/clinical/index.html',
  '/zhongyaoxue/clinical/style.css',
  '/zhongyaoxue/clinical/app.js',
  '/zhongyaoxue/clinical/search-worker.js',
  '/zhongyaoxue/clinical/bench.html',
  '/zhongyaoxue/clinical/bench.css',
  '/zhongyaoxue/clinical/bench.js',
  '/zhongyaoxue/clinical/rpc.js',
  '/zhongyaoxue/clinical/agent.js',
  // 教材背诵（旧版，已移入 herbs/）
  '/zhongyaoxue/herbs/index.html',
  '/zhongyaoxue/herbs/style.css',
  '/zhongyaoxue/herbs/app.js',
  '/zhongyaoxue/herbs/data.js',
  '/zhongyaoxue/herbs/songs.js',
];

// 安装：预缓存核心文件。单个失败不应让整个安装失败
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.all(
          PRECACHE_URLS.map((url) =>
            cache.add(url).catch(() => {
              /* 忽略个别资源失败，例如子应用尚未发布 */
            })
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

// 激活：清理旧版本缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isDataRequest(url) {
  return /\.(json|jsonl)$/i.test(url.pathname);
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.status === 200) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  // 有缓存立刻返回，同时后台更新
  return cached || (await network) || new Response('离线状态，请连接网络后重试', {
    status: 503,
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  });
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached =
      (await caches.match(request)) || (await caches.match('/zhongyaoxue/'));
    return (
      cached ||
      new Response('离线状态，请连接网络后重试', {
        status: 503,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      })
    );
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return new Response('离线状态，请连接网络后重试', {
      status: 503,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    });
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 页面导航：网络优先，避免部署后仍看到旧页面
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  // 数据文件：先给缓存，后台静默更新，保证数据改了能看到
  if (isDataRequest(url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // 静态资源：缓存优先
  event.respondWith(cacheFirst(request));
});

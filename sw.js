// 中药学备考神器 - Service Worker
const CACHE_NAME = 'zhongyaoxue-v3-20260531';

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
  '/zhongyaoxue/icons/icon-512x512.png'
];

// 安装：预缓存核心文件
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// 激活：清理旧缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME)
        .map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

// 请求：缓存优先，网络回退
self.addEventListener('fetch', event => {
  // 跳过非GET请求
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    caches.match(event.request).then(cached => {
      // 缓存命中直接返回
      if (cached) return cached;
      
      // 网络请求并缓存
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, clone);
        });
        return response;
      }).catch(() => {
        // 离线时返回缓存首页
        if (event.request.mode === 'navigate') {
          return caches.match('/zhongyaoxue/');
        }
        return new Response('离线状态，请连接网络后重试', {
          status: 503,
          headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
      });
    })
  );
});

/**
 * rpc.js —— 检索 Worker 的共享 RPC 层
 *
 * 页面（app.js）与学习助手（agent.js）复用同一个 Worker 实例，
 * 避免 11.8MB 语料被下载/解析两遍。
 * - ZySearch.ensure()        确保语料加载完成（幂等，多处调用只触发一次 load）
 * - ZySearch.search(q,f,m)   检索（m = "text" 全文 | "symptom" 病症找药）
 * - ZySearch.detail(id)      条目详情
 * - ZySearch.lookup(name)    按名字精确定位一味药 / 一个成方
 * - ZySearch.conflict(names) 配伍禁忌 + 安全信息核查
 * - ZySearch.onProgress(fn)  语料下载进度
 * - ZySearch.onError(fn)     加载失败通知
 *
 * file://（APK 离线壳）下 Worker 不可用，接口返回 null，由调用方降级提示。
 */
(function () {
  "use strict";

  var OFFLINE = location.protocol === "file:";
  var worker = null;
  var seq = 0;
  var loadResolve = null;
  var loadPromise = null;
  var handlers = new Map();
  var progressListeners = [];
  var errorListeners = [];

  function broadcast(list, msg) {
    for (var i = 0; i < list.length; i++) list[i](msg);
  }

  function ensureWorker() {
    if (worker || OFFLINE) return worker;
    try {
      worker = new Worker("search-worker.js");
    } catch (error) {
      worker = null;
      return null;
    }
    worker.onmessage = function (event) {
      var msg = event.data;
      if (msg.type === "progress") {
        broadcast(progressListeners, msg);
        return;
      }
      if (msg.type === "loaded") {
        if (loadResolve) loadResolve(msg.total);
        return;
      }
      if (msg.type === "error" && !handlers.has(msg.requestId)) {
        // 语料加载失败：唤醒所有等待者，并广播给页面状态栏
        if (loadResolve) loadResolve(-1);
        broadcast(errorListeners, msg);
        return;
      }
      var handler = handlers.get(msg.requestId);
      if (handler) {
        handlers.delete(msg.requestId);
        handler(msg);
      }
    };
    worker.onerror = function (event) {
      if (loadResolve) loadResolve(-1);
      broadcast(errorListeners, { type: "error", message: event.message || "Worker 异常" });
    };
    return worker;
  }

  function request(type, payload) {
    var w = ensureWorker();
    if (!w) return Promise.resolve(null);
    var requestId = ++seq;
    return new Promise(function (resolve) {
      handlers.set(requestId, resolve);
      var message = { type: type, requestId: requestId };
      if (payload) {
        for (var key in payload) message[key] = payload[key];
      }
      w.postMessage(message);
    });
  }

  window.ZySearch = {
    offline: OFFLINE,

    ensure: function () {
      if (OFFLINE) return Promise.reject(new Error("offline"));
      if (!loadPromise) {
        loadPromise = new Promise(function (resolve) {
          loadResolve = resolve;
        });
        var w = ensureWorker();
        if (!w) {
          loadResolve(-1);
        } else {
          w.postMessage({ type: "load" });
        }
      }
      return loadPromise;
    },

    onProgress: function (fn) {
      progressListeners.push(fn);
    },

    onError: function (fn) {
      errorListeners.push(fn);
    },

    search: function (query, filter, mode) {
      return request("search", { query: query, filter: filter, mode: mode || "text" });
    },

    detail: function (id) {
      return request("detail", { id: id });
    },

    lookup: function (name) {
      return request("lookup", { query: name });
    },

    conflict: function (names) {
      return request("conflict", { names: names });
    },
  };
})();

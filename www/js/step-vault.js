/* Зашифрованное хранилище записей шага.
   Ключ AES-GCM выводится из парольной фразы (PBKDF2-SHA-256) и живёт только в памяти.
   Это не Android Keystore: стойкость зависит от длины фразы. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StepVault = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var META = 'meta';
  var PREFIX = 'r:';
  var CHECK = 'steps-vault-check';
  var MIN_PASS = 6;
  var enc = new TextEncoder();
  var dec = new TextDecoder();

  function b64(buffer) {
    var bytes = new Uint8Array(buffer), s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function unb64(s) {
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function create(backend, opts) {
    opts = opts || {};
    var cryptoApi = opts.crypto || globalThis.crypto;
    var subtle = cryptoApi && cryptoApi.subtle;
    var iterations = opts.iterations || 600000;
    var key = null;
    var listeners = [];

    function emit() {
      listeners.slice().forEach(function (fn) { try { fn(key ? 'open' : 'locked'); } catch (e) { /* слушатель не должен ломать хранилище */ } });
    }
    function need() {
      if (!key) throw Error('Тетрадь закрыта');
      return key;
    }
    async function derive(pass, salt, iters) {
      var material = await subtle.importKey('raw', enc.encode(pass.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
      return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: iters }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    }
    /* Имя записи входит в проверяемые данные: шифротекст нельзя подставить под другое имя. */
    async function seal(k, name, value) {
      var iv = cryptoApi.getRandomValues(new Uint8Array(12));
      var data = await subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: enc.encode(name) }, k, enc.encode(JSON.stringify(value)));
      return { iv: b64(iv), data: b64(data) };
    }
    async function unseal(k, name, rec) {
      var plain = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(rec.iv), additionalData: enc.encode(name) }, k, unb64(rec.data));
      return JSON.parse(dec.decode(plain));
    }

    return {
      isOpen: function () { return !!key; },
      onchange: function (fn) { listeners.push(fn); },
      state: async function () {
        if (!subtle) return 'unsupported';
        if (key) return 'open';
        return (await backend.get(META)) ? 'locked' : 'none';
      },
      create: async function (pass) {
        if (!subtle) throw Error('Шифрование недоступно в этом окружении');
        if (typeof pass !== 'string' || Array.from(pass).length < MIN_PASS) throw Error('Фраза должна быть не короче ' + MIN_PASS + ' знаков');
        if (await backend.get(META)) throw Error('Тетрадь уже создана');
        var salt = cryptoApi.getRandomValues(new Uint8Array(16));
        var k = await derive(pass, salt, iterations);
        await backend.put(META, { v: 1, kdf: 'PBKDF2-SHA-256', iterations: iterations, salt: b64(salt), check: await seal(k, META, CHECK) });
        key = k;
        emit();
      },
      unlock: async function (pass) {
        var meta = await backend.get(META);
        if (!meta) throw Error('Тетрадь ещё не создана');
        if (typeof pass !== 'string' || !(meta.iterations >= 1000 && meta.iterations <= 10000000)) return false;
        try {
          var k = await derive(pass, unb64(meta.salt), meta.iterations);
          if ((await unseal(k, META, meta.check)) !== CHECK) return false;
          key = k;
        } catch (e) {
          return false;
        }
        emit();
        return true;
      },
      lock: function () {
        if (!key) return;
        key = null;
        emit();
      },
      get: async function (name) {
        var k = need(), rec = await backend.get(PREFIX + name);
        return rec ? unseal(k, name, rec) : null;
      },
      put: async function (name, value) {
        var k = need();
        await backend.put(PREFIX + name, await seal(k, name, value));
      },
      remove: async function (name) {
        need();
        await backend.delete(PREFIX + name);
      },
      names: async function (prefix) {
        need();
        var full = PREFIX + (prefix || '');
        return (await backend.keys()).filter(function (k) { return k.startsWith(full); }).map(function (k) { return k.slice(PREFIX.length); });
      },
      destroy: async function () {
        key = null;
        await backend.clear();
        emit();
      }
    };
  }

  function memoryBackend() {
    var map = new Map();
    return {
      get: async function (k) { return map.has(k) ? JSON.parse(map.get(k)) : null; },
      put: async function (k, v) { map.set(k, JSON.stringify(v)); },
      delete: async function (k) { map.delete(k); },
      keys: async function () { return Array.from(map.keys()); },
      clear: async function () { map.clear(); }
    };
  }

  function idbBackend(name) {
    var opening = null;
    function db() {
      if (!opening) {
        opening = new Promise(function (resolve, reject) {
          var req = indexedDB.open(name, 1);
          req.onupgradeneeded = function () { req.result.createObjectStore('kv'); };
          req.onsuccess = function () { resolve(req.result); };
          req.onerror = function () { opening = null; reject(req.error || Error('Хранилище недоступно')); };
        });
      }
      return opening;
    }
    function run(mode, fn) {
      return db().then(function (d) {
        return new Promise(function (resolve, reject) {
          var tx = d.transaction('kv', mode), req = fn(tx.objectStore('kv'));
          tx.oncomplete = function () { resolve(req.result); };
          tx.onerror = tx.onabort = function () { reject(tx.error || Error('Не удалось записать данные')); };
        });
      });
    }
    return {
      get: function (k) { return run('readonly', function (s) { return s.get(k); }).then(function (v) { return v === undefined ? null : v; }); },
      put: function (k, v) { return run('readwrite', function (s) { return s.put(v, k); }); },
      delete: function (k) { return run('readwrite', function (s) { return s.delete(k); }); },
      keys: function () { return run('readonly', function (s) { return s.getAllKeys(); }); },
      clear: function () { return run('readwrite', function (s) { return s.clear(); }); }
    };
  }

  return { create: create, memoryBackend: memoryBackend, idbBackend: idbBackend, minPass: MIN_PASS };
});

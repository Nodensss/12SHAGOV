export const STORAGE_KEY = '12shagov-v2';
export const PREFERENCES_KEY = '12shagov-prefs-v2';
const LEGACY_KEY = 'svoy-put-12-mvp-v1';
// Дневник и прогресс сюжетной игры (public/game). Удаляются вместе с личными данными.
const GAME_KEY = '12shagov-game-v1';
const ITERATIONS = 210000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function failure(code, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

function read(storage, key) {
  try { return storage.getItem(key); }
  catch (cause) { throw failure('STORAGE_UNAVAILABLE', 'Браузер не разрешает читать локальные данные.', cause); }
}

function write(storage, key, value) {
  try { storage.setItem(key, value); }
  catch (cause) { throw failure('STORAGE_UNAVAILABLE', 'Не удалось сохранить данные. Проверьте свободное место и доступ к хранилищу браузера.', cause); }
}

function parse(value) {
  try { return JSON.parse(value); }
  catch (cause) { throw failure('DATA_CORRUPT', 'Не удалось прочитать локальные данные. Существующая запись сохранена без изменений.', cause); }
}

function encode(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decode(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function validatePin(pin) {
  if (typeof pin !== 'string' || !/^\d{4,12}$/.test(pin)) {
    throw failure('INVALID_PIN', 'Используйте PIN из 4–12 цифр.');
  }
}

function validateEnvelope(envelope) {
  if (!envelope || envelope.version !== 2 || typeof envelope.encrypted !== 'boolean') {
    throw failure('DATA_CORRUPT', 'Формат локальной записи не поддерживается. Существующие данные не изменены.');
  }
  if (envelope.encrypted && (
    envelope.kdf?.name !== 'PBKDF2' || envelope.kdf?.hash !== 'SHA-256' ||
    envelope.kdf?.iterations !== ITERATIONS || typeof envelope.kdf?.salt !== 'string' ||
    envelope.cipher?.name !== 'AES-GCM' || typeof envelope.cipher?.iv !== 'string' ||
    typeof envelope.cipher?.ciphertext !== 'string'
  )) {
    throw failure('DATA_CORRUPT', 'Параметры защищённой записи повреждены. Существующие данные не изменены.');
  }
  return envelope;
}

/**
 * All data methods return promises. hasPin()/isLocked() are synchronous.
 * load() returns null on a new installation and throws LOCKED for a locked vault.
 * lock() forgets the in-memory key; only unlock(pin) can reopen an encrypted vault.
 * The optional adapters make the module usable in isolated tests and offline.
 */
export function createStore(storage = globalThis.localStorage, crypto = globalThis.crypto) {
  let envelope = null;
  let key = null;
  let snapshot = null;
  let queue = Promise.resolve();

  const initial = read(storage, STORAGE_KEY);
  let expectedRaw = initial;
  let stale = false;
  if (initial !== null) envelope = validateEnvelope(parse(initial));

  function assertCurrent() {
    if (stale || read(storage, STORAGE_KEY) !== expectedRaw) {
      stale = true;
      key = null;
      snapshot = null;
      throw failure('STALE_STATE', 'Локальные записи изменились в другой вкладке. Перезагрузите приложение, чтобы открыть актуальную версию.');
    }
  }

  function serialized(operation) {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  }

  function requireCrypto() {
    if (!crypto?.subtle || typeof crypto.getRandomValues !== 'function') {
      throw failure('CRYPTO_UNAVAILABLE', 'Защита PIN доступна в современном браузере на localhost или HTTPS.');
    }
  }

  async function derive(pin, salt) {
    requireCrypto();
    const material = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  }

  async function decrypt(pin) {
    validatePin(pin);
    if (!envelope?.encrypted) return { data: await loadData(), key: null };
    let derived;
    let plaintext;
    try {
      const salt = decode(envelope.kdf.salt);
      const iv = decode(envelope.cipher.iv);
      if (salt.length !== 16 || iv.length !== 12) throw new Error('Invalid encryption parameters');
      derived = await derive(pin, salt);
      plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv }, derived, decode(envelope.cipher.ciphertext),
      );
    } catch (cause) {
      if (cause.code === 'CRYPTO_UNAVAILABLE') throw cause;
      throw failure('WRONG_PIN', 'PIN не подходит или защищённая запись повреждена. Данные не изменены.', cause);
    }
    return { data: parse(decoder.decode(plaintext)), key: derived };
  }

  async function encryptedEnvelope(data, encryptionKey, salt) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, encryptionKey, encoder.encode(JSON.stringify(data)));
    return {
      version: 2, encrypted: true,
      kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt },
      cipher: { name: 'AES-GCM', iv: encode(iv), ciphertext: encode(encrypted) },
    };
  }

  function commit(next, data) {
    // Recheck after asynchronous encryption. A tab opened before another tab
    // enabled PIN must never replace that encrypted record with plaintext.
    assertCurrent();
    const raw = JSON.stringify(next);
    write(storage, STORAGE_KEY, raw);
    expectedRaw = raw;
    envelope = next;
    snapshot = clone(data);
    // The legacy key contains plaintext. Remove it only after a successful write.
    try { storage.removeItem(LEGACY_KEY); }
    catch (cause) {
      // Refuse to claim protection if a legacy plaintext copy could not be removed.
      if (next.encrypted && read(storage, LEGACY_KEY) !== null) {
        throw failure('STORAGE_UNAVAILABLE', 'Защищённая копия создана, но браузер не разрешил удалить старый незашифрованный черновик. Закройте приложение и проверьте настройки браузера.', cause);
      }
    }
  }

  async function loadData() {
    assertCurrent();
    if (envelope?.encrypted) {
      if (!key) throw failure('LOCKED', 'Введите PIN, чтобы открыть личные записи.');
      return clone(snapshot);
    }
    if (envelope) {
      snapshot = clone(envelope.data ?? null);
      return clone(snapshot);
    }
    const legacy = read(storage, LEGACY_KEY);
    if (legacy === null) return null;
    const data = parse(legacy);
    commit({ version: 2, encrypted: false, data }, data);
    return clone(data);
  }

  return {
    load() { return serialized(loadData); },

    save(data) {
      // Snapshot immediately, before a queued encryption operation can run.
      const pending = clone(data);
      return serialized(async () => {
        assertCurrent();
        if (envelope?.encrypted && !key) throw failure('LOCKED', 'Сначала откройте записи с помощью PIN.');
        const next = envelope?.encrypted
          ? await encryptedEnvelope(pending, key, envelope.kdf.salt)
          : { version: 2, encrypted: false, data: pending };
        commit(next, pending);
      });
    },

    setPin(pin) {
      return serialized(async () => {
        validatePin(pin);
        const data = await loadData();
        requireCrypto();
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const derived = await derive(pin, salt);
        const next = await encryptedEnvelope(data, derived, encode(salt));
        commit(next, data);
        key = derived;
      });
    },

    unlock(pin) {
      return serialized(async () => {
        assertCurrent();
        if (!envelope?.encrypted) return loadData();
        const opened = await decrypt(pin);
        assertCurrent();
        key = opened.key;
        snapshot = clone(opened.data);
        return clone(snapshot);
      });
    },

    lock() {
      return serialized(async () => { key = null; snapshot = null; });
    },

    removePin(pin) {
      return serialized(async () => {
        assertCurrent();
        if (!envelope?.encrypted) return;
        const opened = await decrypt(pin);
        commit({ version: 2, encrypted: false, data: opened.data }, opened.data);
        key = null;
      });
    },

    clear() {
      return serialized(async () => {
        assertCurrent();
        try { storage.removeItem(STORAGE_KEY); storage.removeItem(LEGACY_KEY); storage.removeItem(GAME_KEY); }
        catch (cause) { throw failure('STORAGE_UNAVAILABLE', 'Браузер не разрешил удалить локальные записи.', cause); }
        expectedRaw = null;
        key = null; snapshot = null; envelope = null;
      });
    },

    isLocked() { return stale || !!(envelope?.encrypted && !key); },
    hasPin() { return !!envelope?.encrypted; },
  };
}

export function loadPreferences(storage = globalThis.localStorage) {
  const value = read(storage, PREFERENCES_KEY);
  if (value === null) return {};
  try {
    const preferences = JSON.parse(value);
    return preferences && typeof preferences === 'object' && !Array.isArray(preferences) ? preferences : {};
  } catch { return {}; }
}

export function savePreferences(preferences, storage = globalThis.localStorage) {
  write(storage, PREFERENCES_KEY, JSON.stringify(preferences));
}

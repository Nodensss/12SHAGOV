import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createStore, STORAGE_KEY, loadPreferences, savePreferences } from '../public/storage.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const notes = { drafts: { 8: { text: 'Личный разговор, только для меня' } }, lastStep: 8 };

test('PIN encrypts the whole record, survives reload and rejects an incorrect PIN without mutation', async () => {
  const disk = new MemoryStorage();
  const store = createStore(disk, webcrypto);
  await store.save(notes);
  await store.setPin('123456');
  const saved = disk.getItem(STORAGE_KEY);
  assert.equal(saved.includes('Личный разговор'), false);
  assert.equal(saved.includes('123456'), false);
  assert.equal(JSON.parse(saved).encrypted, true);
  assert.equal(store.hasPin(), true);
  assert.equal(store.isLocked(), false);
  const reopened = createStore(disk, webcrypto);
  assert.equal(reopened.isLocked(), true);
  await assert.rejects(reopened.load(), { code: 'LOCKED' });
  await assert.rejects(reopened.unlock('654321'), { code: 'WRONG_PIN' });
  assert.equal(disk.getItem(STORAGE_KEY), saved);
  assert.equal(reopened.isLocked(), true);
  assert.deepEqual(await reopened.unlock('123456'), notes);
  assert.deepEqual(await reopened.load(), notes);
});

test('saves use fresh IVs, preserve latest queued draft and reject writes while locked', async () => {
  const disk = new MemoryStorage();
  const store = createStore(disk, webcrypto);
  await store.save(notes);
  await store.setPin('1122');
  const oldIV = JSON.parse(disk.getItem(STORAGE_KEY)).cipher.iv;
  const draft = { note: 'первый' };
  const first = store.save(draft);
  draft.note = 'второй';
  const second = store.save(draft);
  draft.note = 'внешнее изменение после вызова';
  await Promise.all([first, second]);
  assert.notEqual(JSON.parse(disk.getItem(STORAGE_KEY)).cipher.iv, oldIV);
  assert.deepEqual(await store.load(), { note: 'второй' });
  await store.lock();
  const previous = disk.getItem(STORAGE_KEY);
  await assert.rejects(store.save({ note: 'нельзя' }), { code: 'LOCKED' });
  assert.equal(disk.getItem(STORAGE_KEY), previous);
  assert.deepEqual(await store.unlock('1122'), { note: 'второй' });
});

test('removing protection verifies PIN and keeps drafts; clear removes encrypted and legacy data', async () => {
  const disk = new MemoryStorage();
  const store = createStore(disk, webcrypto);
  await store.save(notes);
  await store.setPin('1234');
  const before = disk.getItem(STORAGE_KEY);
  await assert.rejects(store.removePin('4321'), { code: 'WRONG_PIN' });
  assert.equal(disk.getItem(STORAGE_KEY), before);
  await store.removePin('1234');
  assert.equal(store.hasPin(), false);
  assert.deepEqual(await createStore(disk, webcrypto).load(), notes);
  disk.setItem('svoy-put-12-mvp-v1', JSON.stringify({ legacy: true }));
  await store.clear();
  assert.equal(disk.getItem(STORAGE_KEY), null);
  assert.equal(disk.getItem('svoy-put-12-mvp-v1'), null);
  assert.equal(store.hasPin(), false);
  assert.deepEqual(await store.load(), null);
});

test('legacy migration writes new format before deleting source and does not overwrite an existing vault', async () => {
  const disk = new MemoryStorage();
  disk.setItem('svoy-put-12-mvp-v1', JSON.stringify(notes));
  assert.deepEqual(await createStore(disk, webcrypto).load(), notes);
  assert.equal(disk.getItem('svoy-put-12-mvp-v1'), null);
  const failingDisk = new MemoryStorage();
  failingDisk.setItem('svoy-put-12-mvp-v1', JSON.stringify(notes));
  failingDisk.setItem = () => { throw new Error('Quota exceeded'); };
  await assert.rejects(createStore(failingDisk, webcrypto).load(), { code: 'STORAGE_UNAVAILABLE' });
  assert.notEqual(failingDisk.getItem('svoy-put-12-mvp-v1'), null);
  disk.setItem('svoy-put-12-mvp-v1', JSON.stringify({ unwanted: true }));
  assert.deepEqual(await createStore(disk, webcrypto).load(), notes);
});

test('preferences remain separate and invalid PIN or corrupt data do not replace existing notes', async () => {
  const disk = new MemoryStorage();
  const store = createStore(disk, webcrypto);
  await store.save(notes);
  const before = disk.getItem(STORAGE_KEY);
  await assert.rejects(store.setPin('12'), { code: 'INVALID_PIN' });
  assert.equal(disk.getItem(STORAGE_KEY), before);
  savePreferences({ font: 125, contrast: true }, disk);
  assert.deepEqual(loadPreferences(disk), { font: 125, contrast: true });
  disk.setItem(STORAGE_KEY, 'not-json');
  assert.throws(() => createStore(disk, webcrypto), { code: 'DATA_CORRUPT' });
  assert.equal(disk.getItem(STORAGE_KEY), 'not-json');
});

test('an older unprotected tab cannot overwrite a PIN enabled in another tab', async () => {
  const disk = new MemoryStorage();
  const first = createStore(disk, webcrypto);
  await first.save(notes);
  const second = createStore(disk, webcrypto);
  assert.deepEqual(await second.load(), notes);
  await first.setPin('1234');
  const encrypted = disk.getItem(STORAGE_KEY);
  await assert.rejects(second.save({ private: 'plaintext from old tab' }), { code: 'STALE_STATE' });
  assert.equal(second.isLocked(), true);
  assert.equal(disk.getItem(STORAGE_KEY), encrypted);
  await assert.rejects(second.clear(), { code: 'STALE_STATE' });
  assert.equal(disk.getItem(STORAGE_KEY), encrypted);
  const refreshed = createStore(disk, webcrypto);
  assert.equal(refreshed.hasPin(), true);
  assert.deepEqual(await refreshed.unlock('1234'), notes);
});

test('a concurrent update during PIN derivation is not silently overwritten', async () => {
  const disk = new MemoryStorage();
  const first = createStore(disk, webcrypto);
  await first.save(notes);
  let resume;
  let entered;
  const derivationStarted = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { resume = resolve; });
  const pausedCrypto = {
    getRandomValues: array => webcrypto.getRandomValues(array),
    subtle: {
      importKey: (...args) => webcrypto.subtle.importKey(...args),
      async deriveKey(...args) { entered(); await gate; return webcrypto.subtle.deriveKey(...args); },
      encrypt: (...args) => webcrypto.subtle.encrypt(...args),
      decrypt: (...args) => webcrypto.subtle.decrypt(...args),
    },
  };
  const second = createStore(disk, pausedCrypto);
  const enablingPin = second.setPin('9876');
  await derivationStarted;
  const latest = { drafts: { 1: { text: 'latest from first tab' } } };
  await first.save(latest);
  const latestRaw = disk.getItem(STORAGE_KEY);
  resume();
  await assert.rejects(enablingPin, { code: 'STALE_STATE' });
  assert.equal(disk.getItem(STORAGE_KEY), latestRaw);
  assert.deepEqual(await createStore(disk, webcrypto).load(), latest);
});

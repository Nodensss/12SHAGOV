const MAX_TEXT = 100000;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const MAX_MAP_ITEMS = 300;

export function freshState() {
  return { drafts: {}, lastStep: 0, visitCount: {}, contacts: [], bookmarks: {}, daily: {} };
}

function plain(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function safeKey(key) {
  return typeof key === 'string' && key.length > 0 && key.length <= 200 && !FORBIDDEN_KEYS.has(key);
}

function ownEntries(value, limit = MAX_MAP_ITEMS) {
  if (!plain(value)) return [];
  // JSON imports cannot contain accessors. Excluding them also keeps the pure
  // normalizer safe for callers passing an object directly.
  return Object.entries(Object.getOwnPropertyDescriptors(value))
    .filter(([key, descriptor]) => safeKey(key) && Object.hasOwn(descriptor, 'value'))
    .slice(0, limit)
    .map(([key, descriptor]) => [key, descriptor.value]);
}

function property(value, key) {
  if (!plain(value) || !safeKey(key)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
}

function stringMap(value, limit = MAX_TEXT) {
  return Object.fromEntries(ownEntries(value).filter(([, item]) => typeof item === 'string').map(([key, item]) => [key, item.slice(0, limit)]));
}

function booleanMap(value) {
  return Object.fromEntries(ownEntries(value).filter(([, item]) => typeof item === 'boolean'));
}

function selectionMap(value) {
  const output = {};
  for (const [key, item] of ownEntries(value)) {
    if (typeof item === 'string') output[key] = item.slice(0, 10000);
    else if (Array.isArray(item)) output[key] = item.filter(item => typeof item === 'string').slice(0, 50).map(item => item.slice(0, 10000));
  }
  return output;
}

function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + 'T12:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function timestamp(value) {
  return typeof value === 'string' && value.length <= 64 && /^\d{4}-\d{2}-\d{2}T/.test(value) && validDay(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
}

function stepKey(value) {
  return /^(?:[1-9]|1[0-2])$/.test(value);
}

export function normalizeDraft(value) {
  const input = plain(value) ? value : {};
  const output = {
    fields: stringMap(property(input, 'fields')),
    answers: stringMap(property(input, 'answers')),
    skipped: booleanMap(property(input, 'skipped')),
    selections: selectionMap(property(input, 'selections')),
    cardLanes: stringMap(property(input, 'cardLanes'), 100),
    zoneCards: stringMap(property(input, 'zoneCards'), 100),
    entries: [],
  };
  const entries = property(input, 'entries');
  if (Array.isArray(entries)) {
    for (const entry of entries.slice(0, 1000)) {
      if (!plain(entry)) continue;
      const clean = {};
      for (const key of ['id', 'who', 'what', 'understand', 'createdAt']) {
        const item = property(entry, key);
        if (typeof item === 'string') clean[key] = item.slice(0, key === 'id' ? 200 : MAX_TEXT);
      }
      if (['who', 'what', 'understand'].some(key => typeof clean[key] === 'string')) output.entries.push(clean);
    }
  }
  for (const key of ['opened', 'savedAt']) {
    const item = property(input, key);
    if (timestamp(item)) output[key] = item;
  }
  const position = property(input, 'readPosition');
  if (typeof position === 'number' && Number.isFinite(position) && position >= 0) output.readPosition = position;
  const dates = property(input, 'checkinDates');
  if (Array.isArray(dates)) output.checkinDates = [...new Set(dates.filter(validDay))].slice(-3660);
  return output;
}

export function normalize(data) {
  const clean = freshState();
  if (!plain(data)) return clean;
  for (const [key, value] of ownEntries(property(data, 'drafts'))) {
    if (stepKey(key) && plain(value)) clean.drafts[key] = normalizeDraft(value);
  }
  for (const [key, value] of ownEntries(property(data, 'visitCount'))) {
    if (stepKey(key) && Number.isSafeInteger(value) && value >= 0) clean.visitCount[key] = Math.min(value, 1000000);
  }
  for (const [key, value] of ownEntries(property(data, 'bookmarks'))) {
    if (stepKey(key) && typeof value === 'boolean') clean.bookmarks[key] = value;
  }
  const lastStep = property(data, 'lastStep');
  if ((typeof lastStep === 'number' || typeof lastStep === 'string') && stepKey(String(lastStep))) clean.lastStep = Number(lastStep);
  const contacts = property(data, 'contacts');
  if (Array.isArray(contacts)) {
    for (const contact of contacts) {
      if (clean.contacts.length >= 20) break;
      const name = property(contact, 'name'), detail = property(contact, 'detail');
      if (typeof name === 'string' && typeof detail === 'string') clean.contacts.push({ name: name.slice(0, 80), detail: detail.slice(0, 160) });
    }
  }
  for (const [key, value] of ownEntries(property(data, 'daily'), 36600)) {
    if (validDay(key) && plain(value)) clean.daily[key] = normalizeDraft(value);
  }
  return clean;
}

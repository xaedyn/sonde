// src/lib/history/indexeddb-history.ts
// Browser IndexedDB adapter for local session history.

import type { HistorySessionSummary } from './session-summary';

const DB_NAME = 'chronoscope-history';
const DB_VERSION = 1;
const STORE_NAME = 'sessions';
const CREATED_AT_INDEX = 'createdAt';
const DEFAULT_LIMIT = 100;
const DEFAULT_MAX_SESSIONS = 100;
const DEFAULT_MAX_AGE_DAYS = 30;

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

async function openHistoryDb(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) return null;

  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex(CREATED_AT_INDEX, 'createdAt');
    }
  };

  return requestToPromise(request);
}

export async function saveHistorySession(session: HistorySessionSummary): Promise<boolean> {
  const db = await openHistoryDb();
  if (!db) return false;

  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(STORE_NAME).put(session);
    await done;
    return true;
  } finally {
    db.close();
  }
}

export async function listHistorySessions(limit = DEFAULT_LIMIT): Promise<HistorySessionSummary[]> {
  const db = await openHistoryDb();
  if (!db) return [];

  try {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const done = transactionDone(transaction);
    const index = transaction.objectStore(STORE_NAME).index(CREATED_AT_INDEX);
    const sessions: HistorySessionSummary[] = [];

    await new Promise<void>((resolve, reject) => {
      const request = index.openCursor(null, 'prev');
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || sessions.length >= limit) {
          resolve();
          return;
        }
        sessions.push(cursor.value as HistorySessionSummary);
        cursor.continue();
      };
      request.onerror = () => reject(request.error ?? new Error('IndexedDB cursor failed'));
    });

    await done;
    return sessions;
  } finally {
    db.close();
  }
}

export async function deleteHistorySession(id: string): Promise<boolean> {
  const db = await openHistoryDb();
  if (!db) return false;

  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(STORE_NAME).delete(id);
    await done;
    return true;
  } finally {
    db.close();
  }
}

export async function clearHistorySessions(): Promise<boolean> {
  const db = await openHistoryDb();
  if (!db) return false;

  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(STORE_NAME).clear();
    await done;
    return true;
  } finally {
    db.close();
  }
}

export async function pruneHistorySessions(options: {
  readonly maxSessions?: number;
  readonly maxAgeDays?: number;
} = {}): Promise<boolean> {
  const db = await openHistoryDb();
  if (!db) return false;

  const maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
  const maxAgeMs = (options.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS) * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - maxAgeMs;

  try {
    const all = await listHistorySessions(Number.MAX_SAFE_INTEGER);
    const idsToDelete = all
      .filter((session, index) => index >= maxSessions || session.createdAt < cutoff)
      .map((session) => session.id);
    if (idsToDelete.length === 0) return true;

    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const done = transactionDone(transaction);
    const store = transaction.objectStore(STORE_NAME);
    for (const id of idsToDelete) store.delete(id);
    await done;
    return true;
  } finally {
    db.close();
  }
}

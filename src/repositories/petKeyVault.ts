// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

const DB_NAME = "klinok-pet-keys-v2";
const STORE = "keys";

interface StoredPetKey { version: number; jwk: JsonWebKey }

function indexedDbError(error: DOMException | null, fallback: string): Error {
  return error ?? new Error(fallback);
}

async function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function putPetKey(accountId: string, petId: string, version: number, key: CryptoKey): Promise<void> {
  const value: StoredPetKey = { version, jwk: await crypto.subtle.exportKey("jwk", key) };
  const database = await db();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const storageKey = `${accountId}:${petId}`;
      const current = store.get(storageKey);
      current.onsuccess = () => {
        const stored = current.result as StoredPetKey | undefined;
        if (!stored || stored.version < version) {
          const update = store.put(value, storageKey);
          update.onerror = () => reject(indexedDbError(update.error, "Не удалось сохранить ключ питомца."));
        }
      };
      current.onerror = () => reject(indexedDbError(current.error, "Не удалось прочитать текущий ключ питомца."));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(indexedDbError(tx.error, "Не удалось сохранить ключ питомца."));
      tx.onabort = () => reject(indexedDbError(tx.error, "Сохранение ключа питомца было прервано."));
    });
  } finally {
    database.close();
  }
}

export async function getPetKey(accountId: string, petId: string): Promise<{ version: number; key: CryptoKey } | null> {
  const database = await db();
  let stored: StoredPetKey | null;
  try {
    stored = await new Promise<StoredPetKey | null>((resolve, reject) => {
      const tx = database.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(`${accountId}:${petId}`);
      request.onsuccess = () => resolve((request.result as StoredPetKey | undefined) ?? null);
      request.onerror = () => reject(indexedDbError(request.error, "Не удалось прочитать ключ питомца."));
      tx.onerror = () => reject(indexedDbError(tx.error, "Не удалось прочитать ключ питомца."));
      tx.onabort = () => reject(indexedDbError(tx.error, "Чтение ключа питомца было прервано."));
    });
  } finally {
    database.close();
  }
  if (!stored) return null;
  return {
    version: stored.version,
    key: await crypto.subtle.importKey("jwk", stored.jwk, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]),
  };
}

export async function deletePetKey(accountId: string, petId: string): Promise<void> {
  const database = await db();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(STORE, "readwrite");
      const request = tx.objectStore(STORE).delete(`${accountId}:${petId}`);
      request.onerror = () => reject(indexedDbError(request.error, "Не удалось удалить ключ питомца."));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(indexedDbError(tx.error, "Не удалось удалить ключ питомца."));
      tx.onabort = () => reject(indexedDbError(tx.error, "Удаление ключа питомца было прервано."));
    });
  } finally {
    database.close();
  }
}

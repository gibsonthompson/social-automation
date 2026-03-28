/**
 * Photo Storage — IndexedDB
 * 
 * localStorage can't hold base64 images (5MB limit).
 * IndexedDB handles hundreds of MB.
 * Simple key-value API: get/set/delete per business.
 */

const DB_NAME = 'content_farm_photos';
const DB_VERSION = 1;
const STORE_NAME = 'photos';

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('No window'));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getPhotos(bizId) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get('photos_' + bizId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function savePhotos(bizId, photos) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(photos, 'photos_' + bizId);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('Failed to save photos:', e);
    return false;
  }
}

export async function deletePhotos(bizId) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete('photos_' + bizId);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

/**
 * Get photo metadata only (no base64 data) for sending to the API.
 */
export async function getPhotoManifestForAPI(bizId) {
  const photos = await getPhotos(bizId);
  return photos.map(({ data, ...rest }) => rest);
}
// Photographs stay in this browser; credentials never enter this database.
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("sitewitness-photographs", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("photos");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Photograph storage is blocked"));
  });
}
export async function savePhoto(id: string, photo: Blob): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("photos", "readwrite");
      transaction.objectStore("photos").put(photo, id);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}
export async function loadPhoto(id: string): Promise<Blob | undefined> {
  const db = await database();
  try {
    return await new Promise<Blob | undefined>((resolve, reject) => {
      const request = db
        .transaction("photos", "readonly")
        .objectStore("photos")
        .get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

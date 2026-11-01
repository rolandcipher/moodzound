import { openDB } from 'idb'

// Nombre interno conservado a propósito: renombrarlo vaciaría las bibliotecas ya guardadas.
const dbPromise = openDB('sonora-library', 1, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('tracks')) db.createObjectStore('tracks', { keyPath: 'id' })
    if (!db.objectStoreNames.contains('playlists')) db.createObjectStore('playlists', { keyPath: 'id' })
  }
})

export const getAll = async store => (await dbPromise).getAll(store)
export const put = async (store, value) => (await dbPromise).put(store, value)
export const remove = async (store, key) => (await dbPromise).delete(store, key)

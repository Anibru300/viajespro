/**
 * 3P VIAJESPRO - Database Module v5.0 (Firestore)
 */

console.log('🚀 db.js v5.0 (Firestore) cargando...');

import { db } from './firebase-config.js';
import { 
  collection, doc, setDoc, getDoc, getDocs, deleteDoc, query, where 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

class ViajesProDB {
  constructor() {
    this.initialized = true;
  }

  async init() {
    console.log('✅ Firestore listo (modo online/offline)');
    return true;
  }

  async add(collectionName, data) {
    const docRef = doc(db, collectionName, data.id);
    const dataToSave = {
      ...data,
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await setDoc(docRef, dataToSave);
    console.log(`💾 Guardado en Firestore: ${collectionName}/${data.id}`);
    return dataToSave;
  }

  async get(collectionName, id) {
    const docRef = doc(db, collectionName, id);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() : null;
  }

  async getAll(collectionName) {
    const querySnapshot = await getDocs(collection(db, collectionName));
    const results = [];
    querySnapshot.forEach((doc) => {
      results.push(doc.data());
    });
    return results;
  }

  async update(collectionName, data) {
    const docRef = doc(db, collectionName, data.id);
    const dataToUpdate = {
      ...data,
      updatedAt: new Date().toISOString()
    };
    await setDoc(docRef, dataToUpdate, { merge: true });
    console.log(`💾 Actualizado en Firestore: ${collectionName}/${data.id}`);
    return dataToUpdate;
  }

  async delete(collectionName, id) {
    const docRef = doc(db, collectionName, id);
    await deleteDoc(docRef);
    console.log(`🗑️ Eliminado de Firestore: ${collectionName}/${id}`);
    return id;
  }

  async queryByIndex(collectionName, field, value) {
    const q = query(collection(db, collectionName), where(field, '==', value));
    const querySnapshot = await getDocs(q);
    const results = [];
    querySnapshot.forEach((doc) => {
      results.push(doc.data());
    });
    return results;
  }

  getViajesByVendedor(vendedorId) {
    return this.queryByIndex('viajes', 'vendedorId', vendedorId);
  }

  getGastosByViaje(viajeId) {
    return this.queryByIndex('gastos', 'viajeId', viajeId);
  }
}

const dbInstance = new ViajesProDB();
window.db = dbInstance;

document.addEventListener('DOMContentLoaded', () => {
  dbInstance.init().catch(err => console.error('❌ Error:', err));
});

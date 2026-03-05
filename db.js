/**
 * 3P VIAJESPRO - Database Module v5.0 (Firestore)
 */

console.log('🚀 db.js v5.0 (Firestore) cargando...');

import { 
    collection, doc, setDoc, getDoc, getDocs, deleteDoc, query, where 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db } from './firebase-config.js'; // Asegúrate de que firebase-config.js exporte db

class ViajesProDB {
    constructor() {
        this.initialized = true; // Firestore ya está listo
    }

    async init() {
        console.log('✅ Firestore listo (modo online/offline)');
        return true;
    }

    // Agregar un documento con ID personalizado
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

    // Obtener un documento por ID
    async get(collectionName, id) {
        const docRef = doc(db, collectionName, id);
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? docSnap.data() : null;
    }

    // Obtener todos los documentos de una colección
    async getAll(collectionName) {
        const querySnapshot = await getDocs(collection(db, collectionName));
        const results = [];
        querySnapshot.forEach((doc) => {
            results.push(doc.data());
        });
        return results;
    }

    // Actualizar un documento (merge)
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

    // Eliminar un documento
    async delete(collectionName, id) {
        const docRef = doc(db, collectionName, id);
        await deleteDoc(docRef);
        console.log(`🗑️ Eliminado de Firestore: ${collectionName}/${id}`);
        return id;
    }

    // Consulta por índice (campo igual a valor)
    async queryByIndex(collectionName, field, value) {
        const q = query(collection(db, collectionName), where(field, '==', value));
        const querySnapshot = await getDocs(q);
        const results = [];
        querySnapshot.forEach((doc) => {
            results.push(doc.data());
        });
        return results;
    }

    // Métodos específicos
    getViajesByVendedor(vendedorId) {
        return this.queryByIndex('viajes', 'vendedorId', vendedorId);
    }

    getGastosByViaje(viajeId) {
        return this.queryByIndex('gastos', 'viajeId', viajeId);
    }
}

const dbInstance = new ViajesProDB();
window.db = dbInstance;

// Inicializar al cargar la página
document.addEventListener('DOMContentLoaded', () => {
    dbInstance.init().catch(err => console.error('❌ Error al inicializar db:', err));
});

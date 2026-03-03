/**
 * 3P VIAJESPRO - Database Module v5.0
 * Con sincronización Firebase mejorada
 */

console.log('🚀 db.js v5.0 cargando...');

if (!window.indexedDB) {
    console.error('❌ Tu navegador no soporta IndexedDB');
    alert('Tu navegador no soporta IndexedDB');
}

const DB_NAME = 'ViajesProDB_v5';
const DB_VERSION = 5;

const STORES = {
    VENDEDORES: 'vendedores',
    VIAJES: 'viajes',
    GASTOS: 'gastos',
    FOTOS: 'fotos',
    CONFIG: 'config',
    REPORTES: 'reportes'
};

class ViajesProDB {
    constructor() {
        this.db = null;
        this.initialized = false;
        this.firebaseAvailable = false;
        console.log('📦 ViajesProDB v5.0 creado');
    }

    async init() {
        if (this.initialized && this.db) {
            return this.db;
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            
            request.onerror = () => reject(request.error);
            
            request.onsuccess = async (event) => {
                this.db = event.target.result;
                this.initialized = true;
                
                // Verificar Firebase
                if (typeof window.dbFirebase !== 'undefined') {
                    console.log('🔥 Firebase disponible');
                    this.firebaseAvailable = true;
                    
                    if (window.setupRealtimeListeners) {
                        window.setupRealtimeListeners();
                    }
                    
                    // Sincronizar al iniciar
                    if (window.syncFromFirebase) {
                        console.log('⬇️ Iniciando sincronización...');
                        await window.syncFromFirebase();
                    }
                } else {
                    console.log('⚠️ Firebase no disponible');
                }
                
                await this.seedData();
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                if (!db.objectStoreNames.contains(STORES.VENDEDORES)) {
                    const store = db.createObjectStore(STORES.VENDEDORES, { keyPath: 'id' });
                    store.createIndex('username', 'username', { unique: true });
                }

                if (!db.objectStoreNames.contains(STORES.VIAJES)) {
                    const store = db.createObjectStore(STORES.VIAJES, { keyPath: 'id' });
                    store.createIndex('vendedorId', 'vendedorId', { unique: false });
                    store.createIndex('cliente', 'cliente', { unique: false });
                }

                if (!db.objectStoreNames.contains(STORES.GASTOS)) {
                    const store = db.createObjectStore(STORES.GASTOS, { keyPath: 'id' });
                    store.createIndex('viajeId', 'viajeId', { unique: false });
                    store.createIndex('tipo', 'tipo', { unique: false });
                }

                if (!db.objectStoreNames.contains(STORES.FOTOS)) {
                    const store = db.createObjectStore(STORES.FOTOS, { keyPath: 'id' });
                    store.createIndex('gastoId', 'gastoId', { unique: false });
                }

                if (!db.objectStoreNames.contains(STORES.CONFIG)) {
                    db.createObjectStore(STORES.CONFIG, { keyPath: 'key' });
                }

                if (!db.objectStoreNames.contains(STORES.REPORTES)) {
                    const store = db.createObjectStore(STORES.REPORTES, { keyPath: 'id' });
                    store.createIndex('vendedorId', 'vendedorId', { unique: false });
                }
            };
        });
    }

    async seedData() {
        try {
            const count = await this.count(STORES.VENDEDORES);
            if (count === 0 && !this.firebaseAvailable) {
                console.log('🌱 Modo offline - creando datos de prueba');
                await this.add(STORES.VENDEDORES, {
                    id: 'juan.perez',
                    name: 'Juan Pérez',
                    username: 'juan.perez',
                    password: '123456',
                    email: 'juan@ejemplo.com',
                    zone: 'Centro',
                    status: 'active',
                    createdAt: new Date().toISOString()
                });
            }
        } catch (e) {
            console.warn('⚠️ Error en seedData:', e);
        }
    }

    count(storeName) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([storeName], 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.count();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async add(storeName, data) {
        const dataToAdd = {
            ...data,
            createdAt: data.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([storeName], 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.add(dataToAdd);
            
            request.onsuccess = async () => {
                // Sincronizar con Firebase
                if (window.saveToFirebase) {
                    await window.saveToFirebase(storeName, dataToAdd);
                }
                resolve(dataToAdd);
            };
            request.onerror = () => reject(request.error);
        });
    }

    get(storeName, id) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([storeName], 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    getAll(storeName) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([storeName], 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async update(storeName, data) {
        const dataToUpdate = {
            ...data,
            updatedAt: new Date().toISOString()
        };
        
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([storeName], 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.put(dataToUpdate);
            
            request.onsuccess = async () => {
                if (window.saveToFirebase) {
                    await window.saveToFirebase(storeName, dataToUpdate);
                }
                resolve(dataToUpdate);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async delete(storeName, id) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([storeName], 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.delete(id);
            
            request.onsuccess = async () => {
                if (window.deleteFromFirebase) {
                    await window.deleteFromFirebase(storeName, id);
                }
                resolve(id);
            };
            request.onerror = () => reject(request.error);
        });
    }

    queryByIndex(storeName, indexName, value) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([storeName], 'readonly');
            const store = tx.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(value);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    getViajesByVendedor(vendedorId) {
        return this.queryByIndex(STORES.VIAJES, 'vendedorId', vendedorId);
    }

    getGastosByViaje(viajeId) {
        return this.queryByIndex(STORES.GASTOS, 'viajeId', viajeId);
    }
}

const db = new ViajesProDB();

document.addEventListener('DOMContentLoaded', () => {
    db.init().then(() => {
        window.dispatchEvent(new CustomEvent('dbReady'));
    }).catch(err => {
        console.error('❌ Error:', err);
    });
});

window.db = db;

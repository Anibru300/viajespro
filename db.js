/**
 * 3P VIAJESPRO - Database Module v5.2 (MODO OFFLINE)
 */

console.log('🚀 db.js v5.2 cargando (modo offline)...');

if (!window.indexedDB) {
    alert('Tu navegador no soporta IndexedDB');
}

const DB_NAME = 'ViajesProDB_v5';
const DB_VERSION = 5;

class ViajesProDB {
    constructor() {
        this.db = null;
        this.initialized = false;
        console.log('📦 ViajesProDB v5.2 creado (offline)');
    }

    async init() {
        if (this.initialized) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            
            request.onerror = () => reject(request.error);
            
            request.onsuccess = async (event) => {
                this.db = event.target.result;
                this.initialized = true;
                console.log('✅ IndexedDB lista (modo offline)');
                
                await this.seedData();
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                if (!db.objectStoreNames.contains('vendedores')) {
                    const store = db.createObjectStore('vendedores', { keyPath: 'id' });
                    store.createIndex('username', 'username', { unique: true });
                }
                if (!db.objectStoreNames.contains('viajes')) {
                    const store = db.createObjectStore('viajes', { keyPath: 'id' });
                    store.createIndex('vendedorId', 'vendedorId', { unique: false });
                }
                if (!db.objectStoreNames.contains('gastos')) {
                    const store = db.createObjectStore('gastos', { keyPath: 'id' });
                    store.createIndex('viajeId', 'viajeId', { unique: false });
                }
                if (!db.objectStoreNames.contains('fotos')) {
                    const store = db.createObjectStore('fotos', { keyPath: 'id' });
                    store.createIndex('gastoId', 'gastoId', { unique: false });
                }
                if (!db.objectStoreNames.contains('config')) {
                    db.createObjectStore('config', { keyPath: 'key' });
                }
            };
        });
    }

    async seedData() {
        const count = await this.count('vendedores');
        if (count === 0) {
            console.log('🌱 Creando datos de prueba...');
            await this.add('vendedores', {
                id: 'admin',
                name: 'Administrador',
                username: 'admin',
                password: 'admin123',
                email: 'admin@3p.com',
                zone: 'Centro',
                status: 'active',
                createdAt: new Date().toISOString()
            });
        }
    }

    count(storeName) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([storeName], 'readonly');
            const request = tx.objectStore(storeName).count();
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
            const request = tx.objectStore(storeName).add(dataToAdd);
            request.onsuccess = () => {
                console.log(`💾 Guardado en IndexedDB: ${storeName}/${dataToAdd.id}`);
                resolve(dataToAdd);
            };
            request.onerror = () => reject(request.error);
        });
    }

    get(storeName, id) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([storeName], 'readonly');
            const request = tx.objectStore(storeName).get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    getAll(storeName) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([storeName], 'readonly');
            const request = tx.objectStore(storeName).getAll();
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
            const request = tx.objectStore(storeName).put(dataToUpdate);
            request.onsuccess = () => {
                console.log(`💾 Actualizado en IndexedDB: ${storeName}/${dataToUpdate.id}`);
                resolve(dataToUpdate);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async delete(storeName, id) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([storeName], 'readwrite');
            const request = tx.objectStore(storeName).delete(id);
            request.onsuccess = () => {
                console.log(`🗑️ Eliminado de IndexedDB: ${storeName}/${id}`);
                resolve(id);
            };
            request.onerror = () => reject(request.error);
        });
    }

    queryByIndex(storeName, indexName, value) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([storeName], 'readonly');
            const index = tx.objectStore(storeName).index(indexName);
            const request = index.getAll(value);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    getViajesByVendedor(vendedorId) {
        return this.queryByIndex('viajes', 'vendedorId', vendedorId);
    }

    getGastosByViaje(viajeId) {
        return this.queryByIndex('gastos', 'viajeId', viajeId);
    }
}

const db = new ViajesProDB();

document.addEventListener('DOMContentLoaded', () => {
    db.init().then(() => {
        window.dispatchEvent(new CustomEvent('dbReady'));
    }).catch(err => console.error('❌ Error:', err));
});

window.db = db;

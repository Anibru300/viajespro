/**
 * VIAJESPRO - Database Module
 * IndexedDB for offline-first functionality
 */

const DB_NAME = 'ViajesProDB';
const DB_VERSION = 1;

const STORES = {
    VENDEDORES: 'vendedores',
    VIAJES: 'viajes',
    GASTOS: 'gastos',
    FOTOS: 'fotos',
    SYNC_QUEUE: 'syncQueue'
};

class ViajesProDB {
    constructor() {
        this.db = null;
        this.initPromise = null;
    }

    async init() {
        if (this.initPromise) return this.initPromise;
        
        this.initPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);

            request.onsuccess = () => {
                this.db = request.result;
                console.log('✅ Database opened successfully');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                console.log('🔄 Creating database...');

                // Store: Vendedores
                if (!db.objectStoreNames.contains(STORES.VENDEDORES)) {
                    const store = db.createObjectStore(STORES.VENDEDORES, { keyPath: 'id' });
                    store.createIndex('email', 'email', { unique: true });
                    store.createIndex('nombre', 'nombre', { unique: false });
                }

                // Store: Viajes
                if (!db.objectStoreNames.contains(STORES.VIAJES)) {
                    const store = db.createObjectStore(STORES.VIAJES, { keyPath: 'id' });
                    store.createIndex('vendedorId', 'vendedorId', { unique: false });
                    store.createIndex('fechaInicio', 'fechaInicio', { unique: false });
                    store.createIndex('estado', 'estado', { unique: false });
                }

                // Store: Gastos
                if (!db.objectStoreNames.contains(STORES.GASTOS)) {
                    const store = db.createObjectStore(STORES.GASTOS, { keyPath: 'id' });
                    store.createIndex('viajeId', 'viajeId', { unique: false });
                    store.createIndex('tipo', 'tipo', { unique: false });
                    store.createIndex('fecha', 'fecha', { unique: false });
                }

                // Store: Fotos
                if (!db.objectStoreNames.contains(STORES.FOTOS)) {
                    const store = db.createObjectStore(STORES.FOTOS, { keyPath: 'id' });
                    store.createIndex('gastoId', 'gastoId', { unique: false });
                    store.createIndex('tipo', 'tipo', { unique: false });
                }

                // Store: Sync Queue
                if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
                    const store = db.createObjectStore(STORES.SYNC_QUEUE, { 
                        keyPath: 'id', 
                        autoIncrement: true 
                    });
                    store.createIndex('tipo', 'tipo', { unique: false });
                    store.createIndex('synced', 'synced', { unique: false });
                }
            };
        });

        return this.initPromise;
    }

    // ===== ADD =====
    async add(storeName, data) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            
            data.createdAt = new Date().toISOString();
            data.updatedAt = new Date().toISOString();
            
            const request = store.add(data);
            request.onsuccess = () => resolve(data);
            request.onerror = () => reject(request.error);
        });
    }

    // ===== GET =====
    async get(storeName, id) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // ===== GET ALL =====
    async getAll(storeName) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // ===== UPDATE =====
    async update(storeName, data) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            
            data.updatedAt = new Date().toISOString();
            
            const request = store.put(data);
            request.onsuccess = () => resolve(data);
            request.onerror = () => reject(request.error);
        });
    }

    // ===== DELETE =====
    async delete(storeName, id) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);
            request.onsuccess = () => resolve(id);
            request.onerror = () => reject(request.error);
        });
    }

    // ===== QUERY BY INDEX =====
    async queryByIndex(storeName, indexName, value) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(value);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // ===== SPECIFIC METHODS =====
    async getActiveViajes(vendedorId) {
        const viajes = await this.queryByIndex(STORES.VIAJES, 'vendedorId', vendedorId);
        return viajes.filter(v => v.estado === 'activo');
    }

    async getGastosByViaje(viajeId) {
        return await this.queryByIndex(STORES.GASTOS, 'viajeId', viajeId);
    }

    async getFotosByGasto(gastoId) {
        return await this.queryByIndex(STORES.FOTOS, 'gastoId', gastoId);
    }

    async getResumenGastos(viajeId) {
        const gastos = await this.getGastosByViaje(viajeId);
        const resumen = {
            gasolina: 0,
            comida: 0,
            hotel: 0,
            transporte: 0,
            casetas: 0,
            otros: 0,
            total: 0
        };

        gastos.forEach(gasto => {
            if (resumen.hasOwnProperty(gasto.tipo)) {
                resumen[gasto.tipo] += parseFloat(gasto.monto) || 0;
            }
            resumen.total += parseFloat(gasto.monto) || 0;
        });

        return resumen;
    }

    async addToSyncQueue(tipo, data) {
        const syncItem = {
            tipo: tipo,
            data: data,
            timestamp: new Date().toISOString(),
            synced: false,
            attempts: 0
        };
        
        return await this.add(STORES.SYNC_QUEUE, syncItem);
    }

    async getPendingSync() {
        return await this.queryByIndex(STORES.SYNC_QUEUE, 'synced', false);
    }

    async markAsSynced(syncId) {
        const item = await this.get(STORES.SYNC_QUEUE, syncId);
        if (item) {
            item.synced = true;
            item.syncedAt = new Date().toISOString();
            await this.update(STORES.SYNC_QUEUE, item);
        }
    }

    // ===== EXPORT =====
    async exportAllData(viajeId = null) {
        const data = {
            vendedores: await this.getAll(STORES.VENDEDORES),
            viajes: await this.getAll(STORES.VIAJES),
            gastos: [],
            fotos: []
        };

        if (viajeId) {
            data.viajes = data.viajes.filter(v => v.id === viajeId);
            data.gastos = await this.getGastosByViaje(viajeId);
        } else {
            data.gastos = await this.getAll(STORES.GASTOS);
        }

        for (const gasto of data.gastos) {
            const fotos = await this.getFotosByGasto(gasto.id);
            data.fotos.push(...fotos);
        }

        return data;
    }

    // ===== STATS =====
    async getStats() {
        const stats = {};
        for (const [key, storeName] of Object.entries(STORES)) {
            const data = await this.getAll(storeName);
            stats[storeName] = data.length;
        }
        return stats;
    }
}

// Create global instance
const db = new ViajesProDB();

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    db.init().then(() => {
        console.log('🚀 Database ready');
        window.dispatchEvent(new CustomEvent('dbReady'));
    }).catch(err => {
        console.error('❌ Database initialization failed:', err);
    });
});

// Export for use in other modules
window.ViajesProDB = ViajesProDB;
window.db = db;
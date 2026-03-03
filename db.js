/**
 * 3P VIAJESPRO - Database Module v4.0
 */

console.log('🚀 db.js v4.0 cargando...');

if (!window.indexedDB) {
    alert('Tu navegador no soporta IndexedDB');
}

const DB_NAME = 'ViajesProDB_v4';
const DB_VERSION = 4;

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
    }

    async init() {
        if (this.initialized && this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            
            request.onerror = () => reject(request.error);
            
            request.onsuccess = () => {
                this.db = request.result;
                this.initialized = true;
                this.seedData().then(() => resolve(this.db));
            };

            request.onupgradeneeded = async (event) => {
                const db = event.target.result;
                const oldVersion = event.oldVersion;
                const transaction = event.target.transaction;

                // Crear stores si no existen
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

                // MIGRACIÓN: Si venimos de versión anterior
                if (oldVersion > 0 && oldVersion < 4) {
                    await this.migrateToV4(db, transaction);
                }
            };
        });
    }

    async migrateToV4(db, transaction) {
        console.log('🔄 Migrando datos a v4...');
        
        // Migrar viajes existentes
        if (db.objectStoreNames.contains(STORES.VIAJES)) {
            const store = transaction.objectStore(STORES.VIAJES);
            const viajes = await store.getAll();
            
            for (const viaje of viajes) {
                const actualizado = {
                    ...viaje,
                    cliente: viaje.cliente || 'NO ESPECIFICADO',
                    lugarVisita: viaje.lugarVisita || viaje.destino || 'NO ESPECIFICADO',
                    objetivo: viaje.objetivo || viaje.proposito || '',
                    responsable: viaje.responsable || viaje.vendedorId || '',
                    zona: viaje.zona || 'Centro',
                    updatedAt: new Date().toISOString(),
                    version: 4
                };
                await store.put(actualizado);
            }
            console.log(`✅ ${viajes.length} viajes migrados`);
        }

        // Migrar gastos existentes
        if (db.objectStoreNames.contains(STORES.GASTOS)) {
            const store = transaction.objectStore(STORES.GASTOS);
            const gastos = await store.getAll();
            
            for (const gasto of gastos) {
                const actualizado = {
                    ...gasto,
                    folioFactura: gasto.folioFactura || '',
                    razonSocial: gasto.razonSocial || '',
                    comentarios: gasto.comentarios || '',
                    esFacturable: gasto.esFacturable !== undefined ? gasto.esFacturable : true,
                    fotos: Array.isArray(gasto.fotos) ? gasto.fotos : [],
                    editable: true,
                    updatedAt: new Date().toISOString(),
                    version: 4
                };
                await store.put(actualizado);
            }
            console.log(`✅ ${gastos.length} gastos migrados`);
        }
    }

    async seedData() {
        const count = await this.count(STORES.VENDEDORES);
        if (count === 0) {
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
            console.log('✅ Vendedor de prueba creado');
        }
    }

    // Operaciones CRUD básicas
    async count(storeName) {
        const tx = this.db.transaction([storeName], 'readonly');
        const store = tx.objectStore(storeName);
        return await store.count();
    }

    async add(storeName, data) {
        const tx = this.db.transaction([storeName], 'readwrite');
        const store = tx.objectStore(storeName);
        const dataToAdd = {
            ...data,
            createdAt: data.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        return await store.add(dataToAdd);
    }

    async get(storeName, id) {
        const tx = this.db.transaction([storeName], 'readonly');
        const store = tx.objectStore(storeName);
        return await store.get(id);
    }

    async getAll(storeName) {
        const tx = this.db.transaction([storeName], 'readonly');
        const store = tx.objectStore(storeName);
        return await store.getAll();
    }

    async update(storeName, data) {
        const tx = this.db.transaction([storeName], 'readwrite');
        const store = tx.objectStore(storeName);
        return await store.put({
            ...data,
            updatedAt: new Date().toISOString()
        });
    }

    async delete(storeName, id) {
        const tx = this.db.transaction([storeName], 'readwrite');
        const store = tx.objectStore(storeName);
        return await store.delete(id);
    }

    async queryByIndex(storeName, indexName, value) {
        const tx = this.db.transaction([storeName], 'readonly');
        const store = tx.objectStore(storeName);
        const index = store.index(indexName);
        return await index.getAll(value);
    }

    // Métodos específicos
    async getViajesByVendedor(vendedorId) {
        return await this.queryByIndex(STORES.VIAJES, 'vendedorId', vendedorId);
    }

    async getGastosByViaje(viajeId) {
        return await this.queryByIndex(STORES.GASTOS, 'viajeId', viajeId);
    }
}

const db = new ViajesProDB();

document.addEventListener('DOMContentLoaded', () => {
    db.init().then(() => {
        window.dispatchEvent(new CustomEvent('dbReady'));
    });
});

window.db = db;

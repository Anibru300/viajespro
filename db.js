/**
 * 3P VIAJESPRO - Database Module v4.0
 */

console.log('🚀 db.js v4.0 cargando...');

if (!window.indexedDB) {
    console.error('❌ Tu navegador no soporta IndexedDB');
    alert('Tu navegador no soporta IndexedDB. La aplicación no funcionará correctamente.');
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
        console.log('📦 ViajesProDB v4.0 creado');
    }

    async init() {
        if (this.initialized && this.db) {
            console.log('✅ DB ya inicializada');
            return this.db;
        }

        console.log('🚀 Inicializando DB v4.0...');

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            
            request.onerror = (event) => {
                console.error('❌ Error abriendo DB:', request.error);
                reject(request.error);
            };
            
            request.onsuccess = async (event) => {
                console.log('✅ DB abierta');
                this.db = request.result;
                this.initialized = true;
                
                try {
                    await this.seedData();
                    console.log('✅ DB lista');
                    resolve(this.db);
                } catch (err) {
                    console.warn('Error en seedData:', err);
                    resolve(this.db);
                }
            };

            request.onupgradeneeded = (event) => {
                console.log('⚙️ Migrando base de datos a v4.0...');
                const db = event.target.result;
                const oldVersion = event.oldVersion;
                
                // Crear stores
                if (!db.objectStoreNames.contains(STORES.VENDEDORES)) {
                    const store = db.createObjectStore(STORES.VENDEDORES, { keyPath: 'id' });
                    store.createIndex('username', 'username', { unique: true });
                    console.log('✅ Store vendedores creado');
                }

                if (!db.objectStoreNames.contains(STORES.VIAJES)) {
                    const store = db.createObjectStore(STORES.VIAJES, { keyPath: 'id' });
                    store.createIndex('vendedorId', 'vendedorId', { unique: false });
                    store.createIndex('cliente', 'cliente', { unique: false });
                    console.log('✅ Store viajes creado');
                }

                if (!db.objectStoreNames.contains(STORES.GASTOS)) {
                    const store = db.createObjectStore(STORES.GASTOS, { keyPath: 'id' });
                    store.createIndex('viajeId', 'viajeId', { unique: false });
                    store.createIndex('tipo', 'tipo', { unique: false });
                    console.log('✅ Store gastos creado');
                }

                if (!db.objectStoreNames.contains(STORES.FOTOS)) {
                    const store = db.createObjectStore(STORES.FOTOS, { keyPath: 'id' });
                    store.createIndex('gastoId', 'gastoId', { unique: false });
                    console.log('✅ Store fotos creado');
                }

                if (!db.objectStoreNames.contains(STORES.CONFIG)) {
                    db.createObjectStore(STORES.CONFIG, { keyPath: 'key' });
                    console.log('✅ Store config creado');
                }

                if (!db.objectStoreNames.contains(STORES.REPORTES)) {
                    const store = db.createObjectStore(STORES.REPORTES, { keyPath: 'id' });
                    store.createIndex('vendedorId', 'vendedorId', { unique: false });
                    console.log('✅ Store reportes creado');
                }

                // Nota: La migración de datos se hace en onsuccess, no aquí
                // porque onupgradeneeded no permite operaciones async complejas
            };
        });
    }

    async seedData() {
        try {
            const count = await this.count(STORES.VENDEDORES);
            console.log('📊 Vendedores existentes:', count);
            
            if (count === 0) {
                console.log('🌱 Creando vendedor de prueba...');
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
                console.log('✅ Vendedor de prueba creado (juan.perez / 123456)');
            }
        } catch (e) {
            console.warn('⚠️ Error en seedData:', e);
        }
    }

    // ===== OPERACIONES CRUD =====

    count(storeName) {
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.count();
                
                request.onsuccess = () => {
                    resolve(request.result);
                };
                
                request.onerror = () => {
                    reject(request.error);
                };
            } catch (e) {
                reject(e);
            }
        });
    }

    add(storeName, data) {
        console.log(`➕ Agregando a ${storeName}:`, data.id || 'sin-id');
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                
                const dataToAdd = {
                    ...data,
                    createdAt: data.createdAt || new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    version: 4
                };
                
                const request = store.add(dataToAdd);
                
                request.onsuccess = () => {
                    console.log(`✅ Guardado en ${storeName}:`, data.id);
                    resolve(dataToAdd);
                };
                
                request.onerror = () => {
                    console.error(`❌ Error guardando en ${storeName}:`, request.error);
                    reject(request.error);
                };
            } catch (e) {
                console.error(`❌ Error en add ${storeName}:`, e);
                reject(e);
            }
        });
    }

    get(storeName, id) {
        console.log(`🔍 Buscando en ${storeName}:`, id);
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.get(id);
                
                request.onsuccess = () => {
                    console.log(`🔍 Resultado ${storeName}:`, request.result ? 'ENCONTRADO' : 'NO ENCONTRADO');
                    resolve(request.result);
                };
                
                request.onerror = () => {
                    console.error(`❌ Error buscando en ${storeName}:`, request.error);
                    reject(request.error);
                };
            } catch (e) {
                console.error(`❌ Error en get ${storeName}:`, e);
                reject(e);
            }
        });
    }

    getAll(storeName) {
        console.log(`📋 Obteniendo todos de ${storeName}`);
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.getAll();
                
                request.onsuccess = () => {
                    console.log(`📋 Encontrados en ${storeName}:`, request.result.length);
                    resolve(request.result);
                };
                
                request.onerror = () => {
                    reject(request.error);
                };
            } catch (e) {
                reject(e);
            }
        });
    }

    update(storeName, data) {
        console.log(`📝 Actualizando en ${storeName}:`, data.id);
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                
                const dataToPut = {
                    ...data,
                    updatedAt: new Date().toISOString(),
                    version: 4
                };
                
                const request = store.put(dataToPut);
                
                request.onsuccess = () => {
                    console.log(`✅ Actualizado en ${storeName}:`, data.id);
                    resolve(dataToPut);
                };
                
                request.onerror = () => {
                    reject(request.error);
                };
            } catch (e) {
                reject(e);
            }
        });
    }

    delete(storeName, id) {
        console.log(`🗑️ Eliminando de ${storeName}:`, id);
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.delete(id);
                
                request.onsuccess = () => {
                    console.log(`✅ Eliminado de ${storeName}:`, id);
                    resolve(id);
                };
                
                request.onerror = () => {
                    reject(request.error);
                };
            } catch (e) {
                reject(e);
            }
        });
    }

    queryByIndex(storeName, indexName, value) {
        console.log(`🔍 Query ${storeName} por ${indexName}:`, value);
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const index = store.index(indexName);
                const request = index.getAll(value);
                
                request.onsuccess = () => {
                    resolve(request.result);
                };
                
                request.onerror = () => {
                    reject(request.error);
                };
            } catch (e) {
                reject(e);
            }
        });
    }

    // ===== MÉTODOS ESPECÍFICOS =====

    getVendedorByUsername(username) {
        return this.queryByIndex(STORES.VENDEDORES, 'username', username)
            .then(results => results[0] || null);
    }

    getViajesByVendedor(vendedorId) {
        return this.queryByIndex(STORES.VIAJES, 'vendedorId', vendedorId);
    }

    getGastosByViaje(viajeId) {
        return this.queryByIndex(STORES.GASTOS, 'viajeId', viajeId);
    }
}

// Crear instancia global
const db = new ViajesProDB();

// Inicializar automáticamente
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Inicializando ViajesProDB v4.0...');
    db.init().then(() => {
        console.log('✅ 3P Database v4.0 ready');
        window.dispatchEvent(new CustomEvent('dbReady'));
    }).catch(err => {
        console.error('❌ Database initialization failed:', err);
    });
});

window.ViajesProDB = ViajesProDB;
window.db = db;

console.log('✅ db.js v4.0 cargado completamente');

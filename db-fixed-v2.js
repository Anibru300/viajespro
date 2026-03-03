/**
 * 3P VIAJESPRO - Database Module v3.4 (CORREGIDO FINAL)
 * IndexedDB funcional 100%
 */

const DB_NAME = 'ViajesProDB_v3';
const DB_VERSION = 3;

const STORES = {
    VENDEDORES: 'vendedores',
    VIAJES: 'viajes',
    GASTOS: 'gastos',
    FOTOS: 'fotos',
    CONFIG: 'config'
};

class ViajesProDB {
    constructor() {
        this.db = null;
        this.initialized = false;
        console.log('📦 ViajesProDB creado');
    }

    async init() {
        if (this.initialized && this.db) {
            console.log('✅ DB ya inicializada');
            return this.db;
        }

        console.log('🚀 Inicializando DB...');

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            
            request.onerror = (event) => {
                console.error('❌ Error abriendo DB:', request.error);
                reject(request.error);
            };
            
            request.onsuccess = (event) => {
                console.log('✅ DB abierta exitosamente');
                this.db = request.result;
                this.initialized = true;
                
                // Crear datos de prueba si no hay vendedores
                this.seedData().then(() => {
                    console.log('✅ DB lista con datos');
                    resolve(this.db);
                }).catch(err => {
                    console.warn('Error seeding:', err);
                    resolve(this.db);
                });
            };

            request.onupgradeneeded = (event) => {
                console.log('⚙️ Creando object stores...');
                const db = event.target.result;

                if (!db.objectStoreNames.contains(STORES.VENDEDORES)) {
                    const store = db.createObjectStore(STORES.VENDEDORES, { keyPath: 'id' });
                    store.createIndex('username', 'username', { unique: true });
                }

                if (!db.objectStoreNames.contains(STORES.VIAJES)) {
                    const store = db.createObjectStore(STORES.VIAJES, { keyPath: 'id' });
                    store.createIndex('vendedorId', 'vendedorId', { unique: false });
                }

                if (!db.objectStoreNames.contains(STORES.GASTOS)) {
                    const store = db.createObjectStore(STORES.GASTOS, { keyPath: 'id' });
                    store.createIndex('viajeId', 'viajeId', { unique: false });
                }

                if (!db.objectStoreNames.contains(STORES.FOTOS)) {
                    const store = db.createObjectStore(STORES.FOTOS, { keyPath: 'id' });
                    store.createIndex('gastoId', 'gastoId', { unique: false });
                }

                if (!db.objectStoreNames.contains(STORES.CONFIG)) {
                    db.createObjectStore(STORES.CONFIG, { keyPath: 'key' });
                }
            };
        });
    }

    async seedData() {
        try {
            const count = await this.count(STORES.VENDEDORES);
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
            }
        } catch (e) {
            console.warn('Error en seedData:', e);
        }
    }

    async count(storeName) {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.count();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            } catch (e) {
                reject(e);
            }
        });
    }

    async add(storeName, data) {
        console.log(`➕ Agregando a ${storeName}:`, data.id);
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                
                const dataToAdd = {
                    ...data,
                    createdAt: data.createdAt || new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                
                const request = store.add(dataToAdd);
                
                request.onsuccess = () => {
                    console.log(`✅ Guardado en ${storeName}:`, data.id);
                    resolve(dataToAdd);
                };
                
                request.onerror = () => {
                    console.error(`❌ Error guardando:`, request.error);
                    reject(request.error);
                };
            } catch (e) {
                reject(e);
            }
        });
    }

    async get(storeName, id) {
        console.log(`🔍 Buscando en ${storeName}:`, id);
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.get(id);
                
                request.onsuccess = () => {
                    console.log(`🔍 Resultado:`, request.result ? 'ENCONTRADO' : 'NO ENCONTRADO');
                    resolve(request.result);
                };
                
                request.onerror = () => {
                    console.error(`❌ Error buscando:`, request.error);
                    reject(request.error);
                };
            } catch (e) {
                console.error(`❌ Error en get:`, e);
                reject(e);
            }
        });
    }

    async getAll(storeName) {
        console.log(`📋 Obteniendo todos de ${storeName}`);
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.getAll();
                
                request.onsuccess = () => {
                    console.log(`📋 Encontrados:`, request.result.length);
                    resolve(request.result);
                };
                
                request.onerror = () => reject(request.error);
            } catch (e) {
                reject(e);
            }
        });
    }

    async update(storeName, data) {
        console.log(`📝 Actualizando en ${storeName}:`, data.id);
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                
                const dataToPut = {
                    ...data,
                    updatedAt: new Date().toISOString()
                };
                
                const request = store.put(dataToPut);
                request.onsuccess = () => resolve(dataToPut);
                request.onerror = () => reject(request.error);
            } catch (e) {
                reject(e);
            }
        });
    }

    async delete(storeName, id) {
        console.log(`🗑️ Eliminando de ${storeName}:`, id);
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.delete(id);
                request.onsuccess = () => resolve(id);
                request.onerror = () => reject(request.error);
            } catch (e) {
                reject(e);
            }
        });
    }

    async queryByIndex(storeName, indexName, value) {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const index = store.index(indexName);
                const request = index.getAll(value);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            } catch (e) {
                reject(e);
            }
        });
    }

    async getVendedorByUsername(username) {
        const vendedores = await this.queryByIndex(STORES.VENDEDORES, 'username', username);
        return vendedores[0] || null;
    }

    async getViajesByVendedor(vendedorId) {
        return await this.queryByIndex(STORES.VIAJES, 'vendedorId', vendedorId);
    }

    async getGastosByViaje(viajeId) {
        return await this.queryByIndex(STORES.GASTOS, 'viajeId', viajeId);
    }

    async getResumenGastos(viajeId) {
        const gastos = await this.getGastosByViaje(viajeId);
        const resumen = {
            gasolina: 0, comida: 0, hotel: 0, transporte: 0, casetas: 0, otros: 0, total: 0
        };

        gastos.forEach(gasto => {
            const monto = parseFloat(gasto.monto) || 0;
            if (resumen.hasOwnProperty(gasto.tipo)) {
                resumen[gasto.tipo] += monto;
            }
            resumen.total += monto;
        });

        return resumen;
    }

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
            if (gasto.fotos && gasto.fotos.length > 0) {
                for (const fotoId of gasto.fotos) {
                    const foto = await this.get(STORES.FOTOS, fotoId);
                    if (foto) data.fotos.push(foto);
                }
            }
        }

        return data;
    }

    async setConfig(key, value) {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([STORES.CONFIG], 'readwrite');
                const store = transaction.objectStore(STORES.CONFIG);
                const data = { key, value, updatedAt: new Date().toISOString() };
                const request = store.put(data);
                request.onsuccess = () => resolve({ key, value });
                request.onerror = () => reject(request.error);
            } catch (e) {
                reject(e);
            }
        });
    }

    async getConfig(key) {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([STORES.CONFIG], 'readonly');
                const store = transaction.objectStore(STORES.CONFIG);
                const request = store.get(key);
                request.onsuccess = () => resolve(request.result?.value);
                request.onerror = () => reject(request.error);
            } catch (e) {
                reject(e);
            }
        });
    }

    async clearAll() {
        if (!this.db) await this.init();
        const stores = Object.values(STORES);
        for (const storeName of stores) {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            await store.clear();
        }
    }
}

// Crear instancia global
const db = new ViajesProDB();

// Inicializar automáticamente
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Inicializando ViajesProDB...');
    db.init().then(() => {
        console.log('✅ 3P Database ready');
        window.dispatchEvent(new CustomEvent('dbReady'));
    }).catch(err => {
        console.error('❌ Database initialization failed:', err);
    });
});

window.ViajesProDB = ViajesProDB;
window.db = db;

/**
 * 3P VIAJESPRO - Database Module v4.0
 * IndexedDB con migración automática y nuevos campos profesionales
 */

console.log('🚀 db.js v4.0 cargando...');

// Verificar soporte de IndexedDB
if (!window.indexedDB) {
    console.error('❌ Tu navegador no soporta IndexedDB');
    alert('Tu navegador no soporta IndexedDB. La aplicación no funcionará correctamente.');
} else {
    console.log('✅ IndexedDB disponible');
}

const DB_NAME = 'ViajesProDB_v4';
const DB_VERSION = 4;

const STORES = {
    VENDEDORES: 'vendedores',
    VIAJES: 'viajes',
    GASTOS: 'gastos',
    FOTOS: 'fotos',
    CONFIG: 'config',
    REPORTES: 'reportes' // Nuevo: historial de reportes generados
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
            
            request.onsuccess = (event) => {
                console.log('✅ DB abierta');
                this.db = request.result;
                this.initialized = true;
                
                // Crear datos de prueba si no hay vendedores
                this.seedData().then(() => {
                    console.log('✅ DB lista');
                    resolve(this.db);
                }).catch(err => {
                    console.warn('Error en seedData:', err);
                    resolve(this.db);
                });
            };

            request.onupgradeneeded = async (event) => {
                console.log('⚙️ Migrando base de datos a v4.0...');
                const db = event.target.result;
                const oldVersion = event.oldVersion;
                
                // MIGRACIÓN: De v3 a v4
                if (oldVersion < 4) {
                    await this.migrateToV4(db, event.target.transaction);
                }

                // Crear object stores si no existen (para instalaciones nuevas)
                if (!db.objectStoreNames.contains(STORES.VENDEDORES)) {
                    const store = db.createObjectStore(STORES.VENDEDORES, { keyPath: 'id' });
                    store.createIndex('username', 'username', { unique: true });
                }

                if (!db.objectStoreNames.contains(STORES.VIAJES)) {
                    const store = db.createObjectStore(STORES.VIAJES, { keyPath: 'id' });
                    store.createIndex('vendedorId', 'vendedorId', { unique: false });
                    store.createIndex('cliente', 'cliente', { unique: false }); // Nuevo índice
                    store.createIndex('fechaInicio', 'fechaInicio', { unique: false });
                }

                if (!db.objectStoreNames.contains(STORES.GASTOS)) {
                    const store = db.createObjectStore(STORES.GASTOS, { keyPath: 'id' });
                    store.createIndex('viajeId', 'viajeId', { unique: false });
                    store.createIndex('tipo', 'tipo', { unique: false });
                    store.createIndex('esFacturable', 'esFacturable', { unique: false }); // Nuevo
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
                    store.createIndex('fechaGenerado', 'fechaGenerado', { unique: false });
                }
            };
        });
    }

    // MIGRACIÓN V3 → V4
    async migrateToV4(db, transaction) {
        console.log('🔄 Iniciando migración v3 → v4...');
        
        try {
            // 1. Migrar Viajes existentes
            if (db.objectStoreNames.contains(STORES.VIAJES)) {
                const viajesStore = transaction.objectStore(STORES.VIAJES);
                const viajes = await viajesStore.getAll();
                
                for (const viaje of viajes) {
                    // Agregar campos nuevos con valores por defecto
                    const viajeActualizado = {
                        ...viaje,
                        cliente: viaje.cliente || 'NO ESPECIFICADO',
                        lugarVisita: viaje.lugarVisita || viaje.destino || 'NO ESPECIFICADO',
                        objetivo: viaje.objetivo || viaje.proposito || '',
                        responsable: viaje.responsable || viaje.vendedorId || 'SIN RESPONSABLE',
                        zona: viaje.zona || 'Centro',
                        updatedAt: new Date().toISOString(),
                        version: 4
                    };
                    
                    // Renombrar proposito a objetivo si existe
                    if (viajeActualizado.proposito && !viajeActualizado.objetivo) {
                        viajeActualizado.objetivo = viajeActualizado.proposito;
                        delete viajeActualizado.proposito;
                    }
                    
                    await viajesStore.put(viajeActualizado);
                }
                console.log(`✅ Migrados ${viajes.length} viajes`);
            }

            // 2. Migrar Gastos existentes
            if (db.objectStoreNames.contains(STORES.GASTOS)) {
                const gastosStore = transaction.objectStore(STORES.GASTOS);
                const gastos = await gastosStore.getAll();
                
                for (const gasto of gastos) {
                    const gastoActualizado = {
                        ...gasto,
                        folioFactura: gasto.folioFactura || '',
                        razonSocial: gasto.razonSocial || '',
                        comentarios: gasto.comentarios || '',
                        esFacturable: gasto.esFacturable !== undefined ? gasto.esFacturable : true,
                        editable: true, // Los existentes son editables
                        fotos: Array.isArray(gasto.fotos) ? gasto.fotos : (gasto.fotos ? [gasto.fotos] : []),
                        updatedAt: new Date().toISOString(),
                        version: 4
                    };
                    
                    await gastosStore.put(gastoActualizado);
                }
                console.log(`✅ Migrados ${gastos.length} gastos`);
            }

            // 3. Guardar versión de migración en config
            const configStore = transaction.objectStore(STORES.CONFIG);
            await configStore.put({
                key: 'db_version',
                value: 4,
                migratedAt: new Date().toISOString()
            });

            console.log('✅ Migración v4 completada exitosamente');
            
        } catch (error) {
            console.error('❌ Error en migración:', error);
            throw error;
        }
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
                console.log('✅ Vendedor de prueba creado (juan.perez / 123456)');
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
                    updatedAt: new Date().toISOString(),
                    version: 4
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
                    updatedAt: new Date().toISOString(),
                    version: 4
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

    async getViajesByCliente(cliente) {
        return await this.queryByIndex(STORES.VIAJES, 'cliente', cliente);
    }

    async getGastosByViaje(viajeId) {
        return await this.queryByIndex(STORES.GASTOS, 'viajeId', viajeId);
    }

    async getGastosFacturables(viajeId) {
        const gastos = await this.getGastosByViaje(viajeId);
        return gastos.filter(g => g.esFacturable !== false);
    }

    async getResumenGastos(viajeId) {
        const gastos = await this.getGastosByViaje(viajeId);
        const resumen = {
            gasolina: 0, comida: 0, hotel: 0, transporte: 0, casetas: 0, otros: 0, total: 0,
            facturable: 0, noFacturable: 0
        };

        gastos.forEach(gasto => {
            const monto = parseFloat(gasto.monto) || 0;
            if (resumen.hasOwnProperty(gasto.tipo)) {
                resumen[gasto.tipo] += monto;
            }
            resumen.total += monto;
            
            if (gasto.esFacturable !== false) {
                resumen.facturable += monto;
            } else {
                resumen.noFacturable += monto;
            }
        });

        return resumen;
    }

    async exportAllData(viajeId = null) {
        const data = {
            vendedores: await this.getAll(STORES.VENDEDORES),
            viajes: [],
            gastos: [],
            fotos: [],
            reportes: await this.getAll(STORES.REPORTES)
        };

        if (viajeId) {
            const viaje = await this.get(STORES.VIAJES, viajeId);
            if (viaje) data.viajes = [viaje];
            data.gastos = await this.getGastosByViaje(viajeId);
        } else {
            data.viajes = await this.getAll(STORES.VIAJES);
            data.gastos = await this.getAll(STORES.GASTOS);
        }

        // Recolectar todas las fotos referenciadas
        const fotoIds = new Set();
        for (const gasto of data.gastos) {
            if (gasto.fotos && Array.isArray(gasto.fotos)) {
                gasto.fotos.forEach(fotoId => fotoIds.add(fotoId));
            }
        }

        for (const fotoId of fotoIds) {
            const foto = await this.get(STORES.FOTOS, fotoId);
            if (foto) data.fotos.push(foto);
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

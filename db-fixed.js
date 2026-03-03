/**
 * 3P VIAJESPRO - Database Module v3.3 (CORREGIDO)
 * IndexedDB con sistema de respaldo robusto
 */

const DB_NAME = 'ViajesProDB_v3';
const DB_VERSION = 3;
const BACKUP_PREFIX = 'VP_backup_';
const BACKUP_TIMESTAMP_KEY = 'VP_backup_timestamp';

const STORES = {
    VENDEDORES: 'vendedores',
    VIAJES: 'viajes',
    GASTOS: 'gastos',
    FOTOS: 'fotos',
    CONFIG: 'config'
};

class LocalStorageBackup {
    constructor() {
        this.isAvailable = this.checkAvailability();
    }

    checkAvailability() {
        try {
            const test = '__test__';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (e) {
            console.warn('localStorage no disponible');
            return false;
        }
    }

    save(storeName, data) {
        if (!this.isAvailable) return false;
        try {
            const key = BACKUP_PREFIX + storeName;
            const existing = this.get(storeName) || [];
            const index = existing.findIndex(item => item.id === data.id);
            const dataWithTimestamp = { ...data, _backupAt: new Date().toISOString() };
            
            if (index >= 0) {
                existing[index] = dataWithTimestamp;
            } else {
                existing.push(dataWithTimestamp);
            }
            
            localStorage.setItem(key, JSON.stringify(existing));
            localStorage.setItem(BACKUP_TIMESTAMP_KEY, new Date().toISOString());
            return true;
        } catch (e) {
            console.warn('Error guardando backup:', e.message);
            return false;
        }
    }

    get(storeName) {
        if (!this.isAvailable) return null;
        try {
            const key = BACKUP_PREFIX + storeName;
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            return null;
        }
    }

    getAll() {
        if (!this.isAvailable) return null;
        const backup = {};
        Object.values(STORES).forEach(storeName => {
            backup[storeName] = this.get(storeName) || [];
        });
        backup._timestamp = localStorage.getItem(BACKUP_TIMESTAMP_KEY);
        return backup;
    }
}

class ViajesProDB {
    constructor() {
        this.db = null;
        this.initPromise = null;
        this.backup = new LocalStorageBackup();
        console.log('📦 ViajesProDB creado');
    }

    async init() {
        // Si ya hay una inicialización en curso, devolver esa promesa
        if (this.initPromise) {
            console.log('⏳ Inicialización ya en curso, esperando...');
            return this.initPromise;
        }
        
        // Si ya está inicializado, devolver la base de datos
        if (this.db) {
            console.log('✅ DB ya inicializada');
            return this.db;
        }
        
        console.log('🚀 Iniciando inicialización de DB...');
        
        this.initPromise = new Promise(async (resolve, reject) => {
            try {
                console.log('📂 Abriendo base de datos...');
                await this.openDatabase();
                console.log('✅ Base de datos abierta');
                
                console.log('🔄 Verificando backup...');
                await this.checkAndRecoverFromBackup();
                console.log('✅ Backup verificado');
                
                console.log('🌱 Sembrando datos iniciales...');
                await this.seedInitialData();
                console.log('✅ Datos iniciales listos');
                
                console.log('✅ Database initialized successfully');
                resolve(this.db);
            } catch (error) {
                console.error('❌ Database initialization failed:', error);
                reject(error);
            }
        });

        return this.initPromise;
    }

    openDatabase() {
        return new Promise((resolve, reject) => {
            console.log(`📂 Solicitando abrir ${DB_NAME} v${DB_VERSION}`);
            
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            
            request.onerror = (event) => {
                console.error('❌ Error abriendo DB:', request.error);
                reject(request.error);
            };
            
            request.onsuccess = (event) => {
                console.log('✅ DB abierta exitosamente');
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                console.log('⚙️ Upgrade necesario, creando object stores...');
                const db = event.target.result;

                if (!db.objectStoreNames.contains(STORES.VENDEDORES)) {
                    console.log('  Creando store: vendedores');
                    const store = db.createObjectStore(STORES.VENDEDORES, { keyPath: 'id' });
                    store.createIndex('username', 'username', { unique: true });
                }

                if (!db.objectStoreNames.contains(STORES.VIAJES)) {
                    console.log('  Creando store: viajes');
                    const store = db.createObjectStore(STORES.VIAJES, { keyPath: 'id' });
                    store.createIndex('vendedorId', 'vendedorId', { unique: false });
                }

                if (!db.objectStoreNames.contains(STORES.GASTOS)) {
                    console.log('  Creando store: gastos');
                    const store = db.createObjectStore(STORES.GASTOS, { keyPath: 'id' });
                    store.createIndex('viajeId', 'viajeId', { unique: false });
                }

                if (!db.objectStoreNames.contains(STORES.FOTOS)) {
                    console.log('  Creando store: fotos');
                    const store = db.createObjectStore(STORES.FOTOS, { keyPath: 'id' });
                    store.createIndex('gastoId', 'gastoId', { unique: false });
                }

                if (!db.objectStoreNames.contains(STORES.CONFIG)) {
                    console.log('  Creando store: config');
                    db.createObjectStore(STORES.CONFIG, { keyPath: 'key' });
                }
                
                console.log('✅ Object stores creados');
            };
            
            request.onblocked = (event) => {
                console.warn('⚠️ DB bloqueada, cerrando otras pestañas...');
                alert('Por favor cierra otras pestañas con esta aplicación y recarga.');
            };
        });
    }

    async _count(storeName) {
        if (!this.db) throw new Error('DB no inicializada');
        
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

    async _put(storeName, data) {
        if (!this.db) throw new Error('DB no inicializada');
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.put(data);
                request.onsuccess = () => resolve(data);
                request.onerror = () => reject(request.error);
            } catch (e) {
                reject(e);
            }
        });
    }

    async checkAndRecoverFromBackup() {
        console.log('🔄 Verificando recuperación desde backup...');
        const stores = [STORES.VENDEDORES, STORES.VIAJES, STORES.GASTOS];
        let totalRecords = 0;
        
        for (const storeName of stores) {
            try {
                const count = await this._count(storeName);
                totalRecords += count;
                console.log(`  ${storeName}: ${count} registros`);
            } catch (e) {
                console.warn(`  Error contando ${storeName}:`, e.message);
            }
        }

        console.log(`Total registros en DB: ${totalRecords}`);

        if (totalRecords === 0) {
            const backup = this.backup.getAll();
            let backupTotal = 0;
            for (const storeName of stores) {
                if (backup[storeName]) backupTotal += backup[storeName].length;
            }

            console.log(`Total registros en backup: ${backupTotal}`);

            if (backupTotal > 0) {
                console.log(`🔄 Recuperando ${backupTotal} registros desde backup...`);
                for (const storeName of stores) {
                    if (backup[storeName]) {
                        for (const item of backup[storeName]) {
                            const { _backupAt, ...cleanItem } = item;
                            try {
                                await this._put(storeName, cleanItem);
                                console.log(`  Recuperado: ${item.id}`);
                            } catch (e) {
                                console.warn('Error recuperando item:', e.message);
                            }
                        }
                    }
                }
                console.log('✅ Recuperación completada');
            } else {
                console.log('ℹ️ No hay datos en backup para recuperar');
            }
        }
    }

    async seedInitialData() {
        console.log('🌱 Verificando datos iniciales...');
        try {
            const vendedores = await this.getAll(STORES.VENDEDORES);
            console.log(`  Vendedores existentes: ${vendedores.length}`);
            
            if (vendedores.length === 0) {
                console.log('🌱 Creando vendedor de prueba...');
                const vendorEjemplo = {
                    id: 'juan.perez',
                    name: 'Juan Pérez',
                    username: 'juan.perez',
                    password: '123456',
                    email: 'juan@ejemplo.com',
                    zone: 'Centro',
                    status: 'active',
                    createdAt: new Date().toISOString()
                };
                await this.add(STORES.VENDEDORES, vendorEjemplo, false);
                console.log('✅ Vendedor de prueba creado (usuario: juan.perez / contraseña: 123456)');
            } else {
                console.log('✅ Ya existen vendedores, no se crean datos de prueba');
            }
        } catch (e) {
            console.warn('Error al sembrar datos iniciales:', e);
        }
    }

    async add(storeName, data, doBackup = true) {
        console.log(`➕ Agregando a ${storeName}:`, data.id || 'sin-id');
        await this.init();
        
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
                    if (doBackup) this.backup.save(storeName, dataToAdd);
                    resolve(dataToAdd);
                };
                
                request.onerror = () => {
                    console.error(`❌ Error guardando en ${storeName}:`, request.error);
                    reject(request.error);
                };
            } catch (e) {
                console.error('❌ Error en transacción:', e);
                reject(e);
            }
        });
    }

    async put(storeName, data, doBackup = true) {
        await this.init();
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                
                const dataToPut = {
                    ...data,
                    updatedAt: new Date().toISOString()
                };
                
                const request = store.put(dataToPut);
                
                request.onsuccess = () => {
                    if (doBackup) this.backup.save(storeName, dataToPut);
                    resolve(dataToPut);
                };
                request.onerror = () => reject(request.error);
            } catch (e) {
                reject(e);
            }
        });
    }

    async get(storeName, id) {
        await this.init();
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.get(id);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            } catch (e) {
                reject(e);
            }
        });
    }

    async getAll(storeName) {
        await this.init();
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            } catch (e) {
                reject(e);
            }
        });
    }

    async update(storeName, data, doBackup = true) {
        return this.put(storeName, data, doBackup);
    }

    async delete(storeName, id, doBackup = true) {
        await this.init();
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.delete(id);
                
                request.onsuccess = () => {
                    if (doBackup) {
                        const existing = this.backup.get(storeName) || [];
                        const filtered = existing.filter(item => item.id !== id);
                        localStorage.setItem(BACKUP_PREFIX + storeName, JSON.stringify(filtered));
                    }
                    resolve(id);
                };
                request.onerror = () => reject(request.error);
            } catch (e) {
                reject(e);
            }
        });
    }

    async queryByIndex(storeName, indexName, value) {
        await this.init();
        
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
        await this.init();
        
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
        await this.init();
        
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
        await this.init();
        const stores = Object.values(STORES);
        for (const storeName of stores) {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            await store.clear();
        }
        for (const storeName of stores) {
            localStorage.removeItem(BACKUP_PREFIX + storeName);
        }
        localStorage.removeItem(BACKUP_TIMESTAMP_KEY);
    }
}

// Crear instancia global
const db = new ViajesProDB();

// Inicializar automáticamente al cargar
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Inicializando ViajesProDB...');
    db.init().then(() => {
        console.log('✅ 3P Database ready');
        window.dispatchEvent(new CustomEvent('dbReady'));
    }).catch(err => {
        console.error('❌ Database initialization failed:', err);
        alert('Error al inicializar la base de datos. Por favor, recarga la página o contacta al administrador.');
    });
});

window.ViajesProDB = ViajesProDB;
window.db = db;

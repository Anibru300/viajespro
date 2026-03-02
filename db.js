/**
 * 3P VIAJESPRO - Database Module v3.0
 * IndexedDB con sistema de respaldo robusto
 */

const DB_NAME = 'ViajesProDB_v3';
const DB_VERSION = 3;
const BACKUP_PREFIX = 'VP_backup_';

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
        return backup;
    }
}

class ViajesProDB {
    constructor() {
        this.db = null;
        this.initPromise = null;
        this.backup = new LocalStorageBackup();
    }

    async init() {
        if (this.initPromise) return this.initPromise;
        
        this.initPromise = new Promise(async (resolve, reject) => {
            try {
                await this.openDatabase();
                await this.checkAndRecoverFromBackup();
                console.log('✅ Database initialized');
                resolve(this.db);
            } catch (error) {
                console.error('Database error:', error);
                reject(error);
            }
        });

        return this.initPromise;
    }

    openDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
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

    async checkAndRecoverFromBackup() {
        const stores = [STORES.VENDEDORES, STORES.VIAJES, STORES.GASTOS];
        let totalRecords = 0;
        
        for (const storeName of stores) {
            const count = (await this.getAll(storeName)).length;
            totalRecords += count;
        }

        if (totalRecords === 0) {
            const backup = this.backup.getAll();
            let backupTotal = 0;
            for (const storeName of stores) {
                if (backup[storeName]) backupTotal += backup[storeName].length;
            }

            if (backupTotal > 0) {
                console.log(`🔄 Recuperando ${backupTotal} registros desde backup...`);
                for (const storeName of stores) {
                    if (backup[storeName]) {
                        for (const item of backup[storeName]) {
                            const { _backupAt, ...cleanItem } = item;
                            try {
                                await this.put(storeName, cleanItem, false);
                            } catch (e) {
                                console.warn('Error recuperando item:', e.message);
                            }
                        }
                    }
                }
            }
        }
    }

    async add(storeName, data, doBackup = true) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            
            const dataToAdd = {
                ...data,
                createdAt: data.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            
            const request = store.add(dataToAdd);
            
            request.onsuccess = () => {
                if (doBackup) this.backup.save(storeName, dataToAdd);
                resolve(dataToAdd);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async put(storeName, data, doBackup = true) {
        await this.init();
        return new Promise((resolve, reject) => {
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
        });
    }

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

    async update(storeName, data, doBackup = true) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            
            const dataToUpdate = {
                ...data,
                updatedAt: new Date().toISOString()
            };
            
            const request = store.put(dataToUpdate);
            
            request.onsuccess = () => {
                if (doBackup) this.backup.save(storeName, dataToUpdate);
                resolve(dataToUpdate);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async delete(storeName, id, doBackup = true) {
        await this.init();
        return new Promise((resolve, reject) => {
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
        });
    }

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
            const transaction = this.db.transaction([STORES.CONFIG], 'readwrite');
            const store = transaction.objectStore(STORES.CONFIG);
            const data = { key, value, updatedAt: new Date().toISOString() };
            const request = store.put(data);
            request.onsuccess = () => resolve({ key, value });
            request.onerror = () => reject(request.error);
        });
    }

    async getConfig(key) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.CONFIG], 'readonly');
            const store = transaction.objectStore(STORES.CONFIG);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result?.value);
            request.onerror = () => reject(request.error);
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
        this.backup.getAll = () => null;
    }
}

const db = new ViajesProDB();

document.addEventListener('DOMContentLoaded', () => {
    db.init().then(() => {
        console.log('🚀 3P Database ready');
        window.dispatchEvent(new CustomEvent('dbReady'));
    }).catch(err => {
        console.error('❌ Database initialization failed:', err);
    });
});

window.ViajesProDB = ViajesProDB;
window.db = db;

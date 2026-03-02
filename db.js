/**
 * 3P VIAJESPRO - Database Module
 * IndexedDB para funcionamiento offline completo
 */

const DB_NAME = 'ViajesProDB_v2';
const DB_VERSION = 2;

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
        this.initPromise = null;
    }

    async init() {
        if (this.initPromise) return this.initPromise;
        
        this.initPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('Error opening database:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('✅ Database opened successfully');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                console.log('🔄 Upgrading database to version', DB_VERSION);

                // Store: Vendedores (usuarios)
                if (!db.objectStoreNames.contains(STORES.VENDEDORES)) {
                    const store = db.createObjectStore(STORES.VENDEDORES, { keyPath: 'id' });
                    store.createIndex('username', 'username', { unique: true });
                    store.createIndex('email', 'email', { unique: false });
                    store.createIndex('status', 'status', { unique: false });
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
                    store.createIndex('vendedorId', 'vendedorId', { unique: false });
                    store.createIndex('tipo', 'tipo', { unique: false });
                    store.createIndex('fecha', 'fecha', { unique: false });
                    store.createIndex('folio', 'folio', { unique: false });
                }

                // Store: Fotos
                if (!db.objectStoreNames.contains(STORES.FOTOS)) {
                    const store = db.createObjectStore(STORES.FOTOS, { keyPath: 'id' });
                    store.createIndex('gastoId', 'gastoId', { unique: false });
                    store.createIndex('viajeId', 'viajeId', { unique: false });
                    store.createIndex('tipo', 'tipo', { unique: false });
                }

                // Store: Config
                if (!db.objectStoreNames.contains(STORES.CONFIG)) {
                    db.createObjectStore(STORES.CONFIG, { keyPath: 'key' });
                }
            };
        });

        return this.initPromise;
    }

    // ===== CRUD BÁSICO =====
    async add(storeName, data) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            
            data.createdAt = data.createdAt || new Date().toISOString();
            data.updatedAt = new Date().toISOString();
            
            const request = store.add(data);
            request.onsuccess = () => resolve(data);
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

    // ===== MÉTODOS ESPECÍFICOS =====
    async getVendedorByUsername(username) {
        const vendedores = await this.queryByIndex(STORES.VENDEDORES, 'username', username);
        return vendedores[0] || null;
    }

    async getActiveVendedores() {
        return await this.queryByIndex(STORES.VENDEDORES, 'status', 'active');
    }

    async getViajesByVendedor(vendedorId) {
        return await this.queryByIndex(STORES.VIAJES, 'vendedorId', vendedorId);
    }

    async getActiveViajes(vendedorId) {
        const viajes = await this.getViajesByVendedor(vendedorId);
        return viajes.filter(v => v.estado === 'activo');
    }

    async getGastosByViaje(viajeId) {
        return await this.queryByIndex(STORES.GASTOS, 'viajeId', viajeId);
    }

    async getGastosByVendedor(vendedorId) {
        return await this.queryByIndex(STORES.GASTOS, 'vendedorId', vendedorId);
    }

    async getFotosByGasto(gastoId) {
        return await this.queryByIndex(STORES.FOTOS, 'gastoId', gastoId);
    }

    async getFotosByViaje(viajeId) {
        return await this.queryByIndex(STORES.FOTOS, 'viajeId', viajeId);
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
            const monto = parseFloat(gasto.monto) || 0;
            if (resumen.hasOwnProperty(gasto.tipo)) {
                resumen[gasto.tipo] += monto;
            }
            resumen.total += monto;
        });

        return resumen;
    }

    async getResumenByFecha(vendedorId, fechaInicio, fechaFin) {
        const gastos = await this.getGastosByVendedor(vendedorId);
        const start = new Date(fechaInicio);
        const end = new Date(fechaFin);
        end.setHours(23, 59, 59);

        const filtrados = gastos.filter(g => {
            const fecha = new Date(g.fecha);
            return fecha >= start && fecha <= end;
        });

        const resumen = {
            gasolina: 0, comida: 0, hotel: 0, transporte: 0, casetas: 0, otros: 0, total: 0
        };

        filtrados.forEach(gasto => {
            const monto = parseFloat(gasto.monto) || 0;
            if (resumen.hasOwnProperty(gasto.tipo)) {
                resumen[gasto.tipo] += monto;
            }
            resumen.total += monto;
        });

        return { resumen, gastos: filtrados };
    }

    // ===== EXPORTACIÓN =====
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

        // Obtener fotos de los gastos
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

    async exportByVendedor(vendedorId) {
        return {
            vendedor: await this.get(STORES.VENDEDORES, vendedorId),
            viajes: await this.getViajesByVendedor(vendedorId),
            gastos: await this.getGastosByVendedor(vendedorId),
            fotos: await this.getAll(STORES.FOTOS)
        };
    }

    // ===== CONFIGURACIÓN =====
    async setConfig(key, value) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.CONFIG], 'readwrite');
            const store = transaction.objectStore(STORES.CONFIG);
            const request = store.put({ key, value, updatedAt: new Date().toISOString() });
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

    // ===== ESTADÍSTICAS =====
    async getStats() {
        const stats = {
            vendedores: (await this.getAll(STORES.VENDEDORES)).length,
            viajes: (await this.getAll(STORES.VIAJES)).length,
            gastos: (await this.getAll(STORES.GASTOS)).length,
            fotos: (await this.getAll(STORES.FOTOS)).length
        };
        return stats;
    }

    // ===== LIMPIEZA =====
    async clearAll() {
        await this.init();
        const stores = Object.values(STORES);
        
        for (const storeName of stores) {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            await store.clear();
        }
        
        console.log('🗑️ Database cleared');
    }
}

// Crear instancia global
const db = new ViajesProDB();

// Inicializar al cargar
document.addEventListener('DOMContentLoaded', () => {
    db.init().then(() => {
        console.log('🚀 3P Database ready');
        window.dispatchEvent(new CustomEvent('dbReady'));
    }).catch(err => {
        console.error('❌ Database initialization failed:', err);
    });
});

// Exportar para uso global
window.ViajesProDB = ViajesProDB;
window.db = db;

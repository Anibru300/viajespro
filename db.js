/**
 * 3P VIAJESPRO - Database Module v5.1 (Compatibilidad hacia atrás)
 * Ahora usa los nuevos módulos modularizados
 */

console.log('🚀 db.js v5.1 cargando...');

import databaseService from './modules/database.js';

// Mantener compatibilidad con código existente
// Esta clase envuelve el nuevo servicio con la API antigua
class ViajesProDB {
    constructor() {
        this.service = databaseService;
        this.initialized = true;
    }

    async init() {
        console.log('✅ DB Service listo');
        return true;
    }

    // API antigua - delega al nuevo servicio
    async add(collectionName, data) {
        return this.service.add(collectionName, data, data.id);
    }

    async get(collectionName, id) {
        return this.service.get(collectionName, id);
    }

    async getAll(collectionName) {
        const result = await this.service.query(collectionName, []);
        return result.data;
    }

    async update(collectionName, data) {
        return this.service.update(collectionName, data.id, data);
    }

    async delete(collectionName, id) {
        return this.service.delete(collectionName, id);
    }

    async queryByIndex(collectionName, field, value) {
        const result = await this.service.query(
            collectionName, 
            [where(field, '==', value)]
        );
        return result.data;
    }

    // Métodos específicos (mantener API antigua)
    getViajesByVendedor(vendedorId, options = {}) {
        return this.service.getViajesByVendedor(vendedorId, options)
            .then(r => r.data);
    }

    getGastosByViaje(viajeId, options = {}) {
        return this.service.getGastosByViaje(viajeId, options)
            .then(r => r.data);
    }

    // Nuevos métodos (API v5.1)
    searchGastos(vendedorId, searchText) {
        return this.service.searchGastos(vendedorId, searchText)
            .then(r => r.data);
    }

    getDashboardStats(vendedorId, dias = 30) {
        return this.service.getDashboardStats(vendedorId, dias);
    }

    deleteViajeCompleto(viajeId) {
        return this.service.deleteViajeCompleto(viajeId);
    }

    // Utilidades
    generateId(prefix = 'doc') {
        return this.service.generateId(prefix);
    }
}

// Importar where para queryByIndex
import { where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Singleton global (mantener compatibilidad)
const dbInstance = new ViajesProDB();
window.db = dbInstance;

// También exportar el nuevo servicio para código nuevo
export { databaseService };

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
    dbInstance.init().catch(err => console.error('❌ Error al inicializar db:', err));
});

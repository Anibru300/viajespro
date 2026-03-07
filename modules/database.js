/**
 * 3P VIAJESPRO - Módulo de Base de Datos v5.1
 * Mejorado con paginación, índices y performance
 */

import { db } from '../firebase-config.js';
import { 
    collection, 
    doc, 
    setDoc, 
    getDoc, 
    getDocs, 
    deleteDoc, 
    query, 
    where,
    orderBy,
    limit,
    startAfter,
    updateDoc,
    serverTimestamp,
    writeBatch,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

class DatabaseService {
    constructor() {
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutos
        this.listeners = new Map();
    }

    // ===== OPERACIONES BÁSICAS =====

    async add(collectionName, data, id = null) {
        const docId = id || `${collectionName}_${Date.now()}`;
        const docRef = doc(db, collectionName, docId);
        
        const dataToSave = {
            ...data,
            id: docId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };
        
        await setDoc(docRef, dataToSave);
        this.invalidateCache(collectionName);
        return { id: docId, ...dataToSave };
    }

    async get(collectionName, id) {
        // Verificar caché
        const cacheKey = `${collectionName}_${id}`;
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        const docRef = doc(db, collectionName, id);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            this.setCache(cacheKey, data);
            return data;
        }
        return null;
    }

    async update(collectionName, id, data) {
        const docRef = doc(db, collectionName, id);
        const dataToUpdate = {
            ...data,
            updatedAt: serverTimestamp()
        };
        
        await updateDoc(docRef, dataToUpdate);
        this.invalidateCache(`${collectionName}_${id}`);
        this.invalidateCache(collectionName);
        return { id, ...dataToUpdate };
    }

    async delete(collectionName, id) {
        const docRef = doc(db, collectionName, id);
        await deleteDoc(docRef);
        this.invalidateCache(`${collectionName}_${id}`);
        this.invalidateCache(collectionName);
        return { success: true };
    }

    // ===== CONSULTAS AVANZADAS =====

    async query(collectionName, conditions = [], options = {}) {
        const { 
            orderByField = 'createdAt', 
            orderDirection = 'desc',
            limitCount = 50,
            startAfterDoc = null
        } = options;

        let q = collection(db, collectionName);
        
        // Aplicar condiciones
        if (conditions.length > 0) {
            q = query(q, ...conditions);
        }
        
        // Ordenar
        q = query(q, orderBy(orderByField, orderDirection));
        
        // Paginación
        if (startAfterDoc) {
            q = query(q, startAfter(startAfterDoc));
        }
        
        // Límite
        q = query(q, limit(limitCount));
        
        const snapshot = await getDocs(q);
        const results = [];
        let lastDoc = null;
        
        snapshot.forEach((doc) => {
            results.push({ ...doc.data(), id: doc.id });
            lastDoc = doc;
        });
        
        return { data: results, lastDoc, hasMore: results.length === limitCount };
    }

    // ===== MÉTODOS ESPECÍFICOS =====

    /**
     * Obtiene viajes de un vendedor con paginación
     */
    async getViajesByVendedor(vendedorId, options = {}) {
        const conditions = [where('vendedorId', '==', vendedorId)];
        
        if (options.estado) {
            conditions.push(where('estado', '==', options.estado));
        }
        
        return this.query('viajes', conditions, {
            orderByField: options.orderBy || 'fechaInicio',
            orderDirection: options.order || 'desc',
            limitCount: options.limit || 20,
            startAfterDoc: options.startAfter || null
        });
    }

    /**
     * Obtiene gastos de un viaje
     */
    async getGastosByViaje(viajeId, options = {}) {
        const conditions = [where('viajeId', '==', viajeId)];
        return this.query('gastos', conditions, {
            orderByField: 'fecha',
            orderDirection: 'desc',
            limitCount: options.limit || 50
        });
    }

    /**
     * Obtiene gastos de un vendedor (todos sus viajes)
     */
    async getGastosByVendedor(vendedorId, options = {}) {
        const conditions = [where('vendedorId', '==', vendedorId)];
        
        if (options.fechaInicio && options.fechaFin) {
            conditions.push(
                where('fecha', '>=', options.fechaInicio),
                where('fecha', '<=', options.fechaFin)
            );
        }
        
        return this.query('gastos', conditions, {
            orderByField: 'fecha',
            orderDirection: 'desc',
            limitCount: options.limit || 100
        });
    }

    /**
     * Búsqueda de gastos por texto (cliente, lugar, concepto)
     */
    async searchGastos(vendedorId, searchText, options = {}) {
        // Nota: Firestore no soporta búsqueda de texto completo nativamente
        // Esto requiere una solución como Algolia o Elastic Search en producción
        // Por ahora, traemos los datos y filtramos en memoria
        
        const { data: gastos } = await this.getGastosByVendedor(vendedorId, {
            limit: 500 // Traer más para filtrar
        });
        
        const searchLower = searchText.toLowerCase();
        const filtered = gastos.filter(g => 
            (g.lugar && g.lugar.toLowerCase().includes(searchLower)) ||
            (g.comentarios && g.comentarios.toLowerCase().includes(searchLower)) ||
            (g.razonSocial && g.razonSocial.toLowerCase().includes(searchLower)) ||
            (g.folioFactura && g.folioFactura.toLowerCase().includes(searchLower))
        );
        
        return { data: filtered, hasMore: false };
    }

    /**
     * Obtiene resumen de gastos para dashboard
     */
    async getDashboardStats(vendedorId, dias = 30) {
        const fechaInicio = new Date();
        fechaInicio.setDate(fechaInicio.getDate() - dias);
        
        const { data: gastos } = await this.getGastosByVendedor(vendedorId, {
            fechaInicio: fechaInicio.toISOString(),
            fechaFin: new Date().toISOString(),
            limit: 1000
        });
        
        const stats = {
            total: 0,
            facturable: 0,
            noFacturable: 0,
            porTipo: {},
            porDia: {},
            count: gastos.length
        };
        
        gastos.forEach(g => {
            stats.total += g.monto || 0;
            
            if (g.esFacturable !== false) {
                stats.facturable += g.monto || 0;
            } else {
                stats.noFacturable += g.monto || 0;
            }
            
            // Por tipo
            const tipo = g.tipo || 'otros';
            stats.porTipo[tipo] = (stats.porTipo[tipo] || 0) + (g.monto || 0);
            
            // Por día
            const dia = (g.fecha || g.createdAt || '').split('T')[0];
            if (dia) {
                stats.porDia[dia] = (stats.porDia[dia] || 0) + (g.monto || 0);
            }
        });
        
        return stats;
    }

    /**
     * Obtiene todos los vendedores (para admin)
     */
    async getAllVendedores(options = {}) {
        return this.query('vendedores', [], {
            orderByField: 'name',
            orderDirection: 'asc',
            limitCount: options.limit || 100
        });
    }

    // ===== OPERACIONES EN LOTE =====

    /**
     * Actualiza múltiples documentos en una transacción
     */
    async batchUpdate(updates) {
        const batch = writeBatch(db);
        
        updates.forEach(({ collection, id, data }) => {
            const docRef = doc(db, collection, id);
            batch.update(docRef, {
                ...data,
                updatedAt: serverTimestamp()
            });
        });
        
        await batch.commit();
        this.clearCache();
        return { success: true };
    }

    /**
     * Elimina un viaje y todos sus gastos asociados
     */
    async deleteViajeCompleto(viajeId) {
        // Obtener gastos del viaje
        const { data: gastos } = await this.getGastosByViaje(viajeId, { limit: 1000 });
        
        const batch = writeBatch(db);
        
        // Eliminar gastos
        gastos.forEach(gasto => {
            const gastoRef = doc(db, 'gastos', gasto.id);
            batch.delete(gastoRef);
        });
        
        // Eliminar viaje
        const viajeRef = doc(db, 'viajes', viajeId);
        batch.delete(viajeRef);
        
        await batch.commit();
        this.clearCache();
        
        return { 
            success: true, 
            deletedGastos: gastos.length,
            imagesToDelete: gastos.flatMap(g => g.imagePaths || [])
        };
    }

    // ===== REALTIME =====

    /**
     * Escucha cambios en tiempo real de una colección
     */
    onCollectionChange(collectionName, conditions, callback) {
        let q = collection(db, collectionName);
        
        if (conditions && conditions.length > 0) {
            q = query(q, ...conditions);
        }
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const changes = [];
            snapshot.docChanges().forEach((change) => {
                changes.push({
                    type: change.type, // 'added', 'modified', 'removed'
                    data: change.doc.data()
                });
            });
            callback(changes);
        });
        
        // Guardar referencia para poder cancelar
        const key = `${collectionName}_${Date.now()}`;
        this.listeners.set(key, unsubscribe);
        
        return () => {
            unsubscribe();
            this.listeners.delete(key);
        };
    }

    // ===== CACHE =====

    getFromCache(key) {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }
        return null;
    }

    setCache(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    invalidateCache(key) {
        if (key) {
            this.cache.delete(key);
            // Invalidar también patrones relacionados
            for (const cacheKey of this.cache.keys()) {
                if (cacheKey.startsWith(key) || cacheKey.includes(key)) {
                    this.cache.delete(cacheKey);
                }
            }
        }
    }

    clearCache() {
        this.cache.clear();
    }

    // ===== UTILIDADES =====

    /**
     * Genera ID único
     */
    generateId(prefix = 'doc') {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Convierte timestamps de Firestore a fechas legibles
     */
    formatTimestamp(timestamp) {
        if (!timestamp) return null;
        if (timestamp.toDate) {
            return timestamp.toDate().toISOString();
        }
        return timestamp;
    }
}

// Singleton
const databaseService = new DatabaseService();
export default databaseService;

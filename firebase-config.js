/**
 * 3P VIAJESPRO - Firebase Configuration v5
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getFirestore, collection, doc, setDoc, getDocs, deleteDoc, onSnapshot, query, where } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAzkggisrJ61xrIEGIqQS4j7Aab0e_XPEA",
    authDomain: "viajespro-3p.firebaseapp.com",
    projectId: "viajespro-3p",
    storageBucket: "viajespro-3p.firebasestorage.app",
    messagingSenderId: "615680223699",
    appId: "1:615680223699:web:67dd37d594062eb713e726",
    measurementId: "G-4KW6PXPQ4L"
};

const app = initializeApp(firebaseConfig);
const dbFirebase = getFirestore(app);

console.log('🔥 Firebase v5 inicializado');

// Sincronizar DESDE Firebase a IndexedDB (descargar datos)
async function syncFromFirebase() {
    console.log('⬇️ Descargando datos de Firebase...');
    
    try {
        // Obtener todos los datos de Firebase
        const [vendedoresSnap, viajesSnap, gastosSnap] = await Promise.all([
            getDocs(collection(dbFirebase, 'vendedores')),
            getDocs(collection(dbFirebase, 'viajes')),
            getDocs(collection(dbFirebase, 'gastos'))
        ]);
        
        const vendedores = vendedoresSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const viajes = viajesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const gastos = gastosSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        console.log('📥 Datos recibidos:', {
            vendedores: vendedores.length,
            viajes: viajes.length,
            gastos: gastos.length
        });
        
        // Limpiar IndexedDB local primero para evitar duplicados
        const localVendedores = await db.getAll('vendedores');
        const localViajes = await db.getAll('viajes');
        const localGastos = await db.getAll('gastos');
        
        // Actualizar o agregar vendedores
        for (const v of vendedores) {
            const existe = localVendedores.find(lv => lv.id === v.id);
            if (existe) {
                // Comparar fechas para ver cuál es más reciente
                const fechaRemota = new Date(v.updatedAt || v.createdAt || 0);
                const fechaLocal = new Date(existe.updatedAt || existe.createdAt || 0);
                
                if (fechaRemota > fechaLocal) {
                    await db.update('vendedores', v);
                    console.log('🔄 Vendedor actualizado:', v.id);
                }
            } else {
                try {
                    await db.add('vendedores', v);
                    console.log('➕ Vendedor agregado:', v.id);
                } catch (e) {
                    await db.update('vendedores', v);
                }
            }
        }
        
        // Actualizar o agregar viajes
        for (const v of viajes) {
            const existe = localViajes.find(lv => lv.id === v.id);
            if (existe) {
                const fechaRemota = new Date(v.updatedAt || v.createdAt || 0);
                const fechaLocal = new Date(existe.updatedAt || existe.createdAt || 0);
                
                if (fechaRemota > fechaLocal) {
                    await db.update('viajes', v);
                }
            } else {
                try {
                    await db.add('viajes', v);
                } catch (e) {
                    await db.update('viajes', v);
                }
            }
        }
        
        // Actualizar o agregar gastos
        for (const g of gastos) {
            const existe = localGastos.find(lg => lg.id === g.id);
            if (existe) {
                const fechaRemota = new Date(g.updatedAt || g.createdAt || 0);
                const fechaLocal = new Date(existe.updatedAt || existe.createdAt || 0);
                
                if (fechaRemota > fechaLocal) {
                    await db.update('gastos', g);
                }
            } else {
                try {
                    await db.add('gastos', g);
                } catch (e) {
                    await db.update('gastos', g);
                }
            }
        }
        
        console.log('✅ Sincronización completada');
        return { vendedores: vendedores.length, viajes: viajes.length, gastos: gastos.length };
        
    } catch (error) {
        console.error('❌ Error sincronizando:', error);
        return null;
    }
}

// Guardar en Firebase (subir datos)
async function saveToFirebase(collectionName, data) {
    try {
        await setDoc(doc(dbFirebase, collectionName, data.id), data);
        console.log(`☁️ Guardado en Firebase: ${collectionName}/${data.id}`);
    } catch (e) {
        console.error('❌ Error guardando en Firebase:', e);
    }
}

// Eliminar de Firebase
async function deleteFromFirebase(collectionName, id) {
    try {
        await deleteDoc(doc(dbFirebase, collectionName, id));
        console.log(`🗑️ Eliminado de Firebase: ${collectionName}/${id}`);
    } catch (e) {
        console.error('❌ Error eliminando de Firebase:', e);
    }
}

// Listeners en tiempo real
function setupRealtimeListeners() {
    console.log('👂 Configurando listeners en tiempo real...');
    
    // Listener de vendedores
    onSnapshot(collection(dbFirebase, 'vendedores'), (snapshot) => {
        console.log('📡 Cambio detectado en vendedores');
        snapshot.docChanges().forEach(async (change) => {
            const data = { id: change.doc.id, ...change.doc.data() };
            
            if (change.type === 'added' || change.type === 'modified') {
                // Actualizar IndexedDB local
                try {
                    await db.update('vendedores', data);
                } catch (e) {
                    try {
                        await db.add('vendedores', data);
                    } catch (e2) {
                        // Ya existe, ignorar error
                    }
                }
                
                // Recargar lista si estamos en esa pantalla
                if (document.getElementById('vendors-list')) {
                    loadVendorsList();
                }
            }
        });
    });
    
    // Listener de viajes
    onSnapshot(collection(dbFirebase, 'viajes'), (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            const data = { id: change.doc.id, ...change.doc.data() };
            
            if (change.type === 'added' || change.type === 'modified') {
                try {
                    await db.update('viajes', data);
                } catch (e) {
                    try { await db.add('viajes', data); } catch (e2) {}
                }
                
                if (document.getElementById('viajes-section')?.classList.contains('active')) {
                    loadViajes();
                }
            }
        });
    });
    
    // Listener de gastos
    onSnapshot(collection(dbFirebase, 'gastos'), (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            const data = { id: change.doc.id, ...change.doc.data() };
            
            if (change.type === 'added' || change.type === 'modified') {
                try {
                    await db.update('gastos', data);
                } catch (e) {
                    try { await db.add('gastos', data); } catch (e2) {}
                }
                
                if (document.getElementById('gastos-section')?.classList.contains('active')) {
                    loadGastosList();
                }
            }
        });
    });
    
    console.log('✅ Listeners activos');
}

// Forzar sincronización completa
async function forceSync() {
    showToast('🔄 Sincronizando datos...', 'info');
    const result = await syncFromFirebase();
    if (result) {
        showToast(`✅ Sincronizado: ${result.vendedores} vendedores, ${result.viajes} viajes`, 'success');
        // Recargar vistas activas
        if (document.getElementById('vendors-list')) loadVendorsList();
        if (document.getElementById('viajes-section')?.classList.contains('active')) loadViajes();
        if (document.getElementById('gastos-section')?.classList.contains('active')) loadGastosList();
    } else {
        showToast('❌ Error al sincronizar', 'error');
    }
}

window.dbFirebase = dbFirebase;
window.syncFromFirebase = syncFromFirebase;
window.setupRealtimeListeners = setupRealtimeListeners;
window.saveToFirebase = saveToFirebase;
window.deleteFromFirebase = deleteFromFirebase;
window.forceSync = forceSync;

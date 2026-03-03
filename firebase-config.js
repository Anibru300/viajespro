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

// Flag para evitar bucles de sincronización
let isSyncingFromFirebase = false;

// Sincronizar DESDE Firebase a IndexedDB (descargar datos)
async function syncFromFirebase() {
    if (isSyncingFromFirebase) {
        console.log('⏳ Sincronización ya en progreso, ignorando...');
        return;
    }
    
    isSyncingFromFirebase = true;
    console.log('⬇️ Descargando datos de Firebase...');
    
    try {
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
        
        // Obtener datos locales para comparar
        const localVendedores = await db.getAll('vendedores');
        const localViajes = await db.getAll('viajes');
        const localGastos = await db.getAll('gastos');
        
        // Actualizar o agregar vendedores (solo si son más recientes)
        for (const v of vendedores) {
            const existe = localVendedores.find(lv => lv.id === v.id);
            if (existe) {
                const fechaRemota = new Date(v.updatedAt || v.createdAt || 0);
                const fechaLocal = new Date(existe.updatedAt || existe.createdAt || 0);
                
                if (fechaRemota > fechaLocal) {
                    // Actualizar sin disparar sincronización inversa
                    await db.updateSilent('vendedores', v);
                    console.log('🔄 Vendedor actualizado:', v.id);
                }
            } else {
                try {
                    await db.addSilent('vendedores', v);
                    console.log('➕ Vendedor agregado:', v.id);
                } catch (e) {
                    await db.updateSilent('vendedores', v);
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
                    await db.updateSilent('viajes', v);
                }
            } else {
                try {
                    await db.addSilent('viajes', v);
                } catch (e) {
                    await db.updateSilent('viajes', v);
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
                    await db.updateSilent('gastos', g);
                }
            } else {
                try {
                    await db.addSilent('gastos', g);
                } catch (e) {
                    await db.updateSilent('gastos', g);
                }
            }
        }
        
        console.log('✅ Sincronización completada');
        return { vendedores: vendedores.length, viajes: viajes.length, gastos: gastos.length };
        
    } catch (error) {
        console.error('❌ Error sincronizando:', error);
        return null;
    } finally {
        isSyncingFromFirebase = false;
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
        if (isSyncingFromFirebase) return; // Ignorar durante sincronización inicial
        
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === 'added' || change.type === 'modified') {
                const data = { id: change.doc.id, ...change.doc.data() };
                console.log('📡 Cambio detectado en vendedores:', data.id);
                
                try {
                    await db.updateSilent('vendedores', data);
                } catch (e) {
                    try { await db.addSilent('vendedores', data); } catch (e2) {}
                }
                
                // Recargar lista si estamos en esa pantalla
                if (document.getElementById('vendors-list') && typeof loadVendorsList === 'function') {
                    loadVendorsList();
                }
            }
        });
    });
    
    // Listener de viajes
    onSnapshot(collection(dbFirebase, 'viajes'), (snapshot) => {
        if (isSyncingFromFirebase) return;
        
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === 'added' || change.type === 'modified') {
                const data = { id: change.doc.id, ...change.doc.data() };
                
                try {
                    await db.updateSilent('viajes', data);
                } catch (e) {
                    try { await db.addSilent('viajes', data); } catch (e2) {}
                }
                
                if (document.getElementById('viajes-section')?.classList.contains('active') && typeof loadViajes === 'function') {
                    loadViajes();
                }
            }
        });
    });
    
    // Listener de gastos
    onSnapshot(collection(dbFirebase, 'gastos'), (snapshot) => {
        if (isSyncingFromFirebase) return;
        
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === 'added' || change.type === 'modified') {
                const data = { id: change.doc.id, ...change.doc.data() };
                
                try {
                    await db.updateSilent('gastos', data);
                } catch (e) {
                    try { await db.addSilent('gastos', data); } catch (e2) {}
                }
                
                if (document.getElementById('gastos-section')?.classList.contains('active') && typeof loadGastosList === 'function') {
                    loadGastosList();
                }
            }
        });
    });
    
    console.log('✅ Listeners activos');
}

// Forzar sincronización completa
async function forceSync() {
    if (typeof showToast === 'function') {
        showToast('🔄 Sincronizando datos...', 'info');
    }
    const result = await syncFromFirebase();
    if (result) {
        if (typeof showToast === 'function') {
            showToast(`✅ Sincronizado: ${result.vendedores} vendedores, ${result.viajes} viajes, ${result.gastos} gastos`, 'success');
        }
        if (document.getElementById('vendors-list') && typeof loadVendorsList === 'function') loadVendorsList();
        if (document.getElementById('viajes-section')?.classList.contains('active') && typeof loadViajes === 'function') loadViajes();
        if (document.getElementById('gastos-section')?.classList.contains('active') && typeof loadGastosList === 'function') loadGastosList();
    } else {
        if (typeof showToast === 'function') {
            showToast('❌ Error al sincronizar', 'error');
        }
    }
}

window.dbFirebase = dbFirebase;
window.syncFromFirebase = syncFromFirebase;
window.setupRealtimeListeners = setupRealtimeListeners;
window.saveToFirebase = saveToFirebase;
window.deleteFromFirebase = deleteFromFirebase;
window.forceSync = forceSync;

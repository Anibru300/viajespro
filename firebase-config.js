/**
 * 3P VIAJESPRO - Firebase Configuration v5.1
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getFirestore, collection, doc, setDoc, getDocs, deleteDoc, onSnapshot, query, where, getDoc } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

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

console.log('🔥 Firebase v5.1 inicializado');

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

// Sincronizar DESDE Firebase a IndexedDB (descargar datos)
async function syncFromFirebase() {
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
        
        // Guardar en IndexedDB sin disparar eventos de sync
        for (const v of vendedores) {
            try {
                await db.addSilent('vendedores', v);
            } catch (e) {
                await db.updateSilent('vendedores', v);
            }
        }
        
        for (const v of viajes) {
            try {
                await db.addSilent('viajes', v);
            } catch (e) {
                await db.updateSilent('viajes', v);
            }
        }
        
        for (const g of gastos) {
            try {
                await db.addSilent('gastos', g);
            } catch (e) {
                await db.updateSilent('gastos', g);
            }
        }
        
        console.log('✅ Sincronización completada');
        
        // Recargar vistas si es necesario
        if (document.getElementById('vendors-list') && typeof loadVendorsList === 'function') {
            loadVendorsList();
        }
        if (document.getElementById('viajes-section')?.classList.contains('active') && typeof loadViajes === 'function') {
            loadViajes();
        }
        if (document.getElementById('gastos-section')?.classList.contains('active') && typeof loadGastosList === 'function') {
            loadGastosList();
        }
        
        return { vendedores: vendedores.length, viajes: viajes.length, gastos: gastos.length };
        
    } catch (error) {
        console.error('❌ Error sincronizando:', error);
        return null;
    }
}

// Listeners en tiempo real - SIMPLIFICADOS
function setupRealtimeListeners() {
    console.log('👂 Configurando listeners en tiempo real...');
    
    // Listener de vendedores - solo log, no recarga automática
    onSnapshot(collection(dbFirebase, 'vendedores'), (snapshot) => {
        console.log('📡 Cambios detectados en vendedores:', snapshot.docChanges().length);
        snapshot.docChanges().forEach(async (change) => {
            const data = { id: change.doc.id, ...change.doc.data() };
            console.log(`  - ${change.type}: ${data.id}`);
            
            // Actualizar IndexedDB silenciosamente
            if (change.type === 'added' || change.type === 'modified') {
                try {
                    await db.updateSilent('vendedores', data);
                } catch (e) {
                    try { await db.addSilent('vendedores', data); } catch (e2) {}
                }
            }
        });
    });
    
    // Listener de viajes
    onSnapshot(collection(dbFirebase, 'viajes'), (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === 'added' || change.type === 'modified') {
                const data = { id: change.doc.id, ...change.doc.data() };
                try {
                    await db.updateSilent('viajes', data);
                } catch (e) {
                    try { await db.addSilent('viajes', data); } catch (e2) {}
                }
            }
        });
    });
    
    // Listener de gastos
    onSnapshot(collection(dbFirebase, 'gastos'), (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === 'added' || change.type === 'modified') {
                const data = { id: change.doc.id, ...change.doc.data() };
                try {
                    await db.updateSilent('gastos', data);
                } catch (e) {
                    try { await db.addSilent('gastos', data); } catch (e2) {}
                }
            }
        });
    });
    
    console.log('✅ Listeners activos');
}

// Forzar sincronización completa
async function forceSync() {
    if (typeof showToast === 'function') {
        showToast('🔄 Sincronizando...', 'info');
    }
    const result = await syncFromFirebase();
    if (result) {
        if (typeof showToast === 'function') {
            showToast(`✅ Sincronizado`, 'success');
        }
        // Recargar vistas
        if (typeof loadVendorsList === 'function') loadVendorsList();
        if (typeof loadViajes === 'function') loadViajes();
        if (typeof loadGastosList === 'function') loadGastosList();
    }
}

window.dbFirebase = dbFirebase;
window.syncFromFirebase = syncFromFirebase;
window.setupRealtimeListeners = setupRealtimeListeners;
window.saveToFirebase = saveToFirebase;
window.deleteFromFirebase = deleteFromFirebase;
window.forceSync = forceSync;

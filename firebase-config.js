/**
 * 3P VIAJESPRO - Firebase Configuration
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getFirestore, collection, doc, setDoc, getDocs, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

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

console.log('🔥 Firebase inicializado');

async function syncFromFirebase() {
    console.log('⬇️ Descargando datos...');
    
    try {
        const [vendedoresSnap, viajesSnap, gastosSnap] = await Promise.all([
            getDocs(collection(dbFirebase, 'vendedores')),
            getDocs(collection(dbFirebase, 'viajes')),
            getDocs(collection(dbFirebase, 'gastos'))
        ]);
        
        const vendedores = vendedoresSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const viajes = viajesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const gastos = gastosSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        for (const v of vendedores) {
            try { await db.add('vendedores', v); } 
            catch (e) { await db.update('vendedores', v); }
        }
        
        for (const v of viajes) {
            try { await db.add('viajes', v); }
            catch (e) { await db.update('viajes', v); }
        }
        
        for (const g of gastos) {
            try { await db.add('gastos', g); }
            catch (e) { await db.update('gastos', g); }
        }
        
        console.log('✅ Sincronizado');
        return { vendedores: vendedores.length, viajes: viajes.length, gastos: gastos.length };
        
    } catch (error) {
        console.error('❌ Error:', error);
        return null;
    }
}

function setupRealtimeListeners() {
    onSnapshot(collection(dbFirebase, 'vendedores'), () => {
        if (document.getElementById('vendors-list')) loadVendorsList();
    });
    
    onSnapshot(collection(dbFirebase, 'viajes'), () => {
        if (document.getElementById('viajes-section')?.classList.contains('active')) loadViajes();
    });
    
    onSnapshot(collection(dbFirebase, 'gastos'), () => {
        if (document.getElementById('gastos-section')?.classList.contains('active')) loadGastosList();
    });
}

async function saveToFirebase(collectionName, data) {
    try {
        await setDoc(doc(dbFirebase, collectionName, data.id), data);
        console.log(`☁️ Guardado: ${collectionName}/${data.id}`);
    } catch (e) {
        console.error('Error Firebase:', e);
    }
}

async function deleteFromFirebase(collectionName, id) {
    try {
        await deleteDoc(doc(dbFirebase, collectionName, id));
    } catch (e) {
        console.error('Error eliminando:', e);
    }
}

window.dbFirebase = dbFirebase;
window.syncFromFirebase = syncFromFirebase;
window.setupRealtimeListeners = setupRealtimeListeners;
window.saveToFirebase = saveToFirebase;
window.deleteFromFirebase = deleteFromFirebase;

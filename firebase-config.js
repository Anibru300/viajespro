// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
const db = getFirestore(app);

// Habilitar persistencia offline
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
        console.warn('Persistencia offline no disponible: múltiples pestañas abiertas');
    } else if (err.code === 'unimplemented') {
        console.warn('El navegador no soporta persistencia offline');
    }
});

export { db };

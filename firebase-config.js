/**
 * 3P VIAJESPRO - Firebase Configuration (MODO OFFLINE - Cuota excedida)
 */

console.log('⚠️ Firebase desactivado - Modo offline activo');

// Funciones vacías para evitar errores
window.dbFirebase = null;
window.syncFromFirebase = async () => {
    console.log('ℹ️ Sincronización omitida (modo offline)');
    return null;
};
window.setupRealtimeListeners = () => {
    console.log('ℹ️ Listeners omitidos (modo offline)');
};
window.saveToFirebase = async () => {
    console.log('ℹ️ Guardado en Firebase omitido (modo offline)');
};
window.deleteFromFirebase = async () => {
    console.log('ℹ️ Eliminación en Firebase omitida (modo offline)');
};
window.forceSync = async () => {
    showToast('ℹ️ Modo offline activo - sincronización deshabilitada', 'info');
};

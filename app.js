/**
 * 3P VIAJESPRO - Main Application v6.0
 * Con módulos de seguridad, storage y UX mejorada
 */

// ===== IMPORTS DE MÓDULOS =====
import authService from './modules/auth.js';
import storageService from './modules/storage.js';
import utils from './modules/utils.js';
import databaseService from './modules/database.js';
import { app, db as firestoreDb } from './firebase-config.js';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";
import { where, writeBatch, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Inicializar Functions (región us-central1 donde están desplegadas las Cloud Functions)
import { auth } from './firebase-config.js';
const functions = getFunctions(app, 'us-central1');

// Nota: Para funciones v2, la región se configura principalmente en el servidor,
// pero el SDK del cliente necesita saber la región para construir la URL correcta.
// Descomentar para desarrollo local con emulador:
// connectFunctionsEmulator(functions, "localhost", 5001);

// Helper para llamar Cloud Functions con autenticación asegurada
async function callWithAuth(functionName, data) {
    // Verificar que hay un usuario autenticado en Firebase Auth
    const currentUser = auth.currentUser;
    if (!currentUser) {
        debug('Error: No hay usuario autenticado (auth.currentUser es null)');
        // Intentar obtener el usuario del authService como fallback
        const authState = authService.getCurrentUser();
        if (authState.user) {
            debug('Usuario encontrado en authService, pero no en auth.currentUser');
        }
        throw new Error('No hay usuario autenticado. Inicia sesión nuevamente.');
    }
    
    debug(`Llamando a ${functionName} con usuario UID:`, currentUser.uid);
    
    // Forzar refresh del token para asegurar que está vigente
    let token;
    try {
        token = await currentUser.getIdToken(true);
        debug(`Token obtenido para llamada a ${functionName}, longitud:`, token ? token.length : 0);
    } catch (tokenError) {
        debug('Error refrescando token:', tokenError);
        throw new Error('Error al verificar sesión. Inicia sesión nuevamente.');
    }
    
    // Hacer la llamada con manejo de errores mejorado
    try {
        debug(`Iniciando llamada httpsCallable a '${functionName}'`);
        const callable = httpsCallable(functions, functionName);
        const result = await callable(data);
        debug(`Respuesta exitosa de ${functionName}:`, result.data);
        return result;
    } catch (error) {
        debug(`Error en ${functionName}:`, {
            code: error.code,
            message: error.message,
            details: error.details,
            customData: error.customData
        });
        // Mapear errores de functions a mensajes amigables
        if (error.code === 'unauthenticated') {
            throw new Error('Sesión expirada. Cierra sesión y vuelve a entrar.');
        } else if (error.code === 'permission-denied') {
            throw new Error('No tienes permisos para realizar esta acción.');
        } else if (error.code === 'invalid-argument') {
            throw new Error(error.message || 'Datos inválidos. Verifica la información.');
        } else if (error.code === 'internal') {
            throw new Error('Error del servidor. Intenta nuevamente.');
        } else if (error.code === 'not-found') {
            throw new Error('Función no encontrada. Contacta al administrador.');
        } else if (error.code === 'cancelled') {
            throw new Error('La operación fue cancelada.');
        } else if (error.code === 'unknown' || error.code === 'deadline-exceeded') {
            throw new Error('Error de conexión. Verifica tu internet e intenta nuevamente.');
        } else if (error.code === 'functions/unauthenticated' || error.code === 'functions/unauthorized') {
            throw new Error('Error de autenticación con Cloud Functions. Intenta cerrar sesión y entrar nuevamente.');
        }
        throw error;
    }
}

// ===== CONFIGURACIÓN =====
const CONFIG = {
    ADMIN_USER: 'admin',
    ADMIN_PASS: 'admin123',
    VERSION: '6.0.0',
    APP_NAME: '3P Control de Gastos',
    ENABLE_STORAGE: true,  // Usar Firebase Storage para imágenes
    ENABLE_GEOLOCATION: true,
    AUTOSAVE_INTERVAL: 10000 // 10 segundos
};

// ===== ESTADO GLOBAL =====
const state = {
    currentUser: null,
    currentVendor: null,
    currentViaje: null,
    currentGasto: null,
    tempFotos: [],
    tempImageData: [], // Para nuevas imágenes con metadata
    isOnline: navigator.onLine,
    charts: {},
    filters: { viajes: 'all', gastos: '' },
    lastReport: null,
    gastosCache: [],
    viajesCache: [],
    currentPosition: null,
    isLoading: false,
    searchQuery: ''
};

// ===== ICONOS =====
const TIPOS_GASTO = {
    gasolina: { icon: '⛽', color: '#dc2626', label: 'Gasolina' },
    comida: { icon: '🍔', color: '#f59e0b', label: 'Comida' },
    hotel: { icon: '🏨', color: '#3b82f6', label: 'Hotel' },
    transporte: { icon: '🚌', color: '#10b981', label: 'Transporte' },
    casetas: { icon: '🛣️', color: '#6366f1', label: 'Casetas' },
    otros: { icon: '📦', color: '#6b7280', label: 'Otros' }
};

// ===== FUNCIONES DE FECHA/HORA MÉXICO =====
function getMexicoDateTime() {
    return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" }));
}

function formatDateTimeMexico(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('es-MX', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}

function formatDateMexico(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-MX', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

function getMexicoDateTimeLocal() {
    const mexicoTime = new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" });
    const date = new Date(mexicoTime);
    return date.toISOString().slice(0, 16);
}

function debug(msg, data) {
    console.log(`[DEBUG v6.0] ${msg}`, data || '');
}

// ===== ESCAPE HTML =====
function escapeHtml(text) {
    if (text == null) return '';
    return String(text).replace(/[&<>"]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        if (m === '"') return '&quot;';
        return m;
    });
}

// ===== INICIALIZACIÓN MEJORADA v6.0 =====
document.addEventListener('DOMContentLoaded', async () => {
    debug('DOM cargado, iniciando v6.0...');
    
    // Inicializar modo oscuro
    utils.initDarkMode();
    
    // Inicializar detector offline
    utils.initOfflineDetector((isOnline) => {
        state.isOnline = isOnline;
        updateConnectionStatus(isOnline);
    });
    
    // Splash screen
    setTimeout(() => {
        const splash = document.getElementById('splash-screen');
        if (splash) {
            splash.style.opacity = '0';
            setTimeout(() => splash.remove(), 500);
        }
    }, 1500);

    try {
        await initApp();
    } catch (error) {
        debug('Error en initApp:', error);
        showToast('Error al iniciar: ' + error.message, 'error');
    }
});

async function initApp() {
    debug('Iniciando app v6.0...');
    
    // Verificar que window.db esté disponible (ViajesProDB desde db.js)
    if (typeof window.db === 'undefined') {
        throw new Error('La base de datos (window.db) no está cargada. Verifica que db.js se cargó correctamente.');
    }
    
    debug('DB lista (ViajesProDB)');
    
    // Inicializar auth
    await authService.init();
    
    // Verificar sesión existente
    checkSession();
    
    setupEventListeners();
    updateConnectionStatus();
    
    // Configurar fechas por defecto
    const today = new Date().toISOString().split('T')[0];
    if (document.getElementById('viaje-fecha-inicio')) {
        document.getElementById('viaje-fecha-inicio').value = today;
    }
    if (document.getElementById('fecha-gasto')) {
        document.getElementById('fecha-gasto').value = getMexicoDateTimeLocal();
    }
    
    const firstDay = new Date();
    firstDay.setDate(1);
    if (document.getElementById('reporte-fecha-inicio')) {
        document.getElementById('reporte-fecha-inicio').value = firstDay.toISOString().split('T')[0];
    }
    if (document.getElementById('reporte-fecha-fin')) {
        document.getElementById('reporte-fecha-fin').value = today;
    }
    
    // Cargar borrador si existe
    loadDraftGasto();
    
    debug('App v6.0 iniciada correctamente');
}

function setupEventListeners() {
    debug('Configurando event listeners...');
    
    window.addEventListener('online', () => updateConnectionStatus(true));
    window.addEventListener('offline', () => updateConnectionStatus(false));
    
    const cameraInput = document.getElementById('camera-input');
    if (cameraInput) {
        cameraInput.addEventListener('change', handlePhotoCapture);
    }
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });

    const gastosViajeSelect = document.getElementById('gastos-viaje-select');
    if (gastosViajeSelect) {
        gastosViajeSelect.addEventListener('change', loadGastosList);
    }

    const filterViajeStatus = document.getElementById('filter-viaje-status');
    if (filterViajeStatus) {
        filterViajeStatus.addEventListener('change', () => {
            utils.debounce('filterViajes', () => loadViajes(), 300);
        });
    }

    const gastosEstadoSelect = document.getElementById('gastos-estado-select');
    if (gastosEstadoSelect) {
        gastosEstadoSelect.addEventListener('change', () => {
            utils.debounce('filterGastos', () => loadGastosList(), 300);
        });
    }

    const perfilClickeable = document.getElementById('perfil-clickeable');
    if (perfilClickeable) {
        perfilClickeable.addEventListener('click', abrirPerfil);
    }
    
    // Búsqueda en gastos (debounced)
    const searchInput = document.getElementById('search-gastos');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            state.searchQuery = e.target.value;
            utils.debounce('searchGastos', () => searchGastos(e.target.value), 300);
        });
    }
}

// ===== NAVEGACIÓN =====
function showScreen(screenId) {
    debug('Cambiando a pantalla:', screenId);
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.add('hidden');
    });
    const screen = document.getElementById(screenId);
    if (screen) {
        screen.classList.remove('hidden');
    }
}

function showSection(sectionName) {
    debug('Mostrando sección:', sectionName);
    
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.section === sectionName) {
            btn.classList.add('active');
        }
    });
    
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    const sectionEl = document.getElementById(`${sectionName}-section`);
    if (sectionEl) {
        sectionEl.classList.add('active');
        
        if (sectionName === 'viajes') loadViajes();
        if (sectionName === 'gastos') {
            loadViajesSelect();
            loadGastosList();
        }
        if (sectionName === 'captura') {
            loadViajesSelect();
            resetCapturaForm();
            // Obtener ubicación automáticamente
            if (CONFIG.ENABLE_GEOLOCATION) {
                obtenerUbicacion();
            }
        }
        if (sectionName === 'reportes') {
            loadViajesSelect();
        }
        if (sectionName === 'dashboard') {
            loadDashboard();
        }
    }
}

function showAdminTab(tabName) {
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    event.target.classList.add('active');
    
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.classList.remove('active');
        tab.classList.add('hidden');
    });
    
    const tabEl = document.getElementById(`admin-tab-${tabName}`);
    if (tabEl) {
        tabEl.classList.remove('hidden');
        tabEl.classList.add('active');
    }
    
    if (tabName === 'reportes') loadGlobalReport();
}

// ===== LOGIN MEJORADO v6.0 =====
async function login() {
    debug('Iniciando login v6.0...');
    
    const username = document.getElementById('login-username').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;
    const remember = document.getElementById('remember-me').checked;
    const btn = document.querySelector('#login-form .btn-primary');
    
    if (!username || !password) {
        showToast('Ingresa usuario y contraseña', 'warning');
        return;
    }
    
    setLoading(btn, true);
    
    try {
        const result = await authService.login(username, password, remember);
        
        // Asegurar que el vendor tenga el uid
        if (result.vendor && !result.vendor.uid) {
            result.vendor.uid = auth.currentUser?.uid;
        }
        
        if (result.isAdmin) {
            state.currentUser = { type: 'admin' };
            state.currentVendor = result.vendor;
            showToast('Bienvenido, Administrador', 'success');
            showAdminPanel();
        } else {
            state.currentUser = { type: 'vendor' };
            state.currentVendor = result.vendor;
            showToast(`¡Bienvenido, ${result.vendor.name}!`, 'success');
            showMainApp();
        }
        
        debug('Login exitoso - currentVendor:', state.currentVendor);
        
    } catch (error) {
        debug('Error en login:', error);
        showToast(error.message, 'error');
    } finally {
        setLoading(btn, false);
    }
}

async function loginAdmin() {
    debug('Login admin...');
    
    const username = document.getElementById('admin-username').value;
    const password = document.getElementById('admin-password').value;
    
    try {
        const result = await authService.login(username, password);
        if (result.isAdmin) {
            state.currentUser = { type: 'admin' };
            state.currentVendor = result.vendor;
            showToast('Bienvenido, Administrador', 'success');
            showAdminPanel();
        } else {
            document.getElementById('admin-login-error').textContent = 'Credenciales incorrectas';
            showToast('Credenciales incorrectas', 'error');
        }
    } catch (error) {
        document.getElementById('admin-login-error').textContent = error.message;
        showToast(error.message, 'error');
    }
}

function checkSession() {
    debug('Verificando sesión...');
    const user = authService.getCurrentUser();
    
    if (user.user || user.isAdmin) {
        state.currentUser = user.isAdmin ? { type: 'admin' } : { type: 'vendor' };
        state.currentVendor = user.vendor;
        
        if (user.isAdmin) {
            showAdminPanel();
        } else {
            showMainApp();
        }
    } else {
        showLoginScreen();
    }
}

function showLoginScreen() {
    showScreen('login-screen');
}

function showAdminLogin() {
    showScreen('admin-login-screen');
}

function backToLogin() {
    showLoginScreen();
}

async function logout() {
    if (confirm('¿Cerrar sesión?')) {
        try {
            await authService.logout();
            state.currentUser = null;
            state.currentVendor = null;
            state.currentViaje = null;
            state.gastosCache = [];
            state.viajesCache = [];
            location.reload();
        } catch (error) {
            showToast('Error al cerrar sesión', 'error');
        }
    }
}

// ===== ADMIN =====
function showAdminPanel() {
    debug('Mostrando panel admin');
    showScreen('admin-panel');
    loadVendorsList();
}

// ===== REGISTRO VENDEDOR (admin) - Usa Cloud Function =====
async function registerVendor() {
    debug('=== REGISTRO DE VENDEDOR VIA CLOUD FUNCTION ===');
    
    const nameInput = document.getElementById('new-vendor-name');
    const usernameInput = document.getElementById('new-vendor-username');
    const passwordInput = document.getElementById('new-vendor-password');
    const emailInput = document.getElementById('new-vendor-email');
    const zoneInput = document.getElementById('new-vendor-zone');
    const errorDiv = document.getElementById('register-error');
    const btn = document.querySelector('#admin-tab-vendedores .btn-primary');
    
    if (!nameInput || !usernameInput || !passwordInput || !emailInput) {
        console.error('No se encontraron campos del formulario');
        return;
    }
    
    const name = nameInput.value.trim();
    const username = usernameInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    const email = emailInput.value.trim();
    const zone = zoneInput ? zoneInput.value : 'Bajío';
    
    if (errorDiv) errorDiv.textContent = '';
    
    // Validación de campos obligatorios
    if (!name || !username || !password || !email) {
        const msg = 'Nombre, usuario, correo y contraseña son obligatorios';
        if (errorDiv) errorDiv.textContent = msg;
        showToast(msg, 'warning');
        return;
    }
    
    // Validación de formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        const msg = 'El formato del correo electrónico no es válido';
        if (errorDiv) errorDiv.textContent = msg;
        showToast(msg, 'warning');
        return;
    }
    
    if (password.length < 6) {
        const msg = 'La contraseña debe tener al menos 6 caracteres';
        if (errorDiv) errorDiv.textContent = msg;
        showToast(msg, 'warning');
        return;
    }
    
    if (!/^[a-z0-9.]+$/.test(username)) {
        const msg = 'Usuario solo puede contener letras minúsculas, números y puntos';
        if (errorDiv) errorDiv.textContent = msg;
        showToast(msg, 'warning');
        return;
    }
    
    setLoading(btn, true);
    
    try {
        // Llamar a la Cloud Function
        debug('Llamando Cloud Function createVendor:', { name, username, email, zone });
        
        const result = await callWithAuth('createVendor', {
            name: name,
            username: username,
            password: password,
            email: email,
            zone: zone
        });
        
        debug('Respuesta Cloud Function:', result.data);
        
        showToast(`✅ ${result.data?.message || 'Vendedor registrado exitosamente'}`, 'success');
        
        // Limpiar formulario
        nameInput.value = '';
        usernameInput.value = '';
        passwordInput.value = '';
        emailInput.value = '';
        
        await loadVendorsList();
        
    } catch (error) {
        debug('Error al registrar:', error);
        
        // Traducir errores específicos de Cloud Functions
        let errorMsg = 'Error al registrar vendedor';
        
        if (error.code === 'functions/permission-denied' || error.code === 'functions/unauthenticated') {
            errorMsg = 'No tienes permisos para crear vendedores. Inicia sesión nuevamente.';
        } else if (error.code === 'functions/already-exists') {
            errorMsg = error.message || 'Ya existe un vendedor con este correo o nombre de usuario';
        } else if (error.code === 'functions/invalid-argument') {
            errorMsg = error.message || 'Datos inválidos. Verifica la información ingresada.';
        } else if (error.code === 'functions/internal') {
            errorMsg = error.message || 'Error del servidor. Intenta nuevamente.';
        } else if (error.code === 'functions/not-found') {
            errorMsg = error.message || 'Recurso no encontrado.';
        } else if (error.details?.message) {
            errorMsg = error.details.message;
        } else if (error.message) {
            errorMsg = error.message;
        }
        
        if (errorDiv) errorDiv.textContent = errorMsg;
        showToast(errorMsg, 'error');
    } finally {
        setLoading(btn, false);
    }
}

// ===== CARGAR VENDEDORES (admin) =====
let lastVendorsLoad = 0;
const VENDORS_LOAD_COOLDOWN = 2000;
let vendorsCache = []; // Cache de vendedores para búsquedas

async function loadVendorsList() {
    const now = Date.now();
    if (now - lastVendorsLoad < VENDORS_LOAD_COOLDOWN) {
        debug('Ignorando carga de vendedores (cooldown)');
        return;
    }
    lastVendorsLoad = now;
    
    debug('Cargando lista de vendedores...');
    
    try {
        const vendors = await db.getAll('vendedores');
        debug('Vendedores encontrados:', vendors.length);
        
        // Guardar en cache con su UID
        vendorsCache = vendors.map(v => ({ ...v, _docId: v.id }));
        
        const container = document.getElementById('vendors-list');
        if (!container) return;
        
        if (vendors.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No hay vendedores registrados</p></div>';
            return;
        }
        
        container.innerHTML = vendors.map(v => `
            <div class="vendor-card" data-uid="${v.id}" data-username="${v.username}">
                <div class="vendor-info">
                    <h4>${escapeHtml(v.name)}</h4>
                    <p>
                        <span class="vendor-status ${v.status}"></span>
                        @${escapeHtml(v.username)} • ${escapeHtml(v.zone)}
                    </p>
                </div>
                <div class="vendor-actions">
                    <button class="btn btn-small btn-primary" onclick="editVendor('${v.username}')">Editar</button>
                    <button class="btn btn-small btn-secondary" onclick="deleteVendor('${v.username}', this)">Eliminar</button>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        debug('Error cargando vendedores:', error);
        showToast('Error al cargar vendedores', 'error');
    }
}

function filterVendors() {
    const search = document.getElementById('search-vendors').value.toLowerCase();
    document.querySelectorAll('.vendor-card').forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(search) ? 'flex' : 'none';
    });
}

// ===== LIMPIAR TODOS LOS VIAJES Y GASTOS (SOLO ADMIN) =====
async function limpiarTodosLosDatos() {
    // Verificar que sea admin
    if (!state.currentUser || state.currentUser.type !== 'admin') {
        showToast('Solo administradores pueden ejecutar esta acción', 'error');
        return;
    }
    
    if (!confirm('⚠️ ATENCIÓN ⚠️\n\nEsta acción ELIMINARÁ TODOS los viajes y gastos de la base de datos.\n\nLos vendedores NO se eliminarán.\n\n¿Estás seguro de continuar?')) {
        return;
    }
    
    if (!confirm('ÚLTIMA CONFIRMACIÓN:\n\n¿Realmente quieres borrar TODOS los viajes y gastos?\n\nEsta acción no se puede deshacer.')) {
        return;
    }
    
    try {
        debug('Iniciando limpieza de datos...');
        showToast('⏳ Eliminando datos... Esto puede tomar un momento', 'info');
        
        let viajesEliminados = 0;
        let gastosEliminados = 0;
        const BATCH_SIZE = 400; // Máximo 500 operaciones por batch
        
        // 1. Obtener y eliminar todos los gastos usando databaseService.query
        debug('Obteniendo gastos...');
        const { data: todosGastos } = await databaseService.query('gastos', [], { limitCount: 10000 });
        
        if (todosGastos && todosGastos.length > 0) {
            debug(`Encontrados ${todosGastos.length} gastos para eliminar`);
            
            // Procesar en batches
            for (let i = 0; i < todosGastos.length; i += BATCH_SIZE) {
                const batch = writeBatch(firestoreDb);
                const chunk = todosGastos.slice(i, i + BATCH_SIZE);
                
                chunk.forEach((gasto) => {
                    if (gasto.id) {
                        batch.delete(doc(firestoreDb, 'gastos', gasto.id));
                        gastosEliminados++;
                    }
                });
                
                await batch.commit();
                debug(`Eliminados ${Math.min(i + BATCH_SIZE, todosGastos.length)} de ${todosGastos.length} gastos...`);
            }
        }
        
        // 2. Obtener y eliminar todos los viajes usando databaseService.query
        debug('Obteniendo viajes...');
        const { data: todosViajes } = await databaseService.query('viajes', [], { limitCount: 10000 });
        
        if (todosViajes && todosViajes.length > 0) {
            debug(`Encontrados ${todosViajes.length} viajes para eliminar`);
            
            // Procesar en batches
            for (let i = 0; i < todosViajes.length; i += BATCH_SIZE) {
                const batch = writeBatch(firestoreDb);
                const chunk = todosViajes.slice(i, i + BATCH_SIZE);
                
                chunk.forEach((viaje) => {
                    if (viaje.id) {
                        batch.delete(doc(firestoreDb, 'viajes', viaje.id));
                        viajesEliminados++;
                    }
                });
                
                await batch.commit();
                debug(`Eliminados ${Math.min(i + BATCH_SIZE, todosViajes.length)} de ${todosViajes.length} viajes...`);
            }
        }
        
        // Limpiar cachés locales
        state.viajesCache = [];
        state.gastosCache = [];
        
        debug(`Limpieza completada: ${viajesEliminados} viajes, ${gastosEliminados} gastos`);
        showToast(`✅ Limpieza completada:\n• ${viajesEliminados} viajes eliminados\n• ${gastosEliminados} gastos eliminados`, 'success');
        
        // Recargar las listas si están visibles
        if (document.getElementById('viajes-section')?.classList.contains('active')) {
            loadViajes();
        }
        
    } catch (error) {
        debug('Error al limpiar datos:', error);
        console.error('Error detallado:', error);
        showToast('Error al eliminar datos: ' + (error.message || 'Error desconocido'), 'error');
    }
}

// Editar vendedor - Busca por username y abre el modal de edición
async function editVendor(username) {
    try {
        // Buscar vendedor por username usando databaseService.query
        const { data: vendors } = await databaseService.query(
            'vendedores',
            [where('username', '==', username)],
            { limitCount: 1 }
        );
        
        if (!vendors || vendors.length === 0) {
            showToast('Vendedor no encontrado', 'error');
            return;
        }
        
        const vendor = vendors[0];
        const vendorId = vendor.id; // El ID del documento (UID)
        
        document.getElementById('edit-vendor-id').value = vendorId;
        document.getElementById('edit-vendor-name').value = vendor.name || '';
        document.getElementById('edit-vendor-username').value = vendor.username || '';
        document.getElementById('edit-vendor-password').value = '';
        document.getElementById('edit-vendor-email').value = vendor.email || '';
        document.getElementById('edit-vendor-zone').value = vendor.zone || 'Bajío';
        document.getElementById('edit-vendor-status').value = vendor.status || 'active';
        
        openModal('editar-vendedor');
    } catch (error) {
        debug('Error al cargar datos del vendedor:', error);
        showToast('Error al cargar datos: ' + (error.message || 'Error desconocido'), 'error');
    }
}

async function saveVendorChanges() {
    const id = document.getElementById('edit-vendor-id').value;
    const name = document.getElementById('edit-vendor-name').value.trim();
    const password = document.getElementById('edit-vendor-password').value;
    const email = document.getElementById('edit-vendor-email').value.trim();
    const zone = document.getElementById('edit-vendor-zone').value;
    const status = document.getElementById('edit-vendor-status').value;

    if (!name) {
        showToast('Nombre es obligatorio', 'warning');
        return;
    }

    const btn = document.querySelector('#editar-vendedor .btn-primary');
    setLoading(btn, true);

    try {
        // Obtener el vendedor para tener su UID
        const vendor = await db.get('vendedores', id);
        if (!vendor) {
            showToast('Vendedor no encontrado', 'error');
            return;
        }
        
        // Llamar a la Cloud Function
        debug('Llamando Cloud Function updateVendor para UID:', vendor.uid || id);
        
        const updateData = {
            uid: vendor.uid || id,
            name: name,
            email: email || undefined,
            zone: zone,
            status: status
        };
        
        // Solo incluir password si se proporcionó uno nuevo
        if (password && password.length >= 6) {
            updateData.password = password;
        } else if (password) {
            showToast('La contraseña debe tener al menos 6 caracteres', 'warning');
            setLoading(btn, false);
            return;
        }
        
        await callWithAuth('updateVendor', updateData);
        
        closeModal('editar-vendedor');
        showToast('✅ Vendedor actualizado', 'success');
        loadVendorsList();
    } catch (error) {
        debug('Error al actualizar vendedor:', error);
        
        let errorMsg = 'Error al guardar';
        if (error.code === 'functions/permission-denied') {
            errorMsg = 'No tienes permisos para actualizar vendedores';
        } else if (error.code === 'functions/invalid-argument') {
            errorMsg = error.message || 'Datos inválidos';
        } else if (error.details?.message) {
            errorMsg = error.details.message;
        }
        
        showToast(errorMsg, 'error');
    } finally {
        setLoading(btn, false);
    }
}

async function deleteVendor(username, btnElement) {
    let btn = null;
    try {
        // Buscar vendedor por username usando databaseService.query
        const { data: vendors } = await databaseService.query(
            'vendedores',
            [where('username', '==', username)],
            { limitCount: 1 }
        );
        
        if (!vendors || vendors.length === 0) {
            showToast('Vendedor no encontrado', 'error');
            return;
        }
        
        const vendor = vendors[0];
        const vendorUid = vendor.id;
        
        if (!confirm(`¿Eliminar al vendedor ${vendor.name} (@${username})?\n\nEsta acción eliminará tanto el usuario de autenticación como todos sus datos de Firestore.`)) return;
        
        btn = btnElement || document.activeElement;
        if (btn) setLoading(btn, true);
        
        // Llamar a la Cloud Function con UID y username
        debug('Llamando Cloud Function deleteVendor:', { uid: vendorUid, username });
        
        const result = await callWithAuth('deleteVendor', {
            uid: vendorUid,
            username: username
        });
        
        debug('Respuesta deleteVendor:', result.data);
        
        showToast(`✅ ${result.data?.message || 'Vendedor eliminado'}`, 'success');
        loadVendorsList();
        
    } catch (error) {
        debug('Error al eliminar vendedor:', error);
        
        let errorMsg = 'Error al eliminar vendedor';
        if (error.code === 'functions/permission-denied') {
            errorMsg = 'No tienes permisos para eliminar vendedores';
        } else if (error.code === 'functions/unauthenticated') {
            errorMsg = 'Debes iniciar sesión como administrador';
        } else if (error.code === 'functions/not-found') {
            errorMsg = error.message || 'Vendedor no encontrado';
        } else if (error.code === 'functions/internal') {
            errorMsg = error.message || 'Error interno del servidor';
        } else if (error.code === 'functions/invalid-argument') {
            errorMsg = error.message || 'Datos inválidos';
        } else if (error.details?.message) {
            errorMsg = error.details.message;
        } else if (error.message) {
            errorMsg = error.message;
        }
        
        showToast(errorMsg, 'error');
    } finally {
        if (btn) setLoading(btn, false);
    }
}

// ===== MAIN APP =====
function showMainApp() {
    showScreen('app');
    actualizarEncabezado();
    
    // Mostrar dashboard primero (nuevo en v6.0)
    showSection('dashboard');
    
    // Actualizar navegación
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    const dashboardNav = document.querySelector('[data-section="dashboard"]');
    if (dashboardNav) dashboardNav.classList.add('active');
}

function actualizarEncabezado() {
    const userNameEl = document.getElementById('current-user-name');
    const welcomeEl = document.getElementById('welcome-text');
    
    if (userNameEl) userNameEl.textContent = state.currentVendor?.name || 'Vendedor';
    if (welcomeEl) welcomeEl.textContent = `Hola, ${state.currentVendor?.name?.split(' ')[0] || 'Vendedor'}`;
}

// ===== DASHBOARD v6.0 =====
async function loadDashboard() {
    // Validar autenticación
    const currentUser = auth.currentUser;
    if (!currentUser) {
        debug('Error: No hay usuario autenticado al cargar dashboard');
        return;
    }
    
    // Usar UID de Firebase Auth como fuente de verdad
    const vendedorUid = state.currentVendor?.uid || currentUser.uid;
    if (!vendedorUid) {
        debug('Error: No se pudo obtener UID del vendedor');
        return;
    }
    
    try {
        showLoading('dashboard-stats', true);
        
        const stats = await db.getDashboardStats(vendedorUid, 30);
        
        const container = document.getElementById('dashboard-stats');
        if (!container) return;
        
        container.innerHTML = `
            <div class="stat-card">
                <div class="stat-icon">💰</div>
                <div class="stat-value">${formatMoney(stats.total)}</div>
                <div class="stat-label">Total 30 días</div>
            </div>
            <div class="stat-card success">
                <div class="stat-icon">📄</div>
                <div class="stat-value">${formatMoney(stats.facturable)}</div>
                <div class="stat-label">Facturable</div>
            </div>
            <div class="stat-card secondary">
                <div class="stat-icon">🧾</div>
                <div class="stat-value">${stats.count}</div>
                <div class="stat-label">Gastos</div>
            </div>
            <div class="stat-card warning">
                <div class="stat-icon">🚗</div>
                <div class="stat-value">${stats.viajesCount}</div>
                <div class="stat-label">Mis Viajes</div>
            </div>
        `;
        
        // Gráfico rápido de tipos
        const ctx = document.getElementById('dashboard-chart');
        if (ctx && stats.count > 0) {
            if (state.charts.dashboard) state.charts.dashboard.destroy();
            
            state.charts.dashboard = new Chart(ctx.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: Object.keys(stats.porTipo).map(t => TIPOS_GASTO[t]?.label || t),
                    datasets: [{
                        data: Object.values(stats.porTipo),
                        backgroundColor: Object.keys(stats.porTipo).map(t => TIPOS_GASTO[t]?.color || '#6b7280'),
                        borderWidth: 2,
                        borderColor: '#fff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom' }
                    }
                }
            });
        }
        
    } catch (error) {
        debug('Error cargando dashboard:', error);
    } finally {
        showLoading('dashboard-stats', false);
    }
}

function showLoading(elementId, show) {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    if (show) {
        el.innerHTML = '<div class="loading-spinner">Cargando...</div>';
    }
}

// ===== PERFIL DEL VENDEDOR =====
async function abrirPerfil() {
    if (!state.currentVendor) return;
    
    const vendor = state.currentVendor;
    
    document.getElementById('perfil-nombre').value = vendor.name || '';
    document.getElementById('perfil-email').value = vendor.email || '';
    document.getElementById('perfil-zona').value = vendor.zone || 'Bajío';
    document.getElementById('perfil-usuario').value = vendor.username || '';
    document.getElementById('perfil-current-password').value = '';
    document.getElementById('perfil-new-password').value = '';
    
    openModal('perfil');
}

async function guardarPerfil() {
    if (!state.currentVendor) {
        showToast('No hay sesión activa', 'error');
        return;
    }
    
    const nombre = document.getElementById('perfil-nombre').value.trim();
    const email = document.getElementById('perfil-email').value.trim();
    const zona = document.getElementById('perfil-zona').value;
    const currentPassword = document.getElementById('perfil-current-password').value;
    const newPassword = document.getElementById('perfil-new-password').value;
    
    // Validaciones
    if (!nombre) {
        showToast('El nombre no puede estar vacío', 'warning');
        return;
    }
    
    // Validar email si se proporciona
    if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            showToast('El formato del correo electrónico no es válido', 'warning');
            return;
        }
    }
    
    // Validar nueva contraseña si se quiere cambiar
    if (newPassword && newPassword.length < 6) {
        showToast('La nueva contraseña debe tener al menos 6 caracteres', 'warning');
        return;
    }
    
    // Si se quiere cambiar contraseña, se requiere la contraseña actual
    if (newPassword && !currentPassword) {
        showToast('Debes ingresar tu contraseña actual para cambiarla', 'warning');
        return;
    }
    
    const btn = document.querySelector('#modal-perfil .btn-primary');
    if (btn) setLoading(btn, true);
    
    try {
        // 1. Actualizar datos del perfil en Firestore usando el UID como ID del documento
        const vendorUid = state.currentVendor.uid;
        if (!vendorUid) {
            throw new Error('No se pudo obtener el UID del vendedor');
        }
        
        debug('Actualizando perfil con UID:', vendorUid);
        
        // Usar databaseService directamente para evitar problemas con db.update
        await databaseService.update('vendedores', vendorUid, {
            name: nombre,
            email: email,
            zone: zona
        });
        
        // 2. Cambiar contraseña si se proporcionó
        if (newPassword) {
            debug('Cambiando contraseña...');
            try {
                await authService.changePassword(currentPassword, newPassword);
                showToast('✅ Contraseña actualizada correctamente', 'success');
            } catch (passwordError) {
                debug('Error cambiando contraseña:', passwordError);
                // Traducir errores comunes de cambio de contraseña
                let passwordErrorMsg = 'Error al cambiar la contraseña';
                if (passwordError.message?.includes('contraseña') || passwordError.code === 'auth/wrong-password') {
                    passwordErrorMsg = 'La contraseña actual es incorrecta';
                } else if (passwordError.message?.includes('6 caracteres') || passwordError.code === 'auth/weak-password') {
                    passwordErrorMsg = 'La nueva contraseña es muy débil. Usa al menos 6 caracteres';
                } else if (passwordError.message?.includes('reciente') || passwordError.code === 'auth/requires-recent-login') {
                    passwordErrorMsg = 'Por seguridad, cierra sesión y vuelve a entrar para cambiar la contraseña';
                } else if (passwordError.message) {
                    passwordErrorMsg = passwordError.message;
                }
                throw new Error(passwordErrorMsg);
            }
        }
        
        // 3. Actualizar estado local
        state.currentVendor = { 
            ...state.currentVendor, 
            name: nombre,
            email: email,
            zone: zona
        };
        
        // 4. Limpiar campos de contraseña
        document.getElementById('perfil-current-password').value = '';
        document.getElementById('perfil-new-password').value = '';
        
        actualizarEncabezado();
        closeModal('perfil');
        showToast('✅ Perfil actualizado correctamente', 'success');
        
    } catch (error) {
        debug('Error guardando perfil:', error);
        showToast('Error al guardar: ' + (error.message || 'Error desconocido'), 'error');
    } finally {
        if (btn) setLoading(btn, false);
    }
}

// ===== VIAJES =====
async function loadViajes() {
    // Validar autenticación
    const currentUser = auth.currentUser;
    if (!currentUser) {
        debug('Error: No hay usuario autenticado al cargar viajes');
        return;
    }
    
    // Usar UID de Firebase Auth como fuente de verdad
    const vendedorUid = state.currentVendor?.uid || currentUser.uid;
    if (!vendedorUid) {
        debug('Error: No se pudo obtener UID del vendedor');
        return;
    }
    
    try {
        const filter = document.getElementById('filter-viaje-status')?.value || 'all';
        
        const options = {};
        if (filter !== 'all') {
            options.estado = filter;
        }
        
        debug('Consultando viajes para vendedorId:', vendedorUid);
        const viajes = await db.getViajesByVendedor(vendedorUid, options);
        debug('Viajes encontrados:', viajes?.length || 0);
        
        // Si no hay viajes, mostrar mensaje vacío
        if (!viajes || !Array.isArray(viajes)) {
            debug('Error: No se recibieron datos válidos de viajes');
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🚗</div>
                    <p>Error al cargar viajes. Intenta recargar la página.</p>
                </div>
            `;
            return;
        }
        const container = document.getElementById('viajes-list');
        if (!container) return;
        
        if (viajes.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🚗</div>
                    <p>No tienes viajes registrados</p>
                    <button class="btn btn-link" onclick="openModal('nuevo-viaje')">Crear primer viaje</button>
                </div>
            `;
            return;
        }
        
        // Obtener estadísticas de gastos
        // Pasamos vendedorUid para que la consulta funcione con las reglas de seguridad
        const viajesConStats = await Promise.all(viajes.map(async v => {
            try {
                const result = await db.getGastosByViaje(v.id, { vendedorId: vendedorUid });
                const gastos = result.data || [];
                const total = gastos.reduce((sum, g) => sum + (parseFloat(g.monto) || 0), 0);
                return { ...v, gastosCount: gastos.length, totalGastos: total };
            } catch (err) {
                debug('Error cargando gastos del viaje', v.id, err.message);
                return { ...v, gastosCount: 0, totalGastos: 0 };
            }
        }));
        
        container.innerHTML = viajesConStats.map(v => `
            <div class="viaje-card ${v.estado}" onclick="selectViaje('${v.id}')">
                <div class="viaje-header">
                    <div>
                        <div class="viaje-title">${escapeHtml(v.destino)}</div>
                        <div class="viaje-cliente">👤 ${escapeHtml(v.cliente || 'Sin cliente')}</div>
                    </div>
                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                        <span class="viaje-badge ${v.estado}">${v.estado}</span>
                        <button class="btn btn-icon btn-small" style="background: none; color: var(--primary);" onclick="event.stopPropagation(); editarViaje('${v.id}')" title="Editar viaje">✏️</button>
                        <button class="btn btn-icon btn-small" style="background: none; color: #dc2626;" onclick="event.stopPropagation(); eliminarViaje('${v.id}')" title="Eliminar viaje">🗑️</button>
                    </div>
                </div>
                <div class="viaje-meta">
                    <span>📅 ${formatDate(v.fechaInicio)}</span>
                    <span>📍 ${escapeHtml(v.lugarVisita || v.destino)}</span>
                </div>
                <div class="viaje-stats">
                    <span>🧾 ${v.gastosCount} gastos</span>
                    <span>💰 ${formatMoney(v.totalGastos)}</span>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        debug('Error al cargar viajes:', error);
        if (error.message?.includes('permission')) {
            showToast('Error de permisos: Verifica que tu sesión esté activa', 'error');
        } else {
            showToast('Error al cargar viajes: ' + error.message, 'error');
        }
    }
}

async function crearViaje() {
    // Validar autenticación primero
    const currentUser = auth.currentUser;
    debug('=== CREAR VIAJE ===');
    debug('auth.currentUser:', currentUser?.uid);
    debug('state.currentVendor:', state.currentVendor);
    
    if (!currentUser) {
        showToast('Error: No hay sesión activa. Por favor inicia sesión nuevamente.', 'error');
        return;
    }
    
    // Verificar que tenemos el UID correcto
    const vendedorUid = state.currentVendor?.uid || currentUser.uid;
    debug('vendedorUid a usar:', vendedorUid);
    debug('auth.uid:', currentUser.uid);
    debug('¿Coinciden?', vendedorUid === currentUser.uid);
    
    if (!vendedorUid) {
        showToast('Error: No se pudo obtener el identificador del vendedor.', 'error');
        return;
    }
    
    // Advertencia si los UIDs no coinciden
    if (vendedorUid !== currentUser.uid) {
        debug('⚠️ ADVERTENCIA: vendedorUid !== auth.uid');
        showToast('Advertencia: IDs de usuario no coinciden. Contacta al administrador.', 'warning');
    }
    
    const cliente = document.getElementById('viaje-cliente').value.trim();
    const destino = document.getElementById('viaje-destino').value.trim();
    const lugarVisita = document.getElementById('viaje-lugar-visita').value.trim();
    const objetivo = document.getElementById('viaje-objetivo').value.trim();
    const fechaInicioInput = document.getElementById('viaje-fecha-inicio').value;
    const fechaFinInput = document.getElementById('viaje-fecha-fin').value;
    const presupuesto = parseFloat(document.getElementById('viaje-presupuesto').value) || null;
    
    if (!cliente || !destino || !fechaInicioInput) {
        showToast('Cliente, destino y fecha de inicio son obligatorios', 'warning');
        return;
    }
    
    const viaje = {
        id: 'VIAJE_' + Date.now(),
        vendedorId: vendedorUid,
        cliente: cliente.toUpperCase(),
        destino: destino.toUpperCase(),
        lugarVisita: lugarVisita ? lugarVisita.toUpperCase() : destino.toUpperCase(),
        objetivo: objetivo,
        responsable: state.currentVendor?.name || 'Vendedor',
        zona: state.currentVendor?.zone || 'Bajío',
        fechaInicio: new Date(fechaInicioInput + 'T12:00:00').toISOString(),
        fechaFin: fechaFinInput ? new Date(fechaFinInput + 'T12:00:00').toISOString() : null,
        presupuesto: presupuesto,
        estado: 'activo',
        createdAt: new Date().toISOString(),
        version: 6
    };
    
    try {
        debug('Guardando viaje:', viaje);
        await db.add('viajes', viaje);
        closeModal('nuevo-viaje');
        showToast('✅ Viaje creado exitosamente', 'success');
        
        // Limpiar formulario
        document.getElementById('viaje-cliente').value = '';
        document.getElementById('viaje-destino').value = '';
        document.getElementById('viaje-lugar-visita').value = '';
        document.getElementById('viaje-objetivo').value = '';
        document.getElementById('viaje-fecha-fin').value = '';
        document.getElementById('viaje-presupuesto').value = '';
        
        loadViajes();
    } catch (error) {
        debug('Error completo al crear viaje:', error);
        debug('Error code:', error.code);
        debug('Error message:', error.message);
        
        if (error.message?.includes('permission') || error.code?.includes('permission')) {
            showToast('Error de permisos: El ID de vendedor no coincide con tu sesión. Contacta al administrador.', 'error');
        } else {
            showToast('Error al crear viaje: ' + error.message, 'error');
        }
    }
}

async function editarViaje(viajeId) {
    try {
        const viaje = await db.get('viajes', viajeId);
        if (!viaje) {
            showToast('Viaje no encontrado', 'error');
            return;
        }

        openModal('editar-viaje');
        await new Promise(resolve => setTimeout(resolve, 100));

        document.getElementById('edit-viaje-id').value = viaje.id;
        document.getElementById('edit-viaje-cliente').value = viaje.cliente;
        document.getElementById('edit-viaje-destino').value = viaje.destino;
        document.getElementById('edit-viaje-lugar-visita').value = viaje.lugarVisita || '';
        document.getElementById('edit-viaje-objetivo').value = viaje.objetivo || '';
        document.getElementById('edit-viaje-fecha-inicio').value = viaje.fechaInicio ? viaje.fechaInicio.split('T')[0] : '';
        document.getElementById('edit-viaje-fecha-fin').value = viaje.fechaFin ? viaje.fechaFin.split('T')[0] : '';
        document.getElementById('edit-viaje-presupuesto').value = viaje.presupuesto || '';
        document.getElementById('edit-viaje-estado').value = viaje.estado || 'activo';

    } catch (error) {
        showToast('Error al cargar viaje', 'error');
    }
}

async function guardarEdicionViaje() {
    const id = document.getElementById('edit-viaje-id').value;
    const cliente = document.getElementById('edit-viaje-cliente').value.trim();
    const destino = document.getElementById('edit-viaje-destino').value.trim();
    const lugarVisita = document.getElementById('edit-viaje-lugar-visita').value.trim();
    const objetivo = document.getElementById('edit-viaje-objetivo').value.trim();
    const fechaInicioInput = document.getElementById('edit-viaje-fecha-inicio').value;
    const fechaFinInput = document.getElementById('edit-viaje-fecha-fin').value;
    const presupuesto = document.getElementById('edit-viaje-presupuesto').value;
    const estado = document.getElementById('edit-viaje-estado').value;

    if (!cliente || !destino || !fechaInicioInput) {
        showToast('Cliente, destino y fecha de inicio son obligatorios', 'warning');
        return;
    }

    try {
        const viaje = await db.get('viajes', id);
        if (!viaje) {
            showToast('Viaje no encontrado', 'error');
            return;
        }

        viaje.cliente = cliente.toUpperCase();
        viaje.destino = destino.toUpperCase();
        viaje.lugarVisita = lugarVisita ? lugarVisita.toUpperCase() : destino.toUpperCase();
        viaje.objetivo = objetivo;
        viaje.fechaInicio = new Date(fechaInicioInput + 'T12:00:00').toISOString();
        viaje.fechaFin = fechaFinInput ? new Date(fechaFinInput + 'T12:00:00').toISOString() : null;
        viaje.presupuesto = presupuesto ? parseFloat(presupuesto) : null;
        viaje.estado = estado;

        await db.update('viajes', viaje);
        closeModal('editar-viaje');
        showToast('✅ Viaje actualizado', 'success');
        loadViajes();
    } catch (error) {
        showToast('Error al guardar: ' + error.message, 'error');
    }
}

async function eliminarViaje(viajeId) {
    if (!confirm('¿Eliminar este viaje permanentemente? También se eliminarán todos los gastos asociados.')) return;
    
    // Validar autenticación
    const currentUser = auth.currentUser;
    if (!currentUser) {
        showToast('Error: No hay sesión activa', 'error');
        return;
    }
    const vendedorUid = state.currentVendor?.uid || currentUser.uid;
    
    try {
        const result = await db.deleteViajeCompleto(viajeId, vendedorUid);
        showToast(`✅ Viaje eliminado (${result.deletedGastos} gastos)`, 'success');
        loadViajes();
    } catch (error) {
        debug('Error al eliminar viaje:', error);
        if (error.message?.includes('permission')) {
            showToast('Error de permisos: No puedes eliminar este viaje', 'error');
        } else {
            showToast('Error al eliminar: ' + error.message, 'error');
        }
    }
}

function selectViaje(viajeId) {
    state.currentViaje = viajeId;
    showSection('gastos');
    const select = document.getElementById('gastos-viaje-select');
    if (select) select.value = viajeId;
    loadGastosList();
}

// ===== GASTOS =====
async function loadViajesSelect() {
    // Validar autenticación
    const currentUser = auth.currentUser;
    if (!currentUser) {
        debug('Error: No hay usuario autenticado al cargar selects');
        return;
    }
    
    // Usar UID de Firebase Auth como fuente de verdad
    const vendedorUid = state.currentVendor?.uid || currentUser.uid;
    if (!vendedorUid) {
        debug('Error: No se pudo obtener UID del vendedor');
        return;
    }
    
    try {
        const viajes = await db.getViajesByVendedor(vendedorUid);
        const activos = viajes.filter(v => v.estado === 'activo');
        
        const selects = [
            { id: 'captura-viaje-select', lista: activos, defaultOption: 'Elige un viaje activo...' },
            { id: 'gastos-viaje-select', lista: viajes, defaultOption: 'Todos los viajes' }
        ];
        
        selects.forEach(item => {
            const select = document.getElementById(item.id);
            if (!select) return;
            
            const currentValue = select.value;
            select.innerHTML = `<option value="">${item.defaultOption}</option>` + 
                item.lista.map(v => `<option value="${v.id}">${escapeHtml(v.cliente)} - ${escapeHtml(v.destino)}</option>`).join('');
            
            if (currentValue) select.value = currentValue;
        });
        
    } catch (error) {
        debug('Error cargando selects:', error);
    }
}

function selectTipoGasto(btn) {
    document.querySelectorAll('.tipo-card').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
}

function resetCapturaForm() {
    state.tempFotos = [];
    state.tempImageData = [];
    state.currentGasto = null;
    state.currentPosition = null;
    
    document.getElementById('monto-gasto').value = '';
    document.getElementById('lugar-gasto').value = '';
    document.getElementById('folio-factura').value = '';
    document.getElementById('razon-social').value = '';
    document.getElementById('comentarios-gasto').value = '';
    document.getElementById('es-facturable').checked = true;
    
    const comentariosEl = document.getElementById('comentarios-gasto');
    if (comentariosEl) {
        comentariosEl.placeholder = 'Información adicional...';
        comentariosEl.style.backgroundColor = '';
        comentariosEl.style.borderColor = '';
    }
    
    document.querySelectorAll('.tipo-card').forEach(b => b.classList.remove('selected'));
    
    const preview = document.getElementById('photo-preview');
    if (preview) {
        preview.innerHTML = `
            <span class="upload-icon">📷</span>
            <span class="upload-text">Toca para capturar foto</span>
        `;
    }
    
    // Limpiar borrador guardado
    utils.clearDraft('gasto_captura');
    
    const btnGuardar = document.querySelector('#captura-section .btn-primary.btn-large');
    if (btnGuardar) btnGuardar.textContent = '💾 GUARDAR GASTO';
}

// ===== GEOLOCALIZACIÓN v6.0 =====
async function obtenerUbicacion() {
    if (!CONFIG.ENABLE_GEOLOCATION) return;
    
    try {
        const position = await utils.getCurrentPosition();
        state.currentPosition = position;
        
        // Intentar obtener dirección
        const address = await utils.reverseGeocode(position.lat, position.lng);
        if (address) {
            const lugarInput = document.getElementById('lugar-gasto');
            if (lugarInput && !lugarInput.value) {
                lugarInput.value = address.city || address.address || '';
            }
        }
        
        showToast('📍 Ubicación obtenida', 'success');
    } catch (error) {
        debug('Error obteniendo ubicación:', error);
        // No mostrar error, es opcional
    }
}

// ===== AUTO-GUARDADO v6.0 =====
function setupAutoSaveGasto() {
    const getFormData = () => ({
        viajeId: document.getElementById('captura-viaje-select')?.value,
        tipo: document.querySelector('.tipo-card.selected')?.dataset.tipo,
        monto: document.getElementById('monto-gasto')?.value,
        lugar: document.getElementById('lugar-gasto')?.value,
        folio: document.getElementById('folio-factura')?.value,
        razonSocial: document.getElementById('razon-social')?.value,
        comentarios: document.getElementById('comentarios-gasto')?.value,
        esFacturable: document.getElementById('es-facturable')?.checked
    });
    
    return utils.setupAutoSave('gasto_captura', getFormData, CONFIG.AUTOSAVE_INTERVAL);
}

function loadDraftGasto() {
    const draft = utils.loadDraft('gasto_captura', 24);
    if (!draft) return;
    
    // Cargar datos guardados
    if (draft.viajeId) document.getElementById('captura-viaje-select').value = draft.viajeId;
    if (draft.monto) document.getElementById('monto-gasto').value = draft.monto;
    if (draft.lugar) document.getElementById('lugar-gasto').value = draft.lugar;
    if (draft.folio) document.getElementById('folio-factura').value = draft.folio;
    if (draft.razonSocial) document.getElementById('razon-social').value = draft.razonSocial;
    if (draft.comentarios) document.getElementById('comentarios-gasto').value = draft.comentarios;
    if (draft.esFacturable !== undefined) document.getElementById('es-facturable').checked = draft.esFacturable;
    
    if (draft.tipo) {
        const tipoCard = document.querySelector(`.tipo-card[data-tipo="${draft.tipo}"]`);
        if (tipoCard) tipoCard.classList.add('selected');
    }
    
    showToast('💾 Borrador recuperado', 'info');
}

// ===== GUARDAR GASTO MEJORADO v6.0 =====
async function guardarGasto() {
    // Validar autenticación primero
    const currentUser = auth.currentUser;
    if (!currentUser) {
        showToast('Error: No hay sesión activa. Por favor inicia sesión nuevamente.', 'error');
        return;
    }
    
    // Verificar que tenemos el UID correcto
    const vendedorUid = state.currentVendor?.uid || currentUser.uid;
    if (!vendedorUid) {
        showToast('Error: No se pudo obtener el identificador del vendedor.', 'error');
        return;
    }
    
    const viajeId = document.getElementById('captura-viaje-select').value;
    const tipoCard = document.querySelector('.tipo-card.selected');
    const monto = parseFloat(document.getElementById('monto-gasto').value) || 0;
    const lugar = document.getElementById('lugar-gasto').value.trim();
    const fecha = document.getElementById('fecha-gasto').value;
    const folioFactura = document.getElementById('folio-factura')?.value.trim() || '';
    const razonSocial = document.getElementById('razon-social')?.value.trim() || '';
    const comentarios = document.getElementById('comentarios-gasto')?.value.trim() || '';
    const esFacturable = document.getElementById('es-facturable')?.checked !== false;
    
    if (!esFacturable && !comentarios) {
        showToast('⚠️ Debes explicar por qué no es facturable', 'warning');
        const comentariosEl = document.getElementById('comentarios-gasto');
        if (comentariosEl) {
            comentariosEl.focus();
            comentariosEl.style.borderColor = '#dc2626';
        }
        return;
    }
    
    if (!viajeId) {
        showToast('Selecciona un viaje', 'warning');
        return;
    }
    
    if (!tipoCard) {
        showToast('Selecciona el tipo de gasto', 'warning');
        return;
    }
    
    if (!monto || monto <= 0) {
        showToast('Ingresa un monto válido', 'warning');
        return;
    }
    
    const btnGuardar = document.querySelector('#captura-section .btn-primary.btn-large');
    if (btnGuardar) setLoading(btnGuardar, true);
    
    try {
        // Subir imágenes a Storage si hay nuevas fotos
        let imageUrls = [];
        let imagePaths = [];
        
        if (state.tempFotos.length > 0 && CONFIG.ENABLE_STORAGE) {
            showToast('📤 Subiendo imágenes...', 'info');
            
            const uploadResults = await storageService.uploadMultipleImages(
                state.tempFotos,
                `gastos/${state.currentVendor?.username || vendedorUid}/${viajeId}`
            );
            
            imageUrls = uploadResults.map(r => r.url);
            imagePaths = uploadResults.map(r => r.path);
        } else {
            // Fallback: guardar en base64 (modo legacy)
            imageUrls = state.tempFotos;
        }
        
        const esEdicion = state.currentGasto !== null;
        
        const gastoData = {
            viajeId,
            vendedorId: vendedorUid,
            tipo: tipoCard.dataset.tipo,
            monto: monto,
            lugar: lugar || 'Sin lugar',
            fecha: fecha || new Date().toISOString(),
            folioFactura,
            razonSocial,
            comentarios,
            esFacturable,
            // v6.0: Usar URLs de Storage en lugar de base64
            fotos: imageUrls,
            imagePaths: imagePaths, // Para poder eliminar después
            ubicacion: state.currentPosition, // v6.0: Geolocalización
            updatedAt: new Date().toISOString()
        };
        
        if (esEdicion) {
            const gastoActualizado = {
                ...state.currentGasto,
                ...gastoData,
                id: state.currentGasto.id
            };
            await db.update('gastos', gastoActualizado);
            showToast('✅ Gasto actualizado', 'success');
        } else {
            const nuevoGasto = {
                ...gastoData,
                id: 'GASTO_' + Date.now(),
                createdAt: new Date().toISOString()
            };
            await db.add('gastos', nuevoGasto);
            showToast('✅ Gasto guardado', 'success');
        }
        
        // Limpiar borrador
        utils.clearDraft('gasto_captura');
        
        resetCapturaForm();
        
        if (document.getElementById('gastos-section')?.classList.contains('active')) {
            loadGastosList();
        }
        
    } catch (error) {
        console.error('Error al guardar gasto:', error);
        showToast('Error al guardar: ' + error.message, 'error');
    } finally {
        if (btnGuardar) setLoading(btnGuardar, false);
    }
}

function toggleComentarioRequerido() {
    const esFacturable = document.getElementById('es-facturable').checked;
    const textarea = document.getElementById('comentarios-gasto');
    
    if (!esFacturable) {
        if (textarea) {
            textarea.placeholder = 'EXPLICA POR QUÉ NO ES FACTURABLE (obligatorio)...';
            textarea.style.backgroundColor = '#fef2f2';
        }
    } else {
        if (textarea) {
            textarea.placeholder = 'Información adicional...';
            textarea.style.backgroundColor = '';
        }
    }
}

// ===== BÚSQUEDA FUZZY v6.0 =====
async function searchGastos(query) {
    if (!query || query.length < 2) {
        loadGastosList();
        return;
    }
    
    // Validar autenticación
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    
    const vendedorUid = state.currentVendor?.uid || currentUser.uid;
    if (!vendedorUid) return;
    
    try {
        const gastos = await db.searchGastos(vendedorUid, query);
        renderGastosList(gastos);
    } catch (error) {
        debug('Error en búsqueda:', error);
    }
}

// ===== LISTA DE GASTOS =====
async function loadGastosList() {
    try {
        // Validar autenticación
        const currentUser = auth.currentUser;
        if (!currentUser) {
            debug('Error: No hay usuario autenticado al cargar gastos');
            return;
        }
        
        // Usar UID de Firebase Auth como fuente de verdad
        const vendedorUid = state.currentVendor?.uid || currentUser.uid;
        if (!vendedorUid) {
            debug('Error: No se pudo obtener UID del vendedor');
            return;
        }
        
        const estadoFiltro = document.getElementById('gastos-estado-select')?.value || 'all';
        const viajeId = document.getElementById('gastos-viaje-select')?.value;
        
        let gastos = [];
        
        if (viajeId) {
            const result = await db.getGastosByViaje(viajeId, { vendedorId: vendedorUid });
            gastos = result.data || [];
            // Agregar info del viaje
            const viaje = await db.get('viajes', viajeId);
            gastos = gastos.map(g => ({...g, viaje}));
        } else {
            // Obtener gastos de todos los viajes del vendedor
            const viajesResult = await db.getViajesByVendedor(vendedorUid);
            const viajes = viajesResult.data || viajesResult || [];
            for (const viaje of viajes) {
                const gResult = await db.getGastosByViaje(viaje.id, { vendedorId: vendedorUid });
                const g = gResult.data || [];
                gastos = gastos.concat(g.map(item => ({...item, viaje})));
            }
        }
        
        // Filtrar por estado si es necesario
        if (estadoFiltro !== 'all') {
            gastos = gastos.filter(g => g.viaje?.estado === estadoFiltro);
        }
        
        renderGastosList(gastos);
        
    } catch (error) {
        showToast('Error al cargar gastos: ' + error.message, 'error');
    }
}

function renderGastosList(gastos) {
    gastos.sort((a, b) => new Date(b.fecha || b.createdAt) - new Date(a.fecha || a.createdAt));
    
    // Calcular resumen
    const resumen = { total: 0, facturable: 0, porTipo: {} };
    gastos.forEach(g => {
        resumen.total += g.monto;
        if (g.esFacturable !== false) resumen.facturable += g.monto;
        resumen.porTipo[g.tipo] = (resumen.porTipo[g.tipo] || 0) + g.monto;
    });
    
    const resumenEl = document.getElementById('gastos-resumen');
    if (resumenEl) {
        if (gastos.length === 0) {
            resumenEl.style.display = 'none';
        } else {
            resumenEl.style.display = 'block';
            resumenEl.innerHTML = `
                <div class="resumen-total">
                    <span class="label">Total</span>
                    <span class="amount">${formatMoney(resumen.total)}</span>
                </div>
                <div class="resumen-grid">
                    <div class="resumen-item">
                        <span class="label">📄 Facturable</span>
                        <span class="amount">${formatMoney(resumen.facturable)}</span>
                    </div>
                    ${Object.entries(resumen.porTipo).map(([tipo, monto]) => `
                        <div class="resumen-item">
                            <span class="label">${TIPOS_GASTO[tipo]?.icon || '📦'} ${TIPOS_GASTO[tipo]?.label || tipo}</span>
                            <span class="amount">${formatMoney(monto)}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }
    }
    
    const container = document.getElementById('gastos-list');
    if (!container) return;
    
    if (gastos.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">💰</div>
                <p>No hay gastos registrados</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = gastos.map(g => `
        <div class="gasto-item" onclick="showDetalleGasto('${g.id}')">
            <div class="gasto-info">
                <div class="gasto-icon" style="background: ${TIPOS_GASTO[g.tipo]?.color || '#6b7280'}20; color: ${TIPOS_GASTO[g.tipo]?.color || '#6b7280'}">
                    ${TIPOS_GASTO[g.tipo]?.icon || '📦'}
                </div>
                <div class="gasto-details">
                    <h4>${TIPOS_GASTO[g.tipo]?.label || g.tipo} ${g.esFacturable === false ? '🚫' : '📄'}</h4>
                    <p>${escapeHtml(g.lugar || 'Sin lugar')} • ${formatDate(g.fecha || g.createdAt)}</p>
                    ${g.folioFactura ? `<p style="color: var(--success); font-size: 0.7rem;">📄 Folio: ${escapeHtml(g.folioFactura)}</p>` : ''}
                    ${g.ubicacion ? `<p style="color: var(--primary); font-size: 0.7rem;">📍 Con ubicación</p>` : ''}
                </div>
            </div>
            <div class="gasto-amount">${formatMoney(g.monto)}</div>
        </div>
    `).join('');
}

async function showDetalleGasto(gastoId) {
    try {
        const gasto = await db.get('gastos', gastoId);
        if (!gasto) return;
        
        const viaje = await db.get('viajes', gasto.viajeId);
        state.currentGasto = gasto;
        
        const content = document.getElementById('detalle-gasto-content');
        content.innerHTML = `
            <div style="text-align: center; margin-bottom: 1.5rem;">
                <div style="font-size: 3rem; margin-bottom: 0.5rem;">${TIPOS_GASTO[gasto.tipo]?.icon || '📦'}</div>
                <h2 style="color: var(--primary); font-size: 2rem; margin-bottom: 0.5rem;">${formatMoney(gasto.monto)}</h2>
                <p style="color: var(--gray-500);">${TIPOS_GASTO[gasto.tipo]?.label || gasto.tipo}</p>
                ${gasto.esFacturable === false ? 
                    '<span style="background: #fee2e2; color: #dc2626; padding: 0.25rem 0.75rem; border-radius: 999px; font-size: 0.75rem;">NO FACTURABLE</span>' : 
                    '<span style="background: #d1fae5; color: #059669; padding: 0.25rem 0.75rem; border-radius: 999px; font-size: 0.75rem;">FACTURABLE</span>'}
            </div>
            
            <div style="background: var(--gray-50); padding: 1rem; border-radius: var(--radius-lg); margin-bottom: 1rem;">
                <p><strong>📍 Lugar:</strong> ${escapeHtml(gasto.lugar || 'No especificado')}</p>
                <p><strong>📅 Fecha:</strong> ${formatDateTime(gasto.fecha || gasto.createdAt)}</p>
                ${gasto.folioFactura ? `<p><strong>📄 Folio:</strong> ${escapeHtml(gasto.folioFactura)}</p>` : ''}
                ${gasto.razonSocial ? `<p><strong>🏢 Razón Social:</strong> ${escapeHtml(gasto.razonSocial)}</p>` : ''}
                ${gasto.comentarios ? `<p><strong>💬 Comentarios:</strong> ${escapeHtml(gasto.comentarios)}</p>` : ''}
                ${gasto.ubicacion ? `<p><strong>📍 Ubicación:</strong> ${gasto.ubicacion.lat.toFixed(4)}, ${gasto.ubicacion.lng.toFixed(4)}</p>` : ''}
                <p><strong>🚗 Viaje:</strong> ${escapeHtml(viaje?.cliente || '')} - ${escapeHtml(viaje?.destino || 'Desconocido')}</p>
            </div>
            
            ${gasto.fotos && gasto.fotos.length > 0 ? `
                <div style="margin-bottom: 1rem;">
                    <p style="color: var(--gray-500); font-size: 0.875rem; margin-bottom: 0.5rem;">📷 Fotos (${gasto.fotos.length}):</p>
                    <div style="display: flex; gap: 0.5rem; overflow-x: auto;">
                        ${gasto.fotos.map(foto => `
                            <img src="${foto}" style="height: 100px; border-radius: var(--radius); object-fit: cover; cursor: pointer;" onclick="window.open('${foto}', '_blank')">
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            <div style="display: flex; gap: 0.75rem; margin-top: 1.5rem;">
                <button class="btn btn-primary btn-large" style="flex: 1;" onclick="editarGasto('${gasto.id}')">✏️ Editar</button>
                <button class="btn btn-danger btn-large" style="flex: 1;" onclick="eliminarGasto('${gasto.id}')">🗑️ Eliminar</button>
            </div>
        `;
        
        openModal('detalle-gasto');
    } catch (error) {
        debug('Error mostrando detalle:', error);
    }
}

async function editarGasto(gastoId) {
    try {
        const gasto = await db.get('gastos', gastoId);
        if (!gasto) {
            showToast('Gasto no encontrado', 'error');
            return;
        }
        
        closeModal('detalle-gasto');
        showSection('captura');
        
        document.getElementById('captura-viaje-select').value = gasto.viajeId;
        document.getElementById('monto-gasto').value = gasto.monto;
        document.getElementById('lugar-gasto').value = gasto.lugar || '';
        document.getElementById('fecha-gasto').value = gasto.fecha ? gasto.fecha.slice(0, 16) : '';
        document.getElementById('folio-factura').value = gasto.folioFactura || '';
        document.getElementById('razon-social').value = gasto.razonSocial || '';
        document.getElementById('comentarios-gasto').value = gasto.comentarios || '';
        document.getElementById('es-facturable').checked = gasto.esFacturable !== false;
        toggleComentarioRequerido();
        
        document.querySelectorAll('.tipo-card').forEach(b => b.classList.remove('selected'));
        const tipoCard = document.querySelector(`.tipo-card[data-tipo="${gasto.tipo}"]`);
        if (tipoCard) tipoCard.classList.add('selected');
        
        // Cargar fotos existentes (si son URLs de Storage o base64 legacy)
        state.tempFotos = gasto.fotos || [];
        if (state.tempFotos.length > 0) {
            const preview = document.getElementById('photo-preview');
            preview.innerHTML = `
                <div style="display: flex; gap: 0.5rem; overflow-x: auto; margin-bottom: 0.5rem;">
                    ${state.tempFotos.map((foto, idx) => `
                        <div style="position: relative;">
                            <img src="${foto}" style="height: 80px; border-radius: var(--radius); object-fit: cover;">
                            <button onclick="removeFoto(${idx})" style="position: absolute; top: -5px; right: -5px; background: #dc2626; color: white; border: none; border-radius: 50%; width: 20px; height: 20px; cursor: pointer; font-size: 12px;">×</button>
                        </div>
                    `).join('')}
                </div>
                <button type="button" class="btn btn-small btn-secondary" onclick="document.getElementById('camera-input').click()">+ Agregar más fotos</button>
            `;
        }
        
        const btnGuardar = document.querySelector('#captura-section .btn-primary.btn-large');
        if (btnGuardar) btnGuardar.textContent = '💾 ACTUALIZAR GASTO';
        
        state.currentGasto = gasto;
        
    } catch (error) {
        showToast('Error al cargar gasto para edición', 'error');
    }
}

function removeFoto(index) {
    state.tempFotos.splice(index, 1);
    const preview = document.getElementById('photo-preview');
    if (state.tempFotos.length === 0) {
        preview.innerHTML = `
            <span class="upload-icon">📷</span>
            <span class="upload-text">Toca para capturar foto</span>
        `;
    } else {
        preview.innerHTML = `
            <div style="display: flex; gap: 0.5rem; overflow-x: auto; margin-bottom: 0.5rem;">
                ${state.tempFotos.map((foto, idx) => `
                    <div style="position: relative;">
                        <img src="${foto}" style="height: 80px; border-radius: var(--radius); object-fit: cover;">
                        <button onclick="removeFoto(${idx})" style="position: absolute; top: -5px; right: -5px; background: #dc2626; color: white; border: none; border-radius: 50%; width: 20px; height: 20px; cursor: pointer; font-size: 12px;">×</button>
                    </div>
                `).join('')}
            </div>
            <button type="button" class="btn btn-small btn-secondary" onclick="document.getElementById('camera-input').click()">+ Agregar más fotos</button>
        `;
    }
}

async function eliminarGasto(gastoId) {
    if (!confirm('¿Eliminar este gasto permanentemente?')) return;
    
    try {
        // Obtener gasto para eliminar imágenes de Storage
        const gasto = await db.get('gastos', gastoId);
        if (gasto && gasto.imagePaths && CONFIG.ENABLE_STORAGE) {
            await storageService.deleteMultipleImages(gasto.imagePaths);
        }
        
        await db.delete('gastos', gastoId);
        closeModal('detalle-gasto');
        showToast('Gasto eliminado', 'success');
        loadGastosList();
    } catch (error) {
        showToast('Error al eliminar', 'error');
    }
}

// ===== REPORTES =====
async function generarReporte() {
    const fechaInicio = document.getElementById('reporte-fecha-inicio').value;
    const fechaFin = document.getElementById('reporte-fecha-fin').value;
    
    if (!fechaInicio || !fechaFin) {
        showToast('Selecciona un rango de fechas', 'warning');
        return;
    }
    
    // Validar autenticación
    const currentUser = auth.currentUser;
    if (!currentUser) {
        showToast('Error: No hay sesión activa', 'error');
        return;
    }
    const vendedorUid = state.currentVendor?.uid || currentUser.uid;
    
    try {
        const viajesResult = await db.getViajesByVendedor(vendedorUid);
        const viajes = viajesResult.data || viajesResult || [];
        let allGastos = [];
        
        for (const viaje of viajes) {
            const result = await db.getGastosByViaje(viaje.id, { vendedorId: vendedorUid });
            const gastos = result.data || [];
            const gastosFiltrados = gastos.filter(g => {
                const fecha = new Date(g.fecha || g.createdAt);
                return fecha >= new Date(fechaInicio) && fecha <= new Date(fechaFin + 'T23:59:59');
            });
            allGastos = allGastos.concat(gastosFiltrados.map(g => ({...g, viaje})));
        }
        
        if (allGastos.length === 0) {
            showToast('No hay gastos en el período seleccionado', 'warning');
            return;
        }
        
        // Agrupar por día
        const porDia = {};
        allGastos.forEach(g => {
            const fecha = new Date(g.fecha || g.createdAt);
            const diaKey = fecha.toISOString().split('T')[0];
            const diaLabel = fecha.toLocaleString('es-MX', { day: '2-digit', month: 'short' });
            if (!porDia[diaKey]) {
                porDia[diaKey] = { label: diaLabel, total: 0 };
            }
            porDia[diaKey].total += g.monto;
        });
        
        const diasOrdenados = Object.keys(porDia).sort();
        const labels = diasOrdenados.map(d => porDia[d].label);
        const dataValues = diasOrdenados.map(d => porDia[d].total);
        
        const porTipo = {};
        allGastos.forEach(g => {
            porTipo[g.tipo] = (porTipo[g.tipo] || 0) + g.monto;
        });
        
        const total = allGastos.reduce((sum, g) => sum + g.monto, 0);
        const totalFacturable = allGastos.filter(g => g.esFacturable !== false).reduce((sum, g) => sum + g.monto, 0);
        
        document.getElementById('reporte-resultado').classList.remove('hidden');
        
        // Gráfico de tendencia
        const ctx2 = document.getElementById('trend-chart').getContext('2d');
        if (state.charts.line) state.charts.line.destroy();
        
        state.charts.line = new Chart(ctx2, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Gastos por día',
                    data: dataValues,
                    borderColor: '#dc2626',
                    backgroundColor: 'rgba(220, 38, 38, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 6,
                    pointBackgroundColor: '#dc2626',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { 
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return 'Total: ' + formatMoney(context.raw);
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        }
                    },
                    x: {
                        grid: { display: false }
                    }
                }
            }
        });
        
        // Gráfico de tipos
        const ctx1 = document.getElementById('gastos-chart').getContext('2d');
        if (state.charts.pie) state.charts.pie.destroy();
        
        state.charts.pie = new Chart(ctx1, {
            type: 'doughnut',
            data: {
                labels: Object.keys(porTipo).map(t => TIPOS_GASTO[t]?.label || t),
                datasets: [{
                    data: Object.values(porTipo),
                    backgroundColor: Object.keys(porTipo).map(t => TIPOS_GASTO[t]?.color || '#6b7280'),
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
        
        state.lastReport = {
            fechaInicio, 
            fechaFin,
            total,
            totalFacturable,
            porTipo,
            porDia: Object.fromEntries(diasOrdenados.map(d => [d, porDia[d].total])),
            gastos: allGastos,
            responsable: state.currentVendor.name,
            zona: state.currentVendor.zone || ''
        };
        
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al generar reporte: ' + error.message, 'error');
    }
}

function exportReport(format) {
    if (!state.lastReport) {
        showToast('Primero genera un reporte', 'warning');
        return;
    }
    
    if (format === 'excel') {
        generarExcelProfesional();
    } else if (format === 'pdf') {
        window.print();
    }
}

// ===== EXCEL =====
async function generarExcelProfesional() {
    if (!state.lastReport) {
        showToast('Primero genera un reporte', 'warning');
        return;
    }

    const { gastos, fechaInicio, fechaFin, total, totalFacturable, responsable, zona = '' } = state.lastReport;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = '3P Control de Gastos';
    workbook.lastModifiedBy = '3P';
    workbook.created = new Date();
    workbook.modified = new Date();

    const worksheet = workbook.addWorksheet('Reporte');

    // Cabecera
    worksheet.mergeCells('A1:I1');
    const titleRow = worksheet.getCell('A1');
    titleRow.value = '3P SA DE CV';
    titleRow.font = { size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
    titleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    titleRow.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.mergeCells('A2:I2');
    const subtitleRow = worksheet.getCell('A2');
    subtitleRow.value = 'Reporte de Viáticos y Gastos de Viaje';
    subtitleRow.font = { size: 14, color: { argb: 'FFFFFFFF' } };
    subtitleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    subtitleRow.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.getCell('A3').value = 'Responsable:';
    worksheet.getCell('B3').value = responsable;
    worksheet.getCell('D3').value = 'Zona:';
    worksheet.getCell('E3').value = zona;

    worksheet.getCell('A4').value = 'Período:';
    worksheet.getCell('B4').value = `${formatDateMexico(fechaInicio)} al ${formatDateMexico(fechaFin)}`;
    worksheet.getCell('D4').value = 'No. Reporte:';
    worksheet.getCell('E4').value = `3p-${responsable.trim().substring(0,3).toUpperCase()}-${new Date().getDate().toString().padStart(2,'0')}${(new Date().getMonth()+1).toString().padStart(2,'0')}${new Date().getFullYear().toString().slice(-2)}`;

    worksheet.getCell('A5').value = 'Fecha de generación:';
    worksheet.getCell('B5').value = formatDateTimeMexico(new Date().toISOString());
    worksheet.getCell('D5').value = 'Total General:';
    worksheet.getCell('E5').value = formatMoney(total);

    ['A3','A4','A5','D3','D4','D5'].forEach(addr => {
        worksheet.getCell(addr).font = { bold: true };
    });

    // Headers
    const headers = ['Fecha', 'Cliente', 'Lugar de Visita', 'Tipo Gasto', 'Folio Factura', 'Razón Social', 'Total', 'Facturable', 'Comentarios'];
    const headerRow = worksheet.getRow(7);
    headers.forEach((h, i) => {
        const cell = headerRow.getCell(i+1);
        cell.value = h;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    // Datos
    let rowIndex = 8;
    gastos.forEach(g => {
        const row = worksheet.getRow(rowIndex);
        row.getCell(1).value = formatDateTimeMexico(g.fecha || g.createdAt);
        row.getCell(2).value = g.viaje?.cliente || 'N/A';
        row.getCell(3).value = g.viaje?.lugarVisita || g.viaje?.destino || 'N/A';
        row.getCell(4).value = TIPOS_GASTO[g.tipo]?.label || g.tipo;
        row.getCell(5).value = g.folioFactura || '-';
        row.getCell(6).value = g.razonSocial || '-';
        row.getCell(7).value = g.monto;
        row.getCell(7).numFmt = '"$"#,##0.00';
        row.getCell(8).value = g.esFacturable !== false ? 'SÍ' : 'NO';
        if (g.esFacturable !== false) {
            row.getCell(8).font = { color: { argb: 'FF059669' }, bold: true };
        } else {
            row.getCell(8).font = { color: { argb: 'FFDC2626' }, bold: true };
        }
        row.getCell(9).value = g.comentarios || '';

        for (let i = 1; i <= 9; i++) {
            row.getCell(i).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        }
        rowIndex++;
    });

    // Totales
    const totalRow = worksheet.getRow(rowIndex);
    totalRow.getCell(6).value = 'TOTALES:';
    totalRow.getCell(7).value = total;
    totalRow.getCell(7).numFmt = '"$"#,##0.00';
    totalRow.font = { bold: true };
    totalRow.getCell(6).alignment = { horizontal: 'right' };
    for (let i = 1; i <= 9; i++) {
        totalRow.getCell(i).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    }
    rowIndex++;

    const facturableRow = worksheet.getRow(rowIndex);
    facturableRow.getCell(6).value = 'Total Facturable:';
    facturableRow.getCell(7).value = totalFacturable;
    facturableRow.getCell(7).numFmt = '"$"#,##0.00';
    facturableRow.font = { bold: true, color: { argb: 'FF059669' } };
    facturableRow.getCell(6).alignment = { horizontal: 'right' };
    for (let i = 1; i <= 9; i++) {
        facturableRow.getCell(i).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    }
    rowIndex++;

    const noFacturableRow = worksheet.getRow(rowIndex);
    noFacturableRow.getCell(6).value = 'Total No Facturable:';
    noFacturableRow.getCell(7).value = total - totalFacturable;
    noFacturableRow.getCell(7).numFmt = '"$"#,##0.00';
    noFacturableRow.font = { bold: true, color: { argb: 'FFDC2626' } };
    noFacturableRow.getCell(6).alignment = { horizontal: 'right' };
    for (let i = 1; i <= 9; i++) {
        noFacturableRow.getCell(i).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    }

    worksheet.columns = [
        { width: 18 }, { width: 20 }, { width: 25 }, { width: 15 }, { width: 15 },
        { width: 25 }, { width: 15 }, { width: 12 }, { width: 30 }
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `corte de ${fechaInicio} a ${fechaFin}.xlsx`;
    link.click();
    window.URL.revokeObjectURL(url);

    showToast('📊 Reporte Excel descargado con formato', 'success');
}

// ===== CORTE COMPLETO CON IMÁGENES =====
async function generarCorteCompleto() {
    if (!state.lastReport) {
        showToast('Primero genera un reporte', 'warning');
        return;
    }

    showToast('🔄 Preparando corte completo...', 'info');

    const { gastos, fechaInicio, fechaFin, responsable } = state.lastReport;

    const zip = new JSZip();

    // Generar Excel
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Reporte');
    // ... (misma lógica de Excel que arriba)
    await generarExcelProfesional();

    // Crear carpeta de facturas
    const facturasFolder = zip.folder('facturas_y_fotos');

    // Descargar imágenes de Storage y agregar al ZIP
    for (const gasto of gastos) {
        if (gasto.fotos && gasto.fotos.length > 0) {
            const folio = gasto.folioFactura ? gasto.folioFactura : 'sin_folio';
            const viajeNombre = (gasto.viaje?.cliente || 'viaje') + '_' + (gasto.viaje?.destino || 'desconocido');
            const nombreBase = `${folio}_${viajeNombre}`.replace(/[^a-zA-Z0-9_\-]/g, '_');

            for (let i = 0; i < gasto.fotos.length; i++) {
                try {
                    const response = await fetch(gasto.fotos[i]);
                    const blob = await response.blob();
                    const extension = blob.type.includes('png') ? 'png' : 'jpg';
                    facturasFolder.file(`${nombreBase}_${i + 1}.${extension}`, blob);
                } catch (err) {
                    console.warn('Error descargando imagen:', err);
                }
            }
        }
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const zipUrl = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = zipUrl;
    link.download = `corte_completo_${fechaInicio}_a_${fechaFin}.zip`;
    link.click();

    setTimeout(() => URL.revokeObjectURL(zipUrl), 30000);
    showToast('📦 Corte completo descargado', 'success');
}

// ===== MANEJO DE BOTÓN ATRÁS =====
let backPressedOnce = false;
let backTimer = null;

window.addEventListener('popstate', (event) => {
    const modalAbierto = document.querySelector('.modal.active');
    if (modalAbierto) {
        modalAbierto.classList.remove('active');
        document.body.style.overflow = '';
        event.preventDefault();
        return;
    }

    const appScreen = document.getElementById('app');
    if (appScreen && !appScreen.classList.contains('hidden')) {
        if (!backPressedOnce) {
            backPressedOnce = true;
            showToast('Presiona atrás nuevamente para salir', 'info', 2000);
            backTimer = setTimeout(() => {
                backPressedOnce = false;
            }, 3000);
        } else {
            clearTimeout(backTimer);
            backPressedOnce = false;
            logout();
        }
    }
});

history.pushState({ page: 'app' }, 'App', location.href);

// ===== UTILIDADES =====
function openModal(modalId) {
    const modal = document.getElementById(`modal-${modalId}`);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(`modal-${modalId}`);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function showToast(message, type = 'info', duration = 3000) {
    // Usar el nuevo sistema de utils si está disponible
    if (typeof utils !== 'undefined' && utils.showToast) {
        utils.showToast(message, type, duration);
        return;
    }
    
    // Fallback legacy
    const container = document.getElementById('toast-container');
    if (!container) {
        alert(message);
        return;
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function setLoading(btn, loading) {
    if (!btn) return;
    
    const text = btn.querySelector('.btn-text');
    const loader = btn.querySelector('.btn-loader');
    
    if (loading) {
        btn.disabled = true;
        if (text) text.style.display = 'none';
        if (loader) loader.style.display = 'inline';
    } else {
        btn.disabled = false;
        if (text) text.style.display = 'inline';
        if (loader) loader.style.display = 'none';
    }
}

function updateConnectionStatus(online = navigator.onLine) {
    state.isOnline = online;
    const indicator = document.getElementById('connection-status');
    if (indicator) {
        indicator.textContent = online ? '●' : '○';
        indicator.className = `status-indicator ${online ? 'online' : 'offline'}`;
    }
}

function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
    }
}

function formatMoney(amount) {
    return '$' + parseFloat(amount || 0).toLocaleString('es-MX', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-MX', {
        timeZone: 'America/Mexico_City',
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

function formatDateTime(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('es-MX', {
        timeZone: 'America/Mexico_City',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

async function handlePhotoCapture(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        // Usar el nuevo sistema de storage
        if (typeof storageService !== 'undefined') {
            const base64 = await storageService.fileToBase64(file);
            const compressed = await storageService.compressImage(base64, 300);
            state.tempFotos.push(compressed);
        } else {
            // Fallback legacy
            const reader = new FileReader();
            reader.onload = async function(e) {
                state.tempFotos.push(e.target.result);
            };
            reader.readAsDataURL(file);
        }
        
        // Actualizar preview
        const preview = document.getElementById('photo-preview');
        if (preview) {
            if (state.tempFotos.length === 1) {
                preview.innerHTML = '';
            }
            
            preview.innerHTML = `
                <div style="display: flex; gap: 0.5rem; overflow-x: auto; margin-bottom: 0.5rem;">
                    ${state.tempFotos.map((foto, idx) => `
                        <div style="position: relative;">
                            <img src="${foto}" style="height: 80px; border-radius: var(--radius); object-fit: cover;">
                            <button onclick="removeFoto(${idx})" style="position: absolute; top: -5px; right: -5px; background: #dc2626; color: white; border: none; border-radius: 50%; width: 20px; height: 20px; cursor: pointer; font-size: 12px;">×</button>
                        </div>
                    `).join('')}
                </div>
                <button type="button" class="btn btn-small btn-secondary" onclick="document.getElementById('camera-input').click()">+ Agregar más fotos</button>
            `;
        }
    } catch (error) {
        showToast('Error procesando imagen: ' + error.message, 'error');
    }
    
    event.target.value = '';
}

function clearPhoto() {
    state.tempFotos = [];
    const preview = document.getElementById('photo-preview');
    if (preview) {
        preview.innerHTML = `
            <span class="upload-icon">📷</span>
            <span class="upload-text">Toca para capturar foto</span>
        `;
    }
}

// ===== MODO OSCURO =====
function toggleDarkMode() {
    const isDark = utils.toggleDarkMode();
    showToast(isDark ? '🌙 Modo oscuro activado' : '☀️ Modo claro activado', 'info');
}

// ===== EXPONER FUNCIONES GLOBALMENTE =====
window.showAdminLogin = showAdminLogin;
window.backToLogin = backToLogin;
window.login = login;
window.loginAdmin = loginAdmin;
window.logout = logout;
window.registerVendor = registerVendor;
window.loadVendorsList = loadVendorsList;
window.filterVendors = filterVendors;
window.limpiarTodosLosDatos = limpiarTodosLosDatos;
window.editVendor = editVendor;
window.saveVendorChanges = saveVendorChanges;
window.deleteVendor = deleteVendor;
window.showSection = showSection;
window.showAdminTab = showAdminTab;
window.openModal = openModal;
window.closeModal = closeModal;
window.crearViaje = crearViaje;
window.editarViaje = editarViaje;
window.guardarEdicionViaje = guardarEdicionViaje;
window.eliminarViaje = eliminarViaje;
window.selectViaje = selectViaje;
window.selectTipoGasto = selectTipoGasto;
window.guardarGasto = guardarGasto;
window.toggleComentarioRequerido = toggleComentarioRequerido;
window.showDetalleGasto = showDetalleGasto;
window.editarGasto = editarGasto;
window.eliminarGasto = eliminarGasto;
window.generarReporte = generarReporte;
window.exportReport = exportReport;
window.generarExcelProfesional = generarExcelProfesional;
window.exportCorteCompleto = generarCorteCompleto;
window.abrirPerfil = abrirPerfil;
window.guardarPerfil = guardarPerfil;
window.togglePassword = togglePassword;
window.handlePhotoCapture = handlePhotoCapture;
window.clearPhoto = clearPhoto;
window.removeFoto = removeFoto;
window.loadDashboard = loadDashboard;
window.toggleDarkMode = toggleDarkMode;
window.searchGastos = searchGastos;

// Exporar servicios para acceso global si es necesario
window.authService = authService;
// ===== FUNCIÓN DE DIAGNÓSTICO =====
window.diagnosticarSession = function() {
    console.log('=== DIAGNÓSTICO DE SESIÓN ===');
    
    const authUser = auth.currentUser;
    const vendor = state.currentVendor;
    
    console.log('1. Firebase Auth:');
    console.log('   - UID:', authUser?.uid || 'NO HAY');
    console.log('   - Email:', authUser?.email || 'NO HAY');
    console.log('   - DisplayName:', authUser?.displayName || 'NO HAY');
    
    console.log('\n2. State.currentVendor:');
    console.log('   - UID:', vendor?.uid || 'NO HAY');
    console.log('   - Name:', vendor?.name || 'NO HAY');
    console.log('   - Username:', vendor?.username || 'NO HAY');
    console.log('   - Email:', vendor?.email || 'NO HAY');
    
    console.log('\n3. Comparación:');
    if (authUser?.uid && vendor?.uid) {
        const coinciden = authUser.uid === vendor.uid;
        console.log('   - ¿UIDs coinciden?', coinciden ? '✅ SÍ' : '❌ NO');
        if (!coinciden) {
            console.log('   - ⚠️ PROBLEMA: Los UIDs no coinciden');
            console.log('   - auth.uid:', authUser.uid);
            console.log('   - vendor.uid:', vendor.uid);
        }
    } else {
        console.log('   - ⚠️ FALTAN DATOS: No se pueden comparar');
    }
    
    console.log('\n4. Solución:');
    if (!authUser) {
        console.log('   - Debes iniciar sesión nuevamente');
    } else if (!vendor?.uid) {
        console.log('   - El vendedor no tiene UID asignado');
        console.log('   - Contacta al admin para recrear tu usuario');
    } else if (authUser.uid !== vendor?.uid) {
        console.log('   - El UID del documento no coincide con Auth');
        console.log('   - El admin debe eliminar y recrear tu usuario');
    } else {
        console.log('   - Todo parece correcto. Si hay errores de permisos,');
        console.log('     podrían ser las Firestore Rules.');
    }
    
    console.log('=== FIN DIAGNÓSTICO ===');
    
    // Mostrar en pantalla
    const info = `
🔍 Diagnóstico de Sesión:

Auth UID: ${authUser?.uid?.substring(0, 15) || 'NO HAY'}...
Vendor UID: ${vendor?.uid?.substring(0, 15) || 'NO HAY'}...

${authUser?.uid === vendor?.uid ? '✅ UIDs coinciden' : '❌ UIDs NO coinciden'}

${authUser?.uid !== vendor?.uid ? 
  '⚠️ SOLUCIÓN: El admin debe eliminar y recrear tu usuario con el UID correcto.' : 
  'Si hay errores de permisos, verifica las Firestore Rules.'}
    `.trim();
    
    alert(info);
    
    return {
        authUid: authUser?.uid,
        vendorUid: vendor?.uid,
        coinciden: authUser?.uid === vendor?.uid
    };
};

// ===== MAPA DE GASTOS =====
let mapaGastos = null;
let mapaMarkers = [];

window.abrirMapaGastos = async function() {
    openModal('mapa-gastos');
    await cargarSelectViajesMapa();
    await cargarMapaGastos();
};

async function cargarSelectViajesMapa() {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    
    const vendedorUid = state.currentVendor?.uid || currentUser.uid;
    if (!vendedorUid) return;
    
    try {
        const viajes = await db.getViajesByVendedor(vendedorUid);
        const select = document.getElementById('mapa-viaje-select');
        if (!select) return;
        
        select.innerHTML = '<option value="">Todos los viajes</option>' + 
            viajes.map(v => `<option value="${v.id}">${escapeHtml(v.cliente)} - ${escapeHtml(v.destino)}</option>`).join('');
    } catch (error) {
        debug('Error cargando viajes para mapa:', error);
    }
}

window.cargarMapaGastos = async function() {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        showToast('Error: No hay sesión activa', 'error');
        return;
    }
    
    const vendedorUid = state.currentVendor?.uid || currentUser.uid;
    const viajeId = document.getElementById('mapa-viaje-select')?.value;
    
    try {
        // Obtener gastos con ubicación
        let gastosConUbicacion = [];
        
        if (viajeId) {
            // Gastos de un viaje específico
            const result = await db.getGastosByViaje(viajeId, { vendedorId: vendedorUid });
            const gastos = result.data || [];
            gastosConUbicacion = gastos.filter(g => g.ubicacion && g.ubicacion.lat && g.ubicacion.lng);
        } else {
            // Todos los gastos con ubicación (últimos 100)
            const viajes = await db.getViajesByVendedor(vendedorUid);
            for (const viaje of viajes) {
                const result = await db.getGastosByViaje(viaje.id, { vendedorId: vendedorUid });
                const gastos = result.data || [];
                const conUbicacion = gastos.filter(g => g.ubicacion && g.ubicacion.lat && g.ubicacion.lng);
                gastosConUbicacion = gastosConUbicacion.concat(conUbicacion.map(g => ({...g, viaje})));
            }
            // Limitar a los últimos 50 para performance
            gastosConUbicacion = gastosConUbicacion.slice(-50);
        }
        
        // Inicializar o actualizar mapa
        inicializarMapa(gastosConUbicacion);
        
    } catch (error) {
        debug('Error cargando mapa:', error);
        showToast('Error al cargar mapa: ' + error.message, 'error');
    }
};

function inicializarMapa(gastos) {
    const container = document.getElementById('mapa-gastos-container');
    if (!container) return;
    
    // Limpiar contenedor
    container.innerHTML = '';
    
    if (gastos.length === 0) {
        container.innerHTML = `
            <div style="display: flex; justify-content: center; align-items: center; height: 100%; color: #6b7280; flex-direction: column; padding: 2rem; text-align: center;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">📍</div>
                <p>No hay gastos con ubicación registrada.</p>
                <p style="font-size: 0.875rem; margin-top: 0.5rem;">
                    Los gastos capturados con el permiso de ubicación aparecerán aquí.
                </p>
            </div>
        `;
        return;
    }
    
    // Remover mapa anterior si existe (para evitar "Map container is already initialized")
    if (mapaGastos) {
        mapaGastos.remove();
        mapaGastos = null;
    }
    
    // Limpiar contenedor completamente
    container.innerHTML = '';
    
    // Crear nuevo mapa
    mapaGastos = L.map('mapa-gastos-container');
    
    // Agregar capa de OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(mapaGastos);
    
    // Limpiar marcadores anteriores
    mapaMarkers = [];
    
    // Colores por tipo de gasto
    const colores = {
        gasolina: '#dc2626',
        comida: '#f59e0b',
        hotel: '#3b82f6',
        transporte: '#10b981',
        casetas: '#6366f1',
        otros: '#6b7280'
    };
    
    // Iconos por tipo
    const iconos = {
        gasolina: '⛽',
        comida: '🍔',
        hotel: '🏨',
        transporte: '🚌',
        casetas: '🛣️',
        otros: '📦'
    };
    
    // Agregar marcadores
    const bounds = [];
    
    gastos.forEach(gasto => {
        if (!gasto.ubicacion) return;
        
        const { lat, lng } = gasto.ubicacion;
        const tipo = gasto.tipo || 'otros';
        const color = colores[tipo] || '#6b7280';
        const icono = iconos[tipo] || '📦';
        
        // Crear marcador personalizado
        const customIcon = L.divIcon({
            className: 'custom-marker',
            html: `<div style="
                background: ${color}; 
                width: 32px; 
                height: 32px; 
                border-radius: 50%; 
                display: flex; 
                align-items: center; 
                justify-content: center; 
                border: 3px solid white; 
                box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                font-size: 16px;
            ">${icono}</div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });
        
        const marker = L.marker([lat, lng], { icon: customIcon }).addTo(mapaGastos);
        
        // Popup con información
        const popupContent = `
            <div style="font-family: system-ui, sans-serif; min-width: 200px;">
                <h4 style="margin: 0 0 0.5rem 0; color: ${color};">${icono} ${TIPOS_GASTO[tipo]?.label || tipo}</h4>
                <p style="margin: 0.25rem 0; font-size: 1.1rem; font-weight: 600;">${formatMoney(gasto.monto)}</p>
                <p style="margin: 0.25rem 0; color: #6b7280; font-size: 0.875rem;">${escapeHtml(gasto.lugar || 'Sin lugar')}</p>
                <p style="margin: 0.25rem 0; color: #9ca3af; font-size: 0.75rem;">${formatDate(gasto.fecha || gasto.createdAt)}</p>
                ${gasto.folioFactura ? `<p style="margin: 0.25rem 0; color: #059669; font-size: 0.75rem;">📄 Folio: ${escapeHtml(gasto.folioFactura)}</p>` : ''}
            </div>
        `;
        
        marker.bindPopup(popupContent);
        mapaMarkers.push(marker);
        bounds.push([lat, lng]);
    });
    
    // Ajustar vista para mostrar todos los marcadores
    if (bounds.length > 0) {
        mapaGastos.fitBounds(bounds, { padding: [50, 50] });
    } else {
        // Centro por defecto (México)
        mapaGastos.setView([23.6345, -102.5528], 5);
    }
}

window.exportarMapaRuta = async function() {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    
    const vendedorUid = state.currentVendor?.uid || currentUser.uid;
    const viajeId = document.getElementById('mapa-viaje-select')?.value;
    
    try {
        let gastosConUbicacion = [];
        let nombreArchivo = 'ruta-gastos';
        
        if (viajeId) {
            const viaje = await db.get('viajes', viajeId);
            nombreArchivo = `ruta-${viaje?.cliente || 'viaje'}-${formatDate(viaje?.fechaInicio)}`;
            
            const result = await db.getGastosByViaje(viajeId, { vendedorId: vendedorUid });
            const gastos = result.data || [];
            gastosConUbicacion = gastos.filter(g => g.ubicacion && g.ubicacion.lat && g.ubicacion.lng);
        } else {
            // Todos los gastos recientes
            const viajes = await db.getViajesByVendedor(vendedorUid);
            for (const viaje of viajes.slice(-5)) { // Últimos 5 viajes
                const result = await db.getGastosByViaje(viaje.id, { vendedorId: vendedorUid });
                const gastos = result.data || [];
                const conUbicacion = gastos.filter(g => g.ubicacion && g.ubicacion.lat && g.ubicacion.lng);
                gastosConUbicacion = gastosConUbicacion.concat(conUbicacion.map(g => ({...g, viaje})));
            }
            nombreArchivo = `ruta-completa-${new Date().toISOString().split('T')[0]}`;
        }
        
        if (gastosConUbicacion.length === 0) {
            showToast('No hay gastos con ubicación para exportar', 'warning');
            return;
        }
        
        // Crear contenido KML (para Google Earth) o GeoJSON
        const geoJSON = {
            type: 'FeatureCollection',
            features: gastosConUbicacion.map(g => ({
                type: 'Feature',
                properties: {
                    tipo: g.tipo,
                    monto: g.monto,
                    lugar: g.lugar,
                    fecha: g.fecha || g.createdAt,
                    folio: g.folioFactura || '',
                    descripcion: `${TIPOS_GASTO[g.tipo]?.label || g.tipo}: ${formatMoney(g.monto)} - ${g.lugar || 'Sin lugar'}`
                },
                geometry: {
                    type: 'Point',
                    coordinates: [g.ubicacion.lng, g.ubicacion.lat]
                }
            }))
        };
        
        // Descargar archivo
        const blob = new Blob([JSON.stringify(geoJSON, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${nombreArchivo.replace(/[^a-zA-Z0-9-]/g, '_')}.geojson`;
        link.click();
        URL.revokeObjectURL(url);
        
        showToast('📍 Ruta exportada correctamente', 'success');
        
    } catch (error) {
        debug('Error exportando ruta:', error);
        showToast('Error al exportar ruta', 'error');
    }
};

window.storageService = storageService;
window.utils = utils;

// Exponer funciones del mapa globalmente
window.cargarMapaGastos = cargarMapaGastos;

debug('App.js v6.0 cargado completamente');

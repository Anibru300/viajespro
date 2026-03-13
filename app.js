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
    VERSION: '6.1.0',
    APP_NAME: '3P Control de Gastos',
    ENABLE_STORAGE: false,  // Desactivado temporalmente - usar modo legacy (base64 en Firestore)
    ENABLE_GEOLOCATION: true,
    AUTOSAVE_INTERVAL: 10000, // 10 segundos
    CHECK_UPDATE_INTERVAL: 300000 // 5 minutos
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

// Función para sincronizar el input de fecha con la hora actual de México
function syncFechaConMexico() {
    const input = document.getElementById('fecha-gasto');
    if (input) {
        input.value = getMexicoDateTimeLocal();
        showToast('🕐 Fecha sincronizada con hora de México', 'success');
    }
}
function getMexicoDateTime() {
    return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" }));
}

function formatDateTimeMexico(dateString) {
    if (!dateString) return '-';
    
    try {
        // Parsear la fecha ISO
        const date = new Date(dateString);
        
        // Formatear en zona horaria de México
        return date.toLocaleString('es-MX', {
            timeZone: 'America/Mexico_City',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    } catch (e) {
        return dateString || '-';
    }
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
    // Obtener fecha/hora actual en Ciudad de México
    const mexicoTime = new Date().toLocaleString("en-US", { 
        timeZone: "America/Mexico_City",
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    
    // Formato: MM/DD/YYYY, HH:mm → convertir a YYYY-MM-DDTHH:mm
    const [datePart, timePart] = mexicoTime.split(', ');
    const [month, day, year] = datePart.split('/');
    
    return `${year}-${month}-${day}T${timePart}`;
}

// Obtener fecha actual en México como YYYY-MM-DD (para inputs tipo date)
function getMexicoDateString() {
    const mexicoTime = new Date().toLocaleString("en-US", { 
        timeZone: "America/Mexico_City",
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    
    // Formato: MM/DD/YYYY → convertir a YYYY-MM-DD
    const [month, day, year] = mexicoTime.split('/');
    return `${year}-${month}-${day}`;
}

// Convertir fecha y hora a ISO string con zona horaria de México
function toMexicoISOString(dateInput, timeInput = '12:00') {
    // Crear fecha combinando el input con la hora especificada en zona de México
    const [year, month, day] = dateInput.split('-');
    const [hours, minutes] = timeInput.split(':');
    
    // Crear fecha como si fuera en Ciudad de México
    // Usar Intl.DateTimeFormat para manejar correctamente el horario de verano
    const mexicoDateStr = `${year}-${month}-${day}T${hours}:${minutes}:00`;
    
    // Crear fecha interpretando los componentes en zona de México
    const dateInMexico = new Date(mexicoDateStr);
    
    // Usar formatToParts para obtener los componentes en zona de México
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    
    // Crear una fecha a partir de los componentes en México
    const parts = formatter.formatToParts(dateInMexico);
    const getPart = (type) => parts.find(p => p.type === type).value;
    
    const y = getPart('year');
    const m = getPart('month');
    const d = getPart('day');
    const h = getPart('hour');
    const min = getPart('minute');
    const s = getPart('second');
    
    // Retornar en formato ISO
    return `${y}-${m}-${d}T${h}:${min}:${s}.000Z`;
}

// Obtener timestamp actual en formato ISO con hora de México
function getMexicoISOString() {
    // Obtener componentes de fecha/hora en Ciudad de México
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    
    const parts = formatter.formatToParts(new Date());
    const getPart = (type) => parts.find(p => p.type === type).value;
    
    // Construir fecha en formato ISO 8601
    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');
    const hour = getPart('hour');
    const minute = getPart('minute');
    const second = getPart('second');
    
    return `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`;
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
    setupBackButtonHandler();
    updateConnectionStatus();
    
    // Configurar fechas por defecto (hora de Ciudad de México)
    const today = getMexicoDateString();
    if (document.getElementById('viaje-fecha-inicio')) {
        document.getElementById('viaje-fecha-inicio').value = today;
    }
    if (document.getElementById('fecha-gasto')) {
        document.getElementById('fecha-gasto').value = getMexicoDateTimeLocal();
    }
    
    const firstDay = getMexicoDateTime();
    firstDay.setDate(1);
    const firstDayStr = `${firstDay.getFullYear()}-${String(firstDay.getMonth() + 1).padStart(2, '0')}-${String(firstDay.getDate()).padStart(2, '0')}`;
    if (document.getElementById('reporte-fecha-inicio')) {
        document.getElementById('reporte-fecha-inicio').value = firstDayStr;
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
// Historial de navegación para manejar botón atrás
let navigationHistory = [];
let currentSection = 'dashboard';

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

function showSection(sectionName, addToHistory = true) {
    debug('Mostrando sección:', sectionName);
    
    // Si estamos cambiando a una nueva sección, guardar la anterior en historial
    if (addToHistory && currentSection !== sectionName) {
        // Si ya hay historial, verificar que no sea la misma sección
        if (navigationHistory.length === 0 || navigationHistory[navigationHistory.length - 1] !== currentSection) {
            navigationHistory.push(currentSection);
            // Limitar historial a 10 elementos
            if (navigationHistory.length > 10) {
                navigationHistory.shift();
            }
        }
        currentSection = sectionName;
    }
    
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

// Función para manejar el botón atrás
function handleBackButton() {
    // Si hay historial, ir a la sección anterior
    if (navigationHistory.length > 0) {
        const previousSection = navigationHistory.pop();
        currentSection = previousSection;
        showSection(previousSection, false);
        return true; // Se manejó el retroceso
    }
    return false; // No hay historial, permitir salir
}

// Configurar manejo del botón atrás en móvil
function setupBackButtonHandler() {
    // Manejar evento de tecla atrás en Android
    window.addEventListener('popstate', function(event) {
        // Verificar si estamos en la app principal (no en login)
        if (state.currentUser) {
            const handled = handleBackButton();
            if (handled) {
                // Prevenir salir de la app
                history.pushState(null, '', window.location.href);
            } else {
                // No hay más historial, preguntar si quiere salir
                if (confirm('¿Deseas salir de la aplicación?')) {
                    // Permitir salir
                } else {
                    // Mantener en la app
                    history.pushState(null, '', window.location.href);
                }
            }
        }
    });
    
    // Agregar estado inicial para poder usar popstate
    if (state.currentUser) {
        history.pushState(null, '', window.location.href);
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
        
        // Mostrar información de debug en consola para ayudar al admin
        console.error('=== ERROR DE LOGIN ===');
        console.error('Mensaje:', error.message);
        console.error('Código:', error.code);
        console.error('Usuario intentado:', username);
        if (error.attemptedEmails) {
            console.error('Emails intentados:', error.attemptedEmails);
        }
        
        // Construir mensaje de error más descriptivo
        let errorMsg = error.message;
        
        // Si es error de credenciales inválidas, agregar ayuda
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found') {
            errorMsg += '\n\n💡 SOLUCIÓN:\n';
            errorMsg += '1. Ve a Firebase Console > Authentication\n';
            errorMsg += '2. Verifica que el usuario exista con alguno de los emails mostrados arriba\n';
            errorMsg += '3. Si no existe, créalo manualmente o usa el panel de admin\n';
            errorMsg += '\n🔍 Tip: Intenta iniciar sesión con el email completo (ej: usuario@email.com)';
        }
        
        // Mostrar error con duración más larga para que puedan leerlo
        showToast(errorMsg, 'error', 10000);
        
        // Si es admin, mostrar en el error del admin también
        if (username === 'admin') {
            const adminError = document.getElementById('admin-login-error');
            if (adminError) {
                adminError.innerHTML = error.message.replace(/\n/g, '<br>');
                adminError.style.whiteSpace = 'pre-wrap';
            }
        }
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
    
    // Cargar credenciales guardadas si existen
    const savedCreds = authService.checkSavedCredentials();
    if (savedCreds) {
        const usernameInput = document.getElementById('login-username');
        const passwordInput = document.getElementById('login-password');
        const rememberCheckbox = document.getElementById('remember-me');
        
        if (usernameInput) usernameInput.value = savedCreds.email;
        if (passwordInput) passwordInput.value = savedCreds.password;
        if (rememberCheckbox) rememberCheckbox.checked = true;
        
        console.log('[Login] Credenciales cargadas del almacenamiento local');
    }
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
    
    // Reiniciar historial de navegación
    navigationHistory = [];
    currentSection = 'dashboard';
    
    // Mostrar dashboard primero (nuevo en v6.0)
    showSection('dashboard', false);
    
    // Actualizar navegación
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    const dashboardNav = document.querySelector('[data-section="dashboard"]');
    if (dashboardNav) dashboardNav.classList.add('active');
    
    // Configurar estado inicial para botón atrás
    if (window.history && window.history.pushState) {
        history.pushState({ page: 'dashboard' }, '', window.location.href);
    }
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
        fechaInicio: toMexicoISOString(fechaInicioInput, '12:00'),
        fechaFin: fechaFinInput ? toMexicoISOString(fechaFinInput, '12:00') : null,
        presupuesto: presupuesto,
        estado: 'activo',
        createdAt: getMexicoISOString(),
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
        viaje.fechaInicio = toMexicoISOString(fechaInicioInput, '12:00');
        viaje.fechaFin = fechaFinInput ? toMexicoISOString(fechaFinInput, '12:00') : null;
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
    
    // Ocultar sección de fotos existentes y restaurar label
    const containerExistentes = document.getElementById('fotos-existentes-container');
    if (containerExistentes) containerExistentes.classList.add('hidden');
    
    const labelNuevas = document.getElementById('fotos-label-nuevas');
    if (labelNuevas) labelNuevas.innerHTML = '📷 Agregar fotos de soporte';
    
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
        // Separar fotos nuevas (base64) de fotos existentes (URLs)
        const fotosNuevas = state.tempFotos.filter(f => f._isNew === true);
        const fotosExistentes = state.tempFotos.filter(f => f._isNew === false);
        
        console.log('[Guardar Gasto] Fotos nuevas:', fotosNuevas.length, 'Fotos existentes:', fotosExistentes.length);
        
        // Subir imágenes a Storage solo las NUEVAS
        let imageUrls = fotosExistentes.map(f => f._data || String(f)); // URLs existentes
        let imagePaths = state.currentGasto?.imagePaths || [];
        
        if (fotosNuevas.length > 0 && CONFIG.ENABLE_STORAGE) {
            showToast(`📤 Subiendo ${fotosNuevas.length} imagen(es) nueva(s)...`, 'info');
            
            // FIX: Usar el UID del vendedor en lugar del username para cumplir con las reglas de Storage
            const storagePath = `gastos/${vendedorUid}/${viajeId}`;
            console.log('[Guardar Gasto] Subiendo fotos a:', storagePath);
            
            // Extraer los datos base64 de los objetos foto
            const fotosNuevasData = fotosNuevas.map(f => f._data || String(f));
            const uploadResults = await storageService.uploadMultipleImages(
                fotosNuevasData,
                storagePath
            );
            
            // Combinar URLs nuevas con las existentes
            imageUrls = [...imageUrls, ...uploadResults.map(r => r.url)];
            imagePaths = [...imagePaths, ...uploadResults.map(r => r.path)];
        } else if (fotosNuevas.length > 0) {
            // Fallback: guardar en base64 (modo legacy) si Storage está deshabilitado
            const fotosNuevasData = fotosNuevas.map(f => f._data || String(f));
            imageUrls = [...imageUrls, ...fotosNuevasData];
        }
        
        const esEdicion = state.currentGasto !== null;
        
        const gastoData = {
            viajeId,
            vendedorId: vendedorUid,
            tipo: tipoCard.dataset.tipo,
            monto: monto,
            lugar: lugar || 'Sin lugar',
            fecha: fecha ? toMexicoISOString(fecha.split('T')[0], fecha.split('T')[1]?.slice(0,5) || '12:00') : getMexicoISOString(),
            folioFactura,
            razonSocial,
            comentarios,
            esFacturable,
            // v6.0: Usar URLs de Storage en lugar de base64
            fotos: imageUrls,
            imagePaths: imagePaths, // Para poder eliminar después
            ubicacion: state.currentPosition, // v6.0: Geolocalización
            updatedAt: getMexicoISOString()
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
                createdAt: getMexicoISOString()
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
        
        // Cargar fotos existentes (marcarlas como no nuevas)
        const fotosExistentes = gasto.fotos || [];
        state.tempFotos = fotosExistentes.map(url => {
            return {
                _data: url,
                _fileKey: null,
                _isNew: false,
                toString: function() { return this._data; },
                valueOf: function() { return this._data; }
            };
        });
        
        // Mostrar sección de fotos existentes
        mostrarFotosExistentes(fotosExistentes);
        
        // Actualizar label de fotos nuevas
        const labelNuevas = document.getElementById('fotos-label-nuevas');
        if (labelNuevas) {
            labelNuevas.innerHTML = `📷 Agregar más fotos <span style="font-size: 0.75rem; color: var(--gray-500);">(${fotosExistentes.length} guardadas)</span>`;
        }
        
        if (state.tempFotos.length > 0) {
            actualizarPreviewFotos();
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
    actualizarPreviewFotos();
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
    const headers = ['Fecha', 'Cliente', 'Lugar de Visita', 'Tipo Gasto', 'Folio Factura', 'Razón Social', 'Total', 'Facturable', 'Fotos', 'Comentarios'];
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
        // Conteo de fotos
        const numFotos = (g.fotos || []).length;
        row.getCell(9).value = numFotos > 0 ? `${numFotos} foto(s)` : 'Sin fotos';
        if (numFotos > 0) {
            row.getCell(9).font = { color: { argb: 'FF2563EB' }, bold: true };
        }
        row.getCell(10).value = g.comentarios || '';

        for (let i = 1; i <= 10; i++) {
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

    showToast('🔄 Preparando corte completo con fotos organizadas...', 'info');

    const { gastos, fechaInicio, fechaFin, responsable } = state.lastReport;

    const zip = new JSZip();
    
    // Crear carpetas por categoría
    const categorias = {
        gasolina: zip.folder('01_GASOLINA'),
        comida: zip.folder('02_COMIDA'),
        hotel: zip.folder('03_HOTEL'),
        transporte: zip.folder('04_TRANSPORTE'),
        casetas: zip.folder('05_CASETAS'),
        otros: zip.folder('06_OTROS')
    };
    
    // Carpeta para fotos sin categoría
    const sinCategoriaFolder = zip.folder('00_SIN_CATEGORIA');

    // Contadores para estadísticas
    const stats = {
        totalFotos: 0,
        fotosDescargadas: 0,
        fotosError: 0,
        porCategoria: {}
    };

    // Función para descargar imagen con manejo de CORS
    async function descargarImagen(url) {
        try {
            // Intentar con fetch primero (para URLs públicas)
            const response = await fetch(url, {
                method: 'GET',
                mode: 'cors',
                cache: 'no-cache',
                headers: {
                    'Accept': 'image/*,*/*'
                }
            });
            
            if (response.ok) {
                return await response.blob();
            }
            throw new Error(`HTTP ${response.status}`);
        } catch (fetchError) {
            // Si falla fetch, intentar con XMLHttpRequest (mejor para Firebase Storage)
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.responseType = 'blob';
                xhr.onload = function() {
                    if (xhr.status === 200) {
                        resolve(xhr.response);
                    } else {
                        reject(new Error(`XHR Error: ${xhr.status}`));
                    }
                };
                xhr.onerror = () => reject(new Error('XHR Network Error'));
                xhr.open('GET', url, true);
                xhr.send();
            });
        }
    }

    // Procesar gastos y descargar fotos
    let procesados = 0;
    const totalGastos = gastos.filter(g => g.fotos && g.fotos.length > 0).length;
    
    for (const gasto of gastos) {
        if (gasto.fotos && gasto.fotos.length > 0) {
            procesados++;
            
            // Actualizar progreso cada 5 gastos
            if (procesados % 5 === 0) {
                showToast(`📸 Descargando fotos... (${procesados}/${totalGastos})`, 'info');
            }
            
            // Determinar categoría
            const tipo = gasto.tipo || 'otros';
            const categoriaFolder = categorias[tipo] || sinCategoriaFolder;
            
            // Inicializar contador de categoría
            if (!stats.porCategoria[tipo]) {
                stats.porCategoria[tipo] = 0;
            }
            
            // Crear nombre base del archivo
            const fecha = gasto.fecha ? gasto.fecha.split('T')[0] : 'sin_fecha';
            const folio = gasto.folioFactura ? gasto.folioFactura.replace(/[^a-zA-Z0-9]/g, '_') : 'sin_folio';
            const cliente = (gasto.viaje?.cliente || 'sin_cliente').substring(0, 20).replace(/[^a-zA-Z0-9]/g, '_');
            const destino = (gasto.viaje?.destino || 'sin_destino').substring(0, 20).replace(/[^a-zA-Z0-9]/g, '_');
            const monto = gasto.monto ? `$${gasto.monto}` : '';
            
            for (let i = 0; i < gasto.fotos.length; i++) {
                stats.totalFotos++;
                
                try {
                    const blob = await descargarImagen(gasto.fotos[i]);
                    
                    // Determinar extensión
                    let extension = 'jpg';
                    if (blob.type.includes('png')) extension = 'png';
                    else if (blob.type.includes('gif')) extension = 'gif';
                    else if (blob.type.includes('webp')) extension = 'webp';
                    else if (blob.type.includes('pdf')) extension = 'pdf';
                    
                    // Nombre descriptivo: FECHA_FOLIO_CLIENTE_DESTINO_MONTO_NUM.ext
                    const nombreArchivo = `${fecha}_${folio}_${cliente}_${destino}_${monto}_${i + 1}.${extension}`
                        .replace(/__+/g, '_') // Evitar múltiples guiones bajos
                        .replace(/^_+|_+$/g, ''); // Quitar guiones al inicio/final
                    
                    categoriaFolder.file(nombreArchivo, blob);
                    stats.fotosDescargadas++;
                    stats.porCategoria[tipo]++;
                    
                } catch (err) {
                    stats.fotosError++;
                    console.warn(`Error descargando foto ${i + 1} de gasto ${gasto.id}:`, err);
                    
                    // Agregar un archivo de error para referencia
                    const errorInfo = `Fecha: ${fecha}\nFolio: ${folio}\nCliente: ${cliente}\nDestino: ${destino}\nMonto: ${monto}\nError: ${err.message}\nURL: ${gasto.fotos[i]}\n`;
                    categoriaFolder.file(`ERROR_${fecha}_${folio}_${i + 1}.txt`, errorInfo);
                }
            }
        }
    }

    // Generar Excel dentro del ZIP
    showToast('📊 Generando archivo Excel...', 'info');
    const excelBuffer = await generarExcelParaZIP();
    zip.file(`REPORTE_${fechaInicio}_a_${fechaFin}.xlsx`, excelBuffer);

    // Crear archivo README con información
    const readmeContent = `═══════════════════════════════════════════════════════════════
   REPORTE DE GASTOS - 3P VIAJESPRO v${CONFIG.VERSION}
═══════════════════════════════════════════════════════════════

📅 Período: ${formatDateMexico(fechaInicio)} - ${formatDateMexico(fechaFin)}
👤 Responsable: ${responsable || 'No especificado'}
📊 Total de Gastos: ${gastos.length}
💰 Monto Total: $${gastos.reduce((sum, g) => sum + (g.monto || 0), 0).toFixed(2)}

───────────────────────────────────────────────────────────────
   ESTADÍSTICAS DE FOTOS
───────────────────────────────────────────────────────────────

📸 Total de fotos en el reporte: ${stats.totalFotos}
✅ Fotos descargadas exitosamente: ${stats.fotosDescargadas}
❌ Fotos con error: ${stats.fotosError}

Fotos por categoría:
${Object.entries(stats.porCategoria)
    .map(([cat, count]) => `  • ${TIPOS_GASTO[cat]?.label || cat}: ${count} fotos`)
    .join('\n')}

───────────────────────────────────────────────────────────────
   ESTRUCTURA DE CARPETAS
───────────────────────────────────────────────────────────────

📁 01_GASOLINA/      - Fotos de tickets de gasolina
📁 02_COMIDA/        - Fotos de comidas y restaurantes
📁 03_HOTEL/         - Fotos de hospedaje y hoteles
📁 04_TRANSPORTE/    - Fotos de transporte (taxis, Uber, etc.)
📁 05_CASETAS/       - Fotos de casetas de peaje
📁 06_OTROS/         - Otras categorías de gastos
📁 00_SIN_CATEGORIA/ - Fotos sin categoría específica

📄 REPORTE_*.xlsx    - Archivo Excel con todos los datos

───────────────────────────────────────────────────────────────
   NOTAS
───────────────────────────────────────────────────────────────

• Los archivos de fotos siguen el formato:
  FECHA_FOLIO_CLIENTE_DESTINO_MONTO_NUMERO.ext

• Si hay archivos "ERROR_*.txt", significa que esa foto
  no pudo descargarse. Contacta al administrador.

• Este ZIP fue generado automáticamente por ViajesPro
  el ${new Date().toLocaleString('es-MX')}

───────────────────────────────────────────────────────────────
   3P S.A. DE C.V. - Sistema de Control de Gastos
───────────────────────────────────────────────────────────────
`;
    zip.file('README.txt', readmeContent);

    // Generar ZIP final
    showToast('📦 Comprimiendo archivo ZIP...', 'info');
    const zipBlob = await zip.generateAsync({ 
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
    });
    
    const zipUrl = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = zipUrl;
    link.download = `CORTE_COMPLETO_${fechaInicio}_a_${fechaFin}_${stats.fotosDescargadas}fotos.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(zipUrl), 60000);
    
    showToast(`✅ Corte completo descargado: ${stats.fotosDescargadas}/${stats.totalFotos} fotos`, 'success');
}

// Función auxiliar para generar Excel como buffer (para incluir en ZIP)
async function generarExcelParaZIP() {
    const { gastos, fechaInicio, fechaFin, responsable } = state.lastReport;
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Reporte de Gastos');

    // Configurar propiedades del documento
    workbook.creator = '3P ViajesPro';
    workbook.lastModifiedBy = responsable || 'Sistema';
    workbook.created = new Date();
    workbook.modified = new Date();

    // Título principal
    worksheet.mergeCells('A1:I1');
    worksheet.getCell('A1').value = '3P S.A. DE C.V. - REPORTE DE GASTOS';
    worksheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFDC2626' } };
    worksheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(1).height = 30;

    // Período
    worksheet.mergeCells('A2:I2');
    worksheet.getCell('A2').value = `Período: ${formatDateMexico(fechaInicio)} - ${formatDateMexico(fechaFin)}`;
    worksheet.getCell('A2').font = { size: 12, bold: true };
    worksheet.getCell('A2').alignment = { horizontal: 'center' };
    worksheet.getRow(2).height = 20;

    // Responsable
    worksheet.mergeCells('A3:I3');
    worksheet.getCell('A3').value = `Responsable: ${responsable || 'No especificado'}`;
    worksheet.getCell('A3').font = { size: 11 };
    worksheet.getCell('A3').alignment = { horizontal: 'center' };

    worksheet.addRow([]);

    // Encabezados
    const headers = ['Fecha', 'Tipo', 'Folio', 'Descripción', 'Cliente', 'Destino', 'Monto', 'Forma de Pago', 'Observaciones'];
    const headerRow = worksheet.addRow(headers);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
    
    // Configurar anchos de columna
    worksheet.columns = [
        { width: 15 },  // Fecha
        { width: 12 },  // Tipo
        { width: 15 },  // Folio
        { width: 30 },  // Descripción
        { width: 25 },  // Cliente
        { width: 20 },  // Destino
        { width: 12 },  // Monto
        { width: 15 },  // Forma de Pago
        { width: 30 }   // Observaciones
    ];

    // Datos
    let totalMonto = 0;
    gastos.forEach(gasto => {
        const row = worksheet.addRow([
            formatDateMexico(gasto.fecha),
            TIPOS_GASTO[gasto.tipo]?.label || gasto.tipo || 'Otro',
            gasto.folioFactura || 'N/A',
            gasto.descripcion || '',
            gasto.viaje?.cliente || 'N/A',
            gasto.viaje?.destino || 'N/A',
            gasto.monto || 0,
            gasto.formaPago || 'Efectivo',
            gasto.observaciones || ''
        ]);

        // Formato condicional según tipo
        const tipoColor = TIPOS_GASTO[gasto.tipo]?.color || '#6b7280';
        row.getCell(2).font = { color: { argb: tipoColor.replace('#', 'FF') } };
        
        // Formato de moneda
        row.getCell(7).numFmt = '$#,##0.00';
        row.getCell(7).alignment = { horizontal: 'right' };
        
        totalMonto += (gasto.monto || 0);
    });

    // Fila de total
    worksheet.addRow([]);
    const totalRow = worksheet.addRow(['', '', '', '', '', 'TOTAL:', totalMonto, '', '']);
    totalRow.font = { bold: true, size: 12 };
    totalRow.getCell(7).numFmt = '$#,##0.00';
    totalRow.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };

    // Resumen por categoría
    worksheet.addRow([]);
    worksheet.addRow(['RESUMEN POR CATEGORÍA', '', '', '', '', '', '', '', '']);
    const resumenRow = worksheet.lastRow;
    resumenRow.font = { bold: true, color: { argb: 'FFDC2626' } };
    resumenRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };

    const totalesPorTipo = {};
    gastos.forEach(g => {
        totalesPorTipo[g.tipo] = (totalesPorTipo[g.tipo] || 0) + (g.monto || 0);
    });

    Object.entries(totalesPorTipo).forEach(([tipo, monto]) => {
        const label = TIPOS_GASTO[tipo]?.label || tipo;
        const row = worksheet.addRow(['', label, '', '', '', '', monto, '', '']);
        row.getCell(7).numFmt = '$#,##0.00';
        row.getCell(7).alignment = { horizontal: 'right' };
    });

    // Generar buffer
    return await workbook.xlsx.writeBuffer();
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

// ===== CAPTURA DE FOTOS MEJORADA v6.1 =====
// Separa fotos nuevas (base64) de fotos existentes (URLs de Storage)

async function handlePhotoCapture(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        // Verificar que no sea duplicado (comparar por nombre y tamaño aproximado)
        const fileKey = `${file.name}_${file.size}`;
        if (state.tempFotos.some(f => f._fileKey === fileKey)) {
            showToast('Esta foto ya fue agregada', 'warning');
            event.target.value = '';
            return;
        }
        
        showToast('📷 Procesando imagen...', 'info');
        
        // Usar el nuevo sistema de storage
        let compressed;
        if (typeof storageService !== 'undefined') {
            const base64 = await storageService.fileToBase64(file);
            compressed = await storageService.compressImage(base64, 800);
        } else {
            // Fallback legacy
            compressed = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        }
        
        // Marcar como foto nueva (necesita ser subida)
        // Crear objeto con el base64 y metadata
        console.log('[FOTO] Creando objeto foto con _data, tipo:', typeof compressed);
        const fotoObj = {
            _data: compressed,  // El base64 real
            _fileKey: fileKey,
            _isNew: true,
            // Método toString para que funcione como string cuando se necesite
            toString: function() { return this._data; },
            valueOf: function() { return this._data; }
        };
        
        state.tempFotos.push(fotoObj);
        
        // Actualizar preview
        actualizarPreviewFotos();
        
        showToast(`✅ Foto agregada (${state.tempFotos.length} total)`, 'success');
        
    } catch (error) {
        showToast('Error procesando imagen: ' + error.message, 'error');
    }
    
    event.target.value = '';
}

// Función auxiliar para actualizar el preview de fotos
function actualizarPreviewFotos() {
    const preview = document.getElementById('photo-preview');
    if (!preview) return;
    
    if (state.tempFotos.length === 0) {
        preview.innerHTML = `
            <span class="upload-icon">📷</span>
            <span class="upload-text">Toca para capturar foto</span>
        `;
        return;
    }
    
    preview.innerHTML = `
        <div style="display: flex; gap: 0.5rem; overflow-x: auto; margin-bottom: 0.5rem; padding: 0.5rem;">
            ${state.tempFotos.map((foto, idx) => `
                <div style="position: relative; flex-shrink: 0;">
                    <img src="${foto._data || foto}" style="height: 80px; width: 80px; border-radius: var(--radius); object-fit: cover; border: 2px solid ${foto._isNew ? 'var(--success)' : '#ccc'};">
                    ${foto._isNew ? '<span style="position: absolute; top: -5px; right: -5px; background: var(--success); color: white; border-radius: 50%; width: 18px; height: 18px; font-size: 10px; display: flex; align-items: center; justify-content: center;">✓</span>' : ''}
                    <button onclick="removeFoto(${idx})" style="position: absolute; bottom: -5px; right: -5px; background: #dc2626; color: white; border: none; border-radius: 50%; width: 20px; height: 20px; cursor: pointer; font-size: 12px;">×</button>
                </div>
            `).join('')}
        </div>
        <button type="button" class="btn btn-small btn-secondary" onclick="document.getElementById('camera-input').click()">+ Agregar más fotos</button>
        <p style="font-size: 0.75rem; color: var(--gray-500); margin-top: 0.5rem;">
            ${state.tempFotos.filter(f => f._isNew).length} nuevas, ${state.tempFotos.filter(f => !f._isNew).length} existentes
        </p>
    `;
}

// Función para mostrar fotos existentes en edición
function mostrarFotosExistentes(fotos) {
    const container = document.getElementById('fotos-existentes-container');
    const preview = document.getElementById('fotos-existentes-preview');
    
    if (!container || !preview) return;
    
    if (fotos.length === 0) {
        container.classList.add('hidden');
        return;
    }
    
    container.classList.remove('hidden');
    preview.innerHTML = fotos.map((url, idx) => `
        <div style="position: relative; flex-shrink: 0;">
            <img src="${url}" style="height: 60px; width: 60px; border-radius: var(--radius); object-fit: cover; border: 2px solid #ccc; cursor: pointer;" 
                 onclick="verFotoGrande('${url.replace(/'/g, "\\'")}')" title="Click para ver">
            <span style="position: absolute; top: -5px; right: -5px; background: #6b7280; color: white; border-radius: 50%; width: 16px; height: 16px; font-size: 9px; display: flex; align-items: center; justify-content: center;">${idx + 1}</span>
        </div>
    `).join('');
}

// Función para ver foto en tamaño grande
function verFotoGrande(url) {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0; 
        background: rgba(0,0,0,0.9); z-index: 9999; display: flex; 
        align-items: center; justify-content: center; padding: 2rem;
    `;
    modal.innerHTML = `
        <img src="${url}" style="max-width: 100%; max-height: 90vh; object-fit: contain; border-radius: var(--radius);">
        <button onclick="this.parentElement.remove()" style="position: absolute; top: 1rem; right: 1rem; background: white; border: none; border-radius: 50%; width: 40px; height: 40px; cursor: pointer; font-size: 20px;">✕</button>
    `;
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    document.body.appendChild(modal);
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
window.syncFechaConMexico = syncFechaConMexico;
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

// Variable global para almacenar los datos del mapa actual
let currentMapaData = null;

window.exportarMapaRuta = async function(formato = 'geojson') {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    
    const vendedorUid = state.currentVendor?.uid || currentUser.uid;
    const viajeId = document.getElementById('mapa-viaje-select')?.value;
    
    try {
        let gastosConUbicacion = [];
        let nombreArchivo = 'ruta-gastos';
        let viajeInfo = null;
        
        if (viajeId) {
            const viaje = await db.get('viajes', viajeId);
            viajeInfo = viaje;
            nombreArchivo = `ruta-${viaje?.cliente || 'viaje'}-${formatDateMexico(viaje?.fechaInicio).replace(/\//g, '-')}`;
            
            const result = await db.getGastosByViaje(viajeId, { vendedorId: vendedorUid });
            const gastos = result.data || [];
            gastosConUbicacion = gastos.filter(g => g.ubicacion && g.ubicacion.lat && g.ubicacion.lng);
        } else {
            // Todos los gastos recientes
            const viajes = await db.getViajesByVendedor(vendedorUid);
            for (const viaje of viajes.slice(-5)) {
                const result = await db.getGastosByViaje(viaje.id, { vendedorId: vendedorUid });
                const gastos = result.data || [];
                const conUbicacion = gastos.filter(g => g.ubicacion && g.ubicacion.lat && g.ubicacion.lng);
                gastosConUbicacion = gastosConUbicacion.concat(conUbicacion.map(g => ({...g, viaje})));
            }
            nombreArchivo = `ruta-completa-${getMexicoDateString()}`;
        }
        
        if (gastosConUbicacion.length === 0) {
            showToast('No hay gastos con ubicación para exportar', 'warning');
            return;
        }
        
        // Guardar datos para uso en otras funciones
        currentMapaData = {
            gastos: gastosConUbicacion,
            nombreArchivo: nombreArchivo,
            viaje: viajeInfo
        };
        
        // Ordenar por fecha para calcular ruta
        gastosConUbicacion.sort((a, b) => new Date(a.fecha || a.createdAt) - new Date(b.fecha || b.createdAt));
        
        // Calcular estadísticas
        calcularYMostrarEstadisticas(gastosConUbicacion);
        
        // Exportar según formato
        switch(formato) {
            case 'kml':
                await exportarKML(gastosConUbicacion, nombreArchivo, viajeInfo);
                break;
            case 'html':
                await exportarHTML(gastosConUbicacion, nombreArchivo, viajeInfo);
                break;
            case 'geojson':
            default:
                await exportarGeoJSON(gastosConUbicacion, nombreArchivo);
                break;
        }
        
    } catch (error) {
        debug('Error exportando ruta:', error);
        showToast('Error al exportar ruta', 'error');
    }
};

// Calcular distancia entre dos puntos (fórmula de Haversine)
function calcularDistancia(lat1, lng1, lat2, lng2) {
    const R = 6371; // Radio de la Tierra en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Calcular y mostrar estadísticas de ruta
function calcularYMostrarEstadisticas(gastos) {
    const container = document.getElementById('estadisticas-ruta');
    if (!container) return;
    
    // Calcular distancia total
    let distanciaTotal = 0;
    for (let i = 0; i < gastos.length - 1; i++) {
        const actual = gastos[i];
        const siguiente = gastos[i + 1];
        distanciaTotal += calcularDistancia(
            actual.ubicacion.lat, actual.ubicacion.lng,
            siguiente.ubicacion.lat, siguiente.ubicacion.lng
        );
    }
    
    // Calcular tiempo total
    const fechas = gastos.map(g => new Date(g.fecha || g.createdAt));
    const tiempoInicio = new Date(Math.min(...fechas));
    const tiempoFin = new Date(Math.max(...fechas));
    const tiempoTotal = (tiempoFin - tiempoInicio) / (1000 * 60 * 60); // Horas
    
    // Calcular gasto total
    const totalGastos = gastos.reduce((sum, g) => sum + g.monto, 0);
    
    // Mostrar estadísticas
    document.getElementById('stat-puntos').textContent = gastos.length;
    document.getElementById('stat-distancia').textContent = distanciaTotal.toFixed(1) + ' km';
    document.getElementById('stat-tiempo').textContent = tiempoTotal.toFixed(1) + ' h';
    document.getElementById('stat-total').textContent = formatMoney(totalGastos);
    
    container.style.display = 'block';
}

// Exportar a KML (Google Earth)
async function exportarKML(gastos, nombreArchivo, viajeInfo) {
    let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
    <name>${nombreArchivo}</name>
    <description>Ruta de gastos - ${viajeInfo?.cliente || 'Viaje'}</description>
    <Style id="ruta">
        <LineStyle>
            <color>ff0000ff</color>
            <width>4</width>
        </LineStyle>
    </Style>
    <Style id="punto">
        <IconStyle>
            <Icon>
                <href>http://maps.google.com/mapfiles/kml/pushpin/ylw-pushpin.png</href>
            </Icon>
        </IconStyle>
    </Style>
    
    <!-- Línea de ruta -->
    <Placemark>
        <name>Ruta</name>
        <styleUrl>#ruta</styleUrl>
        <LineString>
            <tessellate>1</tessellate>
            <coordinates>
${gastos.map(g => `                ${g.ubicacion.lng},${g.ubicacion.lat},0`).join('\n')}
            </coordinates>
        </LineString>
    </Placemark>
    
    <!-- Puntos de gastos -->
${gastos.map((g, i) => `    <Placemark>
        <name>${i + 1}. ${TIPOS_GASTO[g.tipo]?.label || g.tipo} - ${formatMoney(g.monto)}</name>
        <description>
            <![CDATA[
                <b>Lugar:</b> ${g.lugar || 'N/A'}<br>
                <b>Monto:</b> ${formatMoney(g.monto)}<br>
                <b>Fecha:</b> ${formatDateTimeMexico(g.fecha || g.createdAt)}<br>
                <b>Folio:</b> ${g.folioFactura || 'N/A'}<br>
                <b>Tipo:</b> ${TIPOS_GASTO[g.tipo]?.label || g.tipo}
            ]]>
        </description>
        <styleUrl>#punto</styleUrl>
        <Point>
            <coordinates>${g.ubicacion.lng},${g.ubicacion.lat},0</coordinates>
        </Point>
    </Placemark>`).join('\n')}
</Document>
</kml>`;
    
    const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
    const nombreCompleto = `${nombreArchivo.replace(/[^a-zA-Z0-9-]/g, '_')}.kml`;
    
    // Guardar referencia para compartir/abrir después
    lastDownloadedFile = {
        blob: blob,
        nombreArchivo: nombreCompleto,
        tipo: 'application/vnd.google-earth.kml+xml'
    };
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nombreCompleto;
    link.click();
    
    // En móvil, mostrar modal con opción de abrir directo
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
        mostrarModalArchivoDescargado(nombreCompleto, 'kml', blob);
    } else {
        showToast('🌍 Archivo KML descargado. Ábrelo con Google Earth.', 'success');
    }
}

// Exportar a GeoJSON
async function exportarGeoJSON(gastos, nombreArchivo) {
    const geoJSON = {
        type: 'FeatureCollection',
        features: [
            // Línea de ruta
            {
                type: 'Feature',
                properties: { name: 'Ruta', type: 'route' },
                geometry: {
                    type: 'LineString',
                    coordinates: gastos.map(g => [g.ubicacion.lng, g.ubicacion.lat])
                }
            },
            // Puntos de gastos
            ...gastos.map(g => ({
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
        ]
    };
    
    const blob = new Blob([JSON.stringify(geoJSON, null, 2)], { type: 'application/json' });
    const nombreCompleto = `${nombreArchivo.replace(/[^a-zA-Z0-9-]/g, '_')}.geojson`;
    
    // Guardar referencia para compartir/abrir después
    lastDownloadedFile = {
        blob: blob,
        nombreArchivo: nombreCompleto,
        tipo: 'application/json'
    };
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nombreCompleto;
    link.click();
    
    // En móvil, mostrar modal con opciones
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
        mostrarModalArchivoDescargado(nombreCompleto, 'geojson', blob);
    } else {
        showToast('📍 Archivo GeoJSON descargado', 'success');
    }
}

// Exportar a HTML interactivo
async function exportarHTML(gastos, nombreArchivo, viajeInfo) {
    // Calcular centro del mapa
    const lats = gastos.map(g => g.ubicacion.lat);
    const lngs = gastos.map(g => g.ubicacion.lng);
    const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
    
    // Calcular distancia total
    let distanciaTotal = 0;
    for (let i = 0; i < gastos.length - 1; i++) {
        distanciaTotal += calcularDistancia(
            gastos[i].ubicacion.lat, gastos[i].ubicacion.lng,
            gastos[i + 1].ubicacion.lat, gastos[i + 1].ubicacion.lng
        );
    }
    
    const totalGastos = gastos.reduce((sum, g) => sum + g.monto, 0);
    
    let html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${nombreArchivo}</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 1.5rem; text-align: center; }
        .header h1 { margin-bottom: 0.5rem; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; max-width: 800px; margin: 1rem auto; padding: 0 1rem; }
        .stat-card { background: white; padding: 1rem; border-radius: 8px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .stat-value { font-size: 1.5rem; font-weight: bold; color: #667eea; }
        .stat-label { font-size: 0.875rem; color: #666; margin-top: 0.25rem; }
        #map { height: 60vh; margin: 1rem; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .gastos-list { max-width: 800px; margin: 1rem auto; padding: 0 1rem; }
        .gasto-item { background: white; padding: 1rem; margin-bottom: 0.5rem; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); display: flex; justify-content: space-between; align-items: center; }
        .gasto-info h4 { color: #333; margin-bottom: 0.25rem; }
        .gasto-info p { color: #666; font-size: 0.875rem; }
        .gasto-monto { font-size: 1.25rem; font-weight: bold; color: #dc2626; }
        .badge { display: inline-block; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: bold; text-transform: uppercase; }
        .footer { text-align: center; padding: 2rem; color: #666; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🗺️ ${viajeInfo?.cliente || 'Ruta de Gastos'}</h1>
        <p>${formatDateMexico(viajeInfo?.fechaInicio)} | Responsable: ${state.currentVendor?.name || 'Vendedor'}</p>
    </div>
    
    <div class="stats">
        <div class="stat-card">
            <div class="stat-value">${gastos.length}</div>
            <div class="stat-label">📍 Paradas</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${distanciaTotal.toFixed(1)} km</div>
            <div class="stat-label">📏 Distancia</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${formatMoney(totalGastos)}</div>
            <div class="stat-label">💰 Total</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${((totalGastos / distanciaTotal) || 0).toFixed(2)}</div>
            <div class="stat-label">💵 $/km</div>
        </div>
    </div>
    
    <div id="map"></div>
    
    <div class="gastos-list">
        <h2 style="margin-bottom: 1rem; color: #333;">📋 Detalle de Gastos</h2>
        ${gastos.map((g, i) => {
            const color = TIPOS_GASTO[g.tipo]?.color || '#6b7280';
            return `<div class="gasto-item">
                <div class="gasto-info">
                    <h4>${i + 1}. ${TIPOS_GASTO[g.tipo]?.label || g.tipo} - ${formatMoney(g.monto)}</h4>
                    <p>📍 ${g.lugar || 'Sin lugar'} | 🕐 ${formatDateTimeMexico(g.fecha || g.createdAt)}</p>
                </div>
                <span class="badge" style="background: ${color}20; color: ${color};">${g.tipo}</span>
            </div>`;
        }).join('')}
    </div>
    
    <div class="footer">
        <p>Generado por 3P Control de Gastos v6.0</p>
        <p>${new Date().toLocaleString('es-MX')}</p>
    </div>
    
    <script>
        // Inicializar mapa
        const map = L.map('map').setView([${centerLat}, ${centerLng}], 10);
        
        // Capa base
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(map);
        
        // Iconos personalizados
        const icons = {
            gasolina: { color: '#dc2626', icon: '⛽' },
            comida: { color: '#f59e0b', icon: '🍔' },
            hotel: { color: '#3b82f6', icon: '🏨' },
            transporte: { color: '#10b981', icon: '🚌' },
            casetas: { color: '#6366f1', icon: '🛣️' },
            otros: { color: '#6b7280', icon: '📦' }
        };
        
        // Dibujar ruta
        const routeCoords = ${JSON.stringify(gastos.map(g => [g.ubicacion.lat, g.ubicacion.lng]))};
        const polyline = L.polyline(routeCoords, { color: '#667eea', weight: 4, opacity: 0.8 }).addTo(map);
        map.fitBounds(polyline.getBounds(), { padding: [50, 50] });
        
        // Marcadores
        ${gastos.map((g, i) => {
            const tipo = g.tipo || 'otros';
            return `L.marker([${g.ubicacion.lat}, ${g.ubicacion.lng}])
                .addTo(map)
                .bindPopup('<b>${i + 1}. ${TIPOS_GASTO[tipo]?.label || tipo}</b><br>${formatMoney(g.monto)}<br>${g.lager || 'Sin lugar'}<br><small>${formatDateTimeMexico(g.fecha || g.createdAt)}</small>');`;
        }).join('\n        ')}
    </script>
</body>
</html>`;
    
    const blob = new Blob([html], { type: 'text/html' });
    const nombreCompleto = `${nombreArchivo.replace(/[^a-zA-Z0-9-]/g, '_')}.html`;
    
    // Guardar referencia para compartir/abrir después
    lastDownloadedFile = {
        blob: blob,
        nombreArchivo: nombreCompleto,
        tipo: 'text/html'
    };
    
    // Descargar
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nombreCompleto;
    link.click();
    
    // En móvil, mostrar modal con opción de abrir directo
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
        mostrarModalArchivoDescargado(nombreCompleto, 'html', blob);
    } else {
        showToast('🌐 Mapa HTML descargado. Ábrelo en cualquier navegador.', 'success');
    }
}

// Variable global para guardar el blob del último archivo descargado
let lastDownloadedFile = null;

// Modal con opciones para abrir archivo en móvil
function mostrarModalArchivoDescargado(nombreArchivo, tipo, blob = null) {
    const modal = document.createElement('div');
    modal.id = 'modal-archivo-descargado';
    modal.className = 'modal';
    modal.style.display = 'flex';
    
    let icono = tipo === 'html' ? '🌐' : tipo === 'kml' ? '🌍' : '📍';
    let descripcion = tipo === 'html' ? 
        'Es un mapa interactivo que funciona sin internet.' : 
        tipo === 'kml' ? 
        'Ábrelo con Google Earth para ver la ruta en 3D.' : 
        'Es el formato estándar para mapas.';
    
    // Botones específicos según el tipo
    let botonesExtras = '';
    
    if (tipo === 'html' && blob) {
        // Para HTML, intentar abrir directamente
        const url = URL.createObjectURL(blob);
        botonesExtras = `
            <a href="${url}" target="_blank" rel="noopener noreferrer" 
               class="btn btn-primary btn-large" 
               style="width: 100%; display: block; margin-bottom: 0.75rem; text-decoration: none;"
               onclick="setTimeout(() => URL.revokeObjectURL('${url}'), 1000);">
                🚀 Abrir Ahora (Ver Mapa)
            </a>
            <button class="btn btn-secondary" onclick="compartirArchivoDescargado()" style="width: 100%; margin-bottom: 0.75rem;">
                📤 Compartir Archivo
            </button>
        `;
    } else if (tipo === 'kml' && blob) {
        // Para KML, intentar abrir con Google Earth
        const url = URL.createObjectURL(blob);
        botonesExtras = `
            <a href="${url}" target="_blank" rel="noopener noreferrer"
               class="btn btn-primary btn-large" 
               style="width: 100%; display: block; margin-bottom: 0.75rem; text-decoration: none;"
               onclick="setTimeout(() => URL.revokeObjectURL('${url}'), 1000);">
                🌍 Intentar Abrir con Google Earth
            </a>
            <button class="btn btn-secondary" onclick="compartirArchivoDescargado()" style="width: 100%; margin-bottom: 0.75rem;">
                📤 Compartir Archivo
            </button>
        `;
    }
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px; text-align: center;">
            <div class="modal-header">
                <h3>${icono} Archivo Descargado</h3>
                <button class="btn btn-icon" onclick="document.getElementById('modal-archivo-descargado').remove()">✕</button>
            </div>
            <div style="padding: 1.5rem;">
                <p style="font-size: 2rem; margin-bottom: 1rem;">${icono}</p>
                <p style="margin-bottom: 1rem; color: #374151;">
                    <strong>${nombreArchivo}</strong>
                </p>
                <p style="font-size: 0.875rem; color: #6b7280; margin-bottom: 1.5rem;">
                    ${descripcion}
                </p>
                
                ${botonesExtras}
                
                <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 1rem; text-align: left; margin-bottom: 1.5rem; border-radius: 4px;">
                    <p style="margin: 0; font-size: 0.875rem; color: #92400e;">
                        <strong>💡 ¿No se abre?</strong><br>
                        Busca en tu carpeta <strong>"Descargas"</strong> o <strong>"Downloads"</strong> y ábrelo desde ahí.
                    </p>
                </div>
                
                <button class="btn btn-secondary" onclick="document.getElementById('modal-archivo-descargado').remove()" style="width: 100%;">
                    Cerrar
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Cerrar al hacer click fuera
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}

// Función para compartir archivo (Web Share API)
async function compartirArchivo(blob, nombreArchivo, tipo) {
    if (navigator.share && navigator.canShare) {
        const file = new File([blob], nombreArchivo, { type: tipo });
        if (navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    title: 'Ruta de Gastos',
                    text: 'Aquí está el mapa de mi ruta de gastos',
                    files: [file]
                });
                return true;
            } catch (err) {
                console.log('Compartir cancelado:', err);
            }
        }
    }
    return false;
}

// Compartir el último archivo descargado
async function compartirArchivoDescargado() {
    if (!lastDownloadedFile) {
        showToast('No hay archivo para compartir', 'warning');
        return;
    }
    
    const { blob, nombreArchivo, tipo } = lastDownloadedFile;
    const compartido = await compartirArchivo(blob, nombreArchivo, tipo);
    
    if (compartido) {
        showToast('📤 Archivo compartido', 'success');
    } else {
        showToast('Tu dispositivo no soporta compartir archivos', 'warning');
    }
}

// Abrir en geojson.io (visor online)
window.abrirEnGeojsonIO = async function() {
    // SIEMPRE recargar datos del viaje seleccionado actual
    await exportarMapaRuta('geojson');
    if (!currentMapaData) return;
    
    const gastos = currentMapaData.gastos;
    const geoJSON = {
        type: 'FeatureCollection',
        features: gastos.map(g => ({
            type: 'Feature',
            properties: {
                tipo: g.tipo,
                monto: g.monto,
                lugar: g.lugar,
                fecha: g.fecha || g.createdAt,
                markerColor: TIPOS_GASTO[g.tipo]?.color || '#6b7280'
            },
            geometry: {
                type: 'Point',
                coordinates: [g.ubicacion.lng, g.ubicacion.lat]
            }
        }))
    };
    
    // Codificar y abrir en geojson.io
    const encoded = encodeURIComponent(JSON.stringify(geoJSON));
    const url = `https://geojson.io/#data=data:application/json,${encoded}`;
    
    // En móvil, intentar abrir de diferentes formas
    const esMovil = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (esMovil) {
        // Mostrar modal con opciones
        const modal = document.createElement('div');
        modal.id = 'modal-ver-online';
        modal.className = 'modal';
        modal.style.display = 'flex';
        
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px; text-align: center;">
                <div class="modal-header">
                    <h3>🗺️ Abrir Mapa Online</h3>
                    <button class="btn btn-icon" onclick="document.getElementById('modal-ver-online').remove()">✕</button>
                </div>
                <div style="padding: 1.5rem;">
                    <p style="font-size: 3rem; margin-bottom: 1rem;">🌐</p>
                    <p style="margin-bottom: 1rem; color: #374151;">
                        El mapa se abrirá en <strong>geojson.io</strong>
                    </p>
                    <p style="font-size: 0.875rem; color: #6b7280; margin-bottom: 1.5rem;">
                        Es una página web gratuita donde podrás ver tu ruta en un mapa interactivo.
                    </p>
                    
                    <div style="background: #dbeafe; border-left: 4px solid #3b82f6; padding: 1rem; text-align: left; margin-bottom: 1.5rem; border-radius: 4px;">
                        <p style="margin: 0; font-size: 0.875rem; color: #1e40af;">
                            <strong>💡 Tip:</strong> Si se abre dentro de la app, busca el icono <strong>⋮</strong> o <strong>↗️</strong> arriba y selecciona <strong>"Abrir en navegador"</strong> para verlo mejor.
                        </p>
                    </div>
                    
                    <a href="${url}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-large" style="width: 100%; display: block; margin-bottom: 0.5rem; text-decoration: none;" onclick="document.getElementById('modal-ver-online').remove();">
                        🚀 Abrir Mapa Ahora
                    </a>
                    <button class="btn btn-secondary" onclick="document.getElementById('modal-ver-online').remove()" style="width: 100%;">
                        Cancelar
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
        
    } else {
        // En desktop, abrir directamente
        window.open(url, '_blank');
        showToast('🗺️ Abriendo mapa en geojson.io...', 'info');
    }
};

// ===== SISTEMA DE ACTUALIZACIÓN AUTOMÁTICA =====
class UpdateManager {
    constructor() {
        this.currentVersion = CONFIG.VERSION;
        this.updateAvailable = false;
        this.updateChecked = false;
        this.checkInterval = null;
    }

    // Inicializar el sistema de actualización
    init() {
        // Verificar al inicio
        this.checkForUpdate();
        
        // Configurar verificación periódica
        this.checkInterval = setInterval(() => {
            this.checkForUpdate();
        }, CONFIG.CHECK_UPDATE_INTERVAL);
        
        // Escuchar mensajes del Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data && event.data.type === 'UPDATE_AVAILABLE') {
                    this.handleUpdateAvailable(event.data.version);
                }
            });
            
            // Verificar si hay un SW esperando
            this.checkWaitingWorker();
        }
        
        debug('UpdateManager inicializado - Versión:', this.currentVersion);
    }

    // Verificar si hay nueva versión disponible
    async checkForUpdate() {
        try {
            // Obtener versión del servidor (sin caché)
            const response = await fetch('./app.js?v=' + Date.now(), {
                method: 'HEAD',
                cache: 'no-cache'
            });
            
            // También verificar el Service Worker
            if ('serviceWorker' in navigator) {
                const registration = await navigator.serviceWorker.ready;
                
                // Forzar update check
                await registration.update();
                
                // Verificar si hay un SW esperando
                if (registration.waiting) {
                    this.handleUpdateAvailable();
                }
            }
            
        } catch (error) {
            debug('Error verificando actualizaciones:', error);
        }
    }

    // Verificar si hay un worker esperando
    async checkWaitingWorker() {
        if (!('serviceWorker' in navigator)) return;
        
        const registration = await navigator.serviceWorker.ready;
        
        if (registration.waiting) {
            this.handleUpdateAvailable();
        }
        
        // Escuchar nuevos workers instalados
        registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            
            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    // Nueva versión lista
                    this.handleUpdateAvailable();
                }
            });
        });
    }

    // Manejar cuando hay una actualización disponible
    handleUpdateAvailable(serverVersion) {
        if (this.updateAvailable) return; // Ya notificamos
        
        this.updateAvailable = true;
        debug('¡Nueva versión disponible!', serverVersion || 'detectada');
        
        // Mostrar notificación de actualización
        this.showUpdateNotification();
    }

    // Mostrar notificación de actualización
    showUpdateNotification() {
        // Crear modal de actualización
        const modal = document.createElement('div');
        modal.id = 'update-modal';
        modal.className = 'modal active';
        modal.style.zIndex = '10000';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px; text-align: center;">
                <div style="font-size: 48px; margin-bottom: 1rem;">🚀</div>
                <h2>¡Nueva Versión Disponible!</h2>
                <p style="margin: 1rem 0; color: var(--gray-600);">
                    Hay una actualización de <strong>ViajesPro</strong> lista para instalar.
                </p>
                <div style="background: var(--gray-100); padding: 1rem; border-radius: var(--radius); margin: 1rem 0;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                        <span>Versión actual:</span>
                        <strong>${this.currentVersion}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; color: var(--success);">
                        <span>Nueva versión:</span>
                        <strong>${this.currentVersion.includes('6.0') ? '6.1.0' : 'Nueva'}</strong>
                    </div>
                </div>
                <p style="font-size: 0.875rem; color: var(--gray-500); margin-bottom: 1rem;">
                    📦 Incluye: Fotos organizadas por categoría, mejoras en reportes ZIP y correcciones.
                </p>
                <div style="display: flex; gap: 0.5rem;">
                    <button class="btn btn-secondary" style="flex: 1;" onclick="updateManager.postponeUpdate()">
                        ⏰ Más tarde
                    </button>
                    <button class="btn btn-primary" style="flex: 1;" onclick="updateManager.applyUpdate()">
                        🔄 Actualizar Ahora
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // También mostrar toast
        showToast('🚀 Nueva versión disponible. Toca "Actualizar" en el menú.', 'info', 10000);
    }

    // Aplicar actualización
    async applyUpdate() {
        showToast('🔄 Actualizando aplicación...', 'info');
        
        // Cerrar modal
        const modal = document.getElementById('update-modal');
        if (modal) modal.remove();
        
        // Limpiar caché y recargar
        if ('serviceWorker' in navigator) {
            const registration = await navigator.serviceWorker.ready;
            
            if (registration.waiting) {
                // Pedir al SW que se active
                registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
            
            // Recargar la página cuando el nuevo SW controle
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                window.location.reload();
            });
        }
        
        // Forzar recarga después de 2 segundos si no se activa el SW
        setTimeout(() => {
            window.location.reload(true);
        }, 2000);
    }

    // Posponer actualización
    postponeUpdate() {
        const modal = document.getElementById('update-modal');
        if (modal) modal.remove();
        
        showToast('⏰ Actualización pospuesta. Se te recordará más tarde.', 'info');
        
        // Recordar en 30 minutos
        setTimeout(() => {
            this.updateAvailable = false;
            this.checkForUpdate();
        }, 30 * 60 * 1000);
    }

    // Forzar verificación de actualización (para botón manual)
    async forceCheck() {
        showToast('🔍 Buscando actualizaciones...', 'info');
        await this.checkForUpdate();
        
        if (!this.updateAvailable) {
            showToast('✅ Tienes la última versión', 'success');
        }
    }
}

// Crear instancia global del gestor de actualizaciones
const updateManager = new UpdateManager();
window.updateManager = updateManager;

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    updateManager.init();
});

window.storageService = storageService;
window.utils = utils;

// Exponer funciones del mapa globalmente
window.cargarMapaGastos = cargarMapaGastos;

// Función de sincronización de datos (para el botón de sincronizar)
window.forceSync = async function() {
    showToast('🔄 Sincronizando datos...', 'info');
    
    try {
        // Limpiar caché de viajes y gastos
        if (typeof databaseService !== 'undefined') {
            databaseService.clearCache();
        }
        
        // Recargar datos según la pantalla actual
        if (state.currentUser?.type === 'admin') {
            await loadVendorsList();
            showToast('✅ Datos de vendedores actualizados', 'success');
        } else {
            // Recargar viajes y gastos del vendedor
            await Promise.all([
                loadViajes(),
                loadGastosList()
            ]);
            showToast('✅ Datos sincronizados correctamente', 'success');
        }
        
        // Forzar actualización desde el servidor
        if ('serviceWorker' in navigator) {
            const registration = await navigator.serviceWorker.ready;
            registration.update();
        }
        
    } catch (error) {
        console.error('Error en sincronización:', error);
        showToast('❌ Error al sincronizar: ' + error.message, 'error');
    }
};

debug('App.js v6.1.0 cargado completamente - Sistema de actualización activo');

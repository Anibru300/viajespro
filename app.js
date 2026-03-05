/**
 * 3P VIAJESPRO - Main Application v5.0 (Versión estable con offline y mejoras)
 */

// ===== CONFIGURACIÓN =====
const CONFIG = {
    ADMIN_USER: 'admin',
    ADMIN_PASS: 'admin123',
    VERSION: '5.0.0',
    APP_NAME: '3P Control de Gastos'
};

// ===== ESTADO GLOBAL =====
const state = {
    currentUser: null,
    currentVendor: null,
    currentViaje: null,
    currentGasto: null,
    tempFotos: [],
    isOnline: navigator.onLine,
    charts: {},
    filters: { viajes: 'all', gastos: '' },
    lastReport: null
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
    const now = new Date();
    return new Date(now.toLocaleString("en-US", { timeZone: "America/Mexico_City" }));
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
    console.log(`[DEBUG v5] ${msg}`, data || '');
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

// ===== COMPRESIÓN DE IMÁGENES =====
function comprimirImagen(base64, maxSizeKB = 300) {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = base64;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            const maxDimension = 1024;
            if (width > maxDimension || height > maxDimension) {
                if (width > height) {
                    height = Math.round((height * maxDimension) / width);
                    width = maxDimension;
                } else {
                    width = Math.round((width * maxDimension) / height);
                    height = maxDimension;
                }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            const compressed = canvas.toDataURL('image/jpeg', 0.7);
            const sizeKB = Math.round((compressed.length * 3) / 4 / 1024);
            if (sizeKB > maxSizeKB) {
                const quality = maxSizeKB / sizeKB;
                const moreCompressed = canvas.toDataURL('image/jpeg', quality);
                resolve(moreCompressed);
            } else {
                resolve(compressed);
            }
        };
    });
}

// ===== INICIALIZACIÓN =====
document.addEventListener('DOMContentLoaded', async () => {
    debug('DOM cargado, iniciando v5.0...');
    
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
        alert('Error al iniciar: ' + error.message);
    }
});

async function initApp() {
    debug('Iniciando app v5.0...');
    
    if (typeof db === 'undefined') {
        throw new Error('La base de datos no está cargada');
    }
    
    await db.init();
    debug('DB inicializada correctamente');
    
    checkSession();
    setupEventListeners();
    updateConnectionStatus();
    
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
    
    debug('App v5.0 iniciada correctamente');
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
        filterViajeStatus.addEventListener('change', loadViajes);
    }

    const gastosEstadoSelect = document.getElementById('gastos-estado-select');
    if (gastosEstadoSelect) {
        gastosEstadoSelect.addEventListener('change', loadGastosList);
    }

    const perfilClickeable = document.getElementById('perfil-clickeable');
    if (perfilClickeable) {
        perfilClickeable.addEventListener('click', abrirPerfil);
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
        }
        if (sectionName === 'reportes') {
            loadViajesSelect();
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

// ===== LOGIN (con soporte offline) =====
async function login() {
    debug('Iniciando login...');
    
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
        if (!navigator.onLine) {
            const savedSession = localStorage.getItem('viajespro_session');
            if (savedSession) {
                const session = JSON.parse(savedSession);
                if (session.vendor && session.vendor.username === username) {
                    state.currentUser = { username, type: 'vendor' };
                    state.currentVendor = session.vendor;
                    showToast('¡Bienvenido! (modo offline)', 'success');
                    showMainApp();
                    setLoading(btn, false);
                    return;
                }
            }
            showToast('Sin conexión a internet. No se puede verificar el usuario.', 'error');
            setLoading(btn, false);
            return;
        }
        
        debug('Buscando vendedor:', username);
        const vendor = await db.get('vendedores', username);
        debug('Vendedor encontrado:', vendor ? 'SÍ' : 'NO');
        
        if (!vendor || vendor.password !== password) {
            showToast('Usuario o contraseña incorrectos', 'error');
            setLoading(btn, false);
            return;
        }
        
        if (vendor.status === 'inactive') {
            showToast('Usuario inactivo', 'warning');
            setLoading(btn, false);
            return;
        }
        
        state.currentUser = { username, type: 'vendor' };
        state.currentVendor = vendor;
        
        if (remember) {
            localStorage.setItem('viajespro_session', JSON.stringify({
                user: state.currentUser,
                vendor: vendor,
                remember: true
            }));
        }
        
        showToast(`¡Bienvenido, ${vendor.name}!`, 'success');
        showMainApp();
        
    } catch (error) {
        debug('Error en login:', error);
        showToast('Error al iniciar sesión: ' + error.message, 'error');
    } finally {
        setLoading(btn, false);
    }
}

async function loginAdmin() {
    debug('Login admin...');
    
    const username = document.getElementById('admin-username').value;
    const password = document.getElementById('admin-password').value;
    
    if (username === CONFIG.ADMIN_USER && password === CONFIG.ADMIN_PASS) {
        state.currentUser = { username, type: 'admin' };
        showToast('Bienvenido, Administrador', 'success');
        showAdminPanel();
    } else {
        document.getElementById('admin-login-error').textContent = 'Credenciales incorrectas';
        showToast('Credenciales incorrectas', 'error');
    }
}

function checkSession() {
    debug('Verificando sesión...');
    const savedSession = localStorage.getItem('viajespro_session');
    
    if (savedSession) {
        try {
            const session = JSON.parse(savedSession);
            if (session.remember && session.user) {
                state.currentUser = session.user;
                state.currentVendor = session.vendor;
                
                if (session.user.type === 'admin') {
                    showAdminPanel();
                } else {
                    showMainApp();
                }
                return;
            }
        } catch (e) {
            localStorage.removeItem('viajespro_session');
        }
    }
    showLoginScreen();
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

function logout() {
    if (confirm('¿Cerrar sesión?')) {
        localStorage.removeItem('viajespro_session');
        state.currentUser = null;
        state.currentVendor = null;
        state.currentViaje = null;
        location.reload();
    }
}

// ===== ADMIN =====
function showAdminPanel() {
    debug('Mostrando panel admin');
    showScreen('admin-panel');
    loadVendorsList();
}

// ===== REGISTRO VENDEDOR (admin) =====
async function registerVendor() {
    debug('=== REGISTRO DE VENDEDOR ===');
    
    const nameInput = document.getElementById('new-vendor-name');
    const usernameInput = document.getElementById('new-vendor-username');
    const passwordInput = document.getElementById('new-vendor-password');
    const emailInput = document.getElementById('new-vendor-email');
    const zoneInput = document.getElementById('new-vendor-zone');
    const errorDiv = document.getElementById('register-error');
    
    if (!nameInput || !usernameInput || !passwordInput) {
        console.error('No se encontraron campos del formulario');
        return;
    }
    
    const name = nameInput.value.trim();
    const username = usernameInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    const email = emailInput ? emailInput.value.trim() : '';
    const zone = zoneInput ? zoneInput.value : 'Bajío';
    
    if (errorDiv) errorDiv.textContent = '';
    
    if (!name || !username || !password) {
        const msg = 'Nombre, usuario y contraseña son obligatorios';
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
    
    try {
        debug('Verificando si existe:', username);
        const existing = await db.get('vendedores', username);
        
        if (existing) {
            const msg = 'Este nombre de usuario ya existe';
            if (errorDiv) errorDiv.textContent = msg;
            showToast(msg, 'warning');
            return;
        }
        
        const vendor = {
            id: username,
            name: name,
            username: username,
            password: password,
            email: email,
            zone: zone,
            status: 'active',
            createdAt: new Date().toISOString(),
            createdBy: 'admin'
        };
        
        debug('Guardando vendedor:', vendor);
        await db.add('vendedores', vendor);
        
        showToast('✅ Vendedor registrado exitosamente', 'success');
        
        nameInput.value = '';
        usernameInput.value = '';
        passwordInput.value = '';
        if (emailInput) emailInput.value = '';
        
        await loadVendorsList();
        
    } catch (error) {
        debug('Error al registrar:', error);
        const msg = 'Error al registrar: ' + error.message;
        if (errorDiv) errorDiv.textContent = msg;
        showToast(msg, 'error');
    }
}

// ===== CARGAR VENDEDORES (admin) =====
let lastVendorsLoad = 0;
const VENDORS_LOAD_COOLDOWN = 2000;

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
        
        const container = document.getElementById('vendors-list');
        if (!container) {
            console.error('No se encontró container vendors-list');
            return;
        }
        
        if (vendors.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No hay vendedores registrados</p></div>';
            return;
        }
        
        container.innerHTML = vendors.map(v => `
            <div class="vendor-card" data-username="${v.username}">
                <div class="vendor-info">
                    <h4>${escapeHtml(v.name)}</h4>
                    <p>
                        <span class="vendor-status ${v.status}"></span>
                        @${escapeHtml(v.username)} • ${escapeHtml(v.zone)}
                    </p>
                </div>
                <div class="vendor-actions">
                    <button class="btn btn-small btn-primary" onclick="editVendor('${v.username}')">Editar</button>
                    <button class="btn btn-small btn-secondary" onclick="deleteVendor('${v.username}')">Eliminar</button>
                </div>
            </div>
        `).join('');
        
        debug('Lista renderizada');
        
    } catch (error) {
        debug('Error cargando vendedores:', error);
        showToast('Error al cargar vendedores: ' + error.message, 'error');
    }
}

function filterVendors() {
    const search = document.getElementById('search-vendors').value.toLowerCase();
    document.querySelectorAll('.vendor-card').forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(search) ? 'flex' : 'none';
    });
}

async function editVendor(username) {
    try {
        const vendor = await db.get('vendedores', username);
        if (!vendor) {
            showToast('Vendedor no encontrado', 'error');
            return;
        }
        
        document.getElementById('edit-vendor-id').value = vendor.id;
        document.getElementById('edit-vendor-name').value = vendor.name;
        document.getElementById('edit-vendor-username').value = vendor.username;
        document.getElementById('edit-vendor-password').value = '';
        document.getElementById('edit-vendor-email').value = vendor.email || '';
        document.getElementById('edit-vendor-zone').value = vendor.zone;
        document.getElementById('edit-vendor-status').value = vendor.status;
        
        openModal('editar-vendedor');
    } catch (error) {
        showToast('Error al cargar datos', 'error');
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

    try {
        const vendor = await db.get('vendedores', id);
        if (!vendor) {
            showToast('Vendedor no encontrado', 'error');
            return;
        }
        
        vendor.name = name;
        if (password) vendor.password = password;
        vendor.email = email;
        vendor.zone = zone;
        vendor.status = status;

        await db.update('vendedores', vendor);
        closeModal('editar-vendedor');
        showToast('✅ Vendedor actualizado', 'success');
        loadVendorsList();
    } catch (error) {
        showToast('Error al guardar: ' + error.message, 'error');
    }
}

async function deleteVendor(username) {
    if (!confirm(`¿Eliminar al vendedor ${username}?`)) return;
    
    try {
        await db.delete('vendedores', username);
        showToast('✅ Vendedor eliminado', 'success');
        loadVendorsList();
    } catch (error) {
        showToast('Error al eliminar', 'error');
    }
}

// ===== MAIN APP =====
function showMainApp() {
    showScreen('app');
    actualizarEncabezado();
    loadViajes();
}

function actualizarEncabezado() {
    const userNameEl = document.getElementById('current-user-name');
    const welcomeEl = document.getElementById('welcome-text');
    
    if (userNameEl) userNameEl.textContent = state.currentVendor?.name || 'Vendedor';
    if (welcomeEl) welcomeEl.textContent = `Hola, ${state.currentVendor?.name?.split(' ')[0] || 'Vendedor'}`;
}

// ===== PERFIL DEL VENDEDOR =====
async function abrirPerfil() {
    if (!state.currentVendor) return;
    
    const vendor = state.currentVendor;
    
    document.getElementById('perfil-nombre').value = vendor.name || '';
    document.getElementById('perfil-email').value = vendor.email || '';
    document.getElementById('perfil-zona').value = vendor.zone || 'Bajío';
    document.getElementById('perfil-usuario').value = vendor.username || '';
    document.getElementById('perfil-password').value = '';
    
    openModal('perfil');
}

async function guardarPerfil() {
    if (!state.currentVendor) return;
    
    const nombre = document.getElementById('perfil-nombre').value.trim();
    const email = document.getElementById('perfil-email').value.trim();
    const zona = document.getElementById('perfil-zona').value;
    const nuevaPassword = document.getElementById('perfil-password').value;
    
    if (!nombre) {
        showToast('El nombre no puede estar vacío', 'warning');
        return;
    }
    
    try {
        const vendor = await db.get('vendedores', state.currentVendor.username);
        if (!vendor) {
            showToast('Error al cargar tus datos', 'error');
            return;
        }
        
        vendor.name = nombre;
        vendor.email = email;
        vendor.zone = zona;
        if (nuevaPassword) {
            vendor.password = nuevaPassword;
        }
        
        await db.update('vendedores', vendor);
        
        state.currentVendor = vendor;
        const savedSession = localStorage.getItem('viajespro_session');
        if (savedSession) {
            const session = JSON.parse(savedSession);
            session.vendor = vendor;
            localStorage.setItem('viajespro_session', JSON.stringify(session));
        }
        
        actualizarEncabezado();
        closeModal('perfil');
        showToast('✅ Perfil actualizado', 'success');
    } catch (error) {
        showToast('Error al guardar: ' + error.message, 'error');
    }
}

// ===== VIAJES =====
async function loadViajes() {
    if (!state.currentVendor) return;
    
    try {
        const filter = document.getElementById('filter-viaje-status')?.value || 'all';
        let viajes = await db.getViajesByVendedor(state.currentVendor.username);
        
        if (filter !== 'all') {
            viajes = viajes.filter(v => v.estado === filter);
        }
        
        viajes.sort((a, b) => new Date(b.fechaInicio) - new Date(a.fechaInicio));
        
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
        
        const viajesConStats = await Promise.all(viajes.map(async v => {
            const gastos = await db.getGastosByViaje(v.id);
            const total = gastos.reduce((sum, g) => sum + (parseFloat(g.monto) || 0), 0);
            return { ...v, gastosCount: gastos.length, totalGastos: total };
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
        showToast('Error al cargar viajes: ' + error.message, 'error');
    }
}

async function crearViaje() {
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
    
    if (!navigator.onLine) {
        showToast('Modo offline: el viaje se guardará localmente y se sincronizará cuando haya conexión', 'info', 4000);
    }
    
    const viaje = {
        id: 'VIAJE_' + Date.now(),
        vendedorId: state.currentVendor.username,
        cliente: cliente.toUpperCase(),
        destino: destino.toUpperCase(),
        lugarVisita: lugarVisita ? lugarVisita.toUpperCase() : destino.toUpperCase(),
        objetivo: objetivo,
        responsable: state.currentVendor.name,
        zona: state.currentVendor.zone || 'Bajío',
        fechaInicio: new Date(fechaInicioInput + 'T12:00:00').toISOString(),
        fechaFin: fechaFinInput ? new Date(fechaFinInput + 'T12:00:00').toISOString() : null,
        presupuesto: presupuesto,
        estado: 'activo',
        createdAt: new Date().toISOString(),
        version: 5
    };
    
    try {
        await db.add('viajes', viaje);
        closeModal('nuevo-viaje');
        showToast('✅ Viaje creado exitosamente', 'success');
        
        document.getElementById('viaje-cliente').value = '';
        document.getElementById('viaje-destino').value = '';
        document.getElementById('viaje-lugar-visita').value = '';
        document.getElementById('viaje-objetivo').value = '';
        document.getElementById('viaje-fecha-fin').value = '';
        document.getElementById('viaje-presupuesto').value = '';
        
        loadViajes();
    } catch (error) {
        showToast('Error al crear viaje: ' + error.message, 'error');
    }
}
// ===== FUNCIÓN EDITAR VIAJE =====
async function editarViaje(viajeId) {
    try {
        const viaje = await db.get('viajes', viajeId);
        if (!viaje) {
            showToast('Viaje no encontrado', 'error');
            return;
        }

        openModal('editar-viaje');
        await new Promise(resolve => setTimeout(resolve, 100));

        const elements = {
            id: document.getElementById('edit-viaje-id'),
            cliente: document.getElementById('edit-viaje-cliente'),
            destino: document.getElementById('edit-viaje-destino'),
            lugarVisita: document.getElementById('edit-viaje-lugar-visita'),
            objetivo: document.getElementById('edit-viaje-objetivo'),
            fechaInicio: document.getElementById('edit-viaje-fecha-inicio'),
            fechaFin: document.getElementById('edit-viaje-fecha-fin'),
            presupuesto: document.getElementById('edit-viaje-presupuesto'),
            estado: document.getElementById('edit-viaje-estado')
        };

        for (const [key, el] of Object.entries(elements)) {
            if (!el) {
                console.error(`Elemento faltante: edit-viaje-${key}`);
                showToast('Error en el formulario de edición', 'error');
                closeModal('editar-viaje');
                return;
            }
        }

        elements.id.value = viaje.id;
        elements.cliente.value = viaje.cliente;
        elements.destino.value = viaje.destino;
        elements.lugarVisita.value = viaje.lugarVisita || '';
        elements.objetivo.value = viaje.objetivo || '';
        elements.fechaInicio.value = viaje.fechaInicio ? viaje.fechaInicio.split('T')[0] : '';
        elements.fechaFin.value = viaje.fechaFin ? viaje.fechaFin.split('T')[0] : '';
        elements.presupuesto.value = viaje.presupuesto || '';
        elements.estado.value = viaje.estado || 'activo';

    } catch (error) {
        console.error('Error en editarViaje:', error);
        showToast('Error al cargar viaje: ' + error.message, 'error');
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
    const presupuesto = parseFloat(document.getElementById('edit-viaje-presupuesto').value) || null;
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
        viaje.presupuesto = presupuesto;
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
    
    try {
        const gastos = await db.getGastosByViaje(viajeId);
        for (const gasto of gastos) {
            await db.delete('gastos', gasto.id);
        }
        await db.delete('viajes', viajeId);
        showToast('✅ Viaje eliminado', 'success');
        loadViajes();
    } catch (error) {
        showToast('Error al eliminar: ' + error.message, 'error');
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
    if (!state.currentVendor) return;
    
    try {
        const viajes = await db.getViajesByVendedor(state.currentVendor.username);
        const activos = viajes.filter(v => v.estado === 'activo');
        const todos = viajes;
        
        const selects = [
            { id: 'captura-viaje-select', lista: activos, defaultOption: 'Elige un viaje activo...' },
            { id: 'gastos-viaje-select', lista: todos, defaultOption: 'Todos los viajes' }
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
    state.currentGasto = null;
    
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
    
    const btnGuardar = document.querySelector('#captura-section .btn-primary.btn-large');
    if (btnGuardar) btnGuardar.textContent = '💾 GUARDAR GASTO';
}

async function guardarGasto() {
    const viajeId = document.getElementById('captura-viaje-select').value;
    const tipoCard = document.querySelector('.tipo-card.selected');
    const monto = parseFloat(document.getElementById('monto-gasto').value) || 0;
    const lugar = document.getElementById('lugar-gasto').value.trim();
    const fecha = document.getElementById('fecha-gasto').value;
    const folioFactura = document.getElementById('folio-factura')?.value.trim() || '';
    const razonSocial = document.getElementById('razon-social')?.value.trim() || '';
    const comentarios = document.getElementById('comentarios-gasto')?.value.trim() || '';
    const esFacturable = document.getElementById('es-facturable')?.checked !== false;
    
    // Validación: si NO es facturable, debe tener comentario
    if (!esFacturable && !comentarios) {
        showToast('⚠️ Debes explicar por qué no es facturable en los comentarios', 'warning');
        const comentariosEl = document.getElementById('comentarios-gasto');
        if (comentariosEl) {
            comentariosEl.focus();
            comentariosEl.style.borderColor = '#dc2626';
        }
        return;
    } else {
        const comentariosEl = document.getElementById('comentarios-gasto');
        if (comentariosEl) comentariosEl.style.borderColor = '';
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

    // Verificar tamaño de fotos
    let totalSize = 0;
    state.tempFotos.forEach(foto => {
        totalSize += (foto.length * 3) / 4; // aprox bytes
    });
    if (totalSize > 900 * 1024) { // 900 KB
        showToast('Las fotos son demasiado grandes. Intenta con menos imágenes o comprime manualmente.', 'error');
        return;
    }
    
    if (!navigator.onLine) {
        showToast('Modo offline: el gasto se guardará localmente y se sincronizará cuando haya conexión', 'info', 4000);
    }
    
    const esEdicion = state.currentGasto !== null;
    
    const gastoData = {
        viajeId,
        vendedorId: state.currentVendor.username,
        tipo: tipoCard.dataset.tipo,
        monto: monto,
        lugar,
        fecha: fecha || new Date().toISOString(),
        folioFactura,
        razonSocial,
        comentarios,
        esFacturable,
        fotos: state.tempFotos,
        editable: true,
        updatedAt: new Date().toISOString()
    };
    
    try {
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
        
        resetCapturaForm();
        
        if (document.getElementById('gastos-section')?.classList.contains('active')) {
            loadGastosList();
        }
        
    } catch (error) {
        console.error('Error al guardar gasto:', error);
        showToast('Error al guardar: ' + error.message, 'error');
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

async function loadGastosList() {
    try {
        const estadoFiltro = document.getElementById('gastos-estado-select')?.value || 'all';
        const viajeId = document.getElementById('gastos-viaje-select')?.value;
        
        let gastos = [];
        const viajes = await db.getViajesByVendedor(state.currentVendor.username);
        
        for (const viaje of viajes) {
            const g = await db.getGastosByViaje(viaje.id);
            gastos = gastos.concat(g.map(item => ({...item, viaje})));
        }
        
        if (estadoFiltro !== 'all') {
            gastos = gastos.filter(g => g.viaje?.estado === estadoFiltro);
        }
        
        if (viajeId) {
            gastos = gastos.filter(g => g.viajeId === viajeId);
        }
        
        gastos.sort((a, b) => new Date(b.fecha || b.createdAt) - new Date(a.fecha || a.createdAt));
        
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
                    </div>
                </div>
                <div class="gasto-amount">${formatMoney(g.monto)}</div>
            </div>
        `).join('');
        
    } catch (error) {
        showToast('Error al cargar gastos: ' + error.message, 'error');
    }
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
    
    try {
        const viajes = await db.getViajesByVendedor(state.currentVendor.username);
        let allGastos = [];
        
        for (const viaje of viajes) {
            const gastos = await db.getGastosByViaje(viaje.id);
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

// ===== GENERAR EXCEL CON FORMATO USANDO EXCELJS =====
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

// ===== GENERAR CORTE COMPLETO =====
async function generarCorteCompleto() {
    if (!state.lastReport) {
        showToast('Primero genera un reporte', 'warning');
        return;
    }

    showToast('🔄 Preparando corte completo...', 'info');

    const { gastos, fechaInicio, fechaFin, responsable, total, totalFacturable, zona = '' } = state.lastReport;

    const zip = new JSZip();

    // Generar Excel con formato
    const workbook = new ExcelJS.Workbook();
    workbook.creator = '3P Control de Gastos';
    const worksheet = workbook.addWorksheet('Reporte');

    worksheet.mergeCells('A1:I1');
    worksheet.getCell('A1').value = '3P SA DE CV';
    worksheet.getCell('A1').font = { size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };

    worksheet.mergeCells('A2:I2');
    worksheet.getCell('A2').value = 'Reporte de Viáticos y Gastos de Viaje';
    worksheet.getCell('A2').font = { size: 14, color: { argb: 'FFFFFFFF' } };
    worksheet.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    worksheet.getCell('A2').alignment = { horizontal: 'center' };

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

    const headers = ['Fecha', 'Cliente', 'Lugar de Visita', 'Tipo Gasto', 'Folio Factura', 'Razón Social', 'Total', 'Facturable', 'Comentarios'];
    const headerRow = worksheet.getRow(7);
    headers.forEach((h, i) => {
        const cell = headerRow.getCell(i+1);
        cell.value = h;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
        cell.alignment = { horizontal: 'center' };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

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

    const excelBuffer = await workbook.xlsx.writeBuffer();
    zip.file(`Reporte_${fechaInicio}_a_${fechaFin}.xlsx`, excelBuffer);

    const facturasFolder = zip.folder('facturas_y_fotos');

    for (const gasto of gastos) {
        if (gasto.fotos && gasto.fotos.length > 0) {
            const folio = gasto.folioFactura ? gasto.folioFactura : 'sin_folio';
            const viajeNombre = (gasto.viaje?.cliente || 'viaje') + '_' + (gasto.viaje?.destino || 'desconocido');
            const nombreBase = `${folio}_${viajeNombre}`.replace(/[^a-zA-Z0-9_\-]/g, '_');

            gasto.fotos.forEach((fotoData, idx) => {
                const base64Data = fotoData.split(',')[1];
                if (base64Data) {
                    const nombreArchivo = `${nombreBase}_${idx + 1}.png`;
                    facturasFolder.file(nombreArchivo, base64Data, { base64: true });
                }
            });
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

// ===== MANEJO DEL BOTÓN DE RETROCESO =====
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
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        const compressed = await comprimirImagen(e.target.result, 300);
        state.tempFotos.push(compressed);
        
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
    };
    reader.readAsDataURL(file);
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

// Exponer funciones globalmente
window.showAdminLogin = showAdminLogin;
window.backToLogin = backToLogin;
window.login = login;
window.loginAdmin = loginAdmin;
window.logout = logout;
window.registerVendor = registerVendor;
window.loadVendorsList = loadVendorsList;
window.filterVendors = filterVendors;
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

debug('App.js v5.0 cargado completamente');

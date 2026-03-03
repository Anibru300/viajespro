/**
 * 3P VIAJESPRO - Main Application v2.0 (DEBUG VERSION)
 */

// ===== CONFIGURACIÓN =====
const CONFIG = {
    ADMIN_USER: 'admin',
    ADMIN_PASS: 'admin123',
    VERSION: '2.0.0',
    APP_NAME: '3P ViajesPro'
};

// ===== ESTADO GLOBAL =====
const state = {
    currentUser: null,
    currentVendor: null,
    currentViaje: null,
    tempFotos: [],
    tempLocation: null,
    isOnline: navigator.onLine,
    charts: {},
    filters: {
        viajes: 'all',
        gastos: ''
    }
};

// ===== ICONOS POR TIPO DE GASTO =====
const TIPOS_GASTO = {
    gasolina: { icon: '⛽', color: '#dc2626', label: 'Gasolina' },
    comida: { icon: '🍔', color: '#f59e0b', label: 'Comida' },
    hotel: { icon: '🏨', color: '#3b82f6', label: 'Hotel' },
    transporte: { icon: '🚌', color: '#10b981', label: 'Transporte' },
    casetas: { icon: '🛣️', color: '#6366f1', label: 'Casetas' },
    otros: { icon: '📦', color: '#6b7280', label: 'Otros' }
};

// Función de log para depuración
function debug(msg, data) {
    console.log(`[DEBUG] ${msg}`, data || '');
}

// ===== INICIALIZACIÓN =====
document.addEventListener('DOMContentLoaded', async () => {
    debug('DOM cargado, iniciando...');
    
    // Mostrar splash screen
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
    debug('Iniciando app...');
    
    try {
        // Verificar que db existe
        if (typeof db === 'undefined') {
            throw new Error('La base de datos no está cargada. Verifica que db.js se cargó antes que app.js');
        }
        
        debug('Inicializando DB...');
        await db.init();
        debug('DB inicializada correctamente');
        
        checkSession();
        setupEventListeners();
        updateConnectionStatus();
        
        // Establecer fechas por defecto
        const today = new Date().toISOString().split('T')[0];
        const fechaInicio = document.getElementById('viaje-fecha-inicio');
        const fechaGasto = document.getElementById('fecha-gasto');
        
        if (fechaInicio) fechaInicio.value = today;
        if (fechaGasto) fechaGasto.value = new Date().toISOString().slice(0, 16);
        
        // Configurar fechas de reporte
        const reporteInicio = document.getElementById('reporte-fecha-inicio');
        const reporteFin = document.getElementById('reporte-fecha-fin');
        
        if (reporteInicio) {
            const firstDay = new Date();
            firstDay.setDate(1);
            reporteInicio.value = firstDay.toISOString().split('T')[0];
        }
        if (reporteFin) reporteFin.value = today;
        
        debug('App iniciada correctamente');
        
    } catch (error) {
        debug('Error en initApp:', error);
        throw error;
    }
}

function setupEventListeners() {
    debug('Configurando event listeners...');
    
    // Online/Offline
    window.addEventListener('online', () => updateConnectionStatus(true));
    window.addEventListener('offline', () => updateConnectionStatus(false));
    
    // Camera input
    const cameraInput = document.getElementById('camera-input');
    if (cameraInput) {
        cameraInput.addEventListener('change', handlePhotoCapture);
    }
    
    // Cerrar modales al hacer click fuera
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
    
    debug('Event listeners configurados');
}

// ===== NAVEGACIÓN Y UI =====
function showScreen(screenId) {
    debug('Cambiando a pantalla:', screenId);
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.add('hidden');
    });
    const screen = document.getElementById(screenId);
    if (screen) {
        screen.classList.remove('hidden');
    } else {
        debug('ERROR: No se encontró pantalla:', screenId);
    }
}

function showSection(sectionName) {
    debug('Mostrando sección:', sectionName);
    
    // Actualizar navegación
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.section === sectionName) {
            btn.classList.add('active');
        }
    });
    
    // Mostrar sección
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    const sectionEl = document.getElementById(`${sectionName}-section`);
    if (sectionEl) {
        sectionEl.classList.add('active');
        
        // Cargar datos específicos
        if (sectionName === 'viajes') loadViajes();
        if (sectionName === 'gastos') {
            loadViajesSelect();
            loadGastosList();
        }
        if (sectionName === 'captura') loadViajesSelect();
        if (sectionName === 'reportes') {
            loadViajesSelect();
        }
    }
}

function showAdminTab(tabName) {
    debug('Mostrando tab admin:', tabName);
    
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

// ===== LOGIN =====
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
    debug('Mostrando login');
    showScreen('login-screen');
}

function showAdminLogin() {
    debug('Mostrando admin login');
    showScreen('admin-login-screen');
}

function backToLogin() {
    debug('Volviendo a login');
    showLoginScreen();
}

async function login() {
    debug('Iniciando login...');
    
    const username = document.getElementById('login-username').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;
    const remember = document.getElementById('remember-me').checked;
    const btn = document.querySelector('#login-form .btn-primary');
    
    debug('Usuario:', username);
    
    if (!username || !password) {
        showToast('Ingresa usuario y contraseña', 'warning');
        return;
    }
    
    setLoading(btn, true);
    
    try {
        debug('Buscando vendedor en DB...');
        const vendor = await db.get('vendedores', username);
        debug('Vendedor encontrado:', vendor);
        
        if (!vendor || vendor.password !== password) {
            showToast('Usuario o contraseña incorrectos', 'error');
            setLoading(btn, false);
            return;
        }
        
        if (vendor.status === 'inactive') {
            showToast('Usuario inactivo. Contacta al administrador', 'warning');
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
    const errorEl = document.getElementById('admin-login-error');
    
    if (username === CONFIG.ADMIN_USER && password === CONFIG.ADMIN_PASS) {
        state.currentUser = { username, type: 'admin' };
        showToast('Bienvenido, Administrador', 'success');
        showAdminPanel();
    } else {
        errorEl.textContent = 'Credenciales incorrectas';
        showToast('Credenciales incorrectas', 'error');
    }
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

// ===== ADMIN PANEL =====
function showAdminPanel() {
    debug('Mostrando panel admin');
    showScreen('admin-panel');
    loadVendorsList();
}

async function registerVendor() {
    debug('=== INICIANDO REGISTRO DE VENDEDOR ===');
    
    try {
        // Obtener elementos
        const nameInput = document.getElementById('new-vendor-name');
        const usernameInput = document.getElementById('new-vendor-username');
        const passwordInput = document.getElementById('new-vendor-password');
        const emailInput = document.getElementById('new-vendor-email');
        const zoneInput = document.getElementById('new-vendor-zone');
        const errorDiv = document.getElementById('register-error');
        
        debug('Elementos del DOM:', {
            nameInput: !!nameInput,
            usernameInput: !!usernameInput,
            passwordInput: !!passwordInput,
            emailInput: !!emailInput,
            zoneInput: !!zoneInput,
            errorDiv: !!errorDiv
        });
        
        if (!nameInput || !usernameInput || !passwordInput) {
            throw new Error('No se encontraron los campos del formulario');
        }
        
        const name = nameInput.value.trim();
        const username = usernameInput.value.trim().toLowerCase();
        const password = passwordInput.value;
        const email = emailInput.value.trim();
        const zone = zoneInput ? zoneInput.value : 'Centro';
        
        debug('Valores:', { name, username, email, zone, passwordLength: password?.length });
        
        if (errorDiv) errorDiv.textContent = '';
        
        // Validaciones
        if (!name || !username || !password) {
            const msg = 'Nombre, usuario y contraseña son obligatorios';
            debug('VALIDACIÓN FALLIDA:', msg);
            if (errorDiv) errorDiv.textContent = msg;
            showToast(msg, 'warning');
            return;
        }
        
        if (!/^[a-z0-9.]+$/.test(username)) {
            const msg = 'Usuario solo puede contener letras minúsculas, números y puntos';
            debug('VALIDACIÓN FALLIDA:', msg);
            if (errorDiv) errorDiv.textContent = msg;
            showToast(msg, 'warning');
            return;
        }
        
        // Verificar si existe
        debug('Verificando si el usuario existe...');
        const existing = await db.get('vendedores', username);
        debug('Usuario existente:', existing);
        
        if (existing) {
            const msg = 'Este nombre de usuario ya existe';
            debug('VALIDACIÓN FALLIDA:', msg);
            if (errorDiv) errorDiv.textContent = msg;
            showToast(msg, 'warning');
            return;
        }
        
        // Crear vendedor
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
        
        debug('Vendedor guardado exitosamente');
        
        showToast('✅ Vendedor registrado exitosamente', 'success');
        
        // Limpiar formulario
        nameInput.value = '';
        usernameInput.value = '';
        passwordInput.value = '';
        if (emailInput) emailInput.value = '';
        
        await loadVendorsList();
        
    } catch (error) {
        debug('ERROR EN REGISTRO:', error);
        console.error('Error completo:', error);
        
        const errorDiv = document.getElementById('register-error');
        const msg = 'Error al registrar: ' + error.message;
        
        if (errorDiv) errorDiv.textContent = msg;
        showToast(msg, 'error');
        
        // Mostrar alert para errores críticos
        alert('Error al registrar vendedor:\n' + error.message + '\n\nRevisa la consola (F12) para más detalles.');
    }
    
    debug('=== FIN REGISTRO ===');
}

async function loadVendorsList() {
    debug('Cargando lista de vendedores...');
    
    try {
        const vendors = await db.getAll('vendedores');
        debug('Vendedores encontrados:', vendors.length);
        
        const container = document.getElementById('vendors-list');
        if (!container) {
            debug('ERROR: No se encontró contenedor vendors-list');
            return;
        }
        
        if (vendors.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No hay vendedores registrados</p></div>';
            return;
        }
        
        container.innerHTML = vendors.map(v => `
            <div class="vendor-card" data-username="${v.username}">
                <div class="vendor-info">
                    <h4>${v.name}</h4>
                    <p>
                        <span class="vendor-status ${v.status}"></span>
                        @${v.username} • ${v.zone}
                    </p>
                </div>
                <div class="vendor-actions">
                    <button class="btn btn-small btn-primary" onclick="editVendor('${v.username}')">Editar</button>
                    <button class="btn btn-small btn-secondary" onclick="deleteVendor('${v.username}')">Eliminar</button>
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

async function editVendor(username) {
    debug('Editando vendedor:', username);
    
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
        debug('Error editando vendedor:', error);
        showToast('Error al cargar datos', 'error');
    }
}

async function saveVendorChanges() {
    debug('Guardando cambios de vendedor...');
    
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
        vendor.updatedAt = new Date().toISOString();

        await db.update('vendedores', vendor);
        closeModal('editar-vendedor');
        showToast('✅ Vendedor actualizado', 'success');
        loadVendorsList();
    } catch (error) {
        debug('Error guardando cambios:', error);
        showToast('Error al guardar', 'error');
    }
}

async function deleteVendor(username) {
    if (!confirm(`¿Eliminar al vendedor ${username}?\n\nEsta acción no se puede deshacer.`)) return;
    
    try {
        await db.delete('vendedores', username);
        showToast('✅ Vendedor eliminado', 'success');
        loadVendorsList();
    } catch (error) {
        debug('Error eliminando vendedor:', error);
        showToast('Error al eliminar', 'error');
    }
}

// ===== MAIN APP =====
function showMainApp() {
    debug('Mostrando app principal');
    showScreen('app');
    
    const userNameEl = document.getElementById('current-user-name');
    const welcomeEl = document.getElementById('welcome-text');
    
    if (userNameEl) userNameEl.textContent = state.currentVendor?.name || 'Vendedor';
    if (welcomeEl) welcomeEl.textContent = `Hola, ${state.currentVendor?.name?.split(' ')[0] || 'Vendedor'}`;
    
    loadViajes();
}

// ===== VIAJES =====
async function loadViajes() {
    debug('Cargando viajes...');
    
    if (!state.currentVendor) {
        debug('ERROR: No hay vendedor actual');
        return;
    }
    
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
                    <p>${filter === 'all' ? 'No tienes viajes registrados' : 'No hay viajes en este estado'}</p>
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
                        <div class="viaje-title">${v.destino}</div>
                        <div class="viaje-proposito">${v.proposito || 'Sin propósito especificado'}</div>
                    </div>
                    <span class="viaje-badge ${v.estado}">${v.estado}</span>
                </div>
                <div class="viaje-meta">
                    <span>📅 ${formatDate(v.fechaInicio)}</span>
                    ${v.fechaFin ? `<span>🏁 ${formatDate(v.fechaFin)}</span>` : ''}
                </div>
                <div class="viaje-stats">
                    <div class="viaje-stat">
                        <span>🧾</span>
                        <span>${v.gastosCount} gastos</span>
                    </div>
                    <div class="viaje-stat">
                        <span>💰</span>
                        <span>${formatMoney(v.totalGastos)}</span>
                    </div>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        debug('Error cargando viajes:', error);
        showToast('Error al cargar viajes', 'error');
    }
}

async function crearViaje() {
    debug('Creando viaje...');
    
    const destino = document.getElementById('viaje-destino').value.trim();
    const proposito = document.getElementById('viaje-proposito').value.trim();
    const fechaInicio = document.getElementById('viaje-fecha-inicio').value;
    const fechaFin = document.getElementById('viaje-fecha-fin').value;
    const presupuesto = document.getElementById('viaje-presupuesto').value;
    
    if (!destino || !fechaInicio) {
        showToast('Destino y fecha de inicio son obligatorios', 'warning');
        return;
    }
    
    const viaje = {
        id: 'VIAJE_' + Date.now(),
        vendedorId: state.currentVendor.username,
        destino: destino,
        proposito: proposito,
        fechaInicio: fechaInicio,
        fechaFin: fechaFin || null,
        presupuesto: presupuesto ? parseFloat(presupuesto) : null,
        estado: 'activo',
        createdAt: new Date().toISOString()
    };
    
    try {
        await db.add('viajes', viaje);
        closeModal('nuevo-viaje');
        showToast('✅ Viaje creado exitosamente', 'success');
        
        document.getElementById('viaje-destino').value = '';
        document.getElementById('viaje-proposito').value = '';
        document.getElementById('viaje-fecha-fin').value = '';
        document.getElementById('viaje-presupuesto').value = '';
        
        loadViajes();
    } catch (error) {
        debug('Error creando viaje:', error);
        showToast('Error al crear viaje', 'error');
    }
}

function selectViaje(viajeId) {
    debug('Seleccionando viaje:', viajeId);
    state.currentViaje = viajeId;
    showSection('gastos');
    const select = document.getElementById('gastos-viaje-select');
    if (select) select.value = viajeId;
    loadGastosList();
}

// ===== GASTOS =====
async function loadViajesSelect() {
    debug('Cargando select de viajes...');
    
    if (!state.currentVendor) return;
    
    try {
        const viajes = await db.getViajesByVendedor(state.currentVendor.username);
        const activos = viajes.filter(v => v.estado === 'activo');
        
        const selects = ['captura-viaje-select', 'gastos-viaje-select'];
        
        selects.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (!select) return;
            
            const currentValue = select.value;
            const defaultOption = selectId === 'captura-viaje-select' ? 
                '<option value="">Elige un viaje activo...</option>' :
                '<option value="">Todos los viajes</option>';
            
            select.innerHTML = defaultOption + activos.map(v => 
                `<option value="${v.id}">${v.destino} (${formatDate(v.fechaInicio)})</option>`
            ).join('');
            
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

async function guardarGasto() {
    debug('Guardando gasto...');
    
    const viajeId = document.getElementById('captura-viaje-select').value;
    const tipoCard = document.querySelector('.tipo-card.selected');
    const monto = document.getElementById('monto-gasto').value;
    const lugar = document.getElementById('lugar-gasto').value.trim();
    const fecha = document.getElementById('fecha-gasto').value;
    
    if (!viajeId) {
        showToast('Selecciona un viaje', 'warning');
        return;
    }
    
    if (!tipoCard) {
        showToast('Selecciona el tipo de gasto', 'warning');
        return;
    }
    
    if (!monto || parseFloat(monto) <= 0) {
        showToast('Ingresa un monto válido', 'warning');
        return;
    }
    
    const gasto = {
        id: 'GASTO_' + Date.now(),
        viajeId: viajeId,
        vendedorId: state.currentVendor.username,
        tipo: tipoCard.dataset.tipo,
        monto: parseFloat(monto),
        lugar: lugar,
        fecha: fecha || new Date().toISOString(),
        fotos: state.tempFotos,
        createdAt: new Date().toISOString()
    };
    
    try {
        await db.add('gastos', gasto);
        
        document.getElementById('monto-gasto').value = '';
        document.getElementById('lugar-gasto').value = '';
        document.querySelectorAll('.tipo-card').forEach(b => b.classList.remove('selected'));
        
        state.tempFotos = [];
        const preview = document.getElementById('photo-preview');
        if (preview) {
            preview.innerHTML = `
                <span class="upload-icon">📷</span>
                <span class="upload-text">Toca para capturar foto</span>
            `;
        }
        
        showToast('✅ Gasto guardado exitosamente', 'success');
        
        if (document.getElementById('gastos-section').classList.contains('active')) {
            loadGastosList();
        }
        
    } catch (error) {
        debug('Error guardando gasto:', error);
        showToast('Error al guardar gasto', 'error');
    }
}

async function loadGastosList() {
    debug('Cargando gastos...');
    
    try {
        const viajeId = document.getElementById('gastos-viaje-select')?.value;
        let gastos = [];
        
        if (viajeId) {
            gastos = await db.getGastosByViaje(viajeId);
        } else if (state.currentVendor) {
            const viajes = await db.getViajesByVendedor(state.currentVendor.username);
            for (const viaje of viajes) {
                const g = await db.getGastosByViaje(viaje.id);
                gastos = gastos.concat(g.map(item => ({...item, viajeDestino: viaje.destino})));
            }
        }
        
        gastos.sort((a, b) => new Date(b.fecha || b.createdAt) - new Date(a.fecha || a.createdAt));
        
        const resumen = { total: 0, porTipo: {} };
        gastos.forEach(g => {
            resumen.total += g.monto;
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
                        <span class="label">Total Gastado</span>
                        <span class="amount">${formatMoney(resumen.total)}</span>
                    </div>
                    <div class="resumen-grid">
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
                        <h4>${TIPOS_GASTO[g.tipo]?.label || g.tipo}</h4>
                        <p>${g.lugar || 'Sin lugar'} • ${formatDate(g.fecha || g.createdAt)}</p>
                        ${g.viajeDestino ? `<p style="color: var(--primary); font-size: 0.7rem;">🚗 ${g.viajeDestino}</p>` : ''}
                    </div>
                </div>
                <div class="gasto-amount">${formatMoney(g.monto)}</div>
            </div>
        `).join('');
        
    } catch (error) {
        debug('Error cargando gastos:', error);
        showToast('Error al cargar gastos', 'error');
    }
}

async function showDetalleGasto(gastoId) {
    debug('Mostrando detalle gasto:', gastoId);
    
    try {
        const gasto = await db.get('gastos', gastoId);
        if (!gasto) return;
        
        const viaje = await db.get('viajes', gasto.viajeId);
        
        const content = document.getElementById('detalle-gasto-content');
        content.innerHTML = `
            <div style="text-align: center; margin-bottom: 1.5rem;">
                <div style="font-size: 3rem; margin-bottom: 0.5rem;">${TIPOS_GASTO[gasto.tipo]?.icon || '📦'}</div>
                <h2 style="color: var(--primary); font-size: 2rem; margin-bottom: 0.5rem;">${formatMoney(gasto.monto)}</h2>
                <p style="color: var(--gray-500);">${TIPOS_GASTO[gasto.tipo]?.label || gasto.tipo}</p>
            </div>
            
            <div style="background: var(--gray-50); padding: 1rem; border-radius: var(--radius-lg); margin-bottom: 1rem;">
                <div style="margin-bottom: 0.75rem;">
                    <span style="color: var(--gray-500); font-size: 0.875rem;">📍 Lugar:</span>
                    <p style="font-weight: 600;">${gasto.lugar || 'No especificado'}</p>
                </div>
                <div style="margin-bottom: 0.75rem;">
                    <span style="color: var(--gray-500); font-size: 0.875rem;">📅 Fecha:</span>
                    <p style="font-weight: 600;">${formatDateTime(gasto.fecha || gasto.createdAt)}</p>
                </div>
                <div>
                    <span style="color: var(--gray-500); font-size: 0.875rem;">🚗 Viaje:</span>
                    <p style="font-weight: 600;">${viaje?.destino || 'Desconocido'}</p>
                </div>
            </div>
            
            ${gasto.fotos && gasto.fotos.length > 0 ? `
                <div style="margin-bottom: 1rem;">
                    <p style="color: var(--gray-500); font-size: 0.875rem; margin-bottom: 0.5rem;">📷 Fotos:</p>
                    <div style="display: flex; gap: 0.5rem; overflow-x: auto;">
                        ${gasto.fotos.map(foto => `
                            <img src="${foto}" style="height: 100px; border-radius: var(--radius); object-fit: cover;">
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            <button class="btn btn-danger btn-large" onclick="eliminarGasto('${gasto.id}')">🗑️ Eliminar Gasto</button>
        `;
        
        openModal('detalle-gasto');
    } catch (error) {
        debug('Error mostrando detalle:', error);
    }
}

async function eliminarGasto(gastoId) {
    if (!confirm('¿Eliminar este gasto?')) return;
    
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
    debug('Generando reporte...');
    
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
            allGastos = allGastos.concat(gastosFiltrados);
        }
        
        if (allGastos.length === 0) {
            showToast('No hay gastos en el período seleccionado', 'warning');
            return;
        }
        
        const porTipo = {};
        const porMes = {};
        let total = 0;
        
        allGastos.forEach(g => {
            total += g.monto;
            porTipo[g.tipo] = (porTipo[g.tipo] || 0) + g.monto;
            
            const mes = new Date(g.fecha || g.createdAt).toLocaleString('es-MX', { month: 'short', year: '2-digit' });
            porMes[mes] = (porMes[mes] || 0) + g.monto;
        });
        
        document.getElementById('reporte-resultado').classList.remove('hidden');
        
        // Gráfico de pastel
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
                    legend: {
                        position: 'bottom',
                        labels: { padding: 15, font: { size: 11 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = formatMoney(context.raw);
                                const percentage = ((context.raw / total) * 100).toFixed(1);
                                return `${label}: ${value} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
        
        // Gráfico de tendencia
        const ctx2 = document.getElementById('trend-chart').getContext('2d');
        if (state.charts.line) state.charts.line.destroy();
        
        const mesesOrdenados = Object.keys(porMes).sort((a, b) => {
            const dateA = new Date(a);
            const dateB = new Date(b);
            return dateA - dateB;
        });
        
        state.charts.line = new Chart(ctx2, {
            type: 'line',
            data: {
                labels: mesesOrdenados,
                datasets: [{
                    label: 'Gastos por mes',
                    data: mesesOrdenados.map(m => porMes[m]),
                    borderColor: '#dc2626',
                    backgroundColor: 'rgba(220, 38, 38, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: '#dc2626'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        }
                    }
                }
            }
        });
        
        state.lastReport = {
            fechaInicio,
            fechaFin,
            total,
            porTipo,
            porMes,
            gastos: allGastos
        };
        
    } catch (error) {
        debug('Error generando reporte:', error);
        showToast('Error al generar reporte', 'error');
    }
}

async function loadGlobalReport() {
    debug('Cargando reporte global...');
    
    try {
        const allGastos = await db.getAll('gastos');
        const allViajes = await db.getAll('viajes');
        const allVendors = await db.getAll('vendedores');
        
        const stats = {
            totalGastos: allGastos.reduce((sum, g) => sum + g.monto, 0),
            totalViajes: allViajes.length,
            totalVendedores: allVendors.length,
            promedioPorViaje: allViajes.length ? allGastos.reduce((sum, g) => sum + g.monto, 0) / allViajes.length : 0
        };
        
        const statsContainer = document.getElementById('admin-stats');
        if (statsContainer) {
            statsContainer.innerHTML = `
                <div class="stat-card">
                    <span class="stat-value">${formatMoney(stats.totalGastos)}</span>
                    <span class="stat-label">Total Gastos</span>
                </div>
                <div class="stat-card">
                    <span class="stat-value">${stats.totalViajes}</span>
                    <span class="stat-label">Viajes</span>
                </div>
                <div class="stat-card">
                    <span class="stat-value">${stats.totalVendedores}</span>
                    <span class="stat-label">Vendedores</span>
                </div>
                <div class="stat-card">
                    <span class="stat-value">${formatMoney(stats.promedioPorViaje)}</span>
                    <span class="stat-label">Promedio/Viaje</span>
                </div>
            `;
        }
        
        const porTipo = {};
        allGastos.forEach(g => {
            porTipo[g.tipo] = (porTipo[g.tipo] || 0) + g.monto;
        });
        
        const ctx = document.getElementById('global-chart').getContext('2d');
        if (state.charts.global) state.charts.global.destroy();
        
        state.charts.global = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(porTipo).map(t => TIPOS_GASTO[t]?.label || t),
                datasets: [{
                    label: 'Monto por categoría',
                    data: Object.values(porTipo),
                    backgroundColor: Object.keys(porTipo).map(t => TIPOS_GASTO[t]?.color || '#6b7280'),
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        }
                    }
                }
            }
        });
        
    } catch (error) {
        debug('Error cargando reporte global:', error);
    }
}

// ===== EXPORTACIÓN =====
function exportReport(format) {
    if (!state.lastReport) {
        showToast('Primero genera un reporte', 'warning');
        return;
    }
    
    if (format === 'pdf') {
        window.print();
        showToast('Reporte preparado para imprimir', 'success');
    } else if (format === 'excel') {
        const { gastos, fechaInicio, fechaFin } = state.lastReport;
        
        let csv = 'Fecha,Tipo,Concepto,Monto,Viaje\n';
        
        gastos.forEach(g => {
            const fecha = formatDate(g.fecha || g.createdAt);
            const tipo = TIPOS_GASTO[g.tipo]?.label || g.tipo;
            const linea = `"${fecha}","${tipo}","${g.lugar || ''}",${g.monto},"${g.viajeId}"\n`;
            csv += linea;
        });
        
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `Reporte_Gastos_${fechaInicio}_${fechaFin}.csv`;
        link.click();
        
        showToast('Reporte descargado como CSV', 'success');
    }
}

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

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) {
        alert(message); // Fallback si no existe el contenedor
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
    }, 3000);
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
        indicator.title = online ? 'En línea' : 'Sin conexión';
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
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

function formatDateTime(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('es-MX', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function handlePhotoCapture(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        state.tempFotos = [e.target.result];
        
        const preview = document.getElementById('photo-preview');
        if (preview) {
            preview.innerHTML = `
                <img src="${e.target.result}" class="photo-preview" style="max-width: 100%; max-height: 200px; border-radius: var(--radius);">
                <button type="button" class="btn btn-small btn-danger" onclick="clearPhoto()" style="margin-top: 0.5rem;">Eliminar foto</button>
            `;
        }
    };
    reader.readAsDataURL(file);
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
    const input = document.getElementById('camera-input');
    if (input) input.value = '';
}

// Exponer funciones necesarias globalmente
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
window.selectViaje = selectViaje;
window.selectTipoGasto = selectTipoGasto;
window.guardarGasto = guardarGasto;
window.showDetalleGasto = showDetalleGasto;
window.eliminarGasto = eliminarGasto;
window.generarReporte = generarReporte;
window.exportReport = exportReport;
window.togglePassword = togglePassword;
window.handlePhotoCapture = handlePhotoCapture;
window.clearPhoto = clearPhoto;

debug('App.js cargado completamente');

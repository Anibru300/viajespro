/**
 * 3P VIAJESPRO - Main Application v5.0 (Corregido y Mejorado)
 */

// ===== CONFIGURACIÓN =====
const CONFIG = {
    ADMIN_USER: 'admin',
    ADMIN_PASS: 'admin123',
    VERSION: '5.0.0',
    APP_NAME: '3P Control de Viáticos Pro'
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
    lastReport: null // para guardar el reporte generado
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

// ===== ESCAPE HTML (para evitar caracteres maliciosos y roturas) =====
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
    
    // Fechas por defecto
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

    // CORRECCIÓN: Listener para el filtro de gastos
    const gastosViajeSelect = document.getElementById('gastos-viaje-select');
    if (gastosViajeSelect) {
        gastosViajeSelect.addEventListener('change', loadGastosList);
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
    showScreen('login-screen');
}

function showAdminLogin() {
    showScreen('admin-login-screen');
}

function backToLogin() {
    showLoginScreen();
}

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
    
    if (btn) setLoading(btn, true);
    
    try {
        debug('Buscando vendedor:', username);
        const vendor = await db.get('vendedores', username);
        debug('Vendedor encontrado:', vendor ? 'SÍ' : 'NO');
        
        if (!vendor || vendor.password !== password) {
            showToast('Usuario o contraseña incorrectos', 'error');
            if (btn) setLoading(btn, false);
            return;
        }
        
        if (vendor.status === 'inactive') {
            showToast('Usuario inactivo', 'warning');
            if (btn) setLoading(btn, false);
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
        if (btn) setLoading(btn, false);
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

// ===== REGISTRO VENDEDOR =====
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
    const zone = zoneInput ? zoneInput.value : 'Centro';
    
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

// ===== CARGAR VENDEDORES =====
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
    
    const userNameEl = document.getElementById('current-user-name');
    const welcomeEl = document.getElementById('welcome-text');
    
    if (userNameEl) userNameEl.textContent = state.currentVendor?.name || 'Vendedor';
    if (welcomeEl) welcomeEl.textContent = `Hola, ${state.currentVendor?.name?.split(' ')[0] || 'Vendedor'}`;
    
    loadViajes();
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
    const presupuesto = document.getElementById('viaje-presupuesto').value;
    
    if (!cliente || !destino || !fechaInicioInput) {
        showToast('Cliente, destino y fecha de inicio son obligatorios', 'warning');
        return;
    }
    
    const viaje = {
        id: 'VIAJE_' + Date.now(),
        vendedorId: state.currentVendor.username,
        cliente: cliente.toUpperCase(),
        destino: destino.toUpperCase(),
        lugarVisita: lugarVisita ? lugarVisita.toUpperCase() : destino.toUpperCase(),
        objetivo: objetivo,
        responsable: state.currentVendor.name,
        zona: state.currentVendor.zone || 'Centro',
        fechaInicio: new Date(fechaInicioInput + 'T12:00:00').toISOString(),
        fechaFin: fechaFinInput ? new Date(fechaFinInput + 'T12:00:00').toISOString() : null,
        presupuesto: presupuesto ? parseFloat(presupuesto) : null,
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

// ===== FUNCIÓN EDITAR VIAJE (CORREGIDA) =====
async function editarViaje(viajeId) {
    try {
        const viaje = await db.get('viajes', viajeId);
        if (!viaje) {
            showToast('Viaje no encontrado', 'error');
            return;
        }

        openModal('editar-viaje');

        // Pequeño retraso para asegurar que el modal se haya renderizado
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
        
        const selects = ['captura-viaje-select', 'gastos-viaje-select'];
        
        selects.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (!select) return;
            
            const currentValue = select.value;
            const defaultOption = selectId === 'captura-viaje-select' ? 
                '<option value="">Elige un viaje activo...</option>' :
                '<option value="">Todos los viajes</option>';
            
            select.innerHTML = defaultOption + activos.map(v => 
                `<option value="${v.id}">${escapeHtml(v.cliente)} - ${escapeHtml(v.destino)}</option>`
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
    // Verificar que los elementos existen
    const viajeSelect = document.getElementById('captura-viaje-select');
    const tipoCard = document.querySelector('.tipo-card.selected');
    const montoInput = document.getElementById('monto-gasto');
    const lugarInput = document.getElementById('lugar-gasto');
    const fechaInput = document.getElementById('fecha-gasto');
    const folioInput = document.getElementById('folio-factura');
    const razonInput = document.getElementById('razon-social');
    const comentariosInput = document.getElementById('comentarios-gasto');
    const facturableCheck = document.getElementById('es-facturable');

    if (!viajeSelect || !montoInput || !lugarInput || !fechaInput || !folioInput || !razonInput || !comentariosInput || !facturableCheck) {
        showToast('Error en el formulario, algunos campos no existen', 'error');
        return;
    }

    const viajeId = viajeSelect.value;
    const monto = montoInput.value;
    const lugar = lugarInput.value.trim();
    const fecha = fechaInput.value;
    const folioFactura = folioInput.value.trim() || '';
    const razonSocial = razonInput.value.trim() || '';
    const comentarios = comentariosInput.value.trim() || '';
    const esFacturable = facturableCheck.checked !== false;
    
    // Validación: si NO es facturable, debe tener comentario
    if (!esFacturable && !comentarios) {
        showToast('⚠️ Debes explicar por qué no es facturable en los comentarios', 'warning');
        comentariosInput.focus();
        comentariosInput.style.borderColor = '#dc2626';
        return;
    } else {
        comentariosInput.style.borderColor = '';
    }
    
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
    
    const esEdicion = state.currentGasto !== null;
    
    const gastoData = {
        viajeId,
        vendedorId: state.currentVendor.username,
        tipo: tipoCard.dataset.tipo,
        monto: parseFloat(monto),
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
        const viajeId = document.getElementById('gastos-viaje-select')?.value;
        let gastos = [];
        
        if (viajeId) {
            gastos = await db.getGastosByViaje(viajeId);
        } else if (state.currentVendor) {
            const viajes = await db.getViajesByVendedor(state.currentVendor.username);
            for (const viaje of viajes) {
                const g = await db.getGastosByViaje(viaje.id);
                gastos = gastos.concat(g.map(item => ({...item, viajeDestino: viaje.destino, viajeCliente: viaje.cliente})));
            }
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
        
        // Verificar existencia de elementos
        const viajeSelect = document.getElementById('captura-viaje-select');
        const montoInput = document.getElementById('monto-gasto');
        const lugarInput = document.getElementById('lugar-gasto');
        const fechaInput = document.getElementById('fecha-gasto');
        const folioInput = document.getElementById('folio-factura');
        const razonInput = document.getElementById('razon-social');
        const comentariosInput = document.getElementById('comentarios-gasto');
        const facturableCheck = document.getElementById('es-facturable');

        if (!viajeSelect || !montoInput || !lugarInput || !fechaInput || !folioInput || !razonInput || !comentariosInput || !facturableCheck) {
            showToast('Error al cargar el formulario', 'error');
            return;
        }

        viajeSelect.value = gasto.viajeId;
        montoInput.value = gasto.monto;
        lugarInput.value = gasto.lugar || '';
        fechaInput.value = gasto.fecha ? gasto.fecha.slice(0, 16) : '';
        folioInput.value = gasto.folioFactura || '';
        razonInput.value = gasto.razonSocial || '';
        comentariosInput.value = gasto.comentarios || '';
        facturableCheck.checked = gasto.esFacturable !== false;
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
        
        // Ordenar gastos por fecha (ascendente) para asignar números consecutivos
        allGastos.sort((a, b) => new Date(a.fecha || a.createdAt) - new Date(b.fecha || b.createdAt));
        
        // Asignar número de factura consecutivo
        allGastos.forEach((g, index) => {
            g.numeroFactura = index + 1;
        });
        
        // Agrupar por mes para gráficos (no afecta)
        const porMes = {};
        allGastos.forEach(g => {
            const fecha = new Date(g.fecha || g.createdAt);
            const year = fecha.getFullYear();
            const month = fecha.getMonth();
            
            const mesKey = `${year}-${String(month + 1).padStart(2, '0')}`;
            const mesLabel = fecha.toLocaleString('es-MX', { 
                timeZone: 'America/Mexico_City',
                month: 'short', 
                year: '2-digit' 
            });
            
            if (!porMes[mesKey]) {
                porMes[mesKey] = { label: mesLabel, total: 0, year, month };
            }
            porMes[mesKey].total += g.monto;
        });
        
        const mesesOrdenados = Object.entries(porMes)
            .sort((a, b) => {
                if (a[1].year !== b[1].year) return a[1].year - b[1].year;
                return a[1].month - b[1].month;
            });
        
        const labels = mesesOrdenados.map(([_, data]) => data.label);
        const dataValues = mesesOrdenados.map(([_, data]) => data.total);
        
        const porTipo = {};
        allGastos.forEach(g => {
            porTipo[g.tipo] = (porTipo[g.tipo] || 0) + g.monto;
        });
        
        const total = allGastos.reduce((sum, g) => sum + g.monto, 0);
        const totalFacturable = allGastos.filter(g => g.esFacturable !== false).reduce((sum, g) => sum + g.monto, 0);
        
        document.getElementById('reporte-resultado').classList.remove('hidden');
        
        // Gráficos...
        const ctx2 = document.getElementById('trend-chart').getContext('2d');
        if (state.charts.line) state.charts.line.destroy();
        
        state.charts.line = new Chart(ctx2, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Gastos por mes',
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
            porMes: Object.fromEntries(mesesOrdenados.map(([k, v]) => [k, v.total])),
            gastos: allGastos, // ya tienen numeroFactura
            responsable: state.currentVendor.name,
            zona: state.currentVendor.zone
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

function generarExcelProfesional() {
    if (!state.lastReport) {
        showToast('Primero genera un reporte', 'warning');
        return;
    }
    
    const { gastos, fechaInicio, fechaFin, total, totalFacturable, responsable, zona } = state.lastReport;
    
    // Generar número de reporte con formato: 3p-{3 primeras letras del vendedor}-{fecha actual ddmmyy}
    const primerasLetras = responsable.trim().toUpperCase().substring(0, 3);
    const hoy = new Date();
    const dia = String(hoy.getDate()).padStart(2, '0');
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const año = String(hoy.getFullYear()).slice(-2);
    const fechaStr = dia + mes + año;
    const numReporte = `3p-${primerasLetras}-${fechaStr}`;
    
    const fechaGeneracion = formatDateTimeMexico(new Date().toISOString());

    const escape = (text) => {
        if (text == null) return '';
        return String(text).replace(/[&<>"]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            if (m === '"') return '&quot;';
            return m;
        });
    };

    let html = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/1999/xhtml">
<head>
    <meta charset="UTF-8">
    <title>Reporte 3P Viáticos</title>
    <!--[if gte mso 9]>
    <xml>
        <x:ExcelWorkbook>
            <x:ExcelWorksheets>
                <x:ExcelWorksheet>
                    <x:Name>Reporte</x:Name>
                </x:ExcelWorksheet>
            </x:ExcelWorksheets>
        </x:ExcelWorkbook>
    </xml>
    <![endif]-->
</head>
<body>
    <!-- Encabezado con inline styles -->
    <table width="100%" cellpadding="10" cellspacing="0" style="font-family: Arial, sans-serif;">
        <tr>
            <td style="background-color: #1e3a5f; color: white; text-align: center;" colspan="2">
                <h1 style="margin: 0; color: white;">3P SA DE CV</h1>
                <h2 style="margin: 5px 0 0 0; color: white; font-weight: normal;">Reporte de Viáticos y Gastos de Viaje</h2>
            </td>
        </tr>
    </table>
    
    <!-- Información del reporte -->
    <table width="100%" cellpadding="8" cellspacing="0" style="background-color: #f3f4f6; margin-top: 10px; font-family: Arial, sans-serif; border-collapse: collapse;">
        <tr>
            <td style="border: 1px solid #d1d5db;"><strong>Responsable:</strong> ${escape(responsable)}</td>
            <td style="border: 1px solid #d1d5db;"><strong>Zona:</strong> ${escape(zona || 'No especificada')}</td>
        </tr>
        <tr>
            <td style="border: 1px solid #d1d5db;"><strong>Período:</strong> ${escape(formatDateMexico(fechaInicio))} al ${escape(formatDateMexico(fechaFin))}</td>
            <td style="border: 1px solid #d1d5db;"><strong>No. Reporte:</strong> ${escape(numReporte)}</td>
        </tr>
        <tr>
            <td style="border: 1px solid #d1d5db;"><strong>Fecha de generación:</strong> ${escape(fechaGeneracion)}</td>
            <td style="border: 1px solid #d1d5db;"><strong>Total General:</strong> ${escape(formatMoney(total))}</td>
        </tr>
    </table>
    
    <!-- Tabla de gastos -->
    <table width="100%" cellpadding="8" cellspacing="0" style="margin-top: 20px; font-family: Arial, sans-serif; font-size: 12px; border-collapse: collapse;">
        <thead>
            <tr style="background-color: #1e3a5f; color: white;">
                <th style="border: 1px solid #0f1f33; padding: 12px; text-align: left;">N° Factura</th>
                <th style="border: 1px solid #0f1f33; padding: 12px; text-align: left;">Fecha</th>
                <th style="border: 1px solid #0f1f33; padding: 12px; text-align: left;">Cliente</th>
                <th style="border: 1px solid #0f1f33; padding: 12px; text-align: left;">Lugar de Visita</th>
                <th style="border: 1px solid #0f1f33; padding: 12px; text-align: left;">Tipo Gasto</th>
                <th style="border: 1px solid #0f1f33; padding: 12px; text-align: left;">Folio Factura</th>
                <th style="border: 1px solid #0f1f33; padding: 12px; text-align: left;">Razón Social</th>
                <th style="border: 1px solid #0f1f33; padding: 12px; text-align: right;">Total</th>
                <th style="border: 1px solid #0f1f33; padding: 12px; text-align: center;">Facturable</th>
                <th style="border: 1px solid #0f1f33; padding: 12px; text-align: left;">Comentarios</th>
            </tr>
        </thead>
        <tbody>
`;

    gastos.forEach(g => {
        const esFacturable = g.esFacturable !== false;
        html += `
            <tr>
                <td style="border: 1px solid #d1d5db; padding: 10px; text-align: center;">${g.numeroFactura}</td>
                <td style="border: 1px solid #d1d5db; padding: 10px;">${escape(formatDateMexico(g.fecha || g.createdAt))}</td>
                <td style="border: 1px solid #d1d5db; padding: 10px;">${escape(g.viaje?.cliente || 'N/A')}</td>
                <td style="border: 1px solid #d1d5db; padding: 10px;">${escape(g.viaje?.lugarVisita || g.viaje?.destino || 'N/A')}</td>
                <td style="border: 1px solid #d1d5db; padding: 10px;">${escape(TIPOS_GASTO[g.tipo]?.label || g.tipo)}</td>
                <td style="border: 1px solid #d1d5db; padding: 10px;">${escape(g.folioFactura || '-')}</td>
                <td style="border: 1px solid #d1d5db; padding: 10px;">${escape(g.razonSocial || '-')}</td>
                <td style="border: 1px solid #d1d5db; padding: 10px; text-align: right;">${escape(formatMoney(g.monto))}</td>
                <td style="border: 1px solid #d1d5db; padding: 10px; text-align: center; ${esFacturable ? 'color: #059669; font-weight: bold;' : 'color: #dc2626; font-weight: bold;'}">${esFacturable ? 'SÍ' : 'NO'}</td>
                <td style="border: 1px solid #d1d5db; padding: 10px;">${escape(g.comentarios || '')}</td>
            </tr>
        `;
    });

    html += `
            <tr style="background-color: #e5e7eb; font-weight: bold;">
                <td colspan="7" style="border: 1px solid #d1d5db; padding: 10px; text-align: right;">TOTALES:</td>
                <td style="border: 1px solid #d1d5db; padding: 10px; text-align: right;">${escape(formatMoney(total))}</td>
                <td colspan="2" style="border: 1px solid #d1d5db; padding: 10px;"></td>
            </tr>
            <tr style="background-color: #e5e7eb; font-weight: bold; color: #059669;">
                <td colspan="7" style="border: 1px solid #d1d5db; padding: 10px; text-align: right;">Total Facturable:</td>
                <td style="border: 1px solid #d1d5db; padding: 10px; text-align: right;">${escape(formatMoney(totalFacturable))}</td>
                <td colspan="2" style="border: 1px solid #d1d5db; padding: 10px;"></td>
            </tr>
            <tr style="background-color: #e5e7eb; font-weight: bold; color: #dc2626;">
                <td colspan="7" style="border: 1px solid #d1d5db; padding: 10px; text-align: right;">Total No Facturable:</td>
                <td style="border: 1px solid #d1d5db; padding: 10px; text-align: right;">${escape(formatMoney(total - totalFacturable))}</td>
                <td colspan="2" style="border: 1px solid #d1d5db; padding: 10px;"></td>
            </tr>
        </tbody>
    </table>
    
    <div style="margin-top: 20px; text-align: center; color: #6b7280; font-size: 11px; font-family: Arial, sans-serif;">
        <p><strong>Documento generado por 3P ViajesPro v5.0</strong></p>
        <p>Este reporte es un documento oficial de 3P SA DE CV</p>
        <p>Fecha y hora: ${escape(formatDateTimeMexico(new Date().toISOString()))}</p>
    </div>
</body>
</html>
    `;

    const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const newWindow = window.open(url, '_blank');
    if (!newWindow) {
        const link = document.createElement('a');
        link.href = url;
        link.download = `Reporte_3P_Viaticos_${responsable.replace(/\s+/g, '_')}_${fechaInicio}_${fechaFin}.xls`;
        link.click();
    }
    
    setTimeout(() => URL.revokeObjectURL(url), 30000);

    showToast('📊 Reporte Excel generado', 'success');
}

// ===== NUEVA FUNCIÓN: CORTE COMPLETO (ZIP) =====
async function exportCorteCompleto() {
    if (!state.lastReport) {
        showToast('Primero genera un reporte', 'warning');
        return;
    }

    showToast('Preparando corte completo...', 'info');

    const { gastos, responsable, fechaInicio, fechaFin } = state.lastReport;
    const zip = new JSZip();

    // 1. Generar el Excel igual que antes y agregarlo al zip
    const excelBlob = await new Promise((resolve) => {
        // Reutilizamos la función de generar Excel pero en lugar de descargar, obtenemos el blob
        const primerasLetras = responsable.trim().toUpperCase().substring(0, 3);
        const hoy = new Date();
        const dia = String(hoy.getDate()).padStart(2, '0');
        const mes = String(hoy.getMonth() + 1).padStart(2, '0');
        const año = String(hoy.getFullYear()).slice(-2);
        const fechaStr = dia + mes + año;
        const numReporte = `3p-${primerasLetras}-${fechaStr}`;
        const fechaGeneracion = formatDateTimeMexico(new Date().toISOString());

        const escape = (text) => {
            if (text == null) return '';
            return String(text).replace(/[&<>"]/g, function(m) {
                if (m === '&') return '&amp;';
                if (m === '<') return '&lt;';
                if (m === '>') return '&gt;';
                if (m === '"') return '&quot;';
                return m;
            });
        };

        let html = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/1999/xhtml">
<head><meta charset="UTF-8"><title>Reporte 3P Viáticos</title></head>
<body>
    <table width="100%" cellpadding="10" cellspacing="0"><tr><td style="background-color: #1e3a5f; color: white; text-align: center;"><h1 style="margin:0;color:white;">3P SA DE CV</h1><h2 style="margin:5px 0 0;color:white;font-weight:normal;">Reporte de Viáticos</h2></td></tr></table>
    <table width="100%" cellpadding="8" cellspacing="0" style="background:#f3f4f6;margin-top:10px;border-collapse:collapse;">
        <tr><td style="border:1px solid #d1d5db;"><strong>Responsable:</strong> ${escape(responsable)}</td><td style="border:1px solid #d1d5db;"><strong>Zona:</strong> ${escape(state.lastReport.zona || '')}</td></tr>
        <tr><td style="border:1px solid #d1d5db;"><strong>Período:</strong> ${escape(formatDateMexico(fechaInicio))} al ${escape(formatDateMexico(fechaFin))}</td><td style="border:1px solid #d1d5db;"><strong>No. Reporte:</strong> ${escape(numReporte)}</td></tr>
        <tr><td style="border:1px solid #d1d5db;"><strong>Fecha generación:</strong> ${escape(fechaGeneracion)}</td><td style="border:1px solid #d1d5db;"><strong>Total General:</strong> ${escape(formatMoney(state.lastReport.total))}</td></tr>
    </table>
    <table width="100%" cellpadding="8" cellspacing="0" style="margin-top:20px;border-collapse:collapse;">
        <thead><tr style="background:#1e3a5f;color:white;">
            <th style="border:1px solid #0f1f33;">N° Factura</th><th style="border:1px solid #0f1f33;">Fecha</th><th style="border:1px solid #0f1f33;">Cliente</th><th style="border:1px solid #0f1f33;">Lugar</th><th style="border:1px solid #0f1f33;">Tipo</th><th style="border:1px solid #0f1f33;">Folio</th><th style="border:1px solid #0f1f33;">Razón Social</th><th style="border:1px solid #0f1f33;">Total</th><th style="border:1px solid #0f1f33;">Fact.</th><th style="border:1px solid #0f1f33;">Comentarios</th>
        </tr></thead>
        <tbody>`;
        gastos.forEach(g => {
            html += `<tr><td style="border:1px solid #d1d5db;padding:6px;text-align:center;">${g.numeroFactura}</td>
                <td style="border:1px solid #d1d5db;padding:6px;">${escape(formatDateMexico(g.fecha || g.createdAt))}</td>
                <td style="border:1px solid #d1d5db;padding:6px;">${escape(g.viaje?.cliente || '')}</td>
                <td style="border:1px solid #d1d5db;padding:6px;">${escape(g.viaje?.lugarVisita || g.viaje?.destino || '')}</td>
                <td style="border:1px solid #d1d5db;padding:6px;">${escape(TIPOS_GASTO[g.tipo]?.label || g.tipo)}</td>
                <td style="border:1px solid #d1d5db;padding:6px;">${escape(g.folioFactura || '-')}</td>
                <td style="border:1px solid #d1d5db;padding:6px;">${escape(g.razonSocial || '-')}</td>
                <td style="border:1px solid #d1d5db;padding:6px;text-align:right;">${escape(formatMoney(g.monto))}</td>
                <td style="border:1px solid #d1d5db;padding:6px;text-align:center;${g.esFacturable!==false?'color:#059669;font-weight:bold;':'color:#dc2626;font-weight:bold;'}">${g.esFacturable!==false?'SÍ':'NO'}</td>
                <td style="border:1px solid #d1d5db;padding:6px;">${escape(g.comentarios||'')}</td></tr>`;
        });
        html += `</tbody></table></body></html>`;
        const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
        resolve(blob);
    });

    zip.file(`Reporte_${responsable.replace(/\s+/g, '_')}_${fechaInicio}_${fechaFin}.xls`, excelBlob);

    // 2. Carpeta de facturas con fotos
    const facturasFolder = zip.folder("facturas");
    let fotoIndex = 0;
    for (const gasto of gastos) {
        if (gasto.fotos && gasto.fotos.length > 0) {
            for (let i = 0; i < gasto.fotos.length; i++) {
                const fotoBase64 = gasto.fotos[i];
                // Extraer el tipo de imagen (data:image/jpeg;base64, ...)
                const matches = fotoBase64.match(/^data:image\/([a-zA-Z]+);base64,/);
                if (!matches) continue;
                const ext = matches[1];
                const base64Data = fotoBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
                // Crear nombre: Folio_Cliente_#.ext  (si no hay folio, usar "sfolio")
                const folio = gasto.folioFactura && gasto.folioFactura.trim() !== '' ? gasto.folioFactura : 'sfolio';
                const cliente = gasto.viaje?.cliente?.replace(/[^a-zA-Z0-9]/g, '_') || 'cliente';
                const nombreArchivo = `${folio}_${cliente}_${i+1}.${ext}`;
                facturasFolder.file(nombreArchivo, base64Data, { base64: true });
                fotoIndex++;
            }
        }
    }

    if (fotoIndex === 0) {
        facturasFolder.file("LEEME.txt", "No hay fotos asociadas a los gastos en este período.");
    }

    // Generar el ZIP y descargar
    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `Corte_Completo_${responsable.replace(/\s+/g, '_')}_${fechaInicio}_${fechaFin}.zip`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 30000);
    showToast('📦 Corte completo descargado', 'success');
}

async function loadGlobalReport() {
    try {
        let allGastos, allViajes, allVendors;
        
        allGastos = await db.getAll('gastos');
        allViajes = await db.getAll('viajes');
        allVendors = await db.getAll('vendedores');
        
        const stats = {
            totalGastos: allGastos.reduce((sum, g) => sum + g.monto, 0),
            totalFacturable: allGastos.filter(g => g.esFacturable !== false).reduce((sum, g) => sum + g.monto, 0),
            totalViajes: allViajes.length,
            totalVendedores: allVendors.filter(v => v.status === 'active').length
        };
        
        const statsContainer = document.getElementById('admin-stats');
        if (statsContainer) {
            statsContainer.innerHTML = `
                <div class="stat-card">
                    <span class="stat-value">${formatMoney(stats.totalGastos)}</span>
                    <span class="stat-label">Total Gastos</span>
                </div>
                <div class="stat-card">
                    <span class="stat-value">${formatMoney(stats.totalFacturable)}</span>
                    <span class="stat-label">Total Facturable</span>
                </div>
                <div class="stat-card">
                    <span class="stat-value">${stats.totalViajes}</span>
                    <span class="stat-label">Viajes</span>
                </div>
                <div class="stat-card">
                    <span class="stat-value">${stats.totalVendedores}</span>
                    <span class="stat-label">Vendedores Activos</span>
                </div>
            `;
        }
        
        const resumenPorVendedor = {};
        allVendors.forEach(v => {
            if (v.status === 'active') {
                resumenPorVendedor[v.id] = {
                    nombre: v.name,
                    zona: v.zone,
                    viajes: 0,
                    gastos: 0,
                    total: 0,
                    totalFacturable: 0
                };
            }
        });
        
        allViajes.forEach(v => {
            if (resumenPorVendedor[v.vendedorId]) {
                resumenPorVendedor[v.vendedorId].viajes++;
            }
        });
        
        allGastos.forEach(g => {
            if (resumenPorVendedor[g.vendedorId]) {
                resumenPorVendedor[g.vendedorId].gastos++;
                resumenPorVendedor[g.vendedorId].total += g.monto;
                if (g.esFacturable !== false) {
                    resumenPorVendedor[g.vendedorId].totalFacturable += g.monto;
                }
            }
        });
        
        const container = document.getElementById('admin-vendors-summary');
        if (container) {
            const vendedoresArray = Object.entries(resumenPorVendedor);
            
            if (vendedoresArray.length === 0) {
                container.innerHTML = '<p>No hay vendedores activos</p>';
            } else {
                container.innerHTML = vendedoresArray.map(([id, v]) => `
                    <div class="vendor-summary-card">
                        <div class="vendor-summary-header">
                            <div>
                                <h4>${escapeHtml(v.nombre)}</h4>
                                <p class="vendor-summary-meta">
                                    📍 ${escapeHtml(v.zona)} | 🚗 ${v.viajes} viajes | 🧾 ${v.gastos} gastos
                                </p>
                            </div>
                            <div class="vendor-summary-amounts">
                                <div class="vendor-total">${formatMoney(v.total)}</div>
                                <div class="vendor-facturable">📄 ${formatMoney(v.totalFacturable)} fact.</div>
                            </div>
                        </div>
                    </div>
                `).join('');
            }
        }
        
        const porTipo = {};
        allGastos.forEach(g => {
            porTipo[g.tipo] = (porTipo[g.tipo] || 0) + g.monto;
        });
        
        const ctx = document.getElementById('global-chart')?.getContext('2d');
        if (ctx) {
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
        }
        
    } catch (error) {
        console.error('Error:', error);
        showToast('Error cargando datos: ' + error.message, 'error');
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

function handlePhotoCapture(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        state.tempFotos.push(e.target.result);
        
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
window.exportCorteCompleto = exportCorteCompleto; // NUEVA
window.togglePassword = togglePassword;
window.handlePhotoCapture = handlePhotoCapture;
window.clearPhoto = clearPhoto;
window.removeFoto = removeFoto;

debug('App.js v5.0 cargado completamente');

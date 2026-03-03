/**
 * 3P VIAJESPRO - Main Application v4.0 (Professional Edition)
 * Con exportación Excel profesional, edición de gastos y campos corporativos
 */

// ===== CONFIGURACIÓN =====
const CONFIG = {
    ADMIN_USER: 'admin',
    ADMIN_PASS: 'admin123',
    VERSION: '4.0.0',
    APP_NAME: '3P Control de Viáticos Pro',
    EMPRESA: {
        nombre: '3P SA DE CV',
        rfc: '3P-XXXXXX-XXX',
        direccion: 'Dirección corporativa',
        logo: './assets/images/logo-3p-login.png'
    }
};

// ===== ESTADO GLOBAL =====
const state = {
    currentUser: null,
    currentVendor: null,
    currentViaje: null,
    currentGasto: null, // Para edición
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
    debug('DOM cargado, iniciando v4.0...');
    
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
    debug('Iniciando app v4.0...');
    
    try {
        if (typeof db === 'undefined') {
            throw new Error('La base de datos no está cargada');
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
        
        debug('App v4.0 iniciada correctamente');
        
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

// ===== REGISTER VENDOR =====
async function registerVendor() {
    debug('=== INICIANDO REGISTRO DE VENDEDOR ===');
    
    try {
        const nameInput = document.getElementById('new-vendor-name');
        const usernameInput = document.getElementById('new-vendor-username');
        const passwordInput = document.getElementById('new-vendor-password');
        const emailInput = document.getElementById('new-vendor-email');
        const zoneInput = document.getElementById('new-vendor-zone');
        const errorDiv = document.getElementById('register-error');
        
        if (!nameInput || !usernameInput || !passwordInput) {
            throw new Error('No se encontraron los campos del formulario');
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
        
        let existing;
        try {
            existing = await db.get('vendedores', username);
        } catch (dbError) {
            throw new Error('Error al consultar la base de datos: ' + dbError.message);
        }
        
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
        
        try {
            await db.add('vendedores', vendor);
        } catch (addError) {
            throw new Error('Error al guardar: ' + addError.message);
        }
        
        showToast('✅ Vendedor registrado exitosamente', 'success');
        
        nameInput.value = '';
        usernameInput.value = '';
        passwordInput.value = '';
        if (emailInput) emailInput.value = '';
        
        await loadVendorsList();
        
    } catch (error) {
        const errorDiv = document.getElementById('register-error');
        const msg = 'Error al registrar: ' + error.message;
        if (errorDiv) errorDiv.textContent = msg;
        showToast(msg, 'error');
    }
}

async function loadVendorsList() {
    try {
        const vendors = await db.getAll('vendedores');
        const container = document.getElementById('vendors-list');
        if (!container) return;
        
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
        vendor.updatedAt = new Date().toISOString();

        await db.update('vendedores', vendor);
        closeModal('editar-vendedor');
        showToast('✅ Vendedor actualizado', 'success');
        loadVendorsList();
    } catch (error) {
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

// ===== VIAJES MEJORADOS V4.0 =====
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
                    <p>${filter === 'all' ? 'No tienes viajes registrados' : 'No hay viajes en este estado'}</p>
                    <button class="btn btn-link" onclick="openModal('nuevo-viaje')">Crear primer viaje</button>
                </div>
            `;
            return;
        }
        
        const viajesConStats = await Promise.all(viajes.map(async v => {
            const gastos = await db.getGastosByViaje(v.id);
            const total = gastos.reduce((sum, g) => sum + (parseFloat(g.monto) || 0), 0);
            const facturable = gastos.filter(g => g.esFacturable !== false).reduce((sum, g) => sum + (parseFloat(g.monto) || 0), 0);
            return { ...v, gastosCount: gastos.length, totalGastos: total, totalFacturable: facturable };
        }));
        
        container.innerHTML = viajesConStats.map(v => `
            <div class="viaje-card ${v.estado}" onclick="selectViaje('${v.id}')">
                <div class="viaje-header">
                    <div>
                        <div class="viaje-title">${v.destino}</div>
                        <div class="viaje-cliente">👤 ${v.cliente || 'Sin cliente'}</div>
                        <div class="viaje-proposito">${v.objetivo || v.proposito || 'Sin objetivo especificado'}</div>
                    </div>
                    <span class="viaje-badge ${v.estado}">${v.estado}</span>
                </div>
                <div class="viaje-meta">
                    <span>📅 ${formatDate(v.fechaInicio)}</span>
                    ${v.fechaFin ? `<span>🏁 ${formatDate(v.fechaFin)}</span>` : ''}
                    <span>📍 ${v.lugarVisita || v.destino}</span>
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
                    ${v.totalFacturable > 0 ? `
                    <div class="viaje-stat facturable">
                        <span>📄</span>
                        <span>${formatMoney(v.totalFacturable)} fact.</span>
                    </div>
                    ` : ''}
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        showToast('Error al cargar viajes', 'error');
    }
}

// ===== CREAR VIAJE V4.0 CON NUEVOS CAMPOS =====
async function crearViaje() {
    debug('Creando viaje v4.0...');
    
    const cliente = document.getElementById('viaje-cliente').value.trim();
    const destino = document.getElementById('viaje-destino').value.trim();
    const lugarVisita = document.getElementById('viaje-lugar-visita').value.trim();
    const objetivo = document.getElementById('viaje-objetivo').value.trim();
    const fechaInicioInput = document.getElementById('viaje-fecha-inicio').value;
    const fechaFinInput = document.getElementById('viaje-fecha-fin').value;
    const presupuesto = document.getElementById('viaje-presupuesto').value;
    
    if (!cliente) {
        showToast('El cliente es obligatorio', 'warning');
        return;
    }
    
    if (!destino || !fechaInicioInput) {
        showToast('Destino y fecha de inicio son obligatorios', 'warning');
        return;
    }
    
    // Ajustar fecha para evitar problema de zona horaria
    const fechaInicio = new Date(fechaInicioInput + 'T12:00:00').toISOString();
    const fechaFin = fechaFinInput ? new Date(fechaFinInput + 'T12:00:00').toISOString() : null;
    
    const viaje = {
        id: 'VIAJE_' + Date.now(),
        vendedorId: state.currentVendor.username,
        cliente: cliente.toUpperCase(),
        destino: destino.toUpperCase(),
        lugarVisita: lugarVisita ? lugarVisita.toUpperCase() : destino.toUpperCase(),
        objetivo: objetivo,
        responsable: state.currentVendor.name,
        zona: state.currentVendor.zone || 'Centro',
        fechaInicio: fechaInicio,
        fechaFin: fechaFin,
        presupuesto: presupuesto ? parseFloat(presupuesto) : null,
        estado: 'activo',
        createdAt: new Date().toISOString(),
        version: 4
    };
    
    try {
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
        showToast('Error al crear viaje', 'error');
    }
}

function selectViaje(viajeId) {
    state.currentViaje = viajeId;
    showSection('gastos');
    const select = document.getElementById('gastos-viaje-select');
    if (select) select.value = viajeId;
    loadGastosList();
}

// ===== GASTOS MEJORADOS V4.0 =====
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
                `<option value="${v.id}">${v.cliente} - ${v.destino} (${formatDate(v.fechaInicio)})</option>`
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
    document.querySelectorAll('.tipo-card').forEach(b => b.classList.remove('selected'));
    
    const preview = document.getElementById('photo-preview');
    if (preview) {
        preview.innerHTML = `
            <span class="upload-icon">📷</span>
            <span class="upload-text">Toca para capturar foto</span>
        `;
    }
    
    // Cambiar texto del botón
    const btnGuardar = document.querySelector('#captura-section .btn-primary.btn-large');
    if (btnGuardar) btnGuardar.textContent = '💾 GUARDAR GASTO';
}

async function guardarGasto() {
    const viajeId = document.getElementById('captura-viaje-select').value;
    const tipoCard = document.querySelector('.tipo-card.selected');
    const monto = document.getElementById('monto-gasto').value;
    const lugar = document.getElementById('lugar-gasto').value.trim();
    const fecha = document.getElementById('fecha-gasto').value;
    const folioFactura = document.getElementById('folio-factura')?.value.trim() || '';
    const razonSocial = document.getElementById('razon-social')?.value.trim() || '';
    const comentarios = document.getElementById('comentarios-gasto')?.value.trim() || '';
    const esFacturable = document.getElementById('es-facturable')?.checked !== false;
    
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
        viajeId: viajeId,
        vendedorId: state.currentVendor.username,
        tipo: tipoCard.dataset.tipo,
        monto: parseFloat(monto),
        lugar: lugar,
        fecha: fecha || new Date().toISOString(),
        folioFactura: folioFactura,
        razonSocial: razonSocial,
        comentarios: comentarios,
        esFacturable: esFacturable,
        fotos: state.tempFotos,
        editable: true,
        updatedAt: new Date().toISOString()
    };
    
    try {
        if (esEdicion) {
            // Actualizar gasto existente
            const gastoActualizado = {
                ...state.currentGasto,
                ...gastoData,
                id: state.currentGasto.id
            };
            await db.update('gastos', gastoActualizado);
            showToast('✅ Gasto actualizado exitosamente', 'success');
        } else {
            // Crear nuevo gasto
            const nuevoGasto = {
                ...gastoData,
                id: 'GASTO_' + Date.now(),
                createdAt: new Date().toISOString()
            };
            await db.add('gastos', nuevoGasto);
            showToast('✅ Gasto guardado exitosamente', 'success');
        }
        
        resetCapturaForm();
        
        if (document.getElementById('gastos-section').classList.contains('active')) {
            loadGastosList();
        }
        
    } catch (error) {
        showToast('Error al guardar gasto: ' + error.message, 'error');
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
        
        const resumen = { total: 0, facturable: 0, noFacturable: 0, porTipo: {} };
        gastos.forEach(g => {
            resumen.total += g.monto;
            if (g.esFacturable !== false) {
                resumen.facturable += g.monto;
            } else {
                resumen.noFacturable += g.monto;
            }
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
                        <div class="resumen-item">
                            <span class="label">📄 Facturable</span>
                            <span class="amount">${formatMoney(resumen.facturable)}</span>
                        </div>
                        <div class="resumen-item">
                            <span class="label">🚫 No Facturable</span>
                            <span class="amount">${formatMoney(resumen.noFacturable)}</span>
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
                        <p>${g.lugar || 'Sin lugar'} • ${formatDate(g.fecha || g.createdAt)}</p>
                        ${g.folioFactura ? `<p style="color: var(--success); font-size: 0.7rem;">📄 Folio: ${g.folioFactura}</p>` : ''}
                        ${g.viajeDestino ? `<p style="color: var(--primary); font-size: 0.7rem;">🚗 ${g.viajeCliente || ''} - ${g.viajeDestino}</p>` : ''}
                    </div>
                </div>
                <div class="gasto-amount">${formatMoney(g.monto)}</div>
            </div>
        `).join('');
        
    } catch (error) {
        showToast('Error al cargar gastos', 'error');
    }
}

async function showDetalleGasto(gastoId) {
    try {
        const gasto = await db.get('gastos', gastoId);
        if (!gasto) return;
        
        const viaje = await db.get('viajes', gasto.viajeId);
        state.currentGasto = gasto; // Guardar para posible edición
        
        const content = document.getElementById('detalle-gasto-content');
        content.innerHTML = `
            <div style="text-align: center; margin-bottom: 1.5rem;">
                <div style="font-size: 3rem; margin-bottom: 0.5rem;">${TIPOS_GASTO[gasto.tipo]?.icon || '📦'}</div>
                <h2 style="color: var(--primary); font-size: 2rem; margin-bottom: 0.5rem;">${formatMoney(gasto.monto)}</h2>
                <p style="color: var(--gray-500);">${TIPOS_GASTO[gasto.tipo]?.label || gasto.tipo}</p>
                ${gasto.esFacturable === false ? '<span style="background: #fee2e2; color: #dc2626; padding: 0.25rem 0.75rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600;">NO FACTURABLE</span>' : '<span style="background: #d1fae5; color: #059669; padding: 0.25rem 0.75rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600;">FACTURABLE</span>'}
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
                ${gasto.folioFactura ? `
                <div style="margin-bottom: 0.75rem;">
                    <span style="color: var(--gray-500); font-size: 0.875rem;">📄 Folio Factura:</span>
                    <p style="font-weight: 600;">${gasto.folioFactura}</p>
                </div>
                ` : ''}
                ${gasto.razonSocial ? `
                <div style="margin-bottom: 0.75rem;">
                    <span style="color: var(--gray-500); font-size: 0.875rem;">🏢 Razón Social:</span>
                    <p style="font-weight: 600;">${gasto.razonSocial}</p>
                </div>
                ` : ''}
                ${gasto.comentarios ? `
                <div style="margin-bottom: 0.75rem;">
                    <span style="color: var(--gray-500); font-size: 0.875rem;">💬 Comentarios:</span>
                    <p style="font-weight: 600;">${gasto.comentarios}</p>
                </div>
                ` : ''}
                <div>
                    <span style="color: var(--gray-500); font-size: 0.875rem;">🚗 Viaje:</span>
                    <p style="font-weight: 600;">${viaje?.cliente || ''} - ${viaje?.destino || 'Desconocido'}</p>
                </div>
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
        
        // Cerrar modal de detalle
        closeModal('detalle-gasto');
        
        // Cambiar a sección de captura
        showSection('captura');
        
        // Cargar datos en el formulario
        document.getElementById('captura-viaje-select').value = gasto.viajeId;
        document.getElementById('monto-gasto').value = gasto.monto;
        document.getElementById('lugar-gasto').value = gasto.lugar || '';
        document.getElementById('fecha-gasto').value = gasto.fecha ? gasto.fecha.slice(0, 16) : '';
        document.getElementById('folio-factura').value = gasto.folioFactura || '';
        document.getElementById('razon-social').value = gasto.razonSocial || '';
        document.getElementById('comentarios-gasto').value = gasto.comentarios || '';
        document.getElementById('es-facturable').checked = gasto.esFacturable !== false;
        
        // Seleccionar tipo
        document.querySelectorAll('.tipo-card').forEach(b => b.classList.remove('selected'));
        const tipoCard = document.querySelector(`.tipo-card[data-tipo="${gasto.tipo}"]`);
        if (tipoCard) tipoCard.classList.add('selected');
        
        // Cargar fotos existentes
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
        
        // Cambiar texto del botón
        const btnGuardar = document.querySelector('#captura-section .btn-primary.btn-large');
        if (btnGuardar) btnGuardar.textContent = '💾 ACTUALIZAR GASTO';
        
        // Guardar referencia al gasto actual
        state.currentGasto = gasto;
        
        showToast('Modo edición activado. Modifica los datos y guarda.', 'info');
        
    } catch (error) {
        showToast('Error al cargar gasto para edición', 'error');
    }
}

function removeFoto(index) {
    state.tempFotos.splice(index, 1);
    // Actualizar preview
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

// ===== REPORTES Y EXPORTACIÓN EXCEL PROFESIONAL =====
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
        let viajesMap = {};
        
        for (const viaje of viajes) {
            viajesMap[viaje.id] = viaje;
            const gastos = await db.getGastosByViaje(viaje.id);
            const gastosFiltrados = gastos.filter(g => {
                const fecha = new Date(g.fecha || g.createdAt);
                return fecha >= new Date(fechaInicio) && fecha <= new Date(fechaFin + 'T23:59:59');
            });
            allGastos = allGastos.concat(gastosFiltrados.map(g => ({
                ...g,
                viaje: viaje
            })));
        }
        
        if (allGastos.length === 0) {
            showToast('No hay gastos en el período seleccionado', 'warning');
            return;
        }
        
        // Calcular estadísticas
        const porTipo = {};
        const porMes = {};
        let total = 0;
        let totalFacturable = 0;
        
        allGastos.forEach(g => {
            total += g.monto;
            if (g.esFacturable !== false) totalFacturable += g.monto;
            porTipo[g.tipo] = (porTipo[g.tipo] || 0) + g.monto;
            
            const mes = new Date(g.fecha || g.createdAt).toLocaleString('es-MX', { month: 'short', year: '2-digit' });
            porMes[mes] = (porMes[mes] || 0) + g.monto;
        });
        
        // Mostrar resultados
        document.getElementById('reporte-resultado').classList.remove('hidden');
        
        // Gráfico de distribución
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
        
        // Guardar datos para exportación
        state.lastReport = {
            fechaInicio,
            fechaFin,
            total,
            totalFacturable,
            porTipo,
            porMes,
            gastos: allGastos,
            responsable: state.currentVendor.name,
            zona: state.currentVendor.zone
        };
        
    } catch (error) {
        showToast('Error al generar reporte', 'error');
    }
}

// ===== EXPORTACIÓN EXCEL PROFESIONAL 3P =====
function exportReport(format) {
    if (!state.lastReport) {
        showToast('Primero genera un reporte', 'warning');
        return;
    }
    
    if (format === 'excel') {
        generarExcelProfesional();
    } else if (format === 'pdf') {
        window.print();
        showToast('Reporte preparado para imprimir', 'success');
    }
}

function generarExcelProfesional() {
    const { gastos, fechaInicio, fechaFin, total, totalFacturable, responsable, zona } = state.lastReport;
    
    // Generar número de reporte único
    const numReporte = `3P-VIA-${Date.now().toString().slice(-6)}`;
    const fechaGeneracion = new Date().toLocaleDateString('es-MX');
    
    // Crear HTML para Excel (formato profesional)
    let html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: Arial, sans-serif; }
            .header { background-color: #dc2626; color: white; padding: 20px; text-align: center; }
            .header h1 { margin: 0; font-size: 24px; }
            .header h2 { margin: 5px 0 0 0; font-size: 16px; font-weight: normal; }
            .info-section { background-color: #f3f4f6; padding: 15px; margin: 10px 0; }
            .info-row { display: flex; justify-content: space-between; margin: 5px 0; }
            .label { font-weight: bold; color: #374151; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background-color: #dc2626; color: white; padding: 12px; text-align: left; font-weight: bold; border: 1px solid #b91c1c; }
            td { padding: 10px; border: 1px solid #d1d5db; }
            tr:nth-child(even) { background-color: #f9fafb; }
            .total-row { background-color: #fee2e2 !important; font-weight: bold; }
            .facturable { color: #059669; }
            .no-facturable { color: #dc2626; }
            .footer { margin-top: 20px; text-align: center; color: #6b7280; font-size: 12px; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>3P SA DE CV</h1>
            <h2>Reporte de Viáticos y Gastos de Viaje</h2>
        </div>
        
        <div class="info-section">
            <div class="info-row">
                <span><span class="label">Responsable:</span> ${responsable}</span>
                <span><span class="label">Zona:</span> ${zona || 'No especificada'}</span>
            </div>
            <div class="info-row">
                <span><span class="label">Período:</span> ${formatDate(fechaInicio)} al ${formatDate(fechaFin)}</span>
                <span><span class="label">No. Reporte:</span> ${numReporte}</span>
            </div>
            <div class="info-row">
                <span><span class="label">Fecha de generación:</span> ${fechaGeneracion}</span>
                <span><span class="label">Total General:</span> ${formatMoney(total)}</span>
            </div>
        </div>
        
        <table>
            <thead>
                <tr>
                    <th>Fecha</th>
                    <th>Cliente</th>
                    <th>Lugar de Visita</th>
                    <th>Tipo Gasto</th>
                    <th>Folio Factura</th>
                    <th>Razón Social</th>
                    <th>Total</th>
                    <th>Facturable</th>
                    <th>Comentarios</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    // Agregar filas de datos
    gastos.forEach(g => {
        const esFacturable = g.esFacturable !== false;
        html += `
            <tr>
                <td>${formatDate(g.fecha || g.createdAt)}</td>
                <td>${g.viaje?.cliente || 'N/A'}</td>
                <td>${g.viaje?.lugarVisita || g.viaje?.destino || 'N/A'}</td>
                <td>${TIPOS_GASTO[g.tipo]?.label || g.tipo}</td>
                <td>${g.folioFactura || '-'}</td>
                <td>${g.razonSocial || '-'}</td>
                <td style="text-align: right;">${formatMoney(g.monto)}</td>
                <td style="text-align: center;" class="${esFacturable ? 'facturable' : 'no-facturable'}">
                    ${esFacturable ? 'SÍ' : 'NO'}
                </td>
                <td>${g.comentarios || ''}</td>
            </tr>
        `;
    });
    
    // Fila de totales
    html += `
            <tr class="total-row">
                <td colspan="6" style="text-align: right;">TOTALES:</td>
                <td style="text-align: right;">${formatMoney(total)}</td>
                <td colspan="2"></td>
            </tr>
            <tr class="total-row">
                <td colspan="6" style="text-align: right;">Total Facturable:</td>
                <td style="text-align: right; color: #059669;">${formatMoney(totalFacturable)}</td>
                <td colspan="2"></td>
            </tr>
            <tr class="total-row">
                <td colspan="6" style="text-align: right;">Total No Facturable:</td>
                <td style="text-align: right; color: #dc2626;">${formatMoney(total - totalFacturable)}</td>
                <td colspan="2"></td>
            </tr>
        </tbody>
        </table>
        
        <div class="footer">
            <p>Documento generado por 3P ViajesPro v${CONFIG.VERSION}</p>
            <p>Este reporte es un documento oficial de 3P SA DE CV</p>
        </div>
    </body>
    </html>
    `;
    
    // Crear blob y descargar
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Reporte_3P_Viaticos_${responsable.replace(/\\s+/g, '_')}_${fechaInicio}_${fechaFin}.xls`;
    link.click();
    
    showToast('📊 Reporte Excel profesional descargado', 'success');
    
    // Guardar en historial de reportes
    guardarReporteEnHistorial({
        id: 'REPORTE_' + Date.now(),
        vendedorId: state.currentVendor.username,
        numReporte: numReporte,
        fechaInicio,
        fechaFin,
        total,
        totalFacturable,
        cantidadGastos: gastos.length,
        fechaGenerado: new Date().toISOString()
    });
}

async function guardarReporteEnHistorial(reporteData) {
    try {
        await db.add('reportes', reporteData);
    } catch (e) {
        console.warn('No se pudo guardar en historial:', e);
    }
}

async function loadGlobalReport() {
    try {
        const allGastos = await db.getAll('gastos');
        const allViajes = await db.getAll('viajes');
        const allVendors = await db.getAll('vendedores');
        
        const stats = {
            totalGastos: allGastos.reduce((sum, g) => sum + g.monto, 0),
            totalViajes: allViajes.length,
            totalVendedores: allVendors.length,
            promedioPorViaje: allViajes.length ? allGastos.reduce((sum, g) => sum + g.monto, 0) / allViajes.length : 0,
            totalFacturable: allGastos.filter(g => g.esFacturable !== false).reduce((sum, g) => sum + g.monto, 0)
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
                    <span class="stat-label">Vendedores</span>
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
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();
    
    const localDate = new Date(year, month, day);
    
    return localDate.toLocaleDateString('es-MX', {
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
    
    // Limpiar input para permitir seleccionar la misma foto de nuevo
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
window.editarGasto = editarGasto;
window.eliminarGasto = eliminarGasto;
window.generarReporte = generarReporte;
window.exportReport = exportReport;
window.togglePassword = togglePassword;
window.handlePhotoCapture = handlePhotoCapture;
window.clearPhoto = clearPhoto;
window.removeFoto = removeFoto;

debug('App.js v4.0 cargado completamente');

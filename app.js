/**
 * 3P VIAJESPRO - Main Application
 * Versión corregida y funcional
 */

// ===== CONFIGURACIÓN =====
const CONFIG = {
    ADMIN_USER: 'admin',
    ADMIN_PASS: 'admin123',
    VERSION: '2.0.0'
};

// ===== ESTADO GLOBAL =====
const state = {
    currentUser: null,
    currentVendor: null,
    currentViaje: null,
    tempFotos: [],
    tempLocation: null,
    isOnline: navigator.onLine,
    lastReport: null
};

// ===== INICIALIZACIÓN =====
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM cargado, iniciando app...');
    checkSession();
    setupEventListeners();
    updateConnectionStatus();
    
    window.addEventListener('online', () => updateConnectionStatus(true));
    window.addEventListener('offline', () => updateConnectionStatus(false));
});

function checkSession() {
    const savedSession = localStorage.getItem('viajespro_session');
    if (savedSession) {
        try {
            const session = JSON.parse(savedSession);
            if (session.remember && session.user) {
                state.currentUser = session.user;
                state.currentVendor = session.vendor;
                showMainApp();
                return;
            }
        } catch (e) {
            localStorage.removeItem('viajespro_session');
        }
    }
    showLoginScreen();
}

function setupEventListeners() {
    const cameraInput = document.getElementById('camera-input');
    if (cameraInput) {
        cameraInput.addEventListener('change', handlePhotoCapture);
    }
}

// ===== LOGIN =====
function showLoginScreen() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('admin-login-screen').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'none';
    document.getElementById('app').style.display = 'none';
}

function showAdminLogin() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-login-screen').style.display = 'flex';
}

function backToLogin() {
    showLoginScreen();
}

async function login() {
    const username = document.getElementById('login-username').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;
    const remember = document.getElementById('remember-me').checked;
    
    if (!username || !password) {
        alert('Ingresa usuario y contraseña');
        return;
    }
    
    try {
        await db.init();
        const vendor = await db.get('vendedores', username);
        
        if (!vendor || vendor.password !== password) {
            alert('Usuario o contraseña incorrectos');
            return;
        }
        
        if (vendor.status === 'inactive') {
            alert('Usuario inactivo. Contacta al administrador');
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
        
        showMainApp();
        
    } catch (error) {
        console.error('Login error:', error);
        alert('Error al iniciar sesión: ' + error.message);
    }
}

async function loginAdmin() {
    const username = document.getElementById('admin-username').value;
    const password = document.getElementById('admin-password').value;
    
    if (username === CONFIG.ADMIN_USER && password === CONFIG.ADMIN_PASS) {
        state.currentUser = { username, type: 'admin' };
        showAdminPanel();
    } else {
        const errorEl = document.getElementById('admin-login-error');
        if (errorEl) errorEl.textContent = 'Credenciales incorrectas';
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
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-login-screen').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'block';
    document.getElementById('app').style.display = 'none';
    
    loadVendorsList();
}

// ===== REGISTRO DE VENDEDORES =====
async function registerVendor() {
    console.log('registerVendor() llamada');
    
    const name = document.getElementById('new-vendor-name').value.trim();
    const username = document.getElementById('new-vendor-username').value.trim().toLowerCase();
    const password = document.getElementById('new-vendor-password').value;
    const email = document.getElementById('new-vendor-email').value.trim();
    const zone = document.getElementById('new-vendor-zone').value;
    const errorDiv = document.getElementById('register-error');
    
    if (errorDiv) errorDiv.textContent = '';
    
    // Validaciones
    if (!name || !username || !password) {
        const msg = 'Nombre, usuario y contraseña son obligatorios';
        alert(msg);
        if (errorDiv) errorDiv.textContent = msg;
        return;
    }
    
    if (!/^[a-z0-9.]+$/.test(username)) {
        const msg = 'Usuario solo puede contener letras minúsculas, números y puntos';
        alert(msg);
        if (errorDiv) errorDiv.textContent = msg;
        return;
    }
    
    try {
        if (typeof db === 'undefined') {
            throw new Error('La base de datos no está disponible. Recarga la página.');
        }
        
        console.log('Inicializando DB...');
        await db.init();
        console.log('DB lista');
        
        // Verificar si existe
        const existing = await db.get('vendedores', username);
        if (existing) {
            const msg = 'Este nombre de usuario ya existe';
            alert(msg);
            if (errorDiv) errorDiv.textContent = msg;
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
        
        console.log('Guardando vendedor:', vendor);
        await db.add('vendedores', vendor);
        
        alert('✅ Vendedor registrado exitosamente');
        
        // Limpiar formulario
        document.getElementById('new-vendor-name').value = '';
        document.getElementById('new-vendor-username').value = '';
        document.getElementById('new-vendor-password').value = '';
        document.getElementById('new-vendor-email').value = '';
        
        await loadVendorsList();
        
    } catch (error) {
        console.error('Error en registerVendor:', error);
        const msg = 'Error al registrar: ' + error.message;
        if (errorDiv) {
            errorDiv.textContent = msg;
        } else {
            alert(msg);
        }
    }
}

async function loadVendorsList() {
    try {
        await db.init();
        const vendors = await db.getAll('vendedores');
        const container = document.getElementById('vendors-list');
        
        if (vendors.length === 0) {
            container.innerHTML = '<p class="empty-text">No hay vendedores registrados</p>';
            return;
        }
        
        container.innerHTML = vendors.map(v => `
            <div class="vendor-item">
                <div class="vendor-info">
                    <h4>${v.name}</h4>
                    <p>@${v.username} • Zona: ${v.zone} • ${v.status === 'active' ? 'Activo' : 'Inactivo'}</p>
                </div>
                <div class="vendor-actions">
                    <button class="btn-small btn-primary" onclick="editVendor('${v.username}')">Editar</button>
                    <button class="btn-small btn-secondary" onclick="deleteVendor('${v.username}')">Eliminar</button>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error loading vendors:', error);
    }
}

async function editVendor(username) {
    try {
        const vendor = await db.get('vendedores', username);
        if (!vendor) {
            alert('Vendedor no encontrado');
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
        console.error('Error:', error);
        alert('Error al cargar datos');
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
        alert('Nombre es obligatorio');
        return;
    }

    try {
        const vendor = await db.get('vendedores', id);
        if (!vendor) {
            alert('Vendedor no encontrado');
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
        alert('✅ Vendedor actualizado');
        loadVendorsList();
    } catch (error) {
        console.error('Error:', error);
        alert('Error al guardar');
    }
}

async function deleteVendor(username) {
    if (!confirm(`¿Eliminar al vendedor ${username}?`)) return;
    
    try {
        await db.delete('vendedores', username);
        alert('✅ Vendedor eliminado');
        loadVendorsList();
    } catch (error) {
        console.error('Error:', error);
        alert('Error al eliminar');
    }
}

// ===== MAIN APP =====
function showMainApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-login-screen').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    
    const userNameEl = document.getElementById('current-user-name');
    if (userNameEl) userNameEl.textContent = state.currentVendor?.name || 'Vendedor';
}

// ===== NAVEGACIÓN =====
function showSection(sectionName) {
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    const sectionEl = document.getElementById(`${sectionName}-section`);
    if (sectionEl) sectionEl.classList.add('active');
}

// ===== VIAJES =====
async function loadViajes() {
    if (!state.currentVendor) return;
    
    try {
        const viajes = await db.getViajesByVendedor(state.currentVendor.username);
        const container = document.getElementById('viajes-list');
        
        if (viajes.length === 0) {
            container.innerHTML = '<p class="empty-text">No tienes viajes registrados</p>';
            return;
        }
        
        container.innerHTML = viajes.map(v => `
            <div class="card" onclick="selectViaje('${v.id}')">
                <h4>${v.destino}</h4>
                <p>${v.proposito || 'Sin propósito'}</p>
                <p><small>${v.fechaInicio} - ${v.fechaFin || 'Sin fecha fin'}</small></p>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error:', error);
    }
}

async function crearViaje() {
    const destino = document.getElementById('viaje-destino').value.trim();
    const proposito = document.getElementById('viaje-proposito').value.trim();
    const fechaInicio = document.getElementById('viaje-fecha-inicio').value;
    
    if (!destino || !fechaInicio) {
        alert('Destino y fecha de inicio son obligatorios');
        return;
    }
    
    const viaje = {
        id: 'VIAJE_' + Date.now(),
        vendedorId: state.currentVendor.username,
        destino: destino,
        proposito: proposito,
        fechaInicio: fechaInicio,
        estado: 'activo',
        createdAt: new Date().toISOString()
    };
    
    try {
        await db.add('viajes', viaje);
        closeModal('nuevo-viaje');
        alert('✅ Viaje creado');
        loadViajes();
    } catch (error) {
        console.error('Error:', error);
        alert('Error al crear viaje');
    }
}

function selectViaje(viajeId) {
    state.currentViaje = viajeId;
    showSection('gastos');
}

// ===== GASTOS =====
async function loadGastos(viajeId) {
    try {
        const gastos = await db.getGastosByViaje(viajeId);
        const container = document.getElementById('gastos-list');
        
        if (gastos.length === 0) {
            container.innerHTML = '<p class="empty-text">No hay gastos en este viaje</p>';
            return;
        }
        
        container.innerHTML = gastos.map(g => `
            <div class="card">
                <h4>${g.tipo} - $${g.monto}</h4>
                <p>${g.lugar || 'Sin lugar'}</p>
                <p><small>${new Date(g.fecha).toLocaleString()}</small></p>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error:', error);
    }
}

// ===== CAPTURA =====
function selectTipoGasto(btn) {
    document.querySelectorAll('.tipo-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
}

async function guardarGasto() {
    const viajeId = document.getElementById('captura-viaje-select').value;
    const tipoBtn = document.querySelector('.tipo-btn.selected');
    const monto = document.getElementById('monto-gasto').value;
    const lugar = document.getElementById('lugar-gasto').value.trim();
    
    if (!viajeId) {
        alert('Selecciona un viaje');
        return;
    }
    
    if (!tipoBtn) {
        alert('Selecciona el tipo de gasto');
        return;
    }
    
    if (!monto || parseFloat(monto) <= 0) {
        alert('Ingresa un monto válido');
        return;
    }
    
    const gasto = {
        id: 'GASTO_' + Date.now(),
        viajeId: viajeId,
        vendedorId: state.currentVendor.username,
        tipo: tipoBtn.dataset.tipo,
        monto: parseFloat(monto),
        lugar: lugar,
        createdAt: new Date().toISOString()
    };
    
    try {
        await db.add('gastos', gasto);
        alert('✅ Gasto guardado');
        document.getElementById('monto-gasto').value = '';
        document.getElementById('lugar-gasto').value = '';
    } catch (error) {
        console.error('Error:', error);
        alert('Error al guardar gasto');
    }
}

// ===== UTILIDADES =====
function openModal(modalId) {
    const modal = document.getElementById(`modal-${modalId}`);
    if (modal) modal.classList.add('active');
}

function closeModal(modalId) {
    const modal = document.getElementById(`modal-${modalId}`);
    if (modal) modal.classList.remove('active');
}

function updateConnectionStatus(online = navigator.onLine) {
    state.isOnline = online;
}

// Placeholder functions
function handlePhotoCapture(e) { console.log('Photo capture'); }

/**
 * 3P VIAJESPRO - Main Application
 * Versión con depuración y mensajes de error visibles
 */

// === FUNCIONES HELPER PARA FECHAS ===
function crearFechaLocal(dateString) {
    if (!dateString) return null;
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
}

function formatearFechaMX(fecha) {
    if (!fecha) return 'Sin fecha';
    let dateObj = (typeof fecha === 'string' && fecha.match(/^\d{4}-\d{2}-\d{2}$/)) 
        ? crearFechaLocal(fecha) 
        : new Date(fecha);
    if (isNaN(dateObj.getTime())) return 'Fecha inválida';
    return dateObj.toLocaleDateString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function getFechaHoraActualInput() {
    const ahora = new Date();
    const year = ahora.getFullYear();
    const month = String(ahora.getMonth() + 1).padStart(2, '0');
    const day = String(ahora.getDate()).padStart(2, '0');
    const hours = String(ahora.getHours()).padStart(2, '0');
    const minutes = String(ahora.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

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

function showLoginError(message) {
    const errorEl = document.getElementById('login-error');
    if (errorEl) errorEl.textContent = message;
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

// ***** FUNCIÓN REGISTRO DE VENDEDORES (CORREGIDA) *****
async function registerVendor() {
    console.log('registerVendor() llamada');
    
    const name = document.getElementById('new-vendor-name').value.trim();
    const username = document.getElementById('new-vendor-username').value.trim().toLowerCase();
    const password = document.getElementById('new-vendor-password').value;
    const email = document.getElementById('new-vendor-email').value.trim();
    const zone = document.getElementById('new-vendor-zone').value;
    const errorDiv = document.getElementById('register-error');
    
    // Limpiar mensaje de error anterior
    if (errorDiv) errorDiv.textContent = '';
    
    // Validaciones básicas
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
        // Verificar que db esté definido
        if (typeof db === 'undefined') {
            throw new Error('La base de datos no está disponible. Recarga la página.');
        }
        
        console.log('Inicializando DB...');
        await db.init();
        console.log('DB lista');
        
        // Verificar si el usuario ya existe
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
        
        // Recargar lista
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
                    <p><small>Creado: ${new Date(v.createdAt).toLocaleDateString()}</small></p>
                </div>
                <div class="vendor-actions" style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
                    <button class="btn-small btn-primary" onclick="editVendor('${v.username}')">✏️ Editar</button>
                    <button class="btn-small btn-secondary" onclick="deleteVendor('${v.username}')">🗑️ Eliminar</button>
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
        console.error('Error al cargar vendedor para editar:', error);
        alert('Error al cargar datos');
    }
}

async function saveVendorChanges() {
    const id = document.getElementById('edit-vendor-id').value;
    const name = document.getElementById('edit-vendor-name').value.trim();
    const username = document.getElementById('edit-vendor-username').value;
    const password = document.getElementById('edit-vendor-password').value;
    const email = document.getElementById('edit-vendor-email').value.trim();
    const zone = document.getElementById('edit-vendor-zone').value;
    const status = document.getElementById('edit-vendor-status').value;

    if (!name || !username) {
        alert('Nombre y usuario son obligatorios');
        return;
    }

    try {
        const vendor = await db.get('vendedores', id);
        if (!vendor) {
            alert('Vendedor no encontrado');
            return;
        }
        vendor.name = name;
        if (password) {
            vendor.password = password;
        }
        vendor.email = email;
        vendor.zone = zone;
        vendor.status = status;
        vendor.updatedAt = new Date().toISOString();

        await db.update('vendedores', vendor);
        closeModal('editar-vendedor');
        alert('✅ Vendedor actualizado');
        loadVendorsList();
    } catch (error) {
        console.error('Error al guardar cambios:', error);
        alert('Error al guardar');
    }
}

async function deleteVendor(username) {
    if (!confirm(`¿Estás seguro de eliminar al vendedor ${username}? Esta acción no se puede deshacer.`)) {
        return;
    }
    try {
        const viajes = await db.getViajesByVendedor(username);
        if (viajes.length > 0) {
            if (!confirm('El vendedor tiene viajes registrados. ¿Eliminar también todos sus viajes y gastos?')) {
                return;
            }
            for (const viaje of viajes) {
                const gastos = await db.getGastosByViaje(viaje.id);
                for (const gasto of gastos) {
                    if (gasto.fotos && gasto.fotos.length > 0) {
                        for (const fotoId of gasto.fotos) {
                            await db.delete('fotos', fotoId, false);
                        }
                    }
                    await db.delete('gastos', gasto.id, false);
                }
                await db.delete('viajes', viaje.id, false);
            }
        }
        await db.delete('vendedores', username, false);
        alert('✅ Vendedor eliminado');
        loadVendorsList();
    } catch (error) {
        console.error('Error al eliminar vendedor:', error);
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
    
    loadViajes();
    updateFolioGasto();
}

// ===== NAVEGACIÓN =====
function showSection(sectionName) {
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const sectionEl = document.getElementById(`${sectionName}-section`);
    if (sectionEl) sectionEl.classList.add('active');
    
    if (event && event.target) {
        event.target.closest('.nav-btn').classList.add('active');
    }
    
    if (sectionName === 'viajes') loadViajes();
    if (sectionName === 'gastos') loadGastosSection();
    if (sectionName === 'captura') {
        loadCapturaSection();
        updateFolioGasto();
    }
    if (sectionName === 'reportes') loadReportesSection();
}

// ===== VIAJES =====
async function loadViajes() {
    if (!state.currentVendor) return;
    
    try {
        const viajes = await db.queryByIndex('viajes', 'vendedorId', state.currentVendor.username);
        const container = document.getElementById('viajes-list');
        
        if (viajes.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="icon-large">🗺️</span>
                    <p>No tienes viajes registrados</p>
                    <button class="btn-secondary" onclick="openModal('nuevo-viaje')">
                        Crear primer viaje
                    </button>
                </div>
            `;
            updateViajeSelects([]);
            return;
        }
        
        viajes.sort((a, b) => {
            const fechaA = crearFechaLocal(a.fechaInicio);
            const fechaB = crearFechaLocal(b.fechaInicio);
            return fechaB - fechaA;
        });
        
        container.innerHTML = viajes.map(viaje => {
            const isActive = viaje.estado === 'activo';
            const fechaInicio = formatearFechaMX(viaje.fechaInicio);
            const fechaFin = viaje.fechaFin ? formatearFechaMX(viaje.fechaFin) : 'Sin fecha fin';
            
            return `
                <div class="card" onclick="selectViaje('${viaje.id}')">
                    <div class="card-header">
                        <span class="card-title">${viaje.destino}</span>
                        <span class="card-badge">${isActive ? 'Activo' : 'Completado'}</span>
                    </div>
                    <div class="card-body">
                        <p>${viaje.proposito || 'Sin propósito especificado'}</p>
                    </div>
                    <div class="card-footer">
                        <span>📅 ${fechaInicio} - ${fechaFin}</span>
                        <span onclick="event.stopPropagation(); verGastos('${viaje.id}')">💰 Ver gastos →</span>
                    </div>
                </div>
            `;
        }).join('');
        
        updateViajeSelects(viajes);
        
    } catch (error) {
        console.error('Error loading viajes:', error);
        alert('Error al cargar viajes');
    }
}

function updateViajeSelects(viajes) {
    const options = viajes.map(v => 
        `<option value="${v.id}">${v.destino} (${formatearFechaMX(v.fechaInicio)})</option>`
    ).join('');
    
    const defaultOption = '<option value="">Selecciona un viaje...</option>';
    
    const viajeSelect = document.getElementById('viaje-select');
    const capturaSelect = document.getElementById('captura-viaje-select');
    const reporteSelect = document.getElementById('reporte-viaje-select');
    
    if (viajeSelect) viajeSelect.innerHTML = defaultOption + options;
    if (capturaSelect) capturaSelect.innerHTML = defaultOption + options;
    if (reporteSelect) reporteSelect.innerHTML = '<option value="todos">Todos los viajes</option>' + options;
}

async function crearViaje() {
    const destino = document.getElementById('viaje-destino').value.trim();
    const proposito = document.getElementById('viaje-proposito').value.trim();
    const fechaInicio = document.getElementById('viaje-fecha-inicio').value;
    const fechaFin = document.getElementById('viaje-fecha-fin').value;
    
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
        fechaFin: fechaFin,
        estado: 'activo',
        createdAt: new Date().toISOString()
    };
    
    try {
        await db.add('viajes', viaje);
        closeModal('nuevo-viaje');
        alert('✅ Viaje creado exitosamente');
        
        document.getElementById('viaje-destino').value = '';
        document.getElementById('viaje-proposito').value = '';
        document.getElementById('viaje-fecha-inicio').value = '';
        document.getElementById('viaje-fecha-fin').value = '';
        
        loadViajes();
        
    } catch (error) {
        console.error('Error creating viaje:', error);
        alert('Error al crear viaje');
    }
}

function selectViaje(viajeId) {
    state.currentViaje = viajeId;
    showSection('gastos');
    const viajeSelect = document.getElementById('viaje-select');
    if (viajeSelect) viajeSelect.value = viajeId;
    loadGastos(viajeId);
}

function verGastos(viajeId) {
    selectViaje(viajeId);
}

// ===== GASTOS =====
async function loadGastosSection() {
    const viajeId = document.getElementById('viaje-select').value;
    if (viajeId) {
        await loadGastos(viajeId);
    } else {
        const gastosList = document.getElementById('gastos-list');
        if (gastosList) {
            gastosList.innerHTML = `
                <div class="empty-state">
                    <span class="icon-large">💰</span>
                    <p>Selecciona un viaje para ver sus gastos</p>
                </div>
            `;
        }
        const resumenGastos = document.getElementById('resumen-gastos');
        if (resumenGastos) resumenGastos.style.display = 'none';
    }
}

async function loadGastos(viajeId) {
    try {
        const gastos = await db.getGastosByViaje(viajeId);
        const container = document.getElementById('gastos-list');
        const resumenContainer = document.getElementById('resumen-gastos');
        
        if (gastos.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="icon-large">💰</span>
                    <p>No hay gastos registrados en este viaje</p>
                    <button class="btn-secondary" onclick="showSection('captura')">
                        Registrar primer gasto
                    </button>
                </div>
            `;
            if (resumenContainer) resumenContainer.style.display = 'none';
            return;
        }
        
        gastos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        
        const iconos = {
            gasolina: '⛽', comida: '🍔', hotel: '🏨', 
            transporte: '🚌', casetas: '🛣️', otros: '📦'
        };
        
        container.innerHTML = gastos.map(gasto => {
            const fecha = new Date(gasto.fecha).toLocaleString('es-MX');
            const tieneFotos = gasto.fotos && gasto.fotos.length > 0;
            const tieneGPS = gasto.coordenadas && gasto.coordenadas.lat;
            
            return `
                <div class="card gasto-card ${gasto.tipo}" onclick="verDetalleGasto('${gasto.id}')">
                    <div class="card-header">
                        <div>
                            <span class="gasto-folio">${gasto.folio}</span>
                            <div class="gasto-monto">$${parseFloat(gasto.monto).toFixed(2)}</div>
                            <div class="gasto-tipo">
                                ${iconos[gasto.tipo] || '📦'} ${gasto.tipo.toUpperCase()}
                            </div>
                        </div>
                        <div style="text-align: right;">
                            ${tieneFotos ? '<span style="font-size: 1.2rem;">📷</span>' : ''}
                            ${tieneGPS ? '<span style="font-size: 1.2rem;">📍</span>' : ''}
                        </div>
                    </div>
                    <div class="card-body">
                        <p><strong>${gasto.lugar || 'Sin lugar'}</strong></p>
                        <p>${gasto.notas || ''}</p>
                    </div>
                    <div class="card-footer">
                        <span>📅 ${fecha}</span>
                        <span>👤 ${gasto.vendedorName || ''}</span>
                    </div>
                </div>
            `;
        }).join('');
        
        if (resumenContainer) resumenContainer.style.display = 'block';
        const resumen = await db.getResumenGastos(viajeId);
        
        const totalesGrid = document.getElementById('totales-grid');
        if (totalesGrid) {
            totalesGrid.innerHTML = `
                <div class="total-item">
                    <span class="label">Gasolina</span>
                    <span class="value">$${resumen.gasolina.toFixed(2)}</span>
                </div>
                <div class="total-item">
                    <span class="label">Comida</span>
                    <span class="value">$${resumen.comida.toFixed(2)}</span>
                </div>
                <div class="total-item">
                    <span class="label">Hotel</span>
                    <span class="value">$${resumen.hotel.toFixed(2)}</span>
                </div>
                <div class="total-item">
                    <span class="label">Transporte</span>
                    <span class="value">$${resumen.transporte.toFixed(2)}</span>
                </div>
                <div class="total-item">
                    <span class="label">Casetas</span>
                    <span class="value">$${resumen.casetas.toFixed(2)}</span>
                </div>
                <div class="total-item">
                    <span class="label">Otros</span>
                    <span class="value">$${resumen.otros.toFixed(2)}</span>
                </div>
                <div class="total-item" style="grid-column: span 2; background: linear-gradient(135deg, #E53935 0%, #C62828 100%); color: white;">
                    <span class="label" style="color: rgba(255,255,255,0.9);">TOTAL GENERAL</span>
                    <span class="value total" style="color: white; font-size: 1.5rem;">$${resumen.total.toFixed(2)}</span>
                </div>
            `;
        }
        
    } catch (error) {
        console.error('Error loading gastos:', error);
        alert('Error al cargar gastos');
    }
}

async function verDetalleGasto(gastoId) {
    try {
        const gasto = await db.get('gastos', gastoId);
        if (!gasto) return;
        
        if (gasto.fotos && gasto.fotos.length > 0) {
            const fotos = await Promise.all(gasto.fotos.map(fotoId => db.get('fotos', fotoId)));
            const fotosContainer = document.getElementById('fotos-detalle');
            
            if (fotosContainer) {
                fotosContainer.innerHTML = fotos.map((foto, idx) => `
                    <div class="foto-item">
                        <img src="${foto.imagen}" alt="Foto ${idx + 1}">
                        <div class="foto-label">${foto.tipo.toUpperCase()}</div>
                    </div>
                `).join('');
                
                openModal('fotos');
            }
        }
        
    } catch (error) {
        console.error('Error viewing gasto:', error);
    }
}

// ===== CAPTURA =====
function loadCapturaSection() {
    state.tempFotos = [];
    state.tempLocation = null;
    updateFotosPreview();
    updatePhotoCounts();
    
    const fechaGasto = document.getElementById('fecha-gasto');
    if (fechaGasto) fechaGasto.value = getFechaHoraActualInput();
    
    if (state.currentViaje) {
        const capturaSelect = document.getElementById('captura-viaje-select');
        if (capturaSelect) capturaSelect.value = state.currentViaje;
    }
    
    const gpsCoords = document.getElementById('gps-coords');
    const btnVerMapa = document.getElementById('btn-ver-mapa');
    if (gpsCoords) gpsCoords.textContent = 'Sin ubicación';
    if (btnVerMapa) btnVerMapa.style.display = 'none';
}

function updateFolioGasto() {
    const folioEl = document.getElementById('gasto-folio');
    if (folioEl) {
        const folio = 'G-' + Date.now().toString().slice(-8);
        folioEl.value = folio;
    }
}

function selectTipoGasto(btn) {
    document.querySelectorAll('.tipo-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
}

async function getGPSLocation() {
    alert('Obteniendo ubicación...');
    
    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            });
        });
        
        state.tempLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy
        };
        
        const gpsCoords = document.getElementById('gps-coords');
        const btnVerMapa = document.getElementById('btn-ver-mapa');
        
        if (gpsCoords) {
            gpsCoords.textContent = `${state.tempLocation.lat.toFixed(6)}, ${state.tempLocation.lng.toFixed(6)}`;
        }
        if (btnVerMapa) btnVerMapa.style.display = 'inline-block';
        
        alert('✅ Ubicación obtenida con éxito');
        
    } catch (error) {
        console.error('GPS error:', error);
        alert('No se pudo obtener la ubicación. Verifica permisos.');
    }
}

function openMap() {
    if (!state.tempLocation) return;
    
    const { lat, lng } = state.tempLocation;
    const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
    
    const mapaIframe = document.getElementById('mapa-iframe');
    const mapaInfo = document.getElementById('mapa-info');
    
    if (mapaIframe) mapaIframe.src = mapsUrl;
    if (mapaInfo) {
        mapaInfo.innerHTML = `
            <strong>Coordenadas:</strong> ${lat.toFixed(6)}, ${lng.toFixed(6)}<br>
            <a href="${mapsUrl}" target="_blank">Abrir en Google Maps</a>
        `;
    }
    
    openModal('mapa');
}

let currentPhotoType = '';

function capturePhoto(tipo) {
    currentPhotoType = tipo;
    const cameraInput = document.getElementById('camera-input');
    if (cameraInput) cameraInput.click();
}

async function handlePhotoCapture(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
        alert('Procesando foto...');
        
        const base64 = await fileToBase64(file);
        const compressedBase64 = await compressImage(base64, 1200);
        
        const foto = {
            id: 'FOTO_' + Date.now(),
            tipo: currentPhotoType,
            imagen: compressedBase64,
            fecha: new Date().toISOString()
        };
        
        state.tempFotos.push(foto);
        updateFotosPreview();
        updatePhotoCounts();
        
        alert('✅ Foto agregada');
        
    } catch (error) {
        console.error('Error processing photo:', error);
        alert('Error al procesar foto');
    }
    
    e.target.value = '';
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function compressImage(base64, maxWidth) {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = base64;
        img.onload = () => {
            if (img.width <= maxWidth) {
                resolve(base64);
                return;
            }
            
            const canvas = document.createElement('canvas');
            const scale = maxWidth / img.width;
            canvas.width = maxWidth;
            canvas.height = img.height * scale;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
    });
}

function updateFotosPreview() {
    const container = document.getElementById('preview-fotos');
    if (!container) return;
    
    if (state.tempFotos.length === 0) {
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = state.tempFotos.map((foto, index) => `
        <div class="preview-item">
            <img src="${foto.imagen}" alt="Foto ${index + 1}">
            <button class="remove-btn" onclick="removeFoto(${index})">×</button>
            <div style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(229,57,53,0.9); color: white; font-size: 0.7rem; padding: 2px; text-align: center; text-transform: uppercase;">
                ${foto.tipo}
            </div>
        </div>
    `).join('');
}

function updatePhotoCounts() {
    const counts = { factura: 0, nota_remision: 0, ticket: 0, otro: 0 };
    state.tempFotos.forEach(f => {
        if (counts.hasOwnProperty(f.tipo)) counts[f.tipo]++;
    });
    
    const countFactura = document.getElementById('count-factura');
    const countNota = document.getElementById('count-nota_remision');
    const countTicket = document.getElementById('count-ticket');
    const countOtro = document.getElementById('count-otro');
    
    if (countFactura) countFactura.textContent = counts.factura;
    if (countNota) countNota.textContent = counts.nota_remision;
    if (countTicket) countTicket.textContent = counts.ticket;
    if (countOtro) countOtro.textContent = counts.otro;
}

function removeFoto(index) {
    state.tempFotos.splice(index, 1);
    updateFotosPreview();
    updatePhotoCounts();
}

async function guardarGasto() {
    const viajeId = document.getElementById('captura-viaje-select').value;
    const tipoBtn = document.querySelector('.tipo-btn.selected');
    const monto = document.getElementById('monto-gasto').value;
    const fecha = document.getElementById('fecha-gasto').value;
    const lugar = document.getElementById('lugar-gasto').value.trim();
    const notas = document.getElementById('notas-gasto').value.trim();
    const folio = document.getElementById('gasto-folio').value;
    
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
    
    const tipo = tipoBtn.dataset.tipo;
    
    const gasto = {
        id: 'GASTO_' + Date.now(),
        folio: folio,
        viajeId: viajeId,
        vendedorId: state.currentVendor.username,
        vendedorName: state.currentVendor.name,
        tipo: tipo,
        monto: parseFloat(monto),
        fecha: fecha || new Date().toISOString(),
        lugar: lugar,
        notas: notas,
        coordenadas: state.tempLocation,
        fotos: [],
        createdAt: new Date().toISOString()
    };
    
    try {
        for (const foto of state.tempFotos) {
            foto.gastoId = gasto.id;
            foto.viajeId = viajeId;
            await db.add('fotos', foto);
            gasto.fotos.push(foto.id);
        }
        
        await db.add('gastos', gasto);
        
        document.getElementById('monto-gasto').value = '';
        document.getElementById('lugar-gasto').value = '';
        document.getElementById('notas-gasto').value = '';
        document.querySelectorAll('.tipo-btn').forEach(b => b.classList.remove('selected'));
        state.tempFotos = [];
        state.tempLocation = null;
        updateFotosPreview();
        updatePhotoCounts();
        updateFolioGasto();
        
        const gpsCoords = document.getElementById('gps-coords');
        const btnVerMapa = document.getElementById('btn-ver-mapa');
        if (gpsCoords) gpsCoords.textContent = 'Sin ubicación';
        if (btnVerMapa) btnVerMapa.style.display = 'none';
        
        alert(`✅ Gasto ${folio} guardado exitosamente`);
        state.currentViaje = viajeId;
        
    } catch (error) {
        console.error('Error saving gasto:', error);
        alert('Error al guardar gasto');
    }
}

// ===== REPORTES =====
function loadReportesSection() {
    const today = new Date().toISOString().split('T')[0];
    const fechaFin = document.getElementById('fecha-fin');
    if (fechaFin) fechaFin.value = today;
    
    const inicioMes = new Date();
    inicioMes.setDate(1);
    const fechaInicio = document.getElementById('fecha-inicio');
    if (fechaInicio) fechaInicio.value = inicioMes.toISOString().split('T')[0];
    
    if (state.lastReport) {
        const lastReportInfo = document.getElementById('last-report-info');
        const btnCompartir = document.getElementById('btn-compartir');
        
        if (lastReportInfo) {
            lastReportInfo.textContent = `Último: ${state.lastReport.fecha} - ${state.lastReport.viajes} viajes, ${state.lastReport.gastos} gastos`;
        }
        if (btnCompartir) btnCompartir.disabled = false;
    }
}

async function generarReporteZIP() {
    const viajeId = document.getElementById('reporte-viaje-select').value;
    const fechaInicio = document.getElementById('fecha-inicio').value;
    const fechaFin = document.getElementById('fecha-fin').value;
    
    if (!fechaInicio || !fechaFin) {
        alert('Selecciona el rango de fechas');
        return;
    }
    
    try {
        alert('Generando reporte...');
        
        const data = await db.exportAllData(viajeId === 'todos' ? null : viajeId);
        
        let gastos = data.gastos;
        const start = new Date(fechaInicio);
        const end = new Date(fechaFin);
        end.setHours(23, 59, 59);
        
        gastos = gastos.filter(g => {
            const fecha = new Date(g.fecha);
            return fecha >= start && fecha <= end;
        });
        
        if (gastos.length === 0) {
            alert('No hay gastos en el período seleccionado');
            return;
        }
        
        const zip = new JSZip();
        const folderName = `Reporte_3P_${state.currentVendor.name.replace(/\s+/g, '_')}_${fechaInicio}`;
        const mainFolder = zip.folder(folderName);
        
        const wb = XLSX.utils.book_new();
        
        const portadaData = [
            ['3P S.A. DE C.V.'],
            ['SISTEMA DE CONTROL DE GASTOS'],
            [''],
            ['REPORTE DE GASTOS DE VIAJE'],
            [''],
            ['Vendedor:', state.currentVendor.name],
            ['Usuario:', '@' + state.currentVendor.username],
            ['Zona:', state.currentVendor.zone],
            ['Período:', `${fechaInicio} a ${fechaFin}`],
            ['Fecha de generación:', new Date().toLocaleString('es-MX')],
            [''],
            ['RESUMEN EJECUTIVO'],
            ['']
        ];
        
        const totales = {};
        gastos.forEach(g => {
            totales[g.tipo] = (totales[g.tipo] || 0) + parseFloat(g.monto);
        });
        
        Object.entries(totales).forEach(([tipo, total]) => {
            portadaData.push([tipo.toUpperCase(), `$${total.toFixed(2)}`]);
        });
        
        portadaData.push(['']);
        portadaData.push(['TOTAL GENERAL', `$${Object.values(totales).reduce((a, b) => a + b, 0).toFixed(2)}`]);
        
        const wsPortada = XLSX.utils.aoa_to_sheet(portadaData);
        XLSX.utils.book_append_sheet(wb, wsPortada, 'Portada');
        
        const detalleData = [
            ['FOLIO', 'FECHA', 'TIPO', 'MONTO', 'LUGAR', 'VENDEDOR', 'COORDENADAS', 'NOTAS', 'FOTOS']
        ];
        
        gastos.forEach(gasto => {
            detalleData.push([
                gasto.folio,
                new Date(gasto.fecha).toLocaleString('es-MX'),
                gasto.tipo.toUpperCase(),
                parseFloat(gasto.monto),
                gasto.lugar || '',
                gasto.vendedorName,
                gasto.coordenadas ? `${gasto.coordenadas.lat}, ${gasto.coordenadas.lng}` : '',
                gasto.notas || '',
                gasto.fotos ? gasto.fotos.length : 0
            ]);
        });
        
        const wsDetalle = XLSX.utils.aoa_to_sheet(detalleData);
        XLSX.utils.book_append_sheet(wb, wsDetalle, 'Detalle de Gastos');
        
        const viajesData = [
            ['ID', 'DESTINO', 'PROPÓSITO', 'FECHA INICIO', 'FECHA FIN', 'ESTADO']
        ];
        
        data.viajes.forEach(viaje => {
            viajesData.push([
                viaje.id,
                viaje.destino,
                viaje.proposito || '',
                viaje.fechaInicio,
                viaje.fechaFin || '',
                viaje.estado
            ]);
        });
        
        const wsViajes = XLSX.utils.aoa_to_sheet(viajesData);
        XLSX.utils.book_append_sheet(wb, wsViajes, 'Viajes');
        
        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        mainFolder.file(`${folderName}.xlsx`, excelBuffer);
        
        const fotosFolder = mainFolder.folder('EVIDENCIAS_FOTOGRAFICAS');
        
        const fotosPorTipo = { factura: [], nota_remision: [], ticket: [], otro: [] };
        
        for (const gasto of gastos) {
            if (gasto.fotos && gasto.fotos.length > 0) {
                for (const fotoId of gasto.fotos) {
                    const foto = await db.get('fotos', fotoId);
                    if (foto) {
                        const tipo = foto.tipo || 'otro';
                        const base64Data = foto.imagen.split(',')[1];
                        const fileName = `${gasto.folio}_${tipo}_${fotoId.slice(-6)}.jpg`;
                        
                        fotosPorTipo[tipo].push({
                            name: fileName,
                            data: base64Data,
                            gastoFolio: gasto.folio
                        });
                    }
                }
            }
        }
        
        Object.entries(fotosPorTipo).forEach(([tipo, fotos]) => {
            if (fotos.length > 0) {
                const tipoFolder = fotosFolder.folder(tipo.toUpperCase());
                fotos.forEach(foto => {
                    tipoFolder.file(foto.name, foto.data, { base64: true });
                });
            }
        });
        
        let relacionTexto = `3P S.A. DE C.V. - RELACIÓN DE GASTOS Y EVIDENCIAS\n`;
        relacionTexto += `================================================\n\n`;
        relacionTexto += `Vendedor: ${state.currentVendor.name}\n`;
        relacionTexto += `Período: ${fechaInicio} a ${fechaFin}\n\n`;
        relacionTexto += `RELACIÓN DE GASTOS CON SUS EVIDENCIAS:\n\n`;
        
        gastos.forEach(gasto => {
            relacionTexto += `FOLIO: ${gasto.folio}\n`;
            relacionTexto += `  Fecha: ${new Date(gasto.fecha).toLocaleString('es-MX')}\n`;
            relacionTexto += `  Tipo: ${gasto.tipo.toUpperCase()}\n`;
            relacionTexto += `  Monto: $${parseFloat(gasto.monto).toFixed(2)}\n`;
            relacionTexto += `  Lugar: ${gasto.lugar || 'N/A'}\n`;
            if (gasto.fotos && gasto.fotos.length > 0) {
                relacionTexto += `  Fotos: ${gasto.fotos.length} archivo(s) en carpeta EVIDENCIAS_FOTOGRAFICAS/\n`;
            }
            relacionTexto += `\n`;
        });
        
        mainFolder.file('RELACION_GASTOS.txt', relacionTexto);
        
        const zipContent = await zip.generateAsync({ type: 'blob' });
        
        const url = URL.createObjectURL(zipContent);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${folderName}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        state.lastReport = {
            fecha: new Date().toLocaleString('es-MX'),
            viajes: data.viajes.length,
            gastos: gastos.length
        };
        
        const lastReportInfo = document.getElementById('last-report-info');
        const btnCompartir = document.getElementById('btn-compartir');
        
        if (lastReportInfo) {
            lastReportInfo.textContent = `Último: ${state.lastReport.fecha} - ${state.lastReport.viajes} viajes, ${state.lastReport.gastos} gastos`;
        }
        if (btnCompartir) btnCompartir.disabled = false;
        
        alert('✅ Reporte generado exitosamente');
        
    } catch (error) {
        console.error('Error generating report:', error);
        alert('Error al generar reporte');
    }
}

async function compartirUltimoReporte() {
    if (!state.lastReport) {
        alert('No hay reportes generados');
        return;
    }
    
    const message = `*Reporte de Gastos 3P S.A. DE C.V.*\n\n` +
        `Vendedor: ${state.currentVendor.name}\n` +
        `Generado: ${state.lastReport.fecha}\n` +
        `Viajes: ${state.lastReport.viajes}\n` +
        `Gastos: ${state.lastReport.gastos}\n\n` +
        `_Reporte completo disponible en la aplicación_`;
    
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
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
    if (!online) {
        alert('Modo offline - Los datos se guardarán localmente');
    }
}

/**
 * 3P VIAJESPRO - Main Application
 * Sistema completo de control de gastos
 */

// ===== CONFIGURACIÓN =====
const CONFIG = {
    ADMIN_USER: 'admin',
    ADMIN_PASS: 'admin123', // Cambiar en producción
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
    checkSession();
    setupEventListeners();
    updateConnectionStatus();
    
    window.addEventListener('online', () => updateConnectionStatus(true));
    window.addEventListener('offline', () => updateConnectionStatus(false));
});

function checkSession() {
    const savedSession = localStorage.getItem('viajespro_session');
    if (savedSession) {
        const session = JSON.parse(savedSession);
        if (session.remember && session.user) {
            state.currentUser = session.user;
            state.currentVendor = session.vendor;
            showMainApp();
            return;
        }
    }
    showLoginScreen();
}

function setupEventListeners() {
    // Camera input
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
        showLoginError('Ingresa usuario y contraseña');
        return;
    }
    
    try {
        const vendor = await db.get('vendedores', username);
        
        if (!vendor || vendor.password !== password) {
            showLoginError('Usuario o contraseña incorrectos');
            return;
        }
        
        if (vendor.status === 'inactive') {
            showLoginError('Usuario inactivo. Contacta al administrador');
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
        showLoginError('Error al iniciar sesión');
    }
}

function showLoginError(message) {
    document.getElementById('login-error').textContent = message;
}

async function loginAdmin() {
    const username = document.getElementById('admin-username').value;
    const password = document.getElementById('admin-password').value;
    
    if (username === CONFIG.ADMIN_USER && password === CONFIG.ADMIN_PASS) {
        state.currentUser = { username, type: 'admin' };
        showAdminPanel();
    } else {
        document.getElementById('admin-login-error').textContent = 'Credenciales incorrectas';
    }
}

function logout() {
    localStorage.removeItem('viajespro_session');
    state.currentUser = null;
    state.currentVendor = null;
    state.currentViaje = null;
    location.reload();
}

// ===== ADMIN PANEL =====
function showAdminPanel() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-login-screen').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'block';
    document.getElementById('app').style.display = 'none';
    
    loadVendorsList();
}

async function registerVendor() {
    const name = document.getElementById('new-vendor-name').value.trim();
    const username = document.getElementById('new-vendor-username').value.trim().toLowerCase();
    const password = document.getElementById('new-vendor-password').value;
    const email = document.getElementById('new-vendor-email').value.trim();
    const zone = document.getElementById('new-vendor-zone').value;
    
    if (!name || !username || !password) {
        showToast('Nombre, usuario y contraseña son obligatorios', 'error');
        return;
    }
    
    // Validar username (solo letras, números, puntos)
    if (!/^[a-z0-9.]+$/.test(username)) {
        showToast('Usuario solo puede contener letras minúsculas, números y puntos', 'error');
        return;
    }
    
    try {
        // Verificar si ya existe
        const existing = await db.get('vendedores', username);
        if (existing) {
            showToast('Este nombre de usuario ya existe', 'error');
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
        
        await db.add('vendedores', vendor);
        
        showToast('Vendedor registrado exitosamente', 'success');
        
        // Limpiar formulario
        document.getElementById('new-vendor-name').value = '';
        document.getElementById('new-vendor-username').value = '';
        document.getElementById('new-vendor-password').value = '';
        document.getElementById('new-vendor-email').value = '';
        
        loadVendorsList();
        
    } catch (error) {
        console.error('Error registering vendor:', error);
        showToast('Error al registrar vendedor', 'error');
    }
}

async function loadVendorsList() {
    try {
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
                <button class="btn-secondary btn-small" onclick="toggleVendorStatus('${v.username}', '${v.status}')">
                    ${v.status === 'active' ? 'Desactivar' : 'Activar'}
                </button>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error loading vendors:', error);
    }
}

async function toggleVendorStatus(username, currentStatus) {
    try {
        const vendor = await db.get('vendedores', username);
        vendor.status = currentStatus === 'active' ? 'inactive' : 'active';
        vendor.updatedAt = new Date().toISOString();
        
        await db.update('vendedores', vendor);
        showToast(`Vendedor ${vendor.status === 'active' ? 'activado' : 'desactivado'}`, 'success');
        loadVendorsList();
        
    } catch (error) {
        console.error('Error toggling vendor status:', error);
        showToast('Error al cambiar estado', 'error');
    }
}

// ===== MAIN APP =====
function showMainApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-login-screen').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    
    // Mostrar nombre de usuario
    document.getElementById('current-user-name').textContent = state.currentVendor?.name || 'Vendedor';
    
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
    
    document.getElementById(`${sectionName}-section`).classList.add('active');
    
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
        
        viajes.sort((a, b) => new Date(b.fechaInicio) - new Date(a.fechaInicio));
        
        container.innerHTML = viajes.map(viaje => {
            const isActive = viaje.estado === 'activo';
            const fechaInicio = new Date(viaje.fechaInicio).toLocaleDateString('es-MX');
            const fechaFin = viaje.fechaFin ? new Date(viaje.fechaFin).toLocaleDateString('es-MX') : 'Sin fecha fin';
            
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
        showToast('Error al cargar viajes', 'error');
    }
}

function updateViajeSelects(viajes) {
    const options = viajes.map(v => 
        `<option value="${v.id}">${v.destino} (${new Date(v.fechaInicio).toLocaleDateString('es-MX')})</option>`
    ).join('');
    
    const defaultOption = '<option value="">Selecciona un viaje...</option>';
    
    document.getElementById('viaje-select').innerHTML = defaultOption + options;
    document.getElementById('captura-viaje-select').innerHTML = defaultOption + options;
    document.getElementById('reporte-viaje-select').innerHTML = '<option value="todos">Todos los viajes</option>' + options;
}

async function crearViaje() {
    const destino = document.getElementById('viaje-destino').value.trim();
    const proposito = document.getElementById('viaje-proposito').value.trim();
    const fechaInicio = document.getElementById('viaje-fecha-inicio').value;
    const fechaFin = document.getElementById('viaje-fecha-fin').value;
    
    if (!destino || !fechaInicio) {
        showToast('Destino y fecha de inicio son obligatorios', 'error');
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
        showToast('Viaje creado exitosamente', 'success');
        
        document.getElementById('viaje-destino').value = '';
        document.getElementById('viaje-proposito').value = '';
        
        loadViajes();
        
    } catch (error) {
        console.error('Error creating viaje:', error);
        showToast('Error al crear viaje', 'error');
    }
}

function selectViaje(viajeId) {
    state.currentViaje = viajeId;
    showSection('gastos');
    document.getElementById('viaje-select').value = viajeId;
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
        document.getElementById('gastos-list').innerHTML = `
            <div class="empty-state">
                <span class="icon-large">💰</span>
                <p>Selecciona un viaje para ver sus gastos</p>
            </div>
        `;
        document.getElementById('resumen-gastos').style.display = 'none';
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
            resumenContainer.style.display = 'none';
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
        
        resumenContainer.style.display = 'block';
        const resumen = await db.getResumenGastos(viajeId);
        
        document.getElementById('totales-grid').innerHTML = `
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
        
    } catch (error) {
        console.error('Error loading gastos:', error);
        showToast('Error al cargar gastos', 'error');
    }
}

async function verDetalleGasto(gastoId) {
    try {
        const gasto = await db.get('gastos', gastoId);
        if (!gasto) return;
        
        // Mostrar fotos si tiene
        if (gasto.fotos && gasto.fotos.length > 0) {
            const fotos = await Promise.all(gasto.fotos.map(fotoId => db.get('fotos', fotoId)));
            const fotosContainer = document.getElementById('fotos-detalle');
            
            fotosContainer.innerHTML = fotos.map((foto, idx) => `
                <div class="foto-item">
                    <img src="${foto.imagen}" alt="Foto ${idx + 1}">
                    <div class="foto-label">${foto.tipo.toUpperCase()}</div>
                </div>
            `).join('');
            
            openModal('fotos');
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
    
    // Set fecha actual
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('fecha-gasto').value = now.toISOString().slice(0, 16);
    
    if (state.currentViaje) {
        document.getElementById('captura-viaje-select').value = state.currentViaje;
    }
    
    document.getElementById('gps-coords').textContent = 'Sin ubicación';
    document.getElementById('btn-ver-mapa').style.display = 'none';
}

function updateFolioGasto() {
    const folio = 'G-' + Date.now().toString().slice(-8);
    document.getElementById('gasto-folio').value = folio;
}

function selectTipoGasto(btn) {
    document.querySelectorAll('.tipo-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
}

async function getGPSLocation() {
    showToast('Obteniendo ubicación...', 'success');
    
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
        
        document.getElementById('gps-coords').textContent = 
            `${state.tempLocation.lat.toFixed(6)}, ${state.tempLocation.lng.toFixed(6)}`;
        document.getElementById('btn-ver-mapa').style.display = 'inline-block';
        
        showToast('Ubicación obtenida con éxito', 'success');
        
    } catch (error) {
        console.error('GPS error:', error);
        showToast('No se pudo obtener la ubicación. Verifica permisos.', 'error');
    }
}

function openMap() {
    if (!state.tempLocation) return;
    
    const { lat, lng } = state.tempLocation;
    const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
    
    document.getElementById('mapa-iframe').src = mapsUrl;
    document.getElementById('mapa-info').innerHTML = `
        <strong>Coordenadas:</strong> ${lat.toFixed(6)}, ${lng.toFixed(6)}<br>
        <a href="${mapsUrl}" target="_blank">Abrir en Google Maps</a>
    `;
    
    openModal('mapa');
}

let currentPhotoType = '';

function capturePhoto(tipo) {
    currentPhotoType = tipo;
    document.getElementById('camera-input').click();
}

async function handlePhotoCapture(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
        showToast('Procesando foto...', 'success');
        
        const base64 = await fileToBase64(file);
        
        // Comprimir imagen si es muy grande
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
        
        showToast('Foto agregada', 'success');
        
    } catch (error) {
        console.error('Error processing photo:', error);
        showToast('Error al procesar foto', 'error');
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
    
    document.getElementById('count-factura').textContent = counts.factura;
    document.getElementById('count-nota_remision').textContent = counts.nota_remision;
    document.getElementById('count-ticket').textContent = counts.ticket;
    document.getElementById('count-otro').textContent = counts.otro;
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
        showToast('Selecciona un viaje', 'error');
        return;
    }
    
    if (!tipoBtn) {
        showToast('Selecciona el tipo de gasto', 'error');
        return;
    }
    
    if (!monto || parseFloat(monto) <= 0) {
        showToast('Ingresa un monto válido', 'error');
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
        // Guardar fotos primero
        for (const foto of state.tempFotos) {
            foto.gastoId = gasto.id;
            foto.viajeId = viajeId;
            await db.add('fotos', foto);
            gasto.fotos.push(foto.id);
        }
        
        await db.add('gastos', gasto);
        
        // Limpiar formulario
        document.getElementById('monto-gasto').value = '';
        document.getElementById('lugar-gasto').value = '';
        document.getElementById('notas-gasto').value = '';
        document.querySelectorAll('.tipo-btn').forEach(b => b.classList.remove('selected'));
        state.tempFotos = [];
        state.tempLocation = null;
        updateFotosPreview();
        updatePhotoCounts();
        updateFolioGasto();
        
        document.getElementById('gps-coords').textContent = 'Sin ubicación';
        document.getElementById('btn-ver-mapa').style.display = 'none';
        
        showToast(`Gasto ${folio} guardado exitosamente`, 'success');
        state.currentViaje = viajeId;
        
    } catch (error) {
        console.error('Error saving gasto:', error);
        showToast('Error al guardar gasto', 'error');
    }
}

// ===== REPORTES =====
function loadReportesSection() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('fecha-fin').value = today;
    
    // Calcular inicio de mes
    const inicioMes = new Date();
    inicioMes.setDate(1);
    document.getElementById('fecha-inicio').value = inicioMes.toISOString().split('T')[0];
    
    // Actualizar info de último reporte
    if (state.lastReport) {
        document.getElementById('last-report-info').textContent = 
            `Último: ${state.lastReport.fecha} - ${state.lastReport.viajes} viajes, ${state.lastReport.gastos} gastos`;
        document.getElementById('btn-compartir').disabled = false;
    }
}

async function generarReporteZIP() {
    const viajeId = document.getElementById('reporte-viaje-select').value;
    const fechaInicio = document.getElementById('fecha-inicio').value;
    const fechaFin = document.getElementById('fecha-fin').value;
    
    if (!fechaInicio || !fechaFin) {
        showToast('Selecciona el rango de fechas', 'error');
        return;
    }
    
    try {
        showToast('Generando reporte profesional...', 'success');
        
        // Obtener datos
        const data = await db.exportAllData(viajeId === 'todos' ? null : viajeId);
        
        // Filtrar por fecha
        let gastos = data.gastos;
        const start = new Date(fechaInicio);
        const end = new Date(fechaFin);
        end.setHours(23, 59, 59);
        
        gastos = gastos.filter(g => {
            const fecha = new Date(g.fecha);
            return fecha >= start && fecha <= end;
        });
        
        if (gastos.length === 0) {
            showToast('No hay gastos en el período seleccionado', 'error');
            return;
        }
        
        // Crear ZIP
        const zip = new JSZip();
        const folderName = `Reporte_3P_${state.currentVendor.name.replace(/\s+/g, '_')}_${fechaInicio}`;
        const mainFolder = zip.folder(folderName);
        
        // 1. Crear Excel profesional
        const wb = XLSX.utils.book_new();
        
        // Hoja 1: Portada
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
        
        // Hoja 2: Detalle de Gastos
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
        
        // Hoja 3: Viajes
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
        
        // Guardar Excel en ZIP
        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        mainFolder.file(`${folderName}.xlsx`, excelBuffer);
        
        // 2. Crear carpeta de fotos
        const fotosFolder = mainFolder.folder('EVIDENCIAS_FOTOGRAFICAS');
        
        // Organizar fotos por tipo
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
        
        // Guardar fotos organizadas
        Object.entries(fotosPorTipo).forEach(([tipo, fotos]) => {
            if (fotos.length > 0) {
                const tipoFolder = fotosFolder.folder(tipo.toUpperCase());
                fotos.forEach(foto => {
                    tipoFolder.file(foto.name, foto.data, { base64: true });
                });
            }
        });
        
        // 3. Crear archivo de relación (TXT)
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
        
        // Generar ZIP
        const zipContent = await zip.generateAsync({ type: 'blob' });
        
        // Descargar
        const url = URL.createObjectURL(zipContent);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${folderName}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        // Guardar referencia para compartir
        state.lastReport = {
            fecha: new Date().toLocaleString('es-MX'),
            viajes: data.viajes.length,
            gastos: gastos.length,
            blob: zipContent,
            filename: `${folderName}.zip`
        };
        
        document.getElementById('last-report-info').textContent = 
            `Último: ${state.lastReport.fecha} - ${gastos.length} gastos`;
        document.getElementById('btn-compartir').disabled = false;
        
        showToast('✅ Reporte generado y descargado', 'success');
        
    } catch (error) {
        console.error('Error generating report:', error);
        showToast('Error al generar reporte', 'error');
    }
}

async function compartirUltimoReporte() {
    if (!state.lastReport) {
        showToast('No hay reporte para compartir', 'error');
        return;
    }
    
    try {
        const file = new File([state.lastReport.blob], state.lastReport.filename, {
            type: 'application/zip'
        });
        
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                title: 'Reporte de Gastos 3P',
                text: `Reporte de gastos de ${state.currentVendor.name}`,
                files: [file]
            });
        } else {
            // Fallback: descargar de nuevo
            const url = URL.createObjectURL(state.lastReport.blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = state.lastReport.filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            showToast('Reporte descargado. Adjúntalo manualmente en WhatsApp/Email.', 'success');
        }
        
    } catch (error) {
        console.error('Error sharing:', error);
        showToast('Error al compartir. Intenta descargar manualmente.', 'error');
    }
}

async function respaldoDatos() {
    try {
        showToast('Preparando respaldo...', 'success');
        
        const data = await db.exportAllData();
        const dataStr = JSON.stringify(data, null, 2);
        
        // Crear archivo de texto descargable
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `Respaldo_3P_${state.currentVendor.username}_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        showToast('✅ Respaldo descargado', 'success');
        
    } catch (error) {
        console.error('Error creating backup:', error);
        showToast('Error al crear respaldo', 'error');
    }
}

// ===== UTILIDADES =====
function openModal(modalId) {
    document.getElementById(`modal-${modalId}`).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(`modal-${modalId}`).classList.remove('active');
}

function showToast(message, type = 'success') {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

function updateConnectionStatus(online = navigator.onLine) {
    state.isOnline = online;
    // Actualizar UI si es necesario
}

// Cerrar modales al hacer clic fuera
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
    }
});

console.log('🐷🐔 3P ViajesPro v2.0 loaded');

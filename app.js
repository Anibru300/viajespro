/**
 * VIAJESPRO - Main Application
 * Expense tracking app for sales representatives
 */

// ===== GLOBAL STATE =====
const state = {
    currentVendedor: {
        id: 'V001',
        nombre: 'Vendedor Demo',
        email: 'vendedor@empresa.com'
    },
    currentViaje: null,
    tempFotos: [],
    isOnline: navigator.onLine
};

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', async () => {
    if (!window.db) {
        window.addEventListener('dbReady', initApp);
    } else {
        initApp();
    }
});

async function initApp() {
    console.log('🚀 Initializing ViajesPro...');
    
    updateConnectionStatus();
    window.addEventListener('online', () => updateConnectionStatus(true));
    window.addEventListener('offline', () => updateConnectionStatus(false));
    
    await initVendedor();
    await loadViajes();
    setupCamera();
    setDefaultDates();
    
    setTimeout(() => {
        document.getElementById('loading-screen').style.display = 'none';
        document.getElementById('app').style.display = 'block';
    }, 1000);
    
    console.log('✅ App initialized');
}

async function initVendedor() {
    try {
        const vendedor = await db.get('vendedores', state.currentVendedor.id);
        if (!vendedor) {
            await db.add('vendedores', state.currentVendedor);
            console.log('✅ Vendedor created');
        }
    } catch (error) {
        console.error('Error initializing vendedor:', error);
    }
}

function updateConnectionStatus(online = navigator.onLine) {
    state.isOnline = online;
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');
    
    if (online) {
        statusDot.classList.remove('offline');
        statusDot.classList.add('online');
        statusText.textContent = 'Online';
    } else {
        statusDot.classList.remove('online');
        statusDot.classList.add('offline');
        statusText.textContent = 'Offline';
    }
}

function setDefaultDates() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('viaje-fecha-inicio').value = today;
    document.getElementById('fecha-inicio').value = today;
    document.getElementById('fecha-fin').value = today;
}

// ===== NAVIGATION =====
function showSection(sectionName) {
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.getElementById(`${sectionName}-section`).classList.add('active');
    event.target.closest('.nav-btn').classList.add('active');
    
    if (sectionName === 'viajes') loadViajes();
    if (sectionName === 'gastos') loadGastosSection();
    if (sectionName === 'captura') loadCapturaSection();
    if (sectionName === 'reportes') loadReportesSection();
}

// ===== VIAJES MANAGEMENT =====
async function loadViajes() {
    try {
        const viajes = await db.queryByIndex('viajes', 'vendedorId', state.currentVendedor.id);
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
    
    document.getElementById('viaje-select').innerHTML = '<option value="">Selecciona un viaje...</option>' + options;
    document.getElementById('captura-viaje-select').innerHTML = '<option value="">Selecciona un viaje...</option>' + options;
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
        vendedorId: state.currentVendedor.id,
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

// ===== GASTOS MANAGEMENT =====
async function loadGastosSection() {
    const viajeId = document.getElementById('viaje-select').value;
    if (viajeId) {
        await loadGastos(viajeId);
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
            
            return `
                <div class="card gasto-card ${gasto.tipo}">
                    <div class="card-header">
                        <div>
                            <span class="gasto-monto">$${parseFloat(gasto.monto).toFixed(2)}</span>
                            <div class="gasto-tipo">
                                ${iconos[gasto.tipo] || '📦'} ${gasto.tipo.toUpperCase()}
                            </div>
                        </div>
                        <span class="card-badge">${gasto.fotos?.length || 0} 📷</span>
                    </div>
                    <div class="card-body">
                        <p><strong>${gasto.lugar || 'Sin lugar'}</strong></p>
                        <p>${gasto.notas || ''}</p>
                    </div>
                    <div class="card-footer">
                        <span>📅 ${fecha}</span>
                        <span>📍 ${gasto.coordenadas ? 'GPS ✓' : 'Sin GPS'}</span>
                    </div>
                </div>
            `;
        }).join('');
        
        resumenContainer.style.display = 'block';
        const resumen = await db.getResumenGastos(viajeId);
        
        document.getElementById('total-gasolina').textContent = `$${resumen.gasolina.toFixed(2)}`;
        document.getElementById('total-comida').textContent = `$${resumen.comida.toFixed(2)}`;
        document.getElementById('total-hotel').textContent = `$${resumen.hotel.toFixed(2)}`;
        document.getElementById('total-general').textContent = `$${resumen.total.toFixed(2)}`;
        
    } catch (error) {
        console.error('Error loading gastos:', error);
        showToast('Error al cargar gastos', 'error');
    }
}

// ===== CAPTURA RÁPIDA =====
function loadCapturaSection() {
    state.tempFotos = [];
    updateFotosPreview();
    
    if (state.currentViaje) {
        document.getElementById('captura-viaje-select').value = state.currentViaje;
    }
}

function selectTipoGasto(btn) {
    document.querySelectorAll('.tipo-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
}

function setupCamera() {
    const cameraInput = document.getElementById('camera-input');
    
    cameraInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            const base64 = await fileToBase64(file);
            const coordenadas = await getCurrentPosition();
            
            state.tempFotos.push({
                id: 'FOTO_' + Date.now(),
                tipo: cameraInput.dataset.tipo || 'otro',
                imagen: base64,
                coordenadas: coordenadas,
                fecha: new Date().toISOString()
            });
            
            updateFotosPreview();
            showToast('Foto capturada', 'success');
            
        } catch (error) {
            console.error('Error processing photo:', error);
            showToast('Error al procesar foto', 'error');
        }
        
        cameraInput.value = '';
    });
}

function capturePhoto(tipo) {
    const cameraInput = document.getElementById('camera-input');
    cameraInput.dataset.tipo = tipo;
    cameraInput.click();
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function getCurrentPosition() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve(null);
            return;
        }
        
        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy
                });
            },
            () => resolve(null),
            { timeout: 5000 }
        );
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
        </div>
    `).join('');
}

function removeFoto(index) {
    state.tempFotos.splice(index, 1);
    updateFotosPreview();
}

async function guardarGasto() {
    const viajeId = document.getElementById('captura-viaje-select').value;
    const tipoBtn = document.querySelector('.tipo-btn.selected');
    const monto = document.getElementById('monto-gasto').value;
    const lugar = document.getElementById('lugar-gasto').value.trim();
    const notas = document.getElementById('notas-gasto').value.trim();
    
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
        viajeId: viajeId,
        tipo: tipo,
        monto: parseFloat(monto),
        lugar: lugar,
        notas: notas,
        fecha: new Date().toISOString(),
        coordenadas: state.tempFotos.length > 0 ? state.tempFotos[0].coordenadas : await getCurrentPosition(),
        fotos: state.tempFotos.map(f => f.id),
        synced: false
    };
    
    try {
        await db.add('gastos', gasto);
        
        for (const foto of state.tempFotos) {
            foto.gastoId = gasto.id;
            await db.add('fotos', foto);
        }
        
        document.getElementById('monto-gasto').value = '';
        document.getElementById('lugar-gasto').value = '';
        document.getElementById('notas-gasto').value = '';
        document.querySelectorAll('.tipo-btn').forEach(b => b.classList.remove('selected'));
        state.tempFotos = [];
        updateFotosPreview();
        
        showToast('Gasto guardado exitosamente', 'success');
        state.currentViaje = viajeId;
        
    } catch (error) {
        console.error('Error saving gasto:', error);
        showToast('Error al guardar gasto', 'error');
    }
}

// ===== REPORTES Y EXPORTACIÓN =====
function loadReportesSection() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('fecha-fin').value = today;
}

async function exportarExcel() {
    const viajeId = document.getElementById('reporte-viaje-select').value;
    const fechaInicio = document.getElementById('fecha-inicio').value;
    const fechaFin = document.getElementById('fecha-fin').value;
    
    try {
        showToast('Generando reporte...', 'success');
        
        const data = await db.exportAllData(viajeId === 'todos' ? null : viajeId);
        
        let gastos = data.gastos;
        if (fechaInicio && fechaFin) {
            const start = new Date(fechaInicio);
            const end = new Date(fechaFin);
            end.setHours(23, 59, 59);
            
            gastos = gastos.filter(g => {
                const fecha = new Date(g.fecha);
                return fecha >= start && fecha <= end;
            });
        }
        
        if (gastos.length === 0) {
            showToast('No hay gastos en el período seleccionado', 'error');
            return;
        }
        
        const wb = XLSX.utils.book_new();
        
        // Hoja 1: Resumen
        const resumenData = [
            ['REPORTE DE GASTOS - VIAJESPRO'],
            ['Generado:', new Date().toLocaleString('es-MX')],
            ['Vendedor:', state.currentVendedor.nombre],
            ['Período:', `${fechaInicio} a ${fechaFin}`],
            [],
            ['RESUMEN POR TIPO'],
            ['Tipo', 'Total']
        ];
        
        const totales = {};
        gastos.forEach(g => {
            totales[g.tipo] = (totales[g.tipo] || 0) + parseFloat(g.monto);
        });
        
        Object.entries(totales).forEach(([tipo, total]) => {
            resumenData.push([tipo.toUpperCase(), total]);
        });
        
        resumenData.push(['TOTAL GENERAL', Object.values(totales).reduce((a, b) => a + b, 0)]);
        
        const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);
        XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');
        
        // Hoja 2: Detalle
        const detalleData = [
            ['ID', 'Fecha', 'Tipo', 'Monto', 'Lugar', 'Notas', 'Coordenadas', 'Fotos']
        ];
        
        gastos.forEach(gasto => {
            detalleData.push([
                gasto.id,
                new Date(gasto.fecha).toLocaleString('es-MX'),
                gasto.tipo,
                parseFloat(gasto.monto),
                gasto.lugar || '',
                gasto.notas || '',
                gasto.coordenadas ? `${gasto.coordenadas.lat}, ${gasto.coordenadas.lng}` : '',
                gasto.fotos ? gasto.fotos.length : 0
            ]);
        });
        
        const wsDetalle = XLSX.utils.aoa_to_sheet(detalleData);
        XLSX.utils.book_append_sheet(wb, wsDetalle, 'Detalle Gastos');
        
        // Hoja 3: Viajes
        const viajesData = [
            ['ID', 'Destino', 'Propósito', 'Fecha Inicio', 'Fecha Fin', 'Estado']
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
        
        const filename = `Reporte_Gastos_${state.currentVendedor.nombre.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        XLSX.writeFile(wb, filename);
        
        showToast('✅ Reporte descargado exitosamente', 'success');
        
    } catch (error) {
        console.error('Error exporting Excel:', error);
        showToast('Error al generar reporte', 'error');
    }
}

async function compartirReporte() {
    if (!navigator.share) {
        showToast('Compartir no soportado en este navegador', 'error');
        return;
    }
    
    try {
        await navigator.share({
            title: 'Reporte de Gastos ViajesPro',
            text: `Reporte de gastos de ${state.currentVendedor.nombre}`,
            url: window.location.href
        });
    } catch (error) {
        console.log('Share cancelled');
    }
}

async function respaldoJSON() {
    try {
        const data = await db.exportAllData();
        const dataStr = JSON.stringify(data, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Respaldo_ViajesPro_${new Date().toISOString().split('T')[0]}.json`;
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

// ===== UI UTILITIES =====
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

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
    }
});

document.getElementById('viaje-select')?.addEventListener('change', (e) => {
    if (e.target.value) {
        loadGastos(e.target.value);
    }
});

console.log('📱 ViajesPro App loaded');
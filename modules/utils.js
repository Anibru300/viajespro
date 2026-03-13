/**
 * 3P VIAJESPRO - Módulo de Utilidades UX v6.0
 * Funciones helper y mejoras de experiencia
 */

class UtilsService {
    constructor() {
        this.debounceTimers = new Map();
        this.throttleTimers = new Map();
        this.draftSaveTimer = null;
    }

    // ===== FECHAS Y HORAS (MÉXICO) =====

    getMexicoDateTime() {
        return new Date(new Date().toLocaleString("en-US", { 
            timeZone: "America/Mexico_City" 
        }));
    }

    formatDateTimeMexico(dateString) {
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

    formatDateMexico(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('es-MX', {
            timeZone: 'America/Mexico_City',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    }

    formatMoney(amount) {
        return '$' + parseFloat(amount || 0).toLocaleString('es-MX', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    getMexicoDateTimeLocal() {
        const mexicoTime = new Date().toLocaleString("en-US", { 
            timeZone: "America/Mexico_City" 
        });
        const date = new Date(mexicoTime);
        return date.toISOString().slice(0, 16);
    }

    // ===== SANITIZACIÓN Y SEGURIDAD =====

    escapeHtml(text) {
        if (text == null) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    sanitizeInput(input) {
        if (typeof input !== 'string') return input;
        return input.trim().replace(/[<>]/g, '');
    }

    // ===== DEBOUNCE Y THROTTLE =====

    debounce(key, fn, delay = 300) {
        if (this.debounceTimers.has(key)) {
            clearTimeout(this.debounceTimers.get(key));
        }
        
        const timer = setTimeout(() => {
            this.debounceTimers.delete(key);
            fn();
        }, delay);
        
        this.debounceTimers.set(key, timer);
    }

    throttle(key, fn, delay = 1000) {
        if (this.throttleTimers.has(key)) {
            return;
        }
        
        fn();
        
        const timer = setTimeout(() => {
            this.throttleTimers.delete(key);
        }, delay);
        
        this.throttleTimers.set(key, timer);
    }

    // ===== AUTO-GUARDADO (DRAFTS) =====

    /**
     * Guarda borrador en localStorage
     * @param {string} key - Clave única (ej: 'gasto_draft')
     * @param {object} data - Datos a guardar
     */
    saveDraft(key, data) {
        try {
            const draft = {
                data,
                timestamp: new Date().toISOString(),
                version: '6.0'
            };
            localStorage.setItem(`viajespro_draft_${key}`, JSON.stringify(draft));
        } catch (error) {
            console.warn('Error guardando borrador:', error);
        }
    }

    /**
     * Carga borrador de localStorage
     * @param {string} key - Clave única
     * @param {number} maxAgeHours - Edad máxima en horas (default: 24)
     * @returns {object|null}
     */
    loadDraft(key, maxAgeHours = 24) {
        try {
            const saved = localStorage.getItem(`viajespro_draft_${key}`);
            if (!saved) return null;
            
            const draft = JSON.parse(saved);
            const age = Date.now() - new Date(draft.timestamp).getTime();
            const maxAge = maxAgeHours * 60 * 60 * 1000;
            
            if (age > maxAge) {
                this.clearDraft(key);
                return null;
            }
            
            return draft.data;
        } catch (error) {
            console.warn('Error cargando borrador:', error);
            return null;
        }
    }

    clearDraft(key) {
        localStorage.removeItem(`viajespro_draft_${key}`);
    }

    clearAllDrafts() {
        Object.keys(localStorage)
            .filter(key => key.startsWith('viajespro_draft_'))
            .forEach(key => localStorage.removeItem(key));
    }

    /**
     * Configura autoguardado automático
     * @param {string} key - Clave para guardar
     * @param {function} getData - Función que retorna los datos a guardar
     * @param {number} interval - Intervalo en ms (default: 10000 = 10s)
     */
    setupAutoSave(key, getData, interval = 10000) {
        // Limpiar timer anterior
        if (this.draftSaveTimer) {
            clearInterval(this.draftSaveTimer);
        }
        
        // Guardar inmediatamente
        this.saveDraft(key, getData());
        
        // Configurar intervalo
        this.draftSaveTimer = setInterval(() => {
            const data = getData();
            if (data && this.hasDataChanged(key, data)) {
                this.saveDraft(key, data);
                this.showToast('💾 Guardado automático', 'info', 1500);
            }
        }, interval);
        
        return () => {
            if (this.draftSaveTimer) {
                clearInterval(this.draftSaveTimer);
                this.draftSaveTimer = null;
            }
        };
    }

    hasDataChanged(key, newData) {
        const saved = this.loadDraft(key, 24);
        if (!saved) return true;
        return JSON.stringify(saved) !== JSON.stringify(newData);
    }

    // ===== GEOLOCALIZACIÓN =====

    async getCurrentPosition(options = {}) {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocalización no soportada'));
                return;
            }
            
            const defaultOptions = {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000,
                ...options
            };
            
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        timestamp: new Date(position.timestamp).toISOString()
                    });
                },
                (error) => {
                    let message = 'Error obteniendo ubicación';
                    switch (error.code) {
                        case error.PERMISSION_DENIED:
                            message = 'Permiso de ubicación denegado';
                            break;
                        case error.POSITION_UNAVAILABLE:
                            message = 'Ubicación no disponible';
                            break;
                        case error.TIMEOUT:
                            message = 'Tiempo de espera agotado';
                            break;
                    }
                    reject(new Error(message));
                },
                defaultOptions
            );
        });
    }

    /**
     * Obtiene dirección aproximada desde coordenadas (usando API gratuita)
     */
    async reverseGeocode(lat, lng) {
        try {
            // Usar OpenStreetMap Nominatim (gratuito, requiere atribución)
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
                {
                    headers: {
                        'User-Agent': 'ViajesPro/6.0'
                    }
                }
            );
            
            if (!response.ok) throw new Error('Error en geocodificación');
            
            const data = await response.json();
            return {
                address: data.display_name,
                city: data.address?.city || data.address?.town || data.address?.village,
                state: data.address?.state,
                country: data.address?.country,
                raw: data
            };
        } catch (error) {
            console.warn('Error en reverse geocoding:', error);
            return null;
        }
    }

    // ===== MODO OSCURO =====

    initDarkMode() {
        const saved = localStorage.getItem('viajespro_darkmode');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const isDark = saved ? saved === 'true' : prefersDark;
        
        this.setDarkMode(isDark);
        
        // Escuchar cambios del sistema
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (localStorage.getItem('viajespro_darkmode') === null) {
                this.setDarkMode(e.matches);
            }
        });
    }

    setDarkMode(enabled) {
        document.documentElement.setAttribute('data-theme', enabled ? 'dark' : 'light');
        localStorage.setItem('viajespro_darkmode', enabled);
    }

    toggleDarkMode() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        this.setDarkMode(!isDark);
        return !isDark;
    }

    isDarkMode() {
        return document.documentElement.getAttribute('data-theme') === 'dark';
    }

    // ===== NOTIFICACIONES =====

    showToast(message, type = 'info', duration = 3000) {
        const container = document.getElementById('toast-container') || this.createToastContainer();
        
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
            <span class="toast-message">${this.escapeHtml(message)}</span>
        `;
        
        container.appendChild(toast);
        
        // Animación de entrada
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });
        
        // Auto-remover
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            setTimeout(() => toast.remove(), 300);
        }, duration);
        
        return toast;
    }

    createToastContainer() {
        const container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
        return container;
    }

    // ===== VALIDACIÓN =====

    validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(String(email).toLowerCase());
    }

    validateRequired(value) {
        if (value === null || value === undefined) return false;
        if (typeof value === 'string') return value.trim().length > 0;
        if (Array.isArray(value)) return value.length > 0;
        return true;
    }

    validateNumber(value, min = null, max = null) {
        const num = parseFloat(value);
        if (isNaN(num)) return false;
        if (min !== null && num < min) return false;
        if (max !== null && num > max) return false;
        return true;
    }

    // ===== FORMATEO =====

    formatCurrencyInput(input) {
        input.addEventListener('input', (e) => {
            let value = e.target.value.replace(/[^\d.]/g, '');
            
            // Solo un punto decimal
            const parts = value.split('.');
            if (parts.length > 2) {
                value = parts[0] + '.' + parts.slice(1).join('');
            }
            
            // Máximo 2 decimales
            if (parts[1] && parts[1].length > 2) {
                value = parts[0] + '.' + parts[1].substring(0, 2);
            }
            
            e.target.value = value;
        });
    }

    autoUppercase(input) {
        input.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
        });
    }

    // ===== BÚSQUEDA FUZZY =====

    fuzzySearch(haystack, needle, threshold = 0.4) {
        const haystackLower = haystack.toLowerCase();
        const needleLower = needle.toLowerCase();
        
        // Coincidencia exacta
        if (haystackLower.includes(needleLower)) return 1;
        
        // Distancia de Levenshtein simple
        const distance = this.levenshteinDistance(haystackLower, needleLower);
        const maxLen = Math.max(haystack.length, needle.length);
        const similarity = 1 - distance / maxLen;
        
        return similarity >= threshold ? similarity : 0;
    }

    levenshteinDistance(str1, str2) {
        const matrix = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }

    // ===== OFFLINE DETECTOR =====

    initOfflineDetector(callback) {
        const updateStatus = () => {
            const isOnline = navigator.onLine;
            document.body.classList.toggle('offline', !isOnline);
            if (callback) callback(isOnline);
        };
        
        window.addEventListener('online', () => updateStatus());
        window.addEventListener('offline', () => updateStatus());
        updateStatus();
    }

    // ===== COPY TO CLIPBOARD =====

    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            // Fallback
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            const success = document.execCommand('copy');
            document.body.removeChild(textarea);
            return success;
        }
    }
}

// Singleton
const utils = new UtilsService();
export default utils;

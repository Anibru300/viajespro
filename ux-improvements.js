/**
 * 3P VIAJESPRO - UX Improvements JavaScript v6.0
 * Mejoras de experiencia de usuario y utilidades
 */

// ===== UTILIDADES DE UI =====

/**
 * Muestra un toast notification
 * @param {string} message - Mensaje a mostrar
 * @param {string} type - Tipo: 'success', 'error', 'info'
 * @param {number} duration - Duración en ms
 */
function showToast(message, type = 'info', duration = 3000) {
    // Remover toast anterior si existe
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    // Crear nuevo toast
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // Auto-remover después de la duración
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(20px)';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

/**
 * Muestra un indicador de carga en un elemento
 * @param {HTMLElement} element - Elemento donde mostrar el loader
 * @param {boolean} show - true para mostrar, false para ocultar
 */
function toggleLoading(element, show = true) {
    if (show) {
        element.classList.add('loading');
        element.dataset.originalText = element.textContent;
        element.textContent = '';
    } else {
        element.classList.remove('loading');
        if (element.dataset.originalText) {
            element.textContent = element.dataset.originalText;
        }
    }
}

/**
 * Valida un campo de formulario visualmente
 * @param {HTMLElement} input - Input a validar
 * @param {boolean} isValid - Si es válido o no
 * @param {string} message - Mensaje de error (opcional)
 */
function validateField(input, isValid, message = '') {
    input.classList.remove('is-valid', 'is-invalid');
    input.classList.add(isValid ? 'is-valid' : 'is-invalid');
    
    // Remover mensaje de error anterior
    const existingError = input.parentElement.querySelector('.field-error');
    if (existingError) {
        existingError.remove();
    }
    
    // Agregar mensaje de error si no es válido
    if (!isValid && message) {
        const error = document.createElement('span');
        error.className = 'field-error';
        error.textContent = message;
        input.parentElement.appendChild(error);
    }
}

// ===== MEJORAS DE ACCESIBILIDAD =====

/**
 * Hace que los botones sean accesibles con teclado
 */
function enhanceKeyboardAccessibility() {
    document.querySelectorAll('button, [onclick]').forEach(el => {
        if (!el.hasAttribute('tabindex')) {
            el.setAttribute('tabindex', '0');
        }
        
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                el.click();
            }
        });
    });
}

/**
 * Anuncia mensajes a lectores de pantalla
 * @param {string} message - Mensaje a anunciar
 */
function announceToScreenReader(message) {
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'sr-only';
    announcement.style.cssText = 'position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden;';
    announcement.textContent = message;
    
    document.body.appendChild(announcement);
    setTimeout(() => announcement.remove(), 1000);
}

// ===== MEJORAS DE FORMULARIOS =====

/**
 * Formatea un input de moneda
 * @param {HTMLInputElement} input - Input a formatear
 */
function formatCurrencyInput(input) {
    input.addEventListener('input', (e) => {
        let value = e.target.value.replace(/[^\d.]/g, '');
        
        // Asegurar solo un punto decimal
        const parts = value.split('.');
        if (parts.length > 2) {
            value = parts[0] + '.' + parts.slice(1).join('');
        }
        
        // Limitar decimales a 2
        if (parts[1] && parts[1].length > 2) {
            value = parts[0] + '.' + parts[1].substring(0, 2);
        }
        
        e.target.value = value;
    });
}

/**
 * Convierte un input a mayúsculas automáticamente
 * @param {HTMLInputElement} input - Input a convertir
 */
function autoUppercase(input) {
    input.addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase();
    });
}

// ===== INICIALIZACIÓN =====

document.addEventListener('DOMContentLoaded', () => {
    console.log('UX Improvements v6.0 loaded');
    
    // Mejorar accesibilidad
    enhanceKeyboardAccessibility();
    
    // Formatear inputs de moneda
    document.querySelectorAll('input[type="number"]').forEach(input => {
        if (input.id.includes('monto')) {
            formatCurrencyInput(input);
        }
    });
    
    // Auto-uppercase para campos de texto específicos
    document.querySelectorAll('input[type="text"]').forEach(input => {
        if (input.id.includes('destino') || input.id.includes('lugar') || input.id.includes('cliente')) {
            autoUppercase(input);
        }
    });
});

// Exponer funciones globalmente
window.showToast = showToast;
window.toggleLoading = toggleLoading;
window.validateField = validateField;
window.announceToScreenReader = announceToScreenReader;

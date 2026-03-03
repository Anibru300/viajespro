/**
 * 3P VIAJESPRO - UX Improvements
 */

const UX_CONFIG = {
    TOAST_DURATION: 4000,
    LOADING_MIN_TIME: 500
};

const LoadingSystem = {
    overlay: null,
    
    init() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'loading-overlay';
        this.overlay.innerHTML = `
            <div class="loading-spinner">
                <div class="spinner-ring"></div>
                <div class="spinner-ring"></div>
                <div class="spinner-ring"></div>
            </div>
            <p class="loading-text">Cargando...</p>
        `;
        document.body.appendChild(this.overlay);
    },
    
    show(message = 'Cargando...') {
        this.overlay.querySelector('.loading-text').textContent = message;
        this.overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    },
    
    hide() {
        this.overlay.classList.remove('active');
        document.body.style.overflow = '';
    },
    
    async withLoading(asyncFn, message = 'Cargando...') {
        this.show(message);
        try {
            const result = await asyncFn();
            await new Promise(r => setTimeout(r, 500));
            return result;
        } finally {
            this.hide();
        }
    }
};

const ToastSystem = {
    container: null,
    
    init() {
        this.container = document.createElement('div');
        this.container.className = 'toast-container';
        document.body.appendChild(this.container);
    },
    
    show(message, type = 'info') {
        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${icons[type]}</span>
            <span class="toast-message">${message}</span>
            <button class="toast-close" onclick="this.parentElement.remove()">×</button>
            <div class="toast-progress"></div>
        `;
        
        this.container.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.add('hiding');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    },
    
    success(message) { this.show(message, 'success'); },
    error(message) { this.show(message, 'error'); },
    warning(message) { this.show(message, 'warning'); },
    info(message) { this.show(message, 'info'); }
};

const ConfirmSystem = {
    async confirm(options) {
        const { title = '¿Estás seguro?', message = '', confirmText = 'Confirmar', cancelText = 'Cancelar', type = 'warning' } = options;
        
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'confirm-modal';
            modal.innerHTML = `
                <div class="confirm-content">
                    <div class="confirm-icon confirm-${type}">⚠️</div>
                    <h3 class="confirm-title">${title}</h3>
                    <p class="confirm-message">${message}</p>
                    <div class="confirm-actions">
                        <button class="btn-confirm-cancel">${cancelText}</button>
                        <button class="btn-confirm-confirm confirm-${type}">${confirmText}</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            setTimeout(() => modal.classList.add('active'), 10);
            
            modal.querySelector('.btn-confirm-confirm').onclick = () => {
                modal.classList.remove('active');
                setTimeout(() => { modal.remove(); resolve(true); }, 200);
            };
            
            modal.querySelector('.btn-confirm-cancel').onclick = () => {
                modal.classList.remove('active');
                setTimeout(() => { modal.remove(); resolve(false); }, 200);
            };
            
            modal.onclick = (e) => {
                if (e.target === modal) {
                    modal.querySelector('.btn-confirm-cancel').click();
                }
            };
        });
    }
};

function initUX() {
    LoadingSystem.init();
    ToastSystem.init();
    
    // Exponer funciones globalmente
    window.showToast = (message, type = 'info') => {
        ToastSystem.show(message, type);
    };
    
    window.ToastSystem = ToastSystem;
    window.LoadingSystem = LoadingSystem;
    window.ConfirmSystem = ConfirmSystem;
    
    console.log('✅ UX Improvements initialized');
}

document.addEventListener('DOMContentLoaded', initUX);

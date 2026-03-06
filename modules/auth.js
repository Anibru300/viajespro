/**
 * 3P VIAJESPRO - Módulo de Autenticación v5.1
 * Seguridad mejorada con Firebase Auth
 */

import { auth, db } from '../firebase-config.js';
import { 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    updatePassword,
    EmailAuthProvider,
    reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Admin credentials (en producción usar Cloud Functions)
const ADMIN_CONFIG = {
    email: 'admin@3p.com',
    password: 'admin123'  // En producción, esto debe manejarse diferente
};

class AuthService {
    constructor() {
        this.currentUser = null;
        this.currentVendor = null;
        this.isAdmin = false;
        this.listeners = [];
    }

    // Inicializar y escuchar cambios de auth
    init() {
        return new Promise((resolve) => {
            onAuthStateChanged(auth, async (user) => {
                if (user) {
                    this.currentUser = user;
                    await this.loadVendorData(user.uid);
                    this.notifyListeners('auth_changed', { user: this.currentUser, vendor: this.currentVendor, isAdmin: this.isAdmin });
                } else {
                    this.currentUser = null;
                    this.currentVendor = null;
                    this.isAdmin = false;
                    this.notifyListeners('auth_changed', null);
                }
                resolve(user);
            });
        });
    }

   async login(email, password, remember = false) {
    try {
        // Determinar el email real para Firebase Auth
        let userEmail = email;
        if (email === 'admin') {
            userEmail = 'admin@3p.com'; // Ajusta si tu admin tiene otro email
        } else if (!email.includes('@')) {
            userEmail = `${email}@3p-vendedor.com`;
        }
        
        // Autenticar con Firebase Auth
        const userCredential = await signInWithEmailAndPassword(auth, userEmail, password);
        this.currentUser = userCredential.user;

        // Verificar si es admin (existe en colección administradores)
        const adminDoc = await getDoc(doc(db, 'administradores', this.currentUser.uid));
        if (adminDoc.exists()) {
            this.isAdmin = true;
            this.currentVendor = {
                name: 'Administrador',
                email: this.currentUser.email,
                role: 'admin',
                zone: 'Todas'
            };
            return { success: true, isAdmin: true };
        } else {
            // Es vendedor: cargar datos desde Firestore usando su UID
            await this.loadVendorData(this.currentUser.uid);
            if (!this.currentVendor) {
                throw new Error('Vendedor no encontrado en Firestore');
            }
            return { success: true, isAdmin: false, vendor: this.currentVendor };
        }
    } catch (error) {
        console.error('Error en login:', error);
        throw this.translateAuthError(error);
    }
}
    // Cargar datos del vendedor desde Firestore
    async loadVendorData(uid) {
        try {
            const vendorDoc = await getDoc(doc(db, 'vendedores', uid));
            if (vendorDoc.exists()) {
                this.currentVendor = vendorDoc.data();
                this.currentVendor.uid = uid;
            } else {
                // Crear perfil básico si no existe
                this.currentVendor = {
                    uid: uid,
                    email: this.currentUser.email,
                    name: this.currentUser.displayName || 'Vendedor',
                    zone: 'Bajío',
                    status: 'active',
                    createdAt: new Date().toISOString()
                };
            }
        } catch (error) {
            console.error('Error cargando datos del vendedor:', error);
            this.currentVendor = null;
        }
    }

    // Registrar nuevo vendedor (solo admin)
    async registerVendor(vendorData, password) {
        try {
            // En una implementación real, esto debería ser una Cloud Function
            // para evitar exponcer la creación de usuarios
            const { email, name, zone } = vendorData;
            
            // Crear documento del vendedor (el auth se crearía por separado o por admin SDK)
            const vendorRef = doc(db, 'vendedores', email.replace('@3p-vendedor.com', ''));
            await setDoc(vendorRef, {
                ...vendorData,
                createdAt: new Date().toISOString(),
                status: 'active'
            });
            
            return { success: true };
        } catch (error) {
            console.error('Error registrando vendedor:', error);
            throw error;
        }
    }

    // Actualizar perfil del vendedor
    async updateProfile(updates) {
        if (!this.currentUser) throw new Error('No hay sesión activa');
        
        try {
            const vendorRef = doc(db, 'vendedores', this.currentUser.uid);
            await updateDoc(vendorRef, {
                ...updates,
                updatedAt: new Date().toISOString()
            });
            
            // Actualizar local
            this.currentVendor = { ...this.currentVendor, ...updates };
            return { success: true };
        } catch (error) {
            console.error('Error actualizando perfil:', error);
            throw error;
        }
    }

    // Cambiar contraseña
    async changePassword(currentPassword, newPassword) {
        if (!this.currentUser) throw new Error('No hay sesión activa');
        
        try {
            // Reautenticar
            const credential = EmailAuthProvider.credential(
                this.currentUser.email, 
                currentPassword
            );
            await reauthenticateWithCredential(this.currentUser, credential);
            
            // Cambiar contraseña
            await updatePassword(this.currentUser, newPassword);
            return { success: true };
        } catch (error) {
            console.error('Error cambiando contraseña:', error);
            throw this.translateAuthError(error);
        }
    }

    // Logout
    async logout() {
        try {
            await signOut(auth);
            this.currentUser = null;
            this.currentVendor = null;
            this.isAdmin = false;
            localStorage.removeItem('viajespro_remember');
            return { success: true };
        } catch (error) {
            console.error('Error en logout:', error);
            throw error;
        }
    }

    // Verificar si hay sesión activa
    isAuthenticated() {
        return !!this.currentUser || this.isAdmin;
    }

    // Obtener usuario actual
    getCurrentUser() {
        return {
            user: this.currentUser,
            vendor: this.currentVendor,
            isAdmin: this.isAdmin
        };
    }

    // Suscribirse a cambios de auth
    onAuthChange(callback) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(cb => cb !== callback);
        };
    }

    notifyListeners(event, data) {
        this.listeners.forEach(callback => {
            try {
                callback(event, data);
            } catch (e) {
                console.error('Error en listener de auth:', e);
            }
        });
    }

    // Traducir errores de Firebase Auth
    translateAuthError(error) {
        const errorMessages = {
            'auth/invalid-credential': 'Usuario o contraseña incorrectos',
            'auth/user-not-found': 'Usuario no encontrado',
            'auth/wrong-password': 'Contraseña incorrecta',
            'auth/too-many-requests': 'Demasiados intentos. Intenta más tarde',
            'auth/user-disabled': 'Usuario deshabilitado',
            'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres',
            'auth/email-already-in-use': 'Este email ya está registrado',
            'auth/invalid-email': 'Email inválido',
            'auth/network-request-failed': 'Error de conexión. Verifica tu internet',
            'auth/requires-recent-login': 'Por seguridad, vuelve a iniciar sesión'
        };
        
        return new Error(errorMessages[error.code] || error.message || 'Error de autenticación');
    }
}

// Singleton
const authService = new AuthService();
export default authService;

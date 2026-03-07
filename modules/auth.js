/**
 * 3P VIAJESPRO - Módulo de Autenticación v6.0
 * Seguridad mejorada con Firebase Auth
 * Ahora el admin también se autentica con Firebase y se valida contra la colección "administradores"
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
                    // Verificar si es admin (existe en colección administradores)
                    const adminDoc = await getDoc(doc(db, 'administradores', user.uid));
                    this.isAdmin = adminDoc.exists();
                    
                    if (this.isAdmin) {
                        this.currentVendor = {
                            name: 'Administrador',
                            email: user.email,
                            role: 'admin',
                            zone: 'Todas'
                        };
                    } else {
                        await this.loadVendorData(user.uid);
                    }
                    
                    this.notifyListeners('auth_changed', { 
                        user: this.currentUser, 
                        vendor: this.currentVendor, 
                        isAdmin: this.isAdmin 
                    });
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

    // Login unificado: admin y vendedores
    async login(email, password, remember = false) {
        try {
            // Determinar el email real para Firebase Auth
            let userEmail = email;
            // Si es 'admin', usamos el email que definimos para el admin (debe coincidir con el de Authentication)
            if (email === 'admin') {
                userEmail = 'admin@3p.com'; // Ajusta este email según el que usaste en Authentication
            } else if (!email.includes('@')) {
                // Si no tiene @, asumimos que es un nombre de usuario de vendedor y le agregamos el dominio
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

    // Cargar datos del vendedor desde Firestore usando su UID
    async loadVendorData(uid) {
        try {
            const vendorDoc = await getDoc(doc(db, 'vendedores', uid));
            if (vendorDoc.exists()) {
                this.currentVendor = vendorDoc.data();
                this.currentVendor.uid = uid;
            } else {
                // Si no existe, podría ser un error de configuración
                console.warn('Vendedor no encontrado en Firestore:', uid);
                this.currentVendor = null;
            }
        } catch (error) {
            console.error('Error cargando datos del vendedor:', error);
            this.currentVendor = null;
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
        return !!this.currentUser;
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

    // Métodos para cambio de contraseña (si se necesitan)
    async changePassword(currentPassword, newPassword) {
        if (!this.currentUser) throw new Error('No hay sesión activa');
        
        try {
            const credential = EmailAuthProvider.credential(
                this.currentUser.email, 
                currentPassword
            );
            await reauthenticateWithCredential(this.currentUser, credential);
            await updatePassword(this.currentUser, newPassword);
            return { success: true };
        } catch (error) {
            console.error('Error cambiando contraseña:', error);
            throw this.translateAuthError(error);
        }
    }

    // Registrar nuevo vendedor (solo admin) – Nota: esto solo crea el documento en Firestore,
    // el usuario en Authentication debe crearse por separado (manual o mediante Cloud Function)
    async registerVendor(vendorData, password) {
        // Este método podría implementarse en el futuro con una Cloud Function
        throw new Error('El registro de vendedores debe hacerse manualmente desde Firebase Console o mediante Cloud Function');
    }
}

// Singleton
const authService = new AuthService();
export default authService;
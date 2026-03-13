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
        let userEmail = email;
        let userType = 'vendedor';
        let attempts = [];
        
        try {
            // DEBUG: Mostrar qué email se recibió
            console.log('[Auth] Intentando login con input:', email);
            
            // Determinar el email real para Firebase Auth
            if (email.toLowerCase() === 'admin') {
                // Si es 'admin', intentar con el email configurado
                userEmail = 'admin@3p.com';
                userType = 'admin';
                console.log('[Auth] Login de admin detectado');
            } else if (!email.includes('@')) {
                // Si no tiene @, es un username - intentar múltiples formatos
                console.log('[Auth] Login por username detectado');
                attempts = [
                    `${email}@3p-vendedor.com`,
                    `${email}@viajespro-3p.firebaseapp.com`,
                    email  // Por si acaso el username es el email completo sin @
                ];
            } else {
                // Email completo proporcionado
                userEmail = email.toLowerCase().trim();
                attempts = [userEmail];
            }
            
            // Si es admin, solo intentamos con ese email
            if (userType === 'admin') {
                attempts = [userEmail];
            }
            
            console.log('[Auth] Emails a intentar:', attempts);
            
            // Intentar login con cada email
            let lastError = null;
            for (const attemptEmail of attempts) {
                if (!this.isValidEmail(attemptEmail)) {
                    console.log('[Auth] Saltando email inválido:', attemptEmail);
                    continue;
                }
                
                try {
                    console.log('[Auth] Intentando con:', attemptEmail);
                    const userCredential = await signInWithEmailAndPassword(auth, attemptEmail, password);
                    this.currentUser = userCredential.user;
                    userEmail = attemptEmail; // Guardar el que funcionó
                    console.log('[Auth] Login exitoso con:', attemptEmail, 'UID:', this.currentUser.uid);
                    break; // Salir del loop si tuvo éxito
                } catch (err) {
                    console.log('[Auth] Falló con:', attemptEmail, '-', err.code);
                    lastError = err;
                    // Continuar con el siguiente intento
                }
            }
            
            // Si después de todos los intentos no hay usuario, lanzar error
            if (!this.currentUser) {
                throw lastError || new Error('No se pudo autenticar con ningún email');
            }

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
            console.error('[Auth] Error en login después de todos los intentos:', error);
            console.error('[Auth] Código de error:', error.code);
            console.error('[Auth] Emails intentados:', attempts.length > 0 ? attempts : [userEmail]);
            console.error('[Auth] Tipo de usuario:', userType);
            
            // Agregar información extra al error para debug
            error.attemptedEmails = attempts.length > 0 ? attempts : [userEmail];
            error.userType = userType;
            error.originalInput = email;
            
            throw this.translateAuthError(error);
        }
    }

    // Validar formato de email
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
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
        const attemptedEmails = error.attemptedEmails ? error.attemptedEmails.join(', ') : (error.attemptedEmail || '');
        const errorMessages = {
            'auth/invalid-credential': `Usuario o contraseña incorrectos.\nIntentado con: ${attemptedEmails}\n\nVerifica que el usuario esté creado en Firebase Authentication con alguno de estos emails.`,
            'auth/user-not-found': `Usuario no encontrado.\nIntentado con: ${attemptedEmails}\n\nEl usuario debe estar creado en Firebase Authentication.`,
            'auth/wrong-password': 'Contraseña incorrecta',
            'auth/too-many-requests': 'Demasiados intentos. Intenta más tarde',
            'auth/user-disabled': 'Usuario deshabilitado. Contacta al administrador.',
            'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres',
            'auth/email-already-in-use': 'Este email ya está registrado',
            'auth/invalid-email': `Email inválido: ${attemptedEmails}`,
            'auth/network-request-failed': 'Error de conexión. Verifica tu internet',
            'auth/requires-recent-login': 'Por seguridad, vuelve a iniciar sesión',
            'auth/configuration-not-found': 'Configuración de autenticación no encontrada. Verifica que el proyecto Firebase esté configurado correctamente.'
        };
        
        const message = errorMessages[error.code] || error.message || 'Error de autenticación';
        const enhancedError = new Error(message);
        enhancedError.code = error.code;
        enhancedError.originalError = error;
        return enhancedError;
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
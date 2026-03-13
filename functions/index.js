const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/options');
const admin = require('firebase-admin');

admin.initializeApp();

// Configurar opciones globales para todas las funciones
setGlobalOptions({
  region: 'us-central1'
});

// Helper para verificar autenticación
function verifyAuth(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión');
  }
  return request.auth;
}

// Helper para validar email
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Crear vendedor
exports.createVendor = onCall(
  {
    region: 'us-central1',
    cors: true
  },
  async (request) => {
    const auth = verifyAuth(request);
    const adminUid = auth.uid;
    
    // Verificar que es administrador
    const adminDoc = await admin.firestore().collection('administradores').doc(adminUid).get();
    if (!adminDoc.exists) {
      throw new HttpsError('permission-denied', 'No eres administrador');
    }

    const { email, password, name, username, zone } = request.data;
    
    // Validaciones de campos obligatorios
    if (!name || !username || !password) {
      throw new HttpsError('invalid-argument', 'Nombre, usuario y contraseña son obligatorios');
    }
    
    // Email obligatorio
    if (!email) {
      throw new HttpsError('invalid-argument', 'El correo electrónico es obligatorio');
    }
    
    // Validar formato de email
    if (!isValidEmail(email)) {
      throw new HttpsError('invalid-argument', 'El formato del correo electrónico no es válido');
    }
    
    // Validar longitud de contraseña
    if (password.length < 6) {
      throw new HttpsError('invalid-argument', 'La contraseña debe tener al menos 6 caracteres');
    }
    
    // Validar formato de username
    if (!/^[a-z0-9.]+$/.test(username)) {
      throw new HttpsError('invalid-argument', 'El usuario solo puede contener letras minúsculas, números y puntos');
    }

    try {
      // Verificar que el email no exista en Authentication
      try {
        const userByEmail = await admin.auth().getUserByEmail(email);
        if (userByEmail) {
          throw new HttpsError('already-exists', `Ya existe un usuario con el correo ${email}`);
        }
      } catch (error) {
        // Si es user-not-found, está bien, podemos continuar
        if (error.code !== 'auth/user-not-found') {
          throw error;
        }
      }
      
      // Verificar que el username no exista en Firestore
      const vendorsSnapshot = await admin.firestore()
        .collection('vendedores')
        .where('username', '==', username)
        .limit(1)
        .get();
      
      if (!vendorsSnapshot.empty) {
        throw new HttpsError('already-exists', `Ya existe un vendedor con el usuario '${username}'`);
      }

      // Crear usuario en Authentication
      const user = await admin.auth().createUser({
        email,
        password,
        displayName: name
      });
      
      // Crear documento en Firestore
      await admin.firestore().collection('vendedores').doc(user.uid).set({
        name,
        username,
        email,
        zone: zone || 'Bajío',
        status: 'active',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: adminUid
      });
      
      return {
        success: true,
        uid: user.uid,
        message: `Vendedor ${name} creado exitosamente`
      };
      
    } catch (error) {
      // Si ya es un HttpsError, propagarlo
      if (error.code && error.code.startsWith('functions/')) {
        throw error;
      }
      
      // Manejar errores específicos de Firebase Auth
      if (error.code === 'auth/email-already-exists') {
        throw new HttpsError('already-exists', `El correo ${email} ya está registrado`);
      }
      if (error.code === 'auth/invalid-email') {
        throw new HttpsError('invalid-argument', 'El formato del correo electrónico no es válido');
      }
      if (error.code === 'auth/invalid-password') {
        throw new HttpsError('invalid-argument', 'La contraseña no cumple con los requisitos de seguridad');
      }
      if (error.code === 'auth/weak-password') {
        throw new HttpsError('invalid-argument', 'La contraseña es muy débil. Usa al menos 6 caracteres');
      }
      
      // Error genérico
      console.error('Error en createVendor:', error);
      throw new HttpsError('internal', `Error al crear vendedor: ${error.message}`);
    }
  }
);

// Actualizar vendedor
exports.updateVendor = onCall(
  {
    region: 'us-central1',
    cors: true
  },
  async (request) => {
    const auth = verifyAuth(request);
    const adminUid = auth.uid;
    
    const adminDoc = await admin.firestore().collection('administradores').doc(adminUid).get();
    if (!adminDoc.exists) {
      throw new HttpsError('permission-denied', 'No eres administrador');
    }

    const { uid, name, username, zone, status } = request.data;
    if (!uid) {
      throw new HttpsError('invalid-argument', 'Falta el UID del vendedor');
    }

    // Verificar que el vendedor existe
    const vendorDoc = await admin.firestore().collection('vendedores').doc(uid).get();
    if (!vendorDoc.exists) {
      throw new HttpsError('not-found', 'Vendedor no encontrado');
    }

    const updateData = {};
    if (name) updateData.name = name;
    if (username) updateData.username = username;
    if (zone) updateData.zone = zone;
    if (status) updateData.status = status;
    updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    updateData.updatedBy = adminUid;

    await admin.firestore().collection('vendedores').doc(uid).update(updateData);
    
    return {
      success: true,
      message: 'Vendedor actualizado exitosamente'
    };
  }
);

// Eliminar vendedor
exports.deleteVendor = onCall(
  {
    region: 'us-central1',
    cors: true
  },
  async (request) => {
    const auth = verifyAuth(request);
    const adminUid = auth.uid;
    
    // Verificar que es administrador
    const adminDoc = await admin.firestore().collection('administradores').doc(adminUid).get();
    if (!adminDoc.exists) {
      throw new HttpsError('permission-denied', 'No eres administrador');
    }

    const { uid, username } = request.data;
    
    if (!uid && !username) {
      throw new HttpsError('invalid-argument', 'Debe proporcionar el UID o el username del vendedor');
    }

    let vendorUid = uid;
    let vendorData = null;
    let vendorDocRef = null;

    try {
      // Si no tenemos UID pero tenemos username, buscar el documento
      if (!vendorUid && username) {
        const vendorsSnapshot = await admin.firestore()
          .collection('vendedores')
          .where('username', '==', username)
          .limit(1)
          .get();
        
        if (vendorsSnapshot.empty) {
          throw new HttpsError('not-found', `No se encontró vendedor con usuario '${username}'`);
        }
        
        const vendorDoc = vendorsSnapshot.docs[0];
        vendorUid = vendorDoc.id;
        vendorData = vendorDoc.data();
        vendorDocRef = vendorDoc.ref;
      } else {
        // Tenemos UID, obtener el documento
        vendorDocRef = admin.firestore().collection('vendedores').doc(vendorUid);
        const vendorDoc = await vendorDocRef.get();
        
        if (vendorDoc.exists) {
          vendorData = vendorDoc.data();
        }
      }

      // Intentar eliminar el usuario de Authentication
      let authDeleted = false;
      let authError = null;
      
      try {
        await admin.auth().deleteUser(vendorUid);
        authDeleted = true;
      } catch (error) {
        authError = error;
        // Si el usuario no existe en Auth, podemos continuar (ya está "eliminado")
        if (error.code !== 'auth/user-not-found') {
          console.warn('Error al eliminar usuario de Auth:', error.message);
        }
      }

      // Eliminar el documento de Firestore
      await vendorDocRef.delete();

      // Preparar mensaje de respuesta
      let message = 'Vendedor eliminado exitosamente';
      if (!authDeleted && authError && authError.code !== 'auth/user-not-found') {
        message += ' (nota: el documento se eliminó pero hubo un problema al eliminar el usuario de autenticación)';
      }

      return {
        success: true,
        message: message,
        uid: vendorUid,
        name: vendorData?.name || null,
        authDeleted: authDeleted
      };
      
    } catch (error) {
      // Si ya es un HttpsError, propagarlo
      if (error.code && (error.code.startsWith('functions/') || 
          ['not-found', 'permission-denied', 'invalid-argument'].includes(error.code))) {
        throw error;
      }
      
      console.error('Error en deleteVendor:', error);
      throw new HttpsError('internal', `Error al eliminar vendedor: ${error.message}`);
    }
  }
);

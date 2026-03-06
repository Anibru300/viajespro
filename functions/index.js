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

// Crear vendedor
exports.createVendor = onCall(
  {
    region: 'us-central1',
    cors: true
  },
  async (request) => {
    const auth = verifyAuth(request);
    const adminUid = auth.uid;
    const adminDoc = await admin.firestore().collection('administradores').doc(adminUid).get();
    if (!adminDoc.exists) throw new HttpsError('permission-denied', 'No eres administrador');

    const { email, password, name, username, zone } = request.data;
    if (!email || !password || !name || !username) {
      throw new HttpsError('invalid-argument', 'Faltan datos obligatorios');
    }

    try {
      const user = await admin.auth().createUser({ email, password, displayName: name });
      await admin.firestore().collection('vendedores').doc(user.uid).set({
        name, username, email, zone: zone || 'Bajío', status: 'active',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { success: true, uid: user.uid };
    } catch (error) {
      throw new HttpsError('internal', error.message);
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
    if (!adminDoc.exists) throw new HttpsError('permission-denied', 'No eres administrador');

    const { uid, name, username, zone, status } = request.data;
    if (!uid) throw new HttpsError('invalid-argument', 'Falta UID');

    const updateData = {};
    if (name) updateData.name = name;
    if (username) updateData.username = username;
    if (zone) updateData.zone = zone;
    if (status) updateData.status = status;
    updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    await admin.firestore().collection('vendedores').doc(uid).update(updateData);
    return { success: true };
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
    const adminDoc = await admin.firestore().collection('administradores').doc(adminUid).get();
    if (!adminDoc.exists) throw new HttpsError('permission-denied', 'No eres administrador');

    const { uid } = request.data;
    if (!uid) throw new HttpsError('invalid-argument', 'Falta UID');

    try {
      await admin.auth().deleteUser(uid);
      await admin.firestore().collection('vendedores').doc(uid).delete();
      return { success: true };
    } catch (error) {
      throw new HttpsError('internal', error.message);
    }
  }
);

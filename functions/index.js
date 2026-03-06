const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// Crear vendedor
exports.createVendor = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Debes iniciar sesión');
  const adminUid = context.auth.uid;
  const adminDoc = await admin.firestore().collection('administradores').doc(adminUid).get();
  if (!adminDoc.exists) throw new functions.https.HttpsError('permission-denied', 'No eres administrador');

  const { email, password, name, username, zone } = data;
  if (!email || !password || !name || !username) {
    throw new functions.https.HttpsError('invalid-argument', 'Faltan datos obligatorios');
  }

  try {
    const user = await admin.auth().createUser({ email, password, displayName: name });
    await admin.firestore().collection('vendedores').doc(user.uid).set({
      name, username, email, zone: zone || 'Bajío', status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { success: true, uid: user.uid };
  } catch (error) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Actualizar vendedor
exports.updateVendor = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Debes iniciar sesión');
  const adminUid = context.auth.uid;
  const adminDoc = await admin.firestore().collection('administradores').doc(adminUid).get();
  if (!adminDoc.exists) throw new functions.https.HttpsError('permission-denied', 'No eres administrador');

  const { uid, name, username, zone, status } = data;
  if (!uid) throw new functions.https.HttpsError('invalid-argument', 'Falta UID');

  const updateData = {};
  if (name) updateData.name = name;
  if (username) updateData.username = username;
  if (zone) updateData.zone = zone;
  if (status) updateData.status = status;
  updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();

  await admin.firestore().collection('vendedores').doc(uid).update(updateData);
  return { success: true };
});

// Eliminar vendedor
exports.deleteVendor = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Debes iniciar sesión');
  const adminUid = context.auth.uid;
  const adminDoc = await admin.firestore().collection('administradores').doc(adminUid).get();
  if (!adminDoc.exists) throw new functions.https.HttpsError('permission-denied', 'No eres administrador');

  const { uid } = data;
  if (!uid) throw new functions.https.HttpsError('invalid-argument', 'Falta UID');

  try {
    await admin.auth().deleteUser(uid);
    await admin.firestore().collection('vendedores').doc(uid).delete();
    return { success: true };
  } catch (error) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

# 🔧 Guía para Solucionar Error de Permisos

## Error: "Missing or insufficient permissions"

Este error ocurre cuando el **UID de Firebase Auth** no coincide con el **vendedorId** guardado en Firestore.

---

## 🔍 Paso 1: Diagnosticar el Problema

### En la app (como vendedor):
1. Abre la consola del navegador (presiona `F12`)
2. Ve a la pestaña **Console**
3. Escribe este comando y presiona Enter:
   ```javascript
   diagnosticarSession()
   ```
4. Verás un mensaje con los UIDs

### Lo que debe decir:
```
✅ UIDs coinciden
```

### Si dice:
```
❌ UIDs NO coinciden
```
→ El problema está confirmado. Sigue los pasos de solución.

---

## 🔧 Paso 2: Soluciones

### Opción A: Usar Reglas Temporales (Rápido - para diagnosticar)

1. Ve a Firebase Console → Firestore Database → Reglas
2. Copia el contenido de `firestore-debug.rules`:
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```
3. Publica las reglas
4. Intenta crear un viaje
5. Si funciona → El problema son las reglas, no los datos

**⚠️ IMPORTANTE:** Vuelve a poner las reglas normales después:
```bash
firebase deploy --only firestore:rules
```

---

### Opción B: Corregir los UIDs (Solución definitiva)

El problema es que el documento del vendedor tiene un ID diferente al UID de Firebase Auth.

#### Como Administrador:

1. **Ve a Firebase Console** → Authentication
2. **Busca al vendedor** y copia su UID (ej: `ABC123xyz...`)
3. **Ve a Firestore** → Colección `vendedores`
4. **Busca el documento del vendedor**:
   - Si el ID del documento **NO es** el UID → Es el problema
   
#### Solución 1: Recrear el vendedor (Recomendado)

1. Elimina el documento del vendedor en Firestore
2. Elimina el usuario en Authentication
3. Crea el vendedor nuevamente desde el Panel Admin de la app
   - Esto creará el usuario con el UID correcto automáticamente

#### Solución 2: Crear documento con UID correcto

Si no quieres eliminar al vendedor:

1. En Firestore, **crea un nuevo documento**
2. Como ID del documento, pega el **UID de Firebase Auth**
3. Copia todos los campos del documento antiguo:
   ```json
   {
     "name": "Nombre del Vendedor",
     "username": "vendedor.user",
     "email": "vendedor@ejemplo.com",
     "zone": "Bajío",
     "status": "active"
   }
   ```
4. Elimina el documento antiguo (con el ID incorrecto)

---

## 🧪 Paso 3: Verificar que Funciona

1. El vendedor debe **cerrar sesión** y **volver a entrar**
2. Ejecutar en consola:
   ```javascript
   diagnosticarSession()
   ```
3. Debe decir: `✅ UIDs coinciden`
4. Intentar crear un viaje

---

## 📋 Checklist para el Admin

- [ ] Obtener UID del usuario en Firebase Authentication
- [ ] Verificar que el documento en `vendedores` use ese UID como ID
- [ ] Si no coincide → Recrear el vendedor
- [ ] Pedir al vendedor que cierre sesión y vuelva a entrar
- [ ] Verificar con `diagnosticarSession()`
- [ ] Probar crear un viaje

---

## 🔥 Comandos Útiles

### Ver UIDs en consola (para el vendedor):
```javascript
// Auth UID
console.log('Auth UID:', firebase.auth().currentUser.uid);

// Vendor UID
console.log('Vendor UID:', state.currentVendor.uid);

// ¿Coinciden?
console.log('¿Coinciden?', firebase.auth().currentUser.uid === state.currentVendor.uid);
```

---

## 💡 Nota Importante

**¿Por qué pasa esto?**

Cuando se crea un vendedor manualmente en Firebase Console, el documento de Firestore debe usar el **UID generado por Authentication** como ID del documento. Si se usa otro ID (como el username o un ID autogenerado), las reglas de seguridad rechazarán las operaciones porque `request.auth.uid` no coincide con `vendedorId`.

**La solución correcta:** Crear vendedores SIEMPRE desde el Panel Admin de la app, que usa Cloud Functions para crear el usuario en Auth y el documento en Firestore con el UID correcto.

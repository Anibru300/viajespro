# Configuración de Firebase para ViajesPro

## ⚠️ PROBLEMA ACTUAL: Error de Permisos

Si ves el error `"Missing or insufficient permissions"`, significa que las **reglas de seguridad** de Firebase no están configuradas correctamente.

---

## 🔥 PASOS PARA CONFIGURAR FIREBASE

### 1. Firestore Rules (Base de Datos)

Ve a Firebase Console → Firestore Database → Reglas

**Copia y pega estas reglas:**

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function isAdmin() {
      return isAuthenticated() && 
        exists(/databases/$(database)/documents/administradores/$(request.auth.uid));
    }

    match /vendedores/{vendorId} {
      allow read: if isAuthenticated() && (
        request.auth.uid == vendorId || isAdmin()
      );
      allow write: if isAdmin();
    }

    match /administradores/{adminId} {
      allow read: if isAuthenticated() && request.auth.uid == adminId;
      allow write: if isAdmin();
    }

    match /viajes/{viajeId} {
      allow read: if isAuthenticated() && (
        resource.data.vendedorId == request.auth.uid || isAdmin()
      );
      allow create: if isAuthenticated() && (
        request.resource.data.vendedorId == request.auth.uid || isAdmin()
      );
      allow update: if isAuthenticated() && (
        (resource.data.vendedorId == request.auth.uid && 
         request.resource.data.vendedorId == request.auth.uid) || isAdmin()
      );
      allow delete: if isAuthenticated() && (
        resource.data.vendedorId == request.auth.uid || isAdmin()
      );
    }

    match /gastos/{gastoId} {
      allow read: if isAuthenticated() && (
        resource.data.vendedorId == request.auth.uid || isAdmin()
      );
      allow create: if isAuthenticated() && (
        request.resource.data.vendedorId == request.auth.uid || isAdmin()
      );
      allow update: if isAuthenticated() && (
        (resource.data.vendedorId == request.auth.uid && 
         request.resource.data.vendedorId == request.auth.uid) || isAdmin()
      );
      allow delete: if isAuthenticated() && (
        resource.data.vendedorId == request.auth.uid || isAdmin()
      );
    }

    match /app_config/{configId} {
      allow read: if isAuthenticated();
      allow write: if isAdmin();
    }
  }
}
```

Haz clic en **"Publicar"**.

---

### 2. Storage Rules (Fotos/Imágenes)

Ve a Firebase Console → Storage → Reglas

**Copia y pega estas reglas:**

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function isOwner(userId) {
      return request.auth.uid == userId;
    }

    match /viajespro/{allPaths=**} {
      allow read: if isAuthenticated();
    }

    match /viajespro/gastos/{userId}/{allPaths=**} {
      allow write: if isAuthenticated() && isOwner(userId);
    }
    
    match /{allPaths=**} {
      allow read: if isAuthenticated();
      allow write: if isAuthenticated();
    }
  }
}
```

Haz clic en **"Publicar"**.

---

### 3. Crear el Primer Administrador

Para poder usar la app, necesitas crear al menos un administrador:

#### Paso 3.1: Crear usuario en Authentication
1. Ve a Firebase Console → Authentication
2. Haz clic en "Agregar usuario"
3. Email: `admin@3p.com` (o el que prefieras)
4. Contraseña: (mínimo 6 caracteres)
5. Guarda el usuario

#### Paso 3.2: Obtener el UID
1. En la lista de usuarios, copia el **UID** del usuario recién creado
2. Es algo como: `ABC123xyz789...`

#### Paso 3.3: Crear documento de administrador
1. Ve a Firestore Database
2. Crea una colección llamada: `administradores`
3. Crea un documento con el **UID** copiado como ID
4. El documento puede estar vacío o con estos campos:
   ```json
   {
     "name": "Administrador",
     "role": "admin",
     "createdAt": "2024-01-01T00:00:00.000Z"
   }
   ```

---

### 4. Crear Vendedores (desde el Panel Admin)

1. Inicia sesión como administrador
2. Ve al panel de administración
3. Registra nuevos vendedores
4. Esto creará:
   - Usuario en Authentication
   - Documento en Firestore con el UID como ID

---

### 5. Desplegar Cloud Functions (Opcional pero recomendado)

Las Cloud Functions son necesarias para crear/eliminar vendedores desde el panel de admin.

```bash
# Instalar Firebase CLI si no lo tienes
npm install -g firebase-tools

# Iniciar sesión
firebase login

# Ir a la carpeta de funciones
cd functions
npm install

# Volver a la raíz
cd ..

# Desplegar
firebase deploy --only functions
```

---

## 🔍 DIAGNÓSTICO DE PROBLEMAS

### Error: "Missing or insufficient permissions"
**Causa:** Las reglas de Firestore no permiten la operación.
**Solución:** Verifica que:
1. Las reglas estén publicadas correctamente
2. El usuario esté autenticado (cierra sesión y vuelve a entrar)
3. El documento del vendedor use el UID de Firebase Auth como ID

### Error al subir fotos
**Causa:** Las reglas de Storage no permiten la operación.
**Solución:** Verifica que:
1. Las reglas de Storage estén publicadas
2. El usuario esté autenticado
3. El usuario suba a su propia carpeta (`gastos/{su-uid}/`)

### Vendedor no encontrado después de login
**Causa:** El documento del vendedor en Firestore no existe o tiene un ID diferente al UID.
**Solución:** 
1. Ve a Firestore → Colección `vendedores`
2. Verifica que exista un documento con el UID del usuario
3. Si el documento tiene otro ID, créalo nuevo con el UID correcto

---

## 📝 ESTRUCTURA CORRECTA DE DATOS

### Colección: vendedores
```
vendedores/{uid-de-firebase-auth}
  - name: "Juan Pérez"
  - username: "juan.perez"
  - email: "juan@ejemplo.com"
  - zone: "Bajío"
  - status: "active"
```

### Colección: viajes
```
viajes/{viaje-id}
  - vendedorId: "{uid-de-firebase-auth}"  // Debe coincidir con auth.uid
  - cliente: "CLIENTE SA"
  - destino: "CIUDAD"
  - estado: "activo"
```

### Colección: gastos
```
gastos/{gasto-id}
  - vendedorId: "{uid-de-firebase-auth}"  // Debe coincidir con auth.uid
  - viajeId: "{viaje-id}"
  - monto: 1500.00
  - tipo: "gasolina"
```

---

## ✅ CHECKLIST PARA VERIFICAR

- [ ] Firestore Rules publicadas
- [ ] Storage Rules publicadas
- [ ] Usuario administrador creado en Authentication
- [ ] Documento de administrador creado en Firestore (colección `administradores`)
- [ ] Vendedores creados con UID correcto como ID del documento
- [ ] Cloud Functions desplegadas (para gestión de vendedores)

---

## 🆘 SOPORTE

Si sigues teniendo problemas:

1. Abre la consola del navegador (F12)
2. Ve a la pestaña "Console"
3. Busca mensajes de error en rojo
4. Copia los errores y revisa qué dice exactamente

Errores comunes:
- `Permission denied` = Problema de reglas
- `User not found` = Problema de autenticación
- `No document to update` = El documento no existe

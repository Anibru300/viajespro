# Configuración de Cloud Functions para ViajesPro

Este documento explica cómo configurar y desplegar las Cloud Functions de Firebase para la gestión de vendedores desde el panel de administración.

## Funciones Disponibles

### 1. `createVendor`
Crea un nuevo vendedor en Firebase Authentication y Firestore.

**Permisos:** Solo administradores (verificados contra la colección `administradores`)

**Parámetros:**
- `name` (string, obligatorio): Nombre del vendedor
- `username` (string, obligatorio): Nombre de usuario único
- `password` (string, obligatorio): Contraseña (mínimo 6 caracteres)
- `email` (string, opcional): Email del vendedor. Si no se proporciona, se usa `username@3p-vendedor.com`
- `zone` (string, opcional): Zona asignada. Default: "Bajío"

**Retorno:**
```json
{
  "success": true,
  "message": "Vendedor creado exitosamente",
  "vendor": {
    "uid": "...",
    "username": "...",
    "name": "...",
    "email": "..."
  }
}
```

### 2. `updateVendor`
Actualiza los datos de un vendedor existente en Firebase Authentication y Firestore.

**Permisos:** Solo administradores

**Parámetros:**
- `uid` (string, obligatorio): UID del vendedor
- `name` (string, opcional): Nuevo nombre
- `email` (string, opcional): Nuevo email
- `zone` (string, opcional): Nueva zona
- `status` (string, opcional): Nuevo estado
- `password` (string, opcional): Nueva contraseña (mínimo 6 caracteres)

### 3. `deleteVendor`
Elimina un vendedor de Firebase Authentication y Firestore.

**Permisos:** Solo administradores

**Parámetros:**
- `uid` (string, obligatorio): UID del vendedor a eliminar

---

## Instrucciones de Despliegue

### Paso 1: Instalar Firebase CLI (si no está instalado)

```bash
npm install -g firebase-tools
```

### Paso 2: Iniciar sesión en Firebase

```bash
firebase login
```

### Paso 3: Instalar dependencias de las funciones

```bash
cd functions
npm install
```

### Paso 4: Configurar el proyecto

Asegúrate de que el archivo `.firebaserc` tenga el proyecto correcto:

```json
{
  "projects": {
    "default": "viajespro-3p"
  }
}
```

### Paso 5: Desplegar las funciones

```bash
firebase deploy --only functions
```

O desde la carpeta raíz del proyecto:

```bash
npx firebase deploy --only functions
```

### Paso 6: Verificar el despliegue

Después del despliegue, verifica que las funciones estén activas en:
https://console.firebase.google.com/project/viajespro-3p/functions

---

## Configuración Inicial Requerida

### 1. Crear el primer administrador

Antes de poder usar las Cloud Functions, debes crear al menos un administrador en Firebase Console:

1. Ve a **Authentication** en Firebase Console
2. Crea un usuario con email (ej: `admin@3p.com`) y contraseña
3. Ve a **Firestore Database** y crea la colección `administradores`
4. Crea un documento con el **UID** del usuario creado en el paso 2
5. El documento puede estar vacío o contener datos del admin:
   ```json
   {
     "name": "Administrador",
     "role": "admin",
     "createdAt": "2024-01-01T00:00:00.000Z"
   }
   ```

### 2. Estructura de la colección `vendedores`

Los documentos de vendedores en Firestore usan el **UID de Firebase Auth** como ID del documento:

```
vendedores/{uid}
```

Estructura del documento:
```json
{
  "id": "username",
  "name": "Nombre del Vendedor",
  "username": "username",
  "email": "username@3p-vendedor.com",
  "zone": "Bajío",
  "status": "active",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "createdBy": "adminUid",
  "uid": "firebaseAuthUid"
}
```

### 3. Configurar reglas de seguridad de Firestore

Asegúrate de tener estas reglas en Firestore:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Función para verificar si es admin
    function isAdmin() {
      return exists(/databases/$(database)/documents/administradores/$(request.auth.uid));
    }
    
    // Función para verificar si es el propio vendedor
    function isOwner(userId) {
      return request.auth.uid == userId;
    }
    
    // Colección vendedores
    match /vendedores/{userId} {
      allow read: if isAdmin() || isOwner(userId);
      allow create: if isAdmin();
      allow update: if isAdmin();
      allow delete: if isAdmin();
    }
    
    // Colección administradores (solo lectura para verificación)
    match /administradores/{userId} {
      allow read: if request.auth.uid == userId;
      allow write: if false; // Solo se modifica desde Firebase Console
    }
    
    // Resto de colecciones...
  }
}
```

---

## Uso desde el Frontend

El frontend (`app.js`) ya está configurado para usar estas funciones:

1. **Registro de vendedor**: La función `registerVendor()` en el panel de admin llama a `createVendor`
2. **Actualización de vendedor**: `saveVendorChanges()` llama a `updateVendor`
3. **Eliminación de vendedor**: `deleteVendor()` llama a `deleteVendor`

### Errores comunes

| Error | Causa | Solución |
|-------|-------|----------|
| `functions/unauthenticated` | El usuario no está autenticado | Iniciar sesión nuevamente |
| `functions/permission-denied` | El usuario no es administrador | Verificar que exista en la colección `administradores` |
| `functions/already-exists` | El username o email ya existe | Usar un username/email diferente |
| `functions/invalid-argument` | Datos inválidos (contraseña corta, etc.) | Verificar los datos ingresados |

---

## Desarrollo Local con Emuladores

Para probar las funciones localmente:

1. Instalar emuladores:
```bash
firebase setup:emulators
```

2. Iniciar emuladores:
```bash
firebase emulators:start --only functions,auth,firestore
```

3. En `app.js`, descomentar la línea del emulador:
```javascript
connectFunctionsEmulator(functions, "localhost", 5001);
```

4. Las funciones locales estarán disponibles en:
```
http://localhost:5001/viajespro-3p/us-central1/createVendor
```

---

## Región de las Funciones

Por defecto, las funciones se despliegan en `us-central1`. Si necesitas cambiar la región, modifica el archivo `functions/index.js`:

```javascript
const {onCall} = require("firebase-functions/v2/https");

exports.createVendor = onCall({
    region: "southamerica-east1", // Cambiar región aquí
    cors: true,
}, async (request) => {
    // ...
});
```

---

## Solución de Problemas

### Error: "No tienes permisos para crear vendedores"
- Verifica que el usuario esté autenticado
- Verifica que el documento con su UID exista en la colección `administradores`

### Error: "Ya existe un vendedor con este nombre de usuario"
- El username debe ser único en toda la colección
- Verifica que no haya un vendedor existente con ese username

### Error: "Failed to get Firebase project"
- Verifica que estés en el directorio correcto
- Ejecuta `firebase use viajespro-3p` para seleccionar el proyecto

### Error CORS al llamar desde el frontend
- Verifica que la opción `cors: true` esté configurada en la función
- Asegúrate de que el dominio de tu app esté en la lista de autorizados en Firebase Console

---

## Notas de Seguridad

1. **Nunca expongas las credenciales de admin en el frontend**
2. **Todas las operaciones de creación/eliminación deben pasar por las Cloud Functions**
3. **Las reglas de Firestore deben restringir el acceso a administradores**
4. **Considera habilitar App Check para proteger contra abuso de las funciones**

---

## Contacto y Soporte

Para problemas con las Cloud Functions, revisa:
- Logs en Firebase Console > Functions > Logs
- Firebase Documentation: https://firebase.google.com/docs/functions

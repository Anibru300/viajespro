# 🔧 Crear Índice en Firestore (Solución al Error)

## Error que estás viendo:
```
The query requires an index. You can create it here:
https://console.firebase.google.com/...
```

---

## ✅ Solución Rápida (Método 1 - Recomendado)

### Paso 1: Abrir el Link Directo
1. **Haz clic en el link azul** que aparece en el mensaje de error de la consola
2. Eso te llevará directamente a Firebase Console con el índice pre-configurado
3. Solo tienes que hacer clic en **"Crear índice"**

---

## ✅ Solución Manual (Método 2)

Si el link no funciona, sigue estos pasos:

### Paso 1: Ir a Firebase Console
1. Abre: https://console.firebase.google.com
2. Selecciona tu proyecto: **viajespro-3p**
3. Ve al menú lateral: **Firestore Database**

### Paso 2: Crear el Índice
1. Haz clic en la pestaña **"Índices"** (arriba)
2. Haz clic en el botón **"Agregar índice"**
3. Completa así:

| Campo | Valor |
|-------|-------|
| **ID de colección** | `viajes` |
| **Ámbito de la consulta** | Colección |

### Paso 3: Agregar Campos
Haz clic en "Agregar campo" dos veces:

**Campo 1:**
- Nombre del campo: `vendedorId`
- Orden: **Ascendente** ⬆️

**Campo 2:**
- Nombre del campo: `createdAt`
- Orden: **Descendente** ⬇️

### Paso 4: Guardar
1. Haz clic en **"Crear índice"**
2. Espera 1-2 minutos a que el estado cambie a **"Habilitado"** ✅

---

## 📸 Vista Visual del Índice

```
┌─────────────────────────────────────────┐
│  ID de colección:  [ viajes          ]  │
│                                         │
│  Campos indexados:                      │
│  ┌─────────────────┬──────────────┐    │
│  │ vendedorId      │ Ascendente  ↑ │    │
│  │ createdAt       │ Descendente ↓ │    │
│  └─────────────────┴──────────────┘    │
│                                         │
│         [ Crear índice ]                │
└─────────────────────────────────────────┘
```

---

## 🚀 Desplegar con Firebase CLI (Método 3 - Para desarrolladores)

Si tienes Firebase CLI instalado:

```bash
# En la carpeta del proyecto
firebase deploy --only firestore:indexes
```

O con npx:
```bash
npx firebase deploy --only firestore:indexes
```

---

## ⏳ Tiempo de Espera

Después de crear el índice:
- **Construyendo** 🟡 → Espera 1-2 minutos
- **Habilitado** ✅ → ¡Listo! Recarga la app

---

## 🧪 Verificar que Funciona

1. Recarga la página (Ctrl+F5)
2. Ve a "Viajes"
3. Los viajes deberían aparecer ahora

Si aún no aparecen, abre la consola (F12) y verifica que no haya más errores de índice.

---

## ❓ Preguntas Frecuentes

### ¿Por qué pasó esto?
Firestore requiere índices para consultas que combinan `where` + `orderBy`. Sin el índice, la consulta falla.

### ¿Tengo que crear más índices?
Posiblemente. Si ves otro error similar con un link diferente, repite el proceso.

### ¿Cuántos índices necesito?
Mínimo estos 3 para la app:
1. `viajes`: vendedorId + createdAt ← **Este es el que falta ahora**
2. `gastos`: vendedorId + fecha
3. `gastos`: viajeId + fecha

Los demás se crean automáticamente o ya están en el archivo.

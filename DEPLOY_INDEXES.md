# 🚀 Desplegar Índices y Configuración en Firebase

## ⚠️ ERROR ACTUAL: "Missing or insufficient permissions"

Esto ocurre porque faltan **índices en Firestore** para las consultas de gastos.

---

## 📋 OPCIÓN 1: Desplegar Todo Automáticamente (Recomendado)

### Paso 1: Abrir Terminal
Abre CMD o PowerShell en la carpeta del proyecto.

### Paso 2: Ejecutar Comando
```bash
firebase deploy --only firestore:indexes,firestore:rules
```

Si no tienes Firebase CLI instalado globalmente:
```bash
npx firebase deploy --only firestore:indexes,firestore:rules
```

### Paso 3: Esperar
Los índices tardan **2-5 minutos** en construirse. Verás mensajes como:
```
✔ firestore:indexes: indices deployed successfully
```

---

## 📋 OPCIÓN 2: Crear Manualmente en Firebase Console

### Índices Necesarios:

#### Índice 1: Viajes por Vendedor
```
Colección: viajes
Campos:
  1. vendedorId → Ascendente
  2. createdAt → Descendente
```

#### Índice 2: Gastos por Viaje y Vendedor
```
Colección: gastos
Campos:
  1. vendedorId → Ascendente
  2. viajeId → Ascendente
  3. fecha → Descendente
```

#### Índice 3: Gastos por Vendedor
```
Colección: gastos
Campos:
  1. vendedorId → Ascendente
  2. fecha → Descendente
```

### Pasos:
1. Ve a https://console.firebase.google.com
2. Selecciona proyecto **viajespro-3p**
3. Firestore Database → Índices
4. Haz clic en "Agregar índice"
5. Configura cada índice como se muestra arriba
6. Espera a que el estado sea "Habilitado" ✅

---

## 🔄 Después de Crear los Índices

1. **Recarga la app** (Ctrl+F5)
2. Prueba crear un viaje
3. Ve a "Viajes" - deberían aparecer
4. Ve a "Gastos" - deberían cargar sin error

---

## 🧪 Verificar que Funciona

Abre la consola (F12) y busca estos mensajes:
```
[DEBUG v5.1] Viajes encontrados: X
[DEBUG v5.1] Gastos cargados correctamente
```

Si no hay errores rojos, ¡todo funciona!

---

## ❓ Si Siguen los Errores

Ejecuta en la consola del navegador:
```javascript
diagnosticarSession()
```

Y envíame el resultado.

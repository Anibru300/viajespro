# Crear Índices en Firestore

Si los viajes se crean pero no aparecen en la lista, necesitas crear estos índices:

## Índice 1: Viajes por Vendedor
```
Colección: viajes
Campos:
  - vendedorId (Ascending)
  - createdAt (Descending)
```

## Índice 2: Viajes por Vendedor y Estado
```
Colección: viajes
Campos:
  - vendedorId (Ascending)
  - estado (Ascending)
  - fechaInicio (Descending)
```

## Índice 3: Gastos por Viaje
```
Colección: gastos
Campos:
  - viajeId (Ascending)
  - fecha (Descending)
```

## Cómo Crearlos Manualmente

1. Ve a Firebase Console → Firestore Database → Índices
2. Haz clic en "Agregar índice"
3. Selecciona la colección (ej: "viajes")
4. Agrega los campos en el orden mostrado arriba
5. Guarda el índice

## O usa el archivo firestore.indexes.json

El archivo ya está configurado. Solo necesitas desplegarlo:

```bash
firebase deploy --only firestore:indexes
```

O si usas npx:
```bash
npx firebase deploy --only firestore:indexes
```

## Verificar que Funciona

Después de crear los índices:
1. Espera 1-2 minutos a que se construyan
2. Recarga la app (Ctrl+F5)
3. Intenta crear un viaje
4. Verifica que aparezca en la lista

## Si el Error Persiste

Abre la consola (F12) y busca mensajes de error rojos. Los errores de índice suelen decir:
```
The query requires an index. You can create it here: [URL]
```

Firebase te dará un link directo para crear el índice faltante.

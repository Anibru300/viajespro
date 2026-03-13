# Changelog - ViajesPro

Todos los cambios notables de este proyecto se documentarán en este archivo.

## [6.1.0] - 2026-03-13

### 🚀 Nuevas Funcionalidades

#### Reporte ZIP Mejorado
- **Organización por categorías**: Las fotos ahora se organizan automáticamente en subcarpetas:
  - `01_GASOLINA/` - Fotos de tickets de gasolina
  - `02_COMIDA/` - Fotos de comidas y restaurantes  
  - `03_HOTEL/` - Fotos de hospedaje y hoteles
  - `04_TRANSPORTE/` - Fotos de transporte (taxis, Uber, etc.)
  - `05_CASETAS/` - Fotos de casetas de peaje
  - `06_OTROS/` - Otras categorías de gastos
  - `00_SIN_CATEGORIA/` - Fotos sin categoría específica

- **Nombres descriptivos**: Los archivos de fotos ahora incluyen:
  - Fecha del gasto
  - Folio de factura
  - Nombre del cliente
  - Destino
  - Monto
  - Formato: `FECHA_FOLIO_CLIENTE_DESTINO_MONTO_NUM.ext`

- **Archivo README.txt**: Incluye información completa del reporte con estadísticas

#### Sistema de Actualización Automática
- Verificación automática de nuevas versiones cada 5 minutos
- Notificación visual cuando hay una actualización disponible
- Botón "Verificar Actualización" en el dashboard para chequeo manual
- Opción de actualizar inmediatamente o posponer
- Limpieza automática de caché al actualizar

### 🐛 Correcciones

#### Fotos en ZIP
- **Arreglado**: Las fotos ahora se descargan correctamente usando XMLHttpRequest con manejo de CORS
- **Mejorado**: Manejo de errores con archivos de texto descriptivos para fotos fallidas
- **Optimizado**: Compresión DEFLATE nivel 6 para archivos ZIP más pequeños

### 🔧 Mejoras Técnicas

- Implementado `UpdateManager` class para gestión de actualizaciones
- Mejorado el Service Worker para notificar nuevas versiones
- Actualizada versión del caché a `viajespro-v6.1.0`

### 📱 Cambios en la Interfaz

- Agregado botón "🔄 Verificar Actualización" en accesos rápidos del dashboard
- Agregado botón "☁️ Sincronizar Datos" en accesos rápidos del dashboard
- Modal de notificación cuando hay nueva versión disponible

---

## [6.0.0] - 2026-03-07

### 🎉 Versión Inicial

- Sistema completo de control de gastos de viaje
- Autenticación con Firebase Auth
- Gestión de viajes y gastos
- Reportes con gráficos (Chart.js)
- Exportación a Excel (ExcelJS)
- Geolocalización de gastos
- Modo offline (PWA)
- Cloud Functions para administración de vendedores
- Panel de administración
- Modo oscuro

---

## Cómo Actualizar

### Para Usuarios
1. Abre la aplicación
2. Toca "🔄 Verificar Actualización" en el dashboard
3. Si hay nueva versión, confirma la actualización
4. La app se recargará automáticamente

### Para Desarrolladores
```bash
# Hacer cambios
git add .
git commit -m "Descripción de cambios"
git push origin main

# Desplegar a Firebase
firebase deploy
```

---

**Nota**: Este changelog sigue el formato [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/).

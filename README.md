# FP&CU

Aplicación web privada de finanzas personales (PWA). Funciona sin conexión y sincroniza entre dispositivos
contra un Google Apps Script propio, con respaldo diario en Google Drive.

- `index.html`: interfaz y reglas financieras.
- `sync.js`: almacenamiento local, cola de cambios y sincronización por registro.
- `config.js`: URL pública del servidor (sin claves).
- `sw.js`, `manifest.webmanifest`, `icons/`: instalación y uso offline.
- `apps-script/`: servidor (Code.gs) para pegar en la hoja FP&CU Datos.

Este repositorio no contiene datos financieros, respaldos ni la clave privada. Ver `ACTUALIZAR_A_V2.md`.

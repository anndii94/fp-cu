# FP&CU - Version 1 real

Aplicacion privada de finanzas personales, basada en la Version 1 visual/funcional aprobada.

## Arquitectura

- GitHub Pages: publica solamente la interfaz y el codigo de la aplicacion.
- Almacenamiento local del navegador: permite abrir y registrar aun con interrupciones de red.
- Google Apps Script: servidor de sincronizacion protegido por una clave privada de alta entropia y sesiones temporales.
- Google Sheets: copia central sincronizada de los registros.
- Google Drive: respaldos JSON automaticos diarios del servidor, con retencion de 35 dias.
- Exportacion JSON desde FP&CU: respaldo manual legible y portable.

## Regla de privacidad mas importante

El repositorio GitHub NO debe contener:

- `FP_CU_ESTADO_REAL_INICIAL_OCTUBRE_2026.json`
- exportaciones o respaldos JSON de uso real
- claves privadas
- saldos, nombres de terceros u otros datos financieros reales

El archivo `config.js` solo contiene la URL publica de Apps Script. Esa URL no concede acceso por si sola.

## Primera puesta en marcha

Sigue `CONFIGURACION_PASO_A_PASO.md`.

## Recuperacion

Si pierdes la clave privada, abre la hoja `FP&CU Datos`, usa el menu **FP&CU > Rotar clave privada** y conecta nuevamente tus dispositivos. Rotar la clave tambien invalida todas las sesiones existentes.
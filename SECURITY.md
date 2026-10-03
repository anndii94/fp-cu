# Seguridad de FP&CU

## Que es publico

GitHub Pages sirve HTML, CSS, JavaScript, iconos y la URL del web app de Apps Script. No contiene datos financieros reales ni credenciales.

## Que es privado

- La clave privada FP&CU se genera dentro de tu Google Sheet/Apps Script.
- Apps Script guarda solamente SHA-256 de la clave, no la clave original.
- La clave se envia solo al iniciar una sesion, mediante HTTPS y dentro del cuerpo POST.
- Despues del acceso, la app usa un token de sesion firmado con HMAC que vence en 7 dias.
- Las sesiones nunca se envian en la URL.
- Los datos centrales viven en una hoja privada de tu cuenta Google.
- Los respaldos automaticos viven en una carpeta privada de Google Drive.

## Si sospechas que la clave se filtro

1. Abre `FP&CU Datos`.
2. Usa **FP&CU > Rotar clave privada**.
3. Guarda la nueva clave en tu gestor de contrasenas.
4. Vuelve a abrir FP&CU en cada dispositivo e introduce la nueva clave.

La rotacion cambia tambien el secreto de firma, por lo que todas las sesiones antiguas dejan de funcionar.

## Limitacion importante

GitHub Pages no es un portal privado en el plan gratuito: cualquiera puede descargar la interfaz publicada. La privacidad se aplica a los datos y al servidor de sincronizacion. Nunca coloques informacion financiera real dentro del repositorio.
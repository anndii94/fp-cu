# FP&CU real - configuracion paso a paso

Haz los pasos en este orden. No subas el archivo privado de apertura a GitHub.

## A. GitHub

1. Crea un repositorio PUBLICO llamado `fp-cu`.
2. Sube a la raiz solamente los archivos de este paquete publico.
3. En Settings > Pages selecciona `Deploy from a branch`, rama `main`, carpeta `/(root)`.
4. Espera a que GitHub muestre la direccion de Pages.

## B. Google Sheet + Apps Script

5. Crea una hoja de calculo llamada `FP&CU Datos`.
6. En esa hoja abre Extensiones > Apps Script.
7. Reemplaza el contenido de `Code.gs` por `apps-script/Code.gs` de este paquete.
8. En Apps Script abre Project Settings, activa `Show appsscript.json manifest file in editor` y reemplaza el manifiesto por `apps-script/appsscript.json`.
9. Guarda el proyecto y vuelve a la hoja. Recarga la pagina.
10. En la hoja aparecera el menu `FP&CU`. Elige `FP&CU > Configurar servidor`.
11. Google pedira permisos para la hoja y Drive. Autoriza con TU cuenta.
12. Se mostrara una clave larga que empieza por `FPCU-`. Copiala y guardala en un gestor de contrasenas. No la pongas en GitHub.

## C. Publicar Apps Script como API

13. En Apps Script ve a Deploy > New deployment.
14. Tipo: Web app.
15. Execute as: Me.
16. Who has access: Anyone.
17. Pulsa Deploy y copia la URL que termina en `/exec`.

Que el web app acepte peticiones anonimas NO significa que los datos sean publicos: `doPost` exige una clave privada para crear sesion y exige sesion firmada para leer/escribir. `doGet` nunca entrega datos.

## D. Conectar GitHub Pages con Apps Script

18. En GitHub abre `config.js`.
19. Sustituye `REEMPLAZAR_APPS_SCRIPT_EXEC_URL` por la URL `/exec` copiada en el paso anterior.
20. Guarda el cambio y espera a que GitHub Pages se actualice.

## E. Primera apertura real

21. Abre la direccion de GitHub Pages.
22. FP&CU pedira la clave privada. Pegala.
23. En Mas > Ajustes y respaldo, importa UNA SOLA VEZ `FP_CU_ESTADO_REAL_INICIAL_OCTUBRE_2026.json`.
24. Espera a que el indicador diga `Sincronizado`.
25. Revisa saldo inicial, tarjeta, cuentas por cobrar, gastos fijos e historial.

## F. Segundo dispositivo

26. Abre la misma direccion de GitHub Pages en el segundo dispositivo.
27. Escribe la misma clave privada.
28. NO importes la apertura otra vez. La app debe descargar la copia central automaticamente.
29. Haz un movimiento ficticio pequeno y comprueba que aparece en el otro dispositivo; luego elimínalo y verifica que el borrado tambien se sincroniza.

## G. Respaldos

- Apps Script crea un JSON en `FP&CU Respaldos` de Google Drive una vez al dia y conserva aproximadamente 35 dias.
- Puedes crear uno inmediatamente desde la hoja: `FP&CU > Crear respaldo ahora`.
- En la app puedes descargar un JSON manual desde Ajustes y respaldo.
- Guarda periodicamente una copia manual fuera del navegador.
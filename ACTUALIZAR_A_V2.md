# Actualizar FP&CU a la v2.9

Parte 1 y 2 en el computador. Partes 3 a 6 en el celular.
El servidor (Apps Script) no cambió desde la v2.0: si ya lo configuraste, no hay que tocarlo.

## Parte 1. Subir la app a GitHub (computador)

1. Abre github.com/anndii94/fp-cu/upload/main
2. Arrastra estos 7 archivos: index.html, sw.js, sync.js, config.js, manifest.webmanifest, README.md, ACTUALIZAR_A_V2.md
3. Clic en **Commit changes**.
4. Entra a la carpeta **icons** del repositorio. Debe tener 5 archivos: apple-touch-icon.png, icon-192.png,
   icon-512.png, icon-maskable-512.png e icon.svg. Si falta alguno: dentro de esa carpeta, Add file > Upload files, súbelos y Commit.
5. Abre el archivo **.gitignore** del repositorio > lápiz > reemplaza el contenido por el del archivo .gitignore descargado > Commit.
6. Pestaña **Actions**: espera el ✓ verde (1 o 2 minutos).

## Parte 2. Revisar el servidor (computador)

En la hoja FP&CU Datos: **FP&CU > Ver estado del servidor**. Debe decir *Clave configurada: sí* y *Respaldo diario: activo*.
Si dice que no, haz la Parte 3 de la guía anterior (pegar Code.gs, Configurar servidor, Nueva versión).

## Parte 3. Instalar la app (celular)

1. Si tienes un ícono viejo de FP&CU en la pantalla de inicio, mantenlo presionado > Eliminar.
2. Safari > anndii94.github.io/fp-cu > recarga dos veces.
3. Compartir > **Agregar a inicio** > Agregar.
4. Abre la app **desde el ícono nuevo** y entra con tu clave FPCU.
5. Más > baja al final: debe decir **FP&CU 2.9.0**. Si no, cierra la app y ábrela otra vez.

A partir de aquí todo se hace dentro de la app instalada: el iPhone la guarda aparte de Safari.

## Parte 4. Cargar los datos (celular, dentro de la app)

1. Más > Ajustes y respaldo > Importar apertura o respaldo JSON > el archivo de apertura v4 > Importar.
2. Repite con el archivo del histórico (opcional, solo consulta).
3. Espera **Sincronizado** y valida los saldos con tu lista privada.

## Parte 5. Configurar (celular)

1. Tarjetas > Editar la tarjeta > escribe la **tasa de interés mensual** de tu extracto > Guardar.
2. Plan > Gastos fijos > Agua > Editar > Frecuencia **Cada 2 meses**, desde el mes en que toca > Guardar.
3. Si el banco muestra más dinero porque incluye bolsillos: + > Cuadrar con el banco; luego Más > Bolsillos > Ajustar saldo en cada uno.
4. Marca con el círculo los fijos que ya pagaste o apartaste. El Agua con otro valor: tócala > Pagado con otro valor o fecha.
5. Cuando te paguen, marca el círculo del sueldo en Inicio.
6. Más > Ajustes y respaldo > Seguridad > **Activar PIN**, y luego **Desbloquear con Face ID**.

## Parte 6. Respaldo y segundo dispositivo

1. En la hoja (computador): FP&CU > Crear respaldo ahora.
2. En otro dispositivo: misma dirección, entra con la clave y **no importes nada**. Prueba un gasto pequeño de ida y vuelta.

# Actualizar FP&CU a la v2.5

La v2 trae su propio servidor y su propio formato de datos. Como la base central todavía está vacía,
este es el momento seguro para cambiar todo el conjunto.

## 0. Antes de empezar

- Ten a mano el zip `fp-cu-v2-repositorio.zip` (descomprimido) y la carpeta privada con
  `FPCU_APERTURA_OCT_2026_v3.json` y `FPCU_HISTORICO_ABR2025_SEP2026.json`.
- La carpeta privada **nunca** va al repositorio.
- Hazlo desde un computador; el celular solo se usa al final para instalar la app.

## 1. Guardar la V1 como referencia (GitHub)

1. Abre https://github.com/anndii94/fp-cu
2. Clic en **Releases** (columna derecha) > **Create a new release**.
3. En *Choose a tag* escribe `v1` y elige *Create new tag*. Título: `FP&CU V1 aprobada`. Clic en **Publish release**.

## 2. Subir la v2.4 al repositorio

1. En la página del repositorio: **Add file > Upload files**.
2. Arrastra **el contenido** de la carpeta `fp-cu` del zip (no la carpeta misma):
   `index.html`, `sync.js`, `config.js`, `sw.js`, `manifest.webmanifest`, `.gitignore`, `README.md`,
   `ACTUALIZAR_A_V2.md`, la carpeta `icons` y la carpeta `apps-script`.
   Si tu navegador no deja arrastrar `.gitignore` por estar oculto, súbelo aparte o créalo con *Add file > Create new file*.
3. Mensaje del commit: `FP&CU v2.5`. Clic en **Commit changes** (directo a `main`).
4. Espera 1 o 2 minutos y revisa **Actions**: el despliegue de Pages debe quedar en verde.

## 3. Actualizar el servidor (Apps Script)

1. Abre la hoja **FP&CU Datos** > **Extensiones > Apps Script**.
2. Abre `Code.gs`, borra todo, pega el contenido de `apps-script/Code.gs` y guarda (Ctrl+S).
3. Vuelve a la hoja y **recarga la página**. Ejecuta **FP&CU > Configurar servidor**.
   - La primera vez Google pide permisos: *Revisar permisos* > tu cuenta > *Configuración avanzada* > *Ir a…* > *Permitir*.
   - Sale una ventana con la **clave privada nueva** `FPCU-…`. Cópiala a tu gestor de contraseñas. La anterior deja de servir.
4. En Apps Script: **Implementar > Administrar implementaciones** > lápiz de la implementación actual >
   *Versión*: **Nueva versión** > **Implementar**. La URL /exec no cambia.
5. Comprueba: hoja > **FP&CU > Ver estado del servidor** (clave configurada: sí; respaldo diario: activo).

## 4. Primer dispositivo: cargar tus datos

1. Abre https://anndii94.github.io/fp-cu/ y recarga dos veces para tomar la versión nueva (en Más, al final, debe decir 2.5.0).
2. Entra con la clave nueva.
3. **Más > Ajustes y respaldo > Importar apertura o respaldo JSON** > `FPCU_APERTURA_OCT_2026_v3.json` > Importar.
4. Repite con `FPCU_HISTORICO_ABR2025_SEP2026.json` (opcional, solo consulta: no toca saldos).
5. Espera el indicador **Sincronizado** y valida contra tu lista privada.
6. Si tu banco muestra un total mayor porque incluye lo que ya tienes en bolsillos:
   primero **+ > Cuadrar con el banco** con el total real, y después **Más > Bolsillos > Ajustar saldo** en cada bolsillo.
7. En **Plan > Gastos fijos**, marca los de octubre que ya hayas pagado o apartado.
8. Hoja > **FP&CU > Crear respaldo ahora**.

## 5. Instalar en la pantalla de inicio

**iPhone (Safari):** si tenías un ícono viejo de FP&CU, bórralo primero (iOS guarda el ícono al instalar).
Abre la URL en Safari > botón **Compartir** > **Agregar a inicio** > **Agregar**.
Abre la app desde ese ícono y entra con tu clave (Safari y la app instalada no comparten sesión).

**Android (Chrome):** menú ⋮ > **Instalar app** (o *Agregar a pantalla principal*).

## 6. Segundo dispositivo

Abre la URL, entra con la clave y **no importes nada**: descarga la copia central.
Registra un gasto pequeño, verifica que aparece en el otro dispositivo, bórralo y verifica que el borrado también llega.

## Si algo no se ve actualizado

- Recarga dos veces; si sigue igual, cierra la app instalada y ábrela de nuevo.
- En iPhone: Ajustes > Safari > Avanzado > Datos de sitios web > busca `github.io` > Eliminar.
  Esto borra los datos locales de ese navegador; los datos sincronizados se vuelven a descargar al entrar.

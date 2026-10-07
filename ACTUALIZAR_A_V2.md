# FP&CU — Guía para actualizar a la versión 3.2.0

Tiempo: unos 20 minutos. Partes 1 y 2 en el **computador**; partes 3 a 5 en el **celular**.
Tus datos no se tocan: están en el servidor y en el celular, y la actualización solo cambia el código.

**Qué trae la 3.2:**
- Diseño nativo de iPhone.
- Íconos por categoría y tarjeta estilo Wallet.
- Deslizar para borrar y jalar para sincronizar.
- Registrar gastos con Siri.

---

## Antes de empezar

Ten a mano estos 4 archivos de la v3.2.0. Están en la carpeta `repositorio/fp-cu/` del paquete:

| Archivo | Dónde va en GitHub |
|---|---|
| `index.html` | raíz del repositorio |
| `sync.js` | raíz del repositorio |
| `sw.js` | raíz del repositorio |
| `Code.gs` | carpeta `apps-script` |

También necesitas tu clave privada `FPCU-…`, del gestor de contraseñas.

---

## Parte 1 · Subir la app a GitHub (computador)

**1.1** Abre en el navegador: **github.com/anndii94/fp-cu/upload/main**
   Si te pide iniciar sesión, entra con tu usuario de GitHub.

**1.2** Arrastra a la página estos 3 archivos: **index.html**, **sync.js** y **sw.js**.
   ✔ Debes verlos listados abajo, con su tamaño.

**1.3** Baja hasta el final y toca el botón verde **Commit changes**.

**1.4** Ahora el servidor:
   1. En la página del repositorio entra a la carpeta **apps-script**.
   2. Toca **Add file → Upload files**.
   3. Arrastra **Code.gs** y toca **Commit changes**.
   ✔ Si GitHub dice que reemplaza al existente, está bien.

**1.5** Toca la pestaña **Actions** y espera 1 o 2 minutos.
   ✔ Debe aparecer un **✓ verde** en "pages build and deployment".

> Opcional: sube también la versión nueva de `ACTUALIZAR_A_V2.md`, que contiene esta guía. Si quieres, borra `CONFIGURACION_PASO_A_PASO.md` y `SECURITY.md`, que son de la V1.

---

## Parte 2 · Actualizar el servidor (computador)

**2.1** Abre en Google Drive tu hoja **FP&CU Datos**.

**2.2** En el menú: **Extensiones → Apps Script**. Se abre otra pestaña.

**2.3** A la izquierda toca **Code.gs**. Haz clic dentro del código y selecciona todo con **Ctrl + A** (en Mac, **Cmd + A**). Bórralo.

**2.4** Abre el archivo **Code.gs** nuevo con el Bloc de notas, cópialo todo y pégalo. Toca el **disquete** para guardar.
   Otra forma: en GitHub abre `apps-script/Code.gs` y usa el botón **Copy raw file**.

**2.5** Publica la nueva versión:
   1. Arriba a la derecha toca **Implementar → Administrar implementaciones**.
   2. Toca el **lápiz** (Editar).
   3. En **Versión** elige **Nueva versión**.
   4. Toca **Implementar** y luego **Listo**.

   ⚠️ **No uses "Nueva implementación"**: cambiaría la dirección del servidor y la app dejaría de conectarse.

**2.6** Comprueba que quedó bien: vuelve a la hoja y toca **FP&CU → Ver estado del servidor**.
   ✔ Debe decir *Clave configurada: sí* y *Respaldo diario: activo*.

> No hace falta ejecutar "Configurar servidor" otra vez: tu clave y tus datos siguen iguales.

---

## Parte 3 · Actualizar la app en el iPhone

**3.1** Cierra FP&CU por completo: desliza hacia arriba desde abajo, busca la app y deslízala hacia arriba.

**3.2** Ábrela otra vez desde el **ícono del anillo** y desbloquéala con PIN o Face ID.

**3.3** Toca **Más** y baja hasta el final.
   ✔ Debe decir **FP&CU 3.2.0**.
   ✘ Si dice otro número: espera un minuto, ciérrala y ábrela de nuevo. Si sigue igual, revisa que el ✓ verde de la Parte 1.5 haya salido.

**3.4** Revisa que todo esté en orden:
   - La pastilla de arriba dice **Sincronizado**, o se ve un punto verde si ya bajaste en la pantalla.
   - Tus cifras siguen igual en Inicio, Tarjetas y Plan.
   - Las pestañas de abajo son 5. **Cuentas aparte** ahora está en **Más**.

**3.5** Prueba los gestos nuevos:
   - En **Inicio**, arriba del todo, **jala hacia abajo** y suelta: sincroniza.
   - En **Movimientos**, **desliza un movimiento a la izquierda**: aparece *Borrar*. Desliza a la derecha o toca otro lugar para cancelar.

---

## Parte 4 · Registrar con Siri (opcional, una sola vez)

**4.1** En la app: **Más → Ajustes y respaldo → Siri y Atajos → Registrar con Siri**.

**4.2** Toca **Crear llave para atajos**.
   - Aparece tu llave `ATJ-…`. Tócala para **copiarla** y guárdala en tu gestor de contraseñas: no se vuelve a mostrar.
   - Toca también la fila **Servidor** para copiar la dirección.

**4.3** Abre la app **Atajos** del iPhone y toca **+**. Arriba, ponle de nombre **Registrar gasto**: es lo que le dirás a Siri.

**4.4** Toca **Agregar acción** y agrega, en este orden:

| # | Acción | Cómo configurarla |
|---|---|---|
| 1 | **Pedir entrada** | Tipo: **Número**. Pregunta: *¿Cuánto fue?* |
| 2 | **Pedir entrada** | Tipo: **Texto**. Pregunta: *¿En qué?* |
| 3 | **Lista** | Escribe tus categorías: Comida, Mercado, Transporte, Moto, Hogar, Servicios, Salud, Ocio, Compras, Otros |
| 4 | **Elegir de la lista** | Usa la Lista anterior. Mensaje: *¿Categoría?* |
| 5 | **Obtener contenido de URL** | Pega la dirección del **Servidor**. Toca la flecha **>** y elige Método **POST**, Cuerpo de la solicitud **JSON**. Agrega 6 campos de tipo **Texto**:<br>`action` → `quick`<br>`llave` → tu llave ATJ-…<br>`tipo` → `gasto`<br>`monto` → toca el campo y elige **Entrada proporcionada** de la acción 1<br>`desc` → **Entrada proporcionada** de la acción 2<br>`cat` → **Elemento elegido** |
| 6 | **Obtener valor del diccionario** | Clave: `msg` |
| 7 | **Mostrar resultado** | Muestra el **Valor del diccionario** |

**4.5** Toca **Listo**. Pruébalo: di **"Oye Siri, registrar gasto"**.
   ✔ Siri pregunta el monto, la descripción y la categoría, y responde algo como *"Listo: gasto de $20.000, Almuerzo (Comida)"*.
   ✔ En FP&CU aparece con la etiqueta **Siri** la próxima vez que abras la app o jales para sincronizar.

**4.6** Atajos extra (opcional): duplica el atajo (mantén presionado → **Duplicar**) y cámbialo:
   - **Registrar compra:** `tipo` → `compra`. Agrega `tarjeta` → `GNB` y, si quieres, `cuotas` → Pedir entrada (Número).
   - **Registrar ingreso:** `tipo` → `ingreso`. Quita la lista de categorías y el campo `cat`.

**Si algo falla con Siri:**
- *"Los atajos no están activados"* → repite 4.2.
- *"La llave del atajo no es válida"* → revisa que la copiaste completa, o crea una nueva en 4.2 y reemplázala en el atajo.
- *"Acción desconocida"* → falta la Parte 2 (el servidor nuevo).
- Si pierdes el celular o alguien vio tu llave: en la app, **Desactivar atajos** o **Crear otra llave**.

---

## Parte 5 · Cierre

**5.1** En la hoja, en el computador: **FP&CU → Crear respaldo ahora**.

**5.2** Si usas otro dispositivo, cierra y abre FP&CU allí también. **No importes nada.**

**5.3** Guarda el paquete completo (`FPCU_PAQUETE_COMPLETO_v3.2.0.zip`) en tu carpeta privada (iCloud o Drive), **nunca en GitHub**.

✅ Listo: FP&CU queda en la versión 3.2.0.

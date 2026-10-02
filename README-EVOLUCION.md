# BusinessHub — Evolución del prototipo

Sigue siendo **HTML + CSS + JavaScript modular** (sin framework). Abrir `index.html` en el navegador.

## Usuarios DEMO (solo prototipo, NO es seguridad de producción)
| Rol | Usuario | Contraseña |
|---|---|---|
| Administrador | `admin` | `admin123` |
| Empleado | `empleado` | `empleado123` |

## Capas
```
index.html / módulos UI (ventas, clientes, fidelidad, reportes, ...)
        ↓ solo llaman a
js/api.js   → API.facturas.crear, API.tarjetas.*, API.reportes.*, API.auth.* ...   (contrato { ok, data | error })
        ↓ hoy operan sobre
js/data.js  → DEMO (datos en memoria) + DEMO.calc (reglas puras de precio/descuento/pago)
js/auth.js  → sesión, roles y permisos
```
**Conectar backend:** reemplazar el cuerpo de cada método de `API` por `fetch('/api/...')` que devuelva el mismo contrato.
La lógica marcada en `api.js` como "servidor" (validaciones, transacción, permisos) debe vivir en el backend.

## Modelo de factura (mapeable a PostgreSQL)
`factura` → `clienteId`, `empleadoId`, `negocio`, `fecha`, `estado`, `subtotal`, `descuento`, `total`, `pagos[]` (`factura_pago`), `lineas[]` (`factura_detalle`: tipo, refId, cantidad, precio, descuento, subtotal), `consumos[]`.
Los campos anteriores (`metodoPago`, `servicioNombre`, `fidelidadDia`) se conservan como *compatibilidad*.

## Pago mixto
`pagos: [{ metodo: "fidelidad", monto: 80 }, { metodo: "efectivo", monto: 20 }]`. Reglas (UI y API): la suma debe igualar el total (ni más ni menos),
saldo de fidelidad ≤ saldo de la tarjeta, sin métodos repetidos, montos con máx. 2 decimales.

## Fidelidad vs. saldo
* **Fidelidad**: visitas → premio (`cliente.fidelidad.dias/meta`).
* **Saldo**: dinero de la tarjeta usable como pago (`tarjeta.saldo`). Todo cambio pasa por `registrarMovimientoTarjeta` (historial + saldo ≥ 0).

## Partes que siguen siendo DEMO
Datos en memoria (se pierden al recargar), autenticación con contraseñas en el frontend, latencia simulada, lector NFC simulado,
comprobante sin validez fiscal, Chart.js por CDN (requiere internet solo para los gráficos).

## Identidad visual — El Rápido
Rediseño solo visual (sin cambios de lógica, ids, permisos ni flujos):
* Logo en `assets/logo-el-rapido.png` (fondo transparente) y `assets/favicon.png`; aparece en login, menú lateral, terminales, Terminal NFC, comprobante y tarjeta de fidelidad.
* Paleta tomada del logo, definida en las variables `:root` de `css/style.css`: carbón `#17110D`, rojo-naranja `#D9481F` (marca), naranja `#F57B38`, verde azulado `#1F7A78` (Autolavado), rojo vino `#A8281C` (Barbería), crema `#F2E8CC`.
* Tipografía: Barlow Condensed (títulos) + Barlow (texto), por Google Fonts.
* Reglas propias del tema al final de `css/style.css` (bloque "TEMA EL RÁPIDO").

## Catálogo real de El Rápido (autolavado)
* **Tipos de vehículo:** Moto, Sedán, SUV, Pick up, Microbús.
* **Lavados** con precio según el vehículo (`preciosVehiculo` en `js/data.js`):
  | | Moto | Sedán | SUV | Pick up | Microbús |
  |---|---|---|---|---|---|
  | Rápido – Breve | 99 | 175 | 225 | 255 | 355 |
  | Rápido – Nítido | 150 | 250 | 310 | 350 | 450 |
* **Servicios extra** (`categoria: "extra"`, ids `EX-xx`): se agregan a la misma factura del lavado. Empiezan **sin precio** ("Por definir") y no se pueden vender hasta que el administrador lo asigne en *Autolavado → Servicios* (precio único o por tipo de vehículo).
* El precio de cada línea lo calcula `DEMO.calc.precioServicio(servicio, tipoVehiculo)`; la API lo vuelve a calcular al registrar la factura (el precio nunca viene del cliente).
* **Promoción:** "Taxis miembros" 66 % (autolavado). El combo de 8 lavados (36 %) queda fuera por ahora.
* **Fidelidad:** 9 lavados → "Pasteado gratis". Solo los lavados generan visita; se cambia por servicio en el catálogo.
* Barbería conserva datos DEMO hasta tener su información real.


## v5 — Personal solo vende · fidelidad sin dinero
**Personal (rol Empleado):** solo ve *Nueva venta* de Autolavado y de Barbería y **Mis ventas** (sus facturas de hoy o del mes). No ve Dashboard, Reportes, Estadísticas, Clientes, Fidelidad, Terminales ni notificaciones. Las rutas bloqueadas redirigen a su inicio. Cada factura guarda `usuarioId` (quién la registró).

**Fidelidad sin saldo:** se eliminó el dinero en la tarjeta (recargas, bono por visita y pago con saldo).
* Cada factura con un servicio marcado **“Genera fidelidad”** suma 1 lavado premium (por defecto: Rápido – Nítido y Servicio Premium).
* A los **4** → **36 % de descuento** (una vez por ciclo). A los **9** → **lavado gratis** y el conteo vuelve a 0.
* Los premios se aplican al facturar desde “Descuento / promoción” (un solo descuento por factura). El lavado gratis descuenta el lavado más caro de la factura y no suma lavado premium.
* Anular una factura devuelve el premio y revierte el avance.
* Todo se ajusta en Configuración → Fidelidad (premios).

**Catálogo:** se añadieron los vehículos Taxi y Camión 3T y el Servicio Premium (C$ 870 en Microbús). Los precios que faltan quedan “por definir” por vehículo hasta que el administrador los asigne. Barbería con sus precios reales.

## v6 — Líneas de negocio separadas · cortes en la factura del autolavado
* Menú lateral con selector **Autolavado / Barbería**: cada línea muestra solo sus opciones (como el sistema actual del local).
* En **Nueva venta · Autolavado** hay una sección desplegable **✂️ Servicios de barbería** para agregar un corte a la misma factura del lavado. La línea queda marcada como Barbería (`area: "barberia"`).
* Las promociones del autolavado (taxis 66 %) y los premios de lavados premium no descuentan el corte.
* Una factura que solo tiene un corte no exige datos del vehículo.

## v7 — Cierre de caja · Mi resumen · Historial de cierres
**Cierre de caja** (personal y administrador, por área: Autolavado / Barbería):
* El período va desde el último cierre de hoy en esa área (o las 00:00) hasta el momento del cierre.
* El sistema muestra los totales por forma de pago con sus facturas (toca un método para verlas), clientes, descuentos, anuladas y ventas por persona.
* Conteo del efectivo por billetes y monedas (se suma solo) o el total directo, más dólares al tipo de cambio (Configuración → Métodos de pago, por defecto C$ 36.50).
* Egresos y retiros de la caja.
* **Efectivo esperado = ventas en efectivo − egresos.** Si lo contado no coincide, queda como **Sobrante** o **Faltante** y la nota es obligatoria.
* Al cerrar se genera un comprobante imprimible con todo el detalle.

**Mi resumen** (personal): calendario del mes con la cantidad de ventas por día. Al elegir un día se ven sus ventas, total, clientes atendidos y lo cobrado por efectivo, tarjeta y transferencia. Solo incluye sus propias ventas.

**Reportes → Cierres de caja** (administrador): todos los cierres guardados (`DEMO.cierres`), con filtros por área, estado y fechas. Muestra totales de faltantes y sobrantes y el detalle completo de cada cierre. ► Backend: tabla `cierre_caja` + `cierre_caja_egreso`.

## v8 — Membresías y Lealtad por programas (sin NFC)
* Se quitó la **Terminal NFC** del panel. La lealtad va por cliente, sin tarjetas ni saldo.

**Lealtad** (Autolavado → ⭐ Lealtad, `js/fidelidad.js`):
* Programas por servicio, configurables en Configuración → *Lealtad y membresías*:
  * **Programa Premium** (Servicio Premium): a las **5** lavadas el cliente elige *Rápido – Nítido GRATIS* o *40 % en Servicio Premium*. A las **9**, *Tratamiento cerámico GRATIS*.
  * **Programa Nítido** (Rápido – Nítido): a las **5** elige *Rápido – Breve GRATIS* o *40 % en Rápido – Nítido*. A las **9**, *Pasteado Meguiar's GRATIS*.
* Al facturar ese lavado, la lavada se **suma sola** al cliente. El lavado gratis no suma. El premio final reinicia el ciclo.
* Los premios aparecen en el POS (“🎁 Premios de lealtad disponibles”) y se canjean con un toque. Si el lavado ya está en la factura, el premio se aplica a ese mismo lavado.
* La página muestra Progreso, Historial y Canjes por cliente (`DEMO.lealtadMovs`).

**Membresías** (Autolavado → 🎫 Membresías, `js/membresias.js`):
* Planes *Combo 4 Lavados* (18 %, 4 semanas) y *Combo 8 Lavados* (36 %, 6 semanas).
* La venta se arma con plan, cliente, lavado, tipo de vehículo, % personalizado y forma de pago, y genera una factura del autolavado (entra a caja y reportes).
* Al facturar ese lavado al cliente con ese tipo de vehículo, la membresía se usa **automáticamente** (línea C$ 0, consume 1 uso). Avisa cuando se agota.
* Anular la factura de un uso devuelve el uso. No se puede anular la venta de una membresía que ya tiene usos.

## v9 — Venta de membresías en el panel de ventas · edición por el administrador
* **Personal** (Autolavado → 🎫 Membresías):
  * Vende membresías, también a **clientes nuevos**: el registro se hace dentro de la misma ventana.
  * Solo ve los planes disponibles y las membresías vendidas. No ve botones de edición; los permisos son `membresias.ver` y `membresias.vender`.
  * La venta aparece en su *Mi resumen* y en el cierre de caja.
* **Administrador**:
  * Pestaña **Registro de ventas**: fecha, código, cliente, plan, servicio y vehículo, quién la vendió, factura, total, usos y estado.
  * **✏️ Editar** en cada plan y **＋ Nueva membresía (plan)**: nombre, cantidad de lavados, premio (% de descuento en lavados), **días de vigencia** y si está disponible para la venta.
  * El formato de la tarjeta se mantiene (*“Descuento del N% en lavados. Válido por …”*) con vista previa.
  * Las membresías ya vendidas conservan sus condiciones originales.
* Los planes usan `dias` (antes `semanas`). La edición de planes salió de Configuración.

## v10 — Membresía por vehículo (placa) · ticket térmico para el cliente
* Se eliminó el usuario **barbero**. El personal trabaja con un solo panel conjunto: autolavado y cortes en la misma factura.
* **Membresía de un solo vehículo:**
  * Se vende a la **placa** del vehículo. Se elige uno de los vehículos guardados del cliente o se escribe una nueva.
  * Solo se usa cuando la factura lleva **esa placa**, ese tipo de vehículo y ese lavado. En ese caso el pago con membresía se aplica solo; también se activa si la placa se escribe después de agregar el lavado.
  * No se permiten dos membresías vigentes del mismo lavado para la misma placa.
* La factura guarda `pagosMembresia`. El ticket muestra **“PAGO CON MEMBRESÍA”**, los **lavados que le quedan** y **la fecha de vencimiento**.
* Caja, Mi resumen y Ventas indican “Membresía”. El panel de membresías cuenta cada uso automáticamente.
* **Ticket del cliente** (impresora térmica 80 mm / “Recibo POS”):
  * Sin logo y con letra monoespaciada.
  * Lleva los datos reales del local (dirección, teléfono, @elrapidonica), ticket, fecha, cliente, placa, servicios, totales en C$ y US$, pagos y “Gracias por su visita”.
  * **No muestra al empleado que atendió.** El administrador lo ve en pantalla (bloque interno que no se imprime) y en el registro de Ventas.

## v11 — Venta más ágil
* **Vehículo:** ahora solo pide **tipo** y **placa**.
  * Los vehículos guardados del cliente aparecen como botones (placa · tipo · 🎫 si tiene membresía).
  * Los tipos de vehículo también son botones, para elegirlos con un toque.
* **Catálogo:** las tarjetas de servicios y productos muestran solo el nombre y el precio.
* **Producto nuevo:** en la pestaña *Productos*, el botón **＋ Producto nuevo** pide nombre, precio y cantidad y lo agrega a la factura como línea `tipo: "otro"`.
  * No toca el inventario. Se valida de nuevo en la API.
  * La pestaña Productos ahora aparece también en barbería.
* **Fluidez:**
  * Efectivo queda seleccionado por defecto.
  * Si solo hay un empleado, o si el empleado es el usuario conectado, queda elegido.
  * *Enter* en la búsqueda elige al primer cliente, o abre el registro si no hay resultados.
  * Los avisos de “Falta:” son botones que llevan al paso pendiente y lo resaltan.
  * Después de cada venta, *Nueva venta* deja el cursor en la búsqueda de cliente.
  * Los botones responden visualmente al tocarlos.

## v12 — Pago con membresía inteligente · eliminar (admin) · varios empleados por factura
* **Pago con membresía:**
  * Si la factura solo lleva el lavado de la membresía (mismo vehículo y placa registrados), **desaparecen los otros pagos**. Se muestra el recuadro “🎫 Pago con membresía” con uso, lavados que quedarán y vencimiento.
  * Si se agregan extras, productos o cortes, o el cliente viene con otro vehículo, aparecen los pagos normales **solo por el resto** (“Cobrar aparte lo que no cubre la membresía”).
* **Eliminar (solo administrador):**
  * Disponible en servicios, productos, promociones, empleados y usuarios, con confirmación. Si no se puede eliminar, el motivo aparece en la misma ventana.
  * Reglas: no se elimina un servicio usado por un programa de lealtad o con membresías vigentes. Al eliminar un producto se quita del consumo de los servicios. No se elimina un empleado con usuario asociado, ni tu propio usuario, ni el último administrador.
  * Las facturas ya emitidas conservan nombres y montos.
* **Varios empleados por factura:**
  * Tocar agrega a un empleado y tocar otra vez lo quita. La factura guarda `empleados[]` y `empleadoNombre` con todos los participantes.
  * El ingreso se reparte entre ellos en las estadísticas de empleados y en los reportes por empleado. El filtro por empleado en Ventas encuentra la factura para cualquiera de ellos.
  * El ticket del cliente sigue sin mostrar empleados; el administrador los ve en la parte interna.

## v13 — Lealtad: seguimiento para el personal y edición completa para el administrador
* **Empleado** (Autolavado → ⭐ Lealtad):
  * Buscador “Nombre, teléfono o placa…” y estado vacío “Busca un cliente”.
  * Al elegir un cliente ve sus pestañas **Progreso / Historial / Canjes** en modo solo lectura.
  * No ve indicadores del negocio, la lista completa de clientes ni botones de edición. Su permiso es `fidelidad.ver`.
* **Administrador**:
  * Tarjetas con las reglas actuales de cada programa y botón **✏️ Editar**: nombre, ícono, lavado que suma, lavadas para elegir premio, opción A (servicio gratis), opción B (% de descuento y en qué servicio), lavadas del premio final y premio final.
  * En el progreso de cada cliente, **± Ajustar** permite corregir las lavadas del ciclo con un motivo obligatorio. Queda como “Ajuste” en el historial y en Actividad.
  * Ve los indicadores y la lista completa, filtrable también por placa.
* Las lavadas se siguen sumando solas al facturar el lavado de cada programa, y los premios se canjean en la venta.

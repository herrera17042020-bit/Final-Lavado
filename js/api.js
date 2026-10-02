/* ==========================================================================
   api.js — Capa de servicios de El Rápido (DEMO).

   Toda operación de negocio pasa por aquí: crear factura, registrar pagos,
   actualizar fidelidad, descontar inventario, registrar actividad, login y
   reportes. La interfaz NUNCA modifica DEMO directamente para estas acciones.

   ► Preparado para backend:
       Frontend → API (este archivo) → Backend REST → PostgreSQL
     Cada método público devuelve una Promesa con el contrato
       { ok: true, data }  |  { ok: false, error: "mensaje para el usuario", codigo }
     Para conectar un backend real, reemplaza el cuerpo de cada método por un
     fetch("/api/...") que devuelva ese mismo contrato. Las funciones dentro de
     `nucleo` (síncronas) representan la lógica que en producción vive en el
     servidor (validaciones, transacción SQL, permisos): NO debe confiarse en
     el cliente para esas reglas.

   ► Mapeo previsto a tablas:
       facturas → factura(id, negocio, cliente_id, empleado_id, fecha, estado, total…)
       factura.lineas → factura_detalle(factura_id, tipo, ref_id, cantidad, precio, descuento, subtotal)
       factura.pagos → factura_pago(factura_id, metodo, monto)
       tarjeta / tarjeta.movimientos → tarjeta_fidelidad / tarjeta_movimiento
       movimientosInventario → inventario_movimiento
       actividad → evento_actividad
   ========================================================================== */

const API = (() => {
  const CONFIG = { latenciaMs: 160 }; // latencia simulada para mostrar estados de "procesando"
  const { calc } = DEMO;

  // ------------------------------------------------------------------ utilidades
  const fallo = (mensaje, codigo = "VALIDACION") => { throw Object.assign(new Error(mensaje), { usuario: true, codigo }); };
  const m = n => "C$ " + Number(n || 0).toLocaleString("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const txt = v => String(v == null ? "" : v).trim();
  const actor = () => (typeof AUTH !== "undefined" && AUTH.sesion()) ? AUTH.sesion().nombre : "sistema";
  const mismoDia = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
  const NEGOCIOS = { autolavado: "Autolavado", barberia: "Barbería" };

  // Permisos: en producción los valida el backend con el token de sesión.
  function exigir(permiso) {
    if (typeof AUTH === "undefined") return;
    if (!AUTH.sesion()) fallo("Tu sesión expiró. Inicia sesión nuevamente.", "NO_AUTENTICADO");
    if (!AUTH.puede(permiso)) fallo("No tienes permiso para realizar esta acción.", "PROHIBIDO");
  }

  // Empleado: solo opera en el negocio de su ficha. Se revisa contra datos vivos (si el admin
  // lo desactiva o lo reasigna, el cambio aplica de inmediato). ► En producción: lo valida el backend.
  function exigirNegocio(negocio) {
    const s = typeof AUTH !== "undefined" && AUTH.sesion(); if (!s || s.rol === "ADMIN") return;
    const u = DEMO.usuarios.find(x => x.id === s.id), emp = u && DEMO.empleados.find(x => x.id === u.empleadoId);
    if (!u || u.estado !== "activo" || !emp || emp.estado !== "activo") fallo("Tu acceso ya no está vigente. Inicia sesión nuevamente.", "NO_AUTENTICADO");
    // El personal vende en autolavado y barbería (un solo local): no se restringe por negocio.
  }

  // Envuelve una función síncrona en una Promesa con latencia y errores amigables.
  function llamar(fn) {
    return new Promise(resolve => {
      setTimeout(() => {
        try { resolve({ ok: true, data: fn() }); }
        catch (e) {
          if (!e.usuario) console.error("[API] Error inesperado:", e);
          resolve({ ok: false, error: e.usuario ? e.message : "No se pudo completar la operación. Intenta de nuevo.", codigo: e.codigo || "ERROR" });
        }
      }, CONFIG.latenciaMs);
    });
  }

  // Pub/sub mínimo: la interfaz se suscribe para refrescar KPIs cuando cambian los datos.
  const oyentes = {};
  const on = (evt, fn) => { (oyentes[evt] = oyentes[evt] || []).push(fn); };
  const emit = (evt, dato) => (oyentes[evt] || []).concat(oyentes["*"] || []).forEach(fn => { try { fn(evt, dato); } catch (e) { console.error(e); } });

  // ------------------------------------------------------------------ búsquedas
  const clientePorId = id => DEMO.clientes.find(c => c.id === id) || fallo("No se encontró al cliente seleccionado.", "NO_ENCONTRADO");
  const tarjetaDe = clienteId => DEMO.tarjetas.find(t => t.clienteId === clienteId) || null;
  const productoPorId = id => DEMO.productos.find(p => p.id === id) || fallo("No se encontró el producto.", "NO_ENCONTRADO");
  const metodoHabilitado = k => !!DEMO.configuracion.metodosPago[k];

  // =========================================================================
  // INVENTARIO (semántica: ver comentario en data.js)
  // =========================================================================
  const usosDisponibles = p => p.stock > 0 ? (p.stock - 1) * p.rendimiento + p.usoActual : 0;

  // Simula (sin modificar) el efecto de vender `unidades` y consumir `usos`.
  function simularProducto(p, unidades, usos) {
    let stock = p.stock, uso = p.usoActual;
    if (unidades > stock) return { ok: false, motivo: `No hay suficiente stock de ${p.nombre}: se piden ${unidades} ${p.unidad}(s) y hay ${stock}.` };
    stock -= unidades; if (stock === 0) uso = 0;
    let pendiente = usos;
    while (pendiente > 0) {
      if (stock <= 0) return { ok: false, motivo: `No hay suficiente ${p.nombre} para completar los servicios de esta factura.` };
      const toma = Math.min(pendiente, uso); uso -= toma; pendiente -= toma;
      if (uso === 0) { stock -= 1; uso = stock > 0 ? p.rendimiento : 0; }
    }
    return { ok: true, stockFinal: stock, usoFinal: uso };
  }
  function agruparConsumos(lineas) {
    const porProducto = {};
    calc.consumosDe(lineas).forEach(c => {
      const o = porProducto[c.productoId] = porProducto[c.productoId] || { productoId: c.productoId, unidades: 0, usos: 0 };
      if (c.tipo === "venta") o.unidades += c.cantidad; else o.usos += c.cantidad;
    });
    return Object.values(porProducto);
  }
  // Revisión de stock sin efectos: la usa la interfaz para avisar en vivo.
  function revisarStock(lineas) {
    const errores = [], avisos = [];
    agruparConsumos(lineas).forEach(g => {
      const p = productoPorId(g.productoId);
      const r = simularProducto(p, g.unidades, g.usos);
      if (!r.ok) errores.push(r.motivo);
      else if (r.stockFinal <= p.stockMinimo && p.stock > p.stockMinimo) avisos.push(`${p.nombre} quedará con stock bajo (${r.stockFinal} ${p.unidad}).`);
      else if (p.stock <= p.stockMinimo) avisos.push(`${p.nombre} ya tiene stock bajo (${p.stock} ${p.unidad}).`);
    });
    return { errores, avisos };
  }
  function anotarInventario(p, tipo, cantidad, stockAntes, referencia, usuario, motivo = "") {
    p.capacidadTotal = p.stock * p.rendimiento;
    const mov = { id: DEMO.helpers.nextId("IMV"), fecha: new Date(), productoId: p.id, productoNombre: p.nombre, negocio: p.negocio, tipo, cantidad,
      unidad: tipo === "consumo" ? "uso(s)" : p.unidad, referencia, usuario, motivo, stockAntes, stockDespues: p.stock };
    DEMO.movimientosInventario.unshift(mov);
    if (p.stock <= p.stockMinimo && !DEMO.notificaciones.some(n => n.tipo === "danger" && n.texto.includes(p.nombre) && n.texto.includes("stock bajo") && Date.now() - new Date(n.fecha) < 86400000)) {
      DEMO.notificar("danger", `${p.nombre} tiene stock bajo (${p.stock} ${p.unidad}).`);
    }
    return mov;
  }
  function aplicarInventario(lineas, referencia, negocio, usuario) {
    const alertas = [];
    agruparConsumos(lineas).forEach(g => {
      const p = productoPorId(g.productoId);
      if (g.unidades > 0) {
        const antes = p.stock; p.stock -= g.unidades; if (p.stock === 0) p.usoActual = 0;
        anotarInventario(p, "venta", g.unidades, antes, referencia, usuario);
        DEMO.registrarActividad({ tipo: "inventario_descuento", negocio, usuario, descripcion: `Producto vendido y descontado: ${p.nombre} · ${g.unidades} ${p.unidad}(s)`, referencia, metadata: { productoId: p.id, cantidad: g.unidades, motivo: "venta" } });
      }
      if (g.usos > 0) {
        const antes = p.stock; let pendiente = g.usos;
        while (pendiente > 0 && p.stock > 0) {
          const toma = Math.min(pendiente, p.usoActual); p.usoActual -= toma; pendiente -= toma;
          if (p.usoActual === 0) { p.stock -= 1; p.usoActual = p.stock > 0 ? p.rendimiento : 0; }
        }
        anotarInventario(p, "consumo", g.usos, antes, referencia, usuario);
        DEMO.registrarActividad({ tipo: "inventario_descuento", negocio, usuario, descripcion: `Producto descontado de inventario: ${p.nombre} · ${g.usos} uso(s)`, referencia, metadata: { productoId: p.id, cantidad: g.usos, motivo: "consumo de servicio" } });
      }
      if (p.stock <= p.stockMinimo) alertas.push(`${p.nombre}: stock bajo (${p.stock} ${p.unidad}).`);
    });
    return alertas;
  }

  // =========================================================================
  // TARJETAS / FIDELIDAD
  // =========================================================================
  function vistaTarjeta(t, nMov = 8) {
    const c = DEMO.clientes.find(x => x.id === t.clienteId);
    if (!c) return null;
    const meta = c.fidelidad.meta, dias = c.fidelidad.dias;
    return {
      tarjeta: { id: t.id, uid: t.uid, estado: t.estado, saldo: t.saldo, creada: t.creada, ultimoUso: t.ultimoUso, ultimaVisita: t.ultimaVisita },
      cliente: { id: c.id, nombre: c.nombre, telefono: c.telefono, tipo: c.tipo, visitas: c.visitas, estado: c.estado, negocioPreferido: c.negocioPreferido, vehiculos: c.vehiculos },
      fidelidad: (() => { const cfg = DEMO.configuracion.fidelidad, pr = calc.premiosDe(c);
        return { dias, meta, faltan: Math.max(meta - dias, 0), pct: Math.min(dias / meta * 100, 100), recompensaDisponible: pr.gratis, premio: cfg.premio, bonoVisita: 0,
          descuento: { meta: cfg.metaDescuento, pct: cfg.descuentoPct, disponible: pr.descuento, usado: !!c.fidelidad.descuentoUsado, faltan: Math.max(cfg.metaDescuento - dias, 0) } }; })(),
      movimientos: t.movimientos.slice(0, nMov),
      totalMovimientos: t.movimientos.length,
    };
  }
  const normalizarUid = u => txt(u).toUpperCase().replace(/[^0-9A-F]/g, "").replace(/(.{2})(?=.)/g, "$1:");
  function tarjetaPorUid(uid) {
    const n = normalizarUid(uid);
    return DEMO.tarjetas.find(t => normalizarUid(t.uid) === n) || null;
  }
  function tarjetaActiva(clienteId) {
    const t = tarjetaDe(clienteId) || fallo("Este cliente no tiene tarjeta de fidelidad.", "NO_ENCONTRADO");
    if (t.estado !== "activa") fallo(`La tarjeta ${t.id} está bloqueada. Actívala para usar saldo o registrar movimientos.`, "TARJETA_BLOQUEADA");
    return t;
  }
  // Acredita una visita a la fidelidad (y el bono de saldo si está configurado).
  function acreditarVisita(cliente, t, { origen, concepto, referencia, negocio, usuario }) {
    const cfg = DEMO.configuracion.fidelidad;
    const antes = cliente.fidelidad.dias;
    cliente.fidelidad.dias = Math.min(antes + 1, cliente.fidelidad.meta);
    const mov = DEMO.registrarMovimientoTarjeta(t, { tipo: "visita", concepto, monto: 0, referencia, usuario, negocio,
      visitas: { dias: cliente.fidelidad.dias, meta: cliente.fidelidad.meta } });
    t.ultimaVisita = mov.fecha; t.ultimaVisitaOrigen = origen;
    if (antes < cfg.metaDescuento && cliente.fidelidad.dias >= cfg.metaDescuento && !cliente.fidelidad.descuentoUsado) {
      DEMO.notificar("success", `${cliente.nombre} completó ${cfg.metaDescuento} lavados premium: tiene ${cfg.descuentoPct}% de descuento disponible.`);
    }
    if (antes < cliente.fidelidad.meta && cliente.fidelidad.dias >= cliente.fidelidad.meta) {
      DEMO.notificar("success", `${cliente.nombre} completó ${cliente.fidelidad.meta} lavados premium. Premio disponible: ${cfg.premio}.`);
    }
    return { diasAntes: antes, diasDespues: cliente.fidelidad.dias, bono: 0 };
  }

  // =========================================================================
  // CLIENTES
  // =========================================================================
  function validarCliente(d, idActual = null) {
    const nombre = txt(d.nombre).replace(/\s+/g, " ");
    if (nombre.length < 3) fallo("Escribe el nombre completo del cliente (mínimo 3 letras).");
    if (nombre.length > 80) fallo("El nombre es demasiado largo (máximo 80 caracteres).");
    let telefono = txt(d.telefono);
    if (telefono && telefono !== "s/n") {
      if (!/^\d{4}-?\d{4}$/.test(telefono)) fallo("El teléfono debe tener 8 dígitos, por ejemplo 8888-8888.");
      telefono = telefono.replace(/^(\d{4})-?(\d{4})$/, "$1-$2");
      const dup = DEMO.clientes.find(c => c.telefono === telefono && c.id !== idActual);
      if (dup) fallo(`Ya existe un cliente con ese teléfono: ${dup.nombre}.`);
    } else telefono = "s/n";
    const correo = txt(d.correo);
    if (correo && correo !== "-" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) fallo("El correo no tiene un formato válido (ejemplo: nombre@correo.com).");
    return { nombre, telefono, correo: correo || "-", identificacion: txt(d.identificacion) || "-" };
  }
  function crearCliente(d) {
    exigirNegocio(d.negocioPreferido === "barberia" ? "barberia" : "autolavado");
    const v = validarCliente(d);
    const maxN = DEMO.clientes.reduce((mx, c) => Math.max(mx, parseInt(String(c.id).replace(/\D/g, ""), 10) || 0), 0);
    const cliente = { id: `CLI-${String(maxN + 1).padStart(3, "0")}`, ...v, tipo: "Nuevo", negocioPreferido: d.negocioPreferido === "barberia" ? "barberia" : "autolavado",
      vehiculos: [], ultimaVisita: new Date(), totalGastado: 0, visitas: 0, estado: d.estado === "inactivo" ? "inactivo" : "activo",
      fidelidad: { dias: 0, meta: DEMO.configuracion.fidelidad.diasMeta, descuentoUsado: false }, creado: new Date() };
    DEMO.clientes.unshift(cliente);
    const t = DEMO.crearTarjetaPara(cliente, new Date());
    DEMO.registrarActividad({ tipo: "cliente_registrado", negocio: cliente.negocioPreferido, usuario: actor(), descripcion: `Cliente registrado: ${cliente.nombre} · tarjeta ${t.id}`, referencia: cliente.id, metadata: { tarjetaId: t.id } });
    emit("cliente-creado", cliente);
    return { cliente, tarjeta: vistaTarjeta(t) };
  }
  function actualizarCliente(id, d) {
    const c = clientePorId(id);
    Object.assign(c, validarCliente(d, id));
    if (d.estado === "activo" || d.estado === "inactivo") c.estado = d.estado;
    DEMO.registrarActividad({ tipo: "cliente_actualizado", negocio: c.negocioPreferido, usuario: actor(), descripcion: `Cliente actualizado: ${c.nombre}`, referencia: c.id, metadata: {} });
    emit("cliente-actualizado", c); return c;
  }
  function eliminarCliente(id) {
    exigir("clientes.eliminar");
    const c = clientePorId(id), t = tarjetaDe(id);
    if (t && t.saldo > 0) fallo(`No se puede eliminar a ${c.nombre}: su tarjeta tiene ${m(t.saldo)} de saldo. Consume el saldo o marca al cliente como inactivo.`, "CON_SALDO");
    DEMO.clientes.splice(DEMO.clientes.indexOf(c), 1);           // se muta en el lugar: mantiene la referencia compartida
    if (t) DEMO.tarjetas.splice(DEMO.tarjetas.indexOf(t), 1);
    DEMO.registrarActividad({ tipo: "cliente_eliminado", negocio: c.negocioPreferido, usuario: actor(), descripcion: `Cliente eliminado: ${c.nombre}`, referencia: id, metadata: {} });
    emit("cliente-eliminado", c); return true;
  }

  // =========================================================================
  // FACTURAS (facturación conjunta + pago mixto)
  // =========================================================================
  // Normaliza líneas desde el catálogo: el precio NUNCA se toma del cliente.
  // tipoVehiculo: define el precio de los servicios que cobran según el vehículo.
  // Cada línea puede venir con `modo`:
  //   "mem:<id>"                → lavado cubierto por una membresía del cliente (C$ 0, consume 1 uso)
  //   "premio:<prog>:<nivel>:<idx>" → premio de lealtad (100 % o % de descuento sobre 1 unidad)
  function normalizarLineas(negocio, entrada, tipoVehiculo = null, cliente = null, placa = "") {
    if (!Array.isArray(entrada) || !entrada.length) fallo("Agrega al menos un servicio o producto a la factura.");
    const mapa = new Map();
    entrada.forEach(l => {
      const cantidad = Number(l.cantidad);
      if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 99) fallo("La cantidad de cada concepto debe ser un número entero entre 1 y 99.");
      let base;
      if (l.tipo === "servicio") {
        const s = DEMO.servicios.find(x => x.id === l.refId) || fallo("Uno de los servicios ya no existe en el catálogo.");
        // En la factura del autolavado se pueden agregar cortes de barbería (mismo local, misma factura).
        if (s.negocio !== negocio && !(negocio === "autolavado" && s.negocio === "barberia")) fallo(`El servicio “${s.nombre}” no pertenece a ${NEGOCIOS[negocio]}.`);
        if (s.estado !== "activo") fallo(`El servicio “${s.nombre}” está inactivo.`);
        const precio = calc.precioServicio(s, tipoVehiculo), modo = txt(l.modo);
        base = { tipo: "servicio", refId: s.id, nombre: s.nombre, precio, ...(s.negocio !== negocio ? { area: s.negocio } : {}) };
        if (modo.startsWith("mem:")) {
          const mb = DEMO.membresias.find(x => x.id === modo.slice(4)) || fallo("La membresía seleccionada ya no existe.");
          if (!cliente || mb.clienteId !== cliente.id) fallo(`La membresía ${mb.id} no pertenece a este cliente.`);
          if (mb.servicioId !== s.id) fallo(`La membresía ${mb.id} no cubre “${s.nombre}”.`);
          if (mb.vehiculoTipo !== tipoVehiculo) fallo(`La membresía ${mb.id} es para ${mb.vehiculoTipo}; el vehículo de la factura es ${tipoVehiculo || "sin tipo"}.`);
          if (calc.normPlaca(mb.placa) !== calc.normPlaca(placa)) fallo(`La membresía ${mb.id} es del vehículo placa ${mb.placa}. Escribe esa placa en la factura para usarla.`);
          const est = calc.estadoMembresia(mb); if (!["Activa", "Por vencer"].includes(est)) fallo(`La membresía ${mb.id} está ${est.toLowerCase()}.`);
          if (cantidad !== 1) fallo("Una membresía cubre un lavado por factura.");
          base = { ...base, nombre: `${s.nombre} · Membresía`, precio: 0, membresia: mb.id, usoMembresia: mb.usados + 1, precioRef: precio,
            restantes: mb.lavados - mb.usados - 1, vence: mb.vence, placaMembresia: mb.placa };
        } else if (modo.startsWith("premio:")) {
          const [, progId, nivelS, idxS] = modo.split(":"), nivel = +nivelS, idx = +idxS;
          const est = calc.estadoLealtad(cliente).find(x => x.programa.id === progId) || fallo("Programa de lealtad no válido.");
          const op = nivel === 1 ? est.programa.opciones1[idx] : est.programa.premio2;
          if (!op || op.servicioId !== s.id) fallo("El premio no corresponde a ese servicio.");
          if (nivel === 1 ? !est.disp1 : !est.disp2) fallo(`${cliente.nombre} no tiene disponible el premio “${calc.nombrePremio(op)}”.`);
          if (cantidad !== 1) fallo("Cada premio cubre una unidad.");
          if (op.tipo === "descuento" && !(precio > 0)) fallo(`“${s.nombre}” no tiene precio para este vehículo.`);
          base = { ...base, nombre: `${s.nombre} · Premio`, descPct: op.tipo === "gratis" ? 100 : op.pct, premio: { programaId: progId, programa: est.programa.nombre, nivel, idx, nombre: calc.nombrePremio(op) } };
        } else if (!(precio > 0)) fallo(`El servicio “${s.nombre}” aún no tiene precio. El administrador debe asignarlo en Servicios.`);
      } else if (l.tipo === "producto") {
        const p = productoPorId(l.refId);
        if (!p.precioVenta) fallo(`El producto “${p.nombre}” no está disponible para la venta.`);
        if (p.negocio !== negocio) fallo(`El producto “${p.nombre}” no pertenece a ${NEGOCIOS[negocio]}.`);
        base = { tipo: "producto", refId: p.id, nombre: p.nombre, precio: p.precioVenta };
      } else if (l.tipo === "otro") {
        // Producto nuevo / venta libre: nombre y precio escritos en la venta (no afecta inventario).
        const nombre = txt(l.nombre).replace(/\s+/g, " "), precio = Number(l.precio);
        if (nombre.length < 2 || nombre.length > 60) fallo("Escribe el nombre del producto nuevo (2 a 60 caracteres).");
        if (!Number.isFinite(precio) || precio <= 0 || precio > 100000) fallo(`El precio de “${nombre}” debe ser mayor que cero.`);
        if (Math.abs(precio * 100 - Math.round(precio * 100)) > 1e-6) fallo("Los precios admiten como máximo 2 decimales.");
        base = { tipo: "otro", refId: `OTRO:${nombre.toLowerCase()}|${calc.redondear(precio)}`, nombre, precio: calc.redondear(precio) };
      } else fallo("Hay un concepto de factura no válido.");
      const k = base.tipo + "|" + base.refId + "|" + (base.membresia || (base.premio ? "p" + base.premio.programaId + base.premio.nivel : ""));
      if (mapa.has(k)) mapa.get(k).cantidad += cantidad; else mapa.set(k, { ...base, cantidad });
    });
    return [...mapa.values()];
  }

  function normalizarPagos(total, entrada, cliente) {
    const tc = calc.centavos(total);
    if (tc === 0) { if ((entrada || []).some(p => calc.centavos(p.monto) > 0)) fallo("La factura no tiene monto por cobrar."); return []; }
    if (!Array.isArray(entrada) || !entrada.length) fallo("Selecciona cómo se pagará la factura.");
    const pagos = entrada.map(p => {
      const monto = (p.monto == null && entrada.length === 1) ? total : Number(p.monto);
      if (!METODOS_VALIDOS(p.metodo)) fallo("No se pudo completar el pago. Verifica el método de pago seleccionado.");
      if (!metodoHabilitado(p.metodo)) fallo(`El método “${calc.etiquetaMetodo(p.metodo)}” no está habilitado en Configuración.`);
      if (!Number.isFinite(monto) || monto <= 0) fallo("Cada método de pago debe tener un monto mayor que cero.");
      if (Math.abs(monto * 100 - Math.round(monto * 100)) > 1e-6) fallo("Los montos admiten como máximo 2 decimales.");
      return { metodo: p.metodo, monto: calc.redondear(monto) };
    });
    if (new Set(pagos.map(p => p.metodo)).size !== pagos.length) fallo("No repitas el mismo método de pago; combina los montos en uno solo.");
    const suma = pagos.reduce((a, p) => a + calc.centavos(p.monto), 0);
    if (suma > tc) fallo(`El total pagado (${m(suma / 100)}) supera el total de la factura (${m(total)}). Ajusta los montos.`, "PAGO_EXCEDE");
    if (suma < tc) fallo(`Falta pagar ${m((tc - suma) / 100)}. La factura no puede finalizarse con saldo pendiente.`, "PAGO_PENDIENTE");
    const pf = pagos.find(p => p.metodo === "fidelidad");
    if (pf) {
      const t = tarjetaActiva(cliente.id);
      if (t.saldo < pf.monto) fallo(`Saldo de fidelidad insuficiente: disponible ${m(t.saldo)}, se intenta usar ${m(pf.monto)}.`, "SALDO_INSUFICIENTE");
    }
    return pagos;
  }
  const METODOS_VALIDOS = k => Object.prototype.hasOwnProperty.call(DEMO.METODOS, k);

  function crearFactura(p) {
    exigir("ventas.crear");
    const negocio = p.negocio;
    if (!NEGOCIOS[negocio]) fallo("No se pudo identificar el negocio de la factura.");
    exigirNegocio(negocio);
    if (!p.clienteId) fallo("Selecciona un cliente para la factura.");
    const cliente = clientePorId(p.clienteId);
    if (cliente.estado !== "activo") fallo(`${cliente.nombre} está inactivo. Actívalo para poder facturarle.`);
    // Uno o varios empleados pueden participar en el mismo trabajo (p. ej. varios lavando un carro).
    const ids = [...new Set((Array.isArray(p.empleadoIds) && p.empleadoIds.length ? p.empleadoIds : [p.empleadoId]).filter(Boolean))];
    if (!ids.length) fallo(negocio === "barberia" ? "Selecciona el barbero que atendió." : "Selecciona al menos un empleado que realizó el servicio.");
    if (ids.length > 10) fallo("Puedes elegir como máximo 10 empleados por factura.");
    const participantes = ids.map(eid => {
      const x = DEMO.empleados.find(e => e.id === eid) || fallo("Uno de los empleados seleccionados ya no existe.");
      if (x.negocio !== negocio) fallo(`${x.nombre} no trabaja en ${NEGOCIOS[negocio]}.`);
      if (x.estado !== "activo") fallo(`${x.nombre} está inactivo.`);
      return x;
    });
    const empleado = participantes[0];

    const lineas = normalizarLineas(negocio, p.lineas, negocio === "autolavado" ? (p.vehiculo || {}).tipo : null, cliente, (p.vehiculo || {}).placa);
    // Un premio por programa y nivel; el premio intermedio es UNA de las opciones.
    const premiosL = lineas.filter(l => l.premio);
    if (new Set(premiosL.map(l => l.premio.programaId + l.premio.nivel)).size !== premiosL.length) fallo("Solo se puede canjear un premio por programa y nivel en cada factura.");
    let vehiculo = null;
    if (negocio === "autolavado" && lineas.some(l => l.tipo === "servicio" && !l.area)) {   // un corte solo no exige vehículo
      const v = p.vehiculo || {};
      if (!DEMO.tiposVehiculo.includes(v.tipo)) fallo("Selecciona el tipo de vehículo del servicio.");
      vehiculo = { tipo: v.tipo, placa: txt(v.placa).toUpperCase(), marca: txt(v.marca), modelo: txt(v.modelo), color: txt(v.color) };
    }
    // Lavados con precio por definir para el vehículo elegido.
    const sinPrecio = lineas.find(l => l.tipo === "servicio" && !(l.precio > 0) && !l.membresia && l.descPct !== 100);
    if (sinPrecio) fallo(`“${sinPrecio.nombre}” no tiene precio para ${vehiculo ? vehiculo.tipo : "este vehículo"}. El administrador debe asignarlo en Servicios.`);
    // Un solo descuento por factura: una promoción o un premio de fidelidad.
    let promo = p.promocionId ? (DEMO.promociones.find(x => x.id === p.promocionId) || fallo("La promoción seleccionada ya no existe.")) : null;
    const ap = calc.promocionAplicable(promo, { negocio, lineas, cliente });
    if (!ap.ok) fallo(ap.motivo);
    const totales = calc.totales(lineas, promo);
    const pagos = normalizarPagos(totales.total, p.pagos, cliente);
    const stock = revisarStock(lineas);
    if (stock.errores.length) fallo(stock.errores[0], "STOCK_INSUFICIENTE");

    // ---------------- Validado: a partir de aquí se aplican los cambios ----------------
    const usuario = actor();
    const fecha = new Date();
    const id = DEMO.siguienteFolio(negocio);
    const t = tarjetaDe(cliente.id);
    const saldoAntes = t ? t.saldo : 0;

    pagos.filter(x => x.metodo === "fidelidad").forEach(x => {
      DEMO.registrarMovimientoTarjeta(t, { fecha, tipo: "consumo", concepto: `Pago de factura #${id}`, monto: -x.monto, referencia: id, usuario, negocio });
    });

    // ---- LEALTAD: primero se canjean los premios de la factura y luego se suman las lavadas ----
    const lealtadAntes = JSON.parse(JSON.stringify(calc.estadoLealtad(cliente).reduce((o, x) => (o[x.programa.id] = cliente.lealtad[x.programa.id], o), {})));
    const canjes = [];
    lineas.filter(l => l.premio).forEach(l => {
      const st = cliente.lealtad[l.premio.programaId];
      if (l.premio.nivel === 1) st.canje1 = true; else { st.lavadas = 0; st.ciclo += 1; st.canje1 = false; }
      canjes.push(l.premio);
      DEMO.lealtadMovs.unshift({ id: DEMO.helpers.uid("LM"), fecha, clienteId: cliente.id, programaId: l.premio.programaId, tipo: "canje", concepto: `Canje: ${l.premio.nombre} · factura #${id}`, lavadas: st.lavadas, ciclo: st.ciclo, referencia: id });
      DEMO.registrarActividad({ fecha, tipo: "recompensa_canjeada", negocio, usuario, descripcion: `Premio canjeado: ${cliente.nombre} · ${l.premio.nombre}`, referencia: id, metadata: { clienteId: cliente.id, premio: l.premio } });
    });
    const sumas = {};
    DEMO.configuracion.lealtad.programas.forEach(pg => {
      // Suman las lavadas pagadas, con membresía o con premio de descuento; el lavado GRATIS no suma.
      const n = lineas.filter(l => l.refId === pg.servicioId && !(l.premio && l.descPct >= 100)).reduce((a, l) => a + l.cantidad, 0); if (!n) return;
      const st = cliente.lealtad[pg.id], antes = st.lavadas;
      st.lavadas = Math.min(st.lavadas + n, pg.meta2); st.total += n; sumas[pg.id] = st.lavadas - antes;
      DEMO.lealtadMovs.unshift({ id: DEMO.helpers.uid("LM"), fecha, clienteId: cliente.id, programaId: pg.id, tipo: "lavada", concepto: `+${n} lavada${n > 1 ? "s" : ""} · factura #${id}`, lavadas: st.lavadas, ciclo: st.ciclo, referencia: id });
      if (antes < pg.meta1 && st.lavadas >= pg.meta1 && !st.canje1) DEMO.notificar("success", `${cliente.nombre} llegó a ${pg.meta1} lavadas en ${pg.nombre}: puede elegir su premio.`);
      if (antes < pg.meta2 && st.lavadas >= pg.meta2) DEMO.notificar("success", `${cliente.nombre} completó ${pg.meta2} lavadas en ${pg.nombre}: ${calc.nombrePremio(pg.premio2)}.`);
    });
    // ---- MEMBRESÍAS: cada línea cubierta consume un uso ----
    lineas.filter(l => l.membresia).forEach(l => {
      const mb = DEMO.membresias.find(x => x.id === l.membresia);
      mb.usados += 1; mb.usos.push({ fecha, facturaId: id });
      if (mb.usados >= mb.lavados) DEMO.notificar("warning", `La membresía ${mb.id} de ${cliente.nombre} se agotó (${mb.lavados}/${mb.lavados}).`);
    });
    const fid = { genera: Object.keys(sumas).length > 0, sumas, meta: null, bono: 0, omitida: null };

    const factura = calc.construirFactura({ id, fecha, negocio, cliente, empleado, vehiculo, totales, promo, pagos, usuario, fidelidad: fid, notas: txt(p.notas) });
    factura.empleados = participantes.map(x => ({ id: x.id, nombre: x.nombre }));
    factura.empleadoNombre = participantes.map(x => x.nombre).join(", ");
    factura.tarjeta = t ? { id: t.id, saldoAntes, saldoDespues: t.saldo } : null;
    factura.premioFidelidad = canjes.length ? { tipo: "lealtad", nombre: canjes.map(x => x.nombre).join(" + ") } : null;
    factura.lealtad = { antes: lealtadAntes, sumas, canjes, despues: calc.estadoLealtad(cliente).map(x => ({ programaId: x.programa.id, lavadas: x.lavadas, meta: x.programa.meta2, disp1: x.disp1, disp2: x.disp2 })) };
    factura.usuarioId = (typeof AUTH !== "undefined" && AUTH.sesion()) ? AUTH.sesion().id : null;
    // Pago con membresía: queda registrado en la factura (no es dinero en caja).
    factura.pagosMembresia = lineas.filter(l => l.membresia).map(l => ({ membresia: l.membresia, monto: l.precioRef, uso: l.usoMembresia, restantes: l.restantes, vence: l.vence, placa: l.placaMembresia }));
    if (factura.pagosMembresia.length) factura.metodoPago = factura.pagos.length ? `${factura.metodoPago} + Membresía` : "Membresía";
    DEMO.ventas.unshift(factura);

    const alertas = aplicarInventario(lineas, id, negocio, usuario);

    cliente.totalGastado = calc.redondear(cliente.totalGastado + totales.total);
    cliente.visitas += 1; cliente.ultimaVisita = fecha;
    if (cliente.visitas >= 8) cliente.tipo = "Frecuente"; else if (cliente.visitas >= 3) cliente.tipo = "Regular";
    const parte = calc.redondear(totales.total / participantes.length);   // el ingreso se reparte entre quienes participaron
    participantes.forEach(x => { x.ventasRealizadas += 1; x.ingresosGenerados = calc.redondear(x.ingresosGenerados + parte); });
    if (vehiculo && vehiculo.placa && !cliente.vehiculos.some(v => v.placa === vehiculo.placa)) cliente.vehiculos.push(vehiculo);

    const textoPago = pagos.map(x => `${m(x.monto)} ${x.metodo === "fidelidad" ? "fidelidad" : x.metodo}`).join(" + ") || "Sin cobro";
    DEMO.registrarActividad({ fecha, tipo: "factura_creada", negocio, usuario, descripcion: `Factura ${id} creada · ${cliente.nombre} · ${m(totales.total)} · Pago: ${textoPago}`, referencia: id,
      metadata: { total: totales.total, pagos, lineas: lineas.length, mixto: pagos.length > 1 } });
    factura.lineas.filter(l => l.tipo === "servicio").forEach(l => DEMO.registrarActividad({ fecha, tipo: "servicio_realizado", negocio, usuario,
      descripcion: `Servicio realizado: ${l.nombre}${l.cantidad > 1 ? " ×" + l.cantidad : ""} · Empleado${participantes.length > 1 ? "s" : ""}: ${factura.empleadoNombre}`, referencia: id, metadata: { servicioId: l.refId, empleadoId: empleado.id } }));
    const pf = pagos.find(x => x.metodo === "fidelidad");
    if (pf) DEMO.registrarActividad({ fecha, tipo: "uso_fidelidad", negocio, usuario, descripcion: `Uso de saldo de fidelidad: ${cliente.nombre} · ${m(pf.monto)}`, referencia: id, metadata: { clienteId: cliente.id, monto: pf.monto } });
    DEMO.notificar("success", `Se registró una nueva venta en ${NEGOCIOS[negocio]} (${id}).`);

    emit("factura-creada", factura);
    return { factura, alertas, tarjeta: t ? vistaTarjeta(t) : null };
  }

  // =========================================================================
  // MEMBRESÍAS (paquetes prepagados de lavados). La venta genera una factura
  // del autolavado (entra a caja, ventas y reportes). Los usos se consumen solos
  // al facturar ese lavado al cliente. ► Backend: tablas membresia, membresia_uso.
  // =========================================================================
  function cotizarMembresia({ planId, servicioId, vehiculoTipo, descExtra }) {   // (la placa se valida al vender)
    const plan = DEMO.configuracion.membresias.planes.find(x => x.id === planId) || fallo("Elige un plan de membresía.");
    if (!plan.activo) fallo(`El plan “${plan.nombre}” no está disponible para la venta.`);
    const s = DEMO.servicios.find(x => x.id === servicioId && x.negocio === "autolavado" && x.categoria === "lavado") || fallo("Elige el servicio de lavado.");
    if (!DEMO.tiposVehiculo.includes(vehiculoTipo)) fallo("Elige el tipo de vehículo.");
    const unit = calc.precioServicio(s, vehiculoTipo);
    if (!(unit > 0)) fallo(`“${s.nombre}” no tiene precio para ${vehiculoTipo}. Asígnalo en Servicios.`);
    const extra = txt(descExtra) === "" ? 0 : Number(descExtra);
    if (!Number.isFinite(extra) || extra < 0 || extra > 50) fallo("El descuento personalizado debe estar entre 0 % y 50 %.");
    const pct = Math.min(plan.descuento + extra, 90), bruto = calc.redondear(unit * plan.lavados), total = calc.redondear(bruto * (1 - pct / 100));
    return { plan, servicio: s, unit, extra, pct, bruto, descuento: calc.redondear(bruto - total), total };
  }
  // Planes de membresía (solo administrador). Se mantiene el formato: nombre, % de descuento
  // en lavados, cantidad de lavados y vigencia en días. Las membresías ya vendidas no cambian.
  function guardarPlan(d, id) {
    exigir("membresias.editar");
    const planes = DEMO.configuracion.membresias.planes;
    const ent = (v, min, max, msg) => { const n = Number(v); if (!Number.isInteger(n) || n < min || n > max) fallo(msg); return n; };
    const nombre = txt(d.nombre).replace(/\s+/g, " ");
    if (nombre.length < 3 || nombre.length > 40) fallo("El nombre de la membresía debe tener entre 3 y 40 caracteres.");
    if (planes.some(p => p.id !== id && p.nombre.toLowerCase() === nombre.toLowerCase())) fallo("Ya existe una membresía con ese nombre.");
    const data = { nombre, lavados: ent(d.lavados, 1, 50, "La cantidad de lavados debe estar entre 1 y 50."),
      descuento: ent(d.descuento, 0, 90, "El descuento debe ser un número entero entre 0 % y 90 %."),
      dias: ent(d.dias, 1, 365, "Los días de vigencia deben estar entre 1 y 365."), activo: d.activo !== false };
    let plan;
    if (id) { plan = planes.find(p => p.id === id) || fallo("No se encontró la membresía."); Object.assign(plan, data); }
    else { plan = { id: `PLAN-${String(planes.length + 1).padStart(2, "0")}`, ...data }; planes.push(plan); }
    DEMO.registrarActividad({ tipo: "catalogo_membresia", negocio: "autolavado", usuario: actor(), descripcion: `Membresía ${id ? "editada" : "creada"}: ${plan.nombre} · ${plan.lavados} lavados · ${plan.descuento}% · ${plan.dias} días${plan.activo ? "" : " (inactiva)"}`, referencia: plan.id, metadata: {} });
    emit("plan-membresia", plan);
    return plan;
  }

  // =========================================================================
  // LEALTAD: edición de programas y ajuste manual del progreso (solo administrador)
  // =========================================================================
  function guardarProgramaLealtad(id, d) {
    exigir("lealtad.editar");
    const p = DEMO.configuracion.lealtad.programas.find(x => x.id === id) || fallo("Programa no válido.");
    const servOk = sid => DEMO.servicios.some(x => x.id === sid && x.negocio === "autolavado");
    const ent = (v, min, max, msg) => { const n = Number(v); if (!Number.isInteger(n) || n < min || n > max) fallo(msg); return n; };
    const nombre = txt(d.nombre).replace(/\s+/g, " ");
    if (nombre.length < 3 || nombre.length > 40) fallo("El nombre del programa debe tener entre 3 y 40 caracteres.");
    if (!DEMO.servicios.some(x => x.id === d.servicioId && x.categoria === "lavado")) fallo("Elige el lavado que suma al programa.");
    [d.op1, d.op2, d.final].forEach(sid => { if (!servOk(sid)) fallo("Elige servicios válidos para los premios."); });
    const meta1 = ent(d.meta1, 1, 58, "Las lavadas para elegir premio deben estar entre 1 y 58.");
    const meta2 = ent(d.meta2, 2, 60, "Las lavadas del premio final deben estar entre 2 y 60.");
    if (meta1 >= meta2) fallo("El premio a elegir debe llegar antes que el premio final.");
    const pct = ent(d.pct, 1, 100, "El descuento debe estar entre 1 % y 100 %.");
    const icono = txt(d.icono).slice(0, 4) || p.icono;
    Object.assign(p, { nombre, icono, servicioId: d.servicioId, meta1, meta2, opciones1: [{ tipo: "gratis", servicioId: d.op1 }, { tipo: "descuento", pct, servicioId: d.op2 }], premio2: { tipo: "gratis", servicioId: d.final } });
    DEMO.clientes.forEach(c => { const st = c.lealtad && c.lealtad[p.id]; if (st) st.lavadas = Math.min(st.lavadas, meta2); });
    DEMO.registrarActividad({ tipo: "config_actualizada", negocio: "autolavado", usuario: actor(), descripcion: `Programa de lealtad editado: ${p.nombre} (${meta1} → elige · ${meta2} → ${calc.nombrePremio(p.premio2)})`, referencia: p.id, metadata: {} });
    emit("lealtad", p); return p;
  }
  function ajustarLealtad({ clienteId, programaId, lavadas, canje1, motivo }) {
    exigir("lealtad.editar");
    const c = clientePorId(clienteId), est = calc.estadoLealtad(c).find(x => x.programa.id === programaId) || fallo("Programa no válido.");
    const n = Number(lavadas); if (!Number.isInteger(n) || n < 0 || n > est.programa.meta2) fallo(`Las lavadas deben estar entre 0 y ${est.programa.meta2}.`);
    motivo = txt(motivo); if (motivo.length < 3) fallo("Escribe el motivo del ajuste.");
    const st = c.lealtad[programaId], antes = st.lavadas;
    st.lavadas = n; st.canje1 = !!canje1 && n >= est.programa.meta1;
    DEMO.lealtadMovs.unshift({ id: DEMO.helpers.uid("LM"), fecha: new Date(), clienteId, programaId, tipo: "ajuste", concepto: `Ajuste manual: ${antes} → ${n} · ${motivo}`, lavadas: n, ciclo: st.ciclo, referencia: actor() });
    DEMO.registrarActividad({ tipo: "cliente_actualizado", negocio: "autolavado", usuario: actor(), descripcion: `Ajuste de lealtad: ${c.nombre} · ${est.programa.nombre} ${antes} → ${n} (${motivo})`, referencia: clienteId, metadata: {} });
    emit("lealtad", c); return calc.estadoLealtad(c).find(x => x.programa.id === programaId);
  }

  function venderMembresia(d) {
    exigir("membresias.vender");
    const cliente = clientePorId(d.clienteId || fallo("Selecciona el cliente."));
    if (cliente.estado !== "activo") fallo(`${cliente.nombre} está inactivo.`);
    const q = cotizarMembresia(d);
    // La membresía se vende a UN vehículo (su placa).
    const placa = txt(d.placa).toUpperCase().replace(/\s+/g, "");
    if (!/^[A-Z0-9-]{3,10}$/.test(placa)) fallo("Escribe la placa (matrícula) del vehículo de la membresía: de 3 a 10 letras o números.");
    const dup = DEMO.membresias.find(x => !x.anulada && calc.normPlaca(x.placa) === calc.normPlaca(placa) && x.servicioId === q.servicio.id && ["Activa", "Por vencer"].includes(calc.estadoMembresia(x)));
    if (dup) fallo(`El vehículo ${placa} ya tiene la membresía ${dup.id} vigente para ${dup.servicioNombre} (${dup.usados}/${dup.lavados}).`);
    const pagos = normalizarPagos(q.total, d.pagos, cliente);
    const usuario = actor(), fecha = new Date(), id = DEMO.siguienteFolio("autolavado");
    const memId = `MEM-${String(DEMO.membresias.length + 1).padStart(4, "0")}`;
    const nombre = `${q.plan.nombre} · ${q.servicio.nombre} (${d.vehiculoTipo} · ${placa})`;
    const totales = { lineas: [{ tipo: "membresia", refId: memId, nombre, cantidad: 1, precio: q.bruto, descuento: q.descuento, subtotal: q.total }], subtotal: q.bruto, descuento: q.descuento, total: q.total };
    const factura = calc.construirFactura({ id, fecha, negocio: "autolavado", cliente, empleado: null, vehiculo: null, totales,
      promo: { id: null, nombre: `Membresía ${q.pct}%` }, pagos, usuario, fidelidad: null });
    factura.usuarioId = AUTH.sesion() ? AUTH.sesion().id : null; factura.membresiaVendida = memId;
    const mb = { id: memId, planId: q.plan.id, planNombre: q.plan.nombre, clienteId: cliente.id, clienteNombre: cliente.nombre, servicioId: q.servicio.id, servicioNombre: q.servicio.nombre,
      vehiculoTipo: d.vehiculoTipo, placa, lavados: q.plan.lavados, usados: 0, descuento: q.plan.descuento, descExtra: q.extra, precioUnit: q.unit, bruto: q.bruto, total: q.total,
      inicio: fecha, vence: new Date(fecha.getTime() + q.plan.dias * 86400000), facturaId: id, vendidaPor: usuario, vendidaPorId: AUTH.sesion() ? AUTH.sesion().id : null, usos: [] };
    DEMO.membresias.unshift(mb); DEMO.ventas.unshift(factura);
    cliente.totalGastado = calc.redondear(cliente.totalGastado + q.total);
    const vg = cliente.vehiculos.find(v => calc.normPlaca(v.placa) === calc.normPlaca(placa));
    if (vg) vg.tipo = d.vehiculoTipo; else cliente.vehiculos.push({ tipo: d.vehiculoTipo, placa, marca: "", modelo: "", color: "" });
    // (la placa queda en la membresía; la factura de venta no cuenta como vehículo atendido)
    DEMO.registrarActividad({ fecha, tipo: "membresia_vendida", negocio: "autolavado", usuario, descripcion: `Membresía ${memId} vendida: ${cliente.nombre} · ${nombre} · ${m(q.total)}`, referencia: memId, metadata: { facturaId: id } });
    DEMO.notificar("success", `Membresía ${q.plan.nombre} vendida a ${cliente.nombre} (${m(q.total)}).`);
    emit("factura-creada", factura);
    return { membresia: mb, factura };
  }

  function anularFactura(id, motivo) {
    exigir("ventas.anular");
    const f = DEMO.ventas.find(x => x.id === id) || fallo("No se encontró la factura.", "NO_ENCONTRADO");
    if (f.estado !== "Completada") fallo("Esta factura ya fue anulada.");
    const mbVendida = f.membresiaVendida && DEMO.membresias.find(x => x.id === f.membresiaVendida);
    if (mbVendida && mbVendida.usados > 0) fallo(`No se puede anular: la membresía ${mbVendida.id} ya tiene ${mbVendida.usados} uso(s).`);
    motivo = txt(motivo); if (motivo.length < 3) fallo("Escribe el motivo de la anulación.");
    const usuario = actor(), t = tarjetaDe(f.clienteId), c = DEMO.clientes.find(x => x.id === f.clienteId);
    f.estado = "Anulada"; f.anulacion = { fecha: new Date(), usuario, motivo };
    if (mbVendida) mbVendida.anulada = true;
    if (t) {
      f.pagos.filter(p => p.metodo === "fidelidad").forEach(p =>
        DEMO.registrarMovimientoTarjeta(t, { tipo: "reversion", concepto: `Reversión de factura #${id}`, monto: p.monto, referencia: id, usuario, negocio: f.negocio }));
      if (f.fidelidad && f.fidelidad.bono > 0) {
        const quitar = Math.min(f.fidelidad.bono, t.saldo);
        if (quitar > 0) DEMO.registrarMovimientoTarjeta(t, { tipo: "reversion", concepto: `Reversión de bono · factura #${id}`, monto: -quitar, referencia: id, usuario, negocio: f.negocio });
      }
    }
    if (c && f.fidelidad && f.fidelidad.genera && f.fidelidad.diasAntes != null && c.fidelidad.dias === f.fidelidad.diasDespues) c.fidelidad.dias = f.fidelidad.diasAntes;
    if (c && f.lealtad) {                         // lealtad: se restan las lavadas y se devuelven los premios
      Object.entries(f.lealtad.sumas || {}).forEach(([pid, n]) => { const st = c.lealtad[pid]; if (st) { st.lavadas = Math.max(st.lavadas - n, 0); st.total = Math.max(st.total - n, 0); } });
      (f.lealtad.canjes || []).forEach(pr => { const st = c.lealtad[pr.programaId], antes = f.lealtad.antes[pr.programaId]; if (!st || !antes) return;
        if (pr.nivel === 1) st.canje1 = false; else { const pg = DEMO.configuracion.lealtad.programas.find(z => z.id === pr.programaId); st.lavadas = Math.min(antes.lavadas + st.lavadas, pg ? pg.meta2 : antes.lavadas); st.ciclo = Math.max(st.ciclo - 1, 1); st.canje1 = antes.canje1; } });
      DEMO.lealtadMovs.unshift({ id: DEMO.helpers.uid("LM"), fecha: new Date(), clienteId: c.id, programaId: (Object.keys(f.lealtad.sumas || {})[0] || (f.lealtad.canjes[0] || {}).programaId || "premium"), tipo: "reversion", concepto: `Reversión · factura #${id} anulada`, lavadas: null, ciclo: null, referencia: id });
    }
    f.lineas.filter(l => l.membresia).forEach(l => { const mb = DEMO.membresias.find(x => x.id === l.membresia); if (mb) { mb.usados = Math.max(mb.usados - 1, 0); mb.usos = mb.usos.filter(u => u.facturaId !== id); } });
    if (c && f.premioFidelidad && f.premioFidelidad.antes) {                // (modelo anterior) el premio canjeado vuelve a quedar disponible
      if (f.premioFidelidad.tipo === "descuento") c.fidelidad.descuentoUsado = false;
      else { c.fidelidad.dias = Math.min(f.premioFidelidad.antes.dias + c.fidelidad.dias, c.fidelidad.meta); c.fidelidad.descuentoUsado = f.premioFidelidad.antes.descuentoUsado; }
      if (t) DEMO.registrarMovimientoTarjeta(t, { tipo: "reversion", concepto: `Premio devuelto · factura #${id} anulada`, monto: 0, referencia: id, usuario, negocio: f.negocio });
    }
    f.lineas.filter(l => l.tipo === "producto").forEach(l => {           // los productos vendidos vuelven al stock; los insumos ya se usaron
      const p = DEMO.productos.find(x => x.id === l.refId); if (!p) return;
      const antes = p.stock; p.stock += l.cantidad; if (antes === 0) p.usoActual = p.rendimiento;
      anotarInventario(p, "reversion", l.cantidad, antes, id, usuario, "Anulación de factura");
    });
    if (c) { c.totalGastado = Math.max(calc.redondear(c.totalGastado - f.total), 0); c.visitas = Math.max(c.visitas - 1, 0); }
    const e = DEMO.empleados.find(x => x.id === f.empleadoId);
    const parts = f.empleados && f.empleados.length ? f.empleados : (e ? [{ id: e.id }] : []);
    parts.forEach(pp => { const x = DEMO.empleados.find(y => y.id === pp.id); if (x) { x.ventasRealizadas = Math.max(x.ventasRealizadas - 1, 0); x.ingresosGenerados = Math.max(calc.redondear(x.ingresosGenerados - f.total / parts.length), 0); } });
    DEMO.registrarActividad({ tipo: "factura_anulada", negocio: f.negocio, usuario, descripcion: `Factura ${id} anulada · Motivo: ${motivo}`, referencia: id, metadata: { motivo, total: f.total } });
    emit("factura-anulada", f);
    return f;
  }

  // =========================================================================
  // TARJETAS: operaciones
  // =========================================================================
  function canjearRecompensa(clienteId) {
    exigir("fidelidad.operar");
    const c = clientePorId(clienteId), t = tarjetaActiva(clienteId), premio = DEMO.configuracion.fidelidad.premio;
    if (c.fidelidad.dias < c.fidelidad.meta) fallo(`Aún no completa sus lavados premium: le faltan ${c.fidelidad.meta - c.fidelidad.dias}.`);
    c.fidelidad.dias = 0; c.fidelidad.descuentoUsado = false;
    DEMO.registrarMovimientoTarjeta(t, { tipo: "canje", concepto: `Recompensa canjeada: ${premio}`, monto: 0, usuario: actor(), negocio: c.negocioPreferido, visitas: { dias: 0, meta: c.fidelidad.meta } });
    DEMO.notificar("success", `${c.nombre} canjeó su recompensa de fidelidad: ${premio}.`);
    DEMO.registrarActividad({ tipo: "recompensa_canjeada", negocio: c.negocioPreferido, usuario: actor(), descripcion: `Recompensa canjeada: ${c.nombre} · ${premio}`, referencia: t.id, metadata: { clienteId } });
    emit("tarjeta-cambio", t);
    return { cliente: c, tarjeta: vistaTarjeta(t) };
  }
  function cambiarEstadoTarjeta(clienteId, estado) {
    exigir("tarjetas.bloquear");
    const c = clientePorId(clienteId), t = tarjetaDe(clienteId) || fallo("Este cliente no tiene tarjeta.");
    if (!["activa", "bloqueada"].includes(estado)) fallo("Estado de tarjeta no válido.");
    t.estado = estado;
    DEMO.registrarActividad({ tipo: "tarjeta_estado", negocio: c.negocioPreferido, usuario: actor(), descripcion: `Tarjeta ${t.id} de ${c.nombre} ${estado === "activa" ? "activada" : "bloqueada"}`, referencia: t.id, metadata: { estado } });
    emit("tarjeta-cambio", t); return vistaTarjeta(t);
  }

  // =========================================================================
  // INVENTARIO: movimientos manuales y CRUD
  // =========================================================================
  function movimientoInventario({ productoId, tipo, cantidad, motivo }) {
    exigir("inventario.editar");
    const p = productoPorId(productoId); cantidad = Number(cantidad);
    if (!Number.isInteger(cantidad) || cantidad < 1) fallo("La cantidad debe ser un número entero mayor que cero.");
    const usuario = actor(), antes = p.stock;
    if (tipo === "entrada") {
      p.stock += cantidad; if (antes === 0) p.usoActual = p.rendimiento;
      anotarInventario(p, "entrada", cantidad, antes, null, usuario, txt(motivo) || "Entrada de mercadería");
    } else if (tipo === "consumo") {
      const r = simularProducto(p, 0, cantidad);
      if (!r.ok) fallo(`No hay suficiente ${p.nombre}: quedan ${usosDisponibles(p)} uso(s).`, "STOCK_INSUFICIENTE");
      let pend = cantidad;
      while (pend > 0) { const toma = Math.min(pend, p.usoActual); p.usoActual -= toma; pend -= toma; if (p.usoActual === 0) { p.stock -= 1; p.usoActual = p.stock > 0 ? p.rendimiento : 0; } }
      anotarInventario(p, "consumo", cantidad, antes, null, usuario, txt(motivo) || "Consumo manual");
    } else fallo("Tipo de movimiento no válido.");
    DEMO.registrarActividad({ tipo: "inventario_movimiento", negocio: p.negocio, usuario, descripcion: `Inventario: ${tipo === "entrada" ? "entrada" : "consumo manual"} de ${p.nombre} · ${cantidad}`, referencia: p.id, metadata: { tipo, cantidad } });
    emit("inventario-cambio", p); return p;
  }
  function guardarProducto(d, id) {
    exigir("inventario.editar");
    const nombre = txt(d.nombre); if (nombre.length < 2) fallo("El nombre del producto es obligatorio.");
    const num = (v, min, msg) => { const n = Number(v); if (!Number.isFinite(n) || n < min) fallo(msg); return n; };
    const stock = num(d.stock, 0, "El stock debe ser un número igual o mayor que cero.");
    const stockMinimo = num(d.stockMinimo, 0, "El stock mínimo debe ser un número igual o mayor que cero.");
    const rendimiento = num(d.rendimiento, 1, "El rendimiento debe ser al menos 1 uso por unidad.");
    if (!Number.isInteger(stock) || !Number.isInteger(rendimiento)) fallo("El stock y el rendimiento deben ser números enteros.");
    const precioVenta = txt(d.precioVenta) === "" ? null : num(d.precioVenta, 0.01, "El precio de venta debe ser mayor que cero (o déjalo vacío si no se vende).");
    if (DEMO.productos.some(x => x.negocio === d.negocio && x.id !== id && x.nombre.toLowerCase() === nombre.toLowerCase())) fallo("Ya existe un producto con ese nombre en este negocio.");
    const data = { nombre, categoria: txt(d.categoria) || "General", unidad: txt(d.unidad) || "unidad", stock, stockMinimo, rendimiento, precioVenta };
    const usuario = actor();
    if (id) {
      const p = productoPorId(id), antes = p.stock;
      Object.assign(p, data); p.capacidadTotal = p.stock * p.rendimiento;
      p.usoActual = p.stock === 0 ? 0 : Math.min(Math.max(p.usoActual, 1), p.rendimiento);
      if (antes !== stock) anotarInventario(p, "ajuste", stock - antes, antes, null, usuario, "Ajuste desde edición de producto");
      DEMO.registrarActividad({ tipo: "producto_actualizado", negocio: p.negocio, usuario, descripcion: `Producto actualizado: ${p.nombre}`, referencia: p.id, metadata: {} });
      emit("inventario-cambio", p); return p;
    }
    const p = { id: DEMO.helpers.nextId("P", 2), negocio: d.negocio, ...data, usoActual: stock > 0 ? rendimiento : 0, capacidadTotal: stock * rendimiento };
    DEMO.productos.unshift(p);
    anotarInventario(p, "entrada", stock, 0, null, usuario, "Stock inicial");
    DEMO.registrarActividad({ tipo: "producto_creado", negocio: p.negocio, usuario, descripcion: `Producto creado: ${p.nombre}`, referencia: p.id, metadata: {} });
    emit("inventario-cambio", p); return p;
  }

  // =========================================================================
  // CATÁLOGOS: servicios, promociones, empleados
  // =========================================================================
  function guardarServicio(d, id) {
    exigir("catalogos.editar");
    const nombre = txt(d.nombre); if (nombre.length < 2) fallo("El nombre del servicio es obligatorio.");
    // Precio por tipo de vehículo (opcional, solo autolavado) o precio único.
    let preciosVehiculo = null, precio;
    if (d.preciosVehiculo && d.negocio === "autolavado") {
      preciosVehiculo = {};
      DEMO.tiposVehiculo.forEach(t => {
        const crudo = txt(d.preciosVehiculo[t]); if (crudo === "") return;      // vacío = por definir para ese vehículo
        const v = Number(crudo);
        if (!Number.isFinite(v) || v <= 0) fallo(`El precio para ${t} debe ser mayor que cero (o déjalo vacío si aún no se define).`);
        preciosVehiculo[t] = calc.redondear(v);
      });
      if (!Object.keys(preciosVehiculo).length) fallo("Escribe el precio de al menos un tipo de vehículo.");
      precio = Math.min(...Object.values(preciosVehiculo));
    } else {
      precio = Number(d.precioBase); if (!Number.isFinite(precio) || precio <= 0) fallo("El precio debe ser mayor que cero.");
    }
    const duracion = Number(d.duracion); if (!Number.isFinite(duracion) || duracion < 0) fallo("La duración debe ser un número de minutos válido.");
    if (DEMO.servicios.some(s => s.negocio === d.negocio && s.id !== id && s.nombre.toLowerCase() === nombre.toLowerCase())) fallo("Ya existe un servicio con ese nombre en este negocio.");
    const consumo = (d.consumo || []).filter(c => Number(c.cantidad) > 0).map(c => ({ producto: c.producto, cantidad: Math.floor(Number(c.cantidad)) }));
    const data = { nombre, descripcion: txt(d.descripcion), precioBase: precio, preciosVehiculo, duracion, generaFidelidad: !!d.generaFidelidad, consumo };
    if (d.negocio === "autolavado") data.categoria = d.categoria === "extra" ? "extra" : "lavado";
    let s;
    if (id) { s = DEMO.servicios.find(x => x.id === id) || fallo("No se encontró el servicio."); Object.assign(s, data); }
    else { s = { id: DEMO.helpers.nextId(data.categoria === "extra" ? "EX" : "SV", 2), negocio: d.negocio, estado: "activo", ...data }; DEMO.servicios.unshift(s); }
    DEMO.registrarActividad({ tipo: "catalogo_servicio", negocio: s.negocio, usuario: actor(), descripcion: `Servicio ${id ? "actualizado" : "creado"}: ${s.nombre} · ${s.preciosVehiculo ? "desde " : ""}${m(s.precioBase)}`, referencia: s.id, metadata: {} });
    return s;
  }
  function alternarServicio(id) {
    exigir("catalogos.editar");
    const s = DEMO.servicios.find(x => x.id === id) || fallo("No se encontró el servicio.");
    s.estado = s.estado === "activo" ? "inactivo" : "activo";
    DEMO.registrarActividad({ tipo: "catalogo_servicio", negocio: s.negocio, usuario: actor(), descripcion: `Servicio ${s.estado === "activo" ? "activado" : "desactivado"}: ${s.nombre}`, referencia: s.id, metadata: {} });
    return s;
  }
  function guardarPromocion(d, id) {
    exigir("catalogos.editar");
    const nombre = txt(d.nombre); if (nombre.length < 2) fallo("El nombre de la promoción es obligatorio.");
    const valor = Number(d.valor); if (!Number.isFinite(valor) || valor <= 0) fallo("El valor del descuento debe ser mayor que cero.");
    if (!["porcentaje", "monto"].includes(d.tipo)) fallo("Selecciona el tipo de descuento.");
    if (d.tipo === "porcentaje" && valor > 100) fallo("Un descuento porcentual no puede superar el 100%.");
    if (!d.inicio || !d.fin) fallo("Indica la fecha de inicio y de fin de la promoción.");
    if (d.fin < d.inicio) fallo("La fecha final no puede ser anterior a la fecha de inicio.");
    const data = { nombre, descripcion: txt(d.descripcion), tipo: d.tipo, valor, inicio: d.inicio, fin: d.fin };
    let p;
    if (id) { p = DEMO.promociones.find(x => x.id === id) || fallo("No se encontró la promoción."); Object.assign(p, data); }
    else { p = { id: DEMO.helpers.nextId("PR", 2), negocio: d.negocio, estado: "activa", ...data }; DEMO.promociones.unshift(p); }
    DEMO.registrarActividad({ tipo: "catalogo_promocion", negocio: p.negocio === "ambos" ? null : p.negocio, usuario: actor(), descripcion: `Promoción ${id ? "actualizada" : "creada"}: ${p.nombre}`, referencia: p.id, metadata: {} });
    return p;
  }
  function alternarPromocion(id) {
    exigir("catalogos.editar");
    const p = DEMO.promociones.find(x => x.id === id) || fallo("No se encontró la promoción.");
    p.estado = p.estado === "activa" ? "inactiva" : "activa";
    DEMO.registrarActividad({ tipo: "catalogo_promocion", negocio: p.negocio === "ambos" ? null : p.negocio, usuario: actor(), descripcion: `Promoción ${p.estado === "activa" ? "activada" : "desactivada"}: ${p.nombre}`, referencia: p.id, metadata: {} });
    return p;
  }
  function guardarEmpleado(d, id) {
    exigir("empleados.editar");
    const nombre = txt(d.nombre); if (nombre.length < 3) fallo("Escribe el nombre completo del empleado.");
    if (!txt(d.cargo)) fallo("Indica el cargo del empleado.");
    if (!NEGOCIOS[d.negocio]) fallo("Selecciona el negocio del empleado.");
    const tel = txt(d.telefono); if (tel && !/^\d{4}-?\d{4}$/.test(tel)) fallo("El teléfono debe tener 8 dígitos, por ejemplo 8888-8888.");
    const correo = txt(d.correo); if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) fallo("El correo no tiene un formato válido.");
    const data = { nombre, cargo: txt(d.cargo), negocio: d.negocio, telefono: tel, correo };
    let e;
    if (id) { e = DEMO.empleados.find(x => x.id === id) || fallo("No se encontró al empleado."); Object.assign(e, data); e.inicial = iniciales(nombre); }
    else { e = { id: DEMO.helpers.nextId("EMP", 3), estado: "activo", ventasRealizadas: 0, ingresosGenerados: 0, inicial: iniciales(nombre), ...data }; DEMO.empleados.unshift(e); }
    DEMO.registrarActividad({ tipo: "catalogo_empleado", negocio: e.negocio, usuario: actor(), descripcion: `Empleado ${id ? "actualizado" : "creado"}: ${e.nombre}`, referencia: e.id, metadata: {} });
    return e;
  }
  const iniciales = n => n.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase();
  function alternarEmpleado(id) {
    exigir("empleados.editar");
    const e = DEMO.empleados.find(x => x.id === id) || fallo("No se encontró al empleado.");
    e.estado = e.estado === "activo" ? "inactivo" : "activo";
    DEMO.registrarActividad({ tipo: "catalogo_empleado", negocio: e.negocio, usuario: actor(), descripcion: `Empleado ${e.estado === "activo" ? "activado" : "desactivado"}: ${e.nombre}`, referencia: e.id, metadata: {} });
    return e;
  }

  // =========================================================================
  // CONFIGURACIÓN Y USUARIOS
  // =========================================================================
  function guardarConfiguracion(seccion, d) {
    exigir("config.editar");
    const cfg = DEMO.configuracion;
    if (seccion === "general") {
      ["autolavado", "barberia"].forEach(n => {
        const x = d[n] || {};
        if (txt(x.nombre).length < 2) fallo(`Escribe el nombre del negocio (${NEGOCIOS[n]}).`);
        if (txt(x.correo) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(txt(x.correo))) fallo(`El correo de ${NEGOCIOS[n]} no tiene un formato válido.`);
        Object.assign(cfg.negocios[n], { nombre: txt(x.nombre), telefono: txt(x.telefono), direccion: txt(x.direccion), correo: txt(x.correo) });
      });
    } else if (seccion === "fidelidad") {
      const dias = Number(d.diasMeta), metaDesc = Number(d.metaDescuento), pct = Number(d.descuentoPct);
      if (!Number.isInteger(dias) || dias < 2 || dias > 60) fallo("Los lavados premium para el premio deben ser un número entero entre 2 y 60.");
      if (!Number.isInteger(metaDesc) || metaDesc < 1 || metaDesc >= dias) fallo("Los lavados para el descuento deben ser un número entero menor que los del premio.");
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) fallo("El porcentaje de descuento debe estar entre 1 y 100.");
      if (txt(d.premio).length < 2) fallo("Escribe el premio que recibe el cliente.");
      Object.assign(cfg.fidelidad, { diasMeta: dias, metaDescuento: metaDesc, descuentoPct: pct, premio: txt(d.premio), bonoVisita: 0 });
      DEMO.clientes.forEach(c => { c.fidelidad.meta = dias; c.fidelidad.dias = Math.min(c.fidelidad.dias, dias); });
    } else if (seccion === "lealtad") {
      const servOk = id => DEMO.servicios.some(x => x.id === id && x.negocio === "autolavado");
      const ent = (v, min, max, msg) => { const n = Number(v); if (!Number.isInteger(n) || n < min || n > max) fallo(msg); return n; };
      (d.programas || []).forEach(x => {
        const p = cfg.lealtad.programas.find(y => y.id === x.id) || fallo("Programa no válido.");
        [x.servicioId, x.op1, x.op2, x.final].forEach(id => { if (!servOk(id)) fallo(`Elige servicios válidos en ${p.nombre}.`); });
        const meta1 = ent(x.meta1, 1, 58, `${p.nombre}: las lavadas para elegir premio deben estar entre 1 y 58.`);
        const meta2 = ent(x.meta2, 2, 60, `${p.nombre}: las lavadas del premio final deben estar entre 2 y 60.`);
        if (meta1 >= meta2) fallo(`${p.nombre}: el premio a elegir debe llegar antes que el premio final.`);
        const pct = ent(x.pct, 1, 100, `${p.nombre}: el descuento debe estar entre 1 % y 100 %.`);
        Object.assign(p, { servicioId: x.servicioId, meta1, meta2, opciones1: [{ tipo: "gratis", servicioId: x.op1 }, { tipo: "descuento", pct, servicioId: x.op2 }], premio2: { tipo: "gratis", servicioId: x.final } });
        DEMO.clientes.forEach(c => { const st = c.lealtad && c.lealtad[p.id]; if (st) st.lavadas = Math.min(st.lavadas, meta2); });
      });
      (d.planes || []).forEach(x => {   // (los planes ahora se editan en Membresías → guardarPlan)
        const p = cfg.membresias.planes.find(y => y.id === x.id) || fallo("Plan no válido.");
        if (txt(x.nombre).length < 3) fallo("Escribe el nombre de cada plan de membresía.");
        Object.assign(p, { nombre: txt(x.nombre), lavados: ent(x.lavados, 1, 50, "Los lavados del plan deben estar entre 1 y 50."), descuento: ent(x.descuento, 0, 90, "El descuento del plan debe estar entre 0 % y 90 %."), semanas: ent(x.semanas, 1, 52, "La vigencia debe estar entre 1 y 52 semanas.") });
      });
    } else if (seccion === "inventario") {
      cfg.inventario.metodoConsumo = d.metodoConsumo;
    } else if (seccion === "pagos") {
      if (!d.efectivo && !d.tarjeta && !d.transferencia) fallo("Debe quedar habilitado al menos un método de pago (efectivo, tarjeta o transferencia).");
      Object.assign(cfg.metodosPago, { efectivo: !!d.efectivo, tarjeta: !!d.tarjeta, transferencia: !!d.transferencia, fidelidad: false }); // sin saldo
      if (d.tipoCambio !== undefined) { const tc = Number(d.tipoCambio); if (!Number.isFinite(tc) || tc < 1 || tc > 200) fallo("El tipo de cambio debe ser un número entre 1 y 200."); cfg.caja.tipoCambio = calc.redondear(tc); }
    } else fallo("Sección de configuración no válida.");
    DEMO.registrarActividad({ tipo: "config_actualizada", usuario: actor(), descripcion: `Configuración actualizada: ${seccion}`, referencia: seccion, metadata: {} });
    return cfg;
  }
  // =========================================================================
  // ELIMINAR (solo administrador). Las facturas ya emitidas conservan nombres y montos,
  // así que los reportes e historiales no se pierden. Se bloquea lo que rompería datos vivos.
  // =========================================================================
  function eliminarServicio(id) {
    exigir("catalogos.editar");
    const s = DEMO.servicios.find(x => x.id === id) || fallo("No se encontró el servicio.");
    const pg = DEMO.configuracion.lealtad.programas.find(p => [p.servicioId, p.premio2.servicioId, ...p.opciones1.map(o => o.servicioId)].includes(id));
    if (pg) fallo(`No se puede eliminar “${s.nombre}”: lo usa ${pg.nombre}. Cámbialo primero en Configuración → Lealtad.`);
    const mb = DEMO.membresias.find(m => m.servicioId === id && ["Activa", "Por vencer"].includes(calc.estadoMembresia(m)));
    if (mb) fallo(`No se puede eliminar “${s.nombre}”: hay membresías vigentes de ese lavado (${mb.id}). Puedes desactivarlo.`);
    DEMO.servicios.splice(DEMO.servicios.indexOf(s), 1);
    DEMO.promociones.forEach(p => { if (p.requiere) p.requiere = p.requiere.filter(x => x !== id); });
    DEMO.registrarActividad({ tipo: "catalogo_servicio", negocio: s.negocio, usuario: actor(), descripcion: `Servicio eliminado: ${s.nombre}`, referencia: id, metadata: {} });
    emit("catalogo", s); return s;
  }
  function eliminarProducto(id) {
    exigir("inventario.editar");
    const p = productoPorId(id);
    const usan = DEMO.servicios.filter(s => (s.consumo || []).some(c => c.producto === id));
    usan.forEach(s => { s.consumo = s.consumo.filter(c => c.producto !== id); });   // deja de descontarse en esos servicios
    DEMO.productos.splice(DEMO.productos.indexOf(p), 1);
    DEMO.registrarActividad({ tipo: "producto_actualizado", negocio: p.negocio, usuario: actor(), descripcion: `Producto eliminado: ${p.nombre}${usan.length ? ` (se quitó del consumo de ${usan.map(s => s.nombre).join(", ")})` : ""}`, referencia: id, metadata: {} });
    emit("inventario", p); return { producto: p, servicios: usan.map(s => s.nombre) };
  }
  function eliminarPromocion(id) {
    exigir("catalogos.editar");
    const p = DEMO.promociones.find(x => x.id === id) || fallo("No se encontró la promoción.");
    DEMO.promociones.splice(DEMO.promociones.indexOf(p), 1);
    DEMO.registrarActividad({ tipo: "catalogo_promocion", negocio: p.negocio === "ambos" ? "autolavado" : p.negocio, usuario: actor(), descripcion: `Promoción eliminada: ${p.nombre}`, referencia: id, metadata: {} });
    emit("catalogo", p); return p;
  }
  function eliminarEmpleado(id) {
    exigir("empleados.editar");
    const x = DEMO.empleados.find(y => y.id === id) || fallo("No se encontró el empleado.");
    const u = DEMO.usuarios.find(y => y.empleadoId === id);
    if (u) fallo(`No se puede eliminar a ${x.nombre}: el usuario @${u.usuario} está asociado. Elimina ese usuario o cámbiale el empleado asociado.`);
    DEMO.empleados.splice(DEMO.empleados.indexOf(x), 1);
    DEMO.registrarActividad({ tipo: "catalogo_empleado", negocio: x.negocio, usuario: actor(), descripcion: `Empleado eliminado: ${x.nombre} (sus ventas anteriores se conservan)`, referencia: id, metadata: {} });
    emit("catalogo", x); return x;
  }
  function eliminarUsuario(id) {
    exigir("usuarios.editar");
    const u = DEMO.usuarios.find(x => x.id === id) || fallo("No se encontró el usuario.");
    if (AUTH.sesion() && AUTH.sesion().id === id) fallo("No puedes eliminar tu propio usuario mientras tienes la sesión abierta.");
    if (u.rol === "ADMIN" && DEMO.usuarios.filter(x => x.rol === "ADMIN" && x.estado === "activo" && x.id !== id).length === 0) fallo("Debe quedar al menos un administrador activo.");
    DEMO.usuarios.splice(DEMO.usuarios.indexOf(u), 1);
    DEMO.registrarActividad({ tipo: "usuario_actualizado", negocio: "autolavado", usuario: actor(), descripcion: `Usuario eliminado: @${u.usuario} (${u.nombre})`, referencia: id, metadata: {} });
    return u;
  }

  function guardarUsuario(d, id) {
    exigir("usuarios.editar");
    const usuario = txt(d.usuario).toLowerCase(), nombre = txt(d.nombre);
    if (!/^[a-z0-9._-]{3,20}$/.test(usuario)) fallo("El usuario debe tener de 3 a 20 caracteres (letras, números, punto o guion).");
    if (nombre.length < 3) fallo("Escribe el nombre de la persona.");
    if (!["ADMIN", "EMPLEADO"].includes(d.rol)) fallo("Selecciona el rol del usuario.");
    if (DEMO.usuarios.some(u => u.usuario === usuario && u.id !== id)) fallo("Ese nombre de usuario ya está en uso.");
    if (!id && txt(d.password).length < 6) fallo("La contraseña DEMO debe tener al menos 6 caracteres.");
    if (id && txt(d.password) && txt(d.password).length < 6) fallo("La contraseña DEMO debe tener al menos 6 caracteres.");
    let u;
    if (id) {
      u = DEMO.usuarios.find(x => x.id === id) || fallo("No se encontró el usuario.");
      if (u.rol === "ADMIN" && d.rol !== "ADMIN" && DEMO.usuarios.filter(x => x.rol === "ADMIN" && x.estado === "activo").length <= 1) fallo("Debe existir al menos un administrador activo.");
      Object.assign(u, { usuario, nombre, rol: d.rol, empleadoId: d.empleadoId || null }); if (txt(d.password)) u.password = txt(d.password);
    } else { u = { id: DEMO.helpers.nextId("USR", 3), usuario, nombre, rol: d.rol, password: txt(d.password), estado: "activo", empleadoId: d.empleadoId || null, correo: "" }; DEMO.usuarios.push(u); }
    DEMO.registrarActividad({ tipo: "usuario_actualizado", usuario: actor(), descripcion: `Usuario ${id ? "actualizado" : "creado"}: ${u.usuario} (${u.rol})`, referencia: u.id, metadata: {} });
    return u;
  }
  function alternarUsuario(id) {
    exigir("usuarios.editar");
    const u = DEMO.usuarios.find(x => x.id === id) || fallo("No se encontró el usuario.");
    if (AUTH.sesion() && AUTH.sesion().id === id) fallo("No puedes desactivar tu propio usuario mientras estás conectado.");
    if (u.estado === "activo" && u.rol === "ADMIN" && DEMO.usuarios.filter(x => x.rol === "ADMIN" && x.estado === "activo").length <= 1) fallo("Debe existir al menos un administrador activo.");
    u.estado = u.estado === "activo" ? "inactivo" : "activo";
    DEMO.registrarActividad({ tipo: "usuario_actualizado", usuario: actor(), descripcion: `Usuario ${u.estado === "activo" ? "activado" : "desactivado"}: ${u.usuario}`, referencia: u.id, metadata: {} });
    return u;
  }

  // =========================================================================
  // AUTENTICACIÓN (DEMO)
  // ► REEMPLAZAR por POST /api/auth/login. El backend valida contra un hash
  //   (bcrypt/argon2), aplica límite de intentos real y devuelve un token
  //   (cookie httpOnly o JWT). Aquí solo se compara texto plano DEMO.
  // =========================================================================
  const intentos = {};
  function login(usuario, password) {
    const key = txt(usuario).toLowerCase();
    if (!key || !password) fallo("Escribe tu usuario y tu contraseña.");
    const reg = intentos[key] || { n: 0, hasta: 0 };
    if (reg.hasta > Date.now()) fallo(`Demasiados intentos fallidos. Espera ${Math.ceil((reg.hasta - Date.now()) / 1000)} segundos.`, "BLOQUEADO");
    const u = DEMO.usuarios.find(x => x.usuario === key);
    if (!u || u.password !== password) {
      reg.n += 1; if (reg.n >= 5) { reg.hasta = Date.now() + 30000; reg.n = 0; } intentos[key] = reg;
      fallo("Usuario o contraseña incorrectos.", "CREDENCIALES");
    }
    if (u.estado !== "activo") fallo("Tu usuario está inactivo. Contacta al administrador.", "INACTIVO");
    let negocios = ["autolavado", "barberia"];
    if (u.rol === "EMPLEADO") {
      const emp = DEMO.empleados.find(x => x.id === u.empleadoId);
      if (!emp) fallo("Tu usuario no tiene un negocio asignado. Contacta al administrador.", "SIN_NEGOCIO");
      if (emp.estado !== "activo") fallo("Tu ficha de empleado está inactiva. Contacta al administrador.", "INACTIVO");
      negocios = ["autolavado", "barberia"];       // un solo local: el personal vende en ambos
    }
    intentos[key] = { n: 0, hasta: 0 };
    DEMO.registrarActividad({ tipo: "login", usuario: u.nombre, descripcion: `Inicio de sesión: ${u.nombre} (${u.rol === "ADMIN" ? "Administrador" : "Empleado"})`, referencia: u.id, metadata: {} });
    return { id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol, empleadoId: u.empleadoId, negocios };
  }
  function logout() {
    const s = AUTH.sesion();
    if (s) DEMO.registrarActividad({ tipo: "logout", usuario: s.nombre, descripcion: `Cierre de sesión: ${s.nombre}`, referencia: s.id, metadata: {} });
    return true;
  }

  // =========================================================================
  // ACTIVIDAD
  // =========================================================================
  // =========================================================================
  // CAJA: cierre diario por área (autolavado / barbería)
  //   El período de un cierre va desde el último cierre de esa área hoy (o las 00:00)
  //   hasta el momento del cierre. Se compara el EFECTIVO contado con el efectivo
  //   que el sistema registró en facturas, menos los egresos/retiros del día.
  //   ► Con backend: GET /api/caja/:area/resumen · POST /api/caja/:area/cierre
  // =========================================================================
  function periodoCaja(area) {
    const ini = new Date(); ini.setHours(0, 0, 0, 0);
    const ultimo = DEMO.cierres.find(c => c.area === area && new Date(c.hasta) >= ini);
    return { desde: ultimo ? new Date(ultimo.hasta) : ini, ultimo: ultimo || null };
  }
  function resumenCaja(area) {
    exigir("caja.cerrar");
    if (!NEGOCIOS[area]) fallo("Área de caja no válida.");
    const { desde, ultimo } = periodoCaja(area), hasta = new Date();
    const fs = DEMO.ventas.filter(v => v.negocio === area && new Date(v.fecha) > desde && new Date(v.fecha) <= hasta).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    const resumen = calc.resumenCaja(fs);
    const porUsuario = {};
    fs.filter(f => f.estado === "Completada").forEach(f => { const k = f.usuario || "—"; const o = porUsuario[k] = porUsuario[k] || { usuario: k, facturas: 0, total: 0, efectivo: 0 };
      o.facturas += 1; o.total = calc.redondear(o.total + f.total); o.efectivo = calc.redondear(o.efectivo + f.pagos.filter(p => p.metodo === "efectivo").reduce((a, p) => a + p.monto, 0)); });
    return { area, desde, hasta, ultimoCierre: ultimo ? { id: ultimo.id, hasta: ultimo.hasta, usuario: ultimo.usuario } : null,
      resumen, porUsuario: Object.values(porUsuario).sort((a, b) => b.total - a.total), facturas: fs, tipoCambio: DEMO.configuracion.caja.tipoCambio };
  }
  function cerrarCaja({ area, nio, usd, denominaciones, egresos, nota }) {
    const r = resumenCaja(area), cfg = DEMO.configuracion.caja;
    const num = (v, msg) => { const n = txt(v) === "" ? 0 : Number(v); if (!Number.isFinite(n) || n < 0) fallo(msg); return calc.redondear(n); };
    nio = num(nio, "El efectivo contado en córdobas debe ser un número igual o mayor que cero.");
    usd = num(usd, "El efectivo contado en dólares debe ser un número igual o mayor que cero.");
    const eg = (egresos || []).map((x, i) => {
      const concepto = txt(x.concepto), monto = Number(x.monto);
      if (concepto.length < 3) fallo(`Escribe el concepto del egreso #${i + 1}.`);
      if (!Number.isFinite(monto) || monto <= 0) fallo(`El monto del egreso “${concepto}” debe ser mayor que cero.`);
      return { concepto, monto: calc.redondear(monto) };
    });
    const totalEgresos = calc.redondear(eg.reduce((a, x) => a + x.monto, 0));
    const ventasEfectivo = r.resumen.porMetodo.efectivo.monto;
    const esperado = calc.redondear(ventasEfectivo - totalEgresos);
    const totalNio = calc.redondear(nio + usd * cfg.tipoCambio);
    const diferencia = calc.redondear(totalNio - esperado);
    const estado = Math.abs(diferencia) < 0.01 ? "Cuadrado" : diferencia > 0 ? "Sobrante" : "Faltante";
    nota = txt(nota);
    if (estado !== "Cuadrado" && nota.length < 3) fallo(`Hay un ${estado.toLowerCase()} de ${m(Math.abs(diferencia))}. Escribe una nota explicando la diferencia.`);
    if (!r.resumen.facturas && !r.resumen.anuladas && totalNio === 0 && !eg.length) fallo("No hay ventas ni movimientos de caja para cerrar en este período.");
    const s = AUTH.sesion(), hasta = new Date();
    const cierre = { id: `CC-${String(DEMO.cierres.length + 1).padStart(4, "0")}`, area, fecha: hasta, desde: r.desde, hasta, usuario: s.nombre, usuarioId: s.id,
      resumen: r.resumen, porUsuario: r.porUsuario, ventasEfectivo, esperado,
      contado: { nio, usd, tipoCambio: cfg.tipoCambio, totalNio, denominaciones: denominaciones || null },
      egresos: eg, diferencia, estado, nota, facturas: r.facturas.map(f => f.id) };
    DEMO.cierres.unshift(cierre);
    DEMO.registrarActividad({ tipo: "cierre_caja", negocio: area, usuario: s.nombre, descripcion: `Cierre de caja ${cierre.id} · ${NEGOCIOS[area]} · ${estado}${estado !== "Cuadrado" ? " " + m(Math.abs(diferencia)) : ""}`, referencia: cierre.id, metadata: { diferencia } });
    DEMO.notificar(estado === "Cuadrado" ? "success" : "warning", `Cierre de caja ${NEGOCIOS[area]} (${cierre.id}) por ${s.nombre}: ${estado}${estado !== "Cuadrado" ? " de " + m(Math.abs(diferencia)) : ""}.`);
    emit("caja-cerrada", cierre);
    return cierre;
  }
  function listarCierres({ area = "", estado = "", desde = null, hasta = null } = {}) {
    exigir("cierres.ver");
    return DEMO.cierres.filter(c => (!area || c.area === area) && (!estado || c.estado === estado)
      && (!desde || new Date(c.fecha) >= parseFecha(desde, false)) && (!hasta || new Date(c.fecha) <= parseFecha(hasta, true)));
  }
  // Ventas del usuario conectado en un rango (calendario de "Mi resumen").
  function misVentasRango({ desde, hasta }) {
    exigir("ventas.propias");
    const s = AUTH.sesion();
    return DEMO.ventas.filter(v => (v.usuarioId ? v.usuarioId === s.id : v.usuario === s.nombre) && new Date(v.fecha) >= new Date(desde) && new Date(v.fecha) <= new Date(hasta));
  }

  // Ventas registradas por el usuario conectado (vista "Mis ventas" del personal).
  function misVentas({ periodo = "hoy", negocio = "todos" } = {}) {
    exigir("ventas.propias");
    const s = AUTH.sesion(), ahora = new Date();
    const desde = periodo === "mes" ? new Date(ahora.getFullYear(), ahora.getMonth(), 1) : new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    const propias = DEMO.ventas.filter(v => (v.usuarioId ? v.usuarioId === s.id : v.usuario === s.nombre)
      && new Date(v.fecha) >= desde && (negocio === "todos" || v.negocio === negocio));
    const ok = propias.filter(v => v.estado === "Completada");
    return { desde, hasta: ahora, facturas: propias,
      resumen: { facturas: ok.length, total: calc.redondear(ok.reduce((a, v) => a + v.total, 0)), anuladas: propias.length - ok.length,
        servicios: ok.reduce((a, v) => a + v.lineas.filter(l => l.tipo === "servicio").reduce((x, l) => x + l.cantidad, 0), 0) } };
  }

  function listarActividad({ negocio = "todos", tipo = "", desde = null, hasta = null, q = "", limite = 200 } = {}) {
    const d = desde ? parseFecha(desde, false) : null, h = hasta ? parseFecha(hasta, true) : null;
    const ql = txt(q).toLowerCase();
    const lista = DEMO.actividad.filter(e =>
      (negocio === "todos" || e.negocio === negocio || !e.negocio) &&
      (!tipo || e.tipo === tipo) && (!d || e.fecha >= d) && (!h || e.fecha <= h) &&
      (!ql || e.descripcion.toLowerCase().includes(ql) || (e.referencia || "").toLowerCase().includes(ql) || (e.usuario || "").toLowerCase().includes(ql)));
    return { total: lista.length, eventos: lista.slice(0, limite) };
  }

  // =========================================================================
  // REPORTES
  // =========================================================================
  function parseFecha(v, finDelDia) {
    if (v instanceof Date) { const d = new Date(v); finDelDia ? d.setHours(23, 59, 59, 999) : d.setHours(0, 0, 0, 0); return d; }
    const [y, mo, da] = String(v).split("-").map(Number);
    return finDelDia ? new Date(y, mo - 1, da, 23, 59, 59, 999) : new Date(y, mo - 1, da, 0, 0, 0, 0);
  }
  const isoDia = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  function lunesDe(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
  const fmtCorto = d => d.toLocaleDateString("es-NI", { day: "2-digit", month: "short" });

  function calcularReporte({ negocio = "todos", desde, hasta } = {}) {
    const d = desde ? parseFecha(desde, false) : (() => { const x = new Date(); x.setDate(x.getDate() - 29); x.setHours(0, 0, 0, 0); return x; })();
    const h = hasta ? parseFecha(hasta, true) : new Date();
    if (d > h) fallo("La fecha inicial no puede ser posterior a la fecha final.");
    const enNegocio = x => negocio === "todos" || x.negocio === negocio;
    const todas = DEMO.ventas.filter(v => enNegocio(v) && v.fecha >= d && v.fecha <= h);
    const fs = todas.filter(v => v.estado === "Completada");
    const anuladas = todas.length - fs.length;
    const suma = (arr, f) => calc.redondear(arr.reduce((a, x) => a + f(x), 0));

    // ---- clientes ----
    const idsAtendidos = [...new Set(fs.map(v => v.clienteId))];
    const previos = new Set(DEMO.ventas.filter(v => enNegocio(v) && v.estado === "Completada" && v.fecha < d).map(v => v.clienteId));
    const conteoCliente = {}; fs.forEach(v => { conteoCliente[v.clienteId] = (conteoCliente[v.clienteId] || 0) + 1; });
    const recurrentes = idsAtendidos.filter(id => conteoCliente[id] >= 2 || previos.has(id));
    const nuevos = DEMO.clientes.filter(c => c.creado >= d && c.creado <= h && (negocio === "todos" || c.negocioPreferido === negocio || idsAtendidos.includes(c.id)));
    const gastoPorCliente = {}; fs.forEach(v => { gastoPorCliente[v.clienteId] = calc.redondear((gastoPorCliente[v.clienteId] || 0) + v.total); });
    const topClientes = idsAtendidos.map(id => { const c = DEMO.clientes.find(x => x.id === id); return { id, nombre: c ? c.nombre : (fs.find(v => v.clienteId === id) || {}).clienteNombre, facturas: conteoCliente[id], gasto: gastoPorCliente[id], nuevo: !!c && c.creado >= d, recurrente: recurrentes.includes(id) }; })
      .sort((a, b) => b.gasto - a.gasto);

    // ---- servicios / productos ----
    const porServicio = {};
    DEMO.servicios.filter(s => (negocio === "todos" || s.negocio === negocio) && s.estado === "activo").forEach(s => { porServicio[s.id] = { id: s.id, nombre: s.nombre, negocio: s.negocio, cantidad: 0, ingresos: 0 }; });
    const porProducto = {};
    fs.forEach(v => v.lineas.forEach(l => {
      if (l.tipo === "servicio") { const o = porServicio[l.refId] = porServicio[l.refId] || { id: l.refId, nombre: l.nombre, negocio: v.negocio, cantidad: 0, ingresos: 0 }; o.cantidad += l.cantidad; o.ingresos = calc.redondear(o.ingresos + l.subtotal); }
      else { const o = porProducto[l.refId] = porProducto[l.refId] || { id: l.refId, nombre: l.nombre, cantidad: 0, ingresos: 0 }; o.cantidad += l.cantidad; o.ingresos = calc.redondear(o.ingresos + l.subtotal); }
    }));
    const servicios = Object.values(porServicio);

    // ---- empleados ----
    const porEmp = {};
    fs.forEach(v => {
      const parts = v.empleados && v.empleados.length ? v.empleados : [{ id: v.empleadoId, nombre: v.empleadoNombre }];
      parts.forEach(pp => {   // con varios participantes, cada uno suma la factura y su parte del ingreso
        const o = porEmp[pp.id || pp.nombre] = porEmp[pp.id || pp.nombre] || { id: pp.id, nombre: pp.nombre, negocio: v.negocio, facturas: 0, servicios: 0, ingresos: 0 };
        o.facturas += 1; o.ingresos = calc.redondear(o.ingresos + v.total / parts.length);
        o.servicios += v.lineas.filter(l => l.tipo === "servicio").reduce((a, l) => a + l.cantidad, 0);
      });
    });

    // ---- vehículos ----
    const vehTipos = {}, placas = new Set(); let conVehiculo = 0;
    fs.filter(v => v.vehiculo).forEach(v => { conVehiculo += 1; vehTipos[v.vehiculo.tipo] = (vehTipos[v.vehiculo.tipo] || 0) + 1; placas.add(v.vehiculo.placa || v.id); });

    // ---- pagos ----
    const pagos = Object.values(DEMO.METODOS).map(mt => ({ metodo: mt.key, label: mt.label, monto: 0, facturas: 0 }));
    fs.forEach(v => v.pagos.forEach(p => { const o = pagos.find(x => x.metodo === p.metodo); o.monto = calc.redondear(o.monto + p.monto); o.facturas += 1; }));
    const mixtas = fs.filter(v => v.pagos.length > 1);
    const combos = {};
    mixtas.forEach(v => { const k = v.pagos.map(p => calc.etiquetaMetodo(p.metodo)).sort().join(" + "); const o = combos[k] = combos[k] || { combinacion: k, cantidad: 0, monto: 0 }; o.cantidad += 1; o.monto = calc.redondear(o.monto + v.total); });

    // ---- fidelidad / saldo ----
    const conSaldo = fs.filter(v => v.pagos.some(p => p.metodo === "fidelidad"));
    const saldoUsado = suma(conSaldo, v => v.pagos.find(p => p.metodo === "fidelidad").monto);
    const movs = []; DEMO.tarjetas.forEach(t => t.movimientos.forEach(mv => { if (mv.fecha >= d && mv.fecha <= h && (negocio === "todos" || mv.negocio === negocio)) movs.push(mv); }));
    const sumMov = tipo => calc.redondear(movs.filter(x => x.tipo === tipo).reduce((a, x) => a + x.monto, 0));
    const cfgFid = DEMO.configuracion.fidelidad;
    const fidelidad = {
      saldoUsado, facturasConSaldo: conSaldo.length, clientesUsaron: new Set(conSaldo.map(v => v.clienteId)).size,
      promedioSaldo: conSaldo.length ? calc.redondear(saldoUsado / conSaldo.length) : 0,
      recargas: sumMov("recarga"), nRecargas: movs.filter(x => x.tipo === "recarga").length,
      bonos: sumMov("acumulacion"), canjes: movs.filter(x => x.tipo === "canje").length,
      tarjetas: DEMO.tarjetas.length, saldoEnTarjetas: calc.redondear(DEMO.tarjetas.reduce((a, t) => a + t.saldo, 0)),
      recompensasDisponibles: DEMO.clientes.filter(c => c.fidelidad.dias >= c.fidelidad.meta).length,
      proximos: DEMO.clientes.filter(c => c.fidelidad.dias === c.fidelidad.meta - 1).length, premio: cfgFid.premio,
      // Lealtad por programas y membresías (sin dinero en tarjetas)
      ...(() => {
        const lp = []; fs.forEach(v => v.lineas.forEach(l => { if (l.premio) lp.push({ l, v }); }));
        const est = DEMO.clientes.map(c => calc.estadoLealtad(c));
        const mbs = DEMO.membresias.filter(x => !x.anulada);
        const vendidas = fs.filter(v => v.membresiaVendida);
        return {
          premiosDescuento: lp.filter(x => x.l.descPct < 100).length, premiosGratis: lp.filter(x => x.l.descPct >= 100).length,
          montoPremios: calc.redondear(lp.reduce((a, x) => a + x.l.descuento, 0)), canjes: lp.length,
          descuentosDisponibles: est.filter(e => e.some(x => x.disp1)).length, recompensasDisponibles: est.filter(e => e.some(x => x.disp2)).length,
          proximos: est.filter(e => e.some(x => x.lavadas === x.programa.meta2 - 1)).length,
          lavadosPremium: fs.reduce((a, v) => a + Object.values((v.lealtad || {}).sumas || {}).reduce((x, n) => x + n, 0), 0),
          membresiasVendidas: vendidas.length, ingresosMembresias: suma(vendidas, v => v.total),
          membresiasActivas: mbs.filter(x => ["Activa", "Por vencer"].includes(calc.estadoMembresia(x))).length,
          usosMembresia: fs.reduce((a, v) => a + v.lineas.filter(l => l.membresia).length, 0),
          descuentoPct: 40, metaDescuento: 5, tarjetas: mbs.length,
        };
      })(),
    };

    // ---- descuentos ----
    const porPromo = {};
    fs.filter(v => v.descuento > 0).forEach(v => { const o = porPromo[v.promocion || "Descuento"] = porPromo[v.promocion || "Descuento"] || { nombre: v.promocion || "Descuento", cantidad: 0, monto: 0 }; o.cantidad += 1; o.monto = calc.redondear(o.monto + v.descuento); });

    // ---- consumo de productos ----
    const cons = {};
    fs.forEach(v => (v.consumos || []).forEach(c => { const o = cons[c.productoId] = cons[c.productoId] || { productoId: c.productoId, nombre: c.nombre, unidad: c.unidad, usos: 0, vendidas: 0 }; if (c.tipo === "venta") o.vendidas += c.cantidad; else o.usos += c.cantidad; }));
    const consumos = Object.values(cons).map(o => { const p = DEMO.productos.find(x => x.id === o.productoId); return { ...o, total: o.usos + o.vendidas, stock: p ? p.stock : null, stockMinimo: p ? p.stockMinimo : null, bajo: p ? p.stock <= p.stockMinimo : false, negocio: p ? p.negocio : null }; })
      .sort((a, b) => b.total - a.total);

    // ---- horarios ----
    const horas = Array.from({ length: 24 }, (_, i) => ({ hora: i, transacciones: 0, ventas: 0 }));
    const dias = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(n => ({ dia: n, transacciones: 0, ventas: 0 }));
    fs.forEach(v => { const hh = horas[v.fecha.getHours()]; hh.transacciones += 1; hh.ventas = calc.redondear(hh.ventas + v.total); const dd = dias[(v.fecha.getDay() + 6) % 7]; dd.transacciones += 1; dd.ventas = calc.redondear(dd.ventas + v.total); });

    // ---- series por día / semana / mes ----
    const mapaDia = {}, mapaSem = {}, mapaMes = {};
    const acum = (mapa, clave, label, v) => { const o = mapa[clave] = mapa[clave] || { clave, label, ventas: 0, transacciones: 0 }; o.ventas = calc.redondear(o.ventas + v.total); o.transacciones += 1; };
    fs.forEach(v => {
      acum(mapaDia, isoDia(v.fecha), fmtCorto(v.fecha), v);
      const l = lunesDe(v.fecha); acum(mapaSem, isoDia(l), "Sem " + fmtCorto(l), v);
      acum(mapaMes, `${v.fecha.getFullYear()}-${String(v.fecha.getMonth() + 1).padStart(2, "0")}`, v.fecha.toLocaleDateString("es-NI", { month: "short", year: "numeric" }), v);
    });
    const ndias = Math.round((h - d) / 86400000) + 1;
    if (ndias <= 92) for (let i = 0; i < ndias; i++) { const x = new Date(d); x.setDate(x.getDate() + i); const k = isoDia(x); if (!mapaDia[k]) mapaDia[k] = { clave: k, label: fmtCorto(x), ventas: 0, transacciones: 0 }; }
    const ord = mapa => Object.values(mapa).sort((a, b) => a.clave.localeCompare(b.clave));

    const porNegocio = Object.keys(NEGOCIOS).filter(n => negocio === "todos" || n === negocio).map(n => {
      const arr = fs.filter(v => v.negocio === n); const ventas = suma(arr, v => v.total);
      return { negocio: n, nombre: NEGOCIOS[n], ventas, transacciones: arr.length, ticket: arr.length ? calc.redondear(ventas / arr.length) : 0 };
    });

    const cajaMap = {};
    fs.forEach(v => { const k = isoDia(v.fecha); const o = cajaMap[k] = cajaMap[k] || { clave: k, label: fmtCorto(v.fecha), facturas: 0, total: 0, efectivo: 0, tarjeta: 0, transferencia: 0, fidelidad: 0 };
      o.facturas += 1; o.total = calc.redondear(o.total + v.total); v.pagos.forEach(p => { o[p.metodo] = calc.redondear(o[p.metodo] + p.monto); }); });
    const anLista = todas.filter(v => v.estado !== "Completada").map(v => ({ id: v.id, fecha: v.fecha, negocio: v.negocio, cliente: v.clienteNombre, total: v.total, usuario: (v.anulacion || {}).usuario || "—", motivo: (v.anulacion || {}).motivo || "Sin motivo registrado" }));
    const ventasTotales = suma(fs, v => v.total);
    return {
      caja: Object.values(cajaMap).sort((a, b) => b.clave.localeCompare(a.clave)),
      anulaciones: { lista: anLista, monto: calc.redondear(anLista.reduce((a, x) => a + x.total, 0)), tasa: todas.length ? anLista.length / todas.length * 100 : 0 },
      filtro: { negocio, desde: d, hasta: h },
      resumen: {
        ventasTotales, transacciones: fs.length, anuladas, ticketPromedio: fs.length ? calc.redondear(ventasTotales / fs.length) : 0,
        serviciosRealizados: fs.reduce((a, v) => a + v.lineas.filter(l => l.tipo === "servicio").reduce((b, l) => b + l.cantidad, 0), 0),
        productosVendidos: fs.reduce((a, v) => a + v.lineas.filter(l => l.tipo === "producto").reduce((b, l) => b + l.cantidad, 0), 0),
        productosConsumidos: consumos.reduce((a, c) => a + c.total, 0),
        descuentos: suma(fs, v => v.descuento), subtotal: suma(fs, v => v.subtotal),
        clientesAtendidos: idsAtendidos.length, clientesNuevos: nuevos.length, clientesRecurrentes: recurrentes.length,
        vehiculosAtendidos: conVehiculo, vehiculosUnicos: placas.size,
      },
      facturas: fs.slice().sort((a, b) => b.fecha - a.fecha), todasLasFacturas: todas.slice().sort((a, b) => b.fecha - a.fecha),
      porNegocio, serie: { dia: ord(mapaDia), semana: ord(mapaSem), mes: ord(mapaMes) },
      servicios, productos: Object.values(porProducto).sort((a, b) => b.cantidad - a.cantidad),
      empleados: Object.values(porEmp).sort((a, b) => b.ingresos - a.ingresos),
      vehiculos: Object.entries(vehTipos).map(([tipo, cantidad]) => ({ tipo, cantidad })).sort((a, b) => b.cantidad - a.cantidad),
      pagos, mixtos: { cantidad: mixtas.length, monto: suma(mixtas, v => v.total), porcentaje: fs.length ? mixtas.length / fs.length * 100 : 0, combinaciones: Object.values(combos).sort((a, b) => b.cantidad - a.cantidad) },
      fidelidad, descuentos: { total: suma(fs, v => v.descuento), facturas: fs.filter(v => v.descuento > 0).length, porPromocion: Object.values(porPromo).sort((a, b) => b.monto - a.monto) },
      consumos, horarios: horas, diasSemana: dias, topClientes, nuevos: nuevos.map(c => ({ id: c.id, nombre: c.nombre, negocio: c.negocioPreferido, creado: c.creado })),
    };
  }

  // Dashboard: período seleccionado + comparación con el período anterior equivalente.
  function dashboard({ negocio = "todos", periodo = "mes", desde, hasta } = {}) {
    const ahora = new Date(); let d = new Date(ahora), h = new Date(ahora);
    d.setHours(0, 0, 0, 0);
    if (periodo === "hoy") { /* hoy completo */ }
    else if (periodo === "semana") d.setDate(d.getDate() - 6);
    else if (periodo === "mes") d.setDate(d.getDate() - 29);
    else if (periodo === "anio") d.setDate(d.getDate() - 364);
    else if (periodo === "personalizado") { if (!desde || !hasta) fallo("Elige la fecha inicial y final del período."); d = parseFecha(desde, false); h = parseFecha(hasta, true); if (d > h) fallo("La fecha inicial no puede ser posterior a la final."); }
    const dur = h - d + 1, dPrev = new Date(d - dur), hPrev = new Date(d - 1);
    const actual = calcularReporte({ negocio, desde: d, hasta: h });
    const anterior = calcularReporte({ negocio, desde: dPrev, hasta: hPrev });
    const ini = new Date(); ini.setHours(0, 0, 0, 0);
    const mes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    const hoy = calcularReporte({ negocio, desde: ini, hasta: ahora }), delMes = calcularReporte({ negocio, desde: mes, hasta: ahora });
    return { periodo: { desde: d, hasta: h }, actual, anterior, hoy: hoy.resumen, mes: delMes.resumen,
      productosDisponibles: DEMO.productos.filter(p => p.stock > p.stockMinimo).length, productosTotal: DEMO.productos.length,
      stockBajo: DEMO.productos.filter(p => p.stock <= p.stockMinimo && (negocio === "todos" || p.negocio === negocio)),
      fidelidad: actual.fidelidad, actividad: listarActividad({ negocio, limite: 8 }).eventos };
  }

  // ------------------------------------------------------------------ superficie pública
  const nucleo = {
    crearFactura, anularFactura, canjearRecompensa, vistaTarjeta, revisarStock, calcularReporte, listarActividad,
  };
  return {
    config: CONFIG, on, emit,
    auth: { login: (u, p) => llamar(() => login(u, p)), logout: () => llamar(() => logout()) },
    clientes: { crear: d => llamar(() => crearCliente(d)), actualizar: (id, d) => llamar(() => actualizarCliente(id, d)), eliminar: id => llamar(() => eliminarCliente(id)) },
    facturas: { crear: p => llamar(() => crearFactura(p)), anular: (id, motivo) => llamar(() => anularFactura(id, motivo)) },
    tarjetas: {
      buscarPorUid: uid => llamar(() => { const t = tarjetaPorUid(uid); if (!t) fallo("Tarjeta no registrada en el sistema. Verifica que sea una tarjeta de El Rápido.", "NO_ENCONTRADA"); return vistaTarjeta(t, 15); }),
      obtenerPorCliente: id => llamar(() => { const t = tarjetaDe(id); if (!t) fallo("Este cliente no tiene tarjeta.", "NO_ENCONTRADA"); return vistaTarjeta(t, 40); }),
      canjearRecompensa: id => llamar(() => canjearRecompensa(id)), cambiarEstado: (id, e) => llamar(() => cambiarEstadoTarjeta(id, e)),
    },
    inventario: { registrarMovimiento: p => llamar(() => movimientoInventario(p)), guardarProducto: (d, id) => llamar(() => guardarProducto(d, id)), eliminarProducto: id => llamar(() => eliminarProducto(id)) },
    eliminar: { servicio: id => llamar(() => eliminarServicio(id)), promocion: id => llamar(() => eliminarPromocion(id)), empleado: id => llamar(() => eliminarEmpleado(id)), usuario: id => llamar(() => eliminarUsuario(id)) },
    catalogos: {
      guardarServicio: (d, id) => llamar(() => guardarServicio(d, id)), alternarServicio: id => llamar(() => alternarServicio(id)),
      guardarPromocion: (d, id) => llamar(() => guardarPromocion(d, id)), alternarPromocion: id => llamar(() => alternarPromocion(id)),
      guardarEmpleado: (d, id) => llamar(() => guardarEmpleado(d, id)), alternarEmpleado: id => llamar(() => alternarEmpleado(id)),
    },
    configuracion: { guardar: (s, d) => llamar(() => guardarConfiguracion(s, d)) },
    usuarios: { guardar: (d, id) => llamar(() => guardarUsuario(d, id)), alternar: id => llamar(() => alternarUsuario(id)) },
    reportes: { calcular: f => llamar(() => { exigir("reportes.ver"); return calcularReporte(f); }), dashboard: f => llamar(() => { exigir("dashboard.ver"); return dashboard(f); }) },
    actividad: { listar: f => llamar(() => { exigir("actividad.ver"); return listarActividad(f); }) },
    ventas: { mias: f => llamar(() => misVentas(f)), miasRango: f => llamar(() => misVentasRango(f)) },
    lealtad: { guardarPrograma: (id, d) => llamar(() => guardarProgramaLealtad(id, d)), ajustar: d => llamar(() => ajustarLealtad(d)) },
    membresias: { cotizar: d => llamar(() => cotizarMembresia(d)), vender: d => llamar(() => venderMembresia(d)), guardarPlan: (d, id) => llamar(() => guardarPlan(d, id)) },
    caja: { resumen: area => llamar(() => resumenCaja(area)), cerrar: d => llamar(() => cerrarCaja(d)), listar: f => llamar(() => listarCierres(f)) },
    // Lecturas locales síncronas (con backend: se cargarían a un store y se refrescarían por evento).
    sync: { vistaTarjeta: id => { const t = tarjetaDe(id); return t ? vistaTarjeta(t, 40) : null; }, revisarStock, usosDisponibles, tarjetaPorUid, normalizarUid, tarjetaDe },
    _nucleo: nucleo,
    utils: { m, NEGOCIOS, parseFecha, isoDia },
  };
})();

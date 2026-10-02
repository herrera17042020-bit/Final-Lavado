/* ==========================================================================
   pos-core.js — Motor de venta compartido (panel + terminales).

   Una FACTURA = una transacción con varias líneas (servicios y/o productos),
   un cliente, un empleado, y uno o varios pagos (pago mixto).
   Este módulo solo arma la factura y muestra la vista previa; el registro real
   (validar, cobrar, fidelidad, inventario, actividad) lo hace API.facturas.crear.
   ► Con backend: API.facturas.crear se convierte en POST /api/facturas.
   ========================================================================== */

const POS_CORE = (() => {
  const { calc } = DEMO;
  const e = APP.escapeHtml, money = APP.money;
  const instancias = new Set();

  const metodosHabilitados = () => Object.keys(DEMO.METODOS).filter(k => DEMO.configuracion.metodosPago[k]);
  const num = v => { const n = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };

  // ======================================================================
  function montar(root, { negocio, modo = "panel" }) {
    const s = { negocio, modo, barberAbierto: false, cliente: null, empleadoIds: [], vehiculo: vacioVeh(), lineas: [], promoId: "", metodo: "", mixto: {}, recibido: "", tab: "servicios", busqueda: "" };
    function vacioVeh() { return { tipo: "", placa: "", marca: "", modelo: "", color: "" }; }
    const inst = { root, s, render, reset };
    instancias.add(inst);

    // Empleado por defecto: el usuario conectado, si es empleado de este negocio.
    function empleadoDefecto() {
      const u = AUTH.sesion(); const emp = u && u.empleadoId && DEMO.empleados.find(x => x.id === u.empleadoId);
      if (emp && emp.negocio === s.negocio && emp.estado === "activo") return emp.id;
      const emps = DEMO.empleados.filter(x => x.negocio === s.negocio && x.estado === "activo");
      return emps.length === 1 ? emps[0].id : null;   // si hay un solo empleado, queda elegido
    }
    // Efectivo queda seleccionado por defecto: la mayoría de ventas solo requiere tocar "Finalizar".
    const metodoDefecto = () => metodosHabilitados().includes("efectivo") ? "efectivo" : "";
    function reset(completo = true) {
      Object.assign(s, { cliente: null, vehiculo: vacioVeh(), lineas: [], promoId: "", metodo: metodoDefecto(), mixto: {}, recibido: "", busqueda: "" });
      if (completo) { const d = empleadoDefecto(); s.empleadoIds = d ? [d] : []; }
    }
    reset();

    // ---------------- cálculos ----------------
    const tipoVeh = () => s.negocio === "autolavado" ? s.vehiculo.tipo || null : null;
    const clienteObj = () => s.cliente && DEMO.clientes.find(c => c.id === s.cliente) || null;
    const tarjeta = () => null;   // sin saldo ni tarjetas: la lealtad va por programas y membresías
    const promo = () => DEMO.promociones.find(p => p.id === s.promoId) || null;
    // Lealtad y membresías del cliente (sin dinero).
    function chipLealtad(c) {
      const est = calc.estadoLealtad(c), mbs = calc.membresiasVigentes(c.id);
      return est.map(x => `<span class="saldo-chip">${x.programa.icono} ${e(x.programa.nombre.replace("Programa ", ""))}: ${x.lavadas}/${x.programa.meta2}</span>`).join(" ")
        + (calc.premiosDisponibles(c).length ? ` <span class="badge badge--success">🎁 Premio disponible</span>` : "")
        + mbs.map(mb => ` <span class="badge badge--info" title="${e(mb.planNombre)} · solo para el vehículo ${e(mb.placa)}">🎫 ${e(mb.servicioNombre)} · ${e(mb.vehiculoTipo)} ${e(mb.placa)} · ${mb.usados}/${mb.lavados}</span>`).join("");
    }
    // Línea de POS: { tipo, refId, cantidad, modo } — modo "" | "mem:<id>" | "premio:<prog>:<nivel>:<idx>"
    const lineasCalc = () => s.lineas.map(l => {
      if (l.tipo === "otro") return { tipo: "otro", refId: l.refId, nombre: l.nombre, cantidad: l.cantidad, precio: l.precio, modo: "", etiqueta: "" };
      const src = l.tipo === "servicio" ? DEMO.servicios.find(x => x.id === l.refId) : DEMO.productos.find(x => x.id === l.refId);
      const precio = l.tipo === "servicio" ? calc.precioServicio(src, tipoVeh()) : src.precioVenta;
      const base = { tipo: l.tipo, refId: l.refId, nombre: src.nombre, cantidad: l.cantidad, precio, modo: l.modo || "" };
      if ((l.modo || "").startsWith("mem:")) { const mb = DEMO.membresias.find(x => x.id === l.modo.slice(4)); return { ...base, precio: 0, precioRef: precio, membresia: mb.id, etiqueta: `🎫 Pago con membresía ${mb.id} (placa ${mb.placa}) · uso ${mb.usados + 1}/${mb.lavados} · quedarán ${mb.lavados - mb.usados - 1}` }; }
      if ((l.modo || "").startsWith("premio:")) { const [, pid, nv, ix] = l.modo.split(":"); const pg = DEMO.configuracion.lealtad.programas.find(x => x.id === pid); const op = +nv === 1 ? pg.opciones1[+ix] : pg.premio2;
        return { ...base, descPct: op.tipo === "gratis" ? 100 : op.pct, etiqueta: `🎁 Premio ${pg.nombre.replace("Programa ", "")}: ${calc.nombrePremio(op)}` }; }
      return base;
    });
    const totales = () => calc.totales(lineasCalc(), promo());

    // ---------------- estructura ----------------
    function render() {
      const term = s.modo === "terminal";
      root.innerHTML = `
      <div class="pos-grid ${term ? "pos--terminal" : ""}">
        <div class="pos-col">
          <div class="card pos-step"><div class="pos-step__head"><span class="pos-step__num">1</span><h4>Cliente</h4></div><div data-p="cliente"></div></div>
          <div class="card pos-step"><div class="pos-step__head"><span class="pos-step__num">2</span><h4>${s.negocio === "barberia" ? "Barbero" : "Empleado"}${s.negocio === "autolavado" ? " y vehículo" : ""}</h4></div><div data-p="detalle"></div></div>
          <div class="card pos-step"><div class="pos-step__head"><span class="pos-step__num">3</span><h4>Servicios y productos</h4></div><div data-p="catalogo"></div></div>
        </div>
        <div class="pos-col pos-col--summary"><div class="card pos-summary">
          <h4 style="margin-bottom:4px">Factura</h4>
          <div data-p="lineas"></div><div data-p="totales"></div>
          <div class="pos-step__head" style="margin-top:14px"><h4 style="font-size:14px">Forma de pago</h4></div>
          <div data-p="pago"></div><div data-p="accion"></div>
        </div></div>
      </div>`;
      renderCliente(); renderDetalle(); renderCatalogo(); renderResumen();
    }
    const $p = n => root.querySelector(`[data-p="${n}"]`);

    // ---------------- 1. cliente ----------------
    function renderCliente() {
      const c = clienteObj(), box = $p("cliente");
      if (c) {
        box.innerHTML = `<div class="pos-cliente-elegido">
          <div class="avatar">${e(APP.iniciales(c.nombre))}</div>
          <div style="flex:1;min-width:0"><strong>${e(c.nombre)}</strong> ${APP.badge(c.tipo)}
            <div class="small text-muted">${e(c.telefono)} · ${c.visitas} visitas</div>
            ${s.negocio === "autolavado" ? `<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px">${chipLealtad(c)}</div>` : ""}</div>
          <button class="btn btn--ghost btn--sm" data-act="cambiar-cliente">Cambiar</button></div>`;
      } else {
        box.innerHTML = `<input type="text" data-in="busqueda" placeholder="Buscar por nombre o teléfono..." value="${e(s.busqueda)}" autocomplete="off">
          <div class="pos-cliente-resultados" data-p="resultados"></div>`;
        renderResultados();
      }
    }
    function renderResultados() {
      const box = $p("resultados"); if (!box) return;
      const q = s.busqueda.trim().toLowerCase();
      const lista = DEMO.clientes.filter(c => c.estado === "activo" && (!q || c.nombre.toLowerCase().includes(q) || c.telefono.includes(q) || (c.tarjetaId || "").toLowerCase().includes(q))).slice(0, 6);
      box.innerHTML = lista.map(c => { const mbs = calc.membresiasVigentes(c.id).length, pr = calc.premiosDisponibles(c).length; return `<div class="pos-cliente-item" data-act="elegir-cliente" data-id="${c.id}" tabindex="0">
          <div class="avatar avatar--sm">${e(APP.iniciales(c.nombre))}</div>
          <div style="flex:1"><strong>${e(c.nombre)}</strong><div class="small text-muted">${e(c.telefono)}</div></div>
          ${mbs ? `<span class="saldo-chip" title="Membresías vigentes">🎫 ${mbs}</span>` : ""}${pr ? `<span class="saldo-chip" title="Premios disponibles">🎁 ${pr}</span>` : ""}</div>`; }).join("")
        + `<div class="pos-cliente-item pos-cliente-item--nuevo" data-act="nuevo-cliente" tabindex="0">＋ Registrar nuevo cliente${q ? ` “${e(s.busqueda.trim())}”` : ""}</div>`
        + (!lista.length ? `<div class="empty-mini">No hay clientes que coincidan con la búsqueda.</div>` : "");
    }
    function elegirCliente(id) {
      s.cliente = id; if (s.metodo === "mixto" || !s.metodo) s.metodo = metodoDefecto(); s.mixto = {};
      const c = clienteObj();
      if (s.negocio === "autolavado" && c && c.vehiculos.length) s.vehiculo = { ...vacioVeh(), ...c.vehiculos[0] };
      if (s.negocio === "autolavado" && !DEMO.tiposVehiculo.includes(s.vehiculo.tipo)) s.vehiculo.tipo = "";
      renderCliente(); renderDetalle(); renderCatalogo(); renderResumen();
    }
    function modalNuevoCliente() {
      const pre = s.busqueda.trim();
      APP.openModal("Registrar nuevo cliente", `<form id="pos-nc" novalidate>
        <div class="field"><label>Nombre completo *</label><input name="nombre" value="${e(/\d/.test(pre) ? "" : pre)}" maxlength="80"></div>
        <div class="field"><label>Teléfono</label><input name="telefono" placeholder="8888-8888" value="${e(/\d/.test(pre) ? pre : "")}"></div>
        <div class="msg msg--danger hidden" id="pos-nc-err"></div>
        <div class="form-actions"><button type="button" class="btn btn--ghost" data-cancel>Cancelar</button><button class="btn btn--primary" type="submit">Guardar y seleccionar</button></div></form>`, { size: "modal--sm" });
      const f = document.getElementById("pos-nc");
      f.querySelector("[data-cancel]").onclick = APP.closeModal;
      f.onsubmit = async ev => {
        ev.preventDefault();
        const r = await APP.ejecutar(f.querySelector("[type=submit]"), () => API.clientes.crear({ nombre: f.nombre.value, telefono: f.telefono.value, negocioPreferido: s.negocio }), "Guardando…");
        if (!r.ok) { const er = document.getElementById("pos-nc-err"); er.textContent = r.error; er.classList.remove("hidden"); return; }
        APP.closeModal(); APP.toast("success", "Cliente registrado", r.data.cliente.nombre); elegirCliente(r.data.cliente.id);
      };
    }

    // Producto nuevo (venta libre): nombre + precio + cantidad → línea de la factura.
    function modalProductoNuevo() {
      APP.openModal("Vender producto nuevo", `<form id="pos-pn" novalidate>
        <div class="field"><label>Nombre del producto *</label><input name="nombre" maxlength="60" placeholder="Ej.: Ambientador de pino" autocomplete="off"></div>
        <div class="form-grid"><div class="field"><label>Precio (C$) *</label><input name="precio" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00"></div>
        <div class="field"><label>Cantidad</label><input name="cantidad" type="number" min="1" max="99" value="1" inputmode="numeric"></div></div>
        <div class="msg msg--danger hidden" id="pos-pn-err"></div>
        <div class="form-actions"><button type="button" class="btn btn--ghost" data-cancel>Cancelar</button><button class="btn btn--primary" type="submit">Agregar a la factura</button></div></form>`, { size: "modal--sm" });
      const f = document.getElementById("pos-pn"); f.nombre.focus();
      f.querySelector("[data-cancel]").onclick = APP.closeModal;
      f.onsubmit = ev => {
        ev.preventDefault();
        const nombre = f.nombre.value.trim().replace(/\s+/g, " "), precio = num(f.precio.value), cant = parseInt(f.cantidad.value, 10) || 1;
        const er = document.getElementById("pos-pn-err"), err = m => { er.textContent = m; er.classList.remove("hidden"); };
        if (nombre.length < 2) return err("Escribe el nombre del producto.");
        if (!(precio > 0)) return err("Escribe un precio mayor que cero.");
        if (cant < 1 || cant > 99) return err("La cantidad debe estar entre 1 y 99.");
        const refId = `OTRO:${nombre.toLowerCase()}|${calc.redondear(precio)}`, ya = s.lineas.find(l => l.tipo === "otro" && l.refId === refId);
        if (ya) ya.cantidad = Math.min(ya.cantidad + cant, 99); else s.lineas.push({ tipo: "otro", refId, nombre, precio: calc.redondear(precio), cantidad: cant });
        APP.closeModal(); APP.toast("success", "Agregado a la factura", `${cant} × ${nombre} · ${money(precio * cant)}`); cambioLineas();
      };
    }

    // ---------------- 2. empleado y vehículo ----------------
    function renderDetalle() {
      const emps = DEMO.empleados.filter(x => x.negocio === s.negocio && x.estado === "activo");
      // Varios empleados pueden participar: tocar agrega, tocar otra vez quita.
      let h = `<div class="pos-emp-ayuda">${s.empleadoIds.length ? `<strong>${s.empleadoIds.length}</strong> seleccionado${s.empleadoIds.length === 1 ? "" : "s"} · ` : ""}Toca para agregar o quitar ${s.negocio === "barberia" ? "barberos" : "empleados"} (puedes elegir varios)</div>
        <div class="pay-methods">${emps.map(x => { const on = s.empleadoIds.includes(x.id); return `<button type="button" class="pay-method emp-btn ${on ? "active" : ""}" data-act="elegir-emp" data-id="${x.id}" aria-pressed="${on}"><span>${on ? "✓ " : ""}${e(x.nombre)}<small>${e(x.cargo)}</small></span></button>`; }).join("")}</div>`;
      if (s.negocio === "autolavado") {
        // Vehículo: solo TIPO y PLACA. Vehículos guardados y tipos como botones (un toque).
        const c = clienteObj(), v = s.vehiculo, np = calc.normPlaca;
        const conMem = x => c && calc.membresiasVigentes(c.id).some(m => np(m.placa) === np(x.placa));
        h += `<div class="pos-veh"><div class="pos-veh__label">Vehículo</div>
          ${c && c.vehiculos.length ? `<div class="pos-veh__guardados">${c.vehiculos.map((x, i) => `<button type="button" class="veh-chip ${np(x.placa) && np(x.placa) === np(v.placa) && x.tipo === v.tipo ? "active" : ""}" data-act="veh-guardado" data-i="${i}"><strong>${e(x.placa || "s/placa")}</strong><small>${e(x.tipo)}${conMem(x) ? " · 🎫 membresía" : ""}</small></button>`).join("")}</div>` : ""}
          <div class="pos-veh__tipos">${DEMO.tiposVehiculo.map(t => `<button type="button" class="veh-tipo ${v.tipo === t ? "active" : ""}" data-act="veh-tipo" data-v="${e(t)}">${e(t)}</button>`).join("")}</div>
          <div class="field" style="margin-top:8px"><label>Placa</label><input data-veh="placa" value="${e(v.placa)}" maxlength="10" placeholder="M123456" autocomplete="off" style="text-transform:uppercase"></div></div>`;
      }
      $p("detalle").innerHTML = h;
    }

    // ---------------- 3. catálogo ----------------
    const cantidadDe = (tipo, id) => s.lineas.filter(l => l.tipo === tipo && l.refId === id).reduce((a, l) => a + l.cantidad, 0);
    function renderCatalogo() {
      const vendibles = DEMO.productos.filter(p => p.negocio === s.negocio && p.precioVenta);
      const tabs = `<div class="pos-catalogo-tabs"><button data-act="tab" data-tab="servicios" class="${s.tab === "servicios" ? "active" : ""}">Servicios</button><button data-act="tab" data-tab="productos" class="${s.tab === "productos" ? "active" : ""}">Productos</button></div>`;
      let cards, agrupado = "";
      if (s.tab === "productos") {
        const otros = s.lineas.filter(l => l.tipo === "otro");
        cards = `<button type="button" class="service-card service-card--nuevo" data-act="otro-nuevo"><div class="service-card__name">＋ Producto nuevo</div><div class="service-card__price">Nombre y precio</div></button>`
          + otros.map(l => `<button type="button" class="service-card service-card--active" data-act="otro-mas" data-ref="${e(l.refId)}"><span class="service-card__qty">${l.cantidad}</span><div class="service-card__name">${e(l.nombre)}</div><div class="service-card__price">${money(l.precio)}</div></button>`).join("")
          + vendibles.map(p => { const q = cantidadDe("producto", p.id);
          return `<button type="button" class="service-card ${q ? "service-card--active" : ""} ${p.stock === 0 ? "service-card--nostock" : ""}" data-act="add" data-tipo="producto" data-id="${p.id}" ${p.stock === 0 ? "disabled" : ""}>
            ${q ? `<span class="service-card__qty">${q}</span>` : ""}<div class="service-card__name">${e(p.nombre)}</div>
            ${p.stock === 0 ? `<div class="service-card__desc">Sin stock</div>` : ""}<div class="service-card__price">${money(p.precioVenta)}</div></button>`; }).join("");
      } else {
        const svs = DEMO.servicios.filter(x => x.negocio === s.negocio && x.estado === "activo");
        const tv = tipoVeh();
        const card = x => { const q = cantidadDe("servicio", x.id), pTv = tv && x.preciosVehiculo ? calc.precioServicio(x, tv) : null;
          const conPrecio = calc.tienePrecio(x) && (pTv === null || pTv > 0);
          const precio = !conPrecio ? `<span class="service-card__pendiente">Precio por definir${pTv === 0 && calc.tienePrecio(x) ? " para " + e(tv) : ""}</span>`
            : x.preciosVehiculo ? (tv ? `${money(calc.precioServicio(x, tv))} <small class="service-card__veh">${e(tv)}</small>` : `<small class="service-card__veh">Desde</small> ${money(x.precioBase)}`)
            : money(x.precioBase);
          return `<button type="button" class="service-card ${q ? "service-card--active" : ""} ${conPrecio ? "" : "service-card--nostock"}" data-act="add" data-tipo="servicio" data-id="${x.id}" ${conPrecio ? "" : "disabled title=\"El administrador debe asignar el precio en Servicios\""}>
            ${q ? `<span class="service-card__qty">${q}</span>` : ""}<div class="service-card__name">${e(x.nombre)}</div>
            <div class="service-card__price">${precio}</div></button>`; };
        const lavados = svs.filter(x => x.categoria === "lavado"), extras = svs.filter(x => x.categoria === "extra"), otros = svs.filter(x => !x.categoria);
        if (lavados.length || extras.length) {
          const aviso = s.negocio === "autolavado" && !tv && lavados.some(x => x.preciosVehiculo) ? `<div class="msg msg--info" style="margin:0 0 10px">Elige el <strong>tipo de vehículo</strong> (paso 2) para ver el precio exacto del lavado.</div>` : "";
          agrupado = `${aviso}<div class="pos-cat-titulo">🚗 Lavados</div><div class="service-grid">${lavados.map(card).join("")}</div>`
            + (extras.length ? `<div class="pos-cat-titulo">✨ Servicios extra <small>se agregan al lavado</small></div><div class="service-grid">${extras.map(card).join("")}</div>` : "")
            + (otros.length ? `<div class="pos-cat-titulo">Otros servicios</div><div class="service-grid">${otros.map(card).join("")}</div>` : "");
          // Cortes de barbería dentro de la misma factura del autolavado.
          const cortes = s.negocio === "autolavado" ? DEMO.servicios.filter(x => x.negocio === "barberia" && x.estado === "activo") : [];
          const enFactura = cortes.reduce((a, x) => a + cantidadDe("servicio", x.id), 0);
          if (cortes.length) agrupado += `<button type="button" class="pos-cat-toggle" data-act="toggle-barber" aria-expanded="${s.barberAbierto}"><span>✂️ Servicios de barbería${enFactura ? ` · ${enFactura} en la factura` : ""}</span><small>${s.barberAbierto ? "Ocultar ▲" : "Agregar un corte ▼"}</small></button>`
            + (s.barberAbierto ? `<div class="service-grid">${cortes.map(card).join("")}</div>` : "");
        } else cards = svs.map(card).join("");
      }
      $p("catalogo").innerHTML = tabs + (agrupado || `<div class="service-grid">${cards || '<div class="empty-state">No hay servicios activos en el catálogo.</div>'}</div>`) + `
        <div class="small text-muted" style="margin-top:8px">Toca una tarjeta para agregarla. Cambia cantidades con + / − en la factura.</div>`;
    }
    function agregar(tipo, id) {
      // Si el cliente tiene una membresía vigente para este lavado y vehículo, el primero va con membresía (automático).
      if (tipo === "servicio" && s.negocio === "autolavado" && s.cliente && tipoVeh()) {
        const mb = calc.membresiaAplicable(s.cliente, id, tipoVeh(), s.vehiculo.placa);
        if (mb && !s.lineas.some(x => x.modo === "mem:" + mb.id)) { s.lineas.push({ tipo, refId: id, cantidad: 1, modo: "mem:" + mb.id }); APP.toast("info", "Lavado cubierto por membresía", `${mb.id} · uso ${mb.usados + 1} de ${mb.lavados}`); cambioLineas(); return; }
      }
      const l = s.lineas.find(x => x.tipo === tipo && x.refId === id && !x.modo);
      if (tipo === "producto") { const p = DEMO.productos.find(x => x.id === id); if ((l ? l.cantidad : 0) + 1 > p.stock) { APP.toast("warning", "Stock insuficiente", `Solo hay ${p.stock} ${p.unidad}(s) de ${p.nombre}.`); return; } }
      if (l) { if (l.cantidad >= 99) return; l.cantidad++; } else s.lineas.push({ tipo, refId: id, cantidad: 1 });
      cambioLineas();
    }
    function cambiarCantidad(i, d) {
      const l = s.lineas[i]; if (!l) return;
      if (d > 0) { if (l.modo) return; if (l.tipo === "otro") { if (l.cantidad < 99) l.cantidad++; return cambioLineas(); } return agregar(l.tipo, l.refId); }
      l.cantidad += d; if (l.cantidad <= 0) s.lineas = s.lineas.filter(x => x !== l);
      cambioLineas();
    }
    function cambioLineas() { renderCatalogo(); renderResumen(); }

    // ---------------- resumen: líneas, totales, promoción ----------------
    const esCorte = l => l.tipo === "servicio" && s.negocio !== "barberia" && (DEMO.servicios.find(x => x.id === l.refId) || {}).negocio === "barberia";
    const porVehiculo = l => l.tipo === "servicio" && !!(DEMO.servicios.find(x => x.id === l.refId) || {}).preciosVehiculo;
    // Premios de fidelidad como opciones del mismo selector (un solo descuento por factura).
    function opcionesPremio(lc, c) {
      if (s.negocio !== "autolavado" || !c) return "";
      const cfg = DEMO.configuracion.fidelidad;
      const op = (tipo, txt) => { const r = calc.promoPremio(tipo, { negocio: s.negocio, lineas: lc, cliente: c }), v = "PREMIO:" + tipo;
        return `<option value="${v}" ${s.promoId === v ? "selected" : ""} ${r.promo ? "" : "disabled"}>🎁 ${txt}${r.promo ? "" : " — " + e(r.motivo)}</option>`; };
      return `<optgroup label="Premios de fidelidad (lavados premium ${c.fidelidad.dias}/${c.fidelidad.meta})">${op("descuento", `${cfg.descuentoPct}% de descuento (${cfg.metaDescuento} premium)`)}${op("gratis", `${e(cfg.premio)} (${c.fidelidad.meta} premium)`)}</optgroup>`;
    }
    // Quita membresías/premios que dejaron de aplicar (otro cliente o tipo de vehículo).
    function validarEspeciales() {
      const avisos = [];
      s.lineas = s.lineas.filter(l => {
        if (!l.modo) return true;
        if (l.modo.startsWith("mem:")) { const mb = DEMO.membresias.find(x => x.id === l.modo.slice(4));
          if (mb && mb.clienteId === s.cliente && mb.vehiculoTipo === tipoVeh() && calc.normPlaca(mb.placa) === calc.normPlaca(s.vehiculo.placa)) return true;
          avisos.push(`Se quitó el pago con membresía ${l.modo.slice(4)}: la membresía es solo del vehículo ${mb ? mb.placa : ""}.`); return false; }
        const [, pid, nv] = l.modo.split(":"); const e2 = calc.estadoLealtad(clienteObj()).find(x => x.programa.id === pid);
        if (e2 && (+nv === 1 ? e2.disp1 : e2.disp2)) return true;
        avisos.push("Se quitó un premio que ya no está disponible para este cliente."); return false;
      });
      // Uso automático: si el vehículo (placa) de la factura tiene membresía para ese lavado, se paga con la membresía.
      if (s.negocio === "autolavado" && s.cliente && tipoVeh()) {
        s.lineas.filter(l => l.tipo === "servicio" && !l.modo).forEach(l => {
          const mb = calc.membresiaAplicable(s.cliente, l.refId, tipoVeh(), s.vehiculo.placa);
          if (!mb || s.lineas.some(x => x.modo === "mem:" + mb.id)) return;
          l.cantidad -= 1; if (l.cantidad <= 0) s.lineas = s.lineas.filter(x => x !== l);
          s.lineas.push({ tipo: "servicio", refId: l.refId, cantidad: 1, modo: "mem:" + mb.id });
          APP.toast("info", "Pago con membresía", `${mb.id} · placa ${mb.placa} · uso ${mb.usados + 1} de ${mb.lavados}`);
        });
      }
      return avisos.join(" ");
    }
    function renderPremios(c) {
      if (s.negocio !== "autolavado" || !c) return "";
      const disp = calc.premiosDisponibles(c);
      if (!disp.length) return "";
      return `<div class="pos-premios"><div class="pos-premios__titulo">🎁 Premios de lealtad disponibles</div>${disp.map(p => {
        const modo = `premio:${p.programaId}:${p.nivel}:${p.idx}`, ya = s.lineas.some(l => l.modo && l.modo.startsWith(`premio:${p.programaId}:${p.nivel}:`));
        const enEsta = s.lineas.some(l => l.modo === modo);
        return `<button type="button" class="pos-premio ${enEsta ? "is-on" : ""}" data-act="premio" data-modo="${modo}" data-id="${p.op.servicioId}" ${ya && !enEsta ? "disabled" : ""}>
          <span>${e(p.nombre)}</span><small>${e(p.programa)} · ${p.nivel === 1 ? "elige una opción" : "premio final"}${enEsta ? " · en la factura" : ""}</small></button>`; }).join("")}</div>`;
    }
    function renderResumen() {
      const avisoEsp = validarEspeciales();
      const lc = lineasCalc(), c = clienteObj();
      // Si la promoción elegida dejó de aplicar, se retira con aviso claro.
      let aviso = avisoEsp;
      if (s.promoId) { const ap = calc.promocionAplicable(promo(), { negocio: s.negocio, lineas: lc, cliente: c }); if (!ap.ok) { aviso = `Se quitó la promoción: ${ap.motivo}`; s.promoId = ""; } }
      const t = totales();
      $p("lineas").innerHTML = t.lineas.length ? `<div class="factura-lineas">${t.lineas.map((l, i) => `
        <div class="factura-linea ${l.etiqueta ? "factura-linea--especial" : ""}"><div class="factura-linea__nombre"><strong>${e(l.nombre)}</strong><span>${l.tipo === "producto" ? "Producto" : l.tipo === "otro" ? "Producto nuevo" : "Servicio"}${esCorte(l) ? '<span class="linea-tag">Barbería</span>' : ""}${porVehiculo(l) ? " · " + e(tipoVeh() || "elige vehículo") : ""} · ${l.membresia ? "prepagado (" + money(l.precioRef) + ")" : money(l.precio) + " c/u"}</span>${l.etiqueta ? `<span class="linea-especial">${e(l.etiqueta)}</span>` : ""}</div>
          <div class="qty"><button type="button" data-act="menos" data-i="${i}" aria-label="Quitar uno">−</button><span>${l.cantidad}</span><button type="button" data-act="mas" data-i="${i}" aria-label="Agregar uno" ${l.modo ? "disabled" : ""}>+</button></div>
          <div class="factura-linea__importe">${money(l.subtotal)}${l.descuento > 0 ? `<small>−${money(l.descuento)} ${l.descPct ? "premio" : "desc."}</small>` : ""}</div>
          <button class="icon-btn" style="grid-column:auto" data-act="quitar" data-i="${i}" title="Eliminar" aria-label="Eliminar ${e(l.nombre)}">🗑</button></div>`).join("")}</div>`
        : `<div class="factura-vacia">La factura está vacía.<br>Agrega uno o varios servicios o productos.</div>`;

      const promos = DEMO.promociones.filter(p => p.estado !== "inactiva" && (p.negocio === "ambos" || p.negocio === s.negocio));
      $p("totales").innerHTML = `
        ${aviso ? `<div class="msg msg--warning">${e(aviso)}</div>` : ""}
        <div class="field" style="margin:10px 0 6px"><label>Descuento / promoción</label><select data-in="promo"><option value="">Sin descuento</option>${promos.map(p => {
          const ap = calc.promocionAplicable(p, { negocio: s.negocio, lineas: lc, cliente: c });
          return `<option value="${p.id}" ${s.promoId === p.id ? "selected" : ""} ${ap.ok ? "" : "disabled"}>${e(p.nombre)} (${p.tipo === "porcentaje" ? p.valor + "%" : money(p.valor)})${ap.ok ? "" : " — " + e(ap.motivo)}</option>`; }).join("")}</select></div>
        ${renderPremios(c)}
        <div class="pos-summary__row"><span>Subtotal</span><strong>${money(t.subtotal)}</strong></div>
        <div class="pos-summary__row pos-summary__row--desc"><span>Descuento${promo() ? " · " + e(promo().nombre) : ""}${t.lineas.some(l => l.descPct) ? " · premio" : ""}</span><strong>${t.descuento ? "−" : ""}${money(t.descuento)}</strong></div>
        <div class="pos-summary__total"><span>Total a pagar</span><strong>${money(t.total)}</strong></div>`;
      renderPago();
    }

    // ---------------- pago (simple y mixto) ----------------
    function opcionesPago() {
      const t = tarjeta(), hab = metodosHabilitados();
      const fidOk = hab.includes("fidelidad") && t && t.estado === "activa" && t.saldo > 0;
      return { hab, t, fidOk, mixtoOk: hab.length >= 2 };
    }
    function renderPago() {
      const { hab, t, fidOk, mixtoOk } = opcionesPago(), total = totales().total;
      // Pago con membresía: si todo lo de la factura lo cubre la membresía (vehículo y placa registrados),
      // no se muestran otros pagos. Si hay extras u otros conceptos, se cobra solo ese resto.
      const lc = lineasCalc(), mems = lc.filter(l => l.membresia);
      let cabeceraMem = "";
      if (mems.length) {
        const caja = mems.map(l => { const mb = DEMO.membresias.find(x => x.id === l.membresia);
          return `<div class="pago-mem__fila"><span>🎫 <strong>${e(l.membresia)}</strong> · ${e(l.nombre)} · placa ${e(mb ? mb.placa : "")}</span><span>uso ${mb ? mb.usados + 1 : "?"}/${mb ? mb.lavados : "?"} · quedarán ${mb ? mb.lavados - mb.usados - 1 : "?"} · vence ${mb ? APP.fmtFechaCorta(mb.vence) : "—"}</span><strong>${money(l.precioRef)} cubierto</strong></div>`; }).join("");
        if (total === 0) {
          s.metodo = ""; s.mixto = {};
          $p("pago").innerHTML = `<div class="pago-mem pago-mem--total"><div class="pago-mem__titulo">🎫 Pago con membresía</div>${caja}<div class="pago-mem__nota">La membresía cubre toda la factura. No hay nada más que cobrar.</div></div>`;
          renderAccion(); return;
        }
        if (!s.metodo) s.metodo = metodoDefecto();
        cabeceraMem = `<div class="pago-mem"><div class="pago-mem__titulo">🎫 Pago con membresía</div>${caja}<div class="pago-mem__nota">Cobrar aparte lo que no cubre la membresía: <strong>${money(total)}</strong></div></div>`;
      }
      if (s.metodo && s.metodo !== "mixto" && (!hab.includes(s.metodo) || (s.metodo === "fidelidad" && !fidOk))) s.metodo = "";
      if (s.metodo === "mixto" && !mixtoOk) s.metodo = "";
      const btn = k => { const m = DEMO.METODOS[k]; if (!hab.includes(k)) return "";
        const dis = k === "fidelidad" && !fidOk; const sub = k === "fidelidad" ? (!s.cliente ? "Elige un cliente" : !t ? "Sin tarjeta" : t.estado !== "activa" ? "Tarjeta bloqueada" : `Disponible ${money(t.saldo)}`) : "";
        return `<button type="button" class="pay-method ${s.metodo === k ? "active" : ""}" data-act="metodo" data-m="${k}" ${dis ? "disabled" : ""}><span>${m.icon} ${m.label}${(sub || k === "tarjeta") ? `<small>${e(sub || "Débito / crédito")}</small>` : ""}</span></button>`; };
      let h = cabeceraMem + `<div class="pay-methods">${["efectivo", "tarjeta", "transferencia", "fidelidad"].map(btn).join("")}
        ${mixtoOk ? `<button type="button" class="pay-method pay-method--wide ${s.metodo === "mixto" ? "active" : ""}" data-act="metodo" data-m="mixto"><span>🔀 Pago mixto<small>Divide el total entre varios métodos</small></span></button>` : ""}</div>`;
      if (s.metodo === "mixto") {
        const filas = ["fidelidad", "efectivo", "tarjeta", "transferencia"].filter(k => hab.includes(k)).map(k => {
          const m = DEMO.METODOS[k], off = k === "fidelidad" && !fidOk;
          return `<div class="pay-row"><label>${m.icon} ${m.label}<small>${k === "fidelidad" ? (off ? (s.cliente ? "Sin saldo disponible" : "Elige un cliente") : "Disponible " + money(t.saldo)) : "&nbsp;"}</small></label>
            <input type="text" inputmode="decimal" data-pago="${k}" placeholder="0.00" value="${e(s.mixto[k] ?? "")}" ${off ? "disabled" : ""} aria-label="Monto en ${m.label}">
            <button type="button" class="btn btn--ghost btn--sm" data-act="resto" data-m="${k}" ${off ? "disabled" : ""}>Resto</button></div>`; }).join("");
        h += `<div class="pay-split"><div class="pay-split__total"><span>TOTAL A PAGAR</span><strong>${money(total)}</strong></div>${filas}
          ${fidOk ? `<button type="button" class="btn btn--ghost btn--sm btn--block" style="margin-top:10px" data-act="auto-mixto">⚡ Usar saldo disponible y completar con efectivo</button>` : ""}</div>`;
      } else if (s.metodo === "efectivo" && total > 0) {
        h += `<div class="pay-split"><div class="pay-row" style="grid-template-columns:1fr 130px"><label>Efectivo recibido<small>Opcional · para calcular el cambio</small></label><input type="text" inputmode="decimal" data-in="recibido" value="${e(s.recibido)}" placeholder="${total.toFixed(2)}"></div><div data-p="cambio" class="small" style="margin-top:6px;text-align:right"></div></div>`;
      }
      $p("pago").innerHTML = h;
      renderAccion();
    }
    // Pagos vigentes según el método elegido. Devuelve estado para UI y para la API.
    function evaluarPago() {
      const total = totales().total, tc = calc.centavos(total), { t } = opcionesPago();
      const r = { pagos: [], asignado: 0, pendiente: tc / 100, exceso: 0, error: "" };
      if (!s.lineas.length) return r;
      if (tc === 0) return { ...r, pendiente: 0 };
      if (!s.metodo) { r.error = "Elige cómo se pagará la factura."; return r; }
      if (s.metodo === "mixto") {
        let suma = 0;
        for (const k of metodosHabilitados()) { const v = num(s.mixto[k]); if (v > 0) { if (Math.abs(v * 100 - Math.round(v * 100)) > 1e-6) { r.error = "Los montos admiten como máximo 2 decimales."; return r; } r.pagos.push({ metodo: k, monto: calc.redondear(v) }); suma += calc.centavos(v); } }
        r.asignado = suma / 100; r.pendiente = Math.max(tc - suma, 0) / 100; r.exceso = Math.max(suma - tc, 0) / 100;
        const pf = r.pagos.find(p => p.metodo === "fidelidad");
        if (r.exceso > 0) r.error = `El total pagado supera el total de la factura por ${money(r.exceso)}. Ajusta los montos.`;
        else if (pf && (!t || pf.monto > t.saldo)) r.error = `Saldo de fidelidad insuficiente: el cliente tiene ${money(t ? t.saldo : 0)} y se intenta usar ${money(pf.monto)}.`;
        else if (r.pendiente > 0) r.error = `Falta pagar ${money(r.pendiente)}.`;
        return r;
      }
      r.pagos = [{ metodo: s.metodo, monto: total }]; r.asignado = total; r.pendiente = 0;
      if (s.metodo === "fidelidad" && (!t || t.saldo < total)) r.error = `El saldo disponible (${money(t ? t.saldo : 0)}) no alcanza para ${money(total)}. Usa “Pago mixto” para completar con otro método.`;
      return r;
    }
    // Lo que falta para finalizar, con el paso al que lleva cada aviso (se puede tocar).
    function faltantes() {
      const f = [], add = (txt, paso) => f.push({ txt, paso });
      if (!s.cliente) add("Cliente", "cliente"); if (!s.empleadoIds.length) add(s.negocio === "barberia" ? "Barbero" : "Empleado", "detalle");
      if (s.negocio === "autolavado" && s.lineas.some(l => l.tipo === "servicio" && (DEMO.servicios.find(x => x.id === l.refId) || {}).negocio === "autolavado") && !s.vehiculo.tipo) add("Tipo de vehículo", "detalle");
      if (!s.lineas.length) add("Servicio o producto", "catalogo");
      lineasCalc().filter(l => l.tipo === "servicio" && !(l.precio > 0) && !l.membresia && l.descPct !== 100).forEach(l => add(`Precio de “${l.nombre}” para ${s.vehiculo.tipo || "este vehículo"}`, "catalogo"));
      return f;
    }
    function irA(paso) {
      const box = $p(paso); if (!box) return;
      const card = box.closest(".card") || box;
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      card.classList.remove("pos-step--flash"); void card.offsetWidth; card.classList.add("pos-step--flash");
      if (paso === "cliente") { const i = root.querySelector('[data-in="busqueda"]'); if (i) i.focus({ preventScroll: true }); }
    }
    function renderAccion() {
      const total = totales().total, pg = evaluarPago(), falta = faltantes(), stock = API.sync.revisarStock(lineasCalc());
      const estado = pg.exceso > 0 ? "over" : (pg.pendiente > 0 && s.lineas.length ? "pend" : "ok");
      const box = $p("accion");
      let h = "";
      if (s.metodo === "mixto" && s.lineas.length) h += `<div class="pay-status"><div><span>Total factura</span><strong>${money(total)}</strong></div><div class="${pg.asignado > 0 ? "ok" : ""}"><span>Pagado</span><strong>${money(pg.asignado)}</strong></div><div class="${estado}"><span>${pg.exceso > 0 ? "Excedido" : "Pendiente"}</span><strong>${money(pg.exceso > 0 ? pg.exceso : pg.pendiente)}</strong></div></div>`;
      if (pg.error && s.lineas.length && !(pg.error.startsWith("Elige cómo") && !s.cliente)) h += `<div class="msg ${pg.exceso > 0 || /insuficiente|no alcanza/.test(pg.error) ? "msg--danger" : "msg--warning"}">${e(pg.error)}</div>`;
      stock.errores.forEach(m => h += `<div class="msg msg--danger">${e(m)}</div>`);
      stock.avisos.forEach(m => h += `<div class="msg msg--warning">${e(m)}</div>`);
      const bloqueada = falta.length || pg.error || stock.errores.length;
      h += `<button type="button" class="btn btn--primary btn--block ${s.modo === "terminal" ? "t-btn-confirmar" : ""}" style="margin-top:14px;min-height:50px" data-act="finalizar" ${bloqueada ? "disabled" : ""}>Finalizar factura · ${money(total)}</button>
        ${falta.length ? `<div class="pos-falta"><span>Falta:</span>${falta.map(x => `<button type="button" class="pos-falta__item" data-act="ir" data-paso="${x.paso}">${e(x.txt)} →</button>`).join("")}</div>` : ""}
        ${s.lineas.length || s.cliente ? `<button type="button" class="btn btn--ghost btn--block btn--sm" style="margin-top:8px" data-act="limpiar">Vaciar factura</button>` : ""}`;
      box.innerHTML = h;
      const cambio = $p("cambio");
      if (cambio) { const rec = num(s.recibido); cambio.innerHTML = rec > 0 ? (rec >= total ? `Cambio: <strong>${money(rec - total)}</strong>` : `<span class="neg">Recibido insuficiente (faltan ${money(total - rec)})</span>`) : ""; }
    }

    async function finalizar(btn) {
      const pg = evaluarPago(), lc = lineasCalc();
      const r = await APP.ejecutar(btn, () => API.facturas.crear({
        negocio: s.negocio, clienteId: s.cliente, empleadoId: s.empleadoIds[0] || null, empleadoIds: s.empleadoIds, vehiculo: s.negocio === "autolavado" ? s.vehiculo : null,
        lineas: lc.map(l => l.tipo === "otro" ? { tipo: "otro", nombre: l.nombre, precio: l.precio, cantidad: l.cantidad } : { tipo: l.tipo, refId: l.refId, cantidad: l.cantidad, modo: l.modo }), promocionId: s.promoId || null, pagos: pg.pagos }), "Registrando factura…");
      if (!r.ok) { APP.toast("danger", "No se pudo completar el pago", r.error); renderResumen(); renderCliente(); return; }
      const { factura, alertas, tarjeta: tv } = r.data;
      APP.toast("success", `Factura ${factura.id} registrada`, `${money(factura.total)} · ${factura.metodoPago}`);
      alertas.forEach(a => APP.toast("warning", "Inventario", a));
      reset(false); render();
      mostrarRecibo(factura, { tarjeta: tv, nueva: true });
      const cerrar = document.getElementById("rc-cerrar");   // "Nueva venta" deja el cursor en la búsqueda de cliente
      if (cerrar) cerrar.addEventListener("click", () => setTimeout(() => { const i = root.querySelector('[data-in="busqueda"]'); if (i) { i.focus(); i.scrollIntoView({ block: "center", behavior: "smooth" }); } }, 60));
    }

    // ---------------- eventos ----------------
    root.addEventListener("click", ev => {
      const el = ev.target.closest("[data-act]"); if (!el || el.disabled) return;
      const a = el.dataset.act, id = el.dataset.id, tipo = el.dataset.tipo;
      if (a === "elegir-cliente") elegirCliente(id);
      else if (a === "cambiar-cliente") { s.cliente = null; s.metodo = metodoDefecto(); s.mixto = {}; s.busqueda = ""; s.vehiculo = vacioVeh(); renderCliente(); renderDetalle(); renderCatalogo(); renderResumen(); }
      else if (a === "nuevo-cliente") modalNuevoCliente();
      else if (a === "elegir-emp") { s.empleadoIds = s.empleadoIds.includes(id) ? s.empleadoIds.filter(x => x !== id) : [...s.empleadoIds, id]; renderDetalle(); renderAccion(); }
      else if (a === "tab") { s.tab = el.dataset.tab; renderCatalogo(); }
      else if (a === "ir") irA(el.dataset.paso);
      else if (a === "veh-tipo") { s.vehiculo.tipo = el.dataset.v; renderDetalle(); renderCatalogo(); renderResumen(); }
      else if (a === "veh-guardado") { const x = clienteObj().vehiculos[+el.dataset.i]; s.vehiculo = { ...vacioVeh(), tipo: DEMO.tiposVehiculo.includes(x.tipo) ? x.tipo : "", placa: x.placa || "" }; renderDetalle(); renderCatalogo(); renderResumen(); }
      else if (a === "otro-nuevo") modalProductoNuevo();
      else if (a === "otro-mas") { const l = s.lineas.find(x => x.tipo === "otro" && x.refId === el.dataset.ref); if (l && l.cantidad < 99) { l.cantidad++; cambioLineas(); } }
      else if (a === "toggle-barber") { s.barberAbierto = !s.barberAbierto; renderCatalogo(); }
      else if (a === "add") agregar(tipo, id);
      else if (a === "mas") cambiarCantidad(+el.dataset.i, 1);
      else if (a === "menos") cambiarCantidad(+el.dataset.i, -1);
      else if (a === "quitar") { s.lineas.splice(+el.dataset.i, 1); cambioLineas(); }
      else if (a === "premio") { const modo = el.dataset.modo, i = s.lineas.findIndex(l => l.modo === modo);
        if (i >= 0) { s.lineas.splice(i, 1); }
        else {   // si ese lavado ya está en la factura, el premio se aplica a ese mismo lavado (no agrega otro)
          const n = s.lineas.find(l => l.tipo === "servicio" && l.refId === id && !l.modo);
          if (n) { n.cantidad -= 1; if (n.cantidad <= 0) s.lineas = s.lineas.filter(l => l !== n); }
          s.lineas.push({ tipo: "servicio", refId: id, cantidad: 1, modo });
        }
        cambioLineas(); }
      else if (a === "metodo") { s.metodo = el.dataset.m; if (s.metodo === "mixto" && !Object.keys(s.mixto).length) s.mixto = {}; renderPago(); }
      else if (a === "resto") { const total = totales().total; const otros = Object.keys(s.mixto).filter(k => k !== el.dataset.m).reduce((x, k) => x + calc.centavos(num(s.mixto[k])), 0); let v = Math.max(calc.centavos(total) - otros, 0) / 100;
        if (el.dataset.m === "fidelidad") v = Math.min(v, tarjeta() ? tarjeta().saldo : 0); s.mixto[el.dataset.m] = v > 0 ? v.toFixed(2) : ""; renderPago(); }
      else if (a === "auto-mixto") { const total = totales().total, t = tarjeta(); const usar = Math.min(t.saldo, total); s.mixto = { fidelidad: usar.toFixed(2) }; const resto = calc.redondear(total - usar); if (resto > 0) s.mixto.efectivo = resto.toFixed(2); renderPago(); }
      else if (a === "limpiar") { reset(false); render(); }
      else if (a === "finalizar") finalizar(el);
    });
    root.addEventListener("keydown", ev => {
      if (ev.key === "Enter" && ev.target.dataset && ev.target.dataset.in === "busqueda") { ev.preventDefault(); const first = root.querySelector('.pos-cliente-item[data-act="elegir-cliente"]'); if (first) first.click(); else if (s.busqueda.trim()) modalNuevoCliente(); return; } if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches(".pos-cliente-item")) { ev.preventDefault(); ev.target.click(); } });
    root.addEventListener("input", ev => {
      const t = ev.target;
      if (t.dataset.in === "busqueda") { s.busqueda = t.value; renderResultados(); }
      else if (t.dataset.pago) { s.mixto[t.dataset.pago] = t.value; renderAccion(); }
      else if (t.dataset.in === "recibido") { s.recibido = t.value; renderAccion(); }
      else if (t.dataset.veh) { s.vehiculo[t.dataset.veh] = t.value; if (t.dataset.veh === "tipo" || t.dataset.veh === "placa") { renderCatalogo(); renderResumen(); } }
    });
    root.addEventListener("change", ev => {
      const t = ev.target;
      if (t.dataset.in === "promo") { s.promoId = t.value; renderResumen(); }
      else if (t.dataset.act === "veh-guardado" && t.value !== "") { s.vehiculo = { ...vacioVeh(), ...clienteObj().vehiculos[+t.value] }; if (!DEMO.tiposVehiculo.includes(s.vehiculo.tipo)) s.vehiculo.tipo = ""; renderDetalle(); renderCatalogo(); renderResumen(); }
    });

    inst.elegirCliente = elegirCliente;   // usado por la terminal NFC ("nueva venta con este cliente")
    render();
    return inst;
  }

  function reiniciar() { instancias.forEach(i => { i.reset(true); i.render(); }); }

  // ======================================================================
  // COMPROBANTE: se usa al finalizar y al ver una factura del historial.
  // ======================================================================
  // Ticket para el cliente (impresora térmica 80 mm, "Recibo POS"): sin logo y SIN el empleado que atendió.
  // El empleado y quién registró se muestran solo en pantalla al administrador (no se imprimen).
  function mostrarRecibo(f, { tarjeta = null, nueva = false } = {}) {
    void tarjeta;
    const cfg = DEMO.configuracion.negocios[f.negocio];
    const anulada = f.estado !== "Completada";
    const M = n => "C$" + Number(n || 0).toLocaleString("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const tc = DEMO.configuracion.caja.tipoCambio;
    const mbVendida = f.membresiaVendida && DEMO.membresias.find(x => x.id === f.membresiaVendida);
    const pm = f.pagosMembresia || [];
    const fila = (a, b2, cls = "") => `<div class="tk-row ${cls}"><span>${a}</span><span>${b2}</span></div>`;
    const html = `<div class="receipt tk">
      <div class="tk-c tk-b">${e((f.negocio === "barberia" ? "EL RÁPIDO BARBERÍA" : "EL RÁPIDO AUTOLAVADO"))}</div>
      <div class="tk-c">${e(cfg.direccion)}</div>
      <div class="tk-c">Tel: ${e(cfg.telefono)}</div>
      ${cfg.social ? `<div class="tk-c">Social: ${e(cfg.social)}</div>` : ""}
      <div class="tk-hr"></div>
      <div>TICKET #: ${e(f.id)}</div>
      <div>FECHA: ${APP.fmtFechaHora(f.fecha)}</div>
      <div>CLIENTE: ${e(f.clienteNombre.toUpperCase())}</div>
      ${f.vehiculo ? `<div>PLACA: ${e(f.vehiculo.placa || "—")} (${e(f.vehiculo.tipo)})</div>` : ""}
      ${anulada ? `<div class="tk-c tk-b">*** FACTURA ANULADA ***</div>` : ""}
      <div class="tk-hr"></div>
      <div class="tk-b">${mbVendida ? "MEMBRESÍA" : "SERVICIOS"}</div>
      ${f.lineas.map(l => `<div class="tk-item">${fila(`${l.cantidad} x ${e(l.nombre.replace(" · Membresía", "").replace(" · Premio", ""))}${l.area === "barberia" ? " (Barbería)" : ""}`, M(l.subtotal))}
        ${l.cantidad > 1 && !l.membresia ? `<div class="tk-sub">${M(l.precio)} c/u</div>` : ""}
        ${l.membresia ? `<div class="tk-sub">PAGO CON MEMBRESÍA ${e(l.membresia)} (valor ${M(l.precioRef)})</div><div class="tk-sub">Le quedan ${l.restantes ?? "—"} lavado(s) · Vence ${l.vence ? APP.fmtFechaCorta(l.vence) : "—"}</div>` : ""}
        ${l.premio ? `<div class="tk-sub">Premio: ${e(l.premio.nombre)} (-${M(l.descuento)})</div>` : (l.descuento > 0 && !l.membresia ? `<div class="tk-sub">Descuento -${M(l.descuento)}</div>` : "")}</div>`).join("")}
      ${mbVendida ? `<div class="tk-sub">Vehículo: ${e(mbVendida.vehiculoTipo)} · Placa ${e(mbVendida.placa)}</div><div class="tk-sub">${mbVendida.lavados} lavados · Vence ${APP.fmtFechaCorta(mbVendida.vence)}</div><div class="tk-sub">Válida solo para este vehículo</div>` : ""}
      <div class="tk-hr"></div>
      ${fila("SUBTOTAL:", M(f.subtotal), "tk-r")}
      ${f.descuento ? fila(`DESCUENTO${f.promocion && !mbVendida ? " (" + e(f.promocion) + ")" : ""}:`, "-" + M(f.descuento), "tk-r") : ""}
      ${fila("TOTAL:", M(f.total), "tk-r tk-b tk-big")}
      ${fila("TOTAL USD:", "$" + (f.total / tc).toFixed(2), "tk-r")}
      <div class="tk-hr"></div>
      ${f.pagos.map(p => fila(`PAGO ${e(calc.etiquetaMetodo(p.metodo).toUpperCase())}:`, M(p.monto))).join("")}
      ${pm.map(p => fila(`PAGO CON MEMBRESÍA (${e(p.membresia)}):`, "1 lavado")).join("")}
      ${!f.pagos.length && !pm.length ? fila("PAGO:", "Sin cobro") : ""}
      ${pm.map(p => `<div class="tk-sub">Membresía ${e(p.membresia)} · placa ${e(p.placa || "")}: quedan ${p.restantes} lavado(s), vence ${APP.fmtFechaCorta(p.vence)}</div>`).join("")}
      ${f.lealtad && !anulada ? (f.lealtad.despues || []).filter(x => (f.lealtad.sumas || {})[x.programaId] || (f.lealtad.canjes || []).some(c2 => c2.programaId === x.programaId)).map(x => { const pg = DEMO.configuracion.lealtad.programas.find(z => z.id === x.programaId);
          return `<div class="tk-sub">${e(pg ? pg.nombre : x.programaId)}: ${x.lavadas}/${x.meta} lavadas${x.disp2 ? " - ¡premio final disponible!" : x.disp1 ? " - ¡puede elegir su premio!" : ""}</div>`; }).join("") : ""}
      ${f.anulacion ? `<div class="tk-sub">Anulada ${APP.fmtFechaHora(f.anulacion.fecha)}: ${e(f.anulacion.motivo)}</div>` : ""}
      <div class="tk-hr"></div>
      <div class="tk-c">¡Gracias por su visita!</div>
      <div class="tk-c tk-b">VUELVA PRONTO</div>
    </div>
      ${AUTH.puede("ventas.ver") ? `<div class="tk-interno"><strong>Solo para el administrador (no se imprime)</strong><span>${f.negocio === "barberia" ? "Barbero" : "Atendió"}: ${e(f.empleadoNombre)} · Registró: ${e(f.usuario || "—")}</span></div>` : ""}
      <div class="form-actions" style="margin-top:14px">
        ${!anulada && AUTH.puede("ventas.anular") ? `<button class="btn btn--ghost" id="rc-anular" style="margin-right:auto;color:var(--danger)">Anular factura</button>` : ""}
        <button class="btn btn--ghost" id="rc-imprimir">🖨 Imprimir ticket</button><button class="btn btn--primary" id="rc-cerrar">${nueva ? "Nueva venta" : "Cerrar"}</button></div>`;
    APP.openModal(nueva ? "✅ Venta registrada" : "Detalle de factura", html, { size: "modal--sm" });
    document.getElementById("rc-cerrar").onclick = APP.closeModal;
    document.getElementById("rc-imprimir").onclick = () => window.print();
    const an = document.getElementById("rc-anular");
    if (an) an.onclick = () => APP.confirmar(`Se revertirá el avance de lavados premium (y el premio canjeado, si lo hubo) y se devolverán al inventario los productos vendidos de la factura <strong>${e(f.id)}</strong>.`, async (motivo) => {
      const r = await API.facturas.anular(f.id, motivo);
      if (!r.ok) { APP.toast("danger", "No se pudo anular la factura", r.error); return false; }
      APP.toast("success", `Factura ${f.id} anulada`);
    }, { titulo: "Anular factura", danger: true, okText: "Anular", campoTexto: "Motivo de la anulación" });
  }

  return { montar, reiniciar, mostrarRecibo };
})();

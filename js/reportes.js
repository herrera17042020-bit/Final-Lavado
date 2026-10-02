/* ==========================================================================
   reportes.js — Análisis por negocio y período.
   Todo se calcula con API.reportes.calcular({ negocio, desde, hasta }) sobre las facturas reales;
   con backend sería GET /api/reportes?negocio=&desde=&hasta= (agregaciones SQL). Aquí solo se dibuja.
   ========================================================================== */
(() => {
  const e = APP.escapeHtml, money = APP.money, iso = d => API.utils.isoDia(d);
  const TABS = [["resumen", "Resumen"], ["caja", "Caja diaria"], ["anulaciones", "Anulaciones"], ["ventas", "Ventas en el tiempo"], ["servicios", "Servicios"], ["clientes", "Clientes"], ["empleados", "Empleados"],
    ["pagos", "Pagos y fidelidad"], ["inventario", "Productos e inventario"], ["horarios", "Horarios"], ["transacciones", "Transacciones"]];
  const S = { negocio: "todos", desde: "", hasta: "", tab: "resumen", serie: "dia", datos: null, incluirAnuladas: false };
  let montado = false;

  function rangoRapido(k) {
    const h = new Date(), d = new Date();
    if (k === "hoy") { /* hoy */ } else if (k === "7") d.setDate(d.getDate() - 6); else if (k === "30") d.setDate(d.getDate() - 29);
    else if (k === "mes") d.setDate(1); else if (k === "prev") { d.setMonth(d.getMonth() - 1, 1); h.setDate(0); }
    S.desde = iso(d); S.hasta = iso(h);
  }

  // ---------------- bloques reutilizables ----------------
  const kpi = (l, v, s) => `<div class="rep-kpi"><span>${l}</span><strong>${v}</strong>${s ? `<small>${s}</small>` : ""}</div>`;
  function hbars(items, { fmt = money, cls = "", vacio = "Sin datos en este período." } = {}) {
    if (!items.length) return `<div class="empty-state">${vacio}</div>`;
    const max = Math.max(...items.map(i => i.valor), 1);
    return items.map(i => `<div class="hbar"><span class="hbar__label" title="${e(i.label)}">${e(i.label)}</span><div class="hbar__track"><div class="hbar__fill ${i.cls || cls}" style="width:${Math.max(i.valor / max * 100, i.valor > 0 ? 2 : 0)}%"></div></div><span class="hbar__val">${fmt(i.valor)}${i.extra ? ` <small>${i.extra}</small>` : ""}</span></div>`).join("");
  }
  const card = (t, body, nota) => `<div class="card rep-card"><h4>${t}</h4>${body}${nota ? `<div class="rep-nota">${nota}</div>` : ""}</div>`;
  const tabla = (cab, filas, vacio = "Sin datos en este período.") => filas.length ? `<div class="tabla-scroll"><table class="table table--compact"><thead><tr>${cab.map(c => `<th${c.n ? ' class="num"' : ""}>${c.t}</th>`).join("")}</tr></thead><tbody>${filas.join("")}</tbody></table></div>` : `<div class="empty-state">${vacio}</div>`;
  const columnas = serie => !serie.length ? `<div class="empty-state">Sin ventas en este período.</div>` : (() => { const max = Math.max(...serie.map(s => s.ventas), 1);
    return `<div class="hours" style="grid-template-columns:repeat(${serie.length},1fr);height:170px">${serie.map(s => `<div title="${e(s.label)}: ${money(s.ventas)} · ${s.transacciones} factura(s)"><i style="height:${Math.max(s.ventas / max * 100, s.ventas ? 3 : 0)}%"></i></div>`).join("")}</div>
    <div class="rep-nota" style="display:flex;justify-content:space-between"><span>${e(serie[0].label)}</span><span>${e(serie[serie.length - 1].label)}</span></div>`; })();
  const etiqEmp = () => S.negocio === "barberia" ? "Barbero" : S.negocio === "autolavado" ? "Empleado" : "Empleado / barbero";

  // ---------------- pestañas ----------------
  const VISTAS = {
    resumen(d) {
      const R = d.resumen, nb = S.negocio;
      const kp = [kpi("Ventas totales", money(R.ventasTotales), `Subtotal ${money(R.subtotal)}`), kpi("Transacciones", R.transacciones, R.anuladas ? `${R.anuladas} anulada(s)` : ""), kpi("Ticket promedio", money(R.ticketPromedio)),
        kpi("Servicios realizados", R.serviciosRealizados, `${R.productosVendidos} producto(s) vendido(s)`), kpi("Clientes atendidos", R.clientesAtendidos, `${R.clientesNuevos} nuevos · ${R.clientesRecurrentes} recurrentes`),
        kpi("Descuentos aplicados", money(R.descuentos), `${d.descuentos.facturas} factura(s)`), kpi("Pagos mixtos", d.mixtos.cantidad, `${d.mixtos.porcentaje.toFixed(0)}% · ${money(d.mixtos.monto)}`), kpi("Premios canjeados", d.fidelidad.premiosDescuento + d.fidelidad.premiosGratis, `${money(d.fidelidad.montoPremios)} en descuentos`)];
      if (nb !== "barberia") kp.splice(5, 0, kpi("Vehículos atendidos", R.vehiculosAtendidos, `${R.vehiculosUnicos} distintos`));
      if (nb === "todos") kp.push(kpi("Productos utilizados", R.productosConsumidos, "consumidos + vendidos"));
      const top = d.servicios.filter(s => s.cantidad > 0).sort((a, b) => b.cantidad - a.cantidad).slice(0, 5);
      return `<div class="rep-kpis">${kp.join("")}</div><div class="rep-grid">
        ${card("Ventas por negocio", hbars(d.porNegocio.map(x => ({ label: x.nombre, valor: x.ventas, extra: `${x.transacciones} fact.`, cls: x.negocio === "autolavado" ? "hbar__fill--auto" : "hbar__fill--barber" }))))}
        ${card("Servicios más vendidos", hbars(top.map(s => ({ label: s.nombre, valor: s.cantidad })), { fmt: n => n + " uds" }))}
        ${card("Métodos de pago", hbars(d.pagos.filter(p => p.monto > 0).map(p => ({ label: p.label, valor: p.monto, extra: `${p.facturas}` }))))}
        ${card("Ventas por día", columnas(d.serie.dia))}</div>`;
    },
    ventas(d) {
      const serie = d.serie[S.serie];
      return `<div class="card rep-card"><div class="card-head"><h4>Ventas por ${{ dia: "día", semana: "semana", mes: "mes" }[S.serie]}</h4>
        <div class="seg">${[["dia", "Día"], ["semana", "Semana"], ["mes", "Mes"]].map(([k, l]) => `<button data-serie="${k}" class="${S.serie === k ? "active" : ""}">${l}</button>`).join("")}</div></div>${columnas(serie)}</div>
        ${card("Detalle", tabla([{ t: "Período" }, { t: "Facturas", n: 1 }, { t: "Ventas", n: 1 }, { t: "Ticket prom.", n: 1 }], serie.slice().reverse().map(s => `<tr><td>${e(s.label)}</td><td class="num">${s.transacciones}</td><td class="num">${money(s.ventas)}</td><td class="num">${s.transacciones ? money(s.ventas / s.transacciones) : "—"}</td></tr>`)))}`;
    },
    servicios(d) {
      const con = d.servicios.slice(), mas = con.filter(s => s.cantidad > 0).sort((a, b) => b.cantidad - a.cantidad).slice(0, 8), menos = con.slice().sort((a, b) => a.cantidad - b.cantidad || a.nombre.localeCompare(b.nombre)).slice(0, 6);
      return `<div class="rep-grid">${card("Más vendidos", hbars(mas.map(s => ({ label: s.nombre, valor: s.cantidad })), { fmt: n => n + " uds" }))}
        ${card("Menos vendidos", hbars(menos.map(s => ({ label: s.nombre, valor: s.cantidad, cls: "hbar__fill--warn" })), { fmt: n => n + " uds" }), "Incluye servicios activos sin ventas en el período.")}</div>
        ${card("Ingresos por servicio", tabla([{ t: "Servicio" }, { t: "Negocio" }, { t: "Cantidad", n: 1 }, { t: "Ingresos", n: 1 }], con.slice().sort((a, b) => b.ingresos - a.ingresos).map(s => `<tr><td>${e(s.nombre)}</td><td>${APP.NOMBRE_NEGOCIO[s.negocio]}</td><td class="num">${s.cantidad}</td><td class="num">${money(s.ingresos)}</td></tr>`)), "Los ingresos consideran el descuento aplicado a cada línea.")}
        ${d.productos.length ? `<div style="height:14px"></div>${card("Productos vendidos como línea de factura", tabla([{ t: "Producto" }, { t: "Cantidad", n: 1 }, { t: "Ingresos", n: 1 }], d.productos.map(p => `<tr><td>${e(p.nombre)}</td><td class="num">${p.cantidad}</td><td class="num">${money(p.ingresos)}</td></tr>`)))}` : ""}`;
    },
    clientes(d) {
      const R = d.resumen, veh = S.negocio !== "barberia";
      return `<div class="rep-kpis">${kpi("Clientes atendidos", R.clientesAtendidos)}${kpi("Clientes nuevos", R.clientesNuevos, "registrados en el período")}${kpi("Clientes recurrentes", R.clientesRecurrentes, "2+ facturas o ya habían comprado")}${veh ? kpi("Vehículos atendidos", R.vehiculosAtendidos, `${R.vehiculosUnicos} distintos`) : ""}</div>
        <div class="rep-grid">${card("Clientes con mayor gasto", tabla([{ t: "Cliente" }, { t: "Facturas", n: 1 }, { t: "Gasto", n: 1 }, { t: "" }], d.topClientes.slice(0, 10).map(c => `<tr><td>${e(c.nombre)}</td><td class="num">${c.facturas}</td><td class="num">${money(c.gasto)}</td><td>${c.nuevo ? APP.badge("Nuevo") : ""} ${c.recurrente ? APP.badge("Frecuente") : ""}</td></tr>`)))}
        ${veh ? card("Tipos de vehículos", hbars(d.vehiculos.map(v => ({ label: v.tipo, valor: v.cantidad })), { fmt: n => n + " uds", cls: "hbar__fill--auto", vacio: "Sin vehículos registrados." })) : card("Clientes nuevos", tabla([{ t: "Cliente" }, { t: "Registro" }], d.nuevos.map(c => `<tr><td>${e(c.nombre)}</td><td>${APP.fmtFechaCorta(c.creado)}</td></tr>`), "Sin clientes nuevos en el período."))}</div>
        ${veh ? `<div style="height:14px"></div>${card("Clientes nuevos", tabla([{ t: "Cliente" }, { t: "Negocio" }, { t: "Registro" }], d.nuevos.map(c => `<tr><td>${e(c.nombre)}</td><td>${APP.NOMBRE_NEGOCIO[c.negocio]}</td><td>${APP.fmtFechaCorta(c.creado)}</td></tr>`), "Sin clientes nuevos en el período."))}` : ""}`;
    },
    empleados(d) {
      return `<div class="rep-grid">${card(`Ingresos por ${etiqEmp().toLowerCase()}`, hbars(d.empleados.map(x => ({ label: x.nombre, valor: x.ingresos, extra: `${x.facturas} fact.`, cls: x.negocio === "barberia" ? "hbar__fill--barber" : "hbar__fill--auto" }))))}
        ${card(`Servicios realizados por ${etiqEmp().toLowerCase()}`, hbars(d.empleados.slice().sort((a, b) => b.servicios - a.servicios).map(x => ({ label: x.nombre, valor: x.servicios })), { fmt: n => n + " serv." }))}</div>
        ${card("Detalle", tabla([{ t: etiqEmp() }, { t: "Negocio" }, { t: "Facturas", n: 1 }, { t: "Servicios", n: 1 }, { t: "Ingresos", n: 1 }, { t: "Ticket prom.", n: 1 }], d.empleados.map(x => `<tr><td>${e(x.nombre)}</td><td>${APP.NOMBRE_NEGOCIO[x.negocio]}</td><td class="num">${x.facturas}</td><td class="num">${x.servicios}</td><td class="num">${money(x.ingresos)}</td><td class="num">${money(x.ingresos / x.facturas)}</td></tr>`)))}`;
    },
    pagos(d) {
      const F = d.fidelidad, tot = d.pagos.reduce((a, p) => a + p.monto, 0) || 1;
      return `<div class="rep-grid">${card("Métodos de pago", tabla([{ t: "Método" }, { t: "Facturas", n: 1 }, { t: "Monto", n: 1 }, { t: "%", n: 1 }], d.pagos.map(p => `<tr><td>${e(p.label)}</td><td class="num">${p.facturas}</td><td class="num">${money(p.monto)}</td><td class="num">${(p.monto / tot * 100).toFixed(1)}%</td></tr>`)), "Una factura con pago mixto cuenta una vez por cada método utilizado.")}
        ${card("Pagos mixtos", `<div class="rep-kpis" style="margin-bottom:10px">${kpi("Facturas mixtas", d.mixtos.cantidad, d.mixtos.porcentaje.toFixed(1) + "% del total")}${kpi("Monto facturado", money(d.mixtos.monto))}</div>${tabla([{ t: "Combinación" }, { t: "Facturas", n: 1 }, { t: "Monto", n: 1 }], d.mixtos.combinaciones.map(c => `<tr><td>${e(c.combinacion)}</td><td class="num">${c.cantidad}</td><td class="num">${money(c.monto)}</td></tr>`), "No hubo pagos mixtos en este período.")}`)}</div>
        <div class="rep-grid">${card("Lealtad y membresías", `<div class="rep-kpis">${kpi("Lavadas sumadas", F.lavadosPremium, "a los programas")}${kpi("Premios gratis", F.premiosGratis)}${kpi("Premios con descuento", F.premiosDescuento)}${kpi("Valor de premios", money(F.montoPremios))}${kpi("Membresías vendidas", F.membresiasVendidas, money(F.ingresosMembresias))}${kpi("Lavados con membresía", F.usosMembresia, `${F.membresiasActivas} activas`)}</div>`)}
        ${card("Recompensas y descuentos", `<div class="rep-kpis">${kpi("Premios canjeados", F.canjes)}${kpi("Premio final disponible", F.recompensasDisponibles, "clientes")}${kpi("Premio intermedio disponible", F.descuentosDisponibles, "clientes")}${kpi("Descuentos aplicados", money(d.descuentos.total), `${d.descuentos.facturas} factura(s)`)}</div>${tabla([{ t: "Promoción" }, { t: "Facturas", n: 1 }, { t: "Descuento", n: 1 }], d.descuentos.porPromocion.map(p => `<tr><td>${e(p.nombre)}</td><td class="num">${p.cantidad}</td><td class="num">${money(p.monto)}</td></tr>`), "Sin descuentos aplicados.")}`)}</div>`;
    },
    inventario(d) {
      return `<div class="rep-kpis">${kpi("Productos utilizados", d.resumen.productosConsumidos, "usos de servicio + unidades vendidas")}${kpi("Unidades vendidas", d.resumen.productosVendidos)}${kpi("Productos con stock bajo", d.consumos.filter(c => c.bajo).length, "entre los consumidos")}</div>
        <div class="rep-grid">${card("Productos con mayor consumo", hbars(d.consumos.slice(0, 8).map(c => ({ label: c.nombre, valor: c.total })), { fmt: n => n + " uds/usos" }))}
        ${card("Inventario relacionado con ventas", tabla([{ t: "Producto" }, { t: "Usos", n: 1 }, { t: "Vendidas", n: 1 }, { t: "Stock", n: 1 }, { t: "" }], d.consumos.map(c => `<tr><td>${e(c.nombre)}</td><td class="num">${c.usos}</td><td class="num">${c.vendidas}</td><td class="num">${c.stock} ${e(c.unidad)}</td><td>${c.bajo ? '<span class="badge badge--danger">Stock bajo</span>' : ""}</td></tr>`), "Aún no hay consumo de productos en el período."))}</div>`;
    },
    horarios(d) {
      const max = Math.max(...d.horarios.map(h => h.transacciones), 1), horas = d.horarios.filter(h => h.hora >= 6 && h.hora <= 21);
      const pico = d.horarios.slice().sort((a, b) => b.transacciones - a.transacciones)[0];
      return `${card("Actividad por hora", `<div class="hours" style="grid-template-columns:repeat(${horas.length},1fr)">${horas.map(h => `<div class="${h.transacciones === 0 ? "is-off" : h.transacciones === max ? "is-top" : ""}" title="${h.hora}:00 · ${h.transacciones} factura(s) · ${money(h.ventas)}"><i style="height:${h.transacciones / max * 100}%"></i>${h.hora}</div>`).join("")}</div>`, pico && pico.transacciones ? `Hora de mayor actividad: <strong>${pico.hora}:00 – ${pico.hora + 1}:00</strong> (${pico.transacciones} facturas).` : "Sin actividad en el período.")}
        <div style="height:14px"></div>${card("Actividad por día de la semana", hbars(d.diasSemana.map(x => ({ label: x.dia, valor: x.transacciones, extra: money(x.ventas) })), { fmt: n => n + " fact." }))}`;
    },
    caja(d) {
      const T = d.caja.reduce((a, x) => { ["efectivo", "tarjeta", "transferencia", "fidelidad", "total"].forEach(k => { a[k] += x[k]; }); return a; }, { efectivo: 0, tarjeta: 0, transferencia: 0, fidelidad: 0, total: 0 });
      return `<div class="rep-kpis">${kpi("Efectivo", money(T.efectivo), "incluye la parte en efectivo de pagos mixtos")}${kpi("Tarjeta", money(T.tarjeta))}${kpi("Transferencia", money(T.transferencia))}${kpi("Facturado", money(T.total))}</div>
        ${card("Cierre por día", tabla([{ t: "Día" }, { t: "Facturas", n: 1 }, { t: "Efectivo", n: 1 }, { t: "Tarjeta", n: 1 }, { t: "Transf.", n: 1 }, { t: "Total", n: 1 }],
          d.caja.map(x => `<tr><td>${e(x.label)}</td><td class="num">${x.facturas}</td><td class="num">${money(x.efectivo)}</td><td class="num">${money(x.tarjeta)}</td><td class="num">${money(x.transferencia)}</td><td class="num"><strong>${money(x.total)}</strong></td></tr>`)), "Cada método suma su parte de la factura, por eso una venta mixta (p. ej. C$ 80 tarjeta + C$ 20 efectivo) aparece dividida.")}`;
    },
    anulaciones(d) {
      const A = d.anulaciones;
      return `<div class="rep-kpis">${kpi("Facturas anuladas", A.lista.length, A.tasa.toFixed(1) + "% de las emitidas")}${kpi("Monto anulado", money(A.monto))}</div>
        ${card("Detalle de anulaciones", tabla([{ t: "Factura" }, { t: "Fecha" }, { t: "Negocio" }, { t: "Cliente" }, { t: "Total", n: 1 }, { t: "Anuló" }, { t: "Motivo" }],
          A.lista.map(x => `<tr><td><strong>${e(x.id)}</strong></td><td>${APP.fmtFechaHora(x.fecha)}</td><td>${APP.NOMBRE_NEGOCIO[x.negocio]}</td><td>${e(x.cliente)}</td><td class="num">${money(x.total)}</td><td>${e(x.usuario)}</td><td>${e(x.motivo)}</td></tr>`), "No hubo anulaciones en este período."))}`;
    },
    transacciones(d) {
      const lista = S.incluirAnuladas ? d.todasLasFacturas : d.facturas;
      return `<div class="card rep-card"><div class="card-head"><h4>Detalle de transacciones (${lista.length})</h4><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><label class="checkbox-row" style="margin:0"><input type="checkbox" id="rep-anuladas" ${S.incluirAnuladas ? "checked" : ""}> Incluir anuladas</label><button class="btn btn--ghost btn--sm" id="rep-csv" ${lista.length ? "" : "disabled"}>⬇ Exportar CSV</button></div></div>
        ${tabla([{ t: "Factura" }, { t: "Fecha" }, { t: "Negocio" }, { t: "Cliente" }, { t: "Conceptos" }, { t: etiqEmp() }, { t: "Total", n: 1 }, { t: "Pago" }, { t: "Estado" }, { t: "" }],
          lista.slice(0, 300).map(v => `<tr><td><strong>${e(v.id)}</strong></td><td>${APP.fmtFechaHora(v.fecha)}</td><td>${APP.NOMBRE_NEGOCIO[v.negocio]}</td><td>${e(v.clienteNombre)}</td><td>${e(v.servicioNombre)}</td><td>${e(v.empleadoNombre)}</td><td class="num">${money(v.total)}</td>
          <td>${v.pagoMixto ? APP.badge("Mixto") + `<div class="small text-muted">${v.pagos.map(p => e(DEMO.calc.etiquetaMetodo(p.metodo)) + " " + money(p.monto)).join(" + ")}</div>` : e(v.metodoPago)}</td><td>${APP.badge(v.estado)}</td><td><button class="btn btn--ghost btn--sm" data-ver="${v.id}">Ver</button></td></tr>`), "No hay transacciones en el período seleccionado.")}
        ${lista.length > 300 ? `<div class="rep-nota">Mostrando 300 de ${lista.length}. Exporta el CSV para ver todas.</div>` : ""}</div>`;
    },
  };

  // ---------------- ciclo de vida ----------------
  function montar() {
    const cont = document.getElementById("reportes-root");
    cont.innerHTML = `
      <div class="card"><div class="rep-filtros">
        <label>Negocio<select id="rep-negocio"><option value="todos">Todo el local</option><option value="autolavado">🚗 Autolavado</option><option value="barberia">💈 Barbería</option></select></label>
        <label>Desde<input type="date" id="rep-desde"></label><label>Hasta<input type="date" id="rep-hasta"></label>
        <label>Tipo de reporte<select id="rep-tipo">${TABS.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label>
        <div class="rep-acciones"><button class="btn btn--primary" id="rep-aplicar">Actualizar</button></div></div>
        <div class="rep-rapidos">${[["hoy", "Hoy"], ["7", "Últimos 7 días"], ["30", "Últimos 30 días"], ["mes", "Este mes"], ["prev", "Mes anterior"]].map(([k, l]) => `<button class="btn btn--ghost btn--sm" data-rapido="${k}">${l}</button>`).join("")}</div></div>
      <div class="rep-tabs" id="rep-tabs" style="margin-top:14px">${TABS.map(([k, l]) => `<button data-tab="${k}">${l}</button>`).join("")}</div>
      <div id="rep-cuerpo"><div class="empty-state">Cargando reporte…</div></div>`;
    const $ = id => document.getElementById(id);
    $("rep-negocio").onchange = ev => { S.negocio = ev.target.value; cargar(); };
    $("rep-desde").onchange = ev => { S.desde = ev.target.value; cargar(); }; $("rep-hasta").onchange = ev => { S.hasta = ev.target.value; cargar(); };
    $("rep-tipo").onchange = ev => { S.tab = ev.target.value; pintar(); };
    $("rep-aplicar").onclick = cargar;
    cont.addEventListener("click", ev => {
      const t = ev.target;
      const r = t.closest("[data-rapido]"); if (r) { rangoRapido(r.dataset.rapido); sincronizar(); cargar(); return; }
      const tb = t.closest("[data-tab]"); if (tb) { S.tab = tb.dataset.tab; pintar(); return; }
      const sr = t.closest("[data-serie]"); if (sr) { S.serie = sr.dataset.serie; pintar(); return; }
      const v = t.closest("[data-ver]"); if (v) { const f = DEMO.ventas.find(x => x.id === v.dataset.ver); if (f) POS_CORE.mostrarRecibo(f); return; }
      if (t.closest("#rep-csv")) exportarCsv();
    });
    cont.addEventListener("change", ev => { if (ev.target.id === "rep-anuladas") { S.incluirAnuladas = ev.target.checked; pintar(); } });
    montado = true;
  }
  function sincronizar() { const $ = id => document.getElementById(id); $("rep-negocio").value = S.negocio; $("rep-desde").value = S.desde; $("rep-hasta").value = S.hasta; $("rep-tipo").value = S.tab; }

  let ultimaSolicitud = 0;
  async function cargar() {
    if (!S.desde || !S.hasta) { APP.toast("warning", "Selecciona las fechas", "Indica la fecha inicial y la final del reporte."); return; }
    const mia = ++ultimaSolicitud;                 // si llega una respuesta vieja, se ignora (la última solicitud gana)
    const btn = document.getElementById("rep-aplicar"); if (btn) btn.classList.add("is-loading");
    const r = await API.reportes.calcular({ negocio: S.negocio, desde: S.desde, hasta: S.hasta });
    if (btn) btn.classList.remove("is-loading");
    if (mia !== ultimaSolicitud) return;
    if (!r.ok) { S.datos = null; document.getElementById("rep-cuerpo").innerHTML = `<div class="msg msg--danger">${e(r.error)}</div>`; return; }
    S.datos = r.data; pintar();
  }
  function pintar() {
    if (!S.datos) return;
    document.querySelectorAll("#rep-tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === S.tab));
    document.getElementById("rep-tipo").value = S.tab;
    const d = S.datos, nombre = { todos: "Todo el local", autolavado: "Autolavado", barberia: "Barbería" }[S.negocio];
    document.getElementById("rep-cuerpo").innerHTML = `<div class="small text-muted" style="margin-bottom:10px">${e(nombre)} · ${APP.fmtFechaCorta(d.filtro.desde)} – ${APP.fmtFechaCorta(d.filtro.hasta)} · ${d.resumen.transacciones} factura(s) completadas${d.resumen.anuladas ? ` · ${d.resumen.anuladas} anulada(s) excluidas de los totales` : ""}</div>${d.resumen.transacciones === 0 && S.tab !== "inventario" ? `<div class="msg msg--info">No hay ventas en este período. Prueba ampliando el rango de fechas.</div>` : ""}${VISTAS[S.tab](d)}`;
  }
  function exportarCsv() {
    const d = S.datos, lista = S.incluirAnuladas ? d.todasLasFacturas : d.facturas;
    const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const filas = [["Factura", "Fecha", "Negocio", "Cliente", "Empleado", "Conceptos", "Subtotal", "Descuento", "Total", "Pagos", "Estado"].join(",")]
      .concat(lista.map(v => [v.id, APP.fmtFechaHora(v.fecha), v.negocio, v.clienteNombre, v.empleadoNombre, v.lineas.map(l => `${l.cantidad}x ${l.nombre}`).join("; "), v.subtotal, v.descuento, v.total, v.pagos.map(p => `${p.metodo}:${p.monto}`).join("; "), v.estado].map(esc).join(",")));
    const url = URL.createObjectURL(new Blob(["\ufeff" + filas.join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `transacciones_${S.desde}_${S.hasta}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    APP.toast("success", "Reporte exportado", `${lista.length} transacciones`);
  }

  APP.registerPage("reportes", () => { if (!montado) { montar(); rangoRapido("30"); } sincronizar(); cargar(); });
  API.on("*", () => { if (APP.state.paginaActual === "reportes" && montado) cargar(); });
})();

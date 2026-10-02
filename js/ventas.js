/* ventas.js — Páginas de venta: POS por negocio (usa POS_CORE), historial de facturas y estadísticas. */
const VENTAS = (() => {
  const e = APP.escapeHtml, money = APP.money;

  function initNegocio(negocio) {
    const posRoot = document.getElementById(`pos-root-${negocio}`);
    let montado = false;
    APP.registerPage(`${negocio}-venta`, () => { if (!montado) { POS_CORE.montar(posRoot, { negocio, modo: "panel" }); montado = true; } });

    const $ = id => document.getElementById(id);
    const emps = DEMO.empleados.filter(x => x.negocio === negocio);
    $(`filtro-empleado-${negocio}`).innerHTML = `<option value="">Todos los ${negocio === "barberia" ? "barberos" : "empleados"}</option>` + emps.map(x => `<option value="${x.id}">${e(x.nombre)}</option>`).join("");
    $(`filtro-servicio-${negocio}`).innerHTML = `<option value="">Todos los servicios</option>` + DEMO.servicios.filter(x => x.negocio === negocio).map(x => `<option value="${x.id}">${e(x.nombre)}</option>`).join("");

    function render() {
      const fecha = $(`filtro-fecha-${negocio}`).value, emp = $(`filtro-empleado-${negocio}`).value, sv = $(`filtro-servicio-${negocio}`).value;
      const pago = $(`filtro-pago-${negocio}`).value, q = $(`filtro-cliente-${negocio}`).value.trim().toLowerCase();
      const lista = DEMO.ventas.filter(v => v.negocio === negocio
        && (!fecha || API.utils.isoDia(v.fecha) === fecha) && (!emp || v.empleadoId === emp || (v.empleados || []).some(x => x.id === emp))
        && (!sv || v.lineas.some(l => l.refId === sv))
        && (!pago || (pago === "mixto" ? v.pagoMixto : v.pagos.some(p => p.metodo === pago)))
        && (!q || v.clienteNombre.toLowerCase().includes(q) || v.id.toLowerCase().includes(q)));
      $(`contador-ventas-${negocio}`).textContent = `${lista.length} factura${lista.length === 1 ? "" : "s"} · Total ${money(lista.filter(v => v.estado === "Completada").reduce((a, v) => a + v.total, 0))}`;
      const tb = $(`tabla-ventas-${negocio}`);
      tb.innerHTML = lista.slice(0, 100).map(v => `<tr data-id="${v.id}">
        <td><strong>${e(v.id)}</strong></td><td>${APP.fmtFechaHora(v.fecha)}</td><td>${e(v.clienteNombre)}</td>
        <td title="${e(v.lineas.map(l => l.cantidad + "× " + l.nombre).join(", "))}">${e(v.servicioNombre)}${v.lineas.length > 1 ? ` <span class="badge badge--muted">${v.lineas.length} líneas</span>` : ""}</td>
        <td>${e(v.empleadoNombre)}</td><td class="num"><strong>${money(v.total)}</strong>${v.descuento ? `<div class="small pos">−${money(v.descuento)}</div>` : ""}</td>
        <td>${v.pagoMixto ? APP.badge("Mixto") : e(v.metodoPago)}${v.pagoMixto ? `<div class="small text-muted">${v.pagos.map(p => e(DEMO.calc.etiquetaMetodo(p.metodo)) + " " + money(p.monto)).join(" + ")}</div>` : ""}</td>
        <td>${APP.badge(v.estado)}</td><td><button class="btn btn--ghost btn--sm" data-ver="${v.id}">Ver</button></td></tr>`).join("")
        || `<tr><td colspan="9"><div class="empty-state"><strong>No hay facturas con estos filtros</strong>Prueba cambiando la fecha, el método de pago o la búsqueda.</div></td></tr>`;
    }
    ["fecha", "empleado", "servicio", "pago"].forEach(k => $(`filtro-${k}-${negocio}`).addEventListener("change", render));
    $(`filtro-cliente-${negocio}`).addEventListener("input", render);
    $(`tabla-ventas-${negocio}`).addEventListener("click", ev => {
      const b = ev.target.closest("[data-ver]"); if (!b) return;
      const f = DEMO.ventas.find(x => x.id === b.dataset.ver); if (f) POS_CORE.mostrarRecibo(f);
    });
    APP.registerPage(`${negocio}-ventas`, render);
    API.on("factura-anulada", () => { if (APP.state.paginaActual === `${negocio}-ventas`) render(); });
  }

  // Estadísticas: calendario mensual + detalle del día seleccionado (ids del index.html original).
  function initEstadisticas() {
    const ref = new Date(); ref.setDate(1);
    let diaSel = new Date();
    const $ = id => document.getElementById(id);
    const mismo = (a, b) => a.toDateString() === b.toDateString();
    function pintar() {
      const y = ref.getFullYear(), m = ref.getMonth(), dias = new Date(y, m + 1, 0).getDate(), off = (new Date(y, m, 1).getDay() + 6) % 7;
      $("cal-label").textContent = ref.toLocaleDateString("es-NI", { month: "long", year: "numeric" });
      const cuenta = {}; DEMO.ventas.filter(v => v.estado === "Completada" && v.fecha.getFullYear() === y && v.fecha.getMonth() === m).forEach(v => { cuenta[v.fecha.getDate()] = (cuenta[v.fecha.getDate()] || 0) + 1; });
      let h = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(d => `<div class="small text-muted" style="text-align:center;font-weight:600">${d}</div>`).join("");
      for (let i = 0; i < off; i++) h += `<div class="cal-cell cal-cell--empty"></div>`;
      for (let d = 1; d <= dias; d++) { const f = new Date(y, m, d);
        h += `<button type="button" class="cal-cell ${mismo(f, new Date()) ? "cal-cell--today" : ""} ${mismo(f, diaSel) ? "cal-cell--active" : ""}" data-day="${d}"><span>${d}</span>${cuenta[d] ? `<em>${cuenta[d]}</em>` : ""}</button>`; }
      $("cal-grid").innerHTML = h; detalleDia();
    }
    function detalleDia() {
      const lista = DEMO.ventas.filter(v => mismo(v.fecha, diaSel)).sort((a, b) => b.fecha - a.fecha), ok = lista.filter(v => v.estado === "Completada");
      $("cal-dia-titulo").textContent = "Ventas del " + diaSel.toLocaleDateString("es-NI", { day: "numeric", month: "long", year: "numeric" });
      $("cal-dia-cantidad").textContent = ok.length;
      $("cal-dia-ingresos").textContent = money(ok.reduce((a, v) => a + v.total, 0));
      $("cal-dia-servicios").textContent = ok.reduce((a, v) => a + v.lineas.filter(l => l.tipo === "servicio").reduce((b, l) => b + l.cantidad, 0), 0);
      const pagos = {}; ok.forEach(v => v.pagos.forEach(p => { pagos[p.metodo] = (pagos[p.metodo] || 0) + p.monto; }));
      $("cal-dia-pagos").innerHTML = Object.entries(pagos).map(([k, v]) => `<span class="badge badge--muted" style="margin-right:6px">${e(DEMO.calc.etiquetaMetodo(k))}: ${money(v)}</span>`).join("") + (ok.some(v => v.pagoMixto) ? APP.badge("Mixto") + ` <span class="small text-muted">${ok.filter(v => v.pagoMixto).length} pago(s) mixto(s)</span>` : "");
      $("cal-dia-lista").innerHTML = lista.length ? `<table class="table"><tbody>${lista.map(v => `<tr><td>${APP.fmtTime(v.fecha)}</td><td><strong>${e(v.id)}</strong></td><td>${e(v.clienteNombre)}</td><td>${e(v.servicioNombre)}</td><td class="num">${money(v.total)}</td><td>${APP.badge(v.estado)}</td><td><button class="btn btn--ghost btn--sm" data-ver="${v.id}">Ver</button></td></tr>`).join("")}</tbody></table>` : `<div class="empty-state">No hubo ventas este día.</div>`;
    }
    $("cal-prev").addEventListener("click", () => { ref.setMonth(ref.getMonth() - 1); pintar(); });
    $("cal-next").addEventListener("click", () => { ref.setMonth(ref.getMonth() + 1); pintar(); });
    $("cal-grid").addEventListener("click", ev => { const b = ev.target.closest("[data-day]"); if (!b) return; diaSel = new Date(ref.getFullYear(), ref.getMonth(), +b.dataset.day); pintar(); });
    $("cal-dia-lista").addEventListener("click", ev => { const b = ev.target.closest("[data-ver]"); const f = b && DEMO.ventas.find(x => x.id === b.dataset.ver); if (f) POS_CORE.mostrarRecibo(f); });
    APP.registerPage("estadisticas", () => { diaSel = new Date(); ref.setTime(new Date().setDate(1)); pintar(); });
  }

  document.addEventListener("DOMContentLoaded", () => { initNegocio("autolavado"); initNegocio("barberia"); initEstadisticas(); });
  return {};
})();

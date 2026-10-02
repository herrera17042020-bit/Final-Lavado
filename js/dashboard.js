/* dashboard.js — KPIs y gráficos calculados desde las facturas reales (API.reportes.dashboard).
   Se refresca solo tras cada operación (factura, cliente, saldo, inventario) gracias a los eventos de la API. */
(() => {
  const e = APP.escapeHtml, money = APP.money;
  let charts = {}, token = 0;

  const delta = (a, b) => (b === 0 ? (a > 0 ? { txt: "nuevo", cls: "flat" } : { txt: "sin cambio", cls: "flat" }) : (() => { const p = (a - b) / b * 100; return { txt: `${p >= 0 ? "▲" : "▼"} ${Math.abs(p).toFixed(1)}% vs. período anterior`, cls: p >= 0 ? "up" : "down" }; })());
  const kpi = (ic, label, valor, sub, d) => `<div class="kpi-card"><div class="kpi-card__top"><span class="kpi-card__label">${label}</span><span class="kpi-card__icon">${ic}</span></div>
    <div class="kpi-card__value">${valor}</div>${sub ? `<div class="kpi-card__sub">${sub}</div>` : ""}${d ? `<div class="kpi-card__delta ${d.cls}">${d.txt}</div>` : ""}</div>`;

  async function render() {
    const mi = ++token;
    const { negocioActivo: negocio, periodoActivo: periodo } = APP.state;
    const r = await API.reportes.dashboard({ negocio, periodo, desde: document.getElementById("dash-desde").value, hasta: document.getElementById("dash-hasta").value });
    if (mi !== token) return;                       // llegó una respuesta más nueva
    if (!r.ok) { APP.toast("warning", "No se pudo actualizar el panel", r.error); return; }
    const d = r.data, a = d.actual, ant = d.anterior.resumen, R = a.resumen;
    document.getElementById("dash-periodo-txt").textContent = `${APP.fmtFechaCorta(d.periodo.desde)} – ${APP.fmtFechaCorta(d.periodo.hasta)}`;
    const pagosTxt = a.pagos.filter(p => p.monto > 0).sort((x, y) => y.monto - x.monto).map(p => `${p.label}`)[0] || "—";
    document.getElementById("dash-kpis").innerHTML = [
      kpi("💰", "Ventas del período", money(R.ventasTotales), `Hoy ${money(d.hoy.ventasTotales)} · Mes ${money(d.mes.ventasTotales)}`, delta(R.ventasTotales, ant.ventasTotales)),
      kpi("🧾", "Facturas", R.transacciones, `Ticket promedio ${money(R.ticketPromedio)}`, delta(R.transacciones, ant.transacciones)),
      kpi("🛠️", "Servicios realizados", R.serviciosRealizados, `${R.productosVendidos} producto(s) vendido(s)`, delta(R.serviciosRealizados, ant.serviciosRealizados)),
      kpi("👥", "Clientes atendidos", R.clientesAtendidos, `${R.clientesNuevos} nuevos · ${R.clientesRecurrentes} recurrentes`, delta(R.clientesAtendidos, ant.clientesAtendidos)),
      kpi("🔀", "Pagos mixtos", a.mixtos.cantidad, `${a.mixtos.porcentaje.toFixed(0)}% de las facturas · ${money(a.mixtos.monto)}`, null),
      kpi("🎁", "Premios canjeados", a.fidelidad.premiosDescuento + a.fidelidad.premiosGratis, `${a.fidelidad.premiosGratis} gratis · ${a.fidelidad.premiosDescuento} con descuento · ${a.fidelidad.membresiasVendidas} membresía(s) vendida(s)`, null),
      kpi("📦", "Productos consumidos", R.productosConsumidos, `Inventario saludable: ${d.productosDisponibles} / ${d.productosTotal}`, null),
      kpi("⭐", "Clientes con premio", a.fidelidad.recompensasDisponibles + a.fidelidad.descuentosDisponibles, `${a.fidelidad.membresiasActivas} membresía(s) activa(s) · Pago más usado: ${e(pagosTxt)}`, null),
    ].join("");

    const bajos = d.stockBajo, box = document.getElementById("dash-alerta-inventario");
    box.innerHTML = bajos.length ? bajos.map(p => `<div class="alert-row"><div><strong>${e(p.nombre)}</strong><div class="text-muted small">${APP.ICONO_NEGOCIO[p.negocio]} ${APP.NOMBRE_NEGOCIO[p.negocio]} · mínimo ${p.stockMinimo} ${e(p.unidad)}</div></div><span class="badge badge--danger">${p.stock} ${e(p.unidad)}</span></div>`).join("") : `<div class="empty-mini">No hay productos con stock bajo.</div>`;
    document.getElementById("dash-actividad-reciente").innerHTML = d.actividad.length ? d.actividad.map(ev => ACTIVIDAD.itemEvento(ev, true)).join("") : `<div class="empty-mini">Sin actividad registrada todavía.</div>`;
    graficos(a);
  }

  function opts() { return { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: "#EFE6D6" } }, x: { grid: { display: false } } } }; }
  function graficos(a) {
    Object.values(charts).forEach(c => c && c.destroy()); charts = {};
    if (!window.Chart) {                             // sin Chart.js (p. ej. sin internet) el resto del panel sigue funcionando
      ["chart-ventas-periodo", "chart-ventas-negocio", "chart-servicios-top", "chart-vehiculos", "chart-metodos-pago"].forEach(id => { const c = document.getElementById(id); if (c && c.parentElement) c.parentElement.innerHTML = `<div class="empty-state">Los gráficos requieren conexión a internet (Chart.js). Los indicadores y reportes siguen disponibles.</div>`; });
      return;
    }
    const g = id => document.getElementById(id);
    let serie = a.serie.dia; if (serie.length > 45) serie = a.serie.semana; if (serie.length > 45) serie = a.serie.mes;
    charts.linea = new Chart(g("chart-ventas-periodo"), { type: "line", data: { labels: serie.map(s => s.label), datasets: [{ label: "Ventas (C$)", data: serie.map(s => s.ventas), borderColor: "#D9481F", backgroundColor: "rgba(217,72,31,.10)", fill: true, tension: .35, pointRadius: 2 }] }, options: opts() });
    const nb = ["autolavado", "barberia"].map(n => ({ n, v: a.porNegocio.find(x => x.negocio === n) ? a.porNegocio.find(x => x.negocio === n).ventas : 0 }));
    charts.negocio = new Chart(g("chart-ventas-negocio"), { type: "bar", data: { labels: ["Autolavado", "Barbería"], datasets: [{ data: nb.map(x => x.v), backgroundColor: ["#1F7A78", "#A8281C"], borderRadius: 8 }] }, options: opts() });
    const top = a.servicios.filter(s => s.cantidad > 0).sort((x, y) => y.cantidad - x.cantidad).slice(0, 6);
    charts.serv = new Chart(g("chart-servicios-top"), { type: "bar", data: { labels: top.map(s => s.nombre), datasets: [{ data: top.map(s => s.cantidad), backgroundColor: "#D9481F", borderRadius: 6 }] }, options: { ...opts(), indexAxis: "y" } });
    charts.veh = new Chart(g("chart-vehiculos"), { type: "doughnut", data: { labels: a.vehiculos.map(v => v.tipo), datasets: [{ data: a.vehiculos.map(v => v.cantidad), backgroundColor: ["#D9481F", "#1F7A78", "#A8281C", "#F57B38", "#0F3A3B", "#B9AE9C"] }] }, options: { plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } } }, cutout: "62%" } });
    const pg = a.pagos.filter(p => p.monto > 0);
    charts.pago = new Chart(g("chart-metodos-pago"), { type: "pie", data: { labels: pg.map(p => p.label), datasets: [{ data: pg.map(p => p.monto), backgroundColor: ["#2E8B4E", "#D9481F", "#F57B38", "#1F7A78"] }] }, options: { plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } } } } });
  }
  APP.registerPage("dashboard", render);
})();

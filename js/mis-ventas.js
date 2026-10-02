/* mis-ventas.js — "Mi resumen": el personal ve SOLO sus propias ventas.
   Calendario mensual (ventas por día) + detalle del día: clientes atendidos y formas de pago.
   No muestra estadísticas del negocio. ► Con backend: GET /api/ventas/mias?desde&hasta */
(() => {
  const e = APP.escapeHtml, money = APP.money;
  const $ = id => document.getElementById(id);
  const ref = new Date(); ref.setDate(1); ref.setHours(0, 0, 0, 0);
  let diaSel = new Date(); diaSel.setHours(0, 0, 0, 0);
  const mismo = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
  const ICON = { efectivo: "💵", tarjeta: "💳", transferencia: "🏦" };

  async function pintar() {
    if (APP.state.paginaActual !== "mis-ventas") return;
    const y = ref.getFullYear(), m = ref.getMonth();
    const r = await API.ventas.miasRango({ desde: new Date(y, m, 1), hasta: new Date(y, m + 1, 0, 23, 59, 59, 999) });
    if (!APP.okOToast(r, "No se pudieron cargar tus ventas")) return;
    const neg = $("mv-negocio").value;
    const mes = r.data.filter(v => neg === "todos" || v.negocio === neg);
    const ok = mes.filter(v => v.estado === "Completada");

    // Resumen del mes (solo lo propio)
    const Rm = DEMO.calc.resumenCaja(mes);
    $("mv-kpis-mes").innerHTML = [[Rm.facturas, "Ventas del mes"], [money(Rm.total), "Total vendido en el mes"], [Rm.clientes, "Clientes atendidos (mes)"],
      [new Set(ok.map(v => APP.fmtFechaCorta(v.fecha))).size, "Días con ventas"]].map(([v, l]) => `<div class="kpi-mini"><strong>${v}</strong><span>${l}</span></div>`).join("");

    // Calendario
    $("mv-mes").textContent = ref.toLocaleDateString("es-NI", { month: "long", year: "numeric" });
    const dias = new Date(y, m + 1, 0).getDate(), off = (new Date(y, m, 1).getDay() + 6) % 7;
    const cuenta = {}; ok.forEach(v => { const d = new Date(v.fecha).getDate(); cuenta[d] = (cuenta[d] || 0) + 1; });
    let h = ["L", "M", "M", "J", "V", "S", "D"].map(d => `<div class="mv-cal__dow">${d}</div>`).join("");
    for (let i = 0; i < off; i++) h += `<div class="cal-cell cal-cell--empty"></div>`;
    for (let d = 1; d <= dias; d++) { const f = new Date(y, m, d);
      h += `<button type="button" class="cal-cell ${mismo(f, new Date()) ? "cal-cell--today" : ""} ${mismo(f, diaSel) ? "cal-cell--active" : ""}" data-day="${d}" ${f > new Date() ? "disabled" : ""}><span>${d}</span>${cuenta[d] ? `<em>${cuenta[d]}</em>` : ""}</button>`; }
    $("mv-cal").innerHTML = h;

    // Detalle del día elegido
    const delDia = mes.filter(v => mismo(v.fecha, diaSel)).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    const R = DEMO.calc.resumenCaja(delDia);
    $("mv-dia-titulo").textContent = mismo(diaSel, new Date()) ? `Hoy · ${APP.fmtFechaCorta(diaSel)}` : diaSel.toLocaleDateString("es-NI", { weekday: "long", day: "numeric", month: "long" });
    $("mv-kpis").innerHTML = [[R.facturas, "Ventas"], [money(R.total), "Total"], [R.clientes, "Clientes"], [R.anuladas, "Anuladas"]]
      .map(([v, l]) => `<div class="kpi-mini"><strong>${v}</strong><span>${l}</span></div>`).join("");
    $("mv-metodos").innerHTML = Object.entries(R.porMetodo).map(([k, x]) => `<div class="mv-metodo mv-metodo--${k}"><span>${ICON[k] || "•"} ${e(DEMO.calc.etiquetaMetodo(k))}</span><strong>${money(x.monto)}</strong><small>${x.facturas} cobro${x.facturas === 1 ? "" : "s"}</small></div>`).join("");
    const porCliente = {};
    delDia.filter(v => v.estado === "Completada").forEach(v => { const o = porCliente[v.clienteNombre] = porCliente[v.clienteNombre] || { n: 0, total: 0, hora: v.fecha }; o.n += 1; o.total += v.total; });
    $("mv-clientes").innerHTML = Object.entries(porCliente).map(([n, o]) => `<div class="mv-cliente"><div class="avatar avatar--sm">${e(APP.iniciales(n))}</div><div><strong>${e(n)}</strong><div class="small text-muted">${o.n} venta${o.n === 1 ? "" : "s"} · ${APP.fmtTime(o.hora)}</div></div><span class="num">${money(o.total)}</span></div>`).join("")
      || `<div class="empty-mini">Sin clientes atendidos este día.</div>`;
    $("mv-tabla").innerHTML = delDia.map(v => `<tr>
      <td><strong>${e(v.id)}</strong></td><td>${APP.fmtTime(v.fecha)}</td><td>${APP.ICONO_NEGOCIO[v.negocio]} ${APP.NOMBRE_NEGOCIO[v.negocio]}</td>
      <td>${e(v.clienteNombre)}</td><td>${e(v.servicioNombre)}${v.lineas.length > 1 ? ` <span class="badge badge--muted">${v.lineas.length} líneas</span>` : ""}</td>
      <td>${v.pagos.map(p => `${ICON[p.metodo] || ""} ${e(DEMO.calc.etiquetaMetodo(p.metodo))}${v.pagos.length > 1 ? " " + money(p.monto) : ""}`).join("<br>")}${(v.pagosMembresia || []).map(x => `${v.pagos.length ? "<br>" : ""}🎫 Membresía ${e(x.membresia)}`).join("")}${!v.pagos.length && !(v.pagosMembresia || []).length ? "Sin cobro" : ""}</td>
      <td class="num"><strong>${money(v.total)}</strong>${v.descuento ? `<div class="small pos">−${money(v.descuento)}</div>` : ""}</td>
      <td>${APP.badge(v.estado)}</td><td><button class="btn btn--ghost btn--sm" data-ver="${v.id}">Ver</button></td></tr>`).join("")
      || `<tr><td colspan="9"><div class="empty-state"><strong>No registraste ventas este día</strong>Elige otro día en el calendario.</div></td></tr>`;
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("mv-negocio").addEventListener("change", pintar);
    $("mv-prev").addEventListener("click", () => { ref.setMonth(ref.getMonth() - 1); pintar(); });
    $("mv-next").addEventListener("click", () => { const n = new Date(ref); n.setMonth(n.getMonth() + 1); if (n <= new Date()) { ref.setMonth(ref.getMonth() + 1); pintar(); } });
    $("mv-cal").addEventListener("click", ev => { const b = ev.target.closest("[data-day]"); if (!b || b.disabled) return; diaSel = new Date(ref.getFullYear(), ref.getMonth(), +b.dataset.day); pintar(); });
    $("mv-tabla").addEventListener("click", ev => {
      const b = ev.target.closest("[data-ver]"); if (!b) return;
      const f = DEMO.ventas.find(x => x.id === b.dataset.ver); if (f) POS_CORE.mostrarRecibo(f);
    });
    APP.registerPage("mis-ventas", pintar);
  });
})();

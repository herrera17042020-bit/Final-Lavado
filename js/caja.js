/* ==========================================================================
   caja.js — Cierre de caja diario por área + historial de cierres (administrador).

   Flujo del cierre (personal o administrador):
     1. El sistema muestra lo registrado desde el último cierre de hoy (o las 00:00):
        totales por forma de pago, facturas, anuladas y quién vendió.
     2. Se cuenta el efectivo de la caja (por billetes/monedas o total), dólares al
        tipo de cambio y se anotan los egresos/retiros.
     3. Efectivo esperado = ventas en efectivo − egresos. Si lo contado no coincide,
        se registra como Sobrante/Faltante y la nota es obligatoria.
   Cada cierre queda guardado en DEMO.cierres (► backend: tabla cierre_caja) y se
   consulta en Reportes → Cierres de caja.
   ========================================================================== */
const CAJA = (() => {
  const e = APP.escapeHtml, money = APP.money;
  const ICON = { efectivo: "💵", tarjeta: "💳", transferencia: "🏦" };
  const ESTADO_BADGE = { Cuadrado: "badge--success", Sobrante: "badge--warning", Faltante: "badge--danger" };
  const badgeEstado = s => `<span class="badge ${ESTADO_BADGE[s] || "badge--muted"}">${e(s)}</span>`;
  const signo = n => (n > 0 ? "+" : n < 0 ? "−" : "") + money(Math.abs(n));

  // Estado del formulario por área (se conserva al navegar).
  const form = {};
  const nuevoForm = () => ({ den: {}, nio: "", nioManual: false, usd: "", egresos: [], nota: "", verMetodo: "" });

  // ------------------------------------------------------------------ cierre
  async function pintarCierre(area) {
    const root = document.getElementById(`caja-root-${area}`);
    const r = await API.caja.resumen(area);
    if (!APP.okOToast(r, "No se pudo cargar la caja")) return;
    const d = r.data, R = d.resumen, f = form[area] = form[area] || nuevoForm();
    const den = DEMO.configuracion.caja.denominaciones;
    const listaMetodo = k => d.facturas.filter(x => x.estado === "Completada" && x.pagos.some(p => p.metodo === k));
    root.innerHTML = `
      <div class="caja-periodo card">
        <div><strong>${APP.ICONO_NEGOCIO[area]} Caja de ${APP.NOMBRE_NEGOCIO[area]}</strong>
          <div class="small text-muted">Período: ${d.ultimoCierre ? `desde el cierre ${e(d.ultimoCierre.id)} (${APP.fmtTime(d.ultimoCierre.hasta)}, ${e(d.ultimoCierre.usuario)})` : `desde las 00:00 de hoy`} hasta ahora (${APP.fmtTime(d.hasta)}) · ${APP.fmtFechaCorta(d.hasta)}</div></div>
        <button class="btn btn--ghost btn--sm" data-c="refrescar">↻ Actualizar</button>
      </div>

      <div class="card caja-paso"><div class="pos-step__head"><span class="pos-step__num">1</span><h4>Resumen del sistema · según facturas registradas</h4></div>
        <p class="small text-muted" style="margin:4px 0 12px">Toca una forma de pago para ver sus facturas.</p>
        <div class="caja-metodos">
          ${Object.entries(R.porMetodo).map(([k, x]) => `<button type="button" class="caja-metodo caja-metodo--${k} ${f.verMetodo === k ? "is-open" : ""}" data-c="metodo" data-m="${k}">
            <span>${ICON[k] || ""} ${e(DEMO.calc.etiquetaMetodo(k))}</span><strong>${money(x.monto)}</strong><small>${x.facturas} cobro${x.facturas === 1 ? "" : "s"}</small></button>`).join("")}
          <div class="caja-metodo caja-metodo--total"><span>📊 Total general</span><strong>${money(R.total)}</strong><small>${R.facturas} factura${R.facturas === 1 ? "" : "s"}</small></div>
        </div>
        ${f.verMetodo ? `<div class="caja-detalle-metodo">${tablaFacturas(listaMetodo(f.verMetodo), f.verMetodo)}</div>` : ""}
        <div class="caja-datos">
          <span>👥 Clientes atendidos: <strong>${R.clientes}</strong></span><span>🔀 Pagos mixtos: <strong>${R.mixtas}</strong></span>
          <span>🏷️ Descuentos: <strong>${money(R.descuentos)}</strong></span><span>🚫 Anuladas: <strong>${R.anuladas}</strong></span>${R.sinCobro ? `<span>🎁 Sin cobro (premio): <strong>${R.sinCobro}</strong></span>` : ""}
        </div>
        ${d.porUsuario.length ? `<details class="caja-usuarios"><summary>Ventas por persona que cobró (${d.porUsuario.length})</summary>
          <table class="table table--compact"><thead><tr><th>Usuario</th><th class="num">Facturas</th><th class="num">Efectivo</th><th class="num">Total</th></tr></thead>
          <tbody>${d.porUsuario.map(u => `<tr><td>${e(u.usuario)}</td><td class="num">${u.facturas}</td><td class="num">${money(u.efectivo)}</td><td class="num">${money(u.total)}</td></tr>`).join("")}</tbody></table></details>` : ""}
      </div>

      <div class="card caja-paso"><div class="pos-step__head"><span class="pos-step__num">2</span><h4>Conteo del efectivo en caja</h4></div>
        <p class="small text-muted" style="margin:4px 0 12px">Cuenta billetes y monedas (se suman solos) o escribe el total. Solo se compara el <strong>efectivo</strong>.</p>
        <div class="caja-den">${den.map(v => `<label class="caja-den__item"><span>C$ ${v}</span><input type="number" min="0" step="1" inputmode="numeric" data-den="${v}" value="${f.den[v] || ""}" placeholder="0"><small data-den-sub="${v}">${money((+f.den[v] || 0) * v)}</small></label>`).join("")}</div>
        <div class="form-grid" style="margin-top:12px">
          <label>Total en córdobas (C$)<input type="number" min="0" step="0.01" inputmode="decimal" data-c="nio" value="${f.nio}" placeholder="0.00"></label>
          <label>Dólares en caja (US$)<input type="number" min="0" step="0.01" inputmode="decimal" data-c="usd" value="${f.usd}" placeholder="0.00"><small class="text-muted">Tipo de cambio: C$ ${d.tipoCambio} por US$ 1</small></label>
        </div>
        <div class="caja-egresos">
          <div class="caja-egresos__head"><strong>↘️ Egresos / retiros de efectivo</strong><button type="button" class="btn btn--ghost btn--sm" data-c="add-egreso">＋ Agregar egreso</button></div>
          <p class="small text-muted">¿Sacaron dinero de la caja? (compras, pagos a proveedores…). Se restan del efectivo esperado.</p>
          ${f.egresos.length ? f.egresos.map((x, i) => `<div class="caja-egreso"><input placeholder="Concepto" data-eg="concepto" data-i="${i}" value="${e(x.concepto)}"><input type="number" min="0" step="0.01" placeholder="Monto C$" data-eg="monto" data-i="${i}" value="${e(x.monto)}"><button type="button" class="icon-btn" data-c="del-egreso" data-i="${i}" aria-label="Quitar">✕</button></div>`).join("") : `<div class="empty-mini">Sin egresos registrados.</div>`}
        </div>
      </div>

      <div class="card caja-paso"><div class="pos-step__head"><span class="pos-step__num">3</span><h4>Cuadre de caja</h4></div>
        <div class="caja-cuadre" id="caja-cuadre-${area}"></div>
        <label class="field-inline" style="margin-top:12px">Nota del cierre <span class="small text-muted" id="caja-nota-req-${area}">(opcional)</span><textarea data-c="nota" rows="2" placeholder="Ej.: Sin novedades, turno normal…">${e(f.nota)}</textarea></label>
        <div class="msg msg--danger hidden" id="caja-err-${area}"></div>
        <button class="btn btn--primary btn--block caja-btn" data-c="cerrar">🔒 Cerrar caja</button>
      </div>
      <div id="caja-hoy-${area}"></div>`;
    pintarCuadre(area, d);
    pintarCierresHoy(area);
    root.dataset.tc = d.tipoCambio; root._datos = d;
  }

  function totales(area, d) {
    const f = form[area];
    const nio = Number(f.nio) || 0, usd = Number(f.usd) || 0, tc = d.tipoCambio;
    const egresos = f.egresos.reduce((a, x) => a + (Number(x.monto) || 0), 0);
    const ventasEf = d.resumen.porMetodo.efectivo.monto;
    const esperado = DEMO.calc.redondear(ventasEf - egresos), contado = DEMO.calc.redondear(nio + usd * tc);
    return { nio, usd, tc, egresos, ventasEf, esperado, contado, dif: DEMO.calc.redondear(contado - esperado), hayConteo: f.nio !== "" || f.usd !== "" };
  }
  function pintarCuadre(area, d) {
    const t = totales(area, d), el = document.getElementById(`caja-cuadre-${area}`); if (!el) return;
    const estado = !t.hayConteo ? "" : Math.abs(t.dif) < 0.01 ? "Cuadrado" : t.dif > 0 ? "Sobrante" : "Faltante";
    el.innerHTML = `
      <div class="caja-linea"><span>Ventas en efectivo (sistema)</span><strong>${money(t.ventasEf)}</strong></div>
      <div class="caja-linea"><span>Egresos / retiros</span><strong>− ${money(t.egresos)}</strong></div>
      <div class="caja-linea caja-linea--total"><span>Efectivo esperado en caja</span><strong>${money(t.esperado)}</strong></div>
      <div class="caja-linea"><span>Contado: C$ ${money(t.nio).replace("C$ ", "")}${t.usd ? ` + US$ ${t.usd.toFixed(2)} × ${t.tc}` : ""}</span><strong>${money(t.contado)}</strong></div>
      <div class="caja-resultado caja-resultado--${estado ? estado.toLowerCase() : "pendiente"}">${!estado ? "👆 Ingresa el efectivo contado para ver el cuadre"
        : estado === "Cuadrado" ? "✅ La caja cuadra con el sistema" : `${estado === "Sobrante" ? "⬆️ Sobrante" : "⬇️ Faltante"} de <strong>${money(Math.abs(t.dif))}</strong>`}</div>`;
    const req = document.getElementById(`caja-nota-req-${area}`); if (req) req.textContent = estado && estado !== "Cuadrado" ? "(obligatoria: explica la diferencia)" : "(opcional)";
  }

  function pintarCierresHoy(area) {
    const el = document.getElementById(`caja-hoy-${area}`); if (!el) return;
    const hoy = DEMO.cierres.filter(c => c.area === area && APP.fmtFechaCorta(c.fecha) === APP.fmtFechaCorta(new Date()));
    el.innerHTML = hoy.length ? `<div class="card"><h4>Cierres de hoy en ${APP.NOMBRE_NEGOCIO[area]}</h4><div class="table-wrap"><table class="table table--compact"><thead><tr><th>Cierre</th><th>Hora</th><th>Cerró</th><th class="num">Esperado</th><th class="num">Contado</th><th>Estado</th><th></th></tr></thead>
      <tbody>${hoy.map(c => `<tr><td><strong>${e(c.id)}</strong></td><td>${APP.fmtTime(c.fecha)}</td><td>${e(c.usuario)}</td><td class="num">${money(c.esperado)}</td><td class="num">${money(c.contado.totalNio)}</td><td>${badgeEstado(c.estado)}</td><td><button class="btn btn--ghost btn--sm" data-c="ver-cierre" data-id="${c.id}">Ver</button></td></tr>`).join("")}</tbody></table></div></div>` : "";
  }

  function tablaFacturas(lista, metodo) {
    if (!lista.length) return `<div class="empty-mini">Sin facturas${metodo ? " con este método" : ""}.</div>`;
    return `<div class="table-wrap"><table class="table table--compact"><thead><tr><th>Factura</th><th>Hora</th><th>Cliente</th><th>Cobró</th><th>Forma de pago</th><th class="num">${metodo ? "Monto " + e(DEMO.calc.etiquetaMetodo(metodo)).toLowerCase() : "Total"}</th></tr></thead><tbody>
      ${lista.map(v => `<tr><td>${e(v.id)}${v.estado !== "Completada" ? " " + APP.badge(v.estado) : ""}</td><td>${APP.fmtTime(v.fecha)}</td><td>${e(v.clienteNombre)}</td><td>${e(v.usuario || "—")}</td>
        <td>${v.pagos.map(p => `${ICON[p.metodo] || ""} ${e(DEMO.calc.etiquetaMetodo(p.metodo))}${v.pagos.length > 1 ? " " + money(p.monto) : ""}`).join("<br>")}${(v.pagosMembresia || []).map(x => `${v.pagos.length ? "<br>" : ""}🎫 Membresía ${e(x.membresia)}`).join("")}${!v.pagos.length && !(v.pagosMembresia || []).length ? "Sin cobro" : ""}</td>
        <td class="num">${money(metodo ? v.pagos.filter(p => p.metodo === metodo).reduce((a, p) => a + p.monto, 0) : v.total)}</td></tr>`).join("")}</tbody></table></div>`;
  }

  async function cerrar(area, btn) {
    const root = document.getElementById(`caja-root-${area}`), d = root._datos, f = form[area], t = totales(area, d);
    const err = document.getElementById(`caja-err-${area}`); err.classList.add("hidden");
    if (!t.hayConteo) { err.textContent = "Ingresa el efectivo contado en caja (escribe 0 si no hay efectivo)."; err.classList.remove("hidden"); return; }
    const estado = Math.abs(t.dif) < 0.01 ? "Cuadrado" : t.dif > 0 ? "Sobrante" : "Faltante";
    APP.confirmar(`Vas a cerrar la caja de <strong>${APP.NOMBRE_NEGOCIO[area]}</strong>.<br>Esperado <strong>${money(t.esperado)}</strong> · Contado <strong>${money(t.contado)}</strong> · ${estado}${estado !== "Cuadrado" ? " de " + money(Math.abs(t.dif)) : ""}.<br><span class="small">El cierre quedará guardado y no se puede modificar.</span>`, async () => {
      const r = await API.caja.cerrar({ area, nio: f.nio, usd: f.usd, egresos: f.egresos, nota: f.nota,
        denominaciones: Object.keys(f.den).some(k => +f.den[k] > 0) ? Object.fromEntries(Object.entries(f.den).filter(([, q]) => +q > 0).map(([k, q]) => [k, +q])) : null });
      if (!r.ok) { err.textContent = r.error; err.classList.remove("hidden"); return; }
      form[area] = nuevoForm();
      APP.toast(r.data.estado === "Cuadrado" ? "success" : "warning", `Caja cerrada · ${r.data.estado}`, `${r.data.id} · Contado ${money(r.data.contado.totalNio)}`);
      setTimeout(() => { verCierre(r.data); pintarCierre(area); }, 50);
    }, { titulo: "Confirmar cierre de caja", okText: "Cerrar caja" });
    void btn;
  }

  // ------------------------------------------------------------------ detalle (compartido)
  function detalleHtml(c) {
    const R = c.resumen, facturas = (c.facturas || []).map(id => DEMO.ventas.find(v => v.id === id)).filter(Boolean);
    const den = c.contado.denominaciones;
    return `<div class="cierre-print">
      <div class="cierre-head"><div><strong>EL RÁPIDO · ${APP.NOMBRE_NEGOCIO[c.area].toUpperCase()}</strong><div class="small text-muted">Cierre de caja ${e(c.id)}</div></div>${badgeEstado(c.estado)}</div>
      <div class="cierre-meta small">
        <span><b>Fecha:</b> ${APP.fmtFechaHora(c.fecha)}</span><span><b>Cerró:</b> ${e(c.usuario)}</span>
        <span><b>Período:</b> ${APP.fmtFechaHora(c.desde)} → ${APP.fmtFechaHora(c.hasta)}</span><span><b>Facturas:</b> ${R.facturas}${R.anuladas ? ` (+${R.anuladas} anuladas)` : ""} · <b>Clientes:</b> ${R.clientes}</span>
      </div>
      <h4>Ventas registradas por forma de pago</h4>
      <table class="table table--compact"><tbody>
        ${Object.entries(R.porMetodo).map(([k, x]) => `<tr><td>${ICON[k] || ""} ${e(DEMO.calc.etiquetaMetodo(k))}</td><td class="num">${x.facturas} cobro(s)</td><td class="num">${money(x.monto)}</td></tr>`).join("")}
        <tr class="cierre-total"><td>Total general</td><td class="num">${R.facturas} factura(s)</td><td class="num">${money(R.total)}</td></tr>
        <tr><td class="text-muted">Descuentos aplicados</td><td></td><td class="num">${money(R.descuentos)}</td></tr>
      </tbody></table>
      <h4>Cuadre del efectivo</h4>
      <table class="table table--compact"><tbody>
        <tr><td>Ventas en efectivo</td><td class="num">${money(c.ventasEfectivo)}</td></tr>
        ${c.egresos.map(x => `<tr><td class="text-muted">Egreso: ${e(x.concepto)}</td><td class="num">− ${money(x.monto)}</td></tr>`).join("")}
        <tr class="cierre-total"><td>Efectivo esperado</td><td class="num">${money(c.esperado)}</td></tr>
        <tr><td>Contado en córdobas</td><td class="num">${money(c.contado.nio)}</td></tr>
        ${c.contado.usd ? `<tr><td>Contado en dólares (US$ ${Number(c.contado.usd).toFixed(2)} × ${c.contado.tipoCambio})</td><td class="num">${money(c.contado.usd * c.contado.tipoCambio)}</td></tr>` : ""}
        <tr class="cierre-total"><td>Total contado</td><td class="num">${money(c.contado.totalNio)}</td></tr>
        <tr class="cierre-dif cierre-dif--${c.estado.toLowerCase()}"><td>Diferencia (${e(c.estado)})</td><td class="num">${signo(c.diferencia)}</td></tr>
      </tbody></table>
      ${den ? `<h4>Conteo de billetes y monedas</h4><div class="cierre-den">${Object.entries(den).sort((a, b) => b[0] - a[0]).map(([v, q]) => `<span>C$ ${v} × ${q} = <b>${money(v * q)}</b></span>`).join("")}</div>` : ""}
      ${c.nota ? `<div class="msg msg--info" style="margin-top:10px">📝 ${e(c.nota)}</div>` : ""}
      ${c.porUsuario && c.porUsuario.length ? `<h4>Ventas por persona</h4><table class="table table--compact"><tbody>${c.porUsuario.map(u => `<tr><td>${e(u.usuario)}</td><td class="num">${u.facturas} fact.</td><td class="num">Efectivo ${money(u.efectivo)}</td><td class="num">${money(u.total)}</td></tr>`).join("")}</tbody></table>` : ""}
      <h4>Facturas incluidas (${facturas.length})</h4>${tablaFacturas(facturas)}
    </div>`;
  }
  function verCierre(c) {
    APP.openModal(`Cierre de caja ${e(c.id)}`, detalleHtml(c) + `<div class="form-actions"><button class="btn btn--ghost" id="cc-print">🖨️ Imprimir</button><button class="btn btn--primary" onclick="APP.closeModal()">Cerrar</button></div>`, { size: "modal--lg" });
    document.getElementById("cc-print").onclick = () => window.print();
  }

  // ------------------------------------------------------------------ historial (administrador)
  async function pintarHistorial() {
    if (APP.state.paginaActual !== "cierres") return;
    const $ = id => document.getElementById(id);
    const r = await API.caja.listar({ area: $("cc-area").value, estado: $("cc-estado").value, desde: $("cc-desde").value || null, hasta: $("cc-hasta").value || null });
    if (!APP.okOToast(r, "No se pudieron cargar los cierres")) return;
    const lista = r.data;
    const sum = k => lista.reduce((a, c) => a + k(c), 0);
    $("cc-kpis").innerHTML = [[lista.length, "Cierres"], [lista.filter(c => c.estado === "Cuadrado").length, "Cuadrados"],
      [money(sum(c => c.diferencia < 0 ? -c.diferencia : 0)), `Faltantes (${lista.filter(c => c.estado === "Faltante").length})`],
      [money(sum(c => c.diferencia > 0 ? c.diferencia : 0)), `Sobrantes (${lista.filter(c => c.estado === "Sobrante").length})`]]
      .map(([v, l]) => `<div class="kpi-mini"><strong>${v}</strong><span>${l}</span></div>`).join("");
    $("cc-tabla").innerHTML = lista.map(c => `<tr>
      <td><strong>${e(c.id)}</strong></td><td>${APP.fmtFechaHora(c.fecha)}</td><td>${APP.ICONO_NEGOCIO[c.area]} ${APP.NOMBRE_NEGOCIO[c.area]}</td><td>${e(c.usuario)}</td>
      <td class="num">${c.resumen.facturas}</td><td class="num">${money(c.resumen.total)}</td><td class="num">${money(c.esperado)}</td><td class="num">${money(c.contado.totalNio)}</td>
      <td class="num ${c.diferencia < 0 ? "neg" : c.diferencia > 0 ? "pos" : ""}">${signo(c.diferencia)}</td><td>${badgeEstado(c.estado)}</td>
      <td><button class="btn btn--ghost btn--sm" data-ver="${c.id}">Ver detalle</button></td></tr>`).join("")
      || `<tr><td colspan="11"><div class="empty-state"><strong>No hay cierres con estos filtros</strong>Cambia el área, el estado o las fechas.</div></td></tr>`;
  }

  document.addEventListener("DOMContentLoaded", () => {
    ["autolavado", "barberia"].forEach(area => {
      const root = document.getElementById(`caja-root-${area}`);
      APP.registerPage(`${area}-cierre`, () => pintarCierre(area));
      root.addEventListener("click", ev => {
        const b = ev.target.closest("[data-c]"); if (!b) return;
        const f = form[area], c = b.dataset.c;
        if (c === "refrescar") pintarCierre(area);
        else if (c === "metodo") { f.verMetodo = f.verMetodo === b.dataset.m ? "" : b.dataset.m; pintarCierre(area); }
        else if (c === "add-egreso") { f.egresos.push({ concepto: "", monto: "" }); pintarCierre(area); }
        else if (c === "del-egreso") { f.egresos.splice(+b.dataset.i, 1); pintarCierre(area); }
        else if (c === "cerrar") cerrar(area, b);
        else if (c === "ver-cierre") { const x = DEMO.cierres.find(y => y.id === b.dataset.id); if (x) verCierre(x); }
      });
      root.addEventListener("input", ev => {
        const t = ev.target, f = form[area], d = root._datos; if (!f || !d) return;
        if (t.dataset.den) {
          f.den[t.dataset.den] = t.value;
          const sub = root.querySelector(`[data-den-sub="${t.dataset.den}"]`); if (sub) sub.textContent = money((+t.value || 0) * +t.dataset.den);
          const total = Object.entries(f.den).reduce((a, [v, q]) => a + v * (+q || 0), 0);
          f.nio = total ? String(total) : ""; const inp = root.querySelector('[data-c="nio"]'); if (inp) inp.value = f.nio;
        } else if (t.dataset.c === "nio") f.nio = t.value;
        else if (t.dataset.c === "usd") f.usd = t.value;
        else if (t.dataset.c === "nota") f.nota = t.value;
        else if (t.dataset.eg) f.egresos[+t.dataset.i][t.dataset.eg] = t.value;
        pintarCuadre(area, d);
      });
    });
    ["cc-area", "cc-estado", "cc-desde", "cc-hasta"].forEach(id => document.getElementById(id).addEventListener("change", pintarHistorial));
    document.getElementById("cc-tabla").addEventListener("click", ev => { const b = ev.target.closest("[data-ver]"); if (!b) return; const c = DEMO.cierres.find(x => x.id === b.dataset.ver); if (c) verCierre(c); });
    APP.registerPage("cierres", pintarHistorial);
  });
  return { verCierre, detalleHtml };
})();

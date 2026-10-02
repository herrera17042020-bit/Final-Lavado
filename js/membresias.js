/* ==========================================================================
   membresias.js — Venta y control de MEMBRESÍAS (paquetes prepagados de lavados).

   • Plan (Combo 4 / Combo 8 …) + cliente + lavado + tipo de vehículo → precio del
     paquete = precio del lavado × lavados × (1 − % del plan − % personalizado).
   • La venta genera una factura del autolavado (entra a caja, ventas y reportes).
   • Cuando a ese cliente se le factura ese lavado para ese tipo de vehículo, el POS
     usa la membresía AUTOMÁTICAMENTE (línea C$ 0, consume 1 uso).
   • Personal: vende membresías (también a clientes nuevos) y ve las vigentes; NO edita.
   • Administrador: además ve el registro de ventas y edita los planes (nombre, descuento,
     lavados y días de vigencia) manteniendo el mismo formato de tarjeta.
   ========================================================================== */
(() => {
  const e = APP.escapeHtml, money = APP.money, calc = DEMO.calc;
  const $ = id => document.getElementById(id);
  const ESTADOS = ["Todas", "Activa", "Por vencer", "Agotada", "Vencida"];
  const BADGE = { Activa: "badge--success", "Por vencer": "badge--warning", Agotada: "badge--muted", Vencida: "badge--danger", Anulada: "badge--danger" };
  let filtro = "Activa", vista = "lista";
  const esAdmin = () => AUTH.puede("membresias.editar");
  // Tarjeta del plan en el formato de las membresías del local.
  const planHtml = (p, editable) => `<div class="mb-plan ${p.activo ? "" : "mb-plan--off"}"><div class="mb-plan__top"><strong>${e(p.nombre)}</strong>${editable ? `<button class="btn btn--ghost btn--sm" data-plan-edit="${p.id}">✏️ Editar</button>` : ""}</div>
    <span>Descuento del ${p.descuento}% en lavados. Válido por ${calc.vigenciaTexto(p.dias)}.</span>
    <div><em>🏷️ ${p.descuento} % desc. en total</em><em>💧 ${p.lavados} lavados</em><em>📅 ${p.dias} días${p.dias % 7 === 0 ? ` (${calc.vigenciaTexto(p.dias)})` : ""}</em>${p.activo ? "" : "<em class=\"mb-off\">Inactiva</em>"}</div></div>`;

  function pintar() {
    if (APP.state.paginaActual !== "membresias") return;
    const admin = esAdmin(), planes = DEMO.configuracion.membresias.planes.filter(p => admin || p.activo);
    $("mb-planes").innerHTML = planes.map(p => planHtml(p, admin)).join("");
    $("mb-nuevo-plan").classList.toggle("hidden", !admin);
    $("mb-tabs").classList.toggle("hidden", !admin);
    if (!admin) vista = "lista";
    $("mb-tabs").querySelectorAll("[data-mbtab]").forEach(b => b.classList.toggle("active", b.dataset.mbtab === vista));
    $("mb-vista-lista").classList.toggle("hidden", vista !== "lista");
    $("mb-registro").classList.toggle("hidden", vista !== "registro");
    if (vista === "registro") { pintarRegistro(); return; }
    const todas = DEMO.membresias.filter(m => !m.anulada);
    $("mb-chips").innerHTML = ESTADOS.map(s => `<button class="chip ${filtro === s ? "chip--active" : ""}" data-f="${s}">${s === "Todas" ? "Todas" : s === "Activa" ? "Activas" : s === "Por vencer" ? "Por vencer" : s + "s"} <b>${s === "Todas" ? todas.length : todas.filter(m => calc.estadoMembresia(m) === s).length}</b></button>`).join("");
    const q = $("mb-buscar").value.trim().toLowerCase();
    const lista = todas.filter(m => (filtro === "Todas" || calc.estadoMembresia(m) === filtro) && (!q || m.clienteNombre.toLowerCase().includes(q) || m.id.toLowerCase().includes(q) || String(m.placa || "").toLowerCase().includes(q)));
    $("mb-contador").textContent = `${lista.length} membresía${lista.length === 1 ? "" : "s"}`;
    $("mb-grid").innerHTML = lista.map(m => { const st = calc.estadoMembresia(m), dias = Math.ceil((new Date(m.vence) - new Date()) / 86400000);
      return `<button class="mb-card" data-id="${m.id}">
        <div class="mb-card__top"><div><strong>${e(m.clienteNombre)}</strong><small>${e(m.planNombre)} · ${e(m.id)}</small></div><span class="badge ${BADGE[st]}">${st}</span></div>
        <div class="small text-muted">🚗 ${e(m.vehiculoTipo)} · <strong>${e(m.placa || "s/placa")}</strong> · ${e(m.servicioNombre)}</div>
        <div class="mb-card__row"><span>Lavados</span><strong>${m.usados} / ${m.lavados}</strong></div>
        <div class="loyalty-bar"><div class="loyalty-bar__fill" style="width:${m.usados / m.lavados * 100}%"></div></div>
        <div class="mb-card__row small text-muted"><span>Vence ${APP.fmtFechaCorta(m.vence)}${st === "Activa" || st === "Por vencer" ? ` (${dias} día${dias === 1 ? "" : "s"})` : ""}</span><span>${money(m.total)}</span></div></button>`; }).join("")
      || `<div class="empty-state"><strong>No hay membresías con este filtro</strong>Usa “Vender membresía” para registrar una.</div>`;
  }

  // Registro de ventas de membresías (administrador).
  function pintarRegistro() {
    const lista = [...DEMO.membresias].sort((a, b) => new Date(b.inicio) - new Date(a.inicio));
    const ok = lista.filter(m => !m.anulada), mes = ok.filter(m => new Date(m.inicio).getMonth() === new Date().getMonth() && new Date(m.inicio).getFullYear() === new Date().getFullYear());
    $("mb-registro").innerHTML = `<div class="kpi-mini-grid">${[[ok.length, "Membresías vendidas"], [money(ok.reduce((a, m) => a + m.total, 0)), "Ingresos por membresías"], [mes.length, "Vendidas este mes"], [ok.reduce((a, m) => a + m.usados, 0), "Lavados usados"]]
      .map(([v, l]) => `<div class="kpi-mini"><strong>${v}</strong><span>${l}</span></div>`).join("")}</div>
      <div class="card table-card"><div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Código</th><th>Cliente</th><th>Membresía</th><th>Servicio · vehículo</th><th>Vendida por</th><th>Factura</th><th class="num">Total</th><th>Usos</th><th>Estado</th></tr></thead><tbody>
      ${lista.map(m => { const st = calc.estadoMembresia(m); return `<tr data-id="${m.id}" class="mb-fila"><td>${APP.fmtFechaHora(m.inicio)}</td><td><strong>${e(m.id)}</strong></td><td>${e(m.clienteNombre)}</td><td>${e(m.planNombre)}<div class="small text-muted">${m.descuento}%${m.descExtra ? " + " + m.descExtra + "%" : ""} · vence ${APP.fmtFechaCorta(m.vence)}</div></td>
        <td>${e(m.servicioNombre)} · ${e(m.vehiculoTipo)}<div class="small text-muted">Placa ${e(m.placa || "—")}</div></td><td>${e(m.vendidaPor || "—")}</td><td>${m.facturaId ? e(m.facturaId) : "—"}</td><td class="num">${money(m.total)}</td><td>${m.usados}/${m.lavados}</td><td><span class="badge ${BADGE[st]}">${st}</span></td></tr>`; }).join("")
        || `<tr><td colspan="10"><div class="empty-state">Aún no hay membresías vendidas.</div></td></tr>`}</tbody></table></div></div>`;
  }

  // Editor de plan (administrador): mismo formato de tarjeta con vista previa.
  function editarPlan(id) {
    const p = id ? DEMO.configuracion.membresias.planes.find(x => x.id === id) : { nombre: "", lavados: 4, descuento: 10, dias: 28, activo: true };
    const vendidas = id ? DEMO.membresias.filter(m => m.planId === id && !m.anulada).length : 0;
    APP.openModal(id ? `Editar membresía · ${e(p.nombre)}` : "Nueva membresía", `<form id="mbp" novalidate>
      <div class="form-grid">
        <label>Nombre de la membresía *<input name="nombre" maxlength="40" value="${e(p.nombre)}" placeholder="Ej.: Combo 6 Lavados"></label>
        <label>Cantidad de lavados *<input name="lavados" type="number" min="1" max="50" value="${p.lavados}"></label>
        <label>Premio: descuento en lavados (%) *<input name="descuento" type="number" min="0" max="90" value="${p.descuento}"></label>
        <label>Días de vigencia *<input name="dias" type="number" min="1" max="365" value="${p.dias}"></label>
      </div>
      <label class="checkbox-row" style="margin-top:8px"><input type="checkbox" name="activo" ${p.activo ? "checked" : ""}> Disponible para la venta</label>
      <div class="mbv-label">Vista previa</div><div id="mbp-prev"></div>
      ${vendidas ? `<p class="small text-muted" style="margin-top:8px">Hay ${vendidas} membresía(s) vendidas con este plan: conservan las condiciones con que se vendieron. Los cambios aplican a las nuevas ventas.</p>` : ""}
      <div class="msg msg--danger hidden" id="mbp-err"></div>
      <div class="form-actions"><button type="button" class="btn btn--ghost" data-c>Cancelar</button><button class="btn btn--primary" type="submit">${id ? "Guardar cambios" : "Crear membresía"}</button></div></form>`, { size: "modal--sm" });
    const f = $("mbp"), datos = () => ({ nombre: f.nombre.value, lavados: f.lavados.value, descuento: f.descuento.value, dias: f.dias.value, activo: f.activo.checked });
    const prev = () => { const d = datos(); $("mbp-prev").innerHTML = planHtml({ nombre: d.nombre || "Nombre de la membresía", lavados: +d.lavados || 0, descuento: +d.descuento || 0, dias: Math.max(+d.dias || 0, 1), activo: d.activo }, false); };
    f.addEventListener("input", prev); prev();
    f.querySelector("[data-c]").onclick = APP.closeModal;
    f.onsubmit = async ev => {
      ev.preventDefault();
      const r = await APP.ejecutar(f.querySelector("[type=submit]"), () => API.membresias.guardarPlan(datos(), id || null), "Guardando…");
      if (!r.ok) { const er = $("mbp-err"); er.textContent = r.error; er.classList.remove("hidden"); return; }
      APP.closeModal(); APP.toast("success", id ? "Membresía actualizada" : "Membresía creada", r.data.nombre); pintar();
    };
  }

  function detalle(m) {
    const st = calc.estadoMembresia(m);
    APP.openModal(`Membresía ${e(m.id)}`, `
      <div class="cierre-head"><div><strong>${e(m.planNombre)}</strong><div class="small text-muted">${e(m.clienteNombre)} · ${e(m.servicioNombre)} · ${e(m.vehiculoTipo)} · placa ${e(m.placa || "—")}</div></div><span class="badge ${BADGE[st]}">${st}</span></div>
      <div class="cierre-meta small"><span><b>Vendida:</b> ${APP.fmtFechaHora(m.inicio)} por ${e(m.vendidaPor || "—")}</span><span><b>Vence:</b> ${APP.fmtFechaCorta(m.vence)}</span>
        <span><b>Precio por lavado:</b> ${money(m.precioUnit)}</span><span><b>Descuento:</b> ${m.descuento}%${m.descExtra ? ` + ${m.descExtra}%` : ""}</span>
        <span><b>Total pagado:</b> ${money(m.total)}</span><span><b>Factura:</b> ${m.facturaId ? e(m.facturaId) : "—"}</span></div>
      <h4 style="margin:12px 0 6px">Usos (${m.usados}/${m.lavados})</h4>
      ${m.usos.length ? `<table class="table table--compact"><thead><tr><th>#</th><th>Fecha</th><th>Factura</th></tr></thead><tbody>${m.usos.map((u, i) => `<tr><td>${i + 1}</td><td>${APP.fmtFechaHora(u.fecha)}</td><td>${u.facturaId ? e(u.facturaId) : "—"}</td></tr>`).join("")}</tbody></table>` : `<div class="empty-mini">Aún no se ha usado.</div>`}
      <p class="small text-muted" style="margin-top:10px">Solo para el vehículo placa <strong>${e(m.placa || "—")}</strong>: al facturar “${e(m.servicioNombre)}” a ${e(m.clienteNombre)} con esa placa, se paga con la membresía y se descuenta un uso automáticamente.</p>
      <div class="form-actions">${m.facturaId ? `<button class="btn btn--ghost" id="mb-fac">Ver factura</button>` : ""}<button class="btn btn--primary" onclick="APP.closeModal()">Cerrar</button></div>`, { size: "modal--sm" });
    const b = $("mb-fac"); if (b) b.onclick = () => { const f = DEMO.ventas.find(v => v.id === m.facturaId); if (f) POS_CORE.mostrarRecibo(f); };
  }

  // ---------------- Venta ----------------
  function vender() {
    const planes = DEMO.configuracion.membresias.planes.filter(p => p.activo), lavados = DEMO.servicios.filter(s => s.negocio === "autolavado" && s.categoria === "lavado" && s.estado === "activo");
    if (!planes.length) { APP.toast("warning", "No hay membresías disponibles", "El administrador debe activar al menos un plan."); return; }
    const st = { planId: planes[0].id, nuevo: false, placa: "", clienteId: "", q: "", servicioId: lavados[0] ? lavados[0].id : "", vehiculoTipo: "Sedán", descExtra: 0, metodo: "efectivo" };
    const tc = DEMO.configuracion.caja.tipoCambio;
    APP.openModal("🎫 Vender membresía", `<div id="mbv"></div>`, { size: "modal--sm" });
    const root = $("mbv");
    async function pintarV() {
      const r = st.servicioId ? await API.membresias.cotizar(st) : { ok: false, error: "No hay lavados activos." };
      const c = DEMO.clientes.find(x => x.id === st.clienteId);
      const res = !c ? DEMO.clientes.filter(x => x.estado === "activo" && (!st.q || x.nombre.toLowerCase().includes(st.q.toLowerCase()) || x.telefono.includes(st.q))).slice(0, 5) : [];
      const metodos = ["efectivo", "tarjeta", "transferencia"].filter(k => DEMO.configuracion.metodosPago[k]);
      root.innerHTML = `
        <div class="mbv-label">Plan de membresía</div>
        ${planes.map(p => `<button type="button" class="mbv-plan ${st.planId === p.id ? "is-on" : ""}" data-plan="${p.id}"><strong>${e(p.nombre)}</strong><small>Descuento del ${p.descuento}% en lavados. Válido por ${calc.vigenciaTexto(p.dias)}.</small>
          <div><em>${p.descuento} % dec.</em><em>${p.lavados} lavados</em><em>${calc.vigenciaTexto(p.dias)}</em></div></button>`).join("")}
        <div class="mbv-label">Cliente</div>
        ${c ? `<div class="pos-cliente-item pos-cliente-item--chosen"><div class="avatar avatar--sm">${e(APP.iniciales(c.nombre))}</div><div style="flex:1"><strong>${e(c.nombre)}</strong><div class="small text-muted">${e(c.telefono)}</div></div><button type="button" class="btn btn--ghost btn--sm" data-x="cliente">Cambiar</button></div>`
          : st.nuevo ? `<div class="mbv-nuevo"><input type="text" id="mbv-nn" placeholder="Nombre completo *" maxlength="80" value="${e(st.nn ?? (/\d/.test(st.q) ? "" : st.q))}"><input type="text" id="mbv-nt" placeholder="Teléfono (8888-8888)" value="${e(st.nt ?? (/\d/.test(st.q) ? st.q : ""))}">
              <div class="mbv-nuevo__btns"><button type="button" class="btn btn--ghost btn--sm" data-x="cancelar-nuevo">Cancelar</button><button type="button" class="btn btn--primary btn--sm" data-x="guardar-nuevo">Guardar cliente</button></div></div>`
          : `<input type="text" id="mbv-q" placeholder="Buscar cliente..." value="${e(st.q)}" autocomplete="off"><div class="mbv-res">${res.map(x => `<div class="pos-cliente-item" data-cli="${x.id}"><div class="avatar avatar--sm">${e(APP.iniciales(x.nombre))}</div><div><strong>${e(x.nombre)}</strong><div class="small text-muted">${e(x.telefono)}</div></div></div>`).join("") || '<div class="empty-mini">Sin resultados.</div>'}
            <div class="pos-cliente-item pos-cliente-item--nuevo" data-x="nuevo">＋ Registrar nuevo cliente${st.q ? ` “${e(st.q)}”` : ""}</div></div>`}
        <div class="mbv-label">Servicio</div>
        <select id="mbv-serv">${lavados.map(s => `<option value="${s.id}" ${st.servicioId === s.id ? "selected" : ""}>${e(s.nombre)}</option>`).join("")}</select>
        <div class="mbv-label">Vehículo de la membresía (placa) *</div>
        ${c && c.vehiculos.filter(v => v.placa).length ? `<div class="mbv-placas">${c.vehiculos.filter(v => v.placa).map(v => `<button type="button" class="${DEMO.calc.normPlaca(st.placa) === DEMO.calc.normPlaca(v.placa) ? "is-on" : ""}" data-placa="${e(v.placa)}" data-ptipo="${e(v.tipo)}">🚗 ${e(v.placa)}<small>${e(v.tipo)}${v.marca ? " · " + e(v.marca) : ""}</small></button>`).join("")}</div>` : ""}
        <input type="text" id="mbv-placa" placeholder="Placa / matrícula (ej.: M452310)" maxlength="10" value="${e(st.placa)}" style="text-transform:uppercase">
        <div class="small text-muted" style="margin-top:4px">La membresía solo se podrá usar con este vehículo.</div>
        <div class="mbv-label">Tipo de vehículo</div>
        <div class="mbv-vehs">${DEMO.tiposVehiculo.map(t => `<button type="button" class="${st.vehiculoTipo === t ? "is-on" : ""}" data-veh="${e(t)}">${e(t)}</button>`).join("")}</div>
        <div class="mbv-label">% Descuento personalizado</div>
        <div class="mbv-desc"><input type="number" id="mbv-extra" min="0" max="50" value="${st.descExtra}"><span>%</span></div>
        <div class="mbv-quick">${[0, 5, 10, 15, 20, 25].map(v => `<button type="button" class="${+st.descExtra === v ? "is-on" : ""}" data-extra="${v}">${v} %</button>`).join("")}</div>
        ${r.ok ? `<div class="mbv-precio"><small>Precio del paquete (${r.data.plan.lavados} lavados con ${r.data.pct} % desc.)</small><strong>${money(r.data.total)}</strong>
          <small>${money(r.data.unit)} por lavado · antes ${money(r.data.bruto)} · ~US$ ${(r.data.total / tc).toFixed(2)}</small><small>📅 Vigencia: ${r.data.plan.dias} días (${calc.vigenciaTexto(r.data.plan.dias)})</small></div>`
          : `<div class="msg msg--warning" style="margin-top:12px">${e(r.error)}</div>`}
        <div class="mbv-label">Forma de pago</div>
        <div class="pay-methods">${metodos.map(k => `<button type="button" class="pay-method ${st.metodo === k ? "active" : ""}" data-met="${k}"><span>${DEMO.METODOS[k].icon} ${DEMO.METODOS[k].label}</span></button>`).join("")}</div>
        <div class="msg msg--danger hidden" id="mbv-err"></div>
        <button type="button" class="btn btn--primary btn--block mbv-pagar" id="mbv-pagar" ${r.ok && c ? "" : "disabled"}>💵 Proceder al pago — ${r.ok ? money(r.data.total) : "—"}</button>
        ${!c ? '<div class="small text-muted" style="text-align:center;margin-top:6px">Elige un cliente para continuar.</div>' : ""}`;
      const q = $("mbv-q"); if (q && !root._fx) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
      if (root._fx) { const x = $("mbv-extra"); if (x) x.focus(); root._fx = false; }
    }
    root.addEventListener("click", async ev => {
      const t = ev.target.closest("button, [data-cli], [data-x]"); if (!t) return;
      if (t.dataset.plan) st.planId = t.dataset.plan;
      else if (t.dataset.cli) { st.clienteId = t.dataset.cli; const c = DEMO.clientes.find(x => x.id === st.clienteId); const v = c && c.vehiculos.find(x => x.placa); if (v) { st.placa = v.placa; if (DEMO.tiposVehiculo.includes(v.tipo)) st.vehiculoTipo = v.tipo; } }
      else if (t.dataset.x === "cliente") { st.clienteId = ""; st.placa = ""; }
      else if (t.dataset.x === "nuevo") st.nuevo = true;
      else if (t.dataset.x === "cancelar-nuevo") st.nuevo = false;
      else if (t.dataset.x === "guardar-nuevo") {
        const r = await APP.ejecutar(t, () => API.clientes.crear({ nombre: $("mbv-nn").value, telefono: $("mbv-nt").value, negocioPreferido: "autolavado" }), "Guardando…");
        if (!r.ok) { const er = $("mbv-err"); er.textContent = r.error; er.classList.remove("hidden"); return; }
        st.nuevo = false; st.clienteId = r.data.cliente.id; st.q = ""; st.nn = st.nt = undefined; APP.toast("success", "Cliente registrado", r.data.cliente.nombre);
      }
      else if (t.dataset.veh) st.vehiculoTipo = t.dataset.veh;
      else if (t.dataset.placa) { st.placa = t.dataset.placa; if (DEMO.tiposVehiculo.includes(t.dataset.ptipo)) st.vehiculoTipo = t.dataset.ptipo; }
      else if (t.dataset.extra !== undefined) st.descExtra = +t.dataset.extra;
      else if (t.dataset.met) st.metodo = t.dataset.met;
      else if (t.id === "mbv-pagar") {
        const r = await APP.ejecutar(t, () => API.membresias.vender({ ...st, pagos: [{ metodo: st.metodo, monto: null }] }), "Registrando…");
        if (!r.ok) { const er = $("mbv-err"); er.textContent = r.error; er.classList.remove("hidden"); return; }
        APP.closeModal(); APP.toast("success", "Membresía vendida", `${r.data.membresia.id} · ${r.data.membresia.clienteNombre} · ${money(r.data.membresia.total)}`);
        filtro = "Activa"; pintar(); POS_CORE.mostrarRecibo(r.data.factura, { nueva: true }); return;
      } else return;
      pintarV();
    });
    root.addEventListener("input", ev => {
      if (ev.target.id === "mbv-q") { st.q = ev.target.value; pintarV(); }
      else if (ev.target.id === "mbv-nn") st.nn = ev.target.value;
      else if (ev.target.id === "mbv-placa") { st.placa = ev.target.value.toUpperCase(); root.querySelectorAll("[data-placa]").forEach(b => b.classList.toggle("is-on", DEMO.calc.normPlaca(b.dataset.placa) === DEMO.calc.normPlaca(st.placa))); }
      else if (ev.target.id === "mbv-nt") st.nt = ev.target.value;
      else if (ev.target.id === "mbv-extra") { st.descExtra = ev.target.value; root._fx = true; clearTimeout(root._t); root._t = setTimeout(pintarV, 350); }
    });
    root.addEventListener("change", ev => { if (ev.target.id === "mbv-serv") { st.servicioId = ev.target.value; pintarV(); } });
    pintarV();
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("mb-vender").addEventListener("click", vender);
    $("mb-nuevo-plan").addEventListener("click", () => editarPlan(null));
    $("mb-planes").addEventListener("click", ev => { const b = ev.target.closest("[data-plan-edit]"); if (b) editarPlan(b.dataset.planEdit); });
    $("mb-tabs").addEventListener("click", ev => { const b = ev.target.closest("[data-mbtab]"); if (b) { vista = b.dataset.mbtab; pintar(); } });
    $("mb-registro").addEventListener("click", ev => { const r = ev.target.closest(".mb-fila"); if (!r) return; const m = DEMO.membresias.find(x => x.id === r.dataset.id); if (m) detalle(m); });
    $("mb-buscar").addEventListener("input", pintar);
    $("mb-chips").addEventListener("click", ev => { const b = ev.target.closest("[data-f]"); if (b) { filtro = b.dataset.f; pintar(); } });
    $("mb-grid").addEventListener("click", ev => { const b = ev.target.closest("[data-id]"); if (!b) return; const m = DEMO.membresias.find(x => x.id === b.dataset.id); if (m) detalle(m); });
    APP.registerPage("membresias", pintar);
  });
})();

/* ==========================================================================
   fidelidad.js — LEALTAD por programas (sin dinero ni tarjetas NFC).

   Cada programa sigue un servicio (Premium, Nítido). Cada lavada facturada de ese
   servicio suma 1 al cliente AUTOMÁTICAMENTE. Al llegar a meta1 el cliente elige
   un premio intermedio (gratis o % de descuento); a meta2 recibe el premio final
   y el ciclo vuelve a 0. Los premios se canjean en la venta (POS).
   • Administrador: ve todo (indicadores, lista de clientes), EDITA los programas
     (nombre, lavado que suma, metas, premios) y puede AJUSTAR el progreso de un cliente.
   • Empleado: solo BUSCA un cliente (nombre, teléfono o placa) y ve su seguimiento.
   ========================================================================== */
const FIDELIDAD = (() => {
  const e = APP.escapeHtml, money = APP.money, calc = DEMO.calc;
  const $ = id => document.getElementById(id);
  let sel = null, tab = "progreso";
  const esAdmin = () => AUTH.puede("lealtad.editar");
  const coincide = (c, q) => !q || c.nombre.toLowerCase().includes(q) || c.telefono.replace(/\D/g, "").includes(q.replace(/\D/g, "") || "§")
    || c.vehiculos.some(v => calc.normPlaca(v.placa).toLowerCase().includes(calc.normPlaca(q).toLowerCase()));

  // Sellos del ciclo con regalo en la meta intermedia y en la final.
  function sellos(x) {
    const p = x.programa;
    return `<div class="lt-sellos">${Array.from({ length: p.meta2 }, (_, i) => { const n = i + 1, on = n <= x.lavadas, gift = n === p.meta1 || n === p.meta2;
      return `<span class="lt-sello ${on ? "is-on" : ""} ${gift ? "lt-sello--gift" : ""}" title="${n === p.meta1 ? "Premio a elegir" : n === p.meta2 ? "Premio final" : "Lavada " + n}">${gift ? "🎁" : n}</span>`; }).join("")}</div>`;
  }
  function tarjetaPrograma(x) {
    const p = x.programa;
    const sig = x.lavadas < p.meta1 ? `${x.faltan1} lavada${x.faltan1 === 1 ? "" : "s"} para elegir premio` : x.lavadas < p.meta2 ? `${x.faltan2} lavada${x.faltan2 === 1 ? "" : "s"} para ${e(calc.nombrePremio(p.premio2))}` : "¡Premio final disponible!";
    return `<div class="lt-prog lt-prog--${p.id}">
      <div class="lt-prog__head"><span class="lt-prog__ic">${p.icono}</span><div style="flex:1"><h3>${e(p.nombre)}</h3><small>${x.total} lavadas acumuladas · Ciclo #${x.ciclo}</small></div>
        ${esAdmin() && sel ? `<button class="btn btn--sm lt-prog__btn" data-lt-ajustar="${p.id}">± Ajustar</button>` : ""}</div>
      <div class="lt-prog__body">
        <div class="lt-prog__row"><strong>Lavadas en ciclo actual</strong><strong class="lt-prog__num">${x.lavadas}/${p.meta2}</strong></div>
        <div class="loyalty-bar"><div class="loyalty-bar__fill" style="width:${x.pct}%"></div></div>
        <div class="lt-prog__row small text-muted"><span>${Math.round(x.pct)} % del ciclo completado</span><span>${sig}</span></div>
        <div class="lt-sub">Progreso del ciclo</div>${sellos(x)}
        <div class="lt-sub">Recompensas del programa</div>
        <div class="lt-premio ${x.disp1 ? "is-on" : ""}"><span>🎁 ${p.meta1} lavadas → Elige: ${p.opciones1.map(o => e(calc.nombrePremio(o))).join(" ó ")}</span><small>${x.disp1 ? "✅ Disponible" : x.canje1 ? "Canjeado este ciclo" : x.faltan1 + " restantes"}</small></div>
        <div class="lt-premio ${x.disp2 ? "is-on" : ""}"><span>🎁 ${p.meta2} lavadas → ${e(calc.nombrePremio(p.premio2))}</span><small>${x.disp2 ? "✅ Disponible" : x.faltan2 + " restantes"}</small></div>
      </div></div>`;
  }

  function pintarDetalle() {
    const box = $("lt-detalle"); if (!box) return;
    const c = sel && DEMO.clientes.find(x => x.id === sel);
    if (!c) { box.innerHTML = ""; return; }
    const est = calc.estadoLealtad(c), movs = DEMO.lealtadMovs.filter(m => m.clienteId === c.id), canjes = movs.filter(m => m.tipo === "canje");
    const mbs = DEMO.membresias.filter(m => m.clienteId === c.id && !m.anulada);
    const nombreProg = id => (DEMO.configuracion.lealtad.programas.find(p => p.id === id) || { nombre: id }).nombre;
    const tabla = lista => lista.length ? `<div class="table-wrap"><table class="table table--compact"><thead><tr><th>Fecha</th><th>Programa</th><th>Movimiento</th><th>Detalle</th><th class="num">Ciclo</th></tr></thead><tbody>${lista.map(m => `<tr>
      <td>${APP.fmtFechaHora(m.fecha)}</td><td>${e(nombreProg(m.programaId))}</td><td><span class="tipo-mov tipo-mov--${m.tipo === "canje" ? "canje" : m.tipo === "reversion" ? "consumo" : "acumulacion"}">${m.tipo === "canje" ? "Canje" : m.tipo === "reversion" ? "Reversión" : m.tipo === "ajuste" ? "Ajuste" : "Lavada"}</span></td>
      <td>${e(m.concepto)}</td><td class="num">${m.lavadas != null ? `${m.lavadas} · #${m.ciclo}` : "—"}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty-state">Sin movimientos todavía.</div>`;
    box.innerHTML = `<div class="card lt-cliente">
      <div class="lt-cliente__head"><div class="cell-user"><div class="avatar">${e(APP.iniciales(c.nombre))}</div><div><strong>${e(c.nombre)}</strong><div class="small text-muted">${e(c.telefono)}${c.vehiculos.filter(v => v.placa).map(v => ` · 🚗 ${e(v.placa)}`).join("")} · ${c.visitas} visitas${mbs.length ? ` · 🎫 ${mbs.filter(m => ["Activa", "Por vencer"].includes(calc.estadoMembresia(m))).length} membresía(s) vigente(s)` : ""}</div></div></div>
        <button class="btn btn--ghost btn--sm" data-lt="cerrar">✕ Cerrar</button></div>
      <div class="lt-tabs">${[["progreso", "📊 Progreso"], ["historial", `🕒 Historial <b>${movs.length}</b>`], ["canjes", `🧾 Canjes <b>${canjes.length}</b>`]].map(([k, l]) => `<button class="${tab === k ? "active" : ""}" data-lt-tab="${k}">${l}</button>`).join("")}</div>
      ${tab === "progreso" ? `<div class="lt-progs">${est.map(tarjetaPrograma).join("")}</div>` : tab === "historial" ? tabla(movs) : tabla(canjes)}
    </div>`;
  }

  // Resumen de los programas (administrador): reglas actuales con botón para editarlas.
  function pintarProgramasAdmin() {
    const box = $("lt-programas-admin");
    if (!esAdmin()) { box.innerHTML = ""; return; }
    box.innerHTML = `<div class="lt-reglas">${DEMO.configuracion.lealtad.programas.map(p => `<div class="lt-regla lt-regla--${p.id}">
      <div class="lt-regla__head"><span>${p.icono}</span><strong>${e(p.nombre)}</strong><button class="btn btn--ghost btn--sm" data-lt-editar="${p.id}">✏️ Editar</button></div>
      <div class="small">Suma con: <b>${e((DEMO.servicios.find(x => x.id === p.servicioId) || {}).nombre || "—")}</b></div>
      <div class="small">🎁 ${p.meta1} lavadas → elige: ${p.opciones1.map(o => e(calc.nombrePremio(o))).join(" ó ")}</div>
      <div class="small">🎁 ${p.meta2} lavadas → ${e(calc.nombrePremio(p.premio2))}</div></div>`).join("")}</div>`;
  }

  // Editor de un programa (administrador).
  function editarPrograma(id) {
    const p = DEMO.configuracion.lealtad.programas.find(x => x.id === id);
    const opts = (sel, soloLavados) => DEMO.servicios.filter(x => x.negocio === "autolavado" && x.estado === "activo" && (!soloLavados || x.categoria === "lavado")).map(x => `<option value="${x.id}" ${x.id === sel ? "selected" : ""}>${e(x.nombre)}</option>`).join("");
    APP.openModal(`Editar ${e(p.nombre)}`, `<form id="ltp" novalidate><div class="form-grid">
      <label>Nombre del programa *<input name="nombre" maxlength="40" value="${e(p.nombre)}"></label>
      <label>Ícono<input name="icono" maxlength="4" value="${e(p.icono)}"></label>
      <label>Lavado que suma lavadas *<select name="servicioId">${opts(p.servicioId, true)}</select></label>
      <label>Lavadas para elegir premio *<input name="meta1" type="number" min="1" max="58" value="${p.meta1}"></label>
      <label>Opción A: servicio GRATIS<select name="op1">${opts(p.opciones1[0].servicioId)}</select></label>
      <label>Opción B: % de descuento<input name="pct" type="number" min="1" max="100" value="${p.opciones1[1].pct}"></label>
      <label>Opción B: descuento en<select name="op2">${opts(p.opciones1[1].servicioId)}</select></label>
      <label>Lavadas para el premio final *<input name="meta2" type="number" min="2" max="60" value="${p.meta2}"></label>
      <label>Premio final (GRATIS)<select name="final">${opts(p.premio2.servicioId)}</select></label></div>
      <p class="small text-muted" style="margin-top:8px">Los cambios aplican a las próximas facturas. El progreso de los clientes se conserva (si la meta final baja, se ajusta al nuevo máximo).</p>
      <div class="msg msg--danger hidden" id="ltp-err"></div>
      <div class="form-actions"><button type="button" class="btn btn--ghost" data-c>Cancelar</button><button class="btn btn--primary" type="submit">Guardar cambios</button></div></form>`, { size: "modal--lg" });
    const f = $("ltp"); f.querySelector("[data-c]").onclick = APP.closeModal;
    f.onsubmit = async ev => {
      ev.preventDefault();
      const d = Object.fromEntries(["nombre", "icono", "servicioId", "meta1", "op1", "pct", "op2", "meta2", "final"].map(k => [k, f[k].value]));
      const r = await APP.ejecutar(f.querySelector("[type=submit]"), () => API.lealtad.guardarPrograma(id, d), "Guardando…");
      if (!r.ok) { const er = $("ltp-err"); er.textContent = r.error; er.classList.remove("hidden"); return; }
      APP.closeModal(); APP.toast("success", "Programa actualizado", r.data.nombre); pintarPagina();
    };
  }

  // Ajuste manual del progreso de un cliente (administrador).
  function ajustar(programaId) {
    const c = DEMO.clientes.find(x => x.id === sel), x = calc.estadoLealtad(c).find(y => y.programa.id === programaId), p = x.programa;
    APP.openModal(`Ajustar ${e(p.nombre)} · ${e(c.nombre)}`, `<form id="lta" novalidate>
      <p class="small text-muted">Actualmente: <strong>${x.lavadas}/${p.meta2}</strong> lavadas · ciclo #${x.ciclo}${x.canje1 ? " · premio intermedio ya canjeado" : ""}</p>
      <div class="form-grid"><label>Lavadas en el ciclo actual<input name="lavadas" type="number" min="0" max="${p.meta2}" value="${x.lavadas}"></label>
      <label>Motivo *<input name="motivo" maxlength="80" placeholder="Ej.: lavada no registrada el lunes"></label></div>
      <label class="checkbox-row"><input type="checkbox" name="canje1" ${x.canje1 ? "checked" : ""}> El premio de las ${p.meta1} lavadas ya fue canjeado en este ciclo</label>
      <div class="msg msg--danger hidden" id="lta-err"></div>
      <div class="form-actions"><button type="button" class="btn btn--ghost" data-c>Cancelar</button><button class="btn btn--primary" type="submit">Guardar ajuste</button></div></form>`, { size: "modal--sm" });
    const f = $("lta"); f.querySelector("[data-c]").onclick = APP.closeModal;
    f.onsubmit = async ev => {
      ev.preventDefault();
      const r = await APP.ejecutar(f.querySelector("[type=submit]"), () => API.lealtad.ajustar({ clienteId: c.id, programaId, lavadas: f.lavadas.value, canje1: f.canje1.checked, motivo: f.motivo.value }), "Guardando…");
      if (!r.ok) { const er = $("lta-err"); er.textContent = r.error; er.classList.remove("hidden"); return; }
      APP.closeModal(); APP.toast("success", "Progreso ajustado", `${p.nombre}: ${r.data.lavadas}/${p.meta2}`); pintarPagina();
    };
  }

  function pintarPagina(params) {
    if (APP.state.paginaActual !== "fidelidad") return;
    if (params && params.clienteId) { sel = params.clienteId; tab = "progreso"; }
    const admin = esAdmin();
    document.querySelectorAll("#page-fidelidad .lt-solo-admin").forEach(x => x.classList.toggle("hidden", !admin));
    const q = $("lt-buscar").value.trim().toLowerCase();
    pintarProgramasAdmin();

    if (!admin) {
      // EMPLEADO: búsqueda simple + seguimiento del cliente elegido (sin indicadores del negocio).
      $("lt-kpis").innerHTML = "";
      const res = q.length >= 2 ? DEMO.clientes.filter(c => c.estado === "activo" && coincide(c, q)).slice(0, 8) : [];
      $("lt-resultados").innerHTML = q.length >= 2 ? (res.map(c => { const est = calc.estadoLealtad(c);
        return `<button type="button" class="lt-res ${sel === c.id ? "is-on" : ""}" data-c="${c.id}"><div class="avatar avatar--sm">${e(APP.iniciales(c.nombre))}</div>
          <div><strong>${e(c.nombre)}</strong><small>${e(c.telefono)}${c.vehiculos.filter(v => v.placa).map(v => " · 🚗 " + e(v.placa)).join("")}</small></div>
          <span>${est.map(x => `${x.programa.icono} ${x.lavadas}/${x.programa.meta2}`).join(" · ")}</span></button>`; }).join("")
        || `<div class="empty-mini">No se encontró ningún cliente con “${e(q)}”.</div>`) : "";
      $("lt-vacio").innerHTML = sel ? "" : `<div class="lt-vacio"><div class="lt-vacio__ic">⭐</div><h3>Busca un cliente</h3><p>Escribe el nombre, teléfono o placa del cliente para ver su progreso en el programa de lealtad.</p></div>`;
      pintarDetalle(); return;
    }

    // ADMINISTRADOR: indicadores + lista completa (filtrada por la búsqueda).
    $("lt-resultados").innerHTML = ""; $("lt-vacio").innerHTML = "";
    const progs = DEMO.configuracion.lealtad.programas;
    $("lt-th-p1").textContent = progs[0] ? `${progs[0].icono} ${progs[0].nombre.replace("Programa ", "")}` : "";
    $("lt-th-p2").textContent = progs[1] ? `${progs[1].icono} ${progs[1].nombre.replace("Programa ", "")}` : "";
    const f = $("lt-filtro").value;
    const filas = DEMO.clientes.map(c => ({ c, est: calc.estadoLealtad(c), pr: calc.premiosDisponibles(c), mbs: calc.membresiasVigentes(c.id) }))
      .filter(x => coincide(x.c, q) && (!f || (f === "premio" ? x.pr.length : f === "membresia" ? x.mbs.length : x.est.some(y => y.lavadas > 0))))
      .sort((a, b) => b.pr.length - a.pr.length || b.est.reduce((s2, y) => s2 + y.lavadas, 0) - a.est.reduce((s2, y) => s2 + y.lavadas, 0));
    const todos = DEMO.clientes.map(c => calc.estadoLealtad(c));
    $("lt-kpis").innerHTML = [
      [todos.filter(e2 => e2.some(y => y.disp1)).length, "Con premio a elegir"], [todos.filter(e2 => e2.some(y => y.disp2)).length, "Con premio final"],
      [DEMO.lealtadMovs.filter(m => m.tipo === "canje" && new Date(m.fecha).getMonth() === new Date().getMonth()).length, "Canjes este mes"],
      [DEMO.membresias.filter(m => ["Activa", "Por vencer"].includes(calc.estadoMembresia(m))).length, "Membresías vigentes"],
    ].map(([v, l]) => `<div class="kpi-mini"><strong>${v}</strong><span>${l}</span></div>`).join("");
    $("lt-contador").textContent = `${filas.length} cliente${filas.length === 1 ? "" : "s"} · Las lavadas se suman solas al facturar el lavado de cada programa`;
    const celda = y => `<div class="loyalty-bar loyalty-bar--table"><div class="loyalty-bar__fill" style="width:${y.pct}%"></div></div><span class="small text-muted">${y.lavadas}/${y.programa.meta2} · ciclo #${y.ciclo}</span>`;
    $("lt-tabla").innerHTML = filas.map(({ c, est, pr, mbs }) => `<tr class="${sel === c.id ? "is-selected" : ""}">
      <td><div class="cell-user"><div class="avatar avatar--sm">${e(APP.iniciales(c.nombre))}</div><div><strong>${e(c.nombre)}</strong><div class="small text-muted">${e(c.telefono)}</div></div></div></td>
      ${est.slice(0, 2).map(y => `<td>${celda(y)}</td>`).join("")}
      <td>${pr.length ? pr.map(p => `<span class="badge badge--success" style="margin:1px">${e(p.nombre)}</span>`).join("") : '<span class="text-muted small">—</span>'}</td>
      <td>${mbs.length ? mbs.map(m => `<span class="badge badge--info" style="margin:1px">${e(m.servicioNombre)} ${m.usados}/${m.lavados}</span>`).join("") : '<span class="text-muted small">—</span>'}</td>
      <td class="table-actions"><button class="btn btn--ghost btn--sm" data-c="${c.id}">Ver progreso</button></td></tr>`).join("")
      || `<tr><td colspan="6"><div class="empty-state"><strong>No hay clientes con estos filtros</strong>Cambia la búsqueda o el filtro.</div></td></tr>`;
    pintarDetalle();
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("lt-buscar").addEventListener("input", () => pintarPagina());
    $("lt-filtro").addEventListener("change", () => pintarPagina());
    const elegir = id => { sel = id; tab = "progreso"; pintarPagina(); const d = $("lt-detalle"); if (d) d.scrollIntoView({ behavior: "smooth", block: "start" }); };
    $("lt-tabla").addEventListener("click", ev => { const b = ev.target.closest("[data-c]"); if (b) elegir(b.dataset.c); });
    $("lt-resultados").addEventListener("click", ev => { const b = ev.target.closest("[data-c]"); if (b) { $("lt-buscar").value = ""; elegir(b.dataset.c); } });
    $("lt-buscar").addEventListener("keydown", ev => { if (ev.key === "Enter") { const b = $("lt-resultados").querySelector("[data-c]"); if (b) b.click(); } });
    $("lt-programas-admin").addEventListener("click", ev => { const b = ev.target.closest("[data-lt-editar]"); if (b) editarPrograma(b.dataset.ltEditar); });
    $("lt-detalle").addEventListener("click", ev => {
      const t = ev.target.closest("[data-lt-tab]"); if (t) { tab = t.dataset.ltTab; pintarDetalle(); return; }
      const aj = ev.target.closest("[data-lt-ajustar]"); if (aj) { ajustar(aj.dataset.ltAjustar); return; }
      if (ev.target.closest('[data-lt="cerrar"]')) { sel = null; pintarPagina(); }
    });
    APP.registerPage("fidelidad", pintarPagina);
  });
  // Compatibilidad con módulos anteriores (terminal NFC ya no se usa).
  return { tablaMovimientos: () => "", tarjetaVisual: () => "", abrirDetalle: id => APP.goTo("fidelidad", { clienteId: id }), sellos: () => "", premiosHtml: () => "" };
})();

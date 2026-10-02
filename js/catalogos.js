/* catalogos.js — Servicios, promociones y empleados. Todo cambio pasa por API.catalogos.* (validación + actividad). */
(() => {
  const e = APP.escapeHtml, money = APP.money;

  // Modal de formulario reutilizable: valida en la API, muestra el error dentro del modal y refresca la lista.
  function formModal(titulo, campos, textoOk, guardar, alGuardar, size) {
    APP.openModal(titulo, `<form id="cat-f" novalidate>${campos}<div class="msg msg--danger hidden" id="cat-err"></div>
      <div class="form-actions"><button type="button" class="btn btn--ghost" data-c>Cancelar</button><button class="btn btn--primary" type="submit">${textoOk}</button></div></form>`, size ? { size } : {});
    const f = document.getElementById("cat-f"); f.querySelector("[data-c]").onclick = APP.closeModal;
    f.onsubmit = async ev => {
      ev.preventDefault();
      const r = await APP.ejecutar(f.querySelector("[type=submit]"), () => guardar(f), "Guardando…");
      if (!r.ok) { const er = document.getElementById("cat-err"); er.textContent = r.error; er.classList.remove("hidden"); return; }
      APP.closeModal(); alGuardar(r.data);
    };
  }

  // ------------------------- SERVICIOS -------------------------
  function renderServicios(negocio) {
    const admin = AUTH.puede("catalogos.editar");
    document.getElementById(`serv-root-${negocio}`).innerHTML = `
      <div class="toolbar"><input type="text" id="serv-buscar-${negocio}" placeholder="Buscar servicio...">${admin ? `<button class="btn btn--primary" id="serv-nuevo-${negocio}">+ Nuevo servicio</button>` : ""}</div>
      <div class="card table-card"><div class="table-wrap"><table class="table">
        <thead><tr><th>Nombre</th><th>Descripción</th><th>Precio</th><th>Duración</th><th>Fidelidad</th><th>Consume</th><th>Estado</th><th></th></tr></thead><tbody id="serv-tabla-${negocio}"></tbody></table></div></div>`;
    document.getElementById(`serv-buscar-${negocio}`).addEventListener("input", () => pintarServicios(negocio));
    const nuevo = document.getElementById(`serv-nuevo-${negocio}`); if (nuevo) nuevo.addEventListener("click", () => formServicio(negocio));
    document.getElementById(`serv-tabla-${negocio}`).addEventListener("click", async ev => {
      const b = ev.target.closest("button[data-a]"); if (!b) return;
      if (b.dataset.a === "editar") return formServicio(negocio, b.dataset.id);
      if (b.dataset.a === "eliminar") { const s = DEMO.servicios.find(x => x.id === b.dataset.id); return APP.confirmarEliminar(s.nombre, "El servicio dejará de aparecer en ventas y catálogo.", () => API.eliminar.servicio(s.id), () => pintarServicios(negocio)); }
      const r = await APP.ejecutar(b, () => API.catalogos.alternarServicio(b.dataset.id));
      if (APP.okOToast(r)) { APP.toast("success", `Servicio ${r.data.estado === "activo" ? "activado" : "desactivado"}`, r.data.nombre); pintarServicios(negocio); }
    });
    pintarServicios(negocio);
  }
  // Precio a mostrar en el catálogo: único, por tipo de vehículo o pendiente.
  function precioTexto(s) {
    if (s.preciosVehiculo) return Object.entries(s.preciosVehiculo).map(([t, v]) => `<div class="small"><span class="text-muted">${e(t)}</span> ${money(v)}</div>`).join("");
    return Number(s.precioBase) > 0 ? money(s.precioBase) : '<span class="badge badge--warning">Por definir</span>';
  }
  function pintarServicios(negocio) {
    const q = (document.getElementById(`serv-buscar-${negocio}`).value || "").toLowerCase(), admin = AUTH.puede("catalogos.editar");
    const orden = { lavado: 0, extra: 1 };
    const lista = DEMO.servicios.filter(s => s.negocio === negocio && (!q || s.nombre.toLowerCase().includes(q))).sort((a, b) => (orden[a.categoria] ?? 2) - (orden[b.categoria] ?? 2));
    document.getElementById(`serv-tabla-${negocio}`).innerHTML = lista.map(s => `<tr>
      <td><strong>${e(s.nombre)}</strong>${s.categoria ? `<div>${s.categoria === "extra" ? '<span class="badge badge--info">Extra</span>' : '<span class="badge badge--brand">Lavado</span>'}</div>` : ""}</td><td class="text-muted small">${e(s.descripcion)}</td><td class="num">${precioTexto(s)}</td><td>${s.duracion ? s.duracion + " min" : "—"}</td><td>${s.generaFidelidad ? "✅ Sí" : "— No"}</td>
      <td class="small text-muted">${(s.consumo || []).map(c => { const p = DEMO.productos.find(x => x.id === c.producto); return p ? `${e(p.nombre)} ×${c.cantidad}` : ""; }).filter(Boolean).join(", ") || "—"}</td><td>${APP.badge(s.estado)}</td>
      <td class="table-actions">${admin ? `<button class="icon-btn" title="Editar" aria-label="Editar" data-a="editar" data-id="${s.id}">✏️</button><button class="icon-btn" title="${s.estado === "activo" ? "Desactivar" : "Activar"}" aria-label="Cambiar estado" data-a="toggle" data-id="${s.id}">${s.estado === "activo" ? "⏸️" : "▶️"}</button><button class="icon-btn icon-btn--danger" title="Eliminar" aria-label="Eliminar" data-a="eliminar" data-id="${s.id}">🗑</button>` : ""}</td></tr>`).join("")
      || `<tr><td colspan="8"><div class="empty-state">Sin servicios registrados.</div></td></tr>`;
  }
  function formServicio(negocio, id) {
    const s = id ? DEMO.servicios.find(x => x.id === id) : null, prods = DEMO.productos.filter(p => p.negocio === negocio);
    const uso = pid => ((s && s.consumo || []).find(c => c.producto === pid) || {}).cantidad || 0;
    const auto = negocio === "autolavado", porVeh = !!(s && s.preciosVehiculo);
    formModal(s ? "Editar servicio" : "Nuevo servicio", `<div class="form-grid">
      <label>Nombre *<input name="nombre" value="${s ? e(s.nombre) : ""}" maxlength="60"></label><label>Descripción<input name="descripcion" value="${s ? e(s.descripcion) : ""}"></label>
      ${auto ? `<label>Tipo de servicio<select name="categoria"><option value="lavado" ${s && s.categoria === "extra" ? "" : "selected"}>Lavado</option><option value="extra" ${s && s.categoria === "extra" ? "selected" : ""}>Servicio extra</option></select></label>` : ""}
      <label>Precio (C$) *<input name="precio" type="number" min="0" step="0.01" value="${s ? (Number(s.precioBase) > 0 ? s.precioBase : "") : 100}" placeholder="Escribe el precio" ${porVeh ? "disabled" : ""}></label><label>Duración (min)<input name="duracion" type="number" min="0" value="${s ? s.duracion : 20}"></label>
      ${auto ? `<label class="checkbox-row"><input type="checkbox" name="porveh" ${porVeh ? "checked" : ""}> Precio según tipo de vehículo</label>` : ""}
      <label class="checkbox-row"><input type="checkbox" name="fid" ${s ? (s.generaFidelidad ? "checked" : "") : "checked"}> Genera fidelidad</label></div>
      ${auto ? `<div id="cat-precios-veh" class="${porVeh ? "" : "hidden"}"><h4 style="margin:12px 0 4px">Precio por tipo de vehículo (C$)</h4><div class="form-grid">${DEMO.tiposVehiculo.map(t => `<label>${e(t)}<input type="number" min="0" step="0.01" data-pveh="${e(t)}" value="${s && s.preciosVehiculo ? (s.preciosVehiculo[t] ?? "") : ""}"></label>`).join("")}</div></div>` : ""}
      ${prods.length ? `<h4 style="margin:12px 0 4px">Productos que consume (usos por servicio)</h4><div class="form-grid">${prods.map(p => `<label>${e(p.nombre)}<input type="number" min="0" step="1" data-cons="${p.id}" value="${uso(p.id)}"></label>`).join("")}</div>` : ""}`,
      s ? "Guardar cambios" : "Crear servicio",
      f => API.catalogos.guardarServicio({ negocio, nombre: f.nombre.value, descripcion: f.descripcion.value, precioBase: f.precio.value, duracion: f.duracion.value, generaFidelidad: f.fid.checked,
        categoria: f.categoria ? f.categoria.value : undefined,
        preciosVehiculo: f.porveh && f.porveh.checked ? Object.fromEntries([...f.querySelectorAll("[data-pveh]")].map(i => [i.dataset.pveh, i.value])) : null,
        consumo: [...f.querySelectorAll("[data-cons]")].map(i => ({ producto: i.dataset.cons, cantidad: i.value })) }, id),
      r => { APP.toast("success", s ? "Servicio actualizado" : "Servicio creado", r.nombre); pintarServicios(negocio); }, "modal--lg");
    // Mostrar/ocultar precios por vehículo según la casilla.
    const fm = document.getElementById("cat-f");
    if (fm && fm.porveh) fm.porveh.addEventListener("change", () => { document.getElementById("cat-precios-veh").classList.toggle("hidden", !fm.porveh.checked); fm.precio.disabled = fm.porveh.checked; });
  }

  // ------------------------- PROMOCIONES -------------------------
  function renderPromociones(negocio) {
    const admin = AUTH.puede("catalogos.editar");
    document.getElementById(`promo-root-${negocio}`).innerHTML = `
      <div class="toolbar"><input type="text" id="promo-buscar-${negocio}" placeholder="Buscar promoción...">${admin ? `<button class="btn btn--primary" id="promo-nuevo-${negocio}">+ Nueva promoción</button>` : ""}</div><div class="grid-cards" id="promo-grid-${negocio}"></div>`;
    document.getElementById(`promo-buscar-${negocio}`).addEventListener("input", () => pintarPromos(negocio));
    const nuevo = document.getElementById(`promo-nuevo-${negocio}`); if (nuevo) nuevo.addEventListener("click", () => formPromo(negocio));
    document.getElementById(`promo-grid-${negocio}`).addEventListener("click", async ev => {
      const b = ev.target.closest("button[data-a]"); if (!b) return;
      if (b.dataset.a === "editar") return formPromo(negocio, b.dataset.id);
      if (b.dataset.a === "eliminar") { const p = DEMO.promociones.find(x => x.id === b.dataset.id); return APP.confirmarEliminar(p.nombre, "La promoción dejará de ofrecerse en ventas.", () => API.eliminar.promocion(p.id), () => pintarPromos(negocio)); }
      const r = await APP.ejecutar(b, () => API.catalogos.alternarPromocion(b.dataset.id));
      if (APP.okOToast(r)) { APP.toast("success", `Promoción ${r.data.estado === "activa" ? "activada" : "desactivada"}`, r.data.nombre); pintarPromos(negocio); }
    });
    pintarPromos(negocio);
  }
  function pintarPromos(negocio) {
    const q = (document.getElementById(`promo-buscar-${negocio}`).value || "").toLowerCase(), admin = AUTH.puede("catalogos.editar");
    const lista = DEMO.promociones.filter(p => (p.negocio === negocio || p.negocio === "ambos") && (!q || p.nombre.toLowerCase().includes(q)));
    document.getElementById(`promo-grid-${negocio}`).innerHTML = lista.map(p => `<div class="card promo-card"><div class="promo-card__head"><h4>${e(p.nombre)}</h4>${APP.badge(p.estado)}</div>
      <p class="text-muted small">${e(p.descripcion)}</p><div class="promo-card__value">${p.tipo === "porcentaje" ? p.valor + "% de descuento" : money(p.valor) + " de descuento"}</div>
      <p class="text-muted small">Vigencia: ${e(p.inicio)} → ${e(p.fin)}${p.minVisitas != null ? ` · Más de ${p.minVisitas} visitas` : ""}${p.requiere ? " · Requiere combo de servicios" : ""}</p>
      ${admin ? `<div class="product-card__actions"><button class="btn btn--ghost btn--sm" data-a="editar" data-id="${p.id}">Editar</button><button class="btn btn--ghost btn--sm" data-a="toggle" data-id="${p.id}">${p.estado === "activa" ? "Desactivar" : "Activar"}</button><button class="btn btn--ghost btn--sm btn--del" data-a="eliminar" data-id="${p.id}">🗑 Eliminar</button></div>` : ""}</div>`).join("")
      || `<div class="empty-state">Sin promociones registradas.</div>`;
  }
  function formPromo(negocio, id) {
    const p = id ? DEMO.promociones.find(x => x.id === id) : null;
    formModal(p ? "Editar promoción" : "Nueva promoción", `<div class="form-grid">
      <label>Nombre *<input name="nombre" value="${p ? e(p.nombre) : ""}" maxlength="60"></label><label>Descripción<input name="descripcion" value="${p ? e(p.descripcion) : ""}"></label>
      <label>Tipo<select name="tipo"><option value="porcentaje" ${p && p.tipo === "monto" ? "" : "selected"}>Porcentaje</option><option value="monto" ${p && p.tipo === "monto" ? "selected" : ""}>Monto fijo</option></select></label>
      <label>Valor *<input name="valor" type="number" min="0" step="0.01" value="${p ? p.valor : 10}"></label>
      <label>Inicio<input name="inicio" type="date" value="${p ? p.inicio : DEMO.calc.hoyISO()}"></label><label>Fin<input name="fin" type="date" value="${p ? p.fin : "2026-12-31"}"></label></div>`,
      p ? "Guardar cambios" : "Crear promoción",
      f => API.catalogos.guardarPromocion({ negocio, nombre: f.nombre.value, descripcion: f.descripcion.value, tipo: f.tipo.value, valor: f.valor.value, inicio: f.inicio.value, fin: f.fin.value }, id),
      r => { APP.toast("success", p ? "Promoción actualizada" : "Promoción creada", r.nombre); pintarPromos(negocio); });
  }

  // ------------------------- EMPLEADOS -------------------------
  function pintarEmpleados() {
    const q = (document.getElementById("emp-buscar").value || "").toLowerCase(), neg = document.getElementById("emp-filtro-negocio").value;
    const admin = AUTH.puede("empleados.editar");
    const lista = DEMO.empleados.filter(x => (!q || x.nombre.toLowerCase().includes(q)) && (!neg || x.negocio === neg));
    document.getElementById("emp-grid").innerHTML = lista.map(x => `<div class="card emp-card"><div class="avatar avatar--lg">${e(x.inicial)}</div><h4>${e(x.nombre)}</h4>
      <p class="text-muted small">${e(x.cargo)} · ${x.negocio === "autolavado" ? "🚗 Autolavado" : "💈 Barbería"}</p>${APP.badge(x.estado)}
      <div class="emp-card__stats"><div><strong>${x.ventasRealizadas}</strong><span>Ventas</span></div><div><strong>${money(x.ingresosGenerados)}</strong><span>Ingresos</span></div></div>
      ${admin ? `<div class="product-card__actions"><button class="btn btn--ghost btn--sm" data-a="editar" data-id="${x.id}">Editar</button><button class="btn btn--ghost btn--sm" data-a="toggle" data-id="${x.id}">${x.estado === "activo" ? "Desactivar" : "Activar"}</button><button class="btn btn--ghost btn--sm btn--del" data-a="eliminar" data-id="${x.id}">🗑 Eliminar</button></div>` : ""}</div>`).join("")
      || `<div class="empty-state">No se encontraron empleados.</div>`;
  }
  function formEmpleado(id) {
    const x = id ? DEMO.empleados.find(y => y.id === id) : null;
    formModal(x ? "Editar empleado" : "Nuevo empleado", `<div class="form-grid">
      <label>Nombre completo *<input name="nombre" value="${x ? e(x.nombre) : ""}" maxlength="80"></label><label>Cargo *<input name="cargo" value="${x ? e(x.cargo) : ""}"></label>
      <label>Negocio<select name="negocio"><option value="autolavado" ${x && x.negocio === "barberia" ? "" : "selected"}>Autolavado</option><option value="barberia" ${x && x.negocio === "barberia" ? "selected" : ""}>Barbería</option></select></label>
      <label>Teléfono<input name="telefono" value="${x ? e(x.telefono) : ""}" placeholder="8888-8888"></label><label>Correo<input name="correo" type="email" value="${x ? e(x.correo) : ""}"></label></div>`,
      x ? "Guardar cambios" : "Crear empleado",
      f => API.catalogos.guardarEmpleado({ nombre: f.nombre.value, cargo: f.cargo.value, negocio: f.negocio.value, telefono: f.telefono.value, correo: f.correo.value }, id),
      r => { APP.toast("success", x ? "Empleado actualizado" : "Empleado creado", r.nombre); pintarEmpleados(); });
  }

  document.addEventListener("DOMContentLoaded", () => {
    // Los listeners de empleados se registran UNA sola vez (el original los duplicaba en cada visita).
    document.getElementById("emp-buscar").addEventListener("input", pintarEmpleados);
    document.getElementById("emp-filtro-negocio").addEventListener("change", pintarEmpleados);
    document.getElementById("emp-nuevo").addEventListener("click", () => formEmpleado());
    document.getElementById("emp-grid").addEventListener("click", async ev => {
      const b = ev.target.closest("button[data-a]"); if (!b) return;
      if (b.dataset.a === "editar") return formEmpleado(b.dataset.id);
      if (b.dataset.a === "eliminar") { const x = DEMO.empleados.find(y => y.id === b.dataset.id); return APP.confirmarEliminar(x.nombre, "Ya no aparecerá para elegir en las ventas; sus ventas anteriores se conservan.", () => API.eliminar.empleado(x.id), pintarEmpleados); }
      const r = await APP.ejecutar(b, () => API.catalogos.alternarEmpleado(b.dataset.id));
      if (APP.okOToast(r)) { APP.toast("success", `Empleado ${r.data.estado === "activo" ? "activado" : "desactivado"}`, r.data.nombre); pintarEmpleados(); }
    });
    APP.registerPage("autolavado-servicios", () => renderServicios("autolavado")); APP.registerPage("barberia-servicios", () => renderServicios("barberia"));
    APP.registerPage("autolavado-promociones", () => renderPromociones("autolavado")); APP.registerPage("barberia-promociones", () => renderPromociones("barberia"));
    APP.registerPage("empleados", pintarEmpleados);
  });
})();

/* clientes.js — Listado de clientes por negocio, formulario, perfil con lealtad y membresías.
   Todas las altas/ediciones/bajas pasan por API.clientes.* (validación y actividad centralizadas). */
(() => {
  const e = APP.escapeHtml, money = APP.money;

  function renderClientes(negocio) {
    const cont = document.getElementById(`clientes-root-${negocio}`);
    cont.innerHTML = `
      <div class="toolbar">
        <input type="text" id="cli-buscar-${negocio}" placeholder="Buscar cliente por nombre, teléfono o correo...">
        <select id="cli-filtro-tipo-${negocio}"><option value="">Todos los tipos</option><option value="Nuevo">Nuevo</option><option value="Regular">Regular</option><option value="Frecuente">Frecuente</option></select>
        ${AUTH.puede("clientes.crear") ? `<button class="btn btn--primary" id="cli-nuevo-${negocio}">+ Nuevo cliente</button>` : ""}
      </div>
      <div class="list-count" id="cli-cont-${negocio}"></div>
      <div class="card table-card"><div class="table-wrap"><table class="table">
        <thead><tr><th>Nombre</th><th>Teléfono</th><th>Correo</th><th>Tipo</th><th>Última visita</th><th>Total gastado</th><th>Visitas</th><th>Lealtad</th><th>Estado</th><th></th></tr></thead>
        <tbody id="cli-tabla-${negocio}"></tbody></table></div></div>`;
    const pintar = () => pintarTabla(negocio);
    document.getElementById(`cli-buscar-${negocio}`).addEventListener("input", pintar);
    document.getElementById(`cli-filtro-tipo-${negocio}`).addEventListener("change", pintar);
    const nuevo = document.getElementById(`cli-nuevo-${negocio}`);
    if (nuevo) nuevo.addEventListener("click", () => formulario(negocio));
    document.getElementById(`cli-tabla-${negocio}`).addEventListener("click", ev => {
      const b = ev.target.closest("button[data-a]"); if (!b) return;
      const id = b.dataset.id;
      if (b.dataset.a === "ver") verPerfil(id);
      else if (b.dataset.a === "editar") formulario(negocio, id);
      else if (b.dataset.a === "eliminar") {
        const c = DEMO.clientes.find(x => x.id === id);
        APP.confirmar(`¿Eliminar a <strong>${e(c.nombre)}</strong> de la base de clientes? Las facturas anteriores se conservan.`, async () => {
          const r = await API.clientes.eliminar(id);
          if (!r.ok) { APP.toast("danger", "No se pudo eliminar al cliente", r.error); return false; }
          APP.toast("success", "Cliente eliminado", c.nombre); pintar();
        }, { danger: true, okText: "Eliminar", titulo: "Eliminar cliente" });
      }
    });
    pintar();
  }

  function pintarTabla(negocio) {
    const q = (document.getElementById(`cli-buscar-${negocio}`).value || "").toLowerCase();
    const tipo = document.getElementById(`cli-filtro-tipo-${negocio}`).value;
    let lista = DEMO.clientes.filter(c => c.negocioPreferido === negocio);
    if (q) lista = lista.filter(c => c.nombre.toLowerCase().includes(q) || c.telefono.includes(q) || c.correo.toLowerCase().includes(q));
    if (tipo) lista = lista.filter(c => c.tipo === tipo);
    lista = lista.slice().sort((a, b) => b.ultimaVisita - a.ultimaVisita);
    document.getElementById(`cli-cont-${negocio}`).textContent = `${lista.length} cliente${lista.length === 1 ? "" : "s"}`;
    const tbody = document.getElementById(`cli-tabla-${negocio}`);
    if (!lista.length) { tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state"><strong>No se encontraron clientes</strong>Prueba con otra búsqueda o registra un cliente nuevo.</div></td></tr>`; return; }
    tbody.innerHTML = lista.map(c => { const t = API.sync.tarjetaDe(c.id); return `<tr>
      <td><div class="cell-user"><div class="avatar avatar--sm">${e(APP.iniciales(c.nombre))}</div><strong>${e(c.nombre)}</strong></div></td>
      <td>${e(c.telefono)}</td><td>${e(c.correo)}</td><td>${APP.badge(c.tipo)}</td><td>${APP.fmtDate(c.ultimaVisita)}</td>
      <td class="num">${money(c.totalGastado)}</td><td>${c.visitas}</td><td>${DEMO.calc.estadoLealtad(c).map(x => `${x.programa.icono} ${x.lavadas}/${x.programa.meta2}`).join(" · ")}${DEMO.calc.premiosDisponibles(c).length ? ' <span class="badge badge--success">🎁</span>' : ""}${DEMO.calc.membresiasVigentes(c.id).length ? ' <span class="badge badge--info">🎫</span>' : ""}</td><td>${APP.badge(c.estado)}</td>
      <td class="table-actions"><button class="icon-btn" title="Ver perfil" aria-label="Ver perfil" data-a="ver" data-id="${c.id}">👁️</button>
        ${AUTH.puede("clientes.editar") ? `<button class="icon-btn" title="Editar" aria-label="Editar" data-a="editar" data-id="${c.id}">✏️</button>` : ""}
        ${AUTH.puede("clientes.eliminar") ? `<button class="icon-btn" title="Eliminar" aria-label="Eliminar" data-a="eliminar" data-id="${c.id}">🗑️</button>` : ""}</td></tr>`; }).join("");
  }

  function formulario(negocio, id) {
    const c = id ? DEMO.clientes.find(x => x.id === id) : null;
    APP.openModal(c ? "Editar cliente" : "Nuevo cliente", `<form id="cf" novalidate>
      <div class="form-grid">
        <label>Nombre completo *<input name="nombre" value="${c ? e(c.nombre) : ""}" maxlength="80"></label>
        <label>Teléfono<input name="telefono" placeholder="8888-8888" value="${c && c.telefono !== "s/n" ? e(c.telefono) : ""}"></label>
        <label>Correo<input name="correo" type="email" value="${c && c.correo !== "-" ? e(c.correo) : ""}"></label>
        <label>Identificación<input name="identificacion" value="${c && c.identificacion !== "-" ? e(c.identificacion) : ""}"></label>
        <label>Estado<select name="estado"><option value="activo" ${c && c.estado === "inactivo" ? "" : "selected"}>Activo</option><option value="inactivo" ${c && c.estado === "inactivo" ? "selected" : ""}>Inactivo</option></select></label>
      </div><div class="msg msg--danger hidden" id="cf-err"></div>
      <div class="form-actions"><button type="button" class="btn btn--ghost" data-c>Cancelar</button><button type="submit" class="btn btn--primary">${c ? "Guardar cambios" : "Crear cliente"}</button></div></form>`);
    const f = document.getElementById("cf"); f.querySelector("[data-c]").onclick = APP.closeModal;
    f.onsubmit = async ev => {
      ev.preventDefault();
      const d = { nombre: f.nombre.value, telefono: f.telefono.value, correo: f.correo.value, identificacion: f.identificacion.value, estado: f.estado.value, negocioPreferido: negocio };
      const r = await APP.ejecutar(f.querySelector("[type=submit]"), () => c ? API.clientes.actualizar(id, d) : API.clientes.crear(d), "Guardando…");
      if (!r.ok) { const er = document.getElementById("cf-err"); er.textContent = r.error; er.classList.remove("hidden"); return; }
      APP.closeModal(); APP.toast("success", c ? "Cliente actualizado" : "Cliente creado", (c ? r.data : r.data.cliente).nombre); pintarTabla(negocio);
    };
  }

  function verPerfil(id) {
    const c = DEMO.clientes.find(x => x.id === id), t = API.sync.tarjetaDe(id);
    const compras = DEMO.ventas.filter(v => v.clienteId === id).slice(0, 8), fid = c.fidelidad;
    APP.openModal(`Perfil de ${e(c.nombre)}`, `
      <div class="profile-head"><div class="avatar avatar--lg">${e(APP.iniciales(c.nombre))}</div><div><h3>${e(c.nombre)}</h3><p class="text-muted">${e(c.telefono)} · ${e(c.correo)}</p>${APP.badge(c.tipo)} ${APP.badge(c.estado)}</div></div>
      <div class="profile-stats"><div><strong>${money(c.totalGastado)}</strong><span>Total gastado</span></div><div><strong>${c.visitas}</strong><span>Visitas</span></div><div><strong>${APP.fmtDate(c.ultimaVisita)}</strong><span>Última visita</span></div><div><strong>${DEMO.calc.membresiasVigentes(c.id).length}</strong><span>Membresías vigentes</span></div></div>
      <div class="msg msg--info" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><span>⭐ ${DEMO.calc.estadoLealtad(c).map(x => `${e(x.programa.nombre)}: <strong>${x.lavadas}/${x.programa.meta2}</strong>`).join(" · ")}${DEMO.calc.premiosDisponibles(c).length ? " · 🎁 premio disponible" : ""}</span>${AUTH.puede("fidelidad.ver") ? `<button class="btn btn--ghost btn--sm" id="pf-tarjeta">Ver lealtad</button>` : ""}</div>
      ${c.vehiculos.length ? `<h4>Vehículos asociados</h4><p class="text-muted small">${c.vehiculos.map(v => `${e(v.tipo)} · ${e(v.marca)} ${e(v.modelo)} · ${e(v.placa)}`).join(" · ")}</p>` : ""}
      <h4>Historial reciente</h4><div class="table-wrap"><table class="table table--compact"><thead><tr><th>Factura</th><th>Fecha</th><th>Conceptos</th><th>Total</th><th>Pago</th><th>Estado</th></tr></thead>
      <tbody>${compras.length ? compras.map(v => `<tr><td>${e(v.id)}</td><td>${APP.fmtDate(v.fecha)}</td><td>${e(v.servicioNombre)}</td><td>${money(v.total)}</td><td>${e(v.metodoPago)}</td><td>${APP.badge(v.estado)}</td></tr>`).join("") : `<tr><td colspan="6"><div class="empty-mini">Sin compras registradas.</div></td></tr>`}</tbody></table></div>
      <div class="form-actions"><button class="btn btn--primary" id="pf-cerrar">Cerrar</button></div>`, { size: "modal--lg" });
    document.getElementById("pf-cerrar").onclick = APP.closeModal;
    const bt = document.getElementById("pf-tarjeta"); if (bt) bt.onclick = () => { APP.closeModal(); FIDELIDAD.abrirDetalle(id); };
  }

  APP.registerPage("autolavado-clientes", () => renderClientes("autolavado"));
  APP.registerPage("barberia-clientes", () => renderClientes("barberia"));
})();

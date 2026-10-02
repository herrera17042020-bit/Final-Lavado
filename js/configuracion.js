/* configuracion.js — Configuración, usuarios del sistema (DEMO), notificaciones y ayuda.
   Guardados vía API.configuracion / API.usuarios (validan y registran actividad). */
(() => {
  const e = APP.escapeHtml;
  let tabActiva = "general";

  function renderConfiguracion() {
    const cfg = DEMO.configuracion, cont = document.getElementById("config-root");
    cont.innerHTML = `
      <div class="config-tabs">${[["general", "General"], ["fidelidad", "Lealtad"], ["inventario", "Inventario"], ["pagos", "Métodos de pago"]].map(([k, l]) => `<button class="config-tab ${k === tabActiva ? "config-tab--active" : ""}" data-tab="${k}">${l}</button>`).join("")}</div>
      <div class="config-panel ${tabActiva === "general" ? "" : "hidden"}" id="tab-general"><form data-sec="general" novalidate>
        <div class="grid-2">${["autolavado", "barberia"].map(n => `<div class="card"><h4>${n === "autolavado" ? "🚗 Autolavado" : "💈 Barbería"}</h4><div class="form-grid">
          <label>Nombre del negocio<input name="${n}-nombre" value="${e(cfg.negocios[n].nombre)}"></label><label>Teléfono<input name="${n}-telefono" value="${e(cfg.negocios[n].telefono)}"></label>
          <label>Dirección<input name="${n}-direccion" value="${e(cfg.negocios[n].direccion)}"></label><label>Correo<input name="${n}-correo" type="email" value="${e(cfg.negocios[n].correo)}"></label></div></div>`).join("")}</div>
        <div class="msg msg--danger hidden" data-err></div><button class="btn btn--primary" type="submit" style="margin-top:16px">Guardar cambios</button></form></div>
      <div class="config-panel ${tabActiva === "fidelidad" ? "" : "hidden"}" id="tab-fidelidad"><form data-sec="lealtad" novalidate>
        <div class="grid-2">${cfg.lealtad.programas.map(p => { const servOpts = (sel, filtro) => DEMO.servicios.filter(x => x.negocio === "autolavado" && x.estado === "activo" && (!filtro || filtro(x))).map(x => `<option value="${x.id}" ${x.id === sel ? "selected" : ""}>${e(x.nombre)}</option>`).join("");
          return `<div class="card"><h4>${p.icono} ${e(p.nombre)}</h4><div class="form-grid">
          <label>Servicio que suma lavadas<select name="${p.id}-servicio">${servOpts(p.servicioId, x => x.categoria === "lavado")}</select></label>
          <label>Lavadas para elegir premio<input type="number" min="1" max="58" name="${p.id}-meta1" value="${p.meta1}"></label>
          <label>Opción 1: servicio GRATIS<select name="${p.id}-op1">${servOpts(p.opciones1[0].servicioId)}</select></label>
          <label>Opción 2: % de descuento<input type="number" min="1" max="100" name="${p.id}-pct" value="${p.opciones1[1].pct}"></label>
          <label>Opción 2: descuento en<select name="${p.id}-op2">${servOpts(p.opciones1[1].servicioId)}</select></label>
          <label>Lavadas para el premio final<input type="number" min="2" max="60" name="${p.id}-meta2" value="${p.meta2}"></label>
          <label>Premio final (GRATIS)<select name="${p.id}-final">${servOpts(p.premio2.servicioId)}</select></label></div></div>`; }).join("")}</div>
        <div class="msg msg--info" style="margin-top:12px">🎫 Los planes de membresía (nombre, descuento, lavados y días de vigencia) se editan en <strong>Autolavado → Membresías</strong>.</div>
        <p class="text-muted small" style="margin:10px 0">Sin saldo ni dinero: cada lavada del servicio de un programa se suma sola al cliente al facturar. Los premios se canjean en la venta. Los cambios aplican a las próximas facturas.</p>
        <div class="msg msg--danger hidden" data-err></div><button class="btn btn--primary" type="submit">Guardar cambios</button></form></div>
      <div class="config-panel ${tabActiva === "inventario" ? "" : "hidden"}" id="tab-inventario"><div class="card"><form data-sec="inventario" novalidate><div class="form-grid">
        <label>Método de consumo<select name="metodoConsumo"><option ${cfg.inventario.metodoConsumo === "Por rendimiento estimado" ? "selected" : ""}>Por rendimiento estimado</option><option ${cfg.inventario.metodoConsumo === "Manual" ? "selected" : ""}>Manual</option></select></label></div>
        <p class="text-muted small">Los servicios descuentan inventario según el consumo definido en cada servicio. El stock mínimo se define en cada producto.</p>
        <button class="btn btn--primary" type="submit">Guardar cambios</button></form></div></div>
      <div class="config-panel ${tabActiva === "pagos" ? "" : "hidden"}" id="tab-pagos"><div class="card"><form data-sec="pagos" novalidate>
        ${[["efectivo", "Efectivo"], ["tarjeta", "Tarjeta"], ["transferencia", "Transferencia"]].map(([k, l]) => `<label class="checkbox-row"><input type="checkbox" name="${k}" ${cfg.metodosPago[k] ? "checked" : ""}> ${l}</label>`).join("")}
        <p class="text-muted small">El pago mixto está disponible cuando hay al menos dos métodos habilitados.</p>
        <div class="form-grid" style="margin-top:12px"><label>Tipo de cambio para el cierre de caja (C$ por US$ 1)<input name="tipoCambio" type="number" min="1" max="200" step="0.01" value="${cfg.caja.tipoCambio}"></label></div>
        <div class="msg msg--danger hidden" data-err></div><button class="btn btn--primary" type="submit" style="margin-top:12px">Guardar cambios</button></form></div></div>`;
    cont.querySelectorAll(".config-tab").forEach(t => t.addEventListener("click", () => {
      tabActiva = t.dataset.tab;
      cont.querySelectorAll(".config-tab").forEach(x => x.classList.toggle("config-tab--active", x === t));
      cont.querySelectorAll(".config-panel").forEach(p => p.classList.toggle("hidden", p.id !== "tab-" + tabActiva));
    }));
    cont.querySelectorAll("form[data-sec]").forEach(f => f.addEventListener("submit", async ev => {
      ev.preventDefault(); const sec = f.dataset.sec, err = f.querySelector("[data-err]"); if (err) err.classList.add("hidden");
      let d;
      if (sec === "general") d = Object.fromEntries(["autolavado", "barberia"].map(n => [n, { nombre: f[`${n}-nombre`].value, telefono: f[`${n}-telefono`].value, direccion: f[`${n}-direccion`].value, correo: f[`${n}-correo`].value }]));
      else if (sec === "lealtad") d = {
        programas: cfg.lealtad.programas.map(p => ({ id: p.id, servicioId: f[`${p.id}-servicio`].value, meta1: f[`${p.id}-meta1`].value, op1: f[`${p.id}-op1`].value, pct: f[`${p.id}-pct`].value, op2: f[`${p.id}-op2`].value, meta2: f[`${p.id}-meta2`].value, final: f[`${p.id}-final`].value })) };
      else if (sec === "inventario") d = { metodoConsumo: f.metodoConsumo.value };
      else { d = Object.fromEntries(["efectivo", "tarjeta", "transferencia"].map(k => [k, f[k].checked])); d.tipoCambio = f.tipoCambio.value; }
      const r = await APP.ejecutar(f.querySelector("[type=submit]"), () => API.configuracion.guardar(sec, d), "Guardando…");
      if (!r.ok) { if (err) { err.textContent = r.error; err.classList.remove("hidden"); } else APP.toast("danger", "No se pudo guardar", r.error); return; }
      APP.toast("success", "Configuración guardada");
    }));
  }

  // --------------------------- USUARIOS ---------------------------
  function renderUsuarios() {
    document.getElementById("usuarios-tabla").innerHTML = DEMO.usuarios.map(u => `<tr>
      <td><div class="cell-user"><div class="avatar avatar--sm">${e(APP.iniciales(u.nombre))}</div><div><strong>${e(u.nombre)}</strong><div class="small text-muted">@${e(u.usuario)}</div></div></div></td>
      <td>${e(u.correo || "—")}</td><td>${e(AUTH.etiquetaRol(u.rol))}</td><td>${APP.badge(u.estado)}</td>
      <td class="table-actions"><button class="icon-btn" title="Editar" aria-label="Editar" data-a="editar" data-id="${u.id}">✏️</button>
      <button class="icon-btn" title="${u.estado === "activo" ? "Desactivar" : "Activar"}" aria-label="Cambiar estado" data-a="toggle" data-id="${u.id}">${u.estado === "activo" ? "⏸️" : "▶️"}</button>
      <button class="icon-btn icon-btn--danger" title="Eliminar" aria-label="Eliminar" data-a="eliminar" data-id="${u.id}">🗑</button></td></tr>`).join("");
  }
  function formUsuario(id) {
    const u = id ? DEMO.usuarios.find(x => x.id === id) : null;
    APP.openModal(u ? "Editar usuario" : "Nuevo usuario", `<form id="uf" novalidate><div class="form-grid">
      <label>Usuario *<input name="usuario" value="${u ? e(u.usuario) : ""}" maxlength="20" autocapitalize="none"></label><label>Nombre *<input name="nombre" value="${u ? e(u.nombre) : ""}"></label>
      <label>Rol<select name="rol"><option value="EMPLEADO" ${u && u.rol === "ADMIN" ? "" : "selected"}>Empleado</option><option value="ADMIN" ${u && u.rol === "ADMIN" ? "selected" : ""}>Administrador</option></select></label>
      <label>Empleado asociado<select name="empleadoId"><option value="">— Ninguno —</option>${DEMO.empleados.map(x => `<option value="${x.id}" ${u && u.empleadoId === x.id ? "selected" : ""}>${e(x.nombre)} (${APP.NOMBRE_NEGOCIO[x.negocio]})</option>`).join("")}</select></label>
      <label>Contraseña DEMO ${u ? "(vacío = no cambiar)" : "*"}<input name="password" type="text" autocomplete="off" placeholder="mín. 6 caracteres"></label></div>
      <p class="text-muted small">Solo prototipo: en producción las contraseñas las gestiona el backend con hash y nunca se muestran.</p>
      <div class="msg msg--danger hidden" id="uf-err"></div>
      <div class="form-actions"><button type="button" class="btn btn--ghost" data-c>Cancelar</button><button class="btn btn--primary" type="submit">${u ? "Guardar cambios" : "Crear usuario"}</button></div></form>`);
    const f = document.getElementById("uf"); f.querySelector("[data-c]").onclick = APP.closeModal;
    f.onsubmit = async ev => {
      ev.preventDefault();
      const r = await APP.ejecutar(f.querySelector("[type=submit]"), () => API.usuarios.guardar({ usuario: f.usuario.value, nombre: f.nombre.value, rol: f.rol.value, empleadoId: f.empleadoId.value, password: f.password.value }, id), "Guardando…");
      if (!r.ok) { const er = document.getElementById("uf-err"); er.textContent = r.error; er.classList.remove("hidden"); return; }
      APP.closeModal(); APP.toast("success", u ? "Usuario actualizado" : "Usuario creado", r.data.usuario); renderUsuarios();
    };
  }

  // ------------------------- NOTIFICACIONES -------------------------
  function renderNotificaciones() {
    const cont = document.getElementById("notif-lista-completa");
    cont.innerHTML = DEMO.notificaciones.length ? DEMO.notificaciones.map(n => `<div class="notif-item notif-item--${n.tipo} notif-item--full"><p>${e(n.texto)}</p><span>${APP.fmtDateTime(n.fecha)}</span></div>`).join("") : `<div class="empty-state">No tienes notificaciones.</div>`;
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("usuarios-nuevo").addEventListener("click", () => formUsuario());
    document.getElementById("usuarios-nuevo").textContent = "+ Nuevo usuario";
    document.getElementById("usuarios-tabla").addEventListener("click", async ev => {
      const b = ev.target.closest("button[data-a]"); if (!b) return;
      if (b.dataset.a === "editar") return formUsuario(b.dataset.id);
      if (b.dataset.a === "eliminar") { const u = DEMO.usuarios.find(x => x.id === b.dataset.id); return APP.confirmarEliminar(`@${u.usuario} (${u.nombre})`, "Ya no podrá iniciar sesión.", () => API.eliminar.usuario(u.id), renderUsuarios); }
      const r = await APP.ejecutar(b, () => API.usuarios.alternar(b.dataset.id));
      if (APP.okOToast(r)) { APP.toast("success", `Usuario ${r.data.estado === "activo" ? "activado" : "desactivado"}`, r.data.usuario); renderUsuarios(); }
    });
    const limpiar = document.getElementById("notif-limpiar");
    if (limpiar) limpiar.addEventListener("click", () => { DEMO.notificaciones.length = 0; APP.refreshNotifBell(); renderNotificaciones(); APP.toast("success", "Notificaciones marcadas como leídas"); });
    APP.registerPage("configuracion", renderConfiguracion); APP.registerPage("usuarios", renderUsuarios);
    APP.registerPage("notificaciones", renderNotificaciones); APP.registerPage("ayuda", () => {});
  });
})();

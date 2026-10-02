/* ==========================================================================
   app.js — Núcleo: login/sesión, control de acceso, navegación, modales,
   notificaciones toast y utilidades compartidas.
   ========================================================================== */

const APP = (() => {

  const state = {
    negocioActivo: "todos",     // todos | autolavado | barberia (dashboard)
    periodoActivo: "mes",       // hoy | semana | mes | anio | personalizado
    paginaActual: "dashboard",
    linea: "autolavado",        // línea de negocio visible en el menú: autolavado | barberia
    rutaPendiente: null,        // ruta pedida antes de iniciar sesión
  };

  // ---------------------------------------------------------------------
  // PANTALLAS DE ALTO NIVEL: login, panel y terminales.
  // (El antiguo "selector de interfaz" de la demo fue reemplazado por login +
  //  acceso por rol: el menú "Terminales" del panel abre cada terminal.)
  // ---------------------------------------------------------------------
  const TOP_SCREENS = ["screen-login", "screen-app", "screen-terminal-autolavado", "screen-terminal-nfc", "screen-terminal-barberia"];
  const TERMINALES = {
    autolavado: { pantalla: "screen-terminal-autolavado", modulo: () => TERMINAL_AUTOLAVADO, nombre: "Terminal Autolavado" },
    barberia: { pantalla: "screen-terminal-barberia", modulo: () => TERMINAL_BARBERIA, nombre: "Terminal Barbería" },
    nfc: { pantalla: "screen-terminal-nfc", modulo: () => TERMINAL_NFC, nombre: "Terminal NFC" },
  };

  function mostrarPantalla(id) {
    TOP_SCREENS.forEach(s => document.getElementById(s).classList.toggle("hidden", s !== id));
    window.scrollTo({ top: 0 });
  }

  // ---------------------------------------------------------------------
  // Utilidades de formato
  // ---------------------------------------------------------------------
  function money(n) {
    return "C$ " + Number(n || 0).toLocaleString("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function moneySigno(n) { return (n > 0 ? "+" : n < 0 ? "-" : "") + money(Math.abs(n)); }
  function fmtDate(d) { return new Date(d).toLocaleDateString("es-NI", { day: "2-digit", month: "short", year: "numeric" }); }
  function fmtDateTime(d) {
    return new Date(d).toLocaleDateString("es-NI", { day: "2-digit", month: "short", year: "numeric" }) +
      " · " + new Date(d).toLocaleTimeString("es-NI", { hour: "2-digit", minute: "2-digit" });
  }
  function fmtTime(d) { return new Date(d).toLocaleTimeString("es-NI", { hour: "2-digit", minute: "2-digit" }); }
  // 28/09/2026 19:05
  function fmtFechaHora(d) {
    const x = new Date(d), p = n => String(n).padStart(2, "0");
    return `${p(x.getDate())}/${p(x.getMonth() + 1)}/${x.getFullYear()} ${p(x.getHours())}:${p(x.getMinutes())}`;
  }
  function fmtFechaCorta(d) {
    const x = new Date(d), p = n => String(n).padStart(2, "0");
    return `${p(x.getDate())}/${p(x.getMonth() + 1)}/${x.getFullYear()}`;
  }
  function iniciales(nombre) { return String(nombre || "?").split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase(); }
  function badge(estado) {
    const map = {
      "activo": "badge--success", "activa": "badge--success", "Completada": "badge--success",
      "inactivo": "badge--muted", "inactiva": "badge--muted", "bloqueada": "badge--danger",
      "Anulada": "badge--danger", "por vencer": "badge--warning",
      "Próximo": "badge--warning", "Completado": "badge--success", "En progreso": "badge--muted",
      "Frecuente": "badge--brand", "Regular": "badge--muted", "Nuevo": "badge--info",
      "Mixto": "badge--brand", "Saldo fidelidad": "badge--info", "Membresía": "badge--info", "Premio": "badge--warning",
    };
    return `<span class="badge ${map[estado] || "badge--muted"}">${escapeHtml(estado)}</span>`;
  }
  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch]));
  }
  const NOMBRE_NEGOCIO = { autolavado: "Autolavado", barberia: "Barbería" };
  const ICONO_NEGOCIO = { autolavado: "🚗", barberia: "💈" };

  // ---------------------------------------------------------------------
  // Botones con estado "procesando": evita dobles clics y muestra progreso.
  // ---------------------------------------------------------------------
  async function ejecutar(btn, fn, textoCarga = "Procesando…") {
    if (btn && btn.dataset.busy) return { ok: false, error: "En proceso", codigo: "OCUPADO" };
    const original = btn ? btn.innerHTML : "";
    if (btn) { btn.dataset.busy = "1"; btn.disabled = true; btn.classList.add("is-loading"); btn.innerHTML = `<span class="spinner"></span> ${textoCarga}`; }
    try { return await fn(); }
    finally {
      if (btn && btn.isConnected) { delete btn.dataset.busy; btn.disabled = false; btn.classList.remove("is-loading"); btn.innerHTML = original; }
    }
  }
  // Muestra el error de una respuesta { ok:false } como toast; devuelve true si todo salió bien.
  function okOToast(r, titulo) {
    if (r.ok) return true;
    toast("danger", titulo || "No se pudo completar la acción", r.error);
    return false;
  }

  // ---------------------------------------------------------------------
  // LOGIN / SESIÓN
  // ---------------------------------------------------------------------
  function initLogin() {
    const form = document.getElementById("login-form");
    const err = document.getElementById("login-error");
    const mostrarError = (msg) => { err.textContent = msg; err.classList.remove("hidden"); err.classList.remove("shake"); void err.offsetWidth; err.classList.add("shake"); };
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = document.getElementById("login-submit");
      const usuario = document.getElementById("login-usuario").value;
      const clave = document.getElementById("login-password").value;
      err.classList.add("hidden");
      const r = await ejecutar(btn, () => API.auth.login(usuario, clave), "Verificando…");
      if (!r.ok) { mostrarError(r.error); document.getElementById("login-password").select(); return; }
      AUTH.iniciar(r.data);
      form.reset();
      entrarAlPanel();
    });
    document.querySelectorAll("[data-demo-login]").forEach(btn => btn.addEventListener("click", () => {
      const u = DEMO.usuarios.find(x => x.usuario === btn.getAttribute("data-demo-login"));
      if (!u) return;
      document.getElementById("login-usuario").value = u.usuario;
      document.getElementById("login-password").value = u.password; // solo demo
      document.getElementById("login-password").focus();
    }));
    document.getElementById("login-olvido").addEventListener("click", (e) => {
      e.preventDefault(); toast("info", "Recuperación de contraseña", "Estará disponible cuando el sistema se conecte al backend.");
    });
  }

  function entrarAlPanel() {
    const s = AUTH.sesion();
    aplicarPermisosUI();
    const rol = AUTH.etiquetaRol(s.rol);
    ["sidebar", "topbar"].forEach(p => {
      document.getElementById(`${p}-name`).textContent = s.nombre;
      document.getElementById(`${p}-rol`).textContent = rol;
      document.getElementById(`${p}-avatar`).textContent = iniciales(s.nombre);
    });
    document.querySelectorAll("[data-user-chip]").forEach(el => { el.textContent = `${s.nombre} · ${rol}`; });
    mostrarPantalla("screen-app");
    document.querySelector(".bell-wrap").classList.toggle("hidden", !AUTH.puede("notificaciones.ver"));
    refreshNotifBell();
    const destino = state.rutaPendiente;
    state.rutaPendiente = null;
    toast("success", `Bienvenido, ${s.nombre.split(" ")[0]}`, `Sesión iniciada como ${rol}.`);
    if (destino && resolverPagina(destino) && AUTH.puedeAcceder(resolverPagina(destino))) goTo(destino);
    else goTo(AUTH.paginaInicio(), {}, { reemplazar: true });
  }

  // Oculta menús y accesos que el rol no puede usar.
  function aplicarPermisosUI() {
    document.querySelectorAll("[data-nav]").forEach(el => {
      const ok = AUTH.puedeAcceder(resolverPagina(el.getAttribute("data-nav")));
      el.classList.toggle("hidden", !ok);
    });
    document.querySelectorAll("[data-terminal]").forEach(el => { const t = el.getAttribute("data-terminal"); el.classList.toggle("hidden", !AUTH.puede("terminales.usar") || (t !== "nfc" && !AUTH.puedeNegocio(t))); });
    document.querySelectorAll(".sidebar__group").forEach(g => {
      const visibles = g.querySelectorAll("[data-nav]:not(.hidden), [data-terminal]:not(.hidden)").length;
      g.classList.toggle("hidden", visibles === 0);
    });
    document.querySelectorAll(".section-tabs").forEach(t => t.classList.toggle("hidden", t.querySelectorAll("a:not(.hidden)").length < 2));
    aplicarLinea();
  }

  // Menú por línea de negocio: solo se muestran las opciones del área elegida (autolavado o barbería).
  function aplicarLinea() {
    document.querySelectorAll("[data-linea]").forEach(b => b.classList.toggle("active", b.dataset.linea === state.linea));
    document.querySelectorAll("[data-linea-grupo]").forEach(g => {
      const conPermiso = g.querySelectorAll("[data-nav]:not(.hidden)").length > 0;
      g.classList.toggle("hidden", !conPermiso || g.dataset.lineaGrupo !== state.linea);
    });
  }
  function cambiarLinea(linea) {
    if (linea === state.linea) return;
    state.linea = linea; aplicarLinea();
    if (/^(autolavado|barberia)-/.test(state.paginaActual)) {
      const destino = state.paginaActual.replace(/^(autolavado|barberia)/, linea);
      goTo(AUTH.puedeAcceder(destino) ? destino : `${linea}-venta`);
    } else if (AUTH.sesion() && AUTH.sesion().rol === "EMPLEADO") goTo(`${linea}-venta`);
  }

  async function logout() {
    await API.auth.logout();
    AUTH.cerrar();
    if (typeof POS_CORE !== "undefined") POS_CORE.reiniciar();
    if (typeof TERMINAL_NFC !== "undefined") TERMINAL_NFC.detener();
    closeModal();
    state.paginaActual = "dashboard"; state.rutaPendiente = null;
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* file:// */ }
    document.getElementById("login-error").classList.add("hidden");
    mostrarPantalla("screen-login");
    toast("info", "Sesión cerrada correctamente.");
  }

  // ---------------------------------------------------------------------
  // TERMINALES (pantallas táctiles independientes del panel)
  // ---------------------------------------------------------------------
  function abrirTerminal(tipo, params) {
    const t = TERMINALES[tipo];
    if (!t) return;
    if (!AUTH.puede("terminales.usar")) { toast("warning", "Sin acceso", "Tu rol no puede usar las terminales."); return; }
    if (tipo !== "nfc" && !AUTH.puedeNegocio(tipo)) { toast("warning", "Sin acceso", `No estás asignado a ${NOMBRE_NEGOCIO[tipo]}.`); return; }
    closeModal();
    mostrarPantalla(t.pantalla);
    t.modulo().iniciar(params || {});
  }
  function volverAlPanel() {
    if (typeof TERMINAL_NFC !== "undefined") TERMINAL_NFC.detener();
    closeModal();
    mostrarPantalla("screen-app");
    goTo(state.paginaActual || AUTH.paginaInicio());
  }

  // ---------------------------------------------------------------------
  // NAVEGACIÓN (con control de acceso y URL #/pagina)
  // ---------------------------------------------------------------------
  const ALIAS = { "autolavado-fidelidad": "fidelidad", "barberia-fidelidad": "fidelidad" };
  const resolverPagina = p => ALIAS[p] || p;

  const TITULOS = {
    dashboard: ["Panel administrativo", "Resumen general del local"],
    "autolavado-venta": ["Nueva venta · Autolavado", "Arma una factura con uno o varios conceptos"],
    "autolavado-ventas": ["Ventas · Autolavado", "Historial de facturas del negocio"],
    "autolavado-clientes": ["Clientes · Autolavado", "Clientes que prefieren este negocio"],
    fidelidad: ["Programa de lealtad", "Consulta el progreso y los canjes de los clientes · se suman solos al facturar"],
    membresias: ["Membresías", "Paquetes prepagados de lavados con descuento"],
    "mis-ventas": ["Mi resumen", "Tus ventas por día: clientes atendidos y formas de pago"],
    "autolavado-cierre": ["Cierre de caja · Autolavado", "Cuenta el dinero y compáralo con lo registrado en el sistema"],
    "barberia-cierre": ["Cierre de caja · Barbería", "Cuenta el dinero y compáralo con lo registrado en el sistema"],
    cierres: ["Cierres de caja", "Historial de todos los cierres registrados"],
    "autolavado-inventario": ["Inventario · Autolavado", "Control de productos y consumo"],
    "autolavado-servicios": ["Servicios · Autolavado", "Catálogo de servicios y precios"],
    "autolavado-promociones": ["Promociones · Autolavado", "Descuentos y campañas activas"],
    "barberia-venta": ["Nueva venta · Barbería", "Arma una factura con uno o varios conceptos"],
    "barberia-ventas": ["Ventas · Barbería", "Historial de facturas del negocio"],
    "barberia-clientes": ["Clientes · Barbería", "Clientes que prefieren este negocio"],
    "barberia-servicios": ["Servicios · Barbería", "Catálogo de servicios y precios"],
    "barberia-inventario": ["Inventario · Barbería", "Control de productos y consumo"],
    "barberia-promociones": ["Promociones · Barbería", "Descuentos y campañas activas"],
    empleados: ["Empleados", "Equipo de autolavado y barbería"],
    usuarios: ["Usuarios del sistema", "Accesos y roles del panel"],
    configuracion: ["Configuración", "Ajustes generales del sistema"],
    reportes: ["Reportes", "Analiza el desempeño del local"],
    estadisticas: ["Estadísticas", "Calendario e indicadores de ventas"],
    actividad: ["Actividad del negocio", "Bitácora de eventos registrados por el sistema"],
    notificaciones: ["Notificaciones", "Alertas y eventos recientes"],
    ayuda: ["Ayuda", "Guía rápida de este prototipo"],
  };

  const renderers = {}; // registradas por cada módulo: renderers.dashboard = fn, etc.
  function registerPage(name, fn) { renderers[name] = fn; }

  function goTo(pagina, params, opts = {}) {
    if (!AUTH.sesion()) { state.rutaPendiente = pagina; return; }
    pagina = resolverPagina(pagina);
    if (!document.getElementById("page-" + pagina)) { pagina = AUTH.paginaInicio(); }
    if (!AUTH.puedeAcceder(pagina)) {
      const nombre = (TITULOS[pagina] || [pagina])[0];
      toast("warning", `Sin permiso para acceder a “${nombre}”`, `Tu rol (${AUTH.etiquetaRol(AUTH.sesion().rol)}) no incluye esta sección. Te llevamos a tu página de inicio.`);
      DEMO.registrarActividad({ tipo: "acceso_denegado", usuario: AUTH.sesion().nombre, descripcion: `Acceso denegado a “${nombre}” (${AUTH.sesion().nombre})`, referencia: pagina, metadata: {} });
      pagina = AUTH.paginaInicio(); opts = { ...opts, reemplazar: true }; params = {};
    }
    state.paginaActual = pagina;
    const lin = /^(autolavado|barberia)-/.exec(pagina);
    if (lin && lin[1] !== state.linea) { state.linea = lin[1]; aplicarLinea(); }
    document.querySelectorAll(".page").forEach(p => p.classList.add("hidden"));
    document.getElementById("page-" + pagina).classList.remove("hidden");

    document.querySelectorAll("[data-nav]").forEach(l => l.classList.remove("active"));
    document.querySelectorAll(`[data-nav="${pagina}"]`).forEach(l => l.classList.add("active"));
    if (pagina === "fidelidad") document.querySelectorAll('[data-nav="autolavado-fidelidad"]').forEach(l => l.classList.add("active"));

    const [t, s] = TITULOS[pagina] || ["", ""];
    document.getElementById("page-title").textContent = t;
    document.getElementById("page-subtitle").textContent = s;

    if (!opts.desdeHash) {
      try { history[opts.reemplazar ? "replaceState" : "pushState"](null, "", "#/" + pagina); } catch (e) { /* file:// restringe history en algunos navegadores */ }
    }
    if (renderers[pagina]) renderers[pagina](params || {});
    window.scrollTo({ top: 0 });
  }

  function rutaDeHash() { const m = location.hash.match(/^#\/([\w-]+)/); return m ? m[1] : null; }
  function alCambiarUrl() {
    const p = rutaDeHash();
    if (!p) return;
    if (!AUTH.sesion()) { state.rutaPendiente = p; return; }
    if (resolverPagina(p) !== state.paginaActual) goTo(p, {}, { desdeHash: true });
  }

  function initNav() {
    // Delegación: funciona también con enlaces creados dinámicamente (p. ej. dentro del POS).
    document.addEventListener("click", (e) => {
      const nav = e.target.closest("[data-nav]");
      if (nav) { e.preventDefault(); goTo(nav.getAttribute("data-nav")); if (window.innerWidth <= 960) closeSidebar(); return; }
      const term = e.target.closest("[data-terminal]");
      if (term) { e.preventDefault(); abrirTerminal(term.getAttribute("data-terminal")); if (window.innerWidth <= 960) closeSidebar(); return; }
      if (e.target.closest("[data-volver-panel]")) { volverAlPanel(); return; }
      const lin = e.target.closest("[data-linea]");
      if (lin) { cambiarLinea(lin.dataset.linea); return; }
      if (e.target.closest("[data-logout]")) { logout(); }
    });
    document.getElementById("btn-toggle-sidebar").addEventListener("click", toggleSidebar);
    document.getElementById("sidebar-overlay").addEventListener("click", closeSidebar);
    window.addEventListener("hashchange", alCambiarUrl);
    window.addEventListener("popstate", alCambiarUrl);
  }

  function toggleSidebar() {
    document.getElementById("sidebar").classList.toggle("open");
    document.getElementById("sidebar-overlay").classList.toggle("open");
  }
  function closeSidebar() {
    document.getElementById("sidebar").classList.remove("open");
    document.getElementById("sidebar-overlay").classList.remove("open");
  }

  // ---------------------------------------------------------------------
  // MODAL genérico
  // ---------------------------------------------------------------------
  let _onCloseModal = null;
  function openModal(title, bodyHtml, { size = "", onClose = null } = {}) {
    const root = document.getElementById("modal-root");
    _onCloseModal = onClose;
    root.innerHTML = `
      <div class="modal-backdrop" id="modal-backdrop">
        <div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
          <div class="modal__header">
            <h3>${title}</h3>
            <button class="icon-btn" id="modal-close" aria-label="Cerrar">✕</button>
          </div>
          <div class="modal__body">${bodyHtml}</div>
        </div>
      </div>`;
    root.classList.remove("hidden");
    document.getElementById("modal-close").addEventListener("click", closeModal);
    document.getElementById("modal-backdrop").addEventListener("click", (e) => { if (e.target.id === "modal-backdrop") closeModal(); });
    const primero = root.querySelector(".modal__body input:not([type=hidden]):not([disabled]), .modal__body select, .modal__body textarea");
    if (primero) setTimeout(() => primero.focus(), 30);
  }
  function closeModal() {
    const root = document.getElementById("modal-root");
    const cb = _onCloseModal; _onCloseModal = null;
    root.innerHTML = "";
    root.classList.add("hidden");
    if (cb) cb();
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !document.getElementById("modal-root").classList.contains("hidden")) closeModal();
  });

  // Confirmación estándar para eliminar (solo administrador). Si la API lo impide, el motivo se muestra en el modal.
  function confirmarEliminar(nombre, detalle, accion, alListo) {
    confirmar(`¿Eliminar <strong>${escapeHtml(nombre)}</strong>? ${detalle || ""}<br><span class="small">Esta acción no se puede deshacer. Las facturas ya emitidas no cambian.</span><div class="msg msg--danger hidden" id="del-err" style="margin-top:12px"></div>`, async () => {
      const r = await accion();
      if (!r.ok) { const er = document.getElementById("del-err"); if (er) { er.textContent = r.error; er.classList.remove("hidden"); } return false; }
      toast("success", "Eliminado", nombre); alListo && alListo(r.data);
    }, { titulo: "Eliminar", okText: "🗑 Eliminar", danger: true });
  }
  function confirmar(mensaje, onConfirm, opciones = {}) {
    openModal(opciones.titulo || "Confirmar acción", `
      <p class="text-muted" style="margin-bottom:20px">${mensaje}</p>
      ${opciones.campoTexto ? `<label class="field-inline">${opciones.campoTexto}<input type="text" id="confirm-texto" maxlength="120" autocomplete="off"></label>` : ""}
      <div class="form-actions">
        <button class="btn btn--ghost" id="confirm-cancel">Cancelar</button>
        <button class="btn ${opciones.danger ? "btn--danger" : "btn--primary"}" id="confirm-ok">${opciones.okText || "Confirmar"}</button>
      </div>`, { size: "modal--sm" });
    document.getElementById("confirm-cancel").addEventListener("click", closeModal);
    document.getElementById("confirm-ok").addEventListener("click", async () => {
      const campo = document.getElementById("confirm-texto");
      const valor = campo ? campo.value.trim() : undefined;
      if (opciones.campoTexto && !valor) { campo.classList.add("input-error"); campo.focus(); return; }
      const btn = document.getElementById("confirm-ok");
      const r = await ejecutar(btn, async () => onConfirm(valor));
      if (r === false) return;               // el llamador puede devolver false para mantener el modal abierto
      closeModal();
    });
  }

  // ---------------------------------------------------------------------
  // TOASTS
  // ---------------------------------------------------------------------
  function toast(tipo, mensaje, submensaje) {
    const icons = { success: "✅", warning: "⚠️", danger: "🔴", info: "ℹ️" };
    const el = document.createElement("div");
    el.className = `toast toast--${tipo}`;
    el.setAttribute("role", tipo === "danger" ? "alert" : "status");
    el.innerHTML = `<span class="toast__icon">${icons[tipo] || "ℹ️"}</span>
      <div><div class="toast__msg">${escapeHtml(mensaje)}</div>${submensaje ? `<div class="toast__sub">${escapeHtml(submensaje)}</div>` : ""}</div>`;
    document.getElementById("toast-container").appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 300); }, tipo === "danger" ? 6500 : 4200);
  }

  // ---------------------------------------------------------------------
  // NOTIFICACIONES (campana del topbar)
  // ---------------------------------------------------------------------
  function refreshNotifBell() {
    const count = DEMO.notificaciones.length;
    const dot = document.getElementById("notif-count");
    dot.textContent = count;
    dot.classList.toggle("hidden", count === 0);
    const list = document.getElementById("notif-dropdown-list");
    list.innerHTML = DEMO.notificaciones.slice(0, 5).map(n => `
      <div class="notif-item notif-item--${n.tipo}">
        <p>${escapeHtml(n.texto)}</p>
        <span>${fmtDateTime(n.fecha)}</span>
      </div>`).join("") || `<div class="empty-mini">Sin notificaciones nuevas.</div>`;
  }

  function initNotifBell() {
    const btn = document.getElementById("btn-notif-bell");
    const dd = document.getElementById("notif-dropdown");
    btn.addEventListener("click", (e) => { e.stopPropagation(); dd.classList.toggle("hidden"); });
    document.addEventListener("click", () => dd.classList.add("hidden"));
    document.getElementById("notif-view-all").addEventListener("click", (e) => {
      e.preventDefault(); dd.classList.add("hidden"); goTo("notificaciones");
    });
  }

  // ---------------------------------------------------------------------
  // Selector global de negocio / periodo (dashboard)
  // ---------------------------------------------------------------------
  function initGlobalSelectors() {
    const refrescar = () => { if (renderers.dashboard) renderers.dashboard(); };
    document.getElementById("select-negocio").addEventListener("change", (e) => { state.negocioActivo = e.target.value; refrescar(); });
    document.getElementById("select-periodo").addEventListener("change", (e) => {
      state.periodoActivo = e.target.value;
      document.getElementById("dash-rango").classList.toggle("hidden", e.target.value !== "personalizado");
      refrescar();
    });
    ["dash-desde", "dash-hasta"].forEach(id => document.getElementById(id).addEventListener("change", refrescar));
  }

  // Cuando cambian los datos de negocio, se refrescan los indicadores visibles.
  // (El POS no se re-renderiza para no perder una factura en curso.)
  function initEventosDatos() {
    API.on("*", () => {
      if (!AUTH.sesion()) return;
      refreshNotifBell();
      if (!document.getElementById("screen-app").classList.contains("hidden") && ["dashboard", "fidelidad", "actividad", "mis-ventas", "cierres", "membresias"].includes(state.paginaActual) && renderers[state.paginaActual]) renderers[state.paginaActual]();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initLogin();
    initNav();
    initNotifBell();
    initGlobalSelectors();
    initEventosDatos();
    state.rutaPendiente = rutaDeHash();
    mostrarPantalla("screen-login");
  });

  return { state, money, moneySigno, fmtDate, fmtDateTime, fmtTime, fmtFechaHora, fmtFechaCorta, iniciales, badge, escapeHtml,
    NOMBRE_NEGOCIO, ICONO_NEGOCIO, goTo, openModal, closeModal, confirmar, confirmarEliminar, toast, refreshNotifBell, registerPage,
    mostrarPantalla, abrirTerminal, volverAlPanel, logout, ejecutar, okOToast };
})();

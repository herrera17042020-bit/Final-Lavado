/* actividad.js — "Actividad del negocio": bitácora de eventos { id, fecha, tipo, negocio, usuario, descripcion, referencia, metadata }.
   Los eventos los registra la capa API (DEMO.registrarActividad); con backend vendrán de GET /api/actividad. */
const ACTIVIDAD = (() => {
  const e = APP.escapeHtml;
  const TIPOS = {
    factura_creada: ["🧾", "Factura creada", "success"], factura_anulada: ["🚫", "Factura anulada", "danger"], servicio_realizado: ["🛠️", "Servicio realizado", ""],
    uso_fidelidad: ["🎁", "Uso de saldo de fidelidad", ""], recarga_saldo: ["💰", "Recarga de saldo", "success"], visita_registrada: ["✔️", "Visita registrada", ""],
    recompensa_canjeada: ["🏆", "Recompensa canjeada", "success"], cierre_caja: ["🏦", "Cierre de caja", "warning"], membresia_vendida: ["🎫", "Membresía vendida", "success"], catalogo_membresia: ["🎫", "Planes de membresía", ""], tarjeta_estado: ["💳", "Estado de tarjeta", "warning"], cliente_registrado: ["👤", "Cliente registrado", ""],
    cliente_actualizado: ["✏️", "Cliente actualizado", ""], cliente_eliminado: ["🗑️", "Cliente eliminado", "danger"], inventario_descuento: ["📦", "Producto descontado de inventario", ""],
    inventario_movimiento: ["📥", "Movimiento de inventario", ""], producto_creado: ["➕", "Producto creado", ""], producto_actualizado: ["✏️", "Producto actualizado", ""],
    catalogo_servicio: ["🧰", "Catálogo de servicios", ""], catalogo_promocion: ["🏷️", "Promociones", ""], catalogo_empleado: ["👷", "Empleados", ""],
    config_actualizada: ["⚙️", "Configuración", ""], usuario_actualizado: ["🔐", "Usuarios", ""], login: ["🔓", "Inicio de sesión", ""], logout: ["🔒", "Cierre de sesión", ""], acceso_denegado: ["⛔", "Acceso denegado", "warning"],
  };
  const info = t => TIPOS[t] || ["•", t, ""];

  // Línea de evento (reutilizada por el dashboard).
  function itemEvento(ev, compacto = false) {
    const [ic, titulo, cls] = info(ev.tipo);
    return `<div class="ev"><div class="ev__ic ev__ic--${cls}">${ic}</div><div>
      <div class="ev__fecha">${APP.fmtFechaHora(ev.fecha)}${ev.negocio ? " · " + APP.NOMBRE_NEGOCIO[ev.negocio] : ""}</div>
      <div class="ev__titulo">${e(compacto ? ev.descripcion : titulo)}</div>
      ${compacto ? "" : `<div class="ev__detalle"><span>${e(ev.descripcion)}</span><span>Usuario: ${e(ev.usuario || "sistema")}</span>${ev.referencia ? `<span class="ev__ref">Ref: ${e(ev.referencia)}</span>` : ""}</div>`}</div></div>`;
  }

  async function render() {
    const $ = id => document.getElementById(id);
    const r = await API.actividad.listar({ negocio: $("act-negocio").value, tipo: $("act-tipo").value, desde: $("act-desde").value || null, hasta: $("act-hasta").value || null, q: $("act-buscar").value, limite: 150 });
    if (!r.ok) { APP.toast("danger", "No se pudo cargar la actividad", r.error); return; }
    $("act-contador").textContent = `${r.data.total} evento${r.data.total === 1 ? "" : "s"}${r.data.total > 150 ? " · mostrando los 150 más recientes" : ""}`;
    $("act-lista").innerHTML = r.data.eventos.length ? r.data.eventos.map(ev => itemEvento(ev)).join("") : `<div class="empty-state"><strong>No hay eventos con estos filtros</strong>Ajusta las fechas o la búsqueda.</div>`;
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("act-tipo").innerHTML = `<option value="">Todos los eventos</option>` + Object.entries(TIPOS).map(([k, v]) => `<option value="${k}">${v[1]}</option>`).join("");
    ["act-negocio", "act-tipo", "act-desde", "act-hasta"].forEach(id => document.getElementById(id).addEventListener("change", render));
    document.getElementById("act-buscar").addEventListener("input", render);
    APP.registerPage("actividad", render);
  });
  return { itemEvento, TIPOS };
})();

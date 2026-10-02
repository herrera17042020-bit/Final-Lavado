/* inventario.js — Inventario por negocio. Los movimientos (entradas, consumos, ajustes) pasan por API.inventario.*
   y quedan en DEMO.movimientosInventario junto con los descuentos automáticos de las facturas. */
(() => {
  const e = APP.escapeHtml;
  const TIPO = { venta: "Venta de producto", consumo: "Consumo de servicio", entrada: "Entrada", ajuste: "Ajuste", reversion: "Devolución (anulación)" };

  function renderInventario(negocio) {
    const cont = document.getElementById(`inv-root-${negocio}`);
    const admin = AUTH.puede("inventario.editar");
    cont.innerHTML = `
      <div class="toolbar">
        <input type="text" id="inv-buscar-${negocio}" placeholder="Buscar producto...">
        <select id="inv-filtro-estado-${negocio}"><option value="">Todos los estados</option><option value="ok">Stock saludable</option><option value="bajo">Stock bajo</option></select>
        ${admin ? `<button class="btn btn--primary" id="inv-nuevo-${negocio}">+ Nuevo producto</button>` : ""}
      </div>
      <div class="grid-cards" id="inv-grid-${negocio}"></div>
      <div class="card" style="margin-top:16px"><div class="card-head"><h4>Movimientos recientes de inventario</h4></div><div class="tabla-scroll" id="inv-mov-${negocio}"></div></div>`;
    const pintar = () => pintarGrid(negocio);
    document.getElementById(`inv-buscar-${negocio}`).addEventListener("input", pintar);
    document.getElementById(`inv-filtro-estado-${negocio}`).addEventListener("change", pintar);
    const nuevo = document.getElementById(`inv-nuevo-${negocio}`); if (nuevo) nuevo.addEventListener("click", () => formulario(negocio));
    document.getElementById(`inv-grid-${negocio}`).addEventListener("click", ev => {
      const b = ev.target.closest("button[data-a]"); if (!b) return;
      if (b.dataset.a === "editar") formulario(negocio, b.dataset.id);
      else if (b.dataset.a === "eliminar") { const p = DEMO.productos.find(x => x.id === b.dataset.id); const usan = DEMO.servicios.filter(s => (s.consumo || []).some(c => c.producto === p.id)).map(s => s.nombre);
        APP.confirmarEliminar(p.nombre, usan.length ? `También se quitará del consumo de: ${usan.join(", ")}.` : "", () => API.inventario.eliminarProducto(p.id), () => pintarGrid(negocio)); }
      else movimiento(negocio, b.dataset.id, b.dataset.a);
    });
    pintar();
  }
  const bajo = p => p.stock <= p.stockMinimo;

  function pintarGrid(negocio) {
    const q = (document.getElementById(`inv-buscar-${negocio}`).value || "").toLowerCase();
    const filtro = document.getElementById(`inv-filtro-estado-${negocio}`).value;
    let lista = DEMO.productos.filter(p => p.negocio === negocio);
    if (q) lista = lista.filter(p => p.nombre.toLowerCase().includes(q));
    if (filtro) lista = lista.filter(p => (bajo(p) ? "bajo" : "ok") === filtro);
    const admin = AUTH.puede("inventario.editar"), grid = document.getElementById(`inv-grid-${negocio}`);
    grid.innerHTML = lista.length ? lista.map(p => {
      const total = p.stock * p.rendimiento, disp = API.sync.usosDisponibles(p), pct = total ? Math.round(disp / total * 100) : 0, b = bajo(p);
      return `<div class="card product-card">
        <div class="product-card__head"><div><h4>${e(p.nombre)}</h4><span class="text-muted small">${e(p.categoria)} · ${e(p.unidad)}${p.precioVenta ? ` · Venta ${APP.money(p.precioVenta)}` : " · Uso interno"}</span></div>
          ${b ? `<span class="badge badge--danger">⚠️ Stock bajo</span>` : `<span class="badge badge--success">Saludable</span>`}</div>
        <div class="product-card__stock"><span>Stock actual</span><strong>${p.stock} ${e(p.unidad)}${p.stock === 1 ? "" : "s"} <span class="text-muted small">(mínimo ${p.stockMinimo})</span></strong></div>
        <div class="stock-bar"><div class="stock-bar__fill ${b ? "stock-bar__fill--danger" : ""}" style="width:${Math.min(p.stock / Math.max(p.stockMinimo * 2, 1) * 100, 100)}%"></div></div>
        <div class="product-card__meta"><div><span>Rendimiento</span><strong>${p.rendimiento} usos / ${e(p.unidad)}</strong></div><div><span>Usos disponibles</span><strong>${disp} / ${total}</strong></div></div>
        <div class="stock-bar stock-bar--thin"><div class="stock-bar__fill" style="width:${pct}%"></div></div>
        <p class="text-muted small">Unidad abierta: quedan ${p.usoActual} usos</p>
        ${admin ? `<div class="product-card__actions"><button class="btn btn--ghost btn--sm" data-a="entrada" data-id="${p.id}">＋ Entrada</button><button class="btn btn--ghost btn--sm" data-a="consumo" data-id="${p.id}">− Consumo</button><button class="btn btn--ghost btn--sm" data-a="editar" data-id="${p.id}">Editar</button><button class="btn btn--ghost btn--sm btn--del" data-a="eliminar" data-id="${p.id}">🗑 Eliminar</button></div>` : ""}</div>`;
    }).join("") : `<div class="empty-state"><strong>No se encontraron productos</strong>Cambia la búsqueda o el filtro de estado.</div>`;
    const movs = DEMO.movimientosInventario.filter(m => m.negocio === negocio).slice(0, 25);
    document.getElementById(`inv-mov-${negocio}`).innerHTML = movs.length ? `<table class="table table--compact"><thead><tr><th>Fecha</th><th>Producto</th><th>Movimiento</th><th>Cantidad</th><th>Stock</th><th>Referencia</th><th>Usuario</th></tr></thead><tbody>${movs.map(m => `<tr><td>${APP.fmtFechaHora(m.fecha)}</td><td>${e(m.productoNombre)}</td><td>${TIPO[m.tipo] || m.tipo}${m.motivo ? `<div class="small text-muted">${e(m.motivo)}</div>` : ""}</td><td class="num ${["entrada", "reversion"].includes(m.tipo) ? "pos" : m.tipo === "ajuste" ? "" : "neg"}">${["entrada", "reversion"].includes(m.tipo) ? "+" : m.tipo === "ajuste" ? (m.cantidad > 0 ? "+" : "") : "−"}${Math.abs(m.cantidad)} ${e(m.unidad)}</td><td>${m.stockAntes} → ${m.stockDespues}</td><td>${e(m.referencia || "—")}</td><td>${e(m.usuario)}</td></tr>`).join("")}</tbody></table>`
      : `<div class="empty-state">Aún no hay movimientos. Se registran al vender productos, completar servicios o dar entradas.</div>`;
  }

  function movimiento(negocio, id, tipo) {
    const p = DEMO.productos.find(x => x.id === id), esE = tipo === "entrada";
    APP.openModal(esE ? `Entrada de ${e(p.nombre)}` : `Consumo manual de ${e(p.nombre)}`, `<form id="mv" novalidate>
      <p class="text-muted small">Stock actual: <strong>${p.stock} ${e(p.unidad)}(s)</strong>${esE ? "" : ` · Usos disponibles: <strong>${API.sync.usosDisponibles(p)}</strong>`}</p>
      <div class="form-grid"><label>${esE ? `Cantidad (${e(p.unidad)}s)` : "Usos a descontar"}<input name="cantidad" type="number" min="1" step="1" value="1"></label>
      <label>Motivo (opcional)<input name="motivo" maxlength="80" placeholder="${esE ? "Compra a proveedor" : "Merma, prueba…"}"></label></div>
      <div class="msg msg--danger hidden" id="mv-err"></div>
      <div class="form-actions"><button type="button" class="btn btn--ghost" data-c>Cancelar</button><button class="btn btn--primary" type="submit">${esE ? "Registrar entrada" : "Registrar consumo"}</button></div></form>`, { size: "modal--sm" });
    const f = document.getElementById("mv"); f.querySelector("[data-c]").onclick = APP.closeModal;
    f.onsubmit = async ev => {
      ev.preventDefault();
      const r = await APP.ejecutar(f.querySelector("[type=submit]"), () => API.inventario.registrarMovimiento({ productoId: id, tipo, cantidad: f.cantidad.value, motivo: f.motivo.value }), "Guardando…");
      if (!r.ok) { const er = document.getElementById("mv-err"); er.textContent = r.error; er.classList.remove("hidden"); return; }
      APP.closeModal(); APP.toast(bajo(p) ? "warning" : "success", esE ? "Entrada registrada" : "Consumo registrado", bajo(p) ? `${p.nombre} tiene stock bajo (${p.stock}).` : p.nombre); pintarGrid(negocio);
    };
  }

  function formulario(negocio, id) {
    const p = id ? DEMO.productos.find(x => x.id === id) : null;
    APP.openModal(p ? "Editar producto" : "Nuevo producto", `<form id="pf" novalidate><div class="form-grid">
      <label>Nombre *<input name="nombre" value="${p ? e(p.nombre) : ""}" maxlength="60"></label>
      <label>Categoría<input name="categoria" value="${p ? e(p.categoria) : ""}"></label>
      <label>Unidad<input name="unidad" value="${p ? e(p.unidad) : "unidad"}"></label>
      <label>Stock actual (unidades)<input name="stock" type="number" min="0" step="1" value="${p ? p.stock : 5}"></label>
      <label>Stock mínimo<input name="stockMinimo" type="number" min="0" step="1" value="${p ? p.stockMinimo : 3}"></label>
      <label>Rendimiento (usos por unidad)<input name="rendimiento" type="number" min="1" step="1" value="${p ? p.rendimiento : 10}"></label>
      <label>Precio de venta (vacío = uso interno)<input name="precioVenta" type="number" min="0" step="0.01" value="${p && p.precioVenta ? p.precioVenta : ""}"></label></div>
      <div class="msg msg--danger hidden" id="pf-err"></div>
      <div class="form-actions"><button type="button" class="btn btn--ghost" data-c>Cancelar</button><button class="btn btn--primary" type="submit">${p ? "Guardar cambios" : "Crear producto"}</button></div></form>`);
    const f = document.getElementById("pf"); f.querySelector("[data-c]").onclick = APP.closeModal;
    f.onsubmit = async ev => {
      ev.preventDefault();
      const d = { negocio, nombre: f.nombre.value, categoria: f.categoria.value, unidad: f.unidad.value, stock: f.stock.value, stockMinimo: f.stockMinimo.value, rendimiento: f.rendimiento.value, precioVenta: f.precioVenta.value };
      const r = await APP.ejecutar(f.querySelector("[type=submit]"), () => API.inventario.guardarProducto(d, id), "Guardando…");
      if (!r.ok) { const er = document.getElementById("pf-err"); er.textContent = r.error; er.classList.remove("hidden"); return; }
      APP.closeModal(); APP.toast("success", p ? "Producto actualizado" : "Producto creado", r.data.nombre); pintarGrid(negocio);
    };
  }

  ["autolavado", "barberia"].forEach(n => {
    APP.registerPage(`${n}-inventario`, () => renderInventario(n));
    API.on("*", () => { if (APP.state.paginaActual === `${n}-inventario` && document.getElementById(`inv-grid-${n}`)) pintarGrid(n); });
  });
})();

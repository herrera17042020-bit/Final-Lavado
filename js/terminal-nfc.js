/* ==========================================================================
   terminal-nfc.js — Terminal NFC de tarjetas de fidelidad (táctil).

   ► ESTA TERMINAL USA UN LECTOR SIMULADO. No hay lectura NFC física en el prototipo.
   Arquitectura preparada para hardware real:
       LECTOR  →  UID de la tarjeta  →  API.tarjetas.buscarPorUid(uid)
               →  datos del cliente  →  tarjeta en pantalla
   Para integrar un lector real, implementa un objeto con la interfaz de `LECTOR`
   (iniciar(onUid) / detener()) y asígnalo en `LECTOR`. Opciones típicas:
     - Lector USB tipo teclado (keyboard-wedge): ya funciona con el campo "UID manual".
     - Web NFC (NDEFReader, solo Chrome Android sobre HTTPS) o un servicio local que
       lea el hardware y publique el UID.
   ========================================================================== */

const TERMINAL_NFC = (() => {
  const e = APP.escapeHtml, money = APP.money;
  const INACTIVIDAD_SEG = 60;

  // ---- Capa de lector (intercambiable) ----
  const LECTOR = {
    tipo: "simulado",
    descripcion: "Lector simulado — sin hardware NFC conectado",
    iniciar(onUid) { this._cb = onUid; },   // el simulador dispara onUid desde la interfaz
    detener() { this._cb = null; },
    emitir(uid) { if (this._cb) this._cb(uid); },
  };

  let vista = null;       // { tarjeta, cliente, fidelidad, movimientos }
  let estado = "espera";  // espera | leyendo | tarjeta
  let errorLectura = "";
  let restante = INACTIVIDAD_SEG, timer = null;
  const root = () => document.getElementById("terminal-nfc-root");

  function iniciar() { LECTOR.iniciar(leerUid); volver(); bind(); }
  function detener() { LECTOR.detener(); clearInterval(timer); timer = null; vista = null; estado = "espera"; }
  let ligado = false;
  function bind() {
    if (ligado) return; ligado = true;
    const r = root();
    r.addEventListener("click", ev => {
      const el = ev.target.closest("[data-nfc]"); if (!el || el.disabled) return;
      reiniciarTimer();
      const a = el.dataset.nfc;
      if (a === "sim") LECTOR.emitir(el.dataset.uid);
      else if (a === "otra") volver();
      else if (a === "fidelidad") modalFidelidad();
      else if (a === "compra") APP.abrirTerminal("autolavado", { clienteId: vista.cliente.id });
    });
    r.addEventListener("submit", ev => { if (ev.target.id === "nfc-manual") { ev.preventDefault(); const v = document.getElementById("nfc-uid").value; if (v.trim()) LECTOR.emitir(v); } });
    ["pointerdown", "keydown"].forEach(t => r.addEventListener(t, reiniciarTimer));
  }

  // Flujo: UID → buscar → mostrar tarjeta.
  async function leerUid(uid) {
    estado = "leyendo"; errorLectura = ""; render();
    const [r] = await Promise.all([API.tarjetas.buscarPorUid(uid), new Promise(x => setTimeout(x, 650))]);   // pausa breve: "leyendo"
    if (!r.ok) { estado = "espera"; errorLectura = r.error; render(); return; }
    vista = r.data; estado = "tarjeta"; restante = INACTIVIDAD_SEG; iniciarTimer(); render();
  }
  function volver() { clearInterval(timer); timer = null; vista = null; estado = "espera"; errorLectura = ""; render(); }

  function iniciarTimer() { clearInterval(timer); timer = setInterval(() => { restante--; const el = document.getElementById("nfc-timeout"); if (el) el.textContent = `La tarjeta se cerrará automáticamente en ${restante}s por inactividad.`; if (restante <= 0) { volver(); APP.toast("info", "Tarjeta cerrada por inactividad"); } }, 1000); }
  function reiniciarTimer() { restante = INACTIVIDAD_SEG; }

  // ---- Vistas ----
  function render() {
    const r = root(); if (!r) return;
    if (estado === "espera") {
      const demo = DEMO.tarjetas.filter(t => DEMO.clientes.find(c => c.id === t.clienteId && c.estado === "activo")).slice(0, 8);
      r.innerHTML = `<div class="nfc-idle">
        <div class="nfc-sim-banner">⚠️ MODO SIMULACIÓN · No hay lector NFC físico conectado</div>
        <div class="nfc-idle__icono" style="font-size:96px;line-height:1">📶</div>
        <h1 style="margin:10px 0 4px">Acerca tu tarjeta</h1>
        <p class="text-muted">Coloca la tarjeta de fidelidad sobre el lector para consultar tus lavados premium y tus premios.</p>
        ${errorLectura ? `<div class="msg msg--danger" style="max-width:520px;margin:14px auto">${e(errorLectura)}</div>` : ""}
        <p class="small text-muted" style="margin-top:22px"><strong>Simular lectura:</strong> toca una tarjeta de demostración</p>
        <div class="nfc-tarjetas-demo">${demo.map(t => { const c = DEMO.clientes.find(x => x.id === t.clienteId); return `<button type="button" class="nfc-tarjeta-demo" data-nfc="sim" data-uid="${t.uid}"><strong>${e(c.nombre)}</strong><span>${t.uid}</span></button>`; }).join("")}</div>
        <form id="nfc-manual" class="nfc-manual" autocomplete="off"><input id="nfc-uid" placeholder="UID de tarjeta (ej. 04:AB:…) o lector USB" aria-label="UID de tarjeta"><button class="btn btn--primary" type="submit">Leer</button></form>
      </div>`;
    } else if (estado === "leyendo") {
      r.innerHTML = `<div class="nfc-leyendo"><div class="spinner"></div><h2 style="margin-top:22px">Leyendo tarjeta…</h2><p class="text-muted">Simulación de lectura</p></div>`;
    } else if (vista) {
      const { tarjeta: t, cliente: c, fidelidad: f, movimientos } = vista, bloq = t.estado !== "activa";
      r.innerHTML = `<div class="nfc-wrap"><div style="text-align:center;margin-bottom:14px"><span class="nfc-sim-banner" style="margin:0">Simulación · tarjeta detectada</span><h2 style="margin-top:8px;color:#fff">✅ Tarjeta detectada</h2></div>
      <div class="nfc-panel">
        <div>
          <div class="vcard ${bloq ? "vcard--bloqueada" : ""}">
            <div class="vcard__top"><div><div class="vcard__id">${e(t.id)}</div><div class="vcard__uid">${e(t.uid)}</div></div><span class="badge">${bloq ? "Bloqueada" : "Activa"}</span></div>
            <div class="vcard__nombre">${e(c.nombre)}</div>
            <div class="vcard__saldo-label">Lavados premium</div><div class="vcard__saldo">${f.dias} / ${f.meta}</div>
          </div>
          ${bloq ? `<div class="msg msg--danger">Esta tarjeta está bloqueada. Solo un administrador puede activarla.</div>` : ""}
          <div class="nfc-acciones">
            <button class="nfc-accion" data-nfc="fidelidad"><span>⭐</span>Ver premios</button>
            <button class="nfc-accion nfc-accion--primary" data-nfc="compra" ${bloq || c.estado !== "activo" ? "disabled" : ""}><span>🛒</span>Nueva venta con este cliente</button>
            <button class="nfc-accion" data-nfc="otra" style="grid-column:1/-1"><span>🔄</span>Leer otra tarjeta</button>
          </div>
        </div>
        <div class="card">
          <h4>⭐ Lavados premium</h4>
          ${FIDELIDAD.sellos(f.dias, f.meta)}
          <h4 style="margin-top:14px">🎁 Premios</h4>${FIDELIDAD.premiosHtml(f)}
          ${f.recompensaDisponible || f.descuento.disponible ? `<div class="nfc-recompensa">🎉 Tiene un premio disponible: se aplica al facturar.</div>` : ""}
          <div class="small text-muted" style="margin-top:8px">Estado del cliente: ${APP.badge(c.estado)} · ${c.visitas} visitas · Última utilización: ${t.ultimoUso ? APP.fmtFechaCorta(t.ultimoUso) : "—"}</div>
          <h4 style="margin-top:18px">Últimos movimientos</h4>
          <div class="tabla-scroll" style="max-height:260px">${FIDELIDAD.tablaMovimientos(movimientos.slice(0, 5))}</div>
        </div>
      </div>
      <div class="nfc-timeout" id="nfc-timeout">La tarjeta se cerrará automáticamente en ${restante}s por inactividad.</div></div>`;
    }
  }

  // ---- Acciones ----
  function modalFidelidad() {
    const { cliente: c, fidelidad: f } = vista;
    APP.openModal("Premios de fidelidad", `<div style="text-align:center"><div style="font-size:44px">⭐</div><h3>${f.dias} de ${f.meta} lavados premium</h3>
      <div style="margin:12px 0">${FIDELIDAD.sellos(f.dias, f.meta)}</div></div>${FIDELIDAD.premiosHtml(f)}
      <p class="small text-muted" style="margin-top:10px">${e(c.nombre)} · Cada lavado premium suma uno. Los premios se aplican al facturar.</p>
      <div class="form-actions"><button class="btn btn--primary" onclick="APP.closeModal()">Cerrar</button></div>`, { size: "modal--sm" });
  }

  return { iniciar, detener, LECTOR };
})();

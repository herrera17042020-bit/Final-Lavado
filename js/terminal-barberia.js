/* terminal-barberia.js — Terminal táctil de barberia.
   Reutiliza el motor POS compartido (js/pos-core.js): misma factura conjunta, pago mixto,
   validaciones y registro que el panel. Evita mantener dos lógicas de venta distintas. */
const TERMINAL_BARBERIA = (() => {
  let pos = null;
  function iniciar(params = {}) {
    const root = document.getElementById("terminal-barberia-root");
    if (!pos) { root.innerHTML = ""; pos = POS_CORE.montar(root, { negocio: "barberia", modo: "terminal" }); }
    else { pos.reset(true); pos.render(); }
    if (params.clienteId) pos.elegirCliente(params.clienteId);   // p. ej. viene de la terminal NFC
  }
  return { iniciar };
})();

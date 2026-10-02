/* terminal-autolavado.js — Terminal táctil de autolavado.
   Reutiliza el motor POS compartido (js/pos-core.js): misma factura conjunta, pago mixto,
   validaciones y registro que el panel. Evita mantener dos lógicas de venta distintas. */
const TERMINAL_AUTOLAVADO = (() => {
  let pos = null;
  function iniciar(params = {}) {
    const root = document.getElementById("terminal-autolavado-root");
    if (!pos) { root.innerHTML = ""; pos = POS_CORE.montar(root, { negocio: "autolavado", modo: "terminal" }); }
    else { pos.reset(true); pos.render(); }
    if (params.clienteId) pos.elegirCliente(params.clienteId);   // p. ej. viene de la terminal NFC
  }
  return { iniciar };
})();

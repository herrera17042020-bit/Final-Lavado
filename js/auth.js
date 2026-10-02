/* ==========================================================================
   auth.js — Sesión, roles y control de acceso (DEMO).

   IMPORTANTE: este módulo controla lo que la INTERFAZ muestra. La seguridad
   real siempre debe validarse en el backend: el navegador puede manipularse.
   Con backend real:
     - El login (API.auth.login) devuelve una sesión/token firmado por el servidor.
     - Cada endpoint verifica el rol/permiso del token (aquí lo simula
       `exigir()` dentro de js/api.js).
     - Este archivo solo decidiría qué ocultar/mostrar según los permisos que
       el servidor informe para el usuario.
   ========================================================================== */

const AUTH = (() => {
  let _sesion = null;

  // Roles → permisos. "*" = acceso completo.
  const ROLES = {
    ADMIN: { label: "Administrador", permisos: ["*"] },
    EMPLEADO: {
      label: "Empleado",
      // El personal solo VENDE (autolavado y barbería) y consulta SUS propias ventas.
      // Sin estadísticas del negocio, terminales, fidelidad ni notificaciones.
      // Membresías: el personal puede VENDERLAS (y ver las vigentes), pero no editar los planes.
      permisos: ["ventas.crear", "ventas.propias", "clientes.crear", "caja.cerrar", "membresias.ver", "membresias.vender", "fidelidad.ver"],   // fidelidad.ver: solo consultar el progreso (no edita)
    },
  };

  // Página del panel → permiso requerido.
  const PERMISO_PAGINA = {
    "dashboard": "dashboard.ver",
    "autolavado-venta": "ventas.crear", "barberia-venta": "ventas.crear",
    "autolavado-ventas": "ventas.ver", "barberia-ventas": "ventas.ver",
    "autolavado-clientes": "clientes.ver", "barberia-clientes": "clientes.ver",
    "fidelidad": "fidelidad.ver", "membresias": "membresias.ver",
    "autolavado-inventario": "inventario.ver", "barberia-inventario": "inventario.ver",
    "autolavado-servicios": "catalogos.ver", "barberia-servicios": "catalogos.ver",
    "autolavado-promociones": "catalogos.ver", "barberia-promociones": "catalogos.ver",
    "empleados": "empleados.ver", "usuarios": "usuarios.ver", "configuracion": "config.ver",
    "reportes": "reportes.ver", "estadisticas": "reportes.ver", "actividad": "actividad.ver",
    "notificaciones": "notificaciones.ver", "ayuda": "ayuda.ver",
    "mis-ventas": "ventas.propias",
    "autolavado-cierre": "caja.cerrar", "barberia-cierre": "caja.cerrar", "cierres": "cierres.ver",
  };
  const PAGINA_INICIO = { ADMIN: "dashboard", EMPLEADO: "autolavado-venta" };

  const sesion = () => _sesion;
  function iniciar(s) { _sesion = Object.freeze({ ...s, negocios: Object.freeze([...(s.negocios || [])]) }); }
  function cerrar() { _sesion = null; }

  function puede(permiso) {
    if (!_sesion) return false;
    const p = (ROLES[_sesion.rol] || { permisos: [] }).permisos;
    return p.includes("*") || p.includes(permiso);
  }
  // Un empleado solo entra a su(s) negocio(s) asignado(s); el ADMIN a todos.
  function puedeNegocio(n) {
    return !!_sesion && (_sesion.rol === "ADMIN" || (_sesion.negocios || []).includes(n));
  }
  function puedeAcceder(pagina) {
    if (pagina === "mis-ventas") return !!_sesion && _sesion.rol === "EMPLEADO";   // el admin ya ve todo en Ventas/Reportes
    const req = PERMISO_PAGINA[pagina];
    const m = /^(autolavado|barberia)-/.exec(pagina);
    return !!req && puede(req) && (!m || puedeNegocio(m[1]));
  }
  const etiquetaRol = rol => (ROLES[rol] || { label: rol }).label;
  const paginaInicio = () => !_sesion ? "ayuda" : (_sesion.rol === "EMPLEADO" && _sesion.negocios[0] ? `${_sesion.negocios[0]}-venta` : (PAGINA_INICIO[_sesion.rol] || "ayuda"));

  return { sesion, iniciar, cerrar, puede, puedeNegocio, puedeAcceder, etiquetaRol, paginaInicio, ROLES, PERMISO_PAGINA };
})();

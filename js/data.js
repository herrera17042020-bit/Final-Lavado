/* ==========================================================================
   data.js — Fuente única de datos DEMO para todo el prototipo.
   Todo aquí es simulado. En la versión final esto vendría de una API REST.
   ========================================================================== */

const DEMO = (() => {

  const NOMBRES = ["María José Reyes","Carlos Mendoza","Ana Lucía Torres","Roberto Aguilar","Fernanda Solís",
    "Jorge Ramírez","Patricia Núñez","Luis Fernando Vega","Karla Espinoza","Diego Alberto Ríos",
    "Silvia Morales","Ernesto Calero","Wendy Castillo","José Ramón Pérez","Daniela Ordóñez",
    "Marlon Suazo","Gabriela Rocha","Óscar Membreño","Yolanda Martínez","Kevin Alexander Gómez",
    "Pamela Lacayo","Iván Danilo Cruz","Rosa Amelia Vado","Franklin Chávez","Melissa Bravo"];

  const EMPLEADO_NOMBRES = ["Douglas Herrera","Mayela Sánchez","Ricardo Blandón","Ileana Rugama","Anthony Baldelomar",
    "Scarleth Miranda","Erick Guevara","Tania López","Brayan Mojica","Xiomara Delgado"];

  function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function pick(arr) { return arr[rnd(0, arr.length - 1)]; }
  function pad(n, len = 3) { return String(n).padStart(len, "0"); }
  function uid(prefix) { return `${prefix}-${Date.now().toString(36)}-${rnd(100,999)}`; }

  function fechaHace(diasAtras) {
    const d = new Date();
    d.setDate(d.getDate() - diasAtras);
    d.setHours(rnd(8, 19), rnd(0, 59), 0, 0);
    return d;
  }

  // ---------------------------------------------------------------------
  // TIPOS DE VEHÍCULO (los que maneja El Rápido)
  // ---------------------------------------------------------------------
  const tiposVehiculo = ["Moto", "Sedán", "SUV", "Pick up", "Microbús", "Taxi", "Camión 3T"];
  const tiposConPrecio = ["Moto", "Sedán", "SUV", "Pick up", "Microbús"]; // usados por los datos de ejemplo

  // ---------------------------------------------------------------------
  // SERVICIOS — catálogo real de El Rápido (editable por el administrador)
  //   categoria       "lavado" | "extra" (autolavado). Barbería sin categoría.
  //   preciosVehiculo precio según el tipo de vehículo (si existe, manda sobre precioBase).
  //                   Un tipo sin precio = "por definir" para ese vehículo.
  //   precioBase      precio único; en servicios por vehículo guarda el menor ("desde").
  //   generaFidelidad true = cuenta como lavado PREMIUM para los premios de fidelidad.
  //                   0 = precio por definir: el servicio no se puede vender hasta
  //                   que el administrador le asigne precio en Servicios.
  // ---------------------------------------------------------------------
  const extra = (n, nombre, descripcion, consumo = []) => ({ id: `EX-${pad(n, 2)}`, negocio: "autolavado", categoria: "extra", nombre, descripcion, precioBase: 0, duracion: 0, estado: "activo", generaFidelidad: false, consumo });
  const servicios = [
    { id: "SV-01", negocio: "autolavado", categoria: "lavado", nombre: "Rápido – Breve", descripcion: "Lavado exterior, limpieza interior, aspirado, limpieza de llantas y brillo básico",
      preciosVehiculo: { "Moto": 99, "Sedán": 175, "SUV": 225, "Pick up": 255, "Microbús": 355 }, precioBase: 99, duracion: 30, estado: "activo", generaFidelidad: false, consumo: [{ producto: "P-01", cantidad: 1 }] },
    { id: "SV-02", negocio: "autolavado", categoria: "lavado", nombre: "Rápido – Nítido", descripcion: "Lavado exterior, limpieza interior, aspirado, limpieza y brillo de llantas, brillo-pasteado",
      preciosVehiculo: { "Moto": 150, "Sedán": 250, "SUV": 310, "Pick up": 350, "Microbús": 450 }, precioBase: 150, duracion: 50, estado: "activo", generaFidelidad: true, consumo: [{ producto: "P-01", cantidad: 1 }, { producto: "P-02", cantidad: 1 }] },
    { id: "SV-03", negocio: "autolavado", categoria: "lavado", nombre: "Servicio Premium", descripcion: "Nítido + pasteado + brillo de llantas",
      preciosVehiculo: { "Microbús": 870 }, precioBase: 870, duracion: 70, estado: "activo", generaFidelidad: true, consumo: [{ producto: "P-01", cantidad: 1 }, { producto: "P-02", cantidad: 1 }] },
    // ---- Servicios extra (se agregan a cualquier lavado; precio lo define el administrador) ----
    extra(1, "Tratamiento cerámico", "Protección hidrofóbica de larga duración."),
    extra(2, "Acondicionador de tablero y puertas", "Limpieza profunda y restauración."),
    extra(3, "Pasteado Ultimate® Meguiar's", "Protección de larga duración.", [{ producto: "P-02", cantidad: 1 }]),
    extra(4, "Limpieza de interiores", "Asientos, suelos, puertas y cinturones."),
    extra(5, "Removedor de gotas secas", "Elimina manchas de agua y contaminantes."),
    extra(6, "Restauración de focos", "Mayor visibilidad y seguridad."),
    extra(7, "Brillo de llantas premium", "Protección y restauración."),
    extra(8, "Restaurador de plásticos", "Protege, renueva y cuida."),
    extra(9, "Limpieza de motor", "Mejora apariencia y acabado.", [{ producto: "P-03", cantidad: 1 }]),
    extra(10, "Lavado de chasis", "Elimina suciedad y previene corrosión."),
    extra(11, "Pulimiento con protección cerámica", "Corrige imperfecciones y deja protección cerámica de larga duración."),
    // ---- Barbería (precios reales del local) ----
    { id: "SV-07", negocio: "barberia", nombre: "Corte clásico", descripcion: "", precioBase: 150, duracion: 0, estado: "activo", generaFidelidad: false, consumo: [] },
    { id: "SV-08", negocio: "barberia", nombre: "Corte + barba", descripcion: "", precioBase: 230, duracion: 0, estado: "activo", generaFidelidad: false, consumo: [] },
    { id: "SV-09", negocio: "barberia", nombre: "Barba", descripcion: "", precioBase: 110, duracion: 0, estado: "activo", generaFidelidad: false, consumo: [] },
    { id: "SV-10", negocio: "barberia", nombre: "Ceja", descripcion: "", precioBase: 50, duracion: 0, estado: "activo", generaFidelidad: false, consumo: [] },
    { id: "SV-11", negocio: "barberia", nombre: "Experiencia El Rápido", descripcion: "", precioBase: 290, duracion: 0, estado: "activo", generaFidelidad: false, consumo: [] },
    { id: "SV-12", negocio: "barberia", nombre: "Corte + ceja", descripcion: "", precioBase: 170, duracion: 0, estado: "activo", generaFidelidad: false, consumo: [] },
    { id: "SV-13", negocio: "barberia", nombre: "Corte + exfoliante", descripcion: "", precioBase: 195, duracion: 0, estado: "activo", generaFidelidad: false, consumo: [] },
  ];

  // ---------------------------------------------------------------------
  // PRODUCTOS / INVENTARIO (DEMO)
  // ---------------------------------------------------------------------
  // Semántica de inventario (unificada):
  //   stock       = unidades físicas en existencia (incluye la unidad abierta)
  //   rendimiento = usos que rinde cada unidad
  //   usoActual   = usos que quedan en la unidad abierta (0 si no hay stock)
  //   precioVenta = si existe, el producto puede venderse como línea de factura
  const productos = [
    { id: "P-01", nombre: "Shampoo Premium", categoria: "Limpieza", negocio: "autolavado", unidad: "botella", stock: 3, stockMinimo: 4, rendimiento: 10, precioVenta: null },
    { id: "P-02", nombre: "Cera líquida", categoria: "Protección", negocio: "autolavado", unidad: "galón", stock: 6, stockMinimo: 3, rendimiento: 15, precioVenta: null },
    { id: "P-03", nombre: "Desengrasante", categoria: "Limpieza", negocio: "autolavado", unidad: "galón", stock: 2, stockMinimo: 3, rendimiento: 20, precioVenta: null },
    { id: "P-04", nombre: "Limpiavidrios", categoria: "Limpieza", negocio: "autolavado", unidad: "botella", stock: 8, stockMinimo: 3, rendimiento: 25, precioVenta: 45 },
    { id: "P-05", nombre: "Aromatizante", categoria: "Acabado", negocio: "autolavado", unidad: "botella", stock: 5, stockMinimo: 4, rendimiento: 40, precioVenta: 60 },
    { id: "P-06", nombre: "Paños de microfibra", categoria: "Herramientas", negocio: "autolavado", unidad: "unidad", stock: 24, stockMinimo: 10, rendimiento: 1, precioVenta: 35 },
    { id: "P-07", nombre: "Esponjas", categoria: "Herramientas", negocio: "autolavado", unidad: "unidad", stock: 3, stockMinimo: 6, rendimiento: 1, precioVenta: null },
    { id: "P-08", nombre: "Loción para barba", categoria: "Cuidado", negocio: "barberia", unidad: "botella", stock: 7, stockMinimo: 3, rendimiento: 30, precioVenta: 150 },
    { id: "P-09", nombre: "Cera para cabello", categoria: "Estilizado", negocio: "barberia", unidad: "pote", stock: 2, stockMinimo: 3, rendimiento: 25, precioVenta: 140 },
    { id: "P-10", nombre: "Cuchillas desechables", categoria: "Herramientas", negocio: "barberia", unidad: "caja", stock: 5, stockMinimo: 2, rendimiento: 10, precioVenta: null },
  ];
  productos.forEach(p => {
    p.usoActual = p.stock > 0 ? Math.max(1, Math.ceil(p.rendimiento * (0.3 + Math.random() * 0.7))) : 0;
    p.capacidadTotal = p.stock * p.rendimiento; // compatibilidad con versiones anteriores
  });

  // ---------------------------------------------------------------------
  // EMPLEADOS
  // ---------------------------------------------------------------------
  const cargosAuto = ["Lavador", "Supervisor de lavado", "Cajero"];
  const cargosBarber = ["Barbero", "Barbero senior", "Cajero"];
  const empleados = EMPLEADO_NOMBRES.map((nombre, i) => {
    const negocio = i % 2 === 0 ? "autolavado" : "barberia";
    return {
      id: `EMP-${pad(i + 1)}`,
      nombre,
      cargo: negocio === "autolavado" ? pick(cargosAuto) : pick(cargosBarber),
      negocio,
      telefono: `8${rnd(100,999)}-${rnd(1000,9999)}`,
      correo: nombre.toLowerCase().split(" ")[0] + "." + nombre.toLowerCase().split(" ").slice(-1)[0] + "@businesshub.demo",
      estado: i === 9 ? "inactivo" : "activo",
      ventasRealizadas: rnd(18, 140),
      ingresosGenerados: rnd(8000, 42000),
      inicial: nombre.split(" ").map(p => p[0]).slice(0,2).join("")
    };
  });

  // ---------------------------------------------------------------------
  // PROMOCIONES
  // ---------------------------------------------------------------------
  const promociones = [
    // Autolavado (real): descuento para taxis miembros.
    { id: "PR-01", nombre: "Taxis miembros", descripcion: "Descuento del 66% para taxis miembros", tipo: "porcentaje", valor: 66, negocio: "autolavado", inicio: "2026-01-01", fin: "2026-12-31", estado: "activa" },
  ];

  // ---------------------------------------------------------------------
  // CLIENTES
  // ---------------------------------------------------------------------
  const marcas = ["Toyota","Hyundai","Nissan","Honda","Kia","Suzuki","Chevrolet","Mitsubishi"];
  const colores = ["Blanco","Negro","Gris","Rojo","Azul","Plata"];

  const clientes = NOMBRES.map((nombre, i) => {
    const esAuto = i % 3 !== 0;
    const visitas = rnd(1, 15);
    const vehiculos = esAuto ? [{
      tipo: pick(tiposConPrecio), placa: `M${rnd(100000,999999)}`, marca: pick(marcas),
      modelo: `${rnd(2015,2026)}`, color: pick(colores)
    }] : [];
    return {
      id: `CLI-${pad(i + 1)}`,
      nombre,
      telefono: `8${rnd(100,999)}-${rnd(1000,9999)}`,
      correo: nombre.toLowerCase().replace(/\s+/g, ".") + "@correo.demo",
      identificacion: `001-${rnd(100000,299999)}-0${rnd(100,999)}${pick("ABCDEFGHJ")}`,
      tipo: visitas >= 8 ? "Frecuente" : (visitas <= 2 ? "Nuevo" : "Regular"),
      negocioPreferido: esAuto ? "autolavado" : "barberia",
      vehiculos,
      ultimaVisita: fechaHace(rnd(0, 40)),
      totalGastado: 0, // se recalcula desde ventas
      visitas,
      estado: "activo",
      // Fidelidad SIN dinero: dias = lavados premium del ciclo; descuentoUsado = ya usó el premio intermedio.
      fidelidad: (() => { const d = rnd(0, 8); return { dias: d, meta: 9, descuentoUsado: d >= 4 && d < 9 && Math.random() < 0.5 }; })(),
    };
  });

  // ---------------------------------------------------------------------
  // CONFIGURACIÓN (editable en vivo dentro del prototipo)
  // ---------------------------------------------------------------------
  const membresias = [], lealtadMovs = [];   // se llenan más abajo (ver LEALTAD y MEMBRESÍAS)
  const configuracion = {
    negocios: {
      autolavado: { nombre: "El Rápido · Autolavado", telefono: "8998-6707", direccion: "Esquina del banco Lafise de Nindirí, 50 metros al norte", correo: "elrapidozone@gmail.com", social: "@elrapidonica", moneda: "C$" },
      barberia: { nombre: "El Rápido · Barbería", telefono: "8998-6707", direccion: "Esquina del banco Lafise de Nindirí, 50 metros al norte", correo: "elrapidozone@gmail.com", social: "@elrapidonica", moneda: "C$" },
    },
    // FIDELIDAD vs SALDO (dos conceptos distintos):
    //  - Fidelidad/recompensa: visitas acumuladas (dias/meta) → premio.
    //  - Saldo: dinero disponible en la tarjeta, usable como forma de pago.
    // El Rápido NO maneja dinero en la tarjeta: solo premios por lavados premium.
    //   metaDescuento lavados premium → descuentoPct % de descuento (una vez por ciclo)
    //   diasMeta      lavados premium → premio (lavado gratis) y el ciclo vuelve a 0
    //   Cuentan los servicios marcados con "generaFidelidad" en el catálogo.
    fidelidad: { diasMeta: 9, premio: "Lavado gratis", metaDescuento: 4, descuentoPct: 36, bonoVisita: 0 },
    inventario: { metodoConsumo: "Por rendimiento estimado" },
    // Caja: tipo de cambio para contar dólares en el cierre (C$ por US$ 1).
    caja: { tipoCambio: 36.5, denominaciones: [1000, 500, 200, 100, 50, 20, 10, 5, 1] },
    // LEALTAD (sin dinero): programas por servicio. Cada lavada del servicio suma 1 automáticamente
    // al cliente de la factura. meta1 → el cliente ELIGE uno de los premios intermedios (una vez por ciclo);
    // meta2 → premio final y el ciclo vuelve a 0. Premio "gratis" = 100 % de ese servicio; "descuento" = pct %.
    lealtad: {
      programas: [
        { id: "premium", nombre: "Programa Premium", icono: "👑", servicioId: "SV-03", meta1: 5,
          opciones1: [{ tipo: "gratis", servicioId: "SV-02" }, { tipo: "descuento", pct: 40, servicioId: "SV-03" }],
          meta2: 9, premio2: { tipo: "gratis", servicioId: "EX-01" } },
        { id: "nitido", nombre: "Programa Nítido", icono: "💧", servicioId: "SV-02", meta1: 5,
          opciones1: [{ tipo: "gratis", servicioId: "SV-01" }, { tipo: "descuento", pct: 40, servicioId: "SV-02" }],
          meta2: 9, premio2: { tipo: "gratis", servicioId: "EX-03" } },
      ],
    },
    // MEMBRESÍAS: paquetes prepagados de lavados con descuento y vigencia.
    membresias: {
      planes: [
        // Formato fijo: nombre · "Descuento del N% en lavados" · lavados · vigencia en días. Los edita el administrador.
        { id: "COMBO4", nombre: "Combo 4 Lavados", lavados: 4, descuento: 18, dias: 28, activo: true },
        { id: "COMBO8", nombre: "Combo 8 Lavados", lavados: 8, descuento: 36, dias: 42, activo: true },
      ],
    },
    // Claves alineadas con METODOS. "fidelidad" (pago con saldo) queda deshabilitado: el negocio no maneja saldo.
    metodosPago: { efectivo: true, tarjeta: true, transferencia: true, fidelidad: false },
  };

  // ---------------------------------------------------------------------
  // MÉTODOS DE PAGO
  // `metodosPago` (etiquetas) se conserva por compatibilidad con módulos previos.
  // `METODOS` es la definición completa usada por el nuevo flujo de pago.
  // ---------------------------------------------------------------------
  const metodosPago = ["Efectivo", "Tarjeta", "Transferencia"];
  const METODOS = {
    efectivo: { key: "efectivo", label: "Efectivo", icon: "💵" },
    tarjeta: { key: "tarjeta", label: "Tarjeta", icon: "💳" },
    transferencia: { key: "transferencia", label: "Transferencia", icon: "🏦" },
    fidelidad: { key: "fidelidad", label: "Saldo fidelidad", icon: "🎁" },
  };

  // ---------------------------------------------------------------------
  // CÁLCULOS PUROS (sin efectos secundarios). Fuente única de reglas de
  // precio, descuento y pago: los usa la interfaz (vista previa) y la capa
  // API (registro real), de modo que nunca puedan diferir.
  // ---------------------------------------------------------------------
  const calc = {
    centavos: n => Math.round((Number(n) || 0) * 100),
    redondear: n => Math.round((Number(n) || 0) * 100) / 100,
    hoyISO() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`; },
    etiquetaMetodo(k) { return (METODOS[k] || {}).label || k; },

    // Resumen de caja de un conjunto de facturas: totales por método (una factura mixta suma su parte en cada método).
    resumenCaja(facturas) {
      const ok = facturas.filter(f => f.estado === "Completada");
      const porMetodo = { efectivo: { monto: 0, facturas: 0 }, tarjeta: { monto: 0, facturas: 0 }, transferencia: { monto: 0, facturas: 0 } };
      ok.forEach(f => f.pagos.forEach(p => { const m = porMetodo[p.metodo] = porMetodo[p.metodo] || { monto: 0, facturas: 0 }; m.monto = calc.redondear(m.monto + p.monto); m.facturas += 1; }));
      return {
        facturas: ok.length, anuladas: facturas.length - ok.length,
        total: calc.redondear(ok.reduce((a, f) => a + f.total, 0)),
        descuentos: calc.redondear(ok.reduce((a, f) => a + (f.descuento || 0), 0)),
        mixtas: ok.filter(f => f.pagos.length > 1).length,
        sinCobro: ok.filter(f => f.total === 0).length,
        clientes: new Set(ok.map(f => f.clienteId)).size,
        porMetodo,
      };
    },

    // Precio de un servicio según el tipo de vehículo (si el servicio maneja precios por vehículo).
    // Sin tipo elegido devuelve el precio "desde" (precioBase). 0 = precio por definir.
    precioServicio(s, tipoVehiculo) {
      if (!s) return 0;
      const pv = s.preciosVehiculo;
      if (pv && tipoVehiculo) return Number(pv[tipoVehiculo]) > 0 ? Number(pv[tipoVehiculo]) : 0; // sin precio para ese vehículo = por definir
      return Number(s.precioBase) || 0;
    },
    tienePrecio: s => !!s && (Number(s.precioBase) > 0 || (s.preciosVehiculo && Object.values(s.preciosVehiculo).some(v => Number(v) > 0))),

    // ¿Puede aplicarse la promoción a esta factura? Devuelve { ok, motivo }.
    // Regla: el descuento se calcula sobre los SERVICIOS de la factura (no sobre productos).
    promocionAplicable(promo, { negocio, lineas, cliente }) {
      if (!promo) return { ok: true };
      const hoy = calc.hoyISO();
      if (promo.estado === "inactiva") return { ok: false, motivo: "La promoción está inactiva." };
      if (promo.negocio !== "ambos" && promo.negocio !== negocio) return { ok: false, motivo: "La promoción no aplica a este negocio." };
      if (promo.inicio && hoy < promo.inicio) return { ok: false, motivo: "La promoción aún no comienza." };
      if (promo.fin && hoy > promo.fin) return { ok: false, motivo: "La promoción ya venció." };
      const servicios = lineas.filter(l => l.tipo === "servicio" && (promo.negocio === "ambos" || (DEMO_SERV(l.refId) || {}).negocio === promo.negocio));
      if (!servicios.length) return { ok: false, motivo: "La promoción aplica solo a servicios de su área." };
      if (promo.requiere && !promo.requiere.every(id => servicios.some(l => l.refId === id))) {
        const nombres = promo.requiere.map(id => (servicios.find(l => l.refId === id) || {}).nombre || (DEMO_SERV(id) || {}).nombre || id);
        return { ok: false, motivo: `Requiere incluir: ${nombres.join(" + ")}.` };
      }
      if (promo.minVisitas != null) {
        if (!cliente) return { ok: false, motivo: "Selecciona un cliente para validar esta promoción." };
        if (!(cliente.visitas > promo.minVisitas)) return { ok: false, motivo: `Requiere más de ${promo.minVisitas} visitas.` };
      }
      return { ok: true };
    },

    // lineas: [{ tipo, refId, nombre, cantidad, precio }] → líneas con descuento y subtotal.
    totales(lineas, promo) {
      // descPct en una línea = premio de lealtad (descuento propio de esa línea, 1 unidad).
      const items = lineas.map(l => ({ ...l, bruto: calc.redondear(l.precio * l.cantidad), descuento: l.descPct ? calc.redondear(l.precio * l.cantidad * l.descPct / 100) : 0 }));
      const subtotal = calc.redondear(items.reduce((a, i) => a + i.bruto, 0));
      // promo.soloRef: el descuento recae solo en esa línea (p. ej. premio "lavado gratis").
      // Las promociones de un área (y los premios de lavado) no descuentan servicios de la otra área
      // (p. ej. un corte agregado a una factura del autolavado).
      const areaPromo = !promo ? null : promo.premio ? "autolavado" : (promo.negocio && promo.negocio !== "ambos" ? promo.negocio : null);
      const servicios = items.filter(i => i.tipo === "servicio" && !i.descPct && !i.membresia && (!promo || !promo.soloRef || i.refId === promo.soloRef)
        && (!areaPromo || (DEMO_SERV(i.refId) || {}).negocio === areaPromo));
      const base = calc.redondear(servicios.reduce((a, i) => a + i.bruto, 0));
      let descuento = 0;
      if (promo && base > 0) {
        const bruto = promo.tipo === "porcentaje" ? base * promo.valor / 100 : promo.valor;
        descuento = Math.min(calc.redondear(bruto), base);
        let acumulado = 0;
        servicios.forEach((it, idx) => {
          const parte = idx === servicios.length - 1 ? calc.redondear(descuento - acumulado) : calc.redondear(descuento * it.bruto / base);
          it.descuento = parte; acumulado = calc.redondear(acumulado + parte);
        });
      }
      items.forEach(i => { i.subtotal = calc.redondear(i.bruto - i.descuento); });
      const descLineas = calc.redondear(items.filter(i => i.descPct).reduce((a, i) => a + i.descuento, 0));
      descuento = calc.redondear(descuento + descLineas);
      return { lineas: items, subtotal, descuento, total: calc.redondear(subtotal - descuento) };
    },

    // ---- Lealtad por programas ----
    nombrePremio(op) {
      const s = DEMO_SERV(op.servicioId), n = s ? s.nombre : op.servicioId;
      return op.tipo === "gratis" ? `${n} GRATIS` : `${op.pct}% descuento en ${n}`;
    },
    // Estado de cada programa para un cliente.
    estadoLealtad(cliente) {
      const progs = configuracion.lealtad.programas;
      if (!cliente) return [];
      cliente.lealtad = cliente.lealtad || {};
      return progs.map(p => {
        const st = cliente.lealtad[p.id] = cliente.lealtad[p.id] || { lavadas: 0, ciclo: 1, canje1: false, total: 0 };
        return { programa: p, ...st, disp1: st.lavadas >= p.meta1 && !st.canje1, disp2: st.lavadas >= p.meta2,
          faltan1: Math.max(p.meta1 - st.lavadas, 0), faltan2: Math.max(p.meta2 - st.lavadas, 0), pct: Math.min(st.lavadas / p.meta2 * 100, 100) };
      });
    },
    // Premios que el cliente puede canjear ahora: [{ programaId, nivel, idx, op, nombre }]
    premiosDisponibles(cliente) {
      const out = [];
      calc.estadoLealtad(cliente).forEach(e => {
        if (e.disp1) e.programa.opciones1.forEach((op, idx) => out.push({ programaId: e.programa.id, programa: e.programa.nombre, nivel: 1, idx, op, nombre: calc.nombrePremio(op) }));
        if (e.disp2) out.push({ programaId: e.programa.id, programa: e.programa.nombre, nivel: 2, idx: 0, op: e.programa.premio2, nombre: calc.nombrePremio(e.programa.premio2) });
      });
      return out;
    },
    // ---- Membresías ----
    estadoMembresia(mb, ahora = new Date()) {
      if (mb.anulada) return "Anulada";
      if (mb.usados >= mb.lavados) return "Agotada";
      if (new Date(mb.vence) < ahora) return "Vencida";
      return (new Date(mb.vence) - ahora) / 86400000 <= 5 ? "Por vencer" : "Activa";
    },
    // Membresía vigente del cliente que cubre ese servicio para ese tipo de vehículo (la que vence primero).
    // La membresía es de UN vehículo: se usa solo si la placa de la factura coincide con la registrada.
    normPlaca: p => String(p || "").toUpperCase().replace(/[\s-]/g, ""),
    membresiaAplicable(clienteId, servicioId, tipoVeh, placa) {
      const pl = calc.normPlaca(placa);
      if (!pl) return null;
      return membresias.filter(mb => mb.clienteId === clienteId && mb.servicioId === servicioId && mb.vehiculoTipo === tipoVeh && calc.normPlaca(mb.placa) === pl
        && ["Activa", "Por vencer"].includes(calc.estadoMembresia(mb))).sort((a, b) => new Date(a.vence) - new Date(b.vence))[0] || null;
    },
    // Texto de vigencia en el formato de las membresías: "4 semanas" o "10 días".
    vigenciaTexto(dias) { return dias % 7 === 0 ? `${dias / 7} semana${dias / 7 === 1 ? "" : "s"}` : `${dias} día${dias === 1 ? "" : "s"}`; },
    membresiasVigentes(clienteId) { return membresias.filter(mb => mb.clienteId === clienteId && ["Activa", "Por vencer"].includes(calc.estadoMembresia(mb))); },

    // ---- Premios de fidelidad (modelo anterior, ya no se usa en la interfaz) ----
    // Estado de premios de un cliente: { descuento, gratis } disponibles.
    premiosDe(cliente) {
      const cfg = configuracion.fidelidad, f = cliente && cliente.fidelidad;
      if (!f) return { descuento: false, gratis: false };
      return { descuento: f.dias >= cfg.metaDescuento && f.dias < f.meta && !f.descuentoUsado, gratis: f.dias >= f.meta };
    },
    // Construye el "descuento virtual" de un premio para una factura. Devuelve { promo } o { motivo }.
    promoPremio(tipo, { negocio, lineas, cliente }) {
      const cfg = configuracion.fidelidad;
      if (negocio !== "autolavado") return { motivo: "Los premios de fidelidad aplican al autolavado." };
      if (!cliente) return { motivo: "Selecciona un cliente." };
      const disp = calc.premiosDe(cliente);
      const lavados = lineas.filter(l => l.tipo === "servicio" && (DEMO_SERV(l.refId) || {}).categoria === "lavado" && l.precio > 0);
      if (!lavados.length) return { motivo: "Agrega un lavado a la factura." };
      if (tipo === "descuento") {
        if (!disp.descuento) return { motivo: cliente.fidelidad.descuentoUsado ? "Ya usó este premio en el ciclo actual." : `Requiere ${cfg.metaDescuento} lavados premium.` };
        return { promo: { id: "FID-DESCUENTO", nombre: `Premio fidelidad · ${cfg.descuentoPct}% de descuento`, tipo: "porcentaje", valor: cfg.descuentoPct, premio: "descuento" } };
      }
      if (tipo === "gratis") {
        if (!disp.gratis) return { motivo: `Requiere ${cliente.fidelidad.meta} lavados premium.` };
        const l = lavados.reduce((a, b) => (b.precio > a.precio ? b : a));
        return { promo: { id: "FID-GRATIS", nombre: `Premio fidelidad · ${cfg.premio}`, tipo: "monto", valor: l.precio, soloRef: l.refId, premio: "gratis" } };
      }
      return { motivo: "Premio no válido." };
    },

    // Etiqueta legacy de método: un método → su nombre; varios → "Mixto".
    etiquetaPagos(pagos) {
      if (!pagos || !pagos.length) return "Sin cobro";
      return pagos.length > 1 ? "Mixto" : calc.etiquetaMetodo(pagos[0].metodo);
    },
    resumenConceptos(lineas) {
      const partes = lineas.map(l => (l.cantidad > 1 ? `${l.cantidad}× ` : "") + l.nombre);
      return partes.length <= 2 ? partes.join(" + ") : `${partes[0]} +${partes.length - 1} más`;
    },

    // Consumo de productos que provoca una factura:
    //  - insumo: usos que consumen los SERVICIOS (según servicio.consumo)
    //  - venta: unidades de PRODUCTOS vendidos como línea.
    consumosDe(lineas) {
      const mapa = {};
      const sumar = (productoId, tipo, cantidad) => {
        const p = productos.find(x => x.id === productoId); if (!p) return;
        const k = productoId + "|" + tipo;
        mapa[k] = mapa[k] || { productoId, nombre: p.nombre, unidad: p.unidad, tipo, cantidad: 0 };
        mapa[k].cantidad += cantidad;
      };
      lineas.forEach(l => {
        if (l.tipo === "servicio") { const s = servicios.find(x => x.id === l.refId); (s ? s.consumo || [] : []).forEach(c => sumar(c.producto, "insumo", c.cantidad * l.cantidad)); }
        else if (l.tipo === "producto") sumar(l.refId, "venta", l.cantidad);
      });
      return Object.values(mapa);
    },

    // Estructura de factura (espejo de las tablas futuras:
    // factura, factura_detalle, factura_pago). Usada por el seed y por la API.
    construirFactura({ id, fecha, negocio, cliente, empleado, vehiculo, totales, promo, pagos, usuario, estado = "Completada", fidelidad = null, notas = "" }) {
      const lineas = totales.lineas.map((l, i) => ({
        id: `${id}-L${i + 1}`, tipo: l.tipo, refId: l.refId, nombre: l.nombre, cantidad: l.cantidad,
        precio: l.precio, descuento: l.descuento, subtotal: l.subtotal, ...(l.area ? { area: l.area } : {}),
        ...(l.membresia ? { membresia: l.membresia, usoMembresia: l.usoMembresia, precioRef: l.precioRef, restantes: l.restantes, vence: l.vence, placaMembresia: l.placaMembresia } : {}), ...(l.premio ? { premio: l.premio, descPct: l.descPct } : {}),
      }));
      const primerServ = lineas.find(l => l.tipo === "servicio") || lineas[0];
      return {
        id, fecha, negocio, estado, usuario: usuario || "sistema", notas,
        clienteId: cliente.id, clienteNombre: cliente.nombre,
        empleadoId: empleado ? empleado.id : null, empleadoNombre: empleado ? empleado.nombre : "—",
        vehiculo: negocio === "autolavado" ? (vehiculo || null) : null,
        lineas,
        promocionId: promo ? promo.id : null, promocion: promo ? promo.nombre : null,
        subtotal: totales.subtotal, descuento: totales.descuento, total: totales.total,
        pagos: pagos.map(p => ({ metodo: p.metodo, monto: p.monto })),
        pagoMixto: pagos.length > 1,
        consumos: calc.consumosDe(lineas),
        fidelidad,
        // ---- campos legacy (compatibilidad con módulos y reportes previos) ----
        servicioId: primerServ ? primerServ.refId : null,
        servicioNombre: calc.resumenConceptos(lineas),
        metodoPago: calc.etiquetaPagos(pagos),
        fidelidadDia: fidelidad && fidelidad.genera ? fidelidad.diasDespues : null,
        fidelidadMeta: fidelidad ? fidelidad.meta : null,
      };
    },
  };
  function DEMO_SERV(id) { return servicios.find(s => s.id === id); }

  // ---------------------------------------------------------------------
  // CONTADORES DE IDs
  // ---------------------------------------------------------------------
  const contadores = { SV: 13, EX: 11 }; // continúa la numeración del catálogo inicial
  function nextId(prefix, len = 5) { contadores[prefix] = (contadores[prefix] || 0) + 1; return `${prefix}-${pad(contadores[prefix], len)}`; }

  // ---------------------------------------------------------------------
  // TARJETAS DE FIDELIDAD (una por cliente)
  //   saldo       = dinero disponible para pagar
  //   movimientos = historial (más reciente primero): recarga | consumo | acumulacion | visita | canje | reversion | ajuste
  //   uid         = identificador que entregaría el lector NFC (en producción viene del hardware)
  // ---------------------------------------------------------------------
  const tarjetas = [];
  const usadosUid = new Set();
  function uidNfc() {
    let u;
    do { u = "04:" + Array.from({ length: 6 }, () => rnd(0, 255).toString(16).padStart(2, "0")).join(":").toUpperCase(); } while (usadosUid.has(u));
    usadosUid.add(u); return u;
  }
  function crearTarjetaPara(cliente, fecha) {
    const t = { id: `TJ-${pad(tarjetas.length + 1, 4)}`, clienteId: cliente.id, uid: uidNfc(), estado: "activa",
      saldo: 0, creada: fecha || new Date(), ultimoUso: null, ultimaVisita: null, ultimaVisitaOrigen: null, movimientos: [] };
    tarjetas.push(t); cliente.tarjetaId = t.id; return t;
  }
  // Único punto donde cambia un saldo: garantiza saldo >= 0 y deja rastro en el historial.
  function registrarMovimientoTarjeta(t, { fecha = new Date(), tipo, concepto, monto = 0, referencia = null, usuario = "sistema", negocio = null, visitas = null }) {
    const nuevo = calc.redondear(t.saldo + monto);
    if (nuevo < 0) throw Object.assign(new Error("El saldo de la tarjeta no puede quedar en negativo."), { usuario: true });
    t.saldo = nuevo;
    const mov = { id: nextId("MOV"), fecha, tipo, concepto, monto: calc.redondear(monto), saldo: t.saldo, referencia, usuario, negocio, visitas };
    t.movimientos.unshift(mov);
    if (tipo !== "ajuste") t.ultimoUso = fecha;
    return mov;
  }
  clientes.forEach(c => crearTarjetaPara(c, fechaHace(rnd(60, 200))));

  // ---------------------------------------------------------------------
  // ACTIVIDAD DEL NEGOCIO (bitácora de eventos; en producción vendrá del backend)
  // { id, fecha, tipo, negocio, usuario, descripcion, referencia, metadata }
  // ---------------------------------------------------------------------
  const actividad = [];
  function registrarActividad({ fecha = new Date(), tipo, negocio = null, usuario = "sistema", descripcion, referencia = null, metadata = {} }) {
    const ev = { id: nextId("EV"), fecha, tipo, negocio, usuario, descripcion, referencia, metadata };
    actividad.unshift(ev); return ev;
  }

  // ---------------------------------------------------------------------
  // USUARIOS DEMO — SOLO PARA EL PROTOTIPO.
  // En producción las contraseñas JAMÁS viven en el frontend: el backend guarda
  // un hash y devuelve una sesión/token (ver API.auth.login en js/api.js).
  // ---------------------------------------------------------------------
  const usuarios = [
    { id: "USR-001", usuario: "admin", nombre: "Administrador", rol: "ADMIN", password: "admin123", estado: "activo", empleadoId: null, correo: "admin@demo.com" },
    { id: "USR-002", usuario: "empleado", nombre: "Douglas Herrera", rol: "EMPLEADO", password: "empleado123", estado: "activo", empleadoId: "EMP-001", correo: "douglas@businesshub.demo" },
    { id: "USR-003", usuario: "erick", nombre: "Erick Guevara", rol: "EMPLEADO", password: "erick123", estado: "inactivo", empleadoId: "EMP-007", correo: "erick@businesshub.demo" },
    // (Se eliminó el usuario "barbero": el personal trabaja con un solo panel conjunto.)
  ];

  // ---------------------------------------------------------------------
  // VENTAS / FACTURAS (histórico simulado, últimos 45 días)
  // Se genera en orden cronológico para que los saldos y movimientos de las
  // tarjetas sean coherentes con las facturas que los usaron.
  // ---------------------------------------------------------------------
  const HORAS_PICO = [8, 9, 10, 10, 11, 11, 11, 12, 13, 14, 15, 16, 16, 17, 17, 18, 19];
  function fechaVenta(diasAtras) {
    const d = new Date(); d.setDate(d.getDate() - diasAtras);
    d.setHours(pick(HORAS_PICO), rnd(0, 59), rnd(0, 59), 0);
    if (d > new Date()) d.setDate(d.getDate() - 1);
    return d;
  }
  const sesgado = arr => arr[Math.min(arr.length - 1, Math.floor(Math.pow(Math.random(), 1.7) * arr.length))];
  const vendibles = negocio => productos.filter(p => p.negocio === negocio && p.precioVenta);
  const lineaServicio = (s, cantidad = 1, tipoVeh = null) => ({ tipo: "servicio", refId: s.id, nombre: s.nombre, cantidad, precio: calc.precioServicio(s, tipoVeh) });
  const lineaProducto = (p, cantidad = 1) => ({ tipo: "producto", refId: p.id, nombre: p.nombre, cantidad, precio: p.precioVenta });

  const ventasRaw = [];
  for (let i = 0; i < 130; i++) {
    const negocio = Math.random() < 0.55 ? "autolavado" : "barberia";
    const cliente = pick(clientes);
    const vehiculo = negocio === "autolavado" ? (cliente.vehiculos[0] || { tipo: pick(tiposConPrecio), placa: `M${rnd(100000, 999999)}`, marca: pick(marcas), modelo: `${rnd(2015, 2026)}`, color: pick(colores) }) : null;
    const tipoVeh = vehiculo ? vehiculo.tipo : null;
    const vendiblesServ = servicios.filter(s => s.negocio === negocio && s.estado === "activo" && calc.tienePrecio(s));
    const principales = negocio === "autolavado" ? vendiblesServ.filter(s => s.categoria === "lavado" && calc.precioServicio(s, tipoVeh) > 0) : vendiblesServ;
    const adicionales = negocio === "autolavado" ? vendiblesServ.filter(s => s.categoria === "extra" && calc.precioServicio(s, tipoVeh) > 0) : vendiblesServ;
    const lineas = [lineaServicio(sesgado(principales), 1, tipoVeh)];
    if (adicionales.length && Math.random() < 0.35) { const ad = pick(adicionales); if (!lineas.some(l => l.refId === ad.id)) lineas.push(lineaServicio(ad, 1, tipoVeh)); }
    if (Math.random() < 0.25) lineas.push(lineaProducto(pick(vendibles(negocio)), rnd(1, 2)));
    const promosSimples = promociones.filter(p => p.estado !== "inactiva" && (p.negocio === negocio || p.negocio === "ambos") && !p.requiere && p.minVisitas == null);
    ventasRaw.push({
      fecha: fechaVenta(rnd(0, 44)), negocio, cliente, lineas, vehiculo,
      empleado: pick(empleados.filter(e => e.negocio === negocio && e.estado === "activo")),
      promo: Math.random() > (negocio === "autolavado" ? 0.9 : 0.65) ? pick(promosSimples) : null, // taxis miembros: ocasional en el histórico
      anulada: Math.random() < 0.08,
    });
  }

  const eventosSeed = ventasRaw.map(v => ({ t: v.fecha.getTime(), tipo: "venta", v }));
  eventosSeed.sort((a, b) => a.t - b.t);

  const ventas = [];
  let contadorAuto = 100, contadorBarber = 100;
  const tarjetaDe = c => tarjetas.find(t => t.clienteId === c.id);
  function asignarPagosSeed(total) {
    if (total <= 0) return [];
    if (Math.random() < 0.12) { const parte = calc.redondear(Math.floor(total * 0.5)); return [{ metodo: "efectivo", monto: parte }, { metodo: "tarjeta", monto: calc.redondear(total - parte) }]; }
    const r = Math.random();
    return [{ metodo: r < 0.6 ? "efectivo" : (r < 0.87 ? "tarjeta" : "transferencia"), monto: total }];
  }

  eventosSeed.forEach(ev => {
    const fecha = new Date(ev.t);
    const v = ev.v, t = tarjetaDe(v.cliente);
    const tot = calc.totales(v.lineas, v.promo);
    const pagos = v.anulada ? (tot.total > 0 ? [{ metodo: "efectivo", monto: tot.total }] : []) : asignarPagosSeed(tot.total);
    const id = v.negocio === "autolavado" ? `AV-${pad(contadorAuto++, 6)}` : `BB-${pad(contadorBarber++, 6)}`;
    const vehiculo = v.vehiculo;
    const genera = v.lineas.some(l => l.tipo === "servicio" && (servicios.find(s => s.id === l.refId) || {}).generaFidelidad);
    const f = calc.construirFactura({ id, fecha, negocio: v.negocio, cliente: v.cliente, empleado: v.empleado, vehiculo, totales: tot, promo: v.promo, pagos,
      usuario: v.empleado.nombre, estado: v.anulada ? "Anulada" : "Completada",
      fidelidad: { genera, diasAntes: null, diasDespues: genera ? rnd(1, 9) : null, meta: configuracion.fidelidad.diasMeta, bono: 0 } });
    ventas.push(f);
    registrarActividad({ fecha, tipo: "factura_creada", negocio: v.negocio, usuario: v.empleado.nombre,
      descripcion: `Factura ${id} creada · ${v.cliente.nombre} · C$ ${tot.total}`, referencia: id, metadata: { total: tot.total, pagos } });
    if (v.anulada) { f.anulacion = { fecha: new Date(ev.t + 3600000), usuario: "Administrador", motivo: pick(["Error de digitación", "Cliente canceló el servicio", "Cobro duplicado", "Servicio no realizado"]) }; registrarActividad({ fecha: new Date(ev.t + 3600000), tipo: "factura_anulada", negocio: v.negocio, usuario: "Administrador", descripcion: `Factura ${id} anulada`, referencia: id, metadata: {} }); return; }
    if (genera) { registrarMovimientoTarjeta(t, { fecha: new Date(ev.t + 60000), tipo: "visita", concepto: `Lavado premium · factura #${id}`, monto: 0, referencia: id, usuario: "sistema", negocio: v.negocio }); t.ultimaVisita = new Date(ev.t + 60000); t.ultimaVisitaOrigen = "factura"; }
  });
  ventas.sort((a, b) => b.fecha - a.fecha);
  contadorAuto = Math.max(contadorAuto, 141); // el aviso demo menciona AV-000141
  let folioAutoSeq = contadorAuto;
  let folioBarberSeq = contadorBarber;

  // Clientes: gasto, última visita y fecha de alta coherentes con las facturas.
  clientes.forEach((c, idx) => {
    const propias = ventas.filter(v => v.clienteId === c.id && v.estado === "Completada");
    c.totalGastado = calc.redondear(propias.reduce((acc, v) => acc + v.total, 0));
    if (propias.length) c.ultimaVisita = propias[0].fecha;
    const base = c.visitas <= 2 ? fechaHace(rnd(0, 30)) : fechaHace(rnd(31, 150));
    const primera = ventas.filter(v => v.clienteId === c.id).reduce((m, v) => Math.min(m, v.fecha.getTime()), Infinity);
    c.creado = new Date(Math.min(base.getTime(), primera - rnd(1, 5) * 86400000));
    registrarActividad({ fecha: c.creado, tipo: "cliente_registrado", negocio: c.negocioPreferido, usuario: "sistema", descripcion: `Cliente registrado: ${c.nombre}`, referencia: c.id, metadata: {} });
    // Demo: clientes listos para probar los premios (1º: 36 % disponible · 2º: lavado gratis).
    if (idx === 0) c.fidelidad = { dias: 4, meta: 9, descuentoUsado: false };
    if (idx === 1) c.fidelidad = { dias: 9, meta: 9, descuentoUsado: true };
  });
  actividad.sort((a, b) => b.fecha - a.fecha);

  const movimientosInventario = []; // { id, fecha, productoId, tipo: consumo|venta|entrada|ajuste|reversion, cantidad, unidad, referencia, usuario, stockAntes, stockDespues }

  // ---------------------------------------------------------------------
  // LEALTAD (histórico DEMO calculado a partir de las facturas) y MEMBRESÍAS de ejemplo
  //   lealtadMovs: { id, fecha, clienteId, programaId, tipo: lavada|canje|reversion, concepto, lavadas, ciclo, referencia }
  //   membresias:  { id, planId, planNombre, clienteId, clienteNombre, servicioId, servicioNombre, vehiculoTipo,
  //                  lavados, usados, descuento, descExtra, precioUnit, total, inicio, vence, facturaId, usos:[{fecha,facturaId}] }
  // ---------------------------------------------------------------------
  [...ventas].filter(v => v.estado === "Completada").sort((a, b) => a.fecha - b.fecha).forEach(v => {
    const c = clientes.find(x => x.id === v.clienteId); if (!c) return;
    calc.estadoLealtad(c);
    configuracion.lealtad.programas.forEach(p => {
      const n = v.lineas.filter(l => l.refId === p.servicioId).reduce((a, l) => a + l.cantidad, 0); if (!n) return;
      const st = c.lealtad[p.id];
      for (let k = 0; k < n; k++) {
        if (st.lavadas >= p.meta2) { st.lavadas = 0; st.ciclo += 1; st.canje1 = false;   // en el histórico, el premio final ya se canjeó
          lealtadMovs.push({ id: uid("LM"), fecha: v.fecha, clienteId: c.id, programaId: p.id, tipo: "canje", concepto: `Canje: ${calc.nombrePremio(p.premio2)}`, lavadas: 0, ciclo: st.ciclo, referencia: v.id }); }
        st.lavadas += 1; st.total += 1;
        if (st.lavadas === p.meta1 + 1 && Math.random() < 0.6) { st.canje1 = true;
          lealtadMovs.push({ id: uid("LM"), fecha: v.fecha, clienteId: c.id, programaId: p.id, tipo: "canje", concepto: `Canje: ${calc.nombrePremio(pick(p.opciones1))}`, lavadas: st.lavadas, ciclo: st.ciclo, referencia: v.id }); }
        lealtadMovs.push({ id: uid("LM"), fecha: v.fecha, clienteId: c.id, programaId: p.id, tipo: "lavada", concepto: `Lavada · factura #${v.id}`, lavadas: st.lavadas, ciclo: st.ciclo, referencia: v.id });
      }
    });
  });
  // Demo: 1.er cliente con premio intermedio disponible (Premium 5/9) y 2.º con premio final (Nítido 9/9).
  calc.estadoLealtad(clientes[0]); clientes[0].lealtad.premium = { lavadas: 5, ciclo: 1, canje1: false, total: 5 };
  calc.estadoLealtad(clientes[1]); clientes[1].lealtad.nitido = { lavadas: 9, ciclo: 1, canje1: true, total: 9 };
  clientes.forEach(c => calc.estadoLealtad(c));
  lealtadMovs.sort((a, b) => b.fecha - a.fecha);

  // Membresías de ejemplo (algunas con usos, una agotada y una vencida).
  [[2, "COMBO4", "SV-01", 1, 3], [3, "COMBO8", "SV-02", 5, 10], [5, "COMBO4", "SV-02", 4, 20], [6, "COMBO8", "SV-01", 2, 40], [8, "COMBO4", "SV-01", 0, 1]].forEach(([ci, planId, sid, usados, hace], k) => {
    const c = clientes[ci], plan = configuracion.membresias.planes.find(x => x.id === planId), s = servicios.find(x => x.id === sid);
    const tipo = (c.vehiculos[0] && tiposConPrecio.includes(c.vehiculos[0].tipo)) ? c.vehiculos[0].tipo : "Sedán";
    if (!c.vehiculos.length || c.vehiculos[0].tipo !== tipo) c.vehiculos.unshift({ tipo, placa: `M${rnd(100000, 999999)}`, marca: pick(marcas), modelo: `${rnd(2015, 2026)}`, color: pick(colores) });
    if (!c.vehiculos[0].placa) c.vehiculos[0].placa = `M${rnd(100000, 999999)}`;
    const placa = c.vehiculos[0].placa;
    const unit = calc.precioServicio(s, tipo), bruto = unit * plan.lavados, total = calc.redondear(bruto * (1 - plan.descuento / 100));
    const inicio = fechaHace(hace), vence = new Date(inicio.getTime() + plan.dias * 86400000);
    membresias.push({ id: `MEM-${pad(k + 1, 4)}`, planId, planNombre: plan.nombre, clienteId: c.id, clienteNombre: c.nombre, servicioId: s.id, servicioNombre: s.nombre,
      vehiculoTipo: tipo, placa, lavados: plan.lavados, usados, descuento: plan.descuento, descExtra: 0, precioUnit: unit, bruto, total, inicio, vence, facturaId: null,
      vendidaPor: "Administrador", vendidaPorId: "USR-001", usos: Array.from({ length: usados }, (_, i) => ({ fecha: new Date(inicio.getTime() + (i + 1) * 86400000 * 2), facturaId: null })) });
  });

  // ---------------------------------------------------------------------
  // CIERRES DE CAJA (histórico DEMO de días anteriores; el de hoy lo hace el personal)
  //   { id, area, fecha, desde, hasta, usuario, usuarioId, resumen, esperado, contado:{nio,usd,tipoCambio,
  //     totalNio,denominaciones}, egresos:[{concepto,monto}], diferencia, estado, nota, facturas:[ids] }
  // ---------------------------------------------------------------------
  const cierres = [];
  for (let d = 14; d >= 1; d--) {
    ["autolavado", "barberia"].forEach(area => {
      const ini = new Date(); ini.setDate(ini.getDate() - d); ini.setHours(0, 0, 0, 0);
      const fin = new Date(ini); fin.setHours(23, 59, 59, 999);
      const fs = ventas.filter(v => v.negocio === area && v.fecha >= ini && v.fecha <= fin);
      if (!fs.length) return;
      const resumen = calc.resumenCaja(fs), ventasEf = resumen.porMetodo.efectivo.monto;
      const egresos = Math.random() < 0.3 ? [{ concepto: pick(["Compra de agua", "Pago de hielo", "Compra de bolsas", "Almuerzo del personal"]), monto: pick([50, 80, 120, 150]) }] : [];
      const esperado = calc.redondear(ventasEf - egresos.reduce((a, x) => a + x.monto, 0));
      const dif = pick([0, 0, 0, 0, 0, -20, -50, 10]);
      const totalNio = calc.redondear(Math.max(esperado + dif, 0));
      const usdCand = Math.random() < 0.25 ? pick([5, 10, 20]) : 0, usd = usdCand * configuracion.caja.tipoCambio <= totalNio ? usdCand : 0;
      const nio = calc.redondear(Math.max(totalNio - usd * configuracion.caja.tipoCambio, 0));
      const quien = pick(usuarios.filter(u => u.rol === "EMPLEADO" && u.estado === "activo"));
      const hasta = new Date(ini); hasta.setHours(19, rnd(0, 40), 0, 0);
      cierres.push({ id: `CC-${pad(cierres.length + 1, 4)}`, area, fecha: hasta, desde: ini, hasta, usuario: quien.nombre, usuarioId: quien.id,
        resumen, ventasEfectivo: ventasEf, esperado, contado: { nio, usd, tipoCambio: configuracion.caja.tipoCambio, totalNio: calc.redondear(nio + usd * configuracion.caja.tipoCambio), denominaciones: null },
        egresos, diferencia: calc.redondear(nio + usd * configuracion.caja.tipoCambio - esperado), estado: "", nota: dif ? pick(["Se revisará con el personal", "Error al dar vuelto", "Faltante en monedas"]) : "",
        facturas: fs.map(f => f.id) });
      const c = cierres[cierres.length - 1]; c.estado = Math.abs(c.diferencia) < 0.01 ? "Cuadrado" : c.diferencia > 0 ? "Sobrante" : "Faltante";
      registrarActividad({ fecha: hasta, tipo: "cierre_caja", negocio: area, usuario: quien.nombre, descripcion: `Cierre de caja ${c.id} · ${area === "autolavado" ? "Autolavado" : "Barbería"} · ${c.estado}`, referencia: c.id, metadata: {} });
    });
  }
  cierres.reverse();   // más reciente primero
  actividad.sort((a, b) => b.fecha - a.fecha);

  // ---------------------------------------------------------------------
  // NOTIFICACIONES
  // ---------------------------------------------------------------------
  const notificaciones = [
    { id: uid("N"), tipo: "danger", texto: "Shampoo Premium tiene stock bajo (3 botellas restantes).", fecha: fechaHace(0) },
    { id: uid("N"), tipo: "danger", texto: "Esponjas por debajo del mínimo configurado.", fecha: fechaHace(0) },
    { id: uid("N"), tipo: "warning", texto: "3 clientes están a 1 lavado premium de su lavado gratis.", fecha: fechaHace(0) },
    { id: uid("N"), tipo: "success", texto: "Se registró una nueva venta en Autolavado (AV-000141).", fecha: fechaHace(0) },
    { id: uid("N"), tipo: "warning", texto: "La promoción 'Barba + corte' está próxima a vencer.", fecha: fechaHace(1) },
    { id: uid("N"), tipo: "success", texto: "Carlos López completó 9 lavados premium y recibió un lavado gratis.", fecha: fechaHace(2) },
  ];
  function notificar(tipo, texto) { notificaciones.unshift({ id: uid("N"), tipo, texto, fecha: new Date() }); }

  // ---------------------------------------------------------------------
  // COMPATIBILIDAD: el motor de venta anterior. Ahora delega en la capa API
  // (una factura de una sola línea). Los módulos nuevos usan API.facturas.crear.
  // ---------------------------------------------------------------------
  function registrarVenta({ negocio, cliente, servicio, promocion, empleado, vehiculo, metodoPago }) {
    const metodo = ({ Efectivo: "efectivo", Tarjeta: "tarjeta", Transferencia: "transferencia" })[metodoPago] || "efectivo";
    return API._nucleo.crearFactura({
      negocio, clienteId: cliente.id, empleadoId: empleado ? empleado.id : null, vehiculo,
      lineas: [{ tipo: "servicio", refId: servicio.id, cantidad: 1 }],
      promocionId: promocion ? promocion.id : null, pagos: [{ metodo, monto: null }],
    }).factura;
  }
  function canjearRecompensa(clienteId) { return API._nucleo.canjearRecompensa(clienteId, {}).cliente; }

  return {
    clientes, ventas, servicios, productos, empleados, promociones, notificaciones, configuracion,
    tarjetas, actividad, movimientosInventario, usuarios, cierres, membresias, lealtadMovs,
    tiposVehiculo, marcas, colores, metodosPago, METODOS, calc,
    helpers: { rnd, pick, pad, uid, fechaHace, nextId },
    siguienteFolio(negocio) {
      return negocio === "autolavado" ? `AV-${pad(folioAutoSeq++, 6)}` : `BB-${pad(folioBarberSeq++, 6)}`;
    },
    crearTarjetaPara, registrarMovimientoTarjeta, registrarActividad, notificar,
    registrarVenta, canjearRecompensa,
  };
})();

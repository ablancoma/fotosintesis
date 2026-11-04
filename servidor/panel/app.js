// =====================================================================
//  Fotosíntesis · app de escritorio del profesor
//  Habla con la API del propio servidor (/api/...). Sin librerías.
// =====================================================================

const estado = {
  plan: null, config: null, tablets: [], vista: "hoy", chatIniciado: false,
  diaInstrucciones: null, diaHorario: null, diaPrevision: null, horario: null, previsionDias: null,
};

const $ = (sel) => document.querySelector(sel);
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const NOMBRE_ACT = { lectura: "📖 Lectura", ejercicios: "✏️ Ejercicios", video: "🎬 Vídeo", juego: "🎮 Juego" };

async function api(ruta, opciones = {}) {
  const r = await fetch(ruta, {
    ...opciones,
    headers: { "Content-Type": "application/json" },
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
  });
  if (!r.ok) throw new Error((await r.text()) || r.status);
  marcarConexion(true);
  return r.json();
}

function marcarConexion(ok) {
  $("#punto-conexion").className = "punto " + (ok ? "ok" : "error");
  $("#texto-conexion").textContent = ok ? "Servidor conectado" : "Sin conexión con el servidor";
}

function aviso(texto) {
  const t = $("#toast");
  t.textContent = texto;
  t.classList.add("visible");
  clearTimeout(aviso.temporizador);
  aviso.temporizador = setTimeout(() => t.classList.remove("visible"), 2400);
}

function fechaLarga(iso, conDiaSemana = true) {
  return new Date(iso + "T12:00:00").toLocaleDateString("es-ES",
    conDiaSemana ? { weekday: "long", day: "numeric", month: "long" } : { day: "numeric", month: "long" });
}
const mayus = (t) => t.charAt(0).toUpperCase() + t.slice(1);

// ---------------------------------------------------------------- navegación
document.querySelectorAll(".nav").forEach((b) => b.addEventListener("click", () => mostrarVista(b.dataset.vista)));

function mostrarVista(vista) {
  estado.vista = vista;
  document.querySelectorAll(".nav").forEach((b) => b.classList.toggle("activo", b.dataset.vista === vista));
  document.querySelectorAll(".vista").forEach((v) => v.classList.toggle("activa", v.id === "vista-" + vista));
  if (vista === "hoy") cargarPlan();
  if (vista === "tablets") cargarTablets();
  if (vista === "horario") cargarHorario();
  if (vista === "prevision") cargarPrevision();
  if (vista === "ajustes") cargarAjustes();
}

// Pestañas de días (se usan en Instrucciones y en Horario)
function pestanasDias(dias, elegido, atributo, extra = () => "") {
  return dias.map((d) => `<button role="tab" class="pestana ${d.fecha === elegido ? "activa" : ""}" ${atributo}="${d.fecha}"
      aria-selected="${d.fecha === elegido}">
      <strong>${esc(d.dia_texto)}</strong><small>${esc(fechaLarga(d.fecha, false))}${extra(d)}</small></button>`).join("");
}

// ================================================================ INSTRUCCIONES
async function cargarPlan() {
  try {
    estado.plan = await api("/api/plan");
    pintarPlan();
  } catch (e) { marcarConexion(false); }
}

function pintarPlan() {
  const p = estado.plan;
  const pendientes = p.instrucciones.filter((i) => !i.hecha && i.tipo !== "aviso");
  const siguiente = pendientes[0];
  const diasConAlgo = p.dias.filter((d) => d.n_instrucciones > 0 || d.n_clases > 0);
  if (!estado.diaInstrucciones || !diasConAlgo.some((d) => d.fecha === estado.diaInstrucciones)) {
    estado.diaInstrucciones = (siguiente && siguiente.fecha) || diasConAlgo[0]?.fecha || p.dia;
  }
  const hasta = p.hasta ? fechaLarga(p.hasta) : "—";
  $("#hoy-sub").textContent = `Planificadas hasta el ${hasta} · ${pendientes.length} pendientes`;

  // Avisos importantes de todos los días
  $("#alertas").innerHTML = p.instrucciones.filter((i) => i.tipo === "aviso").map((a) => `
    <div class="alerta"><span aria-hidden="true">⚠️</span><div><strong>${esc(a.titulo)}</strong><span>${esc(a.detalle)}</span></div></div>`).join("")
    + p.dias.filter((d) => d.escaso && d.n_clases).map((d) => `
    <div class="alerta suave"><span aria-hidden="true">🌥️</span><div><strong>${esc(d.dia_texto)} viene con poco sol</strong><span>Las tablets de ese día se cargan antes, en los días de sol.</span></div></div>`).join("");

  pintarSiguiente(siguiente);

  // Pestañas por día
  const d = estado.diaInstrucciones;
  $("#pestanas-dias").innerHTML = pestanasDias(diasConAlgo, d, "data-dia-ins", (x) => {
    const pend = p.instrucciones.filter((i) => i.fecha === x.fecha && !i.hecha && i.tipo !== "aviso").length;
    return pend ? ` · ${pend}` : " · ✓";
  });
  const delDia = p.instrucciones.filter((i) => i.fecha === d && i.tipo !== "aviso");
  const pendDia = delDia.filter((i) => !i.hecha);
  const hechasDia = delDia.filter((i) => i.hecha);
  $("#lista-instrucciones").innerHTML = pendDia.map((i) => filaInstruccion(i, i === siguiente)).join("")
    || `<li class="fila"><div><strong>Todo hecho este día</strong><small>No quedan instrucciones pendientes.</small></div></li>`;
  $("#lista-hechas").innerHTML = hechasDia.map((i) => filaInstruccion(i, false)).join("");
  $("#bloque-hechas").hidden = hechasDia.length === 0;
  $("#resumen-hechas").textContent = `Mostrar las ${hechasDia.length} hechas`;

  const diaInfo = p.dias.find((x) => x.fecha === d);
  $("#titulo-clases").textContent = `Clases · ${diaInfo ? diaInfo.dia_texto.toLowerCase() : ""}`;
  pintarClases(p.clases.filter((c) => c.fecha === d));
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-dia-ins]");
  if (!b) return;
  estado.diaInstrucciones = b.dataset.diaIns;
  pintarPlan();
});

function chips(tablets) {
  return `<div class="chips">${tablets.map((t) => `<span class="chip-tablet">${esc(t)}</span>`).join("")}</div>`;
}

function pintarSiguiente(i) {
  const caja = $("#siguiente");
  if (!i) {
    caja.className = "siguiente vacio";
    caja.innerHTML = `<div class="hora">✓</div><div class="accion"><h3>Todo preparado</h3><p>No quedan instrucciones pendientes.</p></div>`;
    return;
  }
  const aviso = estado.plan.instrucciones.find((a) => a.tipo === "aviso" && a.id === i.id + "-aviso");
  caja.className = "siguiente" + (aviso ? " aviso" : "");
  caja.innerHTML = `
    <div class="etiqueta">Siguiente paso · ${esc(i.dia_texto)}</div>
    <div class="hora">${esc(i.hora)}</div>
    <div class="accion">
      <h3>${esc(i.titulo)}</h3>
      <p>${esc(i.detalle)}</p>
      ${aviso ? `<p class="aviso-texto">⚠️ ${esc(aviso.detalle)}</p>` : ""}
    </div>
    ${chips(i.tablets)}
    <div class="pie">
      <button class="boton" data-hecha="${esc(i.id)}">Hecho</button>
    </div>`;
}

function filaInstruccion(i, esSiguiente) {
  const clases = ["ins", i.tipo, i.hecha ? "hecha" : "", esSiguiente ? "siguiente-marca" : ""].join(" ");
  return `<li class="${clases}">
    <button class="check" data-${i.hecha ? "deshacer" : "hecha"}="${esc(i.id)}" aria-label="${i.hecha ? "Marcar como pendiente" : "Marcar como hecha"}">${i.hecha ? "✓" : ""}</button>
    <span class="h">${esc(i.hora)}</span>
    <div class="cuerpo"><strong>${esc(i.titulo)}</strong><small>${esc(i.detalle)}</small>${i.tablets.length ? chips(i.tablets) : ""}</div>
  </li>`;
}

document.addEventListener("click", async (e) => {
  const hecha = e.target.closest("[data-hecha]");
  const deshacer = e.target.closest("[data-deshacer]");
  if (!hecha && !deshacer) return;
  const id = (hecha || deshacer).dataset.hecha || (hecha || deshacer).dataset.deshacer;
  const ins = estado.plan.instrucciones.find((x) => x.id === id);
  ins.hecha = !!hecha;
  pintarPlan();
  if (hecha) aviso("Hecho: " + ins.titulo.toLowerCase());
  try {
    await api(`/api/instrucciones/${encodeURIComponent(id)}/hecha`, { method: hecha ? "POST" : "DELETE" });
  } catch (err) { marcarConexion(false); }
});

function pintarClases(clases) {
  $("#lista-clases").innerHTML = clases.map((c) => {
    const listas = c.tablets_listas.length;
    const ratio = c.n_tablets ? Math.min(1, listas / c.n_tablets) : 0;
    const color = ratio >= 1 ? "var(--verde)" : ratio >= 0.6 ? "var(--naranja)" : "var(--rojo)";
    const L = 2 * Math.PI * 15;
    return `<li class="clase-fila">
      <svg class="anillo" viewBox="0 0 38 38" aria-hidden="true">
        <circle class="pista" cx="19" cy="19" r="15"/>
        <circle cx="19" cy="19" r="15" stroke="${color}" stroke-dasharray="${L * ratio} ${L}" stroke-linecap="round" transform="rotate(-90 19 19)"/>
      </svg>
      <div><strong>${esc(c.asignatura)}</strong><small>${esc(c.hora)} · ${NOMBRE_ACT[c.actividad] || c.actividad}</small></div>
      <span class="cifra" style="color:${color}">${listas}/${c.n_tablets}</span>
    </li>`;
  }).join("") || `<li class="fila"><div><strong>Sin clases</strong><small>Este día no hay clases en el horario.</small></div></li>`;
}

// ================================================================ TABLETS
async function cargarTablets() {
  try {
    estado.tablets = await api("/api/tablets");
    pintarTablets();
  } catch (e) { marcarConexion(false); }
}

function colorBateria(b) {
  if (b == null) return "var(--texto-3)";
  return b >= 60 ? "var(--verde)" : b >= 30 ? "var(--naranja)" : "var(--rojo)";
}

function pintarTablets() {
  const ts = estado.tablets;
  const conDatos = ts.filter((t) => t.bateria != null && t.estado === "ok");
  const media = conDatos.length ? Math.round(conDatos.reduce((s, t) => s + t.bateria, 0) / conDatos.length) : 0;
  const bajas = conDatos.filter((t) => t.bateria < 30).length;
  const cargando = ts.filter((t) => t.cargando).length;
  const pendientes = ts.filter((t) => t.estado === "pendiente").length;
  const reales = ts.filter((t) => !t.simulada && t.estado !== "pendiente").length;
  $("#tablets-sub").textContent = `${ts.length} tablets · ${reales} real${reales === 1 ? "" : "es"}, ${ts.length - reales - pendientes} simuladas`
    + (pendientes ? ` y ${pendientes} pendientes de conectar` : "") + " · se actualiza sola";
  $("#tablets-cifras").innerHTML = `
    <div class="cifra-bloque"><b style="color:${colorBateria(media)}">${media}%</b><span>batería media</span></div>
    <div class="cifra-bloque"><b style="color:var(--rojo)">${bajas}</b><span>por debajo del 30 %</span></div>
    <div class="cifra-bloque"><b style="color:var(--sol)">${cargando}</b><span>cargando ahora</span></div>
    <div class="cifra-bloque"><b>${ts.length - conDatos.length - pendientes}</b><span>sin datos recientes</span></div>`;
  $("#rejilla-tablets").innerHTML = ts.map((t) => {
    if (t.estado === "pendiente") {
      return `<div class="tablet pendiente">
        <header>${esc(t.id)} <small>nueva</small></header>
        <div class="pila"><span class="pila-icono"></span>—</div>
        <span class="estado">Esperando conexión: instala la app en esta tablet</span>
      </div>`;
    }
    const sin = t.estado !== "ok" || t.bateria == null;
    const b = t.bateria ?? 0;
    return `<div class="tablet ${sin ? "sin-datos" : ""}">
      <header>${esc(t.id)} <small>${t.simulada ? "simulada" : "📱 real"}</small></header>
      <div class="pila"><span class="pila-icono"><i style="width:${Math.max(4, b)}%;background:${colorBateria(sin ? null : b)}"></i></span>${sin ? "—" : Math.round(b) + "%"}${t.cargando ? " ⚡" : ""}</div>
      <span class="estado">${sin ? (t.minutos_desde_lectura != null ? `Sin datos desde hace ${t.minutos_desde_lectura} min` : "Nunca ha enviado datos")
        : t.cargando ? "Cargando" : t.temperatura != null ? `${Math.round(t.temperatura)} ºC` : ""}</span>
    </div>`;
  }).join("");
}

// ================================================================ HORARIO (por días)
async function cargarHorario() {
  const [horario, consumo] = await Promise.all([api("/api/horario"), api("/api/consumo")]);
  estado.horario = horario;
  if (!estado.diaHorario || !horario.dias.some((d) => d.fecha === estado.diaHorario)) {
    estado.diaHorario = (horario.dias.find((d) => d.laborable && d.dia_texto !== "Hoy") || horario.dias[0])?.fecha;
  }
  $("#horario-sub").textContent = horario.prevision_hasta
    ? `Puedes preparar el horario hasta el ${fechaLarga(horario.prevision_hasta)}, el último día con previsión del tiempo`
    : "Aún no hay previsión: se muestran hoy y mañana";
  pintarHorario();

  const MAX = 30;
  $("#lista-consumo").innerHTML = Object.entries(consumo).map(([act, c]) => `
    <li class="consumo-fila">
      <span>${NOMBRE_ACT[act] || act} <small style="color:var(--texto-2)">· ${c.muestras} clases medidas</small></span>
      <span class="valores">estimado ${c.defecto} % → <strong>${c.prevision} %</strong> por hora</span>
      <span class="barra" aria-hidden="true"><i style="width:${(c.prevision / MAX) * 100}%"></i><b style="left:${(c.defecto / MAX) * 100}%"></b></span>
    </li>`).join("");
}

function pintarHorario() {
  const h = estado.horario;
  const dia = h.dias.find((d) => d.fecha === estado.diaHorario);
  $("#horario-dias").innerHTML = pestanasDias(h.dias, estado.diaHorario, "data-dia-hor",
    (d) => ` · ${d.clases.length || (d.laborable ? "0" : "sin clase")}`);
  $("#horario-titulo").textContent = dia ? mayus(dia.nombre) : "—";
  $("#lista-horario").innerHTML = (dia?.clases || []).map((c) => `
    <li class="horario-fila">
      <span class="h">${esc(c.hora_inicio)}</span>
      <div><strong>${esc(c.asignatura)} ${c.repite ? '<span class="repite" title="Se repite todos los días laborables">🔁</span>' : ""}</strong>
        <small>${NOMBRE_ACT[c.actividad] || c.actividad} · ${c.duracion_min} min · ${c.n_tablets} tablets · ${c.repite ? "todos los días laborables" : "solo este día"}</small></div>
      <button class="borrar" data-borrar="${c.id}" data-repite="${c.repite}">Eliminar</button>
    </li>`).join("") || `<li class="fila"><div><strong>No hay clases este día</strong><small>Añade una con el botón de arriba.</small></div></li>`;
}

document.addEventListener("click", async (e) => {
  const tab = e.target.closest("[data-dia-hor]");
  if (tab) { estado.diaHorario = tab.dataset.diaHor; pintarHorario(); return; }
  const b = e.target.closest("[data-borrar]");
  if (!b) return;
  await api(`/api/clases/${b.dataset.borrar}`, { method: "DELETE" });
  aviso(b.dataset.repite === "true" ? "Clase eliminada de todos los días" : "Clase eliminada");
  cargarHorario();
});

let actividadElegida = "ejercicios";
let repetirClase = false;
$("#btn-nueva-clase").addEventListener("click", () => {
  const dia = estado.horario?.dias.find((d) => d.fecha === estado.diaHorario);
  $("#c-solo-dia").textContent = dia ? `Solo el ${dia.nombre.split(" de ")[0]}` : "Solo este día";
  $("#hoja-clase").showModal();
});
document.querySelectorAll("#c-actividad .seg").forEach((b) => b.addEventListener("click", () => {
  actividadElegida = b.dataset.act;
  document.querySelectorAll("#c-actividad .seg").forEach((x) => x.classList.toggle("activo", x === b));
}));
document.querySelectorAll("#c-repetir .seg").forEach((b) => b.addEventListener("click", () => {
  repetirClase = b.dataset.repetir === "si";
  document.querySelectorAll("#c-repetir .seg").forEach((x) => x.classList.toggle("activo", x === b));
}));
$("#hoja-clase").addEventListener("close", async () => {
  if ($("#hoja-clase").returnValue !== "guardar") return;
  try {
    await api("/api/clases", { method: "POST", body: {
      asignatura: $("#c-asig").value.trim(), hora_inicio: $("#c-hora").value,
      duracion_min: Number($("#c-dur").value), actividad: actividadElegida, n_tablets: Number($("#c-n").value),
      fecha: repetirClase ? null : estado.diaHorario,
    } });
    aviso(repetirClase ? "Clase añadida a todos los días laborables" : "Clase añadida");
    $("#c-asig").value = "";
    cargarHorario();
  } catch (e) { aviso("Revisa los datos de la clase"); }
});

// ================================================================ PREVISIÓN
const ORIGEN_PREV = { profesor: "desde el móvil del profesor", servidor: "desde este ordenador" };

async function cargarPrevision() {
  try {
    const [dias, plan] = await Promise.all([api("/api/prevision/dias"), api("/api/plan")]);
    estado.previsionDias = dias;
    estado.plan = plan;
    if (!estado.diaPrevision || !dias.dias.some((d) => d.fecha === estado.diaPrevision)) estado.diaPrevision = dias.manana;
    pintarPrevision();
  } catch (e) { marcarConexion(false); }
}

function iconoDia(energia) {
  const max = estado.config ? estado.config.panel_solar_wp * estado.config.eficiencia_panel * 5.85 : 1755;
  const r = energia / max;
  return r >= 0.8 ? "☀️" : r >= 0.55 ? "🌤️" : r >= 0.35 ? "⛅" : "☁️";
}

function pintarPrevision() {
  const d = estado.previsionDias;
  const caja = $("#prevision-estado");
  if (!d.hay) {
    caja.className = "prevision-estado aviso";
    caja.innerHTML = `<div class="grande">Sin previsión</div>
      <p>Todavía no se ha cargado ninguna previsión. El plan usa un día soleado típico.</p>
      <p class="pista">Tráela con el móvil del profesor (app Fotosíntesis → Traer previsión) o con el botón de arriba si este ordenador tiene internet.</p>`;
    $("#lista-dias").innerHTML = "";
    $("#dia-titulo").textContent = "";
    pintarArco(new Array(24).fill(0), null);
    $("#arco-pie").textContent = "";
    return;
  }
  const descargada = new Date(d.descargada).toLocaleString("es-ES", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  caja.className = "prevision-estado" + (d.cubre_manana ? "" : " aviso");
  caja.innerHTML = `
    <div class="etiqueta">${d.cubre_manana ? "Tenemos previsión hasta el" : "La previsión se acabó el"}</div>
    <div class="grande">${esc(fechaLarga(d.hasta))}</div>
    <p>${d.cubre_manana
      ? `Quedan <strong>${d.dias_restantes} día${d.dias_restantes === 1 ? "" : "s"}</strong> por delante a partir de mañana. Las cargas se optimizan para todos ellos.`
      : "El plan está estimado con los últimos días. Conviene traer una previsión nueva."}</p>
    <p class="pista">Descargada ${ORIGEN_PREV[d.origen] || ""} el ${esc(descargada)}.</p>`;

  const maxE = Math.max(...d.dias.map((x) => x.energia_wh), 1);
  const escasos = new Set((estado.plan?.dias || []).filter((x) => x.escaso).map((x) => x.fecha));
  $("#lista-dias").innerHTML = d.dias.map((x) => {
    const hoyIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const etiqueta = x.fecha === d.manana ? "Mañana" : x.fecha === hoyIso ? "Hoy"
      : new Date(x.fecha + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long" });
    const pasado = x.fecha < hoyIso;
    return `<li><button class="dia ${x.fecha === estado.diaPrevision ? "elegido" : ""} ${pasado ? "pasado" : ""}" data-dia="${x.fecha}">
      <span class="dia-nombre">${esc(mayus(etiqueta))}<small>${esc(fechaLarga(x.fecha, false))}${escasos.has(x.fecha) ? " · poco sol para sus clases" : ""}</small></span>
      <span class="dia-icono" aria-hidden="true">${iconoDia(x.energia_wh)}</span>
      <span class="dia-barra" aria-hidden="true"><i style="width:${(x.energia_wh / maxE) * 100}%"></i></span>
      <span class="dia-wh">${x.energia_wh.toLocaleString("es-ES")} Wh</span>
    </button></li>`;
  }).join("");

  const dia = d.dias.find((x) => x.fecha === estado.diaPrevision) || d.dias[0];
  const planDia = estado.plan ? {
    clases: estado.plan.clases.filter((c) => c.fecha === dia.fecha),
    instrucciones: estado.plan.instrucciones.filter((i) => i.fecha === dia.fecha),
  } : null;
  $("#dia-titulo").textContent = mayus((dia.fecha === d.manana ? "mañana, " : "") + fechaLarga(dia.fecha));
  pintarArco(dia.solar_por_hora_wh, planDia);
  const hayPlan = planDia && (planDia.clases.length || planDia.instrucciones.length);
  $("#arco-pie").textContent = `${dia.energia_wh.toLocaleString("es-ES")} Wh que dará el panel · más sol hacia las ${dia.pico_hora}:00`
    + (hayPlan ? " · los puntos son las cargas del plan y las bandas grises, las clases" : "");
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-dia]");
  if (!b) return;
  estado.diaPrevision = b.dataset.dia;
  pintarPrevision();
});

$("#btn-prevision-descargar").addEventListener("click", async () => {
  try {
    await api("/api/prevision/actualizar", { method: "POST" });
    aviso("Previsión de 7 días descargada");
    cargarPrevision();
  } catch (e) { aviso("Este ordenador no tiene internet. Tráela desde el móvil del profesor."); }
});

// Arco solar: solar = 24 valores (Wh por hora). planDia: clases e instrucciones de ese día (opcional)
function pintarArco(solar, planDia) {
  const svg = $("#arco-svg");
  const H0 = 5, H1 = 20, ALTO = 220, ARRIBA = 30, ABAJO = 190;
  const W = Math.max(360, Math.round(svg.getBoundingClientRect().width) || 1000);
  svg.setAttribute("viewBox", `0 0 ${W} ${ALTO}`);
  const max = estado.config ? estado.config.panel_solar_wp * estado.config.eficiencia_panel : Math.max(...solar, 1);
  const x = (h) => ((h - H0) / (H1 - H0)) * W;
  const y = (wh) => ABAJO - (Math.min(wh, max) / max) * (ABAJO - ARRIBA);

  const puntos = [];
  for (let h = H0; h <= H1; h++) puntos.push([x(h + 0.5), y(solar[h] || 0)]);
  let d = `M ${x(H0)} ${ABAJO} L ${puntos[0][0]} ${puntos[0][1]}`;
  for (let k = 0; k < puntos.length - 1; k++) {
    const [x0, y0] = puntos[Math.max(0, k - 1)], [x1, y1] = puntos[k], [x2, y2] = puntos[k + 1], [x3, y3] = puntos[Math.min(puntos.length - 1, k + 2)];
    d += ` C ${x1 + (x2 - x0) / 6} ${y1 + (y2 - y0) / 6}, ${x2 - (x3 - x1) / 6} ${y2 - (y3 - y1) / 6}, ${x2} ${y2}`;
  }
  d += ` L ${x(H1)} ${ABAJO} Z`;
  const alturaCurva = (h) => {
    const a = Math.floor(h - 0.5), b = a + 1, t = h - 0.5 - a;
    const va = solar[a] || 0, vb = solar[b] || 0;
    return y(va + (vb - va) * t);
  };
  const horaDec = (hhmm) => { const [hh, mm] = hhmm.split(":").map(Number); return hh + mm / 60; };

  let bandas = "", marcas = "";
  if (planDia) {
    bandas = planDia.clases.map((c) => {
      const ini = horaDec(c.hora), fin = ini + c.duracion_min / 60;
      const ancho = x(fin) - x(ini);
      const cabe = Math.floor((ancho - 8) / 6.5);          // letras que caben en la banda
      const nombre = c.asignatura.length > cabe ? c.asignatura.slice(0, Math.max(0, cabe - 1)) + "…" : c.asignatura;
      return `<rect class="clase-banda" x="${x(ini)}" y="${ARRIBA - 22}" width="${ancho}" height="${ABAJO - ARRIBA + 22}" rx="6"><title>${esc(c.hora + " · " + c.asignatura)}</title></rect>
              ${cabe >= 3 ? `<text class="clase-banda-texto" x="${x(ini) + 5}" y="${ARRIBA - 8}">${esc(nombre)}</text>` : ""}`;
    }).join("");
    const colorCarga = { sol: "var(--sol)", bateria: "var(--verde)", mixta: "var(--verde)" };
    marcas = planDia.instrucciones.filter((i) => i.tipo === "carga").map((i) => {
      const h = horaDec(i.hora) + 0.12;
      const color = i.hecha ? "var(--texto-3)" : colorCarga[i.fuente_tipo];
      return `<g class="marca-ins"><circle cx="${x(h)}" cy="${Math.min(alturaCurva(h), ABAJO - 8)}" r="7" fill="${color}"><title>${esc(i.hora + " · " + i.titulo)}</title></circle></g>`;
    }).join("");
  }
  const eje = [];
  for (let h = 6; h <= 20; h += (W < 600 ? 4 : 2)) eje.push(`<text x="${x(h)}" y="${ALTO - 4}" text-anchor="middle">${h}:00</text>`);

  svg.innerHTML = `
    <defs><linearGradient id="degradado-sol" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="var(--sol)" stop-opacity="0.45"/><stop offset="1" stop-color="var(--sol)" stop-opacity="0.04"/>
    </linearGradient></defs>
    ${bandas}
    <g class="eje"><line x1="0" x2="${W}" y1="${ABAJO}" y2="${ABAJO}"/>${eje.join("")}</g>
    <path class="curva" d="${d}"/>
    ${marcas}`;
}

window.addEventListener("resize", () => { if (estado.vista === "prevision" && estado.previsionDias?.hay) pintarPrevision(); });

// ================================================================ ASISTENTE (botón flotante + panel)
function abrirChat(abrir) {
  $("#panel-chat").hidden = !abrir;
  $("#fab-asistente").setAttribute("aria-expanded", String(abrir));
  $("#fab-asistente").classList.toggle("abierto", abrir);
  document.body.classList.toggle("chat-abierto", abrir);
  if (abrir) {
    if (!estado.chatIniciado) iniciarChat();
    setTimeout(() => $("#entrada-chat").focus(), 50);
  }
}
$("#fab-asistente").addEventListener("click", () => abrirChat($("#panel-chat").hidden));
$("#cerrar-chat").addEventListener("click", () => abrirChat(false));
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#panel-chat").hidden) abrirChat(false); });

function burbuja(texto, quien, origen, motivo) {
  const div = document.createElement("div");
  div.className = "burbuja " + quien;
  div.textContent = texto;
  if (origen) {
    const s = document.createElement("span");
    s.className = "origen";
    s.textContent = origen === "gemini" ? "Gemini" : "Resumen automático · " + (motivo || "Gemini no disponible");
    div.appendChild(s);
  }
  $("#chat").appendChild(div);
  $("#chat").scrollTop = $("#chat").scrollHeight;
  return div;
}

async function iniciarChat() {
  estado.chatIniciado = true;
  $("#chat").innerHTML = "";
  const espera = burbuja("Preparando el resumen…", "ia pensando");
  try {
    const r = await api("/api/asistente/resumen");
    espera.remove();
    burbuja(r.texto, "ia", r.origen, r.motivo);
  } catch (e) { espera.textContent = "No hay conexión con el servidor."; }
}

async function preguntar(texto) {
  if (!texto.trim()) return;
  burbuja(texto, "yo");
  $("#entrada-chat").value = "";
  const espera = burbuja("Pensando…", "ia pensando");
  try {
    const r = await api("/api/asistente/preguntar", { method: "POST", body: { pregunta: texto } });
    espera.remove();
    burbuja(r.texto, "ia", r.origen, r.motivo);
  } catch (e) { espera.textContent = "No hay conexión con el servidor."; }
}
$("#form-chat").addEventListener("submit", (e) => { e.preventDefault(); preguntar($("#entrada-chat").value); });
document.querySelectorAll("#sugerencias .chip").forEach((c) => c.addEventListener("click", () => preguntar(c.textContent)));

// ================================================================ AJUSTES
// Preguntas sencillas: cada opción guarda de golpe los valores técnicos que necesita el planificador.
const LUGARES = {
  chiwamba: { nombre: "Chiwamba, Malawi", pais: "Malawi", latitud: -13.9626, longitud: 33.7741 },
  lima: { nombre: "Lima, Perú", pais: "Perú", latitud: -12.0464, longitud: -77.0428 },
  quito: { nombre: "Quito, Ecuador", pais: "Ecuador", latitud: -0.1807, longitud: -78.4678 },
  bogota: { nombre: "Bogotá, Colombia", pais: "Colombia", latitud: 4.711, longitud: -74.0721 },
  mexico: { nombre: "Ciudad de México, México", pais: "México", latitud: 19.4326, longitud: -99.1332 },
  nairobi: { nombre: "Nairobi, Kenia", pais: "Kenia", latitud: -1.2921, longitud: 36.8219 },
  luanda: { nombre: "Luanda, Angola", pais: "Angola", latitud: -8.8390, longitud: 13.2894 },
  maputo: { nombre: "Maputo, Mozambique", pais: "Mozambique", latitud: -25.9692, longitud: 32.5732 },
  salamanca: { nombre: "Salamanca, España", pais: "España", latitud: 40.9701, longitud: -5.6635 },
};
const POTENCIAS_PANEL = [100, 200, 300, 400];
const TAMANOS_BATERIA = [
  { wh: 500, titulo: "Pequeña", texto: "500 Wh · como dos baterías de coche pequeñas" },
  { wh: 1000, titulo: "Mediana", texto: "1.000 Wh · la más habitual en escuelas" },
  { wh: 2000, titulo: "Grande", texto: "2.000 Wh · instalación completa" },
];
const NIVELES_BATERIA = [
  { pct: 20, titulo: "Casi vacía", texto: "Se gasta por la noche" },
  { pct: 50, titulo: "A medias", texto: "Lo normal" },
  { pct: 90, titulo: "Llena", texto: "Apenas se usa de noche" },
];
function opcion(grupo, valor, titulo, texto, elegida, emoji = "") {
  return `<button class="opcion ${elegida ? "elegida" : ""}" data-grupo="${grupo}" data-valor="${valor}" aria-pressed="${elegida}">
    ${emoji ? `<span class="opcion-emoji" aria-hidden="true">${emoji}</span>` : ""}
    <strong>${esc(titulo)}</strong>${texto ? `<small>${esc(texto)}</small>` : ""}
  </button>`;
}

function contador(clave, valor, unidad, paso, min, max) {
  return `<span class="paso-botones"><button data-contar="${clave}" data-d="${-paso}" data-min="${min}" data-max="${max}" aria-label="Menos">−</button>`
    + `<span class="contador-valor">${valor}${unidad}</span>`
    + `<button data-contar="${clave}" data-d="${paso}" data-min="${min}" data-max="${max}" aria-label="Más">+</button></span>`;
}

async function cargarAjustes() {
  const [config, info, tablets] = await Promise.all([api("/api/config"), api("/api/info"), api("/api/tablets")]);
  estado.config = config;
  estado.tablets = tablets;
  $("#direccion").textContent = `${info.ip}:${info.puerto}`;
  pintarAjustes();
}

function pintarAjustes() {
  const c = estado.config;
  $("#escuela").textContent = c.escuela_nombre;
  if (document.activeElement !== $("#a-nombre")) $("#a-nombre").value = c.escuela_nombre;
  $("#a-lugar").innerHTML = Object.entries(LUGARES).map(([k, l]) =>
    `<option value="${k}" ${c.ubicacion === k ? "selected" : ""}>${esc(l.nombre)}</option>`).join("");

  $("#a-paneles").innerHTML = contador("n_paneles", c.n_paneles, "", 1, 1, 40);
  $("#a-potencia").innerHTML = POTENCIAS_PANEL.map((w) =>
    opcion("potencia", w, `${w} W`, w === 200 ? "La más habitual" : "", c.potencia_panel_w === w)).join("");

  $("#a-tiene-bateria").innerHTML =
    opcion("bateria", "si", "Sí, tenemos batería", "El sol que sobra se guarda para cargar a primera hora", c.bateria_sistema_activa, "🔋")
    + opcion("bateria", "no", "No tenemos", "Solo se puede cargar mientras hay sol", !c.bateria_sistema_activa, "☀️");
  $("#bloque-bateria").hidden = !c.bateria_sistema_activa;
  $("#a-tamano-bateria").innerHTML = TAMANOS_BATERIA.map((t) =>
    opcion("tamano", t.wh, t.titulo, t.texto, c.bateria_sistema_wh === t.wh)).join("");
  $("#a-nivel-bateria").innerHTML = NIVELES_BATERIA.map((n) =>
    opcion("nivel", n.pct, n.titulo, n.texto, c.bateria_sistema_nivel === n.pct)).join("");

  $("#a-n-tablets").innerHTML = contador("n_tablets", estado.tablets.length, "", 1, 0, 200);
  $("#a-enchufes").innerHTML = contador("n_enchufes", c.n_enchufes, "", 1, 1, 60);
  $("#a-llegada").innerHTML = contador("hora_llegada", c.hora_llegada, ":00", 1, 5, c.hora_salida - 1);
  $("#a-salida").innerHTML = contador("hora_salida", c.hora_salida, ":00", 1, c.hora_llegada + 1, 22);
  $("#a-reserva").innerHTML = contador("reserva_pct", c.reserva_pct, " %", 5, 5, 50);

  pintarResumen();
}

function pintarResumen() {
  const c = estado.config;
  // Energía de un día soleado típico (≈ 5,85 kWh/m²). El consumo del ordenador es despreciable.
  const solDia = 5.85 * c.panel_solar_wp * c.eficiencia_panel;
  const cargas = Math.floor(solDia / c.capacidad_tablet_wh);
  const nTablets = (estado.tablets || []).length;
  const lugar = LUGARES[c.ubicacion]?.nombre || c.pais;
  $("#resumen-instalacion").innerHTML = `
    <div class="resumen-cifra">${cargas}</div>
    <div class="resumen-texto">
      <strong>tablets cargadas del todo en un día de sol</strong>
      <span>${c.n_paneles} panel${c.n_paneles === 1 ? "" : "es"} de ${c.potencia_panel_w} W (${c.panel_solar_wp} W en total) ·
        ${c.bateria_sistema_activa ? `batería de ${c.bateria_sistema_wh.toLocaleString("es-ES")} Wh` : "sin batería"} ·
        ${nTablets} tablets, hasta ${c.n_enchufes} cargando a la vez · profesor de ${c.hora_llegada}:00 a ${c.hora_salida}:00 · ${esc(lugar)}</span>
    </div>`;
}

async function guardar(cambios, mensaje = "Guardado") {
  Object.assign(estado.config, cambios);
  pintarAjustes();
  try {
    await api("/api/config", { method: "PATCH", body: cambios });
    aviso(mensaje + ". El plan se recalculará.");
  } catch (e) { aviso("No se pudo guardar"); cargarAjustes(); }
}

document.addEventListener("click", (e) => {
  const o = e.target.closest("[data-grupo]");
  if (o) {
    const c = estado.config, v = o.dataset.valor;
    switch (o.dataset.grupo) {
      case "potencia": guardar({ potencia_panel_w: +v, panel_solar_wp: +v * c.n_paneles }); break;
      case "bateria": guardar({ bateria_sistema_activa: v === "si" }); break;
      case "tamano": guardar({ bateria_sistema_wh: +v }); break;
      case "nivel": guardar({ bateria_sistema_nivel: +v }); break;
    }
    return;
  }
  const b = e.target.closest("[data-contar]");
  if (b && b.dataset.contar === "n_tablets") { cambiarNumeroTablets(estado.tablets.length + +b.dataset.d); return; }
  if (b) {
    const clave = b.dataset.contar;
    const nuevo = Math.min(+b.dataset.max, Math.max(+b.dataset.min, estado.config[clave] + +b.dataset.d));
    if (nuevo === estado.config[clave]) return;
    const cambios = { [clave]: nuevo };
    if (clave === "n_paneles") cambios.panel_solar_wp = nuevo * estado.config.potencia_panel_w;
    guardar(cambios);
  }
});

async function cambiarNumeroTablets(total) {
  if (total < 0) return;
  try {
    const r = await api("/api/tablets/cantidad", { method: "PUT", body: { total } });
    estado.tablets = await api("/api/tablets");
    pintarAjustes();
    aviso(r.aviso || (total > 0 ? `Ahora hay ${r.total} tablets. Las nuevas aparecen en Tablets.` : "Guardado"));
  } catch (e) { aviso("No se pudo cambiar el número de tablets"); }
}

$("#a-lugar").addEventListener("change", (e) => {
  const l = LUGARES[e.target.value];
  guardar({ ubicacion: e.target.value, pais: l.pais, latitud: l.latitud, longitud: l.longitud },
    "Lugar cambiado. Descarga de nuevo la previsión");
});
$("#a-nombre").addEventListener("change", (e) => {
  const nombre = e.target.value.trim();
  if (nombre) guardar({ escuela_nombre: nombre });
});

// ================================================================ arranque
(async function iniciar() {
  try {
    estado.config = await api("/api/config");
    $("#escuela").textContent = estado.config.escuela_nombre;
  } catch (e) { marcarConexion(false); }
  cargarPlan();
  // Refresco periódico: tablets cada 5 s; instrucciones cada 30 s (si se están viendo)
  setInterval(() => { if (estado.vista === "tablets") cargarTablets(); else api("/api/info").catch(() => marcarConexion(false)); }, 5000);
  setInterval(() => { if (estado.vista === "hoy") cargarPlan(); }, 30000);
})();

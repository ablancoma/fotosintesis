// =====================================================================
//  Fotosíntesis · app de escritorio del profesor
//  Habla con la API del propio servidor (/api/...). Sin librerías.
// =====================================================================

const estado = { nublado: false, plan: null, config: null, tablets: [], vista: "hoy", chatIniciado: false };

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
  aviso.temporizador = setTimeout(() => t.classList.remove("visible"), 2200);
}

// ---------------------------------------------------------------- navegación
document.querySelectorAll(".nav").forEach((b) =>
  b.addEventListener("click", () => mostrarVista(b.dataset.vista)));

function mostrarVista(vista) {
  estado.vista = vista;
  document.querySelectorAll(".nav").forEach((b) => b.classList.toggle("activo", b.dataset.vista === vista));
  document.querySelectorAll(".vista").forEach((v) => v.classList.toggle("activa", v.id === "vista-" + vista));
  if (vista === "hoy") cargarPlan();
  if (vista === "tablets") cargarTablets();
  if (vista === "horario") cargarHorario();
  if (vista === "asistente" && !estado.chatIniciado) iniciarChat();
  if (vista === "ajustes") cargarAjustes();
}

// ================================================================ MAÑANA
document.querySelectorAll("[data-nublado]").forEach((b) =>
  b.addEventListener("click", () => {
    estado.nublado = b.dataset.nublado === "true";
    document.querySelectorAll("[data-nublado]").forEach((x) => x.classList.toggle("activo", x === b));
    estado.chatIniciado = false;
    cargarPlan();
  }));

$("#btn-recalcular").addEventListener("click", async () => {
  estado.plan = await api(`/api/plan/recalcular?nublado=${estado.nublado}`, { method: "POST" });
  pintarPlan();
  aviso("Plan recalculado con las baterías actuales");
});

async function cargarPlan() {
  try {
    estado.plan = await api(`/api/plan?nublado=${estado.nublado}`);
    pintarPlan();
  } catch (e) {
    marcarConexion(false);
  }
}

function pintarPlan() {
  const p = estado.plan;
  const fecha = new Date(p.dia + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  const fuentes = {
    prevision: p.prevision.origen === "profesor" ? "previsión traída desde el móvil del profesor" : "previsión descargada por este ordenador",
    estimada: "previsión estimada: la guardada es antigua, conviene traer una nueva",
    tipico: "aún no hay previsión, se usa un día soleado típico",
  };
  $("#hoy-sub").textContent = `${fecha.charAt(0).toUpperCase() + fecha.slice(1)}${p.nublado_simulado ? " · simulando día nublado" : ""}`;

  const pendientes = p.instrucciones.filter((i) => !i.hecha);
  const hechas = p.instrucciones.filter((i) => i.hecha);
  const siguiente = pendientes.find((i) => i.tipo !== "aviso");

  pintarArco(p, siguiente);
  $("#arco-pie").textContent = `${p.energia_solar_wh.toLocaleString("es-ES")} Wh de sol previstos · ${fuentes[p.prevision.fuente] || "previsión"}`;
  pintarSiguiente(siguiente, pendientes);
  $("#alertas").innerHTML = p.instrucciones.filter((i) => i.tipo === "aviso").map((a) => `
    <div class="alerta"><span aria-hidden="true">⚠️</span><div><strong>${esc(a.titulo)}</strong><span>${esc(a.detalle)}</span></div></div>`).join("");
  pintarClases(p.clases);

  const marcables = p.instrucciones.filter((i) => i.tipo !== "aviso");
  $("#progreso").textContent = `${marcables.filter((i) => i.hecha).length} de ${marcables.length} hechas`;
  $("#lista-instrucciones").innerHTML = pendientes.map((i) => filaInstruccion(i, i === siguiente)).join("")
    || `<li class="fila"><div><strong>Todo hecho</strong><small>No quedan instrucciones para mañana.</small></div></li>`;
  $("#lista-hechas").innerHTML = hechas.map((i) => filaInstruccion(i, false)).join("");
  $("#bloque-hechas").hidden = hechas.length === 0;
  $("#resumen-hechas").textContent = `Mostrar las ${hechas.length} hechas`;
}

function chips(tablets) {
  return `<div class="chips">${tablets.map((t) => `<span class="chip-tablet">${esc(t)}</span>`).join("")}</div>`;
}

function etiquetaFuente(i) {
  if (i.tipo !== "carga") return "";
  const txt = { sol: "☀️ Sol", bateria: "🔋 Batería escuela", mixta: "☀️ + 🔋" }[i.fuente_tipo] || "";
  return `<span class="fuente ${i.fuente_tipo}">${txt}</span>`;
}

function pintarSiguiente(i, pendientes) {
  const caja = $("#siguiente");
  const avisos = pendientes.filter((x) => x.tipo === "aviso");
  if (!i) {
    caja.className = "siguiente vacio";
    caja.innerHTML = `<div class="hora">✓</div><div class="accion"><h3>Todo preparado</h3><p>No queda nada por hacer para mañana.</p></div>`;
    return;
  }
  const avisoRelacionado = i.tipo === "clase" ? avisos.find((a) => a.id === i.id + "-aviso") : null;
  caja.className = "siguiente" + (avisoRelacionado ? " aviso" : "");
  caja.innerHTML = `
    <div class="etiqueta">Siguiente paso</div>
    <div class="hora">${esc(i.hora)}</div>
    <div class="accion">
      <h3>${esc(i.titulo)}</h3>
      <p>${esc(i.detalle)}</p>
      ${avisoRelacionado ? `<p style="color:var(--naranja);font-weight:600;margin-top:8px">⚠️ ${esc(avisoRelacionado.detalle)}</p>` : ""}
    </div>
    ${chips(i.tablets)}
    <div class="pie">
      <button class="boton" data-hecha="${esc(i.id)}">Hecho</button>
      ${etiquetaFuente(i)}
    </div>`;
}

function filaInstruccion(i, esSiguiente) {
  const clases = ["ins", i.tipo, i.hecha ? "hecha" : "", esSiguiente ? "siguiente-marca" : ""].join(" ");
  const boton = i.tipo === "aviso"
    ? `<span class="check" aria-hidden="true">!</span>`
    : `<button class="check" data-${i.hecha ? "deshacer" : "hecha"}="${esc(i.id)}" aria-label="${i.hecha ? "Marcar como pendiente" : "Marcar como hecha"}">${i.hecha ? "✓" : ""}</button>`;
  return `<li class="${clases}">
    ${boton}
    <span class="h">${esc(i.hora)}</span>
    <div class="cuerpo"><strong>${esc(i.titulo)}</strong><small>${esc(i.detalle)}</small>${i.tablets.length ? chips(i.tablets) : ""}</div>
    ${etiquetaFuente(i)}
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
  } catch (err) {
    marcarConexion(false);
  }
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
  }).join("");
}

// ---------------------------------------------------------------- arco solar
function pintarArco(p, siguiente) {
  const svg = $("#arco-svg");
  const H0 = 5, H1 = 20, W = 1000, ALTO = 220, ARRIBA = 30, ABAJO = 190;
  const max = estado.config ? estado.config.panel_solar_wp * estado.config.eficiencia_panel : Math.max(...p.solar_por_hora_wh, 1);
  const x = (h) => ((h - H0) / (H1 - H0)) * W;
  const y = (wh) => ABAJO - (Math.min(wh, max) / max) * (ABAJO - ARRIBA);

  // Curva suave: punto en el centro de cada hora
  const puntos = [];
  for (let h = H0; h <= H1; h++) puntos.push([x(h + 0.5), y(p.solar_por_hora_wh[h] || 0)]);
  let d = `M ${x(H0)} ${ABAJO} L ${puntos[0][0]} ${puntos[0][1]}`;
  for (let k = 0; k < puntos.length - 1; k++) {
    const [x0, y0] = puntos[Math.max(0, k - 1)], [x1, y1] = puntos[k], [x2, y2] = puntos[k + 1], [x3, y3] = puntos[Math.min(puntos.length - 1, k + 2)];
    d += ` C ${x1 + (x2 - x0) / 6} ${y1 + (y2 - y0) / 6}, ${x2 - (x3 - x1) / 6} ${y2 - (y3 - y1) / 6}, ${x2} ${y2}`;
  }
  d += ` L ${x(H1)} ${ABAJO} Z`;
  const alturaCurva = (h) => {   // altura aproximada de la curva en una hora decimal
    const a = Math.floor(h - 0.5), b = a + 1, t = h - 0.5 - a;
    const va = p.solar_por_hora_wh[a] || 0, vb = p.solar_por_hora_wh[b] || 0;
    return y(va + (vb - va) * t);
  };

  const horaDec = (hhmm) => { const [hh, mm] = hhmm.split(":").map(Number); return hh + mm / 60; };

  const bandas = p.clases.map((c) => {
    const ini = horaDec(c.hora), fin = ini + c.duracion_min / 60;
    return `<rect class="clase-banda" x="${x(ini)}" y="${ARRIBA - 22}" width="${x(fin) - x(ini)}" height="${ABAJO - ARRIBA + 22}" rx="6"/>
            <text class="clase-banda-texto" x="${x(ini) + 6}" y="${ARRIBA - 8}">${esc(c.asignatura)}</text>`;
  }).join("");

  const eje = [];
  for (let h = 6; h <= 20; h += 2) eje.push(`<text x="${x(h)}" y="${ALTO - 4}" text-anchor="middle">${h}:00</text>`);

  const colores = { carga: { sol: "var(--sol)", bateria: "var(--verde)", mixta: "var(--verde)" }, clase: "var(--azul)", aviso: "var(--naranja)" };
  const marcas = p.instrucciones.filter((i) => i.tipo !== "aviso").map((i) => {
    const h = horaDec(i.hora) + 0.12;
    const color = i.hecha ? "var(--texto-3)" : i.tipo === "carga" ? colores.carga[i.fuente_tipo] : colores.clase;
    const esSig = siguiente && i.id === siguiente.id;
    const cy = i.tipo === "clase" ? ABAJO - 8 : Math.min(alturaCurva(h), ABAJO - 8);
    return `<g class="marca-ins ${esSig ? "siguiente" : ""}">
      <circle cx="${x(h)}" cy="${cy}" r="${esSig ? 11 : 7}" fill="${color}"><title>${esc(i.hora + " · " + i.titulo)}</title></circle>
      ${esSig ? `<text x="${x(h)}" y="${cy - 18}" text-anchor="middle">${esc(i.hora)}</text>` : ""}
    </g>`;
  }).join("");

  svg.innerHTML = `
    <defs><linearGradient id="degradado-sol" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="var(--sol)" stop-opacity="0.45"/><stop offset="1" stop-color="var(--sol)" stop-opacity="0.04"/>
    </linearGradient></defs>
    ${bandas}
    <g class="eje"><line x1="0" x2="${W}" y1="${ABAJO}" y2="${ABAJO}"/>${eje.join("")}</g>
    <path class="curva" d="${d}"/>
    ${marcas}`;
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
  const reales = ts.filter((t) => !t.simulada).length;
  $("#tablets-sub").textContent = `${ts.length} tablets · ${reales} real${reales === 1 ? "" : "es"} y ${ts.length - reales} simuladas · se actualiza sola`;
  $("#tablets-cifras").innerHTML = `
    <div class="cifra-bloque"><b style="color:${colorBateria(media)}">${media}%</b><span>batería media</span></div>
    <div class="cifra-bloque"><b style="color:var(--rojo)">${bajas}</b><span>por debajo del 30 %</span></div>
    <div class="cifra-bloque"><b style="color:var(--sol)">${cargando}</b><span>cargando ahora</span></div>
    <div class="cifra-bloque"><b>${ts.length - conDatos.length}</b><span>sin datos recientes</span></div>`;
  $("#rejilla-tablets").innerHTML = ts.map((t) => {
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

// ================================================================ HORARIO
async function cargarHorario() {
  const [clases, consumo] = await Promise.all([api("/api/clases"), api("/api/consumo")]);
  $("#lista-horario").innerHTML = clases.map((c) => `
    <li class="horario-fila">
      <span class="h">${esc(c.hora_inicio)}</span>
      <div><strong>${esc(c.asignatura)}</strong><small>${NOMBRE_ACT[c.actividad] || c.actividad} · ${c.duracion_min} min · ${c.n_tablets} tablets</small></div>
      <button class="borrar" data-borrar="${c.id}">Eliminar</button>
    </li>`).join("") || `<li class="fila"><div><strong>No hay clases</strong><small>Añade la primera con el botón de arriba.</small></div></li>`;

  const MAX = 30;
  $("#lista-consumo").innerHTML = Object.entries(consumo).map(([act, c]) => `
    <li class="consumo-fila">
      <span>${NOMBRE_ACT[act] || act} <small style="color:var(--texto-2)">· ${c.muestras} clases medidas</small></span>
      <span class="valores">estimado ${c.defecto} % → <strong>${c.prevision} %</strong> por hora</span>
      <span class="barra" aria-hidden="true"><i style="width:${(c.prevision / MAX) * 100}%"></i><b style="left:${(c.defecto / MAX) * 100}%"></b></span>
    </li>`).join("");
}

document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-borrar]");
  if (!b) return;
  await api(`/api/clases/${b.dataset.borrar}`, { method: "DELETE" });
  aviso("Clase eliminada");
  cargarHorario();
});

let actividadElegida = "ejercicios";
$("#btn-nueva-clase").addEventListener("click", () => $("#hoja-clase").showModal());
document.querySelectorAll("#c-actividad .seg").forEach((b) => b.addEventListener("click", () => {
  actividadElegida = b.dataset.act;
  document.querySelectorAll("#c-actividad .seg").forEach((x) => x.classList.toggle("activo", x === b));
}));
$("#hoja-clase").addEventListener("close", async () => {
  if ($("#hoja-clase").returnValue !== "guardar") return;
  try {
    await api("/api/clases", { method: "POST", body: {
      asignatura: $("#c-asig").value.trim(), hora_inicio: $("#c-hora").value,
      duracion_min: Number($("#c-dur").value), actividad: actividadElegida, n_tablets: Number($("#c-n").value),
    } });
    aviso("Clase añadida");
    $("#c-asig").value = "";
    cargarHorario();
  } catch (e) { aviso("Revisa los datos de la clase"); }
});

// ================================================================ ASISTENTE
function burbuja(texto, quien, origen) {
  const div = document.createElement("div");
  div.className = "burbuja " + quien;
  div.textContent = texto;
  if (origen) {
    const s = document.createElement("span");
    s.className = "origen";
    s.textContent = origen === "gemini" ? "Gemini" : "Resumen automático (Gemini no disponible)";
    div.appendChild(s);
  }
  $("#chat").appendChild(div);
  $("#chat").scrollTop = $("#chat").scrollHeight;
  return div;
}

async function iniciarChat() {
  estado.chatIniciado = true;
  $("#chat").innerHTML = "";
  const espera = burbuja("Preparando el resumen de mañana…", "ia pensando");
  try {
    const r = await api(`/api/asistente/resumen?nublado=${estado.nublado}`);
    espera.remove();
    burbuja(r.texto, "ia", r.origen);
  } catch (e) { espera.textContent = "No hay conexión con el servidor."; }
}

async function preguntar(texto) {
  if (!texto.trim()) return;
  burbuja(texto, "yo");
  $("#entrada-chat").value = "";
  const espera = burbuja("Pensando…", "ia pensando");
  try {
    const r = await api(`/api/asistente/preguntar?nublado=${estado.nublado}`, { method: "POST", body: { pregunta: texto } });
    espera.remove();
    burbuja(r.texto, "ia", r.origen);
  } catch (e) { espera.textContent = "No hay conexión con el servidor."; }
}
$("#form-chat").addEventListener("submit", (e) => { e.preventDefault(); preguntar($("#entrada-chat").value); });
document.querySelectorAll("#sugerencias .chip").forEach((c) => c.addEventListener("click", () => preguntar(c.textContent)));

// ================================================================ AJUSTES
const AJUSTES_SOLAR = [
  ["panel_solar_wp", "Panel solar", "W", 50],
  ["bateria_sistema_wh", "Capacidad de la batería", "Wh", 250],
  ["bateria_sistema_nivel", "Carga de la batería al empezar el día", "%", 10, 100],
  ["servidor_w", "Consumo de este ordenador", "W", 5],
];
const AJUSTES_TABLETS = [
  ["n_enchufes", "Enchufes disponibles", "", 1, 60],
  ["potencia_cargador_w", "Potencia de cada cargador", "W", 5],
  ["capacidad_tablet_wh", "Batería de cada tablet", "Wh", 5],
  ["reserva_pct", "Batería mínima al acabar una clase", "%", 5, 50],
];

function filaPaso([clave, nombre, unidad, paso, max = 100000]) {
  const v = estado.config[clave];
  return `<li class="fila"><span>${nombre}</span><span class="paso">
    <span class="valor">${v} ${unidad}</span>
    <span class="paso-botones"><button data-paso="${clave}" data-d="${-paso}" data-max="${max}" aria-label="Menos">−</button><button data-paso="${clave}" data-d="${paso}" data-max="${max}" aria-label="Más">+</button></span>
  </span></li>`;
}

async function cargarAjustes() {
  estado.config = await api("/api/config");
  const [prev, info] = await Promise.all([api("/api/prevision"), api("/api/info")]);
  const c = estado.config;
  $("#escuela").textContent = c.escuela_nombre;
  $("#prev-origen").textContent = prev.fuente === "tipico" ? "Aún no hay previsión guardada"
    : prev.origen === "profesor" ? "Traída desde el móvil del profesor" : "Descargada por este ordenador";
  $("#prev-fecha").textContent = prev.descargada
    ? `Actualizada el ${new Date(prev.descargada).toLocaleString("es-ES", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} · ${prev.dias_guardados} días guardados`
    : "Se usará un día soleado típico hasta que llegue una";
  $("#direccion").textContent = `${info.ip}:${info.puerto}`;

  $("#ajustes-solar").innerHTML = `
    <li class="fila"><div><strong>Batería de almacenamiento</strong><small>Guarda el sol que sobra para cargar a primera hora</small></div>
      <input type="checkbox" class="interruptor" id="sw-bateria" ${c.bateria_sistema_activa ? "checked" : ""} aria-label="Batería de almacenamiento"></li>
    ${AJUSTES_SOLAR.filter(([k]) => c.bateria_sistema_activa || !k.startsWith("bateria_sistema")).map(filaPaso).join("")}`;
  $("#ajustes-tablets").innerHTML = AJUSTES_TABLETS.map(filaPaso).join("");
  $("#sw-bateria").addEventListener("change", (e) => guardarAjuste("bateria_sistema_activa", e.target.checked));
}

async function guardarAjuste(clave, valor) {
  await api("/api/config", { method: "PATCH", body: { [clave]: valor } });
  aviso("Guardado. El plan se recalculará.");
  cargarAjustes();
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-paso]");
  if (!b) return;
  const clave = b.dataset.paso, d = Number(b.dataset.d), max = Number(b.dataset.max);
  const nuevo = Math.min(max, Math.max(Math.abs(d), estado.config[clave] + d));
  guardarAjuste(clave, nuevo);
});

$("#btn-prevision-servidor").addEventListener("click", async () => {
  try {
    await api("/api/prevision/actualizar", { method: "POST" });
    aviso("Previsión de 7 días descargada");
    cargarAjustes();
  } catch (e) { aviso("Este ordenador no tiene internet ahora mismo"); }
});

// ================================================================ arranque
(async function iniciar() {
  try {
    estado.config = await api("/api/config");
    $("#escuela").textContent = estado.config.escuela_nombre;
  } catch (e) { marcarConexion(false); }
  cargarPlan();
  // Refresco periódico: tablets cada 5 s y plan cada 30 s (si se está viendo)
  setInterval(() => { if (estado.vista === "tablets") cargarTablets(); else api("/api/info").catch(() => marcarConexion(false)); }, 5000);
  setInterval(() => { if (estado.vista === "hoy") cargarPlan(); }, 30000);
})();

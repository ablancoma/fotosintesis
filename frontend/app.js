// =====================================================================
//  APP — aquí se CONECTAN las tres partes:
//    planificador/  →  previsión del tiempo (con caché) + plan de carga
//    ia/            →  aprende el consumo, explica el plan y responde (local o Gemini)
//    frontend/      →  lo pinta en pantalla
//
//  Con o sin internet se ejecuta TODO: la previsión sale de la caché
//  y la IA local sustituye a Gemini.
// =====================================================================

import { obtenerPrevisionSolar, calcularPlan } from "../planificador/planificador.js";
import {
  leerHistorial, predecirConsumo, consumoParaPlanificador,
  explicarPlan, responderPregunta, guardarOffline
} from "../ia/ia.js";
import { hayConexion, simularSinConexion } from "../shared/red.js";

// Guardar la app en la tablet para que abra sin internet
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("../sw.js", { scope: "../" })
    .catch(e => console.warn("Service Worker no registrado", e));
}

// Estado del simulador
let diaNublado = false;

let escuela, tablets, horario, historialInicial;
let planActual, contextoActual;

// --------------------------- ARRANQUE ---------------------------------
async function iniciar() {
  escuela = await leerJSON("../shared/datos/escuela.json");
  tablets = await leerJSON("../shared/datos/tablets.json");
  horario = await leerJSON("../shared/datos/horario.json");
  historialInicial = await leerJSON("../shared/datos/historial_uso.json");

  document.getElementById("escuela").textContent = `${escuela.nombre} · ${escuela.pais} · Panel solar de ${escuela.panel_solar_wp} W`;
  pintarTablets(tablets);
  await actualizar();
}

// Ejecuta TODO el proceso. Funciona igual con o sin internet.
async function actualizar() {
  pintarEstadoRed();
  pintarMensaje("Calculando el plan…", "");

  // 1. Previsión del tiempo: online si hay red (y se guarda), si no la guardada
  const prevision = await obtenerPrevisionSolar(escuela.latitud, escuela.longitud);
  let valores = prevision.valores;
  if (diaNublado) valores = valores.map(r => r * 0.3);
  pintarPrevision(prevision);

  // 2. IA local: aprender el consumo real de cada asignatura
  const prediccion = predecirConsumo(leerHistorial(historialInicial));
  const consumo = consumoParaPlanificador(prediccion);
  const diferencias = horario
    .filter(c => consumo[c.asignatura] !== undefined && Math.abs(consumo[c.asignatura] - c.consumo_por_hora) >= 5)
    .map(c => ({ asignatura: c.asignatura, nominal: c.consumo_por_hora, aprendido: consumo[c.asignatura] }));

  // 3. Plan de carga con lo aprendido
  planActual = calcularPlan(tablets, horario, escuela, valores, consumo);
  contextoActual = { prevision, prediccion, diferencias };
  pintarPlan(planActual);

  // 4. Mensaje para el profesor (Gemini si hay red y clave; si no, IA local)
  const { texto, origen } = await explicarPlan(planActual, escuela, contextoActual);
  pintarMensaje(texto, origen);
  guardarOffline(planActual, texto);
}

// --------------------------- PINTAR -----------------------------------
function pintarPlan(plan) {
  document.getElementById("clases").innerHTML = plan.clases.map(c => `
    <div class="clase ${c.tablets_listas < c.tablets_total ? "aviso" : ""}">
      <div><strong>${c.hora}:00 · ${c.asignatura}</strong><br><small>gasta ~${c.consumo_por_hora}%/h</small></div>
      <div>${c.tablets_listas < c.tablets_total ? "⚠️" : "✅"} ${c.tablets_listas}/${c.tablets_total} tablets listas</div>
    </div>`).join("");

  // Escala fija (máximo que puede dar el panel) para que el día nublado se vea más bajo
  const max = escuela.panel_solar_wp * escuela.eficiencia_panel;
  document.getElementById("franjas").innerHTML = plan.franjas.map(f => `
    <div class="franja" title="${f.cargas.map(c => c.tablet).join(", ") || "Sin cargas"}">
      <span class="n">${f.cargas.length || ""}</span>
      <div class="barra" style="height:${(f.energia_disponible_wh / max) * 100}%"></div>
      <small>${f.hora}h</small>
    </div>`).join("");

  document.getElementById("precargas").innerHTML = plan.precargas.map(p => `
    <li>${p.hora_descarga !== null ? `A las <b>${p.hora_descarga}:00</b>` : "❌ <b>Sin internet antes de la clase</b>"}
      → "${p.contenido}" en ${p.tablets.length} tablets</li>`).join("") || "<li>Todo descargado 👍</li>";
}

function pintarPrevision(prevision) {
  const textos = {
    online: "🌐 Previsión actualizada ahora",
    guardada: "💾 Previsión guardada",
    estimada: "📈 Previsión estimada (guardada antigua)",
    ejemplo: "☀️ Día típico (sin previsión aún)"
  };
  let texto = textos[prevision.fuente];
  if (prevision.dias_guardados) texto += ` · ${prevision.dias_guardados} días en la tablet`;
  document.getElementById("fuente-prevision").textContent = texto;
}

function pintarTablets(lista) {
  document.getElementById("tablets").innerHTML = lista.map(t => {
    const nivel = t.bateria >= 60 ? "alta" : t.bateria >= 30 ? "media" : "baja";
    return `<div class="tablet ${nivel}">${t.id}<br>${t.bateria}%</div>`;
  }).join("");
}

function pintarMensaje(texto, origen) {
  document.getElementById("mensaje-ia").textContent = texto;
  const etiqueta = document.getElementById("origen-ia");
  etiqueta.textContent = origen === "gemini" ? "IA en la nube (Gemini)" : origen === "local" ? "IA local · sin internet" : "";
  etiqueta.className = "origen " + origen;
}

function pintarEstadoRed() {
  const el = document.getElementById("estado-red");
  const online = hayConexion();
  el.textContent = online ? "🌐 Con internet" : "📴 Sin internet";
  el.classList.toggle("sin-red", !online);
}

// --------------------------- BOTONES ----------------------------------
document.getElementById("btn-nublado").onclick = (e) => {
  diaNublado = !diaNublado;
  e.target.classList.toggle("activo", diaNublado);
  actualizar();
};

document.getElementById("btn-sin-red").onclick = (e) => {
  const cortar = !e.target.classList.contains("activo");
  simularSinConexion(cortar);
  e.target.classList.toggle("activo", cortar);
  e.target.textContent = cortar ? "🌐 Volver a conectar" : "📴 Cortar internet";
  actualizar();
};

document.getElementById("btn-recalcular").onclick = () => actualizar();

document.getElementById("form-pregunta").onsubmit = async (e) => {
  e.preventDefault();
  const pregunta = document.getElementById("pregunta").value.trim();
  if (!pregunta || !planActual) return;
  const salida = document.getElementById("respuesta");
  salida.textContent = "Pensando…";
  const { texto, origen } = await responderPregunta(pregunta, planActual, escuela, contextoActual);
  salida.textContent = texto + (origen === "local" ? "\n\n(IA local)" : "\n\n(Gemini)");
};

// Si la red real cambia, recalculamos
window.addEventListener("online", actualizar);
window.addEventListener("offline", actualizar);

// --------------------------- UTILIDAD ---------------------------------
async function leerJSON(ruta) {
  const r = await fetch(ruta);
  return r.json();
}

iniciar();

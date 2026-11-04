// =====================================================================
//  APP — aquí se CONECTAN las tres partes:
//    planificador/  →  calcula el plan
//    ia/            →  lo explica y lo guarda para modo sin conexión
//    frontend/      →  lo pinta en pantalla
// =====================================================================

import { obtenerPrevisionSolar, calcularPlan } from "../planificador/planificador.js";
import { explicarPlan, responderPregunta, guardarOffline, cargarOffline } from "../ia/ia.js";

// Estado del simulador
let diaNublado = false;
let sinInternet = false;

let escuela, tablets, horario, planActual;

// --------------------------- ARRANQUE ---------------------------------
async function iniciar() {
  escuela = await leerJSON("../shared/datos/escuela.json");
  tablets = await leerJSON("../shared/datos/tablets.json");
  horario = await leerJSON("../shared/datos/horario.json");

  document.getElementById("escuela").textContent = `${escuela.nombre} · ${escuela.pais} · Panel solar de ${escuela.panel_solar_wp} W`;
  pintarTablets(tablets);
  await actualizar();
}

// Calcula el plan y lo muestra todo
async function actualizar() {
  pintarEstadoRed();

  // SIN INTERNET → usamos lo último que se guardó en la tablet
  if (sinInternet) {
    const guardado = cargarOffline();
    if (guardado) {
      planActual = guardado.plan;
      pintarPlan(planActual);
      const hora = new Date(guardado.fecha).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
      pintarMensaje(`📴 Sin internet. Plan preparado a las ${hora}:\n\n${guardado.mensaje}`);
    } else {
      pintarMensaje("📴 Sin internet y aún no hay ningún plan guardado.");
    }
    return;
  }

  // CON INTERNET → previsión real + plan + mensaje de la IA, y lo guardamos
  pintarMensaje("Calculando el plan…");
  let prevision = await obtenerPrevisionSolar(escuela.latitud, escuela.longitud);
  if (diaNublado) prevision = prevision.map(r => r * 0.3);

  planActual = calcularPlan(tablets, horario, escuela, prevision);
  pintarPlan(planActual);

  const mensaje = await explicarPlan(planActual, escuela);
  pintarMensaje(mensaje);
  guardarOffline(planActual, mensaje);
}

// --------------------------- PINTAR -----------------------------------
function pintarPlan(plan) {
  // Clases
  document.getElementById("clases").innerHTML = plan.clases.map(c => `
    <div class="clase ${c.tablets_listas < c.tablets_total ? "aviso" : ""}">
      <div><strong>${c.hora}:00 · ${c.asignatura}</strong></div>
      <div>${c.tablets_listas < c.tablets_total ? "⚠️" : "✅"} ${c.tablets_listas}/${c.tablets_total} tablets listas</div>
    </div>`).join("");

  // Franjas de energía
  // Escala fija (máximo que puede dar el panel) para que el día nublado se vea más bajo
  const max = escuela.panel_solar_wp * escuela.eficiencia_panel;
  document.getElementById("franjas").innerHTML = plan.franjas.map(f => `
    <div class="franja" title="${f.cargas.map(c => c.tablet).join(", ") || "Sin cargas"}">
      <span class="n">${f.cargas.length || ""}</span>
      <div class="barra" style="height:${(f.energia_disponible_wh / max) * 100}%"></div>
      <small>${f.hora}h</small>
    </div>`).join("");

  // Precargas
  document.getElementById("precargas").innerHTML = plan.precargas.map(p => `
    <li>${p.hora_descarga !== null ? `A las <b>${p.hora_descarga}:00</b>` : "❌ <b>Sin internet antes de la clase</b>"}
      → "${p.contenido}" en ${p.tablets.length} tablets</li>`).join("") || "<li>Todo descargado 👍</li>";
}

function pintarTablets(lista) {
  document.getElementById("tablets").innerHTML = lista.map(t => {
    const nivel = t.bateria >= 60 ? "alta" : t.bateria >= 30 ? "media" : "baja";
    return `<div class="tablet ${nivel}">${t.id}<br>${t.bateria}%</div>`;
  }).join("");
}

function pintarMensaje(texto) {
  document.getElementById("mensaje-ia").textContent = texto;
}

function pintarEstadoRed() {
  const el = document.getElementById("estado-red");
  el.textContent = sinInternet ? "📴 Sin internet" : "🌐 Con internet";
  el.classList.toggle("sin-red", sinInternet);
}

// --------------------------- BOTONES ----------------------------------
document.getElementById("btn-nublado").onclick = (e) => {
  diaNublado = !diaNublado;
  e.target.classList.toggle("activo", diaNublado);
  actualizar();
};

document.getElementById("btn-sin-red").onclick = (e) => {
  sinInternet = !sinInternet;
  e.target.classList.toggle("activo", sinInternet);
  e.target.textContent = sinInternet ? "🌐 Volver a conectar" : "📴 Cortar internet";
  actualizar();
};

document.getElementById("btn-recalcular").onclick = () => actualizar();

document.getElementById("form-pregunta").onsubmit = async (e) => {
  e.preventDefault();
  const pregunta = document.getElementById("pregunta").value.trim();
  if (!pregunta) return;
  const salida = document.getElementById("respuesta");
  if (sinInternet) {
    salida.textContent = "📴 Ahora no hay internet. Te responderé cuando vuelva la conexión.";
    return;
  }
  salida.textContent = "Pensando…";
  salida.textContent = await responderPregunta(pregunta, planActual, escuela);
};

// --------------------------- UTILIDAD ---------------------------------
async function leerJSON(ruta) {
  const r = await fetch(ruta);
  return r.json();
}

iniciar();

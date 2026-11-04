// =====================================================================
//  IA + MODO SIN CONEXIÓN — Persona 3
//
//  Esta IA tiene DOS niveles:
//
//  🟢 IA LOCAL (funciona SIEMPRE, también sin internet, dentro de la tablet)
//     1. Aprende cuánta batería gasta cada asignatura a partir del historial
//        de uso (suavizado exponencial + tendencia) y lo usa para planificar.
//     2. Redacta el mensaje para el profesor y propone alternativas pedagógicas.
//     3. Responde preguntas sencillas del profesor.
//
//  🔵 IA EN LA NUBE (Gemini) — SOLO cuando hay internet
//     Mejora la redacción y entiende preguntas libres. Si falla o no hay red,
//     la IA local responde. La demo nunca se queda en blanco.
//
//  Solo tocas ESTE archivo.
// =====================================================================

import { hayConexion } from "../shared/red.js";

// Lee la clave de config.js. Si ese archivo no existe, la app funciona igual (solo IA local).
let CONFIG = { GEMINI_API_KEY: "", GEMINI_MODELO: "gemini-2.5-flash" };
try {
  CONFIG = (await import("../config.js")).CONFIG;
} catch (e) {
  console.warn("No hay config.js: solo se usará la IA local.");
}

const CLAVE_HISTORIAL = "fotosintesis_historial";
const CLAVE_PLAN = "fotosintesis_plan";

// =====================================================================
// 1) APRENDER EL CONSUMO REAL DE CADA ASIGNATURA  (IA local)
// =====================================================================

// Historial: los datos de ejemplo + lo que se haya registrado en esta tablet
export function leerHistorial(historialInicial = []) {
  let propio = [];
  try { propio = JSON.parse(localStorage.getItem(CLAVE_HISTORIAL)) || []; } catch (e) {}
  return [...historialInicial, ...propio];
}

// Guardar lo que realmente gastó una clase (para que la IA siga aprendiendo)
export function registrarUso(asignatura, consumoPorHora) {
  let propio = [];
  try { propio = JSON.parse(localStorage.getItem(CLAVE_HISTORIAL)) || []; } catch (e) {}
  propio.push({ fecha: new Date().toISOString().slice(0, 10), asignatura, consumo_por_hora: consumoPorHora });
  try { localStorage.setItem(CLAVE_HISTORIAL, JSON.stringify(propio)); } catch (e) {}
}

// Modelo: suavizado exponencial doble (Holt). Aprende el nivel y la tendencia
// del consumo de cada asignatura y predice el de la próxima clase.
//   alfa = cuánto pesan los datos recientes, beta = cuánto pesa la tendencia
// Devuelve: { "Ciencias": { prevision: 52.3, muestras: 10, tendencia: 0.6 }, ... }
export function predecirConsumo(historial, alfa = 0.5, beta = 0.3) {
  const porAsignatura = {};
  [...historial]
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .forEach(r => (porAsignatura[r.asignatura] ??= []).push(r.consumo_por_hora));

  const resultado = {};
  for (const [asignatura, valores] of Object.entries(porAsignatura)) {
    let nivel = valores[0];
    let tendencia = valores.length > 1 ? valores[1] - valores[0] : 0;
    for (let i = 1; i < valores.length; i++) {
      const nivelAnterior = nivel;
      nivel = alfa * valores[i] + (1 - alfa) * (nivel + tendencia);
      tendencia = beta * (nivel - nivelAnterior) + (1 - beta) * tendencia;
    }
    resultado[asignatura] = {
      prevision: redondear(Math.max(0, nivel + tendencia)),
      muestras: valores.length,
      tendencia: redondear(tendencia)
    };
  }
  return resultado;
}

// Formato simple para el planificador: { "Ciencias": 52.3, ... }
export function consumoParaPlanificador(prediccion) {
  return Object.fromEntries(Object.entries(prediccion).map(([a, p]) => [a, p.prevision]));
}

// =====================================================================
// 2) EXPLICAR EL PLAN AL PROFESOR
//    Con internet y clave → Gemini. Si no → IA local. Nunca falla.
// =====================================================================
export async function explicarPlan(plan, escuela, contexto = {}, idioma = "español") {
  const local = explicacionLocal(plan, contexto);

  if (!hayConexion() || !hayClave()) {
    return { texto: local, origen: "local" };
  }
  const prompt = `
Eres un asistente para un profesor de una escuela rural en ${escuela.pais} con pocas tablets
y energía solar limitada. Explícale en ${idioma}, con frases cortas y sin tecnicismos, qué tiene
que hacer hoy y mañana. Máximo 6 frases. Si alguna clase no tendrá todas las tablets cargadas,
propón una alternativa pedagógica concreta (por ejemplo trabajar en grupos).

Datos del plan (JSON): ${JSON.stringify(plan)}
Consumo aprendido por asignatura: ${JSON.stringify(contexto.prediccion || {})}
Origen de la previsión del tiempo: ${contexto.prevision?.fuente}
`;
  try {
    return { texto: await preguntarAGemini(prompt), origen: "gemini" };
  } catch (e) {
    console.warn(e);
    return { texto: local, origen: "local" };
  }
}

// La IA local: redacta el mensaje a partir de los datos
function explicacionLocal(plan, contexto) {
  const lineas = [];
  const prev = contexto.prevision;

  // ¿De dónde sale la previsión?
  if (prev) {
    if (prev.fuente === "online") lineas.push("🌤️ Previsión del tiempo actualizada ahora mismo.");
    if (prev.fuente === "guardada") lineas.push(`🌤️ Sin internet: uso la previsión que guardé ${haceCuanto(prev.actualizada)}.`);
    if (prev.fuente === "estimada") lineas.push(`🌥️ La previsión guardada (${haceCuanto(prev.actualizada)}) ya no llega a mañana: la estimo con los últimos días. Conviene conectarse para actualizarla.`);
    if (prev.fuente === "ejemplo") lineas.push("🌥️ Todavía no he podido descargar ninguna previsión: uso un día soleado típico.");
  }

  // Energía de mañana
  const energia = plan.franjas.reduce((s, f) => s + f.energia_disponible_wh, 0);
  lineas.push(`☀️ Mañana el panel dará unos ${Math.round(energia)} Wh.`);

  // Clases
  plan.clases.forEach(c => {
    if (c.tablets_listas === c.tablets_total) {
      lineas.push(`✅ ${c.asignatura} (${c.hora}:00): las ${c.tablets_total} tablets estarán listas.`);
    } else if (c.tablets_listas === 0) {
      lineas.push(`❌ ${c.asignatura} (${c.hora}:00): ninguna tablet llegará cargada. Prepara la actividad en papel o en la pizarra.`);
    } else {
      const porGrupo = Math.ceil(c.tablets_total / c.tablets_listas);
      lineas.push(`⚠️ ${c.asignatura} (${c.hora}:00): solo ${c.tablets_listas} de ${c.tablets_total} tablets listas. Propuesta: grupos de ${porGrupo} alumnos por tablet, con un rol para cada uno (lector, escritor, portavoz).`);
    }
  });

  // Qué cargar primero
  const primeraCarga = plan.franjas.find(f => f.cargas.length > 0);
  if (primeraCarga) {
    const ids = primeraCarga.cargas.map(c => c.tablet);
    lineas.push(`🔌 Empieza a cargar a las ${primeraCarga.hora}:00 por: ${resumirIds(ids)}.`);
  }

  // Lo que la IA ha aprendido del consumo
  (contexto.diferencias || []).forEach(d => {
    lineas.push(`🧠 He aprendido que ${d.asignatura} gasta ${d.aprendido}% de batería por hora (el horario decía ${d.nominal}%). Ya lo tengo en cuenta.`);
  });

  // Descargas
  plan.precargas.forEach(p => {
    if (p.hora_descarga !== null) {
      lineas.push(`📥 Descarga "${p.contenido}" a las ${p.hora_descarga}:00 en ${p.tablets.length} tablets.`);
    } else {
      lineas.push(`❌ No habrá internet antes de la clase para descargar "${p.contenido}". Usa otro contenido ya descargado.`);
    }
  });

  return lineas.join("\n");
}

// =====================================================================
// 3) RESPONDER PREGUNTAS DEL PROFESOR
//    Con internet → Gemini. Sin internet → IA local por palabras clave.
// =====================================================================
export async function responderPregunta(pregunta, plan, escuela, contexto = {}) {
  if (hayConexion() && hayClave()) {
    const prompt = `
Eres un asistente para un profesor de una escuela con energía solar limitada en ${escuela.pais}.
Responde en 2-3 frases sencillas usando estos datos:
Plan: ${JSON.stringify(plan)}
Consumo aprendido: ${JSON.stringify(contexto.prediccion || {})}
Pregunta del profesor: ${pregunta}`;
    try {
      return { texto: await preguntarAGemini(prompt), origen: "gemini" };
    } catch (e) { /* si falla, contesta la IA local */ }
  }
  return { texto: respuestaLocal(pregunta, plan, contexto), origen: "local" };
}

function respuestaLocal(pregunta, plan, contexto) {
  const p = pregunta.toLowerCase();
  const horaMatch = p.match(/\b(\d{1,2})\s*(h|:00|horas)?\b/);
  const hora = horaMatch ? parseInt(horaMatch[1]) : null;

  // ¿Puedo poner un vídeo / usar tablets a las X?
  if (hora !== null && /(v[ií]deo|tablet|usar|poner|clase|actividad)/.test(p)) {
    const clase = plan.clases.find(c => c.hora === hora)
               ?? plan.clases.filter(c => c.hora <= hora).sort((a, b) => b.hora - a.hora)[0];
    if (!clase) return `A las ${hora}:00 no hay ninguna clase con tablets en el horario. Todas las tablets estarán libres para cargar.`;
    const esVideo = /v[ií]deo/.test(p);
    if (clase.tablets_listas === clase.tablets_total) {
      return `Sí. En ${clase.asignatura} (${clase.hora}:00) las ${clase.tablets_total} tablets estarán listas.` +
             (esVideo ? " Un vídeo gasta más batería: intenta que dure menos de 15 minutos." : "");
    }
    return `Con cuidado: en ${clase.asignatura} (${clase.hora}:00) solo ${clase.tablets_listas} de ${clase.tablets_total} tablets estarán listas.` +
           (esVideo ? " Mejor proyecta el vídeo en una sola tablet para toda la clase." : " Trabajad en grupos.");
  }

  // ¿Qué cargo primero?
  if (/(cargar|carga|primero|prioridad|enchuf)/.test(p)) {
    const f = plan.franjas.find(f => f.cargas.length > 0);
    return f ? `Empieza a las ${f.hora}:00 por ${resumirIds(f.cargas.map(c => c.tablet))}. Son las que tienen clase antes.`
             : "Ahora no hace falta cargar ninguna tablet.";
  }

  // ¿Qué tiempo hará? ¿Habrá sol?
  if (/(sol|tiempo|nublado|nube|lluvia|llover|energ)/.test(p)) {
    const energia = plan.franjas.reduce((s, f) => s + f.energia_disponible_wh, 0);
    const pico = plan.franjas.reduce((a, b) => (b.energia_disponible_wh > a.energia_disponible_wh ? b : a), plan.franjas[0]);
    return `Mañana el panel dará unos ${Math.round(energia)} Wh` + (pico ? `, con más sol hacia las ${pico.hora}:00.` : ".");
  }

  // ¿Qué tengo que descargar?
  if (/(descarg|contenido|internet)/.test(p)) {
    if (plan.precargas.length === 0) return "Todo el contenido de mañana ya está descargado.";
    return plan.precargas.map(x => x.hora_descarga !== null
      ? `"${x.contenido}" a las ${x.hora_descarga}:00 (${x.tablets.length} tablets)`
      : `"${x.contenido}" no se podrá descargar a tiempo`).join("; ") + ".";
  }

  // ¿Cuánto gasta una asignatura?
  const asignatura = Object.keys(contexto.prediccion || {}).find(a => p.includes(a.toLowerCase()));
  if (asignatura) {
    const pr = contexto.prediccion[asignatura];
    return `${asignatura} gasta de media ${pr.prevision}% de batería por hora (lo he aprendido de ${pr.muestras} clases).`;
  }

  return "Sin internet entiendo preguntas sobre: usar tablets o vídeos a una hora, qué cargar primero, el sol de mañana, qué descargar o cuánto gasta una asignatura.";
}

// =====================================================================
// 4) GUARDAR / RECUPERAR EL ÚLTIMO PLAN EN LA TABLET
// =====================================================================
export function guardarOffline(plan, mensaje) {
  try {
    localStorage.setItem(CLAVE_PLAN, JSON.stringify({ plan, mensaje, fecha: new Date().toISOString() }));
  } catch (e) { console.warn("No se pudo guardar", e); }
}

export function cargarOffline() {
  try { return JSON.parse(localStorage.getItem(CLAVE_PLAN)); } catch (e) { return null; }
}

// =====================================================================
// Ayudas
// =====================================================================
async function preguntarAGemini(texto) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODELO}:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
  const respuesta = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: texto }] }] })
  });
  if (!respuesta.ok) throw new Error("Error de Gemini: " + respuesta.status);
  const datos = await respuesta.json();
  return datos.candidates[0].content.parts[0].text;
}

function hayClave() {
  return CONFIG.GEMINI_API_KEY && !CONFIG.GEMINI_API_KEY.startsWith("PON_AQUI");
}

function haceCuanto(fechaISO) {
  if (!fechaISO) return "hace un tiempo";
  const minutos = Math.round((Date.now() - new Date(fechaISO)) / 60000);
  if (minutos < 2) return "hace un momento";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  return `hace ${Math.round(horas / 24)} días`;
}

function resumirIds(ids) {
  return ids.length > 6 ? `${ids.slice(0, 6).join(", ")} y ${ids.length - 6} más` : ids.join(", ");
}

function redondear(n) { return Math.round(n * 10) / 10; }

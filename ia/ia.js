// =====================================================================
//  IA + MODO SIN CONEXIÓN — Persona 3
//  1) Convierte el plan (números) en un mensaje claro para el profesor.
//  2) Responde preguntas del profesor.
//  3) Guarda todo en la tablet para que funcione sin internet.
//  Solo tocas ESTE archivo.
// =====================================================================

// Lee la clave de config.js. Si ese archivo no existe, la app funciona igual (sin IA).
let CONFIG = { GEMINI_API_KEY: "", GEMINI_MODELO: "gemini-2.5-flash" };
try {
  CONFIG = (await import("../config.js")).CONFIG;
} catch (e) {
  console.warn("No hay config.js: la IA usará mensajes de plantilla.");
}

// ---------------------------------------------------------------------
// LLAMADA BÁSICA A LA IA (Gemini de Google, tiene nivel gratuito)
// Le mandas un texto y te devuelve un texto. Nada más.
// ---------------------------------------------------------------------
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

// ---------------------------------------------------------------------
// 1) EXPLICAR EL PLAN AL PROFESOR
// ---------------------------------------------------------------------
export async function explicarPlan(plan, escuela, idioma = "español") {
  const prompt = `
Eres un asistente para un profesor de una escuela rural en ${escuela.pais} con pocas tablets
y energía solar limitada. Explícale en ${idioma}, con frases cortas y sin tecnicismos, qué tiene
que hacer hoy y mañana. Máximo 6 frases. Si alguna clase no tendrá todas las tablets cargadas,
propón una alternativa pedagógica (por ejemplo trabajar en grupos).

Datos del plan (JSON):
${JSON.stringify(plan)}
`;

  // Sin internet o sin clave → mensaje generado con plantilla (para que la demo nunca falle)
  if (!navigator.onLine || !hayClave()) {
    return mensajeSinIA(plan);
  }
  try {
    return await preguntarAGemini(prompt);
  } catch (e) {
    console.warn(e);
    return mensajeSinIA(plan);
  }
}

// ---------------------------------------------------------------------
// 2) RESPONDER UNA PREGUNTA DEL PROFESOR  (ej: "¿Puedo poner un vídeo a las 12?")
// ---------------------------------------------------------------------
export async function responderPregunta(pregunta, plan, escuela) {
  if (!navigator.onLine) return "Ahora no hay internet. Te responderé cuando vuelva la conexión.";
  if (!hayClave()) return "Falta configurar la clave de la IA en config.js.";
  const prompt = `
Eres un asistente para un profesor de una escuela con energía solar limitada en ${escuela.pais}.
Responde en 2-3 frases, sencillas, usando estos datos del plan de carga de tablets:
${JSON.stringify(plan)}

Pregunta del profesor: ${pregunta}
`;
  try {
    return await preguntarAGemini(prompt);
  } catch (e) {
    return "No he podido contactar con la IA ahora mismo.";
  }
}

// ---------------------------------------------------------------------
// 3) MODO SIN CONEXIÓN: guardar y recuperar en la propia tablet
//    (localStorage = un pequeño almacén del navegador que no se borra al cerrar)
// ---------------------------------------------------------------------
export function guardarOffline(plan, mensaje) {
  try {
    localStorage.setItem("fotosintesis", JSON.stringify({ plan, mensaje, fecha: new Date().toISOString() }));
  } catch (e) { console.warn("No se pudo guardar", e); }
}

export function cargarOffline() {
  try {
    return JSON.parse(localStorage.getItem("fotosintesis"));
  } catch (e) { return null; }
}

// ---------------------------------------------------------------------
// Mensaje "de emergencia" sin IA, a partir de los datos
// ---------------------------------------------------------------------
function mensajeSinIA(plan) {
  const lineas = [];
  plan.clases.forEach(c => {
    if (c.tablets_listas === c.tablets_total) {
      lineas.push(`✅ ${c.asignatura} (${c.hora}:00): las ${c.tablets_total} tablets estarán listas.`);
    } else {
      lineas.push(`⚠️ ${c.asignatura} (${c.hora}:00): solo ${c.tablets_listas} de ${c.tablets_total} tablets listas. Trabajad en grupos.`);
    }
  });
  plan.precargas.forEach(p => {
    if (p.hora_descarga !== null) {
      lineas.push(`📥 Descarga "${p.contenido}" a las ${p.hora_descarga}:00 en ${p.tablets.length} tablets.`);
    } else {
      lineas.push(`❌ No habrá internet para descargar "${p.contenido}" antes de su clase.`);
    }
  });
  return lineas.join("\n");
}

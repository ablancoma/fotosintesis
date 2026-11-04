// =====================================================================
//  PLANIFICADOR — Persona 2
//  Decide qué tablets cargar, a qué hora, y qué contenidos descargar.
//  Funciona igual con o sin internet (la previsión se guarda en la tablet).
//  Solo tocas ESTE archivo.
// =====================================================================

import { hayConexion } from "../shared/red.js";

// Previsión solar de ejemplo (si nunca ha habido internet).
// Radiación en W/m² para las horas 0..23 de un día soleado típico.
const PREVISION_EJEMPLO = [0,0,0,0,0,0,40,180,380,560,700,780,800,760,660,500,320,140,30,0,0,0,0,0];
const CLAVE_CACHE = "fotosintesis_prevision";

// ---------------------------------------------------------------------
// 1) PREVISIÓN DEL TIEMPO (Open-Meteo, gratis, sin registrarse)
//
//    CON internet  → descarga 7 días, los GUARDA en la tablet y devuelve mañana.
//    SIN internet  → usa lo último guardado. Si lo guardado ya no llega a mañana,
//                    estima mañana a partir de los últimos días que sí tiene.
//
//    Devuelve: { valores: [24 números W/m²], fuente, actualizada, dias_guardados }
//      fuente = "online" | "guardada" | "estimada" | "ejemplo"
// ---------------------------------------------------------------------
export async function obtenerPrevisionSolar(latitud, longitud) {
  if (hayConexion()) {
    try {
      await descargarYGuardarPrevision(latitud, longitud);
    } catch (error) {
      console.warn("No se pudo descargar la previsión, uso la guardada", error);
    }
  }
  return previsionDeManana(hayConexion());
}

async function descargarYGuardarPrevision(latitud, longitud) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitud}&longitude=${longitud}` +
              `&hourly=shortwave_radiation,cloud_cover&forecast_days=7&timezone=auto`;
  const respuesta = await fetch(url);
  if (!respuesta.ok) throw new Error("Open-Meteo respondió " + respuesta.status);
  const datos = await respuesta.json();
  const cache = {
    descargada: new Date().toISOString(),
    horas: datos.hourly.time,                       // ["2026-11-04T00:00", ...]
    radiacion: datos.hourly.shortwave_radiation,    // W/m²
    nubes: datos.hourly.cloud_cover                 // %
  };
  try { localStorage.setItem(CLAVE_CACHE, JSON.stringify(cache)); } catch (e) { /* sin espacio */ }
}

function leerCache() {
  try { return JSON.parse(localStorage.getItem(CLAVE_CACHE)); } catch (e) { return null; }
}

function previsionDeManana(recienDescargada) {
  const cache = leerCache();
  if (!cache) {
    return { valores: PREVISION_EJEMPLO, fuente: "ejemplo", actualizada: null, dias_guardados: 0 };
  }
  const manana = fechaManana();
  const inicio = cache.horas.findIndex(h => h.startsWith(manana));
  const diasGuardados = Math.floor(cache.horas.length / 24);

  // Caso normal: mañana está en lo guardado
  if (inicio !== -1 && inicio + 24 <= cache.radiacion.length) {
    return {
      valores: cache.radiacion.slice(inicio, inicio + 24),
      fuente: recienDescargada ? "online" : "guardada",
      actualizada: cache.descargada,
      dias_guardados: diasGuardados
    };
  }

  // Lo guardado es demasiado antiguo: estimamos mañana con la media de los
  // últimos 3 días guardados (lo más parecido que tenemos)
  const ultimos = Math.min(3, diasGuardados);
  const valores = new Array(24).fill(0);
  for (let d = diasGuardados - ultimos; d < diasGuardados; d++) {
    for (let h = 0; h < 24; h++) valores[h] += cache.radiacion[d * 24 + h] / ultimos;
  }
  return { valores, fuente: "estimada", actualizada: cache.descargada, dias_guardados: diasGuardados };
}

function fechaManana() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);   // "2026-11-05"
}

// ---------------------------------------------------------------------
// 2) CALCULAR EL PLAN
//    Entrada: tablets, horario y escuela (los JSON de shared/datos) + previsión solar
//             (el array de 24 valores) + consumoPrevisto (opcional, lo calcula la IA:
//             { "Ciencias": 47, ... } en % de batería por hora).
//    Salida: un objeto "plan" (ver README → formato del plan).
//
//    Regla (algoritmo "voraz", muy sencillo):
//      - Cada hora con sol tenemos X Wh de energía del panel.
//      - Repartimos esa energía primero entre las tablets que tienen clase
//        más pronto y aún no llegan a la batería mínima.
// ---------------------------------------------------------------------
export function calcularPlan(tablets, horario, escuela, previsionSolar, consumoPrevisto = {}) {
  // Si la IA ha aprendido el consumo real de una asignatura, usamos ese; si no, el del horario
  horario = horario.map(c => ({ ...c, consumo_por_hora: consumoPrevisto[c.asignatura] ?? c.consumo_por_hora }));

  const capacidad = escuela.capacidad_bateria_tablet_wh;   // Wh de una batería llena
  const maxPorHora = escuela.potencia_cargador_tablet_w;    // Wh que puede cargar una tablet en 1 hora

  // Copia de las baterías para ir simulando el día (en %)
  const bateria = {};
  tablets.forEach(t => bateria[t.id] = t.bateria);

  // ¿A qué hora es la primera clase de cada tablet?
  const primeraClase = {};
  horario.forEach(clase => {
    clase.tablets.forEach(id => {
      if (primeraClase[id] === undefined || clase.hora_inicio < primeraClase[id]) {
        primeraClase[id] = clase.hora_inicio;
      }
    });
  });

  const franjas = [];
  for (let hora = 0; hora < 24; hora++) {
    // Energía del panel en esta hora (Wh)
    let energia = escuela.panel_solar_wp * (previsionSolar[hora] / 1000) * escuela.eficiencia_panel;
    const energiaTotal = energia;
    const cargas = [];

    // Restar el consumo de las clases que empiezan a esta hora
    horario.filter(c => c.hora_inicio === hora).forEach(clase => {
      clase.tablets.forEach(id => {
        bateria[id] = Math.max(0, bateria[id] - clase.consumo_por_hora * clase.duracion_horas);
      });
    });

    // Tablets que conviene cargar: las que tienen alguna clase después de esta hora,
    // ordenadas por la que tiene clase antes.
    const candidatas = tablets
      .map(t => t.id)
      .filter(id => bateria[id] < 100)
      .filter(id => horario.some(c => c.tablets.includes(id) && c.hora_inicio > hora))
      .sort((a, b) => proximaClase(a, hora, horario) - proximaClase(b, hora, horario));

    for (const id of candidatas) {
      if (energia <= 0.5) break;
      const faltaWh = (100 - bateria[id]) / 100 * capacidad;
      const wh = Math.min(maxPorHora, faltaWh, energia);
      bateria[id] += wh / capacidad * 100;
      energia -= wh;
      cargas.push({ tablet: id, wh: redondear(wh) });
    }

    if (energiaTotal > 0) {
      franjas.push({ hora, energia_disponible_wh: redondear(energiaTotal), cargas });
    }
  }

  // ¿Llegará cada clase con las tablets suficientemente cargadas?
  // (volvemos a simular rápidamente hasta la hora de cada clase)
  const clases = horario.map(clase => {
    const bateriaAlEmpezar = simularHasta(clase.hora_inicio, tablets, horario, franjas, capacidad);
    const listas = clase.tablets.filter(id => bateriaAlEmpezar[id] >= escuela.bateria_minima_para_clase);
    return {
      id: clase.id,
      asignatura: clase.asignatura,
      hora: clase.hora_inicio,
      consumo_por_hora: clase.consumo_por_hora,
      tablets_listas: listas.length,
      tablets_total: clase.tablets.length,
      tablets_no_listas: clase.tablets.filter(id => !listas.includes(id))
    };
  });

  // ¿Qué contenidos hay que descargar y cuándo? (en la primera hora con internet antes de la clase)
  const precargas = [];
  horario.forEach(clase => {
    const faltan = clase.tablets.filter(id => {
      const t = tablets.find(x => x.id === id);
      return !t.contenidos_descargados.includes(clase.contenido);
    });
    if (faltan.length > 0) {
      const horaRed = escuela.horas_con_internet.find(h => h < clase.hora_inicio);
      precargas.push({
        contenido: clase.contenido,
        tablets: faltan,
        hora_descarga: horaRed ?? null,   // null = no hay internet antes de la clase
        para_clase: clase.id
      });
    }
  });

  return { franjas, clases, precargas };
}

// ------------------------- funciones de ayuda -------------------------
function proximaClase(id, hora, horario) {
  const siguientes = horario.filter(c => c.tablets.includes(id) && c.hora_inicio > hora);
  return Math.min(...siguientes.map(c => c.hora_inicio));
}

function simularHasta(horaLimite, tablets, horario, franjas, capacidad) {
  const bateria = {};
  tablets.forEach(t => bateria[t.id] = t.bateria);
  for (let hora = 0; hora < horaLimite; hora++) {
    horario.filter(c => c.hora_inicio === hora).forEach(c =>
      c.tablets.forEach(id => bateria[id] = Math.max(0, bateria[id] - c.consumo_por_hora * c.duracion_horas)));
    const franja = franjas.find(f => f.hora === hora);
    if (franja) franja.cargas.forEach(c => bateria[c.tablet] += c.wh / capacidad * 100);
  }
  return bateria;
}

function redondear(n) { return Math.round(n * 10) / 10; }

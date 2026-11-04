// =====================================================================
//  PLANIFICADOR — Persona 2
//  Decide qué tablets cargar, a qué hora, y qué contenidos descargar.
//  No es IA: son reglas y cálculos. Solo tocas ESTE archivo.
// =====================================================================

// Previsión solar de ejemplo (por si no hay internet o falla la API).
// Radiación en W/m² para las horas 0..23 de mañana.
const PREVISION_EJEMPLO = [0,0,0,0,0,0,40,180,380,560,700,780,800,760,660,500,320,140,30,0,0,0,0,0];

// ---------------------------------------------------------------------
// 1) PEDIR EL TIEMPO A OPEN-METEO (gratis, sin registrarse)
//    Devuelve un array de 24 números: radiación solar de mañana, hora a hora.
// ---------------------------------------------------------------------
export async function obtenerPrevisionSolar(latitud, longitud) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitud}&longitude=${longitud}` +
              `&hourly=shortwave_radiation&forecast_days=2&timezone=auto`;
  try {
    const respuesta = await fetch(url);
    const datos = await respuesta.json();
    // La API da 48 horas (hoy + mañana). Nos quedamos con las 24 de mañana.
    return datos.hourly.shortwave_radiation.slice(24, 48);
  } catch (error) {
    console.warn("No se pudo leer Open-Meteo, uso la previsión de ejemplo", error);
    return PREVISION_EJEMPLO;
  }
}

// ---------------------------------------------------------------------
// 2) CALCULAR EL PLAN
//    Entrada: tablets, horario y escuela (los JSON de shared/datos) + previsión solar.
//    Salida: un objeto "plan" (ver README → formato del plan).
//
//    Regla (algoritmo "voraz", muy sencillo):
//      - Cada hora con sol tenemos X Wh de energía del panel.
//      - Repartimos esa energía primero entre las tablets que tienen clase
//        más pronto y aún no llegan a la batería mínima.
// ---------------------------------------------------------------------
export function calcularPlan(tablets, horario, escuela, previsionSolar) {
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

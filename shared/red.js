// =====================================================================
//  ESTADO DE LA RED — compartido por todas las partes
//  hayConexion() dice si hay internet de verdad Y si el simulador no lo ha "cortado".
// =====================================================================

let cortadoPorSimulador = false;

export function hayConexion() {
  return navigator.onLine && !cortadoPorSimulador;
}

export function simularSinConexion(cortar) {
  cortadoPorSimulador = cortar;
}

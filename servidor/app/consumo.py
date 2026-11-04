"""
APRENDER EL CONSUMO REAL DE CADA TIPO DE ACTIVIDAD

1) MEDIR: cuando acaba una clase, miramos las tablets que se descargaron durante esa
   franja (sin estar enchufadas) y calculamos cuánto % por hora gastaron.
2) APRENDER: mezclamos el valor estimado por defecto con lo medido. Cuantas más clases
   medidas, más confianza en lo aprendido:

       previsión = defecto · 3/(n+3)  +  media_medida · n/(n+3)

   Con 0 clases manda el valor por defecto; con 3, mitad y mitad; con 10, casi todo lo aprendido.
"""
from datetime import date, datetime, timedelta

PESO_DEFECTO = 3          # "cuántas clases vale" el valor por defecto
DESCARGA_MINIMA = 2.0     # %/h: por debajo consideramos que la tablet no se estaba usando


def prediccion_consumo(con, config: dict) -> dict:
    """Devuelve {actividad: {defecto, medido, muestras, prevision}}"""
    resultado = {}
    for actividad, defecto in config["consumo_defecto"].items():
        valores = [f[0] for f in con.execute(
            "SELECT pct_hora FROM consumos WHERE actividad = ? ORDER BY fecha DESC LIMIT 20", (actividad,))]
        n = len(valores)
        medido = sum(valores) / n if n else None
        prevision = defecto if n == 0 else (defecto * PESO_DEFECTO + medido * n) / (PESO_DEFECTO + n)
        resultado[actividad] = {
            "defecto": defecto,
            "medido": round(medido, 1) if medido is not None else None,
            "muestras": n,
            "prevision": round(prevision, 1),
        }
    return resultado


def medir_clases_terminadas(con, ahora: datetime | None = None) -> int:
    """Revisa las clases de hoy que ya han terminado y guarda su consumo real. Devuelve cuántas midió."""
    ahora = ahora or datetime.now()
    hoy = ahora.date().isoformat()
    medidas = 0
    for clase in con.execute("SELECT * FROM clases").fetchall():
        inicio = datetime.combine(ahora.date(), datetime.strptime(clase["hora_inicio"], "%H:%M").time())
        fin = inicio + timedelta(minutes=clase["duracion_min"])
        if fin > ahora:
            continue
        if con.execute("SELECT 1 FROM consumos WHERE fecha = ? AND clase_id = ?", (hoy, clase["id"])).fetchone():
            continue

        descargas = []
        for (tablet_id,) in con.execute("SELECT id FROM tablets"):
            antes = _lectura_cercana(con, tablet_id, inicio)
            despues = _lectura_cercana(con, tablet_id, fin)
            if not antes or not despues or antes["cargando"] or despues["cargando"]:
                continue
            horas = (datetime.fromisoformat(despues["ts"]) - datetime.fromisoformat(antes["ts"])).total_seconds() / 3600
            if horas <= 0.2:
                continue
            pct_hora = (antes["bateria"] - despues["bateria"]) / horas
            if pct_hora >= DESCARGA_MINIMA:
                descargas.append(pct_hora)

        if descargas:
            con.execute("INSERT OR IGNORE INTO consumos(fecha, clase_id, actividad, pct_hora) VALUES(?,?,?,?)",
                        (hoy, clase["id"], clase["actividad"], round(sum(descargas) / len(descargas), 1)))
            medidas += 1
    return medidas


def _lectura_cercana(con, tablet_id: str, momento: datetime, margen_min: int = 20):
    """La lectura más cercana a 'momento' (como mucho a 20 minutos)."""
    desde = (momento - timedelta(minutes=margen_min)).isoformat(timespec="seconds")
    hasta = (momento + timedelta(minutes=margen_min)).isoformat(timespec="seconds")
    candidatas = con.execute(
        "SELECT * FROM lecturas WHERE tablet_id = ? AND ts BETWEEN ? AND ?", (tablet_id, desde, hasta)).fetchall()
    if not candidatas:
        return None
    return min(candidatas, key=lambda f: abs((datetime.fromisoformat(f["ts"]) - momento).total_seconds()))

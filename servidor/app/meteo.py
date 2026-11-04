"""
PREVISIÓN METEOROLÓGICA (Open-Meteo: gratis y sin clave)

Dos formas de recibirla:
  - El SERVIDOR la descarga si tiene internet         → descargar_open_meteo()
  - El MÓVIL DEL PROFESOR la descarga con sus datos   → guardar_prevision(origen="profesor")
    y se la envía al llegar al wifi de la escuela.

Siempre se guarda la última. Si la guardada ya no llega a mañana, se estima con los últimos días.
"""
import json
from datetime import date, datetime, timedelta

import httpx

# Día soleado típico (W/m², horas 0..23) por si nunca ha llegado ninguna previsión
DIA_TIPICO = [0, 0, 0, 0, 0, 0, 40, 180, 380, 560, 700, 780, 800, 760, 660, 500, 320, 140, 30, 0, 0, 0, 0, 0]


def url_open_meteo(lat: float, lon: float) -> str:
    return (f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}"
            f"&hourly=shortwave_radiation&forecast_days=7&timezone=auto")


def descargar_open_meteo(con, lat: float, lon: float) -> dict:
    respuesta = httpx.get(url_open_meteo(lat, lon), timeout=15)
    respuesta.raise_for_status()
    datos = respuesta.json()["hourly"]
    guardar_prevision(con, datos["time"], datos["shortwave_radiation"], origen="servidor")
    return resumen(con)


def guardar_prevision(con, horas: list[str], radiacion: list[float], origen: str) -> None:
    con.execute(
        "INSERT INTO prevision(id, descargada, origen, horas, radiacion) VALUES(1, ?, ?, ?, ?) "
        "ON CONFLICT(id) DO UPDATE SET descargada=excluded.descargada, origen=excluded.origen, "
        "horas=excluded.horas, radiacion=excluded.radiacion",
        (datetime.now().isoformat(timespec="seconds"), origen, json.dumps(horas), json.dumps(radiacion)),
    )


def prevision_de_manana(con, dia: date | None = None) -> dict:
    """Devuelve {valores: [24 W/m²], fuente, origen, descargada, dias_guardados}"""
    dia = dia or (date.today() + timedelta(days=1))
    fila = con.execute("SELECT * FROM prevision WHERE id = 1").fetchone()
    if not fila:
        return {"valores": DIA_TIPICO, "fuente": "tipico", "origen": None, "descargada": None, "dias_guardados": 0}

    horas, radiacion = json.loads(fila["horas"]), json.loads(fila["radiacion"])
    dias_guardados = len(horas) // 24
    base = {"origen": fila["origen"], "descargada": fila["descargada"], "dias_guardados": dias_guardados}

    clave = dia.isoformat()
    inicio = next((i for i, h in enumerate(horas) if h.startswith(clave)), None)
    if inicio is not None and inicio + 24 <= len(radiacion):
        return {**base, "valores": [r or 0 for r in radiacion[inicio:inicio + 24]], "fuente": "prevision"}

    # La guardada no llega a ese día: media de los últimos 3 días que tenemos
    ultimos = min(3, dias_guardados)
    valores = [0.0] * 24
    for d in range(dias_guardados - ultimos, dias_guardados):
        for h in range(24):
            valores[h] += (radiacion[d * 24 + h] or 0) / ultimos
    return {**base, "valores": valores, "fuente": "estimada"}


def resumen(con) -> dict:
    p = prevision_de_manana(con)
    return {k: v for k, v in p.items() if k != "valores"} | {"radiacion_manana": p["valores"]}


MAX_DIAS_PLAN = 8


def radiacion_horizonte(con, hoy: date | None = None) -> tuple[dict, dict]:
    """
    Radiación de cada día desde HOY hasta el último día de la previsión guardada.
    Devuelve ({date: [24 W/m²]}, info). Los días que falten se estiman con la media de los últimos 3.
    Sin ninguna previsión: hoy y mañana con un día soleado típico.
    """
    hoy = hoy or date.today()
    fila = con.execute("SELECT * FROM prevision WHERE id = 1").fetchone()
    if not fila:
        return ({hoy: DIA_TIPICO, hoy + timedelta(days=1): DIA_TIPICO},
                {"fuente": "tipico", "origen": None, "descargada": None, "hasta": None, "dias_guardados": 0})

    horas, radiacion = json.loads(fila["horas"]), json.loads(fila["radiacion"])
    por_dia = {}
    for i in range(0, len(horas) - 23, 24):
        por_dia[date.fromisoformat(horas[i][:10])] = [r or 0 for r in radiacion[i:i + 24]]
    hasta = max(por_dia)
    manana = hoy + timedelta(days=1)
    ultimo = min(max(hasta, manana), hoy + timedelta(days=MAX_DIAS_PLAN - 1))

    ultimos = [por_dia[d] for d in sorted(por_dia)[-3:]]
    media = [sum(v[h] for v in ultimos) / len(ultimos) for h in range(24)]
    resultado, estimados = {}, 0
    d = hoy
    while d <= ultimo:
        if d in por_dia:
            resultado[d] = por_dia[d]
        else:
            resultado[d] = media
            estimados += d >= manana
        d += timedelta(days=1)
    info = {"fuente": "estimada" if manana not in por_dia else "prevision", "origen": fila["origen"],
            "descargada": fila["descargada"], "hasta": hasta.isoformat(), "dias_guardados": len(por_dia),
            "dias_estimados": estimados}
    return resultado, info

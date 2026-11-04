"""
SERVIDOR FOTOSÍNTESIS — API REST (FastAPI)

Arrancar:   uvicorn app.main:app --host 0.0.0.0 --port 8000
Documentación interactiva (probar todo desde el navegador):  http://<IP>:8000/docs
"""
import json
import socket
from datetime import date, datetime, timedelta

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from . import consumo as consumo_mod
from . import ia, meteo
from .datos_demo import cargar_si_vacio
from .db import conectar, crear_tablas, filas, guardar_config, leer_config
from .planificador import calcular_plan

app = FastAPI(title="Fotosíntesis", description="Planificador de carga de tablets con energía solar",
              version="1.0")

crear_tablas()
with conectar() as _con:
    cargar_si_vacio(_con)

MINUTOS_SIN_DATOS = 40        # si una tablet no envía nada en este tiempo, se marca "sin datos"
ACTIVIDADES = {"lectura", "ejercicios", "video", "juego"}


# ============================================================================
#  Modelos de datos (lo que viaja en JSON)
# ============================================================================
class Registro(BaseModel):
    device_id: str = Field(..., examples=["a1b2c3d4"])
    modelo: str | None = Field(None, examples=["Samsung Galaxy Tab A8"])
    simulada: bool = False


class Lectura(BaseModel):
    tablet_id: str = Field(..., examples=["T01"])
    bateria: float = Field(..., ge=0, le=100)
    cargando: bool
    temperatura: float | None = None
    ts: datetime | None = None          # si no viene, se usa la hora del servidor


class Clase(BaseModel):
    asignatura: str
    hora_inicio: str = Field(..., pattern=r"^\d{2}:\d{2}$", examples=["09:00"])
    duracion_min: int = Field(..., gt=0, le=480)
    actividad: str = Field(..., examples=["ejercicios"])
    n_tablets: int = Field(..., gt=0)


class Prevision(BaseModel):
    horas: list[str]                    # ["2026-11-05T00:00", ...] como las da Open-Meteo
    radiacion: list[float | None]       # W/m² (Open-Meteo a veces manda null)


class Pregunta(BaseModel):
    pregunta: str


# ============================================================================
#  Información del servidor
# ============================================================================
@app.get("/api/info", tags=["Servidor"])
def info():
    """Nombre de la escuela y dirección que hay que escribir en las tablets."""
    with conectar() as con:
        cfg = leer_config(con)
    return {"escuela": cfg["escuela_nombre"], "pais": cfg["pais"], "ip": ip_local(), "puerto": 8000,
            "hora_servidor": datetime.now().isoformat(timespec="seconds")}


# ============================================================================
#  Tablets y lecturas de batería
# ============================================================================
@app.post("/api/tablets/registro", tags=["Tablets"])
def registrar_tablet(r: Registro):
    """La app de la tablet llama aquí la primera vez. Devuelve su nombre (T01, T02...)."""
    with conectar() as con:
        fila = con.execute("SELECT id FROM tablets WHERE device_id = ?", (r.device_id,)).fetchone()
        if fila:
            return {"tablet_id": fila["id"], "nueva": False}
        n = con.execute("SELECT COUNT(*) FROM tablets").fetchone()[0] + 1
        tablet_id = f"T{n:02d}"
        while con.execute("SELECT 1 FROM tablets WHERE id = ?", (tablet_id,)).fetchone():
            n += 1
            tablet_id = f"T{n:02d}"
        con.execute("INSERT INTO tablets(id, device_id, modelo, simulada) VALUES(?,?,?,?)",
                    (tablet_id, r.device_id, r.modelo, int(r.simulada)))
        return {"tablet_id": tablet_id, "nueva": True}


@app.post("/api/lecturas", tags=["Tablets"])
def recibir_lecturas(lecturas: list[Lectura]):
    """Una o varias lecturas (la tablet envía de golpe las que guardó si no había conexión)."""
    with conectar() as con:
        ids = {f[0] for f in con.execute("SELECT id FROM tablets")}
        guardadas = 0
        for l in lecturas:
            if l.tablet_id not in ids:
                raise HTTPException(404, f"Tablet {l.tablet_id} no registrada")
            ts = (l.ts or datetime.now()).replace(tzinfo=None).isoformat(timespec="seconds")
            con.execute("INSERT INTO lecturas(tablet_id, bateria, cargando, temperatura, ts) VALUES(?,?,?,?,?)",
                        (l.tablet_id, l.bateria, int(l.cargando), l.temperatura, ts))
            guardadas += 1
        consumo_mod.medir_clases_terminadas(con)
    return {"guardadas": guardadas}


@app.get("/api/tablets", tags=["Tablets"])
def listar_tablets():
    """Panel del profesor: última lectura de cada tablet."""
    with conectar() as con:
        return estado_tablets(con)


@app.get("/api/tablets/{tablet_id}/historial", tags=["Tablets"])
def historial_tablet(tablet_id: str, horas: int = 24):
    desde = (datetime.now() - timedelta(hours=horas)).isoformat(timespec="seconds")
    with conectar() as con:
        return filas(con, "SELECT bateria, cargando, temperatura, ts FROM lecturas WHERE tablet_id = ? AND ts >= ? "
                          "ORDER BY ts", (tablet_id, desde))


def estado_tablets(con) -> list[dict]:
    ahora = datetime.now()
    resultado = []
    for t in filas(con, "SELECT id, modelo, simulada FROM tablets ORDER BY id"):
        ultima = con.execute("SELECT bateria, cargando, temperatura, ts FROM lecturas WHERE tablet_id = ? "
                             "ORDER BY ts DESC LIMIT 1", (t["id"],)).fetchone()
        if ultima:
            minutos = (ahora - datetime.fromisoformat(ultima["ts"])).total_seconds() / 60
            t.update(bateria=ultima["bateria"], cargando=bool(ultima["cargando"]), temperatura=ultima["temperatura"],
                     ultima_lectura=ultima["ts"], minutos_desde_lectura=round(minutos),
                     estado="sin_datos" if minutos > MINUTOS_SIN_DATOS else "ok")
        else:
            t.update(bateria=None, cargando=False, temperatura=None, ultima_lectura=None,
                     minutos_desde_lectura=None, estado="sin_datos")
        t["simulada"] = bool(t["simulada"])
        resultado.append(t)
    return resultado


# ============================================================================
#  Horario
# ============================================================================
@app.get("/api/clases", tags=["Horario"])
def listar_clases():
    with conectar() as con:
        return filas(con, "SELECT * FROM clases ORDER BY hora_inicio")


@app.post("/api/clases", tags=["Horario"])
def crear_clase(c: Clase):
    _validar_actividad(c.actividad)
    with conectar() as con:
        invalidar_plan(con)
        cur = con.execute("INSERT INTO clases(asignatura, hora_inicio, duracion_min, actividad, n_tablets) "
                          "VALUES(?,?,?,?,?)", (c.asignatura, c.hora_inicio, c.duracion_min, c.actividad, c.n_tablets))
        return {"id": cur.lastrowid, **c.model_dump()}


@app.put("/api/clases/{clase_id}", tags=["Horario"])
def editar_clase(clase_id: int, c: Clase):
    _validar_actividad(c.actividad)
    with conectar() as con:
        invalidar_plan(con)
        cur = con.execute("UPDATE clases SET asignatura=?, hora_inicio=?, duracion_min=?, actividad=?, n_tablets=? "
                          "WHERE id=?", (c.asignatura, c.hora_inicio, c.duracion_min, c.actividad, c.n_tablets, clase_id))
        if cur.rowcount == 0:
            raise HTTPException(404, "Clase no encontrada")
        return {"id": clase_id, **c.model_dump()}


@app.delete("/api/clases/{clase_id}", tags=["Horario"])
def borrar_clase(clase_id: int):
    with conectar() as con:
        invalidar_plan(con)
        con.execute("DELETE FROM clases WHERE id = ?", (clase_id,))
    return {"borrada": clase_id}


def _validar_actividad(actividad: str):
    if actividad not in ACTIVIDADES:
        raise HTTPException(422, f"Actividad debe ser una de: {', '.join(sorted(ACTIVIDADES))}")


# ============================================================================
#  Configuración de la escuela (valores estimados)
# ============================================================================
@app.get("/api/config", tags=["Configuración"])
def ver_config():
    with conectar() as con:
        return leer_config(con)


@app.patch("/api/config", tags=["Configuración"])
def cambiar_config(cambios: dict):
    """Cambia solo los valores enviados, p. ej. {"bateria_sistema_activa": false}."""
    with conectar() as con:
        actuales = leer_config(con)
        desconocidas = set(cambios) - set(actuales)
        if desconocidas:
            raise HTTPException(422, f"Claves desconocidas: {', '.join(desconocidas)}")
        guardar_config(con, cambios)
        invalidar_plan(con)
        return leer_config(con)


# ============================================================================
#  Previsión meteorológica
# ============================================================================
@app.get("/api/prevision", tags=["Previsión"])
def ver_prevision():
    with conectar() as con:
        return meteo.resumen(con)


@app.post("/api/prevision", tags=["Previsión"])
def recibir_prevision(p: Prevision):
    """El móvil del profesor envía la previsión que descargó con sus datos móviles."""
    if len(p.horas) != len(p.radiacion) or len(p.horas) < 24:
        raise HTTPException(422, "horas y radiacion deben tener la misma longitud (mínimo 24)")
    with conectar() as con:
        meteo.guardar_prevision(con, p.horas, [r or 0 for r in p.radiacion], origen="profesor")
        invalidar_plan(con)
        return meteo.resumen(con)


@app.post("/api/prevision/actualizar", tags=["Previsión"])
def actualizar_prevision():
    """El servidor intenta descargarla él mismo (solo si tiene internet)."""
    with conectar() as con:
        cfg = leer_config(con)
        try:
            resumen = meteo.descargar_open_meteo(con, cfg["latitud"], cfg["longitud"])
            invalidar_plan(con)
            return resumen
        except Exception as e:
            raise HTTPException(503, f"Sin conexión con Open-Meteo: {e}")


# ============================================================================
#  Plan de carga e instrucciones
# ============================================================================
@app.get("/api/plan", tags=["Plan"])
def ver_plan(nublado: bool = False):
    """
    Plan de mañana. Se guarda ("congela") para que las instrucciones no cambien mientras el profesor
    las sigue. Se recalcula al pulsar Recalcular o si cambian horario, configuración o previsión.
    ?nublado=true simula un día con un 30% del sol previsto (para la demo).
    """
    with conectar() as con:
        return _plan_guardado_o_nuevo(con, nublado)


@app.post("/api/plan/recalcular", tags=["Plan"])
def recalcular_plan(nublado: bool = False):
    """Vuelve a calcular el plan con las baterías actuales."""
    with conectar() as con:
        invalidar_plan(con)
        return _plan_guardado_o_nuevo(con, nublado)


@app.post("/api/instrucciones/{instruccion_id}/hecha", tags=["Plan"])
def marcar_hecha(instruccion_id: str):
    with conectar() as con:
        con.execute("INSERT OR IGNORE INTO instrucciones_hechas(instruccion_id) VALUES(?)", (instruccion_id,))
    return {"hecha": instruccion_id}


@app.delete("/api/instrucciones/{instruccion_id}/hecha", tags=["Plan"])
def desmarcar_hecha(instruccion_id: str):
    with conectar() as con:
        con.execute("DELETE FROM instrucciones_hechas WHERE instruccion_id = ?", (instruccion_id,))
    return {"pendiente": instruccion_id}


@app.get("/api/consumo", tags=["Plan"])
def ver_consumo():
    """Consumo por tipo de actividad: estimado, medido y lo que usa el plan."""
    with conectar() as con:
        return consumo_mod.prediccion_consumo(con, leer_config(con))


def invalidar_plan(con) -> None:
    con.execute("DELETE FROM plan_guardado")


def _plan_guardado_o_nuevo(con, nublado: bool) -> dict:
    fila = con.execute("SELECT * FROM plan_guardado WHERE id = 1").fetchone()
    manana = (date.today() + timedelta(days=1)).isoformat()
    if fila and bool(fila["nublado"]) == nublado:
        plan = json.loads(fila["datos"])
        if plan["dia"] == manana:
            hechas = {f[0] for f in con.execute("SELECT instruccion_id FROM instrucciones_hechas")}
            for i in plan["instrucciones"]:
                i["hecha"] = i["id"] in hechas
            plan["calculado"] = fila["creado"]
            return plan
    plan = _plan_completo(con, nublado)
    plan["calculado"] = datetime.now().isoformat(timespec="seconds")
    con.execute("INSERT INTO plan_guardado(id, creado, nublado, datos) VALUES(1, ?, ?, ?) ON CONFLICT(id) DO UPDATE "
                "SET creado=excluded.creado, nublado=excluded.nublado, datos=excluded.datos",
                (plan["calculado"], int(nublado), json.dumps(plan, ensure_ascii=False)))
    return plan


def _plan_completo(con, nublado: bool = False) -> dict:
    cfg = leer_config(con)
    tablets = [{"id": t["id"], "bateria": t["bateria"]} for t in estado_tablets(con) if t["bateria"] is not None]
    prevision = meteo.prevision_de_manana(con)
    consumo = consumo_mod.prediccion_consumo(con, cfg)
    hechas = {f[0] for f in con.execute("SELECT instruccion_id FROM instrucciones_hechas")}
    plan = calcular_plan(tablets, filas(con, "SELECT * FROM clases"), cfg, prevision["valores"], consumo,
                         factor_sol=0.3 if nublado else 1.0, hechas=hechas)
    plan["prevision"] = {k: v for k, v in prevision.items() if k != "valores"}
    plan["consumo"] = consumo
    plan["nublado_simulado"] = nublado
    return plan


# ============================================================================
#  Asistente de IA
# ============================================================================
@app.get("/api/asistente/resumen", tags=["Asistente"])
def resumen_asistente(nublado: bool = False):
    with conectar() as con:
        plan = _plan_guardado_o_nuevo(con, nublado)
    return ia.resumen_del_plan(plan, plan["prevision"], plan["consumo"])


@app.post("/api/asistente/preguntar", tags=["Asistente"])
def preguntar(p: Pregunta, nublado: bool = False):
    with conectar() as con:
        plan = _plan_guardado_o_nuevo(con, nublado)
    return ia.responder(p.pregunta, plan, plan["prevision"], plan["consumo"])


# ============================================================================
def ip_local() -> str:
    """IP del servidor en la red local (la que hay que escribir en las tablets)."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))       # no envía nada, solo elige la interfaz de red
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "127.0.0.1"

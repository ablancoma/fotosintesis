"""
BASE DE DATOS (SQLite)
Un único archivo: servidor/fotosintesis.db. No hay que instalar nada.
"""
import json
import sqlite3
from pathlib import Path

RUTA_DB = Path(__file__).resolve().parent.parent / "fotosintesis.db"

ESQUEMA = """
CREATE TABLE IF NOT EXISTS tablets (
    id          TEXT PRIMARY KEY,          -- T01, T02...
    device_id   TEXT UNIQUE NOT NULL,      -- identificador interno del dispositivo
    modelo      TEXT,
    simulada    INTEGER DEFAULT 0,
    registrada  TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lecturas (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    tablet_id   TEXT NOT NULL REFERENCES tablets(id),
    bateria     REAL NOT NULL,             -- %
    cargando    INTEGER NOT NULL,          -- 0/1
    temperatura REAL,                      -- ºC
    ts          TEXT NOT NULL              -- fecha y hora ISO de la lectura
);
CREATE INDEX IF NOT EXISTS idx_lecturas_tablet_ts ON lecturas(tablet_id, ts);

CREATE TABLE IF NOT EXISTS clases (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    asignatura   TEXT NOT NULL,
    hora_inicio  TEXT NOT NULL,            -- "09:00"
    duracion_min INTEGER NOT NULL,
    actividad    TEXT NOT NULL,            -- lectura | ejercicios | video | juego
    n_tablets    INTEGER NOT NULL,
    fecha        TEXT                      -- "2026-11-06" = solo ese día · NULL = todos los días laborables
);

CREATE TABLE IF NOT EXISTS consumos (       -- consumo real medido por clase (para aprender)
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha      TEXT NOT NULL,
    clase_id   INTEGER,
    actividad  TEXT NOT NULL,
    pct_hora   REAL NOT NULL,
    UNIQUE(fecha, clase_id)
);

CREATE TABLE IF NOT EXISTS prevision (
    id          INTEGER PRIMARY KEY CHECK (id = 1),   -- solo guardamos la última
    descargada  TEXT NOT NULL,
    origen      TEXT NOT NULL,             -- servidor | profesor
    horas       TEXT NOT NULL,             -- JSON ["2026-11-05T00:00", ...]
    radiacion   TEXT NOT NULL              -- JSON [W/m², ...]
);

CREATE TABLE IF NOT EXISTS instrucciones_hechas (
    instruccion_id TEXT PRIMARY KEY,
    hecha_en       TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS plan_guardado (  -- el plan se "congela" hasta que el profesor recalcula
    id        INTEGER PRIMARY KEY CHECK (id = 1),
    creado    TEXT NOT NULL,
    nublado   INTEGER NOT NULL,
    datos     TEXT NOT NULL                -- JSON del plan
);

CREATE TABLE IF NOT EXISTS config (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL                    -- JSON
);
"""


def conectar() -> sqlite3.Connection:
    con = sqlite3.connect(RUTA_DB, check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


def crear_tablas() -> None:
    with conectar() as con:
        con.executescript(ESQUEMA)
        # Bases de datos de versiones anteriores: añadir la columna fecha si falta
        columnas = {f["name"] for f in con.execute("PRAGMA table_info(clases)")}
        if "fecha" not in columnas:
            con.execute("ALTER TABLE clases ADD COLUMN fecha TEXT")


def clases_del_dia(con, fecha) -> list[dict]:
    """Clases de un día: las de esa fecha + las que se repiten todos los días laborables (lunes a viernes)."""
    laborable = fecha.weekday() < 5
    return filas(con, "SELECT * FROM clases WHERE fecha = ? OR (fecha IS NULL AND ?) ORDER BY hora_inicio",
                 (fecha.isoformat(), int(laborable)))


def filas(con, sql, params=()):
    return [dict(f) for f in con.execute(sql, params).fetchall()]


def leer_config(con) -> dict:
    """Configuración guardada. Las claves nuevas que no estén guardadas toman su valor por defecto."""
    from .datos_demo import CONFIG_INICIAL
    guardada = {f["clave"]: json.loads(f["valor"]) for f in con.execute("SELECT clave, valor FROM config")}
    return {**CONFIG_INICIAL, **guardada}


def guardar_config(con, valores: dict) -> None:
    for clave, valor in valores.items():
        con.execute(
            "INSERT INTO config(clave, valor) VALUES(?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor",
            (clave, json.dumps(valor, ensure_ascii=False)),
        )

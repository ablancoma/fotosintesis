"""
DATOS INICIALES DE LA DEMO
Se cargan solos la primera vez que arranca el servidor (si la base de datos está vacía).
Todos los valores son ESTIMADOS y se pueden cambiar desde la app del profesor.
"""
import random
from datetime import date, timedelta

CONFIG_INICIAL = {
    "escuela_nombre": "Escuela Primaria de Chiwamba",
    "pais": "Malawi",
    "latitud": -13.9626,
    "longitud": 33.7741,
    # Instalación solar
    "panel_solar_wp": 400,            # potencia pico del panel (W)
    "eficiencia_panel": 0.75,         # pérdidas por calor, suciedad, inversor...
    # Batería de almacenamiento (opcional)
    "bateria_sistema_activa": True,
    "bateria_sistema_wh": 1000,       # capacidad (Wh)
    "bateria_sistema_nivel": 40,      # % de carga al empezar el día
    "eficiencia_bateria": 0.9,        # se pierde ~10% al guardar y sacar energía
    # Consumo del propio servidor (ordenador Ubuntu)
    "servidor_w": 30,
    # Tablets y cargadores
    "capacidad_tablet_wh": 25,        # batería típica de una tablet de 10" (~7000 mAh)
    "potencia_cargador_w": 10,
    "n_enchufes": 10,                 # cuántas tablets se pueden cargar a la vez
    "reserva_pct": 15,                # batería mínima que debe quedar al acabar la clase
    # Consumo estimado por tipo de actividad (% de batería por hora). La app aprende el real.
    "consumo_defecto": {"lectura": 8, "ejercicios": 10, "video": 15, "juego": 20},
}

CLASES_INICIALES = [
    {"asignatura": "Matemáticas", "hora_inicio": "09:00", "duracion_min": 60, "actividad": "ejercicios", "n_tablets": 20},
    {"asignatura": "Ciencias",    "hora_inicio": "11:00", "duracion_min": 60, "actividad": "video",      "n_tablets": 20},
    {"asignatura": "Lectura",     "hora_inicio": "14:00", "duracion_min": 45, "actividad": "lectura",    "n_tablets": 15},
]

# Consumos medidos en clases anteriores (para que la demo muestre que la app "ha aprendido").
# El vídeo gasta más de lo estimado (las baterías de estas tablets están gastadas).
CONSUMO_REAL_DEMO = {"lectura": 8.5, "ejercicios": 11.0, "video": 19.5, "juego": 21.0}


def cargar_si_vacio(con) -> None:
    from .db import guardar_config

    if con.execute("SELECT COUNT(*) FROM config").fetchone()[0] == 0:
        guardar_config(con, CONFIG_INICIAL)

    if con.execute("SELECT COUNT(*) FROM clases").fetchone()[0] == 0:
        for c in CLASES_INICIALES:
            con.execute(
                "INSERT INTO clases(asignatura, hora_inicio, duracion_min, actividad, n_tablets) VALUES(?,?,?,?,?)",
                (c["asignatura"], c["hora_inicio"], c["duracion_min"], c["actividad"], c["n_tablets"]),
            )

    if con.execute("SELECT COUNT(*) FROM consumos").fetchone()[0] == 0:
        rnd = random.Random(4)
        hoy = date.today()
        for dias_atras in range(10, 0, -1):
            fecha = hoy - timedelta(days=dias_atras)
            if fecha.weekday() >= 5:      # sin clases el fin de semana
                continue
            for actividad, media in CONSUMO_REAL_DEMO.items():
                if actividad == "juego" and dias_atras % 3:   # el juego se usa poco
                    continue
                con.execute(
                    "INSERT INTO consumos(fecha, clase_id, actividad, pct_hora) VALUES(?,?,?,?)",
                    (f"{fecha.isoformat()}-{actividad}", None, actividad, round(media + rnd.uniform(-1.5, 1.5), 1)),
                )

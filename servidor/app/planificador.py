"""
PLANIFICADOR DE CARGA

Simula el día de mañana en franjas de 15 minutos y decide:
  1. Qué tablets usa cada clase (las más cargadas; las tablets son compartidas).
  2. Qué tablets enchufar, a qué hora y cuánto tiempo, teniendo en cuenta:
       - el sol de cada franja (previsión) y el consumo del propio servidor
       - la batería de almacenamiento de la escuela (si la hay)
       - cuántos enchufes hay (n_enchufes) y la potencia del cargador
       - cuánto gastará cada clase (consumo aprendido por tipo de actividad)
  3. Convierte todo en INSTRUCCIONES para el profesor:
       "07:00 · Enchufa T03, T05, T08 durante 1 h 30 min"
       "08:50 · Para Matemáticas usa: T04, T07, T12…"

Algoritmo voraz (greedy): en cada franja, la energía disponible se reparte primero entre
las tablets cuya próxima clase es más pronto. Es sencillo, rápido y fácil de explicar.
"""
from dataclasses import dataclass, field
from datetime import date, timedelta

MIN_FRANJA = 15
FRANJAS = 24 * 60 // MIN_FRANJA          # 96 franjas en un día
HORAS_URGENCIA_BATERIA = 3               # la batería del sistema se usa solo si la clase es en < 3 h


@dataclass
class ClasePlan:
    id: int
    asignatura: str
    franja: int
    duracion_min: int
    actividad: str
    n_tablets: int
    consumo_pct_hora: float
    tablets: list = field(default_factory=list)

    @property
    def gasto_pct(self) -> float:
        return self.consumo_pct_hora * self.duracion_min / 60

    @property
    def franja_fin(self) -> int:
        return self.franja + -(-self.duracion_min // MIN_FRANJA)   # redondeo hacia arriba


def calcular_plan(tablets: list[dict], clases: list[dict], config: dict, radiacion: list[float],
                  consumo: dict, dia: date | None = None, factor_sol: float = 1.0,
                  hechas: set | None = None) -> dict:
    """
    tablets:   [{id, bateria}]   (bateria = última lectura, en %)
    clases:    [{id, asignatura, hora_inicio "HH:MM", duracion_min, actividad, n_tablets}]
    radiacion: 24 valores W/m² de mañana
    consumo:   {actividad: {prevision: %/h, ...}}
    """
    dia = dia or (date.today() + timedelta(days=1))
    hechas = hechas or set()

    cap_wh = config["capacidad_tablet_wh"]
    carga_wh_franja = config["potencia_cargador_w"] * MIN_FRANJA / 60
    reserva = config["reserva_pct"]
    usa_bateria = bool(config.get("bateria_sistema_activa"))
    bat_cap = config.get("bateria_sistema_wh", 0) if usa_bateria else 0
    bat_ef = config.get("eficiencia_bateria", 0.9)
    bat_wh = bat_cap * config.get("bateria_sistema_nivel", 0) / 100
    servidor_wh_franja = config.get("servidor_w", 0) * MIN_FRANJA / 60

    def pct(wh): return wh / cap_wh * 100
    def wh(p): return p / 100 * cap_wh

    # ---------- 1. Clases y asignación de tablets (las más cargadas, sin solaparse) ----------
    plan_clases = []
    for c in sorted(clases, key=lambda c: c["hora_inicio"]):
        h, m = map(int, c["hora_inicio"].split(":"))
        prev = consumo.get(c["actividad"], {}).get("prevision", config["consumo_defecto"].get(c["actividad"], 10))
        plan_clases.append(ClasePlan(c["id"], c["asignatura"], (h * 60 + m) // MIN_FRANJA, c["duracion_min"],
                                     c["actividad"], c["n_tablets"], prev))

    bateria = {t["id"]: float(t["bateria"]) for t in tablets}
    estimada = dict(bateria)                     # batería estimada tras las clases ya asignadas
    ocupada = {t: [] for t in bateria}          # franjas [inicio, fin) en las que la tablet está en clase
    for clase in plan_clases:
        libres = [t for t in bateria
                  if not any(i < clase.franja_fin and clase.franja < f for i, f in ocupada[t])]
        libres.sort(key=lambda t: estimada[t], reverse=True)
        clase.tablets = sorted(libres[:clase.n_tablets])
        for t in clase.tablets:
            ocupada[t].append((clase.franja, clase.franja_fin))
            estimada[t] -= clase.gasto_pct

    clases_de = {t: sorted([c for c in plan_clases if t in c.tablets], key=lambda c: c.franja) for t in bateria}

    def proxima_clase(t, franja):
        return next((c for c in clases_de[t] if c.franja > franja), None)

    def en_clase(t, franja):
        return any(c.franja <= franja < c.franja_fin for c in clases_de[t])

    # ---------- 2. Simulación del día, franja a franja ----------
    carga = {t: [0.0] * FRANJAS for t in bateria}        # Wh cargados por tablet y franja
    origen_carga = {t: [None] * FRANJAS for t in bateria}
    bateria_al_empezar = {}                               # (clase_id, tablet) -> %
    solar_por_hora = [0.0] * 24
    bateria_sistema_por_hora = [0.0] * 24
    energia_perdida = 0.0

    for franja in range(FRANJAS):
        hora = franja * MIN_FRANJA // 60
        solar = (config["panel_solar_wp"] * (radiacion[hora] or 0) / 1000
                 * config["eficiencia_panel"] * factor_sol * MIN_FRANJA / 60)
        solar_por_hora[hora] += solar

        # Empiezan clases: anotar batería y descontar el gasto
        for clase in plan_clases:
            if clase.franja == franja:
                for t in clase.tablets:
                    bateria_al_empezar[(clase.id, t)] = bateria[t]
                    bateria[t] = max(0.0, bateria[t] - clase.gasto_pct)

        # El servidor consume primero
        if solar >= servidor_wh_franja:
            solar -= servidor_wh_franja
        else:
            falta = servidor_wh_franja - solar
            solar = 0.0
            bat_wh = max(0.0, bat_wh - falta / bat_ef)

        # Tablets que necesitan carga para su próxima clase (las más urgentes primero)
        necesitan = []
        for t in bateria:
            if en_clase(t, franja):
                continue
            c = proxima_clase(t, franja)
            if not c:
                continue
            objetivo = min(100.0, c.gasto_pct + reserva)
            if bateria[t] < objetivo:
                necesitan.append((c.franja, t, objetivo))
        necesitan.sort()

        enchufes = config["n_enchufes"]
        cargadas = set()
        for franja_clase, t, objetivo in necesitan:
            if enchufes == 0:
                break
            falta_wh = min(carga_wh_franja, wh(objetivo - bateria[t]))
            usar = min(falta_wh, solar)
            fuente = "sol" if usar > 0 else None
            solar -= usar
            urgente = (franja_clase - franja) * MIN_FRANJA <= HORAS_URGENCIA_BATERIA * 60
            if usar < falta_wh and usa_bateria and urgente and bat_wh > 0:
                de_bateria = min(falta_wh - usar, bat_wh * bat_ef)
                bat_wh -= de_bateria / bat_ef
                usar += de_bateria
                fuente = "bateria" if fuente is None else "sol+bateria"
            if usar > 0.05:
                carga[t][franja] += usar
                origen_carga[t][franja] = fuente
                bateria[t] = min(100.0, bateria[t] + pct(usar))
                enchufes -= 1
                cargadas.add(t)

        # Lo que sobra de sol: a la batería del sistema; si está llena o no hay, rellenar tablets
        if solar > 0 and usa_bateria and bat_wh < bat_cap:
            guardar = min(solar * bat_ef, bat_cap - bat_wh)
            bat_wh += guardar
            solar -= guardar / bat_ef
        if solar > 0 and enchufes > 0:
            extra = sorted([t for t in bateria if t not in cargadas and not en_clase(t, franja)
                            and proxima_clase(t, franja) and bateria[t] < 90], key=lambda t: bateria[t])
            for t in extra[:enchufes]:
                usar = min(carga_wh_franja, wh(90 - bateria[t]), solar)
                if usar <= 0.05:
                    break
                solar -= usar
                carga[t][franja] += usar
                origen_carga[t][franja] = "sol"
                bateria[t] = min(100.0, bateria[t] + pct(usar))
        energia_perdida += solar
        bateria_sistema_por_hora[hora] = round(bat_wh / bat_cap * 100, 1) if bat_cap else 0

    # ---------- 3. Resultado por clase ----------
    resultado_clases = []
    for c in plan_clases:
        objetivo = min(100.0, c.gasto_pct + reserva)
        listas = [t for t in c.tablets if bateria_al_empezar.get((c.id, t), 0) >= objetivo - 0.5]
        no_listas = [t for t in c.tablets if t not in listas]
        resultado_clases.append({
            "id": c.id, "asignatura": c.asignatura, "hora": _hhmm(c.franja), "actividad": c.actividad,
            "duracion_min": c.duracion_min, "consumo_pct_hora": c.consumo_pct_hora,
            "n_tablets": c.n_tablets, "tablets": c.tablets, "tablets_listas": listas,
            "tablets_no_listas": no_listas, "faltan_tablets": max(0, c.n_tablets - len(c.tablets)),
        })

    # ---------- 4. Instrucciones para el profesor ----------
    # 4a. Tramos de carga de cada tablet (franjas seguidas = un solo enchufado)
    tramos = {}       # (hora, minutos, fuente) -> [tablets]
    for t in sorted(bateria):
        franja = 0
        while franja < FRANJAS:
            if carga[t][franja] <= 0:
                franja += 1
                continue
            inicio, total, fuentes = franja, 0.0, set()
            while franja < FRANJAS and carga[t][franja] > 0:
                total += carga[t][franja]
                fuentes.update((origen_carga[t][franja] or "sol").split("+"))
                franja += 1
            # Redondeamos hacia arriba a múltiplos de 15 min: instrucciones fáciles de seguir
            minutos = max(15, -(-int(total / config["potencia_cargador_w"] * 60) // 15) * 15)
            con_que = "con la batería de la escuela" if fuentes == {"bateria"} else \
                      "con sol y batería" if "bateria" in fuentes else "con sol"
            tramos.setdefault((_hhmm(inicio), minutos, con_que), []).append(t)

    # 4b. Una instrucción por grupo de tablets que se enchufan a la vez y el mismo tiempo.
    #     Cada instrucción lleva un título corto y un detalle, pensados para leerse de un vistazo.
    instrucciones = []
    for (hora_txt, minutos, con_que), grupo in tramos.items():
        iid = f"{dia.isoformat()}-carga-{hora_txt.replace(':', '')}-{minutos}-{grupo[0]}"
        h, m = map(int, hora_txt.split(":"))
        fin = _hhmm((h * 60 + m + minutos) // MIN_FRANJA) if (h * 60 + m + minutos) < 24 * 60 else "23:59"
        n = len(grupo)
        instrucciones.append({
            "id": iid, "hora": hora_txt, "tipo": "carga", "tablets": grupo, "duracion_min": minutos,
            "fuente": con_que,
            "fuente_tipo": "bateria" if con_que == "con la batería de la escuela" else
                           "mixta" if "batería" in con_que else "sol",
            "titulo": f"Enchufa {n} tablet{'s' if n > 1 else ''}",
            "detalle": f"{_duracion(minutos)}, hasta las {fin} · {con_que}",
            "hasta": fin,
            "texto": f"Enchufa {', '.join(grupo)} durante {_duracion(minutos)} ({con_que})",
            "hecha": iid in hechas,
        })

    for c in resultado_clases:
        franja = max(0, int(c["hora"][:2]) * 60 // MIN_FRANJA + int(c["hora"][3:]) // MIN_FRANJA - 1)
        iid = f"{dia.isoformat()}-clase-{c['id']}"
        n = len(c["tablets"])
        instrucciones.append({
            "id": iid, "hora": _hhmm(franja), "tipo": "clase", "tablets": c["tablets"], "duracion_min": None,
            "asignatura": c["asignatura"],
            "titulo": f"Reparte {n} tablet{'s' if n != 1 else ''}",
            "detalle": f"Para {c['asignatura']}, que empieza a las {c['hora']}",
            "texto": f"Para {c['asignatura']} ({c['hora']}) reparte: {', '.join(c['tablets']) or 'ninguna tablet'}",
            "hecha": iid in hechas,
        })
        disponibles = len(c["tablets_listas"])
        if disponibles < c["n_tablets"]:
            por_grupo = -(-c["n_tablets"] // disponibles) if disponibles else None
            consejo = (f"Trabajad en grupos de {por_grupo} alumnos por tablet." if por_grupo
                       else "Prepara la actividad sin tablets.")
            texto = f"{c['asignatura']}: solo {disponibles} de {c['n_tablets']} tablets estarán listas. {consejo}"
            instrucciones.append({
                "id": f"{iid}-aviso", "hora": _hhmm(franja), "tipo": "aviso", "tablets": [], "duracion_min": None,
                "asignatura": c["asignatura"],
                "titulo": f"Faltan tablets en {c['asignatura']}",
                "detalle": f"Solo {disponibles} de {c['n_tablets']} estarán listas. {consejo}",
                "texto": texto, "hecha": False,
            })

    orden_tipo = {"aviso": 0, "clase": 1, "carga": 2}
    instrucciones.sort(key=lambda i: (i["hora"], orden_tipo[i["tipo"]], i["tablets"][:1]))

    return {
        "dia": dia.isoformat(),
        "energia_solar_wh": round(sum(solar_por_hora)),
        "energia_perdida_wh": round(energia_perdida),
        "solar_por_hora_wh": [round(x, 1) for x in solar_por_hora],
        "bateria_sistema_por_hora_pct": bateria_sistema_por_hora,
        "clases": resultado_clases,
        "instrucciones": instrucciones,
        "bateria_final": {t: round(b, 1) for t, b in sorted(bateria.items())},
    }


def _hhmm(franja: int) -> str:
    minutos = franja * MIN_FRANJA
    return f"{minutos // 60:02d}:{minutos % 60:02d}"


def _duracion(minutos: int) -> str:
    h, m = divmod(minutos, 60)
    if h and m:
        return f"{h} h {m} min"
    return f"{h} h" if h else f"{m} min"

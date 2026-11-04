"""
PLANIFICADOR DE CARGA (varios días)

Simula seguido, en franjas de 15 minutos, desde AHORA hasta el último día con previsión:
  - Las baterías de las tablets y la batería de la escuela pasan de un día a otro.
  - Lo que se carga hoy cuenta para las clases de mañana y de los días siguientes.
  - Si se acerca un día con poco sol ("día escaso"), las tablets que se usarán ese día se cargan
    al 100 % en los días de sol anteriores.
  - Solo se dan instrucciones cuando el profesor está en la escuela (días lectivos, de su hora de
    llegada a su hora de salida). La batería de la escuela se carga sola con el sol cualquier día.

Decide:
  1. Qué tablets usa cada clase (las más cargadas; las tablets son compartidas).
  2. Qué tablets enchufar, a qué hora y cuánto tiempo, teniendo en cuenta el sol de cada franja,
     el consumo del servidor, la batería de la escuela, los enchufes y la potencia del cargador.
  3. Lo convierte en INSTRUCCIONES para el profesor:
       "07:00 · Enchufa T03, T05, T08 durante 1 h 30 min"
       "08:45 · Reparte 20 tablets para Matemáticas"

Algoritmo voraz (greedy): en cada franja, la energía se reparte primero entre las tablets cuya
próxima clase es antes. Sencillo, rápido y fácil de explicar.
"""
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

MIN_FRANJA = 15
FRANJAS_DIA = 24 * 60 // MIN_FRANJA      # 96 franjas por día
HORAS_URGENCIA_BATERIA = 3               # la batería de la escuela se usa si la clase es en < 3 h
DIAS_SEMANA = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre",
         "octubre", "noviembre", "diciembre"]


@dataclass
class ClasePlan:
    id: int
    fecha: date
    asignatura: str
    franja: int                 # franja global (desde el inicio del primer día)
    hora: str
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
        return self.franja + -(-self.duracion_min // MIN_FRANJA)


def texto_dia(fecha: date, hoy: date) -> str:
    if fecha == hoy:
        return "Hoy"
    if fecha == hoy + timedelta(days=1):
        return "Mañana"
    return f"{DIAS_SEMANA[fecha.weekday()].capitalize()} {fecha.day}"


def calcular_plan(tablets: list[dict], clases_por_dia: dict, config: dict, radiacion_por_dia: dict,
                  consumo: dict, inicio: datetime | None = None, factor_sol: float = 1.0,
                  hechas: set | None = None) -> dict:
    """
    tablets:           [{id, bateria}]  (última lectura, en %)
    clases_por_dia:    {date: [clase, ...]}  clase = {id, asignatura, hora_inicio "HH:MM", duracion_min, actividad, n_tablets}
    radiacion_por_dia: {date: [24 valores W/m²]}  (los días que cubre la previsión)
    inicio:            desde cuándo se planifica (por defecto: ahora)
    """
    hechas = hechas or set()
    inicio = inicio or datetime.now()
    hoy = inicio.date()
    dias = sorted(d for d in radiacion_por_dia if d >= hoy)
    if not dias:
        return _plan_vacio(hoy)
    if hoy in dias:   # empezamos en la siguiente franja de 15 minutos
        franja_inicio = dias.index(hoy) * FRANJAS_DIA + -(-(inicio.hour * 60 + inicio.minute) // MIN_FRANJA)
    else:
        franja_inicio = 0
    total_franjas = len(dias) * FRANJAS_DIA

    cap_wh = config["capacidad_tablet_wh"]
    carga_wh_franja = config["potencia_cargador_w"] * MIN_FRANJA / 60
    reserva = config["reserva_pct"]
    usa_bateria = bool(config.get("bateria_sistema_activa"))
    bat_cap = config.get("bateria_sistema_wh", 0) if usa_bateria else 0
    bat_ef = config.get("eficiencia_bateria", 0.9)
    bat_wh = bat_cap * config.get("bateria_sistema_nivel", 0) / 100
    servidor_wh_franja = config.get("servidor_w", 0) * MIN_FRANJA / 60
    llegada = config.get("hora_llegada", 7) * 60 // MIN_FRANJA
    salida = config.get("hora_salida", 16) * 60 // MIN_FRANJA

    def pct(wh): return wh / cap_wh * 100
    def wh(p): return p / 100 * cap_wh
    def fecha_de(franja): return dias[franja // FRANJAS_DIA]

    def solar_wh(franja):
        hora = (franja % FRANJAS_DIA) * MIN_FRANJA // 60
        return (config["panel_solar_wp"] * (radiacion_por_dia[fecha_de(franja)][hora] or 0) / 1000
                * config["eficiencia_panel"] * factor_sol * MIN_FRANJA / 60)

    lectivo = {d: bool(clases_por_dia.get(d)) or d.weekday() < 5 for d in dias}

    def profesor_presente(franja):
        return lectivo[fecha_de(franja)] and llegada <= franja % FRANJAS_DIA < salida

    # ---------- 1. Clases (de ahora en adelante) y asignación de tablets ----------
    plan_clases = []
    for i, d in enumerate(dias):
        for c in clases_por_dia.get(d, []):
            h, m = map(int, c["hora_inicio"].split(":"))
            franja = i * FRANJAS_DIA + (h * 60 + m) // MIN_FRANJA
            if franja < franja_inicio:
                continue                                   # ya ha empezado o pasado
            prev = consumo.get(c["actividad"], {}).get("prevision",
                                                       config["consumo_defecto"].get(c["actividad"], 10))
            plan_clases.append(ClasePlan(c["id"], d, c["asignatura"], franja, c["hora_inicio"], c["duracion_min"],
                                         c["actividad"], c["n_tablets"], prev))
    plan_clases.sort(key=lambda c: c.franja)

    bateria = {t["id"]: float(t["bateria"]) for t in tablets}
    estimada = dict(bateria)
    ocupada = {t: [] for t in bateria}
    for clase in plan_clases:
        libres = [t for t in bateria if not any(i < clase.franja_fin and clase.franja < f for i, f in ocupada[t])]
        libres.sort(key=lambda t: estimada[t], reverse=True)
        clase.tablets = sorted(libres[:clase.n_tablets])
        for t in clase.tablets:
            ocupada[t].append((clase.franja, clase.franja_fin))
            estimada[t] -= clase.gasto_pct * 2      # penaliza las ya usadas: así se reparte el uso

    clases_de = {t: [c for c in plan_clases if t in c.tablets] for t in bateria}

    # ---------- Días escasos (con clases): poco sol respecto al mejor día de la previsión,
    #            o sol que no llega para lo que gastan sus clases ----------
    sol_dia = {d: sum(solar_wh(i * FRANJAS_DIA + f) for f in range(FRANJAS_DIA)) for i, d in enumerate(dias)}
    mejor_dia = max(sol_dia.values()) or 1
    escaso = {}
    for i, d in enumerate(dias):
        necesidad = sum(wh(c.gasto_pct) * len(c.tablets) for c in plan_clases if c.fecha == d)
        sol_util = sum(solar_wh(i * FRANJAS_DIA + f) for f in range(llegada, salida))
        escaso[d] = necesidad > 0 and (sol_dia[d] < 0.4 * mejor_dia or sol_util < necesidad * 1.2)

    def proxima_clase(t, franja):
        return next((c for c in clases_de[t] if c.franja > franja), None)

    def en_clase(t, franja):
        return any(c.franja <= franja < c.franja_fin for c in clases_de[t])

    def objetivo_para(c):
        # Si la clase cae en un día escaso, llenamos la tablet antes (en un día de sol)
        return 100.0 if escaso[c.fecha] else min(100.0, c.gasto_pct + reserva)

    # ---------- 2. Simulación franja a franja ----------
    carga = {t: {} for t in bateria}            # franja -> Wh
    origen_carga = {t: {} for t in bateria}
    bateria_al_empezar = {}
    solar_dia_hora = {d: [0.0] * 24 for d in dias}
    bat_dia_hora = {d: [0.0] * 24 for d in dias}
    energia_perdida = 0.0

    for franja in range(franja_inicio, total_franjas):
        d = fecha_de(franja)
        hora = (franja % FRANJAS_DIA) * MIN_FRANJA // 60
        solar = solar_wh(franja)
        solar_dia_hora[d][hora] += solar

        for clase in plan_clases:
            if clase.franja == franja:
                for t in clase.tablets:
                    bateria_al_empezar[(clase.id, clase.fecha, t)] = bateria[t]
                    bateria[t] = max(0.0, bateria[t] - clase.gasto_pct)

        # El servidor consume primero
        if solar >= servidor_wh_franja:
            solar -= servidor_wh_franja
        else:
            bat_wh = max(0.0, bat_wh - (servidor_wh_franja - solar) / bat_ef)
            solar = 0.0

        enchufes = config["n_enchufes"]
        cargadas = set()
        if profesor_presente(franja):
            necesitan = []
            for t in bateria:
                if en_clase(t, franja):
                    continue
                c = proxima_clase(t, franja)
                if c and bateria[t] < objetivo_para(c):
                    necesitan.append((c.franja, t, objetivo_para(c)))
            necesitan.sort()
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
                    carga[t][franja] = carga[t].get(franja, 0) + usar
                    origen_carga[t][franja] = fuente
                    bateria[t] = min(100.0, bateria[t] + pct(usar))
                    enchufes -= 1
                    cargadas.add(t)

        # Lo que sobra de sol: a la batería de la escuela (se carga sola, haya o no profesor)
        if solar > 0 and usa_bateria and bat_wh < bat_cap:
            guardar = min(solar * bat_ef, bat_cap - bat_wh)
            bat_wh += guardar
            solar -= guardar / bat_ef
        # Si aún sobra y está el profesor: rellenar tablets que tienen clases más adelante
        if solar > 0 and enchufes > 0 and profesor_presente(franja):
            extra = []
            for t in bateria:
                c = proxima_clase(t, franja)
                tope = 100.0 if c and escaso[c.fecha] else 90.0
                if t not in cargadas and not en_clase(t, franja) and c and bateria[t] < tope:
                    extra.append((bateria[t], t, tope))
            for _, t, tope in sorted(extra)[:enchufes]:
                usar = min(carga_wh_franja, wh(tope - bateria[t]), solar)
                if usar <= 0.05:
                    break
                solar -= usar
                carga[t][franja] = carga[t].get(franja, 0) + usar
                origen_carga[t][franja] = "sol"
                bateria[t] = min(100.0, bateria[t] + pct(usar))
        energia_perdida += solar
        bat_dia_hora[d][hora] = round(bat_wh / bat_cap * 100, 1) if bat_cap else 0

    # ---------- 3. Resultado por clase ----------
    resultado_clases = []
    for c in plan_clases:
        objetivo = min(100.0, c.gasto_pct + reserva)
        listas = [t for t in c.tablets if bateria_al_empezar.get((c.id, c.fecha, t), 0) >= objetivo - 0.5]
        resultado_clases.append({
            "id": c.id, "fecha": c.fecha.isoformat(), "dia_texto": texto_dia(c.fecha, hoy),
            "asignatura": c.asignatura, "hora": c.hora, "actividad": c.actividad,
            "duracion_min": c.duracion_min, "consumo_pct_hora": c.consumo_pct_hora,
            "n_tablets": c.n_tablets, "tablets": c.tablets, "tablets_listas": listas,
            "tablets_no_listas": [t for t in c.tablets if t not in listas],
            "faltan_tablets": max(0, c.n_tablets - len(c.tablets)),
        })

    # ---------- 4. Instrucciones ----------
    # Tramos de carga de cada tablet. Para que haya pocas instrucciones y fáciles de seguir:
    #   - huecos de hasta 30 min se juntan (la tablet sigue enchufada: se carga un poco más)
    #   - el inicio se adelanta a la media hora (enchufar antes no hace daño)
    #   - se agrupan las tablets que empiezan a la misma hora con la misma fuente
    #   - nunca hay más tablets enchufadas a la vez que enchufes: si no hay hueco, la tablet espera
    import heapq
    HUECO = 2
    intervalos = []   # (inicio, fin, tablet, fuente, para_dia_escaso)
    for t in sorted(bateria):
        franjas = sorted(carga[t])
        k = 0
        while k < len(franjas):
            ini = franjas[k]
            fin, fuentes = ini, set()
            while k < len(franjas) and franjas[k] <= fin + HUECO:
                fuentes.update((origen_carga[t][franjas[k]] or "sol").split("+"))
                fin = franjas[k]
                k += 1
            ini_redondeado = max(ini - ini % 2, (ini // FRANJAS_DIA) * FRANJAS_DIA + llegada, franja_inicio)
            con_que = "con la batería de la escuela" if fuentes == {"bateria"} else \
                      "con sol y batería" if "bateria" in fuentes else "con sol"
            c = proxima_clase(t, ini)
            para_escaso = bool(c and escaso[c.fecha] and c.fecha != fecha_de(ini))
            intervalos.append((ini_redondeado, max(fin + 1, ini_redondeado + 2), t, con_que, para_escaso))   # mínimo 30 min

    grupos = {}       # (inicio, fin, fuente, para_dia_escaso) -> [tablets]
    ocupados = []     # montón con la franja en la que se libera cada enchufe
    for ini, fin, t, con_que, para_escaso in sorted(intervalos):
        while ocupados and ocupados[0] <= ini:
            heapq.heappop(ocupados)
        if len(ocupados) >= config["n_enchufes"]:
            libre = heapq.heappop(ocupados)          # espera a que se libere un enchufe
            fin, ini = fin + (libre - ini), libre
        heapq.heappush(ocupados, fin)
        grupos.setdefault((ini, fin, con_que, para_escaso), []).append(t)

    tramos = {(ini, (fin - ini) * MIN_FRANJA, con_que, para_escaso): sorted(ts)
              for (ini, fin, con_que, para_escaso), ts in grupos.items()}

    # Las tablets que se enchufan a la misma hora van en una sola instrucción (cada una con su hora de desenchufar)
    por_inicio = {}
    for (ini, minutos, con_que, para_escaso), grupo in tramos.items():
        por_inicio.setdefault((ini, con_que, para_escaso), []).append((minutos, grupo))

    def a_hora(franja_dia_min):
        m = min(franja_dia_min, 1439)
        return f"{m // 60:02d}:{m % 60:02d}"

    instrucciones = []
    for (ini, con_que, para_escaso), partes in por_inicio.items():
        partes.sort()
        d = fecha_de(ini)
        hora_txt = _hhmm(ini % FRANJAS_DIA)
        base_min = (ini % FRANJAS_DIA) * MIN_FRANJA
        todas = sorted(t for _, g in partes for t in g)
        minutos = max(m for m, _ in partes)
        if len(partes) == 1:
            cuando = f"{_duracion(minutos)}, hasta las {a_hora(base_min + minutos)}"
        else:
            cuando = "; ".join(f"{', '.join(g)} hasta las {a_hora(base_min + m)}" for m, g in partes)
        iid = f"{d.isoformat()}-carga-{hora_txt.replace(':', '')}-{todas[0]}"
        n = len(todas)
        instrucciones.append({
            "id": iid, "fecha": d.isoformat(), "dia_texto": texto_dia(d, hoy), "hora": hora_txt,
            "orden": ini, "tipo": "carga", "tablets": todas, "duracion_min": minutos, "fuente": con_que,
            "partes": [{"tablets": g, "hasta": a_hora(base_min + m)} for m, g in partes],
            "fuente_tipo": "bateria" if con_que == "con la batería de la escuela" else
                           "mixta" if "batería" in con_que else "sol",
            "titulo": f"Enchufa {n} tablet{'s' if n > 1 else ''}",
            "detalle": f"{cuando} · {con_que}"
                       + (" · se adelanta la carga porque viene un día con poco sol" if para_escaso else ""),
            "texto": f"Enchufa {', '.join(todas)} ({cuando}, {con_que})",
            "hecha": iid in hechas,
        })

    for c, rc in zip(plan_clases, resultado_clases):
        franja = max(franja_inicio, c.franja - 1)
        iid = f"{c.fecha.isoformat()}-clase-{c.id}"
        base = {"fecha": c.fecha.isoformat(), "dia_texto": texto_dia(c.fecha, hoy),
                "hora": _hhmm(franja % FRANJAS_DIA), "orden": franja, "asignatura": c.asignatura,
                "duracion_min": None}
        n = len(c.tablets)
        instrucciones.append({**base, "id": iid, "tipo": "clase", "tablets": c.tablets,
                              "titulo": f"Reparte {n} tablet{'s' if n != 1 else ''}",
                              "detalle": f"Para {c.asignatura}, que empieza a las {c.hora}",
                              "texto": f"Para {c.asignatura} ({c.hora}) reparte: {', '.join(c.tablets) or 'ninguna'}",
                              "hecha": iid in hechas})
        disponibles = len(rc["tablets_listas"])
        if disponibles < c.n_tablets:
            por_grupo = -(-c.n_tablets // disponibles) if disponibles else None
            consejo = (f"Trabajad en grupos de {por_grupo} alumnos por tablet." if por_grupo
                       else "Prepara la actividad sin tablets.")
            instrucciones.append({**base, "id": f"{iid}-aviso", "tipo": "aviso", "tablets": [],
                                  "titulo": f"Faltan tablets en {c.asignatura} ({texto_dia(c.fecha, hoy).lower()})",
                                  "detalle": f"Solo {disponibles} de {c.n_tablets} estarán listas. {consejo}",
                                  "texto": f"{c.asignatura}: solo {disponibles} de {c.n_tablets} listas. {consejo}",
                                  "hecha": False})

    orden_tipo = {"aviso": 0, "clase": 1, "carga": 2}
    instrucciones.sort(key=lambda i: (i["orden"], orden_tipo[i["tipo"]], i["tablets"][:1]))

    # ---------- 5. Resumen por día ----------
    resumen_dias = []
    for d in dias:
        f = d.isoformat()
        resumen_dias.append({
            "fecha": f, "dia_texto": texto_dia(d, hoy),
            "nombre": f"{DIAS_SEMANA[d.weekday()]} {d.day} de {MESES[d.month - 1]}",
            "lectivo": lectivo[d], "escaso": escaso[d],
            "energia_solar_wh": round(sum(solar_dia_hora[d])),
            "solar_por_hora_wh": [round(x, 1) for x in solar_dia_hora[d]],
            "bateria_sistema_por_hora_pct": bat_dia_hora[d],
            "n_clases": sum(1 for c in resultado_clases if c["fecha"] == f),
            "n_instrucciones": sum(1 for i in instrucciones if i["fecha"] == f and i["tipo"] != "aviso"),
        })

    # Compatibilidad con la app Android: "dia" = primer día con clases pendientes
    primero = next((r for r in resumen_dias if r["n_clases"]), resumen_dias[0])
    return {
        "inicio": inicio.isoformat(timespec="minutes"),
        "dia": primero["fecha"],
        "hasta": dias[-1].isoformat(),
        "energia_solar_wh": primero["energia_solar_wh"],
        "energia_perdida_wh": round(energia_perdida),
        "solar_por_hora_wh": primero["solar_por_hora_wh"],
        "dias": resumen_dias,
        "clases": resultado_clases,
        "instrucciones": instrucciones,
        "bateria_final": {t: round(b, 1) for t, b in sorted(bateria.items())},
    }


def _plan_vacio(hoy: date) -> dict:
    return {"inicio": hoy.isoformat(), "dia": hoy.isoformat(), "hasta": hoy.isoformat(), "energia_solar_wh": 0,
            "energia_perdida_wh": 0, "solar_por_hora_wh": [0] * 24, "dias": [], "clases": [], "instrucciones": [],
            "bateria_final": {}}


def _hhmm(franja: int) -> str:
    minutos = franja * MIN_FRANJA
    return f"{minutos // 60:02d}:{minutos % 60:02d}"


def _duracion(minutos: int) -> str:
    h, m = divmod(minutos, 60)
    if h and m:
        return f"{h} h {m} min"
    return f"{h} h" if h else f"{m} min"

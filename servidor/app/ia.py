"""
ASISTENTE DE IA

Se prueba en este orden:
  1. IA LOCAL: Gemma con Ollama en el propio ordenador. Sin internet y gratis.
  2. Gemini (API de Google), si hay clave en servidor/.env e internet.
  3. Resumen automático generado con los datos, para que el asistente nunca se quede en blanco.

Con IA_PROVEEDOR=ollama | gemini en .env se puede forzar uno (por defecto: auto).
"""
import json
import os
import re
from pathlib import Path

import httpx


def _cargar_env():
    archivo = Path(__file__).resolve().parent.parent / ".env"
    if archivo.exists():
        for linea in archivo.read_text(encoding="utf-8").splitlines():
            if "=" in linea and not linea.strip().startswith("#"):
                clave, valor = linea.split("=", 1)
                os.environ.setdefault(clave.strip(), valor.strip().strip('"'))


_cargar_env()

# Modelos que se prueban en orden. Google va cambiando los modelos: si uno ya no existe o la cuenta
# no tiene acceso, se pasa al siguiente. Con GEMINI_MODELO en .env se puede forzar uno primero.
MODELOS_POR_DEFECTO = ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-2.5-flash"]
_modelo_que_funciona = None

ROL = """Eres el asistente de Fotosíntesis. Ayudas a un profesor de una escuela rural con paneles solares a tener
las tablets cargadas para sus clases. El plan de carga ya lo ha calculado la app: tú solo lo explicas.

Cómo respondes:
- En español, como un compañero que habla claro. Frases cortas.
- La primera frase responde directamente a la pregunta (si es de sí o no, empieza por «Sí» o «No»).
- Máximo 3 frases, salvo que te pidan un resumen.
- Da horas y nombres de tablets (T01, T02…) cuando ayuden a actuar.
- Nunca uses vatios, Wh, kWh ni porcentajes de energía solar. Habla de «mucho sol», «poco sol».
- Usa solo los DATOS que te doy. Si no están, dilo en una frase. No inventes clases, horas ni tablets.
- Sin listas, sin negritas, sin emojis, sin saludos ni despedidas, sin repetir la pregunta.

Ejemplo de estilo (datos inventados, NO los uses):
Pregunta: ¿Qué hago ahora?
Respuesta: A las 8:15 enchufa T02 y T07 durante 45 minutos. Después, a las 9:45, reparte 15 tablets para Lectura."""


class ErrorIA(RuntimeError):
    """Error con un mensaje que entiende el profesor (se muestra debajo de la respuesta)."""


def _clave() -> str:
    clave = os.environ.get("GEMINI_API_KEY", "").strip()
    if not clave or "PON_AQUI" in clave:
        raise ErrorIA("Falta la clave de Gemini en servidor/.env")
    return clave


def _modelos() -> list[str]:
    elegido = os.environ.get("GEMINI_MODELO", "").strip()
    lista = ([_modelo_que_funciona] if _modelo_que_funciona else []) + ([elegido] if elegido else []) + MODELOS_POR_DEFECTO
    return list(dict.fromkeys(lista))      # sin repetidos, en orden


def _gemini(prompt: str) -> str:
    global _modelo_que_funciona
    clave = _clave()
    ultimo = "Gemini no responde"
    for modelo in _modelos():
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent"
        try:
            r = httpx.post(url, headers={"x-goog-api-key": clave}, timeout=40, json={
                "system_instruction": {"parts": [{"text": ROL}]},
                "contents": [{"parts": [{"text": prompt}]}],
            })
        except httpx.TimeoutException:
            raise ErrorIA("Gemini ha tardado demasiado en responder")
        except httpx.HTTPError:
            raise ErrorIA("Sin conexión a internet")
        if r.status_code == 200:
            partes = r.json().get("candidates", [{}])[0].get("content", {}).get("parts", [])
            texto = "".join(p.get("text", "") for p in partes if not p.get("thought")).strip()
            if not texto:
                raise ErrorIA("Gemini ha devuelto una respuesta vacía")
            _modelo_que_funciona = modelo
            return texto
        detalle = r.text
        if "API_KEY_INVALID" in detalle or "API key not valid" in detalle:
            raise ErrorIA("La clave de Gemini no es válida: revisa servidor/.env")
        if r.status_code == 429:
            raise ErrorIA("Se ha alcanzado el límite gratuito de Gemini: espera un minuto")
        try:
            mensaje = r.json().get("error", {}).get("message", "")[:220]
        except ValueError:
            mensaje = detalle[:220]
        if r.status_code == 404 or (r.status_code == 400 and "not found" in mensaje.lower()):
            ultimo = f"Ningún modelo de Gemini disponible (último: {modelo})"
            continue                                 # este modelo ya no existe: probar el siguiente
        if r.status_code == 403:
            raise ErrorIA(f"Google no da permiso a esta clave (error 403): {mensaje}")
        raise ErrorIA(f"Gemini ha respondido con un error {r.status_code}: {mensaje}")
    raise ErrorIA(ultimo)


# ---------------------------------------------------------------------------
#  IA local: Ollama (https://ollama.com) con un modelo Gemma
# ---------------------------------------------------------------------------
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434").rstrip("/")


def _modelo_ollama() -> str:
    """Elige el modelo instalado: el de OLLAMA_MODELO, si no uno de Gemma, si no el primero."""
    try:
        r = httpx.get(f"{OLLAMA_URL}/api/tags", timeout=2)
        r.raise_for_status()
    except httpx.HTTPError:
        raise ErrorIA("Ollama no está abierto en este ordenador")
    nombres = [m["name"] for m in r.json().get("models", [])]
    if not nombres:
        raise ErrorIA("Ollama no tiene ningún modelo: ejecuta  ollama pull gemma4:e2b")
    elegido = os.environ.get("OLLAMA_MODELO", "").strip()
    if elegido:
        if elegido in nombres or f"{elegido}:latest" in nombres:
            return elegido
        raise ErrorIA(f"Ollama no tiene el modelo {elegido}: ejecuta  ollama pull {elegido}")
    for preferido in ("gemma4:e4b", "gemma4:e2b"):        # el más listo que esté instalado
        if preferido in nombres:
            return preferido
    gemma = [n for n in nombres if "gemma" in n]
    return (gemma or nombres)[0]


def _ollama(prompt: str) -> tuple[str, str]:
    modelo = _modelo_ollama()
    try:
        r = httpx.post(f"{OLLAMA_URL}/api/chat", timeout=180, json={
            "model": modelo, "stream": False, "think": False,
            "messages": [{"role": "system", "content": ROL}, {"role": "user", "content": prompt}],
            "options": {"temperature": 0.2, "num_ctx": 6144},
        })
    except httpx.TimeoutException:
        raise ErrorIA("La IA local ha tardado demasiado")
    except httpx.HTTPError:
        raise ErrorIA("Ollama no responde")
    if r.status_code == 400 and "think" in r.text:      # modelos que no aceptan la opción "think"
        r = httpx.post(f"{OLLAMA_URL}/api/chat", timeout=180, json={
            "model": modelo, "stream": False,
            "messages": [{"role": "system", "content": ROL}, {"role": "user", "content": prompt}],
            "options": {"temperature": 0.2, "num_ctx": 6144},
        })
    if r.status_code != 200:
        raise ErrorIA(f"Ollama ha respondido con un error {r.status_code}")
    texto = r.json().get("message", {}).get("content", "")
    texto = re.sub(r"<think>.*?</think>", "", texto, flags=re.S).strip()
    if not texto:
        raise ErrorIA("La IA local ha devuelto una respuesta vacía")
    return texto, modelo


def _preguntar_ia(prompt: str) -> dict:
    """Prueba la IA local y después Gemini. Devuelve {texto, origen, modelo} o lanza ErrorIA con los motivos."""
    proveedor = os.environ.get("IA_PROVEEDOR", "auto").strip().lower()
    motivos = []
    if proveedor in ("auto", "ollama"):
        try:
            texto, modelo = _ollama(prompt)
            return {"texto": texto, "origen": "ollama", "modelo": modelo}
        except ErrorIA as e:
            motivos.append(str(e))
    if proveedor in ("auto", "gemini"):
        try:
            texto = _gemini(prompt)
            return {"texto": texto, "origen": "gemini", "modelo": _modelo_que_funciona}
        except ErrorIA as e:
            motivos.append(str(e))
    raise ErrorIA(" · ".join(motivos) or "No hay IA configurada")


ACTIVIDADES = {"lectura": "lectura", "ejercicios": "ejercicios", "video": "vídeo", "juego": "juego"}


def _lista(cosas: list[str]) -> str:
    cosas = list(cosas)
    return ", ".join(cosas[:-1]) + " y " + cosas[-1] if len(cosas) > 1 else (cosas[0] if cosas else "")


def _hechos(plan: dict, consumo: dict) -> str:
    """Los datos del plan en frases cortas: un modelo pequeño los entiende mejor que un JSON enorme."""
    dias = plan.get("dias", [])
    hoy = dias[0]["nombre"] if dias else ""
    lineas = [f"Ahora es {hoy}, a las {plan.get('inicio', '')[11:16]}."]
    pendientes = [i for i in plan["instrucciones"] if not i.get("hecha") and i["tipo"] != "aviso"]
    if pendientes:
        i = pendientes[0]
        lineas.append(f"SIGUIENTE PASO: {i.get('dia_texto', '')} a las {i['hora']}: {i['texto']}.")
        siguientes = [f"{j['hora']} {j['texto']}" for j in pendientes[1:6] if j.get("fecha") == i.get("fecha")]
        if siguientes:
            lineas.append("Después, ese mismo día: " + "; ".join(siguientes) + ".")
    else:
        lineas.append("No quedan instrucciones pendientes.")

    maximo = max([d["energia_solar_wh"] for d in plan.get("dias", [])] or [1]) or 1
    lineas.append("DÍAS:")
    for d in plan.get("dias", []):
        r = d["energia_solar_wh"] / maximo
        sol = "poco sol" if d.get("escaso") or r < 0.45 else ("mucho sol" if r >= 0.75 else "sol normal")
        clases = [c for c in plan["clases"] if c.get("fecha") == d["fecha"]]
        if not clases:
            txt = "sin clases" + (" (fin de semana: solo se carga la batería de la escuela)" if not d.get("lectivo") else "")
        else:
            txt = "clases: " + "; ".join(
                f"{c['asignatura']} a las {c['hora']} con {ACTIVIDADES.get(c['actividad'], c['actividad'])}, "
                f"{len(c['tablets_listas'])} de {c['n_tablets']} tablets listas" for c in clases)
        extra = ". Sus tablets se cargan en los días anteriores" if d.get("escaso") and clases else ""
        lineas.append(f"- {d['dia_texto']} ({d['nombre']}): {sol}, {txt}{extra}.")

    avisos = [i["texto"] for i in plan["instrucciones"] if i["tipo"] == "aviso" and not i.get("hecha")]
    if avisos:
        lineas.append("AVISOS: " + " ".join(avisos[:4]))
    gasto = [f"{ACTIVIDADES.get(a, a)} {round(v['prevision'])} %" for a, v in consumo.items()]
    lineas.append("Batería que gasta cada tablet por hora de clase: " + _lista(gasto) + ".")
    return "\n".join(lineas)


def _hechos_de_la_pregunta(pregunta: str, plan: dict, consumo: dict) -> str:
    """Cálculos concretos para preguntas típicas (cambiar la actividad de una clase), hechos con código."""
    p = pregunta.lower().replace("í", "i").replace("é", "e")
    actividad = next((a for a in ("video", "juego", "lectura", "ejercicio") if a in p), None)
    if actividad == "ejercicio":
        actividad = "ejercicios"
    clases = [c for c in plan["clases"] if c["asignatura"].lower().replace("í", "i").replace("é", "e") in p]
    if not (actividad and clases and actividad in consumo):
        return ""
    c = clases[0]
    horas = c.get("duracion_min", 60) / 60
    ahora = consumo.get(c["actividad"], {}).get("prevision", c.get("consumo_pct_hora", 10))
    nuevo = consumo[actividad]["prevision"]
    nombre = ACTIVIDADES.get(actividad, actividad)
    if c["actividad"] == actividad:
        return f"CÁLCULO: {c['asignatura']} ({c['dia_texto']} {c['hora']}) ya está planificada con {nombre}."
    gasto_ahora, gasto_nuevo = round(ahora * horas), round(nuevo * horas)
    listas = len(c["tablets_listas"]) == c["n_tablets"]
    consejo = ("Las tablets llegarán cargadas, así que hay margen; si se cambia, conviene cambiarlo también en "
               "Horario para que la app recalcule las cargas." if listas or gasto_nuevo <= gasto_ahora else
               "No todas las tablets llegarán listas: mejor no cambiarlo o trabajar en grupos.")
    return (f"CÁLCULO: si {c['asignatura']} ({c['dia_texto']} {c['hora']}, {c.get('duracion_min', 60)} min) usa "
            f"{nombre} en vez de {ACTIVIDADES.get(c['actividad'], c['actividad'])}, cada tablet gastará unos "
            f"{gasto_nuevo} % de batería en la clase en lugar de {gasto_ahora} %. {consejo}")


def _limpiar(texto: str) -> str:
    texto = re.sub(r"\*\*|__|^#+\s*", "", texto, flags=re.M)        # sin markdown
    texto = re.sub(r"^\s*[-*•]\s+", "", texto, flags=re.M)
    return texto.strip()


def resumen_del_plan(plan: dict, prevision: dict, consumo: dict) -> dict:
    prompt = ("DATOS:\n" + _hechos(plan, consumo) + "\n\n"
              "Escribe un resumen para el profesor en exactamente tres líneas, cada una de una o dos frases:\n"
              "Ahora: el siguiente paso, con su hora y sus tablets.\n"
              "Hoy: cómo va el día (sol y si las clases tendrán sus tablets).\n"
              "Atención: el día con poco sol o la clase con tablets que faltan, y qué hacer. "
              "Si no hay nada, di que todo va bien.")
    try:
        r = _preguntar_ia(prompt)
        r["texto"] = _limpiar(r["texto"])
        return r
    except Exception as e:
        return {"texto": _resumen_local(plan, prevision, consumo), "origen": "local", "motivo": str(e)[:200]}


def responder(pregunta: str, plan: dict, prevision: dict, consumo: dict) -> dict:
    calculo = _hechos_de_la_pregunta(pregunta, plan, consumo)
    prompt = ("DATOS:\n" + _hechos(plan, consumo) + ("\n" + calculo if calculo else "") +
              f"\n\nPregunta del profesor: {pregunta}\nRespuesta:")
    try:
        r = _preguntar_ia(prompt)
        r["texto"] = _limpiar(r["texto"])
        return r
    except Exception as e:
        return {"texto": "Ahora mismo no puedo conectar con la IA. " + _resumen_local(plan, prevision, consumo)
                .split("\n")[0], "origen": "local", "motivo": str(e)[:200]}


def estado() -> dict:
    """Prueba rápida de la IA (la usan probar_ia.py y /api/asistente/estado)."""
    resultado = {}
    try:
        texto, modelo = _ollama("Responde solo con: IA local funcionando.")
        resultado["ollama"] = {"ok": True, "modelo": modelo, "respuesta": texto}
    except ErrorIA as e:
        resultado["ollama"] = {"ok": False, "motivo": str(e)}
    try:
        texto = _gemini("Responde solo con: Gemini funcionando.")
        resultado["gemini"] = {"ok": True, "modelo": _modelo_que_funciona, "respuesta": texto}
    except ErrorIA as e:
        resultado["gemini"] = {"ok": False, "motivo": str(e)}
    return resultado


def _resumen_local(plan: dict, prevision: dict, consumo: dict) -> str:
    lineas = []
    escasos = [d["dia_texto"] for d in plan.get("dias", []) if d.get("escaso")]
    if escasos:
        lineas.append(f"🌥️ Poco sol: {', '.join(escasos)}. Las tablets de esos días se cargan antes.")
    faltan = [c for c in plan["clases"] if len(c["tablets_listas"]) < c["n_tablets"]]
    for c in faltan[:4]:
        lineas.append(f"⚠️ {c.get('dia_texto', '')} {c['hora']} · {c['asignatura']}: solo "
                      f"{len(c['tablets_listas'])} de {c['n_tablets']} tablets listas.")
    if not faltan:
        lineas.append(f"✅ Las {len(plan['clases'])} clases planificadas tendrán sus tablets listas.")
    cargas = [i for i in plan["instrucciones"] if i["tipo"] == "carga"]
    if cargas:
        lineas.append(f"🔌 Hay {len(cargas)} cargas programadas; la primera a las {cargas[0]['hora']}.")
    return "\n".join(lineas)

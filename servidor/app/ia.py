"""
ASISTENTE DE IA

Demo:    Gemini (API de Google, nivel gratuito). La clave va en el archivo servidor/.env
Futuro:  un modelo pequeño ejecutado en el propio servidor (p. ej. Gemma con Ollama), sin internet.

Si Gemini no responde (sin internet, sin clave, límite de uso), el asistente contesta con
un resumen generado a partir de los datos, para que la demo nunca se quede en blanco.
"""
import json
import os
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

ROL = ("Eres el asistente de Fotosíntesis, una app que ayuda a profesores de escuelas rurales con energía solar "
       "limitada a organizar la carga de las tablets. Hablas en español, con frases cortas, cálidas y sin tecnicismos. "
       "Nunca inventes datos: usa solo los que te doy.")


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


def estado() -> dict:
    """Prueba rápida de Gemini (la usa probar_gemini.py y /api/asistente/estado)."""
    try:
        texto = _gemini("Responde solo con: Gemini funcionando.")
        return {"ok": True, "modelo": _modelo_que_funciona, "respuesta": texto}
    except ErrorIA as e:
        return {"ok": False, "motivo": str(e)}


def _datos_para_ia(plan: dict, prevision: dict, consumo: dict) -> str:
    return json.dumps({
        "ahora": plan.get("inicio"),
        "previsión_hasta": prevision.get("hasta"),
        "dias": [{k: d[k] for k in ("dia_texto", "nombre", "energia_solar_wh", "escaso", "n_clases")}
                 for d in plan.get("dias", [])],
        "clases": [{k: c[k] for k in ("dia_texto", "asignatura", "hora", "actividad", "n_tablets", "consumo_pct_hora")}
                   | {"tablets_listas": len(c["tablets_listas"])} for c in plan["clases"]],
        "instrucciones": [f'{i.get("dia_texto", "")} {i["hora"]} {i["texto"]}' for i in plan["instrucciones"][:45]],
        "consumo_aprendido_pct_hora": {a: v["prevision"] for a, v in consumo.items()},
    }, ensure_ascii=False)


def resumen_del_plan(plan: dict, prevision: dict, consumo: dict) -> dict:
    prompt = ("Resume para el profesor qué tiene que hacer con las tablets hoy y los próximos días, en 4-6 frases. "
              "Menciona si algún día viene con poco sol. "
              "Empieza por lo urgente. Si alguna clase no tendrá todas las tablets, propón una alternativa "
              "pedagógica concreta.\n\nDatos: " + _datos_para_ia(plan, prevision, consumo))
    try:
        return {"texto": _gemini(prompt), "origen": "gemini"}
    except Exception as e:
        return {"texto": _resumen_local(plan, prevision, consumo), "origen": "local", "motivo": str(e)[:160]}


def responder(pregunta: str, plan: dict, prevision: dict, consumo: dict) -> dict:
    prompt = (f"Pregunta del profesor: {pregunta}\n\nResponde en 2-3 frases usando estos datos: "
              + _datos_para_ia(plan, prevision, consumo))
    try:
        return {"texto": _gemini(prompt), "origen": "gemini"}
    except Exception as e:
        return {"texto": "Ahora mismo no puedo conectar con la IA. " + _resumen_local(plan, prevision, consumo)
                .split("\n")[0], "origen": "local", "motivo": str(e)[:160]}


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

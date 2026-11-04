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
MODELO = os.environ.get("GEMINI_MODELO", "gemini-2.5-flash")

ROL = ("Eres el asistente de Fotosíntesis, una app que ayuda a profesores de escuelas rurales con energía solar "
       "limitada a organizar la carga de las tablets. Hablas en español, con frases cortas, cálidas y sin tecnicismos. "
       "Nunca inventes datos: usa solo los que te doy.")


def _gemini(prompt: str) -> str:
    clave = os.environ.get("GEMINI_API_KEY", "")
    if not clave:
        raise RuntimeError("Falta GEMINI_API_KEY en servidor/.env")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODELO}:generateContent"
    r = httpx.post(url, params={"key": clave}, timeout=30, json={
        "system_instruction": {"parts": [{"text": ROL}]},
        "contents": [{"parts": [{"text": prompt}]}],
    })
    r.raise_for_status()
    return r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()


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
        return {"texto": _resumen_local(plan, prevision, consumo), "origen": "local", "motivo": str(e)[:120]}


def responder(pregunta: str, plan: dict, prevision: dict, consumo: dict) -> dict:
    prompt = (f"Pregunta del profesor: {pregunta}\n\nResponde en 2-3 frases usando estos datos: "
              + _datos_para_ia(plan, prevision, consumo))
    try:
        return {"texto": _gemini(prompt), "origen": "gemini"}
    except Exception as e:
        return {"texto": "Ahora mismo no puedo conectar con la IA. " + _resumen_local(plan, prevision, consumo)
                .split("\n")[0], "origen": "local", "motivo": str(e)[:120]}


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

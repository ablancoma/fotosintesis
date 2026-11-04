# 🌱 Fotosíntesis — Hack4Edu 2026 · Reto 02 «Aprender sin conexión»

> **La escuela que convierte la luz en aprendizaje.**
> Mide la batería de cada tablet, mira el sol de mañana y le dice al profesor qué enchufar, cuándo y cuánto
> tiempo, para que las tablets lleguen cargadas a clase. Funciona sin internet.

## Arquitectura

```
 Tablets de alumnos ──wifi local──► Servidor (Ubuntu / Mac) ◄──wifi local── Móvil del profesor
  app Android (modo tablet)          Python + FastAPI + SQLite              app Android (modo profesor)
```

## Carpetas

| Carpeta | Qué es |
|---|---|
| [`servidor/`](servidor/README.md) | **Servidor** en Python: API, planificador, aprendizaje del consumo, previsión, Gemini y simulador |
| [`app-android/`](app-android/README.md) | **App Android** en Kotlin (modos tablet y profesor) |
| [`GUIA_DEFENSA.md`](GUIA_DEFENSA.md) | Cómo explicar y defender cada decisión ante el jurado |
| `frontend/`, `planificador/`, `ia/`, `shared/`, `sw.js` | Primer prototipo web (versión anterior, solo de referencia) |

## Poner en marcha la demo (3 pasos)

**1. Servidor** (en el Mac o en el Ubuntu):
```bash
cd servidor
python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
cp env.ejemplo .env        # pon la clave de Gemini
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

**2. Tablets simuladas** (otra terminal):
```bash
cd servidor && source .venv/bin/activate && python simulador.py
```

**3. App Android**: abre `app-android` en Android Studio → ▶️ Run.
- Emulador → modo **Tablet** (servidor `10.0.2.2:8000`).
- Vuestro móvil → modo **Profesor** (servidor = IP del Mac, misma wifi).

## Guion de la demo (2 minutos)
1. **Tablet**: el emulador muestra «T26 · 80 %». En *Extended controls → Battery* bajamos al 15 %.
2. **Profesor → Tablets**: aparece T26 en rojo junto a las otras 25.
3. **Profesor → Plan**: 3 clases listas e instrucciones: *«07:00 · Enchufa T03, T05… durante 1 h»*.
4. Activamos **☁️ Día nublado** y **desactivamos la batería de almacenamiento** en Ajustes →
   *«⚠️ Matemáticas: solo 9 de 20 tablets listas. Trabajad en grupos de 3»*.
5. La volvemos a activar → la batería de la escuela salva el día.
6. **Asistente**: *«¿Qué tablets cargo primero?»* → Gemini responde.
7. **Ajustes → 📱 Descargar con mi móvil**: el profesor trae la previsión real con sus datos.

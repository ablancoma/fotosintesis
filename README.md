<img src="marca/logo-horizontal-oscuro.svg" alt="Fotosíntesis" width="420">

# Hack4Edu 2026 · Reto 02 «Aprender sin conexión»

> **Que la batería no decida cuánto aprendes.**
> Mide la batería de cada tablet, mira el sol de mañana y le dice al profesor qué enchufar, cuándo y cuánto
> tiempo, para que las tablets lleguen cargadas a clase. Funciona sin internet.

## Arquitectura

```
 Tablets de alumnos ──wifi local──► ORDENADOR (Ubuntu / Mac) ◄──wifi local── Móvil del profesor
  app Android (modo tablet)          servidor Python + app de escritorio    app Android: trae la previsión
                                     del profesor (lo principal)            y marca instrucciones
```

## Carpetas

| Carpeta | Qué es |
|---|---|
| [`servidor/`](servidor/README.md) | **Servidor** en Python + **app de escritorio del profesor** (`servidor/panel/`): API, planificador, aprendizaje del consumo, previsión, IA local (Gemma con Ollama) y simulador |
| [`app-android/`](app-android/README.md) | **App Android** en Kotlin (modos tablet y profesor) |
| [`GUIA_DEFENSA.md`](GUIA_DEFENSA.md) | Cómo explicar y defender cada decisión ante el jurado |
| [`marca/`](marca/README.md) | Logo (sol y hoja), icono, colores, fuente y lema |
| `frontend/`, `planificador/`, `ia/`, `shared/`, `sw.js` | Primer prototipo web (versión anterior, solo de referencia) |

## Poner en marcha la demo

**1. Primera vez** (en la Terminal):
```bash
cd servidor
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-escritorio.txt
cp env.ejemplo .env
```

**IA local** (una vez): descarga [Ollama](https://ollama.com), ábrelo y ejecuta:
```bash
ollama pull gemma4:e2b     # unos minutos; después funciona sin internet
```

**2. App de escritorio** (arranca también el servidor):
```bash
cd servidor && source .venv/bin/activate && python escritorio.py
```

**3. Tablets simuladas** (otra pestaña de la Terminal):
```bash
cd servidor && source .venv/bin/activate && python simulador.py
```

**4. App Android**: abre `app-android` en Android Studio → ▶️ Run.
- Emulador → **Tablet de alumnos** (servidor `10.0.2.2:8000`).
- Móvil → **Móvil del profesor** (servidor = la dirección que sale en Ajustes de la app de escritorio).

## Guion de la demo (2 minutos)
1. **Escritorio → Instrucciones**: el siguiente paso en grande (*«Mañana 07:00 · Enchufa 6 tablets»*) y las
   instrucciones por días (Mañana, Viernes, Lunes…). Aviso: *«Viernes viene con poco sol: sus tablets se cargan antes»*.
2. **Móvil → Traer previsión**: el profesor descarga 7 días de tiempo con sus datos. En **Escritorio → Previsión** se ve
   hasta qué día hay previsión y el sol de cada día, con las cargas y clases del plan sobre la curva.
3. **Escritorio → Horario**: añade una clase *solo para el viernes* (o para todos los días) → el plan se recalcula.
4. **Ajustes**: responde «No tenemos» batería → aparecen más instrucciones y avisos. Vuelve a «Sí» → se salva.
5. **Emulador** (*Extended controls → Battery*): baja la batería al 15 % → aparece en **Tablets**.
6. **Botón 💬 Asistente** (abajo a la derecha): *«¿Qué día hay menos sol?»* → responde la IA local (Gemma), sin internet.

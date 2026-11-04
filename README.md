# 🌱 Fotosíntesis — Hack4Edu 2026 · Reto 02 «Aprender sin conexión»

> **La escuela que convierte la luz en aprendizaje.**
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
| [`servidor/`](servidor/README.md) | **Servidor** en Python + **app de escritorio del profesor** (`servidor/panel/`): API, planificador, aprendizaje del consumo, previsión, Gemini y simulador |
| [`app-android/`](app-android/README.md) | **App Android** en Kotlin (modos tablet y profesor) |
| [`GUIA_DEFENSA.md`](GUIA_DEFENSA.md) | Cómo explicar y defender cada decisión ante el jurado |
| `frontend/`, `planificador/`, `ia/`, `shared/`, `sw.js` | Primer prototipo web (versión anterior, solo de referencia) |

## Poner en marcha la demo

**1. Primera vez** (en la Terminal):
```bash
cd servidor
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-escritorio.txt
cp env.ejemplo .env        # pon la clave de Gemini (opcional)
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
1. **Escritorio → Mañana**: el arco solar del día, el siguiente paso en grande (*«06:00 · Enchufa 6 tablets»*) y las clases listas.
2. **Móvil → Traer previsión**: el profesor descarga el tiempo real con sus datos y el plan se recalcula en el ordenador.
3. **Escritorio**: pulsa **☁️ Día nublado** y en **Ajustes** apaga la batería de almacenamiento →
   *«⚠️ Faltan tablets en Matemáticas: solo 9 de 20. Trabajad en grupos de 3»*. Vuelve a encenderla → se salva el día.
4. **Emulador** (*Extended controls → Battery*): baja la batería al 15 % → aparece en **Tablets** del escritorio.
5. **Móvil o escritorio**: marca *Hecho* en el siguiente paso → pasa al siguiente.
6. **Asistente**: *«¿Qué tablets cargo primero?»* → responde Gemini.

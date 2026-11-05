<p align="center">
  <img src="servidor/panel/icono.svg" alt="Fotosíntesis" width="120">
</p>

<h1 align="center">Fotosíntesis</h1>
<p align="center"><b>Que la batería no decida cuánto aprendes.</b><br>
Hack4Edu 2026 · Reto 02 «Aprender sin conexión» · Universidad Pontificia de Salamanca</p>

---

## El problema

En muchas escuelas rurales que reciben tablets educativas, la electricidad llega de unos pocos paneles solares
y no hay internet. Las tablets se cargan a ojo: cada mañana alguien revisa las baterías una por una y, aun así,
muchas no están listas cuando empieza la clase. El sol del mediodía se desperdicia y se pierden horas de clase.

## La solución

Fotosíntesis **planifica la carga de las tablets con la energía solar** y le dice al profesor
**qué tablets enchufar, cuándo y durante cuánto tiempo**, para que lleguen cargadas a cada clase.
**Todo funciona sin internet**, incluida la inteligencia artificial.

```
 Tablets de alumnos ──wifi local──►  ORDENADOR DE LA ESCUELA  ◄──wifi local── Móvil del profesor
 (app Android, modo tablet)          servidor + app de escritorio            (app Android, modo profesor)
 · leen su batería real              · guarda las baterías                   · trae la previsión del tiempo
 · la envían cada 15 minutos         · aprende cuánto gasta cada clase         con sus datos móviles
                                     · calcula el plan de carga semanal      · sigue y marca las instrucciones
                                     · asistente con IA local (sin internet)
```

Basta un router wifi aunque no tenga conexión a internet. No se guarda ningún dato personal de los alumnos:
solo un identificador por tablet y su batería.

## Qué hace

- **Instrucciones concretas.** Por ejemplo: «08:00 · Enchufa T01, T06 y T16 durante 30 minutos». El profesor las
  marca como hechas y aparece el siguiente paso.
- **Plan para toda la semana.** Cruza la batería de cada tablet, el horario de clases y la previsión solar
  (Open-Meteo). Si viene un día nublado, adelanta las cargas a los días de sol.
- **Realista.** Nunca pide enchufar más tablets que enchufes hay. Solo da instrucciones mientras el profesor está
  en la escuela. Aprovecha la batería de la escuela, si la hay.
- **Aprende el consumo.** Empieza con un valor estimado por tipo de actividad (lectura, ejercicios, vídeo, juego)
  y lo ajusta con lo que gastan de verdad las tablets en cada clase.
- **Ajustes para un profesor, no para un técnico.** Preguntas sencillas («¿Cuántos paneles tenéis?», «¿Tenéis
  batería?»), y el plan se recalcula solo.
- **Asistente con IA local.** Gemma 4 con Ollama, en el propio ordenador y sin internet. Explica el plan y
  responde preguntas como «¿Puedo poner un vídeo en Lectura esta tarde?». Los cálculos los hace la app; la IA solo
  los explica.

## Estructura del repositorio

| Carpeta | Qué contiene |
|---|---|
| [`servidor/`](servidor) | **Ordenador de la escuela.** Servidor en Python (FastAPI + SQLite) con el planificador, el aprendizaje del consumo, la previsión y la IA local. Incluye la **app de escritorio del profesor** (`servidor/panel/`) y un simulador de tablets para la demo. |
| [`app-android/`](app-android) | **App Android** (Kotlin + Jetpack Compose) con dos modos: **tablet de alumnos** (envía su batería) y **móvil del profesor** (trae la previsión y sigue las instrucciones). |

## Tecnologías

| Parte | Tecnología |
|---|---|
| Servidor | Python 3, FastAPI, Uvicorn, SQLite, httpx |
| App de escritorio | HTML, CSS y JavaScript en una ventana nativa con pywebview, fuente Lexend incluida (sin internet) |
| App Android | Kotlin, Jetpack Compose, WorkManager (envío cada 15 min en segundo plano), BatteryManager, OkHttp |
| Previsión solar | Open-Meteo (radiación solar hora a hora, gratuita y sin registro) |
| IA local | Ollama + Gemma 4 (`gemma4:e2b`). Gemini es opcional si hay internet. Si no hay ninguna IA, la app genera un resumen automático. |

## Cómo ejecutarlo

### 1. Ordenador de la escuela (servidor + app de escritorio)

Requisitos: Python 3.10 o superior.

```bash
cd servidor
python3 -m venv .venv
source .venv/bin/activate            # en Windows: .venv\Scripts\activate
pip install -r requirements.txt -r requirements-escritorio.txt
cp env.ejemplo .env
python escritorio.py                 # abre la app de escritorio y arranca el servidor
```

La API queda en `http://localhost:8000`, con la documentación interactiva en `/docs`.

### 2. Tablets simuladas (para probar sin tablets)

En otra terminal:

```bash
cd servidor && source .venv/bin/activate
python simulador.py
```

### 3. IA local (opcional, recomendada)

Instala [Ollama](https://ollama.com), ábrelo y descarga el modelo una vez:

```bash
ollama pull gemma4:e2b
cd servidor && source .venv/bin/activate && python probar_ia.py
```

### 4. App Android

Abre `app-android` en Android Studio y pulsa ▶ Run. En la app elige el modo:

- **Tablet de alumnos.** En el emulador, servidor `10.0.2.2:8000`.
- **Móvil del profesor.** La dirección que muestra la app de escritorio en *Ajustes → Conectar tablets*. El móvil y el
  ordenador tienen que estar en la misma wifi.

## Siguientes pasos

1. Detectar automáticamente cuándo se conecta una tablet a la corriente, sin confirmar cada instrucción a mano.
2. Sistemas de carga inteligentes que activen y detengan las cargas solos (por ejemplo, un maletín de carga
   inalámbrica).
3. Llevar el servidor a un equipo de bajo consumo, como una Raspberry Pi.

---

<p align="center">Proyecto desarrollado en el hackathon <b>Hack4Edu 2026</b> (ProFuturo · Universidad Pontificia de Salamanca).</p>

# 🖥️ Servidor y app de escritorio de Fotosíntesis (Python + FastAPI)

Recibe la batería de las tablets, guarda el horario y la previsión, calcula el plan de carga,
genera las instrucciones para el profesor y habla con Gemini. Además sirve la **app de escritorio
del profesor** (carpeta `panel/`), que es la pantalla principal del sistema.

## App de escritorio (lo normal)

```bash
cd servidor
source .venv/bin/activate
pip install -r requirements-escritorio.txt   # solo la primera vez
python escritorio.py
```
Abre una ventana propia con la app y arranca el servidor por detrás. Si `pywebview` no está instalado,
la abre en el navegador (también funciona en **http://localhost:8000**).

## Arrancar solo el servidor (sin ventana)

```bash
cd servidor
python3 -m venv .venv            # solo la primera vez
source .venv/bin/activate
pip install -r requirements.txt  # solo la primera vez

uvicorn app.main:app --host 0.0.0.0 --port 8000
```

- `--host 0.0.0.0` es importante: permite que las tablets de la red local se conecten.
- Abre **http://localhost:8000/docs** para ver y probar toda la API desde el navegador.
- La IP que hay que escribir en las tablets sale en **http://localhost:8000/api/info**.

## Gemini (asistente de IA)

```bash
cp env.ejemplo .env      # y pon tu clave de https://aistudio.google.com/apikey
```
Sin clave, el asistente responde con un resumen sencillo generado a partir de los datos.

## Simulador de tablets (para la demo)

En otra terminal (con el servidor arrancado):
```bash
source .venv/bin/activate
python simulador.py                 # 25 tablets, una lectura cada 10 s
python simulador.py --una-vez       # una sola lectura de cada una
```

## Empezar de cero
Para la demo conviene borrar `fotosintesis.db` antes: al arrancar se crean solos los datos iniciales
(escuela de Chiwamba en Malawi, 3 clases y el historial de consumo).

## Archivos

| Archivo | Qué hace |
|---|---|
| `escritorio.py` | Abre la app de escritorio en su propia ventana (y arranca el servidor) |
| `panel/` | La app de escritorio: `index.html`, `estilos.css`, `app.js` |
| `app/main.py` | La API: todas las direcciones (`/api/...`) |
| `app/planificador.py` | Simula mañana en franjas de 15 min y genera las instrucciones de carga |
| `app/consumo.py` | Mide el consumo real de cada clase y aprende por tipo de actividad |
| `app/meteo.py` | Previsión de Open-Meteo (descargada por el servidor o traída por el profesor) |
| `app/ia.py` | Asistente con Gemini (y respuesta de respaldo si no hay conexión) |
| `app/db.py` | Base de datos SQLite (un archivo: `fotosintesis.db`) |
| `app/datos_demo.py` | Datos iniciales estimados |
| `simulador.py` | Finge ser 25 tablets para la demo |

## API principal

| Método | Dirección | Para qué |
|---|---|---|
| POST | `/api/tablets/registro` | La tablet se registra y recibe su nombre (T01…) |
| POST | `/api/lecturas` | La tablet envía una o varias lecturas de batería |
| GET | `/api/tablets` | Panel: última batería de cada tablet |
| GET/POST/PUT/DELETE | `/api/clases` | Horario |
| GET/PATCH | `/api/config` | Datos de la escuela (panel, batería, enchufes…) |
| GET/POST | `/api/prevision` | Ver / recibir la previsión (del móvil del profesor) |
| POST | `/api/prevision/actualizar` | El servidor descarga la previsión él mismo |
| GET | `/api/plan?nublado=false` | Plan de mañana con instrucciones |
| POST | `/api/plan/recalcular` | Recalcular con las baterías actuales |
| POST/DELETE | `/api/instrucciones/{id}/hecha` | Marcar / desmarcar una instrucción |
| GET | `/api/consumo` | Consumo estimado vs. aprendido por actividad |
| GET | `/api/asistente/resumen` | Resumen del plan (Gemini) |
| POST | `/api/asistente/preguntar` | Preguntar al asistente |

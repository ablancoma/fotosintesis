# 🛡️ Guía para defender Fotosíntesis ante el jurado

## La idea en 20 segundos
> En las escuelas rurales con paneles solares, el problema no es tener tablets: es que **lleguen cargadas a clase**.
> Fotosíntesis mide la batería de cada tablet, mira el sol de mañana y le dice al profesor
> **qué enchufar, cuándo y cuánto tiempo**, y qué tablets repartir en cada clase.

## Cómo funciona (el dibujo que hay que saber explicar)

```
 Tablets de alumnos ──wifi local──► ORDENADOR de la escuela ◄──wifi local── Móvil del profesor
  (app Android)                     · servidor: guarda baterías,       (misma app, modo profesor)
  · lee su batería                    aprende el consumo, calcula      · trae la previsión con sus
  · la envía cada 15 min              el plan, habla con la IA           datos móviles
                                    · APP DE ESCRITORIO del profesor   · marca las instrucciones
                                      (la pantalla principal)            desde el aula
```
**No necesita internet** para funcionar. Internet solo se usa a ratos: para la previsión (que trae el
móvil del profesor) y para Gemini.

---

## Las herramientas y por qué las elegimos

### App Android — **Kotlin + Jetpack Compose**
- **Qué es:** Kotlin es el lenguaje oficial de Android desde 2019. Compose es la forma moderna de dibujar pantallas.
- **Por qué:** las tablets de ProFuturo son Android. Es la opción recomendada por Google y la que menos código necesita.
- **Pregunta probable:** *¿Por qué no una web?* → Una app puede leer la batería del sistema y seguir enviándola
  **con la app cerrada**. Una web no.

### Lectura de batería — **BatteryManager** (API de Android)
- Android avisa del estado de la batería: %, si está cargando, temperatura.
- No pedimos ningún permiso especial ni guardamos datos de alumnos: **solo un identificador por tablet**
  (las tablets son compartidas).

### Envío en segundo plano — **WorkManager**
- La herramienta oficial de Android para tareas periódicas. Respeta el ahorro de batería del sistema.
- **Pregunta probable:** *¿Por qué cada 15 minutos?* → Es el mínimo que permite Android para tareas periódicas,
  y es suficiente: la batería no cambia tan rápido. Además gasta muy poca batería.
- Si no hay red, las lecturas **se guardan en la tablet** y se envían todas juntas después.

### Comunicación — **HTTP REST + JSON por wifi local**
- El estándar más sencillo: la tablet "envía un mensaje" al servidor con su batería.
- Funciona con un router wifi barato **sin conexión a internet**.
- Alternativa que conocemos: **MQTT** (típico en IoT). La dejamos como mejora para escuelas con muchas tablets.

### Servidor — **Python + FastAPI**
- **Python:** el lenguaje de referencia en datos e inteligencia artificial → encaja con la IA local futura.
- **FastAPI:** framework moderno y rápido; genera solo la documentación de la API (`/docs`), útil para que
  otros equipos se integren.
- Corre en cualquier ordenador Ubuntu, y en el futuro en una **Raspberry Pi** (5 W, unos 60 €).

### App de escritorio del profesor — **HTML + pywebview**
- Es la **pantalla principal**: plan de mañana con el arco solar, siguiente paso, tablets, horario, asistente y ajustes.
- La sirve el propio servidor y se abre en una **ventana nativa** con `pywebview` (usa el motor web del sistema:
  WebKit en Mac, WebKitGTK en Ubuntu). No necesita internet ni instalar nada en otros ordenadores.
- **Pregunta probable:** *¿Por qué no una app nativa de escritorio?* → Así una sola interfaz funciona en Mac, Ubuntu
  y Windows, y cualquier ordenador de la escuela en la misma wifi puede abrirla.
- **Diseño:** lenguaje visual de iOS/macOS (fondo gris de sistema, listas agrupadas, colores de sistema, modo
  oscuro). Las instrucciones son lo más visible: el **siguiente paso** en grande con un botón *Hecho*.

### Base de datos — **SQLite**
- Un único archivo, sin instalar nada ni necesitar un técnico. Ideal para una escuela.

### Previsión del tiempo — **Open-Meteo**
- Gratis, sin registro, da la **radiación solar hora a hora** (lo que de verdad importa para un panel).
- **Dos caminos:** el servidor la descarga si tiene internet, o el **móvil del profesor** la descarga con sus
  datos móviles y se la pasa al servidor al llegar a la escuela. Se guardan 7 días: si un día no hay conexión,
  se usa lo guardado.

### Asistente — **Gemini** hoy, **IA local** mañana
- **Hoy (demo):** Gemini (Google) resume el plan en lenguaje sencillo y responde preguntas del profesor.
- **Futuro:** un modelo pequeño como **Gemma** ejecutado con **Ollama** en el propio servidor, **sin internet**.
  O **Gemini Nano**, que va dentro de los móviles Android recientes.
- Si Gemini no responde, la app muestra igualmente un resumen generado con los datos: nunca se queda en blanco.

---

## La "inteligencia" del sistema (aunque no haya internet)

### 1. Aprende cuánto gasta cada clase
- Al principio usa un valor estimado por tipo de actividad: lectura 8 %/h, ejercicios 10 %/h, vídeo 15 %/h, juego 20 %/h.
- Cuando acaba una clase, mira cuánto bajó la batería de las tablets → **consumo real**.
- Mezcla los dos según la confianza: `previsión = estimado·3/(n+3) + medido·n/(n+3)`
  (con 0 clases manda lo estimado; con 3, mitad y mitad; con 10, casi todo lo aprendido).
- **Frase:** *"El primer día usa una estimación; cada clase la hace más precisa. Así se adapta a las baterías
  gastadas de cada escuela."*

### 2. Planifica la carga (algoritmo voraz)
- Simula mañana en **franjas de 15 minutos**.
- En cada franja calcula la energía del panel (previsión × potencia × eficiencia), resta lo que gasta el servidor
  y la reparte **primero entre las tablets que tienen clase antes**.
- Respeta cuántos **enchufes** hay y la **potencia del cargador**.
- Lo que sobra de sol va a la **batería de almacenamiento** (si la escuela tiene); se usa para cargar a primera hora.
- Para cada clase elige las **tablets más cargadas** (son compartidas).
- **Pregunta probable:** *¿Es la solución óptima?* → No necesariamente; es un algoritmo voraz: rápido, explicable
  y suficiente. La mejora natural es plantearlo como **programación lineal** (maximizar tablets listas sujeto a la
  energía disponible), que conocemos de la carrera.

### 3. Da instrucciones concretas
> *07:00 · Enchufa T03, T05, T08 durante 1 h (con sol)*
> *08:45 · Para Matemáticas reparte: T02, T04, T07…*
> *⚠️ Matemáticas: solo 9 de 20 tablets estarán listas. Trabajad en grupos de 3.*

El profesor las marca como hechas. No hace falta hardware extra (los enchufes inteligentes serían el siguiente paso).

---

## Preguntas difíciles y respuestas

| Pregunta | Respuesta |
|---|---|
| ¿Y si no hay wifi en la escuela? | Basta un router barato sin internet. Las tablets guardan las lecturas y las envían cuando hay red. |
| ¿Y si no hay internet nunca? | Todo funciona: plan, instrucciones, aprendizaje. Solo se pierde Gemini (y con IA local, tampoco). La previsión la trae el profesor con su móvil. |
| ¿El servidor no gasta energía? | Sí, y lo restamos en el plan. Un ordenador gasta ~30 W; una Raspberry Pi, 5 W. |
| ¿Privacidad de los alumnos? | No guardamos ningún dato personal: solo un identificador por tablet y su batería. |
| ¿Y si el profesor tiene iPhone? | Hoy es Android. La app se puede llevar a iPhone con Compose Multiplatform (mismo lenguaje). |
| ¿Cuánto cuesta? | El software es gratuito y abierto. El hardware ya existe (tablets de ProFuturo); como mucho, una Raspberry Pi y un router. |
| ¿Qué datos son reales? | La batería se lee de verdad de Android. Panel, cargador y capacidad son estimados y configurables. En la demo hay tablets simuladas para llenar el panel. |
| ¿Cómo escala? | Un servidor por escuela. En el futuro, los servidores pueden enviar datos agregados a ProFuturo para comparar escuelas. |

## Siguientes pasos (para el cierre del pitch)
1. IA local (Gemma + Ollama) en una Raspberry Pi → **cero dependencia de internet**.
2. Enchufes inteligentes → la app enciende y apaga la carga sola.
3. Optimización con programación lineal.
4. Panel para ProFuturo con datos de todas las escuelas.

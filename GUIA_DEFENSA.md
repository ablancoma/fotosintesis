# 🛡️ Guía para defender Fotosíntesis ante el jurado

## Marca
**El sol detrás de una hoja**, sobre verde noche, con la fuente Lexend (ver `marca/README.md`). Lema: **«Que la batería no decida cuánto aprendes»**.

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
móvil del profesor). La IA va en el propio ordenador.

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
- **Python:** el lenguaje de referencia en datos e inteligencia artificial → encaja con la IA local.
- **FastAPI:** framework moderno y rápido; genera solo la documentación de la API (`/docs`), útil para que
  otros equipos se integren.
- Corre en cualquier ordenador Ubuntu, y en el futuro en una **Raspberry Pi** (5 W, unos 60 €).

### App de escritorio del profesor — **HTML + pywebview**
- Es la **pantalla principal**: instrucciones de mañana (lo más importante), previsión día a día con el arco solar,
  tablets, horario, asistente y ajustes de la escuela con preguntas sencillas.
- La sirve el propio servidor y se abre en una **ventana nativa** con `pywebview` (usa el motor web del sistema:
  WebKit en Mac, WebKitGTK en Ubuntu). No necesita internet ni instalar nada en otros ordenadores.
- **Pregunta probable:** *¿Por qué no una app nativa de escritorio?* → Así una sola interfaz funciona en Mac, Ubuntu
  y Windows, y cualquier ordenador de la escuela en la misma wifi puede abrirla.
- **Diseño:** la estética de la marca: fondo verde noche, acento lima y amarillo sol, iconos de línea y la fuente
  **Lexend**, pensada para leer con facilidad e incluida en la app (no necesita internet). Las instrucciones son lo más visible: el **siguiente paso** en grande con un botón *Hecho*.
- **Ajustes pensados para un profesor, no para un técnico:** en vez de pedir vatios y vatios-hora, pregunta
  «¿cuántos paneles tenéis?», «¿tenéis batería?», «¿cuántas tablets tenéis y cuántas podéis cargar a la vez?» y
  muestra al momento cuántas tablets se pueden cargar en un día de sol con esa instalación. Si se añaden tablets,
  aparecen en el panel como «pendientes de conectar» hasta que se instala la app en ellas.

### Base de datos — **SQLite**
- Un único archivo, sin instalar nada ni necesitar un técnico. Ideal para una escuela.

### Previsión del tiempo — **Open-Meteo**
- Gratis, sin registro, da la **radiación solar hora a hora** (lo que de verdad importa para un panel).
- **Dos caminos:** el servidor la descarga si tiene internet, o el **móvil del profesor** la descarga con sus
  datos móviles y se la pasa al servidor al llegar a la escuela. Se guardan 7 días: si un día no hay conexión,
  se usa lo guardado.

### Asistente — **IA local: Gemma con Ollama**, sin internet
- **Gemma 4** (modelo abierto de Google, versión pequeña E2B) se ejecuta con **Ollama** en el propio ordenador de la
  escuela. Resume el plan en lenguaje sencillo y responde las preguntas del profesor **sin conexión y gratis**.
- **Por qué local y no en la nube:** el reto es *aprender sin conexión*; una IA en la nube falla justo donde más se
  necesita. Además los datos no salen de la escuela y no hay coste por uso.
- **Gemini** (en la nube) queda como opción si hay internet y clave. En el futuro, **Gemini Nano** dentro de los
  móviles Android recientes.
- Si ninguna IA responde, la app muestra igualmente un resumen generado con los datos: nunca se queda en blanco.
- **Pregunta probable:** *¿Una IA tan pequeña es fiable?* → No calcula nada: el plan lo hace el algoritmo; la IA solo lo
  explica con palabras sencillas y recibe los datos ya calculados, así que no tiene que inventar.

---

## La "inteligencia" del sistema (aunque no haya internet)

### 1. Aprende cuánto gasta cada clase
- Al principio usa un valor estimado por tipo de actividad: lectura 8 %/h, ejercicios 10 %/h, vídeo 15 %/h, juego 20 %/h.
- Cuando acaba una clase, mira cuánto bajó la batería de las tablets → **consumo real**.
- Mezcla los dos según la confianza: `previsión = estimado·3/(n+3) + medido·n/(n+3)`
  (con 0 clases manda lo estimado; con 3, mitad y mitad; con 10, casi todo lo aprendido).
- **Frase:** *"El primer día usa una estimación; cada clase la hace más precisa. Así se adapta a las baterías
  gastadas de cada escuela."*

### 2. Planifica la carga de toda la previsión (algoritmo voraz)
- Simula **desde ahora hasta el último día con previsión** (hasta 7 días), seguido, en **franjas de 15 minutos**:
  la batería de cada tablet y la de la escuela pasan de un día a otro.
- **Mira hacia delante:** si viene un día con poco sol, las tablets que se usarán ese día se cargan al 100 % en los
  días de sol anteriores (la instrucción lo dice: *«se adelanta la carga porque viene un día con poco sol»*).
- **Realista:** solo da instrucciones cuando el profesor está en la escuela (hora de llegada y salida en Ajustes)
  y nunca pide enchufar más tablets que enchufes hay. El fin de semana solo se carga la batería de la escuela.
- **Horario por días:** cada clase puede ser de un día concreto o repetirse todos los días laborables.
- En cada franja calcula la energía del panel (previsión × potencia × eficiencia) y la reparte **primero entre las
  tablets que tienen clase antes**. El consumo del ordenador servidor es despreciable y no se cuenta.
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
| ¿Y si no hay internet nunca? | Todo funciona: plan, instrucciones, aprendizaje. También el asistente: la IA va en el propio ordenador. La previsión la trae el profesor con su móvil. |
| ¿El servidor no gasta energía? | Muy poca comparada con las tablets, así que no la contamos. En el futuro puede ser una Raspberry Pi (5 W). |
| ¿Privacidad de los alumnos? | No guardamos ningún dato personal: solo un identificador por tablet y su batería. |
| ¿Y si el profesor tiene iPhone? | Hoy es Android. La app se puede llevar a iPhone con Compose Multiplatform (mismo lenguaje). |
| ¿Cuánto cuesta? | El software es gratuito y abierto. El hardware ya existe (tablets de ProFuturo); como mucho, una Raspberry Pi y un router. |
| ¿Qué datos son reales? | La batería se lee de verdad de Android. Panel, cargador y capacidad son estimados y configurables. En la demo hay tablets simuladas para llenar el panel. |
| ¿Cómo escala? | Un servidor por escuela. En el futuro, los servidores pueden enviar datos agregados a ProFuturo para comparar escuelas. |

## Siguientes pasos (para el cierre del pitch)
1. Llevar el servidor con la IA local a una Raspberry Pi o un mini PC de bajo consumo.
2. Enchufes inteligentes → la app enciende y apaga la carga sola.
3. Optimización con programación lineal.
4. Panel para ProFuturo con datos de todas las escuelas.

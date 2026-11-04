# 📱 App Android Fotosíntesis (Kotlin + Jetpack Compose)

Una sola app con dos modos:
- **Tablet de alumnos**: lee la batería con la API de Android y la envía al servidor cada 15 min.
- **Profesor**: panel de tablets, plan e instrucciones de carga, horario, asistente y previsión.

## Abrir y ejecutar

1. Android Studio → **Open** → elige la carpeta `app-android`.
2. Espera a que termine *Gradle sync* (la primera vez descarga cosas: unos minutos).
   - Si ofrece actualizar Gradle o el plugin de Android, puedes decir **"Don't remind me"**: no hace falta.
3. Crea un emulador si no tienes: **Device Manager → +** → *Pixel Tablet* (o cualquiera) con Android 14.
4. Pulsa ▶️ **Run**.

## Conectar con el servidor

| Dónde corre la app | Qué escribir como servidor |
|---|---|
| Emulador en el mismo Mac que el servidor | `10.0.2.2:8000` (viene puesto por defecto) |
| Móvil o tablet real | La IP del ordenador servidor, p. ej. `192.168.1.50:8000` (sale en `/api/info`) |

El móvil y el servidor tienen que estar en la **misma wifi**.

## Truco para la demo: cambiar la batería del emulador

Emulador → botón **⋯ (Extended controls)** → **Battery**:
- Mueve **Charge level** (p. ej. del 80% al 15%).
- Cambia **Charger connection** a *AC charger* para simular que se enchufa.

La tablet lo envía en 20 segundos (mientras la pantalla está abierta) y el panel del profesor lo muestra.

## Ver dos modos a la vez
- **Emulador** en modo *Tablet* y **vuestro móvil Android** en modo *Profesor* (con la IP del Mac).
- O dos emuladores (uno de cada modo), si el Mac va sobrado.

## Archivos

| Archivo | Qué hace |
|---|---|
| `MainActivity.kt` | Elige qué pantalla mostrar según el modo |
| `PantallaInicio.kt` | Dirección del servidor y elección de modo |
| `data/Bateria.kt` | Lee la batería (BatteryManager de Android) |
| `data/ColaLecturas.kt` | Guarda lecturas si no hay conexión y las envía después |
| `data/Api.kt` | Todas las llamadas al servidor (OkHttp + JSON) |
| `data/Preferencias.kt` | Lo que la app recuerda: modo, servidor, nombre de la tablet |
| `tablet/EnvioBateria.kt` | Envío cada 15 min con WorkManager |
| `tablet/PantallaTablet.kt` | Pantalla del modo tablet |
| `profesor/*.kt` | Las cinco pestañas del modo profesor |

## Si algo falla al compilar
Copia el error de la pestaña **Build** (abajo en Android Studio) y pásaselo a Claude.

package com.fotosintesis.app.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

// ============================================================================
//  Datos que llegan del servidor (versión simplificada de su JSON)
// ============================================================================
data class TabletEstado(
    val id: String,
    val bateria: Double?,
    val cargando: Boolean,
    val temperatura: Double?,
    val estado: String,                // "ok" | "sin_datos"
    val minutosDesdeLectura: Int?,
    val simulada: Boolean
)

data class ClaseHorario(
    val id: Int,
    val asignatura: String,
    val horaInicio: String,
    val duracionMin: Int,
    val actividad: String,
    val nTablets: Int
)

data class ClasePlan(
    val asignatura: String,
    val hora: String,
    val actividad: String,
    val consumoPctHora: Double,
    val nTablets: Int,
    val listas: Int
)

data class Instruccion(
    val id: String,
    val hora: String,
    val tipo: String,                  // "carga" | "clase" | "aviso"
    val texto: String,
    val hecha: Boolean
)

data class Plan(
    val dia: String,
    val energiaSolarWh: Int,
    val solarPorHora: List<Double>,
    val clases: List<ClasePlan>,
    val instrucciones: List<Instruccion>,
    val fuentePrevision: String,
    val origenPrevision: String?,
    val calculado: String
)

data class ConsumoActividad(val actividad: String, val defecto: Double, val prevision: Double, val muestras: Int)

data class RespuestaIA(val texto: String, val origen: String)

// ============================================================================
//  Cliente HTTP del servidor Fotosíntesis
// ============================================================================
class Api(private val baseUrl: String) {

    private val cliente = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(40, TimeUnit.SECONDS)      // Gemini puede tardar unos segundos
        .build()
    private val json = "application/json; charset=utf-8".toMediaType()

    // ---------------- llamadas básicas ----------------
    private suspend fun peticion(metodo: String, ruta: String, cuerpo: String? = null): String =
        withContext(Dispatchers.IO) {
            // GET y DELETE van sin cuerpo; POST y PATCH siempre llevan uno (aunque sea "{}")
            val body = when (metodo) {
                "GET", "DELETE" -> null
                else -> (cuerpo ?: "{}").toRequestBody(json)
            }
            val request = Request.Builder()
                .url(baseUrl + ruta)
                .method(metodo, body)
                .build()
            cliente.newCall(request).execute().use { r ->
                val texto = r.body?.string() ?: ""
                if (!r.isSuccessful) throw ErrorServidor(r.code, texto)
                texto
            }
        }

    private suspend fun getObj(ruta: String) = JSONObject(peticion("GET", ruta))
    private suspend fun getArr(ruta: String) = JSONArray(peticion("GET", ruta))

    // ---------------- tablet ----------------
    suspend fun registrar(deviceId: String, modelo: String): String {
        val body = JSONObject().put("device_id", deviceId).put("modelo", modelo).toString()
        return JSONObject(peticion("POST", "/api/tablets/registro", body)).getString("tablet_id")
    }

    suspend fun enviarLecturas(tabletId: String, lecturas: JSONArray) {
        val conId = JSONArray()
        for (i in 0 until lecturas.length()) {
            conId.put(JSONObject(lecturas.getJSONObject(i).toString()).put("tablet_id", tabletId))
        }
        peticion("POST", "/api/lecturas", conId.toString())
    }

    // ---------------- profesor: panel ----------------
    suspend fun tablets(): List<TabletEstado> {
        val arr = getArr("/api/tablets")
        return (0 until arr.length()).map { i ->
            val o = arr.getJSONObject(i)
            TabletEstado(
                id = o.getString("id"),
                bateria = o.optDoubleONull("bateria"),
                cargando = o.optBoolean("cargando"),
                temperatura = o.optDoubleONull("temperatura"),
                estado = o.optString("estado", "sin_datos"),
                minutosDesdeLectura = if (o.isNull("minutos_desde_lectura")) null else o.getInt("minutos_desde_lectura"),
                simulada = o.optBoolean("simulada")
            )
        }
    }

    // ---------------- profesor: plan ----------------
    suspend fun plan(nublado: Boolean): Plan = parsearPlan(getObj("/api/plan?nublado=$nublado"))

    suspend fun recalcular(nublado: Boolean): Plan =
        parsearPlan(JSONObject(peticion("POST", "/api/plan/recalcular?nublado=$nublado", "{}")))

    suspend fun marcarHecha(id: String, hecha: Boolean) {
        peticion(if (hecha) "POST" else "DELETE", "/api/instrucciones/$id/hecha", if (hecha) "{}" else null)
    }

    private fun parsearPlan(o: JSONObject): Plan {
        val clases = o.getJSONArray("clases")
        val instrucciones = o.getJSONArray("instrucciones")
        val solar = o.getJSONArray("solar_por_hora_wh")
        val prevision = o.getJSONObject("prevision")
        return Plan(
            dia = o.getString("dia"),
            energiaSolarWh = o.getInt("energia_solar_wh"),
            solarPorHora = (0 until solar.length()).map { solar.getDouble(it) },
            clases = (0 until clases.length()).map { i ->
                val c = clases.getJSONObject(i)
                ClasePlan(
                    asignatura = c.getString("asignatura"),
                    hora = c.getString("hora"),
                    actividad = c.getString("actividad"),
                    consumoPctHora = c.getDouble("consumo_pct_hora"),
                    nTablets = c.getInt("n_tablets"),
                    listas = c.getJSONArray("tablets_listas").length()
                )
            },
            instrucciones = (0 until instrucciones.length()).map { i ->
                val ins = instrucciones.getJSONObject(i)
                Instruccion(ins.getString("id"), ins.getString("hora"), ins.getString("tipo"),
                    ins.getString("texto"), ins.optBoolean("hecha"))
            },
            fuentePrevision = prevision.optString("fuente", "tipico"),
            origenPrevision = if (prevision.isNull("origen")) null else prevision.optString("origen"),
            calculado = o.optString("calculado", "")
        )
    }

    suspend fun consumo(): List<ConsumoActividad> {
        val o = getObj("/api/consumo")
        return o.keys().asSequence().map { k ->
            val c = o.getJSONObject(k)
            ConsumoActividad(k, c.getDouble("defecto"), c.getDouble("prevision"), c.getInt("muestras"))
        }.toList()
    }

    // ---------------- profesor: horario ----------------
    suspend fun clases(): List<ClaseHorario> {
        val arr = getArr("/api/clases")
        return (0 until arr.length()).map { i ->
            val c = arr.getJSONObject(i)
            ClaseHorario(c.getInt("id"), c.getString("asignatura"), c.getString("hora_inicio"),
                c.getInt("duracion_min"), c.getString("actividad"), c.getInt("n_tablets"))
        }
    }

    suspend fun crearClase(asignatura: String, hora: String, duracion: Int, actividad: String, nTablets: Int) {
        val body = JSONObject()
            .put("asignatura", asignatura).put("hora_inicio", hora).put("duracion_min", duracion)
            .put("actividad", actividad).put("n_tablets", nTablets)
        peticion("POST", "/api/clases", body.toString())
    }

    suspend fun borrarClase(id: Int) {
        peticion("DELETE", "/api/clases/$id")
    }

    // ---------------- profesor: configuración y previsión ----------------
    suspend fun config(): JSONObject = getObj("/api/config")

    suspend fun cambiarConfig(cambios: JSONObject) {
        peticion("PATCH", "/api/config", cambios.toString())
    }

    suspend fun prevision(): JSONObject = getObj("/api/prevision")

    /** El servidor descarga la previsión él mismo (si tiene internet) */
    suspend fun actualizarPrevisionEnServidor(): JSONObject =
        JSONObject(peticion("POST", "/api/prevision/actualizar", "{}"))

    /** El móvil envía al servidor la previsión que descargó con sus datos móviles */
    suspend fun enviarPrevision(horas: JSONArray, radiacion: JSONArray): JSONObject {
        val body = JSONObject().put("horas", horas).put("radiacion", radiacion)
        return JSONObject(peticion("POST", "/api/prevision", body.toString()))
    }

    // ---------------- profesor: asistente ----------------
    suspend fun resumenIA(nublado: Boolean): RespuestaIA {
        val o = getObj("/api/asistente/resumen?nublado=$nublado")
        return RespuestaIA(o.getString("texto"), o.optString("origen", "local"))
    }

    suspend fun preguntarIA(pregunta: String, nublado: Boolean): RespuestaIA {
        val body = JSONObject().put("pregunta", pregunta).toString()
        val o = JSONObject(peticion("POST", "/api/asistente/preguntar?nublado=$nublado", body))
        return RespuestaIA(o.getString("texto"), o.optString("origen", "local"))
    }

    companion object {
        /** El MÓVIL descarga la previsión directamente de Open-Meteo (con sus datos móviles) */
        suspend fun descargarOpenMeteo(lat: Double, lon: Double): Pair<JSONArray, JSONArray> =
            withContext(Dispatchers.IO) {
                val url = "https://api.open-meteo.com/v1/forecast?latitude=$lat&longitude=$lon" +
                        "&hourly=shortwave_radiation&forecast_days=7&timezone=auto"
                val cliente = OkHttpClient.Builder().connectTimeout(10, TimeUnit.SECONDS).build()
                cliente.newCall(Request.Builder().url(url).build()).execute().use { r ->
                    if (!r.isSuccessful) throw ErrorServidor(r.code, "Open-Meteo no responde")
                    val hourly = JSONObject(r.body?.string() ?: "{}").getJSONObject("hourly")
                    Pair(hourly.getJSONArray("time"), hourly.getJSONArray("shortwave_radiation"))
                }
            }
    }
}

class ErrorServidor(val codigo: Int, val detalle: String) : Exception("Error $codigo: $detalle")

private fun JSONObject.optDoubleONull(clave: String): Double? = if (isNull(clave)) null else optDouble(clave)

package com.fotosintesis.app.profesor

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.fotosintesis.app.data.Api
import com.fotosintesis.app.data.Instruccion
import com.fotosintesis.app.data.Plan
import com.fotosintesis.app.data.Preferencias
import com.fotosintesis.app.ui.BotonPildora
import com.fotosintesis.app.ui.Colores
import com.fotosintesis.app.ui.FichasTablets
import com.fotosintesis.app.ui.Grupo
import com.fotosintesis.app.ui.Separador
import com.fotosintesis.app.ui.TituloGrande
import com.fotosintesis.app.ui.TituloSeccion
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * MODO PROFESOR (móvil). Lo principal es el ordenador; el móvil sirve para dos cosas:
 *   1. Traer la previsión del tiempo con los datos móviles y pasársela al servidor.
 *   2. Seguir y marcar las instrucciones de carga desde el aula.
 */
@Composable
fun PantallaProfesor(alCambiarModo: () -> Unit) {
    val context = LocalContext.current
    val prefs = remember { Preferencias(context) }
    val api = remember { Api(prefs.servidor) }
    val alcance = rememberCoroutineScope()

    var plan by remember { mutableStateOf<Plan?>(null) }
    var prevision by remember { mutableStateOf<JSONObject?>(null) }
    var config by remember { mutableStateOf<JSONObject?>(null) }
    var sinConexion by remember { mutableStateOf(false) }
    var recargar by remember { mutableIntStateOf(0) }
    var verHechas by remember { mutableStateOf(false) }

    // Carga inicial y refresco cada 30 s
    LaunchedEffect(recargar) {
        while (true) {
            try {
                config = api.config()
                prevision = api.prevision()
                plan = api.plan(false)
                sinConexion = false
            } catch (e: Exception) {
                sinConexion = true
            }
            delay(30_000)
        }
    }

    fun marcar(ins: Instruccion, hecha: Boolean) {
        val p = plan ?: return
        plan = p.copy(instrucciones = p.instrucciones.map { if (it.id == ins.id) it.copy(hecha = hecha) else it })
        alcance.launch { try { api.marcarHecha(ins.id, hecha) } catch (e: Exception) { sinConexion = true } }
    }

    val p = plan
    val pendientes = p?.instrucciones?.filter { !it.hecha } ?: emptyList()
    val hechas = p?.instrucciones?.filter { it.hecha && it.tipo != "aviso" } ?: emptyList()
    val avisos = pendientes.filter { it.tipo == "aviso" }
    val tareas = pendientes.filter { it.tipo != "aviso" }
    val siguiente = tareas.firstOrNull()

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(Colores.Fondo).systemBarsPadding(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(0.dp)
    ) {
        item {
            TituloGrande("Fotosíntesis", config?.optString("escuela_nombre") ?: "Conectando con el servidor…")
        }
        if (sinConexion) {
            item {
                Aviso("📡", "Sin conexión con el servidor",
                    "Comprueba que el ordenador está encendido y que estás en la wifi de la escuela.", Colores.RojoSuave)
                Spacer(Modifier.height(12.dp))
            }
        }

        // ------------------------------ 1. Previsión
        item {
            TarjetaPrevision(api, config, prevision) { recargar++ }
        }

        if (p == null && !sinConexion) {
            item { Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() } }
        }

        if (p != null) {
            // ------------------------------ 2. Avisos importantes
            if (avisos.isNotEmpty()) {
                item { TituloSeccion("Atención") }
                avisos.forEach { a ->
                    item(key = a.id) {
                        Aviso("⚠️", a.titulo, a.detalle, Colores.NaranjaSuave)
                        Spacer(Modifier.height(8.dp))
                    }
                }
            }

            // ------------------------------ 3. Siguiente paso
            item { TituloSeccion("Siguiente paso") }
            item { TarjetaSiguiente(siguiente) { ins -> marcar(ins, true) } }

            // ------------------------------ 4. Resto de instrucciones
            if (tareas.size > 1) {
                item {
                    val total = p.instrucciones.count { it.tipo != "aviso" }
                    TituloSeccion("Próximas instrucciones", "${hechas.size} de $total hechas")
                }
                item {
                    Grupo {
                        tareas.drop(1).forEachIndexed { i, ins ->
                            if (i > 0) Separador()
                            FilaInstruccion(ins) { marcar(ins, !ins.hecha) }
                        }
                    }
                }
            }
            if (hechas.isNotEmpty()) {
                item {
                    TextButton(onClick = { verHechas = !verHechas }, modifier = Modifier.padding(top = 8.dp)) {
                        Text(if (verHechas) "Ocultar las hechas" else "Mostrar las ${hechas.size} hechas", color = Colores.Azul, fontSize = 16.sp)
                    }
                }
                if (verHechas) {
                    item {
                        Grupo {
                            hechas.forEachIndexed { i, ins ->
                                if (i > 0) Separador()
                                FilaInstruccion(ins) { marcar(ins, false) }
                            }
                        }
                    }
                }
            }
        }

        // ------------------------------ Pie
        item {
            Column(Modifier.fillMaxWidth().padding(top = 28.dp, bottom = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("El resto (tablets, horario, asistente y ajustes) está en la app del ordenador.",
                    fontSize = 13.sp, color = Colores.Texto2, textAlign = TextAlign.Center)
                TextButton(onClick = alCambiarModo) { Text("Cambiar modo o servidor", color = Colores.Azul) }
            }
        }
    }
}

// ============================================================================
//  Tarjeta de previsión: lo más importante del móvil
// ============================================================================
@Composable
private fun TarjetaPrevision(api: Api, config: JSONObject?, prevision: JSONObject?, alActualizar: () -> Unit) {
    val alcance = rememberCoroutineScope()
    var ocupado by remember { mutableStateOf(false) }
    var mensaje by remember { mutableStateOf<String?>(null) }

    val fuente = prevision?.optString("fuente") ?: ""
    val estado = when {
        prevision == null -> "—"
        fuente == "tipico" -> "Aún no hay previsión guardada"
        fuente == "estimada" -> "La previsión guardada es antigua"
        prevision.optString("origen") == "profesor" -> "Previsión traída desde este móvil"
        else -> "Previsión descargada por el ordenador"
    }
    val fecha = prevision?.takeIf { !it.isNull("descargada") }?.optString("descargada")
        ?.replace('T', ' ')?.take(16)

    Grupo(radio = 20) {
        Column(Modifier.padding(20.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("☀️", fontSize = 30.sp)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text("Previsión del tiempo", fontSize = 20.sp, fontWeight = FontWeight.SemiBold, color = Colores.Texto)
                    Text(estado + (fecha?.let { " · $it" } ?: ""), fontSize = 14.sp,
                        color = if (fuente == "tipico" || fuente == "estimada") Colores.Naranja else Colores.Texto2)
                }
            }

            // Barras de la radiación de mañana (6:00 a 19:00)
            val rad = prevision?.optJSONArray("radiacion_manana")
            if (rad != null && rad.length() >= 24) {
                Spacer(Modifier.height(14.dp))
                val valores = (6..19).map { rad.optDouble(it, 0.0) }
                val max = (valores.maxOrNull() ?: 1.0).coerceAtLeast(1.0)
                Row(Modifier.fillMaxWidth().height(56.dp), horizontalArrangement = Arrangement.spacedBy(3.dp),
                    verticalAlignment = Alignment.Bottom) {
                    valores.forEach { v ->
                        Box(Modifier.weight(1f).fillMaxHeight((v / max).toFloat().coerceIn(0.04f, 1f))
                            .clip(RoundedCornerShape(topStart = 3.dp, topEnd = 3.dp)).background(Colores.Sol))
                    }
                }
                Row(Modifier.fillMaxWidth()) {
                    Text("6:00", fontSize = 11.sp, color = Colores.Texto3, modifier = Modifier.weight(1f))
                    Text("Sol previsto para mañana", fontSize = 11.sp, color = Colores.Texto3)
                    Text("19:00", fontSize = 11.sp, color = Colores.Texto3, modifier = Modifier.weight(1f), textAlign = TextAlign.End)
                }
            }

            Spacer(Modifier.height(16.dp))
            BotonPildora(if (ocupado) "Descargando…" else "Traer previsión", Modifier.fillMaxWidth(), habilitado = !ocupado) {
                ocupado = true
                mensaje = null
                alcance.launch {
                    mensaje = try {
                        val cfg = config ?: api.config()
                        val (horas, radiacion) = Api.descargarOpenMeteo(cfg.getDouble("latitud"), cfg.getDouble("longitud"))
                        api.enviarPrevision(horas, radiacion)
                        alActualizar()
                        "✅ Previsión de 7 días enviada al ordenador. El plan se ha recalculado."
                    } catch (e: Exception) {
                        "❌ No se pudo. Necesitas datos móviles y estar en la wifi de la escuela."
                    }
                    ocupado = false
                }
            }
            Text(
                mensaje ?: "Usa los datos móviles para descargar el tiempo de los próximos 7 días y pasárselo al ordenador.",
                fontSize = 13.sp, color = Colores.Texto2, modifier = Modifier.padding(top = 10.dp)
            )
        }
    }
}

// ============================================================================
//  Siguiente paso (tarjeta grande) y filas de instrucciones
// ============================================================================
@Composable
private fun TarjetaSiguiente(ins: Instruccion?, alHecho: (Instruccion) -> Unit) {
    Grupo(radio = 20) {
        if (ins == null) {
            Column(Modifier.fillMaxWidth().padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("✓", fontSize = 44.sp, fontWeight = FontWeight.Bold, color = Colores.Verde)
                Text("Todo preparado para mañana", fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = Colores.Texto)
            }
            return@Grupo
        }
        Column(Modifier.padding(20.dp)) {
            if (ins.diaTexto.isNotEmpty()) {
                Text(ins.diaTexto, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Colores.Texto2)
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(ins.hora, fontSize = 46.sp, fontWeight = FontWeight.Bold, color = Colores.Texto, letterSpacing = (-1).sp)
                Spacer(Modifier.width(16.dp))
                Column(Modifier.weight(1f)) {
                    Text(ins.titulo, fontSize = 22.sp, fontWeight = FontWeight.SemiBold, color = Colores.Texto)
                    Text(ins.detalle, fontSize = 15.sp, color = Colores.Texto2)
                }
            }
            if (ins.tablets.isNotEmpty()) {
                Spacer(Modifier.height(12.dp))
                FichasTablets(ins.tablets)
            }
            Spacer(Modifier.height(16.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                BotonPildora("Hecho", Modifier.width(140.dp)) { alHecho(ins) }
            }
        }
    }
}

@Composable
private fun FilaInstruccion(ins: Instruccion, alPulsar: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable { alPulsar() }.padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Círculo para marcar (como en Recordatorios de iOS)
        Box(
            Modifier.size(26.dp).clip(CircleShape)
                .background(if (ins.hecha) Colores.Verde else Color.Transparent)
                .border(2.dp, if (ins.hecha) Colores.Verde else Colores.Texto3, CircleShape),
            contentAlignment = Alignment.Center
        ) { if (ins.hecha) Text("✓", color = Colores.SobreLima, fontSize = 14.sp, fontWeight = FontWeight.Bold) }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.width(64.dp)) {
            if (ins.diaTexto.isNotEmpty()) Text(ins.diaTexto, fontSize = 11.sp, color = Colores.Texto3, maxLines = 1)
            Text(ins.hora, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Colores.Texto2)
        }
        Column(Modifier.weight(1f)) {
            Text(ins.titulo, fontSize = 16.sp, fontWeight = FontWeight.SemiBold,
                color = if (ins.hecha) Colores.Texto2 else Colores.Texto,
                textDecoration = if (ins.hecha) TextDecoration.LineThrough else null)
            Text(ins.detalle, fontSize = 13.sp, color = Colores.Texto2)
            if (ins.tablets.isNotEmpty() && !ins.hecha) {
                Spacer(Modifier.height(6.dp))
                FichasTablets(ins.tablets)
            }
        }
    }
}

@Composable
private fun Aviso(emoji: String, titulo: String, detalle: String, fondo: Color) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(fondo).padding(14.dp),
        verticalAlignment = Alignment.Top
    ) {
        Text(emoji, fontSize = 20.sp)
        Spacer(Modifier.width(12.dp))
        Column {
            Text(titulo, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = Colores.Texto)
            Text(detalle, fontSize = 14.sp, color = Colores.Texto2)
        }
    }
}

// ---------------------------------------------------------------------------
//  Piezas compartidas con las pantallas anteriores (ya no se usan en el móvil)
// ---------------------------------------------------------------------------
@Composable
fun Cargando() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
}

@Composable
fun ErrorConexion(detalle: String?, reintentar: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center) {
        Text("📡", fontSize = 48.sp)
        Text("No hay conexión con el servidor", fontSize = 18.sp, color = Colores.Texto)
        Text(detalle ?: "Comprueba que el servidor está arrancado y que estás en la misma wifi.",
            color = Colores.Texto2, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 8.dp))
        Button(onClick = reintentar, modifier = Modifier.padding(top = 16.dp)) { Text("Reintentar") }
    }
}

val NOMBRE_ACTIVIDAD = mapOf(
    "lectura" to "📖 Lectura",
    "ejercicios" to "✏️ Ejercicios",
    "video" to "🎬 Vídeo",
    "juego" to "🎮 Juego"
)

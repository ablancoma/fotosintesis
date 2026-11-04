package com.fotosintesis.app.profesor

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.fotosintesis.app.data.Api
import com.fotosintesis.app.data.Preferencias
import com.fotosintesis.app.ui.Colores

private data class Pestana(val emoji: String, val nombre: String)

private val PESTANAS = listOf(
    Pestana("🔋", "Tablets"),
    Pestana("📋", "Plan"),
    Pestana("📚", "Horario"),
    Pestana("🤖", "Asistente"),
    Pestana("☀️", "Ajustes")
)

/**
 * MODO PROFESOR: cinco pestañas que leen y escriben en el servidor.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PantallaProfesor(alCambiarModo: () -> Unit) {
    val context = LocalContext.current
    val prefs = remember { Preferencias(context) }
    val api = remember { Api(prefs.servidor) }

    var pestana by remember { mutableIntStateOf(0) }
    var nublado by remember { mutableStateOf(false) }      // simulador de día nublado (demo)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("🌱 Fotosíntesis · ${PESTANAS[pestana].nombre}") },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Colores.Oscuro, titleContentColor = Color.White
                )
            )
        },
        bottomBar = {
            NavigationBar(containerColor = Color.White) {
                PESTANAS.forEachIndexed { i, p ->
                    NavigationBarItem(
                        selected = pestana == i,
                        onClick = { pestana = i },
                        icon = { Text(p.emoji, fontSize = 20.sp) },
                        label = { Text(p.nombre, fontSize = 11.sp) }
                    )
                }
            }
        },
        containerColor = Colores.Fondo
    ) { relleno ->
        Box(Modifier.padding(relleno).fillMaxSize()) {
            when (pestana) {
                0 -> TabTablets(api)
                1 -> TabPlan(api, nublado, alCambiarNublado = { nublado = it })
                2 -> TabHorario(api)
                3 -> TabAsistente(api, nublado)
                4 -> TabAjustes(api, prefs.servidor, alCambiarModo)
            }
        }
    }
}

// ---------------------------------------------------------------------------
//  Piezas comunes a todas las pestañas
// ---------------------------------------------------------------------------
@Composable
fun Cargando() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
}

@Composable
fun ErrorConexion(detalle: String?, reintentar: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = androidx.compose.foundation.layout.Arrangement.Center
    ) {
        Text("📡", fontSize = 48.sp)
        Text("No hay conexión con el servidor", fontSize = 18.sp, color = Colores.Oscuro)
        Text(
            detalle ?: "Comprueba que el servidor está arrancado y que estás en la misma wifi.",
            color = Colores.Gris, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)
        )
        Button(onClick = reintentar, modifier = Modifier.padding(top = 16.dp)) { Text("Reintentar") }
    }
}

val NOMBRE_ACTIVIDAD = mapOf(
    "lectura" to "📖 Lectura",
    "ejercicios" to "✏️ Ejercicios",
    "video" to "🎬 Vídeo",
    "juego" to "🎮 Juego"
)

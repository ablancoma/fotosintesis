package com.fotosintesis.app

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.fotosintesis.app.data.Api
import com.fotosintesis.app.data.Preferencias
import com.fotosintesis.app.ui.Colores
import kotlinx.coroutines.launch

/**
 * Primera pantalla: dirección del servidor y modo (tablet o profesor).
 */
@Composable
fun PantallaInicio(alElegir: (modo: String) -> Unit) {
    val context = LocalContext.current
    val prefs = remember { Preferencias(context) }
    val alcance = rememberCoroutineScope()

    var servidor by remember { mutableStateOf(prefs.servidor) }
    var prueba by remember { mutableStateOf<String?>(null) }

    fun elegir(modo: String) {
        val nuevo = Preferencias.normalizarUrl(servidor)
        if (nuevo != prefs.servidor) prefs.tabletId = null    // otro servidor: la tablet se registra de nuevo
        prefs.servidor = nuevo
        prefs.modo = modo
        alElegir(modo)
    }

    Column(
        modifier = Modifier.fillMaxSize().background(Colores.Fondo).verticalScroll(rememberScrollState()).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(Modifier.height(32.dp))
        Text("🌱", fontSize = 64.sp)
        Text("Fotosíntesis", fontSize = 32.sp, fontWeight = FontWeight.Bold, color = Colores.Oscuro)
        Text("La escuela que convierte la luz en aprendizaje", color = Colores.Gris)
        Spacer(Modifier.height(32.dp))

        OutlinedTextField(
            value = servidor,
            onValueChange = { servidor = it; prueba = null },
            label = { Text("Dirección del servidor") },
            supportingText = { Text("En el emulador: 10.0.2.2:8000 · En un dispositivo: la IP del ordenador servidor") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            modifier = Modifier.fillMaxWidth()
        )
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            OutlinedButton(onClick = {
                prueba = "Probando…"
                alcance.launch {
                    prueba = try {
                        val config = Api(Preferencias.normalizarUrl(servidor)).config()
                        "✅ Conectado: ${config.optString("escuela_nombre")}"
                    } catch (e: Exception) {
                        "❌ No se puede conectar. ¿Está arrancado el servidor y en la misma wifi?"
                    }
                }
            }) { Text("Probar conexión") }
            Spacer(Modifier.width(12.dp))
            prueba?.let { Text(it, fontSize = 13.sp, color = Colores.Oscuro) }
        }

        Spacer(Modifier.height(32.dp))
        Text("¿Qué es este dispositivo?", fontWeight = FontWeight.SemiBold, color = Colores.Oscuro)
        Spacer(Modifier.height(12.dp))
        TarjetaModo("📱", "Tablet de alumnos",
            "Solo envía su batería al servidor cada 15 minutos. No guarda datos de alumnos.") { elegir("tablet") }
        Spacer(Modifier.height(12.dp))
        TarjetaModo("👩‍🏫", "Profesor",
            "Panel de tablets, horario, instrucciones de carga, previsión del tiempo y asistente de IA.") { elegir("profesor") }
    }
}

@Composable
private fun TarjetaModo(emoji: String, titulo: String, descripcion: String, alPulsar: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable { alPulsar() },
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(Modifier.padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(emoji, fontSize = 40.sp)
            Spacer(Modifier.width(16.dp))
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(titulo, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = Colores.Oscuro)
                Text(descripcion, fontSize = 14.sp, color = Colores.Gris)
            }
        }
    }
}

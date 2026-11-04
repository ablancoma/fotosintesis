package com.fotosintesis.app

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.fotosintesis.app.data.Api
import com.fotosintesis.app.data.Preferencias
import com.fotosintesis.app.ui.Colores
import com.fotosintesis.app.ui.Grupo
import com.fotosintesis.app.ui.Separador
import kotlinx.coroutines.launch

/**
 * Primera pantalla: dirección del servidor y modo (tablet o profesor).
 */
@Composable
fun PantallaInicio(alElegir: (modo: String) -> Unit) {
    val context = LocalContext.current
    val prefs = remember { Preferencias(context) }
    val alcance = rememberCoroutineScope()

    var servidor by remember { mutableStateOf(prefs.servidor.removePrefix("http://")) }
    var prueba by remember { mutableStateOf<String?>(null) }

    fun elegir(modo: String) {
        val nuevo = Preferencias.normalizarUrl(servidor)
        if (nuevo != prefs.servidor) prefs.tabletId = null    // otro servidor: la tablet se registra de nuevo
        prefs.servidor = nuevo
        prefs.modo = modo
        alElegir(modo)
    }

    Column(
        modifier = Modifier.fillMaxSize().background(Colores.Fondo).systemBarsPadding()
            .verticalScroll(rememberScrollState()).padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Column(Modifier.widthIn(max = 520.dp)) {
            Spacer(Modifier.height(28.dp))
            Box(
                Modifier.size(72.dp).clip(RoundedCornerShape(18.dp))
                    .background(Brush.verticalGradient(listOf(Color(0xFF3DDC6B), Color(0xFF1F9D4A))))
                    .align(Alignment.CenterHorizontally),
                contentAlignment = Alignment.Center
            ) { Text("🌱", fontSize = 38.sp) }
            Spacer(Modifier.height(14.dp))
            Text("Fotosíntesis", fontSize = 34.sp, fontWeight = FontWeight.Bold, color = Colores.Texto,
                modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
            Text("La escuela que convierte la luz en aprendizaje", fontSize = 15.sp, color = Colores.Texto2,
                modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)

            // ---------------- Servidor ----------------
            Text("Servidor de la escuela", fontSize = 13.sp, color = Colores.Texto2,
                modifier = Modifier.padding(start = 16.dp, top = 32.dp, bottom = 6.dp))
            Grupo {
                Row(Modifier.padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Dirección", fontSize = 17.sp, color = Colores.Texto, modifier = Modifier.width(96.dp))
                    BasicTextField(
                        value = servidor,
                        onValueChange = { servidor = it; prueba = null },
                        singleLine = true,
                        textStyle = TextStyle(fontSize = 17.sp, color = Colores.Texto2, textAlign = TextAlign.End),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                        modifier = Modifier.weight(1f)
                    )
                }
                Separador()
                Text(
                    prueba ?: "Probar conexión",
                    fontSize = 17.sp,
                    color = when {
                        prueba == null -> Colores.Azul
                        prueba!!.startsWith("✅") -> Colores.VerdeHoja
                        prueba!!.startsWith("❌") -> Colores.Rojo
                        else -> Colores.Texto2
                    },
                    modifier = Modifier.fillMaxWidth().clickable {
                        prueba = "Probando…"
                        alcance.launch {
                            prueba = try {
                                val config = Api(Preferencias.normalizarUrl(servidor)).config()
                                "✅ Conectado a ${config.optString("escuela_nombre")}"
                            } catch (e: Exception) {
                                "❌ No responde. ¿Está encendido y en la misma wifi?"
                            }
                        }
                    }.padding(horizontal = 16.dp, vertical = 14.dp)
                )
            }
            Text("En el emulador: 10.0.2.2:8000 · En un dispositivo: la dirección que muestra el ordenador en Ajustes",
                fontSize = 13.sp, color = Colores.Texto2, modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 6.dp))

            // ---------------- Modo ----------------
            Text("¿Para qué es este dispositivo?", fontSize = 13.sp, color = Colores.Texto2,
                modifier = Modifier.padding(start = 16.dp, top = 28.dp, bottom = 6.dp))
            Grupo {
                FilaModo("📱", "Tablet de alumnos", "Envía su batería al ordenador cada 15 minutos") { elegir("tablet") }
                Separador()
                FilaModo("👩‍🏫", "Móvil del profesor", "Traer la previsión del tiempo y seguir las instrucciones de carga") { elegir("profesor") }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun FilaModo(emoji: String, titulo: String, descripcion: String, alPulsar: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable { alPulsar() }.padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(emoji, fontSize = 30.sp)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(titulo, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, color = Colores.Texto)
            Text(descripcion, fontSize = 14.sp, color = Colores.Texto2)
        }
        Text("›", fontSize = 26.sp, color = Colores.Texto3)
    }
}

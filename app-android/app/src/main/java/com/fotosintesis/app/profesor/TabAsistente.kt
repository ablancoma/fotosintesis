package com.fotosintesis.app.profesor

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.fotosintesis.app.data.Api
import com.fotosintesis.app.ui.Colores
import kotlinx.coroutines.launch

private data class Mensaje(val texto: String, val delProfesor: Boolean, val origen: String = "")

private val SUGERENCIAS = listOf(
    "¿Qué tablets cargo primero?",
    "¿Puedo poner un vídeo en Ciencias?",
    "¿Qué hago si mañana llueve?"
)

/** Asistente de IA: resumen del plan + chat (Gemini en el servidor) */
@Composable
fun TabAsistente(api: Api, nublado: Boolean) {
    val alcance = rememberCoroutineScope()
    val mensajes = remember { mutableStateListOf<Mensaje>() }
    var pregunta by remember { mutableStateOf("") }
    var pensando by remember { mutableStateOf(false) }
    val estadoLista = rememberLazyListState()

    fun preguntar(texto: String) {
        if (texto.isBlank() || pensando) return
        mensajes.add(Mensaje(texto, delProfesor = true))
        pregunta = ""
        pensando = true
        alcance.launch {
            val r = try { api.preguntarIA(texto, nublado) } catch (e: Exception) { null }
            mensajes.add(Mensaje(r?.texto ?: "No hay conexión con el servidor.", false, r?.origen ?: ""))
            pensando = false
        }
    }

    // Al abrir la pestaña: el asistente resume el plan de mañana
    LaunchedEffect(nublado) {
        mensajes.clear()
        pensando = true
        val r = try { api.resumenIA(nublado) } catch (e: Exception) { null }
        mensajes.add(Mensaje(r?.texto ?: "No hay conexión con el servidor.", false, r?.origen ?: ""))
        pensando = false
    }

    LaunchedEffect(mensajes.size) {
        if (mensajes.isNotEmpty()) estadoLista.animateScrollToItem(mensajes.size - 1)
    }

    Column(Modifier.fillMaxSize()) {
        LazyColumn(
            state = estadoLista,
            modifier = Modifier.weight(1f).fillMaxWidth(),
            contentPadding = PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            items(mensajes) { m -> Burbuja(m) }
            if (pensando) item { Text("🤖 Pensando…", color = Colores.Gris) }
        }

        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            SUGERENCIAS.take(2).forEach { s ->
                SuggestionChip(onClick = { preguntar(s) }, label = { Text(s, fontSize = 11.sp, maxLines = 1) })
            }
        }
        Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = pregunta, onValueChange = { pregunta = it },
                placeholder = { Text("Pregunta al asistente…") },
                modifier = Modifier.weight(1f), singleLine = true
            )
            Spacer(Modifier.width(8.dp))
            Button(onClick = { preguntar(pregunta) }, enabled = !pensando) { Text("Enviar") }
        }
    }
}

@Composable
private fun Burbuja(m: Mensaje) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (m.delProfesor) Arrangement.End else Arrangement.Start) {
        Card(
            modifier = Modifier.fillMaxWidth(0.85f),
            colors = CardDefaults.cardColors(containerColor = if (m.delProfesor) Colores.Verde else Color.White)
        ) {
            Column(Modifier.padding(12.dp)) {
                Text(m.texto, color = if (m.delProfesor) Color.White else Colores.Oscuro, fontSize = 15.sp)
                if (!m.delProfesor && m.origen.isNotEmpty()) {
                    Text(
                        if (m.origen == "gemini") "✨ Gemini" else "📋 Resumen sin IA (sin conexión con Gemini)",
                        fontSize = 11.sp, color = Colores.Gris, fontWeight = FontWeight.Medium,
                        modifier = Modifier.padding(top = 6.dp)
                    )
                }
            }
        }
    }
}

package com.fotosintesis.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Título grande de pantalla, como en iOS */
@Composable
fun TituloGrande(texto: String, subtitulo: String? = null) {
    Column(Modifier.padding(start = 4.dp, top = 8.dp, bottom = 12.dp)) {
        Text(texto, fontSize = 34.sp, fontWeight = FontWeight.Bold, color = Colores.Texto, letterSpacing = (-0.5).sp)
        if (subtitulo != null) Text(subtitulo, fontSize = 15.sp, color = Colores.Texto2)
    }
}

/** Encabezado de sección encima de un grupo */
@Composable
fun TituloSeccion(texto: String, extra: String? = null) {
    Text(
        texto + if (extra != null) "  ·  $extra" else "",
        fontSize = 20.sp, fontWeight = FontWeight.SemiBold, color = Colores.Texto,
        modifier = Modifier.padding(start = 4.dp, top = 22.dp, bottom = 8.dp)
    )
}

/** Contenedor blanco redondeado (lista agrupada de iOS) */
@Composable
fun Grupo(modifier: Modifier = Modifier, radio: Int = 14, contenido: @Composable () -> Unit) {
    Column(modifier.fillMaxWidth().clip(RoundedCornerShape(radio.dp)).background(Colores.Superficie)) {
        contenido()
    }
}

/** Línea separadora con sangría a la izquierda */
@Composable
fun Separador() {
    Box(Modifier.fillMaxWidth().padding(start = 16.dp).height(1.dp).background(Colores.Separador))
}

/** Botón principal con forma de píldora */
@Composable
fun BotonPildora(texto: String, modifier: Modifier = Modifier, habilitado: Boolean = true, color: Color = Colores.VerdeHoja, alPulsar: () -> Unit) {
    Button(
        onClick = alPulsar,
        enabled = habilitado,
        modifier = modifier.height(50.dp),
        shape = RoundedCornerShape(50),
        colors = ButtonDefaults.buttonColors(containerColor = color, contentColor = Color.White)
    ) { Text(texto, fontSize = 17.sp, fontWeight = FontWeight.SemiBold) }
}

/** Fichas con los nombres de las tablets (T01, T06…) */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun FichasTablets(tablets: List<String>, modifier: Modifier = Modifier) {
    FlowRow(modifier, horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        tablets.forEach { t ->
            Text(
                t, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Colores.Texto,
                modifier = Modifier.clip(RoundedCornerShape(50)).background(Colores.RellenoControl)
                    .padding(horizontal = 10.dp, vertical = 4.dp)
            )
        }
    }
}

/** Etiqueta pequeña de color (de dónde sale la energía) */
@Composable
fun EtiquetaFuente(fuenteTipo: String) {
    val (texto, fondo, color) = when (fuenteTipo) {
        "bateria" -> Triple("🔋 Batería escuela", Colores.VerdeSuave, Colores.VerdeHoja)
        "mixta" -> Triple("☀️ + 🔋", Colores.VerdeSuave, Colores.VerdeHoja)
        "sol" -> Triple("☀️ Sol", Colores.SolSuave, Color(0xFFA86B00))
        else -> return
    }
    Text(texto, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = color,
        modifier = Modifier.clip(RoundedCornerShape(50)).background(fondo).padding(horizontal = 9.dp, vertical = 3.dp))
}

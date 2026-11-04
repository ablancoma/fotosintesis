package com.fotosintesis.app.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

object Colores {
    val Sol = Color(0xFFF5A623)
    val Verde = Color(0xFF2E9E5B)
    val Naranja = Color(0xFFE8832A)
    val Rojo = Color(0xFFD64545)
    val Gris = Color(0xFF9AA5AD)
    val Oscuro = Color(0xFF1F2A30)
    val Fondo = Color(0xFFF6F4EF)
    val VerdeSuave = Color(0xFFEEF7F1)
    val RojoSuave = Color(0xFFFDECEC)
    val SolSuave = Color(0xFFFFF3DC)

    fun deBateria(pct: Double?): Color = when {
        pct == null -> Gris
        pct >= 60 -> Verde
        pct >= 30 -> Naranja
        else -> Rojo
    }
}

@Composable
fun TemaFotosintesis(contenido: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = Colores.Verde,
            secondary = Colores.Sol,
            background = Colores.Fondo,
            surface = Color.White,
            onPrimary = Color.White
        ),
        content = contenido
    )
}

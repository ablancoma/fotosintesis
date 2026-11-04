package com.fotosintesis.app.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/** Colores de sistema al estilo iOS (los mismos que la app de escritorio) */
object Colores {
    val Fondo = Color(0xFFF2F2F7)          // gris de sistema
    val Superficie = Color.White
    val Texto = Color(0xFF1C1C1E)
    val Texto2 = Color(0xFF6E6E73)
    val Texto3 = Color(0xFFAEAEB2)
    val Separador = Color(0x243C3C43)
    val RellenoControl = Color(0x1F767680)

    val Verde = Color(0xFF34C759)
    val VerdeHoja = Color(0xFF248A3D)      // color de marca (botones principales)
    val Naranja = Color(0xFFFF9500)
    val Rojo = Color(0xFFFF3B30)
    val Azul = Color(0xFF007AFF)
    val Sol = Color(0xFFFFB800)

    val VerdeSuave = Color(0x2934C759)
    val NaranjaSuave = Color(0x24FF9500)
    val SolSuave = Color(0x29FFB800)
    val RojoSuave = Color(0x1FFF3B30)

    // Nombres usados en versiones anteriores
    val Gris = Texto3
    val Oscuro = Texto

    fun deBateria(pct: Double?): Color = when {
        pct == null -> Texto3
        pct >= 60 -> Verde
        pct >= 30 -> Naranja
        else -> Rojo
    }
}

@Composable
fun TemaFotosintesis(contenido: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = Colores.VerdeHoja,
            onPrimary = Color.White,
            secondary = Colores.Sol,
            background = Colores.Fondo,
            surface = Colores.Superficie,
            onSurface = Colores.Texto,
            onBackground = Colores.Texto
        ),
        typography = Typography(
            bodyLarge = TextStyle(fontSize = 17.sp, color = Colores.Texto),
            bodyMedium = TextStyle(fontSize = 15.sp, color = Colores.Texto),
            titleLarge = TextStyle(fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
        ),
        content = contenido
    )
}

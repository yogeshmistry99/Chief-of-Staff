package com.bits.app.ui.theme

import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val BitsDarkColorScheme = darkColorScheme(
    primary          = BitsAccent,
    onPrimary        = Color.Black,
    primaryContainer = BitsPanel,
    onPrimaryContainer = BitsText,
    secondary        = BitsGold,
    onSecondary      = Color.Black,
    background       = BitsBg,
    onBackground     = BitsText,
    surface          = BitsSurface,
    onSurface        = BitsText,
    surfaceVariant   = BitsPanel,
    onSurfaceVariant = BitsTextDim,
    error            = BitsRed,
    onError          = Color.White
)

@Composable
fun BitsTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = BitsDarkColorScheme,
        typography = BitsTypography,
        content = content
    )
}

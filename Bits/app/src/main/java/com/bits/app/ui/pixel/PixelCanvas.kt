package com.bits.app.ui.pixel

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.withTransform

@Composable
fun PixelSprite(
    pixels: IntArray,
    gridWidth: Int,
    pixelSizePx: Float,
    modifier: Modifier = Modifier,
    expressionOverrides: List<Triple<Int, Int, Int>> = emptyList(),
    translateX: Float = 0f,
    translateY: Float = 0f,
    rotation: Float = 0f,
    scaleX: Float = 1f,
    scaleY: Float = 1f,
    alpha: Float = 1f
) {
    val overrideMap = expressionOverrides.associate { (row, col, colorIdx) ->
        (row * gridWidth + col) to colorIdx
    }

    Canvas(modifier = modifier) {
        withTransform({
            translate(translateX, translateY)
            val cx = (gridWidth * pixelSizePx) / 2f
            val cy = (pixels.size / gridWidth * pixelSizePx) / 2f
            rotate(rotation, pivot = Offset(cx, cy))
            scale(scaleX, scaleY, pivot = Offset(cx, cy))
        }) {
            drawPixelGrid(pixels, gridWidth, pixelSizePx, overrideMap, alpha)
        }
    }
}

private fun DrawScope.drawPixelGrid(
    pixels: IntArray,
    gridWidth: Int,
    pixelSize: Float,
    overrides: Map<Int, Int>,
    alpha: Float
) {
    pixels.forEachIndexed { index, colorIdx ->
        val actualIdx = overrides[index] ?: colorIdx
        val color = PIXEL_COLORS[actualIdx] ?: Color.Transparent
        if (color == Color.Transparent) return@forEachIndexed
        val col = index % gridWidth
        val row = index / gridWidth
        drawRect(
            color = color.copy(alpha = color.alpha * alpha),
            topLeft = Offset(col * pixelSize, row * pixelSize),
            size = Size(pixelSize, pixelSize)
        )
    }
}

// Burst particles for completion animation
data class BurstParticle(
    val x: Float, val y: Float,
    val vx: Float, val vy: Float,
    val color: Color, val size: Float,
    var alpha: Float = 1f
)

fun generateBurstParticles(cx: Float, cy: Float): List<BurstParticle> {
    val colors = listOf(
        Color(0xFFFFD700), Color(0xFFFF6B6B), Color(0xFF69F0AE),
        Color(0xFF4A90E2), Color(0xFFFF9FF3), Color(0xFFFFE66D)
    )
    return (0 until 12).map { i ->
        val angle = (i * 30f) * (Math.PI / 180f)
        val speed = (2f + (i % 3) * 1.5f)
        BurstParticle(
            x = cx, y = cy,
            vx = (Math.cos(angle) * speed).toFloat(),
            vy = (Math.sin(angle) * speed).toFloat(),
            color = colors[i % colors.size],
            size = 4f + (i % 3) * 2f
        )
    }
}

package com.bits.app.ui.pixel

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

@Composable
fun LittleBit(
    modifier: Modifier = Modifier,
    pixelSize: Dp = 5.dp,
    triggerAnimation: LittleBitAnimation? = null,
    onAnimationComplete: () -> Unit = {}
) {
    val gridW = 16
    val gridH = 16

    var currentAnim by remember { mutableStateOf<LittleBitAnimation>(LittleBitAnimation.IDLE_BLINK) }
    var frameIndex by remember { mutableIntStateOf(0) }
    var isPlayingCompletion by remember { mutableStateOf(false) }

    // When triggered, override with completion animation
    LaunchedEffect(triggerAnimation) {
        if (triggerAnimation != null && triggerAnimation != LittleBitAnimation.IDLE_BLINK) {
            isPlayingCompletion = true
            currentAnim = triggerAnimation
            frameIndex = 0
            val frames = Animations.framesFor(triggerAnimation)
            for (i in frames.indices) {
                frameIndex = i
                delay(frames[i].durationMs.toLong())
            }
            isPlayingCompletion = false
            onAnimationComplete()
        }
    }

    // Idle animation loop
    LaunchedEffect(isPlayingCompletion) {
        if (!isPlayingCompletion) {
            while (true) {
                val anim = Animations.randomIdle()
                currentAnim = anim
                val frames = Animations.framesFor(anim)
                for (i in frames.indices) {
                    if (isPlayingCompletion) break
                    frameIndex = i
                    delay(frames[i].durationMs.toLong())
                }
                delay(300)
            }
        }
    }

    val frames = Animations.framesFor(currentAnim)
    val frame = frames.getOrElse(frameIndex) { AnimFrame() }

    val pixelSizePx = with(LocalDensity.current) { pixelSize.toPx() }
    val spriteWidthDp = pixelSize * gridW
    val spriteHeightDp = pixelSize * gridH

    Box(modifier = modifier) {
        PixelSprite(
            pixels = LITTLE_BIT_BASE,
            gridWidth = gridW,
            pixelSizePx = pixelSizePx,
            modifier = Modifier.size(spriteWidthDp, spriteHeightDp),
            expressionOverrides = frame.expression,
            translateX = frame.tx * pixelSizePx / 4f,
            translateY = frame.ty * pixelSizePx / 4f,
            rotation = frame.rot,
            scaleX = frame.sx,
            scaleY = frame.sy
        )
    }
}

// Full-screen animation overlay for widget taps
@Composable
fun LittleBitAnimationOverlay(
    animation: LittleBitAnimation,
    onComplete: () -> Unit
) {
    LittleBit(
        modifier = Modifier.size(96.dp),
        pixelSize = 6.dp,
        triggerAnimation = animation,
        onAnimationComplete = onComplete
    )
}

// Pixel burst effect composable
@Composable
fun PixelBurst(
    centerX: Float,
    centerY: Float,
    onComplete: () -> Unit
) {
    val progress = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        progress.animateTo(
            1f,
            animationSpec = tween(durationMillis = 500, easing = FastOutSlowInEasing)
        )
        onComplete()
    }

    val particles = remember { generateBurstParticles(centerX, centerY) }

    Canvas(modifier = Modifier) {
        val p = progress.value
        particles.forEach { particle ->
            val x = particle.x + particle.vx * p * 40f
            val y = particle.y + particle.vy * p * 40f
            val alpha = (1f - p).coerceIn(0f, 1f)
            drawRect(
                color = particle.color.copy(alpha = alpha),
                topLeft = Offset(x - particle.size / 2, y - particle.size / 2),
                size = Size(particle.size, particle.size)
            )
        }
    }
}

// Confetti burst for all-complete celebration
@Composable
fun ConfettiBurst(modifier: Modifier = Modifier) {
    val progress = remember { Animatable(0f) }

    LaunchedEffect(Unit) {
        progress.animateTo(
            1f,
            animationSpec = tween(durationMillis = 1200, easing = FastOutLinearInEasing)
        )
    }

    val particles = remember {
        (0 until 30).map { i ->
            val angle = (i * 12f) * (Math.PI / 180.0)
            val speed = 3f + (i % 5) * 1.5f
            BurstParticle(
                x = 0f, y = 0f,
                vx = (Math.cos(angle) * speed).toFloat(),
                vy = (Math.sin(angle) * speed).toFloat(),
                color = listOf(
                    Color(0xFFFFD700), Color(0xFFFF6B6B), Color(0xFF69F0AE),
                    Color(0xFF4A90E2), Color(0xFFFF9FF3), Color(0xFFFFE66D),
                    Color(0xFFB39DDB), Color(0xFF80DEEA)
                )[i % 8],
                size = 5f + (i % 4) * 1.5f
            )
        }
    }

    Canvas(modifier = modifier) {
        val cx = size.width / 2f
        val cy = size.height / 2f
        val p = progress.value
        particles.forEach { particle ->
            val x = cx + particle.vx * p * 80f
            val y = cy + particle.vy * p * 80f + (p * p * 40f) // gravity
            val alpha = (1f - p * 0.8f).coerceIn(0f, 1f)
            drawRect(
                color = particle.color.copy(alpha = alpha),
                topLeft = Offset(x - particle.size / 2, y - particle.size / 2),
                size = Size(particle.size, particle.size)
            )
        }
    }
}

package com.bits.app.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.bits.app.ui.pixel.*
import com.bits.app.ui.theme.BitsTheme
import kotlinx.coroutines.delay

class AnimationActivity : ComponentActivity() {
    companion object {
        const val EXTRA_ANIMATION = "extra_animation"
        const val EXTRA_ALL_COMPLETE = "extra_all_complete"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val animName = intent.getStringExtra(EXTRA_ANIMATION)
        val allComplete = intent.getBooleanExtra(EXTRA_ALL_COMPLETE, false)
        val animation = if (allComplete) LittleBitAnimation.VICTORY
        else try {
            animName?.let { LittleBitAnimation.valueOf(it) } ?: Animations.randomCompletion()
        } catch (e: IllegalArgumentException) {
            Animations.randomCompletion()
        }

        setContent {
            BitsTheme {
                AnimationOverlay(
                    animation = animation,
                    showConfetti = allComplete,
                    onDismiss = { finish() }
                )
            }
        }
    }
}

@Composable
fun AnimationOverlay(
    animation: LittleBitAnimation,
    showConfetti: Boolean,
    onDismiss: () -> Unit
) {
    var visible by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        val frames = Animations.framesFor(animation)
        val totalMs = frames.sumOf { it.durationMs.toLong() } + 400L
        delay(totalMs)
        visible = false
        delay(300)
        onDismiss()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.35f))
            .clickable { onDismiss() },
        contentAlignment = Alignment.Center
    ) {
        AnimatedVisibility(
            visible = visible,
            enter = scaleIn() + fadeIn(),
            exit = scaleOut() + fadeOut()
        ) {
            Box(contentAlignment = Alignment.Center) {
                LittleBit(
                    modifier = Modifier.size(120.dp),
                    pixelSize = 7.dp,
                    triggerAnimation = animation,
                    onAnimationComplete = {}
                )
                if (showConfetti) {
                    ConfettiBurst(modifier = Modifier.size(200.dp))
                }
            }
        }
    }
}

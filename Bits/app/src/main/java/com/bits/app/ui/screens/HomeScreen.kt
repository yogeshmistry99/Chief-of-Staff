package com.bits.app.ui.screens

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bits.app.data.model.Habit
import com.bits.app.data.model.HabitIcon
import com.bits.app.ui.pixel.*
import com.bits.app.ui.theme.*
import com.bits.app.ui.viewmodel.HabitUiState
import com.bits.app.util.HapticUtil
import com.bits.app.util.SoundUtil
import kotlinx.coroutines.delay

@Composable
fun HomeScreen(
    uiState: HabitUiState,
    onCompleteHabit: (Long) -> Unit,
    onNavigateToAdd: () -> Unit,
    onNavigateToEdit: (Habit) -> Unit,
    onClearJustCompleted: () -> Unit
) {
    val context = LocalContext.current

    var triggerAnim by remember { mutableStateOf<LittleBitAnimation?>(null) }
    var showVictory by remember { mutableStateOf(false) }
    var showConfetti by remember { mutableStateOf(false) }

    // Detect all-complete
    LaunchedEffect(uiState.allComplete) {
        if (uiState.allComplete && uiState.habits.isNotEmpty()) {
            delay(400)
            showVictory = true
            showConfetti = true
            SoundUtil.playVictoryFanfare(context)
            delay(2500)
            showVictory = false
        }
    }

    // Play completion animation when a habit is just completed
    LaunchedEffect(uiState.justCompletedId) {
        if (uiState.justCompletedId != null && !uiState.allComplete) {
            triggerAnim = Animations.randomCompletion()
            SoundUtil.playCoinChime(context)
        }
    }

    Box(modifier = Modifier.fillMaxSize().background(BitsBg)) {

        Column(modifier = Modifier.fillMaxSize()) {
            // Header with Little Bit
            HomeHeader(
                triggerAnim = triggerAnim,
                showVictory = showVictory,
                onAnimComplete = {
                    triggerAnim = null
                    onClearJustCompleted()
                }
            )

            // All-complete banner
            AnimatedVisibility(
                visible = uiState.allComplete,
                enter = slideInVertically() + fadeIn(),
                exit = slideOutVertically() + fadeOut()
            ) {
                AllCompleteBanner()
            }

            // Habit list
            if (uiState.habits.isEmpty()) {
                EmptyState(onAddClick = onNavigateToAdd)
            } else {
                LazyColumn(
                    modifier = Modifier.weight(1f).padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    contentPadding = PaddingValues(vertical = 12.dp)
                ) {
                    items(uiState.habits, key = { it.id }) { habit ->
                        val isCompleted = habit.id in uiState.completedIds
                        HabitRow(
                            habit = habit,
                            isCompleted = isCompleted,
                            onTap = {
                                if (!isCompleted) {
                                    HapticUtil.completion(context)
                                    onCompleteHabit(habit.id)
                                }
                            },
                            onLongPress = { onNavigateToEdit(habit) }
                        )
                    }
                }
            }
        }

        // Add button
        FloatingActionButton(
            onClick = onNavigateToAdd,
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(20.dp),
            containerColor = BitsAccent,
            contentColor = Color.Black,
            shape = RoundedCornerShape(4.dp)
        ) {
            Text("+", fontSize = 24.sp, fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace)
        }

        // Confetti overlay
        if (showConfetti) {
            ConfettiBurst(
                modifier = Modifier.fillMaxSize()
            )
            LaunchedEffect(Unit) {
                delay(1400)
                showConfetti = false
            }
        }
    }
}

@Composable
private fun HomeHeader(
    triggerAnim: LittleBitAnimation?,
    showVictory: Boolean,
    onAnimComplete: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(160.dp)
            .background(BitsPanel)
            .padding(16.dp)
    ) {
        // Title
        Text(
            text = "BITS",
            style = MaterialTheme.typography.displayMedium,
            color = BitsAccent,
            modifier = Modifier.align(Alignment.TopStart)
        )
        Text(
            text = "daily habits",
            style = MaterialTheme.typography.bodyMedium,
            color = BitsTextDim,
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(top = 34.dp)
        )

        // Little Bit mascot
        Box(modifier = Modifier.align(Alignment.CenterEnd).padding(end = 8.dp)) {
            LittleBit(
                modifier = Modifier.size(80.dp),
                pixelSize = 5.dp,
                triggerAnimation = if (showVictory) LittleBitAnimation.VICTORY
                                   else triggerAnim,
                onAnimationComplete = onAnimComplete
            )
        }

        // Ground decoration
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(6.dp)
                .align(Alignment.BottomCenter)
                .background(BitsPixelGrnd)
        )
    }
}

@Composable
private fun AllCompleteBanner() {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(BitsAccent.copy(alpha = 0.15f))
            .padding(horizontal = 16.dp, vertical = 8.dp)
    ) {
        Text(
            text = "★ ALL DONE! LITTLE BIT IS PROUD ★",
            style = MaterialTheme.typography.labelMedium,
            color = BitsAccent
        )
    }
}

@Composable
private fun HabitRow(
    habit: Habit,
    isCompleted: Boolean,
    onTap: () -> Unit,
    onLongPress: () -> Unit
) {
    val scale = remember { Animatable(1f) }
    val context = LocalContext.current

    val bgColor by animateColorAsState(
        targetValue = if (isCompleted) BitsAccent.copy(alpha = 0.12f) else BitsPanel,
        animationSpec = tween(300), label = "bg"
    )
    val alpha by animateFloatAsState(
        targetValue = if (isCompleted) 0.55f else 1f,
        animationSpec = tween(300), label = "alpha"
    )

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .scale(scale.value)
            .background(bgColor, RoundedCornerShape(4.dp))
            .border(
                width = 2.dp,
                color = if (isCompleted) BitsAccent.copy(alpha = 0.4f) else BitsPanel,
                shape = RoundedCornerShape(4.dp)
            )
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null
            ) {
                if (!isCompleted) {
                    onTap()
                }
            }
            .padding(horizontal = 12.dp, vertical = 10.dp)
            .alpha(alpha),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Habit icon (8×8 pixel art)
        PixelSprite(
            pixels = habitIconPixels(habit.iconType),
            gridWidth = 8,
            pixelSizePx = 4f,
            modifier = Modifier.size(32.dp)
        )

        // Name
        Text(
            text = habit.name.uppercase(),
            style = MaterialTheme.typography.bodyLarge,
            color = if (isCompleted) BitsTextDim else BitsText,
            textDecoration = if (isCompleted) TextDecoration.LineThrough else null,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f)
        )

        // Checkmark
        AnimatedVisibility(visible = isCompleted) {
            Text("✓", color = BitsAccent, style = MaterialTheme.typography.titleMedium)
        }
    }
}

@Composable
private fun EmptyState(onAddClick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Spacer(Modifier.height(24.dp))
        LittleBit(modifier = Modifier.size(80.dp), pixelSize = 5.dp)
        Spacer(Modifier.height(8.dp))
        Text(
            "no habits yet!",
            style = MaterialTheme.typography.titleMedium,
            color = BitsTextDim
        )
        Text(
            "tap + to add your first bit",
            style = MaterialTheme.typography.bodyMedium,
            color = BitsTextDim.copy(alpha = 0.6f)
        )
    }
}

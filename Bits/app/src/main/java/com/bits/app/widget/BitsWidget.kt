package com.bits.app.widget

import android.content.Context
import android.content.Intent
import androidx.compose.runtime.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.*
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.clickable
import androidx.glance.appwidget.*
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.layout.*
import androidx.glance.text.*
import androidx.glance.unit.ColorProvider
import com.bits.app.BitsApplication
import com.bits.app.data.model.HabitIcon
import com.bits.app.ui.MainActivity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext

class BitsWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val repo = (context.applicationContext as BitsApplication).repository

        // Load habits and today's completions once
        var habits = emptyList<com.bits.app.data.model.Habit>()
        var completedIds = emptySet<Long>()

        withContext(Dispatchers.IO) {
            // Collect one emission from each Flow
            habits = repo.getAllHabits().first()
            completedIds = repo.getTodayCompletedIds().toSet()
        }

        provideContent {
            WidgetContent(
                habits = habits,
                completedIds = completedIds
            )
        }
    }
}

@Composable
private fun WidgetContent(
    habits: List<com.bits.app.data.model.Habit>,
    completedIds: Set<Long>
) {
    val pendingHabits = habits.filter { it.id !in completedIds }.take(6)
    val allDone = habits.isNotEmpty() && pendingHabits.isEmpty()

    Column(
        modifier = GlanceModifier
            .background(ColorProvider(Color(0xFF1A2B1A)))
            .fillMaxSize()
            .padding(4.dp)
            .clickable(actionStartActivity<MainActivity>()),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Title
        Text(
            text = "BITS",
            style = TextStyle(
                color = ColorProvider(Color(0xFF5CC85C)),
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold
            )
        )

        Spacer(GlanceModifier.height(4.dp))

        // Little Bit placeholder — rendered as a colored box since
        // Glance doesn't support Canvas; use a solid color mascot block
        Box(
            modifier = GlanceModifier
                .size(40.dp, 40.dp)
                .background(ColorProvider(Color(0xFF5CC85C)))
                .cornerRadius(2.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = if (allDone) "★" else "^_^",
                style = TextStyle(
                    color = ColorProvider(Color.White),
                    fontSize = if (allDone) 14.sp else 8.sp
                )
            )
        }

        Spacer(GlanceModifier.height(6.dp))

        // Habit icons grid
        if (allDone) {
            Text(
                text = "ALL\nDONE!",
                style = TextStyle(
                    color = ColorProvider(Color(0xFF5CC85C)),
                    fontSize = 8.sp,
                    fontWeight = FontWeight.Bold
                )
            )
        } else {
            pendingHabits.chunked(2).forEach { rowHabits ->
                Row(
                    modifier = GlanceModifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    rowHabits.forEach { habit ->
                        HabitIconButton(habit = habit)
                        Spacer(GlanceModifier.width(4.dp))
                    }
                }
                Spacer(GlanceModifier.height(3.dp))
            }
        }
    }
}

@Composable
private fun HabitIconButton(
    habit: com.bits.app.data.model.Habit
) {
    val iconEmoji = habitIconEmoji(habit.iconType)
    val habitIdKey = ActionParameters.Key<Long>("habitId")

    Box(
        modifier = GlanceModifier
            .size(28.dp, 28.dp)
            .background(ColorProvider(Color(0xFF0F3460)))
            .cornerRadius(2.dp)
            .clickable(
                actionRunCallback<CompleteHabitCallback>(
                    actionParametersOf(habitIdKey to habit.id)
                )
            ),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = iconEmoji,
            style = TextStyle(fontSize = 14.sp)
        )
    }
}

class CompleteHabitCallback : ActionCallback {
    override suspend fun onAction(
        context: Context,
        glanceId: GlanceId,
        parameters: ActionParameters
    ) {
        val habitIdKey = ActionParameters.Key<Long>("habitId")
        val habitId = parameters[habitIdKey] ?: return
        val repo = (context.applicationContext as BitsApplication).repository

        val didComplete = withContext(Dispatchers.IO) {
            repo.completeHabit(habitId)
        }

        if (didComplete) {
            withContext(Dispatchers.Main) {
                com.bits.app.util.HapticUtil.completion(context)
                com.bits.app.util.SoundUtil.playCoinChime(context)

                val anim = com.bits.app.ui.pixel.Animations.randomCompletion()
                val animIntent = Intent(context, com.bits.app.ui.AnimationActivity::class.java).apply {
                    putExtra(com.bits.app.ui.AnimationActivity.EXTRA_ANIMATION, anim.name)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(animIntent)
            }
        }

        // Refresh all widget instances
        GlanceAppWidgetManager(context).getGlanceIds(BitsWidget::class.java).forEach { id ->
            BitsWidget().update(context, id)
        }
    }
}

private fun habitIconEmoji(icon: HabitIcon): String = when (icon) {
    HabitIcon.WATER    -> "💧"
    HabitIcon.WALK     -> "👟"
    HabitIcon.MORNING  -> "☀️"
    HabitIcon.BOOK     -> "📖"
    HabitIcon.SLEEP    -> "🌙"
    HabitIcon.FOOD     -> "🍎"
    HabitIcon.MEDITATE -> "🌸"
    HabitIcon.WORKOUT  -> "🏋️"
    HabitIcon.JOURNAL  -> "✏️"
    HabitIcon.VITAMINS -> "💊"
}

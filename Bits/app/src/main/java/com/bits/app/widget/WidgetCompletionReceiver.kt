package com.bits.app.widget

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.bits.app.BitsApplication
import androidx.glance.appwidget.GlanceAppWidgetManager
import com.bits.app.ui.AnimationActivity
import com.bits.app.ui.pixel.Animations
import com.bits.app.util.HapticUtil
import com.bits.app.util.SoundUtil
import kotlinx.coroutines.*

class WidgetCompletionReceiver : BroadcastReceiver() {
    companion object {
        const val ACTION_COMPLETE = "com.bits.app.COMPLETE_HABIT"
        const val EXTRA_HABIT_ID = "habit_id"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_COMPLETE) return
        val habitId = intent.getLongExtra(EXTRA_HABIT_ID, -1L)
        if (habitId == -1L) return

        val repo = (context.applicationContext as BitsApplication).repository

        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val didComplete = repo.completeHabit(habitId)
                if (didComplete) {
                    val allHabits = repo.getAllHabits()
                    val completedCount = repo.getTodayCompletionCount()
                    // Determine if all done (we can't easily get total synchronously without Flow,
                    // so just pick a random completion animation for now)
                    val anim = Animations.randomCompletion()

                    withContext(Dispatchers.Main) {
                        HapticUtil.completion(context)
                        SoundUtil.playCoinChime(context)

                        // Launch animation overlay
                        val animIntent = Intent(context, AnimationActivity::class.java).apply {
                            putExtra(AnimationActivity.EXTRA_ANIMATION, anim.name)
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                        context.startActivity(animIntent)
                    }

                    // Refresh all widget instances
                    GlanceAppWidgetManager(context).getGlanceIds(BitsWidget::class.java).forEach { id ->
                        BitsWidget().update(context, id)
                    }
                }
            } finally {
                pendingResult.finish()
            }
        }
    }
}

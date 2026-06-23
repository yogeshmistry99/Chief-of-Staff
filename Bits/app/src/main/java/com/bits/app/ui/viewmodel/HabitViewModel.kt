package com.bits.app.ui.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.bits.app.BitsApplication
import com.bits.app.data.model.Habit
import com.bits.app.data.model.HabitCompletion
import com.bits.app.data.model.HabitIcon
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

data class HabitUiState(
    val habits: List<Habit> = emptyList(),
    val completedIds: Set<Long> = emptySet(),
    val allComplete: Boolean = false,
    val justCompletedId: Long? = null
)

class HabitViewModel(application: Application) : AndroidViewModel(application) {
    private val repo = (application as BitsApplication).repository

    private val _justCompleted = MutableStateFlow<Long?>(null)

    val uiState: StateFlow<HabitUiState> = combine(
        repo.getAllHabits(),
        repo.getTodayCompletions(),
        _justCompleted
    ) { habits, completions, justCompleted ->
        val completedIds = completions.map { it.habitId }.toSet()
        HabitUiState(
            habits = habits,
            completedIds = completedIds,
            allComplete = habits.isNotEmpty() && completedIds.size >= habits.size,
            justCompletedId = justCompleted
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), HabitUiState())

    fun completeHabit(habitId: Long) {
        viewModelScope.launch {
            val didComplete = repo.completeHabit(habitId)
            if (didComplete) {
                _justCompleted.value = habitId
            }
        }
    }

    fun clearJustCompleted() {
        _justCompleted.value = null
    }

    fun addHabit(name: String, icon: HabitIcon) {
        viewModelScope.launch { repo.addHabit(name, icon) }
    }

    fun updateHabit(habit: Habit) {
        viewModelScope.launch { repo.updateHabit(habit) }
    }

    fun deleteHabit(habit: Habit) {
        viewModelScope.launch { repo.deleteHabit(habit) }
    }
}

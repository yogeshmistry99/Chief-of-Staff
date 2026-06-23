package com.bits.app.data.repository

import com.bits.app.data.db.CompletionDao
import com.bits.app.data.db.HabitDao
import com.bits.app.data.model.Habit
import com.bits.app.data.model.HabitCompletion
import kotlinx.coroutines.flow.Flow
import java.time.LocalDate

class HabitRepository(
    private val habitDao: HabitDao,
    private val completionDao: CompletionDao
) {
    fun getAllHabits(): Flow<List<Habit>> = habitDao.getAllHabits()

    fun getTodayCompletions(): Flow<List<HabitCompletion>> =
        completionDao.getCompletionsForDate(LocalDate.now().toString())

    suspend fun addHabit(name: String, iconType: com.bits.app.data.model.HabitIcon): Long {
        val order = habitDao.getHabitCount()
        return habitDao.insertHabit(Habit(name = name, iconType = iconType, sortOrder = order))
    }

    suspend fun updateHabit(habit: Habit) = habitDao.updateHabit(habit)

    suspend fun deleteHabit(habit: Habit) = habitDao.deleteHabit(habit)

    suspend fun toggleCompletion(habitId: Long): Boolean {
        val today = LocalDate.now().toString()
        val completedIds = completionDao.getCompletedHabitIdsForDate(today)
        return if (habitId in completedIds) {
            completionDao.deleteCompletion(habitId, today)
            false
        } else {
            completionDao.insertCompletion(HabitCompletion(habitId = habitId, date = today))
            true
        }
    }

    suspend fun completeHabit(habitId: Long): Boolean {
        val today = LocalDate.now().toString()
        val completedIds = completionDao.getCompletedHabitIdsForDate(today)
        if (habitId in completedIds) return false
        completionDao.insertCompletion(HabitCompletion(habitId = habitId, date = today))
        return true
    }

    suspend fun getTodayCompletedIds(): List<Long> =
        completionDao.getCompletedHabitIdsForDate(LocalDate.now().toString())

    suspend fun getTodayCompletionCount(): Int =
        completionDao.getCompletionCountForDate(LocalDate.now().toString())
}

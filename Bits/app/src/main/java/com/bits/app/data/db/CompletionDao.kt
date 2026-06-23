package com.bits.app.data.db

import androidx.room.*
import com.bits.app.data.model.HabitCompletion
import kotlinx.coroutines.flow.Flow

@Dao
interface CompletionDao {
    @Query("SELECT * FROM habit_completions WHERE date = :date")
    fun getCompletionsForDate(date: String): Flow<List<HabitCompletion>>

    @Query("SELECT habitId FROM habit_completions WHERE date = :date")
    suspend fun getCompletedHabitIdsForDate(date: String): List<Long>

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertCompletion(completion: HabitCompletion): Long

    @Query("DELETE FROM habit_completions WHERE habitId = :habitId AND date = :date")
    suspend fun deleteCompletion(habitId: Long, date: String)

    @Query("SELECT COUNT(*) FROM habit_completions WHERE date = :date")
    suspend fun getCompletionCountForDate(date: String): Int
}

package com.bits.app

import android.app.Application
import com.bits.app.data.db.AppDatabase
import com.bits.app.data.repository.HabitRepository

class BitsApplication : Application() {
    val database by lazy { AppDatabase.getInstance(this) }
    val repository by lazy {
        HabitRepository(database.habitDao(), database.completionDao())
    }
}

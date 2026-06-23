package com.bits.app.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "habits")
data class Habit(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val iconType: HabitIcon,
    val sortOrder: Int = 0,
    val createdAt: Long = System.currentTimeMillis()
)

enum class HabitIcon {
    WATER,      // droplet
    WALK,       // shoe
    MORNING,    // sun
    BOOK,       // book
    SLEEP,      // moon
    FOOD,       // apple
    MEDITATE,   // lotus
    WORKOUT,    // dumbbell
    JOURNAL,    // pencil
    VITAMINS    // pill
}

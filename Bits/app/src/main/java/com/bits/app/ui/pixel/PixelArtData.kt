package com.bits.app.ui.pixel

import androidx.compose.ui.graphics.Color

// Color palette for Little Bit
object Palette {
    val TRANSPARENT = Color.Transparent
    val SKIN        = Color(0xFFFFD699)
    val SKIN_SHADOW = Color(0xFFE8B870)
    val HAIR        = Color(0xFF5CC85C)
    val HAIR_HI     = Color(0xFF8EE88E)
    val OUTLINE     = Color(0xFF2A2A2A)
    val SHIRT       = Color(0xFF4A90E2)
    val SHIRT_DARK  = Color(0xFF2C6DB5)
    val PANTS       = Color(0xFF6D4C41)
    val PANTS_DARK  = Color(0xFF4E342E)
    val SHOE        = Color(0xFF3E3E3E)
    val CHEEK       = Color(0xFFFF9999)
    val WHITE       = Color(0xFFFFFFFF)
    val EYE         = Color(0xFF1A1A2E)
    val PUPIL       = Color(0xFF4A90E2)
    val MOUTH       = Color(0xFFCC4444)
}

// Pixel index → Color
val PIXEL_COLORS = mapOf(
    0 to Palette.TRANSPARENT,
    1 to Palette.SKIN,
    2 to Palette.HAIR,
    3 to Palette.OUTLINE,
    4 to Palette.SHIRT,
    5 to Palette.PANTS,
    6 to Palette.SHOE,
    7 to Palette.CHEEK,
    8 to Palette.HAIR_HI,
    9 to Palette.EYE,
    10 to Palette.WHITE,
    11 to Palette.MOUTH,
    12 to Palette.SHIRT_DARK,
    13 to Palette.PANTS_DARK,
    14 to Palette.SKIN_SHADOW,
    15 to Palette.PUPIL
)

// 16×16 Little Bit base sprite
// Read left-to-right, top-to-bottom
val LITTLE_BIT_BASE: IntArray = intArrayOf(
    //  0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
        0, 0, 0, 0, 2, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0,  // row 0
        0, 0, 0, 2, 8, 2, 2, 2, 2, 8, 2, 0, 0, 0, 0, 0,  // row 1
        0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 0,  // row 2
        0, 0, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 0, 0, 0, 0,  // row 3
        0, 0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 3, 0, 0, 0, 0,  // row 4
        0, 0, 3, 1, 9, 1, 1, 1, 1, 9, 1, 3, 0, 0, 0, 0,  // row 5 eyes
        0, 0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 3, 0, 0, 0, 0,  // row 6
        0, 0, 3, 1, 7, 1, 11,11, 1, 7, 1, 3, 0, 0, 0, 0, // row 7 cheeks+mouth
        0, 0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 3, 0, 0, 0, 0,  // row 8
        0, 0, 3, 3, 4, 4, 4, 4, 4, 4, 3, 3, 0, 0, 0, 0,  // row 9 shirt collar
        0, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 3, 0, 0, 0,  // row 10 shirt + arms
        0, 3, 4, 4, 4,12, 4, 4,12, 4, 4, 4, 3, 0, 0, 0,  // row 11 shirt detail
        0, 0, 3, 3, 5, 5, 5, 5, 5, 5, 3, 3, 0, 0, 0, 0,  // row 12 pants top
        0, 0, 3, 5, 5, 5, 3, 3, 5, 5, 5, 3, 0, 0, 0, 0,  // row 13 pants legs
        0, 0, 3, 6, 6, 3, 0, 0, 3, 6, 6, 3, 0, 0, 0, 0,  // row 14 shoes top
        0, 0, 3, 6, 6, 6, 0, 0, 3, 6, 6, 6, 0, 0, 0, 0,  // row 15 shoes bot
)

// Expression variants — override specific pixels in the face area (rows 5, 7)
// Format: list of (row, col, colorIndex)
object Expressions {
    val NORMAL = listOf<Triple<Int,Int,Int>>() // uses base

    val HAPPY = listOf(
        // eyes become curved (^-^)
        Triple(5, 4, 3), Triple(5, 5, 3), Triple(5, 9, 3), Triple(5, 10, 3),
        Triple(6, 3, 9), Triple(6, 10, 9),
        // big smile
        Triple(7, 5, 11), Triple(7, 6, 11), Triple(7, 7, 11), Triple(7, 8, 11)
    )

    val SURPRISED = listOf(
        // wide eyes
        Triple(5, 3, 9), Triple(5, 4, 9), Triple(5, 5, 9),
        Triple(5, 8, 9), Triple(5, 9, 9), Triple(5, 10, 9),
        // O mouth
        Triple(7, 5, 3), Triple(7, 6, 11), Triple(7, 7, 11), Triple(7, 8, 3),
        Triple(8, 5, 11), Triple(8, 6, 1), Triple(8, 7, 1), Triple(8, 8, 11)
    )

    val SLEEPY = listOf(
        // half-closed eyes
        Triple(5, 4, 3), Triple(5, 9, 3),
        Triple(5, 5, 9), Triple(5, 6, 9),
        Triple(5, 8, 9),
        // flat mouth
        Triple(7, 5, 3), Triple(7, 6, 3), Triple(7, 7, 3), Triple(7, 8, 3)
    )

    val CONFUSED = listOf(
        // one eyebrow raised
        Triple(4, 4, 3), Triple(4, 3, 3),
        // squiggly mouth
        Triple(7, 5, 11), Triple(7, 6, 1), Triple(7, 7, 11), Triple(7, 8, 1)
    )

    val WINK = listOf(
        // left eye closed
        Triple(5, 4, 3),
        Triple(6, 4, 9),
        // right eye normal, smile
        Triple(7, 6, 11), Triple(7, 7, 11)
    )

    val VICTORY = listOf(
        // star eyes
        Triple(5, 3, 8), Triple(5, 5, 8), Triple(4, 4, 8), Triple(6, 4, 8),
        Triple(5, 8, 8), Triple(5, 10, 8), Triple(4, 9, 8), Triple(6, 9, 8),
        // big laugh mouth
        Triple(7, 4, 11), Triple(7, 5, 1), Triple(7, 6, 11),
        Triple(7, 7, 11), Triple(7, 8, 1), Triple(7, 9, 11)
    )
}

// Habit icon pixel art (8×8 sprites)
val HABIT_ICON_WATER: IntArray = intArrayOf(
    0,0,0,3,0,0,0,0,
    0,0,3,4,3,0,0,0,
    0,3,4,15,4,3,0,0,
    0,3,4,15,4,3,0,0,
    3,4,4,15,4,4,3,0,
    3,4,4,4,4,4,3,0,
    0,3,4,4,4,3,0,0,
    0,0,3,3,3,0,0,0
)

val HABIT_ICON_WALK: IntArray = intArrayOf(
    0,0,3,3,0,0,0,0,
    0,3,6,6,3,0,0,0,
    0,0,3,3,3,0,0,0,
    0,0,0,3,4,3,0,0,
    0,0,3,4,4,4,3,0,
    0,0,3,4,3,0,0,0,
    0,3,6,3,0,0,0,0,
    3,6,6,3,0,0,0,0
)

val HABIT_ICON_SUN: IntArray = intArrayOf(
    0,8,0,8,0,8,0,0,
    0,0,8,8,8,0,0,0,
    8,8,8,7,8,8,8,0,
    0,8,8,7,8,8,0,0,
    8,8,8,7,8,8,8,0,
    0,0,8,8,8,0,0,0,
    0,8,0,8,0,8,0,0,
    0,0,0,0,0,0,0,0
)

val HABIT_ICON_BOOK: IntArray = intArrayOf(
    0,3,3,3,3,3,0,0,
    3,4,4,4,4,4,3,0,
    3,4,3,4,4,4,3,0,
    3,4,3,4,4,4,3,0,
    3,4,3,4,4,4,3,0,
    3,4,3,4,4,4,3,0,
    3,4,4,4,4,4,3,0,
    0,3,3,3,3,3,0,0
)

val HABIT_ICON_MOON: IntArray = intArrayOf(
    0,0,3,3,0,0,0,0,
    0,3,8,8,3,0,0,0,
    3,8,8,8,0,3,0,0,
    3,8,8,8,0,3,0,0,
    3,8,8,8,0,3,0,0,
    0,3,8,8,3,0,0,0,
    0,0,3,3,0,0,0,0,
    0,0,0,0,0,0,0,0
)

val HABIT_ICON_APPLE: IntArray = intArrayOf(
    0,0,0,2,0,0,0,0,
    0,0,3,2,0,0,0,0,
    0,3,11,11,3,3,0,0,
    3,11,11,11,11,11,3,0,
    3,11,11,11,11,11,3,0,
    3,11,11,11,11,11,3,0,
    0,3,11,11,11,3,0,0,
    0,0,3,3,3,0,0,0
)

val HABIT_ICON_MEDITATE: IntArray = intArrayOf(
    0,0,0,1,1,0,0,0,
    0,0,0,1,1,0,0,0,
    0,0,1,1,1,1,0,0,
    0,1,7,1,1,7,1,0,
    1,1,1,1,1,1,1,0,
    0,1,4,1,1,4,1,0,
    0,0,0,4,4,0,0,0,
    0,0,4,0,0,4,0,0
)

val HABIT_ICON_WORKOUT: IntArray = intArrayOf(
    0,3,0,0,0,0,3,0,
    3,3,3,3,3,3,3,3,
    0,3,0,0,0,0,3,0,
    0,3,3,3,3,3,3,0,
    0,3,3,3,3,3,3,0,
    0,3,0,0,0,0,3,0,
    3,3,3,3,3,3,3,3,
    0,3,0,0,0,0,3,0
)

val HABIT_ICON_JOURNAL: IntArray = intArrayOf(
    0,3,3,3,3,3,3,0,
    3,10,10,10,10,10,3,0,
    3,10,3,3,3,10,3,0,
    3,10,3,3,3,10,3,0,
    3,10,3,3,3,10,3,0,
    3,10,10,3,10,10,3,0,
    3,10,10,10,10,10,3,0,
    0,3,3,3,3,3,3,0
)

val HABIT_ICON_VITAMINS: IntArray = intArrayOf(
    0,0,3,3,3,0,0,0,
    0,3,11,11,11,3,0,0,
    3,11,11,10,11,11,3,0,
    3,11,11,11,11,11,3,0,
    3,11,11,11,11,11,3,0,
    0,3,11,11,11,3,0,0,
    0,0,3,3,3,0,0,0,
    0,0,0,0,0,0,0,0
)

fun habitIconPixels(icon: com.bits.app.data.model.HabitIcon): IntArray = when (icon) {
    com.bits.app.data.model.HabitIcon.WATER    -> HABIT_ICON_WATER
    com.bits.app.data.model.HabitIcon.WALK     -> HABIT_ICON_WALK
    com.bits.app.data.model.HabitIcon.MORNING  -> HABIT_ICON_SUN
    com.bits.app.data.model.HabitIcon.BOOK     -> HABIT_ICON_BOOK
    com.bits.app.data.model.HabitIcon.SLEEP    -> HABIT_ICON_MOON
    com.bits.app.data.model.HabitIcon.FOOD     -> HABIT_ICON_APPLE
    com.bits.app.data.model.HabitIcon.MEDITATE -> HABIT_ICON_MEDITATE
    com.bits.app.data.model.HabitIcon.WORKOUT  -> HABIT_ICON_WORKOUT
    com.bits.app.data.model.HabitIcon.JOURNAL  -> HABIT_ICON_JOURNAL
    com.bits.app.data.model.HabitIcon.VITAMINS -> HABIT_ICON_VITAMINS
}

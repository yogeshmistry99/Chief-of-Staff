package com.bits.app.ui.pixel

enum class LittleBitAnimation {
    IDLE_BLINK,
    IDLE_LOOK_AROUND,
    IDLE_YAWN,
    IDLE_TAP_FOOT,

    // Completion reactions
    DANCE,
    TRIP_AND_RECOVER,
    BACKFLIP,
    FALL_ASLEEP_STARTLE,
    WAVE,
    SPIN,
    SNEEZE,
    SCRATCH_HEAD,
    THUMBS_UP,
    HEAD_BONK,
    VICTORY
}

data class AnimFrame(
    val tx: Float = 0f,
    val ty: Float = 0f,
    val rot: Float = 0f,
    val sx: Float = 1f,
    val sy: Float = 1f,
    val expression: List<Triple<Int,Int,Int>> = Expressions.NORMAL,
    val durationMs: Int = 80
)

object Animations {

    val IDLE_BLINK = listOf(
        AnimFrame(durationMs = 2000),
        AnimFrame(expression = listOf(
            Triple(5,4,3), Triple(5,5,3),
            Triple(5,8,3), Triple(5,9,3)
        ), durationMs = 100),
        AnimFrame(durationMs = 100)
    )

    val IDLE_LOOK_AROUND = listOf(
        AnimFrame(durationMs = 600),
        AnimFrame(expression = listOf(
            Triple(5,3,9), Triple(5,8,9),
            Triple(5,4,1), Triple(5,9,1)
        ), durationMs = 500),
        AnimFrame(durationMs = 400),
        AnimFrame(expression = listOf(
            Triple(5,5,9), Triple(5,10,9),
            Triple(5,4,1), Triple(5,9,1)
        ), durationMs = 500),
        AnimFrame(durationMs = 400)
    )

    val IDLE_YAWN = listOf(
        AnimFrame(durationMs = 300),
        AnimFrame(expression = Expressions.SLEEPY, ty = 1f, durationMs = 500),
        AnimFrame(expression = Expressions.SLEEPY, ty = 2f, durationMs = 600),
        AnimFrame(expression = Expressions.SLEEPY + listOf(
            Triple(7,5,3), Triple(7,6,1), Triple(7,7,1), Triple(7,8,3)
        ), ty = 2f, durationMs = 700),
        AnimFrame(expression = Expressions.SLEEPY, ty = 1f, durationMs = 400),
        AnimFrame(durationMs = 300)
    )

    val IDLE_TAP_FOOT = listOf(
        AnimFrame(durationMs = 400),
        AnimFrame(ty = 2f, durationMs = 150),
        AnimFrame(durationMs = 150),
        AnimFrame(ty = 2f, durationMs = 150),
        AnimFrame(durationMs = 150),
        AnimFrame(ty = 2f, durationMs = 150),
        AnimFrame(durationMs = 400)
    )

    // --- Completion animations ---

    val DANCE = listOf(
        AnimFrame(ty = -4f, rot = -8f, expression = Expressions.HAPPY, durationMs = 120),
        AnimFrame(ty = -8f, rot = 8f, expression = Expressions.HAPPY, durationMs = 120),
        AnimFrame(ty = -4f, rot = -8f, expression = Expressions.HAPPY, durationMs = 120),
        AnimFrame(ty = -8f, rot = 8f, expression = Expressions.HAPPY, durationMs = 120),
        AnimFrame(ty = -4f, rot = -8f, expression = Expressions.HAPPY, durationMs = 120),
        AnimFrame(ty = -8f, rot = 8f, expression = Expressions.HAPPY, durationMs = 120),
        AnimFrame(expression = Expressions.HAPPY, durationMs = 200)
    )

    val TRIP = listOf(
        AnimFrame(durationMs = 100),
        AnimFrame(rot = 15f, tx = 2f, ty = 2f, durationMs = 100),
        AnimFrame(rot = 45f, tx = 6f, ty = 6f, durationMs = 100),
        AnimFrame(rot = 90f, tx = 10f, ty = 8f, expression = Expressions.SURPRISED, durationMs = 200),
        AnimFrame(rot = 90f, tx = 10f, ty = 8f, expression = Expressions.SURPRISED, durationMs = 150),
        AnimFrame(rot = 45f, tx = 6f, ty = 4f, durationMs = 100),
        AnimFrame(rot = 15f, tx = 2f, ty = 1f, durationMs = 100),
        AnimFrame(durationMs = 80),
        AnimFrame(ty = -3f, expression = Expressions.WINK, durationMs = 80),
        AnimFrame(expression = Expressions.WINK, durationMs = 300)
    )

    val BACKFLIP = listOf(
        AnimFrame(ty = -2f, durationMs = 80),
        AnimFrame(ty = -6f, durationMs = 80),
        AnimFrame(ty = -10f, rot = 90f, durationMs = 80),
        AnimFrame(ty = -12f, rot = 180f, durationMs = 80),
        AnimFrame(ty = -10f, rot = 270f, durationMs = 80),
        AnimFrame(ty = -6f, rot = 340f, expression = Expressions.HAPPY, durationMs = 80),
        AnimFrame(ty = -2f, rot = 360f, expression = Expressions.HAPPY, durationMs = 80),
        AnimFrame(expression = Expressions.HAPPY, durationMs = 300)
    )

    val FALL_ASLEEP_STARTLE = listOf(
        AnimFrame(expression = Expressions.SLEEPY, durationMs = 300),
        AnimFrame(expression = Expressions.SLEEPY, ty = 1f, rot = 5f, durationMs = 400),
        AnimFrame(expression = Expressions.SLEEPY, ty = 2f, rot = 10f, durationMs = 500),
        AnimFrame(expression = Expressions.SLEEPY, ty = 2f, rot = 12f, durationMs = 600),
        AnimFrame(ty = -8f, rot = -5f, expression = Expressions.SURPRISED, durationMs = 80),
        AnimFrame(ty = -4f, rot = 0f, expression = Expressions.SURPRISED, durationMs = 80),
        AnimFrame(expression = Expressions.SURPRISED, durationMs = 200),
        AnimFrame(expression = Expressions.HAPPY, durationMs = 300)
    )

    val WAVE = listOf(
        AnimFrame(durationMs = 100),
        AnimFrame(ty = -2f, rot = 5f, expression = Expressions.HAPPY, durationMs = 100),
        AnimFrame(ty = -2f, rot = -5f, expression = Expressions.HAPPY, durationMs = 100),
        AnimFrame(ty = -2f, rot = 5f, expression = Expressions.HAPPY, durationMs = 100),
        AnimFrame(ty = -2f, rot = -5f, expression = Expressions.HAPPY, durationMs = 100),
        AnimFrame(ty = -2f, rot = 5f, expression = Expressions.HAPPY, durationMs = 100),
        AnimFrame(expression = Expressions.HAPPY, durationMs = 300)
    )

    val SPIN = listOf(
        AnimFrame(rot = 45f, durationMs = 70),
        AnimFrame(rot = 90f, durationMs = 70),
        AnimFrame(rot = 135f, durationMs = 70),
        AnimFrame(rot = 180f, durationMs = 70),
        AnimFrame(rot = 225f, durationMs = 70),
        AnimFrame(rot = 270f, durationMs = 70),
        AnimFrame(rot = 315f, durationMs = 70),
        AnimFrame(rot = 360f, expression = Expressions.HAPPY, durationMs = 70),
        AnimFrame(expression = Expressions.HAPPY, durationMs = 300)
    )

    val SNEEZE = listOf(
        AnimFrame(durationMs = 200),
        AnimFrame(ty = -2f, rot = -3f, durationMs = 150),
        AnimFrame(ty = -4f, rot = -6f, expression = Expressions.CONFUSED, durationMs = 200),
        AnimFrame(ty = -3f, rot = -8f, expression = Expressions.CONFUSED, durationMs = 150),
        AnimFrame(ty = 3f, rot = 5f, expression = Expressions.SURPRISED, durationMs = 80),
        AnimFrame(ty = 1f, rot = 2f, durationMs = 80),
        AnimFrame(expression = Expressions.WINK, durationMs = 300)
    )

    val SCRATCH_HEAD = listOf(
        AnimFrame(durationMs = 200),
        AnimFrame(rot = -3f, expression = Expressions.CONFUSED, durationMs = 150),
        AnimFrame(rot = 3f, expression = Expressions.CONFUSED, durationMs = 150),
        AnimFrame(rot = -3f, expression = Expressions.CONFUSED, durationMs = 150),
        AnimFrame(rot = 3f, expression = Expressions.CONFUSED, durationMs = 150),
        AnimFrame(rot = -3f, expression = Expressions.CONFUSED, durationMs = 150),
        AnimFrame(expression = Expressions.WINK, durationMs = 400)
    )

    val THUMBS_UP = listOf(
        AnimFrame(durationMs = 100),
        AnimFrame(ty = -3f, expression = Expressions.HAPPY, durationMs = 100),
        AnimFrame(ty = -5f, expression = Expressions.HAPPY, durationMs = 100),
        AnimFrame(ty = -5f, expression = Expressions.HAPPY, durationMs = 400),
        AnimFrame(ty = -3f, expression = Expressions.HAPPY, durationMs = 100),
        AnimFrame(expression = Expressions.HAPPY, durationMs = 200)
    )

    val HEAD_BONK = listOf(
        AnimFrame(durationMs = 100),
        AnimFrame(ty = -4f, durationMs = 80),
        AnimFrame(ty = -8f, durationMs = 80),
        AnimFrame(ty = -10f, durationMs = 80),
        AnimFrame(ty = -10f, expression = Expressions.SURPRISED, durationMs = 120),
        AnimFrame(ty = -8f, rot = -5f, expression = Expressions.SURPRISED, durationMs = 80),
        AnimFrame(ty = -4f, rot = 5f, expression = Expressions.CONFUSED, durationMs = 80),
        AnimFrame(expression = Expressions.CONFUSED, durationMs = 200),
        AnimFrame(ty = -2f, expression = Expressions.WINK, durationMs = 100),
        AnimFrame(expression = Expressions.WINK, durationMs = 300)
    )

    val VICTORY = listOf(
        AnimFrame(ty = -4f, expression = Expressions.VICTORY, durationMs = 100),
        AnimFrame(ty = -8f, rot = 5f, expression = Expressions.VICTORY, durationMs = 100),
        AnimFrame(ty = -12f, rot = -5f, expression = Expressions.VICTORY, durationMs = 100),
        AnimFrame(ty = -8f, rot = 10f, expression = Expressions.VICTORY, durationMs = 100),
        AnimFrame(ty = -4f, rot = -10f, expression = Expressions.VICTORY, durationMs = 100),
        AnimFrame(expression = Expressions.VICTORY, durationMs = 100),
        AnimFrame(ty = -6f, rot = 5f, expression = Expressions.VICTORY, durationMs = 100),
        AnimFrame(ty = -12f, rot = 360f, expression = Expressions.VICTORY, durationMs = 120),
        AnimFrame(expression = Expressions.VICTORY, durationMs = 600)
    )

    private val completionPool = listOf(
        LittleBitAnimation.DANCE,
        LittleBitAnimation.TRIP_AND_RECOVER,
        LittleBitAnimation.BACKFLIP,
        LittleBitAnimation.FALL_ASLEEP_STARTLE,
        LittleBitAnimation.WAVE,
        LittleBitAnimation.SPIN,
        LittleBitAnimation.SNEEZE,
        LittleBitAnimation.SCRATCH_HEAD,
        LittleBitAnimation.THUMBS_UP,
        LittleBitAnimation.HEAD_BONK
    )

    private val idlePool = listOf(
        LittleBitAnimation.IDLE_BLINK,
        LittleBitAnimation.IDLE_LOOK_AROUND,
        LittleBitAnimation.IDLE_YAWN,
        LittleBitAnimation.IDLE_TAP_FOOT
    )

    fun randomCompletion() = completionPool.random()
    fun randomIdle() = idlePool.random()

    fun framesFor(anim: LittleBitAnimation): List<AnimFrame> = when (anim) {
        LittleBitAnimation.IDLE_BLINK          -> IDLE_BLINK
        LittleBitAnimation.IDLE_LOOK_AROUND    -> IDLE_LOOK_AROUND
        LittleBitAnimation.IDLE_YAWN           -> IDLE_YAWN
        LittleBitAnimation.IDLE_TAP_FOOT       -> IDLE_TAP_FOOT
        LittleBitAnimation.DANCE               -> DANCE
        LittleBitAnimation.TRIP_AND_RECOVER    -> TRIP
        LittleBitAnimation.BACKFLIP            -> BACKFLIP
        LittleBitAnimation.FALL_ASLEEP_STARTLE -> FALL_ASLEEP_STARTLE
        LittleBitAnimation.WAVE                -> WAVE
        LittleBitAnimation.SPIN                -> SPIN
        LittleBitAnimation.SNEEZE              -> SNEEZE
        LittleBitAnimation.SCRATCH_HEAD        -> SCRATCH_HEAD
        LittleBitAnimation.THUMBS_UP           -> THUMBS_UP
        LittleBitAnimation.HEAD_BONK           -> HEAD_BONK
        LittleBitAnimation.VICTORY             -> VICTORY
    }
}

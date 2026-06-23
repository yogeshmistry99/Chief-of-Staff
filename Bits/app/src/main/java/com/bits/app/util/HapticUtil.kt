package com.bits.app.util

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

object HapticUtil {
    private fun vibrator(context: Context): Vibrator {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager)
                .defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
    }

    fun tapPress(context: Context) {
        vibrator(context).vibrate(
            VibrationEffect.createOneShot(20, VibrationEffect.DEFAULT_AMPLITUDE)
        )
    }

    fun tapRelease(context: Context) {
        vibrator(context).vibrate(
            VibrationEffect.createOneShot(50, 255)
        )
    }

    fun completion(context: Context) {
        val pattern = longArrayOf(0, 20, 40, 60)
        val amplitudes = intArrayOf(0, 80, 0, 255)
        vibrator(context).vibrate(
            VibrationEffect.createWaveform(pattern, amplitudes, -1)
        )
    }
}

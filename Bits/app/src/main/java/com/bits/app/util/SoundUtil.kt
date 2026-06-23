package com.bits.app.util

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import kotlin.math.PI
import kotlin.math.sin

object SoundUtil {
    private const val SAMPLE_RATE = 44100

    // Generates a Mario-style coin chime: C5 → E5 → G5
    fun playCoinChime(context: Context) {
        Thread {
            val noteFreqs = listOf(523.25f, 659.25f, 783.99f)
            val noteDurations = listOf(0.07f, 0.07f, 0.12f)
            val allSamples = mutableListOf<Short>()

            noteFreqs.forEachIndexed { i, freq ->
                val durationSamples = (SAMPLE_RATE * noteDurations[i]).toInt()
                for (s in 0 until durationSamples) {
                    val envelope = when {
                        s < durationSamples * 0.05f -> s / (durationSamples * 0.05f)
                        s > durationSamples * 0.6f  -> 1f - (s - durationSamples * 0.6f) / (durationSamples * 0.4f)
                        else -> 1f
                    }.toFloat()
                    // Square wave with overtones for 8-bit feel
                    val square = if (sin(2.0 * PI * freq * s / SAMPLE_RATE) > 0) 1f else -1f
                    val sample = (square * envelope * 0.3f * Short.MAX_VALUE).toInt()
                    allSamples.add(sample.toShort())
                }
                // Tiny gap between notes
                repeat((SAMPLE_RATE * 0.02f).toInt()) { allSamples.add(0) }
            }

            val buffer = ShortArray(allSamples.size) { allSamples[it] }
            val track = AudioTrack.Builder()
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_GAME)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setSampleRate(SAMPLE_RATE)
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .build()
                )
                .setTransferMode(AudioTrack.MODE_STATIC)
                .setBufferSizeInBytes(buffer.size * 2)
                .build()

            track.write(buffer, 0, buffer.size)
            track.play()
            Thread.sleep(((noteDurations.sum() + 0.2f) * 1000).toLong())
            track.stop()
            track.release()
        }.start()
    }

    // Short cheerful chime for all-complete
    fun playVictoryFanfare(context: Context) {
        Thread {
            val notes = listOf(261.63f, 329.63f, 392f, 523.25f)
            val durations = listOf(0.08f, 0.08f, 0.08f, 0.2f)
            val allSamples = mutableListOf<Short>()

            notes.forEachIndexed { i, freq ->
                val durationSamples = (SAMPLE_RATE * durations[i]).toInt()
                for (s in 0 until durationSamples) {
                    val envelope = when {
                        s < durationSamples * 0.05f -> s / (durationSamples * 0.05f)
                        s > durationSamples * 0.5f  -> 1f - (s - durationSamples * 0.5f) / (durationSamples * 0.5f)
                        else -> 1f
                    }.toFloat()
                    val square = if (sin(2.0 * PI * freq * s / SAMPLE_RATE) > 0) 1f else -1f
                    val sample = (square * envelope * 0.4f * Short.MAX_VALUE).toInt()
                    allSamples.add(sample.toShort())
                }
                repeat((SAMPLE_RATE * 0.02f).toInt()) { allSamples.add(0) }
            }

            val buffer = ShortArray(allSamples.size) { allSamples[it] }
            val track = AudioTrack.Builder()
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_GAME)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setSampleRate(SAMPLE_RATE)
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .build()
                )
                .setTransferMode(AudioTrack.MODE_STATIC)
                .setBufferSizeInBytes(buffer.size * 2)
                .build()

            track.write(buffer, 0, buffer.size)
            track.play()
            Thread.sleep(((durations.sum() + 0.3f) * 1000).toLong())
            track.stop()
            track.release()
        }.start()
    }
}

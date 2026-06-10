export const haptic = {
  light:   () => navigator.vibrate?.(10),
  medium:  () => navigator.vibrate?.(25),
  success: () => navigator.vibrate?.([10, 50, 10]),
  error:   () => navigator.vibrate?.([50, 30, 50]),
  fanfare: () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      // Quick silly 5-note run: C5-E5-G5-C6, then a wobbly high squeak
      const notes = [
        { freq: 523, when: 0,    dur: 0.09, vol: 0.15 },
        { freq: 659, when: 0.07, dur: 0.09, vol: 0.15 },
        { freq: 784, when: 0.14, dur: 0.09, vol: 0.15 },
        { freq: 1047,when: 0.21, dur: 0.12, vol: 0.13 },
        { freq: 1400,when: 0.30, dur: 0.18, vol: 0.10, wobble: true },
      ]
      notes.forEach(({ freq, when, dur, vol, wobble }) => {
        const osc  = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.type = wobble ? 'sawtooth' : 'sine'
        osc.frequency.setValueAtTime(freq, ctx.currentTime + when)
        if (wobble) {
          // tiny pitch drop for silliness
          osc.frequency.linearRampToValueAtTime(freq * 0.78, ctx.currentTime + when + dur)
        }
        gain.gain.setValueAtTime(vol, ctx.currentTime + when)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + dur)
        osc.start(ctx.currentTime + when)
        osc.stop(ctx.currentTime + when + dur + 0.01)
      })
    } catch {}
  },
}

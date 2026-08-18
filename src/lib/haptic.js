export const haptic = {
  light:   () => navigator.vibrate?.(10),
  medium:  () => navigator.vibrate?.(25),
  success: () => navigator.vibrate?.([10, 50, 10]),
  error:   () => navigator.vibrate?.([50, 30, 50]),
  // Sending a message: a crisp vibration pulse + a brief, soft ascending
  // two-note "ping" (D5 → A5). Kept short and quiet — satisfying, not distracting.
  send: () => {
    try {
      navigator.vibrate?.(15)
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const notes = [[587.33, 0], [880, 0.07]]
      notes.forEach(([freq, when]) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.type = 'sine'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.10, ctx.currentTime + when)
        gain.gain.exponentialRampToValueAtTime(0.0008, ctx.currentTime + when + 0.14)
        osc.start(ctx.currentTime + when)
        osc.stop(ctx.currentTime + when + 0.16)
      })
      // High-frequency action — release the context so they don't accumulate
      // toward the browser's hardware-context limit.
      setTimeout(() => ctx.close?.(), 400)
    } catch {}
  },
  chat: () => {
    try {
      navigator.vibrate?.(12)
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const notes = [[440, 0], [554, 0.1]]
      notes.forEach(([freq, when]) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.type = 'sine'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.12, ctx.currentTime + when)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + 0.18)
        osc.start(ctx.currentTime + when)
        osc.stop(ctx.currentTime + when + 0.2)
      })
    } catch {}
  },
  // The journal reminder's voice.
  //
  // Same construction as `send` and `chat` — two sine notes, short, quiet, with
  // an exponential tail — so it is recognisably the same app. Deliberately the
  // GENTLEST of the three: lower pitches (G4 → D5), a slower interval and about
  // two-thirds the volume, because this one arrives uninvited on an evening that
  // may already be a bad one. The journal's tone rule applies to sound as much
  // as to words — an offer, not a demand, so nothing bright or congratulatory.
  journal: () => {
    try {
      navigator.vibrate?.([12, 70, 12])
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const notes = [[392, 0], [587.33, 0.13]]
      notes.forEach(([freq, when]) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.type = 'sine'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.08, ctx.currentTime + when)
        gain.gain.exponentialRampToValueAtTime(0.0008, ctx.currentTime + when + 0.22)
        osc.start(ctx.currentTime + when)
        osc.stop(ctx.currentTime + when + 0.24)
      })
      setTimeout(() => ctx.close?.(), 500)
    } catch {}
  },
  fanfare: () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      // Quick silly 5-note run: C5-E5-G5-C6, then a wobbly high squeak
      const notes = [
        { freq: 523, when: 0,    dur: 0.09, vol: 0.15 },
        { freq: 659, when: 0.07, dur: 0.09, vol: 0.15 },
        { freq: 784, when: 0.14, dur: 0.09, vol: 0.15 },
        { freq: 1047,when: 0.21, dur: 0.18, vol: 0.13 },
      ]
      notes.forEach(({ freq, when, dur, vol }) => {
        const osc  = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.type = 'sine'
        osc.frequency.setValueAtTime(freq, ctx.currentTime + when)
        gain.gain.setValueAtTime(vol, ctx.currentTime + when)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + dur)
        osc.start(ctx.currentTime + when)
        osc.stop(ctx.currentTime + when + dur + 0.01)
      })

    } catch {}
  },
}

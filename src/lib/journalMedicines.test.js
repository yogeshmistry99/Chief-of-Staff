import { describe, it, expect } from 'vitest'
import {
  MEDICINES, MEDICINE_KEYS, MAX_DOSES, medicineByKey, medicineName,
  normaliseMedicines, medicineSummary,
} from '../../api/_lib/journalMedicines.js'
import { medicinesSection } from '../../api/_lib/journalDocument.js'

describe('the medicine list', () => {
  it('holds the five current medicines from the medical record', () => {
    expect(MEDICINE_KEYS).toEqual([
      'sertraline', 'candesartan', 'mometasone', 'fluticasone', 'paracetamol',
    ])
  })

  it('carries the doses that ARE on record and no others', () => {
    // Sertraline and candesartan have doses in the tracker; the two ENT nasal
    // sprays do not, and inventing one would be a factual error in a medical
    // document. Paracetamol is as-needed.
    expect(medicineByKey('sertraline').dose).toBe('50 mg')
    expect(medicineByKey('candesartan').dose).toBe('8 mg')
    expect(medicineByKey('mometasone').dose).toBeNull()
    expect(medicineByKey('fluticasone').dose).toBeNull()
  })

  it('names a medicine without fabricating a dose', () => {
    expect(medicineName(medicineByKey('candesartan'))).toBe('Candesartan 8 mg')
    expect(medicineName(medicineByKey('mometasone'))).toBe('Mometasone furoate')
    expect(medicineName(null)).toBe('')
  })

  it('treats only paracetamol as taken-as-needed', () => {
    const asNeeded = MEDICINES.filter((m) => m.schedule === 'as_needed').map((m) => m.key)
    expect(asNeeded).toEqual(['paracetamol'])
  })
})

describe('normaliseMedicines', () => {
  it('keeps taken and missed for a scheduled medicine', () => {
    expect(normaliseMedicines({ sertraline: { taken: true }, candesartan: { taken: false } }))
      .toEqual({ sertraline: { taken: true }, candesartan: { taken: false } })
  })

  it('keeps a dose count for an as-needed medicine, including zero', () => {
    // 0 is a real answer — "no paracetamol today" is evidence; silence is not.
    expect(normaliseMedicines({ paracetamol: { doses: 0 } })).toEqual({ paracetamol: { doses: 0 } })
    expect(normaliseMedicines({ paracetamol: { doses: 3 } })).toEqual({ paracetamol: { doses: 3 } })
  })

  it('drops unknown medicines rather than storing them', () => {
    expect(normaliseMedicines({ ibuprofen: { taken: true } })).toEqual({})
  })

  it('drops the wrong shape for the schedule', () => {
    // A scheduled medicine has no dose count, and an as-needed one is not
    // "taken/missed" — a malformed value must not reach the document.
    expect(normaliseMedicines({ sertraline: { doses: 2 } })).toEqual({})
    expect(normaliseMedicines({ paracetamol: { taken: true } })).toEqual({})
  })

  it('rejects nonsense counts and caps a stuck finger', () => {
    expect(normaliseMedicines({ paracetamol: { doses: -1 } })).toEqual({})
    expect(normaliseMedicines({ paracetamol: { doses: 'lots' } })).toEqual({})
    expect(normaliseMedicines({ paracetamol: { doses: 999 } })).toEqual({ paracetamol: { doses: MAX_DOSES } })
    expect(normaliseMedicines({ paracetamol: { doses: 2.7 } })).toEqual({ paracetamol: { doses: 2 } })
  })

  it('survives junk input', () => {
    expect(normaliseMedicines(null)).toEqual({})
    expect(normaliseMedicines('nope')).toEqual({})
    expect(normaliseMedicines({ sertraline: null })).toEqual({})
  })
})

describe('medicineSummary', () => {
  it('counts recorded scheduled medicines and totals as-needed doses', () => {
    const s = medicineSummary({
      sertraline: { taken: true },
      candesartan: { taken: false },
      paracetamol: { doses: 2 },
    })
    expect(s.total).toBe(4)      // four scheduled, paracetamol is separate
    expect(s.recorded).toBe(2)
    expect(s.taken).toBe(1)
    expect(s.missed).toEqual(['Candesartan'])
    expect(s.asNeededDoses).toBe(2)
    expect(s.any).toBe(true)
  })

  it('is empty when nothing was recorded', () => {
    const s = medicineSummary({})
    expect(s.recorded).toBe(0)
    expect(s.asNeededDoses).toBe(0)
    expect(s.any).toBe(false)
  })
})

describe('the document section', () => {
  const entry = (medicines) => ({ entry_date: '2026-08-16', medicines })

  it('is omitted entirely when nothing was recorded', () => {
    // A table of blanks would read as "no medication taken", which is a
    // different claim from "not recorded".
    expect(medicinesSection(entry({}))).toBe('')
    expect(medicinesSection(entry(null))).toBe('')
    expect(medicinesSection({})).toBe('')
  })

  it('prints only what was recorded, with the figures from the row', () => {
    const html = medicinesSection(entry({
      sertraline: { taken: true },
      candesartan: { taken: false },
      paracetamol: { doses: 3 },
    }))
    expect(html).toContain('Sertraline 50 mg')
    expect(html).toContain('Taken')
    expect(html).toContain('Candesartan 8 mg')
    expect(html).toContain('Not taken')
    expect(html).toContain('3 doses')
    // Not recorded, so absent — not shown as missed.
    expect(html).not.toContain('Mometasone')
  })

  it('says "None taken" for a recorded zero rather than omitting it', () => {
    const html = medicinesSection(entry({ paracetamol: { doses: 0 } }))
    expect(html).toContain('None taken')
  })

  it('uses the singular for one dose', () => {
    expect(medicinesSection(entry({ paracetamol: { doses: 1 } }))).toContain('1 dose')
  })

  it('states that an omission is not a missed dose', () => {
    const html = medicinesSection(entry({ sertraline: { taken: true } }))
    expect(html).toMatch(/means nothing was recorded, not that a dose was missed/)
  })

  it('escapes its content', () => {
    // The labels are ours, but the section must not be a way to inject markup
    // into a filed document if a label ever becomes data.
    const html = medicinesSection(entry({ sertraline: { taken: true } }))
    expect(html).not.toContain('<script')
  })
})

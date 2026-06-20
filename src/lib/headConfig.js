import { pushToSupabase } from './sync'

export function loadHeadConfig(key) {
  return {
    instructions: localStorage.getItem(`head_instructions_${key}`) ?? '',
    context:      localStorage.getItem(`head_context_${key}`) ?? '',
    model:        localStorage.getItem(`head_model_${key}`) ?? '',
    files: (() => {
      try { return JSON.parse(localStorage.getItem(`head_files_${key}`) ?? '[]') }
      catch { return [] }
    })(),
  }
}

export function saveHeadConfig(key, { instructions, context, files, model }) {
  localStorage.setItem(`head_instructions_${key}`, instructions)
  localStorage.setItem(`head_context_${key}`, context)
  localStorage.setItem(`head_files_${key}`, JSON.stringify(files))
  if (model) localStorage.setItem(`head_model_${key}`, model)
  else localStorage.removeItem(`head_model_${key}`)
  pushToSupabase(`head_config_${key}`, { instructions, context, files, model }).catch(() => {})
}

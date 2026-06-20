import { pushToSupabase } from './sync'

const KEY = (bucket) => `cos_discussions_${bucket}`

function _push(bucket) {
  const all = getDiscussions(bucket)
  pushToSupabase(`discussions_${bucket}`, all).catch(() => {})
}

export function getDiscussions(bucket) {
  try {
    return JSON.parse(localStorage.getItem(KEY(bucket)) ?? '[]')
  } catch { return [] }
}

export function saveDiscussion(bucket, discussion) {
  const all = getDiscussions(bucket).filter((d) => d.id !== discussion.id)
  localStorage.setItem(KEY(bucket), JSON.stringify([discussion, ...all]))
  _push(bucket)
}

export function deleteDiscussion(bucket, id) {
  const all = getDiscussions(bucket).filter((d) => d.id !== id)
  localStorage.setItem(KEY(bucket), JSON.stringify(all))
  _push(bucket)
}

export function newDiscussion(title, taskId = null) {
  return {
    id: crypto.randomUUID(),
    title,
    ...(taskId ? { taskId } : {}),
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export function findDiscussionByTask(bucket, taskId) {
  return getDiscussions(bucket).find((d) => d.taskId === taskId) ?? null
}

export function archiveDiscussionsForTask(bucket, taskId) {
  const all = getDiscussions(bucket)
  const updated = all.map((d) =>
    d.taskId === taskId ? { ...d, archived: true, archivedAt: new Date().toISOString() } : d
  )
  localStorage.setItem(KEY(bucket), JSON.stringify(updated))
  _push(bucket)
}

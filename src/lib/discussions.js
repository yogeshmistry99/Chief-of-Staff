const KEY = (bucket) => `cos_discussions_${bucket}`

export function getDiscussions(bucket) {
  try {
    return JSON.parse(localStorage.getItem(KEY(bucket)) ?? '[]')
  } catch { return [] }
}

export function saveDiscussion(bucket, discussion) {
  const all = getDiscussions(bucket).filter((d) => d.id !== discussion.id)
  localStorage.setItem(KEY(bucket), JSON.stringify([discussion, ...all]))
}

export function deleteDiscussion(bucket, id) {
  const all = getDiscussions(bucket).filter((d) => d.id !== id)
  localStorage.setItem(KEY(bucket), JSON.stringify(all))
}

export function newDiscussion(title) {
  return {
    id: crypto.randomUUID(),
    title,
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

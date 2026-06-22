export default function Markdown({ text }) {
  const lines = text.split('\n')
  const elements = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Skip empty lines
    if (!line.trim()) { i++; continue }

    // Heading
    if (line.startsWith('# ')) {
      elements.push(<p key={i} className="font-semibold mb-1">{inline(line.slice(2))}</p>)
    } else if (line.startsWith('## ') || line.startsWith('### ')) {
      const text = line.replace(/^#{2,3} /, '')
      elements.push(<p key={i} className="font-semibold mb-1">{inline(text)}</p>)
    // Bullet
    } else if (/^[-*] /.test(line)) {
      const items = []
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(<li key={i} className="ml-3 list-disc list-outside">{inline(lines[i].slice(2))}</li>)
        i++
      }
      elements.push(<ul key={`ul-${i}`} className="space-y-0.5 mb-1">{items}</ul>)
      continue
    // Numbered list
    } else if (/^\d+\. /.test(line)) {
      const items = []
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(<li key={i} className="ml-3 list-decimal list-outside">{inline(lines[i].replace(/^\d+\. /, ''))}</li>)
        i++
      }
      elements.push(<ol key={`ol-${i}`} className="space-y-0.5 mb-1">{items}</ol>)
      continue
    } else {
      elements.push(<p key={i} className="mb-1 last:mb-0">{inline(line)}</p>)
    }
    i++
  }

  return <div className="space-y-0.5 select-text">{elements}</div>
}

function inline(text) {
  // Split on **bold** and *italic*
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('*') && part.endsWith('*'))
      return <em key={i}>{part.slice(1, -1)}</em>
    return part
  })
}

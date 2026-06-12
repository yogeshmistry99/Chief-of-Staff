export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  res.status(200).json({
    anthropic:      !!process.env.ANTHROPIC_API_KEY,
    todoist:        !!process.env.TODOIST_API_KEY,
    googleCalendar: !!process.env.GOOGLE_CLIENT_ID,
  })
}

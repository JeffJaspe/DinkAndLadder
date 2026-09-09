/** Contrast checker for candidate light-mode ground tokens. WCAG 2.1 ratio. */
const srgb = (c) => {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))

// Foregrounds that must clear AA on whatever ground we choose.
const fg = {
  'fg #0F1A15': '#0F1A15',
  'fg-secondary #4F5D57': '#4F5D57',
  'fg-muted #63706A': '#63706A',
  'primary #0A7F45': '#0A7F45',
  'warning #B45309': '#B45309',
  'danger #D01E1E': '#D01E1E'
}

// Candidate canvases, current first.
const candidates = {
  'CURRENT #F7F9F8': '#F7F9F8',
  '#F1F4F2': '#F1F4F2',
  '#EDF1EF': '#EDF1EF',
  '#E9EEEB': '#E9EEEB',
  '#E5EBE7': '#E5EBE7'
}

for (const [cname, cval] of Object.entries(candidates)) {
  const ground = hex(cval)
  const rows = Object.entries(fg).map(([n, v]) => {
    const r = ratio(hex(v), ground)
    return `${n}: ${r.toFixed(2)}${r < 4.5 ? '  <-- FAILS AA' : ''}`
  })
  // Separation from a white surface sitting on this canvas.
  const sep = ratio(hex('#FFFFFF'), ground)
  console.log(`\n${cname}   white-surface separation ${sep.toFixed(3)}:1`)
  for (const r of rows) console.log('   ' + r)
}

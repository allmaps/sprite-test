import fs from 'fs'
import path from 'path'

const outputDir = './output'
const indexPath = path.join(outputDir, 'index.html')

interface Entry {
  annotationsId: string
  spriteWidth: number
  annotationUrl: string
}

const entries: Entry[] = []

// Scan output directory
const dirEntries = fs.readdirSync(outputDir, { withFileTypes: true })

for (const dirEntry of dirEntries) {
  if (!dirEntry.isDirectory()) continue

  const annotationsId = dirEntry.name
  const annotationsPath = path.join(
    outputDir,
    annotationsId,
    'annotations.json'
  )

  if (!fs.existsSync(annotationsPath)) continue

  const annotations = JSON.parse(fs.readFileSync(annotationsPath, 'utf-8'))

  // Get the original annotation URL from the stored file, or fallback to directory name
  let annotationUrl = annotations.id || annotations['@id']
  if (!annotationUrl || annotationUrl === annotationsId) {
    annotationUrl = `annotations/${annotationsId}`
  }

  // Find sprite width directories
  const subDirs = fs.readdirSync(path.join(outputDir, annotationsId), {
    withFileTypes: true
  })

  for (const subDir of subDirs) {
    if (!subDir.isDirectory()) continue

    const spriteWidth = parseInt(subDir.name)
    if (isNaN(spriteWidth)) continue

    const spritePath = path.join(
      outputDir,
      annotationsId,
      subDir.name,
      'thumbnail-sprites-annotation.json'
    )
    if (fs.existsSync(spritePath)) {
      entries.push({
        annotationsId,
        spriteWidth,
        annotationUrl
      })
    }
  }
}

// Sort entries
entries.sort((a, b) => {
  if (a.annotationsId !== b.annotationsId) {
    return a.annotationsId.localeCompare(b.annotationsId)
  }
  return a.spriteWidth - b.spriteWidth
})

// Generate HTML
const listItems = entries
  .map((entry) => {
    const spriteUrl = `./${entry.annotationsId}/${entry.spriteWidth}/thumbnail-sprites.jpg`
    const annotationUrl = `./${entry.annotationsId}/${entry.spriteWidth}/thumbnail-sprites-annotation.json`

    return `      <li>
        <strong>${entry.annotationsId}</strong> (width: ${entry.spriteWidth}px)
        <br>
        Original: <a href="${entry.annotationUrl}">${entry.annotationUrl}</a>
        <br>
        <a href="${spriteUrl}">Sprite Image</a> |
        <a href="${annotationUrl}">Sprite Annotation</a>
      </li>`
  })
  .join('\n')

const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sprite Test</title>
    <style>
      body {
        font-family: system-ui, -apple-system, sans-serif;
        max-width: 1200px;
        margin: 0 auto;
        padding: 2rem;
      }
      ul {
        list-style: none;
        padding: 0;
      }
      li {
        margin-bottom: 1.5rem;
        padding: 1rem;
        border: 1px solid #ddd;
        border-radius: 4px;
      }
      a {
        color: #0066cc;
        text-decoration: none;
      }
      a:hover {
        text-decoration: underline;
      }
    </style>
  </head>
  <body>
    <h1>Example thumbnail sprites</h1>
    <ul>
${listItems}
    </ul>
  </body>
</html>
`

fs.writeFileSync(indexPath, html)
console.log(`Generated index.html with ${entries.length} entries`)

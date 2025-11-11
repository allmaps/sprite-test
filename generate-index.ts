import fs from 'fs'
import path from 'path'

const outputDir = './output'
const indexPath = path.join(outputDir, 'index.html')

interface Entry {
  annotationsId: string
  spriteWidth: number
  annotationUrl: string
  sourceUrl?: string
  scaleFactors: number[]
  imageWidth: number
  imageHeight: number
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
    annotationUrl = `${annotationsId}/annotations.json`
  }

  // Read source URL from meta.json if it exists
  const metaPath = path.join(outputDir, annotationsId, 'meta.json')
  let sourceUrl: string | undefined
  if (fs.existsSync(metaPath)) {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
    sourceUrl = meta.sourceUrl
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
    const infoJsonPath = path.join(
      outputDir,
      annotationsId,
      subDir.name,
      'iiif',
      'info.json'
    )

    if (fs.existsSync(spritePath) && fs.existsSync(infoJsonPath)) {
      const infoJson = JSON.parse(fs.readFileSync(infoJsonPath, 'utf-8'))
      const scaleFactors = infoJson.tiles?.[0]?.scaleFactors || []

      entries.push({
        annotationsId,
        spriteWidth,
        annotationUrl,
        sourceUrl,
        scaleFactors,
        imageWidth: infoJson.width || 0,
        imageHeight: infoJson.height || 0
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
    const spriteInfoJson = `./${entry.annotationsId}/${entry.spriteWidth}/iiif/info.json`
    const annotationUrl = `./${entry.annotationsId}/${entry.spriteWidth}/thumbnail-sprites-annotation.json`

    return `      <li>
        <strong>${entry.annotationsId}</strong> (width: ${entry.spriteWidth}px)
        ${
          entry.sourceUrl
            ? `<br><small>Source: <a href="${entry.sourceUrl}">${entry.sourceUrl}</a></small>`
            : ''
        }
        <br>
        Original: <a href="${entry.annotationUrl}">${entry.annotationUrl}</a> |
        <a href="https://viewer.allmaps.org/?url=${encodeURIComponent(
          `https://pages.allmaps.org/sprite-test/${entry.annotationUrl}`
        )}">Open in Allmaps Viewer</a>
        <br>
        Sprite:
        <a href="${spriteUrl}">Image</a> |
        <a href="${spriteInfoJson}">info.json</a> |
        <a href="${annotationUrl}">Georeference Annotation</a> |
        <a href="https://viewer.allmaps.org/?url=${encodeURIComponent(
          `https://pages.allmaps.org/sprite-test/${annotationUrl}`
        )}">Open in Allmaps Viewer</a>
        <table>
          <tr>
            <th>Image Size</th>
            <th>Scale Factors</th>
          </tr>
          <tr>
            <td>${entry.imageWidth} × ${entry.imageHeight}</td>
            <td>${entry.scaleFactors.join(', ')}</td>
          </tr>
        </table>
      </li>`
  })
  .join('\n')

const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Allmaps Thumbnail Sprites Test</title>
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
      table {
        margin-top: 0.5rem;
        border-collapse: collapse;
        width: 100%;
        font-size: 0.9rem;
      }
      th, td {
        text-align: left;
        padding: 0.5rem;
        border: 1px solid #ddd;
      }
      th {
        background-color: #f5f5f5;
        font-weight: 600;
      }
    </style>
  </head>
  <body>
    <h1>Allmaps Thumbnail Sprites Test</h1>
    <ul>
${listItems}
    </ul>
  </body>
</html>
`

fs.writeFileSync(indexPath, html)
console.log(`Generated index.html with ${entries.length} entries`)

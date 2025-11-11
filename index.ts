import fs from 'fs'
import path from 'path'

import sharp from 'sharp'
import potpack from 'potpack'
import { mkdirp } from 'mkdirp'

import { generateId } from '@allmaps/id'
import {
  parseAnnotation,
  generateAnnotation,
  type GeoreferencedMap
} from '@allmaps/annotation'

const githubPagesBaseUrl = 'https://pages.allmaps.org/sprite-test'

// Width of sprite images, in pixels
const annotationsUrl = process.argv[2]
const spriteWidths = (process.argv[3] || '128')
  .split(',')
  .map(Number)
  .filter((w) => !isNaN(w))

function getSpriteUrl(imageId: string, width: number) {
  return `${imageId}/full/${width},/0/default.jpg`
}

const annotationsId = await generateId(annotationsUrl)
const outputDir = path.join('./output/', annotationsId)

await mkdirp(outputDir)

let annotations
if (!fs.existsSync(path.join(outputDir, 'annotations.json'))) {
  annotations = await fetch(annotationsUrl).then((response) => response.json())
} else {
  annotations = JSON.parse(
    fs.readFileSync(path.join(outputDir, 'annotations.json'), 'utf-8')
  )
}

fs.writeFileSync(
  path.join(outputDir, 'annotations.json'),
  JSON.stringify(
    {
      _sourceUrl: annotationsUrl,
      ...annotations
    },
    null,
    2
  )
)

fs.writeFileSync(
  path.join(outputDir, 'meta.json'),
  JSON.stringify(
    {
      sourceUrl: annotationsUrl
    },
    null,
    2
  )
)

const maps = parseAnnotation(annotations)

type Box = {
  map: GeoreferencedMap
  sprite: Buffer
  w: number
  h: number
  scale: number
  x: number
  y: number
}

for (const spriteWidth of spriteWidths) {
  const boxes: Box[] = []

  for (const map of maps) {
    const imageId = map.resource.id
    const allmapsImageId = await generateId(imageId)

    const cacheDir = path.join('./cache/', annotationsId, String(spriteWidth))
    await mkdirp(cacheDir)
    const cacheFilename = path.join(cacheDir, `${allmapsImageId}.jpg`)

    if (fs.existsSync(cacheFilename)) {
      // File already cached, do nothing
    } else {
      const spriteUrl = getSpriteUrl(map.resource.id, spriteWidth)
      console.log(`Downloading image ${spriteUrl}...`)

      const imageBuffer = await fetch(spriteUrl).then((res) =>
        res.arrayBuffer()
      )
      fs.writeFileSync(cacheFilename, Buffer.from(imageBuffer))
    }

    const sprite = fs.readFileSync(cacheFilename)
    const imageMetadata = await sharp(sprite).metadata()

    boxes.push({
      map,
      sprite,
      w: imageMetadata.width,
      h: imageMetadata.height,
      scale: imageMetadata.width / (map.resource.width || 1),
      x: 0,
      y: 0
    })
  }

  const { w: width, h: height } = potpack(boxes)

  const spritesIiifImageId = `${githubPagesBaseUrl}/${annotationsId}/${spriteWidth}`

  const sprites = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 255, b: 255 }
    }
  }).composite(
    boxes.map((box) => ({ input: box.sprite, left: box.x, top: box.y }))
  )

  await mkdirp(path.join(outputDir, String(spriteWidth)))

  await sprites.toFile(
    path.join(outputDir, String(spriteWidth), 'thumbnail-sprites.jpg')
  )
  await sprites
    .tile({
      size: 1024,
      layout: 'iiif3',
      id: spritesIiifImageId
      // depth: 'one'
    })
    .toFile(path.join(outputDir, String(spriteWidth), 'iiif'))

  const newMaps = boxes.map((box) => ({
    '@context': 'https://schemas.allmaps.org/map/2/context.json',
    id: box.map.id,
    type: 'GeoreferencedMap',
    resource: {
      id: `${spritesIiifImageId}/iiif`,
      width,
      height,
      type: 'ImageService3'
    },
    gcps: box.map.gcps.map((gcp) => ({
      resource: [
        box.x + gcp.resource[0] * box.scale,
        box.y + gcp.resource[1] * box.scale
      ],
      geo: gcp.geo
    })),
    resourceMask: box.map.resourceMask.map(([x, y]) => [
      box.x + x * box.scale,
      box.y + y * box.scale
    ]),
    transformation: box.map.transformation
  }))

  fs.writeFileSync(
    path.join(
      outputDir,
      String(spriteWidth),
      'thumbnail-sprites-annotation.json'
    ),
    JSON.stringify(generateAnnotation(newMaps), null, 2)
  )
}

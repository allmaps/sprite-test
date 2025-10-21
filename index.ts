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

const spriteWidth = 512 // Width of sprite images, in pixels
const annotationUrl =
  'https://raw.githubusercontent.com/tu-delft-heritage/watertijdreis-data/refs/heads/main/content/annotations/01-1874-389916-georef.json'

function getSpriteUrl(imageId: string, width: number) {
  return `${imageId}/full/${width},/0/default.jpg`
}

const annotations = await fetch(annotationUrl).then((response) =>
  response.json()
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

const boxes: Box[] = []

for (const map of maps) {
  const imageId = map.resource.id
  const allmapsImageId = await generateId(imageId)

  const cacheDir = `./cache/${spriteWidth}`
  await mkdirp(cacheDir)
  const cacheFilename = `${cacheDir}/${allmapsImageId}.jpg`

  if (fs.existsSync(cacheFilename)) {
    // File already cached, do nothing
  } else {
    const spriteUrl = getSpriteUrl(map.resource.id, spriteWidth)
    console.log(`Downloading image ${spriteUrl}...`)

    const imageBuffer = await fetch(spriteUrl).then((res) => res.arrayBuffer())
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

const spritesId = 'http://127.0.0.1:8080'

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

await sprites.toFile('./output/sprites.jpg')
await sprites
  .tile({ size: 1024, layout: 'iiif3', id: spritesId })
  .toFile('./output/iiif')

const newMaps = boxes.map((box) => ({
  '@context': 'https://schemas.allmaps.org/map/2/context.json',
  type: 'GeoreferencedMap',
  resource: {
    id: path.join(spritesId, 'iiif'),
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
  './output/sprites.json',
  JSON.stringify(generateAnnotation(newMaps), null, 2)
)

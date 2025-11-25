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
import { Image as IiifImage } from '@allmaps/iiif-parser'

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m'
}

// const githubPagesBaseUrl = 'http://localhost:8080'
const githubPagesBaseUrl = 'https://pages.allmaps.org/sprite-test'

const annotationsUrl = process.argv[2]

// This array contains how many tiles an thumbnail/sprite is wide
// 2 means each sprite image is made of 2x2 tiles
const spriteTileScales = (process.argv[3] || '1')
  .split(',')
  .map(Number)
  .filter((w) => !isNaN(w))
  // Remove numbers that are not powers of two (including fractional powers like 0.5, 0.25)
  .filter((w) => {
    if (w <= 0) return false
    // Check if w * (power of 2) equals a power of 2
    // For example: 0.5 * 2 = 1, 0.25 * 4 = 1, 2 * 1 = 2
    let n = w
    while (n < 1) n *= 2
    return (n & (n - 1)) === 0
  })

console.log(
  `${colors.bright}${colors.cyan}Starting sprite generation...${colors.reset}`
)
console.log(`${colors.yellow}Annotation URL:${colors.reset} ${annotationsUrl}`)
console.log(
  `${colors.yellow}Tile scales:${colors.reset} ${spriteTileScales.join(', ')}\n`
)

const annotationsId = await generateId(annotationsUrl)
const outputDir = path.join('./output/', annotationsId)

console.log(`${colors.blue}Annotations ID:${colors.reset} ${annotationsId}`)

await mkdirp(outputDir)

let annotations
if (!fs.existsSync(path.join(outputDir, 'annotations.json'))) {
  console.log(`${colors.cyan}Fetching annotations...${colors.reset}`)
  annotations = await fetch(annotationsUrl).then((response) => response.json())
} else {
  console.log(`${colors.cyan}Loading cached annotations...${colors.reset}`)
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

console.log(`${colors.green}Parsed ${maps.length} map(s)${colors.reset}\n`)

type Sprite = {
  map: GeoreferencedMap
  sprite: Buffer
  w: number
  h: number
  scale: number
  spriteTileScale: number
  x: number
  y: number
}

for (const spriteTileScale of spriteTileScales) {
  console.log(
    `${colors.bright}${colors.magenta}Processing tile scale: ${spriteTileScale}x${colors.reset}`
  )
  const sprites: Sprite[] = []
  for (const map of maps) {
    const imageId = map.resource.id
    const allmapsImageId = await generateId(imageId)

    console.log(
      `  ${colors.cyan}Processing map:${
        colors.reset
      } ${allmapsImageId.substring(0, 12)}...`
    )

    const cacheJsonDir = path.join('./cache/', annotationsId)

    await mkdirp(cacheJsonDir)

    const imageInfoUrl = `${imageId}/info.json`
    const cacheJsonFilename = path.join(
      cacheJsonDir,
      `${allmapsImageId}.info.json`
    )

    let imageInfo
    if (fs.existsSync(cacheJsonFilename)) {
      imageInfo = JSON.parse(fs.readFileSync(cacheJsonFilename, 'utf-8'))
    } else {
      console.log(`    ${colors.yellow}Fetching image info...${colors.reset}`)
      imageInfo = await fetch(imageInfoUrl).then((res) => res.json())
      fs.writeFileSync(cacheJsonFilename, JSON.stringify(imageInfo, null, 2))
    }

    // TODO: i should change the getImageRequest function so it doesn't upscale using sizes!
    // For now, we remove sizes from the parsed image
    const parsedImage = IiifImage.parse({ ...imageInfo, sizes: undefined })

    const tileSize = {
      width: parsedImage.tileZoomLevels[0].width * spriteTileScale,
      height: parsedImage.tileZoomLevels[0].height * spriteTileScale
    }

    const cacheImagesDir = path.join(
      './cache/',
      annotationsId,
      `${tileSize.width}x${tileSize.height}`
    )
    await mkdirp(cacheImagesDir)

    const cacheImageFilename = path.join(
      cacheImagesDir,
      `${allmapsImageId}.jpg`
    )
    const tileImageRequest = parsedImage.getImageRequest(tileSize, 'contain')
    const tileImageUrl = parsedImage.getImageUrl(tileImageRequest)

    if (fs.existsSync(cacheImageFilename)) {
      console.log(`    ${colors.green}Using cached image${colors.reset}`)
    } else {
      console.log(`    ${colors.yellow}Downloading image...${colors.reset}`)

      const imageBuffer = await fetch(tileImageUrl).then((res) =>
        res.arrayBuffer()
      )
      fs.writeFileSync(cacheImageFilename, Buffer.from(imageBuffer))
    }

    const sprite = fs.readFileSync(cacheImageFilename)
    const imageMetadata = await sharp(sprite).metadata()

    sprites.push({
      map,
      sprite,
      w: imageMetadata.width,
      h: imageMetadata.height,
      scale: imageMetadata.width / (map.resource.width || 1),
      x: 0,
      y: 0,
      spriteTileScale
    })
  }

  console.log(`  ${colors.cyan}Packing sprites...${colors.reset}`)
  const { w: width, h: height } = potpack(sprites)
  console.log(
    `  ${colors.green}Sprite sheet size: ${width}x${height}${colors.reset}`
  )

  const dirName = `${spriteTileScale}x`

  const spritesIiifImageId = `${githubPagesBaseUrl}/${annotationsId}/${dirName}`

  console.log(`  ${colors.cyan}Creating sprite image...${colors.reset}`)
  const spritesImage = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 255, b: 255 }
    }
  }).composite(
    sprites.map((sprite) => ({
      input: sprite.sprite,
      left: sprite.x,
      top: sprite.y
    }))
  )

  await mkdirp(path.join(outputDir, dirName))

  console.log(`  ${colors.cyan}Saving sprite image...${colors.reset}`)
  await spritesImage.toFile(path.join(outputDir, dirName, 'sprites.jpg'))

  console.log(`  ${colors.cyan}Generating IIIF tiles...${colors.reset}`)
  await spritesImage
    .tile({
      size: 1024,
      layout: 'iiif3',
      id: spritesIiifImageId
      // depth: 'one'
    })
    .toFile(path.join(outputDir, dirName, 'iiif'))

  const spritePositions = sprites.map((sprite) => ({
    imageId: sprite.map.resource.id,
    scaleFactor: 1 / sprite.scale,
    x: sprite.x,
    y: sprite.y,
    width: sprite.w,
    height: sprite.h,
    spriteTileScale
  }))

  const spriteMaps = sprites.map((box) => ({
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

  console.log(`  ${colors.cyan}Writing metadata files...${colors.reset}`)
  fs.writeFileSync(
    path.join(outputDir, dirName, 'sprites.json'),
    JSON.stringify(spritePositions, null, 2)
  )

  fs.writeFileSync(
    path.join(outputDir, dirName, 'annotation.json'),
    JSON.stringify(generateAnnotation(spriteMaps), null, 2)
  )

  console.log(
    `  ${colors.bright}${colors.green}✓ Completed ${spriteTileScale}x${colors.reset}\n`
  )
}

console.log(
  `${colors.bright}${colors.green}✓ All sprite scales generated successfully!${colors.reset}`
)

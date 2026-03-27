const sharp = require('sharp')
const fs = require('fs')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="80" fill="#0f172a"/>
  <text x="256" y="310" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="240" font-weight="900" fill="#06b6d4">BS</text>
  <rect x="80" y="390" width="352" height="10" rx="5" fill="#06b6d4" opacity="0.5"/>
</svg>`

async function generate() {
    const buf = Buffer.from(svg)

    await sharp(buf).resize(192, 192).png().toFile('public/icon-192.png')
    console.log('icon-192.png created')

    await sharp(buf).resize(512, 512).png().toFile('public/icon-512.png')
    console.log('icon-512.png created')

    await sharp(buf).resize(180, 180).png().toFile('public/apple-touch-icon.png')
    console.log('apple-touch-icon.png created')
}

generate().catch(console.error)

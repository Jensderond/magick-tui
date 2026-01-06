#!/usr/bin/env bun

/**
 * Build script for CI - builds a single platform
 * Usage: bun run scripts/build-single.ts <target> <output-name>
 */

import { mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import solidPlugin from '@opentui/solid/bun-plugin'
import pkg from '../package.json'

const [target, artifactName] = process.argv.slice(2)

if (!target || !artifactName) {
  console.error('Usage: bun run scripts/build-single.ts <target> <output-name>')
  process.exit(1)
}

async function buildSingle() {
  // Create dist directory if it doesn't exist
  if (!existsSync('dist')) {
    await mkdir('dist', { recursive: true })
  }

  console.log(`🔨 Building ${artifactName} for ${target}...\n`)

  const outfile = `./dist/${artifactName}`

  const result = await Bun.build({
    entrypoints: ['./src/index.tsx'],
    plugins: [solidPlugin],
    sourcemap: 'linked',
    minify: true,
    compile: {
      target: target as any,
      outfile,
      autoloadBunfig: false,
      autoloadDotenv: false,
      //@ts-ignore - newer Bun feature
      autoloadTsconfig: true,
      //@ts-ignore - newer Bun feature
      autoloadPackageJson: true,
    },
    define: {
      'process.env.NODE_ENV': '"production"',
      MAGICK_TUI_VERSION: `"${pkg.version}"`,
    },
  })

  if (!result.success) {
    console.error(`❌ Build failed for ${target}`)
    for (const log of result.logs) {
      console.error(log)
    }
    process.exit(1)
  }

  console.log(`✅ Built ${outfile}\n`)
}

buildSingle().catch((error) => {
  console.error('Build failed:', error)
  process.exit(1)
})

#!/usr/bin/env bun

/**
 * Build script for creating standalone executables
 * Compiles magick-tui for all supported platforms
 */

import { mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import solidPlugin from '@opentui/solid/bun-plugin'
import pkg from '../package.json'

const targets = [
  'bun-darwin-arm64',
  'bun-darwin-x64',
  'bun-linux-x64',
  'bun-linux-arm64',
  'bun-windows-x64',
] as const

const outputNames = {
  'bun-darwin-arm64': 'magick-tui-darwin-arm64',
  'bun-darwin-x64': 'magick-tui-darwin-x64',
  'bun-linux-x64': 'magick-tui-linux-x64',
  'bun-linux-arm64': 'magick-tui-linux-arm64',
  'bun-windows-x64': 'magick-tui-windows-x64.exe',
}

async function build() {
  // Create dist directory if it doesn't exist
  if (!existsSync('dist')) {
    await mkdir('dist', { recursive: true })
  }

  console.log('🔨 Building magick-tui for all platforms...\n')

  for (const target of targets) {
    const outfile = `./dist/${outputNames[target]}`

    console.log(`📦 Building for ${target}...`)

    const result = await Bun.build({
      entrypoints: ['./src/index.tsx'],
      plugins: [solidPlugin],
      sourcemap: 'linked',
      minify: true,
      compile: {
        target,
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
      console.error(`❌ Failed to build for ${target}`)
      for (const log of result.logs) {
        console.error(log)
      }
      process.exit(1)
    }

    console.log(`✅ Built ${outfile}\n`)
  }

  console.log('🎉 All builds completed successfully!')
}

build().catch((error) => {
  console.error('Build failed:', error)
  process.exit(1)
})

#!/usr/bin/env bun

/**
 * Build script for local testing
 * Builds only for the current platform
 */

import { mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import solidPlugin from '@opentui/solid/bun-plugin'
import pkg from '../package.json'

async function buildLocal() {
  // Create dist directory if it doesn't exist
  if (!existsSync('dist')) {
    await mkdir('dist', { recursive: true })
  }

  console.log('🔨 Building magick-tui for current platform...\n')

  const result = await Bun.build({
    entrypoints: ['./src/index.tsx'],
    plugins: [solidPlugin],
    sourcemap: 'linked',
    minify: true,
    compile: {
      outfile: './dist/magick-tui',
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
    console.error('❌ Build failed')
    for (const log of result.logs) {
      console.error(log)
    }
    process.exit(1)
  }

  console.log('✅ Built ./dist/magick-tui\n')
}

buildLocal().catch((error) => {
  console.error('Build failed:', error)
  process.exit(1)
})

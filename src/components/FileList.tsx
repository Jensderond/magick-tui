// File list component for browsing and selecting images

import { For, Show, createMemo } from 'solid-js'
import { TextAttributes } from '@opentui/core'
import type { ImageFile } from '../utils/types'
import { COLORS, formatFileSize, formatDimensions } from '../constants'

interface FileListProps {
  files: ImageFile[]
  selectedIndex: number
  onSelect: (index: number) => void
  focused: boolean
  loading: boolean
  error: string | null
}

export function FileList(props: FileListProps) {
  // Track scroll state for indicators
  const scrollState = createMemo(() => {
    const windowSize = 8
    const halfWindow = Math.floor(windowSize / 2)

    let start = Math.max(0, props.selectedIndex - halfWindow)
    const end = Math.min(props.files.length, start + windowSize)

    // Adjust start if we're near the end
    if (end - start < windowSize) {
      start = Math.max(0, end - windowSize)
    }

    return {
      start,
      end,
      hasItemsAbove: start > 0,
      hasItemsBelow: end < props.files.length,
    }
  })

  const visibleFiles = createMemo(() => {
    const { start, end } = scrollState()
    return props.files.slice(start, end).map((file, idx) => ({
      file,
      actualIndex: start + idx,
    }))
  })

  return (
    <box
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor={props.focused ? COLORS.focused : COLORS.border}
      padding={1}
      title="Select Image"
      style={{ height: 14 }}
    >
      <Show when={props.loading}>
        <text fg={COLORS.muted}>Scanning for images...</text>
      </Show>

      <Show when={props.error}>
        <text fg={COLORS.error}>{props.error}</text>
      </Show>

      <Show when={!props.loading && !props.error && props.files.length === 0}>
        <text fg={COLORS.warning}>No image files found in current directory</text>
      </Show>

      <Show when={!props.loading && !props.error && props.files.length > 0}>
        <scrollbox style={{ flexGrow: 1 }}>
          <For each={visibleFiles()}>
            {({ file, actualIndex }) => {
              const isSelected = () => actualIndex === props.selectedIndex

              return (
                <box
                  flexDirection="row"
                  style={{
                    width: '100%',
                    backgroundColor: isSelected() ? COLORS.selected : 'transparent',
                  }}
                >
                  <text
                    fg={isSelected() ? COLORS.text : COLORS.muted}
                    attributes={isSelected() ? TextAttributes.BOLD : 0}
                    style={{ width: 2 }}
                  >
                    {isSelected() ? '>' : ' '}
                  </text>
                  <text
                    fg={isSelected() ? COLORS.text : COLORS.text}
                    attributes={isSelected() ? TextAttributes.BOLD : 0}
                    style={{ flexGrow: 1 }}
                  >
                    {file.name}
                  </text>
                  <text
                    fg={isSelected() ? COLORS.text : COLORS.muted}
                    style={{ marginLeft: 2 }}
                  >
                    {file.width > 0 && file.height > 0
                      ? `${formatDimensions(file.width, file.height)}`
                      : ''}
                  </text>
                  <text
                    fg={isSelected() ? COLORS.text : COLORS.muted}
                    style={{ marginLeft: 2, width: 10 }}
                  >
                    {formatFileSize(file.size)}
                  </text>
                </box>
              )
            }}
          </For>
        </scrollbox>

        <text fg={COLORS.muted} style={{ marginTop: 1 }}>
          {props.files.length} image{props.files.length !== 1 ? 's' : ''} |{' '}
          {props.focused ? 'Up/Down: Navigate | Enter: Confirm' : ''}
        </text>
      </Show>
    </box>
  )
}

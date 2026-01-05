// Format selector component for choosing output formats (WebP, AVIF)

import { For } from 'solid-js'
import { TextAttributes } from '@opentui/core'
import type { OutputFormat } from '../utils/types'
import { OUTPUT_FORMATS, COLORS } from '../constants'

interface FormatSelectorProps {
  selectedFormats: Set<OutputFormat>
  onToggle: (format: OutputFormat) => void
  focused: boolean
  focusedIndex: number
  onFocusedIndexChange: (index: number) => void
}

export function FormatSelector(props: FormatSelectorProps) {
  return (
    <box
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor={props.focused ? COLORS.focused : COLORS.border}
      padding={1}
      title="Output Formats"
    >
      <box flexDirection="row" gap={3}>
        <For each={OUTPUT_FORMATS}>
          {(item, index) => {
            const isSelected = () => props.selectedFormats.has(item.format)
            const isFocused = () => props.focused && props.focusedIndex === index()

            return (
              <box flexDirection="row" gap={1}>
                <text
                  fg={isFocused() ? COLORS.focused : COLORS.text}
                  attributes={isFocused() ? TextAttributes.BOLD : 0}
                >
                  {isSelected() ? '[x]' : '[ ]'}
                </text>
                <text
                  fg={isSelected() ? COLORS.text : COLORS.muted}
                  attributes={isSelected() ? TextAttributes.BOLD : 0}
                >
                  {item.label}
                </text>
              </box>
            )
          }}
        </For>
      </box>
      <text fg={COLORS.muted} style={{ marginTop: 1 }}>
        {props.focused ? 'Left/Right: Navigate | Space: Toggle' : ''}
      </text>
    </box>
  )
}

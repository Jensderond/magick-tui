// Quality selector component for choosing compression quality

import { For } from 'solid-js'
import { TextAttributes } from '@opentui/core'
import { QUALITY_PRESETS, COLORS } from '../constants'

interface QualitySelectorProps {
  selectedQuality: number
  onSelect: (quality: number) => void
  focused: boolean
  focusedIndex: number
  onFocusedIndexChange: (index: number) => void
}

export function QualitySelector(props: QualitySelectorProps) {
  return (
    <box
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor={props.focused ? COLORS.focused : COLORS.border}
      padding={1}
      title="Quality"
    >
      <box flexDirection="row" gap={2}>
        <For each={QUALITY_PRESETS}>
          {(preset, index) => {
            const isSelected = () => props.selectedQuality === preset.value
            const isFocused = () => props.focused && props.focusedIndex === index()

            return (
              <box flexDirection="row" gap={1}>
                <text
                  fg={isFocused() ? COLORS.focused : COLORS.text}
                  attributes={isFocused() ? TextAttributes.BOLD : 0}
                >
                  {isSelected() ? '(*)' : '( )'}
                </text>
                <text
                  fg={isSelected() ? COLORS.text : COLORS.muted}
                  attributes={isSelected() ? TextAttributes.BOLD : 0}
                >
                  {preset.name} ({preset.value})
                </text>
              </box>
            )
          }}
        </For>
      </box>
      <text fg={COLORS.muted} style={{ marginTop: 1 }}>
        {props.focused ? 'Left/Right: Navigate | Enter: Select' : ''}
      </text>
    </box>
  )
}

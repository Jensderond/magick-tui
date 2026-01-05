// Resize input component for entering custom dimensions

import { Show } from 'solid-js'
import { COLORS } from '../constants'

interface ResizeInputProps {
  width: string
  height: string
  onWidthChange: (value: string) => void
  onHeightChange: (value: string) => void
  originalWidth: number
  originalHeight: number
  focused: boolean
  focusedField: 'width' | 'height'
  onFocusedFieldChange: (field: 'width' | 'height') => void
}

export function ResizeInput(props: ResizeInputProps) {
  return (
    <box
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor={props.focused ? COLORS.focused : COLORS.border}
      padding={1}
      title="Resize (optional)"
    >
      <box flexDirection="row" gap={2} alignItems="center">
        <box flexDirection="row" gap={1} alignItems="center">
          <text fg={COLORS.text}>Width:</text>
          <box
            border
            borderStyle="rounded"
            borderColor={
              props.focused && props.focusedField === 'width'
                ? COLORS.focused
                : COLORS.border
            }
            style={{ width: 10, height: 3 }}
          >
            <input
              placeholder="auto"
              value={props.width}
              focused={props.focused && props.focusedField === 'width'}
              onInput={(value) => {
                // Only allow numbers
                const numericValue = value.replace(/[^0-9]/g, '')
                props.onWidthChange(numericValue)
              }}
            />
          </box>
          <text fg={COLORS.muted}>px</text>
        </box>

        <box flexDirection="row" gap={1} alignItems="center">
          <text fg={COLORS.text}>Height:</text>
          <box
            border
            borderStyle="rounded"
            borderColor={
              props.focused && props.focusedField === 'height'
                ? COLORS.focused
                : COLORS.border
            }
            style={{ width: 10, height: 3 }}
          >
            <input
              placeholder="auto"
              value={props.height}
              focused={props.focused && props.focusedField === 'height'}
              onInput={(value) => {
                // Only allow numbers
                const numericValue = value.replace(/[^0-9]/g, '')
                props.onHeightChange(numericValue)
              }}
            />
          </box>
          <text fg={COLORS.muted}>px</text>
        </box>
      </box>

      <Show when={props.originalWidth > 0 && props.originalHeight > 0}>
        <text fg={props.focused ? COLORS.text : COLORS.muted} style={{ marginTop: 1 }}>
          Original: {props.originalWidth}x{props.originalHeight}px
          {props.focused ? ' | Tab: Switch field | Backspace: Clear' : ''}
        </text>
      </Show>

      <Show when={props.originalWidth === 0 || props.originalHeight === 0}>
        <text fg={COLORS.muted} style={{ marginTop: 1 }}>
          {props.focused
            ? 'Tab: Switch field | Enter numbers only'
            : 'Select an image first'}
        </text>
      </Show>
    </box>
  )
}

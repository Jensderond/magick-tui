// Size estimate display component for showing predicted file size reduction

import { For, Show } from 'solid-js'
import { TextAttributes } from '@opentui/core'
import { COLORS, formatFileSize } from '../constants'
import type { FileSizeEstimate } from '../utils/imageProcessor'

interface SizeEstimateProps {
  estimates: FileSizeEstimate[] | null
  loading: boolean
  originalSize: number
}

export function SizeEstimate(props: SizeEstimateProps) {
  const formatPercent = (percent: number): string => {
    if (percent > 0) {
      return `-${percent}%`
    } else if (percent < 0) {
      return `+${Math.abs(percent)}%`
    }
    return '0%'
  }

  const getPercentColor = (percent: number): string => {
    if (percent >= 50) return COLORS.success
    if (percent >= 20) return COLORS.successLight
    if (percent > 0) return COLORS.warning
    return COLORS.error
  }

  return (
    <box flexDirection="column" gap={0}>
      <Show
        when={!props.loading}
        fallback={
          <text fg={COLORS.muted}>Estimating size...</text>
        }
      >
        <Show
          when={props.estimates && props.estimates.length > 0}
          fallback={
            <text fg={COLORS.muted}>
              Original: {formatFileSize(props.originalSize)}
            </text>
          }
        >
          <box flexDirection="row" gap={2}>
            <text fg={COLORS.muted}>
              Original: {formatFileSize(props.originalSize)}
            </text>
            <text fg={COLORS.muted}>|</text>
            <For each={props.estimates}>
              {(estimate) => (
                <box flexDirection="row" gap={1}>
                  <text fg={COLORS.text}>
                    {estimate.format.toUpperCase()}:
                  </text>
                  <text fg={COLORS.text}>
                    {formatFileSize(estimate.estimatedSize)}
                  </text>
                  <text
                    fg={getPercentColor(estimate.decreasePercent)}
                    attributes={TextAttributes.BOLD}
                  >
                    ({formatPercent(estimate.decreasePercent)})
                  </text>
                </box>
              )}
            </For>
          </box>
        </Show>
      </Show>
    </box>
  )
}

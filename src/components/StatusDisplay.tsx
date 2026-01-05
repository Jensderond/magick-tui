// Status display component for showing processing status and messages

import { TextAttributes } from '@opentui/core'
import type { StatusMessage } from '../utils/types'
import { COLORS } from '../constants'

interface StatusDisplayProps {
  status: StatusMessage
}

export function StatusDisplay(props: StatusDisplayProps) {
  const getStatusColor = () => {
    switch (props.status.type) {
      case 'success':
        return COLORS.success
      case 'error':
        return COLORS.error
      case 'warning':
        return COLORS.warning
      case 'processing':
        return COLORS.primary
      default:
        return COLORS.muted
    }
  }

  const getStatusPrefix = () => {
    switch (props.status.type) {
      case 'success':
        return '[OK]'
      case 'error':
        return '[ERROR]'
      case 'warning':
        return '[WARN]'
      case 'processing':
        return '[...]'
      default:
        return '[i]'
    }
  }

  return (
    <box flexDirection="row" gap={1}>
      <text fg={getStatusColor()} attributes={TextAttributes.BOLD}>
        {getStatusPrefix()}
      </text>
      <text fg={getStatusColor()}>{props.status.message}</text>
    </box>
  )
}

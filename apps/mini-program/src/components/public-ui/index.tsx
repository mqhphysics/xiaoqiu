import { Button, Text, View } from '@tarojs/components'

import './index.scss'

interface DataStateProps {
  kind: 'loading' | 'error' | 'empty'
  title: string
  description?: string
  onRetry?: () => void
}

export function DataState({ kind, title, description, onRetry }: DataStateProps) {
  return (
    <View className={`data-state data-state--${kind}`}>
      <Text className="data-state__eyebrow">
        {kind === 'loading' ? 'LOADING' : kind === 'error' ? 'LOAD FAILED' : 'NO DATA'}
      </Text>
      <Text className="data-state__title">{title}</Text>
      {description && <Text className="data-state__copy">{description}</Text>}
      {onRetry && (
        <Button className="button button--primary data-state__button" onClick={onRetry}>
          重新加载
        </Button>
      )}
    </View>
  )
}

export function TeamMark({ teamCode, name }: { teamCode: string; name: string }) {
  const label =
    teamCode
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 2)
      .toUpperCase() || name.slice(0, 1)
  const tone = getTeamTone(teamCode || name)

  return <Text className={`team-mark team-mark--${tone}`}>{label}</Text>
}

export function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string
  title: string
  action?: string
}) {
  return (
    <View className="section-heading">
      <View>
        <Text className="section-heading__eyebrow">{eyebrow}</Text>
        <Text className="section-heading__title">{title}</Text>
      </View>
      {action && <Text className="section-heading__action">{action}</Text>}
    </View>
  )
}

function getTeamTone(value: string): number {
  let hash = 0
  for (const character of value) {
    hash = (hash + character.charCodeAt(0)) % 4
  }
  return hash + 1
}

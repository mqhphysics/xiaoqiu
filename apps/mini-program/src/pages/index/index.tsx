import { Text, View } from '@tarojs/components'

import './index.scss'

const modules = ['赛事赛程', '球队名单', '比赛数据', '校园动态']

export default function IndexPage() {
  return (
    <View className="page">
      <View className="header">
        <Text className="eyebrow">XIAOQIU</Text>
        <Text className="title">晓球</Text>
        <Text className="subtitle">校园足球，从一场可信的比赛开始。</Text>
      </View>

      <View className="module-list">
        {modules.map((module, index) => (
          <View className="module-row" key={module}>
            <Text className="module-index">{String(index + 1).padStart(2, '0')}</Text>
            <Text className="module-name">{module}</Text>
            <Text className="module-state">待接入</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

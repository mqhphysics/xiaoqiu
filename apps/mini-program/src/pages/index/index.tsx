import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

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
          <View
            className="module-row"
            key={module}
            onClick={() => {
              if (module === '赛事赛程') {
                void Taro.navigateTo({ url: '/pages/readonly-tournaments/index' })
              }
            }}
          >
            <Text className="module-index">{String(index + 1).padStart(2, '0')}</Text>
            <Text className="module-name">{module}</Text>
            <Text className="module-state">{module === '赛事赛程' ? '进入' : '待接入'}</Text>
          </View>
        ))}
      </View>

      <View className="spike-entry">
        <Text className="spike-label">P0 · SPIKE 01</Text>
        <Text className="spike-title">快速比赛报告与弱网草稿</Text>
        <Text className="spike-copy">验证自动保存、退出恢复、断网保留和版本冲突对比。</Text>
        <Button
          className="spike-button"
          onClick={() => void Taro.navigateTo({ url: '/pages/quick-report/index' })}
        >
          进入技术验证
        </Button>
      </View>
    </View>
  )
}

import { Button, Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useCallback, useEffect, useState } from 'react'

import { PersonTrigger } from '../../components/person-trigger'
import { ProductSection } from '../../components/product-ui'
import { DataState } from '../../components/public-ui'
import { roleLabel, verificationLabel } from '../../features/product/product.format'
import { productRepository } from '../../features/product/product.repository'
import type { AdminIdentity, ReportItem } from '../../features/product/product.types'

export function AdminReportPanel() {
  const [items, setItems] = useState<ReportItem[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true)
    try {
      setItems((await productRepository.getAdminReports()).items)
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '投诉处理台加载失败')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])
  const resolve = async (item: ReportItem, hideContent: boolean) => {
    const resolution = drafts[item.id]?.trim() ?? ''
    if (resolution.length < 2) {
      await Taro.showToast({ title: '请先填写至少 2 个字的处理回复', icon: 'none' })
      return
    }
    const result = await Taro.showModal({
      title: hideContent ? '处理并隐藏内容' : '回复提交者',
      content: hideContent
        ? '确认隐藏被投诉内容并把回复发给提交者？'
        : '确认把处理回复发给提交者？',
      confirmText: '确认处理',
    })
    if (!result.confirm) return
    try {
      const data = await productRepository.reviewReport(
        item.id,
        'RESOLVED',
        resolution,
        hideContent,
      )
      setItems(data.items)
      await Taro.showToast({ title: '处理结果已发送', icon: 'success' })
    } catch (error) {
      await Taro.showToast({
        title: error instanceof Error ? error.message : '处理失败',
        icon: 'none',
      })
    }
  }
  return (
    <View className="profile-section" id="admin-reports">
      <ProductSection
        kicker="ADMIN REPORTS"
        title="投诉处理台"
        note={`${items.filter((item) => item.status === 'OPEN').length} 条待处理`}
      />
      {loading && <DataState kind="loading" title="正在读取投诉处理台" />}
      {error && !loading && (
        <DataState
          kind="error"
          title="投诉处理台不可用"
          description={error}
          onRetry={() => void load()}
        />
      )}
      {!loading && !error && (
        <View className="admin-report-list">
          {items.map((item) => (
            <View className="admin-report-card surface" key={item.id}>
              <View>
                <Text>
                  {item.reporter?.displayName ?? '用户'} · {item.targetType}
                </Text>
                <Text>{item.reason}</Text>
                <Text>{item.details ?? '无补充说明'}</Text>
              </View>
              {item.targetPreview && (
                <View className="admin-report-card__target">
                  <Text>{item.targetPreview.title}</Text>
                  <Text>{item.targetPreview.body ?? '内容不可预览'}</Text>
                  {item.targetPreview.linkPath && (
                    <Button
                      onClick={() => void Taro.navigateTo({ url: item.targetPreview!.linkPath! })}
                    >
                      查看被投诉内容
                    </Button>
                  )}
                </View>
              )}
              {item.status === 'OPEN' || item.status === 'IN_REVIEW' ? (
                <>
                  <Input
                    className="admin-report-card__input"
                    maxlength={1000}
                    placeholder="填写给提交者的处理回复"
                    value={drafts[item.id] ?? ''}
                    onInput={(event) =>
                      setDrafts((current) => ({ ...current, [item.id]: event.detail.value }))
                    }
                  />
                  <View className="admin-report-card__actions">
                    <Button onClick={() => void resolve(item, false)}>回复并解决</Button>
                    {(item.targetType === 'POST' || item.targetType === 'COMMENT') && (
                      <Button
                        className="admin-report-card__danger"
                        onClick={() => void resolve(item, true)}
                      >
                        删除内容并回复
                      </Button>
                    )}
                  </View>
                </>
              ) : (
                <Text className="admin-report-card__resolved">{item.resolution}</Text>
              )}
            </View>
          ))}
          {items.length === 0 && <Text className="profile-empty">暂无投诉或反馈</Text>}
        </View>
      )}
    </View>
  )
}

export function AdminIdentityDirectory() {
  const [state, setState] = useState<
    | { phase: 'loading' }
    | { phase: 'ready'; identities: AdminIdentity[] }
    | { phase: 'failed'; message: string }
  >({ phase: 'loading' })

  const load = useCallback(async () => {
    setState({ phase: 'loading' })
    try {
      setState({ phase: 'ready', identities: await productRepository.getAdminIdentities() })
    } catch (error) {
      setState({
        phase: 'failed',
        message: error instanceof Error ? error.message : '实名目录加载失败',
      })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <View className="profile-section">
      <ProductSection kicker="IDENTITY ADMIN" title="实名账号目录" note="组织管理员" />
      {state.phase === 'loading' && <DataState kind="loading" title="正在读取实名目录" />}
      {state.phase === 'failed' && (
        <DataState
          kind="error"
          title="实名目录不可用"
          description={state.message}
          onRetry={() => void load()}
        />
      )}
      {state.phase === 'ready' && (
        <View className="identity-directory">
          {state.identities.map((identity) => (
            <View className="identity-card" key={identity.id}>
              <View className="identity-card__heading">
                <View>
                  <PersonTrigger userId={identity.id} name={identity.displayName}>
                    <Text className="identity-card__nickname">{identity.displayName}</Text>
                  </PersonTrigger>
                  <Text className="identity-card__username">@{identity.username}</Text>
                </View>
                <Text className="identity-card__verification">
                  {verificationLabel(identity.verificationLevel)}
                </Text>
              </View>
              <View className="identity-card__details">
                <Text>实名 {identity.realName ?? '未登记'}</Text>
                <Text>学号 {identity.studentId ?? '未登记'}</Text>
                <Text>邮箱 {identity.email ?? '未绑定'}</Text>
              </View>
              <View className="identity-card__roles">
                {(identity.roles.length > 0 ? identity.roles.map(roleLabel) : ['普通用户']).map(
                  (role) => (
                    <Text key={role}>{role}</Text>
                  ),
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

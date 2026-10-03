import { useEffect, useRef, useState } from 'react'
import { productRepository } from '../../features/product/product.repository'
import type { PostTag, PostTagSuggestion } from '../../features/product/product.types'
import { PostIcon } from '../post-social/icons'
import './index.h5.scss'

export function tagKey(tag: PostTag) {
  return `${tag.kind}:${tag.targetId ?? normalizeLabel(tag.label)}`
}
function normalizeLabel(label: string) {
  return label.normalize('NFKC').replace(/^#+/, '').trim().toLocaleLowerCase('zh-CN')
}
const labels = { TEAM: '球队', PLAYER: '球员', TOPIC: '话题' }

export function PostTagPicker({
  tags,
  onChange,
  disabled,
  tournamentId,
  onPendingChange,
}: {
  tags: PostTag[]
  onChange: (tags: PostTag[]) => void
  disabled: boolean
  tournamentId?: string | undefined
  onPendingChange: (value: boolean) => void
}) {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<PostTagSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resolving, setResolving] = useState(false)
  const action = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true)
    setOptions([])
    setError('')
    const timer = window.setTimeout(
      () => {
        void productRepository
          .getPostTagSuggestions(query, tournamentId)
          .then((result) => {
            if (active) setOptions(result.items)
          })
          .catch((issue) => {
            if (active) setError(issue instanceof Error ? issue.message : '标签建议暂不可用')
          })
          .finally(() => {
            if (active) setLoading(false)
          })
      },
      query ? 200 : 0,
    )
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [query, tournamentId, retry])
  const add = (tag: PostTag) => {
    if (disabled) return
    if (tags.some((current) => tagKey(current) === tagKey(tag))) {
      setQuery('')
      setError('这个标签已经添加')
      return
    }
    if (tags.length >= 10) {
      setError('每条动态最多添加 10 个标签')
      return
    }
    onChange([
      ...tags,
      { kind: tag.kind, label: tag.label, ...(tag.targetId ? { targetId: tag.targetId } : {}) },
    ])
    setQuery('')
    setError('')
    input.current?.focus()
  }
  const fromInput = async () => {
    if (disabled || action.current || !query.trim()) return
    const label = query.normalize('NFKC').trim().replace(/^#+/, '').trim()
    if (!label || Array.from(label).length > 30 || /[\p{Cc}\p{Cf}]/u.test(label)) {
      setError('自定义标签应为 1 至 30 个可见字符')
      return
    }
    action.current = true
    setResolving(true)
    onPendingChange(true)
    setError('')
    try {
      const current = await productRepository.getPostTagSuggestions(label, tournamentId)
      const matches = current.items.filter(
        (tag) => normalizeLabel(tag.label) === normalizeLabel(label),
      )
      const entities = matches.filter((tag) => tag.kind !== 'TOPIC')
      if (entities.length > 1) {
        setOptions(current.items)
        setError('有多个同名球队或球员，请从建议中选择')
        return
      }
      add(entities[0] ?? matches[0] ?? { kind: 'TOPIC', label })
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '无法读取标签建议，请重试')
    } finally {
      action.current = false
      setResolving(false)
      onPendingChange(false)
      requestAnimationFrame(() => input.current?.focus())
    }
  }
  const visible = options.filter((tag) => !tags.some((current) => tagKey(current) === tagKey(tag)))
  const suggestions = query
    ? visible.slice(0, 18)
    : ['TOPIC', 'TEAM', 'PLAYER'].flatMap((kind) =>
        visible.filter((tag) => tag.kind === kind).slice(0, 4),
      )
  return (
    <section className="post-tag-picker" aria-label="添加动态标签">
      <div className="post-tag-picker__label">
        <span>添加标签</span>
        <small>球队、球员或你想记录的话题</small>
      </div>
      <div className="post-tag-picker__input-area">
        {tags.map((tag) => (
          <span key={tagKey(tag)} className="post-tag post-tag--selected">
            #{tag.label}
            <button
              type="button"
              data-post-tag
              aria-label={`删除标签 ${tag.label}`}
              disabled={disabled || resolving}
              onClick={() => {
                onChange(tags.filter((current) => tagKey(current) !== tagKey(tag)))
                requestAnimationFrame(() => input.current?.focus())
              }}
            >
              <PostIcon name="close" />
            </button>
          </span>
        ))}
        <input
          ref={input}
          data-post-tag-input
          aria-label="输入动态标签"
          placeholder={
            tags.length >= 10
              ? '最多 10 个标签，删除后可继续添加'
              : tags.length
                ? '输入后回车继续添加'
                : '搜索球队、球员，或输入后回车创建话题'
          }
          value={query}
          maxLength={60}
          disabled={disabled || resolving || tags.length >= 10}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.nativeEvent.isComposing &&
              event.nativeEvent.keyCode !== 229
            ) {
              event.preventDefault()
              event.stopPropagation()
              void fromInput()
            }
          }}
        />
      </div>
      <div className="post-tag-picker__suggestions">
        <span>{query ? '标签建议' : '常用标签'}</span>
        {resolving ? (
          <small>正在添加标签…</small>
        ) : loading ? (
          <small>正在查找…</small>
        ) : (
          suggestions.map((tag) => (
            <button
              type="button"
              data-post-tag
              key={tagKey(tag)}
              disabled={disabled || resolving || tags.length >= 10}
              onClick={() => add(tag)}
            >
              <small>{labels[tag.kind]}</small>#{tag.label}
              {tag.description ? (
                <span className="post-tag-picker__hint">{tag.description}</span>
              ) : null}
            </button>
          ))
        )}
        {!loading && query && !visible.length && !error ? (
          <small>按回车创建「{query}」话题标签</small>
        ) : null}
      </div>
      {error ? (
        <div role="alert" className="post-tag-picker__error">
          {error}
          <button
            type="button"
            data-post-tag
            disabled={disabled || resolving}
            onClick={() => setRetry((value) => value + 1)}
          >
            重试
          </button>
        </div>
      ) : null}
    </section>
  )
}

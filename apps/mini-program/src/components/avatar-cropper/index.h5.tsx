import Taro from '@tarojs/taro'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useOverlayFocus } from '../overlay-focus'
import { IconButton } from '../icon-button'
import './index.scss'
import './native.h5.scss'

export function AvatarCropper({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void
  onConfirm: (dataUrl: string) => Promise<void>
}) {
  const [source, setSource] = useState<string | null>(null),
    [dimensions, setDimensions] = useState({ width: 1, height: 1 })
  const [zoom, setZoom] = useState(1),
    [offsetX, setOffsetX] = useState(0),
    [offsetY, setOffsetY] = useState(0),
    [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  useOverlayFocus(true, '.avatar-cropper-panel', () => {
    if (!saving) onCancel()
  })
  useEffect(() => () => inputRef.current?.remove(), [])
  const preview = useMemo(
    () => getPreviewStyle(dimensions.width, dimensions.height, zoom, offsetX, offsetY),
    [dimensions.height, dimensions.width, offsetX, offsetY, zoom],
  )
  const choose = async (file: File | undefined) => {
    if (!file) return
    try {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
        throw new Error('请选择 JPEG、PNG 或 WebP 照片')
      if (file.size > 12 * 1024 * 1024) throw new Error('请选择小于12 MiB的照片')
      const path = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('无法读取照片'))
        reader.readAsDataURL(file)
      })
      const image = await loadImage(path)
      setSource(path)
      setDimensions({ width: image.naturalWidth, height: image.naturalHeight })
      setZoom(1)
      setOffsetX(0)
      setOffsetY(0)
    } catch (error) {
      void Taro.showToast({
        title: error instanceof Error ? error.message : '照片读取失败',
        icon: 'none',
      })
    }
  }
  const chooseFile = () => {
    inputRef.current?.remove()
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/jpeg,image/png,image/webp'
    input.style.setProperty('display', 'none', 'important')
    inputRef.current = input
    const clean = () => {
      input.remove()
      if (inputRef.current === input) inputRef.current = null
    }
    input.addEventListener(
      'change',
      () => {
        void choose(input.files?.[0])
        clean()
      },
      { once: true },
    )
    input.addEventListener('cancel', clean, { once: true })
    document.body.append(input)
    input.click()
  }
  const save = async () => {
    if (!source || saving) return
    setSaving(true)
    try {
      await onConfirm(await cropAndCompress(source, dimensions, zoom, offsetX, offsetY))
    } catch (error) {
      void Taro.showToast({
        title: error instanceof Error ? error.message : '头像保存失败',
        icon: 'none',
      })
    } finally {
      setSaving(false)
    }
  }
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="裁剪头像" className="avatar-cropper-modal">
      <div
        className="avatar-cropper-backdrop"
        onClick={() => {
          if (!saving) onCancel()
        }}
      />
      <section className="avatar-cropper-panel">
        <header className="avatar-cropper-heading">
          <div>
            <span className="avatar-cropper-kicker">AVATAR</span>
            <h2 className="avatar-cropper-title">更换头像</h2>
          </div>
          <IconButton
            icon="close"
            aria-label="关闭头像裁剪"
            className="avatar-cropper-close"
            onClick={() => {
              if (!saving) onCancel()
            }}
          >
            ×
          </IconButton>
        </header>
        <div className="avatar-cropper-stage">
          {source ? (
            <img className="avatar-cropper-image" src={source} alt="头像裁剪预览" style={preview} />
          ) : (
            <span className="avatar-cropper-placeholder">选择一张喜欢的照片</span>
          )}
          <div className="avatar-cropper-circle" />
        </div>
        <button
          type="button"
          className="button button--outline avatar-cropper-choose"
          onClick={chooseFile}
          disabled={saving}
        >
          {source ? '重新选择' : '选择照片'}
        </button>
        {source && (
          <div className="avatar-cropper-controls">
            <CropSlider
              label="缩放"
              min={100}
              max={260}
              value={Math.round(zoom * 100)}
              onChange={(value) => setZoom(value / 100)}
            />
            <CropSlider label="水平" min={-100} max={100} value={offsetX} onChange={setOffsetX} />
            <CropSlider label="垂直" min={-100} max={100} value={offsetY} onChange={setOffsetY} />
          </div>
        )}
        <p className="avatar-cropper-note">调整照片位置，让头像出现在圆形区域内。</p>
        <div className="avatar-cropper-actions">
          <button
            type="button"
            className="button button--outline"
            disabled={saving}
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={!source || saving}
            onClick={() => void save()}
          >
            {saving ? '保存中…' : '保存头像'}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
function CropSlider({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string
  min: number
  max: number
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label className="avatar-cropper-control">
      <span className="avatar-cropper-control-label">{label}</span>
      <input
        type="range"
        className="avatar-cropper-slider"
        aria-label={label}
        min={min}
        max={max}
        value={value}
        step={1}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

function getPreviewStyle(
  width: number,
  height: number,
  zoom: number,
  offsetX: number,
  offsetY: number,
) {
  const stage = 240
  const scale = Math.max(stage / width, stage / height) * zoom
  const scaledWidth = width * scale
  const scaledHeight = height * scale
  const overflowX = Math.max(0, scaledWidth - stage)
  const overflowY = Math.max(0, scaledHeight - stage)
  return {
    width: `${scaledWidth}px`,
    height: `${scaledHeight}px`,
    left: `${(stage - scaledWidth) / 2 + (offsetX / 100) * (overflowX / 2)}px`,
    top: `${(stage - scaledHeight) / 2 + (offsetY / 100) * (overflowY / 2)}px`,
  }
}

async function cropAndCompress(
  source: string,
  dimensions: { width: number; height: number },
  zoom: number,
  offsetX: number,
  offsetY: number,
): Promise<string> {
  const image = await loadImage(source)
  for (const edge of [512, 448, 384, 320]) {
    const canvas = document.createElement('canvas')
    canvas.width = edge
    canvas.height = edge
    const context = canvas.getContext('2d')
    if (!context) throw new Error('浏览器无法创建头像画布')
    const scale = Math.max(edge / dimensions.width, edge / dimensions.height) * zoom
    const scaledWidth = dimensions.width * scale
    const scaledHeight = dimensions.height * scale
    const overflowX = Math.max(0, scaledWidth - edge)
    const overflowY = Math.max(0, scaledHeight - edge)
    const dx = (edge - scaledWidth) / 2 + (offsetX / 100) * (overflowX / 2)
    const dy = (edge - scaledHeight) / 2 + (offsetY / 100) * (overflowY / 2)
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, dx, dy, scaledWidth, scaledHeight)
    for (const quality of [0.88, 0.78, 0.68, 0.58]) {
      const dataUrl = canvas.toDataURL('image/webp', quality)
      if (estimateBytes(dataUrl) <= 72 * 1024) return dataUrl
    }
  }
  throw new Error('这张照片压缩后仍过大，请换一张图片')
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('无法读取所选照片'))
    image.src = source
  })
}

function estimateBytes(dataUrl: string): number {
  const payload = dataUrl.slice(dataUrl.indexOf(',') + 1)
  return Math.ceil((payload.length * 3) / 4)
}

import { Button, Image, Slider, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useMemo, useState } from 'react'

import { useOverlayFocus } from '../overlay-focus'

import './index.scss'

export function AvatarCropper({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void
  onConfirm: (dataUrl: string) => Promise<void>
}) {
  const [source, setSource] = useState<string | null>(null)
  const [dimensions, setDimensions] = useState({ width: 1, height: 1 })
  const [zoom, setZoom] = useState(1)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  const [saving, setSaving] = useState(false)
  useOverlayFocus(true, '.avatar-cropper-panel', onCancel)
  const preview = useMemo(
    () => getPreviewStyle(dimensions.width, dimensions.height, zoom, offsetX, offsetY),
    [dimensions.height, dimensions.width, offsetX, offsetY, zoom],
  )

  const choose = async () => {
    try {
      const result = await Taro.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album'],
      })
      const path = result.tempFilePaths[0]
      if (!path) return
      const image = await loadImage(path)
      setSource(path)
      setDimensions({ width: image.naturalWidth, height: image.naturalHeight })
      setZoom(1)
      setOffsetX(0)
      setOffsetY(0)
    } catch (error) {
      await Taro.showToast({
        title: error instanceof Error ? error.message : '照片读取失败',
        icon: 'none',
      })
    }
  }

  const save = async () => {
    if (!source || saving) return
    setSaving(true)
    try {
      const dataUrl = await cropAndCompress(source, dimensions, zoom, offsetX, offsetY)
      await onConfirm(dataUrl)
    } catch (error) {
      await Taro.showToast({
        title: error instanceof Error ? error.message : '头像保存失败',
        icon: 'none',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <View aria-modal role="dialog" aria-label="裁剪头像" className="avatar-cropper-modal">
      <View className="avatar-cropper-backdrop" onClick={onCancel} />
      <View className="avatar-cropper-panel">
        <View className="avatar-cropper-heading">
          <View>
            <Text className="avatar-cropper-kicker">AVATAR</Text>
            <Text className="avatar-cropper-title">裁剪并压缩头像</Text>
          </View>
          <Button aria-label="关闭头像裁剪" className="avatar-cropper-close" onClick={onCancel}>
            ×
          </Button>
        </View>
        <View className="avatar-cropper-stage">
          {source ? (
            <Image
              className="avatar-cropper-image"
              mode="scaleToFill"
              src={source}
              style={preview}
            />
          ) : (
            <Text className="avatar-cropper-placeholder">先选择一张照片</Text>
          )}
          <View className="avatar-cropper-circle" />
        </View>
        <Button
          className="button button--outline avatar-cropper-choose"
          onClick={() => void choose()}
        >
          {source ? '重新选择' : '选择照片'}
        </Button>
        {source && (
          <View className="avatar-cropper-controls">
            <CropSlider
              label="缩放"
              min={100}
              max={260}
              value={Math.round(zoom * 100)}
              onChange={(value) => setZoom(value / 100)}
            />
            <CropSlider label="水平" min={-100} max={100} value={offsetX} onChange={setOffsetX} />
            <CropSlider label="垂直" min={-100} max={100} value={offsetY} onChange={setOffsetY} />
          </View>
        )}
        <Text className="avatar-cropper-note">
          系统会输出正方形 WebP/JPEG，最长边不超过 512px，压缩后不超过 72 KiB。
        </Text>
        <View className="avatar-cropper-actions">
          <Button className="button button--outline" disabled={saving} onClick={onCancel}>
            取消
          </Button>
          <Button
            className="button button--primary"
            disabled={!source || saving}
            loading={saving}
            onClick={() => void save()}
          >
            保存头像
          </Button>
        </View>
      </View>
    </View>
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
    <View className="avatar-cropper-control">
      <Text>{label}</Text>
      <Slider
        min={min}
        max={max}
        value={value}
        activeColor="#1f6b45"
        onChange={(event) => onChange(event.detail.value)}
      />
    </View>
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

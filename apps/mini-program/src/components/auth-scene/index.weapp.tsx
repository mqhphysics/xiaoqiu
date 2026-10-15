import { Canvas, Image, Text, View } from '@tarojs/components'
import type { CanvasTouchEvent } from '@tarojs/components/types/common'
import Taro, { useDidHide, useDidShow, useReady } from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import sceneSource from '../../assets/login-art/stadium-particle-plate.png'
import brandMark from '../../assets/home-visual/brand-mark.png'
import { canvasTouchPosition } from './touch-field.logic'
import {
  createNativeParticleField,
  type SceneCanvas,
  type SceneRaster,
  type SceneStats,
} from './particle-field.weapp'

export function NativeAuthScene({
  layoutKey,
  active = true,
  interactive = true,
}: {
  layoutKey: string
  active?: boolean
  interactive?: boolean
}) {
  const engine = useRef<ReturnType<typeof createNativeParticleField> | null>(null)
  const bounds = useRef({ left: 0, top: 0 })
  const mounted = useRef(true)
  const interactiveNow = useRef(interactive)
  interactiveNow.current = interactive
  const initializing = useRef(false)
  const finger = useRef<number | null>(null)
  const [stats, setStats] = useState<SceneStats>({
    particles: 0,
    displacement: 0,
    state: 'loading',
  })
  const [ready, setReady] = useState(false)
  const measure = () => {
    if (!active || !interactive || initializing.current) return
    Taro.createSelectorQuery()
      .select('#native-auth-canvas')
      .fields({ node: true, size: true, rect: true }, (result) => {
        const node = result as unknown as {
          node?: SceneCanvas
          width?: number
          height?: number
          left?: number
          top?: number
        }
        if (
          !mounted.current ||
          !interactiveNow.current ||
          !node.node ||
          !node.width ||
          !node.height
        )
          return
        bounds.current = { left: node.left ?? 0, top: node.top ?? 0 }
        if (engine.current) {
          engine.current.resize(node.width, node.height)
          return
        }
        initializing.current = true
        const canvas = node.node,
          width = node.width,
          height = node.height
        const image = canvas.createImage()
        image.onload = () => {
          if (!mounted.current || !interactiveNow.current) {
            initializing.current = false
            return
          }
          try {
            const sourceScale = Math.min(1, 1200 / Math.max(image.width, image.height))
            const atlas = Taro.createOffscreenCanvas({
              type: '2d',
              width: Math.round(image.width * sourceScale),
              height: Math.round(image.height * sourceScale),
            }) as unknown as SceneRaster
            atlas.getContext('2d').drawImage(image, 0, 0, atlas.width, atlas.height)
            engine.current = createNativeParticleField(
              canvas,
              atlas,
              width,
              height,
              Taro.getWindowInfo().pixelRatio,
              (next) => {
                if (mounted.current) setStats(next)
              },
            )
            setReady(true)
          } catch (error) {
            console.warn('Native login canvas failed to initialize', error)
            setStats({ particles: 0, displacement: 0, state: 'fallback' })
          }
          initializing.current = false
        }
        image.onerror = () => {
          if (mounted.current) {
            initializing.current = false
            setStats({ particles: 0, displacement: 0, state: 'fallback' })
          }
        }
        image.src = sceneSource.startsWith('/') ? sceneSource : `/${sceneSource}`
      })
      .exec()
  }
  useReady(measure)
  useEffect(() => {
    Taro.nextTick(measure)
  }, [layoutKey, active, interactive])
  useEffect(() => {
    if (!interactive) {
      engine.current?.destroy()
      engine.current = null
      setReady(false)
    }
  }, [interactive])
  useEffect(() => {
    engine.current?.setVisible(active)
  }, [active])
  useEffect(
    () => () => {
      mounted.current = false
      engine.current?.destroy()
    },
    [],
  )
  useDidHide(() => engine.current?.setVisible(false))
  useDidShow(() => engine.current?.setVisible(active))
  const touch = (event: CanvasTouchEvent) => {
    const point = event.touches.find(
      (item) => finger.current === null || item.identifier === finger.current,
    )
    if (!point) return
    const position = canvasTouchPosition(point, bounds.current)
    if (!position) return
    finger.current = point.identifier
    engine.current?.setPointer(position[0], position[1], true)
  }
  const release = () => {
    finger.current = null
    engine.current?.setPointer(0, 0, false)
  }
  return (
    <View
      className="native-auth-scene"
      data-scene-state={stats.state}
      data-particles={stats.particles}
      data-displacement={stats.displacement}
    >
      <View className="native-auth-scene__brand">
        <Image className="native-auth-scene__mark" src={brandMark} mode="aspectFit" />
        <Text>晓球</Text>
      </View>
      <View className="native-auth-scene__art">
        {(!ready || !interactive) && (
          <Image className="native-auth-scene__image" src={sceneSource} mode="widthFix" />
        )}
        {interactive && (
          <Canvas
            id="native-auth-canvas"
            canvasId="native-auth-canvas"
            className="native-auth-scene__canvas"
            type="2d"
            disableScroll
            onTouchStart={touch}
            onTouchMove={touch}
            onTouchEnd={release}
            onTouchCancel={release}
          />
        )}
      </View>
    </View>
  )
}

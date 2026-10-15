import { Canvas, View } from '@tarojs/components'
import Taro, { getCurrentInstance, useDidHide, useDidShow, useReady } from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import type { TeamSummary } from '../../features/product/product.types'
// These two existing files contain only geometry and color calculations, no DOM code.
import { goldLeafLines } from './team-nav-leaf-lines.h5'
import { getTeamNavOrnamentColor } from './team-nav-palette.h5'
import './team-tab-focus.weapp.scss'

interface Point {
  x: number
  y: number
  length: number
}
function samplePath(path: string): Point[] {
  const tokens = path.match(/[MC]|-?\d+(?:\.\d+)?/g) ?? []
  const points: Point[] = []
  let i = 0
  const append = (x: number, y: number) => {
    const previous = points[points.length - 1]
    points.push({
      x,
      y,
      length: previous ? previous.length + Math.hypot(x - previous.x, y - previous.y) : 0,
    })
  }
  while (i < tokens.length) {
    const command = tokens[i++]
    if (command === 'M') append(Number(tokens[i++]), Number(tokens[i++]))
    else if (command === 'C') {
      const start = points[points.length - 1]!
      const a = Number(tokens[i++]),
        b = Number(tokens[i++]),
        c = Number(tokens[i++]),
        d = Number(tokens[i++]),
        x = Number(tokens[i++]),
        y = Number(tokens[i++])
      for (let step = 1; step <= 8; step++) {
        const t = step / 8,
          s = 1 - t
        append(
          s ** 3 * start.x + 3 * s ** 2 * t * a + 3 * s * t ** 2 * c + t ** 3 * x,
          s ** 3 * start.y + 3 * s ** 2 * t * b + 3 * s * t ** 2 * d + t ** 3 * y,
        )
      }
    } else throw new Error('Unsupported team ornament path')
  }
  return points
}
const lines = goldLeafLines.map((line) => ({ ...line, points: samplePath(line.path) }))
type DrawingContext = Pick<
  CanvasRenderingContext2D,
  | 'setTransform'
  | 'clearRect'
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'stroke'
  | 'strokeStyle'
  | 'lineWidth'
  | 'lineCap'
  | 'lineJoin'
  | 'globalAlpha'
>
interface DrawingCanvas {
  width: number
  height: number
  getContext(type: '2d'): DrawingContext
  requestAnimationFrame(callback: () => void): number
  cancelAnimationFrame(id: number): void
}

export function NativeTeamTabFocus({ team }: { team?: TeamSummary | null }) {
  const [overlay, setOverlay] = useState(false)
  const cancel = useRef<(() => void) | null>(null)
  const mounted = useRef(true)
  const color = getTeamNavOrnamentColor(team)
  const selected = getCurrentInstance().router?.path.includes('/my-team/') ?? false
  const start = () => {
    Taro.createSelectorQuery()
      .select('#native-team-leaf')
      .fields({ node: true, size: true }, (result) => {
        const { node, width, height } = result as unknown as {
          node?: DrawingCanvas
          width: number
          height: number
        }
        if (!mounted.current || !node || !width || !height) return
        cancel.current?.()
        const dpr = Math.min(2, Taro.getWindowInfo().pixelRatio)
        node.width = Math.round(width * dpr)
        node.height = Math.round(height * dpr)
        const context = node.getContext('2d')
        const duration = Math.max(...lines.map((line) => line.delay + line.duration))
        const started = Date.now()
        let frame = 0,
          stopped = false,
          lastDrawn = 0
        const draw = () => {
          if (stopped) return
          const elapsed = Date.now() - started
          if (elapsed - lastDrawn >= 32 || elapsed >= duration) {
            lastDrawn = elapsed
            context.setTransform(dpr, 0, 0, dpr, 0, 0)
            context.clearRect(0, 0, width, height)
            context.setTransform((dpr * width) / 200, 0, 0, (dpr * height) / 84, 0, 0)
            context.strokeStyle = color
            context.globalAlpha = selected ? 0.95 : 0.55
            context.lineJoin = 'round'
            for (const line of lines) {
              const progress = Math.min(1, Math.max(0, (elapsed - line.delay) / line.duration))
              if (!progress) continue
              const target = line.points[line.points.length - 1]!.length * progress
              context.lineWidth = line.width
              context.lineCap = line.region === 'stem' ? 'round' : 'butt'
              for (const mirrored of [false, true]) {
                const x = (value: number) => (mirrored ? 200 - value : value)
                context.beginPath()
                context.moveTo(x(line.points[0]!.x), line.points[0]!.y)
                for (let i = 1; i < line.points.length; i++) {
                  const point = line.points[i]!,
                    previous = line.points[i - 1]!
                  if (point.length <= target) context.lineTo(x(point.x), point.y)
                  else {
                    const portion =
                      (target - previous.length) / Math.max(0.001, point.length - previous.length)
                    context.lineTo(
                      x(previous.x + (point.x - previous.x) * portion),
                      previous.y + (point.y - previous.y) * portion,
                    )
                    break
                  }
                }
                context.stroke()
              }
            }
          }
          if (elapsed < duration) frame = node.requestAnimationFrame(draw)
        }
        cancel.current = () => {
          stopped = true
          node.cancelAnimationFrame(frame)
        }
        frame = node.requestAnimationFrame(draw)
      })
      .exec()
  }
  useReady(start)
  useDidShow(() => Taro.nextTick(start))
  useDidHide(() => cancel.current?.())
  useEffect(() => {
    if (overlay) cancel.current?.()
    else Taro.nextTick(start)
  }, [color, selected, overlay])
  useEffect(() => {
    const listener = (open: boolean) => setOverlay(open)
    Taro.eventCenter.on('xiaoqiu:native-overlay', listener)
    return () => {
      Taro.eventCenter.off('xiaoqiu:native-overlay', listener)
    }
  }, [])
  useEffect(
    () => () => {
      mounted.current = false
      cancel.current?.()
    },
    [],
  )
  if (overlay) return null
  return (
    <View className="native-team-focus" aria-hidden="true">
      <Canvas
        id="native-team-leaf"
        canvasId="native-team-leaf"
        className="native-team-focus__canvas"
        type="2d"
      />
    </View>
  )
}

import { View } from '@tarojs/components'

// The existing static cover remains the fallback outside desktop H5.
export function HeroCarousel() {
  return (
    <View aria-hidden="true" className="experience-hero__media">
      <View className="experience-hero__illustration" />
    </View>
  )
}

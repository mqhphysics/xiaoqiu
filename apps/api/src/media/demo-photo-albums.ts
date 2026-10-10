// Demo albums stay on the existing imageUrl column. The cover file is a normal
// /api/media/demo/photos/NN.webp asset; extra frames are expanded here so the
// cover URL itself remains directly readable.
export const DEMO_PHOTO_ALBUMS: Readonly<Record<string, readonly string[]>> = {
  '08': ['08', '10', '14'],
  '11': ['11', '16'],
  '12': ['12', '13', '03', '05'],
}

export function demoPhotoAlbumUrls(imageUrl: string): string[] | null {
  const match =
    /^((?:https?:\/\/[^/]+)?\/api\/media\/demo\/photos\/)(0[1-9]|1[0-6])\.webp$/.exec(imageUrl)
  if (!match) return null
  const frames = DEMO_PHOTO_ALBUMS[match[2]!]
  if (!frames || frames.length < 2 || frames[0] !== match[2]) return null
  return frames.map((id) => `${match[1]}${id}.webp`)
}

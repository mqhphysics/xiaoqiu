export type TeamNavDesignKey = '04' | '15'

interface Contour {
  key: string
  path: string
  seedPath?: string
  width: number
  tone: 'primary' | 'secondary' | 'detail'
  delay: number
  duration: number
}

interface TeamNavDesign {
  key: TeamNavDesignKey
  name: string
  originY: number
  contours: readonly Contour[]
}

const scrollSeed = 'M100 66C89 75 77 78 64 78'
const grassSeed = 'M100 69C89 70 80 67 72 62'
const grassStem = `${grassSeed}C59 54 51 44 39 38`

export const teamNavDesigns: Record<TeamNavDesignKey, TeamNavDesign> = {
  '04': {
    key: '04',
    name: '菱形卷线',
    originY: 66,
    contours: [
      {
        key: 'sweep',
        path: `${scrollSeed}C41 78 22 67 21 50C20 31 40 29 62 39C73 44 81 47 84 45`,
        seedPath: scrollSeed,
        width: 2.35,
        tone: 'primary',
        delay: 30,
        duration: 1050,
      },
      {
        key: 'crossing',
        path: 'M100 66C83 56 60 37 41 37C28 37 19 48 9 49C-2 50-1 36 8 31C19 24 32 29 32 38C32 46 24 48 20 45',
        width: 1.65,
        tone: 'secondary',
        delay: 180,
        duration: 1120,
      },
      {
        key: 'inner-curl',
        path: `${scrollSeed}C47 78 32 72 28 60C24 49 31 42 39 44C47 46 46 55 40 56C34 57 32 52 35 49`,
        width: 0.7,
        tone: 'detail',
        delay: 410,
        duration: 900,
      },
    ],
  },
  '15': {
    key: '15',
    name: '卷草细纹',
    originY: 69,
    contours: [
      {
        key: 'stem',
        path: `${grassStem}C22 26 5 32 3 49C1 66 24 70 28 57C31 46 15 42 12 51C10 59 19 64 22 56`,
        seedPath: grassSeed,
        width: 2.15,
        tone: 'secondary',
        delay: 30,
        duration: 1100,
      },
      {
        key: 'inner-scroll',
        path: `${grassSeed}C77 59 83 55 83 48C84 38 69 37 67 46C66 55 76 58 78 51C79 46 74 43 72 47`,
        width: 1.6,
        tone: 'primary',
        delay: 190,
        duration: 850,
      },
      {
        key: 'lower-frond',
        path: `${grassSeed}C65 59 61 55 58 53C57 60 60 69 65 72C53 69 47 62 47 48`,
        width: 1.05,
        tone: 'primary',
        delay: 310,
        duration: 940,
      },
      {
        key: 'middle-frond',
        path: `${grassSeed}C60 56 51 45 45 42C43 51 44 62 50 68C37 62 32 51 35 36`,
        width: 1.15,
        tone: 'secondary',
        delay: 420,
        duration: 980,
      },
      {
        key: 'outer-frond',
        path: `${grassStem}C33 34 28 32 24 32C26 39 29 45 34 48C28 49 23 46 21 41C19 35 23 32 24 32`,
        width: 0.95,
        tone: 'primary',
        delay: 530,
        duration: 950,
      },
      {
        key: 'vein-a',
        path: `${grassSeed}C64 57 60 56 55 51C53 57 54 62 57 65`,
        width: 0.55,
        tone: 'detail',
        delay: 660,
        duration: 830,
      },
      {
        key: 'vein-b',
        path: `${grassSeed}C60 56 52 45 40 39C38 48 40 56 44 60`,
        width: 0.55,
        tone: 'detail',
        delay: 700,
        duration: 850,
      },
      {
        key: 'edge',
        path: `${grassStem}C24 28 8 31 6 45C4 57 16 65 25 60`,
        width: 0.6,
        tone: 'detail',
        delay: 520,
        duration: 940,
      },
    ],
  },
}

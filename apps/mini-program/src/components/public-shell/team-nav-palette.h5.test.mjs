import assert from 'node:assert/strict'
import test from 'node:test'

import { getTeamNavPalette } from './team-nav-palette.h5.ts'

const team = {
  teamCode: 'DEMO-PHY-1',
  crestUrl: '/api/media/demo/crests/01.png',
  primaryColor: '#1f6b45',
  secondaryColor: '#f4c95d',
}

test('demo crest palette follows the visible Manchester United crest rather than old fixture colors', () => {
  const palette = getTeamNavPalette(team)
  assert.equal(palette.primary, '#da291c')
  assert.equal(palette.secondary, '#ffe500')
})

test('custom crests keep their declared team colors even on a known demo team code', () => {
  const palette = getTeamNavPalette({ ...team, crestUrl: '/api/media/uploads/custom-crest.png' })
  assert.equal(palette.primary, team.primaryColor)
  assert.equal(palette.secondary, team.secondaryColor)
})

test('missing demo crest uses the same team-code fallback as TeamCrest', () => {
  assert.deepEqual(getTeamNavPalette({ ...team, crestUrl: null }), getTeamNavPalette(team))
})

test('team changes produce a new palette without retaining the previous club colors', () => {
  const city = getTeamNavPalette({
    ...team,
    teamCode: 'DEMO-PHY-2',
    crestUrl: '/api/media/demo/crests/02.png',
  })
  assert.equal(city.primary, '#6cabdd')
  assert.notEqual(city.primary, getTeamNavPalette(team).primary)
  assert.equal(getTeamNavPalette(null).primary, '#244f3c')
})

test('custom shorthand colors are normalized and invalid values fall back safely', () => {
  const palette = getTeamNavPalette({
    ...team,
    teamCode: 'CUSTOM',
    primaryColor: ' #F00 ',
    secondaryColor: 'invalid',
  })
  assert.equal(palette.primary, '#ff0000')
  assert.equal(palette.secondary, '#c6a760')
  for (const color of Object.values(palette)) assert.match(color, /^#[a-f\d]{6}$/)
})

test('light team colors retain a visible shaded edge rather than disappearing into white', () => {
  const palette = getTeamNavPalette({
    ...team,
    teamCode: 'CUSTOM',
    primaryColor: '#fff',
    secondaryColor: '#fff',
  })
  assert.notEqual(palette.primaryDark, palette.primary)
  assert.notEqual(palette.secondaryDark, palette.secondary)
})

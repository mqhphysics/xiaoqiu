export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/readonly-tournaments/index',
    'pages/readonly-tournament-detail/index',
    'pages/readonly-schedule/index',
    'pages/readonly-teams/index',
    'pages/readonly-match-detail/index',
    'pages/readonly-team-detail/index',
    'pages/quick-report/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#183f2a',
    navigationBarTitleText: '晓球',
    navigationBarTextStyle: 'white',
  },
})

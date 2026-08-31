import path from 'node:path'

import { defineConfig, type UserConfigExport } from '@tarojs/cli'

const buildEnvironment = (
  globalThis as typeof globalThis & {
    process?: {
      env?: {
        TARO_APP_API_BASE_URL?: string
        TARO_APP_ORGANIZATION_ID?: string
      }
    }
  }
).process?.env

const config: UserConfigExport = {
  projectName: 'xiaoqiu',
  date: '2026-06-10',
  designWidth: 750,
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,
    828: 1.81 / 2,
  },
  sourceRoot: 'src',
  outputRoot: 'dist',
  plugins: [],
  env: {
    TARO_APP_API_BASE_URL: JSON.stringify(buildEnvironment?.TARO_APP_API_BASE_URL ?? ''),
    TARO_APP_ORGANIZATION_ID: JSON.stringify(buildEnvironment?.TARO_APP_ORGANIZATION_ID ?? ''),
  },
  defineConstants: {},
  copy: {
    patterns: [],
    options: {},
  },
  framework: 'react',
  compiler: {
    type: 'webpack5',
    prebundle: {
      enable: false,
    },
  },
  cache: {
    enable: true,
  },
  mini: {
    postcss: {
      pxtransform: {
        enable: true,
        config: {},
      },
      url: {
        enable: true,
        config: {
          limit: 1024,
        },
      },
      cssModules: {
        enable: false,
        config: {
          namingPattern: 'module',
          generateScopedName: '[name]__[local]___[hash:base64:5]',
        },
      },
    },
  },
  h5: {
    publicPath: '/',
    staticDirectory: 'static',
    htmlPluginOption: {
      favicon: path.resolve(__dirname, '../src/assets/favicon.svg'),
    },
    postcss: {
      autoprefixer: {
        enable: true,
        config: {},
      },
    },
  },
}

export default defineConfig(config)

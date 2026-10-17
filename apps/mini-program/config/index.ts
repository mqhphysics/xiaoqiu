import path from 'node:path'

import { defineConfig, type UserConfigExport } from '@tarojs/cli'

const buildEnvironment = (
  globalThis as typeof globalThis & {
    process?: {
      env?: {
        TARO_ENV?: string
        NODE_ENV?: string
        TARO_APP_API_BASE_URL?: string
        TARO_APP_ORGANIZATION_ID?: string
        TARO_APP_LOCAL_SHORT_PASSWORDS?: string
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
  // Keep WeChat output separate from the running H5 development server.
  outputRoot: buildEnvironment?.TARO_ENV === 'weapp' ? 'dist-weapp' : 'dist',
  plugins: [path.resolve(__dirname, './h5-tab-cache.js')],
  env: {
    TARO_APP_API_BASE_URL: JSON.stringify(
      buildEnvironment?.TARO_APP_API_BASE_URL ?? 'http://127.0.0.1:3001',
    ),
    TARO_APP_ORGANIZATION_ID: JSON.stringify(buildEnvironment?.TARO_APP_ORGANIZATION_ID ?? ''),
    TARO_APP_LOCAL_SHORT_PASSWORDS: JSON.stringify(
      buildEnvironment?.TARO_APP_LOCAL_SHORT_PASSWORDS ?? '0',
    ),
  },
  defineConstants: {},
  copy: {
    // Static-host files (Cloudflare Pages SPA fallback + cache headers); H5 only.
    patterns:
      buildEnvironment?.TARO_ENV === 'weapp'
        ? []
        : [
            { from: 'public/_redirects', to: 'dist/_redirects' },
            { from: 'public/_headers', to: 'dist/_headers' },
          ],
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
    enable: false,
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
    webpackChain(chain) {
      const argv = (globalThis as { process?: { argv?: string[] } }).process?.argv ?? []
      const production = buildEnvironment?.NODE_ENV === 'production' || !argv.includes('--watch')
      if (!production) return
      chain.output.filename('js/[name].[contenthash:8].js')
      chain.output.chunkFilename('chunk/[name].[contenthash:8].js')
      chain.optimization.splitChunks({
        chunks: 'all',
        cacheGroups: {
          default: false,
          defaultVendors: false,
          taro: {
            test: /[\\/]node_modules[\\/]@tarojs[\\/]/,
            name: 'taro',
            priority: 20,
            chunks: 'all',
            reuseExistingChunk: true,
          },
          vendors: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            priority: 10,
            chunks: 'all',
            reuseExistingChunk: true,
          },
          common: {
            minChunks: 2,
            priority: 5,
            chunks: 'async',
            reuseExistingChunk: true,
          },
        },
      })
    },
    miniCssExtractPluginOption: {
      filename: 'css/[name].[contenthash:8].css',
      chunkFilename: 'css/[name].[contenthash:8].css',
    },
    devServer: {
      hot: false,
      host: '127.0.0.1',
      port: 3000,
      open: false,
      static: [
        {
          directory: path.resolve(__dirname, '../../admin-web/dist'),
          publicPath: '/admin/',
        },
      ],
    },
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

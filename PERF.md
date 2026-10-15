# H5 navigation performance

Measured on 2026-10-14 against production builds of `apps/mini-program`, with the Nest API on `127.0.0.1:3001`. Both builds used the same Playwright script (1440×900, student login, ready check limited to `.taro_page:not(.taro_page_shade)`), the same API process, and an uncompressed `Cache-Control: no-cache` static server for the before build so compression and immutable caching are not credited to the old bundle.

`npm run dev:h5` is `taro build --type h5 --watch`. That server is unminified, has no content hashes, and is not what these numbers describe. Production is `npm run build:h5` and then `npm run serve:h5` (`scripts/serve-h5.mjs` on `127.0.0.1:3000`): SPA fallback, Brotli/gzip for text assets, `index.html` `no-cache`, and `public, max-age=31536000, immutable` for `.[hash].js` / `.[hash].css`.

## Initial download

Files referenced by `index.html`:

| | Before | After |
| --- | ---: | ---: |
| JS entry | `js/926.js` 208,856 + `js/app.js` 1,121,758 | `taro` 221,975 + `vendors` 402,245 + `app` 142,067 |
| CSS entry | `css/app.css` 232,451 | `css/app.*.css` 13,109 |
| Entry raw | 1,563,065 | 779,396 |
| Entry gzip | 452,710 | 244,863 |
| Entry Brotli (quality 5, what `serve:h5` sends) | 404,912 | 227,357 |
| Entry Brotli (default) | 356,027 | 206,089 |

The first load transfers about half the bytes. All JS on disk went from 1,805,833 (18 files) to 1,855,829 (33 files). All CSS went from 489,634 to 567,642 because split chunks duplicate some rules. The heaviest async chunk after the split is the overlay bundle, `chunk/515.*.js` at 264,920 bytes (dialogs, emoji, captain and other hosts). `app.js` no longer contains the emoji picker.

## Tab switches

Time is from click until the visible page’s ready node is present and `.data-state--loading` is gone. API counts include media. One run each.

| Step | Before | After | API before | API after |
| --- | ---: | ---: | ---: | ---: |
| 登录→首页 | 321 ms | 327 ms | 9 | 9 |
| 首次 赛程 | 419 ms | 369 ms | 18 | 11 |
| 首次 数据 | 467 ms | 402 ms | 16 | 3 |
| 首次 主队 | 318 ms | 245 ms | 7 | 24 |
| 首次 我的 | 389 ms | 451 ms | 10 | 6 |
| 再次 首页 | 319 ms | 157 ms | 4 | 5 |
| 再次 赛程 | 383 ms | 96 ms | 3 | 1 |
| 再次 数据 | 361 ms | 147 ms | 16 | 1 |
| 再次 主队 | 275 ms | 111 ms | 7 | 1 |
| 再次 我的 | 334 ms | 125 ms | 11 | 1 |
| 比赛详情 | 1,010 ms | 202 ms | 11 | 7 |

Revisit average for the five tabs: 334 ms before, 127 ms after. After all five tabs, the document held five `.taro_page` nodes and four shaded ones. Desktop shell height stayed 900 px with no document scroll. At 390×844 the page scroller is `.taro_page` (`overflow-y: scroll`); scrolling it moved the home content.

## Requests

Before, 赛程 waited on team preferences and then competition data (gaps 113 ms, 124 ms). 数据 repeated team preferences and fetched competition data again (gaps 83 ms, 202 ms). 比赛详情 spent 942 ms before the experience response.

After, the featured tournament id is remembered from home, so 赛程 requests capabilities and competition data together. 数据 then reuses that competition payload and only hits capabilities. 主队 fires home, preferences, follows, and the dashboard together; the extra request count is parallel crest WebP (`?w=96`), and the non-media count dropped from 7 to 5. Revisiting a tab keeps the page mounted and serves fresh GET cache, so the only new call is capabilities.

Logged-in requests still send `Authorization`, so they stay `Cache-Control: private, no-store` and do not 304. The client cache is what makes revisits instant. Anonymous public GETs are `public, max-age=0, must-revalidate` with a strong ETag. JSON responses of at least 1,024 bytes are Brotli or gzip.

## Images

`/api/media/demo/crests/03.png` is 15,035 bytes of PNG with `no-store`. The same file with `?w=96` is 5,110 bytes of WebP with `public, max-age=86400`. Crests, avatars, and feed thumbs request a width bucket and set `width`, `height`, and `loading="lazy"` except the nav crest, which stays eager. Hashed avatars are `public, max-age=31536000, immutable`. Post images stay `no-store`.

# H5 interactions

Patterns from the advanced interaction notes that landed on the campus H5 site. Motion stays under about 300ms, uses the existing campus green, and turns off when `prefers-reduced-motion: reduce` is set.

## Landed

### 2. Drag-to-reorder

主队 → three-line button opens one dialog, 我的关注.

- Search unfocused: followed teams, then followed players. Drag the grip; other rows spring into the gap and the lifted row settles. 上移 / 下移 are the keyboard fallback and use the same settle, or an instant swap when reduced motion is on.
- Search focused: the list becomes recommended teams and players with 关注. Typing searches. The back arrow on the left of the search box returns to the ordered list.
- The plus buttons on 我关注的球队 and 我关注的球员 open the same dialog already focused on search.
- Team membership is saved with the existing preferences API. That API reads teams back in name order, so the chosen order is kept in `localStorage` (`xiaoqiu.follow-order.v1:<userId>`). Player order has no reorder API and uses the same store.
- Drag math lives in `useSpringReorder` (`apps/mini-program/src/components/interactions/use-spring-reorder.h5.ts`). `SpringReorderList` is only the current row chrome.

### 10. Expanding tag selection

- 赛程 and 数据 season/tournament pickers are a single chip row. The selected chip scales to 1.06; neighbours nudge and spring back.
- 赛程 date chips and the 数据 竖版/横版 switch use the same scale and neighbour shift.
- Not applied to the main nav, view toggles, or native selects (球队 / 阶段 / 状态 / 小组).

### 5. Animated text disclosure

Height eases open and the chevron rotates. Short copy has no control.

- 我的 profile bio (already clamped to one line; collapsed height stays one line).
- Player profile bio and the person hero bio, collapsed at three lines only when the text overflows.
- 官方公告 detail body, collapsed at four lines only when it overflows.
- Match detail 比赛快报 (`summary`) and 比赛说明 (`statusReason`), collapsed at two lines only when they overflow.

### 6. Spring stepper

换绑邮箱 1→2. The active node overshoots and settles; the connector fill scales in with a small bounce. No other numbered stepper exists on this branch.

### 3. Staggered bulk selection

队长 大名单 toggles. Checks already in the list cascade in on first paint; a newly selected row pops with a short elastic scale. 身份管理 is a single-choice radio list, so it is unchanged.

### 8. Curved card deletion

- Deleting a comment, or deleting the open post, arcs the card off to the right before it leaves.
- Unfollowing a player from the followed list (empty search in the player picker) does the same, then the row collapses.
- Home feed cards have no delete control, so they are unchanged.

## Skipped

- 1 Radial theme transition: no dark mode.
- 4 Velocity-based slider: no slider of that kind.
- 7 Ripple on related switches: left off on purpose. 只看我的主队 stays a plain switch.
- 9 Stacked card scroll: conflicts with the one-screen pages.
- Main navigation: no expanding-tag motion.

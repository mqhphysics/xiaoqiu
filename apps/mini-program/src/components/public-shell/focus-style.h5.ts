/**
 * Site-wide soft focus for text fields: a light green border and halo instead of the dark
 * near-black outline. Injected as raw CSS because Taro's stylesheet transform rewrites bare
 * `input`/`textarea` selectors. Buttons keep their own :focus-visible rings for keyboard users.
 */
const FIELDS =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="color"]), textarea, select'

export function mountSoftFocus(): () => void {
  const style = document.createElement('style')
  style.dataset.xqSoftFocus = ''
  style.textContent = `
    html :is(${FIELDS}):focus, html :is(${FIELDS}):focus-visible {
      outline: none !important;
    }
    html :is(${FIELDS}):focus:not([data-xq-bare]) {
      border-color: #9cc4a6 !important;
    }
    html :is(${FIELDS}) { transition: border-color 160ms ease, box-shadow 160ms ease; }
  `
  document.head.append(style)
  return () => style.remove()
}

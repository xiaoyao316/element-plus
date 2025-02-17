import { isClient } from '@vueuse/core'
import { on } from '@element-plus/utils/dom'

import type {
  ComponentPublicInstance,
  DirectiveBinding,
  ObjectDirective,
} from 'vue'
import type { Nullable } from '@element-plus/utils/types'

type DocumentHandler = <T extends MouseEvent>(mouseup: T, mousedown: T) => void
type FlushList = Map<
  HTMLElement,
  {
    documentHandler: DocumentHandler
    bindingFn: (...args: unknown[]) => unknown
  }[]
>

const nodeList: FlushList = new Map()

let startClick: MouseEvent

if (isClient) {
  on(document, 'mousedown', (e: MouseEvent) => (startClick = e))
  on(document, 'mouseup', (e: MouseEvent) => {
    for (const handlers of nodeList.values()) {
      for (const { documentHandler } of handlers) {
        documentHandler(e, startClick)
      }
    }
  })
}

function createDocumentHandler(
  el: HTMLElement,
  binding: DirectiveBinding
): DocumentHandler {
  // 通过参数设置排除 dom
  let excludes: HTMLElement[] = []
  if (Array.isArray(binding.arg)) {
    excludes = binding.arg
  } else if ((binding.arg as unknown) instanceof HTMLElement) {
    // due to current implementation on binding type is wrong the type casting is necessary here
    excludes.push(binding.arg as unknown as HTMLElement)
  }
  return function (mouseup, mousedown) {
    const popperRef = (
      binding.instance as ComponentPublicInstance<{
        popperRef: Nullable<HTMLElement>
      }>
    ).popperRef

    const mouseUpTarget = mouseup.target as Node
    const mouseDownTarget = mousedown?.target as Node
    const isBound = !binding || !binding.instance // 有绑定且有实例
    const isTargetExists = !mouseUpTarget || !mouseDownTarget

    // 是否是 el 内部元素
    const isContainedByEl =
      el.contains(mouseUpTarget) || el.contains(mouseDownTarget)
    // 是否是 el 自己
    const isSelf = el === mouseUpTarget

    // 是否被排除
    const isTargetExcluded =
      (excludes.length &&
        excludes.some((item) => item?.contains(mouseUpTarget))) ||
      (excludes.length && excludes.includes(mouseDownTarget as HTMLElement))

    // 是否是 popper 内部元素
    const isContainedByPopper =
      popperRef &&
      (popperRef.contains(mouseUpTarget) || popperRef.contains(mouseDownTarget))

    if (
      isBound ||
      isTargetExists ||
      isContainedByEl ||
      isSelf ||
      isTargetExcluded ||
      isContainedByPopper
    ) {
      return
    }

    // 以上都不满足，就说明是 click outside, 执行回调
    binding.value(mouseup, mousedown)
  }
}

const ClickOutside: ObjectDirective = {
  beforeMount(el: HTMLElement, binding: DirectiveBinding) {
    // there could be multiple handlers on the element
    if (!nodeList.has(el)) {
      nodeList.set(el, [])
    }

    // v-click-outside:[popperPaneRef]="hideFilterPanel" binding.value 即 hideFilterPanel 回调函数
    nodeList.get(el).push({
      documentHandler: createDocumentHandler(el, binding),
      bindingFn: binding.value,
    })
  },
  updated(el: HTMLElement, binding: DirectiveBinding) {
    if (!nodeList.has(el)) {
      nodeList.set(el, [])
    }

    const handlers = nodeList.get(el)
    const oldHandlerIndex = handlers.findIndex(
      (item) => item.bindingFn === binding.oldValue
    )
    const newHandler = {
      documentHandler: createDocumentHandler(el, binding),
      bindingFn: binding.value,
    }

    // 更新时，如果存在旧的处理就替换更新，否则就加进去
    if (oldHandlerIndex >= 0) {
      // replace the old handler to the new handler
      handlers.splice(oldHandlerIndex, 1, newHandler)
    } else {
      handlers.push(newHandler)
    }
  },
  unmounted(el: HTMLElement) {
    // remove all listeners when a component unmounted
    nodeList.delete(el)
  },
}

export default ClickOutside

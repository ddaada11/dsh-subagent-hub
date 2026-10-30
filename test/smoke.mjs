/**
 * Throwaway smoke test: load the client bundle with a mini React + fake DOM,
 * render the hub button, click it open, refresh, and assert the panel content.
 * Run with: node .smoke.mjs
 */
import fs from 'node:fs'
import vm from 'node:vm'

const SRC = new URL('../lib/client.js', import.meta.url)
const source = fs.readFileSync(SRC, 'utf8')

// ---- mini React -----------------------------------------------------------
const slots = []
let cursor = 0
let dirty = false

const React = {
  createElement(type, props, ...children) {
    const flat = children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false)
    // 组件（Field/Area/Btn）就地展开，等价于 React 调用函数组件；它们不使用 hook
    if (typeof type === 'function') return type(Object.assign({}, props ?? {}, { children: flat }))
    return { type, props: props ?? {}, children: flat }
  },
  useState(initial) {
    const i = cursor++
    if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial
    return [slots[i], (next) => {
      slots[i] = typeof next === 'function' ? next(slots[i]) : next
      dirty = true
    }]
  },
  useRef(initial) {
    const i = cursor++
    if (!(i in slots)) slots[i] = { current: initial }
    return slots[i]
  },
  useCallback(fn) { cursor++; return fn },
  useEffect() { cursor++ },
}

// ---- fake browser --------------------------------------------------------
const state = {
  team: { name: 'lead', role: 'lead' },
  members: [
    { id: 's1', name: 'lead', role: 'lead', status: 'running', statusLabel: '运行中', description: '主对话', context: '', model: '' },
    { id: 's2', name: 'research-1', role: 'teammate', status: 'running', statusLabel: '运行中', description: '查资料', context: 'fresh', model: '' },
    { id: 's3', name: 'writer', role: 'teammate', status: 'inactive', statusLabel: '空闲', description: '写稿', context: 'fork', model: '' },
  ],
  tasks: [{ id: '1', revision: 2, subject: '写第一章', description: '', status: 'pending', ownerName: '', ready: true }],
}

const calls = []
const sandbox = {
  console,
  setTimeout,
  setInterval: () => 0,
  clearInterval: () => {},
  fetch: async (url, init) => {
    calls.push({ url, init })
    return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(state)) }
  },
  document: { addEventListener() {}, removeEventListener() {}, querySelector: () => null },
  window: {
    __ModuleLoader__: {
      load(definition) {
        sandbox.__loaded = definition
      },
    },
    localStorage: {
      store: {},
      getItem(key) {
        return key in this.store ? this.store[key] : null
      },
      setItem(key, value) {
        this.store[key] = String(value)
      },
    },
  },
}
sandbox.globalThis = sandbox

const context = vm.createContext(sandbox)
vm.runInContext(source, context, { filename: String(SRC) })

const loaded = sandbox.__loaded
assert(loaded !== undefined, '模块通过 __ModuleLoader__.load 注册')
assert(loaded.id === '@local/dsh-subagent-hub', '工厂 id 等于包名：' + loaded.id)

const required = []
const mod = loaded.factory((id) => {
  required.push(id)
  if (id === 'react') return React
  throw new Error('unexpected require: ' + id)
})
assert(typeof mod.apply === 'function', 'exports.apply 是函数')
assert(Array.isArray(mod.inject) && mod.inject.includes('slots'), 'exports.inject 声明 slots')

let registration = null
const ctx = {
  slots: {
    inject(name, factory) { assert(name === 'conversation.input.left', '注入到 conversation.input.left'); return factory() },
    register(descriptor, component) {
      registration = { descriptor, component }
      return () => {}
    },
  },
}
mod.apply(ctx)
assert(registration !== null, '注册了一个 slot 组件')
assert(registration.descriptor.id === 'subagent-hub', 'slot id = subagent-hub')
assert(registration.descriptor.order === 30, 'order = 30')
const injected = registration.descriptor.inject('sess-1')
assert(injected.sessionId === 'sess-1', 'inject 透传 sessionId')

// ---- render closed -------------------------------------------------------
const inputActions = {
  captureInsertion: () => ({ draftRev: 1 }),
  insertText: (text, span) => {
    inputActions.inserted = text
    return span.draftRev === 1
  },
}
const Hub = registration.component
let tree = render()
assert(flatten(tree).includes('子代理'), '按钮文案「子代理」已渲染')

// ---- open ----------------------------------------------------------------
const trigger = tree.children[0]
trigger.props.onClick()
tree = render()
const texts = flatten(tree)
assert(texts.includes('子智能体'), '面板标题已渲染')
assert(texts.some((text) => text.includes('派生队友')), '派生区块已渲染')
assert(texts.some((text) => text.startsWith('任务板')), '任务板区块已渲染')
assert(texts.includes('写进输入框'), '快捷指令区块已渲染')
assert(tree.children[1] !== undefined, '面板节点已挂载')

// ---- refresh -> members + tasks -----------------------------------------
const head = tree.children[1].children[0]
const refresh = head.children.find((child) => child && child.props && child.props.title === '刷新')
await refresh.props.onClick()
await tick()
tree = render()
const after = flatten(tree)
assert(after.includes('research-1'), '成员列表出现 research-1')
assert(after.includes('writer'), '成员列表出现 writer')
assert(after.includes('写第一章'), '任务板出现任务标题')
assert(after.includes('待办'), '任务状态中文化')
assert(calls.some((c) => String(c.url).includes('/subagent-hub/state?session=sess-1')), '拉取 state 用了正确 URL')

// ---- quick instruction inserts into composer ----------------------------
const quickSection = findButton(tree, '列出队友')
assert(quickSection !== undefined, '找到快捷指令按钮')
quickSection.props.onClick()
assert(typeof inputActions.inserted === 'string' && inputActions.inserted.includes('list_agents'), '指令已插入输入框')

// ---- presets fill the spawn form ----------------------------------------
tree = render() // 快捷指令插入后面板已关闭，先同步渲染，再点开
tree.children[0].props.onClick()
tree = render()
const preset = findButton(tree, '调研员')
assert(preset !== undefined, '派生模板按钮「调研员」已渲染')
preset.props.onClick()
tree = render()
const nameInput = findNode(tree, 'input')
assert(nameInput !== undefined && nameInput.props.value === 'research', '套用模板后名字填入 research')
const promptArea = findNode(tree, 'textarea')
assert(promptArea !== undefined && String(promptArea.props.value).includes('【要查清的问题】'), '套用模板后任务正文已填入')
assert(flatten(tree).some((text) => text.includes('已套用模板')), '套用模板有提示')

// ---- save the current form as a reusable preset --------------------------
const saveBtn = findButton(tree, '存为模板')
assert(saveBtn !== undefined, '找到「存为模板」按钮')
saveBtn.props.onClick()
tree = render()
const stored = sandbox.window.localStorage.getItem('dsh-subagent-hub.presets')
assert(typeof stored === 'string' && stored.includes('research'), '自定义模板已写入 localStorage')
assert(flatten(tree).some((text) => text.includes('已存为模板')), '存模板有提示')

// ---- 内置模板可以隐藏，也能恢复 ------------------------------------------
tree = render()
const builtinChip = findButton(tree, '调研员')
assert(builtinChip !== undefined, '内置模板「调研员」在列表里')
const chipX = (builtinChip.children ?? []).find((child) => child && child.type === 'span')
assert(chipX !== undefined, '内置模板也带 × 入口')
chipX.props.onClick({ stopPropagation() {} })
tree = render()
assert(findButton(tree, '调研员') === undefined, '隐藏后内置模板不再显示')
assert(String(sandbox.window.localStorage.getItem('dsh-subagent-hub.hidden-presets')).includes('spawn:research'), '隐藏状态写入 localStorage')
assert(flatten(tree).some((text) => text.includes('已隐藏内置模板')), '隐藏有提示')
const restoreBtn = findButton(tree, '恢复隐藏 1')
assert(restoreBtn !== undefined, '出现「恢复隐藏」按钮')
restoreBtn.props.onClick()
tree = render()
assert(findButton(tree, '调研员') !== undefined, '恢复后内置模板回来了')
assert(sandbox.window.localStorage.getItem('dsh-subagent-hub.hidden-presets') === '[]', '恢复后隐藏列表清空')

// ---- 任务板模板 ----------------------------------------------------------
const taskChip = findButton(tree, '修 Bug')
assert(taskChip !== undefined, '任务模板「修 Bug」已渲染')
taskChip.props.onClick()
tree = render()
assert(findAllNodes(tree, 'input').some((node) => node.props.value === '修复：'), '点任务模板后标题填入「修复：」')
assert(flatten(tree).some((text) => text.includes('已套用任务模板')), '任务模板有提示')
const taskSave = findButtons(tree, '存为模板')[1]
assert(taskSave !== undefined, '任务表单也有「存为模板」')
taskSave.props.onClick()
tree = render()
assert(String(sandbox.window.localStorage.getItem('dsh-subagent-hub.task-presets')).includes('修复：'), '任务模板写入 localStorage')

// ---- 版本角标与两条模板条 ------------------------------------------------
assert(flatten(tree).some((text) => text === 'v0.3.0'), '面板显示版本角标 v0.3.0')
assert(flatten(tree).filter((text) => text === '模板').length === 2, '派生表单和任务表单各有一条「模板」标签')

console.log('\n全部断言通过 ✅')

// ---- helpers -------------------------------------------------------------
function render() {
  cursor = 0
  dirty = false
  const element = Hub({ sessionId: 'sess-1', inputActions })
  return element
}

function flatten(node, out = []) {
  if (node === null || node === undefined) return out
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  for (const child of node.children ?? []) flatten(child, out)
  return out
}

function findButton(node, label) {
  if (node === null || typeof node !== 'object') return undefined
  if (node.type === 'button' && flatten(node).includes(label)) return node
  for (const child of node.children ?? []) {
    const hit = findButton(child, label)
    if (hit !== undefined) return hit
  }
  return undefined
}

function findButtons(node, label, out = []) {
  if (node === null || typeof node !== 'object') return out
  if (node.type === 'button' && flatten(node).includes(label)) out.push(node)
  for (const child of node.children ?? []) findButtons(child, label, out)
  return out
}

function findAllNodes(node, type, out = []) {
  if (node === null || typeof node !== 'object') return out
  if (node.type === type) out.push(node)
  for (const child of node.children ?? []) findAllNodes(child, type, out)
  return out
}

function findNode(node, type) {
  if (node === null || typeof node !== 'object') return undefined
  if (node.type === type) return node
  for (const child of node.children ?? []) {
    const hit = findNode(child, type)
    if (hit !== undefined) return hit
  }
  return undefined
}

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function assert(condition, label) {
  if (!condition) {
    console.error('FAIL: ' + label)
    process.exit(1)
  }
  console.log('ok - ' + label)
}

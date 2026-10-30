window.__ModuleLoader__.load({
  id: '@local/dsh-subagent-hub',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useRef, useState } = React

    const BG = 'var(--dsw-alias-bg-module-platform, #1f1f22)'
    const BORDER = 'var(--dsw-alias-border-l, #3a3a3f)'
    const TEXT = 'var(--dsw-alias-label-primary, #e8e8ea)'
    const SUB = 'var(--dsw-alias-label-tertiary, #8b8b93)'
    const ACCENT = 'var(--dsw-alias-state-business-primary, #4c8dff)'
    const DANGER = 'var(--dsw-alias-state-error-primary, #e5484d)'
    const WARN = 'var(--dsw-alias-state-warning-primary, #d19a1f)'

    const BASE = '/subagent-hub'
    const POLL_MS = 4000

    const DOT = { running: ACCENT, provisioning: WARN, failed: DANGER, inactive: '#6b6b73' }
    const TASK_LABEL = { pending: '待办', in_progress: '进行中', completed: '已完成' }

    /** Instructions for the model-side subagent tools the Host cannot call itself. */
    const QUICK = [
      ['列出队友', '列出当前团队成员和任务板（list_agents + team_task_list），说明谁在运行、谁空闲、有哪些待办。'],
      ['等它们收工', '先用 list_agents 确认还有成员在运行或创建中，再用 wait_agent 等待，直到没有正在运行的成员；然后汇总每个队友的产出。'],
      ['Fork 本对话', '用 subagent_fork 派生一个继承当前对话上下文的子代理，任务是：'],
      ['并行工作流', '用 workflow 把下面的工作拆给多个子代理并行执行，最后汇总结果：'],
      ['Ralph 循环', '用 ralph 以这个固定目标反复迭代直到完成：'],
      ['汇总报告', '汇总所有队友的产出，写成一份结构化报告，并列出仍未解决的问题。'],
    ]

    /** 派生模板：点一下就把名字 / 职责 / 任务填进表单，改完方括号再派生。 */
    const PRESETS = [
      {
        name: 'research',
        label: '调研员',
        description: '查资料并给出带出处的结论',
        context: 'fresh',
        prompt: '目标：【要查清的问题】\n做法：\n1. 用可用检索工具收集一手来源，至少 3 个不同来源互相印证；\n2. 每条结论后面标出处（链接或文档名）；\n3. 单独列出仍然无法确认或有分歧的点。\n交付：中文结论摘要 + 证据链，不要复述原始材料。',
      },
      {
        name: 'reviewer',
        label: '代码审查',
        description: '只读审查改动，按严重度列问题',
        context: 'fork',
        prompt: '任务：审查当前工作区最近的改动（git status / git diff）。\n要求：\n1. 只读，不要修改任何文件；\n2. 每条问题给出 文件:行号、问题、为什么是问题、建议改法；\n3. 按 阻断 / 应该修 / 可选 三档排序；\n4. 没发现问题就明确说没发现，不要凑数。',
      },
      {
        name: 'tester',
        label: '测试',
        description: '补测试并跑通，贴真实输出',
        context: 'fresh',
        prompt: '任务：为【目标模块或文件】补测试。\n要求：\n1. 先读现有测试，沿用同样的框架和目录约定，不要引入新框架；\n2. 覆盖正常路径 + 边界 + 失败路径；\n3. 真的跑一遍测试命令，把原始输出贴出来；\n4. 测试文件放在项目约定的位置。',
      },
      {
        name: 'builder',
        label: '实施',
        description: '按既定方案改代码，范围收窄',
        context: 'fresh',
        prompt: '任务：实现【具体改动】，范围限定在【文件或目录】。\n要求：\n1. 先读相关代码再动手，沿用现有模式，不新增技术栈；\n2. 只改与任务相关的文件；\n3. 每完成一块就自检（类型检查 / 测试）；\n4. 最后说明改了什么、为什么、怎么验证。',
      },
      {
        name: 'writer',
        label: '文档',
        description: '把结论写成可直接交付的文档',
        context: 'fresh',
        prompt: '任务：把【材料或改动】写成文档。\n要求：\n1. 面向【读者：新手 / 维护者 / 决策者】；\n2. 结构：一句话结论 → 用法与步骤 → 注意事项 → 常见问题；\n3. 命令、路径、代码放代码块，能直接复制；\n4. 不写空话，每段都要有信息量。',
      },
      {
        name: 'critic',
        label: '反方评审',
        description: '专门挑毛病，给反例与风险',
        context: 'fork',
        prompt: '角色：反方评审。目标是找出【方案或改动】会怎么失败。\n要求：\n1. 列出至少 5 个具体失败场景，每个给出触发条件和后果；\n2. 指出所有假设里最脆弱的一条；\n3. 给出一个能证伪它的最小实验；\n4. 每条都要能落到证据，不为了反对而反对。',
      },
    ]

    /** 任务板模板：点一下把标题和细节填进建任务表单。 */
    const TASK_PRESETS = [
      { label: '实现', subject: '实现：', description: '要做什么 / 边界在哪 / 怎么算做完' },
      { label: '修 Bug', subject: '修复：', description: '现象、复现步骤、期望行为、影响范围' },
      { label: '调研', subject: '调研：', description: '要回答的问题、需要的来源、结论形式' },
      { label: '评审', subject: '评审：', description: '评审对象、关注点（正确性 / 性能 / 可读性）、产出形式' },
      { label: '文档', subject: '文档：', description: '写给谁、覆盖哪些内容、放在哪个文件' },
      { label: '发布检查', subject: '发布检查：', description: '版本号、数据迁移、回滚方案、验证清单' },
    ]

    const PRESET_KEY = 'dsh-subagent-hub.presets'
    const TASK_KEY = 'dsh-subagent-hub.task-presets'
    const HIDDEN_KEY = 'dsh-subagent-hub.hidden-presets'

    /** 面板角标：刷新后先看这里，版本对不上就是浏览器还在用旧的客户端包。 */
    const VERSION = '0.3.0'

    function readList(key) {
      try {
        const raw = window.localStorage.getItem(key)
        const list = raw === null ? [] : JSON.parse(raw)
        return Array.isArray(list) ? list.filter((item) => item && typeof item === 'object') : []
      } catch {
        return []
      }
    }

    function writeList(key, list) {
      try {
        window.localStorage.setItem(key, JSON.stringify(list))
      } catch {
        // 存不进本地就只在本次会话里生效
      }
    }

    function loadSpawnPresets() {
      return readList(PRESET_KEY).filter((item) => typeof item.name === 'string' && item.name !== '' && typeof item.prompt === 'string')
    }

    function loadTaskPresets() {
      return readList(TASK_KEY).filter((item) => typeof item.subject === 'string' && item.subject !== '')
    }

    /** 被隐藏的内置模板，键形如 spawn:research、task:实现：。 */
    function loadHidden() {
      try {
        const raw = window.localStorage.getItem(HIDDEN_KEY)
        const list = raw === null ? [] : JSON.parse(raw)
        return Array.isArray(list) ? list.filter((item) => typeof item === 'string') : []
      } catch {
        return []
      }
    }

    /** One same-origin JSON call against the Host half. */
    async function call(path, init) {
      const response = await fetch(BASE + path, Object.assign({
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
      }, init))
      let payload = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }
      if (payload && typeof payload.error === 'string' && payload.error !== '') {
        throw new Error(payload.error)
      }
      if (!response.ok) throw new Error('HTTP ' + response.status)
      return payload
    }

    const S = {
      wrap: { position: 'relative', display: 'inline-flex', alignItems: 'center' },
      trigger: {
        display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px',
        borderRadius: 999, border: '1px solid ' + BORDER, background: 'transparent', color: TEXT,
        fontSize: 12, lineHeight: '26px', cursor: 'pointer', whiteSpace: 'nowrap',
      },
      triggerOn: { borderColor: ACCENT, color: ACCENT },
      glyph: { fontSize: 13, lineHeight: '1' },
      badge: {
        minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: ACCENT,
        color: '#fff', fontSize: 10, lineHeight: '16px', textAlign: 'center',
      },
      panel: {
        position: 'absolute', left: 0, bottom: 'calc(100% + 8px)', width: 396, maxHeight: '68vh',
        overflowY: 'auto', boxSizing: 'border-box', padding: '10px 12px 12px', background: BG,
        border: '1px solid ' + BORDER, borderRadius: 12, boxShadow: '0 16px 40px rgba(0,0,0,.45)',
        color: TEXT, fontSize: 12, zIndex: 60,
      },
      head: { display: 'flex', alignItems: 'center', gap: 8 },
      title: { fontSize: 13 },
      ver: { color: SUB, fontSize: 10, marginRight: 2 },
      chipLabel: { color: SUB, fontSize: 11, alignSelf: 'center', marginRight: 2 },
      count: { flex: 1, color: SUB, fontSize: 11 },
      icon: {
        width: 22, height: 22, borderRadius: 6, border: '1px solid ' + BORDER, background: 'transparent',
        color: SUB, cursor: 'pointer', fontSize: 12, lineHeight: '18px',
      },
      sec: { margin: '12px 0 4px', fontSize: 11, letterSpacing: '.06em', color: SUB },
      row: { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0', borderTop: '1px solid ' + BORDER },
      dot: { width: 7, height: 7, borderRadius: 4, flex: '0 0 auto' },
      name: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11.5, whiteSpace: 'nowrap' },
      state: { color: SUB, fontSize: 11, whiteSpace: 'nowrap' },
      desc: { flex: 1, minWidth: 0, color: SUB, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      mini: {
        height: 20, padding: '0 6px', borderRadius: 5, border: '1px solid ' + BORDER, background: 'transparent',
        color: TEXT, fontSize: 11, cursor: 'pointer', lineHeight: '18px',
      },
      miniDanger: { color: DANGER, borderColor: DANGER },
      hint: { color: SUB, fontSize: 11, padding: '2px 0 4px' },
      box: { margin: '6px 0 2px', padding: 8, borderRadius: 8, border: '1px solid ' + BORDER, background: 'rgba(127,127,127,.07)' },
      boxHead: { color: SUB, fontSize: 11, marginBottom: 6 },
      input: {
        width: '100%', boxSizing: 'border-box', height: 26, padding: '0 8px', borderRadius: 7,
        border: '1px solid ' + BORDER, background: 'transparent', color: TEXT, fontSize: 11.5, outline: 'none',
      },
      area: {
        width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: 7,
        border: '1px solid ' + BORDER, background: 'transparent', color: TEXT, fontSize: 11.5,
        outline: 'none', resize: 'vertical', fontFamily: 'inherit',
      },
      form: { display: 'flex', flexDirection: 'column', gap: 6 },
      actions: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 },
      spacer: { flex: 1 },
      btn: {
        height: 24, padding: '0 10px', borderRadius: 6, border: '1px solid ' + BORDER,
        background: 'transparent', color: TEXT, fontSize: 11.5, cursor: 'pointer', lineHeight: '22px',
      },
      btnPrimary: { borderColor: ACCENT, background: ACCENT, color: '#fff' },
      btnOff: { opacity: 0.5, cursor: 'default' },
      chips: { display: 'flex', flexWrap: 'wrap', gap: 6 },
      chip: {
        height: 22, padding: '0 8px', borderRadius: 11, border: '1px solid ' + BORDER,
        background: 'transparent', color: SUB, fontSize: 11, cursor: 'pointer', lineHeight: '20px',
      },
      chipOn: { borderColor: ACCENT, color: ACCENT },
      chipX: { marginLeft: 4, color: DANGER, fontSize: 11 },
      chipRestore: { borderStyle: 'dashed' },
      err: {
        marginTop: 8, padding: '6px 8px', borderRadius: 7, border: '1px solid ' + DANGER,
        color: DANGER, fontSize: 11, lineHeight: 1.5, whiteSpace: 'pre-wrap',
      },
      note: { marginTop: 8, padding: '6px 8px', borderRadius: 7, border: '1px solid ' + ACCENT, color: ACCENT, fontSize: 11 },
    }

    function Field(props) {
      return h('input', {
        value: props.value,
        placeholder: props.placeholder,
        spellCheck: false,
        onChange: (event) => props.onChange(event.target.value),
        style: S.input,
      })
    }

    function Area(props) {
      return h('textarea', {
        value: props.value,
        placeholder: props.placeholder,
        spellCheck: false,
        rows: props.rows ?? 3,
        onChange: (event) => props.onChange(event.target.value),
        style: S.area,
      })
    }

    function Btn(props) {
      const style = Object.assign({}, S.btn, props.primary === true ? S.btnPrimary : null, props.disabled === true ? S.btnOff : null)
      return h('button', {
        type: 'button',
        style,
        disabled: props.disabled === true,
        onClick: props.onClick,
        title: props.title,
      }, props.label)
    }

    function Hub(props) {
      const sessionId = typeof props.sessionId === 'string' ? props.sessionId : ''
      const inputActions = props.inputActions
      const [open, setOpen] = useState(false)
      const [data, setData] = useState(null)
      const [err, setErr] = useState('')
      const [note, setNote] = useState('')
      const [busy, setBusy] = useState(false)
      const [form, setForm] = useState({ name: '', description: '', prompt: '', context: 'fresh' })
      const [msgTo, setMsgTo] = useState('')
      const [msgText, setMsgText] = useState('')
      const [draft, setDraft] = useState({ subject: '', description: '' })
      const [custom, setCustom] = useState(loadSpawnPresets)
      const [taskCustom, setTaskCustom] = useState(loadTaskPresets)
      const [hidden, setHidden] = useState(loadHidden)
      const rootRef = useRef(null)

      const load = useCallback(async () => {
        if (sessionId === '') return
        try {
          setData(await call('/state?session=' + encodeURIComponent(sessionId)))
          setErr('')
        } catch (error) {
          setErr(String(error && error.message ? error.message : error))
        }
      }, [sessionId])

      useEffect(() => {
        if (!open) return undefined
        load()
        const timer = setInterval(load, POLL_MS)
        return () => clearInterval(timer)
      }, [open, load])

      useEffect(() => {
        if (!open) return undefined
        const onDown = (event) => {
          const root = rootRef.current
          if (root && !root.contains(event.target)) setOpen(false)
        }
        const onKey = (event) => {
          if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('mousedown', onDown, true)
        document.addEventListener('keydown', onKey, true)
        return () => {
          document.removeEventListener('mousedown', onDown, true)
          document.removeEventListener('keydown', onKey, true)
        }
      }, [open])

      const post = useCallback(async (path, body) => {
        setBusy(true)
        setErr('')
        setNote('')
        try {
          const result = await call(path, { method: 'POST', body: JSON.stringify(Object.assign({ sessionId }, body)) })
          await load()
          return result
        } catch (error) {
          setErr(String(error && error.message ? error.message : error))
          return null
        } finally {
          setBusy(false)
        }
      }, [sessionId, load])

      const insert = useCallback((text) => {
        if (!inputActions || typeof inputActions.captureInsertion !== 'function' || typeof inputActions.insertText !== 'function') {
          setErr('输入框接口不可用，请手动复制这条指令。')
          return
        }
        const span = inputActions.captureInsertion()
        const done = span && typeof span.draftRev === 'number' && inputActions.insertText(text, span) === true
        if (!done) {
          setErr('插入输入框失败，再点一次。')
          return
        }
        setErr('')
        setOpen(false)
        setTimeout(() => {
          const box = document.querySelector('[data-composer-card] textarea')
          if (box && typeof box.focus === 'function') box.focus()
        }, 30)
      }, [inputActions])

      const members = (data && data.members) || []
      const tasks = (data && data.tasks) || []
      const teammates = members.filter((member) => member.role === 'teammate')
      const running = members.filter((member) => member.status === 'running' || member.status === 'provisioning').length
      const pending = tasks.filter((task) => task.status !== 'completed').length

      const head = h('div', { style: S.head },
        h('strong', { style: S.title }, '子智能体'),
        h('span', { style: S.ver, title: '面板版本' }, 'v' + VERSION),
        h('span', { style: S.count }, data === null ? '读取中…' : members.length + ' 名成员 · ' + pending + ' 项待办'),
        h('button', { type: 'button', style: S.icon, title: '刷新', onClick: load }, '↻'),
        h('button', { type: 'button', style: S.icon, title: '关闭', onClick: () => setOpen(false) }, '×'))

      const memberRows = teammates.length === 0
        ? h('div', { style: S.hint }, data === null ? '' : '还没有队友，用下面的表单派生第一个。')
        : teammates.map((member) => h('div', { key: member.name, style: S.row },
          h('span', { style: Object.assign({}, S.dot, { background: DOT[member.status] || SUB }) }),
          h('span', { style: S.name }, member.name),
          h('span', { style: S.state }, member.statusLabel),
          h('span', { style: S.desc, title: member.description }, member.description),
          h('button', {
            type: 'button',
            style: S.mini,
            onClick: () => {
              setMsgTo(msgTo === member.name ? '' : member.name)
              setMsgText('')
            },
          }, '说'),
          member.status === 'running'
            ? h('button', {
              type: 'button',
              style: Object.assign({}, S.mini, S.miniDanger),
              onClick: async () => {
                const result = await post('/interrupt', { target: member.name })
                if (result) setNote('已打断 ' + member.name + '（之前是' + result.previousStatus + '）')
              },
            }, '停')
            : null))

      const msgBox = msgTo === '' ? null : h('div', { style: S.box },
        h('div', { style: S.boxHead }, '发给 ' + msgTo),
        h(Area, { value: msgText, onChange: setMsgText, rows: 3, placeholder: '消息内容（对方在跑就在最近一步收到；空闲则直接唤醒它）' }),
        h('div', { style: S.actions },
          h(Btn, {
            label: busy ? '发送中…' : '发送',
            primary: true,
            disabled: busy || msgText.trim() === '',
            onClick: async () => {
              const result = await post('/message', { target: msgTo, text: msgText })
              if (result) {
                setNote('已投递给 ' + msgTo)
                setMsgText('')
              }
            },
          }),
          h(Btn, { label: '取消', onClick: () => { setMsgTo(''); setMsgText('') } })))

      const applyPreset = useCallback((preset) => {
        const taken = new Set(members.map((member) => member.name))
        let name = preset.name
        let index = 2
        while (taken.has(name)) {
          name = preset.name + '-' + index
          index += 1
        }
        setForm({ name, description: preset.description, prompt: preset.prompt, context: preset.context === 'fork' ? 'fork' : 'fresh' })
        setErr('')
        setNote('已套用模板：' + preset.label + '，把方括号里的内容改掉再派生。')
      }, [members])

      const hidePreset = useCallback((key, label) => {
        if (hidden.indexOf(key) !== -1) return
        const next = hidden.concat([key])
        writeList(HIDDEN_KEY, next)
        setHidden(next)
        setNote('已隐藏内置模板「' + label + '」，点「恢复隐藏」找回。')
      }, [hidden])

      /** 该组有隐藏项时，在模板条尾部补一个「恢复隐藏」。 */
      const withRestore = (chips, prefix) => {
        const keys = hidden.filter((key) => key.indexOf(prefix) === 0)
        if (keys.length === 0) return chips
        return chips.concat([h('button', {
          type: 'button',
          style: Object.assign({}, S.chip, S.chipRestore),
          title: '把隐藏的内置模板全部放回来',
          onClick: () => {
            const next = hidden.filter((key) => key.indexOf(prefix) !== 0)
            writeList(HIDDEN_KEY, next)
            setHidden(next)
            setNote('已恢复全部内置模板。')
          },
        }, '恢复隐藏 ' + keys.length)])
      }

      const spawnPresets = PRESETS
        .filter((preset) => hidden.indexOf('spawn:' + preset.name) === -1)
        .map((preset) => Object.assign({}, preset, { custom: false, key: 'spawn:' + preset.name }))
        .concat(custom.map((preset) => Object.assign({}, preset, { custom: true, key: 'spawn:' + preset.name })))

      const presetChips = spawnPresets.map((preset) => h('button', {
        key: preset.key,
        type: 'button',
        style: S.chip,
        title: preset.description + '｜点击填入表单',
        onClick: () => applyPreset(preset),
      }, preset.label, h('span', {
        style: S.chipX,
        title: preset.custom === true ? '删除这个模板' : '隐藏这个内置模板',
        onClick: (event) => {
          event.stopPropagation()
          if (preset.custom !== true) {
            hidePreset(preset.key, preset.label)
            return
          }
          const next = custom.filter((item) => item.name !== preset.name)
          writeList(PRESET_KEY, next)
          setCustom(next)
          setNote('已删除模板：' + preset.label)
        },
      }, '×')))

      const presetRow = h('div', { style: S.chips },
        h('span', { style: S.chipLabel }, '模板'),
        withRestore(presetChips, 'spawn:'))

      const spawnForm = h('div', { style: S.form },
        presetRow,
        h(Field, { value: form.name, placeholder: '名字：research-2（小写字母 / 数字 / 连字符）', onChange: (value) => setForm(Object.assign({}, form, { name: value })) }),
        h(Field, { value: form.description, placeholder: '职责一句话：查资料并给出结论', onChange: (value) => setForm(Object.assign({}, form, { description: value })) }),
        h(Area, { value: form.prompt, rows: 3, placeholder: '完整任务：目标、输入、验收标准', onChange: (value) => setForm(Object.assign({}, form, { prompt: value })) }),
        h('div', { style: S.chips },
          h('button', {
            type: 'button',
            style: Object.assign({}, S.chip, form.context === 'fresh' ? S.chipOn : null),
            onClick: () => setForm(Object.assign({}, form, { context: 'fresh' })),
          }, 'fresh 空上下文'),
          h('button', {
            type: 'button',
            style: Object.assign({}, S.chip, form.context === 'fork' ? S.chipOn : null),
            onClick: () => setForm(Object.assign({}, form, { context: 'fork' })),
          }, 'fork 继承本对话')),
        h('div', { style: S.actions },
          h('span', { style: S.spacer }),
          h(Btn, {
            label: '存为模板',
            disabled: busy || form.name.trim() === '' || form.prompt.trim() === '',
            title: '把当前表单存成本地模板（只存这台机器的浏览器里）',
            onClick: () => {
              const name = form.name.trim()
              const description = form.description.trim()
              const entry = {
                name,
                label: description === '' ? name : description.slice(0, 10),
                description,
                prompt: form.prompt,
                context: form.context,
              }
              const next = custom.filter((item) => item.name !== name).concat([entry])
              writeList(PRESET_KEY, next)
              setCustom(next)
              setNote('已存为模板：' + entry.label)
            },
          }),
          h(Btn, {
            label: busy ? '派生中…' : '派生队友',
            primary: true,
            disabled: busy || form.name.trim() === '' || form.prompt.trim() === '',
            onClick: async () => {
              const result = await post('/spawn', form)
              if (result && result.member) {
                setNote('已派生 ' + result.member.name + '（' + result.member.status + '）')
                setForm(Object.assign({}, form, { name: '', description: '', prompt: '' }))
              }
            },
          })))

      const taskRows = tasks.length === 0
        ? h('div', { style: S.hint }, data === null ? '' : '任务板是空的。')
        : tasks.map((task) => h('div', { key: task.id, style: S.row },
          h('span', { style: S.name }, '#' + task.id),
          h('span', { style: S.desc, title: task.subject }, task.subject),
          h('span', { style: S.state }, TASK_LABEL[task.status] || task.status),
          h('span', { style: S.state }, task.ownerName === '' ? (task.ready ? '可认领' : '被阻塞') : task.ownerName),
          task.status === 'completed'
            ? h('button', {
              type: 'button',
              style: S.mini,
              onClick: async () => {
                const result = await post('/task/update', { taskId: task.id, expectedRevision: task.revision, action: 'reopen' })
                if (result) setNote('已重开 #' + task.id)
              },
            }, '重开')
            : h('button', {
              type: 'button',
              style: S.mini,
              onClick: async () => {
                const result = await post('/task/update', { taskId: task.id, expectedRevision: task.revision, action: 'complete' })
                if (result) setNote('已完成 #' + task.id)
              },
            }, '完成'),
          h('button', {
            type: 'button',
            style: Object.assign({}, S.mini, S.miniDanger),
            title: '从任务板删除',
            onClick: async () => {
              const result = await post('/task/update', { taskId: task.id, expectedRevision: task.revision, action: 'delete' })
              if (result) setNote('已删除 #' + task.id)
            },
          }, '删')))

      const applyTaskPreset = (preset) => {
        setDraft({ subject: preset.subject, description: preset.description })
        setErr('')
        setNote('已套用任务模板：' + preset.label + '，改成具体内容再建任务。')
      }

      const taskPresets = TASK_PRESETS
        .filter((preset) => hidden.indexOf('task:' + preset.subject) === -1)
        .map((preset) => Object.assign({}, preset, { custom: false, key: 'task:' + preset.subject }))
        .concat(taskCustom.map((preset) => Object.assign({}, preset, { custom: true, key: 'task:' + preset.subject })))

      const taskPresetChips = taskPresets.map((preset) => h('button', {
        key: preset.key,
        type: 'button',
        style: S.chip,
        title: preset.description + '｜点击填入任务',
        onClick: () => applyTaskPreset(preset),
      }, preset.label, h('span', {
        style: S.chipX,
        title: preset.custom === true ? '删除这个模板' : '隐藏这个内置模板',
        onClick: (event) => {
          event.stopPropagation()
          if (preset.custom !== true) {
            hidePreset(preset.key, preset.label)
            return
          }
          const next = taskCustom.filter((item) => item.subject !== preset.subject)
          writeList(TASK_KEY, next)
          setTaskCustom(next)
          setNote('已删除模板：' + preset.label)
        },
      }, '×')))

      const taskPresetRow = h('div', { style: S.chips },
        h('span', { style: S.chipLabel }, '模板'),
        withRestore(taskPresetChips, 'task:'))

      const taskForm = h('div', { style: S.form },
        taskPresetRow,
        h(Field, { value: draft.subject, placeholder: '新任务标题', onChange: (value) => setDraft(Object.assign({}, draft, { subject: value })) }),
        h(Area, { value: draft.description, rows: 2, placeholder: '任务细节与验收标准（可留空）', onChange: (value) => setDraft(Object.assign({}, draft, { description: value })) }),
        h('div', { style: S.actions },
          h('span', { style: S.spacer }),
          h(Btn, {
            label: '存为模板',
            disabled: busy || draft.subject.trim() === '',
            title: '把当前任务存成本地模板（只存这台机器的浏览器里）',
            onClick: () => {
              const subject = draft.subject.trim()
              const entry = { label: subject.slice(0, 10), subject, description: draft.description }
              const next = taskCustom.filter((item) => item.subject !== subject).concat([entry])
              writeList(TASK_KEY, next)
              setTaskCustom(next)
              setNote('已存为任务模板：' + entry.label)
            },
          }),
          h(Btn, {
            label: '建任务',
            disabled: busy || draft.subject.trim() === '',
            onClick: async () => {
              const result = await post('/task', draft)
              if (result && result.task) {
                setNote('已建任务 #' + result.task.id)
                setDraft({ subject: '', description: '' })
              }
            },
          })))

      const quick = h('div', { style: S.chips }, QUICK.map(([label, text]) => h('button', {
        key: label,
        type: 'button',
        style: S.chip,
        title: text,
        onClick: () => insert(text),
      }, label)))

      const panel = !open ? null : h('div', { style: S.panel },
        head,
        err === '' ? null : h('div', { style: S.err }, err),
        note === '' ? null : h('div', { style: S.note }, note),
        h('div', { style: S.sec }, '成员'),
        memberRows,
        msgBox,
        h('div', { style: S.sec }, '派生队友（点模板快速填表）'),
        spawnForm,
        h('div', { style: S.sec }, '任务板（点模板快速填表）'),
        taskRows,
        taskForm,
        h('div', { style: S.sec }, '写进输入框'),
        quick)

      return h('div', { ref: rootRef, style: S.wrap },
        h('button', {
          type: 'button',
          style: Object.assign({}, S.trigger, open ? S.triggerOn : null),
          title: '子智能体：派生队友 / 发消息 / 打断 / 任务板',
          onClick: () => {
            setOpen(!open)
            setErr('')
            setNote('')
          },
        },
          h('span', { style: S.glyph }, '🧩'),
          h('span', null, '子代理'),
          running > 0 ? h('span', { style: S.badge }, String(running)) : null),
        panel)
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
          name: 'conversation.input.left',
          id: 'subagent-hub',
          order: 30,
          inject: (sessionId) => ({ sessionId }),
        }, Hub))
      },
    }
  },
})

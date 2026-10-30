/**
 * Host face of the subagent hub.
 *
 * The composer panel is a browser artifact and the Agent Teams runtime only
 * answers on the Host, so every panel action travels over this small same-origin
 * route. Nothing here bypasses a service: the routes are thin wrappers over
 * `agentTeams` (roster, spawn, message, interrupt, task board) with the caller
 * being the live Agent of the session the panel belongs to.
 *
 * @module dsh-subagent-hub/api
 */
import { readJson, sendJson } from './http.js'

/** Statuses a teammate can report. */
const STATUS_LABEL = {
  running: '运行中',
  inactive: '空闲',
  provisioning: '创建中',
  failed: '失败',
}

/**
 * Resolve the live Agent of one session together with its Team membership.
 * @param {object} ctx plugin context
 * @param {unknown} sessionId
 * @returns {{ agent: object, teams: object, membership: object } | { error: string }}
 */
function resolve(ctx, sessionId) {
  const agents = ctx.get('agents')
  const teams = ctx.get('agentTeams')
  if (agents === undefined || teams === undefined) {
    return { error: '当前组合没有启用 Agent Teams（agentTeams / agents 服务不可用）' }
  }

  const id = typeof sessionId === 'string' ? sessionId.trim() : ''
  // The slot always passes its session id; fall back to the only Lead when it
  // is missing so a panel mounted without one still has an owner.
  const agent = id === '' ? soleLead(agents, teams) : agents.get(id)
  if (agent === undefined) {
    return {
      error: id === ''
        ? '缺少会话 id，且当前不止一个 Agent Team，无法确定面板归属'
        : '这个会话当前没有活动的 Agent，先在对话框里发一句话把它唤醒',
    }
  }

  const membership = teams.tryMembership(agent)
  if (membership === undefined) {
    return { error: '这个会话不是 Agent Team 成员（主对话需要由 team 组合启动）' }
  }
  return { agent, teams, membership }
}

/**
 * The only Lead agent, used when a caller supplied no session id.
 * @returns {object | undefined}
 */
function soleLead(agents, teams) {
  const leads = agents.list().filter((agent) => teams.tryMembership(agent)?.role === 'lead')
  return leads.length === 1 ? leads[0] : undefined
}

/** Require the Lead role for roster-mutating actions. */
function resolveLead(ctx, sessionId) {
  const resolved = resolve(ctx, sessionId)
  if (resolved.error !== undefined) return resolved
  if (resolved.membership.role !== 'lead') {
    return { error: '只有主对话（Lead）能派生队友、打断成员或管理任务' }
  }
  return resolved
}

/** Normalize free text into a lower-kebab-case teammate name. */
function slug(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

/**
 * Pick a subagent provider that the composition actually registered.
 * @param {object} ctx
 * @param {'fresh' | 'fork'} context
 */
function pickProvider(ctx, context) {
  const wanted = context === 'fork' ? 'fork' : 'spawn'
  let available = []
  try {
    const subagents = ctx.get('subagents')
    available = typeof subagents?.list === 'function' ? subagents.list() : []
  } catch {
    available = []
  }
  if (Array.isArray(available) && available.includes(wanted)) return wanted
  if (Array.isArray(available) && available.length > 0) return available[0]
  return wanted
}

/** Trim one field and enforce a length budget. */
function text(value, limit) {
  return String(value ?? '').trim().slice(0, limit)
}

/** Build the panel snapshot: team identity, roster, task board. */
function snapshot(ctx, sessionId) {
  const resolved = resolve(ctx, sessionId)
  if (resolved.error !== undefined) return resolved

  const { agent, teams, membership } = resolved
  const members = teams.listMembers(agent).map((member) => ({
    id: String(member.id),
    name: member.name,
    role: member.role,
    status: member.status,
    statusLabel: STATUS_LABEL[member.status] ?? member.status,
    description: member.description ?? '',
    context: member.context ?? '',
    model: member.model ?? '',
  }))
  const tasks = teams.listTasks(agent).map((task) => ({
    id: String(task.id),
    revision: task.revision,
    subject: task.subject,
    description: task.description,
    status: task.status,
    ownerName: task.ownerName ?? '',
    ready: task.ready === true,
  }))
  return {
    team: { name: membership.name, role: membership.role },
    members,
    tasks,
  }
}

/** Create one teammate. */
async function spawn(ctx, body) {
  const resolved = resolveLead(ctx, body.sessionId)
  if (resolved.error !== undefined) return resolved

  const name = slug(body.name)
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
    return { error: '名字只能用小写字母、数字和连字符，例如 research-2' }
  }
  const description = text(body.description, 200)
  const prompt = text(body.prompt, 8000)
  if (description === '') return { error: '填一句职责描述（它会显示在成员列表里）' }
  if (prompt === '') return { error: '填这个队友要完成的任务' }

  const context = body.context === 'fork' ? 'fork' : 'fresh'
  const { member } = await resolved.teams.spawnTeammate(resolved.agent, {
    name,
    description,
    prompt: [{ type: 'text', text: prompt }],
    context,
    provider: pickProvider(ctx, context),
    signal: new AbortController().signal,
  })
  return { member: { name: member.name, status: member.status } }
}

/** Deliver one message to a member (the Lead included). */
async function message(ctx, body) {
  const resolved = resolve(ctx, body.sessionId)
  if (resolved.error !== undefined) return resolved

  const target = text(body.target, 80)
  const content = text(body.text, 8000)
  if (target === '') return { error: '选择要发消息的成员' }
  if (content === '') return { error: '消息内容不能为空' }

  await resolved.teams.sendMessage(resolved.agent, {
    target,
    content: [{ type: 'text', text: content }],
    signal: new AbortController().signal,
  })
  return { sent: true, target }
}

/** Interrupt one running teammate turn. */
function interrupt(ctx, body) {
  const resolved = resolveLead(ctx, body.sessionId)
  if (resolved.error !== undefined) return resolved

  const target = text(body.target, 80)
  if (target === '') return { error: '选择要打断的成员' }
  const { previousStatus } = resolved.teams.interrupt(resolved.agent, target)
  return { target, previousStatus }
}

/** Add one unowned task to the board. */
async function createTask(ctx, body) {
  const resolved = resolve(ctx, body.sessionId)
  if (resolved.error !== undefined) return resolved

  const subject = text(body.subject, 120)
  const description = text(body.description, 4000)
  if (subject === '') return { error: '任务标题不能为空' }

  const task = await resolved.teams.createTask(resolved.agent, {
    subject,
    description: description === '' ? subject : description,
  })
  return { task: { id: String(task.id), subject: task.subject, status: task.status } }
}

/** Drive one compare-and-set task transition (the panel only completes). */
async function updateTask(ctx, body) {
  const resolved = resolve(ctx, body.sessionId)
  if (resolved.error !== undefined) return resolved

  const taskId = text(body.taskId, 80)
  const action = text(body.action, 40)
  const revision = Number(body.expectedRevision)
  if (taskId === '') return { error: '缺少任务 id' }
  if (!Number.isInteger(revision) || revision < 0) return { error: '缺少任务版本号' }
  const allowed = new Set(['complete', 'reopen', 'claim', 'release', 'delete'])
  if (!allowed.has(action)) return { error: `不支持的任务动作：${action}` }

  const task = await resolved.teams.updateTask(resolved.agent, {
    taskId,
    expectedRevision: revision,
    action,
  })
  return { task: { id: String(task.id), status: task.status, revision: task.revision } }
}

/**
 * Serve one request under the hub base path.
 * @param {object} ctx plugin context
 * @param {string} base mounted prefix, e.g. `/subagent-hub`
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
export async function handle(ctx, base, req, res) {
  const url = new URL(req.url ?? '/', 'http://placeholder')
  const route = url.pathname.slice(base.length)
  const method = req.method ?? 'GET'

  try {
    if (route === '/state' && method === 'GET') {
      return sendJson(res, 200, snapshot(ctx, url.searchParams.get('session')))
    }
    if (method === 'POST') {
      const body = await readJson(req)
      if (route === '/spawn') return sendJson(res, 200, await spawn(ctx, body))
      if (route === '/message') return sendJson(res, 200, await message(ctx, body))
      if (route === '/interrupt') return sendJson(res, 200, interrupt(ctx, body))
      if (route === '/task') return sendJson(res, 200, await createTask(ctx, body))
      if (route === '/task/update') return sendJson(res, 200, await updateTask(ctx, body))
    }
    return sendJson(res, 404, { error: `未知路由 ${method} ${route}` })
  } catch (error) {
    return sendJson(res, 200, { error: String(error?.message ?? error) })
  }
}

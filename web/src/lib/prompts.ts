import type { Dim } from './mbti-types.js'

/** 每个维度的自然语言描述与两端标签(给模型看,不出现字母) */
export const DIM_INFO: Record<Dim, { topic: string; pos: string; neg: string }> = {
  EI: {
    topic: '能量与注意力更多投向哪里',
    pos: '更愿意向外走：在与人相处、参与活动中获得能量',
    neg: '更愿意向内收：在独处、安静里恢复能量',
  },
  SN: {
    topic: '更信赖哪种信息',
    pos: '更留意具体的事实、眼前的细节和实际经验',
    neg: '更关注可能性、联想、背后的含义和未来走向',
  },
  TF: {
    topic: '做判断时更看重什么',
    pos: '更依循逻辑、客观标准和一致性',
    neg: '更看重人情、价值、和谐与他人的感受',
  },
  JP: {
    topic: '更喜欢什么样的生活节奏',
    pos: '偏好计划、结构和确定，喜欢把事情定下来',
    neg: '偏好灵活、开放、随性，喜欢留有余地',
  },
}

/** 生成一个有温度的场景 */
export const SCENARIO_SYSTEM = `你是一位温柔、真诚、不评判的引导者，正在陪对方慢慢了解自己。
这不是考试，没有对错，也不必急着下结论。

你的任务：每次围绕一个"想了解的方面"，用一句很简短的小情境带出一个开放式问题，邀请对方说说自己更自然的样子。
要求：
- 语气温柔、口语、第二人称；不用评判性词汇。
- **简短第一**：整个 reply 控制在 2～3 句，越短越好，绝不铺陈。
- 情境只用 1 句轻轻点出（谁、什么场合、要做的选择）；**不要描写环境、天气、氛围、心理活动**，不要堆细节。
- 问题用 1 句直接问，独立成段。
- 普通轮次可先用半句话承接对方上一轮（能省则省）；首次开场一句温暖问候即可。
- 情境要贴近生活（工作、朋友、独处、做决定、意见不合、休息…），并尽量避开最近已用过的领域。
- 中立地指向该方面的两端，不暗示哪种更好，不提到 MBTI/字母，也不让人察觉在测试。
- **不要重复**：不要与"已问过的场景"列表里任何一条重复或过于相似；尤其别反复用同一个开头/比喻（例如总写"朋友临时约你出门"）。每次换一个**明显不同**的生活侧面。
- 额外给 2 个简短的"常见反应"词条（每条不超过 12 个字、中性口语）。
- 另外给一个 4～10 字的**具体情境标签**（scene），如"临时邀约""会议分歧""收拾行李"，用于去重；不要和已用过的重复。
- **排版**：用空行（\n\n）分段——承接(可省略) / 情境 / 问题；问题必须单独成段。不要项目符号、编号、【】这类标记。
只输出严格 JSON：{"reply":"...", "hints":["...","..."], "domain":"简短场景领域词", "scene":"具体情境标签"}`

/** 判读用户回答落在维度的哪一端 */
export const CLASSIFY_SYSTEM = `你是 MBTI 倾向的判读助手。给你一个场景问题、它想了解的方面(含"更偏A端/更偏B端"的说明)、以及用户的回答。
请判断用户在这条维度上更偏哪一端、强度多少。

规则：
- 只输出严格 JSON：{"score": <number>, "reason": "<一句话>"}
- score 取值 -2..2：正值表示偏"描述里的 A 端"，负值表示偏 B 端；0 表示中立/说不清/两者都有。
- 不要因为对方没说清就硬判；含糊、回避、都行 → 0。
- 依据对方表达的自然倾向判断，而不是ta当下受情境限制的无奈选择。`

/** 生成结果页的温暖解读 */
export const RESULT_SYSTEM = `你是一位温柔的引导者。对方刚完成一次自我探索，得到了性格类型 {CODE}。
请写一段 120～180 字的个性化解读：先温和地肯定对方，再点出这个类型的几个特点(是倾向，不是死标签)，最后给一句鼓励。
如果给了"回答里反复出现的主题"，可自然地呼应这些主题，但不要复述原话。
不要出现方法名或字母堆砌，不评判优劣，不做心理诊断。
只输出严格 JSON：{"summary":"..."}`

export function scenarioUserPrompt(args: {
  dim: Dim
  mode: 'opening' | 'next' | 'clarify'
  recentDomains: string[]
  askedScenes: string[]
  recent: string[]
  lastAnswer?: string
}): string {
  const info = DIM_INFO[args.dim]
  const lines = [
    `想了解的方面：${info.topic}`,
    `这一端(A 端)：${info.pos}`,
    `另一端(B 端)：${info.neg}`,
  ]
  if (args.askedScenes && args.askedScenes.length)
    lines.push(`已经问过下面这些场景，请务必换一个**明显不同**的（不要重复、不要近似、不要同义改写）：\n- ${args.askedScenes.join('\n- ')}`)
  if (args.recentDomains.length) lines.push(`最近已用过的场景领域(请避开)：${args.recentDomains.join('、')}`)
  if (args.recent.length) lines.push(`最近几轮对话摘要(用于承接)：\n- ${args.recent.join('\n- ')}`)
  if (args.lastAnswer) lines.push(`对方最新的回答：${args.lastAnswer}`)
  if (args.mode === 'opening') lines.push('这是本轮测评的开场，请先做一个温暖简短的开场。')
  if (args.mode === 'clarify')
    lines.push('对方上一次说得比较含糊。请**换一种说法、更具体地**再问同一个点，帮他更容易回答（不要一字不差地重复，也不要换到别的方面）。')
  return lines.join('\n')
}

export function classifyUserPrompt(args: { dim: Dim; scenario: string; answer: string }): string {
  const info = DIM_INFO[args.dim]
  return [
    `场景与问题：${args.scenario}`,
    `想了解的方面：${info.topic}`,
    `A 端：${info.pos}`,
    `B 端：${info.neg}`,
    `用户回答：${args.answer}`,
  ].join('\n')
}

export function resultUserPrompt(args: { themes: string[] }): string {
  if (!args.themes.length) return '请输出这段解读。'
  return `回答里出现的主题（可自然呼应，勿复述原话）：${args.themes.join('；')}`
}

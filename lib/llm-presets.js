/**
 * MakoCode LLM 供应商预设
 *
 * 收录 9 家支持 Anthropic Messages API 兼容的供应商。
 * 所有 Base URL 和模型名称均来自各供应商官方文档（2026-06 核实）。
 *
 * 信息来源：
 *   DeepSeek:    https://platform.deepseek.com/api_keys
 *   Anthropic:   https://docs.anthropic.com/en/api
 *   OpenRouter:  https://openrouter.ai/docs/guides/coding-agents/automatic-code-review
 *   SiliconFlow: https://docs.siliconflow.cn/cn/usercases/use-siliconcloud-in-ClaudeCode
 *   阿里百炼:     https://help.aliyun.com/zh/model-studio/claude-code-coding-plan
 *   火山方舟:     https://www.volcengine.com/docs/82379/2373740
 *   腾讯混元:     https://cloud.tencent.com/document/product/1823/130665
 *   Kimi:        https://platform.kimi.com/docs/guide/agent-support
 *   百度千帆:     https://cloud.baidu.com/doc/qianfan/s/0mn2mnemj
 */

const PRESETS = [
  {
    id: "deepseek",
    name: "🚀 DeepSeek",
    baseUrl: "https://api.deepseek.com/anthropic",
    defaultModel: "deepseek-v4-flash",
    heavyModel: "deepseek-v4-pro",
    balancedModel: "deepseek-v4-flash",
    lightModel: "deepseek-v4-flash",
    subagentModel: "deepseek-v4-flash",
    authLabel: "DeepSeek API Key",
    authUrl: "https://platform.deepseek.com/api_keys",
    note: "国产性价比之王，按量计费，Pro模型推理能力强。官方 Anthropic 兼容端点",
  },
  {
    id: "anthropic",
    name: "🏛️ Anthropic (官方)",
    baseUrl: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-4-6",
    heavyModel: "claude-opus-4-8",
    balancedModel: "claude-sonnet-4-6",
    lightModel: "claude-haiku-4-5",
    subagentModel: "claude-haiku-4-5",
    authLabel: "Anthropic API Key",
    authUrl: "https://console.anthropic.com/keys",
    note: "原生支持全部功能（工具/思考/子Agent）。需 VPN + 海外支付，Opus $15/M tokens",
  },
  {
    id: "openrouter",
    name: "🔀 OpenRouter",
    baseUrl: "https://openrouter.ai/api",
    defaultModel: "deepseek/deepseek-chat",
    heavyModel: "anthropic/claude-sonnet-4-6",
    balancedModel: "deepseek/deepseek-chat",
    lightModel: "google/gemini-2.5-flash",
    subagentModel: "google/gemini-2.5-flash",
    authLabel: "OpenRouter API Key",
    authUrl: "https://openrouter.ai/keys",
    note: "200+模型聚合，一个Key通吃。⚠️ Base URL不加/v1（官方明确要求）",
  },
  {
    id: "siliconflow",
    name: "⚡ 硅基流动",
    baseUrl: "https://api.siliconflow.cn/",
    defaultModel: "moonshotai/Kimi-K2-Instruct-0905",
    heavyModel: "deepseek-ai/DeepSeek-R1",
    balancedModel: "deepseek-ai/DeepSeek-V3",
    lightModel: "Qwen/Qwen2.5-7B-Instruct",
    subagentModel: "Qwen/Qwen2.5-7B-Instruct",
    authLabel: "SiliconFlow API Key",
    authUrl: "https://cloud.siliconflow.cn/account/ak",
    note: "国产开源模型聚合，推理加速，首包~28ms。⚠️ 官方文档写Base URL不加路径后缀",
  },
  {
    id: "dashscope",
    name: "☁️ 阿里百炼",
    baseUrl: "https://coding.dashscope.aliyuncs.com/apps/anthropic",
    defaultModel: "qwen3.6-plus",
    heavyModel: "qwen3.6-plus",
    balancedModel: "qwen3.6-plus",
    lightModel: "qwen3.6-plus",
    subagentModel: "qwen3.6-plus",
    authLabel: "百炼 API Key (sk-sp-xxx)",
    authUrl: "https://bailian.console.aliyun.com/#/home",
    note: "Coding Plan包月（Lite/Pro），通义千问主力模型。⚠️ 必须用 Coding Plan 专属Key（sk-sp-开头），国际版用 coding-intl.dashscope.aliyuncs.com",
  },
  {
    id: "volcano",
    name: "🌋 火山引擎方舟",
    baseUrl: "https://ark.cn-beijing.volces.com/api/coding",
    defaultModel: "doubao-seed-2.0-code",
    heavyModel: "doubao-seed-2.0-pro",
    balancedModel: "doubao-seed-2.0-code",
    lightModel: "doubao-seed-2.0-lite",
    subagentModel: "doubao-seed-2.0-lite",
    authLabel: "方舟 API Key",
    authUrl: "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey",
    note: "模型最丰富：豆包+DeepSeek+Kimi+GLM+MiniMax全有。⚠️ 勿用/api/v3（不计入套餐额度）",
  },
  {
    id: "tencent",
    name: "💼 腾讯混元",
    baseUrl: "https://api.lkeap.cloud.tencent.com/coding/anthropic",
    defaultModel: "hunyuan-2.0-instruct-20251111",
    heavyModel: "hunyuan-2.0-instruct-20251111",
    balancedModel: "hunyuan-2.0-instruct-20251111",
    lightModel: "hunyuan-2.0-instruct-20251111",
    subagentModel: "hunyuan-2.0-instruct-20251111",
    authLabel: "腾讯云 API Key",
    authUrl: "https://console.cloud.tencent.com/lkeap/api",
    note: "Coding Plan包月（¥7.9 Lite / ¥39.9 Pro），性价比高。也支持GLM/Kimi/MiniMax等第三方模型",
  },
  {
    id: "moonshot",
    name: "🌙 Kimi (月之暗面)",
    baseUrl: "https://api.moonshot.cn/anthropic",
    defaultModel: "kimi-k2.5",
    heavyModel: "kimi-k2.5",
    balancedModel: "kimi-k2.5",
    lightModel: "kimi-k2.5",
    subagentModel: "kimi-k2.5",
    authLabel: "Kimi API Key",
    authUrl: "https://platform.moonshot.cn/console/api-keys",
    note: "Kimi K2.5 公认国产最强代码模型，128K上下文。按量计费或¥99/月Kimi Code订阅（用api.kimi.com/coding/端点）",
  },
  {
    id: "qianfan",
    name: "🔵 百度千帆",
    baseUrl: "https://qianfan.baidubce.com/anthropic/coding",
    defaultModel: "qianfan-code-latest",
    heavyModel: "qianfan-code-latest",
    balancedModel: "qianfan-code-latest",
    lightModel: "qianfan-code-latest",
    subagentModel: "qianfan-code-latest",
    authLabel: "千帆 API Key",
    authUrl: "https://console.bce.baidu.com/qianfan/ais/console/applicationConsole/application",
    note: "百度Coding Plan包月，统一动态模型qianfan-code-latest自动更新。配置最简洁",
  },
];

function getPreset(id) {
  return PRESETS.find(p => p.id === id) || null;
}

function getAllPresets() {
  return PRESETS;
}

module.exports = { PRESETS, getPreset, getAllPresets };

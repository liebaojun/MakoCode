/**
 * MakoCode Electron Preload Script
 * 安全的 contextBridge，暴露有限的系统 API 给渲染进程
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('makoElectron', {
  isElectron: true,
  platform: process.platform,

  // 后台安装工具（file:// 后备模式使用，正常模式由 server.js API 处理）
  installTools: (tools) => ipcRenderer.invoke('install-tools', tools),

  // 清理安装包（向导完成后删除不需要的 bundled-tools）
  cleanupBundledTools: () => ipcRenderer.invoke('cleanup-bundled-tools'),

  // ─── 打开文件夹 ────────────────────────────────────────
  // 打开 skills 文件夹（~/.claude/skills/）
  openSkillsFolder: () => ipcRenderer.invoke('open-skills-folder'),

  // 打开 plugins 文件夹（~/.claude/plugins/）
  openPluginsFolder: () => ipcRenderer.invoke('open-plugins-folder'),

  // ─── 茉子人设 ──────────────────────────────────────────
  // 读取茉子人设 markdown 文件（CLAUDE.md + SKILL.md）
  readPersona: () => ipcRenderer.invoke('read-persona'),

  // 保存茉子人设 markdown 文件
  writePersona: (data) => ipcRenderer.invoke('write-persona', data),

  // ─── 自动更新 ────────────────────────────────────────
  // 手动检查更新
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),

  // 安装已下载的更新（退出并重启）
  installUpdate: () => ipcRenderer.invoke('install-update'),

  // 监听更新状态变化（主进程 → 渲染进程推送）
  onUpdateStatus: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on('update-status', handler);
    // 返回取消监听函数
    return () => ipcRenderer.removeListener('update-status', handler);
  },
});

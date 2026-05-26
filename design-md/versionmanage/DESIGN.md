---
version: alpha
name: versionmanage-immersive-themes
description: |
  版本任务管理系统的两套「插画沉浸式」主题。UI 原则（参考 design-md/raycast、linear）：
  插画占主舞台；界面为中性暗色玻璃层（低饱和、细白描边）；
  品牌色仅用于可交互元素（主按钮、激活 Tab、进度条、焦点环），
  避免整块面板染成粉/金导致与背景打架。

themes:
  regal:
    canvas: "#0a101f"
    accent-primary: "#50e3ff"
    accent-secondary: "#d4af37"
    glass-bg: "rgba(255,255,255,0.07)"
    glass-border: "rgba(255,255,255,0.12)"
    background: "/theme-furina-bg.png"
  stellar:
    canvas: "#0a1438"
    accent-primary: "#ff7eb8"
    accent-secondary: "#5ec8ff"
    accent-star: "#ffc857"
    glass-bg: "rgba(10,18,48,0.28)"
    glass-border: "pink-cyan iridescent on interaction"
    background: "/theme-stellar-bg.png"
    background-size: "1672x941"
    narrative: "cosmic idol stage · sakura pink spotlight · gold filigree · prism ribbons"
  teatime:
    canvas: "#0a1628"
    accent-primary: "#c73552"
    accent-secondary: "#4eb8e8"
    accent-gold: "#c9a227"
    glass-bg: "rgba(255,255,255,0.08)"
    glass-border: "rgba(201,162,39,0.38)"
    background: "/theme-teatime-bg.png"
    background-size: "1683x935"
    narrative: "Victorian tea party · porcelain · clockwork · cerulean sky"

components:
  panel:
    background: glass-bg
    border: "1px solid glass-border"
    backdrop-filter: "blur(12px) saturate(1.35)"
  cta:
    use: "theme accent gradient only"
  vignette:
    max-opacity: 0.18
    avoid: "full-screen colored radial overlays"

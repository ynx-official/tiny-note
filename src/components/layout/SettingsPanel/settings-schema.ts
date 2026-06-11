export type SettingsCategoryId =
  | "general"
  | "appearance"
  | "editor"
  | "quick"
  | "sync"
  | "data"
  | "about";

export interface SettingsCategory {
  id: SettingsCategoryId;
  label: string;
  description: string;
}

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    id: "general",
    label: "常规",
    description: "启动、托盘和窗口默认行为",
  },
  {
    id: "appearance",
    label: "外观",
    description: "主题、字体和阅读密度",
  },
  {
    id: "editor",
    label: "编辑",
    description: "自动保存、缩进和视图",
  },
  {
    id: "quick",
    label: "快捷便签",
    description: "便签默认行为和全局快捷键",
  },
  {
    id: "sync",
    label: "同步与云端",
    description: "同步巡检、诊断和设备管理",
  },
  {
    id: "data",
    label: "数据与备份",
    description: "数据目录、本地备份和云备份",
  },
  {
    id: "about",
    label: "关于",
    description: "版本信息和应用说明",
  },
];
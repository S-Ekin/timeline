import dayjs from 'dayjs';

export type Orientation = 'vertical' | 'horizontal';

export interface ICustomConfig {
  selectedTasks: string[];
  title: string;
  showTitle: boolean;
  icon: string;
  startDate: number;
  orientation: Orientation;
  dayPx: number;
  minNodeGap: number;
  nodeRadius: number;
  lineWidth: number;
  solidColor: string;
  gapColor: string;
  nodeColor: string;
  showToday: boolean;
  taskConfigs?: Record<string, { icon: string; color: string }>;
}

export const DEFAULT_CONFIG: ICustomConfig = {
  selectedTasks: [],
  title: '',
  showTitle: true,
  icon: '📌',
  startDate: dayjs().subtract(60, 'day').startOf('day').valueOf(),
  orientation: 'vertical',
  dayPx: 10,
  minNodeGap: 28,
  nodeRadius: 6,
  lineWidth: 2.5,
  solidColor: '#9c27b0',
  gapColor: '#b8e8ec',
  nodeColor: '#1e3a5f',
  showToday: true,
};

/** 兼容旧版 single selectedTask 字段 */
export function normalizeConfig(saved: any): ICustomConfig {
  const merged: ICustomConfig = { ...DEFAULT_CONFIG, ...(saved || {}) };
  if (!merged.selectedTasks || !Array.isArray(merged.selectedTasks)) {
    merged.selectedTasks = saved?.selectedTask ? [saved.selectedTask] : [];
  }
  if (!merged.title && merged.selectedTasks.length) merged.title = merged.selectedTasks[0];
  return merged;
}

export const ICON_OPTIONS = [
  // 目标与成就
  '🎯', '✅', '🏆', '🥇', '🎖️', '🏅', '💯', '⭐', '🔥', '🚀',
  // 学习与工作
  '📚', '📖', '🎓', '🧠', '✍️', '📝', '💻', '🎨', '🎵', '🔬',
  // 健康与运动
  '💪', '🏃', '🚴', '🏊', '🧘', '🏋️', '🧗', '🚶', '🏃‍♀️', '🤸',
  // 饮食
  '🍎', '💧', '🍳', '☕', '🥗', '🍜', '🥑', '🥛', '🍵', '🍇',
  // 生活
  '😴', '🌙', '☀️', '🌱', '💰', '🏠', '🛒', '✈️', '🚗', '🧹',
  // 兴趣与娱乐
  '🎸', '🎹', '🎮', '📷', '🎬', '🧩', '🎲', '🎤', '🖼️', '🎭',
  // 其他
  '📌', '❤️', '👟', '🌟', '💎', '🌈', '🎁', '📱', '⌚', '🧴',
];

import dayjs from 'dayjs';

export const DAY_MS = 86400000;

export interface ITimelineSegment {
  kind: 'streak' | 'gap';
  from: number;
  to: number;
  days: number;
}

export interface ITimelineModel {
  nodes: number[];
  hollowNodes: number[];
  segments: ITimelineSegment[];
  axisStart: number;
  axisEnd: number;
}

/** 从仪表盘计算结果中提取所有任务名（第一列的取值） */
export function getTaskValues(data: any): string[] {
  const tasks: string[] = [];
  if (!data || data.length < 2) return tasks;
  for (let r = 1; r < data.length; r++) {
    const cell = data[r]?.[0];
    if (cell && cell.text) tasks.push(cell.text);
  }
  return tasks;
}

/**
 * 从二维计算结果中提取指定任务对应的所有日期时间戳。
 * 计算结果约定：groups = [任务字段, 日期字段]
 *  - 第 0 行：[任务字段名, 日期1, 日期2, ...]
 *  - 其后每行：[任务值, count1, count2, ...]
 */
export function getDoneDates(data: any, selectedTask: string): number[] {
  if (!data || data.length < 2 || !selectedTask) return [];
  const header = data[0];
  let targetRow: any[] | null = null;
  for (let r = 1; r < data.length; r++) {
    const cell = data[r]?.[0];
    if (cell && (cell.text === selectedTask || String(cell.value) === selectedTask)) {
      targetRow = data[r];
      break;
    }
  }
  if (!targetRow) return [];
  const dates: number[] = [];
  for (let c = 1; c < header.length; c++) {
    const count = targetRow[c]?.value;
    if (count && Number(count) > 0) {
      const hv = header[c]?.value;
      if (typeof hv === 'number') {
        dates.push(hv);
      } else if (typeof hv === 'string') {
        const d = dayjs(hv);
        if (d.isValid()) dates.push(d.valueOf());
      }
    }
  }
  return dates;
}

/** 日期字符串 key，避免时间戳精度问题 */
export function dateKey(ts: number): string {
  return dayjs(ts).format('YYYY-MM-DD');
}

/**
 * 从二维计算结果中提取指定任务每个日期的记录数。
 * 返回 Map<日期字符串 YYYY-MM-DD, 记录数>
 */
export function getRecordCounts(data: any, selectedTask: string): Map<string, number> {
  const counts = new Map<string, number>();
  if (!data || data.length < 2 || !selectedTask) return counts;
  const header = data[0];
  let targetRow: any[] | null = null;
  for (let r = 1; r < data.length; r++) {
    const cell = data[r]?.[0];
    if (cell && (cell.text === selectedTask || String(cell.value) === selectedTask)) {
      targetRow = data[r];
      break;
    }
  }
  if (!targetRow) return counts;
  for (let c = 1; c < header.length; c++) {
    const count = targetRow[c]?.value;
    if (count && Number(count) > 0) {
      const hv = header[c]?.value;
      let ts: number | null = null;
      if (typeof hv === 'number') ts = hv;
      else if (typeof hv === 'string') {
        const d = dayjs(hv);
        if (d.isValid()) ts = d.valueOf();
      }
      if (ts != null) {
        counts.set(dateKey(ts), Number(count));
      }
    }
  }
  return counts;
}

/** 将时间戳规整为当天 0 点 */
export function startOfDay(ts: number): number {
  return dayjs(ts).startOf('day').valueOf();
}

/**
 * 根据完成日期集合，构造时间线模型。
 * - 开始日期始终是轴起点和一个节点：有任务=实心，无任务=空心
 * - 今天始终是轴终点和一个节点（includeToday=true 时）：有任务=实心，无任务=空心
 * - 连续完成日组成一段 streak（实线），节点为该段首尾
 * - 相邻 streak 之间为 gap（虚线）
 * - 最后一段 streak 之后到今天为 gap（虚线，持续中）
 */
export function buildTimeline(
  doneTimestamps: number[],
  startTs: number,
  nowTs: number,
  includeToday = true
): ITimelineModel {
  const start = startOfDay(startTs);
  const today = startOfDay(nowTs);

  const doneDays = Array.from(
    new Set(
      doneTimestamps
        .map((ts) => startOfDay(ts))
        .filter((d) => d >= start && d <= today)
    )
  ).sort((a, b) => a - b);

  const hollowNodes: number[] = [];
  const startIsDone = doneDays.includes(start);
  if (!startIsDone) hollowNodes.push(start);
  const todayIsDone = doneDays.includes(today);
  if (includeToday && !todayIsDone && !hollowNodes.includes(today)) {
    hollowNodes.push(today);
  }

  // 完全没有完成日：从开始（空心）到今天（空心）一条虚线
  if (doneDays.length === 0) {
    return {
      nodes: [],
      hollowNodes,
      segments: [{
        kind: 'gap',
        from: start,
        to: today,
        days: Math.max(0, Math.round((today - start) / DAY_MS)),
      }],
      axisStart: start,
      axisEnd: today,
    };
  }

  // 分组：连续完成日 = 一个 streak
  const streaks: { start: number; end: number }[] = [];
  let cur = { start: doneDays[0], end: doneDays[0] };
  for (let i = 1; i < doneDays.length; i++) {
    if (doneDays[i] - cur.end === DAY_MS) {
      cur.end = doneDays[i];
    } else {
      streaks.push(cur);
      cur = { start: doneDays[i], end: doneDays[i] };
    }
  }
  streaks.push(cur);

  const nodes: number[] = [];
  const segments: ITimelineSegment[] = [];
  let prevEnd: number | null = null;

  // 开始日期（空心）到第一段 streak 之间的 gap
  if (!startIsDone && streaks[0].start > start) {
    const gapDays = Math.max(0, Math.round((streaks[0].start - start) / DAY_MS) - 1);
    segments.push({ kind: 'gap', from: start, to: streaks[0].start, days: gapDays });
  }

  for (const s of streaks) {
    nodes.push(s.start);
    if (prevEnd !== null) {
      const gapDays = Math.max(0, Math.round((s.start - prevEnd) / DAY_MS) - 1);
      segments.push({ kind: 'gap', from: prevEnd, to: s.start, days: gapDays });
    }
    if (s.end > s.start) {
      const streakDays = Math.round((s.end - s.start) / DAY_MS) + 1;
      segments.push({ kind: 'streak', from: s.start, to: s.end, days: streakDays });
      nodes.push(s.end);
    }
    prevEnd = s.end;
  }

  // 最后一段 streak 结束 -> 今天
  if (prevEnd !== null && prevEnd < today) {
    segments.push({
      kind: 'gap',
      from: prevEnd,
      to: today,
      days: Math.round((today - prevEnd) / DAY_MS),
    });
  }

  return { nodes, hollowNodes, segments, axisStart: start, axisEnd: today };
}

/** 日期标签 M-D */
export function formatDate(ts: number): string {
  return dayjs(ts).format('M-D');
}

/** 从多维表格字段值中提取纯文本（兼容字符串/对象/数组） */
export function extractText(val: any): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (Array.isArray(val)) return val.map(extractText).filter(Boolean).join(',');
  if (typeof val === 'object') return val.text || val.name || val.value || '';
  return String(val);
}

/** 从日期字段值中提取毫秒时间戳（兼容数字/字符串/对象/数组） */
export function extractTimestamp(val: any): number | null {
  if (val === null || val === undefined) return null;
  let raw: any = val;
  if (Array.isArray(raw)) raw = raw[0];
  if (typeof raw === 'object' && raw !== null) {
    raw = raw.value ?? raw.text ?? raw.timestamp;
  }
  if (typeof raw === 'number') return raw > 1e12 ? raw : raw * 1000;
  if (typeof raw === 'string') {
    const n = Number(raw);
    if (!isNaN(n)) return n > 1e12 ? n : n * 1000;
    const d = dayjs(raw);
    if (d.isValid()) return d.valueOf();
  }
  return null;
}

/** 格式化多维表格字段值为可读字符串 */
export function formatFieldValue(val: any): string {
  if (val === null || val === undefined || val === '') return '—';
  if (Array.isArray(val)) {
    if (val.length === 0) return '—';
    return val.map((v) => {
      if (typeof v === 'object' && v !== null) {
        return v.text || v.name || v.value || JSON.stringify(v);
      }
      return String(v);
    }).join(', ');
  }
  if (typeof val === 'object') {
    return val.text || val.name || val.value || JSON.stringify(val);
  }
  if (typeof val === 'number') {
    if (val > 1e12) return dayjs(val).format('YYYY-MM-DD HH:mm');
    return String(val);
  }
  return String(val);
}

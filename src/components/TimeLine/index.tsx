import './style.scss';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  dashboard, bitable, DashboardState, GroupMode, ORDER,
  DATA_SOURCE_SORT_TYPE, SourceType, FieldType,
} from '@lark-base-open/js-sdk';
import { Button, DatePicker, Radio, Select, Input, Switch, Slider, Modal } from '@douyinfe/semi-ui';
import dayjs from 'dayjs';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';
import { Item } from '../Item';
import { getDoneDates, getTaskValues, buildTimeline, formatDate, DAY_MS, startOfDay } from './utils';

type Orientation = 'vertical' | 'horizontal';

interface ICustomConfig {
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
}

const DEFAULT_CONFIG: ICustomConfig = {
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
function normalizeConfig(saved: any): ICustomConfig {
  const merged: ICustomConfig = { ...DEFAULT_CONFIG, ...(saved || {}) };
  if (!merged.selectedTasks || !Array.isArray(merged.selectedTasks)) {
    merged.selectedTasks = saved?.selectedTask ? [saved.selectedTask] : [];
  }
  if (!merged.title && merged.selectedTasks.length) merged.title = merged.selectedTasks[0];
  return merged;
}

const ICON_OPTIONS = [
  '📌', '✅', '🎯', '🏃', '📚', '💪', '🧘', '🍎', '💧', '😴',
  '✍️', '🎨', '🎵', '💰', '🌱', '⭐', '🔥', '❤️', '👟', '🎸',
  '🧹', '🚴', '🏊', '🍳', '☕', '📝', '💻', '🎮', '🌙', '☀️',
];

export default function TimeLine(props: { bgColor: string }) {
  const { t } = useTranslation();
  const isCreate = dashboard.state === DashboardState.Create;
  const isConfig = dashboard.state === DashboardState.Config || isCreate;
  console.log('[TimeLine] render, state=', dashboard.state, 'isConfig=', isConfig);

  const [tableList, setTableList] = useState<{ tableId: string; tableName: string }[]>([]);
  const [ranges, setRanges] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [tableId, setTableId] = useState('');
  const [dataRange, setDataRange] = useState<any>(null);
  const [taskFieldId, setTaskFieldId] = useState('');
  const [dateFieldId, setDateFieldId] = useState('');
  const [availableTasks, setAvailableTasks] = useState<string[]>([]);
  const [renderData, setRenderData] = useState<any>(null);
  const [inited, setInited] = useState(false);
  const [custom, setCustom] = useState<ICustomConfig>(DEFAULT_CONFIG);
  const [detail, setDetail] = useState<{
    visible: boolean; task: string; ts: number; records: any[]; loading: boolean;
  }>({ visible: false, task: '', ts: 0, records: [], loading: false });

  const updateCustom = useCallback((patch: Partial<ICustomConfig>) => {
    setCustom((prev) => ({ ...prev, ...patch }));
  }, []);

  const buildCond = useCallback(
    (tid: string, dr: any, tf: string, df: string) => ({
      tableId: tid,
      dataRange: dr,
      series: 'COUNTA',
      groups: [
        { fieldId: tf, mode: GroupMode.INTEGRATED, sort: { order: ORDER.ASCENDING, sortType: DATA_SOURCE_SORT_TYPE.GROUP } },
        { fieldId: df, mode: GroupMode.INTEGRATED, sort: { order: ORDER.ASCENDING, sortType: DATA_SOURCE_SORT_TYPE.GROUP } },
      ],
    }),
    []
  );

  const doPreview = useCallback(
    async (tid: string, dr: any, tf: string, df: string) => {
      if (!tid || !tf || !df) return [] as string[];
      try {
        const data = await dashboard.getPreviewData(buildCond(tid, dr, tf, df));
        setRenderData(data);
        const tasks = getTaskValues(data);
        setAvailableTasks(tasks);
        return tasks;
      } catch (e) {
        console.error(e);
        return [];
      }
    },
    [buildCond]
  );

  // ---- 配置 / 创建态：初始化 ----
  useEffect(() => {
    if (!isConfig) return;
    let cancelled = false;
    (async () => {
      const tables = await bitable.base.getTableList();
      const list = await Promise.all(
        tables.map(async (tb: any) => ({ tableId: tb.id, tableName: await tb.getName() }))
      );
      if (cancelled) return;
      setTableList(list);

      if (dashboard.state === DashboardState.Create) {
        const tid = list[0]?.tableId;
        const [rgs, cats] = await Promise.all([
          dashboard.getTableDataRange(tid),
          dashboard.getCategories(tid),
        ]);
        if (cancelled) return;
        setRanges(rgs);
        setCategories(cats);
        const dr = rgs[0];
        const df =
          cats.find((c: any) => c.fieldType === FieldType.DateTime)?.fieldId ||
          cats[0]?.fieldId ||
          '';
        const tf = cats.find((c: any) => c.fieldId !== df)?.fieldId || '';
        setTableId(tid);
        setDataRange(dr);
        setDateFieldId(df);
        setTaskFieldId(tf);
        const tasks = await doPreview(tid, dr, tf, df);
        if (!cancelled && tasks && tasks[0]) {
          updateCustom({ selectedTasks: [tasks[0]] });
        }
      } else {
        const cfg = await dashboard.getConfig();
        const dc = Array.isArray(cfg.dataConditions) ? cfg.dataConditions[0] : cfg.dataConditions;
        const tid = dc.tableId;
        const dr = dc.dataRange;
        const tf = dc.groups?.[0]?.fieldId;
        const df = dc.groups?.[1]?.fieldId;
        const saved = (cfg.customConfig || {}) as Partial<ICustomConfig>;
        const merged = normalizeConfig(saved);
        const [rgs, cats] = await Promise.all([
          dashboard.getTableDataRange(tid),
          dashboard.getCategories(tid),
        ]);
        if (cancelled) return;
        setRanges(rgs);
        setCategories(cats);
        setTableId(tid);
        setDataRange(dr);
        setDateFieldId(df);
        setTaskFieldId(tf);
        setCustom(merged);
        await doPreview(tid, dr, tf, df);
      }
      setInited(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [isConfig, doPreview, updateCustom]);

  // ---- 展示态 ----
  useEffect(() => {
    if (isConfig) return;
    let off: any;
    (async () => {
      const cfg = await dashboard.getConfig();
      const saved = (cfg.customConfig || {}) as Partial<ICustomConfig>;
      const merged = normalizeConfig(saved);
      setCustom(merged);
      const data = await dashboard.getData();
      setRenderData(data);
      off = dashboard.onDataChange((res: any) => setRenderData(res.data));
    })();
    return () => {
      if (off) off();
    };
  }, [isConfig]);

  // ---- 配置变更 ----
  const onTableChange = async (tid: string) => {
    setTableId(tid);
    const [rgs, cats] = await Promise.all([
      dashboard.getTableDataRange(tid),
      dashboard.getCategories(tid),
    ]);
    setRanges(rgs);
    setCategories(cats);
    const dr = rgs[0];
    setDataRange(dr);
    const df =
      cats.find((c: any) => c.fieldType === FieldType.DateTime)?.fieldId || cats[0]?.fieldId || '';
    const tf = cats.find((c: any) => c.fieldId !== df)?.fieldId || '';
    setDateFieldId(df);
    setTaskFieldId(tf);
    const tasks = await doPreview(tid, dr, tf, df);
    if (tasks[0]) updateCustom({ selectedTasks: [tasks[0]] });
  };

  const onDataRangeChange = (drJson: string) => {
    const dr = JSON.parse(drJson);
    setDataRange(dr);
    doPreview(tableId, dr, taskFieldId, dateFieldId).then((tasks) => {
      if (tasks.length && custom.selectedTasks.every((t) => !tasks.includes(t))) {
        updateCustom({ selectedTasks: [tasks[0]] });
      }
    });
  };

  const onTaskFieldChange = (tf: string) => {
    setTaskFieldId(tf);
    doPreview(tableId, dataRange, tf, dateFieldId).then((tasks) => {
      if (tasks[0]) updateCustom({ selectedTasks: [tasks[0]] });
    });
  };

  const onDateFieldChange = (df: string) => {
    setDateFieldId(df);
    doPreview(tableId, dataRange, taskFieldId, df).then((tasks) => {
      if (tasks[0]) updateCustom({ selectedTasks: [tasks[0]] });
    });
  };

  const addTask = (task: string) => {
    if (!task || custom.selectedTasks.includes(task)) return;
    updateCustom({ selectedTasks: [...custom.selectedTasks, task] });
  };

  const removeTask = (task: string) => {
    updateCustom({ selectedTasks: custom.selectedTasks.filter((t) => t !== task) });
  };

  /** 格式化多维表格字段值为可读字符串 */
  const formatFieldValue = (val: any): string => {
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
      // 日期字段值是毫秒时间戳，尝试格式化
      if (val > 1e12) return dayjs(val).format('YYYY-MM-DD HH:mm');
      return String(val);
    }
    return String(val);
  };

  /** 点击节点：查询该任务在该日期的所有原始记录 */
  const handleNodeClick = async (task: string, ts: number) => {
    setDetail({ visible: true, task, ts, records: [], loading: true });
    try {
      const table = await bitable.base.getTableById(tableId);
      const dayStart = startOfDay(ts);
      let allRecords: any[] = [];
      let pageToken: string | undefined;
      // 先用任务字段过滤，再前端按日期筛选（稳妥，不依赖日期 filter 行为）
      do {
        const result: any = await table.getRecords({
          pageSize: 500,
          pageToken,
          filter: {
            conjunction: 'and',
            conditions: [{ fieldId: taskFieldId, operator: 'is', value: [task] }],
          },
        } as any);
        allRecords = allRecords.concat(result.records || []);
        pageToken = result.pageToken;
      } while (pageToken);

      const dayRecords = allRecords.filter((rec: any) => {
        const dateVal = rec.fields?.[dateFieldId];
        const tsVal = Array.isArray(dateVal) ? dateVal[0] : dateVal;
        return tsVal != null && startOfDay(Number(tsVal)) === dayStart;
      });
      setDetail((prev) => ({ ...prev, records: dayRecords, loading: false }));
    } catch (e) {
      console.error('[TimeLine] fetch records failed', e);
      setDetail((prev) => ({ ...prev, records: [], loading: false }));
    }
  };

  const onSave = () => {
    const dataCondition = buildCond(tableId, dataRange, taskFieldId, dateFieldId);
    dashboard.saveConfig({
      dataConditions: dataCondition,
      customConfig: custom,
    } as any);
  };

  // ---- 每个任务计算一条时间线 ----
  const taskModels = useMemo(() => {
    return custom.selectedTasks.map((task) => {
      const done = getDoneDates(renderData, task);
      return { task, model: buildTimeline(done, custom.startDate, Date.now(), custom.showToday) };
    });
  }, [renderData, custom.selectedTasks, custom.startDate]);

  // 渲染完成通知截图
  useEffect(() => {
    const timer = setTimeout(() => {
      dashboard.setRendered().catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
  }, [taskModels]);

  const vertical = custom.orientation === 'vertical';
  const commonEmpty = !tableId && isConfig
    ? t('please.config')
    : custom.selectedTasks.length === 0
    ? t('please.selectTask')
    : '';

  return (
    <main
      style={{ backgroundColor: props.bgColor }}
      className={classNames('tl-main', { 'tl-main-config': isConfig })}
    >
      <div className="tl-container">
        <div className="tl-scroll">
          <div className={vertical ? 'tl-charts-row' : 'tl-charts-col'}>
            {taskModels.map(({ task, model }) => (
              <div key={task} className={vertical ? 'tl-chart-cell' : 'tl-chart-cell-h'}>
                <TimelineChart
                  model={model}
                  custom={custom}
                  title={task}
                  ready={inited || !isConfig}
                  emptyText={commonEmpty}
                  onNodeClick={(ts) => handleNodeClick(task, ts)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {isConfig && inited && (
        <div className="tl-settings">
          <div className="tl-form">
            {/* 标题与图标 */}
            <div className="tl-section">{t('section.title')}</div>
            <Item label={t('label.title')}>
              <Input
                value={custom.title}
                placeholder={custom.selectedTasks[0] || t('label.title')}
                onChange={(v) => updateCustom({ title: v })}
              />
            </Item>
            <Item label={
              <div className="label-checkbox">
                {t('label.showTitle')}
                <Switch checked={custom.showTitle} onChange={(v) => updateCustom({ showTitle: !!v })} />
              </div>
            }>
              <div />
            </Item>
            <Item label={t('label.icon')}>
              <Select
                showSearch
                style={{ width: '100%' }}
                value={custom.icon}
                optionList={ICON_OPTIONS.map((ic) => ({ value: ic, label: ic }))}
                onChange={(v) => updateCustom({ icon: v as string })}
              />
            </Item>

            {/* 数据源 */}
            <div className="tl-section">{t('section.datasource')}</div>
            <Item label={t('label.table')}>
              <Select
                showSearch
                style={{ width: '100%' }}
                value={tableId}
                optionList={tableList.map((x) => ({ value: x.tableId, label: x.tableName }))}
                onChange={(v) => onTableChange(v as string)}
              />
            </Item>
            <Item label={t('label.dataRange')}>
              <Select
                style={{ width: '100%' }}
                value={dataRange ? JSON.stringify(dataRange) : ''}
                optionList={ranges.map((r: any) => ({
                  value: JSON.stringify(r),
                  label: r.type === SourceType.ALL ? t('range.all') : r.viewName,
                }))}
                onChange={(v) => onDataRangeChange(v as string)}
              />
            </Item>

            {/* 字段与任务 */}
            <div className="tl-section">{t('section.fields')}</div>
            <Item label={t('label.taskField')}>
              <Select
                showSearch
                style={{ width: '100%' }}
                value={taskFieldId}
                optionList={categories
                  .filter((c: any) => c.fieldId !== dateFieldId)
                  .map((c: any) => ({ value: c.fieldId, label: c.fieldName }))}
                onChange={(v) => onTaskFieldChange(v as string)}
              />
            </Item>
            <Item label={t('label.dateField')}>
              <Select
                showSearch
                style={{ width: '100%' }}
                value={dateFieldId}
                optionList={categories
                  .filter((c: any) => c.fieldId !== taskFieldId)
                  .map((c: any) => ({ value: c.fieldId, label: c.fieldName }))}
                onChange={(v) => onDateFieldChange(v as string)}
              />
            </Item>
            <Item label={t('label.task')}>
              <div className="tl-task-manager">
                {custom.selectedTasks.length > 0 && (
                  <div className="tl-task-list">
                    {custom.selectedTasks.map((task) => (
                      <div key={task} className="tl-task-chip">
                        <span>{task}</span>
                        <button
                          type="button"
                          className="tl-task-remove"
                          onClick={() => removeTask(task)}
                          title="移除"
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
                <Select
                  showSearch
                  style={{ width: '100%' }}
                  value=""
                  placeholder={t('label.addTask')}
                  optionList={availableTasks
                    .filter((x) => !custom.selectedTasks.includes(x))
                    .map((x) => ({ value: x, label: x }))}
                  onChange={(v) => { if (v) addTask(v as string); }}
                />
              </div>
            </Item>

            {/* 时间范围 */}
            <div className="tl-section">{t('section.time')}</div>
            <Item label={t('label.startDate')}>
              <DatePicker
                style={{ width: '100%' }}
                type="date"
                value={custom.startDate}
                onChange={(d: any) => updateCustom({ startDate: d ? dayjs(d).startOf('day').valueOf() : custom.startDate })}
              />
            </Item>
            <Item label={t('label.endDate')}>
              <Input value={t('label.endDate.today')} disabled />
            </Item>

            {/* 样式 */}
            <div className="tl-section">{t('section.style')}</div>
            <Item label={t('label.orientation')}>
              <Radio.Group
                type="button"
                buttonStyle="solid"
                value={custom.orientation}
                onChange={(e) => updateCustom({ orientation: e.target.value as Orientation })}
                options={[
                  { value: 'vertical', label: t('orientation.vertical') },
                  { value: 'horizontal', label: t('orientation.horizontal') },
                ]}
              />
            </Item>
            <Item label={`${t('label.dayPx')}（${custom.dayPx}px）`}>
              <Slider
                min={5}
                max={30}
                step={1}
                value={custom.dayPx}
                onChange={(v) => updateCustom({ dayPx: v as number })}
              />
            </Item>
            <Item label={`${t('label.minNodeGap')}（${custom.minNodeGap}px）`}>
              <Slider
                min={16}
                max={80}
                step={2}
                value={custom.minNodeGap}
                onChange={(v) => updateCustom({ minNodeGap: v as number })}
              />
            </Item>
            <Item label={`${t('label.nodeRadius')}（${custom.nodeRadius}px）`}>
              <Slider
                min={3}
                max={14}
                step={1}
                value={custom.nodeRadius}
                onChange={(v) => updateCustom({ nodeRadius: v as number })}
              />
            </Item>
            <Item label={`${t('label.lineWidth')}（${custom.lineWidth}px）`}>
              <Slider
                min={1}
                max={6}
                step={0.5}
                value={custom.lineWidth}
                onChange={(v) => updateCustom({ lineWidth: v as number })}
              />
            </Item>
            <Item label={t('label.solidColor')}>
              <div className="tl-color-row">
                <input type="color" value={custom.solidColor} onChange={(e) => updateCustom({ solidColor: e.target.value })} className="tl-color-input" />
                <span className="tl-color-hex">{custom.solidColor}</span>
              </div>
            </Item>
            <Item label={t('label.gapColor')}>
              <div className="tl-color-row">
                <input type="color" value={custom.gapColor} onChange={(e) => updateCustom({ gapColor: e.target.value })} className="tl-color-input" />
                <span className="tl-color-hex">{custom.gapColor}</span>
              </div>
            </Item>
            <Item label={t('label.nodeColor')}>
              <div className="tl-color-row">
                <input type="color" value={custom.nodeColor} onChange={(e) => updateCustom({ nodeColor: e.target.value })} className="tl-color-input" />
                <span className="tl-color-hex">{custom.nodeColor}</span>
              </div>
            </Item>
            <Item label={
              <div className="label-checkbox">
                {t('label.showToday')}
                <Switch checked={custom.showToday} onChange={(v) => updateCustom({ showToday: !!v })} />
              </div>
            }>
              <div />
            </Item>

            <div className="tl-save-row">
              <Button className="tl-btn" theme="solid" onClick={onSave} block>
                {t('confirm')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 节点详情弹窗 */}
      <Modal
        title={
          <span>
            {detail.task} · {dayjs(detail.ts).format('YYYY年M月D日')}
            <span style={{ marginLeft: 8, fontSize: 13, color: '#888' }}>
              共 {detail.records.length} 条记录
            </span>
          </span>
        }
        visible={detail.visible}
        onCancel={() => setDetail((prev) => ({ ...prev, visible: false }))}
        footer={null}
        width={640}
      >
        {detail.loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>加载中…</div>
        ) : detail.records.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>该日期无记录</div>
        ) : (
          <div style={{ maxHeight: 480, overflowY: 'auto' }}>
            {detail.records.map((rec, idx) => (
              <div
                key={rec.recordId || idx}
                style={{
                  marginBottom: 12,
                  padding: 12,
                  border: '1px solid #e8e8e8',
                  borderRadius: 8,
                  background: idx % 2 === 0 ? '#fafafa' : '#fff',
                }}
              >
                <div style={{ fontSize: 12, color: '#999', marginBottom: 6 }}>
                  记录 #{idx + 1}
                </div>
                {categories.map((cat: any) => {
                  const val = rec.fields?.[cat.fieldId];
                  return (
                    <div key={cat.fieldId} style={{ display: 'flex', fontSize: 13, lineHeight: 1.8 }}>
                      <span style={{ minWidth: 90, color: '#666', flexShrink: 0 }}>{cat.fieldName}</span>
                      <span style={{ color: '#333', wordBreak: 'break-all' }}>{formatFieldValue(val)}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </Modal>
    </main>
  );
}

/* ---------------- 时间线 SVG 渲染 ---------------- */

function TimelineChart(props: {
  model: ReturnType<typeof buildTimeline>;
  custom: ICustomConfig;
  title: string;
  ready: boolean;
  emptyText: string;
  onNodeClick?: (ts: number) => void;
}) {
  const { model, custom, title, ready, emptyText, onNodeClick } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 300, h: 300 });

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: Math.max(50, r.width), h: Math.max(50, r.height) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const { w: W, h: H } = size;
  const vertical = custom.orientation === 'vertical';

  if (!ready) {
    return <div ref={containerRef} className="tl-chart empty">…</div>;
  }
  if (emptyText || (model.nodes.length === 0 && model.hollowNodes.length === 0)) {
    return (
      <div ref={containerRef} className="tl-chart empty">
        {emptyText || ''}
      </div>
    );
  }

  const DAY_PX = custom.dayPx;
  const MIN_GAP = custom.minNodeGap;

  // 收集所有节点时间戳（含今天），倒序排列（今天在前），用于保证节点间最小间距
  const allNodeTs = Array.from(
    new Set([...model.nodes, ...model.hollowNodes, model.axisEnd])
  ).sort((a, b) => b - a);

  // 预计算每个节点的坐标位置：相邻节点间距 = max(天数差 * dayPx, minNodeGap)
  const nodePos = new Map<number, number>();
  let xC = W / 2;
  let yC = H / 2;
  let svgW = W;
  let svgH = H;
  let xOf: (ts: number) => number;
  let yOf: (ts: number) => number;

  if (vertical) {
    const padTop = 56, padBottom = 48, padLeft = 48, padRight = 64;
    xC = padLeft + (W - padLeft - padRight) / 2;
    svgW = W;
    let y = padTop;
    for (let i = 0; i < allNodeTs.length; i++) {
      nodePos.set(allNodeTs[i], y);
      if (i < allNodeTs.length - 1) {
        const dayDiff = Math.abs(allNodeTs[i + 1] - allNodeTs[i]) / DAY_MS;
        y += Math.max(dayDiff * DAY_PX, MIN_GAP);
      }
    }
    svgH = y + padBottom;
    yOf = (ts) => nodePos.get(ts) ?? padTop;
    xOf = () => xC;
  } else {
    const padTop = 48, padBottom = 56, padLeft = 60, padRight = 48;
    yC = padTop + (H - padTop - padBottom) / 2;
    svgH = H;
    let x = padLeft;
    for (let i = 0; i < allNodeTs.length; i++) {
      nodePos.set(allNodeTs[i], x);
      if (i < allNodeTs.length - 1) {
        const dayDiff = Math.abs(allNodeTs[i + 1] - allNodeTs[i]) / DAY_MS;
        x += Math.max(dayDiff * DAY_PX, MIN_GAP);
      }
    }
    svgW = x + padRight;
    xOf = (ts) => nodePos.get(ts) ?? padLeft;
    yOf = () => yC;
  }

  const r = custom.nodeRadius;
  const lw = custom.lineWidth;
  const fontSize = 13;
  const numFontSize = 15;
  const todayTs = model.axisEnd;

  return (
    <div ref={containerRef} className="tl-chart">
      <svg width={svgW} height={svgH} style={{ display: 'block' }}>
        {/* 线段 */}
        {model.segments.map((seg, i) => {
          const cx1 = xOf(seg.from), cy1 = yOf(seg.from);
          const cx2 = xOf(seg.to), cy2 = yOf(seg.to);
          const solid = seg.kind === 'streak';
          // to 端点是否有圆（真实节点或空心节点）；有圆则线停在圆边缘，无圆则画到中心
          const toHasCircle = model.nodes.includes(seg.to) || model.hollowNodes.includes(seg.to);
          // 线段端点偏移到圆边缘，不穿过圆心
          let lx1 = cx1, ly1 = cy1, lx2 = cx2, ly2 = cy2;
          if (vertical) {
            if (cy2 > cy1) { ly1 = cy1 + r; if (toHasCircle) ly2 = cy2 - r; }
            else if (cy2 < cy1) { ly1 = cy1 - r; if (toHasCircle) ly2 = cy2 + r; }
          } else {
            if (cx2 > cx1) { lx1 = cx1 + r; if (toHasCircle) lx2 = cx2 - r; }
            else if (cx2 < cx1) { lx1 = cx1 - r; if (toHasCircle) lx2 = cx2 + r; }
          }
          const mx = (lx1 + lx2) / 2, my = (ly1 + ly2) / 2;
          // 天数标注统一放左侧（竖向）/上方（横向）
          let numX = mx, numY = my, anchor: string = 'middle';
          if (vertical) { numX = xC - 14; numY = my; anchor = 'end'; }
          else { numX = mx; numY = yC - 16; anchor = 'middle'; }
          return (
            <g key={i}>
              <line
                x1={lx1} y1={ly1} x2={lx2} y2={ly2}
                stroke={solid ? custom.solidColor : custom.gapColor}
                strokeWidth={lw}
                strokeDasharray={solid ? undefined : '5,5'}
                strokeLinecap="round"
              />
              <text
                x={numX} y={numY}
                textAnchor={anchor as any}
                dominantBaseline="central"
                fontSize={numFontSize}
                fontWeight={600}
                fill={solid ? '#3370ff' : '#f54a45'}
              >
                {seg.days}
              </text>
            </g>
          );
        })}

        {/* 节点圆 + 日期 */}
        {model.nodes.map((ts, i) => {
          const cx = xOf(ts), cy = yOf(ts);
          let dx = cx, dy = cy, dAnchor: any = 'start';
          if (vertical) { dx = cx + 14; dy = cy; dAnchor = 'start'; }
          else { dx = cx; dy = cy + 26; dAnchor = 'middle'; }
          return (
            <g key={`n-${i}`}>
              <circle
                cx={cx} cy={cy} r={r} fill={custom.nodeColor}
                style={{ cursor: onNodeClick ? 'pointer' : 'default' }}
                onClick={() => onNodeClick?.(ts)}
              />
              <text
                x={dx} y={dy}
                textAnchor={dAnchor}
                dominantBaseline="central"
                fontSize={fontSize}
                fill="#7c3aed"
              >
                {formatDate(ts)}
              </text>
            </g>
          );
        })}

        {/* 空心节点（开始日期无任务等） */}
        {model.hollowNodes.map((ts, i) => {
          const cx = xOf(ts), cy = yOf(ts);
          let dx = cx, dy = cy, dAnchor: any = 'start';
          if (vertical) { dx = cx + 14; dy = cy; dAnchor = 'start'; }
          else { dx = cx; dy = cy + 26; dAnchor = 'middle'; }
          return (
            <g key={`h-${i}`}>
              <circle
                cx={cx} cy={cy} r={r} fill="none" stroke={custom.nodeColor} strokeWidth={lw}
                style={{ cursor: onNodeClick ? 'pointer' : 'default' }}
                onClick={() => onNodeClick?.(ts)}
              />
              <text
                x={dx} y={dy}
                textAnchor={dAnchor}
                dominantBaseline="central"
                fontSize={fontSize}
                fill="#7c3aed"
              >
                {formatDate(ts)}
              </text>
            </g>
          );
        })}

        {/* 今天文字标记（今天的圆由 nodes/hollowNodes 统一渲染） */}
        {custom.showToday && (
          <text
            x={vertical ? xOf(todayTs) - 14 : xOf(todayTs)}
            y={vertical ? yOf(todayTs) : yOf(todayTs) - 18}
            textAnchor={vertical ? 'end' : 'middle'}
            dominantBaseline="central"
            fontSize={12}
            fontWeight={600}
            fill={custom.nodeColor}
          >
            今天
          </text>
        )}

        {/* 任务标签 */}
        {custom.showTitle && title && (
          <TaskLabel
            name={title}
            icon={custom.icon}
            x={vertical ? xC : 22}
            y={vertical ? 22 : yC}
            vertical={vertical}
            nodeColor={custom.nodeColor}
          />
        )}
      </svg>
    </div>
  );
}

function TaskLabel(props: {
  name: string;
  icon: string;
  x: number;
  y: number;
  vertical: boolean;
  nodeColor: string;
}) {
  const { name, icon, x, y, vertical, nodeColor } = props;
  const fontSize = 15;
  const iconSize = 16;
  const padX = 14, padY = 8;
  const textW = name.length * fontSize * 0.95 + 6;
  const boxW = textW + iconSize + 8 + padX * 2;
  const boxH = fontSize + padY * 2;
  const rx = 10;
  const bx = vertical ? x - boxW / 2 : x;
  const by = vertical ? y - boxH / 2 : y - boxH / 2;
  const contentStartX = vertical ? x - boxW / 2 + padX : x + padX;
  return (
    <g>
      <rect x={bx} y={by} width={boxW} height={boxH} rx={rx} fill="#f3e8ff" />
      <text
        x={contentStartX + iconSize / 2}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={iconSize}
      >
        {icon}
      </text>
      <text
        x={contentStartX + iconSize + 8 + textW / 2}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fontSize}
        fontWeight={600}
        fill={nodeColor}
      >
        {name}
      </text>
    </g>
  );
}

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  dashboard, bitable, ui, DashboardState, GroupMode, ORDER,
  DATA_SOURCE_SORT_TYPE, SourceType, FieldType, ToastType,
} from '@lark-base-open/js-sdk';
import { Button, DatePicker, Radio, Select, Input, Switch, Slider, Modal } from '@douyinfe/semi-ui';
import dayjs from 'dayjs';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';
import { Item } from '../Item';
import {
  getDoneDates, getTaskValues, buildTimeline, startOfDay,
  extractText, extractTimestamp, formatFieldValue, dateKey, mergePreviewData,
} from './utils';
import { ICustomConfig, DEFAULT_CONFIG, normalizeConfig, Orientation } from './config';
import { TimelineChart } from './TimelineChart';
import { IconPicker } from './IconPicker';

interface ITableMeta {
  ranges: any[];
  categories: any[];
  dataRange: any;
  taskFieldId: string;
  dateFieldId: string;
}

export default function TimeLine(props: { bgColor: string }) {
  const { t } = useTranslation();
  const isCreate = dashboard.state === DashboardState.Create;
  const isConfig = dashboard.state === DashboardState.Config || isCreate;

  const [tableList, setTableList] = useState<{ tableId: string; tableName: string }[]>([]);
  const [tableIds, setTableIds] = useState<string[]>([]);
  const [tableMeta, setTableMeta] = useState<Record<string, ITableMeta>>({});
  const [taskFieldName, setTaskFieldName] = useState('');
  const [dateFieldName, setDateFieldName] = useState('');
  const [availableTasks, setAvailableTasks] = useState<string[]>([]);
  const [renderData, setRenderData] = useState<any>(null);
  const [inited, setInited] = useState(false);
  const [custom, setCustom] = useState<ICustomConfig>(DEFAULT_CONFIG);
  const [detail, setDetail] = useState<{
    visible: boolean; task: string; ts: number; records: any[]; loading: boolean;
  }>({ visible: false, task: '', ts: 0, records: [], loading: false });
  const [recordCountsMap, setRecordCountsMap] = useState<Record<string, Map<string, number>>>({});

  const updateCustom = useCallback((patch: Partial<ICustomConfig>) => {
    setCustom((prev) => ({ ...prev, ...patch }));
  }, []);

  /** 主表 ID（第一个选中的表，用于字段展示和详情模态框） */
  const primaryTableId = tableIds[0] || '';
  const primaryMeta = tableMeta[primaryTableId];

  /** 合并所有选中表的字段名（去重），作为字段选择器的选项 */
  const mergedFields = useMemo(() => {
    const map = new Map<string, { fieldName: string; fieldType: number }>();
    for (const tid of tableIds) {
      const meta = tableMeta[tid];
      if (!meta) continue;
      for (const cat of meta.categories) {
        if (!map.has(cat.fieldName)) {
          map.set(cat.fieldName, { fieldName: cat.fieldName, fieldType: cat.fieldType });
        }
      }
    }
    return Array.from(map.values());
  }, [tableIds, tableMeta]);

  const buildCond = useCallback(
    (tid: string, dr: any, tf: string, df: string) => ({
      tableId: tid,
      dataRange: dr,
      series: 'COUNTA' as const,
      groups: [
        { fieldId: tf, mode: GroupMode.INTEGRATED, sort: { order: ORDER.ASCENDING, sortType: DATA_SOURCE_SORT_TYPE.GROUP } },
        { fieldId: df, mode: GroupMode.INTEGRATED, sort: { order: ORDER.ASCENDING, sortType: DATA_SOURCE_SORT_TYPE.GROUP } },
      ],
    }),
    []
  );

  /** 根据字段名在指定表中查找 fieldId */
  const findFieldId = useCallback((tid: string, fieldName: string): string => {
    const meta = tableMeta[tid];
    if (!meta || !fieldName) return '';
    return meta.categories.find((c: any) => c.fieldName === fieldName)?.fieldId || '';
  }, [tableMeta]);

  /** 对所有选中表分别查询预览数据，合并后返回 */
  const doPreview = useCallback(async () => {
    if (tableIds.length === 0 || !taskFieldName || !dateFieldName) {
      setRenderData(null);
      setAvailableTasks([]);
      return [];
    }
    try {
      const dataList = await Promise.all(
        tableIds.map(async (tid) => {
          const meta = tableMeta[tid];
          if (!meta) return null;
          const tf = findFieldId(tid, taskFieldName);
          const df = findFieldId(tid, dateFieldName);
          if (!tf || !df) return null;
          try {
            return await dashboard.getPreviewData(buildCond(tid, meta.dataRange, tf, df));
          } catch {
            return null;
          }
        })
      );
      const valid = dataList.filter((d): d is any[][] => d != null);
      const merged = mergePreviewData(valid);
      setRenderData(merged);
      const tasks = getTaskValues(merged);
      setAvailableTasks(tasks);
      return tasks;
    } catch (e) {
      console.error('[TimeLine] doPreview failed', e);
      return [];
    }
  }, [tableIds, tableMeta, taskFieldName, dateFieldName, findFieldId, buildCond]);

  /** 全量获取所有选中表的原始记录，按任务+日期统计条数 */
  const fetchAllRecordCounts = useCallback(async () => {
    if (tableIds.length === 0 || !taskFieldName || !dateFieldName) return;
    try {
      const allRecords: any[] = [];
      for (const tid of tableIds) {
        const tf = findFieldId(tid, taskFieldName);
        const df = findFieldId(tid, dateFieldName);
        if (!tf || !df) continue;
        try {
          const table = await bitable.base.getTableById(tid);
          let pageToken: string | undefined;
          let page = 0;
          do {
            const result: any = await table.getRecords({ pageSize: 500, pageToken } as any);
            const recs = result.records || result.items || [];
            for (const rec of recs) {
              rec._tableId = tid;
              allRecords.push(rec);
            }
            pageToken = result.pageToken || result.nextPageToken;
            page++;
            if (page > 20) break;
          } while (pageToken);
        } catch (e) {
          console.error(`[TimeLine] fetch records from table ${tid} failed`, e);
        }
      }

      const counts: Record<string, Map<string, number>> = {};
      for (const rec of allRecords) {
        const fields = rec.fields || rec.fieldValues || {};
        const taskText = extractText(fields[findFieldId(rec._tableId, taskFieldName)]);
        const dateTs = extractTimestamp(fields[findFieldId(rec._tableId, dateFieldName)]);
        if (taskText && dateTs != null) {
          const key = dateKey(dateTs);
          if (!counts[taskText]) counts[taskText] = new Map();
          counts[taskText].set(key, (counts[taskText].get(key) || 0) + 1);
        }
      }
      setRecordCountsMap(counts);
    } catch (e) {
      console.error('[TimeLine] fetchAllRecordCounts failed', e);
    }
  }, [tableIds, taskFieldName, dateFieldName, findFieldId]);

  /** 加载单个表的元数据（ranges + categories），自动匹配字段 */
  const loadTableMeta = useCallback(async (tid: string): Promise<ITableMeta> => {
    const [rgs, cats] = await Promise.all([
      dashboard.getTableDataRange(tid),
      dashboard.getCategories(tid),
    ]);
    const dr = rgs[0];
    const df = cats.find((c: any) => c.fieldType === FieldType.DateTime)?.fieldId || cats[0]?.fieldId || '';
    const tf = cats.find((c: any) => c.fieldId !== df)?.fieldId || '';
    return { ranges: rgs, categories: cats, dataRange: dr, taskFieldId: tf, dateFieldId: df };
  }, []);

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
        if (tid) {
          const meta = await loadTableMeta(tid);
          if (cancelled) return;
          setTableIds([tid]);
          setTableMeta({ [tid]: meta });
          setTaskFieldName(meta.categories.find((c: any) => c.fieldId === meta.taskFieldId)?.fieldName || '');
          setDateFieldName(meta.categories.find((c: any) => c.fieldId === meta.dateFieldId)?.fieldName || '');
        }
      } else {
        const cfg = await dashboard.getConfig();
        const dcList = Array.isArray(cfg.dataConditions) ? cfg.dataConditions : [cfg.dataConditions];
        const saved = (cfg.customConfig || {}) as Partial<ICustomConfig>;
        const merged = normalizeConfig(saved);

        const tids: string[] = [];
        const metaMap: Record<string, ITableMeta> = {};
        let tfName = '';
        let dfName = '';

        for (const dc of dcList) {
          if (!dc?.tableId) continue;
          tids.push(dc.tableId);
          const meta = await loadTableMeta(dc.tableId);
          metaMap[dc.tableId] = {
            ...meta,
            dataRange: dc.dataRange || meta.dataRange,
            taskFieldId: dc.groups?.[0]?.fieldId || meta.taskFieldId,
            dateFieldId: dc.groups?.[1]?.fieldId || meta.dateFieldId,
          };
          if (!tfName) {
            tfName = meta.categories.find((c: any) => c.fieldId === (dc.groups?.[0]?.fieldId || meta.taskFieldId))?.fieldName || '';
          }
          if (!dfName) {
            dfName = meta.categories.find((c: any) => c.fieldId === (dc.groups?.[1]?.fieldId || meta.dateFieldId))?.fieldName || '';
          }
        }
        if (cancelled) return;
        setTableIds(tids);
        setTableMeta(metaMap);
        setTaskFieldName(tfName);
        setDateFieldName(dfName);
        setCustom(merged);
      }
      setInited(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [isConfig, loadTableMeta]);

  // 字段或表变化后重新查询预览数据和记录统计
  useEffect(() => {
    if (!isConfig || !inited) return;
    doPreview().then((tasks) => {
      if (tasks.length && custom.selectedTasks.every((t) => !tasks.includes(t))) {
        updateCustom({ selectedTasks: [tasks[0]] });
      }
    });
    fetchAllRecordCounts();
  }, [tableIds, taskFieldName, dateFieldName, inited]);

  // ---- 展示态 ----
  useEffect(() => {
    if (isConfig) return;
    let off: any;
    (async () => {
      const cfg = await dashboard.getConfig();
      const saved = (cfg.customConfig || {}) as Partial<ICustomConfig>;
      const merged = normalizeConfig(saved);
      setCustom(merged);

      const dcList = Array.isArray(cfg.dataConditions) ? cfg.dataConditions : [cfg.dataConditions];
      const tids: string[] = [];
      const metaMap: Record<string, ITableMeta> = {};
      let tfName = '';
      let dfName = '';

      for (const dc of dcList) {
        if (!dc?.tableId) continue;
        tids.push(dc.tableId);
        try {
          const meta = await loadTableMeta(dc.tableId);
          metaMap[dc.tableId] = {
            ...meta,
            dataRange: dc.dataRange || meta.dataRange,
            taskFieldId: dc.groups?.[0]?.fieldId || meta.taskFieldId,
            dateFieldId: dc.groups?.[1]?.fieldId || meta.dateFieldId,
          };
          if (!tfName) {
            tfName = meta.categories.find((c: any) => c.fieldId === (dc.groups?.[0]?.fieldId || meta.taskFieldId))?.fieldName || '';
          }
          if (!dfName) {
            dfName = meta.categories.find((c: any) => c.fieldId === (dc.groups?.[1]?.fieldId || meta.dateFieldId))?.fieldName || '';
          }
        } catch (e) {
          console.error('load table meta failed', dc.tableId, e);
        }
      }
      setTableIds(tids);
      setTableMeta(metaMap);
      setTaskFieldName(tfName);
      setDateFieldName(dfName);

      // 合并所有表的预览数据
      try {
        const dataList = await Promise.all(
          dcList.map(async (dc: any) => {
            if (!dc?.tableId) return null;
            try {
              return await dashboard.getPreviewData(dc);
            } catch {
              return null;
            }
          })
        );
        const valid = dataList.filter((d): d is any[][] => d != null);
        setRenderData(mergePreviewData(valid));
      } catch (e) {
        console.error('getData failed', e);
      }

      // 记录统计
      if (tids.length && tfName && dfName) {
        // 展示态用 tableMeta 查找 fieldId，需要等 meta 加载完
        setTimeout(() => {
          const counts: Record<string, Map<string, number>> = {};
          (async () => {
            for (const tid of tids) {
              const meta = metaMap[tid];
              if (!meta) continue;
              try {
                const table = await bitable.base.getTableById(tid);
                let pageToken: string | undefined;
                let page = 0;
                do {
                  const result: any = await table.getRecords({ pageSize: 500, pageToken } as any);
                  const recs = result.records || result.items || [];
                  for (const rec of recs) {
                    const fields = rec.fields || rec.fieldValues || {};
                    const taskText = extractText(fields[meta.taskFieldId]);
                    const dateTs = extractTimestamp(fields[meta.dateFieldId]);
                    if (taskText && dateTs != null) {
                      const key = dateKey(dateTs);
                      if (!counts[taskText]) counts[taskText] = new Map();
                      counts[taskText].set(key, (counts[taskText].get(key) || 0) + 1);
                    }
                  }
                  pageToken = result.pageToken || result.nextPageToken;
                  page++;
                  if (page > 20) break;
                } while (pageToken);
              } catch (e) {
                console.error('fetch records failed', tid, e);
              }
            }
            setRecordCountsMap(counts);
          })();
        }, 0);
      }

      off = dashboard.onDataChange((res: any) => setRenderData(res.data));
    })();
    return () => {
      if (off) off();
    };
  }, [isConfig, loadTableMeta]);

  // ---- 配置变更 ----
  const onTablesChange = async (values: string[]) => {
    const newIds = values || [];
    // 加载新增表的元数据
    const newMeta = { ...tableMeta };
    for (const tid of newIds) {
      if (!newMeta[tid]) {
        try {
          newMeta[tid] = await loadTableMeta(tid);
        } catch (e) {
          console.error('load table meta failed', tid, e);
        }
      }
    }
    setTableMeta(newMeta);
    setTableIds(newIds);
    // 如果当前选中的字段名在新表中不存在，自动重新匹配
    if (newIds.length > 0) {
      const firstMeta = newMeta[newIds[0]];
      if (firstMeta) {
        if (!taskFieldName || !firstMeta.categories.find((c: any) => c.fieldName === taskFieldName)) {
          setTaskFieldName(firstMeta.categories.find((c: any) => c.fieldId === firstMeta.taskFieldId)?.fieldName || '');
        }
        if (!dateFieldName || !firstMeta.categories.find((c: any) => c.fieldName === dateFieldName)) {
          setDateFieldName(firstMeta.categories.find((c: any) => c.fieldId === firstMeta.dateFieldId)?.fieldName || '');
        }
      }
    }
  };

  const onDataRangeChange = (tid: string, drJson: string) => {
    const dr = JSON.parse(drJson);
    setTableMeta((prev) => ({
      ...prev,
      [tid]: { ...prev[tid], dataRange: dr },
    }));
  };

  const addTask = (task: string) => {
    if (!task || custom.selectedTasks.includes(task)) return;
    updateCustom({ selectedTasks: [...custom.selectedTasks, task] });
  };

  const removeTask = (task: string) => {
    updateCustom({ selectedTasks: custom.selectedTasks.filter((t) => t !== task) });
  };

  /** 获取某任务的图标和颜色，未配置时回退到全局 */
  const getTaskStyle = (task: string) => {
    const tc = custom.taskConfigs?.[task];
    return {
      icon: tc?.icon || custom.icon,
      color: tc?.color || custom.nodeColor,
    };
  };

  const setTaskStyle = (task: string, patch: { icon?: string; color?: string }) => {
    const cur = custom.taskConfigs?.[task] || { icon: custom.icon, color: custom.nodeColor };
    updateCustom({
      taskConfigs: { ...custom.taskConfigs, [task]: { ...cur, ...patch } },
    });
  };

  /** 点击节点：从所有选中表查询该任务在该日期的所有原始记录 */
  const handleNodeClick = async (task: string, ts: number) => {
    if (tableIds.length === 0) {
      ui.showToast({ toastType: ToastType.error, message: '数据表未初始化，请重新打开插件' });
      return;
    }
    setDetail({ visible: true, task, ts, records: [], loading: true });
    try {
      const dayStart = startOfDay(ts);
      const dayRecords: any[] = [];
      for (const tid of tableIds) {
        const meta = tableMeta[tid];
        if (!meta) continue;
        const tf = findFieldId(tid, taskFieldName);
        const df = findFieldId(tid, dateFieldName);
        if (!tf || !df) continue;
        try {
          const table = await bitable.base.getTableById(tid);
          let pageToken: string | undefined;
          let page = 0;
          do {
            const result: any = await table.getRecords({ pageSize: 500, pageToken } as any);
            const recs = result.records || result.items || [];
            for (const rec of recs) {
              const fields = rec.fields || rec.fieldValues || {};
              const taskText = extractText(fields[tf]);
              const dateTs = extractTimestamp(fields[df]);
              if (taskText === task && dateTs != null && startOfDay(dateTs) === dayStart) {
                rec._tableId = tid;
                dayRecords.push(rec);
              }
            }
            pageToken = result.pageToken || result.nextPageToken;
            page++;
            if (page > 20) break;
          } while (pageToken);
        } catch (e) {
          console.error(`[TimeLine] fetch records from ${tid} failed`, e);
        }
      }

      if (dayRecords.length === 0) {
        setDetail((prev) => ({ ...prev, visible: false }));
        ui.showToast({ toastType: ToastType.warning, message: `${task} · ${dayjs(ts).format('M月D日')} 暂无记录` });
        return;
      }
      setDetail((prev) => ({ ...prev, records: dayRecords, loading: false }));
    } catch (e) {
      console.error('[TimeLine] fetch records failed', e);
      setDetail((prev) => ({ ...prev, records: [], loading: false }));
      ui.showToast({ toastType: ToastType.error, message: '查询记录失败' });
    }
  };

  const openRecordDetail = (recordId: string, tid?: string) => {
    ui.showRecordDetailDialog({ tableId: tid || primaryTableId, recordId });
  };

  const onSave = () => {
    const conditions = tableIds
      .map((tid) => {
        const meta = tableMeta[tid];
        const tf = findFieldId(tid, taskFieldName);
        const df = findFieldId(tid, dateFieldName);
        if (!meta || !tf || !df) return null;
        return buildCond(tid, meta.dataRange, tf, df);
      })
      .filter((c): c is ReturnType<typeof buildCond> => c != null);

    if (conditions.length === 0) {
      ui.showToast({ toastType: ToastType.error, message: '请先选择数据表和字段' });
      return;
    }
    dashboard.saveConfig({
      dataConditions: conditions.length === 1 ? conditions[0] : conditions,
      customConfig: custom,
    } as any);
  };

  // ---- 每个任务计算一条时间线 ----
  const taskModels = useMemo(() => {
    return custom.selectedTasks.map((task) => {
      const done = getDoneDates(renderData, task);
      return {
        task,
        model: buildTimeline(done, custom.startDate, Date.now(), custom.showToday),
        count: done.length,
        recordCounts: recordCountsMap[task],
      };
    });
  }, [renderData, custom.selectedTasks, custom.startDate, custom.showToday, recordCountsMap]);

  // 渲染完成通知截图
  useEffect(() => {
    const timer = setTimeout(() => {
      dashboard.setRendered().catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
  }, [taskModels]);

  const vertical = custom.orientation === 'vertical';
  const commonEmpty = tableIds.length === 0 && isConfig
    ? t('please.config')
    : custom.selectedTasks.length === 0
    ? t('please.selectTask')
    : '';

  // 详情模态框用主表的字段展示
  const detailCategories = primaryMeta?.categories || [];

  return (
    <main
      style={{ backgroundColor: props.bgColor }}
      className={classNames('tl-main', { 'tl-main-config': isConfig })}
    >
      <div className="tl-container">
        <div className="tl-scroll">
          <div className={vertical ? 'tl-charts-row' : 'tl-charts-col'}>
            {taskModels.map(({ task, model, count, recordCounts }) => {
              const ts = getTaskStyle(task);
              return (
                <div key={task} className={vertical ? 'tl-chart-cell' : 'tl-chart-cell-h'}>
                  <TimelineChart
                    model={model}
                    custom={custom}
                    title={task}
                    ready={inited || !isConfig}
                    emptyText={commonEmpty}
                    onNodeClick={(t) => handleNodeClick(task, t)}
                    taskIcon={ts.icon}
                    taskColor={ts.color}
                    count={count}
                    recordCounts={recordCounts}
                  />
                </div>
              );
            })}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <IconPicker
                  value={custom.icon}
                  onChange={(ic) => updateCustom({ icon: ic })}
                  size={34}
                />
                <span style={{ fontSize: 13, color: '#999' }}>点击选择默认图标（未单独配置的任务使用）</span>
              </div>
            </Item>

            {/* 数据源 */}
            <div className="tl-section">{t('section.datasource')}</div>
            <Item label={t('label.table')}>
              <Select
                filter
                multiple
                style={{ width: '100%' }}
                value={tableIds}
                optionList={tableList.map((x) => ({ value: x.tableId, label: x.tableName }))}
                onChange={(v) => onTablesChange(v as string[])}
              />
            </Item>
            {tableIds.length === 1 && primaryMeta && (
              <Item label={t('label.dataRange')}>
                <Select
                  style={{ width: '100%' }}
                  value={primaryMeta.dataRange ? JSON.stringify(primaryMeta.dataRange) : ''}
                  optionList={primaryMeta.ranges.map((r: any) => ({
                    value: JSON.stringify(r),
                    label: r.type === SourceType.ALL ? t('range.all') : r.viewName,
                  }))}
                  onChange={(v) => onDataRangeChange(primaryTableId, v as string)}
                />
              </Item>
            )}

            {/* 字段与任务 */}
            <div className="tl-section">{t('section.fields')}</div>
            <Item label={t('label.taskField')}>
              <Select
                filter
                style={{ width: '100%' }}
                value={taskFieldName}
                optionList={mergedFields
                  .filter((c: any) => c.fieldName !== dateFieldName)
                  .map((c: any) => ({ value: c.fieldName, label: c.fieldName }))}
                onChange={(v) => setTaskFieldName(v as string)}
              />
            </Item>
            <Item label={t('label.dateField')}>
              <Select
                filter
                style={{ width: '100%' }}
                value={dateFieldName}
                optionList={mergedFields
                  .filter((c: any) => c.fieldName !== taskFieldName)
                  .map((c: any) => ({ value: c.fieldName, label: c.fieldName }))}
                onChange={(v) => setDateFieldName(v as string)}
              />
            </Item>
            <Item label={t('label.task')}>
              <div className="tl-task-manager">
                {custom.selectedTasks.length > 0 && (
                  <div className="tl-task-list">
                    {custom.selectedTasks.map((task) => {
                      const ts = getTaskStyle(task);
                      return (
                        <div key={task} className="tl-task-chip" style={{ borderLeftColor: ts.color }}>
                          <IconPicker
                            value={ts.icon}
                            onChange={(ic) => setTaskStyle(task, { icon: ic })}
                            size={30}
                          />
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                            {task}
                          </span>
                          <input
                            type="color"
                            value={ts.color}
                            onChange={(e) => setTaskStyle(task, { color: e.target.value })}
                            className="tl-task-color"
                            title="任务颜色"
                          />
                          <button
                            type="button"
                            className="tl-task-remove"
                            onClick={() => removeTask(task)}
                            title="移除"
                          >×</button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <Select
                  filter
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

      {/* 节点详情模态框 */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>{getTaskStyle(detail.task).icon}</span>
            <span style={{ fontWeight: 600, fontSize: 16 }}>{detail.task}</span>
            <span style={{ color: '#999', fontSize: 14 }}>
              {dayjs(detail.ts).format('YYYY年M月D日 dddd')}
            </span>
            <span style={{
              marginLeft: 'auto', fontSize: 12, padding: '2px 10px',
              borderRadius: 10, background: getTaskStyle(detail.task).color + '22',
              color: getTaskStyle(detail.task).color, fontWeight: 600,
            }}>
              {detail.records.length} 条记录
            </span>
          </div>
        }
        visible={detail.visible}
        onCancel={() => setDetail((prev) => ({ ...prev, visible: false }))}
        footer={null}
        width={680}
        centered
      >
        {detail.loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#999' }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>⏳</div>
            正在加载记录…
          </div>
        ) : (
          <div style={{ maxHeight: 520, overflowY: 'auto', paddingRight: 4 }}>
            {detail.records.map((rec, idx) => {
              const fields = rec.fields || {};
              const taskColor = getTaskStyle(detail.task).color;
              const recTableId = rec._tableId || primaryTableId;
              const recMeta = tableMeta[recTableId];
              const recTaskFieldId = recMeta?.taskFieldId || '';
              return (
                <div
                  key={rec.recordId || idx}
                  style={{
                    marginBottom: 14,
                    padding: '14px 16px',
                    border: '1px solid #f0f0f0',
                    borderLeft: `3px solid ${taskColor}`,
                    borderRadius: 8,
                    background: '#fafbfc',
                  }}
                >
                  <div style={{
                    fontSize: 11, color: '#aaa', marginBottom: 10,
                    letterSpacing: 0.5, fontWeight: 600, display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <span>记录 {String(idx + 1).padStart(2, '0')}{recTableId !== primaryTableId && ` · 来自表 ${recTableId}`}</span>
                    <Button
                      size="small"
                      theme="borderless"
                      style={{ color: taskColor, padding: '2px 8px', height: 'auto' }}
                      onClick={() => openRecordDetail(rec.recordId, recTableId)}
                    >
                      查看原始记录 →
                    </Button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
                    {detailCategories.map((cat: any) => {
                      const display = formatFieldValue(fields[cat.fieldId]);
                      return (
                        <div key={cat.fieldId} style={{
                          display: 'flex', flexDirection: 'column',
                          fontSize: 13, lineHeight: 1.5,
                        }}>
                          <span style={{ color: '#999', fontSize: 11, marginBottom: 1 }}>
                            {cat.fieldName}
                          </span>
                          <span style={{
                            wordBreak: 'break-all',
                            fontWeight: cat.fieldId === recTaskFieldId ? 600 : 400,
                            color: cat.fieldId === recTaskFieldId ? taskColor : '#333',
                          }}>
                            {display}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    </main>
  );
}

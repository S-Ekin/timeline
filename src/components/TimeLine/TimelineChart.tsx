import React, { useEffect, useRef, useState } from 'react';
import { ICustomConfig } from './config';
import { ITimelineModel, formatDate, DAY_MS, dateKey } from './utils';
import { TaskLabel } from './TaskLabel';

interface TimelineChartProps {
  model: ITimelineModel;
  custom: ICustomConfig;
  title: string;
  ready: boolean;
  emptyText: string;
  onNodeClick?: (ts: number) => void;
  taskIcon?: string;
  taskColor?: string;
  count?: number;
  recordCounts?: Map<string, number>;
}

/** SVG 时间线渲染：节点 + 实虚线段 + 天数标注 + 日期 + 任务标签 */
export function TimelineChart({
  model, custom, title, ready, emptyText, onNodeClick, taskIcon, taskColor, count, recordCounts,
}: TimelineChartProps) {
  const icon = taskIcon || custom.icon;
  const nodeColor = taskColor || custom.nodeColor;
  const ringGradId = `ring-grad-${nodeColor.replace('#', '')}`;
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
    const padTop = 56, padBottom = 56, padLeft = 48, padRight = 64;
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
    const padTop = 56, padBottom = 56, padLeft = 56, padRight = 56;
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
  // 标签位置：竖向时间线在上下居中，横向时间线在左右居中并旋转
  const headLabelX = vertical ? xC : 28;
  const headLabelY = vertical ? 24 : yC;
  const tailLabelX = vertical ? xC : svgW - 28;
  const tailLabelY = vertical ? svgH - 24 : yC;
  const headRotate = vertical ? 0 : -90;
  const tailRotate = vertical ? 0 : 90;

  return (
    <div ref={containerRef} className="tl-chart">
      <svg width={svgW} height={svgH} style={{ display: 'block' }}>
        {/* 渐变定义：多记录节点圆环 */}
        <defs>
          <linearGradient id={ringGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={nodeColor} stopOpacity="0.9" />
            <stop offset="50%" stopColor={nodeColor} stopOpacity="0.5" />
            <stop offset="100%" stopColor={nodeColor} stopOpacity="0.15" />
          </linearGradient>
        </defs>
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

        {/* 节点圆 + 日期（日期紧贴轴线） */}
        {model.nodes.map((ts, i) => {
          const cx = xOf(ts), cy = yOf(ts);
          let dx = cx, dy = cy, dAnchor: any = 'start';
          if (vertical) { dx = cx + 10; dy = cy; dAnchor = 'start'; }
          else { dx = cx; dy = cy + 22; dAnchor = 'middle'; }
          const recCount = recordCounts?.get(dateKey(ts)) ?? 1;
          const hasRing = recCount > 1;
          const ringR = r + 4;
          return (
            <g key={`n-${i}`}>
              {hasRing && (
                <circle cx={cx} cy={cy} r={ringR} fill="none" stroke={`url(#${ringGradId})`} strokeWidth={2.5} strokeLinecap="round" />
              )}
              <circle
                cx={cx} cy={cy} r={r} fill={nodeColor}
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
          if (vertical) { dx = cx + 10; dy = cy; dAnchor = 'start'; }
          else { dx = cx; dy = cy + 22; dAnchor = 'middle'; }
          return (
            <g key={`h-${i}`}>
              <circle
                cx={cx} cy={cy} r={r} fill="transparent" stroke={nodeColor} strokeWidth={lw}
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
            fill={nodeColor}
          >
            今天
          </text>
        )}

        {/* 头部任务标签 */}
        {custom.showTitle && title && (
          <TaskLabel
            name={title}
            icon={icon}
            x={headLabelX}
            y={headLabelY}
            rotate={headRotate}
            nodeColor={nodeColor}
            count={count}
            startTs={model.axisStart}
            endTs={model.axisEnd}
          />
        )}

        {/* 尾部任务标签 */}
        {custom.showTitle && title && (
          <TaskLabel
            name={title}
            icon={icon}
            x={tailLabelX}
            y={tailLabelY}
            rotate={tailRotate}
            nodeColor={nodeColor}
            count={count}
            startTs={model.axisStart}
            endTs={model.axisEnd}
          />
        )}
      </svg>
    </div>
  );
}

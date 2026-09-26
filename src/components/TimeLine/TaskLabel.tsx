import React from 'react';
import dayjs from 'dayjs';

interface TaskLabelProps {
  name: string;
  icon: string;
  x: number;
  y: number;
  vertical: boolean;
  nodeColor: string;
  count?: number;
  startTs?: number;
  endTs?: number;
}

/** SVG 任务标签（圆角矩形 + 图标 + 名称 + 总次数），hover 显示时间范围 */
export function TaskLabel({ name, icon, x, y, vertical, nodeColor, count, startTs, endTs }: TaskLabelProps) {
  const fontSize = 15;
  const iconSize = 16;
  const padX = 14, padY = 8;
  const countText = count != null ? ` × ${count}` : '';
  const fullText = name + countText;
  const textW = fullText.length * fontSize * 0.95 + 6;
  const boxW = textW + iconSize + 8 + padX * 2;
  const boxH = fontSize + padY * 2;
  const rx = 10;
  const bx = vertical ? x - boxW / 2 : x;
  const by = vertical ? y - boxH / 2 : y - boxH / 2;
  const contentStartX = vertical ? x - boxW / 2 + padX : x + padX;

  const tooltip = startTs != null && endTs != null
    ? `${name}  ${dayjs(startTs).format('YYYY-MM-DD')} ~ ${dayjs(endTs).format('YYYY-MM-DD')}${count != null ? `  共 ${count} 次` : ''}`
    : name;

  return (
    <g style={{ cursor: 'default' }}>
      <title>{tooltip}</title>
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
        {countText && (
          <tspan fill="#999" fontWeight={400}>{countText}</tspan>
        )}
      </text>
    </g>
  );
}

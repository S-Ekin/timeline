import React from 'react';
import dayjs from 'dayjs';

interface TaskLabelProps {
  name: string;
  icon: string;
  x: number;
  y: number;
  nodeColor: string;
  count?: number;
  startTs?: number;
  endTs?: number;
  /** 竖排文字：一字一行，从上到下（横向时间线左右两侧用） */
  verticalText?: boolean;
}

/** SVG 任务标签（圆角矩形 + 图标 + 名称 + 总次数），hover 显示时间范围 */
export function TaskLabel({ name, icon, x, y, nodeColor, count, startTs, endTs, verticalText = false }: TaskLabelProps) {
  const tooltip = startTs != null && endTs != null
    ? `${name}  ${dayjs(startTs).format('YYYY-MM-DD')} ~ ${dayjs(endTs).format('YYYY-MM-DD')}${count != null ? `  共 ${count} 次` : ''}`
    : name;

  if (verticalText) {
    const fontSize = 14;
    const iconSize = 16;
    const padX = 7, padY = 10;
    const lineH = fontSize + 3;
    const chars = Array.from(name);
    const countStr = count != null ? `×${count}` : '';
    const countFontSize = 11;
    const contentH = iconSize + 6 + chars.length * lineH + (countStr ? 6 + countFontSize : 0);
    const boxW = Math.max(fontSize + 4, iconSize) + padX * 2;
    const boxH = contentH + padY * 2;
    const rx = 10;
    const bx = x - boxW / 2;
    const by = y - boxH / 2;
    let cy = by + padY + iconSize / 2;

    return (
      <g style={{ cursor: 'default' }}>
        <title>{tooltip}</title>
        <rect x={bx} y={by} width={boxW} height={boxH} rx={rx} fill="#f3e8ff" />
        <text x={x} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={iconSize}>
          {icon}
        </text>
        cy += iconSize / 2 + 6 + lineH / 2;
        {chars.map((ch, i) => (
          <text
            key={i}
            x={x}
            y={cy + i * lineH}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={fontSize}
            fontWeight={600}
            fill={nodeColor}
          >
            {ch}
          </text>
        ))}
        {countStr && (
          <text
            x={x}
            y={cy + chars.length * lineH + 6 + countFontSize / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={countFontSize}
            fill="#999"
          >
            {countStr}
          </text>
        )}
      </g>
    );
  }

  // 横排文字（竖向时间线上下用）
  const fontSize = 15;
  const iconSize = 16;
  const padX = 14, padY = 8;
  const countText = count != null ? ` × ${count}` : '';
  const fullText = name + countText;
  const textW = fullText.length * fontSize * 0.95 + 6;
  const boxW = textW + iconSize + 8 + padX * 2;
  const boxH = fontSize + padY * 2;
  const rx = 10;
  const bx = x - boxW / 2;
  const by = y - boxH / 2;
  const contentStartX = x - boxW / 2 + padX;

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

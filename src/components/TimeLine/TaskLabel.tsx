import React from 'react';

interface TaskLabelProps {
  name: string;
  icon: string;
  x: number;
  y: number;
  vertical: boolean;
  nodeColor: string;
}

/** SVG 任务标签（圆角矩形 + 图标 + 文字） */
export function TaskLabel({ name, icon, x, y, vertical, nodeColor }: TaskLabelProps) {
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

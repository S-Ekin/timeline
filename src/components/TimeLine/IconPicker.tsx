import React, { useState } from 'react';
import { Popover } from '@douyinfe/semi-ui';
import { ICON_OPTIONS } from './config';

interface IconPickerProps {
  value: string;
  onChange: (icon: string) => void;
  size?: number;
}

/** 图标选择器：Popover + 网格图标列表 */
export function IconPicker({ value, onChange, size = 30 }: IconPickerProps) {
  const [visible, setVisible] = useState(false);
  return (
    <Popover
      visible={visible}
      onVisibleChange={setVisible}
      trigger="click"
      position="bottomLeft"
      content={
        <div className="tl-icon-picker">
          {ICON_OPTIONS.map((ic) => (
            <button
              key={ic}
              className={`tl-icon-picker-item ${ic === value ? 'active' : ''}`}
              onClick={() => { onChange(ic); setVisible(false); }}
              title={ic}
            >
              {ic}
            </button>
          ))}
        </div>
      }
    >
      <button className="tl-icon-picker-trigger" style={{ width: size, height: size, fontSize: size * 0.55 }}>
        {value}
      </button>
    </Popover>
  );
}

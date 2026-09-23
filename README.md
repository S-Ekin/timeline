# TimeLine 时间线插件

飞书多维表格仪表盘插件：从指定开始日期到今天，按天展示某任务的完成情况。

- **实线**：连续完成（连续打卡）段，蓝色数字标注该段持续天数
- **虚线**：中断（缺卡）段，红色数字标注中断天数
- 深色圆点标记每段的起止日期，右侧标注 `M-D` 日期
- 支持**竖向**与**横向**两种布局
- 自动适配浅色 / 深色主题

## 数据来源

插件通过仪表盘计算接口读取多维表格：

- `groups = [任务字段, 日期字段]`，`series = COUNTA`
- 结果第一列为各任务名，表头各列为日期；选中任务后，某日期计数 > 0 即视为当天完成该任务

## 本地开发

```bash
# Node 16.19+（部署环境为 16.19.0）
npm install
npm run dev      # 本地调试
npm run build    # 产物输出到 dist（package.json 已设置 output: dist）
```

## 在仪表盘中使用

1. 新建 / 打开仪表盘 → 添加组件 → 更多 → 添加自定义插件
2. 填入本地 dev 地址或部署后的 `dist` 静态地址
3. 在右侧配置：
   - 数据表、数据范围（全部 / 视图）
   - 任务字段（记录任务名的字段）、日期字段（记录日期的字段）
   - 选择要追踪的具体任务
   - 开始日期（时间线起点）
   - 布局方向：竖向 / 横向
4. 点击「确定」进入展示态

## 目录结构

```
timeLine/
├── index.html
├── vite.config.js          # base: './'，semi 主题
├── package.json            # output: dist
├── public/favicon.svg
└── src/
    ├── index.tsx           # 入口
    ├── App.tsx             # 挂载主题与 TimeLine
    ├── hooks.ts            # 主题跟随
    ├── App.scss            # 主题色变量
    ├── locales/            # 中 / 英 / 日 国际化
    └── components/
        ├── LoadApp/        # 语言 Provider
        ├── Item/           # 配置表单项
        └── TimeLine/
            ├── index.tsx   # 主组件：配置面板 + SVG 渲染
            ├── utils.ts    # 数据解析与时间线算法
            └── style.scss
```

## 发布

按官方指南构建后，将 `dist` 目录部署到任意静态服务，或提交发布到插件中心。

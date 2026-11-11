# 车险出单智能体前端

基于 Vue 3、TypeScript 和 Vite 的车险智能出单前端，包含客户出单、会话记忆、报价核保流程，以及业务员人工接管工作台。

## 功能

- 客户登录、业务员登录和注册
- 双 Token 登录与浏览器端敏感请求加密
- 车险方案推荐、自然语言修改和金融报价卡
- 行驶证、身份证成对上传及图片粘贴
- 聊天中断、重试、复制和会话记录恢复
- 会话删除、批量删除和跨刷新记忆
- 业务员工单队列、人工接管与 OCR 信息补录
- 知识库来源展示和规则校验提示
- 当前筛选条件下的 Excel 报表导出

## 技术栈

- Vue 3
- TypeScript
- Vite
- Pinia
- Vue Router
- ESLint + Prettier + Oxlint

## 目录结构

```text
src/
├─ api/                 # API 客户端、数据类型和浏览器端加密
├─ components/
│  ├─ business/         # 报价、支付和保单组件
│  ├─ chat/             # 聊天消息、附件和快捷操作
│  └─ common/           # 通用流程组件
├─ router/              # 路由与权限守卫
├─ stores/              # 用户、会话和全局 UI 状态
├─ styles/              # 全局样式与设计变量
├─ views/               # 登录、客户出单和业务员工作台
├─ App.vue
├─ constants.ts
└─ main.ts
```

## 本地开发

```bash
npm install
cp .env.example .env
npm run dev
```

默认后端地址：

```env
VITE_API_BASE_URL=http://localhost:8000
```

## 常用命令

```bash
npm run dev
npm run build
npm run lint
npm run format
```

## 后端

前端依赖同一工作区中的 `backed` 服务，包括登录鉴权、会话持久化、知识库检索、人工接管和报表导出接口。

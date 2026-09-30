# Changelog / 更新记录

## 1.0.1

### 简体中文

- 显式声明插槽、模型目录和会话服务依赖，等待服务就绪后加载。
- 模型目录查询失败时继续尝试会话模型投影，避免异常直接阻断回退路径。
- 新增模型状态诊断：开发者工具中可读取 `window.__DSH_PEAK_STATUS__`，仅包含提供方、模型、数据来源和加载状态。
- 增加服务依赖和目录查询失败回退的回归测试。
- **验证状态：**全部自动化测试通过；用户此前反馈新旧会话均未显示圆点，本版本在实际 GUI 中的显示恢复尚未确认，不应视为已完成端到端验证。

### English

- Declare slot, model directory, and session dependencies explicitly so the plugin waits for its services.
- Fall back to the session model projection when directory lookup throws instead of abandoning the fallback path.
- Add model-state diagnostics via `window.__DSH_PEAK_STATUS__` in developer tools. It contains only provider, model, source, and loading status.
- Add regression coverage for dependency declarations and directory-error fallback.
- **Verification status:** all automated tests pass. The user previously reported missing indicators in both new and existing sessions; restored visibility in the live GUI has not yet been confirmed. This is not an end-to-end verified fix.

## 1.0.0

Initial source release with bilingual documentation, a maintained 2026 calendar, provider filtering, tooltip details, and automated tests.

初始源码版本：双语说明、2026 年日历、提供方筛选、悬停提示及自动化测试。

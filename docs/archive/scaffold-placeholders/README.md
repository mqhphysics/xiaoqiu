# 早期占位目录说明

P0 曾在根目录预留 `scripts/`、`tests/e2e/` 和 `tests/fixtures/`：

- 可重复工程脚本原计划放入 `scripts/`。
- 跨应用端到端测试原计划放入 `tests/e2e/`。
- Golden Fixture 原计划放入 `tests/fixtures/`。

这些目录尚无实际代码。当前测试跟随各应用存放，演示 Fixture 位于 `apps/api/src/database/`；因此移除空占位目录，只保留本说明供追溯。

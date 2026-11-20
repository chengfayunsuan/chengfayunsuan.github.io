-- 问卷重复参与设置
-- 0 = 每个账号只能参与一次（默认，防止重复领奖）
-- 1 = 只有站长与管理员可以重复进入（测试用）
-- 2 = 所有人可以重复参与
ALTER TABLE surveys ADD COLUMN repeat_mode INTEGER DEFAULT 0;

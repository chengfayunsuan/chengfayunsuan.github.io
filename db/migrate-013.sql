-- 013 · 等级改回由经验结算
-- 背景：migrate-012 之后「每日登录 +1」写成了 level = level + 1，
-- 直接给等级加 1，和经验值脱节（经验还是 0，等级却涨了）。
-- 正确规则是经验加减、等级由经验结算：第 n 级区间 (n-1)^2*100 ~ n^2*100。
-- 这里把现有数据全部按经验重算一次，语句幂等，重复执行结果不变。
UPDATE users
   SET level = CASE
         WHEN exp < 0 THEN 0
         WHEN exp = 0 THEN 1
         ELSE CAST(SQRT(exp / 100.0) AS INTEGER) + 1
       END;

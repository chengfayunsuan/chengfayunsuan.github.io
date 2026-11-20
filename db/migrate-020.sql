-- 020 · 问卷支持站内作答
-- 原来的问卷只有「入口链接」，点开跳到问卷商的页面，本站看不到答卷。
-- 这里加一份题面（paper），发布后可以在站内答题，服务端按选项判定结局。
ALTER TABLE surveys ADD COLUMN paper TEXT NOT NULL DEFAULT '';
ALTER TABLE surveys ADD COLUMN kind TEXT NOT NULL DEFAULT 'link';

-- 参与记录补上作答过程，用来算用时、判断打回是否到点
ALTER TABLE survey_joins ADD COLUMN stage TEXT NOT NULL DEFAULT '';
ALTER TABLE survey_joins ADD COLUMN answers TEXT NOT NULL DEFAULT '';
ALTER TABLE survey_joins ADD COLUMN elapsed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE survey_joins ADD COLUMN due_at TEXT NOT NULL DEFAULT '';

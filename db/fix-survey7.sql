-- 把实验台时期留下的空壳问卷补成一份真正能答的模拟问卷
-- 原来 kind=link 且没有 entry_url，大厅显示「暂未开放」，后台也编辑不了题目
UPDATE surveys SET
  provider = '站内自测',
  kind = 'inline',
  status = 'open',
  paper = '{"questions":[{"q":"你的年龄段","options":["18–24 岁","25–34 岁","35–44 岁","45 岁以上"]},{"q":"你每天上网多久","options":["1 小时以内","1–3 小时","3–6 小时","6 小时以上"]},{"q":"这一单要跑哪个结局（测试用，选哪个就出哪个）","options":[{"label":"正常通过，发奖励","outcome":"success"},{"label":"接口失败，答卷没保存","outcome":"fail"},{"label":"答太快，判超速作废","outcome":"speed"},{"label":"名额已满，进不去","outcome":"quota"},{"label":"筛选题不符，被踢出","outcome":"kick"},{"label":"先入账，30 秒后被打回","outcome":"reject"}]}]}',
  updated_at = datetime('now','+8 hours')
WHERE id = 7;

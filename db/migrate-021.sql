-- 访问日志再补两个字段，用来分辨「真人浏览器」和「脚本/探测」
-- lang : Accept-Language，真浏览器一定有；脚本常常不带
-- fetch: Sec-Fetch-Mode，Chrome/Edge/Safari 发起的页面跳转固定是 navigate
ALTER TABLE visits ADD COLUMN lang TEXT DEFAULT '';
ALTER TABLE visits ADD COLUMN fetch TEXT DEFAULT '';

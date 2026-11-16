export const petNames = Object.freeze(`
小朵 糯米 芝麻 点点 松子 桃酥 栗子 杏仁 阿团 花生 奶糖 小满 饼干 米粒 绒球 豆花
汤圆 米糕 麻薯 花卷 糖糕 豆包 芋圆 蛋卷 年糕 烧麦 藕粉 桂糕 雪饼 云吞 馒头 豆沙
麦芽 米酥 糖球 豆皮 玉米 红薯 南瓜 青豆 冬瓜 芋头 莲蓉 糖藕 布丁 果冻 软糖 雪糕
果酱 奶盖 可可 拿铁 奶泡 奶酪 奶黄 抹茶 乌龙 果茶 蜜糖 冰粉 甜筒 酸奶 松饼 蛋挞
小柚 青梅 橘子 橙子 柿子 杨桃 山楂 荔枝 龙眼 莲雾 葡萄 蜜瓜 杏子 李子 樱桃 枇杷
青枣 金桔 桑葚 蓝莓 草莓 白桃 杨梅 苹果 柠檬 甘蔗 无花果 石榴 西柚 椰子 梨儿 桃仁
茉莉 白兰 桂花 海棠 木槿 紫苏 丁香 鸢尾 铃兰 雏菊 月桂 栀子 含笑 迎春 玉兰 芍药
青葵 木棉 白芷 茶花 兰草 秋葵 薄荷 云杉 水杉 榆钱 松果 橡果 柳絮 芦苇 莲子 苜蓿
春芽 夏叶 秋实 冬青 小葱 青笋 毛栗 竹笋 芦花 荷叶 桐花 芽尖 青禾 青竹 艾草 三叶
朝露 晚霞 夕照 星星 云朵 彩虹 月牙 晴天 小雨 雨滴 晨雾 霜花 雪团 露珠 海风 山岚
晨星 弯月 银河 星屑 清晖 朝阳 秋分 夏至 春分 白露 立夏 冬至 芒种 谷雨 雨水 初晴
山雀 海盐 溪石 圆石 沙洲 青川 溪流 小舟 竹筏 贝壳 珍珠 珊瑚 银沙 泉眼 涟漪 潮汐
风铃 纸鸢 铃铛 铜铃 纽扣 毛线 绒帽 丝带 风筝 纸船 风车 绣球 花灯 小鼓 团扇 阿绵
木木 阿柴 甜勺 果果 小篓 棠棠 纸鹤 书书 墨滴 竹笛 琴儿 皮皮 桃仔 棉仔 彩彩 铃鼓
团团 圆圆 蓬蓬 暖暖 悠悠 朵朵 萌萌 跳跳 笑笑 呼呼 啾啾 嘟嘟 咕咕 扑扑 弯弯 蹦蹦
绵绵 甜甜 酥酥 噗噗 轻轻 转转 滚滚 绒绒 眯眯 囡囡 闪闪 泡泡 斑斑 星仔 芝仔 果仔
乌梅 阿栗 阿禾 阿梨 阿竹 阿诺 阿布 阿桃 阿杏 阿圆 阿橘 阿蓉 阿巧 阿福 阿乐 阿夏
小溪 小岛 小丘 小径 小桥 小苗 小枝 小瓣 小蕊 小穗 小藤 小葵 小榛 小枫 小栎 小蕨
梨窝 酒窝 眉豆 雪顶 乌豆 金豆 米白 桂圆 青团 麦香 灯芯 琥珀 云母 青瓷 墨玉 青苔 余晖
圆耳 歪耳 短尾 花尾 绒爪 雪爪 棉絮 棉桃 灰团 黑豆 白袜 花袖 半糖 满月 轻舟 飞絮
`.trim().split(/\s+/));

// 在售幼体和已经生成的待产幼体也要占名，直到离店或换批。
export function occupiedPetNames(s, excludedOffers = []) {
  const used = new Set(s.pets.map(p => p.name));
  for (const room of Object.values(s.rooms)) {
    for (const p of room.shelf?.offers ?? []) {
      if (p && !excludedOffers.includes(p)) used.add(p.name);
    }
    for (const p of room.job?.offspring ?? []) used.add(p.name);
  }
  return used;
}

export function takePetName(used, roll, preferred) {
  let name = preferred;
  if (!name || used.has(name)) {
    const start = Math.floor(roll * petNames.length);
    for (let offset = 0; offset < petNames.length; offset++) {
      name = petNames[(start + offset) % petNames.length];
      if (!used.has(name)) break;
    }
    if (used.has(name)) {
      const base = petNames[start];
      let number = 2;
      do { name = base + '·' + number++; } while (used.has(name));
    }
  }
  used.add(name);
  return name;
}

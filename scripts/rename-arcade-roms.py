#!/usr/bin/env python3
"""
街机ROM重命名脚本
- 将ROM文件重命名为中文名
- 处理重复版本，每个游戏只保留一份
"""

import os
import shutil
from pathlib import Path

# 街机游戏中文名映射表
ARCADE_GAMES = {
    # 拳皇系列
    'kof94': '拳皇94', 'kof95': '拳皇95', 'kof96': '拳皇96', 'kof97': '拳皇97',
    'kof98': '拳皇98', 'kof98umh': '拳皇98终极对决', 'kof99': '拳皇99',
    'kof2000': '拳皇2000', 'kof2001': '拳皇2001', 'kof2002': '拳皇2002',
    'kof2003': '拳皇2003', 'kf2k3pcb': '拳皇2003PCB',
    # 街霸系列
    'sf': '街头霸王', 'sf2': '街头霸王2', 'sf2ce': '街头霸王2冠军版',
    'sf2hf': '街头霸王2加速版', 'ssf2': '超级街头霸王2', 'ssf2t': '超级街头霸王2X',
    'sfa': '少年街霸', 'sfa2': '少年街霸2', 'sfa3': '少年街霸3',
    'sfz2al': '少年街霸2Alpha', 'sfzch': '少年街霸Zero',
    'sfex': '街头霸王EX', 'sfex2': '街头霸王EX2', 'sfex2p': '街头霸王EX2Plus',
    'sfexp': '街头霸王EXPlus', 'sfiii': '街头霸王3', 'sfiii2': '街头霸王3二度冲击',
    'sfiii3': '街头霸王3三度冲击', 'hsf2': '超级街头霸王2合集',
    # VS系列
    'msh': '漫威超级英雄', 'mshvsf': '漫威超级英雄VS街霸', 'mvsc': '漫威VS卡普空',
    'xmcota': 'X战警天启之子', 'xmvsf': 'X战警VS街霸',
    'vsav': '恶魔战士3', 'vsav2': '恶魔战士3猎人2', 'nwarr': '恶魔战士',
    'dstlk': '恶魔战士', 'vhunt2': '恶魔猎人2',
    # 侍魂系列
    'samsho': '侍魂', 'samsho2': '侍魂2', 'samsho3': '侍魂3',
    'samsho4': '侍魂4', 'samsho5': '侍魂5', 'samsh5sp': '侍魂5特别版',
    # 饿狼传说系列
    'fatfury1': '饿狼传说', 'fatfury2': '饿狼传说2', 'fatfury3': '饿狼传说3',
    'fatfursp': '饿狼传说特别版', 'rbff1': '饿狼传说真传', 'rbff2': '饿狼传说真传2',
    'rbffspec': '饿狼传说真传特别版', 'garou': '饿狼狼之印记',
    # 龙虎之拳/月华剑士
    'aof': '龙虎之拳', 'aof2': '龙虎之拳2', 'aof3': '龙虎之拳3',
    'lastblad': '月华剑士', 'lastbld2': '月华剑士2',
    # 世界英雄等
    'wh1': '世界英雄', 'wh2': '世界英雄2', 'wh2j': '世界英雄2喷气机', 'whp': '世界英雄完美版',
    'kizuna': '风云默示录', 'breakers': '破坏者', 'breakrev': '破坏者复仇',
    'matrim': '新婚大作战', 'svc': 'SNK对卡普空', 'svcpcb': 'SNK对卡普空PCB',
    'rotd': '龙之怒', 'kabukikl': '歌舞伎一刀涼談', 'gowcaizr': '超人学园',
    'fightfev': '格斗热', 'galaxyfg': '银河格斗', 'wjammers': '飞盘大战',
    'jojo': 'JOJO奇妙冒险', 'jojoba': 'JOJO奇妙冒险未来遗产',
    # 铁拳/真人快打
    'tekken': '铁拳', 'tekken2': '铁拳2', 'tekken3': '铁拳3', 'tektagt': '铁拳TT',
    'soulclbr': '魂之利刃', 'souledge': '刀魂',
    'mk': '真人快打', 'mk2': '真人快打2', 'mk3': '真人快打3', 'mk4': '真人快打4',
    'umk3': '终极真人快打3', 'kinst': '杀手本能', 'kinst2': '杀手本能2',
    # 合金弹头系列
    'mslug': '合金弹头', 'mslug2': '合金弹头2', 'mslug3': '合金弹头3',
    'mslug4': '合金弹头4', 'mslug5': '合金弹头5', 'mslugx': '合金弹头X',
    'ms5pcb': '合金弹头5PCB', 'ms': '合金弹头',
    # 清版动作
    'dino': '恐龙快打', 'punisher': '惩罚者', 'captcomm': '名将',
    'knights': '圆桌骑士', 'kod': '龙王', 'wof': '三国志吞食天地2',
    'wofch': '三国志吞食天地2中文', 'ffight': '快打旋风', 'ffreveng': '快打旋风复仇',
    'ddragon2': '双截龙2', 'ddragon3': '双截龙3',
    'aliens': '异形', 'avsp': '异形对铁血战士', 'batcir': '蝙蝠侠',
    'ddsom': '龙与地下城暗黑秘影', 'ddtod': '龙与地下城毁灭之塔',
    'simpsons': '辛普森一家', 'tmnt': '忍者神龟', 'tmnt2': '忍者神龟2',
    'xmen': 'X战警', 'bucky': '巴乔与兰巴达', 'vendetta': '暴力刑警',
    'ssriders': '日落骑士', 'gijoe': '特种部队', 'metamrph': '变形战士',
    'mystwarr': '神秘战士', 'viostorm': '暴力风暴', 'btoads': '忍者蛙',
    'ctribe': '战斗部落', 'growl': '咆哮', 'hook': '铁钩船长',
    'cadash': '卡达什', 'arabianm': '阿拉伯魔法',
    # 彩京射击
    'gunbird': '武装飞鸟', 'gunbird2': '武装飞鸟2',
    's1945': '打击者1945', 's1945ii': '打击者1945二', 's1945iii': '打击者1945三',
    's1945p': '打击者1945Plus', 'tengai': '战国之刃', 'samuraia': '战国ACE',
    'dragnblz': '龙之火焰', 'gnbarich': '弹珠汽水',
    # 东亚计划射击
    'batsugun': '究极虎', 'truxton2': '究极虎2', 'dogyuun': '怒首领蜂',
    'batrider': '武装飞鸟骑士', 'bbakraid': '武装飞鸟骑士2', 'bgaregga': '武装飞鸟',
    'fixeight': '修复8', 'grindstm': '磨砺风暴', 'kbash': '钢铁之拳', 'kbash2': '钢铁之拳2',
    # CAVE射击
    'donpachi': '首领蜂', 'ddonpach': '怒首领蜂', 'ddp2': '怒首领蜂2', 'ddp3': '怒首领蜂3',
    'ddpdfk': '怒首领蜂大复活', 'ddpdojt': '怒首领蜂大往生',
    'esprade': 'ESP镭', 'espgal': 'ESP伽利略', 'espgal2': 'ESP伽利略2',
    'guwange': '愿望', 'progear': '前进装甲', 'deathsml': '死亡微笑',
    'mushisam': '虫姬', 'mushitam': '虫姬玉', 'futari15': '虫姬双人版',
    'futaribl': '虫姬双人黑标', 'ibara': '荆棘', 'ibarablk': '荆棘黑标',
    'pinkswts': '粉红糖果', 'akatana': '赤刀',
    # 其他射击
    '1941': '1941反击战', '1944': '1944征服者', '1945kiii': '1945K3', '19xx': '19XX',
    'gigawing': '超级翅膀', 'mmatrix': '火星矩阵', 'dimahoo': '大魔法峠',
    'varth': '战区88', 'mercs': '战场之狼2', 'strider': '出击飞龙',
    'ghouls': '魔界村', 'cawing': '战区', 'forgottn': '失落的世界',
    'unsquad': '战区88', 'area51': '51区', 'raiden': '雷电', 'raiden2': '雷电2',
    'raidendx': '雷电DX', 'strikers': '打击者',
    # 平台/益智
    'snowbros': '雪人兄弟', 'snowbro2': '雪人兄弟2', 'snowbro3': '雪人兄弟3',
    'tumblep': '翻滚小子', 'bublbobl': '泡泡龙', 'bublbob2': '泡泡龙2',
    'pbobble': '泡泡龙', 'pbobble2': '泡泡龙2', 'pbobble3': '泡泡龙3',
    'pbobble4': '泡泡龙4', 'pbobblen': '泡泡龙Neo', 'pbobbl2n': '泡泡龙2Neo',
    'toki': '东奇', 'rodland': '罗德兰', 'bonkadv': '大头冒险',
    'spinmast': '旋转大师', 'magdrop2': '魔法宝石2', 'magdrop3': '魔法宝石3',
    'pang': '砰', 'pang3': '砰3', 'spang': '超级砰', 'bjtwin': '爆裂双子',
    'tetris': '俄罗斯方块', 'tetrisp': '俄罗斯方块Plus', 'tetrisp2': '俄罗斯方块Plus2',
    'puyo': '噗哟噗哟', 'puyosun': '噗哟噗哟太阳', 'puzzloop': '循环方块',
    'pzloop2': '循环方块2', 'puzzledp': '益智泡泡', 'gururin': '咕噜咕噜',
    # 体育
    'nbajam': 'NBA嘉年华', 'nbajamte': 'NBA嘉年华TE', 'nbajamex': 'NBA嘉年华极限版',
    'nbahangt': 'NBA空中接力', 'nbapbp': 'NBA季后赛', 'hoops96': '街头篮球96',
    '3on3dunk': '三对三灌篮', 'rungun': '跑轰', 'rungun2': '跑轰2',
    'ssideki': '超级边锋', 'ssideki2': '超级边锋2', 'ssideki3': '超级边锋3',
    'ssideki4': '超级边锋4', 'soccerss': '超级足球', 'twcup90': '90世界杯',
    'pgoal': '点球大战', 'pwrgoal': '力量足球', 'footchmp': '足球冠军',
    'cupfinal': '杯赛决赛', 'bstars': '棒球之星', 'bstars2': '棒球之星2',
    '2020bb': '2020超级棒球', 'pspikes': '超级排球', 'pspikes2': '超级排球2',
    'turfmast': '高尔夫大师', 'tpgolf': '顶级高尔夫', 'sslam': '超级摔跤',
    'wwfmania': 'WWF狂热', 'wwfwfest': 'WWF摔跤节', 'wwfsstar': 'WWF超级明星',
    # 赛车
    'outrun': '越野赛车', 'toutrun': '涡轮越野赛车', 'crusnusa': '美国越野赛',
    'crusnwld': '世界越野赛', 'ridgerac': '山脊赛车', 'ridgera2': '山脊赛车2',
    'sfrush': '旧金山狂飙', 'sfrushrk': '旧金山狂飙岩石', 'calspeed': '加州极速',
    'hotrod': '热棒', 'roadblst': '公路爆破', 'harddriv': '硬驾驶',
    'wecleman': '世界拉力赛', 'wrally': '世界拉力赛', 'wrally2': '世界拉力赛2',
    'bigrun': '大奔跑', 'cischeat': '城市赛车', 'f1gp': 'F1大奖赛',
    'f1gp2': 'F1大奖赛2', 'gtmr': '大赛车', 'gtmr2': '大赛车2', 'gticlub': 'GTI俱乐部',
    # Neo Geo其他
    'nam1975': '越战1975', 'ncombat': '忍者战斗', 'ncommand': '忍者突击队',
    'cyberlip': '电子唇', 'gpilots': '幽灵飞行员', 'joyjoy': '欢乐欢乐',
    'ridhero': '公路英雄', 'roboarmy': '机器人军团', 'socbrawl': '足球乱斗',
    'eightman': '八人', 'burningf': '燃烧格斗', 'lbowling': '联盟保龄球',
    'maglord': '魔法领主', 'crsword': '十字剑', 'trally': '顶级拉力赛',
    'neodrift': 'Neo漂移', 'neocup98': 'Neo杯98', 'overtop': '超越顶峰',
    'blazstar': '闪耀之星', 'pulstar': '脉冲之星', 'viewpoin': '视点',
    'zedblade': '泽德之刃', 'stakwin': '赌马之王', 'stakwin2': '赌马之王2',
    'shocktro': '震撼骑兵', 'shocktr2': '震撼骑兵2',
    'sengoku': '战国传承', 'sengoku2': '战国传承2', 'sengoku3': '战国传承3',
    'kotm': '怪兽之王', 'kotm2': '怪兽之王2', 'ganryu': '严流',
    'bangbead': '弹珠', 'flipshot': '翻转射击', 'ironclad': '铁甲',
    'jockeygp': '骑师大奖赛', 'popbounc': '弹跳泡泡', 'twinspri': '双子精灵',
    'wakuwak7': '惊奇7', 'zupapa': '祖帕帕', 'nitd': '黑暗忍者',
    'preisle2': '史前岛2', 'lasthope': '最后希望', 'aodk': '格斗之王',
    # 卡普空其他
    'megaman': '洛克人', 'megaman2': '洛克人2', 'bionicc': '生化突击队',
    'tigeroad': '虎之道', 'lastduel': '最后决斗', 'willow': '柳树',
    'nemo': '尼莫', 'mtwins': '魔法双子', '3wonders': '三奇迹',
    'msword': '魔剑', 'dynwar': '天地吞食', 'ecofghtr': '生态战士',
    'slammast': '摔跤大师', 'armwar': '装甲战士', 'cybots': '电子战士',
    'ringdest': '擂台毁灭者', 'spf2t': '超级方块战士2X', 'sgemf': '口袋战士',
    'csclub': '卡普空体育俱乐部',
    # 世嘉经典
    'shinobi': '忍', 'shdancer': '影舞者', 'mwalk': '月球漫步',
    'goldnaxe': '战斧', 'altbeast': '兽王记', 'eswat': '电子特警',
    'astorm': '异形风暴', 'ddcrew': '死亡小队', 'alien3': '异形3',
    'spidman': '蜘蛛侠', 'batman': '蝙蝠侠', 'batmanfr': '蝙蝠侠永远',
    'aburner2': '空战英豪2', 'gforce2': 'G力量2', 'shangon': '超级摩托',
    'enduror': '耐力赛', 'aurail': '金轨',
    # 科乐美经典
    'contra': '魂斗罗', 'scontra': '超级魂斗罗', 'gradius3': '沙罗曼蛇3',
    'gradius4': '沙罗曼蛇4', 'parodius': '性感帕罗迪', 'ajax': '阿贾克斯',
    'xexex': 'XEXEX', 'asterix': '阿斯特里克斯', 'bishi': '毕希巴希',
    'lethalen': '致命执法者', 'moomesa': '牛仔', 'punkshot': '朋克射击',
    'hcastle': '恶魔城',
    # 南梦宫经典
    'pacman': '吃豆人', 'mspacman': '吃豆人小姐', 'galaga': '小蜜蜂',
    'digdug': '打空气', 'xevious': '铁板阵', 'mappy': '猫捉老鼠',
    'druaga': '德鲁亚加之塔', 'skykid': '天空小子', 'pacland': '吃豆人大陆',
    'assault': '突击', 'ordyne': '奥丁', 'phelios': '菲利奥斯',
    'valkyrie': '女武神', 'finallap': '最终圈', 'finalap2': '最终圈2',
    'finalap3': '最终圈3', 'starblad': '星际之刃', 'timecris': '时空危机',
    'ptblank': '枪靶', 'ptblank2': '枪靶2', 'mrdrillr': '钻地先生',
    # 太东经典
    'arkanoid': '打砖块', 'arkretrn': '打砖块回归', 'rbisland': '彩虹岛',
    'rastan': '拉斯坦', 'nastar': '拉斯坦传奇', 'bonzeadv': '本泽冒险',
    'darius': '大流士', 'darius2': '大流士2', 'dariusg': '大流士外传',
    'dariusgx': '大流士外传X', 'rayforce': '雷霆力量', 'raystorm': '雷霆风暴',
    'gdarius2': 'G大流士2', 'landmakr': '土地制造者', 'spcinv95': '太空侵略者95',
    'elevator': '电梯行动', 'liquidk': '液体小子', 'metalb': '金属黑',
    'gunfront': '枪前线', 'ninjak': '忍者小子', 'ninjaw': '忍者战士',
    'warriorb': '战士之刃', 'othunder': '行动雷霆', 'opwolf': '野狼行动',
    'opwolf3': '野狼行动3', 'spacegun': '太空枪', 'bshark': '战斗鲨鱼',
    'nightstr': '夜间打击者', 'chasehq': '追逐HQ', 'contcirc': '大陆赛道',
    'topspeed': '极速', 'aquajack': '水上杰克', 'superchs': '超级追逐',
    'groundfx': '地面FX', 'undrfire': '火力之下', 'gunbustr': '枪破坏者',
    'slapshot': '冰球', 'koshien': '甲子园', 'dinorex': '恐龙雷克斯',
    'cameltry': '骆驼尝试', 'pulirula': '普利鲁拉', 'cleopatr': '克娄巴特拉',
    # IGS/PGM系列
    'orlegend': '西游释厄传', 'orleg2': '西游释厄传2', 'olds': '西游释厄传群魔乱舞',
    'olds103t': '西游释厄传103', 'kovsh': '三国战纪', 'kov2': '三国战纪2',
    'kov2nl': '三国战纪2乱世枭雄', 'kov2p': '三国战纪2Plus', 'kov3': '三国战纪3',
    'martmast': '武林大会', 'theglad': '神剑伏魔录', 'dw2001': '斗战神2001',
    'photoy2k': '大家来找碴2000', 'puzzli2': '益智2', 'killbld': '傲剑狂刀',
    'killbldp': '傲剑狂刀Plus', 'svg': '圣战群英传', 'dmnfrnt': '恶魔前线',
    'happy6': '欢乐6合1',
    # 数据东经典
    'karatour': '空手道巡回赛', 'baddudes': '坏小子', 'robocop': '机器战警',
    'robocop2': '机器战警2', 'slyspy': '狡猾间谍', 'midres': '午夜抵抗',
    'darkseal': '暗封印', 'edrandy': '爱德华兰迪', 'cninja': '忍者洞穴',
    'rohga': '狼牙', 'dietgo': '节食GO', 'funkyjet': '时髦喷气机',
    'supbtime': '超级汉堡时间', 'cbuster': 'C破坏者', 'boogwing': '布吉翅膀',
    'wizdfire': '巫师之火', 'nitrobal': '硝基球', 'captaven': '复仇船长',
    'fghthist': '战斗历史', 'nslasher': '忍者杀手', 'dragngun': '龙枪',
    'tattass': '纹身刺客', 'backfire': '回火',
    # 艾罗姆/Irem
    'rtype': 'R-Type', 'rtype2': 'R-Type2', 'rtypeleo': 'R-Type雷欧',
    'loht': '雷霆之主', 'nspirit': '忍者精神', 'dspirit': 'D精神',
    'gunforce': '枪力', 'gunforc2': '枪力2', 'inthunt': '深海猎人',
    'uccops': '地下城警察', 'lethalth': '致命雷霆', 'mysticri': '神秘骑士',
    'dsoccr94': '梦幻足球94', 'ssoldier': '超级战士', 'airass': '空中突击',
    # 彩京/Psikyo
    'soldivid': '士兵分裂', 'daraku': '堕落天使', 'hotgmck': '热辣麻将',
    'hotgmck3': '热辣麻将3', 'loderndf': '洛德恩DF', 'tgm2': '俄罗斯方块大师2',
    'tgmj': '俄罗斯方块大师',
    # 其他厂商
    'pkladies': '扑克女郎', 'aerofgt': '空战', 'aerofgts': '空战特别版',
    'karatblz': '空手道火焰', 'spinlbrk': '旋转破坏者', 'turbofrc': '涡轮力量',
    'wbbc97': '世界棒球97', 'welltris': '井字俄罗斯方块',
    'macross': '超时空要塞', 'macross2': '超时空要塞2', 'gundamex': '高达EX',
    'msgundam': 'MS高达', 'sdgndmps': 'SD高达', 'dbz': '龙珠Z', 'dbz2': '龙珠Z2',
    'dbzvrvs': '龙珠Z VR VS', 'sailormn': '美少女战士', 'mazinger': '魔神Z',
    'truxton': '究极虎', 'hellfire': '地狱火', 'zerowing': '零翼',
    'outzone': '外区', 'vimana': '维马纳', 'fireshrk': '火鲨',
    'tatsujin': '达人', 'tekipaki': '敌敌畏', 'vfive': 'V-Five',
    'pipibibs': '泡泡龙', 'whoopee': '呜呼',
    # 更多常见游戏
    'denjinmk': '电神魔傀', 'blazeon': '火焰开启', 'blzntrnd': '火焰趋势',
    'hyprduel': '超级决斗', 'gametngk': '游戏天国', 'dharma': '达摩',
    'gundhara': '枪陀罗', 'balcube': '平衡立方', 'bangball': '砰球',
    'daitorid': '大鸟', 'mouja': '魔蛇', 'puzzli': '益智',
    'sailorws': '美少女战士WS', 'pnickj': '泡泡尼克',
    'qad': '问答街机', 'quizdais': '问答大师', 'quizdna': '问答DNA',
    'quizf1': '问答F1', 'quizkof': '问答拳皇', 'quizmoon': '问答月亮',
    # 更多Neo Geo
    'androdun': '机器人地牢', 'bakatono': '笨蛋殿下', 'bangbead': '弹珠',
    'b2b': '背靠背', 'bjourney': '蓝色旅程', 'blazstar': '闪耀之星',
    'crswd2bl': '十字剑2', 'doubledr': '双龙', 'fatfury1': '饿狼传说',
    'fbfrenzy': '足球狂热', 'fightfev': '格斗热', 'flipshot': '翻转射击',
    'froman2b': '麻雀幻想曲2B', 'goalx3': '进球X3', 'gururin': '咕噜咕噜',
    'janshin': '雀神', 'joyjoy': '欢乐欢乐', 'kabukikl': '歌舞伎一刀涼談',
    'karnovr': '卡诺夫复仇', 'kof94': '拳皇94', 'lresort': '最后度假村',
    'magician': '魔法师领主', 'minasan': '大家的高尔夫', 'miexchng': '交换',
    'moshougi': '将棋', 'mutnat': '变异国度', 'ncombat': '忍者战斗',
    'neobombe': 'Neo炸弹人', 'neomrdo': 'Neo洛克人', 'ninjamas': '忍者大师',
    'panicbom': '恐慌炸弹', 'pbobbl2n': '泡泡龙2Neo', 'pbobblen': '泡泡龙Neo',
    'puzzldpr': '益智泡泡', 'quizdai2': '问答大师2', 'quizkofk': '问答拳皇K',
    'ragnagrd': '拉格纳守卫', 'ridhero': '公路英雄', 'roboarmy': '机器人军团',
    'savagere': '野蛮王国', 'sdodgeb': '超级躲避球', 'sengoku': '战国传承',
    'shocktro': '震撼骑兵', 'socbrawl': '足球乱斗', 'sonicwi2': '音速翅膀2',
    'sonicwi3': '音速翅膀3', 'spinmast': '旋转大师', 'ssideki': '超级边锋',
    'stakwin': '赌马之王', 'strhoop': '街头篮球', 'superspy': '超级间谍',
    'tophuntr': '顶级猎人', 'tpgolf': '顶级高尔夫', 'trally': '顶级拉力赛',
    'turfmast': '高尔夫大师', 'twinspri': '双子精灵', 'viewpoin': '视点',
    'vliner': 'V线', 'wakuwak7': '惊奇7', 'wh1': '世界英雄',
    'wjammers': '飞盘大战', 'zedblade': '泽德之刃', 'zintrckb': '锌轨道B',
    'zupapa': '祖帕帕',
}


# 版本优先级 (数字越小优先级越高)
VERSION_PRIORITY = {
    'c': 1, 'h': 2, 't': 3, 'j': 4, 'a': 5, 'k': 6,
    'u': 7, 'e': 8, 'w': 9, 'p': 10, 'r': 11, 'b': 99, 'd': 100,
}

def get_base_name(rom_name):
    """获取ROM的基础名称（去除版本后缀）"""
    name = rom_name.lower()
    for suffix in ['j', 'u', 'e', 'a', 'k', 'c', 'h', 't', 'w', 'b', 'p', 'd', 'r']:
        if name.endswith(suffix) and len(name) > 2:
            base = name[:-1]
            if base in ARCADE_GAMES:
                return base
    return name

def get_version_priority(rom_name):
    """获取ROM的版本优先级"""
    name = rom_name.lower()
    for suffix, priority in VERSION_PRIORITY.items():
        if name.endswith(suffix):
            return priority
    return 50

def get_chinese_name(rom_name):
    """获取ROM的中文名"""
    name = rom_name.lower()
    if name in ARCADE_GAMES:
        return ARCADE_GAMES[name]
    base = get_base_name(name)
    if base in ARCADE_GAMES:
        return ARCADE_GAMES[base]
    # 尝试去除数字后缀
    for i in range(len(name) - 1, 0, -1):
        if not name[i].isdigit():
            base = name[:i+1]
            if base in ARCADE_GAMES:
                return ARCADE_GAMES[base]
            break
    return None

def main():
    import sys
    source_dir = Path('jiejiroms')
    target_dir = Path('jiejiroms_renamed')
    
    if not source_dir.exists():
        print(f"错误: 源目录 {source_dir} 不存在")
        sys.exit(1)
    
    target_dir.mkdir(exist_ok=True)
    roms = list(source_dir.glob('*.zip'))
    print(f"找到 {len(roms)} 个ROM文件")
    
    # 按游戏分组
    game_groups = {}
    unknown_roms = []
    
    for rom in roms:
        rom_name = rom.stem
        chinese_name = get_chinese_name(rom_name)
        if chinese_name:
            if chinese_name not in game_groups:
                game_groups[chinese_name] = []
            game_groups[chinese_name].append(rom)
        else:
            unknown_roms.append(rom)
    
    print(f"\n识别到 {len(game_groups)} 个游戏")
    print(f"未识别: {len(unknown_roms)} 个ROM")
    
    renamed_count = 0
    for chinese_name, rom_list in game_groups.items():
        rom_list.sort(key=lambda r: get_version_priority(r.stem))
        best_rom = rom_list[0]
        new_name = f"{chinese_name}.zip"
        target_path = target_dir / new_name
        
        if target_path.exists():
            counter = 2
            while target_path.exists():
                new_name = f"{chinese_name}_{counter}.zip"
                target_path = target_dir / new_name
                counter += 1
        
        shutil.copy2(best_rom, target_path)
        renamed_count += 1
        
        if len(rom_list) > 1:
            skipped = [r.stem for r in rom_list[1:]]
            print(f"✓ {chinese_name} <- {best_rom.stem} (跳过: {', '.join(skipped[:3])}{'...' if len(skipped) > 3 else ''})")
        else:
            print(f"✓ {chinese_name} <- {best_rom.stem}")
    
    # 复制未识别的ROM
    for rom in unknown_roms:
        target_path = target_dir / rom.name
        if not target_path.exists():
            shutil.copy2(rom, target_path)
    
    print(f"\n完成! 重命名: {renamed_count}, 未识别: {len(unknown_roms)}")
    print(f"输出目录: {target_dir}")

if __name__ == '__main__':
    main()

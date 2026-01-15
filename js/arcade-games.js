// 街机游戏映射表 (中文名 -> 英文ROM名)
// 用于前端显示中文名，下载后转换为英文名给模拟器

export const ARCADE_GAMES = {
    // 拳皇系列
    '拳皇94': 'kof94', '拳皇95': 'kof95', '拳皇96': 'kof96', '拳皇97': 'kof97',
    '拳皇98': 'kof98', '拳皇98终极对决': 'kof98umh', '拳皇99': 'kof99',
    '拳皇2000': 'kof2000', '拳皇2001': 'kof2001', '拳皇2002': 'kof2002',
    '拳皇2003': 'kof2003', '拳皇2003PCB': 'kf2k3pcb',
    // 街霸系列
    '街头霸王': 'sf', '街头霸王2': 'sf2', '街头霸王2冠军版': 'sf2ce',
    '街头霸王2加速版': 'sf2hf', '超级街头霸王2': 'ssf2', '超级街头霸王2X': 'ssf2t',
    '少年街霸': 'sfa', '少年街霸2': 'sfa2', '少年街霸3': 'sfa3',
    '少年街霸2Alpha': 'sfz2al', '少年街霸Zero': 'sfzch',
    '街头霸王EX': 'sfex', '街头霸王EX2': 'sfex2', '街头霸王EX2Plus': 'sfex2p',
    '街头霸王EXPlus': 'sfexp', '街头霸王3': 'sfiii', '街头霸王3二度冲击': 'sfiii2',
    '街头霸王3三度冲击': 'sfiii3', '超级街头霸王2合集': 'hsf2',
    // VS系列
    '漫威超级英雄': 'msh', '漫威超级英雄VS街霸': 'mshvsf', '漫威VS卡普空': 'mvsc',
    'X战警天启之子': 'xmcota', 'X战警VS街霸': 'xmvsf', 'X战警': 'xmen',
    '恶魔战士3': 'vsav', '恶魔战士3猎人2': 'vsav2', '恶魔战士': 'dstlk',
    '恶魔猎人2': 'vhunt2',
    // 侍魂系列
    '侍魂': 'samsho', '侍魂2': 'samsho2', '侍魂3': 'samsho3',
    '侍魂4': 'samsho4', '侍魂5': 'samsho5', '侍魂5特别版': 'samsh5sp',
    // 饿狼传说系列
    '饿狼传说': 'fatfury1', '饿狼传说2': 'fatfury2', '饿狼传说3': 'fatfury3',
    '饿狼传说特别版': 'fatfursp', '饿狼传说真传': 'rbff1', '饿狼传说真传2': 'rbff2',
    '饿狼传说真传特别版': 'rbffspec', '饿狼狼之印记': 'garou',
    // 龙虎之拳/月华剑士
    '龙虎之拳': 'aof', '龙虎之拳2': 'aof2', '龙虎之拳3': 'aof3',
    '月华剑士': 'lastblad', '月华剑士2': 'lastbld2',
    // 世界英雄等
    '世界英雄': 'wh1', '世界英雄2': 'wh2', '世界英雄2喷气机': 'wh2j',
    '世界英雄完美版': 'whp', '风云默示录': 'kizuna', '破坏者': 'breakers',
    '破坏者复仇': 'breakrev', '新婚大作战': 'matrim', 'SNK对卡普空': 'svc',
    'SNK对卡普空PCB': 'svcpcb', '龙之怒': 'rotd', '歌舞伎一刀涼談': 'kabukikl',
    '超人学园': 'gowcaizr', '格斗热': 'fightfev', '银河格斗': 'galaxyfg',
    '飞盘大战': 'wjammers', 'JOJO奇妙冒险': 'jojo', 'JOJO奇妙冒险未来遗产': 'jojoba',
    // 铁拳/真人快打
    '铁拳': 'tekken', '铁拳2': 'tekken2', '铁拳3': 'tekken3', '铁拳TT': 'tektagt',
    '魂之利刃': 'soulclbr', '刀魂': 'souledge',
    '真人快打': 'mk', '真人快打2': 'mk2', '真人快打3': 'mk3', '真人快打4': 'mk4',
    '终极真人快打3': 'umk3', '杀手本能': 'kinst', '杀手本能2': 'kinst2',
    // 合金弹头系列
    '合金弹头': 'mslug', '合金弹头2': 'mslug2', '合金弹头3': 'mslug3',
    '合金弹头4': 'mslug4', '合金弹头5': 'mslug5', '合金弹头X': 'mslugx',
    '合金弹头5PCB': 'ms5pcb',
    // 清版动作
    '恐龙快打': 'dino', '惩罚者': 'punisher', '名将': 'captcomm',
    '圆桌骑士': 'knights', '龙王': 'kod', '三国志吞食天地2': 'wof',
    '三国志吞食天地2中文': 'wofch', '快打旋风': 'ffight', '快打旋风复仇': 'ffreveng',
    '双截龙2': 'ddragon2', '双截龙3': 'ddragon3',
    '异形': 'aliens', '异形对铁血战士': 'avsp', '蝙蝠侠': 'batcir',
    '龙与地下城暗黑秘影': 'ddsom', '龙与地下城毁灭之塔': 'ddtod',
    '辛普森一家': 'simpsons', '忍者神龟': 'tmnt', '忍者神龟2': 'tmnt2',
    '巴乔与兰巴达': 'bucky', '暴力刑警': 'vendetta', '日落骑士': 'ssriders',
    '特种部队': 'gijoe', '变形战士': 'metamrph', '神秘战士': 'mystwarr',
    '暴力风暴': 'viostorm', '忍者蛙': 'btoads', '战斗部落': 'ctribe',
    '咆哮': 'growl', '铁钩船长': 'hook', '卡达什': 'cadash', '阿拉伯魔法': 'arabianm',
    // 射击游戏
    '武装飞鸟': 'gunbird', '武装飞鸟2': 'gunbird2',
    '打击者1945': 's1945', '打击者1945二': 's1945ii', '打击者1945三': 's1945iii',
    '打击者1945Plus': 's1945p', '战国之刃': 'tengai', '战国ACE': 'samuraia',
    '龙之火焰': 'dragnblz', '弹珠汽水': 'gnbarich',
    '究极虎': 'batsugun', '究极虎2': 'truxton2', '怒首领蜂': 'ddonpach',
    '武装飞鸟骑士': 'batrider', '武装飞鸟骑士2': 'bbakraid',
    '首领蜂': 'donpachi', '怒首领蜂2': 'ddp2', '怒首领蜂3': 'ddp3',
    '怒首领蜂大复活': 'ddpdfk', '怒首领蜂大往生': 'ddpdojt',
    'ESP镭': 'esprade', 'ESP伽利略': 'espgal', 'ESP伽利略2': 'espgal2',
    '愿望': 'guwange', '前进装甲': 'progear', '死亡微笑': 'deathsml',
    '虫姬': 'mushisam', '虫姬玉': 'mushitam', '虫姬双人版': 'futari15',
    '虫姬双人黑标': 'futaribl', '荆棘': 'ibara', '荆棘黑标': 'ibarablk',
    '粉红糖果': 'pinkswts', '赤刀': 'akatana',
    '1941反击战': '1941', '1944征服者': '1944', '1945K3': '1945kiii', '19XX': '19xx',
    '超级翅膀': 'gigawing', '火星矩阵': 'mmatrix', '大魔法峠': 'dimahoo',
    '战区88': 'varth', '战场之狼2': 'mercs', '出击飞龙': 'strider',
    '魔界村': 'ghouls', '战区': 'cawing', '失落的世界': 'forgottn',
    '51区': 'area51', '雷电': 'raiden', '雷电2': 'raiden2', '雷电DX': 'raidendx',
    // 平台/益智
    '雪人兄弟2': 'snowbro2', '雪人兄弟3': 'snowbro3', '翻滚小子': 'tumblep',
    '泡泡龙': 'pbobble', '泡泡龙2': 'bublbob2', '泡泡龙3': 'pbobble3',
    '泡泡龙4': 'pbobble4', '泡泡龙Neo': 'pbobblen', '泡泡龙2Neo': 'pbobbl2n',
    '东奇': 'toki', '罗德兰': 'rodland', '大头冒险': 'bonkadv',
    '旋转大师': 'spinmast', '魔法宝石2': 'magdrop2', '魔法宝石3': 'magdrop3',
    '砰': 'pang', '砰3': 'pang3', '超级砰': 'spang', '爆裂双子': 'bjtwin',
    '俄罗斯方块': 'tetris', '俄罗斯方块Plus': 'tetrisp', '俄罗斯方块Plus2': 'tetrisp2',
    '噗哟噗哟': 'puyo', '噗哟噗哟太阳': 'puyosun', '循环方块': 'puzzloop',
    '循环方块2': 'pzloop2', '益智泡泡': 'puzzledp', '咕噜咕噜': 'gururin',
    // 体育
    'NBA嘉年华': 'nbajam', 'NBA嘉年华TE': 'nbajamte', 'NBA嘉年华极限版': 'nbajamex',
    'NBA空中接力': 'nbahangt', 'NBA季后赛': 'nbapbp', '街头篮球96': 'hoops96',
    '三对三灌篮': '3on3dunk', '跑轰': 'rungun', '跑轰2': 'rungun2',
    '超级边锋': 'ssideki', '超级边锋2': 'ssideki2', '超级边锋3': 'ssideki3',
    '超级边锋4': 'ssideki4', '超级足球': 'soccerss', '90世界杯': 'twcup90',
    '点球大战': 'pgoal', '力量足球': 'pwrgoal', '足球冠军': 'footchmp',
    '杯赛决赛': 'cupfinal', '棒球之星': 'bstars', '棒球之星2': 'bstars2',
    '2020超级棒球': '2020bb', '超级排球': 'pspikes', '超级排球2': 'pspikes2',
    '高尔夫大师': 'turfmast', '顶级高尔夫': 'tpgolf', '超级摔跤': 'sslam',
    'WWF狂热': 'wwfmania', 'WWF摔跤节': 'wwfwfest', 'WWF超级明星': 'wwfsstar',
    // 赛车
    '越野赛车': 'outrun', '涡轮越野赛车': 'toutrun', '美国越野赛': 'crusnusa',
    '世界越野赛': 'crusnwld', '山脊赛车': 'ridgerac', '山脊赛车2': 'ridgera2',
    '旧金山狂飙': 'sfrush', '旧金山狂飙岩石': 'sfrushrk', '加州极速': 'calspeed',
    '热棒': 'hotrod', '公路爆破': 'roadblst', '硬驾驶': 'harddriv',
    '世界拉力赛': 'wecleman', '世界拉力赛2': 'wrally2', '大奔跑': 'bigrun',
    '城市赛车': 'cischeat', 'F1大奖赛': 'f1gp', 'F1大奖赛2': 'f1gp2',
    '大赛车': 'gtmr', '大赛车2': 'gtmr2', 'GTI俱乐部': 'gticlub',
    // Neo Geo其他
    '越战1975': 'nam1975', '忍者战斗': 'ncombat', '忍者突击队': 'ncommand',
    '电子唇': 'cyberlip', '幽灵飞行员': 'gpilots', '欢乐欢乐': 'joyjoy',
    '公路英雄': 'ridhero', '机器人军团': 'roboarmy', '足球乱斗': 'socbrawl',
    '八人': 'eightman', '燃烧格斗': 'burningf', '联盟保龄球': 'lbowling',
    '魔法领主': 'maglord', '十字剑': 'crsword', '十字剑2': 'crswd2bl',
    '顶级拉力赛': 'trally', 'Neo漂移': 'neodrift', 'Neo杯98': 'neocup98',
    '超越顶峰': 'overtop', '闪耀之星': 'blazstar', '脉冲之星': 'pulstar',
    '视点': 'viewpoin', '泽德之刃': 'zedblade', '赌马之王': 'stakwin',
    '赌马之王2': 'stakwin2', '震撼骑兵': 'shocktro', '震撼骑兵2': 'shocktr2',
    '战国传承': 'sengoku', '战国传承2': 'sengoku2', '战国传承3': 'sengoku3',
    '怪兽之王': 'kotm', '怪兽之王2': 'kotm2', '严流': 'ganryu',
    '弹珠': 'bangbead', '翻转射击': 'flipshot', '铁甲': 'ironclad',
    '骑师大奖赛': 'jockeygp', '弹跳泡泡': 'popbounc', '双子精灵': 'twinspri',
    '惊奇7': 'wakuwak7', '祖帕帕': 'zupapa', '黑暗忍者': 'nitd',
    '史前岛2': 'preisle2', '最后希望': 'lasthope', '格斗之王': 'aodk',
    // 卡普空其他
    '洛克人': 'megaman', '洛克人2': 'megaman2', '生化突击队': 'bionicc',
    '虎之道': 'tigeroad', '最后决斗': 'lastduel', '柳树': 'willow',
    '尼莫': 'nemo', '魔法双子': 'mtwins', '三奇迹': '3wonders',
    '魔剑': 'msword', '天地吞食': 'dynwar', '生态战士': 'ecofghtr',
    '摔跤大师': 'slammast', '装甲战士': 'armwar', '电子战士': 'cybots',
    '擂台毁灭者': 'ringdest', '超级方块战士2X': 'spf2t', '口袋战士': 'sgemf',
    '卡普空体育俱乐部': 'csclub',
    // 世嘉经典
    '忍': 'shinobi', '影舞者': 'shdancer', '月球漫步': 'mwalk',
    '战斧': 'goldnaxe', '兽王记': 'altbeast', '电子特警': 'eswat',
    '异形风暴': 'astorm', '死亡小队': 'ddcrew', '异形3': 'alien3',
    '蜘蛛侠': 'spidman', '蝙蝠侠永远': 'batmanfr', '空战英豪2': 'aburner2',
    'G力量2': 'gforce2', '超级摩托': 'shangon', '耐力赛': 'enduror', '金轨': 'aurail',
    // 科乐美经典
    '魂斗罗': 'contra', '超级魂斗罗': 'scontra', '沙罗曼蛇3': 'gradius3',
    '沙罗曼蛇4': 'gradius4', '性感帕罗迪': 'parodius', '阿贾克斯': 'ajax',
    'XEXEX': 'xexex', '阿斯特里克斯': 'asterix', '毕希巴希': 'bishi',
    '致命执法者': 'lethalen', '牛仔': 'moomesa', '朋克射击': 'punkshot', '恶魔城': 'hcastle',
    // 南梦宫/太东
    '女武神': 'valkyrie', '最终圈': 'finallap', '最终圈2': 'finalap2',
    '最终圈3': 'finalap3', '星际之刃': 'starblad', '时空危机': 'timecris',
    '枪靶': 'ptblank', '枪靶2': 'ptblank2', '钻地先生': 'mrdrillr',
    '打砖块回归': 'arkretrn', '彩虹岛': 'rbisland', '拉斯坦': 'rastan',
    '拉斯坦传奇': 'nastar', '本泽冒险': 'bonzeadv', '大流士2': 'darius2',
    '大流士外传': 'dariusg', '大流士外传X': 'dariusgx', '雷霆风暴': 'raystorm',
    'G大流士2': 'gdarius2', '土地制造者': 'landmakr', '太空侵略者95': 'spcinv95',
    '液体小子': 'liquidk', '金属黑': 'metalb', '枪前线': 'gunfront',
    '忍者小子': 'ninjak', '忍者战士': 'ninjaw', '战士之刃': 'warriorb',
    '行动雷霆': 'othunder', '野狼行动': 'opwolf', '野狼行动3': 'opwolf3',
    '太空枪': 'spacegun', '战斗鲨鱼': 'bshark', '夜间打击者': 'nightstr',
    '追逐HQ': 'chasehq', '大陆赛道': 'contcirc', '极速': 'topspeed',
    '水上杰克': 'aquajack', '超级追逐': 'superchs', '地面FX': 'groundfx',
    '火力之下': 'undrfire', '枪破坏者': 'gunbustr', '冰球': 'slapshot',
    '甲子园': 'koshien', '恐龙雷克斯': 'dinorex', '普利鲁拉': 'pulirula',
    '克娄巴特拉': 'cleopatr',
    // IGS/PGM系列
    '西游释厄传': 'orlegend', '西游释厄传2': 'orleg2', '西游释厄传103': 'olds103t',
    '三国战纪': 'kovsh', '三国战纪2': 'kov2', '三国战纪2乱世枭雄': 'kov2nl',
    '三国战纪2Plus': 'kov2p', '三国战纪3': 'kov3', '武林大会': 'martmast',
    '神剑伏魔录': 'theglad', '斗战神2001': 'dw2001', '大家来找碴2000': 'photoy2k',
    '益智2': 'puzzli2', '傲剑狂刀': 'killbld', '傲剑狂刀Plus': 'killbldp',
    '圣战群英传': 'svg', '恶魔前线': 'dmnfrnt', '欢乐6合1': 'happy6',
    // 数据东/艾罗姆/彩京
    '空手道巡回赛': 'karatour', '坏小子': 'baddudes', '机器战警2': 'robocop2',
    '暗封印': 'darkseal', '爱德华兰迪': 'edrandy', '忍者洞穴': 'cninja',
    '狼牙': 'rohga', '节食GO': 'dietgo', '时髦喷气机': 'funkyjet',
    'C破坏者': 'cbuster', '布吉翅膀': 'boogwing', '巫师之火': 'wizdfire',
    '硝基球': 'nitrobal', '复仇船长': 'captaven', '战斗历史': 'fghthist',
    '忍者杀手': 'nslasher', '龙枪': 'dragngun', '纹身刺客': 'tattass', '回火': 'backfire',
    'R-Type2': 'rtype2', 'R-Type雷欧': 'rtypeleo', '雷霆之主': 'loht',
    '枪力': 'gunforce', '枪力2': 'gunforc2', '深海猎人': 'inthunt',
    '地下城警察': 'uccops', '致命雷霆': 'lethalth', '神秘骑士': 'mysticri',
    '梦幻足球94': 'dsoccr94', '超级战士': 'ssoldier', '空中突击': 'airass',
    '士兵分裂': 'soldivid', '堕落天使': 'daraku', '热辣麻将': 'hotgmck',
    '热辣麻将3': 'hotgmck3', '洛德恩DF': 'loderndf', '俄罗斯方块大师2': 'tgm2',
    '俄罗斯方块大师': 'tgmj',
    // 其他厂商
    '空战': 'aerofgt', '空战特别版': 'aerofgts', '空手道火焰': 'karatblz',
    '旋转破坏者': 'spinlbrk', '涡轮力量': 'turbofrc', '世界棒球97': 'wbbc97',
    '井字俄罗斯方块': 'welltris', '超时空要塞': 'macrossp', '超时空要塞2': 'macross2',
    '高达EX': 'gundamex', 'MS高达': 'msgundam', 'SD高达': 'sdgndmps',
    '龙珠Z': 'dbz', '龙珠Z2': 'dbz2', '龙珠Z VR VS': 'dbzvrvs',
    '美少女战士': 'sailormn', '美少女战士WS': 'sailorws', '魔神Z': 'mazinger',
    // 更多游戏
    '电神魔傀': 'denjinmk', '火焰开启': 'blazeon', '火焰趋势': 'blzntrnd',
    '超级决斗': 'hyprduel', '游戏天国': 'gametngk', '达摩': 'dharma',
    '枪陀罗': 'gundhara', '平衡立方': 'balcube', '砰球': 'bangball',
    '大鸟': 'daitorid', '魔蛇': 'mouja', '益智': 'puzzli',
    '问答街机': 'qad', '问答大师': 'quizdais', '问答大师2': 'quizdai2',
    '问答DNA': 'quizdna', '问答F1': 'quizf1', '问答拳皇': 'quizkof', '问答月亮': 'quizmoon',
    '机器人地牢': 'androdun', '笨蛋殿下': 'bakatono', '背靠背': 'b2b',
    '蓝色旅程': 'bjourney', '双龙': 'doubledr', '足球狂热': 'fbfrenzy',
    '进球X3': 'goalx3', '雀神': 'janshin', '卡诺夫复仇': 'karnovr',
    '最后度假村': 'lresort', '大家的高尔夫': 'minasan', '交换': 'miexchng',
    '将棋': 'moshougi', '变异国度': 'mutnat', 'Neo炸弹人': 'neobombe',
    'Neo洛克人': 'neomrdo', '忍者大师': 'ninjamas', '恐慌炸弹': 'panicbom',
    '拉格纳守卫': 'ragnagrd', '野蛮王国': 'savagere', '超级躲避球': 'sdodgeb',
    '音速翅膀2': 'sonicwi2', '音速翅膀3': 'sonicwi3', '街头篮球': 'strhoop',
    '超级间谍': 'superspy', '顶级猎人': 'tophuntr', 'V线': 'vliner',
    '锌轨道B': 'zintrckb', '麻雀幻想曲2B': 'froman2b',
    '钢铁之拳': 'kbash', '钢铁之拳2': 'kbash2', '磨砺风暴': 'grindstm', '修复8': 'fixeight',
};

// OSS 基础 URL（通过边缘函数代理，隐藏真实地址）
export const ARCADE_OSS_BASE = 'https://arcade.188np.cn/api/arcade';

// 获取街机游戏的英文ROM名
export function getArcadeRomName(chineseName) {
    return ARCADE_GAMES[chineseName] || null;
}

// 获取街机游戏列表（用于前端显示）
export function getArcadeGameList() {
    return Object.keys(ARCADE_GAMES).map(name => ({
        id: name,
        name: name,
        romName: ARCADE_GAMES[name],
        platform: 'arcade',
        icon: '🕹️',
        players: 2
    }));
}

// 检查是否是街机游戏
export function isArcadeGame(name) {
    return name in ARCADE_GAMES;
}

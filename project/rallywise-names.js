// Cross-language name matching for Voice Log player resolution: a name heard in Chinese ("杨") against a player saved
// in Pinyin or English ("Yang"), and the other way round (Han, 2026-10-26). Used by rallywise-voice.js resolve().
// match() never decides an identity on its own: it says how sure the reading is, and resolve() only auto-confirms a
// unique strong match. Homophones, other romanizations (Wong, Lee, Chan) and polyphonic readings are only "weak"
// candidates, so they always go to the Players sheet for the user to choose.
(function (root) {
  // Toneless Hanyu Pinyin for the 6,763 GB2312 characters, "<syllable><characters>" groups (ü written v).
  // READ is each character's standard reading; ALSO adds other readings of polyphonic characters.
  // Generated with pinyin-pro 3; regenerate rather than edit by hand.
  const READ = 'a啊阿吖嗄锕 ai埃挨哎唉哀皑癌蔼矮艾碍爱隘捱嗳嗌嫒瑷暧砹锿霭 an鞍氨安俺按暗岸胺案谙埯揞犴庵桉铵鹌黯 ang肮昂盎 ao凹敖熬翱袄傲奥懊澳嚣坳艹拗嗷岙廒遨媪骜獒聱螯鏊鳌鏖 ba芭捌扒叭吧笆八疤巴拔跋靶把坝霸罢爸茇菝岜灞钯粑鲅魃 bai白柏百摆佰败拜稗捭呗掰 ban斑班搬扳般颁板版扮拌伴瓣半办绊阪坂钣瘢癍舨 bang邦帮梆榜膀绑棒磅蚌镑傍谤蒡浜 bao苞胞包褒剥薄雹保堡饱宝抱报暴豹鲍爆勹葆孢煲鸨褓龅 bei杯碑悲卑北辈背贝钡倍狈备惫焙被孛陂邶蓓悖碚鹎褙鐾鞴 ben奔苯本笨畚坌贲锛 beng崩绷甭泵蹦迸嘣甏 bi逼鼻比鄙笔彼碧蓖蔽毕毙毖币庇痹闭敝弊必壁臂避陛匕俾荜荸萆薜吡哔狴庳愎滗濞弼妣婢嬖璧畀铋秕裨筚箅篦舭襞跸髀 bian鞭边编贬扁便变卞辨辩辫遍匾弁苄忭汴缏煸砭碥窆褊蝙笾鳊 biao标彪膘表婊飑飙飚镖镳瘭裱鳔髟 bie鳖憋别瘪蹩 bin彬斌濒滨宾摈傧豳缤玢槟殡膑镔髌鬓 bing兵冰柄丙秉饼炳病并禀冫邴摒 bo玻菠播拨钵波博勃搏铂箔伯帛舶脖膊渤泊驳簿亳啵饽檗擘礴钹鹁簸趵跛踣 bu捕卜哺补埠不布步部怖卟逋瓿晡钚钸醭 ca擦礤 cai猜裁材才财睬踩采彩菜蔡 can餐参蚕残惭惨灿骖璨粲黪 cang苍舱仓沧藏 cao操糙槽曹草嘈漕螬艚 ce厕策侧册测恻 cen岑涔 ceng层蹭曾噌 cha插叉茬茶查碴搽察岔差诧刹嚓猹馇汊姹杈槎檫锸镲衩 chai拆柴豺侪钗瘥虿 chan搀掺蝉馋谗缠铲产阐颤冁谄蒇廛忏潺澶孱羼婵骣觇禅蟾躔 chang昌猖场尝常长偿肠厂敞畅唱倡伥鬯苌菖徜怅惝阊娼嫦昶氅鲳 chao超抄钞朝嘲潮巢吵炒怊晁焯耖 che车扯撤掣彻澈坼屮砗 chen郴臣辰尘晨忱沉陈趁衬伧谌谶抻嗔宸琛榇碜龀 cheng撑称城橙成呈乘程惩澄诚承逞骋秤丞埕枨柽樘塍瞠铖裎蛏酲 chi吃痴持匙池迟弛驰耻齿侈尺赤翅斥炽傺郗墀茌叱哧啻嗤彳饬媸敕眵鸱瘛褫蚩螭笞篪豉踟魑 chong充冲虫崇宠茺忡憧铳舂艟 chou抽酬畴踌稠愁筹仇绸瞅丑臭俦帱惆瘳雠 chu初出橱厨躇锄雏滁除楚础储矗搐触处畜亍刍怵憷绌杵楮樗褚蜍蹰黜 chuai揣搋膪踹 chuan川穿椽传船喘串舛遄巛氚钏舡 chuang疮窗床闯创怆 chui吹炊捶锤垂陲棰槌 chun春椿醇唇淳纯蠢莼鹑蝽 chuo戳绰啜辶辍踔龊 ci疵茨磁雌辞慈瓷词此刺赐次呲祠鹚糍 cong聪葱囱匆从丛苁淙骢琮璁枞 cou凑楱辏腠 cu粗醋簇促蔟徂猝殂酢蹙蹴 cuan蹿篡窜汆撺爨镩 cui摧崔催脆瘁粹淬翠萃啐悴璀榱毳 cun村存寸忖皴 cuo磋撮搓措挫错厝嵯脞锉矬痤鹾蹉 da搭达答瘩打大耷哒嗒怛妲褡笪靼鞑 dai呆歹傣戴带殆代贷袋待逮怠埭甙呔岱迨骀绐玳黛 dan耽担丹单郸掸胆旦氮但惮淡诞蛋儋萏啖澹殚赕眈疸瘅聃箪 dang当挡党荡档谠凼菪宕砀铛裆 dao刀捣蹈倒岛祷导到稻悼道盗刂叨忉氘纛 de德得的锝 deng蹬灯登等瞪凳邓噔嶝戥磴镫簦 di堤低滴迪敌笛狄涤嫡抵底地蒂第帝弟递缔氐籴诋谛邸坻荻嘀娣柢棣觌砥碲睇镝羝骶 dia嗲 dian颠掂滇碘点典靛垫电佃甸店惦奠淀殿坫巅玷钿癜癫簟踮 diao碉叼雕凋刁掉吊钓铞貂鲷 die跌爹碟蝶迭谍叠垤堞揲喋牒瓞耋蹀鲽 ding丁盯叮钉顶鼎锭定订仃啶玎腚碇疔耵酊 diu丢铥 dong东冬董懂动栋侗恫冻洞垌咚岽峒氡胨胴硐鸫 dou兜抖斗陡豆逗痘都蔸窦蚪篼 du督毒犊独读堵睹赌杜镀肚度渡妒芏嘟渎椟牍蠹笃髑黩 duan端短锻段断缎椴煅簖 dui堆兑队对怼憝碓 dun墩吨蹲敦顿钝盾遁沌炖砘礅盹镦趸 duo掇哆多夺垛躲朵跺舵剁惰堕咄哚沲缍铎裰踱 e蛾峨鹅俄额讹娥恶厄扼遏鄂饿噩谔垩苊莪萼呃愕阏屙婀轭腭锇锷鹗颚鳄 ei诶 en恩蒽摁 er而儿耳尔饵洱二贰佴迩珥铒鸸鲕 fa发罚筏伐乏阀法珐垡砝 fan藩帆番翻樊矾钒繁凡烦反返范贩犯饭泛蕃蘩幡梵燔畈蹯 fang坊芳方肪房防妨仿访纺放匚邡枋钫舫鲂 fei菲非啡飞肥匪诽吠肺废沸费芾狒悱淝妃绯榧腓斐扉镄痱蜚篚翡霏鲱 fen芬酚吩氛分纷坟焚汾粉奋份忿愤粪偾瀵棼鲼鼢 feng丰封枫蜂峰锋风疯烽逢冯缝讽奉凤俸酆葑唪沣砜 fo佛 fou否缶 fu夫敷肤孵扶拂辐幅氟符伏俘服浮涪福袱弗甫抚辅俯釜斧腑府腐赴副覆赋复傅付阜父腹负富讣附妇缚咐匐凫阝郛芙苻茯菔拊呋呒幞怫滏艴孚驸绂绋桴赙祓砩黻黼罘稃馥蚨蜉蝠蝮麸趺跗鲋鳆 ga噶嘎尬尕尜旮钆 gai该改概钙盖溉丐陔垓戤赅胲 gan干甘杆柑竿肝赶感秆敢赣坩苷尴擀泔淦澉绀橄旰矸疳酐 gang冈刚钢缸肛纲岗港杠戆罡筻 gao篙皋高膏羔糕搞稿告睾诰郜藁缟槔槁杲锆 ge哥歌搁戈鸽胳疙割革葛格阁隔铬个各咯鬲哿圪塥嗝搿膈硌镉袼虼舸骼 gei给 gen根跟亘茛哏艮 geng耕更庚羹埂耿梗哽赓绠鲠 gong工攻功恭龚供躬公宫弓巩汞拱贡共廾珙肱蚣觥 gou钩勾沟苟狗垢构购够佝诟岣遘媾缑枸觏彀笱篝鞲 gu辜菇咕箍估沽孤姑鼓古蛊骨谷股故顾固雇嘏诂菰崮汩梏轱牯牿臌毂瞽罟钴锢鸪痼蛄酤觚鲴 gua刮瓜剐寡挂褂卦诖呱栝胍鸹 guai乖拐怪 guan棺关官冠观管馆罐惯灌贯倌掼涫盥鹳鳏 guang光广逛咣犷桄胱 gui瑰规圭硅归龟闺轨鬼诡癸桂柜跪贵刽匦刿庋宄妫桧晷皈簋鲑 gun辊滚棍丨衮绲磙鲧 guo锅郭国果裹过馘埚掴呙帼崞猓椁虢聒蜾蝈 ha蛤哈铪 hai骸孩海氦亥害骇还咳醢 han酣憨邯韩含涵寒函喊罕翰撼捍旱憾悍焊汗汉邗菡撖瀚晗焓顸颔蚶鼾 hang夯杭航沆绗颃 hao镐壕嚎豪毫郝好耗号浩蒿薅嗥嚆濠灏昊皓颢蚝 he呵喝荷菏核禾和何合盒阂河涸赫褐鹤贺诃劾壑嗬阖纥曷盍颌翮 hei嘿黑嗨 hen痕很狠恨 heng哼亨横衡恒蘅珩桁 hong轰哄烘虹鸿洪宏弘红黉訇讧荭蕻薨闳泓 hou喉侯猴吼厚候后堠後逅瘊篌糇鲎骺 hu呼乎忽瑚壶葫胡蝴狐糊湖弧虎唬护互沪户冱唿囫岵猢怙惚浒滹琥槲轷觳烀煳戽扈祜瓠鹄鹕鹱虍笏醐斛鹘 hua花哗华猾滑画划化话骅桦砉铧 huai槐徊怀淮坏踝 huan欢环桓缓换患唤痪豢焕涣宦幻郇奂萑擐圜獾洹浣漶寰逭缳锾鲩鬟 huang荒慌黄磺蝗簧皇凰惶煌晃幌恍谎隍徨湟潢遑璜肓癀蟥篁鳇 hui灰挥辉徽恢蛔回毁悔慧卉惠晦贿秽会烩汇讳诲绘诙茴荟蕙咴喙隳洄浍彗缋珲晖恚虺蟪麾 hun荤昏婚魂浑混诨馄阍溷 huo豁活伙火获或惑霍货祸劐藿攉嚯夥灬钬锪镬耠蠖 ji击圾基机畸稽积箕肌饥迹激讥鸡姬绩缉吉极棘辑籍集及急疾汲即嫉级挤几脊己蓟技冀季伎祭剂悸济寄寂计记既忌际妓继纪亟乩剞佶偈墼芨芰蒺蕺掎叽咭哜唧岌嵴洎彐屐骥畿玑楫殛戟戢赍觊犄齑矶羁嵇稷瘠虮笈笄暨跻跽霁鲚鲫髻麂 jia嘉枷夹佳家加荚颊贾甲钾假稼价架驾嫁伽郏葭岬浃迦珈戛胛恝铗镓痂瘕袷蛱笳袈跏 jian歼监坚尖笺间煎兼肩艰奸缄茧检柬碱硷拣捡简俭剪减荐鉴践贱见键箭件健舰剑饯渐溅涧建僭谏谫菅蒹搛囝湔蹇謇缣枧楗戋戬牮犍毽腱睑锏鹣裥笕翦趼踺鲣鞯 jiang僵姜将浆江疆蒋桨奖讲匠酱降茳洚绛缰犟礓耩糨豇 jiao蕉椒礁焦胶交郊浇骄娇嚼搅铰矫侥脚狡角饺缴绞剿教酵轿较叫窖佼僬艽茭挢噍徼姣敫皎鹪蛟醮跤鲛 jie揭接皆秸街阶截劫节杰捷睫竭洁结解姐戒藉芥界借介疥诫届讦诘卩拮喈嗟婕孑桀碣疖颉蚧羯鲒骱 jin巾筋斤金今津襟紧锦仅谨进靳晋禁近烬浸尽劲卺荩堇噤馑廑妗缙瑾槿赆觐钅衿矜 jing荆兢茎睛晶鲸京惊精粳经井警景颈静境敬镜径痉靖竟竞净刭儆阱菁獍憬泾迳弪婧肼胫腈旌箐 jiong炯窘冂迥炅扃 jiu揪究纠玖韭久灸九酒厩救旧臼舅咎就疚僦啾阄柩桕鸠鹫赳鬏 ju桔鞠拘狙疽居驹菊局矩举沮聚拒据巨具距踞锯俱句惧炬剧倨讵苣苴莒掬遽屦琚椐榘榉橘犋飓钜锔窭裾趄醵踽龃雎鞫 juan捐鹃娟倦眷卷绢鄄狷涓桊蠲锩镌 jue撅攫抉掘倔爵觉决诀绝厥劂谲矍蕨噘噱崛獗孓珏桷橛爝镢蹶觖鳜 jun均菌钧军君峻俊竣浚郡骏捃皲隽麇 ka喀咖卡佧咔胩 kai开揩楷凯慨剀垲蒈忾恺铠锎锴 kan槛刊堪勘坎砍看侃凵莰阚戡龛瞰 kang康慷糠扛抗亢炕伉闶钪 kao考拷烤靠尻栲犒铐 ke坷苛柯棵磕颗科壳可渴克刻客课嗑岢恪溘骒缂珂轲氪瞌钶锞稞疴窠颏蚵蝌髁 ken肯啃垦恳裉 keng坑吭铿 kong空恐孔控倥崆箜 kou抠口扣寇芤蔻叩眍筘 ku枯哭窟苦酷库裤刳堀喾绔骷 kua夸垮挎跨胯侉 kuai块筷侩快蒯郐哙狯脍 kuan宽款髋 kuang匡筐狂框矿眶旷况诓诳邝圹夼哐纩贶 kui亏盔岿窥葵奎魁傀馈愧溃馗匮夔蒉揆喹喟悝愦逵暌睽聩蝰篑跬 kun坤昆捆困悃阃琨锟醌鲲髡 kuo括扩廓阔蛞 la垃拉喇蜡腊辣啦剌邋旯砬瘌 lai莱来赖崃徕涞濑赉睐铼癞籁 lan蓝婪栏拦篮阑兰澜谰揽览懒缆烂滥岚漤榄斓罱镧褴 lang琅榔狼廊郎朗浪莨蒗啷阆锒稂螂 lao捞劳牢老佬姥酪烙涝唠崂栳铑铹痨耢醪 le勒乐仂叻嘞泐鳓 lei雷镭蕾磊累儡垒擂肋类泪羸诔嫘缧檑耒酹 leng棱楞冷塄愣 li厘梨犁黎篱狸离漓理李里鲤礼莉荔吏栗丽厉励砾历利傈例俐痢立粒沥隶力璃哩俪俚郦坜苈莅蓠藜呖唳喱猁溧澧逦娌嫠骊缡枥栎轹戾砺詈罹锂鹂疠疬蛎蜊蠡笠篥粝醴雳鲡鳢黧 lia俩 lian联莲连镰廉怜涟帘敛脸链恋炼练蔹奁潋濂琏楝殓臁裢裣蠊鲢 liang粮凉梁粱良两辆量晾亮谅墚椋踉靓魉 liao撩聊僚疗燎寥辽潦了撂镣廖料蓼尥嘹獠寮缭钌鹩 lie列裂烈劣猎冽埒捩咧洌趔躐鬣 lin琳林磷霖临邻鳞淋凛赁吝拎蔺啉嶙廪懔遴檩辚膦瞵粼躏麟 ling玲菱零龄铃伶羚凌灵陵岭领另令酃苓呤囹泠绫柃棂瓴聆蛉翎鲮 liu溜琉榴硫馏留刘瘤流柳六浏遛骝绺旒熘锍镏鹨鎏 long龙聋咙笼窿隆垄拢陇垅茏泷珑栊胧砻癃 lou楼娄搂篓漏陋蒌喽嵝镂瘘耧蝼髅 lu芦卢颅庐炉掳卤虏鲁麓碌露路赂鹿潞禄录陆戮垆撸噜泸渌漉逯璐栌橹轳辂辘氇胪镥鸬鹭簏舻鲈 luan峦挛孪滦卵乱脔娈栾鸾銮 lun抡轮伦仑沦纶论囵 luo萝螺罗逻锣箩骡裸落洛骆络倮蠃荦摞猡泺漯珞椤脶镙瘰跞雒 lv驴吕铝侣旅履屡缕虑氯律率滤绿偻捋闾榈膂稆褛 lve掠略锊 ma妈麻玛码蚂马骂嘛吗犸杩蟆 mai埋买麦卖迈脉劢荬唛霾 man瞒馒蛮满蔓曼慢漫谩墁幔缦熳镘颟螨鳗鞔 mang芒茫盲氓忙莽邙漭硭蟒 mao猫茅锚毛矛铆卯茂冒帽貌贸袤茆峁泖瑁昴牦耄旄懋瞀蝥蟊髦 me么 mei玫枚梅酶霉煤没眉媒镁每美昧寐妹媚莓嵋猸浼湄楣镅鹛袂魅 men门闷们扪焖懑钔 meng萌蒙檬盟锰猛梦孟勐甍瞢懵朦礞虻蜢蠓艋艨 mi眯醚靡糜迷谜弥米秘觅泌蜜密幂芈冖谧蘼咪嘧猕汨宓弭脒祢敉糸縻麋 mian棉眠绵冕免勉娩缅面沔渑湎宀腼眄黾 miao苗描瞄藐秒渺庙妙喵邈缈杪淼眇鹋 mie蔑灭咩蠛篾 min民抿皿敏悯闽苠岷闵泯缗玟珉愍鳘 ming明螟鸣铭名命冥茗溟暝瞑酩 miu谬缪 mo貉摸摹蘑模膜磨摩魔抹末莫墨默沫漠寞陌谟茉蓦馍嫫嬷殁镆秣瘼耱貊貘麽 mou谋某侔哞眸蛑鍪 mu牟拇牡亩姆母墓暮幕募慕木目睦牧穆仫坶苜沐毪钼 na拿哪呐钠那娜纳捺肭镎衲 nai氖乃奶耐奈鼐艿萘柰 nan南男难喃囡楠腩蝻赧 nang囊攮囔馕曩 nao挠脑恼闹淖孬垴呶猱瑙硇铙蛲 ne呢讷疒 nei馁内 nen嫩恁 neng能 ng嗯 ni妮霓倪泥尼拟你匿腻逆溺伲坭猊怩昵旎睨铌鲵 nian蔫拈年碾撵捻念粘辗廿埝辇黏鲇鲶 niang娘酿 niao鸟尿茑嬲脲袅 nie捏聂孽啮镊镍涅乜陧蘖嗫颞臬蹑 nin您 ning柠狞凝宁拧泞佞咛甯聍 niu牛扭钮纽狃忸妞 nong脓浓农弄侬哝 nou耨 nu奴努怒弩胬孥驽 nuan暖 nuo挪懦糯诺傩搦喏锘 nv女恧钕衄 nve虐疟 o哦噢 ou欧鸥殴藕呕偶沤讴怄瓯耦 pa耙啪趴爬帕怕琶葩杷筢 pai拍排牌徘湃派俳蒎哌 pan攀潘盘磐盼畔判叛丬爿泮袢襻蟠蹒 pang乓庞旁耪胖彷滂逄螃 pao抛咆刨炮袍跑泡匏狍庖脬疱 pei呸胚培裴赔陪配佩沛辔帔旆锫醅霈 pen喷盆湓 peng砰抨烹澎彭蓬棚硼篷膨朋鹏捧碰堋嘭怦蟛 pi辟坯砒霹批披劈琵毗啤脾疲皮匹痞僻屁譬丕仳陴邳郫圮埤鼙芘擗噼庀淠媲纰枇甓睥罴铍癖疋蚍蜱貔 pian篇偏片骗谝骈犏胼翩蹁 piao飘漂瓢票剽莩嘌嫖骠缥殍瞟螵 pie撇瞥丿苤氕 pin拼频贫品聘拚姘嫔榀牝颦 ping乒坪苹萍平凭瓶评屏俜娉枰鲆 po坡泼颇婆破魄迫粕叵鄱珀钋钷皤笸 pou剖裒掊 pu脯扑铺仆莆葡菩蒲埔朴圃普浦谱曝瀑匍噗溥濮璞攴氆攵镤镨蹼 qi期欺栖戚妻七凄漆柒沏其棋奇歧畦崎脐齐旗祈祁骑起岂乞企启契砌器气迄弃汽泣讫丌亓圻芑芪荠萁萋葺蕲嘁屺岐汔淇骐绮琪琦杞桤槭耆欹祺憩碛颀蛴蜞綦蹊鳍麒 qia掐恰洽葜髂 qian牵扦钎铅千迁签仟谦乾黔钱钳前潜遣浅谴堑嵌欠歉倩佥阡芊芡茜荨掮岍悭骞搴褰缱椠肷愆钤虔箝 qiang枪呛腔羌墙蔷强抢戕嫱樯戗炝锖锵镪襁蜣羟跄 qiao橇锹敲悄桥瞧乔侨巧鞘撬翘峭俏窍劁诮谯荞峤愀憔缲樵硗跷鞒 qie切茄且怯窃惬慊妾挈锲箧 qin钦侵亲秦琴勤芹擒禽寝沁芩揿吣嗪噙檎锓覃螓衾 qing青轻氢倾卿清擎晴氰情顷请庆苘圊檠磬蜻罄綮謦鲭黥 qiong琼穷邛茕穹蛩筇跫銎 qiu秋丘邱球求囚酋泅俅巯犰湫逑遒楸赇虬蚯裘糗鳅鼽 qu趋区蛆曲躯屈驱渠取娶龋趣去诎劬蕖蘧岖衢阒璩觑氍朐祛磲鸲癯蛐蠼麴瞿黢 quan圈颧权醛泉全痊拳犬券劝诠荃犭悛绻辁畎铨蜷筌鬈 que缺炔瘸却鹊榷确雀阕阙悫 qun裙群逡 ran然燃冉染苒蚺髯 rang瓤壤攘嚷让禳穰 rao饶扰绕荛娆桡 re惹热 ren壬仁人忍韧任认刃妊纫亻仞荏饪轫稔衽 reng扔仍 ri日 rong戎茸蓉荣融熔溶容绒冗嵘狨榕肜蝾 rou揉柔肉糅蹂鞣 ru茹蠕儒孺如辱乳汝入褥蓐薷嚅洳溽濡缛铷襦颥 ruan软阮朊 rui蕊瑞锐芮蕤枘睿蚋 run闰润 ruo若弱偌箬 sa撒洒萨卅仨挲脎飒 sai腮鳃塞赛噻 san三叁伞散馓毵 sang桑嗓丧搡磉颡 sao搔骚扫嫂埽缫臊瘙鳋 se瑟色涩啬铯穑 sen森 seng僧 sha莎砂杀沙纱傻啥煞厦唼歃铩痧裟霎鲨 shai筛晒酾 shan珊苫杉山删煽衫闪陕擅赡膳善汕扇缮栅讪鄯埏芟彡潸姗嬗骟膻钐疝蟮舢跚鳝 shang墒伤商赏晌上尚裳垧绱殇熵觞 shao梢捎稍烧芍勺韶少哨邵绍劭潲杓蛸筲艄 she奢赊蛇舌舍赦摄射慑涉社设厍佘猞滠畲麝 shen砷申呻伸身深娠绅神沈审婶甚肾慎渗什诜谂莘葚哂渖椹胂矧蜃糁 sheng声生甥牲升绳省盛剩胜圣嵊晟眚笙 shi师失狮施湿诗尸虱十石拾时食蚀实识史矢使屎驶始式示士世柿事拭誓逝势是嗜噬适仕侍释饰氏市恃室视试谥埘莳蓍弑饣轼贳炻礻铈螫舐筮豕鲥鲺 shou收手首守寿授售受瘦兽扌狩绶艏 shu蔬枢梳殊抒输叔舒淑疏书赎孰熟薯暑曙署蜀黍鼠属术述树束戍竖墅庶数漱恕倏塾菽摅沭澍姝纾毹腧殳秫 shua刷耍唰 shuai摔衰甩帅蟀 shuan栓拴闩涮 shuang霜双爽孀 shui谁水睡税氵 shun吮瞬顺舜 shuo说硕朔烁蒴搠妁槊铄 si斯撕嘶思私司丝死肆寺嗣四伺似饲巳厮俟兕厶咝汜泗澌姒驷纟缌祀锶鸶耜蛳笥 song松耸怂颂送宋讼诵凇菘崧嵩忪悚淞竦 sou搜艘擞嗽叟薮嗖嗾馊溲飕瞍锼螋 su苏酥俗素速粟僳塑溯宿诉肃夙谡蔌嗉愫涑簌觫稣 suan酸蒜算狻 sui虽隋随绥髓碎岁穗遂隧祟谇荽濉邃燧眭睢 sun孙损笋荪狲飧榫隼 suo蓑梭唆缩琐索锁所唢嗦嗍娑桫睃羧 ta塌他它她塔獭挞蹋踏闼溻遢榻沓铊趿鳎 tai胎苔抬台泰酞太态汰邰薹肽炱钛跆鲐 tan弹坍摊贪瘫滩坛檀痰潭谭谈坦毯袒碳探叹炭郯昙忐钽锬镡 tang汤塘搪堂棠膛唐糖倘躺淌趟烫傥帑饧溏瑭铴镗耥螗螳羰醣 tao掏涛滔绦萄桃逃淘陶讨套鼗啕洮韬焘饕 te特忒忑慝铽 teng藤腾疼誊滕 ti梯剔踢锑提题蹄啼体替嚏惕涕剃屉倜悌逖绨缇鹈裼醍 tian天添填田甜恬舔腆掭忝阗殄畋 tiao调挑条迢眺跳佻苕祧窕蜩笤粜龆鲦髫 tie贴铁帖萜餮 ting厅听烃汀廷停亭庭挺艇莛葶婷梃町铤蜓霆 tong通桐酮瞳同铜彤童桶捅筒统痛佟僮仝茼嗵恸潼砼 tou偷投头透亠钭骰 tu凸秃突图徒途涂屠土吐兔堍荼菟钍酴 tuan湍团抟彖疃 tui推颓腿蜕褪退煺 tun囤吞屯臀氽饨暾豚 tuo拖托脱鸵陀驮驼椭妥拓唾乇佗坨庹沱柝柁橐砣箨酡跎鼍 wa挖哇蛙洼娃瓦袜佤娲腽 wai歪外崴 wan豌弯湾玩顽丸烷完碗挽晚皖惋宛婉万腕剜芄莞菀纨绾琬脘畹蜿 wang汪王亡枉网往旺望忘妄罔尢惘辋魍 wei威巍微危韦违桅围唯惟为潍维苇萎委伟伪尾纬未蔚味畏胃喂魏位渭谓尉慰卫偎诿隈隗葳薇囗帏帷嵬猥猬闱沩洧涠逶娓玮韪軎炜煨痿艉鲔 wen瘟温蚊文闻纹吻稳紊问刎阌汶璺雯 weng嗡翁瓮蓊蕹 wo挝蜗涡窝我斡卧握沃倭莴喔幄渥肟硪龌 wu巫呜钨乌污诬屋无芜梧吾吴毋武五捂午舞伍侮坞戊雾晤物勿务悟误兀仵阢邬圬芴唔庑怃忤浯寤迕妩婺骛杌牾於焐鹉鹜痦蜈鋈鼯 xi昔熙析西硒矽晰嘻吸锡牺稀息希悉膝夕惜熄烯溪汐犀檄袭席习媳喜洗系隙戏细僖兮隰郄菥葸蓰奚唏徙饩阋浠淅屣嬉玺樨曦觋欷歙熹禊禧皙穸蜥螅蟋舄舾羲粞翕醯鼷 xia瞎虾匣霞辖暇峡侠狭下夏吓呷狎遐瑕柙硖罅黠 xian铣掀锨先仙鲜纤咸贤衔舷闲涎弦嫌显险现献县腺馅羡宪陷限线冼苋莶藓岘猃暹娴氙燹祆鹇痫蚬筅籼酰跣跹霰 xiang相厢镶香箱襄湘乡翔祥详想响享项巷橡像向象芗葙饷庠骧缃蟓鲞飨 xiao萧硝霄削哮销消宵淆晓小孝校肖啸笑效哓崤潇逍骁绡枭枵筱箫魈 xie楔些歇蝎鞋协挟携邪斜胁谐写械卸蟹懈泄泻谢屑偕亵勰燮薤撷獬廨渫瀣邂绁缬榭榍躞 xin薪芯锌欣辛新忻心信衅囟馨忄昕歆鑫 xing星腥猩惺兴刑型形邢行醒幸杏性姓陉荇擤悻硎 xiong兄凶胸匈汹雄熊芎 xiu休修羞朽嗅锈秀袖绣咻岫馐庥溴鸺貅髹 xu墟戌需虚嘘须徐许蓄酗叙旭序恤絮婿绪续吁诩勖圩蓿洫溆顼栩煦盱胥糈醑 xuan轩喧宣悬旋玄选癣眩绚儇谖萱揎泫渲漩璇楦暄炫煊碹铉镟痃 xue靴薛学穴雪血谑泶踅鳕 xun勋熏循旬询寻驯巡殉汛训讯逊迅巽埙荀蕈薰峋徇獯恂洵浔曛窨醺鲟 ya压押鸦鸭呀丫芽牙蚜崖衙涯雅哑亚讶轧伢垭揠岈迓娅琊桠氩砑睚痖 yan焉咽阉烟淹盐严研蜒岩延言颜阎炎沿奄掩眼衍演艳堰燕厌砚雁唁彦焰宴谚验厣赝剡俨偃兖讠谳阽郾鄢菸崦恹闫湮滟妍嫣琰檐晏胭腌焱罨筵酽魇餍鼹 yang殃央鸯秧杨扬佯疡羊洋阳氧仰痒养样漾徉怏泱炀烊恙蛘鞅 yao邀腰妖瑶摇尧遥窑谣姚咬舀药要耀钥夭爻吆崾徭幺珧杳轺曜肴铫鹞窈繇鳐 ye椰噎耶爷野冶也页掖业叶曳腋夜液靥谒邺揶晔烨铘 yi一壹医揖铱依伊衣颐夷遗移仪胰疑沂宜姨彝椅蚁倚已乙矣以艺抑易邑屹亿役臆逸肄疫亦裔意毅忆义益溢诣议谊译异翼翌绎刈劓仡佚佾诒圯埸懿苡荑薏弈奕挹弋呓咦咿噫峄嶷猗饴怿怡悒漪迤驿缢殪轶贻旖熠眙钇镒镱痍瘗癔翊衤蜴舣羿翳酏黟 yin茵荫因殷音阴姻吟银淫寅饮尹引隐印胤鄞廴垠堙茚吲喑狺夤洇氤铟瘾蚓霪龈 ying英樱婴鹰应缨莹萤营荧蝇迎赢盈影颖硬映嬴郢茔荥莺萦蓥撄嘤膺滢潆瀛瑛璎楹媵鹦瘿颍罂 yo哟唷 yong拥佣臃痈庸雍踊蛹咏泳涌永恿勇用俑壅墉喁慵邕镛甬鳙饔 you幽优悠忧尤由邮铀犹油游酉有友右佑釉诱又幼卣攸侑莠莜莸呦囿宥柚猷牖铕疣蚰蚴蝣蝤鱿黝鼬 yu迂淤于盂榆虞愚舆余俞逾鱼愉渝渔隅予娱雨与屿禹宇语羽玉域芋郁遇喻峪御愈欲狱育誉浴寓裕预豫驭禺毓伛俣谀谕萸蓣揄圄圉嵛狳饫馀庾阈鬻妪妤纡瑜昱觎腴欤煜燠肀聿钰鹆鹬瘐瘀窬窳蜮蝓竽臾舁雩龉 yuan鸳渊冤元垣袁原援辕园员圆猿源缘远苑愿怨院垸塬芫掾沅媛瑗橼爰眢鸢螈箢鼋 yue曰约越跃岳粤月悦阅龠哕瀹樾刖钺 yun耘云郧匀陨允运蕴酝晕韵孕郓芸狁恽愠纭韫殒昀氲熨筠 za匝砸杂咋拶咂 zai栽哉灾宰载再在仔崽甾 zan咱攒暂赞瓒昝簪糌趱錾 zang赃脏葬奘驵臧 zao遭糟凿藻枣早澡蚤躁噪造皂灶燥唣 ze责择则泽仄赜啧帻迮昃笮箦舴 zei贼 zen怎谮 zeng增憎赠缯甑罾锃 zha扎喳渣札铡闸眨榨乍炸诈柞揸吒咤哳楂砟痄蚱齄 zhai翟摘斋宅窄债寨砦瘵 zhan瞻毡詹沾盏斩崭展蘸栈占战站湛绽谵搌旃 zhang樟章彰漳张掌涨杖丈帐账仗胀瘴障仉鄣幛嶂獐嫜璋蟑 zhao招昭找沼赵照罩兆肇召诏棹钊笊 zhe遮折哲蛰辙者锗蔗这浙着谪摺柘辄磔鹧褶蜇赭 zhen珍斟真甄砧臻贞针侦枕疹诊震振镇阵帧圳蓁浈溱缜桢榛轸赈胗朕祯畛稹鸩箴 zheng蒸挣睁征狰争怔整拯正政症郑证诤峥钲铮筝 zhi芝枝支吱蜘知肢脂汁之织职直植殖执值侄址指止趾只旨纸志挚掷至致置帜峙制智秩稚质炙痔滞治窒卮陟郅埴芷摭帙徵夂忮彘咫骘栉枳栀桎轵轾贽胝膣祉祗黹雉鸷痣蛭絷酯跖踬踯豸觯 zhong中盅忠钟衷终种肿重仲众冢锺螽舯踵 zhou舟周州洲诌粥轴肘帚咒皱宙昼骤荮啁妯纣绉胄碡籀酎 zhu珠株蛛朱猪诸诛逐竹烛煮拄瞩嘱主著柱助蛀贮铸筑住注祝驻丶伫侏邾苎茱洙渚潴杼槠橥炷铢疰瘃竺箸舳翥躅麈 zhua抓爪 zhuai拽 zhuan专砖转撰赚篆啭馔颛 zhuang幢桩庄装妆撞壮状 zhui椎锥追赘坠缀惴骓缒隹 zhun谆准肫窀 zhuo捉拙卓桌琢茁酌啄灼浊倬诼擢浞涿濯禚斫镯 zi兹咨资姿滋淄孜紫籽滓子自渍字谘茈嵫姊孳缁梓辎赀恣眦锱秭耔笫粢趑觜訾龇鲻髭 zong鬃棕踪宗综总纵偬腙粽 zou邹走奏揍诹陬鄹驺鲰 zu租足卒族祖诅阻组俎菹镞 zuan钻纂攥缵躜 zui咀嘴醉最罪蕞 zun尊遵撙樽鳟 zuo昨左佐做作坐座阼唑嘬怍胙祚';
  const ALSO = 'a呵腌 an厂广 ang仰 ba耙 bai伯擘 bang旁彭 bao刨炮曝瀑趵 bei臂勃呗 ben夯 beng蚌堋 bi辟佛拂秘泌芘纰贲睥 biao骠杓灬 bin份频 bing屏枋槟 bo柏般剥薄卜佛孛蕃擗艴 bu堡簿埔 ca拆嚓 can掺孱 cang伧 cao屮 ce栅 cen参 cha喳苴楂 chai差 chan单崭镡 chang裳倘淌 chao绰剿 che尺 chen称沈 cheng净抢盛噌晟铛 chi坻柢眙 chong涌种重 chu助 chuai啜嘬 chuang幢 chui椎 chun肫朐 chuo淖 ci差伺兹茈 cu趋趣卒 cuan攒 cui衰隹 cun蹲 cuo瘥 da惮沓疸 dai大毒诒棣 dan弹石膻 dao帱焘 de底地 dei得 deng澄 di的翟提 dian阽 diao调铫 die佚 ding町铤 dou读渎钭 du都顿竺 dui敦追镦 dun囤 duo度隋驮隳柁 e阿哦 fan拚 fang彷 fei砩 fen玢 fou不 fu佛脯芾莩宓 ga胳夹咖轧伽呷戛 gai芥 gan乾 gang扛亢 gao镐 ge盖蛤合仡纥颌 geng颈 gong红 gou拘句 gu贾呱鹄鹘 gua括 guai掴 guan纶斡莞矜 guang潢 gui傀匮炅鳜 guo涡囗 ha虾 hai嗨胲 han厂犴阚旰 hang亢吭巷行桁 hao皋貉 he盖貉苛吓 hen哏 heng行 hng哼 hu核和戏许芴 hua豁 huan还垸 hui堕溃哕桧 hun棍珲 huo和 ji革给藉期其奇齐系丌诘荠 jia茄挟嘏哿拮颉 jian槛浅堑 jiang港虹强 jiao觉校峤湫爝 jie家价桔楷她偈哜袷 jing劲靓 ju车柜咀且渠菹枸瞿 juan圈隽 jue嚼脚角 jun龟筠 ka咯 kai岂 kan嵌 ke咳铪 ken龈 ku挎 kuai会蒉浍 kui隗 kuo适栝 la落 lai疠 lan啉 lao乐潦落络 le肋了 lei勒嘞 li鬲悝砬镉跞 lian莶 liang俩莨 liao缪 ling棱 liu碌陆 lo咯 long弄 lou露偻 lu六绿蓼 luo咯烙捋硌 m呒 ma么摩抹麽 man埋 me麽 mei糜谜 men瞒汶鞔 meng氓蟒黾 miao缪 mie乜 min黾 mo嘿脉冒么没万无蟆 mou牟厶缪 mu姥模莫缪 n唔 na南内 nai哪能佴 nan囝 nao桡 ne哪 nei哪那 ng唔 ni呢疑 niao溺 nie捻摄 nin恁 niu拗 nu帑 nuo娜难 o喔 ou区禺 pa扒钯 pai迫 pan扳般拌番胖拚 pang膀磅 pei坏淠妃 peng亨苹 pi罢被否坏陂吡濞裨 pian扁便缏 piao朴 ping冯 po泊繁朴陂泺 pu堡暴卜 qi稽缉伎揭枝亟俟啐綮 qia卡咭袷 qian纤凵慊犍羟 qiang将疆 qiao壳雀 qie契砌伽郄趄 qin堇廑溱矜 qing亲箐 qiu仇龟艽蝤 qu戌苣 que芍 qun麇 re若喏 ren葚 ru女 rui兑 sai思 san参糁 sao梢缲 se塞槭 sha刹杉嗄挲 shai色 shan掺单掸剡禅 shang汤 shao鞘召苕 she拾折揲歙 shei谁 shen参信谌吲 sheng乘甸渑 shi匙什硕似嘘泽栅殖峙耆酾 shou熟 shu俞朱疋 shuai率 shuang泷 shui说 shuo数 si食糸 su缩 sui尿 suo莎些挲 ta拓嗒漯 tai呔骀 tan澹宕覃 tang惝樘 tao跳叨 tei忒 ti弟荑棣 tian佃甸钿 tiao啁铫 tong侗恫洞垌峒 tou愉 tuan揣 tui弟忒 tun褪 tuo沲铊 wa凹 wan蔓箢 wei遗倭圩崴隹 wen玟韫 wu恶亡 xi腊栖洒鳃铣诶郗茜咭忾裼蹊 xia唬夹厦瘕 xian掺见洗彡锬 xiang降羊 xiao俏嚣姣蛸 xie解契血叶颉鲑 xin莘镡 xing省荥饧 xiu臭宿 xu邪休畜浒朐砉 xuan券县 xue削噱彐 xun浚孙郇荨 ya邪吖碣疋 yan铅殷埏芫阏 yang详 yao侥乐么疟陶约窕 ye喝射邪咽拽揲 yi艾蛾疙蛇射食尾泄嗌欹 yin圻湮窨 ying景 yo育 you尢繇 yu奥谷蔚尉吾邪吁粥菀喁於熨 yuan宛圜 yue兑乐说钥栎 yun员 za咱扎 zan堑拶 zang藏 ze侧咋 zeng曾综 zha查蜡轧栅咋喋馇怍 zhai侧祭齐责择哜豸 zhan颤粘辗 zhang长 zhao朝嘲爪着啁濯 zhe著乇螫 zhei这 zhen填椹 zheng丁徵鲭 zhi识氏拓郦 zhong夂忪蚣 zhou调繇 zhu属术澍褚 zhua挝 zhuai转 zhuan传沌 zhuang僮奘戆 zhui揣 zhun淳屯 zhuo缴淖著着棹焯 zi齐吱仔呲甾 zong枞 zou楱 zuan赚 zui觜 zuo撮琢柞笮酢';
  // Surname readings that differ from the standard one (曾 zeng, 单 shan, 解 xie, 区 ou …): used for a name's first character.
  const SURNAME = 'bo薄 chuai啜 du都 ge盖 gou句 lu六 miao缪 mou牟 nai能 ou区 piao朴 po繁 qie郄 qiu仇 shan单 shao召 she折 xi郗 xie解 yu於 yue乐 yun员 zeng曾 zha查';
  // Two-character surnames, so 欧阳 is the family name of 欧阳娜娜.
  const COMPOUND = '欧阳 司马 诸葛 上官 东方 皇甫 尉迟 公孙 慕容 长孙 令狐 夏侯 司徒 端木 宇文 澹台 南宫 万俟 呼延 独孤'.split(' ');
  // Other common romanizations of Pinyin syllables (Cantonese, Hokkien, Wade-Giles, Korean-style spellings).
  // Only ever weak: Wong is 王 and 黄, Lee is 李 and 黎.
  const ROMAN = {
    wang: 'wong', huang: 'wong hwang ng', chen: 'chan tan chin', zhang: 'chang cheung cheong teo', li: 'lee lei lie', lin: 'lam lim ling',
    liu: 'lau lew low', wu: 'ng woo goh', zhou: 'chou chow chau chew', xu: 'hsu hui tsui koh', yang: 'yeung young yeo yong', zhao: 'chao chiu',
    guo: 'kuo kwok kok', he: 'ho hor', gao: 'kao ko', lu: 'lo loh lou', cai: 'tsai choi chua choy', xie: 'hsieh tse chia', zheng: 'cheng cheang tay',
    liang: 'leung leong', song: 'sung', deng: 'teng tang', ye: 'yip yeh yap', jiang: 'chiang kong keung', tang: 'tong', feng: 'fung fong',
    hu: 'woo foo', luo: 'lo law loh', ma: 'mah', sun: 'suen soon', zhu: 'chu choo', han: 'hon', cao: 'tso tsao', peng: 'pang phang',
    xiao: 'hsiao siu siew', tian: 'tien', dong: 'tung', pan: 'poon phua', yuan: 'yuen', cheng: 'ching', jin: 'kam kim chin', wei: 'wai',
    qian: 'chien', zou: 'chow tsou', shi: 'sze see shih', yu: 'yue yee yoo', ou: 'au', mai: 'mak', mo: 'mok', qiu: 'chiu yau khoo',
    fang: 'fong', kong: 'hung', su: 'so soh', ding: 'ting', zhuang: 'chong chuang', xiong: 'hung hsiung', jia: 'chia', qin: 'chun',
    zhong: 'chung chong', tan: 'tam', lv: 'lu lyu lui', ming: 'meng', hui: 'fai wai', jun: 'chun', zhi: 'chih', si: 'szu', ji: 'chi kei',
    qi: 'chi kei', xi: 'hsi', xin: 'hsin yan', jie: 'kit', hao: 'ho', jian: 'kin', qiang: 'keung', yi: 'yee', ying: 'ling'
  };
  // Forms of address around a name: 老杨, 小杨, 阿杨, 杨哥, 杨姐 all mean Yang.
  const PREFIX = /^[老小阿]/, SUFFIX = /[哥姐]$/;

  let read = null, also = null, surname = null;
  const table = s => { const m = {}; for (const g of s.split(' ')) { const k = g.match(/^[a-z]+/)[0]; for (const c of g.slice(k.length)) (m[c] = m[c] || []).push(k); } return m; };
  function load() { if (!read) { read = table(READ); also = table(ALSO); surname = table(SURNAME); } }

  const HAN = /[㐀-鿿]/;
  const isHan = s => HAN.test(s);
  // Latin side: lower case, accents and tone marks off, ü -> v, split into words.
  const words = s => s.normalize('NFD').replace(/ü/g, 'v').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ü/g, 'v').split(/[^a-z]+/).filter(Boolean);
  const strip = s => { const t = s.replace(/[\s·・.]/g, ''); const u = t.length > 1 ? t.replace(PREFIX, '') : t; return u.length > 1 ? u.replace(SUFFIX, '') : u; };

  // Readings of a run of Chinese characters, each { s: 'wangwei', strong }. Strong = every character read the standard
  // way (a name's first character may use its surname reading). Unknown characters give no readings.
  function readings(chars, first) {
    load();
    let out = [{ s: '', strong: true }];
    [...chars].forEach((c, i) => {
      const std = (first && i === 0 && surname[c]) || read[c];
      if (!std) { out = []; return; }
      const opts = std.map(s => ({ s, strong: true }))
        .concat((read[c] || []).concat(also[c] || []).filter(s => !std.includes(s)).map(s => ({ s, strong: false })));
      for (const o of opts.slice()) if (ROMAN[o.s]) for (const r of ROMAN[o.s].split(' ')) opts.push({ s: r, strong: false });
      const next = [];
      for (const a of out) for (const o of opts) if (next.length < 400) next.push({ s: a.s + o.s, strong: a.strong && o.strong });
      out = next;
    });
    return out;
  }
  // A Chinese name in parts: full, family name (first character, or a two-character surname) and given name.
  function hanParts(name) {
    const t = strip(name), n = COMPOUND.includes(t.slice(0, 2)) && t.length > 2 ? 2 : 1;
    const head = t.length > n ? t.slice(0, n) : '', tail = head ? t.slice(n) : '';
    return { full: readings(t, true), first: head ? readings(head, true) : [], other: tail ? readings(tail, false) : [] };
  }
  // A Latin name in parts: all words in either order, the first word, the other words.
  function latinParts(name) {
    const w = words(name), as = s => [{ s, strong: true }];
    if (!w.length) return { full: [], first: [], other: [] };
    return { full: as(w.join('')).concat(w.length > 1 ? as(w.slice().reverse().join('')) : []), first: w.length > 1 ? as(w[0]) : [],
      other: w.length > 1 ? w.slice(1).map(s => ({ s, strong: true })) : [] };
  }
  const parts = name => isHan(name) ? hanParts(name) : latinParts(name);
  // Best agreement between two sets of readings: 'strong' when both readings are standard, else 'weak', else null.
  function agree(a, b) {
    let best = null;
    for (const x of a) for (const y of b) if (x.s === y.s) { if (x.strong && y.strong) return 'strong'; best = 'weak'; }
    return best;
  }


  // English given names as Chinese speech recognition writes them (Han, 2026-10-26: 迈克 is the saved "Mike").
  // Each listed form is a standard Mainland transliteration, so it counts like a standard reading (strong).
  const TRANS = {
    mike: '迈克 麦克 迈可 麦可', michael: '迈克尔 麦克尔 迈可尔 米高', tom: '汤姆', tommy: '汤米', thomas: '托马斯', jack: '杰克', john: '约翰',
    david: '大卫 戴维', chris: '克里斯', christopher: '克里斯托弗', james: '詹姆斯 占士', peter: '彼得', paul: '保罗', mark: '马克',
    kevin: '凯文', jason: '杰森 杰生', eric: '埃里克 艾瑞克 艾力克 艾里克', alex: '亚历克斯 艾利克斯 阿历克斯 艾力克斯', alexander: '亚历山大',
    andy: '安迪', andrew: '安德鲁', tony: '托尼 汤尼', anthony: '安东尼', ben: '本', benjamin: '本杰明', sam: '萨姆 山姆 森姆', samuel: '塞缪尔',
    daniel: '丹尼尔', danny: '丹尼', dan: '丹', ryan: '瑞恩 莱恩 雷恩', leo: '里奥 利奥 李奥', max: '马克斯 麦克斯', nick: '尼克', nicholas: '尼古拉斯',
    steve: '史蒂夫', steven: '史蒂文 史蒂芬', stephen: '史蒂芬 史蒂文', william: '威廉', will: '威尔', bill: '比尔', bob: '鲍勃 鲍伯',
    robert: '罗伯特', richard: '理查德 理查', henry: '亨利', george: '乔治', frank: '弗兰克', joe: '乔', joseph: '约瑟夫', justin: '贾斯汀',
    brian: '布莱恩 布赖恩', adam: '亚当', matt: '马特', matthew: '马修', luke: '卢克', lucas: '卢卡斯', jim: '吉姆', jimmy: '吉米',
    eddie: '艾迪 埃迪', edward: '爱德华', alan: '艾伦', allen: '艾伦', harry: '哈利 哈里', jerry: '杰瑞 杰里', terry: '特里', gary: '加里',
    larry: '拉里', leon: '里昂 莱昂', dennis: '丹尼斯', sean: '肖恩', shawn: '肖恩', ian: '伊恩', neil: '尼尔', carl: '卡尔', karl: '卡尔',
    simon: '西蒙', martin: '马丁', louis: '路易斯', philip: '菲利普', ray: '雷', roy: '罗伊', ted: '泰德', tim: '蒂姆', ivan: '伊万',
    ken: '肯', kenny: '肯尼', vincent: '文森特', victor: '维克多', oscar: '奥斯卡', marcus: '马库斯', ravi: '拉维', ali: '阿里', jay: '杰',
    amy: '艾米 埃米', anna: '安娜', emma: '艾玛 埃玛', lucy: '露西', lily: '莉莉 丽丽', mary: '玛丽', linda: '琳达', lisa: '丽莎 莉莎',
    sarah: '莎拉 萨拉', grace: '格蕾丝 格雷丝', jenny: '珍妮', jessica: '杰西卡', kate: '凯特', helen: '海伦', nancy: '南希', sophia: '索菲亚',
    sophie: '索菲', emily: '艾米丽 艾米莉', alice: '爱丽丝 艾丽斯', cathy: '凯茜 凯西', vivian: '薇薇安', jane: '简', rose: '罗丝 露丝', olivia: '奥利维亚'
  };
  // Short and long forms of one name (Mike / Michael): the same person is possible, never certain, so only weak.
  const ALIAS = ['mike michael', 'tom tommy thomas', 'chris christopher', 'alex alexander', 'sam samuel', 'ben benjamin', 'nick nicholas',
    'will bill william', 'bob robert', 'jim jimmy james', 'matt matthew', 'dan danny daniel', 'steve steven stephen', 'tony anthony',
    'andy andrew', 'joe joseph', 'ed eddie edward', 'ken kenny'].map(s => s.split(' '));
  let trans = null;
  const transOf = c => { if (!trans) { trans = {}; for (const k in TRANS) for (const f of TRANS[k].split(' ')) (trans[f] = trans[f] || []).push(k); } return trans[c] || []; };
  const aliases = w => ALIAS.filter(a => a.includes(w)).flat().filter(x => x !== w);
  // A Chinese spelling of an English name, as recognized: 迈克, 小迈克, 迈克哥 (address forms stripped only when the
  // remainder is still a known spelling, so 阿里 stays Ali).
  const transNames = h => { const t = h.replace(/[\s·・.]/g, ''); return [...new Set(transOf(t).concat(transOf(strip(t))))]; };
  // Rough sound skeleton for an unlisted transliteration: consonants by place of articulation, so 汤姆 and "Tom" are
  // both t-m. Only ever a weak candidate.
  const CLASS = { b: 'p', p: 'p', d: 't', t: 't', g: 'k', k: 'k', j: 'j', q: 'j', zh: 'j', ch: 'j', z: 'j', c: 'j', x: 's', s: 's', sh: 's',
    f: 'f', h: 'h', l: 'l', r: 'l', m: 'm', n: 'n', w: 'w', y: '' };
  function hanSkeletons(chars) {
    load();
    let out = [''];
    for (const c of chars) {
      const rs = read[c]; if (!rs) return [];
      const opts = new Set();
      for (const r of rs) {
        if (r === 'er') { opts.add('l'); opts.add(''); continue; }
        const ini = (r.match(/^(zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])/) || [''])[0], base = CLASS[ini] || '';
        opts.add(base); if (/ng?$/.test(r)) opts.add(base + 'n');
      }
      const next = []; for (const a of out) for (const o of opts) if (next.length < 64) next.push(a + o);
      out = next;
    }
    return out.map(s => s.replace(/(.)\1+/g, '$1')).filter(s => s.length >= 2);
  }
  function latinSkeletons(word) {
    let w = word.replace(/gh/g, '').replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/qu/g, 'kw').replace(/x/g, 'ks').replace(/th/g, 't')
      .replace(/sh/g, 's').replace(/ch/g, 'j').replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k').replace(/ng/g, 'n').replace(/v/g, 'w')
      .replace(/r(?![aeiouy])/g, '').replace(/(?!^)h/g, '').replace(/(?!^)y/g, '');
    const k = [...w].filter(c => !/[aeiou]/.test(c)).map(c => c === 'y' ? '' : ({ b: 'p', d: 't', g: 'k', z: 's', r: 'l' })[c] || c).join('').replace(/(.)\1+/g, '$1');
    return [k, k.slice(0, -1)].filter(s => s.length >= 2);
  }
  // Heard Chinese against a saved English name (or the other way round): 'strong' for a listed spelling of the whole
  // name or its first word (迈克 -> "Mike", "Mike Chen"), 'weak' for a later word, a short/long form (迈克尔 -> "Mike")
  // or an unlisted spelling that sounds alike. Needs two or more characters for the sound check (one is too loose).
  function transMatch(han, latin) {
    const w = words(latin); if (!w.length) return null;
    const ks = transNames(han);
    if (ks.includes(w[0]) || ks.includes(w.join(''))) return 'strong';
    if (ks.some(k => w.slice(1).includes(k) || aliases(k).includes(w[0]))) return 'weak';
    const t = strip(han);
    if (t.length < 2 || w[0].length < 3) return null;
    const hs = hanSkeletons(t), ls = latinSkeletons(w[0]);
    return hs.some(s => ls.includes(s)) ? 'weak' : null;
  }

  // How well a heard name matches a saved player's name across scripts: 'strong', 'weak' or null.
  // Strong mirrors the same-language rule: the whole name, or the heard name is the saved name's first part
  // (杨 -> "Yang", 王伟 -> "Wang Wei" / "Wei Wang", "Wang" -> 王伟). Anything else that sounds alike is weak: another part
  // of the name (伟 -> "Wang Wei"), a full heard name against a saved family name (王伟 -> "Wang"), a non-standard reading,
  // another romanization (王 -> "Wong"), or a different character with the same sound (阳 -> saved 杨).
  // English names spelled in Chinese count too (迈克 -> "Mike", transMatch). Two Latin names never match here: same-script
  // names are the exact rule's job.
  function match(heard, name) {
    const h = (heard || '').trim(), n = (name || '').trim();
    if (!h || !n || (!isHan(h) && !isHan(n))) return null;
    if (isHan(h) && isHan(n) && strip(h) === strip(n)) return 'strong';
    const H = parts(h), N = parts(n), sameScript = isHan(h) && isHan(n);
    const strong = agree(H.full, N.full) || agree(H.full, N.first);
    if (strong === 'strong' && !sameScript) return 'strong';
    const t = sameScript ? null : isHan(h) ? transMatch(h, n) : transMatch(n, h);
    if (t === 'strong') return 'strong';
    return strong || t || agree(H.full, N.other) || agree(H.first, N.full) ? 'weak' : null;
  }

  const api = { match, readings, isHan };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RallywiseNames = api;
})(typeof window !== 'undefined' ? window : globalThis);

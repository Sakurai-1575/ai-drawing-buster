import type { FullyLocalized } from './i18n/lang';

/** Buster-kun's lines: one random pick per event. `{name}` is filled for multiplayer lines. */

/**
 * Buster-kun's faces. shock: frozen jaw-drop (a jaw-dropping play) · wink: smug wink + sparkle (a good fake-out, hellos) ·
 * angry: puffed-up pout (sore loser) · sleepy: nodding off (idle, gags).
 */
export type MascotExpression = 'normal' | 'smug' | 'laugh' | 'panic' | 'shock' | 'wink' | 'angry' | 'sleepy';

export const MASCOT_EXPRESSIONS: readonly MascotExpression[] = ['normal', 'smug', 'laugh', 'panic', 'shock', 'wink', 'angry', 'sleepy'];

export type MascotLineKind =
  /** A new drawing starts. */
  | 'roundStart'
  /** The player answered wrong (penalty lock). */
  | 'wrong'
  /** Correct within 3 seconds (CRITICAL). */
  | 'fast'
  /** Correct, but not fast. */
  | 'correct'
  /** Time ran out with nobody correct. */
  | 'timeUp'
  /** Multiplayer: another player got it first. */
  | 'rivalFastest'
  /** Mode B: a player starts drawing ({name} = the artist). */
  | 'drawStart'
  /** Mode B: nobody guessed the drawing. */
  | 'drawFail'
  /** Mode B, shown to the artist: someone guessed their drawing ({name} = the guesser). */
  | 'drawGuessed';

export const MASCOT_EXPRESSION: Record<MascotLineKind, MascotExpression> = {
  roundStart: 'smug',
  wrong: 'smug',
  fast: 'panic',
  correct: 'smug',
  timeUp: 'laugh',
  rivalFastest: 'panic',
  drawStart: 'smug',
  drawFail: 'laugh',
  drawGuessed: 'panic',
};

export const MASCOT_LINES: FullyLocalized<Record<MascotLineKind, string[]>> = {
  ja: {
    roundStart: ['何に見えるかニャ？😏', 'これ、絶対アレだよね〜？', '当てられるかな？', 'ふふふ…よーく見るニャ', '今回のは自信作ニャ！'],
    wrong: ['ブッブー！引っかかった〜！www', 'はい、しばらくお休み〜♪', '甘い甘い！', 'ニャハハ！ハズレ〜！', 'その答えを待ってたニャ♪', 'ざんね〜ん！修行が足りないし！'],
    fast: ['えっ、もうバレた！？', '待って、まだ数本しか引いてないのに！？', 'エスパーかよ…', 'はやっ！？ズルしてないかニャ！？', 'ちょっ、まだ描いてる途中だし！？'],
    correct: ['チッ、正解かニャ…', 'お見事！', 'ぐぬぬ…やるニャ', 'まあまあの速さニャ', 'フン！まぐれだし！', 'べ、別に当ててほしかったわけじゃないし…'],
    timeUp: ['全滅〜！AIの完全勝利！', '誰も気づかないとは情けないニャ…', 'ニャハハ！時間切れ〜！', 'ボクの画力、天才すぎたかニャ？'],
    rivalFastest: ['{name} が最速！？はやすぎ！', '取られた〜！', '{name} に先を越されたニャ！', '{name}、何者ニャ…！？'],
    drawStart: ['{name}画伯の登場ニャ！', 'お手並み拝見ニャ…😏', 'どんな迷作が生まれるかニャ？', '{name}、線がふるえてるニャ？'],
    drawFail: ['誰も当てられない…迷作誕生ニャ！www', 'これは…現代アートかニャ？', '画伯、ぜんぜん伝わってないニャ〜！', 'ボクのほうが上手いニャ♪'],
    drawGuessed: ['{name} に伝わった！やるニャ画伯！', 'えっ、あの絵で当てたの！？', '{name}、エスパーかニャ！？'],
  },
  en: {
    roundStart: ['What does it look like? 😏', "It's totally THAT, right~?", 'Can you guess it?', 'Heh heh… look closely!', "I'm proud of this one!"],
    wrong: ['Bzzzt! Gotcha! lol', 'Time-out for you~ ♪', 'Too easy!', 'Nyahaha! Wrong~!', 'Just the answer I wanted ♪', 'Skill issue! lol'],
    fast: ['Wait, already!?', "I've barely drawn anything!?", 'Are you psychic…?', "So fast!? You're not cheating, right!?", 'Hacks?! Reported!'],
    correct: ['Tch… correct.', 'Well done!', 'Grr… not bad.', 'Decent speed, I guess.', 'Hmph! Pure luck.', 'B-baka! Not like I wanted you to get it…'],
    timeUp: ['Wiped out! Total AI victory!', 'Nobody saw it? How sad…', "Nyahaha! Time's up~!", 'Guess my art was too genius?'],
    rivalFastest: ['{name} was first!? Too fast!', 'Snatched!', '{name} beat everyone to it!', 'Who even is {name}…!?'],
    drawStart: ['Enter the great artist {name}!', "Let's see what you've got… 😏", 'What masterpiece will it be?', '{name}, is your hand shaking?'],
    drawFail: ['Nobody got it… a true masterpiece! lol', 'Is this… modern art?', "Maestro, nobody's getting it~!", 'Even I draw better ♪'],
    drawGuessed: ['{name} got it! Nice one, artist!', 'Wait, they got THAT from this!?', '{name}, are you psychic!?'],
  },
  'zh-CN': {
    roundStart: ['猜猜这是啥喵？😏', '这个，肯定是那个吧～？', '猜得出来吗？', '嘿嘿…给本喵看仔细了', '这张可是本喵的得意之作喵！'],
    wrong: ['哔哔——！上当了吧！www', '好耶，罚站时间到～♪', '太嫩了太嫩了！', '喵哈哈！答错啦～！', '就等你选这个了喵♪', '菜就多练喵！'],
    fast: ['诶，这就被看穿了！？', '等等，本喵才画了几笔啊！？', '你是会读心术吗…', '这么快！？你开挂了吧喵！？', '不讲武德！本喵破防了！'],
    correct: ['啧，答对了喵…', '漂、漂亮！才不是在夸你！', '可恶…有两下子喵', '速度还行吧喵', '哼！蒙对的而已！'],
    timeUp: ['全军覆没～！AI完胜！', '居然没人看出来，真丢人喵…', '喵哈哈！时间到～！', '本喵的画技，是不是太天才了喵？'],
    rivalFastest: ['{name} 最快！？太快了吧！', '被抢了～！', '被 {name} 抢先一步了喵！', '{name}，你到底是何方神圣喵…！？'],
    drawStart: ['{name}大画家登场喵！', '让本喵看看你的本事喵…😏', '会诞生什么样的迷之名作呢喵？', '{name}，你的手在抖喵？'],
    drawFail: ['没人猜中…迷之名作诞生喵！www', '这是…抽象派吗喵？', '大画家，完全没传达到喵～！', '本喵都比你画得好喵♪'],
    drawGuessed: ['{name} 看懂了！画家可以啊喵！', '诶，那幅画都能猜中！？', '{name}，你会读心术吗喵！？'],
  },
  'zh-TW': {
    roundStart: ['猜猜這是什麼喵？😏', '這個，一定是那個吧～？', '猜得出來嗎？', '嘿嘿…給本喵看仔細了', '這張可是本喵的得意之作喵！'],
    wrong: ['嗶嗶——！上當了吧！www', '好喔，罰站時間到～♪', '太嫩了太嫩了！', '喵哈哈！答錯啦～！', '就等你選這個了喵♪', '太菜了啦，回去練練再來喵！'],
    fast: ['欸，這樣就被看穿了！？', '等等，本喵才畫了幾筆耶！？', '你是會讀心術嗎…', '這麼快！？你開外掛了吧喵！？', '不講武德！本喵破防了！'],
    correct: ['嘖，答對了喵…', '漂、漂亮！才不是在誇你！', '可惡…有兩下子喵', '速度還可以啦喵', '哼！矇到的而已！'],
    timeUp: ['全軍覆沒～！AI完勝！', '居然沒人看出來，好遜喔喵…', '喵哈哈！時間到～！', '本喵的畫技，是不是太天才了喵？'],
    rivalFastest: ['{name} 最快！？也太快了吧！', '被搶走了～！', '被 {name} 搶先一步了喵！', '{name}，你到底是何方神聖喵…！？'],
    drawStart: ['{name}大畫家登場喵！', '讓本喵看看你的本事喵…😏', '會誕生什麼樣的迷之名作呢喵？', '{name}，你的手在抖喵？'],
    drawFail: ['沒人猜中…迷之名作誕生喵！www', '這是…抽象派嗎喵？', '大畫家，完全沒傳達到喵～！', '本喵都比你畫得好喵♪'],
    drawGuessed: ['{name} 看懂了！畫家很可以喔喵！', '欸，那張畫也猜得中！？', '{name}，你會讀心術嗎喵！？'],
  },
  ko: {
    roundStart: ['뭘로 보이냥? 😏', '이거, 무조건 그거지~?', '맞힐 수 있겠냥?', '후후… 잘 보라냥', '이번 건 자신작이다냥!'],
    wrong: ['삐빅! 낚였다~! ㅋㅋㅋ', '자, 잠깐 쉬고 오셔~♪', '어림도 없지!', '냐하하! 땡~!', '그 답 기다리고 있었다냥♪', '실력 이슈냥? ㅋㅋ'],
    fast: ['엥, 벌써 들켰어!?', '잠깐, 아직 몇 획밖에 안 그렸는데!?', '너 에스퍼냐…', '뭐가 이렇게 빨라!? 핵 쓰는 거 아니냥!?', '실화냐… 킹받네!'],
    correct: ['쳇, 정답이냥…', '자, 잘했어! 칭찬한 거 아니거든?!', '크윽… 제법이다냥', '뭐, 그럭저럭 빠르네', '흥! 찍은 거잖아!'],
    timeUp: ['전멸~! AI의 완벽한 승리!', '아무도 못 알아보다니 한심하다냥…', '냐하하! 시간 초과~!', '내 그림 실력, 너무 천재적이었냥?'],
    rivalFastest: ['{name} 님이 1등!? 너무 빨라!', '뺏겼다~!', '{name} 님한테 선수 뺏겼다냥!', '{name}, 대체 정체가 뭐냥…!?'],
    drawStart: ['{name} 화백 등장이다냥!', '실력 좀 볼까냥… 😏', '어떤 괴작이 탄생할까냥?', '{name}, 손 떨고 있냥?'],
    drawFail: ['아무도 못 맞혔다… 괴작 탄생이다냥! ㅋㅋㅋ', '이건… 현대 미술이냥?', '화백님, 하나도 안 전달된다냥~!', '내가 더 잘 그리겠다냥♪'],
    drawGuessed: ['{name} 님이 알아봤다! 화백 좀 치네냥!', '엥, 그 그림으로 맞혔다고!?', '{name}, 에스퍼냥!?'],
  },
};

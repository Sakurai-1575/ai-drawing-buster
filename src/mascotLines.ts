import type { Lang } from './data/quizzes';

/** Buster-kun's lines: one random pick per event. `{name}` is filled for multiplayer lines. */

export type MascotExpression = 'normal' | 'smug' | 'laugh' | 'panic';

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
  wrong: 'laugh',
  fast: 'panic',
  correct: 'smug',
  timeUp: 'laugh',
  rivalFastest: 'panic',
  drawStart: 'smug',
  drawFail: 'laugh',
  drawGuessed: 'panic',
};

export const MASCOT_LINES: Record<Lang, Record<MascotLineKind, string[]>> = {
  ja: {
    roundStart: ['何に見えるかニャ？😏', 'これ、絶対アレだよね〜？', '当てられるかな？', 'ふふふ…よーく見るニャ', '今回のは自信作ニャ！'],
    wrong: ['ブッブー！引っかかった〜！www', 'はい2秒お休み！', '甘い甘い！', 'ニャハハ！ハズレ〜！', 'その答えを待ってたニャ♪'],
    fast: ['えっ、もうバレた！？', '待って、まだ数本しか引いてないのに！？', 'エスパーかよ…', 'はやっ！？ズルしてないかニャ！？'],
    correct: ['チッ、正解かニャ…', 'お見事！', 'ぐぬぬ…やるニャ', 'まあまあの速さニャ'],
    timeUp: ['全滅〜！AIの完全勝利！', '誰も気づかないとは情けないニャ…', 'ニャハハ！時間切れ〜！', 'ボクの画力、天才すぎたかニャ？'],
    rivalFastest: ['{name} が最速！？はやすぎ！', '取られた〜！', '{name} に先を越されたニャ！', '{name}、何者ニャ…！？'],
    drawStart: ['{name}画伯の登場ニャ！', 'お手並み拝見ニャ…😏', 'どんな迷作が生まれるかニャ？', '{name}、線がふるえてるニャ？'],
    drawFail: ['誰も当てられない…迷作誕生ニャ！www', 'これは…現代アートかニャ？', '画伯、ぜんぜん伝わってないニャ〜！', 'ボクのほうが上手いニャ♪'],
    drawGuessed: ['{name} に伝わった！やるニャ画伯！', 'えっ、あの絵で当てたの！？', '{name}、エスパーかニャ！？'],
  },
  en: {
    roundStart: ['What does it look like? 😏', "It's totally THAT, right~?", 'Can you guess it?', 'Heh heh… look closely!', "I'm proud of this one!"],
    wrong: ['Bzzzt! Gotcha! lol', 'Two-second time-out!', 'Too easy!', 'Nyahaha! Wrong~!', 'Just the answer I wanted ♪'],
    fast: ['Wait, already!?', "I've barely drawn anything!?", 'Are you psychic…?', "So fast!? You're not cheating, right!?"],
    correct: ['Tch… correct.', 'Well done!', 'Grr… not bad.', 'Decent speed, I guess.'],
    timeUp: ['Wiped out! Total AI victory!', 'Nobody saw it? How sad…', "Nyahaha! Time's up~!", 'Guess my art was too genius?'],
    rivalFastest: ['{name} was first!? Too fast!', 'Snatched!', '{name} beat everyone to it!', 'Who even is {name}…!?'],
    drawStart: ['Enter the great artist {name}!', "Let's see what you've got… 😏", 'What masterpiece will it be?', '{name}, is your hand shaking?'],
    drawFail: ['Nobody got it… a true masterpiece! lol', 'Is this… modern art?', "Maestro, nobody's getting it~!", 'Even I draw better ♪'],
    drawGuessed: ['{name} got it! Nice one, artist!', 'Wait, they got THAT from this!?', '{name}, are you psychic!?'],
  },
};

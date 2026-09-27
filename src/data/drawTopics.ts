/**
 * Mode B (draw together) text-only topics: people draw these, so there are no strokes.
 * Each row: [id, answer ja, answer en, then three decoys as [ja, en]] — decoys are things a
 * rough drawing of the answer could be mistaken for.
 * Mode B also draws from every AI quiz, so a topic that becomes a quiz is removed here (no duplicates).
 */
import type { Genre } from './genres';
import type { Localized } from './quizzes';

export interface DrawTopic {
  id: string;
  genre: Genre;
  answer: Localized<string>;
  decoys: [Localized<string>, Localized<string>, Localized<string>];
}

type Row = [id: string, ja: string, en: string, d1: [string, string], d2: [string, string], d3: [string, string]];

const ROWS: Record<Genre, Row[]> = {
  animal: [
    ['cow', 'ウシ', 'Cow', ['ブタ', 'Pig'], ['ヤギ', 'Goat'], ['ウマ', 'Horse']],
    ['tiger', 'トラ', 'Tiger', ['ネコ', 'Cat'], ['ライオン', 'Lion'], ['ヒョウ', 'Leopard']],
    ['bear', 'クマ', 'Bear', ['パンダ', 'Panda'], ['イヌ', 'Dog'], ['タヌキ', 'Raccoon dog']],
  ],
  creature: [
    ['beetle', 'カブトムシ', 'Rhinoceros beetle', ['クワガタ', 'Stag beetle'], ['カナブン', 'Chafer'], ['テントウムシ', 'Ladybug']],
    ['stagbeetle', 'クワガタ', 'Stag beetle', ['カブトムシ', 'Rhinoceros beetle'], ['ハサミ', 'Scissors'], ['アリ', 'Ant']],
    ['mosquito', 'カ', 'Mosquito', ['ハエ', 'Fly'], ['ハチ', 'Bee'], ['トンボ', 'Dragonfly']],
    ['grasshopper', 'バッタ', 'Grasshopper', ['コオロギ', 'Cricket'], ['カマキリ', 'Praying mantis'], ['セミ', 'Cicada']],
    ['mantis', 'カマキリ', 'Praying mantis', ['バッタ', 'Grasshopper'], ['クワガタ', 'Stag beetle'], ['トンボ', 'Dragonfly']],
    ['shrimp', 'エビ', 'Shrimp', ['ザリガニ', 'Crayfish'], ['カニ', 'Crab'], ['イカ', 'Squid']],
  ],
  food: [
    ['ramen', 'ラーメン', 'Ramen', ['うどん', 'Udon'], ['そば', 'Soba'], ['スープ', 'Soup']],
    ['curry', 'カレーライス', 'Curry rice', ['シチュー', 'Stew'], ['ハヤシライス', 'Hashed beef rice'], ['オムライス', 'Omelet rice']],
    ['omurice', 'オムライス', 'Omelet rice', ['カレーライス', 'Curry rice'], ['たまご焼き', 'Rolled omelet'], ['オムレツ', 'Omelet']],
    ['bread', '食パン', 'Sliced bread', ['まくら', 'Pillow'], ['チーズ', 'Cheese'], ['ドア', 'Door']],
    ['takoyaki', 'たこやき', 'Takoyaki', ['お団子', 'Dango'], ['ボール', 'Ball'], ['シュークリーム', 'Cream puff']],
    ['shortcake', 'ショートケーキ', 'Shortcake', ['チーズ', 'Cheese'], ['サンドイッチ', 'Sandwich'], ['おにぎり', 'Rice ball']],
    ['pudding', 'プリン', 'Pudding', ['ケーキ', 'Cake'], ['コップ', 'Cup'], ['山', 'Mountain']],
  ],
  plant: [
    ['bamboo', '竹', 'Bamboo', ['ものさし', 'Ruler'], ['はしご', 'Ladder'], ['木', 'Tree']],
    ['mountain', '山', 'Mountain', ['おにぎり', 'Rice ball'], ['テント', 'Tent'], ['三角', 'Triangle']],
  ],
  vehicle: [
    ['truck', 'トラック', 'Truck', ['バス', 'Bus'], ['車', 'Car'], ['救急車', 'Ambulance']],
    ['ambulance', '救急車', 'Ambulance', ['バス', 'Bus'], ['パトカー', 'Police car'], ['トラック', 'Truck']],
    ['policecar', 'パトカー', 'Police car', ['タクシー', 'Taxi'], ['救急車', 'Ambulance'], ['車', 'Car']],
    ['taxi', 'タクシー', 'Taxi', ['パトカー', 'Police car'], ['車', 'Car'], ['バス', 'Bus']],
    ['unicycle', '一輪車', 'Unicycle', ['自転車', 'Bicycle'], ['車輪', 'Wheel'], ['時計', 'Clock']],
    ['stroller', 'ベビーカー', 'Stroller', ['ショッピングカート', 'Shopping cart'], ['車椅子', 'Wheelchair'], ['いす', 'Chair']],
  ],
  building: [
    ['hospital', '病院', 'Hospital', ['学校', 'School'], ['ホテル', 'Hotel'], ['家', 'House']],
    ['station', '駅', 'Station', ['学校', 'School'], ['お店', 'Shop'], ['バス停', 'Bus stop']],
    ['konbini', 'コンビニ', 'Convenience store', ['家', 'House'], ['スーパー', 'Supermarket'], ['駅', 'Station']],
    ['temple', 'お寺', 'Temple', ['神社', 'Shrine'], ['お城', 'Castle'], ['家', 'House']],
    ['igloo', 'かまくら', 'Igloo', ['おわん', 'Bowl'], ['テント', 'Tent'], ['おにぎり', 'Rice ball']],
    ['tent', 'テント', 'Tent', ['家', 'House'], ['山', 'Mountain'], ['おにぎり', 'Rice ball']],
    ['ferriswheel', '観覧車', 'Ferris wheel', ['時計', 'Clock'], ['車輪', 'Wheel'], ['花', 'Flower']],
    ['slide', 'すべり台', 'Slide', ['階段', 'Stairs'], ['はしご', 'Ladder'], ['坂道', 'Slope']],
    ['church', '教会', 'Church', ['家', 'House'], ['お城', 'Castle'], ['学校', 'School']],
    ['skyscraper', 'ビル', 'Skyscraper', ['マンション', 'Apartment'], ['タワー', 'Tower'], ['本棚', 'Bookshelf']],
    ['pool', 'プール', 'Swimming pool', ['お風呂', 'Bathtub'], ['池', 'Pond'], ['海', 'Sea']],
    ['fountain', '噴水', 'Fountain', ['花火', 'Fireworks'], ['シャワー', 'Shower'], ['木', 'Tree']],
    ['doghouse', '犬小屋', 'Doghouse', ['家', 'House'], ['鳥の巣箱', 'Birdhouse'], ['箱', 'Box']],
  ],
  item: [
    ['comb', 'くし', 'Comb', ['歯ブラシ', 'Toothbrush'], ['フォーク', 'Fork'], ['はしご', 'Ladder']],
  ],
  fashion: [],
  culture: [],
};

const loc = ([ja, en]: [string, string]): Localized<string> => ({ ja, en });

export const DRAW_TOPICS: DrawTopic[] = (Object.entries(ROWS) as [Genre, Row[]][]).flatMap(([genre, rows]) =>
  rows.map(([id, ja, en, d1, d2, d3]) => ({ id: `draw-${id}`, genre, answer: { ja, en }, decoys: [loc(d1), loc(d2), loc(d3)] })),
);

export const DRAW_TOPIC_BY_ID = new Map(DRAW_TOPICS.map((t) => [t.id, t]));

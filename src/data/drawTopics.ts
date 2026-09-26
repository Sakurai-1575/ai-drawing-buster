/**
 * Mode B (draw together) text-only topics: people draw these, so there are no strokes.
 * Each row: [id, answer ja, answer en, then three decoys as [ja, en]] — decoys are things a
 * rough drawing of the answer could be mistaken for.
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
    ['dog', 'イヌ', 'Dog', ['ネコ', 'Cat'], ['タヌキ', 'Raccoon dog'], ['クマ', 'Bear']],
    ['lion', 'ライオン', 'Lion', ['太陽', 'Sun'], ['トラ', 'Tiger'], ['ヒマワリ', 'Sunflower']],
    ['panda', 'パンダ', 'Panda', ['クマ', 'Bear'], ['コアラ', 'Koala'], ['ブタ', 'Pig']],
    ['koala', 'コアラ', 'Koala', ['パンダ', 'Panda'], ['ネズミ', 'Mouse'], ['クマ', 'Bear']],
    ['monkey', 'サル', 'Monkey', ['ヒト', 'Person'], ['クマ', 'Bear'], ['コアラ', 'Koala']],
    ['horse', 'ウマ', 'Horse', ['ロバ', 'Donkey'], ['シカ', 'Deer'], ['キリン', 'Giraffe']],
    ['cow', 'ウシ', 'Cow', ['ブタ', 'Pig'], ['ヤギ', 'Goat'], ['ウマ', 'Horse']],
    ['tiger', 'トラ', 'Tiger', ['ネコ', 'Cat'], ['ライオン', 'Lion'], ['ヒョウ', 'Leopard']],
    ['bear', 'クマ', 'Bear', ['パンダ', 'Panda'], ['イヌ', 'Dog'], ['タヌキ', 'Raccoon dog']],
    ['fox', 'キツネ', 'Fox', ['イヌ', 'Dog'], ['オオカミ', 'Wolf'], ['ネコ', 'Cat']],
    ['kangaroo', 'カンガルー', 'Kangaroo', ['ウサギ', 'Rabbit'], ['ネズミ', 'Mouse'], ['恐竜', 'Dinosaur']],
    ['dinosaur', '恐竜', 'Dinosaur', ['トカゲ', 'Lizard'], ['ワニ', 'Crocodile'], ['ドラゴン', 'Dragon']],
    ['hedgehog', 'ハリネズミ', 'Hedgehog', ['クリ', 'Chestnut'], ['ネズミ', 'Mouse'], ['ウニ', 'Sea urchin']],
    ['chicken', 'ニワトリ', 'Chicken', ['ヒヨコ', 'Chick'], ['アヒル', 'Duck'], ['ハト', 'Pigeon']],
    ['crocodile', 'ワニ', 'Crocodile', ['トカゲ', 'Lizard'], ['恐竜', 'Dinosaur'], ['ヘビ', 'Snake']],
  ],
  creature: [
    ['ant', 'アリ', 'Ant', ['クモ', 'Spider'], ['ハチ', 'Bee'], ['テントウムシ', 'Ladybug']],
    ['beetle', 'カブトムシ', 'Rhinoceros beetle', ['クワガタ', 'Stag beetle'], ['カナブン', 'Chafer'], ['テントウムシ', 'Ladybug']],
    ['stagbeetle', 'クワガタ', 'Stag beetle', ['カブトムシ', 'Rhinoceros beetle'], ['ハサミ', 'Scissors'], ['アリ', 'Ant']],
    ['dragonfly', 'トンボ', 'Dragonfly', ['チョウ', 'Butterfly'], ['飛行機', 'Airplane'], ['ハチ', 'Bee']],
    ['cicada', 'セミ', 'Cicada', ['ハエ', 'Fly'], ['ガ', 'Moth'], ['カブトムシ', 'Rhinoceros beetle']],
    ['caterpillar', 'イモムシ', 'Caterpillar', ['ヘビ', 'Snake'], ['ミミズ', 'Earthworm'], ['ムカデ', 'Centipede']],
    ['mosquito', 'カ', 'Mosquito', ['ハエ', 'Fly'], ['ハチ', 'Bee'], ['トンボ', 'Dragonfly']],
    ['grasshopper', 'バッタ', 'Grasshopper', ['コオロギ', 'Cricket'], ['カマキリ', 'Praying mantis'], ['セミ', 'Cicada']],
    ['mantis', 'カマキリ', 'Praying mantis', ['バッタ', 'Grasshopper'], ['クワガタ', 'Stag beetle'], ['トンボ', 'Dragonfly']],
    ['squid', 'イカ', 'Squid', ['タコ', 'Octopus'], ['ロケット', 'Rocket'], ['クラゲ', 'Jellyfish']],
    ['shark', 'サメ', 'Shark', ['クジラ', 'Whale'], ['イルカ', 'Dolphin'], ['魚', 'Fish']],
    ['dolphin', 'イルカ', 'Dolphin', ['クジラ', 'Whale'], ['サメ', 'Shark'], ['魚', 'Fish']],
    ['shrimp', 'エビ', 'Shrimp', ['ザリガニ', 'Crayfish'], ['カニ', 'Crab'], ['イカ', 'Squid']],
    ['starfish', 'ヒトデ', 'Starfish', ['星', 'Star'], ['手', 'Hand'], ['花', 'Flower']],
    ['seahorse', 'タツノオトシゴ', 'Seahorse', ['エビ', 'Shrimp'], ['ヘビ', 'Snake'], ['ウマ', 'Horse']],
  ],
  food: [
    ['ramen', 'ラーメン', 'Ramen', ['うどん', 'Udon'], ['そば', 'Soba'], ['スープ', 'Soup']],
    ['curry', 'カレーライス', 'Curry rice', ['シチュー', 'Stew'], ['ハヤシライス', 'Hashed beef rice'], ['オムライス', 'Omelet rice']],
    ['omurice', 'オムライス', 'Omelet rice', ['カレーライス', 'Curry rice'], ['たまご焼き', 'Rolled omelet'], ['オムレツ', 'Omelet']],
    ['friedegg', '目玉焼き', 'Fried egg', ['太陽', 'Sun'], ['ドーナツ', 'Donut'], ['ホットケーキ', 'Pancake']],
    ['bread', '食パン', 'Sliced bread', ['まくら', 'Pillow'], ['チーズ', 'Cheese'], ['ドア', 'Door']],
    ['cheese', 'チーズ', 'Cheese', ['ケーキ', 'Cake'], ['スイカ', 'Watermelon'], ['ピザ', 'Pizza']],
    ['dango', 'お団子', 'Dango', ['ブドウ', 'Grapes'], ['雪だるま', 'Snowman'], ['信号機', 'Traffic light']],
    ['takoyaki', 'たこやき', 'Takoyaki', ['お団子', 'Dango'], ['ボール', 'Ball'], ['シュークリーム', 'Cream puff']],
    ['shortcake', 'ショートケーキ', 'Shortcake', ['チーズ', 'Cheese'], ['サンドイッチ', 'Sandwich'], ['おにぎり', 'Rice ball']],
    ['lollipop', 'ペロペロキャンディ', 'Lollipop', ['うずまき', 'Spiral'], ['虫メガネ', 'Magnifying glass'], ['うちわ', 'Hand fan']],
    ['pudding', 'プリン', 'Pudding', ['ケーキ', 'Cake'], ['コップ', 'Cup'], ['山', 'Mountain']],
    ['hotdog', 'ホットドッグ', 'Hot dog', ['ハンバーガー', 'Hamburger'], ['サンドイッチ', 'Sandwich'], ['ソーセージ', 'Sausage']],
    ['lemon', 'レモン', 'Lemon', ['たまご', 'Egg'], ['ラグビーボール', 'Rugby ball'], ['みかん', 'Mandarin orange']],
    ['pineapple', 'パイナップル', 'Pineapple', ['まつぼっくり', 'Pinecone'], ['ヤシの木', 'Palm tree'], ['ゴーヤ', 'Bitter melon']],
    ['corn', 'とうもろこし', 'Corn', ['バナナ', 'Banana'], ['ブドウ', 'Grapes'], ['ゴーヤ', 'Bitter melon']],
  ],
  plant: [
    ['rose', 'バラ', 'Rose', ['チューリップ', 'Tulip'], ['キャベツ', 'Cabbage'], ['うずまき', 'Spiral']],
    ['sakura', '桜', 'Cherry blossom', ['梅', 'Plum blossom'], ['星', 'Star'], ['花火', 'Fireworks']],
    ['bamboo', '竹', 'Bamboo', ['ものさし', 'Ruler'], ['はしご', 'Ladder'], ['木', 'Tree']],
    ['palmtree', 'ヤシの木', 'Palm tree', ['木', 'Tree'], ['花火', 'Fireworks'], ['パイナップル', 'Pineapple']],
    ['firtree', 'もみの木', 'Fir tree', ['山', 'Mountain'], ['矢印', 'Arrow'], ['ロケット', 'Rocket']],
    ['dandelion', 'タンポポ', 'Dandelion', ['太陽', 'Sun'], ['ヒマワリ', 'Sunflower'], ['綿あめ', 'Cotton candy']],
    ['leaf', '葉っぱ', 'Leaf', ['魚', 'Fish'], ['羽', 'Feather'], ['たまご', 'Egg']],
    ['acorn', 'どんぐり', 'Acorn', ['クリ', 'Chestnut'], ['帽子', 'Hat'], ['たまご', 'Egg']],
    ['rainbow', '虹', 'Rainbow', ['橋', 'Bridge'], ['アーチ', 'Arch'], ['バナナ', 'Banana']],
    ['cloud', '雲', 'Cloud', ['ヒツジ', 'Sheep'], ['綿あめ', 'Cotton candy'], ['木', 'Tree']],
    ['mountain', '山', 'Mountain', ['おにぎり', 'Rice ball'], ['テント', 'Tent'], ['三角', 'Triangle']],
    ['volcano', '火山', 'Volcano', ['山', 'Mountain'], ['プリン', 'Pudding'], ['噴水', 'Fountain']],
    ['lightning', 'かみなり', 'Lightning', ['矢印', 'Arrow'], ['ギザギザ線', 'Zigzag'], ['Zの文字', 'Letter Z']],
    ['snowflake', '雪の結晶', 'Snowflake', ['星', 'Star'], ['花', 'Flower'], ['アスタリスク', 'Asterisk']],
    ['waterfall', '滝', 'Waterfall', ['川', 'River'], ['シャワー', 'Shower'], ['カーテン', 'Curtain']],
  ],
  vehicle: [
    ['bus', 'バス', 'Bus', ['電車', 'Train'], ['トラック', 'Truck'], ['冷蔵庫', 'Fridge']],
    ['truck', 'トラック', 'Truck', ['バス', 'Bus'], ['車', 'Car'], ['救急車', 'Ambulance']],
    ['ambulance', '救急車', 'Ambulance', ['バス', 'Bus'], ['パトカー', 'Police car'], ['トラック', 'Truck']],
    ['policecar', 'パトカー', 'Police car', ['タクシー', 'Taxi'], ['救急車', 'Ambulance'], ['車', 'Car']],
    ['firetruck', '消防車', 'Fire truck', ['トラック', 'Truck'], ['救急車', 'Ambulance'], ['はしご', 'Ladder']],
    ['taxi', 'タクシー', 'Taxi', ['パトカー', 'Police car'], ['車', 'Car'], ['バス', 'Bus']],
    ['motorcycle', 'バイク', 'Motorcycle', ['自転車', 'Bicycle'], ['スクーター', 'Scooter'], ['車椅子', 'Wheelchair']],
    ['ufo', 'UFO', 'UFO', ['帽子', 'Hat'], ['土星', 'Saturn'], ['お皿', 'Plate']],
    ['submarine', '潜水艦', 'Submarine', ['クジラ', 'Whale'], ['魚', 'Fish'], ['船', 'Ship']],
    ['tractor', 'トラクター', 'Tractor', ['車', 'Car'], ['戦車', 'Tank'], ['ショベルカー', 'Excavator']],
    ['excavator', 'ショベルカー', 'Excavator', ['クレーン車', 'Crane truck'], ['トラクター', 'Tractor'], ['恐竜', 'Dinosaur']],
    ['skateboard', 'スケートボード', 'Skateboard', ['ベンチ', 'Bench'], ['サーフボード', 'Surfboard'], ['車', 'Car']],
    ['shinkansen', '新幹線', 'Bullet train', ['電車', 'Train'], ['飛行機', 'Airplane'], ['ロケット', 'Rocket']],
    ['unicycle', '一輪車', 'Unicycle', ['自転車', 'Bicycle'], ['車輪', 'Wheel'], ['時計', 'Clock']],
    ['stroller', 'ベビーカー', 'Stroller', ['ショッピングカート', 'Shopping cart'], ['車椅子', 'Wheelchair'], ['いす', 'Chair']],
  ],
  building: [
    ['hospital', '病院', 'Hospital', ['学校', 'School'], ['ホテル', 'Hotel'], ['家', 'House']],
    ['station', '駅', 'Station', ['学校', 'School'], ['お店', 'Shop'], ['バス停', 'Bus stop']],
    ['konbini', 'コンビニ', 'Convenience store', ['家', 'House'], ['スーパー', 'Supermarket'], ['駅', 'Station']],
    ['temple', 'お寺', 'Temple', ['神社', 'Shrine'], ['お城', 'Castle'], ['家', 'House']],
    ['pyramid', 'ピラミッド', 'Pyramid', ['山', 'Mountain'], ['おにぎり', 'Rice ball'], ['三角コーン', 'Traffic cone']],
    ['igloo', 'かまくら', 'Igloo', ['おわん', 'Bowl'], ['テント', 'Tent'], ['おにぎり', 'Rice ball']],
    ['tent', 'テント', 'Tent', ['家', 'House'], ['山', 'Mountain'], ['おにぎり', 'Rice ball']],
    ['ferriswheel', '観覧車', 'Ferris wheel', ['時計', 'Clock'], ['車輪', 'Wheel'], ['花', 'Flower']],
    ['slide', 'すべり台', 'Slide', ['階段', 'Stairs'], ['はしご', 'Ladder'], ['坂道', 'Slope']],
    ['windmill', '風車', 'Windmill', ['扇風機', 'Electric fan'], ['花', 'Flower'], ['十字架', 'Cross']],
    ['church', '教会', 'Church', ['家', 'House'], ['お城', 'Castle'], ['学校', 'School']],
    ['skyscraper', 'ビル', 'Skyscraper', ['マンション', 'Apartment'], ['タワー', 'Tower'], ['本棚', 'Bookshelf']],
    ['pool', 'プール', 'Swimming pool', ['お風呂', 'Bathtub'], ['池', 'Pond'], ['海', 'Sea']],
    ['fountain', '噴水', 'Fountain', ['花火', 'Fireworks'], ['シャワー', 'Shower'], ['木', 'Tree']],
    ['doghouse', '犬小屋', 'Doghouse', ['家', 'House'], ['鳥の巣箱', 'Birdhouse'], ['箱', 'Box']],
  ],
  item: [
    ['smartphone', 'スマホ', 'Smartphone', ['テレビ', 'TV'], ['本', 'Book'], ['リモコン', 'Remote']],
    ['book', '本', 'Book', ['ノート', 'Notebook'], ['箱', 'Box'], ['ドア', 'Door']],
    ['chair', 'いす', 'Chair', ['テーブル', 'Table'], ['はしご', 'Ladder'], ['ベッド', 'Bed']],
    ['bed', 'ベッド', 'Bed', ['ソファ', 'Sofa'], ['テーブル', 'Table'], ['本棚', 'Bookshelf']],
    ['toothbrush', '歯ブラシ', 'Toothbrush', ['くし', 'Comb'], ['ほうき', 'Broom'], ['フォーク', 'Fork']],
    ['comb', 'くし', 'Comb', ['歯ブラシ', 'Toothbrush'], ['フォーク', 'Fork'], ['はしご', 'Ladder']],
    ['fork', 'フォーク', 'Fork', ['スプーン', 'Spoon'], ['くし', 'Comb'], ['熊手', 'Rake']],
    ['headphones', 'ヘッドホン', 'Headphones', ['耳あて', 'Earmuffs'], ['メガネ', 'Glasses'], ['虹', 'Rainbow']],
    ['crown', '王冠', 'Crown', ['帽子', 'Hat'], ['チューリップ', 'Tulip'], ['山', 'Mountain']],
    ['hat', '帽子', 'Hat', ['キノコ', 'Mushroom'], ['王冠', 'Crown'], ['おわん', 'Bowl']],
    ['glove', '手ぶくろ', 'Glove', ['手', 'Hand'], ['くつした', 'Sock'], ['ミトン', 'Mitten']],
    ['shoe', 'くつ', 'Shoe', ['船', 'Ship'], ['長ぐつ', 'Rain boot'], ['スリッパ', 'Slipper']],
    ['bag', 'かばん', 'Bag', ['箱', 'Box'], ['カメラ', 'Camera'], ['財布', 'Wallet']],
    ['desklamp', '電気スタンド', 'Desk lamp', ['キノコ', 'Mushroom'], ['傘', 'Umbrella'], ['花', 'Flower']],
    ['trophy', 'トロフィー', 'Trophy', ['コップ', 'Cup'], ['王冠', 'Crown'], ['花びん', 'Vase']],
  ],
};

const loc = ([ja, en]: [string, string]): Localized<string> => ({ ja, en });

export const DRAW_TOPICS: DrawTopic[] = (Object.entries(ROWS) as [Genre, Row[]][]).flatMap(([genre, rows]) =>
  rows.map(([id, ja, en, d1, d2, d3]) => ({ id: `draw-${id}`, genre, answer: { ja, en }, decoys: [loc(d1), loc(d2), loc(d3)] })),
);

export const DRAW_TOPIC_BY_ID = new Map(DRAW_TOPICS.map((t) => [t.id, t]));

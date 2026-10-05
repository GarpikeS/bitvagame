export const LAYOUT7_PACK_PRICE = 50;

const lines = value => value.trim().split('\n');

const songSets = {
  'hits-free': lines(`
IOWA — Маршрутка
Градусы — Режиссёр
Руки Вверх! — Крошка моя
Ирина Аллегрова — Угонщица
Фабрика — Про любовь
Антон Токарев — Седьмой лепесток
t.A.T.u. — Я сошла с ума
Леонид Агутин, Владимир Пресняков — Аэропорты
Сплин — Моё сердце
Бумбокс — Вахтёрам
Елена Ваенга — Курю
Андрей Губин — Ночь
`),
  '90-1': lines(`
Мираж — Музыка нас связала
Михаил Шуфутинский — 3-е Сентября
Сплин — Моё сердце
Алла Пугачёва — Любовь, похожая на сон
Акула — Такая любовь
Комбинация — Два кусочека колбаски
Надежда Кадышева — Плывёт веночек
Владимир Кузьмин — Я не забуду тебя
Женя Белоусов — Девчонка-девчоночка
Валерий Меладзе — Самба белого мотылька
Владимир Маркин — Я готов целовать...
Земляне — Трава у дома
`),
  '90-2': lines(`
Алёна Апина — На теплоходе музыка играет
Кристина Орбакайте — Перелетная птица
Александр Серов — Я люблю тебя до слёз
Кипелов — Я свободен
Татьяна Буланова — Ясный мой свет
Маша и Медведи — Любочка
Комбинация — Бухгалтер
Вячеслав Добрынин — Всё, что в жизни
Рок-острова — Ничего не говори
Стрелки — На вечеринке
Света — Может да, может нет
Юрий Шатунов — Седая ночь
`),
  '90-3': lines(`
Алёна Апина — Электричка
Лариса Черникова — Влюблённый самолёт
REFLEX — Non Stop
Агата Кристи — Как на войне
Краски — Он Не Знает Ничего
Любовь Успенская — Кабриолет
Вячеслав Бутусов — Девушка по городу
Филипп Киркоров — Я за тебя умру
Андрей Губин — Девушки как звёзды
Леонид Агутин — Остров
Вирус — Ты меня не ищи
Игорь Корнелюк — Дожди
`),
  '90-4': lines(`
Отпетые мошенники — Люби меня, люби
Гости из будущего — Зима в сердце
Ирина Аллегрова — Угонщица
Шура — Ты не верь слезам
Дмитрий Маликов — Кто тебе сказал
Король и Шут — Кукла колдуна
Сектор Газа — Лирика
Мурат Насыров — Мальчик хочет в Тамбов
Гарик Сукачёв — Моя бабушка курит трубку
Игорь Николаев — Выпьем за любовь
Браво — Этот город
Иванушки International — Тополиный пух
`),
  '2000-1': lines(`
ВИА ГРА — Попытка №5
Ирина Дубцова — О нём
Пропаганда — Мелом
Непара — Плачь и смотри
Юлия Савичева — Если в сердце живёт любовь
Лолита — Ориентация Север
Серёга feat. Бьянка — Возле дома твоего
Блестящие — Восточные сказки
Тимати — Не сходи с ума
Noize MC — Из окна
Чай Вдвоем — Просто друг
Звери — Районы-кварталы
`),
  '2000-2': lines(`
Градусы — Режиссер
Иракли — Лондон-Париж
Лигалайз — Будущие мамы
5sta Family — Я буду
Надежда Кадышева — Широка река
Виктория Дайнеко — Я просто сразу от тебя уйду
Фабрика — Про любовь
Валерий Меладзе — Океан и три реки
Николай Басков — Ты далеко
Стас Михайлов — Всё для тебя
Бумбокс — Вахтерам
Леонид Агутин, Владимир Пресняков — Аэропорты
`),
  '2000-3': lines(`
Женя Отрадная — Уходи
Григорий Лепс — Рюмка водки на столе
Полина Гагарина, Ирина Дубцова — Кому, Зачем?
Стас Пьеха — На ладони линия
Руки Вверх! — Он тебя целует
Дима Билан — Я твой номер один
Лера Массква — 7 этаж
Город 312 — Останусь
t.A.T.u. — Я сошла с ума
МакSим — Научусь летать
Кристина Орбакайте — Просто любить тебя
Валерий Меладзе — Салют, Вера
`),
  '2000-4': lines(`
БАНД'ЭРОС — Про красивую жизнь
София Ротару — Я назову планету
Алсу — Иногда
Елена Ваенга — Курю
Quest Pistols — Белая стрекоза любви
Uma2rman — Папины дочки
Сергей Трофимов — Город Сочи
A'Studio — Улетаю
Авраам Руссо — Знаю
Айдамир Мугу — Чёрные глаза
Катя Лель — Мой мармеладный
Григорий Лепс, Ирина Аллегрова — Я тебе не верю
`),
  '2010-1': [
    'Нюша — Выше',
    'Ленинград — Вояж',
    'Слава — Одиночество-сука',
    'Вера Брежнева — Любовь спасёт мир',
    'МОТ, Бьянка — Абсолютно всё',
    'Полина Гагарина — Спектакль окончен',
    'Лолита — На Титанике',
    'IOWA — Простая песня',
    'Тима Белорусских — Мокрые кроссы',
    'Сергей Лазарев — В Самое Сердце',
    'Elvira T — Всё решено',
    'Ёлка — На большом воздушном шаре',
  ],
  '2010-2': [
    '5sta Family — Зачем?',
    'Kristina Si — Хочу',
    'МАЛЬБЭК, Сюзанна — Гипнозы',
    'Элджей, FEDUK — Розовое вино',
    'MBAND — Она вернётся',
    'CREAM SODA — Никаких больше вечеринок',
    'Грибы — Тает лёд',
    'JONY — Комета',
    'Виктория Дайнеко — Сотри его из memory',
    'Натали — О боже, какой мужчина',
    'Егор Крид — Самая-самая',
    'Градусы — Голая',
  ],
  '2010-3': [
    'Валерий Меладзе — Небеса',
    'Винтаж — Роман',
    'Даша Суворова — Поставит Басту',
    'Тимати — Баклажан',
    'Валерия — Капелькою',
    'SEREBRO — Мама Люба',
    'Artik & Asti — Девочка танцуй',
    'Лёша Свик — Малиновый свет',
    'Макс Корж — Жить в кайф',
    'Элджей — Рваные джинсы',
    'Niletto — Любимка',
    'Алексей Воробьев — Сумасшедшая',
  ],
  '2010-4': [
    'Влади, Каста — Сочиняй мечты',
    'ВИА ГРА, Вахтанг — У меня появился другой',
    'Элджей, MORGENSHTERN — Cadillac',
    'DONI feat. Натали — Ты такой',
    'Юлианна Караулова — Ты не такой',
    'Quest Pistols Show — Я твой наркотик',
    'Пика — Патимэйкер',
    'Пара нормальных — Вставай',
    'Митя Фомин — Все будет хорошо',
    'Жанна Фриске — А на море белый песок',
    'Дима Билан — Молния',
    'Григорий Лепс — Водопадом',
  ],
};

const packTitle = decade => 'ХИТЫ ' + decade + '-Х';

const packPresentation = Object.freeze({
  karaoke: Object.freeze({
    catalogTitle: 'Хиты караоке',
    catalogTone: 'karaoke',
    catalogLayers: Object.freeze([
      '/generated/layout5/category-a1.png',
    ]),
    coverImage: '/figma-assets/music-category-karaoke-figma.png',
    coverHasTitle: true,
  }),
  '90': Object.freeze({
    catalogTitle: 'Хиты 90-х',
    catalogTone: '90',
    catalogLayers: Object.freeze([
      '/generated/layout5/category-a2.png',
      '/generated/layout5/category-a3.png',
    ]),
    coverImage: '/figma-assets/layout7/90-cover-clean.png',
    coverHasTitle: true,
  }),
  '2000': Object.freeze({
    catalogTitle: 'Хиты 2000-х',
    catalogTone: '2000',
    catalogLayers: Object.freeze([
      '/generated/layout5/category-b3.png',
    ]),
    coverImage: '/generated/layout5/category-b3.png',
    coverHasTitle: false,
  }),
  '2010': Object.freeze({
    catalogTitle: 'Хиты 2010-х',
    catalogTone: '2010',
    catalogLayers: Object.freeze([
      '/figma-assets/layout7/2010-cover-clean-v2.png',
    ]),
    coverImage: '/figma-assets/layout7/2010-cover-clean-v2.png',
    coverHasTitle: false,
  }),
});

export const LAYOUT7_FREE_PACK = Object.freeze({
  id: 'hits-free',
  decade: 'karaoke',
  setNumber: 0,
  title: 'ХИТЫ КАРАОКЕ',
  shortTitle: 'Хиты караоке · бесплатная версия',
  badgeTitle: 'Бесплатная версия',
  badgeImage: '/figma-assets/music-category-karaoke-figma.png',
  entitlementId: null,
  free: true,
  image: '/figma-assets/music-category-karaoke-figma.png',
  ...packPresentation.karaoke,
  price: 0,
  songs: Object.freeze(songSets['hits-free']),
});

const allPaidPacks = ['90', '2000', '2010'].flatMap(decade => [1, 2, 3, 4].map(setNumber => {
    const id = decade + '-' + setNumber;
    return Object.freeze({
      id,
      decade,
      setNumber,
      title: packTitle(decade),
      shortTitle: setNumber === 1
        ? 'Хиты ' + decade + '-х'
        : 'Хиты ' + decade + '-х · набор № ' + setNumber,
      entitlementId: 'karaoke:' + id,
      image: '/figma-assets/layout7/' + id + '.png',
      ...packPresentation[decade],
      price: LAYOUT7_PACK_PRICE,
      songs: Object.freeze(songSets[id]),
    });
  }));

export const LAYOUT7_ALL_PACKS = Object.freeze([LAYOUT7_FREE_PACK, ...allPaidPacks]);
export const LAYOUT7_PACKS = Object.freeze([
  LAYOUT7_FREE_PACK,
  ...allPaidPacks.filter(pack => pack.setNumber === 1),
]);

export const LAYOUT7_PACK_BY_ID = Object.freeze(
  Object.fromEntries(LAYOUT7_ALL_PACKS.map(pack => [pack.id, pack])),
);
const LEGACY_PACK_GRANTS = Object.freeze({
  'karaoke:90s': '90-1',
  'karaoke:2000s': '2000-1',
  'karaoke:girls': '2010-1',
});

export function ownsLayout7Pack(pack, entitlements = []) {
  if (!pack) return false;
  if (pack.free) return true;
  const owned = new Set(entitlements);
  if (owned.has(pack.entitlementId)) return true;
  return Object.entries(LEGACY_PACK_GRANTS).some(
    ([legacyId, packId]) => packId === pack.id && owned.has(legacyId),
  );
}

export function splitSongLabel(label) {
  const [artist = '', ...titleParts] = String(label || '').split(' — ');
  return { artist, title: titleParts.join(' — ') };
}

export const LAYOUT7_MEDIA_PUBLIC_KEY = 'https://disk.yandex.ru/d/0D980fCRit0sDg';
export const LAYOUT7_FREE_MEDIA_PUBLIC_KEY = 'https://disk.yandex.ru/d/njfSvL7a_LToew';
export const LAYOUT7_90_MEDIA_PUBLIC_KEY = 'https://disk.yandex.ru/d/gyBRoloAVJ4d5Q';

const LAYOUT7_90_MEDIA_STEMS = Object.freeze([
  'мираж',
  'шуфутин',
  'сплин',
  'пугачева',
  'акула',
  'комбинация',
  'кадыш',
  'кузьмин',
  'белоусов',
  'меладзе',
  'маркин',
  'земляне',
]);

const MEDIA_SOURCE_BY_PACK_ID = Object.freeze({
  'hits-free': Object.freeze({ publicKey: LAYOUT7_FREE_MEDIA_PUBLIC_KEY, root: '' }),
  '90-1': Object.freeze({
    publicKey: LAYOUT7_90_MEDIA_PUBLIC_KEY,
    root: '/90 пак №1',
    stems: LAYOUT7_90_MEDIA_STEMS,
  }),
  '2000-1': Object.freeze({ publicKey: LAYOUT7_MEDIA_PUBLIC_KEY, root: '/00-е' }),
  '2010-1': Object.freeze({ publicKey: LAYOUT7_MEDIA_PUBLIC_KEY, root: '/10-е' }),
});

export function getLayout7SongMedia(pack, songIndex) {
  const source = MEDIA_SOURCE_BY_PACK_ID[pack?.id];
  if (!pack || !source || !Number.isSafeInteger(songIndex)) return null;
  const normalizedIndex = ((songIndex % pack.songs.length) + pack.songs.length) % pack.songs.length;
  const stem = source.stems?.[normalizedIndex];
  if (stem) {
    return Object.freeze({
      answersPath: source.root + '/' + stem + ' 3.png',
      landscapeVideoPath: source.root + '/' + stem + ' 2.mp4',
      publicKey: source.publicKey,
      squareVideoPath: source.root + '/' + stem + ' 1.mp4',
    });
  }
  const order = normalizedIndex + 1;
  const diskTitle = pack.songs[normalizedIndex].replace(' — ', ' - ');
  const videoFile = order + ' ' + diskTitle + '.mp4';
  return Object.freeze({
    answersPath: source.root + '/' + order + '.png',
    landscapeVideoPath: source.root + '/альбомные/' + videoFile,
    publicKey: source.publicKey,
    squareVideoPath: source.root + '/квадратные/' + videoFile,
  });
}

export const LAYOUT7_SAMPLE_SONG = Object.freeze({
  artist: 'Дискотека Авария',
  title: 'Если хочешь остаться',
  stanzas: Object.freeze([
    Object.freeze([
      Object.freeze([{ text: 'То ли это ветерок мои губы колышет' }]),
      Object.freeze([{ text: 'То ли это я кричу тебе, но ты меня ' }, { answer: 'не слышишь' }]),
    ]),
    Object.freeze([
      Object.freeze([{ text: 'Если хочешь остаться, останься просто так' }]),
      Object.freeze([{ text: 'Пусть тебе приснятся ' }, { answer: 'сны' }, { text: ' о теплых берегах' }]),
      Object.freeze([{ text: 'Давно за двенадцать, а ты еще в гостях' }]),
      Object.freeze([{ text: 'Ты думаешь остаться, так останься ' }, { answer: 'просто так' }]),
    ]),
    Object.freeze([
      Object.freeze([{ text: 'Все изъедены сплетни за долгие месяцы' }]),
      Object.freeze([{ text: 'И гитару давно позабыли на лестнице' }]),
      Object.freeze([{ text: 'И ей уже не хочется песен' }]),
    ]),
  ]),
});

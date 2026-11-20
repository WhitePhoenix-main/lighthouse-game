import { CAMPAIGN_CHAPTER_DRAFT } from './campaignFoundationDraft';

const journal = [
  [
    'Я зажёг маяк в ответ на огни за каменным причалом. К берегу уже тянулись твари из тумана. У самой кромки света я увидел щупальце Стража глубин.',
    'I lit the lighthouse in answer to the lights beyond the stone pier. Creatures were already emerging from the mist. At the edge of the light I saw a tentacle of the Abyss Warden.',
  ],
  [
    'После победы у причала я услышал из дальней бухты команды Затонувшего капитана. Его отряд уже шёл вдоль косы. Я принёс ядро из первой башни и зажёг новый маяк.',
    'After the victory at the pier, I heard the Drowned Captain giving orders across the bay. His company was already marching along the spit. I carried the core from the first tower and lit the next beacon.',
  ],
  [
    'После победы в бухте отлив обнажил чёрные корни. Я пошёл вдоль них по тропам между островками. Под старым маяком, где корни сходились, билось Сердце топи.',
    'After the victory in the bay, the ebb exposed black roots. I followed them along the paths between the islands. The Marsh Heart beat beneath the old lighthouse where the roots met.',
  ],
  [
    'Когда Сердце топи стихло, я разглядел над болотом обгоревшую башню. Я поднялся к ней с ядром и нашёл пролом в старой стене. На открытом плато стоял Пепельный колосс.',
    'When the Marsh Heart fell silent, I saw a scorched tower above the bog. I carried the core uphill and found a breach in the old wall. The Ash Colossus stood on the open plateau.',
  ],
  [
    'Когда Колосс пал, с берега донёсся погребальный звон. Я спустился к маяку над фарватером. Среди обломков «Вечерний звон» собирал погибшие экипажи на последний штурм.',
    'When the Colossus fell, a funeral bell rang along the coast. I descended to the lighthouse above the channel. Among the wrecks, the Evening Knell called the dead crews to one last assault.',
  ],
  [
    'Когда звон стих, я заметил в руинах ответный сигнал. Так прежде отзывался наш хранитель. Теперь он вёл тварей к маякам по сигналам, которым я привык доверять.',
    'When the bell fell silent, a signal answered from the ruins. That was how our Keeper used to answer. Now he guided the creatures to our towers with the signals I once trusted.',
  ],
  [
    'После падения хранителя я увидел, откуда тянулся туман. По ту сторону разлома билось Сердце тумана. Я зажёг тот же свет, что когда-то над каменным причалом.',
    'After the Keeper fell, I saw where the mist came from. Its Heart beat beyond the rift. I lit the same light I had once kindled over the stone pier.',
  ],
] as const;

export function campaignChapterIntro(chapterIndex: number) {
  const chapter = CAMPAIGN_CHAPTER_DRAFT[chapterIndex];
  const text = journal[chapterIndex];
  if (!chapter || !text) return undefined;
  return { id: chapter.introId, title: chapter.title, chapterNumber: chapterIndex + 1,
    image: `chapter-${chapterIndex + 1}.webp`, ru: text[0], en: text[1] };
}

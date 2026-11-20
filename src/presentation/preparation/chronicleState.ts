import type { ApplicationView, NightId, NightOptionView } from '../../contracts';

export type ChronicleKind = 'campaign' | 'trials';

export interface ChronicleSelection {
  kind: ChronicleKind;
  chapterId: string;
  nightId: NightId | null;
  page: number;
  contents: boolean;
  contentsPage?: number;
  previewChapterId?: string;
  previewNightId?: NightId;
}

export interface ChronicleChapter {
  id: string;
  title: string;
  number: number;
  nights: NightOptionView[];
}

export interface ChroniclePage {
  chapter: ChronicleChapter;
  chapters: ChronicleChapter[];
  page: number;
  pageCount: number;
  nights: NightOptionView[];
  selected: NightOptionView | undefined;
}

const nightsPerPage = 4;

export function chronicleChapters(nights: readonly NightOptionView[], kind: ChronicleKind = 'campaign'): ChronicleChapter[] {
  if (kind === 'trials') {
    const trials = nights.filter(night => night.optional);
    return trials.length ? [{ id: 'trials', title: 'Испытания', number: 0, nights: trials }] : [];
  }

  const story = nights.filter(night => !night.optional);
  return [...new Set(story.map(night => night.chapter))].map((title, index) => ({
    id: String(index + 1),
    title,
    number: index + 1,
    nights: story.filter(night => night.chapter === title),
  }));
}

function chapterSelection(kind: ChronicleKind, chapter: ChronicleChapter, preferred?: NightId): ChronicleSelection {
  const night = chapter.nights.find(item => item.id === preferred && item.available)
    ?? chapter.nights.find(item => item.available && !item.completed)
    ?? chapter.nights.find(item => item.available);
  return {
    kind,
    chapterId: chapter.id,
    nightId: night?.id ?? null,
    page: night ? Math.floor(chapter.nights.indexOf(night) / nightsPerPage) : 0,
    contents: false,
  };
}

export function openChronicle(view: ApplicationView, kind?: ChronicleKind): ChronicleSelection | null {
  const activeNight = view.nights.find(night => night.id === view.selectedNightId);
  const book = kind ?? (activeNight?.optional ? 'trials' : 'campaign');
  const chapters = chronicleChapters(view.nights, book);
  const chapter = chapters.find(item => item.nights.some(night => night.id === view.selectedNightId)) ?? chapters[0];
  return chapter ? chapterSelection(book, chapter, view.selectedNightId) : null;
}

export function selectChronicleChapter(view: ApplicationView, selection: ChronicleSelection, id: string): ChronicleSelection {
  const chapter = chronicleChapters(view.nights, selection.kind).find(item => item.id === id);
  if (!chapter) return selection;
  if (chapter.id === selection.chapterId) return { ...selection, contents: false };
  return chapterSelection(selection.kind, chapter, view.selectedNightId);
}

export function chroniclePage(view: ApplicationView, selection: ChronicleSelection): ChroniclePage | null {
  const chapters = chronicleChapters(view.nights, selection.kind);
  const chapter = chapters.find(item => item.id === selection.chapterId);
  if (!chapter) return null;
  const pageCount = Math.ceil(chapter.nights.length / nightsPerPage);
  const page = Math.max(0, Math.min(selection.page, pageCount - 1));
  const nights = chapter.nights.slice(page * nightsPerPage, (page + 1) * nightsPerPage);
  const selected = nights.find(night => night.id === selection.nightId && night.available);
  return { chapter, chapters, page, pageCount, nights, selected };
}

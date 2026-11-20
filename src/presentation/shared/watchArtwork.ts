const base = import.meta.env.BASE_URL + 'images/avalon-watch/';
export const watchAsset = (path: string): string => base + path + '.png';
export const watchIcon = (name: string): string =>
  `<img class="watch-icon" src="${base}ui/icon-${name}.png" alt="" draggable="false">`;
export const watchIllustration = (name: string): string => watchAsset('illustrations/' + name);


# Шрифт меню

Выбран Vollkorn SC Regular (вес 400), семейство Friedrich Althausen / Vollkorn Project. Он сохраняет сдержанный контрастный serif и малые капители, близкие к заглавным буквам на референсах, без вида игрового блочного sans. Использован официальный статический TTF из каталога Google Fonts `ofl/vollkornsc`; TTF позволяет загружать локально без сетевого запроса и дополнительных runtime-зависимостей. Включён полный файл вместо узкого subset для надёжной поддержки русской и английской локализаций.

- Файл: `public/fonts/menu/VollkornSC-Regular.ttf` (202,164 байта).
- Лицензия: SIL Open Font License 1.1; полный текст сохранён рядом в `public/fonts/menu/OFL.txt`.
- Источник шрифта: [Google Fonts, vollkornsc](https://github.com/google/fonts/tree/main/ofl/vollkornsc).
- Первоисточник проекта шрифта: [Vollkorn Typeface](https://github.com/FAlthausen/Vollkorn-Typeface).

В семейство Vollkorn SC входит small-caps дизайн; Google Fonts публикует для него статические Regular, SemiBold, Bold и Black TTF. Целевые строки меню — `СВЕТ АВАЛОНА`, `ИГРАТЬ`, `НАСТРОЙКИ`, `LIGHT OF AVALON`, `PLAY`, `SETTINGS`. Файл получен непосредственно из официального каталога Google Fonts. При интеграции проверена таблица cmap TTF: все символы этих строк присутствуют. Загрузка шрифта и русский/английский текст проверены в изолированном Chrome, в обеих ориентациях и с крупным текстом. Проверка на физическом телефоне не выполнялась.

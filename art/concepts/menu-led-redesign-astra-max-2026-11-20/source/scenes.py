from leaves import select_game,settings,chronicle,journal
from preparation import prep_base,drawer,place,trial_mode
from battle import battle,outcome
from progress import catalogue,tree,collection,purchase
from interruptions import overlay

SCENES=[
    ("game-select","Выбор игры",select_game,()),("settings","Настройки",settings,()),
    ("chronicle-chapters","Хроника · оглавление",chronicle,("chapters",)),("chronicle-nights","Хроника · выбор ночи",chronicle,("nights",)),
    ("trials","Испытания прототипа",chronicle,("trials",)),
    *[(f"story-{i+1:02d}","Вступление · "+n,journal,(i,)) for i,n in enumerate(("Туманный берег","Дальний берег","Терновые топи","Пепельные утёсы","Кладбище кораблей","Затмение Авалона","Последний рассвет"))],
    ("preparation","Подготовка · карта",prep_base,()),("devices","Устройства · магазин",drawer,("devices",)),
    ("lens","Оснащение · линза",drawer,("lens",)),("ability","Оснащение · способность",drawer,("ability",)),
    ("placement","Расстановка экземпляра",place,()),("service","Обслуживание экземпляра",drawer,("service",)),
    ("invalid-placement","Позиция за границей суши",place,(True,)),("scouting","Разведка",drawer,("recon",)),
    ("currency","Осколки и недоступное видео",drawer,("currency",)),
    ("development","Развитие кампании",catalogue,()),("prototype-tree","Древо улучшений прототипа",tree,()),
    ("purchase","Покупка",purchase,()),("purchase-locked","Покупка · нехватка средств",purchase,(True,)),
    ("collection","Коллекция · получение награды",collection,()),
    ("battle","Бой · угрозы и цели",battle,("normal",)),("boss","Бой · Страж глубин",battle,("boss",)),
    ("device-command","Бой · команда пушки",battle,("command",)),("target-ability","Бой · выбор цели Печати",battle,("aim",)),
    ("pause","Пауза",overlay,("pause",)),("confirm-abandon","Подтверждение прерывания",overlay,("abandon",)),
    ("victory","Победа",outcome,("victory",)),("defeat","Поражение после гибели босса",outcome,("defeat",)),
    ("epilogue","Эпилог и итог финальной ночи",outcome,("epilogue",)),
    ("confirm-new","Подтверждение новой игры",overlay,("reset",)),("save-error","Ошибка сохранения результата",overlay,("save-error",)),
    ("reload-confirm","Подтверждение перечитывания",overlay,("reload",)),("settings-error","Ошибка записи настроек",overlay,("settings-error",)),
    ("profile-lock","Профиль открыт в другой вкладке",overlay,("locked",)),("interrupted","Возврат после прерывания",overlay,("interrupted",)),
    ("reward-test","Подтверждение на стенде видеонаград",overlay,("reward-test",)),
    ("new-profile","Выбор игры · новый профиль",select_game,(True,)),
    ("prototype-select","Выбор игры · профиль прототипа",select_game,(False,True)),
    ("trial-modes","Разведка · режим испытания прототипа",trial_mode,()),
    ("battle-shield","Бой · общее поле генераторов",battle,("field",)),
    ("story-replay","Пересмотр вступления из Хроники",journal,(0,True))
]

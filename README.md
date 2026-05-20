# InputLag Render Studio

База инструмента для сборки анимаций окон.

## Запуск

```bash
npm install
npm run dev -- --port 5178
```

Открыть:

```text
http://127.0.0.1:5178
```

## Что уже есть

- блок готовых пресетов;
- добавление пресета в студию на таймлайн;
- live preview окна;
- выбор page: Control Center, Boost, DPC, Logo/Text;
- duration, fps, speed, glow;
- start/end transform;
- простой graph editor;
- список действий внутри окна по времени;
- export-plan JSON с будущей командой render + ffmpeg;
- workbox с готовыми loop-работами.

## Как будут работать действия

Пока действие хранится как событие:

```js
{ at: 3.4, type: 'toggle.apply', label: 'Включить выбранный toggle' }
```

Дальше это можно связать с реальным DOM:

- `page.lock` - открыть нужную страницу;
- `scroll.to` - проскроллить окно до нужного блока;
- `toggle.apply` - нажать/анимировать toggle;
- `score.pulse` - пульс шкалы;
- `window.bendBottom` - деформация окна;
- `text.type` - печатание текста.

После привязки каждый action будет иметь проверку: выполнен / не выполнен.

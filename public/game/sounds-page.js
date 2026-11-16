// Страница прослушивания: все звуки и фоны игры по кнопке. В игру не входит, нужна разработчику.
import { AMBIENCES, EFFECTS, createSound } from './sound.js';

const NAMES = {
  scene: 'Смена сцены', choice: 'Выбор', write: 'Запись в дневник', unlock: 'Что-то открылось',
  skill: 'Приём в бою', hitFoe: 'Удар по тяге', hitYou: 'Удар по герою', blocked: 'Удар увяз в броне', heal: 'Стойкость вернулась',
  release: 'Броня снята признанием', win: 'Тяга отступила', silence: 'Победа над боссом', lose: 'Срыв',
  yard: 'Двор', kitchen: 'Кухня', room: 'Комната группы', river: 'Набережная', rain: 'Дождь', night: 'Ночь', battle: 'Бой',
};
// Настройка звука игры здесь не трогается: у страницы своя память на время визита.
const memory = new Map();
const sound = createSound({ storage: { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) } });
const main = document.querySelector('#sounds');
const button = (kind, name) => '<button class="g-btn g-secondary" data-kind="' + kind + '" data-name="' + name + '">' + (NAMES[name] || name) + '</button>';

main.insertAdjacentHTML('beforeend',
  '<h2>События</h2><div class="g-map">' + Object.keys(EFFECTS).map(name => button('effect', name)).join('') + '</div>' +
  '<h2>Фоны мест</h2><p class="g-lead">Фон звучит, пока не выбран другой или не нажата «Тишина».</p><div class="g-map">' + Object.keys(AMBIENCES).map(name => button('ambience', name)).join('') + button('ambience', '') .replace('></button>', '>Тишина</button>') + '</div>' +
  '<p class="g-note" id="now" role="status">Сейчас: тишина.</p>');

const config = await fetch(new URL('./data/sounds.json', import.meta.url)).then(response => response.json()).catch(() => ({}));
sound.configure(config);

main.addEventListener('click', event => {
  const target = event.target.closest('button[data-kind]');
  if (!target) return;
  if (!sound.enabled) sound.setEnabled(true);
  if (target.dataset.kind === 'effect') sound.play(target.dataset.name);
  else {
    sound.ambience(target.dataset.name || null);
    document.querySelector('#now').textContent = 'Сейчас: ' + (target.dataset.name ? (NAMES[target.dataset.name] || target.dataset.name).toLowerCase() : 'тишина') + '.';
  }
});

// Handles the website's user interface and interactions.
let lowerCaseDb = {};

    // Guard localStorage: privacy settings can make it unavailable.
    function getSavedTheme() {
      try { return localStorage.getItem('app-theme'); }
      catch (error) { return null; }
    }

    function saveTheme(theme) {
      try { localStorage.setItem('app-theme', theme); }
      catch (error) { /* Theme still works for this page view. */ }
    }

    function applyTheme(theme) {
      const isDark = theme === 'dark';
      document.body.classList.toggle('dark-mode', isDark);
      const button = document.getElementById('theme-btn');
      if (button) {
        button.innerText = isDark ? '☀️' : '🌙';
        button.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
      }
    }

    function toggleTheme() {
      const isDark = !document.body.classList.contains('dark-mode');
      applyTheme(isDark ? 'dark' : 'light');
      saveTheme(isDark ? 'dark' : 'light');
    }

    function changeCP(amount) {
      const cpInput = document.getElementById('cp');
      const currentVal = Number(cpInput.value);
      const nextVal = Number.isFinite(currentVal) && Number.isInteger(currentVal)
        ? Math.max(10, currentVal + amount)
        : 10;
      cpInput.value = String(nextVal);
      calcAll();
    }

    window.addEventListener('DOMContentLoaded', function() {
      applyTheme(getSavedTheme() === 'dark' ? 'dark' : 'light');

      if (typeof baseStatsDb !== 'undefined') {
        Object.keys(baseStatsDb).forEach(name => {
          lowerCaseDb[name.toLowerCase()] = baseStatsDb[name];
        });
      }
      setupPokemonAutocomplete();

      ['atk', 'def', 'hp'].forEach(id => updateVal(id));
      setupAttackRuler();
      calcAll();
    });


    // Experimental 0–15 ruler. The existing #atk input remains the
    // single source of truth for the unchanged IV and CP calculations.
    function setupAttackRuler() {
      const input = document.getElementById('atk');
      const ruler = document.getElementById('atk-ruler');
      const wrapper = document.querySelector('.attack-ruler-wrapper');
      if (!input || !ruler || !wrapper) return;

      const MIN = 0;
      const MAX = 15;
      const SPACING = 30; // pixels between discrete IV values

      const clampIV = value => Math.max(MIN, Math.min(MAX, Math.round(value)));
      const ticks = [];

      for (let iv = MIN; iv <= MAX; iv++) {
        const tick = document.createElement('div');
        tick.className = 'iv-ruler-tick';
        tick.dataset.iv = String(iv);
        tick.setAttribute('aria-hidden', 'true');
        if (iv % 5 === 0 || iv === MAX) tick.classList.add('major');
        const label = document.createElement('span');
        label.className = 'iv-ruler-tick-label';
        label.textContent = iv % 5 === 0 || iv === MAX ? String(iv) : '';
        const mark = document.createElement('span');
        mark.className = 'iv-ruler-tick-mark';
        tick.append(label, mark);
        tick.addEventListener('click', () => setIV(iv, true));
        ruler.appendChild(tick);
        ticks.push(tick);
      }

      function setIV(value, reposition) {
        const iv = clampIV(value);
        if (Number(input.value) !== iv) {
          input.value = String(iv);
          updateVal('atk');
          calcAll();
        }
        ruler.setAttribute('aria-valuenow', String(iv));
        ruler.setAttribute('aria-valuetext', iv + ' of 15');
        for (let i = MIN; i <= MAX; i++) {
          ticks[i].classList.toggle('selected', i === iv);
        }
        if (reposition) ruler.scrollLeft = iv * SPACING;
      }

      // Native touch scrolling provides inertia; snap points settle on integers.
      // Only calculate when the rounded value actually changes.
      ruler.addEventListener('scroll', () => {
        setIV(ruler.scrollLeft / SPACING, false);
      }, { passive: true });

      ruler.addEventListener('keydown', event => {
        let next;
        const current = Number(input.value);
        switch (event.key) {
          case 'ArrowRight':
          case 'ArrowUp': next = current + 1; break;
          case 'ArrowLeft':
          case 'ArrowDown': next = current - 1; break;
          case 'Home': next = MIN; break;
          case 'End': next = MAX; break;
          case 'PageUp': next = current + 5; break;
          case 'PageDown': next = current - 5; break;
          default: return;
        }
        event.preventDefault();
        setIV(next, true);
      });

      wrapper.querySelectorAll('[data-ruler-step]').forEach(button => {
        button.addEventListener('click', () => {
          setIV(Number(input.value) + Number(button.dataset.rulerStep), true);
        });
      });

      // Mouse users can drag the ruler just like touch users swipe it.
      // A regular click on a visible tick remains an exact selection.
      let drag = null;
      ruler.addEventListener('pointerdown', event => {
        if (event.pointerType !== 'mouse' || event.button !== 0) return;
        drag = { x: event.clientX, left: ruler.scrollLeft, moved: false };
      });
      ruler.addEventListener('pointermove', event => {
        if (!drag || (event.buttons & 1) === 0) return;
        const delta = event.clientX - drag.x;
        if (!drag.moved && Math.abs(delta) > 5) {
          drag.moved = true;
          ruler.style.scrollSnapType = 'none';
          ruler.setPointerCapture(event.pointerId);
        }
        if (drag.moved) ruler.scrollLeft = drag.left - delta;
      });
      function stopDragging(event) {
        if (!drag) return;
        const wasDragging = drag.moved;
        drag = null;
        ruler.style.scrollSnapType = '';
        if (wasDragging) {
          ruler.dataset.justDragged = 'true';
          if (ruler.hasPointerCapture(event.pointerId)) {
            ruler.releasePointerCapture(event.pointerId);
          }
          setIV(ruler.scrollLeft / SPACING, true);
        }
      }
      ruler.addEventListener('pointerup', stopDragging);
      ruler.addEventListener('pointercancel', stopDragging);
      // A drag should not also activate a tick click.
      ruler.addEventListener('click', event => {
        if (ruler.dataset.justDragged === 'true') {
          event.stopPropagation();
          ruler.dataset.justDragged = '';
        }
      }, true);

      // Account for viewport changes without changing the selected IV.
      window.addEventListener('resize', () => {
        ruler.scrollLeft = Number(input.value) * SPACING;
      });

      setIV(Number(input.value), true);
    }

    // Custom suggestions replace the browser-styled datalist.
    function setupPokemonAutocomplete() {
      const input = document.getElementById('name');
      const listbox = document.getElementById('pokemon-suggestions');
      if (!input || !listbox || typeof baseStatsDb === 'undefined') return;

      const names = Object.keys(baseStatsDb);
      const limit = 8;
      let matches = [];
      let activeIndex = -1;

      function close() {
        listbox.hidden = true;
        input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');
        activeIndex = -1;
      }

      function setActive(index) {
        activeIndex = index;
        const options = listbox.querySelectorAll('[role="option"]');
        options.forEach((option, i) => {
          option.setAttribute('aria-selected', String(i === index));
        });
        if (index >= 0 && options[index]) {
          input.setAttribute('aria-activedescendant', options[index].id);
          options[index].scrollIntoView({ block: 'nearest' });
        } else {
          input.removeAttribute('aria-activedescendant');
        }
      }

      function select(name) {
        input.value = name;
        close();
        calcAll();
        input.focus();
      }

      function show() {
        const query = input.value.trim().toLocaleLowerCase();
        const starts = [];
        const contains = [];
        for (const name of names) {
          const normalized = name.toLocaleLowerCase();
          if (normalized.startsWith(query)) starts.push(name);
          else if (query && normalized.includes(query)) contains.push(name);
        }
        matches = starts.concat(contains).slice(0, limit);
        listbox.replaceChildren();
        activeIndex = -1;

        if (matches.length === 0) {
          const message = document.createElement('div');
          message.className = 'pokemon-suggestion-empty';
          message.textContent = 'No matching Pokémon';
          listbox.appendChild(message);
        } else {
          matches.forEach((name, index) => {
            const option = document.createElement('div');
            option.id = 'pokemon-option-' + index;
            option.className = 'pokemon-suggestion';
            option.setAttribute('role', 'option');
            option.setAttribute('aria-selected', 'false');
            option.textContent = name;
            option.addEventListener('mousedown', event => event.preventDefault());
            option.addEventListener('click', () => select(name));
            listbox.appendChild(option);
          });
        }
        listbox.hidden = false;
        input.setAttribute('aria-expanded', 'true');
      }

      input.addEventListener('focus', show);
      input.addEventListener('input', show);
      input.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          if (!listbox.hidden) {
            event.preventDefault();
            close();
          }
          return;
        }
        if (event.key === 'Tab') {
          close();
          return;
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          if (listbox.hidden) show();
          if (!matches.length) return;
          const delta = event.key === 'ArrowDown' ? 1 : -1;
          const next = activeIndex < 0
            ? (delta === 1 ? 0 : matches.length - 1)
            : (activeIndex + delta + matches.length) % matches.length;
          setActive(next);
        } else if (event.key === 'Enter' && !listbox.hidden && activeIndex >= 0) {
          event.preventDefault();
          select(matches[activeIndex]);
        }
      });

      document.addEventListener('pointerdown', event => {
        if (!input.parentElement.contains(event.target)) close();
      });
      input.addEventListener('blur', () => {
        // Delay closing until a clicked suggestion has received its click.
        setTimeout(() => {
          if (document.activeElement !== input) close();
        }, 120);
      });
    }

    function updateDigitRoll(containerId, newValue, height) {
      const container = document.getElementById(containerId);
      if (!container) return;

      const currentValStr = container.dataset.val || '';
      const newValStr = String(newValue);
      if (currentValStr === newValStr) return;

      if (currentValStr.length !== newValStr.length) {
        container.innerHTML = '';
        for (const char of newValStr) {
          const col = document.createElement('div');
          col.className = 'digit-col';
          col.style.height = height + 'px';
          const strip = document.createElement('div');
          strip.className = 'digit-strip';
          const face = document.createElement('div');
          face.style.height = height + 'px';
          face.textContent = char;
          strip.appendChild(face);
          col.appendChild(strip);
          container.appendChild(col);
        }
      } else {
        const strips = container.querySelectorAll('.digit-strip');
        for (let i = 0; i < newValStr.length; i++) {
          if (currentValStr[i] !== newValStr[i]) {
            const strip = strips[i];
            if (!strip) continue;
            strip.style.transition = 'none';
            strip.style.transform = 'translateY(0)';
            strip.replaceChildren();
            for (const char of [currentValStr[i], newValStr[i]]) {
              const face = document.createElement('div');
              face.style.height = height + 'px';
              face.textContent = char;
              strip.appendChild(face);
            }
            void strip.offsetHeight;
            strip.style.transition = 'transform 0.25s cubic-bezier(0.25, 1, 0.35, 1)';
            strip.style.transform = 'translateY(-' + height + 'px)';
          }
        }
      }
      container.dataset.val = newValStr;
    }

    function updateVal(id) {
      const slider = document.getElementById(id);
      if (!slider) return;
      const val = Number(slider.value);
      const min = Number(slider.min) || 0;
      const max = Number(slider.max) || 15;
      const percent = ((val - min) / (max - min)) * 100;
      slider.style.setProperty('--percent', percent + '%');
      updateDigitRoll(id + '-val-roller', val, 20);
    }

    function resetGauges() {
      const maxArcLength = 47.12;
      ['atk', 'def', 'hp'].forEach(id => {
        updateDigitRoll(id + '-gauge-roller', '—', 15);
        const arc = document.getElementById(id + '-arc');
        if (arc) arc.style.strokeDashoffset = maxArcLength;
      });
      document.getElementById('level-arc').style.strokeDashoffset = '100';
    }

    function showInvalidResult(message) {
      document.getElementById('result-main').textContent = '???';
      document.getElementById('result-level-type').textContent = 'ESTIMATED LEVEL';
      document.getElementById('result-stars').textContent = '---';
      document.getElementById('result-sub').textContent = '---';
      document.getElementById('result-cp').textContent = message;
      resetGauges();
    }

function calcAll() {
  const resMain = document.getElementById('result-main');
  const resStars = document.getElementById('result-stars');
  const resSub = document.getElementById('result-sub');
  const nameInput = document.getElementById('name').value.trim().toLowerCase();
  const cpInput = document.getElementById('cp');
  const cpRaw = cpInput.value.trim();
  const cp = Number(cpRaw);
  const atkIV = Number(document.getElementById('atk').value);
  const defIV = Number(document.getElementById('def').value);
  const hpIV = Number(document.getElementById('hp').value);
  const ivSum = atkIV + defIV + hpIV;

  const ivPercent = ((ivSum / 45) * 100).toFixed(1);
  const ivString = (ivSum === 45 ? '100' : ivPercent) + '% IV';

  const maxArcLength = 47.12;

      let starsDisplay = '-';
      if (ivSum === 45) starsDisplay = '★★★★';
      else if (ivSum >= 37) starsDisplay = '★★★';
      else if (ivSum >= 30) starsDisplay = '★★';
      else if (ivSum >= 23) starsDisplay = '★';
      else starsDisplay = '☆';

      if (typeof baseStatsDb === 'undefined' || typeof cpmTable === 'undefined') {
        showInvalidResult('Database unavailable');
        return;
      }

      const base = lowerCaseDb[nameInput];
      if (!nameInput || !base) {
        document.getElementById('level-min-cp').textContent = '—';
        document.getElementById('level-max-cp').textContent = '—';
        cpInput.removeAttribute('max');
        showInvalidResult('Enter a Pokémon name');
        return;
      }

      if (!Number.isInteger(atkIV) || atkIV < 0 || atkIV > 15 ||
          !Number.isInteger(defIV) || defIV < 0 || defIV > 15 ||
          !Number.isInteger(hpIV) || hpIV < 0 || hpIV > 15) {
        showInvalidResult('IVs must be 0–15');
        return;
      }

      const levels = Object.entries(cpmTable)
        .map(([level, cpm]) => ({ level: Number(level), cpm: Number(cpm) }))
        .filter(item => Number.isFinite(item.level) && Number.isFinite(item.cpm))
        .sort((a, b) => a.level - b.level);

      if (!levels.length) {
        showInvalidResult('CPM table unavailable');
        return;
      }

      // The table includes level 51 for the temporary Best Buddy boost.
      // Derive the valid maximum for the selected Pokémon and IV combination.
      const maxLevel = levels[levels.length - 1];
      const level50 = levels.find(item => item.level === 50);
      const maxCP50 = calculateCP(base, atkIV, defIV, hpIV, (level50 || maxLevel).cpm);
      const maxCP51 = calculateCP(base, atkIV, defIV, hpIV, maxLevel.cpm);
      const maxCP = maxCP51;
      const level1 = levels.find(item => item.level === 1) || levels[0];
      document.getElementById('level-min-cp').textContent =
        calculateCP(base, atkIV, defIV, hpIV, level1.cpm).toLocaleString();
      document.getElementById('level-max-cp').textContent = maxCP50.toLocaleString();
      cpInput.min = '10';
      cpInput.max = String(maxCP);
      cpInput.step = '1';

      if (cpRaw === '') {
        showInvalidResult('Enter CP · Max at Lv. 50: ' + maxCP50);
        return;
      }
      if (!Number.isFinite(cp) || !Number.isInteger(cp)) {
        showInvalidResult('CP must be a whole number (10–' + maxCP + ')');
        return;
      }
      if (cp < 10) {
        showInvalidResult('CP must be at least 10');
        return;
      }
      if (cp > maxCP) {
        showInvalidResult('Max CP for these IVs: ' + maxCP);
        return;
      }

     // Find the closest possible level, even when CP is not an exact match.
const totalAtk = base[0] + atkIV;
const totalDef = base[1] + defIV;
const totalSta = base[2] + hpIV;

const bestMatch = levels.reduce((best, item) => {
  const bestCP = calculateCP(base, atkIV, defIV, hpIV, best.cpm);
  const itemCP = calculateCP(base, atkIV, defIV, hpIV, item.cpm);

  return Math.abs(itemCP - cp) < Math.abs(bestCP - cp)
    ? item
    : best;
});

const selectedCPM = bestMatch.cpm;
const estimatedCP = calculateCP(base, atkIV, defIV, hpIV, selectedCPM);
const isExactMatch = estimatedCP === cp;
        

      const calculatedAtk = Number((totalAtk * selectedCPM).toFixed(1));
      const calculatedDef = Number((totalDef * selectedCPM).toFixed(1));
      const calculatedHp = Math.max(10, Math.floor(totalSta * selectedCPM));

      resMain.textContent = String(bestMatch.level);
      document.getElementById('result-level-type').textContent =
        isExactMatch ? 'LEVEL' : 'ESTIMATED LEVEL';
      resStars.textContent = starsDisplay;
      resSub.textContent = ivString;
      document.getElementById('result-cp').textContent =
        isExactMatch ? 'Exact CP match' : 'Closest CP: ' + estimatedCP.toLocaleString();

      // The gauge covers ordinary levels 1–50; Best Buddy 51 fills it fully.
      const levelRatio = Math.max(0, Math.min(1, (bestMatch.level - 1) / 49));
      document.getElementById('level-arc').style.strokeDashoffset =
        String(100 * (1 - levelRatio));

      updateDigitRoll('atk-gauge-roller', calculatedAtk, 15);
      updateDigitRoll('def-gauge-roller', calculatedDef, 15);
      updateDigitRoll('hp-gauge-roller', calculatedHp, 15);

      const statCap = 350;
      const atkRatio = Math.min(1, calculatedAtk / statCap);
      const defRatio = Math.min(1, calculatedDef / statCap);
      const hpRatio = Math.min(1, calculatedHp / statCap);
      document.getElementById('atk-arc').style.strokeDashoffset = maxArcLength * (1 - atkRatio);
      document.getElementById('def-arc').style.strokeDashoffset = maxArcLength * (1 - defRatio);
      document.getElementById('hp-arc').style.strokeDashoffset = maxArcLength * (1 - hpRatio);
    }

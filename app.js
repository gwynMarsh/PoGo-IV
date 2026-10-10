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

      const datalist = document.getElementById('pokemon-list');
      if (typeof baseStatsDb !== 'undefined') {
        Object.keys(baseStatsDb).forEach(name => {
          const option = document.createElement('option');
          option.value = name;
          datalist.appendChild(option);
          lowerCaseDb[name.toLowerCase()] = baseStatsDb[name];
        });
      }

      ['atk', 'def', 'hp'].forEach(id => updateVal(id));
      calcAll();
    });

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
    }

    function showInvalidResult(message) {
      document.getElementById('result-main').innerText = 'Level ?';
      document.getElementById('result-stars').innerText = '—';
      document.getElementById('result-sub').innerText = message;
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
      const ivPercent = ((ivSum / 45) * 100).toFixed(2);
      const ivString = ivPercent + '% IV';
      const maxArcLength = 47.12;

      let starsDisplay = '—';
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
      cpInput.min = '10';
      cpInput.max = String(maxCP);
      cpInput.step = '1';

      const cpHint = document.getElementById('cp-hint');
      if (cpHint) {
        cpHint.textContent = 'Max CP: ' + maxCP50 + ' at Lv. 50 · ' +
          maxCP51 + ' with Best Buddy (Lv. 51)';
      }

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

     resMain.innerText = (isExactMatch ? 'Level ' : '~ Level ') + bestMatch.level;
resStars.innerText = starsDisplay;

resSub.innerText = ivString +
  (isExactMatch ? ' · Exact CP match' : ' · Closest CP: ' + estimatedCP);

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

/**
 * МатОГЭ.Про — Клиентская логика сайта подготовки к ОГЭ по математике
 * Хранение прогресса в localStorage (с безопасной обёрткой try/catch),
 * рендеринг теории, интерактивный тренажёр, генератор варианта с таймером на 3 ч 55 мин,
 * поиск по справочнику формул и статистика по темам.
 */

const STORAGE_KEY = 'oge_math_progress_v1';
const THEME_KEY = 'oge_math_theme_v1';
const CUSTOM_TASKS_KEY = 'oge_math_custom_tasks_v1';

// Состояние приложения
const state = {
  data: null,
  activeTheoryTopic: 'practical',
  activeTheoryTab: 'formulas', // 'formulas' | 'definitions' | 'mistakes'
  trainerFilter: {
    topic: 'all',
    difficulty: 'all',
    part: 'all',
    onlyUnsolved: false
  },
  currentTrainerIndex: 0,
  filteredTrainerTasks: [],
  formulaSearch: '',
  formulaTopicFilter: 'all',
  // Состояние пробного варианта ОГЭ
  exam: {
    active: false,
    finished: false,
    paused: false,
    durationSeconds: 235 * 60, // 3 часа 55 минут (235 минут) по умолчанию
    remainingSeconds: 235 * 60,
    timerId: null,
    warned30: false,
    warned10: false,
    tasks: [],
    userAnswers: {}, // taskId -> string (для части 1) или { text, selfScore } (для части 2)
    results: null
  },
  // Пользовательский прогресс в localStorage
  variantCatalogFilter: {
    category: 'all',
    search: '',
    onlyUnsolved: false
  },
  progress: {
    solvedIds: {},       // taskId -> { correct: boolean, timestamp: number, topic: string, points: number }
    attemptsByTopic: {}, // topicId -> { attempts: number, correct: number }
    examHistory: [],     // [{ date, score, maxScore, grade, timeSpentSec, totalTasks }]
    solvedVariants: {},  // variantId -> { bestScore, maxScore, grade, attempts, lastDate }
    arcade: {
      coins: 20,
      totalVariantPoints: 0,
      viewedFormulas: {},
      unlockedGames: { sprint: true, cannon: false, reactor: false },
      highScores: { sprint: 0, cannon: 0, reactor: 0 }
    }
  },
  arcadeRuntime: {
    activeGame: 'sprint',
    sprint: {
      running: false,
      timeLeft: 45,
      timerId: null,
      score: 0,
      streak: 0,
      currentQ: null
    },
    cannon: {
      targetDist: 55,
      targetRadius: 4.5,
      angle: 45,
      velocity: 24,
      shots: 0,
      hits: 0,
      score: 0,
      animating: false,
      lastFlight: null
    },
    reactor: {
      running: false,
      lives: 3,
      score: 0,
      streak: 0,
      qIndex: 0,
      deck: [],
      answeredCurrent: false
    }
  }
};

// Безопасное чтение из localStorage
function safeGetStorage(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    return fallback;
  }
}

// Безопасная запись в localStorage
function safeSetStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    // Игнорируем ограничения sandbox/private mode
  }
}

// Всплывающие уведомления вместо alert()
function showToast(message, type) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const item = document.createElement('div');
  item.className = 'toast-item';
  if (type === 'success') item.style.borderLeftColor = 'var(--success)';
  if (type === 'warning') item.style.borderLeftColor = 'var(--warning)';
  if (type === 'danger') item.style.borderLeftColor = 'var(--danger)';
  item.textContent = message;
  container.appendChild(item);
  setTimeout(function () {
    if (item.parentNode) item.parentNode.removeChild(item);
  }, 4200);
}

// Инициализация темы (Светлая / Тёмная / Спец цвет Чёрно-фиолетовый Angel’s Squad)
function applyThemeMode(mode) {
  const htmlEl = document.documentElement;
  htmlEl.classList.remove('dark', 'black-purple');
  if (mode === 'dark') {
    htmlEl.classList.add('dark');
  } else if (mode === 'black-purple') {
    htmlEl.classList.add('black-purple');
  }
  safeSetStorage(THEME_KEY, mode);
  updateThemeButtonUI();
}

function initTheme() {
  const savedTheme = safeGetStorage(THEME_KEY, 'black-purple');
  applyThemeMode(savedTheme);
}

function toggleTheme() {
  const htmlEl = document.documentElement;
  let nextMode = 'black-purple';
  if (htmlEl.classList.contains('black-purple')) {
    nextMode = 'light';
  } else if (htmlEl.classList.contains('dark')) {
    nextMode = 'black-purple';
  } else {
    nextMode = 'dark';
  }
  applyThemeMode(nextMode);
  const names = {
    'black-purple': 'Чёрно-фиолетовая (Angel’s Squad)',
    'light': 'Светлая классическая',
    'dark': 'Тёмная классическая'
  };
  showToast('Тема оформления: ' + names[nextMode], 'success');
}

function activateBlackPurpleTheme() {
  applyThemeMode('black-purple');
  showToast('💜 Активирован спец цвет «Чёрно-фиолетовый» (Angel’s Squad Edition)!', 'success');
}

function updateThemeButtonUI() {
  const htmlEl = document.documentElement;
  const isBP = htmlEl.classList.contains('black-purple');
  const isDark = htmlEl.classList.contains('dark');
  const iconEl = document.getElementById('theme-toggle-icon');
  const labelEl = document.getElementById('theme-toggle-label');
  const bpBtn = document.getElementById('black-purple-theme-btn');
  if (iconEl) iconEl.textContent = isBP ? '☀️' : (isDark ? '💜' : '🌙');
  if (labelEl) labelEl.textContent = isBP ? 'Светлая' : (isDark ? 'Чёрно-фиол.' : 'Тёмная');
  if (bpBtn) {
    if (isBP) {
      bpBtn.style.borderColor = '#c084fc';
      bpBtn.style.boxShadow = '0 0 14px rgba(168, 85, 247, 0.55)';
    } else {
      bpBtn.style.borderColor = '';
      bpBtn.style.boxShadow = '';
    }
  }
}

// Загрузка данных (из встроенного объекта window.OGE_FALLBACK_DATA или fetch('data/tasks.json'))
async function loadAppData() {
  if (window.OGE_FALLBACK_DATA) {
    state.data = JSON.parse(JSON.stringify(window.OGE_FALLBACK_DATA));
  } else {
    try {
      state.data = window.OGE_FALLBACK_DATA;
    } catch (e) {
      showToast('Не удалось загрузить data/tasks.json. Проверьте локальный сервер.', 'danger');
      return;
    }
  }

  // Подгружаем пользовательские задачи, если они добавлялись
  const customTasks = safeGetStorage(CUSTOM_TASKS_KEY, []);
  if (Array.isArray(customTasks) && customTasks.length > 0) {
    state.data.tasks = state.data.tasks.concat(customTasks);
  }

  // Загружаем прогресс
  const savedProgress = safeGetStorage(STORAGE_KEY, null);
  if (savedProgress && typeof savedProgress === 'object') {
    state.progress.solvedIds = savedProgress.solvedIds || {};
    state.progress.attemptsByTopic = savedProgress.attemptsByTopic || {};
    state.progress.examHistory = Array.isArray(savedProgress.examHistory) ? savedProgress.examHistory : [];
    state.progress.solvedVariants = (savedProgress.solvedVariants && typeof savedProgress.solvedVariants === 'object') ? savedProgress.solvedVariants : {};
    if (savedProgress.arcade && typeof savedProgress.arcade === 'object') {
      state.progress.arcade.coins = typeof savedProgress.arcade.coins === 'number' ? savedProgress.arcade.coins : 20;
      state.progress.arcade.totalVariantPoints = typeof savedProgress.arcade.totalVariantPoints === 'number' ? savedProgress.arcade.totalVariantPoints : 0;
      state.progress.arcade.viewedFormulas = savedProgress.arcade.viewedFormulas || {};
      state.progress.arcade.unlockedGames = Object.assign({ sprint: true, cannon: false, reactor: false }, savedProgress.arcade.unlockedGames || {});
      state.progress.arcade.highScores = Object.assign({ sprint: 0, cannon: 0, reactor: 0 }, savedProgress.arcade.highScores || {});
    }
  }

  renderAll();
}

function saveProgress() {
  safeSetStorage(STORAGE_KEY, state.progress);
  renderDashboardStats();
}

function renderAll() {
  renderDashboardStats();
  renderTheoryTopicsNav();
  renderActiveTheoryCard();
  applyTrainerFilters(false);
  renderFormulaTable();
  renderConstantsTable();
  renderTipsSection();
  renderExamHistory();
  renderVariantCatalog();
  renderArcadeSection();
}

// ---------------------------------------------------------------------------
// ДАШБОРД ПРОГРЕССА И СТАТИСТИКА
// ---------------------------------------------------------------------------
function renderDashboardStats() {
  if (!state.data) return;
  const solvedEntries = Object.values(state.progress.solvedIds);
  const solvedCount = solvedEntries.filter(function (x) { return x.correct; }).length;
  const totalTasks = state.data.tasks.length;

  let totalAttempts = 0;
  let totalCorrect = 0;
  Object.values(state.progress.attemptsByTopic).forEach(function (t) {
    totalAttempts += (t.attempts || 0);
    totalCorrect += (t.correct || 0);
  });
  const accuracy = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;

  const elSolved = document.getElementById('stat-solved-count');
  const elTotal = document.getElementById('stat-total-tasks');
  const elAccuracy = document.getElementById('stat-accuracy');
  const elExams = document.getElementById('stat-exams-count');
  const elProgressBar = document.getElementById('stat-overall-bar');

  if (elSolved) elSolved.textContent = String(solvedCount);
  if (elTotal) elTotal.textContent = String(totalTasks);
  if (elAccuracy) elAccuracy.textContent = accuracy + '%';
  if (elExams) elExams.textContent = String(state.progress.examHistory.length);
  if (elProgressBar) {
    const pct = totalTasks > 0 ? Math.min(100, Math.round((solvedCount / totalTasks) * 100)) : 0;
    elProgressBar.style.width = pct + '%';
  }

  // Прогресс по 7 темам
  const topicGrid = document.getElementById('topic-progress-grid');
  if (topicGrid) {
    topicGrid.innerHTML = state.data.topics.map(function (topic) {
      const topicTasks = state.data.tasks.filter(function (t) { return t.topic === topic.id; });
      const solvedInTopic = topicTasks.filter(function (t) {
        return state.progress.solvedIds[t.id] && state.progress.solvedIds[t.id].correct;
      }).length;
      const pct = topicTasks.length > 0 ? Math.round((solvedInTopic / topicTasks.length) * 100) : 0;
      return (
        '<div class="surface-card p-3.5 flex flex-col justify-between">' +
          '<div class="flex items-center justify-between gap-2 mb-2">' +
            '<span class="font-semibold text-sm flex items-center gap-1.5">' +
              '<span>' + topic.icon + '</span>' +
              '<span>' + topic.title + '</span>' +
            '</span>' +
            '<span class="text-xs font-bold px-2 py-0.5 rounded-full" style="background: var(--bg-accent-soft); color: var(--accent);">' +
              solvedInTopic + ' / ' + topicTasks.length +
            '</span>' +
          '</div>' +
          '<div class="w-full h-2 rounded-full overflow-hidden" style="background: var(--bg-muted);">' +
            '<div class="h-full rounded-full transition-all duration-300" style="width: ' + pct + '%; background: var(--accent);"></div>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }
}

// ---------------------------------------------------------------------------
// СЕКЦИЯ 3: ТЕОРИЯ ПО ТЕМАМ (7 КАРТОЧЕК + ДЕТАЛЬНЫЙ РАЗБОР)
// ---------------------------------------------------------------------------
function renderTheoryTopicsNav() {
  if (!state.data) return;
  const container = document.getElementById('theory-cards-grid');
  if (!container) return;

  container.innerHTML = state.data.topics.map(function (topic) {
    const isActive = state.activeTheoryTopic === topic.id;
    const borderStyle = isActive
      ? 'border: 2px solid var(--accent); background: var(--bg-accent-soft);'
      : '';
    return (
      '<button type="button" data-theory-topic="' + topic.id + '" ' +
        'class="theory-topic-btn surface-card p-4 text-left flex flex-col justify-between cursor-pointer transition-all" ' +
        'style="' + borderStyle + '">' +
        '<div>' +
          '<div class="flex items-center justify-between gap-2 mb-2">' +
            '<span class="text-2xl">' + topic.icon + '</span>' +
            '<span class="text-xs font-medium px-2.5 py-0.5 rounded-full" style="background: var(--bg-muted); color: var(--text-secondary);">' +
              topic.badge +
            '</span>' +
          '</div>' +
          '<h3 class="font-bold text-base mb-1">' + topic.title + '</h3>' +
          '<p class="text-xs leading-relaxed" style="color: var(--text-secondary);">' + topic.shortDesc + '</p>' +
        '</div>' +
        '<div class="mt-3 pt-2 border-t flex items-center justify-between text-xs font-semibold" style="border-color: var(--border-color); color: var(--accent);">' +
          '<span>Формул: ' + topic.formulas.length + ' • Ошибок: ' + topic.mistakes.length + '</span>' +
          '<span>Открыть &rarr;</span>' +
        '</div>' +
      '</button>'
    );
  }).join('');

  container.querySelectorAll('.theory-topic-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.activeTheoryTopic = btn.getAttribute('data-theory-topic');
      renderTheoryTopicsNav();
      renderActiveTheoryCard();
    });
  });
}

function renderActiveTheoryCard() {
  if (!state.data) return;
  const topic = state.data.topics.find(function (t) { return t.id === state.activeTheoryTopic; }) || state.data.topics[0];
  const detailContainer = document.getElementById('theory-detail-box');
  if (!detailContainer || !topic) return;

  // Обновляем активность вкладок внутри карточки
  document.querySelectorAll('.theory-subtab-btn').forEach(function (tabBtn) {
    const tabName = tabBtn.getAttribute('data-theory-tab');
    if (tabName === state.activeTheoryTab) {
      tabBtn.classList.add('active');
    } else {
      tabBtn.classList.remove('active');
    }
  });

  const titleEl = document.getElementById('theory-active-title');
  const badgeEl = document.getElementById('theory-active-badge');
  const descEl = document.getElementById('theory-active-desc');
  if (titleEl) titleEl.textContent = topic.icon + ' ' + topic.title;
  if (badgeEl) badgeEl.textContent = topic.badge;
  if (descEl) descEl.textContent = topic.shortDesc;

  let bodyHtml = '';
  if (state.activeTheoryTab === 'formulas') {
    bodyHtml = '<div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">' +
      topic.formulas.map(function (f, fIdx) {
        return (
          '<div class="p-4 rounded-xl border flex flex-col justify-between gap-2.5" style="background: var(--bg-muted); border-color: var(--border-color);">' +
            '<div class="flex items-start justify-between gap-2">' +
              '<span class="font-semibold text-sm">' + f.name + '</span>' +
              '<span class="text-xs px-2 py-0.5 rounded font-medium" style="background: var(--bg-surface); color: var(--text-secondary);">КИМ: ' + f.units + '</span>' +
            '</div>' +
            '<div class="my-1 flex flex-wrap items-center justify-between gap-2">' +
              '<span class="math-formula">' + f.formulaHtml + '</span>' +
              '<button type="button" data-open-topic-formula="' + topic.id + ':' + fIdx + '" class="formula-link-btn open-topic-formula-btn">' +
                '🔎 Фулл разбор формулы' +
              '</button>' +
            '</div>' +
          '</div>'
        );
      }).join('') +
    '</div>';
  } else if (state.activeTheoryTab === 'definitions') {
    bodyHtml = '<div class="space-y-3">' +
      topic.definitions.map(function (d) {
        return (
          '<div class="p-4 rounded-xl border" style="background: var(--bg-muted); border-color: var(--border-color);">' +
            '<h4 class="font-bold text-sm mb-1" style="color: var(--accent);">📌 ' + d.term + '</h4>' +
            '<p class="text-sm leading-relaxed" style="color: var(--text-primary);">' + d.text + '</p>' +
          '</div>'
        );
      }).join('') +
    '</div>';
  } else if (state.activeTheoryTab === 'mistakes') {
    bodyHtml = '<div class="space-y-3">' +
      topic.mistakes.map(function (m, idx) {
        return (
          '<div class="p-4 rounded-xl border flex items-start gap-3" style="background: var(--danger-bg); border-color: var(--danger);">' +
            '<span class="text-lg font-bold" style="color: var(--danger);">⚠️ #' + (idx + 1) + '</span>' +
            '<p class="text-sm leading-relaxed">' + m + '</p>' +
          '</div>'
        );
      }).join('') +
    '</div>';
  }

  detailContainer.innerHTML = bodyHtml;
  detailContainer.querySelectorAll('.open-topic-formula-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const raw = btn.getAttribute('data-open-topic-formula') || '';
      const parts = raw.split(':');
      openFormulaDeepDiveByTopic(parts[0], parseInt(parts[1], 10));
    });
  });
}

// ---------------------------------------------------------------------------
// СЕКЦИЯ 4: ИНТЕРАКТИВНЫЙ ТРЕНАЖЁР ЗАДАНИЙ (ЧАСТЬ 1 И ЧАСТЬ 2)
// ---------------------------------------------------------------------------
function applyTrainerFilters(resetIndex) {
  if (!state.data) return;
  const f = state.trainerFilter;

  state.filteredTrainerTasks = state.data.tasks.filter(function (task) {
    if (f.topic !== 'all' && task.topic !== f.topic) return false;
    if (f.difficulty !== 'all' && task.difficulty !== f.difficulty) return false;
    if (f.part !== 'all' && String(task.part) !== String(f.part)) return false;
    if (f.onlyUnsolved) {
      const solved = state.progress.solvedIds[task.id];
      if (solved && solved.correct) return false;
    }
    return true;
  });

  if (resetIndex || state.currentTrainerIndex >= state.filteredTrainerTasks.length) {
    state.currentTrainerIndex = 0;
  }

  renderTrainerCard();
}

function renderTrainerCard() {
  const container = document.getElementById('trainer-card-container');
  const counterEl = document.getElementById('trainer-counter-badge');
  if (!container) return;

  const list = state.filteredTrainerTasks;
  if (counterEl) {
    counterEl.textContent = list.length > 0
      ? ('Задача ' + (state.currentTrainerIndex + 1) + ' из ' + list.length)
      : 'Нет подходящих задач';
  }

  if (list.length === 0) {
    container.innerHTML = (
      '<div class="text-center py-10 px-4">' +
        '<div class="text-4xl mb-3">🎉</div>' +
        '<h3 class="text-lg font-bold mb-2">По выбранным фильтрам все задачи решены или не найдены!</h3>' +
        '<p class="text-sm mb-4" style="color: var(--text-secondary);">Попробуйте сбросить фильтр «Только нерешённые» или выберите другой раздел математики.</p>' +
        '<button type="button" id="reset-trainer-filters-btn" class="btn-primary">Сбросить фильтры</button>' +
      '</div>'
    );
    const resetBtn = document.getElementById('reset-trainer-filters-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        state.trainerFilter = { topic: 'all', difficulty: 'all', part: 'all', onlyUnsolved: false };
        syncTrainerFilterControls();
        applyTrainerFilters(true);
      });
    }
    return;
  }

  const task = list[state.currentTrainerIndex];
  const isSolved = state.progress.solvedIds[task.id] && state.progress.solvedIds[task.id].correct;
  const diffBadgeColor = task.difficulty === 'easy'
    ? 'background: var(--success-bg); color: var(--success);'
    : (task.difficulty === 'medium' ? 'background: var(--warning-bg); color: var(--warning);' : 'background: var(--danger-bg); color: var(--danger);');

  // Навигационные точки по задачам выборки
  const dotsHtml = list.map(function (t, idx) {
    const tSolved = state.progress.solvedIds[t.id] && state.progress.solvedIds[t.id].correct;
    const isCurrent = idx === state.currentTrainerIndex;
    let bg = 'var(--bg-muted)';
    let color = 'var(--text-secondary)';
    if (tSolved) {
      bg = 'var(--success)';
      color = '#ffffff';
    }
    const border = isCurrent ? '2px solid var(--accent)' : '1px solid var(--border-color)';
    return (
      '<button type="button" data-jump-idx="' + idx + '" ' +
        'class="trainer-jump-btn w-8 h-8 rounded-lg text-xs font-bold flex items-center justify-center cursor-pointer transition-all" ' +
        'style="background: ' + bg + '; color: ' + color + '; border: ' + border + ';">' +
        (idx + 1) +
      '</button>'
    );
  }).join('');

  let interactionHtml = '';
  if (task.part === 1 && task.type === 'choice') {
    interactionHtml = (
      '<div class="space-y-2.5 my-4" id="trainer-options-list">' +
        task.options.map(function (opt, idx) {
          return (
            '<label class="flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all hover:border-indigo-500" style="background: var(--bg-muted); border-color: var(--border-color);">' +
              '<input type="radio" name="trainer-choice" value="' + idx + '" class="w-4 h-4 accent-indigo-600">' +
              '<span class="text-sm font-medium">' + opt + '</span>' +
            '</label>'
          );
        }).join('') +
      '</div>' +
      '<div class="flex flex-wrap items-center gap-3 mt-4">' +
        '<button type="button" id="trainer-check-btn" class="btn-primary">Проверить ответ</button>' +
        '<button type="button" id="trainer-show-explain-btn" class="btn-secondary">Показать разбор</button>' +
      '</div>'
    );
  } else if (task.part === 1 && task.type === 'numeric') {
    interactionHtml = (
      '<div class="my-4 flex flex-wrap items-center gap-3">' +
        '<input type="text" id="trainer-numeric-input" placeholder="Введите число (например: 45 или 0,5)" class="input-field w-full sm:w-72">' +
        (task.unit ? '<span class="text-sm font-bold px-3 py-2 rounded-lg" style="background: var(--bg-muted); color: var(--text-secondary);">' + task.unit + '</span>' : '') +
      '</div>' +
      '<div class="flex flex-wrap items-center gap-3 mt-4">' +
        '<button type="button" id="trainer-check-btn" class="btn-primary">Проверить ответ</button>' +
        '<button type="button" id="trainer-show-explain-btn" class="btn-secondary">Показать разбор</button>' +
      '</div>'
    );
  } else {
    // Задача Части 2 с развёрнутым ответом
    interactionHtml = (
      '<div class="my-4 space-y-3">' +
        '<label class="block text-xs font-semibold uppercase tracking-wider" style="color: var(--text-secondary);">' +
          'Ваше развёрнутое решение (запишите ОДЗ / условие, пошаговые выкладки и «Ответ»):' +
        '</label>' +
        '<textarea id="trainer-extended-input" rows="5" ' +
          'placeholder="Запишите условие / ОДЗ, пошаговое решение и Ответ" ' +
          'class="input-field w-full font-mono text-sm"></textarea>' +
        '<div class="flex flex-wrap items-center gap-3">' +
          '<button type="button" id="trainer-reveal-solution-btn" class="btn-primary">Сверить с эталонным решением ФИПИ</button>' +
        '</div>' +
      '</div>' +
      '<div id="trainer-extended-solution" class="hidden mt-5 p-5 rounded-2xl border space-y-4" style="background: var(--bg-muted); border-color: var(--accent);">' +
        '<div class="flex flex-wrap items-center justify-between gap-2 border-b pb-3" style="border-color: var(--border-color);">' +
          '<h4 class="font-bold text-base" style="color: var(--accent);">📋 Эталонное оформление задачи Части 2 (максимум ' + task.points + ' балла)</h4>' +
          '<span class="text-xs font-bold px-2.5 py-1 rounded-full" style="background: var(--success-bg); color: var(--success);">Краткий ответ: ' + task.shortAnswer + '</span>' +
        '</div>' +
        '<div class="grid grid-cols-1 md:grid-cols-3 gap-4">' +
          '<div class="p-3.5 rounded-xl border font-mono text-xs whitespace-pre-line" style="background: var(--bg-surface); border-color: var(--border-color);">' +
            '<strong class="block mb-1 text-sm font-sans" style="color: var(--accent);">Условие и ОДЗ:</strong>' +
            task.dano +
          '</div>' +
          '<div class="md:col-span-2 p-3.5 rounded-xl border space-y-2 text-sm" style="background: var(--bg-surface); border-color: var(--border-color);">' +
            '<strong class="block mb-1" style="color: var(--accent);">Пошаговое решение:</strong>' +
            task.solutionSteps.map(function (st) { return '<p>' + st + '</p>'; }).join('') +
            '<p class="pt-2 font-bold" style="color: var(--success);">Ответ: ' + task.finalAnswer + '</p>' +
          '</div>' +
        '</div>' +
        '<div class="p-3 rounded-xl text-xs" style="background: var(--bg-accent-soft); color: var(--text-secondary);">' +
          '<strong>Критерии оценивания ФИПИ:</strong> ' + task.criteria +
        '</div>' +
        '<div class="pt-2 flex flex-wrap items-center gap-2">' +
          '<span class="text-xs font-semibold mr-2">Оцените своё решение по критериям:</span>' +
          '<button type="button" data-self-score="' + task.points + '" class="self-score-btn btn-primary text-xs py-2 px-3">✅ Решил(а) на ' + task.points + ' из ' + task.points + ' б.</button>' +
          '<button type="button" data-self-score="1" class="self-score-btn btn-secondary text-xs py-2 px-3">⚠️ Частично (1–2 б.)</button>' +
          '<button type="button" data-self-score="0" class="self-score-btn btn-secondary text-xs py-2 px-3">❌ Пока не получилось (0 б.)</button>' +
        '</div>' +
      '</div>'
    );
  }

  container.innerHTML = (
    '<div class="flex flex-wrap items-center gap-1.5 mb-4 pb-3 border-b" style="border-color: var(--border-color);">' +
      dotsHtml +
    '</div>' +
    '<div class="flex flex-wrap items-center justify-between gap-2 mb-3">' +
      '<div class="flex flex-wrap items-center gap-2">' +
        '<span class="text-xs font-bold px-2.5 py-1 rounded-lg" style="background: var(--bg-accent-soft); color: var(--accent);">' +
          'Часть ' + task.part + ' • Задание №' + task.ogeNumber + ' ОГЭ' +
        '</span>' +
        '<span class="text-xs font-semibold px-2.5 py-1 rounded-lg" style="background: var(--bg-muted); color: var(--text-secondary);">' +
          topicTitleById(task.topic) +
        '</span>' +
        '<span class="text-xs font-bold px-2.5 py-1 rounded-lg" style="' + diffBadgeColor + '">' +
          task.difficultyName + ' (' + task.points + ' б.)' +
        '</span>' +
      '</div>' +
      (isSolved
        ? '<span class="text-xs font-bold px-2.5 py-1 rounded-full" style="background: var(--success-bg); color: var(--success);">✓ Решено верно</span>'
        : '<span class="text-xs font-medium px-2.5 py-1 rounded-full" style="background: var(--bg-muted); color: var(--text-muted);">Не решено</span>') +
    '</div>' +
    '<div class="text-base sm:text-lg font-medium leading-relaxed my-3">' +
      task.question +
    '</div>' +
    interactionHtml +
    '<div id="trainer-feedback-box" class="hidden mt-4 p-4 rounded-xl border text-sm"></div>' +
    '<div class="flex items-center justify-between pt-5 mt-5 border-t" style="border-color: var(--border-color);">' +
      '<button type="button" id="trainer-prev-btn" class="btn-secondary text-sm py-2 px-3.5" ' + (state.currentTrainerIndex === 0 ? 'disabled style="opacity:0.45;cursor:not-allowed;"' : '') + '>&larr; Предыдущая</button>' +
      '<button type="button" id="trainer-next-btn" class="btn-secondary text-sm py-2 px-3.5" ' + (state.currentTrainerIndex >= list.length - 1 ? 'disabled style="opacity:0.45;cursor:not-allowed;"' : '') + '>Следующая &rarr;</button>' +
    '</div>'
  );

  // Обработчики переключения по номерам задач
  container.querySelectorAll('.trainer-jump-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.currentTrainerIndex = parseInt(btn.getAttribute('data-jump-idx'), 10);
      renderTrainerCard();
    });
  });

  // Кнопки Назад / Вперёд
  const prevBtn = document.getElementById('trainer-prev-btn');
  const nextBtn = document.getElementById('trainer-next-btn');
  if (prevBtn) {
    prevBtn.addEventListener('click', function () {
      if (state.currentTrainerIndex > 0) {
        state.currentTrainerIndex--;
        renderTrainerCard();
      }
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', function () {
      if (state.currentTrainerIndex < list.length - 1) {
        state.currentTrainerIndex++;
        renderTrainerCard();
      }
    });
  }

  // Проверка задачи Части 1
  const checkBtn = document.getElementById('trainer-check-btn');
  if (checkBtn) {
    checkBtn.addEventListener('click', function () {
      checkPart1TrainerAnswer(task);
    });
  }

  const numericInput = document.getElementById('trainer-numeric-input');
  if (numericInput) {
    numericInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') checkPart1TrainerAnswer(task);
    });
  }

  // Показать объяснение без ответа
  const showExplainBtn = document.getElementById('trainer-show-explain-btn');
  if (showExplainBtn) {
    showExplainBtn.addEventListener('click', function () {
      const fb = document.getElementById('trainer-feedback-box');
      if (!fb) return;
      const rightText = task.type === 'choice' ? task.options[parseInt(task.answer, 10)] : (task.answer + (task.unit ? ' ' + task.unit : ''));
      fb.className = 'mt-4 p-4 rounded-xl border text-sm';
      fb.style.background = 'var(--bg-accent-soft)';
      fb.style.borderColor = 'var(--accent)';
      fb.innerHTML = (
        '<div class="font-bold mb-1" style="color: var(--accent);">💡 Эталонный ответ: ' + rightText + '</div>' +
        '<div><strong>Разбор решения:</strong> ' + task.explanation + '</div>'
      );
    });
  }

  // Раскрытие эталонного решения Части 2
  const revealBtn = document.getElementById('trainer-reveal-solution-btn');
  if (revealBtn) {
    revealBtn.addEventListener('click', function () {
      const solBox = document.getElementById('trainer-extended-solution');
      if (solBox) solBox.classList.remove('hidden');
    });
  }

  // Самооценка Части 2
  container.querySelectorAll('.self-score-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const pts = parseInt(btn.getAttribute('data-self-score'), 10);
      const isFull = pts > 0;
      recordTaskAttempt(task, isFull);
      showToast(isFull ? 'Отлично! Задача Части 2 засчитана в прогресс.' : 'Записано! Повторите эту задачу чуть позже.', isFull ? 'success' : 'warning');
      renderTrainerCard();
    });
  });
}

function normalizeAnswer(str) {
  return String(str || '').trim().toLowerCase().replace(',', '.').replace(/\s+/g, '');
}

function checkPart1TrainerAnswer(task) {
  const fb = document.getElementById('trainer-feedback-box');
  if (!fb) return;

  let userVal = '';
  if (task.type === 'choice') {
    const checked = document.querySelector('input[name="trainer-choice"]:checked');
    if (!checked) {
      showToast('Выберите один из вариантов ответа!', 'warning');
      return;
    }
    userVal = checked.value;
  } else {
    const input = document.getElementById('trainer-numeric-input');
    if (!input || !input.value.trim()) {
      showToast('Введите числовой ответ в поле!', 'warning');
      return;
    }
    userVal = input.value;
  }

  const isCorrect = normalizeAnswer(userVal) === normalizeAnswer(task.answer);
  recordTaskAttempt(task, isCorrect);

  const rightText = task.type === 'choice' ? task.options[parseInt(task.answer, 10)] : (task.answer + (task.unit ? ' ' + task.unit : ''));
  fb.className = 'mt-4 p-4 rounded-xl border text-sm';
  if (isCorrect) {
    fb.style.background = 'var(--success-bg)';
    fb.style.borderColor = 'var(--success)';
    fb.innerHTML = (
      '<div class="font-bold text-base mb-1" style="color: var(--success);">✅ Верно! (+' + task.points + ' балл)</div>' +
      '<div><strong>Пояснение:</strong> ' + task.explanation + '</div>'
    );
  } else {
    fb.style.background = 'var(--danger-bg)';
    fb.style.borderColor = 'var(--danger)';
    fb.innerHTML = (
      '<div class="font-bold text-base mb-1" style="color: var(--danger);">❌ Неверно. Правильный ответ: ' + rightText + '</div>' +
      '<div><strong>Разбор ошибки:</strong> ' + task.explanation + '</div>'
    );
  }
}

function recordTaskAttempt(task, isCorrect) {
  if (!state.progress.attemptsByTopic[task.topic]) {
    state.progress.attemptsByTopic[task.topic] = { attempts: 0, correct: 0 };
  }
  state.progress.attemptsByTopic[task.topic].attempts += 1;
  if (isCorrect) {
    state.progress.attemptsByTopic[task.topic].correct += 1;
  }

  // Если задача решена верно, сохраняем успех и начисляем баллы Аркады
  const prev = state.progress.solvedIds[task.id];
  const wasAlreadySolved = Boolean(prev && prev.correct);
  if (isCorrect && !wasAlreadySolved) {
    const rewardCoins = (task.points || 1) * 5;
    addArcadeCoins(rewardCoins, 'За решение задачи №' + task.ogeNumber);
  }
  if (isCorrect || !prev) {
    state.progress.solvedIds[task.id] = {
      correct: isCorrect || (prev && prev.correct),
      timestamp: Date.now(),
      topic: task.topic,
      points: task.points
    };
  }
  saveProgress();
  renderArcadeDashboard();
}

function topicTitleById(topicId) {
  if (!state.data) return topicId;
  const found = state.data.topics.find(function (t) { return t.id === topicId; });
  return found ? found.title : topicId;
}

function syncTrainerFilterControls() {
  const topicSel = document.getElementById('filter-topic-select');
  const diffSel = document.getElementById('filter-difficulty-select');
  const partSel = document.getElementById('filter-part-select');
  const unsolvedChk = document.getElementById('filter-unsolved-checkbox');

  if (topicSel) topicSel.value = state.trainerFilter.topic;
  if (diffSel) diffSel.value = state.trainerFilter.difficulty;
  if (partSel) partSel.value = state.trainerFilter.part;
  if (unsolvedChk) unsolvedChk.checked = state.trainerFilter.onlyUnsolved;
}

// ---------------------------------------------------------------------------
// СЕКЦИЯ 5: РАНДОМАЙЗЕР ВАРИАНТОВ ОГЭ С ТАЙМЕРОМ, СВЕРКОЙ ОТВЕТОВ И РАЗБОРОМ
// ---------------------------------------------------------------------------
function generateRandomVariantCode() {
  const num = Math.floor(100000 + Math.random() * 900000);
  const code = 'AS-' + num;
  const seedInput = document.getElementById('exam-variant-seed');
  if (seedInput) seedInput.value = code;
  return code;
}

function seededRandomGenerator(seedStr) {
  let h = 2166136261 >>> 0;
  const str = String(seedStr || ('AS-' + Date.now()));
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return function () {
    h += 0x6D2B79F5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}


function startPresetVariant(variantId) {
  if (!state.data || !Array.isArray(state.data.presetVariants)) return;
  const preset = state.data.presetVariants.find(function (v) { return v.id === variantId; });
  if (!preset) return;

  if (state.exam.timerId) {
    clearInterval(state.exam.timerId);
    state.exam.timerId = null;
  }

  const durationSelect = document.getElementById('exam-duration-select');
  const minutes = durationSelect ? parseInt(durationSelect.value, 10) : 235;

  const taskMap = {};
  state.data.tasks.forEach(function (t) { taskMap[t.id] = t; });

  const preparedTasks = preset.taskIds
    .map(function (tid) { return taskMap[tid]; })
    .filter(Boolean)
    .map(function (origTask) { return JSON.parse(JSON.stringify(origTask)); });

  state.exam.active = true;
  state.exam.finished = false;
  state.exam.paused = false;
  state.exam.presetVariantId = preset.id;
  state.exam.presetBonusCoins = preset.bonusCoins || 25;
  state.exam.variantCode = preset.code + ' (' + preset.title.split('•')[0].trim() + ')';
  state.exam.mode = preset.category;
  state.exam.durationSeconds = minutes * 60;
  state.exam.remainingSeconds = minutes * 60;
  state.exam.warned30 = false;
  state.exam.warned10 = false;
  state.exam.tasks = preparedTasks;
  state.exam.userAnswers = {};
  state.exam.results = null;
  state.exam.reviewFilter = 'all';

  renderExamWorkspace();
  startExamTimerInterval();
  const examSec = document.getElementById('exam');
  if (examSec) examSec.scrollIntoView({ behavior: 'smooth' });
  showToast('🚀 Запущен ' + preset.title + '! Удачи на экзамене!', 'success');
}

function renderVariantCatalog() {
  if (!state.data || !Array.isArray(state.data.presetVariants)) return;
  const gridEl = document.getElementById('variant-catalog-grid');
  const statsBadge = document.getElementById('variant-catalog-solved-badge');
  const quickSelect = document.getElementById('quick-preset-variant-select');
  if (!gridEl) return;

  const allPresets = state.data.presetVariants;
  const solvedMap = (state.progress && state.progress.solvedVariants) ? state.progress.solvedVariants : {};
  const solvedCount = Object.keys(solvedMap).length;

  if (statsBadge) {
    statsBadge.textContent = 'Решено вариантов: ' + solvedCount + ' из ' + allPresets.length;
  }

  if (quickSelect && quickSelect.options.length <= 1) {
    quickSelect.innerHTML = allPresets.map(function (v) {
      return '<option value="' + v.id + '">' + v.code + ' — ' + v.title + ' (' + v.maxPoints + ' б.)</option>';
    }).join('');
  }

  const catFilter = (state.variantCatalogFilter && state.variantCatalogFilter.category) || 'all';
  const searchVal = ((state.variantCatalogFilter && state.variantCatalogFilter.search) || '').trim().toLowerCase();
  const onlyUnsolved = !!(state.variantCatalogFilter && state.variantCatalogFilter.onlyUnsolved);

  const filtered = allPresets.filter(function (v) {
    if (catFilter !== 'all' && v.category !== catFilter) return false;
    if (onlyUnsolved && solvedMap[v.id]) return false;
    if (searchVal) {
      const hay = (v.code + ' ' + v.title + ' ' + v.focus + ' ' + v.number).toLowerCase();
      if (hay.indexOf(searchVal) === -1) return false;
    }
    return true;
  });

  const countInfo = document.getElementById('variant-catalog-count-info');
  if (countInfo) {
    countInfo.textContent = 'Показано вариантов: ' + filtered.length + ' из ' + allPresets.length;
  }

  if (filtered.length === 0) {
    gridEl.innerHTML = '<div class="col-span-full surface-card p-6 text-center text-sm" style="color: var(--text-secondary);">По выбранному фильтру вариантов не найдено. Сбросьте фильтр или поисковый запрос.</div>';
    return;
  }

  gridEl.innerHTML = filtered.map(function (v) {
    const solvedRec = solvedMap[v.id];
    const isAngels = v.category === 'angels';
    const catBadgeStyle = isAngels
      ? ''
      : 'background: var(--bg-accent-soft); color: var(--accent);';
    const catBadgeClass = isAngels
      ? 'angels-squad-badge text-[11px] font-bold px-2.5 py-0.5 rounded-full'
      : 'text-[11px] font-bold px-2.5 py-0.5 rounded-full';

    const statusBadge = solvedRec
      ? '<span class="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full" style="background: var(--success-bg); color: var(--success);">✅ Решён: ' + solvedRec.bestScore + '/' + v.maxPoints + ' б. (Оценка «' + solvedRec.grade + '»)</span>'
      : '<span class="text-[11px] font-semibold px-2.5 py-0.5 rounded-full" style="background: var(--bg-muted); color: var(--text-muted);">Не решён</span>';

    return (
      '<div class="surface-card p-4 flex flex-col justify-between gap-3" style="' + (solvedRec ? 'border-color: var(--success);' : (isAngels ? 'border-color: var(--accent);' : '')) + '">' +
        '<div class="space-y-2">' +
          '<div class="flex flex-wrap items-center justify-between gap-1.5">' +
            '<span class="' + catBadgeClass + '" style="' + catBadgeStyle + '">' + v.categoryLabel + '</span>' +
            statusBadge +
          '</div>' +
          '<div class="flex items-baseline justify-between gap-2">' +
            '<h4 class="font-black text-base">Вариант №' + v.number + ' <span class="text-xs font-mono font-bold" style="color: var(--accent);">(' + v.code + ')</span></h4>' +
            '<span class="text-xs font-extrabold" style="color: var(--accent);">+' + v.bonusCoins + ' ⚡</span>' +
          '</div>' +
          '<p class="text-xs font-medium leading-snug" style="color: var(--text-secondary);">' + v.focus + '</p>' +
          '<div class="flex flex-wrap items-center gap-2 text-[11px] pt-1" style="color: var(--text-muted);">' +
            '<span>📋 ' + v.tasksCount + ' заданий (' + v.part1Count + ' Ч.1 + ' + v.part2Count + ' Ч.2)</span>' +
            '<span>•</span>' +
            '<span>🏆 Макс: ' + v.maxPoints + ' б.</span>' +
          '</div>' +
        '</div>' +
        '<div class="pt-2 border-t flex items-center justify-between gap-2" style="border-color: var(--border-color);">' +
          '<button type="button" data-start-preset="' + v.id + '" class="start-preset-variant-btn btn-primary w-full py-2 px-3 text-xs font-extrabold">' +
            (solvedRec ? '🔄 Перерешать вариант №' + v.number : '🚀 Решать вариант №' + v.number) +
          '</button>' +
        '</div>' +
      '</div>'
    );
  }).join('');

  gridEl.querySelectorAll('.start-preset-variant-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const vid = btn.getAttribute('data-start-preset');
      if (vid) startPresetVariant(vid);
    });
  });
}

function startMockExam() {
  if (!state.data) return;

  if (state.exam.timerId) {
    clearInterval(state.exam.timerId);
    state.exam.timerId = null;
  }

  const durationSelect = document.getElementById('exam-duration-select');
  const minutes = durationSelect ? parseInt(durationSelect.value, 10) : 235;

  const modeSelect = document.getElementById('exam-randomizer-mode');
  const mode = modeSelect ? modeSelect.value : 'balanced';

  const shuffleOptsCheckbox = document.getElementById('exam-shuffle-options');
  const shouldShuffleOptions = shuffleOptsCheckbox ? shuffleOptsCheckbox.checked : true;

  const seedInput = document.getElementById('exam-variant-seed');
  let variantCode = seedInput && seedInput.value.trim() ? seedInput.value.trim() : generateRandomVariantCode();
  // При каждом новом запуске обновляем рандомный суффикс, если код уже использовался
  if (state.exam.variantCode === variantCode) {
    variantCode = generateRandomVariantCode();
  }

  const rng = seededRandomGenerator(variantCode + '_' + Date.now());

  function shuffleWithRng(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  let part1Pool = state.data.tasks.filter(function (t) { return t.part === 1; });
  let part2Pool = state.data.tasks.filter(function (t) { return t.part === 2; });

  if (mode === 'hardcore') {
    const hardP1 = part1Pool.filter(function (t) { return t.difficulty !== 'easy'; });
    if (hardP1.length >= 6) part1Pool = hardP1;
  }

  const countP1 = mode === 'express' ? 5 : 10;
  const countP2 = mode === 'express' ? 2 : 3;

  // Гарантируем охват разных тем в рандомайзере
  const rawPart1 = shuffleWithRng(part1Pool).slice(0, countP1).sort(function (a, b) { return a.ogeNumber - b.ogeNumber; });
  const rawPart2 = shuffleWithRng(part2Pool).slice(0, countP2).sort(function (a, b) { return a.ogeNumber - b.ogeNumber; });

  // Клонируем задачи и при необходимости перемешиваем варианты ответа в тестовых заданиях
  const preparedTasks = rawPart1.concat(rawPart2).map(function (origTask) {
    const cloned = JSON.parse(JSON.stringify(origTask));
    if (cloned.part === 1 && cloned.type === 'choice' && Array.isArray(cloned.options) && shouldShuffleOptions) {
      const correctIdx = parseInt(cloned.answer, 10);
      const indexed = cloned.options.map(function (optText, idx) {
        return { text: optText, isRight: idx === correctIdx };
      });
      const shuffledOpts = shuffleWithRng(indexed);
      cloned.options = shuffledOpts.map(function (o) { return o.text; });
      const newRightIdx = shuffledOpts.findIndex(function (o) { return o.isRight; });
      cloned.answer = String(newRightIdx >= 0 ? newRightIdx : 0);
    }
    return cloned;
  });

  state.exam.active = true;
  state.exam.finished = false;
  state.exam.paused = false;
  state.exam.presetVariantId = null;
  state.exam.presetBonusCoins = 15;
  state.exam.variantCode = variantCode;
  state.exam.mode = mode;
  state.exam.durationSeconds = minutes * 60;
  state.exam.remainingSeconds = minutes * 60;
  state.exam.warned30 = false;
  state.exam.warned10 = false;
  state.exam.tasks = preparedTasks;
  state.exam.userAnswers = {};
  state.exam.results = null;
  state.exam.reviewFilter = 'all';

  renderExamWorkspace();
  startExamTimerInterval();
  showToast('🎲 Сгенерирован уникальный вариант ' + variantCode + ' (Angel’s Squad Randomizer)!', 'success');
}

function autofillExamDemoAnswers() {
  if (!state.exam.active || !state.exam.tasks.length) return;
  state.exam.tasks.forEach(function (task, idx) {
    if (task.part === 1 && task.type === 'choice') {
      // Для наглядной демонстрации сверки ответов делаем 80% верных и пару намеренных ошибок
      const pickIdx = (idx % 4 === 2) ? ((parseInt(task.answer, 10) + 1) % task.options.length) : parseInt(task.answer, 10);
      const radio = document.querySelector('input[name="exam-q-' + task.id + '"][value="' + pickIdx + '"]');
      if (radio) radio.checked = true;
    } else if (task.part === 1 && task.type === 'numeric') {
      const input = document.querySelector('.exam-input-text[data-exam-task="' + task.id + '"]');
      if (input) {
        input.value = (idx % 5 === 3) ? String(Number(task.answer) + 5) : task.answer;
      }
    } else {
      const area = document.querySelector('.exam-input-extended[data-exam-task="' + task.id + '"]');
      const sel = document.querySelector('.exam-selfscore-select[data-exam-selfscore="' + task.id + '"]');
      if (area) {
        area.value = 'Условие и ОДЗ учтены. Решение: ' + (task.solutionSteps && task.solutionSteps[0] ? task.solutionSteps[0] : '') + ' | Ответ: ' + (task.shortAnswer || task.finalAnswer);
      }
      if (sel) sel.value = String(task.points);
    }
  });
  showToast('⚡ Вариант заполнен тестовыми ответами! Нажмите «Завершить и сверить ответы».', 'success');
}

function startExamTimerInterval() {
  if (state.exam.timerId) clearInterval(state.exam.timerId);
  state.exam.timerId = setInterval(function () {
    if (!state.exam.active || state.exam.paused || state.exam.finished) return;
    state.exam.remainingSeconds -= 1;

    if (state.exam.remainingSeconds === 30 * 60 && !state.exam.warned30) {
      state.exam.warned30 = true;
      showToast('⏰ Внимание! До окончания пробного ОГЭ осталось 30 минут. Начните переносить ответы Части 2.', 'warning');
    }
    if (state.exam.remainingSeconds === 10 * 60 && !state.exam.warned10) {
      state.exam.warned10 = true;
      showToast('🚨 Осталось 10 минут! Проверьте все поля ответов.', 'danger');
    }

    if (state.exam.remainingSeconds <= 0) {
      state.exam.remainingSeconds = 0;
      updateExamTimerDisplay();
      finishMockExam();
      showToast('Время вышло! Пробный вариант автоматически завершён и проверен.', 'danger');
      return;
    }
    updateExamTimerDisplay();
  }, 1000);
}

function formatSecondsHMS(totalSec) {
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const pad = function (n) { return n < 10 ? '0' + n : String(n); };
  return pad(hrs) + ':' + pad(mins) + ':' + pad(secs);
}

function updateExamTimerDisplay() {
  const timerBox = document.getElementById('exam-timer-display');
  if (!timerBox) return;
  timerBox.textContent = '⏱ ' + formatSecondsHMS(state.exam.remainingSeconds);

  timerBox.classList.remove('timer-warning', 'timer-danger');
  if (state.exam.remainingSeconds <= 10 * 60) {
    timerBox.classList.add('timer-danger');
  } else if (state.exam.remainingSeconds <= 30 * 60) {
    timerBox.classList.add('timer-warning');
  }
}

function renderExamWorkspace() {
  const introBox = document.getElementById('exam-intro-box');
  const activeBox = document.getElementById('exam-active-box');
  const resultBox = document.getElementById('exam-result-box');
  if (!introBox || !activeBox || !resultBox) return;

  if (!state.exam.active && !state.exam.finished) {
    introBox.classList.remove('hidden');
    activeBox.classList.add('hidden');
    resultBox.classList.add('hidden');
    return;
  }

  if (state.exam.active && !state.exam.finished) {
    introBox.classList.add('hidden');
    activeBox.classList.remove('hidden');
    resultBox.classList.add('hidden');

    updateExamTimerDisplay();
    const codeBadge = document.getElementById('exam-active-variant-code');
    if (codeBadge) codeBadge.textContent = 'Вариант ' + (state.exam.variantCode || 'AS-2026');
    const listEl = document.getElementById('exam-tasks-list');
    if (!listEl) return;

    listEl.innerHTML = state.exam.tasks.map(function (task, index) {
      let inputBlock = '';
      if (task.part === 1 && task.type === 'choice') {
        inputBlock = '<div class="space-y-2 mt-3">' +
          task.options.map(function (opt, oIdx) {
            return (
              '<label class="flex items-center gap-3 p-3 rounded-xl border cursor-pointer" style="background: var(--bg-muted); border-color: var(--border-color);">' +
                '<input type="radio" name="exam-q-' + task.id + '" data-exam-task="' + task.id + '" value="' + oIdx + '" class="exam-input-radio w-4 h-4 accent-indigo-600">' +
                '<span class="text-sm">' + opt + '</span>' +
              '</label>'
            );
          }).join('') +
        '</div>';
      } else if (task.part === 1 && task.type === 'numeric') {
        inputBlock = (
          '<div class="mt-3 flex flex-wrap items-center gap-2">' +
            '<input type="text" data-exam-task="' + task.id + '" placeholder="Ваш ответ" class="exam-input-text input-field w-full sm:w-64">' +
            (task.unit ? '<span class="text-xs font-bold px-2.5 py-1.5 rounded" style="background: var(--bg-muted); color: var(--text-secondary);">' + task.unit + '</span>' : '') +
          '</div>'
        );
      } else {
        inputBlock = (
          '<div class="mt-3 space-y-3">' +
            '<textarea data-exam-task="' + task.id + '" rows="4" placeholder="Запишите Дано, формулы, расчёт и Ответ" class="exam-input-extended input-field w-full font-mono text-sm"></textarea>' +
            '<div class="p-3 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2" style="background: var(--bg-muted); border-color: var(--border-color);">' +
              '<span>Для задач Части 2 укажите предварительную самооценку по критериям (0–' + task.points + ' б.):</span>' +
              '<select data-exam-selfscore="' + task.id + '" class="exam-selfscore-select input-field py-1 px-2 text-xs font-bold">' +
                Array.from({ length: task.points + 1 }, function (_, i) {
                  return '<option value="' + i + '" ' + (i === task.points ? 'selected' : '') + '>' + i + ' из ' + task.points + ' баллов</option>';
                }).join('') +
              '</select>' +
            '</div>' +
          '</div>'
        );
      }

      return (
        '<div class="surface-card p-5">' +
          '<div class="flex flex-wrap items-center justify-between gap-2 mb-2">' +
            '<span class="text-xs font-bold px-2.5 py-1 rounded-lg" style="background: var(--bg-accent-soft); color: var(--accent);">' +
              'Задание ' + (index + 1) + ' (№' + task.ogeNumber + ' КИМ • Часть ' + task.part + ')' +
            '</span>' +
            '<span class="text-xs font-semibold" style="color: var(--text-secondary);">' +
              topicTitleById(task.topic) + ' • Макс. ' + task.points + ' б.' +
            '</span>' +
          '</div>' +
          '<p class="text-sm sm:text-base font-medium leading-relaxed">' + task.question + '</p>' +
          inputBlock +
        '</div>'
      );
    }).join('');
  }
}

function finishMockExam() {
  if (state.exam.timerId) {
    clearInterval(state.exam.timerId);
    state.exam.timerId = null;
  }

  // Считываем все ответы из DOM перед расчётом
  const breakdown = [];
  let earnedPoints = 0;
  let maxPoints = 0;

  state.exam.tasks.forEach(function (task, idx) {
    maxPoints += task.points;
    if (task.part === 1) {
      let userVal = '';
      if (task.type === 'choice') {
        const checked = document.querySelector('input[name="exam-q-' + task.id + '"]:checked');
        if (checked) userVal = checked.value;
      } else {
        const textInput = document.querySelector('.exam-input-text[data-exam-task="' + task.id + '"]');
        if (textInput) userVal = textInput.value;
      }

      const isCorrect = userVal !== '' && normalizeAnswer(userVal) === normalizeAnswer(task.answer);
      const pts = isCorrect ? task.points : 0;
      earnedPoints += pts;
      recordTaskAttempt(task, isCorrect);

      const userReadable = task.type === 'choice'
        ? (userVal !== '' ? task.options[parseInt(userVal, 10)] : 'Нет ответа')
        : (userVal || 'Нет ответа');
      const rightReadable = task.type === 'choice'
        ? task.options[parseInt(task.answer, 10)]
        : (task.answer + (task.unit ? ' ' + task.unit : ''));

      breakdown.push({
        index: idx + 1,
        task: task,
        isCorrect: isCorrect,
        earned: pts,
        userReadable: userReadable,
        rightReadable: rightReadable
      });
    } else {
      const extArea = document.querySelector('.exam-input-extended[data-exam-task="' + task.id + '"]');
      const scoreSel = document.querySelector('.exam-selfscore-select[data-exam-selfscore="' + task.id + '"]');
      const textVal = extArea ? extArea.value.trim() : '';
      const selfPts = scoreSel ? parseInt(scoreSel.value, 10) : 0;
      const awarded = textVal.length > 0 ? selfPts : 0;
      earnedPoints += awarded;
      recordTaskAttempt(task, awarded > 0);

      breakdown.push({
        index: idx + 1,
        task: task,
        isCorrect: awarded === task.points,
        earned: awarded,
        userReadable: textVal || 'Решение не записано (0 баллов)',
        rightReadable: task.finalAnswer
      });
    }
  });

  const pct = maxPoints > 0 ? Math.round((earnedPoints / maxPoints) * 100) : 0;
  let grade = 2;
  let gradeComment = 'Необходимо повторить базовые формулы и прорешать тренажёр по темам.';
  if (pct >= 77) {
    grade = 5;
    gradeComment = 'Блестящий результат! Вы готовы к сдаче ОГЭ на «5» и поступлению в профильный класс.';
  } else if (pct >= 52) {
    grade = 4;
    gradeComment = 'Хороший результат! Обратите внимание на разбор допущенных ошибок ниже, чтобы выйти на «5».';
  } else if (pct >= 26) {
    grade = 3;
    gradeComment = 'Порог сдачи пройден («3»), но рекомендуем закрепить темы, в которых были ошибки.';
  }

  const timeSpentSec = state.exam.durationSeconds - state.exam.remainingSeconds;
  const summaryRecord = {
    date: new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    score: earnedPoints,
    maxScore: maxPoints,
    pct: pct,
    grade: grade,
    timeSpentSec: timeSpentSec
  };

  const presetBonus = state.exam.presetBonusCoins || 15;
  const arcadeReward = presetBonus + (earnedPoints * 3);
  summaryRecord.variantCode = state.exam.variantCode || 'AS-2026';
  summaryRecord.arcadeReward = arcadeReward;
  if (state.exam.presetVariantId) {
    if (!state.progress.solvedVariants) state.progress.solvedVariants = {};
    const prevRec = state.progress.solvedVariants[state.exam.presetVariantId];
    const bestScore = prevRec ? Math.max(prevRec.bestScore || 0, earnedPoints) : earnedPoints;
    const bestGrade = prevRec ? Math.max(prevRec.grade || 2, grade) : grade;
    state.progress.solvedVariants[state.exam.presetVariantId] = {
      bestScore: bestScore,
      maxScore: maxPoints,
      grade: bestGrade,
      attempts: (prevRec ? (prevRec.attempts || 0) : 0) + 1,
      lastDate: summaryRecord.date
    };
  }

  state.progress.examHistory.unshift(summaryRecord);
  if (state.progress.examHistory.length > 15) {
    state.progress.examHistory = state.progress.examHistory.slice(0, 15);
  }
  if (!state.progress.arcade) {
    state.progress.arcade = { coins: 20, totalVariantPoints: 0, viewedFormulas: {}, unlockedGames: { sprint: true, cannon: false, reactor: false }, highScores: { sprint: 0, cannon: 0, reactor: 0 } };
  }
  state.progress.arcade.totalVariantPoints = (state.progress.arcade.totalVariantPoints || 0) + earnedPoints;
  state.progress.arcade.coins = (state.progress.arcade.coins || 0) + arcadeReward;
  checkAutoUnlockArcadeGames();

  saveProgress();
  renderExamHistory();
  renderVariantCatalog();
  renderArcadeSection();

  state.exam.active = false;
  state.exam.finished = true;
  state.exam.results = {
    earnedPoints: earnedPoints,
    maxPoints: maxPoints,
    pct: pct,
    grade: grade,
    gradeComment: gradeComment,
    timeSpentSec: timeSpentSec,
    arcadeReward: arcadeReward,
    breakdown: breakdown
  };

  renderExamResultsView();
}

function getTopicFormulasForTask(topicId) {
  if (!state.data || !state.data.referenceFormulas) return [];
  return state.data.referenceFormulas.filter(function (f) { return f.topic === topicId; }).slice(0, 3);
}

function renderExamResultsView() {
  const introBox = document.getElementById('exam-intro-box');
  const activeBox = document.getElementById('exam-active-box');
  const resultBox = document.getElementById('exam-result-box');
  if (!resultBox || !state.exam.results) return;

  introBox.classList.add('hidden');
  activeBox.classList.add('hidden');
  resultBox.classList.remove('hidden');

  const r = state.exam.results;
  const variantCode = state.exam.variantCode || 'AS-2026';
  const activeFilter = state.exam.reviewFilter || 'all';

  const gradeBadgeStyle = r.grade === 5
    ? 'background: var(--success-bg); color: var(--success); border: 1px solid var(--success);'
    : (r.grade === 4 ? 'background: var(--bg-accent-soft); color: var(--accent); border: 1px solid var(--accent);' : (r.grade === 3 ? 'background: var(--warning-bg); color: var(--warning); border: 1px solid var(--warning);' : 'background: var(--danger-bg); color: var(--danger); border: 1px solid var(--danger);'));

  // Таблица сверки ответов (Ваш ответ vs Эталон ФИПИ)
  const verificationRowsHtml = r.breakdown.map(function (item) {
    const t = item.task;
    const isFull = item.earned === t.points;
    const isPartial = item.earned > 0 && item.earned < t.points;
    const badgeHtml = isFull
      ? '<span class="px-2 py-0.5 rounded-full text-xs font-bold" style="background: var(--success-bg); color: var(--success);">✅ Верно</span>'
      : (isPartial
        ? '<span class="px-2 py-0.5 rounded-full text-xs font-bold" style="background: var(--warning-bg); color: var(--warning);">⚠️ Частично</span>'
        : '<span class="px-2 py-0.5 rounded-full text-xs font-bold" style="background: var(--danger-bg); color: var(--danger);">❌ Ошибка</span>');

    return (
      '<tr class="border-b text-xs sm:text-sm" style="border-color: var(--border-color);">' +
        '<td class="py-2.5 px-3 font-bold">№' + item.index + ' <span class="text-xs font-normal" style="color: var(--text-muted);">(КИМ №' + t.ogeNumber + ')</span></td>' +
        '<td class="py-2.5 px-3">' + topicTitleById(t.topic) + '</td>' +
        '<td class="py-2.5 px-3 font-mono text-xs">' + (t.part === 1 ? item.userReadable : (item.earned > 0 ? 'Развёрнутый ответ' : 'Нет решения')) + '</td>' +
        '<td class="py-2.5 px-3 font-mono text-xs font-bold" style="color: var(--success);">' + (t.part === 1 ? item.rightReadable : (t.shortAnswer || t.finalAnswer)) + '</td>' +
        '<td class="py-2.5 px-3">' + badgeHtml + '</td>' +
        '<td class="py-2.5 px-3 font-bold">' + item.earned + ' / ' + t.points + '</td>' +
        '<td class="py-2.5 px-3">' +
          '<a href="#review-card-' + item.index + '" class="formula-link-btn">Разбор &darr;</a>' +
        '</td>' +
      '</tr>'
    );
  }).join('');

  // Фильтрация карточек подробного разбора
  const filteredBreakdown = r.breakdown.filter(function (item) {
    if (activeFilter === 'mistakes') return item.earned < item.task.points;
    if (activeFilter === 'part1') return item.task.part === 1;
    if (activeFilter === 'part2') return item.task.part === 2;
    return true;
  });

  const breakdownCardsHtml = filteredBreakdown.map(function (item) {
    const t = item.task;
    const statusColor = item.earned === t.points
      ? 'border-left: 5px solid var(--success);'
      : (item.earned > 0 ? 'border-left: 5px solid var(--warning);' : 'border-left: 5px solid var(--danger);');

    const relatedFormulas = getTopicFormulasForTask(t.topic);
    const formulaButtonsHtml = relatedFormulas.map(function (rf) {
      return (
        '<button type="button" data-open-formula-id="' + rf.id + '" class="formula-link-btn open-formula-modal-btn">' +
          '🔎 Фулл разбор: ' + rf.name +
        '</button>'
      );
    }).join('');

    let detailedSolutionBlock = '';
    if (t.part === 1) {
      detailedSolutionBlock = (
        '<div class="p-4 rounded-xl border space-y-2 text-xs sm:text-sm" style="background: var(--bg-surface); border-color: var(--border-color);">' +
          '<div class="font-bold" style="color: var(--accent);">📘 Полный пошаговый разбор решения (Часть 1):</div>' +
          '<p class="leading-relaxed">' + t.explanation + '</p>' +
        '</div>'
      );
    } else {
      detailedSolutionBlock = (
        '<div class="p-4 rounded-xl border space-y-3 text-xs sm:text-sm" style="background: var(--bg-surface); border-color: var(--border-color);">' +
          '<div class="font-bold" style="color: var(--accent);">📘 Полный эталонный разбор задачи Части 2 (критерии ФИПИ):</div>' +
          '<div class="grid grid-cols-1 md:grid-cols-3 gap-3">' +
            '<div class="p-3 rounded-lg border font-mono text-xs whitespace-pre-line" style="background: var(--bg-muted); border-color: var(--border-color);">' +
              '<strong class="block mb-1 font-sans" style="color: var(--accent);">Условие и модель (Дано / ОДЗ):</strong>' +
              t.dano +
            '</div>' +
            '<div class="md:col-span-2 p-3 rounded-lg border space-y-1.5" style="background: var(--bg-muted); border-color: var(--border-color);">' +
              '<strong class="block mb-1" style="color: var(--accent);">Ход решения и формулы:</strong>' +
              t.solutionSteps.map(function (st) { return '<p>' + st + '</p>'; }).join('') +
              '<p class="pt-1 font-bold" style="color: var(--success);">Эталонный ответ: ' + t.finalAnswer + '</p>' +
            '</div>' +
          '</div>' +
          '<div class="text-xs p-2.5 rounded-lg" style="background: var(--bg-accent-soft); color: var(--text-secondary);">' +
            '<strong>Критерии оценивания:</strong> ' + t.criteria +
          '</div>' +
        '</div>'
      );
    }

    return (
      '<div id="review-card-' + item.index + '" class="surface-card p-5 space-y-3" style="' + statusColor + '">' +
        '<div class="flex flex-wrap items-center justify-between gap-2">' +
          '<div class="flex flex-wrap items-center gap-2">' +
            '<span class="font-extrabold text-sm sm:text-base">Задание №' + item.index + ' (КИМ №' + t.ogeNumber + ' • Часть ' + t.part + ')</span>' +
            '<span class="text-xs font-bold px-2.5 py-0.5 rounded-full" style="background: var(--bg-accent-soft); color: var(--accent);">' + topicTitleById(t.topic) + '</span>' +
          '</div>' +
          '<span class="text-xs font-bold px-3 py-1 rounded-full" style="background: var(--bg-muted);">Баллы: ' + item.earned + ' из ' + t.points + '</span>' +
        '</div>' +
        '<p class="text-sm sm:text-base font-medium leading-relaxed">' + t.question + '</p>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm p-3.5 rounded-xl border" style="background: var(--bg-muted); border-color: var(--border-color);">' +
          '<div><span class="font-bold block mb-0.5" style="color: var(--text-secondary);">Ваш ответ:</span> <span class="font-semibold">' + item.userReadable + '</span></div>' +
          '<div><span class="font-bold block mb-0.5" style="color: var(--success);">Эталонный ответ ФИПИ:</span> <span class="font-bold" style="color: var(--success);">' + item.rightReadable + '</span></div>' +
        '</div>' +
        detailedSolutionBlock +
        '<div class="pt-2 flex flex-wrap items-center justify-between gap-2 border-t" style="border-color: var(--border-color);">' +
          '<span class="text-xs font-semibold" style="color: var(--text-secondary);">Ссылки на фулл разбор формул этой задачи:</span>' +
          '<div class="flex flex-wrap items-center gap-2">' +
            formulaButtonsHtml +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }).join('');

  resultBox.innerHTML = (
    '<div class="surface-card p-6 mb-6 space-y-5">' +
      '<div class="flex flex-wrap items-center justify-between gap-4 pb-4 border-b" style="border-color: var(--border-color);">' +
        '<div>' +
          '<div class="flex flex-wrap items-center gap-2 mb-1">' +
            '<span class="text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full angels-squad-badge">Angel’s Squad • Сверка ответов</span>' +
            '<span class="text-xs font-bold px-2.5 py-0.5 rounded-full" style="background: var(--bg-accent-soft); color: var(--accent);">Вариант ' + variantCode + '</span>' +
          '</div>' +
          '<h3 class="text-2xl sm:text-3xl font-black mt-1">Ваш результат: ' + r.earnedPoints + ' из ' + r.maxPoints + ' баллов (' + r.pct + '%)</h3>' +
          '<p class="text-sm mt-1" style="color: var(--text-secondary);">Затрачено времени: ' + formatSecondsHMS(r.timeSpentSec) + ' • ' + r.gradeComment + '</p>' +
        '</div>' +
        '<div class="px-6 py-3.5 rounded-2xl text-center" style="' + gradeBadgeStyle + '">' +
          '<div class="text-xs font-bold uppercase">Оценка по шкале</div>' +
          '<div class="text-4xl font-black">' + r.grade + '</div>' +
        '</div>' +
      '</div>' +

      '<!-- Сводная таблица сверки ответов -->' +
      '<div>' +
        '<h4 class="font-extrabold text-base mb-2.5 flex items-center gap-2">' +
          '<span>📋 Таблица сверки ответов (Ваш ответ vs Эталон)</span>' +
        '</h4>' +
        '<div class="overflow-x-auto rounded-xl border" style="border-color: var(--border-color);">' +
          '<table class="w-full text-left border-collapse">' +
            '<thead>' +
              '<tr class="border-b text-xs uppercase" style="background: var(--bg-muted); border-color: var(--border-color); color: var(--text-secondary);">' +
                '<th class="py-2.5 px-3">Задание</th>' +
                '<th class="py-2.5 px-3">Раздел</th>' +
                '<th class="py-2.5 px-3">Ваш ответ</th>' +
                '<th class="py-2.5 px-3">Правильный ответ</th>' +
                '<th class="py-2.5 px-3">Статус</th>' +
                '<th class="py-2.5 px-3">Баллы</th>' +
                '<th class="py-2.5 px-3">Переход</th>' +
              '</tr>' +
            '</thead>' +
            '<tbody>' +
              verificationRowsHtml +
            '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>' +

      '<div class="p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3" style="background: var(--bg-accent-soft); border-color: var(--accent);">' +
        '<div>' +
          '<div class="text-xs font-extrabold uppercase tracking-wider" style="color: var(--accent);">🎮 Награда Angel’s Squad за решение варианта и баллы</div>' +
          '<div class="text-sm font-bold mt-0.5">Начислено <span style="color: var(--accent);">+' + (r.arcadeReward || (15 + r.earnedPoints * 3)) + ' ⚡ баллов</span> (15 за вариант + ' + (r.earnedPoints * 3) + ' за первичные баллы КИМ)! Сумма баллов вариантов: <strong>' + getTotalVariantPoints() + ' б.</strong></div>' +
        '</div>' +
        '<a href="#games" class="btn-primary text-xs py-2 px-3.5">🕹 Открыть игры за баллы &rarr;</a>' +
      '</div>' +
      '<div class="flex flex-wrap items-center justify-between gap-3 pt-2">' +
        '<div class="flex flex-wrap items-center gap-2.5">' +
          '<button type="button" id="exam-restart-btn" class="btn-primary">🎲 Сгенерировать новый рандомный вариант</button>' +
          '<button type="button" id="exam-back-intro-btn" class="btn-secondary">К настройкам рандомайзера и истории</button>' +
        '</div>' +
        '<a href="#formulas" class="formula-link-btn py-2 px-3">📐 Открыть полный справочник формул &rarr;</a>' +
      '</div>' +
    '</div>' +

    '<div class="flex flex-wrap items-center justify-between gap-3 mb-4">' +
      '<h4 class="font-extrabold text-lg sm:text-xl">🔍 Полный разбор всех заданий и формул после решения:</h4>' +
      '<div class="flex flex-wrap items-center gap-1.5">' +
        '<button type="button" data-review-filter="all" class="exam-review-filter-btn pill-tab ' + (activeFilter === 'all' ? 'active' : '') + '">Все (' + r.breakdown.length + ')</button>' +
        '<button type="button" data-review-filter="mistakes" class="exam-review-filter-btn pill-tab ' + (activeFilter === 'mistakes' ? 'active' : '') + '">Только ошибки</button>' +
        '<button type="button" data-review-filter="part1" class="exam-review-filter-btn pill-tab ' + (activeFilter === 'part1' ? 'active' : '') + '">Часть 1</button>' +
        '<button type="button" data-review-filter="part2" class="exam-review-filter-btn pill-tab ' + (activeFilter === 'part2' ? 'active' : '') + '">Часть 2</button>' +
      '</div>' +
    '</div>' +

    '<div class="space-y-4">' +
      (breakdownCardsHtml || '<div class="surface-card p-6 text-center text-sm" style="color: var(--text-secondary);">По выбранному фильтру заданий нет — все задачи решены на максимальный балл! 🎉</div>') +
    '</div>'
  );

  const restartBtn = document.getElementById('exam-restart-btn');
  const backBtn = document.getElementById('exam-back-intro-btn');
  if (restartBtn) restartBtn.addEventListener('click', startMockExam);
  if (backBtn) {
    backBtn.addEventListener('click', function () {
      state.exam.active = false;
      state.exam.finished = false;
      renderExamWorkspace();
    });
  }

  resultBox.querySelectorAll('.exam-review-filter-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.exam.reviewFilter = btn.getAttribute('data-review-filter') || 'all';
      renderExamResultsView();
    });
  });

  resultBox.querySelectorAll('.open-formula-modal-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      openFormulaDeepDiveById(btn.getAttribute('data-open-formula-id'));
    });
  });
}

function renderExamHistory() {
  const container = document.getElementById('exam-history-list');
  if (!container) return;
  const hist = state.progress.examHistory;
  if (!hist || hist.length === 0) {
    container.innerHTML = '<p class="text-xs" style="color: var(--text-muted);">Вы ещё не проходили пробные варианты. Нажмите «Пройти пробный вариант», чтобы проверить свои силы!</p>';
    return;
  }

  container.innerHTML = (
    '<div class="overflow-x-auto">' +
      '<table class="w-full text-left border-collapse text-xs sm:text-sm">' +
        '<thead>' +
          '<tr class="border-b" style="border-color: var(--border-color); color: var(--text-secondary);">' +
            '<th class="py-2 pr-3">Дата</th>' +
            '<th class="py-2 px-3">Баллы</th>' +
            '<th class="py-2 px-3">Оценка</th>' +
            '<th class="py-2 pl-3">Время</th>' +
          '</tr>' +
        '</thead>' +
        '<tbody>' +
          hist.map(function (h) {
            return (
              '<tr class="border-b" style="border-color: var(--border-color);">' +
                '<td class="py-2 pr-3 font-medium">' + h.date + '</td>' +
                '<td class="py-2 px-3 font-bold">' + h.score + ' / ' + h.maxScore + ' (' + h.pct + '%)</td>' +
                '<td class="py-2 px-3"><span class="px-2 py-0.5 rounded font-bold" style="background: var(--bg-accent-soft); color: var(--accent);">Оценка «' + h.grade + '»</span></td>' +
                '<td class="py-2 pl-3">' + formatSecondsHMS(h.timeSpentSec || 0) + '</td>' +
              '</tr>'
            );
          }).join('') +
        '</tbody>' +
      '</table>' +
    '</div>'
  );
}

// ---------------------------------------------------------------------------
// СЕКЦИЯ 6: СПРАВОЧНИК ФОРМУЛ С ПОИСКОМ И ТАБЛИЦА КОНСТАНТ
// ---------------------------------------------------------------------------
function renderFormulaTable() {
  if (!state.data) return;
  const tbody = document.getElementById('formulas-table-body');
  const countEl = document.getElementById('formulas-count-badge');
  if (!tbody) return;

  const q = state.formulaSearch.trim().toLowerCase();
  const topicFilter = state.formulaTopicFilter;

  const filtered = state.data.referenceFormulas.filter(function (item) {
    if (topicFilter !== 'all' && item.topic !== topicFilter) return false;
    if (!q) return true;
    return (
      item.name.toLowerCase().indexOf(q) !== -1 ||
      item.topicName.toLowerCase().indexOf(q) !== -1 ||
      item.quantities.toLowerCase().indexOf(q) !== -1
    );
  });

  if (countEl) countEl.textContent = 'Найдено формул: ' + filtered.length;

  if (filtered.length === 0) {
    tbody.innerHTML = (
      '<tr><td colspan="4" class="py-8 text-center text-sm" style="color: var(--text-secondary);">' +
        'По запросу «' + state.formulaSearch + '» формулы не найдены. Попробуйте ввести другое слово (например: «Виета», «Пифагора», «трапеция», «прогрессия»).' +
      '</td></tr>'
    );
    return;
  }

  tbody.innerHTML = filtered.map(function (f) {
    return (
      '<tr class="border-b transition-colors hover:bg-purple-500/10" style="border-color: var(--border-color);">' +
        '<td class="py-3.5 px-4 text-xs font-bold">' +
          '<span class="px-2.5 py-1 rounded-full" style="background: var(--bg-accent-soft); color: var(--accent);">' + f.topicName + '</span>' +
        '</td>' +
        '<td class="py-3.5 px-4 font-semibold text-sm">' + f.name + '</td>' +
        '<td class="py-3.5 px-4"><span class="math-formula">' + f.formulaHtml + '</span></td>' +
        '<td class="py-3.5 px-4 text-xs" style="color: var(--text-secondary);">' + f.quantities + '</td>' +
        '<td class="py-3.5 px-4 text-xs whitespace-nowrap">' +
          '<div class="flex items-center gap-1.5">' +
            '<button type="button" data-open-formula-id="' + f.id + '" class="formula-link-btn open-formula-modal-btn">' +
              '🔎 Фулл разбор' +
            '</button>' +
            (isFormulaViewed(f.id)
              ? '<span class="px-2 py-0.5 rounded-full text-[11px] font-bold" style="background: var(--success-bg); color: var(--success);" title="Разбор изучен (+5 ⚡)">✓ Изучено</span>'
              : '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold" style="background: var(--bg-accent-soft); color: var(--accent);">+5 ⚡</span>') +
          '</div>' +
        '</td>' +
      '</tr>'
    );
  }).join('');

  tbody.querySelectorAll('.open-formula-modal-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      openFormulaDeepDiveById(btn.getAttribute('data-open-formula-id'));
    });
  });
}

// ---------------------------------------------------------------------------
// ИНТЕРАКТИВНЫЙ ФУЛЛ РАЗБОР ФОРМУЛ (ВЫВОД ВЕЛИЧИН, АЛГЕБРАИЧЕСКИЙ И ГЕОМЕТРИЧЕСКИЙ СМЫСЛ)
// ---------------------------------------------------------------------------
const FORMULA_DEEP_DIVE_GUIDES = {
  practical: {
    externalTitle: 'Полный разбор практико-ориентированных задач №1–5 (ФИПИ / Решу ОГЭ)',
    externalUrl: 'https://math-oge.sdamgia.ru/',
    fipiUrl: 'https://fipi.ru/oge/demoversii-specifikacii-kodifikatory',
    siTip: 'В задачах на план участка со стороной клетки 2 м площадь одной клетки равна 4 м²! В задачах о шинах не забывайте умножать высоту боковины H на 2: D = 2H + d.'
  },
  numbers: {
    externalTitle: 'Полный разбор свойств степеней, корней и ФСУ (Задания №6–8)',
    externalUrl: 'https://math-oge.sdamgia.ru/',
    fipiUrl: 'https://fipi.ru/oge/otkrytyy-bank-zadaniy-oge',
    siTip: 'Помните ключевое тождество √(a²) = |a| и не теряйте удвоенное произведение 2ab в формулах (a ± b)² = a² ± 2ab + b².'
  },
  equations: {
    externalTitle: 'Полный разбор уравнений, систем и неравенств (Задания №9, 13, 20)',
    externalUrl: 'https://math-oge.sdamgia.ru/',
    fipiUrl: 'https://fipi.ru/oge/demoversii-specifikacii-kodifikatory',
    siTip: 'При делении неравенства на отрицательное число знак неравенства меняется на противоположный! В №20 никогда не делите обе части на скобку с переменной — выносите её за скобки.'
  },
  functions: {
    externalTitle: 'Полный разбор графиков функций и прогрессий (Задания №11, 12, 14, 22)',
    externalUrl: 'https://math-oge.sdamgia.ru/',
    fipiUrl: 'https://fipi.ru/oge/otkrytyy-bank-zadaniy-oge',
    siTip: 'Абсцисса вершины параболы x₀ = −b/(2a). В задании №22 обязательно отмечайте выколотые точки ОДЗ пустым кружком на графике!'
  },
  probability: {
    externalTitle: 'Полный разбор теории вероятностей и текстовых задач №10, 21',
    externalUrl: 'https://math-oge.sdamgia.ru/',
    fipiUrl: 'https://fipi.ru/oge/demoversii-specifikacii-kodifikatory',
    siTip: 'Вероятность в бланк №1 записывается только в виде десятичной дроби от 0 до 1. Средняя скорость равна всему пути, делённому на всё время!'
  },
  triangles: {
    externalTitle: 'Полный разбор планиметрии: треугольники и четырёхугольники (№15, 17, 18, 23, 24)',
    externalUrl: 'https://math-oge.sdamgia.ru/',
    fipiUrl: 'https://fipi.ru/oge/otkrytyy-bank-zadaniy-oge',
    siTip: 'Отношение площадей подобных фигур равно КВАДРАТУ коэффициента подобия: S₁ / S₂ = k². Для сдачи ОГЭ нужно набрать минимум 2 балла по геометрии!'
  },
  circles: {
    externalTitle: 'Полный разбор окружностей, утверждений №19 и задач №25',
    externalUrl: 'https://math-oge.sdamgia.ru/',
    fipiUrl: 'https://fipi.ru/oge/demoversii-specifikacii-kodifikatory',
    siTip: 'Вписанный угол равен половине дуги, на которую он опирается. Угол между касательной и радиусом в точку касания всегда равен 90°.'
  }
};

function buildDerivationsForFormula(f) {
  const name = (f.name || '').toLowerCase();
  if (name.indexOf('колес') !== -1 || name.indexOf('шин') !== -1) {
    return [
      'Высота боковины шины: H = B · (P / 100)',
      'Диаметр диска в миллиметрах: d_мм = 25,4 · d_дюйм',
      'Полный диаметр колеса: D = 2H + d_мм'
    ];
  }
  if (name.indexOf('дискриминант') !== -1 || name.indexOf('виета') !== -1) {
    return [
      'Дискриминант: D = b² − 4ac (при D > 0 два корня, при D = 0 один корень)',
      'Формула корней: x₁,₂ = (−b ± √D) / (2a)',
      'Теорема Виета: x₁ + x₂ = −b/a,  x₁ · x₂ = c/a'
    ];
  }
  if (name.indexOf('парабол') !== -1) {
    return [
      'Абсцисса вершины параболы: x₀ = −b / (2a)',
      'Ордината вершины параболы: y₀ = y(x₀) = c − b² / (4a)',
      'Пересечение с осью Oy: точка (0; c)'
    ];
  }
  if (name.indexOf('арифметическ') !== -1) {
    return [
      'n-й член прогрессии: aₙ = a₁ + d · (n − 1)',
      'Разность прогрессии: d = aₙ₊₁ − aₙ = (aₙ − a₁) / (n − 1)',
      'Сумма первых n членов: Sₙ = ((a₁ + aₙ) / 2) · n'
    ];
  }
  if (name.indexOf('пифагор') !== -1) {
    return [
      'Гипотенуза прямоугольного треугольника: c = √(a² + b²)',
      'Неизвестный катет: a = √(c² − b²) = √((c − b)(c + b))',
      'Тригонометрия: sin α = a/c, cos α = b/c, tg α = a/b'
    ];
  }
  if (name.indexOf('трапец') !== -1) {
    return [
      'Средняя линия трапеции: m = (a + b) / 2',
      'Площадь трапеции: S = ((a + b) / 2) · h = m · h',
      'Высота трапеции через площадь: h = 2S / (a + b)'
    ];
  }
  if (name.indexOf('касательн') !== -1 || name.indexOf('вписанн') !== -1) {
    return [
      'Вписанный угол: ∠ABC = ½ ∠AOC = ½ ◡AC',
      'Квадрат касательной: AK² = AB_внеш · AC_вся',
      'Вписанный четырёхугольник: ∠A + ∠C = 180°; описанный: a + c = b + d'
    ];
  }
  return [
    'Базовая запись соотношения: ' + (f.formulaHtml || '').replace(/<[^>]+>/g, ''),
    'Применение в КИМ ОГЭ: ' + (f.quantities || 'Раздел ' + (f.topicName || '')),
    'Перед записью ответа в бланк №1 переведите результат в целое число или конечную десятичную дробь.'
  ];
}

function showFormulaDeepDiveModal(formulaObj) {
  const modal = document.getElementById('formula-detail-modal');
  const body = document.getElementById('formula-detail-modal-body');
  if (!modal || !body || !formulaObj) return;

  const fKey = String(formulaObj.id || formulaObj.name || 'f_custom');
  const rewardInfo = recordFormulaBreakdownView(fKey, formulaObj.name);

  const topicId = formulaObj.topic || 'practical';
  const guide = FORMULA_DEEP_DIVE_GUIDES[topicId] || FORMULA_DEEP_DIVE_GUIDES.practical;
  const derivations = buildDerivationsForFormula(formulaObj);

  // Находим 1–2 реальные задачи из банка по этой теме для примера применения
  const sampleTasks = state.data && state.data.tasks
    ? state.data.tasks.filter(function (t) { return t.topic === topicId; }).slice(0, 2)
    : [];

  body.innerHTML = (
    '<div class="space-y-4">' +
      '<div class="flex flex-wrap items-center justify-between gap-2">' +
        '<div class="flex flex-wrap items-center gap-2">' +
          '<span class="text-xs font-bold px-2.5 py-1 rounded-full angels-squad-badge">Angel’s Squad • Фулл разбор формулы</span>' +
          '<span class="text-xs font-bold px-2.5 py-1 rounded-full" style="background: var(--bg-accent-soft); color: var(--accent);">' + (formulaObj.topicName || topicTitleById(topicId)) + '</span>' +
        '</div>' +
        '<span class="text-xs font-extrabold px-2.5 py-1 rounded-full" style="background: var(--success-bg); color: var(--success);">' +
          (rewardInfo.isNew ? '🎉 +5 ⚡ баллов за разбор! ' : '✓ Разбор изучен (+1 ⚡) • ') + 'Изучено: ' + rewardInfo.totalViewed + ' / ' + rewardInfo.totalFormulas +
        '</span>' +
      '</div>' +
      '<h3 class="text-xl sm:text-2xl font-extrabold">' + formulaObj.name + '</h3>' +
      '<div class="p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-4" style="background: var(--bg-muted); border-color: var(--accent);">' +
        '<div class="text-lg sm:text-xl"><span class="math-formula">' + formulaObj.formulaHtml + '</span></div>' +
        '<div class="text-xs sm:text-sm font-medium" style="color: var(--text-secondary);">' + (formulaObj.quantities || ('Применение в КИМ: ' + (formulaObj.units || ''))) + '</div>' +
      '</div>' +

      '<div class="p-4 rounded-xl border space-y-2" style="background: var(--bg-surface); border-color: var(--border-color);">' +
        '<h4 class="font-bold text-sm" style="color: var(--accent);">🔄 Выражение всех величин из формулы (шпаргалка для Части 1 и 2):</h4>' +
        '<ul class="space-y-1.5 text-xs sm:text-sm">' +
          derivations.map(function (d) { return '<li>• <strong>' + d + '</strong></li>'; }).join('') +
        '</ul>' +
      '</div>' +

      '<div class="p-4 rounded-xl border space-y-1.5" style="background: var(--warning-bg); border-color: var(--warning);">' +
        '<h4 class="font-bold text-sm" style="color: var(--warning);">⚠️ Главная ловушка ОГЭ по этой теме:</h4>' +
        '<p class="text-xs sm:text-sm">' + guide.siTip + '</p>' +
      '</div>' +

      (sampleTasks.length > 0 ? (
        '<div class="p-4 rounded-xl border space-y-2" style="background: var(--bg-muted); border-color: var(--border-color);">' +
          '<h4 class="font-bold text-sm">🎯 Пример применения на ОГЭ (из банка заданий):</h4>' +
          '<p class="text-xs sm:text-sm">' + sampleTasks[0].question + '</p>' +
          '<p class="text-xs font-semibold" style="color: var(--success);">Разбор: ' + (sampleTasks[0].explanation || sampleTasks[0].finalAnswer) + '</p>' +
        '</div>'
      ) : '') +

      '<div class="p-4 rounded-xl border space-y-2" style="background: var(--bg-accent-soft); border-color: var(--border-color);">' +
        '<h4 class="font-bold text-xs sm:text-sm uppercase tracking-wider" style="color: var(--accent);">🔗 Ссылки на официальные справочники и полный разбор темы:</h4>' +
        '<div class="flex flex-wrap items-center gap-2.5 pt-1">' +
          '<a href="' + guide.fipiUrl + '" target="_blank" rel="noopener noreferrer" class="formula-link-btn">📄 Кодификатор всех формул ФИПИ &nearr;</a>' +
          '<a href="' + guide.externalUrl + '" target="_blank" rel="noopener noreferrer" class="formula-link-btn">🌐 ' + guide.externalTitle + ' &nearr;</a>' +
          '<button type="button" id="modal-train-formula-topic-btn" data-topic="' + topicId + '" class="btn-primary text-xs py-1.5 px-3">🚀 Решать задачи на эту формулу</button>' +
        '</div>' +
      '</div>' +
    '</div>'
  );

  modal.classList.remove('hidden');

  const trainBtn = document.getElementById('modal-train-formula-topic-btn');
  if (trainBtn) {
    trainBtn.addEventListener('click', function () {
      modal.classList.add('hidden');
      state.trainerFilter.topic = topicId;
      syncTrainerFilterControls();
      applyTrainerFilters(true);
      const trainerSec = document.getElementById('trainer');
      if (trainerSec) trainerSec.scrollIntoView({ behavior: 'smooth' });
      showToast('Тренажёр переключён на раздел «' + topicTitleById(topicId) + '»', 'success');
    });
  }
}

function openFormulaDeepDiveById(formulaId) {
  if (!state.data || !state.data.referenceFormulas) return;
  const found = state.data.referenceFormulas.find(function (f) { return f.id === formulaId; }) || state.data.referenceFormulas[0];
  showFormulaDeepDiveModal(found);
}

function openFormulaDeepDiveByTopic(topicId, formulaIdx) {
  if (!state.data || !state.data.topics) return;
  const topic = state.data.topics.find(function (t) { return t.id === topicId; });
  if (!topic || !topic.formulas || !topic.formulas[formulaIdx]) return;
  const f = topic.formulas[formulaIdx];
  showFormulaDeepDiveModal({
    id: topicId + '_' + formulaIdx,
    topic: topicId,
    topicName: topic.title,
    name: f.name,
    formulaHtml: f.formulaHtml,
    quantities: 'Применение в КИМ ОГЭ: ' + f.units + '. Раздел: ' + topic.title
  });
}

function renderConstantsTable() {
  if (!state.data) return;
  const container = document.getElementById('constants-grid');
  if (!container) return;

  container.innerHTML = state.data.constantsTable.map(function (c) {
    return (
      '<div class="p-3.5 rounded-xl border flex items-center justify-between gap-3" style="background: var(--bg-muted); border-color: var(--border-color);">' +
        '<div>' +
          '<div class="text-xs font-medium" style="color: var(--text-secondary);">' + c.name + '</div>' +
          '<div class="text-sm font-bold mt-0.5">' + c.value + '</div>' +
        '</div>' +
        '<span class="math-formula text-sm">' + c.symbol + '</span>' +
      '</div>'
    );
  }).join('');
}

// ---------------------------------------------------------------------------
// СЕКЦИЯ 7: СОВЕТЫ, ТИПИЧНЫЕ ЛОВУШКИ И ТАЙМ-МЕНЕДЖМЕНТ
// ---------------------------------------------------------------------------
function renderTipsSection() {
  if (!state.data || !state.data.tips) return;
  const pitfallsEl = document.getElementById('tips-pitfalls-list');
  const part2El = document.getElementById('tips-part2-list');
  const timeEl = document.getElementById('tips-time-table');

  if (pitfallsEl) {
    pitfallsEl.innerHTML = state.data.tips.pitfalls.map(function (p) {
      return (
        '<div class="surface-card p-5 border-l-4" style="border-left-color: var(--warning);">' +
          '<h4 class="font-bold text-base mb-1.5">' + p.title + '</h4>' +
          '<p class="text-sm leading-relaxed" style="color: var(--text-secondary);">' + p.desc + '</p>' +
        '</div>'
      );
    }).join('');
  }

  if (part2El) {
    part2El.innerHTML = state.data.tips.part2Formatting.map(function (s) {
      return (
        '<div class="surface-card p-4">' +
          '<div class="font-bold text-sm mb-1" style="color: var(--accent);">' + s.step + '</div>' +
          '<p class="text-xs sm:text-sm leading-relaxed" style="color: var(--text-secondary);">' + s.detail + '</p>' +
        '</div>'
      );
    }).join('');
  }

  if (timeEl) {
    timeEl.innerHTML = state.data.tips.timePlan.map(function (row) {
      return (
        '<tr class="border-b" style="border-color: var(--border-color);">' +
          '<td class="py-3 px-4 font-semibold text-sm">' + row.stage + '</td>' +
          '<td class="py-3 px-4 font-bold text-xs whitespace-nowrap"><span class="px-2.5 py-1 rounded-lg" style="background: var(--bg-accent-soft); color: var(--accent);">' + row.time + '</span></td>' +
          '<td class="py-3 px-4 text-xs sm:text-sm" style="color: var(--text-secondary);">' + row.advice + '</td>' +
        '</tr>'
      );
    }).join('');
  }
}

// ---------------------------------------------------------------------------
// ЭКСПОРТ JSON БАЗЫ И ДОБАВЛЕНИЕ СВОЕЙ ЗАДАЧИ
// ---------------------------------------------------------------------------
function downloadTasksJson() {
  if (!state.data) return;
  const jsonStr = JSON.stringify(state.data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tasks.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Файл tasks.json успешно скачан!', 'success');
}


// ---------------------------------------------------------------------------
// СЕКЦИЯ ИГР И НАГРАД ANGEL’S SQUAD ARCADE (БАЛЛЫ ВАРИАНТОВ, РАЗБОРЫ ФОРМУЛ, МИНИ-ИГРЫ)
// ---------------------------------------------------------------------------
function ensureArcadeState() {
  if (!state.progress.arcade || typeof state.progress.arcade !== 'object') {
    state.progress.arcade = {
      coins: 20,
      totalVariantPoints: 0,
      viewedFormulas: {},
      unlockedGames: { sprint: true, cannon: false, reactor: false },
      highScores: { sprint: 0, cannon: 0, reactor: 0 }
    };
  }
  if (!state.progress.arcade.viewedFormulas) state.progress.arcade.viewedFormulas = {};
  if (!state.progress.arcade.unlockedGames) state.progress.arcade.unlockedGames = { sprint: true, cannon: false, reactor: false };
  if (!state.progress.arcade.highScores) state.progress.arcade.highScores = { sprint: 0, cannon: 0, reactor: 0 };
  return state.progress.arcade;
}

function getTotalVariantPoints() {
  const arc = ensureArcadeState();
  const histSum = (state.progress.examHistory || []).reduce(function (acc, item) {
    return acc + (Number(item.score) || 0);
  }, 0);
  return Math.max(arc.totalVariantPoints || 0, histSum);
}

function getViewedFormulasCount() {
  const arc = ensureArcadeState();
  return Object.keys(arc.viewedFormulas || {}).length;
}

function isFormulaViewed(formulaId) {
  const arc = ensureArcadeState();
  return Boolean(arc.viewedFormulas && arc.viewedFormulas[formulaId]);
}

function addArcadeCoins(amount, reasonText) {
  const arc = ensureArcadeState();
  arc.coins = Math.max(0, (arc.coins || 0) + amount);
  checkAutoUnlockArcadeGames();
  saveProgress();
  renderArcadeDashboard();
  if (reasonText) {
    showToast('⚡ +' + amount + ' баллов Angel’s Squad (' + reasonText + ')!', 'success');
  }
}

function recordFormulaBreakdownView(formulaId, formulaName) {
  const arc = ensureArcadeState();
  const totalFormulas = (state.data && state.data.referenceFormulas) ? state.data.referenceFormulas.length : 36;
  const isNew = !arc.viewedFormulas[formulaId];
  arc.viewedFormulas[formulaId] = {
    name: formulaName || formulaId,
    timestamp: Date.now()
  };
  arc.coins = (arc.coins || 0) + (isNew ? 5 : 1);
  checkAutoUnlockArcadeGames();
  saveProgress();
  renderFormulaTable();
  renderArcadeSection();
  return {
    isNew: isNew,
    totalViewed: Object.keys(arc.viewedFormulas).length,
    totalFormulas: totalFormulas
  };
}

function checkAutoUnlockArcadeGames() {
  const arc = ensureArcadeState();
  const variantsCount = (state.progress.examHistory || []).length;
  const variantPts = getTotalVariantPoints();
  const viewedCount = getViewedFormulasCount();

  // Игра 2 (Параболическая пушка) автоматически открывается за 1 решённый вариант (или >=5 баллов вариантов) или >=3 изученных разбора формул
  if (!arc.unlockedGames.cannon && (variantsCount >= 1 || variantPts >= 5 || viewedCount >= 3)) {
    arc.unlockedGames.cannon = true;
    showToast('🔓 Открыта мини-игра «Параболическая пушка ОГЭ» за ваши достижения!', 'success');
  }
  // Игра 3 (Алгебраический реактор ФИПИ) автоматически открывается за >=15 баллов вариантов или >=6 изученных разборов формул
  if (!arc.unlockedGames.reactor && (variantPts >= 15 || viewedCount >= 6)) {
    arc.unlockedGames.reactor = true;
    showToast('🔓 Открыта мини-игра «Алгебраический реактор ФИПИ» за ваши баллы вариантов и разборы формул!', 'success');
  }
}

function unlockArcadeGameByCoins(gameId, cost) {
  const arc = ensureArcadeState();
  if (arc.unlockedGames[gameId]) {
    selectArcadeGame(gameId);
    return;
  }
  if ((arc.coins || 0) < cost) {
    showToast('Недостаточно ⚡ баллов! Посмотрите фулл разборы формул (+5 ⚡), решите вариант ОГЭ или нажмите «Тестовый бонус +100 ⚡».', 'warning');
    return;
  }
  arc.coins -= cost;
  arc.unlockedGames[gameId] = true;
  saveProgress();
  state.arcadeRuntime.activeGame = gameId;
  renderArcadeSection();
  showToast('🎉 Игра успешно открыта за ' + cost + ' ⚡ баллов! Приятной тренировки!', 'success');
}

function selectArcadeGame(gameId) {
  const arc = ensureArcadeState();
  if (!arc.unlockedGames[gameId]) {
    showToast('Сначала откройте эту игру за баллы, решение вариантов или просмотр разборов формул!', 'warning');
    return;
  }
  state.arcadeRuntime.activeGame = gameId;
  renderArcadeSection();
}

function getArcadeRankTitle(coins, variantPts, viewedCount) {
  const power = coins + variantPts * 3 + viewedCount * 5;
  if (power >= 250) return '👑 Архонт Математики Angel’s Squad';
  if (power >= 140) return '🔮 Магистр КИМ и Формул';
  if (power >= 70) return '⚡ Инженер-испытатель ОГЭ';
  return '🪽 Кадет Angel’s Squad';
}

function renderArcadeDashboard() {
  const arc = ensureArcadeState();
  const variantPts = getTotalVariantPoints();
  const variantsSolved = (state.progress.examHistory || []).length;
  const viewedCount = getViewedFormulasCount();
  const totalFormulas = (state.data && state.data.referenceFormulas) ? state.data.referenceFormulas.length : 36;
  const totalHighScore = (arc.highScores.sprint || 0) + (arc.highScores.cannon || 0) + (arc.highScores.reactor || 0);

  const headerBadge = document.getElementById('header-arcade-points');
  if (headerBadge) headerBadge.textContent = String(arc.coins || 0);

  const coinsEl = document.getElementById('arcade-coins-val');
  const varPtsEl = document.getElementById('arcade-variant-pts-val');
  const varCntEl = document.getElementById('arcade-variants-count-val');
  const formViewedEl = document.getElementById('arcade-formulas-viewed-val');
  const formBarEl = document.getElementById('arcade-formulas-bar');
  const highEl = document.getElementById('arcade-total-highscore-val');
  const rankEl = document.getElementById('arcade-rank-badge');

  if (coinsEl) coinsEl.textContent = String(arc.coins || 0);
  if (varPtsEl) varPtsEl.textContent = String(variantPts);
  if (varCntEl) varCntEl.textContent = String(variantsSolved);
  if (formViewedEl) formViewedEl.textContent = viewedCount + ' / ' + totalFormulas;
  if (formBarEl) {
    const pct = totalFormulas > 0 ? Math.min(100, Math.round((viewedCount / totalFormulas) * 100)) : 0;
    formBarEl.style.width = pct + '%';
  }
  if (highEl) highEl.textContent = String(totalHighScore);
  if (rankEl) rankEl.textContent = getArcadeRankTitle(arc.coins || 0, variantPts, viewedCount);
}

function renderArcadeSection() {
  if (!state.data) return;
  renderArcadeDashboard();
  renderArcadeSelectorCards();
  renderActiveArcadeGameArena();
}

function renderArcadeSelectorCards() {
  const container = document.getElementById('arcade-games-grid');
  if (!container) return;
  const arc = ensureArcadeState();
  const activeGame = state.arcadeRuntime.activeGame || 'sprint';
  const variantPts = getTotalVariantPoints();
  const viewedCount = getViewedFormulasCount();

  const gamesMeta = [
    {
      id: 'sprint',
      icon: '⚡',
      title: 'Формульный Блитц (Algebra & Geometry Sprint)',
      badge: 'Скорость и формулы ОГЭ',
      desc: 'Успейте за 45 секунд сопоставить максимум математических теорем, свойств степеней и формул площадей. Серия верных ответов включает множитель комбо и приносит ⚡ баллы!',
      cost: 0,
      conditionText: 'Открыто сразу со старта',
      highScore: arc.highScores.sprint || 0
    },
    {
      id: 'cannon',
      icon: '🎯',
      title: 'Параболическая пушка ОГЭ (Quadratic Lab)',
      badge: 'Функции и парабола • Задания №11, 12, 22',
      desc: 'Исследуйте квадратичную траекторию снаряда на координатной сетке: подбирайте параметр скорости v₀ и угол наклона α, чтобы вершина и ветвь параболы поразили мишень!',
      cost: 25,
      conditionText: '25 ⚡ баллов ИЛИ 1 решённый вариант (≥5 баллов) ИЛИ 3 разбора формул (сейчас: ' + viewedCount + '/3)',
      highScore: arc.highScores.cannon || 0
    },
    {
      id: 'reactor',
      icon: '🔮',
      title: 'Алгебраический реактор ФИПИ (Тренажёр №19 и ОДЗ)',
      badge: 'Геометрические утверждения №19 и ловушки КИМ',
      desc: 'Удерживайте щит реактора Angel’s Squad: отличайте истинные теоремы планиметрии (задание №19) и правила алгебры от коварных ловушек ФИПИ!',
      cost: 50,
      conditionText: '50 ⚡ баллов ИЛИ ≥15 баллов вариантов (сейчас: ' + variantPts + '/15) ИЛИ 6 разборов формул (сейчас: ' + viewedCount + '/6)',
      highScore: arc.highScores.reactor || 0
    }
  ];

  container.innerHTML = gamesMeta.map(function (g) {
    const unlocked = Boolean(arc.unlockedGames[g.id]);
    const isSelected = activeGame === g.id;
    const borderStyle = isSelected
      ? 'border: 2px solid var(--accent); box-shadow: 0 0 20px rgba(168, 85, 247, 0.25);'
      : '';

    return (
      '<div class="surface-card arcade-card p-5 flex flex-col justify-between" style="' + borderStyle + '">' +
        '<div>' +
          '<div class="flex items-center justify-between gap-2 mb-2.5">' +
            '<span class="text-2xl">' + g.icon + '</span>' +
            (unlocked
              ? '<span class="text-xs font-extrabold px-2.5 py-1 rounded-full" style="background: var(--success-bg); color: var(--success);">🔓 Открыто</span>'
              : '<span class="text-xs font-extrabold px-2.5 py-1 rounded-full" style="background: var(--warning-bg); color: var(--warning);">🔒 Закрыто (' + g.cost + ' ⚡)</span>') +
          '</div>' +
          '<div class="text-[11px] font-bold uppercase tracking-wider mb-1" style="color: var(--accent);">' + g.badge + '</div>' +
          '<h3 class="font-extrabold text-base sm:text-lg mb-1.5">' + g.title + '</h3>' +
          '<p class="text-xs sm:text-sm leading-relaxed mb-3" style="color: var(--text-secondary);">' + g.desc + '</p>' +
        '</div>' +
        '<div class="pt-3 border-t space-y-2.5" style="border-color: var(--border-color);">' +
          '<div class="flex items-center justify-between text-xs">' +
            '<span style="color: var(--text-secondary);">Ваш рекорд: <strong style="color: var(--text-primary);">' + g.highScore + ' очк.</strong></span>' +
            (isSelected && unlocked ? '<span class="font-extrabold" style="color: var(--accent);">● Выбрана сейчас</span>' : '') +
          '</div>' +
          (!unlocked
            ? '<div class="p-2.5 rounded-xl text-[11px] leading-snug" style="background: var(--bg-muted); color: var(--text-secondary);"><strong>Как открыть:</strong> ' + g.conditionText + '</div>' +
              '<button type="button" data-unlock-game="' + g.id + '" data-unlock-cost="' + g.cost + '" class="arcade-unlock-btn btn-primary w-full text-xs py-2.5">🔓 Открыть за ' + g.cost + ' ⚡ баллов</button>'
            : '<button type="button" data-select-game="' + g.id + '" class="arcade-select-btn ' + (isSelected ? 'btn-primary' : 'btn-secondary') + ' w-full text-xs py-2.5">' + (isSelected ? '🎮 Игра запущена ниже' : '▶️ Выбрать и играть') + '</button>') +
        '</div>' +
      '</div>'
    );
  }).join('');

  container.querySelectorAll('.arcade-unlock-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const gId = btn.getAttribute('data-unlock-game');
      const cost = parseInt(btn.getAttribute('data-unlock-cost'), 10) || 25;
      unlockArcadeGameByCoins(gId, cost);
    });
  });

  container.querySelectorAll('.arcade-select-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const gId = btn.getAttribute('data-select-game');
      selectArcadeGame(gId);
    });
  });
}

function renderActiveArcadeGameArena() {
  const arena = document.getElementById('arcade-active-arena');
  if (!arena) return;
  const gId = state.arcadeRuntime.activeGame || 'sprint';
  if (gId === 'sprint') {
    renderSprintGameArena(arena);
  } else if (gId === 'cannon') {
    renderCannonGameArena(arena);
  } else {
    renderReactorGameArena(arena);
  }
}

// --- ИГРА 1: ФОРМУЛЬНЫЙ БЛИТЦ (FORMULA SPRINT) ---
function generateSprintQuestion() {
  const pool = (state.data && state.data.referenceFormulas && state.data.referenceFormulas.length >= 4)
    ? state.data.referenceFormulas
    : [];
  if (pool.length < 4) return null;
  const rightIdx = Math.floor(Math.random() * pool.length);
  const rightItem = pool[rightIdx];
  const distractors = pool.filter(function (_, idx) { return idx !== rightIdx; })
    .sort(function () { return Math.random() - 0.5; })
    .slice(0, 3);
  const options = [rightItem].concat(distractors).sort(function () { return Math.random() - 0.5; });
  return {
    promptName: rightItem.name,
    topicName: rightItem.topicName,
    quantities: rightItem.quantities,
    rightId: rightItem.id,
    options: options
  };
}

function startSprintGame() {
  const sp = state.arcadeRuntime.sprint;
  if (sp.timerId) clearInterval(sp.timerId);
  sp.running = true;
  sp.timeLeft = 45;
  sp.score = 0;
  sp.streak = 0;
  sp.currentQ = generateSprintQuestion();

  sp.timerId = setInterval(function () {
    if (!sp.running) return;
    sp.timeLeft -= 1;
    const timerEl = document.getElementById('sprint-timer-val');
    if (timerEl) timerEl.textContent = sp.timeLeft + ' сек';
    if (sp.timeLeft <= 0) {
      finishSprintGame();
    }
  }, 1000);

  renderActiveArcadeGameArena();
}

function finishSprintGame() {
  const sp = state.arcadeRuntime.sprint;
  if (sp.timerId) {
    clearInterval(sp.timerId);
    sp.timerId = null;
  }
  sp.running = false;
  const arc = ensureArcadeState();
  if (sp.score > (arc.highScores.sprint || 0)) {
    arc.highScores.sprint = sp.score;
  }
  const bonusCoins = Math.max(2, Math.floor(sp.score / 15));
  arc.coins = (arc.coins || 0) + bonusCoins;
  saveProgress();
  renderArcadeSection();
  showToast('🏁 Блитц завершён! Ваш счёт: ' + sp.score + ' очк. Начислено +' + bonusCoins + ' ⚡ баллов!', 'success');
}

function answerSprintQuestion(pickedId) {
  const sp = state.arcadeRuntime.sprint;
  if (!sp.running || !sp.currentQ) return;
  const isRight = pickedId === sp.currentQ.rightId;
  if (isRight) {
    sp.streak += 1;
    const mult = Math.min(4, 1 + Math.floor(sp.streak / 3));
    sp.score += 10 * mult;
  } else {
    sp.streak = 0;
    sp.score = Math.max(0, sp.score - 5);
  }
  sp.currentQ = generateSprintQuestion();
  renderActiveArcadeGameArena();
}

function renderSprintGameArena(arena) {
  const sp = state.arcadeRuntime.sprint;
  const arc = ensureArcadeState();
  if (!sp.currentQ) sp.currentQ = generateSprintQuestion();
  const q = sp.currentQ;

  arena.innerHTML = (
    '<div class="surface-card p-6 space-y-5">' +
      '<div class="flex flex-wrap items-center justify-between gap-3 border-b pb-4" style="border-color: var(--border-color);">' +
        '<div>' +
          '<span class="text-xs font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full angels-squad-badge">⚡ Мини-игра 1 • Angel’s Squad Blitz</span>' +
          '<h3 class="text-xl sm:text-2xl font-black mt-1.5">Формульный Блитц: Угадай закон за 45 секунд</h3>' +
        '</div>' +
        '<div class="flex flex-wrap items-center gap-3">' +
          '<div class="px-3.5 py-2 rounded-xl border text-center" style="background: var(--bg-muted); border-color: var(--border-color);">' +
            '<div class="text-[10px] uppercase font-bold" style="color: var(--text-secondary);">Таймер</div>' +
            '<div id="sprint-timer-val" class="text-lg font-black" style="color: var(--accent);">' + sp.timeLeft + ' сек</div>' +
          '</div>' +
          '<div class="px-3.5 py-2 rounded-xl border text-center" style="background: var(--bg-muted); border-color: var(--border-color);">' +
            '<div class="text-[10px] uppercase font-bold" style="color: var(--text-secondary);">Счёт / Комбо</div>' +
            '<div class="text-lg font-black">' + sp.score + ' <span class="text-xs font-bold" style="color: var(--success);">🔥x' + Math.min(4, 1 + Math.floor(sp.streak / 3)) + '</span></div>' +
          '</div>' +
          '<button type="button" id="sprint-start-btn" class="btn-primary text-xs sm:text-sm py-2.5 px-4">' +
            (sp.running ? '🔄 Начать заново' : '🚀 Старт Блитца (45 сек)') +
          '</button>' +
        '</div>' +
      '</div>' +

      (!sp.running
        ? '<div class="p-6 rounded-2xl border text-center space-y-3" style="background: var(--bg-muted); border-color: var(--border-color);">' +
            '<div class="text-3xl">⚡📐🏆</div>' +
            '<h4 class="text-lg font-extrabold">Готовы проверить знание формул ОГЭ на скорость?</h4>' +
            '<p class="text-xs sm:text-sm max-w-xl mx-auto" style="color: var(--text-secondary);">Нажимайте на верную формулу для каждой теоремы алгебры и геометрии. За каждые 3 ответа подряд растёт множитель комбо, а в конце раунда вы получаете ⚡ баллы для открытия других игр! Ваш рекорд: <strong>' + (arc.highScores.sprint || 0) + ' очков</strong>.</p>' +
            '<button type="button" id="sprint-cta-start-btn" class="btn-primary py-3 px-6 text-sm">⚡ Запустить Формульный Блитц</button>' +
          '</div>'
        : (q ? (
          '<div class="space-y-4">' +
            '<div class="p-5 rounded-2xl border" style="background: var(--bg-muted); border-color: var(--accent);">' +
              '<div class="text-xs font-bold uppercase mb-1" style="color: var(--accent);">Раздел: ' + q.topicName + ' • Серия без ошибок: ' + sp.streak + '</div>' +
              '<div class="text-lg sm:text-xl font-black">Найдите формулу: «' + q.promptName + '»</div>' +
              '<div class="text-xs mt-1" style="color: var(--text-secondary);">Подсказка по величинам: ' + q.quantities + '</div>' +
            '</div>' +
            '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
              q.options.map(function (opt) {
                return (
                  '<button type="button" data-sprint-opt="' + opt.id + '" class="sprint-option-btn game-option-btn p-4 rounded-xl text-left flex items-center justify-between gap-3 cursor-pointer">' +
                    '<span class="math-formula text-base">' + opt.formulaHtml + '</span>' +
                    '<span class="text-xs font-bold px-2.5 py-1 rounded-lg" style="background: var(--bg-accent-soft); color: var(--accent);">Выбрать &rarr;</span>' +
                  '</button>'
                );
              }).join('') +
            '</div>' +
          '</div>'
        ) : '')) +
    '</div>'
  );

  const startBtn = document.getElementById('sprint-start-btn');
  const ctaStartBtn = document.getElementById('sprint-cta-start-btn');
  if (startBtn) startBtn.addEventListener('click', startSprintGame);
  if (ctaStartBtn) ctaStartBtn.addEventListener('click', startSprintGame);

  arena.querySelectorAll('.sprint-option-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      answerSprintQuestion(btn.getAttribute('data-sprint-opt'));
    });
  });
}

// --- ИГРА 2: БАЛЛИСТИЧЕСКАЯ ПУШКА ОГЭ (PROJECTILE CANNON LAB) ---
function renderCannonGameArena(arena) {
  const cn = state.arcadeRuntime.cannon;
  const arc = ensureArcadeState();

  arena.innerHTML = (
    '<div class="surface-card p-6 space-y-5">' +
      '<div class="flex flex-wrap items-center justify-between gap-3 border-b pb-4" style="border-color: var(--border-color);">' +
        '<div>' +
          '<span class="text-xs font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full angels-squad-badge">🎯 Мини-игра 2 • Квадратичная функция и Парабола</span>' +
          '<h3 class="text-xl sm:text-2xl font-black mt-1.5">Параболическая пушка ОГЭ: Попади в мишень по формуле</h3>' +
        '</div>' +
        '<div class="flex flex-wrap items-center gap-2.5">' +
          '<div class="px-3.5 py-2 rounded-xl border text-center" style="background: var(--bg-muted); border-color: var(--border-color);">' +
            '<div class="text-[10px] uppercase font-bold" style="color: var(--text-secondary);">Мишень на расстоянии</div>' +
            '<div class="text-lg font-black" style="color: var(--accent);">L = ' + cn.targetDist + ' м</div>' +
          '</div>' +
          '<div class="px-3.5 py-2 rounded-xl border text-center" style="background: var(--bg-muted); border-color: var(--border-color);">' +
            '<div class="text-[10px] uppercase font-bold" style="color: var(--text-secondary);">Точных попаданий</div>' +
            '<div class="text-lg font-black" style="color: var(--success);">' + cn.hits + ' (Счёт: ' + cn.score + ')</div>' +
          '</div>' +
          '<button type="button" id="cannon-new-target-btn" class="btn-secondary text-xs py-2 px-3">🎲 Новая мишень</button>' +
        '</div>' +
      '</div>' +

      '<div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">' +
        '<div class="lg:col-span-8">' +
          '<div class="rounded-2xl border overflow-hidden p-2" style="background: #090414; border-color: var(--border-color);">' +
            '<canvas id="cannon-game-canvas" width="680" height="300" class="w-full h-auto block rounded-xl"></canvas>' +
          '</div>' +
        '</div>' +
        '<div class="lg:col-span-4 space-y-4">' +
          '<div class="p-4 rounded-xl border space-y-3" style="background: var(--bg-muted); border-color: var(--border-color);">' +
            '<div class="text-xs font-bold uppercase" style="color: var(--accent);">📐 Формула дальности полёта (g = 10 м/с²):</div>' +
            '<div class="math-formula text-sm">L = (v₀² · sin(2α)) / g</div>' +
            '<div>' +
              '<label class="flex justify-between text-xs font-bold mb-1"><span>Начальная скорость v₀:</span> <span id="cannon-vel-label" style="color: var(--accent);">' + cn.velocity + ' м/с</span></label>' +
              '<input type="range" id="cannon-vel-slider" min="10" max="34" step="1" value="' + cn.velocity + '" class="w-full accent-purple-500">' +
            '</div>' +
            '<div>' +
              '<label class="flex justify-between text-xs font-bold mb-1"><span>Угол выстрела α:</span> <span id="cannon-angle-label" style="color: var(--accent);">' + cn.angle + '°</span></label>' +
              '<input type="range" id="cannon-angle-slider" min="15" max="75" step="1" value="' + cn.angle + '" class="w-full accent-purple-500">' +
            '</div>' +
            '<div class="flex flex-wrap gap-2 pt-1">' +
              '<button type="button" id="cannon-fire-btn" class="btn-primary flex-1 py-2.5 text-sm">🔥 Выстрел!</button>' +
              '<button type="button" id="cannon-autosolve-btn" class="btn-secondary text-xs py-2.5 px-3" title="Подобрать точные параметры по формуле">🧮 Подобрать по формуле</button>' +
            '</div>' +
          '</div>' +
          '<div id="cannon-flight-feedback" class="p-3.5 rounded-xl border text-xs leading-relaxed" style="background: var(--bg-surface); border-color: var(--border-color);">' +
            (cn.lastFlight
              ? cn.lastFlight
              : 'Настройте ползунки скорости <strong>v₀</strong> и угла <strong>α</strong> так, чтобы снаряд приземлился точно в мишень на отметке <strong>' + cn.targetDist + ' м</strong> (±4 м). Рекорд: <strong>' + (arc.highScores.cannon || 0) + ' очк.</strong>') +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>'
  );

  drawCannonScene(null);

  const velSlider = document.getElementById('cannon-vel-slider');
  const angSlider = document.getElementById('cannon-angle-slider');
  const velLabel = document.getElementById('cannon-vel-label');
  const angLabel = document.getElementById('cannon-angle-label');

  if (velSlider) {
    velSlider.addEventListener('input', function () {
      cn.velocity = parseInt(velSlider.value, 10);
      if (velLabel) velLabel.textContent = cn.velocity + ' м/с';
      drawCannonScene(null);
    });
  }
  if (angSlider) {
    angSlider.addEventListener('input', function () {
      cn.angle = parseInt(angSlider.value, 10);
      if (angLabel) angLabel.textContent = cn.angle + '°';
      drawCannonScene(null);
    });
  }

  const fireBtn = document.getElementById('cannon-fire-btn');
  if (fireBtn) {
    fireBtn.addEventListener('click', fireCannonShot);
  }

  const newTargetBtn = document.getElementById('cannon-new-target-btn');
  if (newTargetBtn) {
    newTargetBtn.addEventListener('click', function () {
      cn.targetDist = Math.floor(22 + Math.random() * 68);
      cn.lastFlight = 'Новая мишень установлена на расстоянии <strong>L = ' + cn.targetDist + ' м</strong>. Рассчитайте скорость и угол!';
      renderActiveArcadeGameArena();
    });
  }

  const autoBtn = document.getElementById('cannon-autosolve-btn');
  if (autoBtn) {
    autoBtn.addEventListener('click', function () {
      // При α = 45° sin(90°) = 1 => L = v0^2 / 10 => v0 = sqrt(10 * L)
      cn.angle = 45;
      cn.velocity = Math.min(34, Math.max(10, Math.round(Math.sqrt(10 * cn.targetDist))));
      cn.lastFlight = '💡 <strong>Подсказка по формуле:</strong> при угле α = 45° величина sin(2α) = 1, поэтому v₀ = √(g·L) ≈ <strong>' + cn.velocity + ' м/с</strong>. Нажмите «🔥 Выстрел!»';
      renderActiveArcadeGameArena();
    });
  }
}

function drawCannonScene(progressRatio) {
  const canvas = document.getElementById('cannon-game-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const cn = state.arcadeRuntime.cannon;

  ctx.clearRect(0, 0, w, h);

  // Фон и сетка
  ctx.fillStyle = '#090414';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(168, 85, 247, 0.14)';
  ctx.lineWidth = 1;
  for (let gx = 40; gx < w; gx += 50) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, h - 36);
    ctx.stroke();
  }
  for (let gy = 30; gy < h - 36; gy += 45) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(w, gy);
    ctx.stroke();
  }

  // Земля и шкала метров (0..100 м)
  const groundY = h - 36;
  const originX = 48;
  const meterScale = (w - 80) / 100; // 100 метров на полигон

  ctx.fillStyle = '#1b0c36';
  ctx.fillRect(0, groundY, w, 36);
  ctx.strokeStyle = '#a855f7';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(w, groundY);
  ctx.stroke();

  ctx.fillStyle = '#c4b5fd';
  ctx.font = '11px Inter, sans-serif';
  for (let m = 0; m <= 100; m += 20) {
    const mx = originX + m * meterScale;
    ctx.fillText(m + 'м', mx - 10, groundY + 20);
  }

  // Мишень
  const targetX = originX + cn.targetDist * meterScale;
  ctx.fillStyle = 'rgba(244, 63, 94, 0.28)';
  ctx.beginPath();
  ctx.arc(targetX, groundY - 4, cn.targetRadius * meterScale, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#f43f5e';
  ctx.fillRect(targetX - 12, groundY - 8, 24, 8);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px Inter, sans-serif';
  ctx.fillText('🎯 ' + cn.targetDist + ' м', targetX - 22, groundY - 14);

  // Пушка в точке originX, groundY
  const rad = (cn.angle * Math.PI) / 180;
  ctx.save();
  ctx.translate(originX, groundY);
  ctx.rotate(-rad);
  ctx.fillStyle = '#c084fc';
  ctx.fillRect(0, -6, 32, 12);
  ctx.restore();

  ctx.fillStyle = '#9333ea';
  ctx.beginPath();
  ctx.arc(originX, groundY, 10, 0, Math.PI * 2);
  ctx.fill();

  // Предпросмотр направления или полёт ядра
  const g = 10;
  const v0 = cn.velocity;
  const totalTime = (2 * v0 * Math.sin(rad)) / g;

  if (typeof progressRatio === 'number') {
    const maxT = totalTime * progressRatio;
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const t = (maxT * i) / steps;
      const xMeters = v0 * Math.cos(rad) * t;
      const yMeters = v0 * Math.sin(rad) * t - 0.5 * g * t * t;
      const px = originX + xMeters * meterScale;
      const py = groundY - Math.max(0, yMeters) * meterScale * 1.3;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Ядро
    const curX = v0 * Math.cos(rad) * maxT;
    const curY = Math.max(0, v0 * Math.sin(rad) * maxT - 0.5 * g * maxT * maxT);
    const bx = originX + curX * meterScale;
    const by = groundY - curY * meterScale * 1.3;
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(bx, by, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function fireCannonShot() {
  const cn = state.arcadeRuntime.cannon;
  if (cn.animating) return;
  cn.animating = true;
  cn.shots += 1;

  const rad = (cn.angle * Math.PI) / 180;
  const g = 10;
  const flightDist = (cn.velocity * cn.velocity * Math.sin(2 * rad)) / g;
  const maxHeight = (cn.velocity * cn.velocity * Math.pow(Math.sin(rad), 2)) / (2 * g);
  const diff = Math.abs(flightDist - cn.targetDist);
  const isHit = diff <= cn.targetRadius;

  let frame = 0;
  const totalFrames = 28;
  const animId = setInterval(function () {
    frame += 1;
    drawCannonScene(frame / totalFrames);
    if (frame >= totalFrames) {
      clearInterval(animId);
      cn.animating = false;
      const arc = ensureArcadeState();
      if (isHit) {
        cn.hits += 1;
        cn.score += 25;
        if (cn.score > (arc.highScores.cannon || 0)) {
          arc.highScores.cannon = cn.score;
        }
        arc.coins = (arc.coins || 0) + 12;
        cn.lastFlight = '🎯 <strong>Точное попадание в цель!</strong> Дальность полёта составила <strong>' + flightDist.toFixed(1) + ' м</strong> (мишень: ' + cn.targetDist + ' м), макс. высота H = ' + maxHeight.toFixed(1) + ' м. Начислено <strong>+12 ⚡ баллов</strong>!';
        cn.targetDist = Math.floor(20 + Math.random() * 72);
        saveProgress();
        renderArcadeDashboard();
        showToast('🎯 Попадание в яблочко! +12 ⚡ баллов Angel’s Squad!', 'success');
      } else {
        const hint = flightDist < cn.targetDist ? 'Недолёт! Увеличьте скорость v₀ или приблизьте угол к 45°.' : 'Перелёт! Уменьшите начальную скорость v₀ или измените угол α.';
        cn.lastFlight = '💥 Снаряд упал на отметке <strong>' + flightDist.toFixed(1) + ' м</strong> (мишень на ' + cn.targetDist + ' м, промах ' + diff.toFixed(1) + ' м). ' + hint;
      }
      const fb = document.getElementById('cannon-flight-feedback');
      if (fb) fb.innerHTML = cn.lastFlight;
    }
  }, 22);
}

// --- ИГРА 3: АЛГЕБРАИЧЕСКИЙ РЕАКТОР ФИПИ: ОХОТА НА ЛОВУШКИ ФИПИ ---
const REACTOR_QUESTIONS_BANK = [
  {
    statement: 'Любой прямоугольник можно вписать в окружность, причём центром окружности является точка пересечения его диагоналей.',
    isTrue: true,
    explanation: 'Верно! Сумма противоположных углов прямоугольника равна 90° + 90° = 180°, поэтому около него всегда можно описать окружность (Задание №19).'
  },
  {
    statement: 'Диагонали любого параллелограмма равны между собой.',
    isTrue: false,
    explanation: 'Ловушка №19! Диагонали параллелограмма точкой пересечения делятся пополам, но равны они только у прямоугольника и квадрата.'
  },
  {
    statement: 'Если сторона клетки на плане участка равна 2 м, то площадь участка из 15 клеток равна 30 м².',
    isTrue: false,
    explanation: 'Коварная ловушка №1–5! Площадь одной клетки со стороной 2 м равна 2 · 2 = 4 м², поэтому 15 клеток имеют площадь 15 · 4 = 60 м².'
  },
  {
    statement: 'В прямоугольном треугольнике медиана, проведённая к гипотенузе, равна половине гипотенузы.',
    isTrue: true,
    explanation: 'Верно! Центр описанной окружности прямоугольного треугольника лежит на середине гипотенузы, поэтому m_c = R = c / 2.'
  },
  {
    statement: 'При делении обеих частей неравенства −4x > 20 на −4 получается неравенство x > −5.',
    isTrue: false,
    explanation: 'Ловушка №13! При делении или умножении неравенства на отрицательное число знак неравенства обязательно меняется на противоположный: x < −5.'
  },
  {
    statement: 'Отношение площадей двух подобных треугольников равно квадрату коэффициента подобия (S₁ / S₂ = k²).',
    isTrue: true,
    explanation: 'Верно! Линейные элементы относятся как k, а площади подобных фигур — как k².'
  },
  {
    statement: 'Вписанный угол, опирающийся на диаметр окружности, всегда равен 90° (прямой).',
    isTrue: true,
    explanation: 'Верно! Диаметр отсекает дугу 180°, а вписанный угол равен половине дуги: 180° / 2 = 90°.'
  },
  {
    statement: 'Если первую половину пути автомобиль ехал со скоростью 60 км/ч, а вторую — 90 км/ч, то его средняя скорость равна 75 км/ч.',
    isTrue: false,
    explanation: 'Ловушка №21! Средняя скорость — это весь путь, делённый на всё время: 2S / (S/60 + S/90) = 72 км/ч, а не среднее арифметическое!'
  },
  {
    statement: 'Касательная к окружности перпендикулярна радиусу, проведённому в точку касания.',
    isTrue: true,
    explanation: 'Верно! Угол между касательной и радиусом в точке касания всегда равен 90° (Задание №16 и №19).'
  },
  {
    statement: 'В четырёхугольник можно вписать окружность тогда и только тогда, когда суммы его противоположных сторон равны (a + c = b + d).',
    isTrue: true,
    explanation: 'Верно! Это фундаментальное свойство описанного четырёхугольника для заданий №16 и №25.'
  }
];

function startReactorGame() {
  const rc = state.arcadeRuntime.reactor;
  rc.running = true;
  rc.lives = 3;
  rc.score = 0;
  rc.streak = 0;
  rc.qIndex = 0;
  rc.answeredCurrent = false;
  rc.deck = REACTOR_QUESTIONS_BANK.slice().sort(function () { return Math.random() - 0.5; });
  renderActiveArcadeGameArena();
}

function answerReactorQuestion(userChoiceTrue) {
  const rc = state.arcadeRuntime.reactor;
  if (!rc.running || rc.answeredCurrent) return;
  const curQ = rc.deck[rc.qIndex];
  if (!curQ) return;

  rc.answeredCurrent = true;
  const isRight = Boolean(userChoiceTrue) === Boolean(curQ.isTrue);
  if (isRight) {
    rc.streak += 1;
    rc.score += 15 + rc.streak * 3;
  } else {
    rc.lives -= 1;
    rc.streak = 0;
  }

  renderActiveArcadeGameArena();

  const fbBox = document.getElementById('reactor-feedback-box');
  if (fbBox) {
    fbBox.classList.remove('hidden');
    fbBox.style.background = isRight ? 'var(--success-bg)' : 'var(--danger-bg)';
    fbBox.style.borderColor = isRight ? 'var(--success)' : 'var(--danger)';
    fbBox.innerHTML = (
      '<div class="font-extrabold text-sm mb-1" style="color: ' + (isRight ? 'var(--success)' : 'var(--danger)') + ';">' +
        (isRight ? '✅ Точно! Щит реактора усилен (+' + (15 + rc.streak * 3) + ' очк.)' : '🚨 Ошибка! Сработала ловушка ФИПИ (-1 заряд щита)') +
      '</div>' +
      '<div class="text-xs sm:text-sm">' + curQ.explanation + '</div>'
    );
  }
}

function nextReactorQuestion() {
  const rc = state.arcadeRuntime.reactor;
  if (rc.lives <= 0 || rc.qIndex >= rc.deck.length - 1) {
    rc.running = false;
    const arc = ensureArcadeState();
    if (rc.score > (arc.highScores.reactor || 0)) {
      arc.highScores.reactor = rc.score;
    }
    const reward = Math.max(4, Math.floor(rc.score / 12));
    arc.coins = (arc.coins || 0) + reward;
    saveProgress();
    renderArcadeSection();
    showToast('🔮 Раунд в Алгебраическом реакторе завершён! Счёт: ' + rc.score + ' очк. (+' + reward + ' ⚡ баллов)', 'success');
    return;
  }
  rc.qIndex += 1;
  rc.answeredCurrent = false;
  renderActiveArcadeGameArena();
}

function renderReactorGameArena(arena) {
  const rc = state.arcadeRuntime.reactor;
  const arc = ensureArcadeState();
  const curQ = (rc.running && rc.deck[rc.qIndex]) ? rc.deck[rc.qIndex] : null;
  const hearts = '❤️'.repeat(Math.max(0, rc.lives)) + '🖤'.repeat(Math.max(0, 3 - rc.lives));

  arena.innerHTML = (
    '<div class="surface-card p-6 space-y-5">' +
      '<div class="flex flex-wrap items-center justify-between gap-3 border-b pb-4" style="border-color: var(--border-color);">' +
        '<div>' +
          '<span class="text-xs font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full angels-squad-badge">🔮 Мини-игра 3 • Angel’s Squad Reactor</span>' +
          '<h3 class="text-xl sm:text-2xl font-black mt-1.5">Алгебраический реактор ФИПИ: Правда или Ловушка ФИПИ?</h3>' +
        '</div>' +
        '<div class="flex flex-wrap items-center gap-3">' +
          '<div class="px-3.5 py-2 rounded-xl border text-center" style="background: var(--bg-muted); border-color: var(--border-color);">' +
            '<div class="text-[10px] uppercase font-bold" style="color: var(--text-secondary);">Щиты реактора</div>' +
            '<div class="text-base font-black">' + hearts + '</div>' +
          '</div>' +
          '<div class="px-3.5 py-2 rounded-xl border text-center" style="background: var(--bg-muted); border-color: var(--border-color);">' +
            '<div class="text-[10px] uppercase font-bold" style="color: var(--text-secondary);">Энергия (Счёт)</div>' +
            '<div class="text-lg font-black" style="color: var(--accent);">' + rc.score + ' очк.</div>' +
          '</div>' +
          '<button type="button" id="reactor-start-btn" class="btn-primary text-xs sm:text-sm py-2.5 px-4">' +
            (rc.running ? '🔄 Перезапуск' : '🔮 Запустить реактор') +
          '</button>' +
        '</div>' +
      '</div>' +

      (!rc.running || !curQ
        ? '<div class="p-6 rounded-2xl border text-center space-y-3" style="background: var(--bg-muted); border-color: var(--border-color);">' +
            '<div class="text-3xl">🔮⚡🛡</div>' +
            '<h4 class="text-lg font-extrabold">Обезвредьте 10 главных ловушек ОГЭ по математике и утверждений №19</h4>' +
            '<p class="text-xs sm:text-sm max-w-xl mx-auto" style="color: var(--text-secondary);">На каждом шаге реактор проверяет одно утверждение из задания №19, правил ОДЗ, площадей подобных фигур и формул алгебры. Отличайте истину от ловушек ФИПИ! Ваш рекорд: <strong>' + (arc.highScores.reactor || 0) + ' очков</strong>.</p>' +
            '<button type="button" id="reactor-cta-start-btn" class="btn-primary py-3 px-6 text-sm">🔮 Начать смену на Алгебраическом реакторе</button>' +
          '</div>'
        : '<div class="space-y-4">' +
            '<div class="p-5 rounded-2xl border space-y-2" style="background: var(--bg-muted); border-color: var(--accent);">' +
              '<div class="flex items-center justify-between text-xs font-bold" style="color: var(--accent);">' +
                '<span>Импульс №' + (rc.qIndex + 1) + ' из ' + rc.deck.length + '</span>' +
                '<span>Серия верных ответов: 🔥 ' + rc.streak + '</span>' +
              '</div>' +
              '<p class="text-base sm:text-lg font-extrabold leading-relaxed">«' + curQ.statement + '»</p>' +
            '</div>' +
            '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
              '<button type="button" id="reactor-true-btn" ' + (rc.answeredCurrent ? 'disabled style="opacity:0.55;"' : '') + ' class="game-option-btn p-4 rounded-xl font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 cursor-pointer" style="color: var(--success);">' +
                '<span>✅ Это ПРАВДА (Стабилизировать)</span>' +
              '</button>' +
              '<button type="button" id="reactor-false-btn" ' + (rc.answeredCurrent ? 'disabled style="opacity:0.55;"' : '') + ' class="game-option-btn p-4 rounded-xl font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 cursor-pointer" style="color: var(--danger);">' +
                '<span>🚨 Это ЛОВУШКА ФИПИ (Отразить)</span>' +
              '</button>' +
            '</div>' +
            '<div id="reactor-feedback-box" class="hidden p-4 rounded-xl border"></div>' +
            (rc.answeredCurrent
              ? '<div class="flex justify-end"><button type="button" id="reactor-next-btn" class="btn-primary text-sm py-2.5 px-5">' + ((rc.lives <= 0 || rc.qIndex >= rc.deck.length - 1) ? '🏁 Завершить и забрать ⚡ баллы' : 'Следующий импульс &rarr;') + '</button></div>'
              : '') +
          '</div>') +
    '</div>'
  );

  const startBtn = document.getElementById('reactor-start-btn');
  const ctaBtn = document.getElementById('reactor-cta-start-btn');
  if (startBtn) startBtn.addEventListener('click', startReactorGame);
  if (ctaBtn) ctaBtn.addEventListener('click', startReactorGame);

  const trueBtn = document.getElementById('reactor-true-btn');
  const falseBtn = document.getElementById('reactor-false-btn');
  const nextBtn = document.getElementById('reactor-next-btn');
  if (trueBtn) trueBtn.addEventListener('click', function () { answerReactorQuestion(true); });
  if (falseBtn) falseBtn.addEventListener('click', function () { answerReactorQuestion(false); });
  if (nextBtn) nextBtn.addEventListener('click', nextReactorQuestion);
}

function openRandomUnviewedFormulaBreakdown() {
  if (!state.data || !state.data.referenceFormulas || !state.data.referenceFormulas.length) return;
  const arc = ensureArcadeState();
  const unviewed = state.data.referenceFormulas.filter(function (f) {
    return !arc.viewedFormulas[f.id];
  });
  const pool = unviewed.length > 0 ? unviewed : state.data.referenceFormulas;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  showFormulaDeepDiveModal(pick);
}

// ---------------------------------------------------------------------------
// ПРИВЯЗКА ВСЕХ ОБРАБОТЧИКОВ СОБЫТИЙ
// ---------------------------------------------------------------------------
function bindEvents() {
  // Переключатель темы
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

  // Мобильное меню
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const mobileMenuPanel = document.getElementById('mobile-menu-panel');
  if (mobileMenuBtn && mobileMenuPanel) {
    mobileMenuBtn.addEventListener('click', function () {
      mobileMenuPanel.classList.toggle('hidden');
    });
    mobileMenuPanel.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        mobileMenuPanel.classList.add('hidden');
      });
    });
  }

  // Вкладки внутри карточки теории (Формулы / Определения / Типичные ошибки)
  document.querySelectorAll('.theory-subtab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.activeTheoryTab = btn.getAttribute('data-theory-tab');
      renderActiveTheoryCard();
    });
  });

  // Кнопка «Тренировать эту тему» внутри блока теории
  const trainTopicBtn = document.getElementById('train-active-topic-btn');
  if (trainTopicBtn) {
    trainTopicBtn.addEventListener('click', function () {
      state.trainerFilter.topic = state.activeTheoryTopic;
      syncTrainerFilterControls();
      applyTrainerFilters(true);
      const trainerSec = document.getElementById('trainer');
      if (trainerSec) trainerSec.scrollIntoView({ behavior: 'smooth' });
      showToast('Фильтр тренажёра переключён на тему «' + topicTitleById(state.activeTheoryTopic) + '»', 'success');
    });
  }

  // Фильтры тренажёра
  const topicSel = document.getElementById('filter-topic-select');
  const diffSel = document.getElementById('filter-difficulty-select');
  const partSel = document.getElementById('filter-part-select');
  const unsolvedChk = document.getElementById('filter-unsolved-checkbox');

  if (topicSel) {
    topicSel.addEventListener('change', function () {
      state.trainerFilter.topic = topicSel.value;
      applyTrainerFilters(true);
    });
  }
  if (diffSel) {
    diffSel.addEventListener('change', function () {
      state.trainerFilter.difficulty = diffSel.value;
      applyTrainerFilters(true);
    });
  }
  if (partSel) {
    partSel.addEventListener('change', function () {
      state.trainerFilter.part = partSel.value;
      applyTrainerFilters(true);
    });
  }
  if (unsolvedChk) {
    unsolvedChk.addEventListener('change', function () {
      state.trainerFilter.onlyUnsolved = unsolvedChk.checked;
      applyTrainerFilters(true);
    });
  }

  // Поиск и фильтрация справочника формул
  const formulaSearchInput = document.getElementById('formula-search-input');
  const formulaTopicSelect = document.getElementById('formula-topic-select');
  if (formulaSearchInput) {
    formulaSearchInput.addEventListener('input', function () {
      state.formulaSearch = formulaSearchInput.value;
      renderFormulaTable();
    });
  }
  if (formulaTopicSelect) {
    formulaTopicSelect.addEventListener('change', function () {
      state.formulaTopicFilter = formulaTopicSelect.value;
      renderFormulaTable();
    });
  }

  // Кнопки запуска и управления пробным вариантом ОГЭ
  const startExamBtn = document.getElementById('start-exam-btn');
  const heroExamBtn = document.getElementById('hero-start-exam-btn');
  const pauseExamBtn = document.getElementById('pause-exam-btn');
  const finishExamBtn = document.getElementById('finish-exam-btn');

  if (startExamBtn) startExamBtn.addEventListener('click', startMockExam);

  const quickLaunchPresetBtn = document.getElementById('quick-launch-preset-btn');
  const quickPresetSelect = document.getElementById('quick-preset-variant-select');
  if (quickLaunchPresetBtn && quickPresetSelect) {
    quickLaunchPresetBtn.addEventListener('click', function () {
      startPresetVariant(quickPresetSelect.value || 'var_1');
    });
  }

  const catalogSearchInput = document.getElementById('variant-catalog-search');
  if (catalogSearchInput) {
    catalogSearchInput.addEventListener('input', function () {
      state.variantCatalogFilter.search = catalogSearchInput.value;
      renderVariantCatalog();
    });
  }

  const catalogUnsolvedChk = document.getElementById('variant-catalog-unsolved-only');
  if (catalogUnsolvedChk) {
    catalogUnsolvedChk.addEventListener('change', function () {
      state.variantCatalogFilter.onlyUnsolved = catalogUnsolvedChk.checked;
      renderVariantCatalog();
    });
  }

  document.querySelectorAll('.variant-cat-tab').forEach(function (tabBtn) {
    tabBtn.addEventListener('click', function () {
      document.querySelectorAll('.variant-cat-tab').forEach(function (b) { b.classList.remove('active'); });
      tabBtn.classList.add('active');
      state.variantCatalogFilter.category = tabBtn.getAttribute('data-variant-cat') || 'all';
      renderVariantCatalog();
    });
  });
  if (heroExamBtn) {
    heroExamBtn.addEventListener('click', function () {
      const examSec = document.getElementById('exam');
      if (examSec) examSec.scrollIntoView({ behavior: 'smooth' });
      startMockExam();
    });
  }
  if (pauseExamBtn) {
    pauseExamBtn.addEventListener('click', function () {
      state.exam.paused = !state.exam.paused;
      pauseExamBtn.textContent = state.exam.paused ? '▶️ Продолжить' : '⏸ Пауза';
      showToast(state.exam.paused ? 'Таймер поставлен на паузу.' : 'Отсчёт времени возобновлён.', 'warning');
    });
  }
  if (finishExamBtn) {
    finishExamBtn.addEventListener('click', finishMockExam);
  }

  // Модальное окно сброса прогресса (вместо confirm())
  const openResetModalBtn = document.getElementById('open-reset-modal-btn');
  const resetModal = document.getElementById('reset-progress-modal');
  const cancelResetBtn = document.getElementById('cancel-reset-btn');
  const confirmResetBtn = document.getElementById('confirm-reset-btn');

  if (openResetModalBtn && resetModal) {
    openResetModalBtn.addEventListener('click', function () {
      resetModal.classList.remove('hidden');
    });
  }
  if (cancelResetBtn && resetModal) {
    cancelResetBtn.addEventListener('click', function () {
      resetModal.classList.add('hidden');
    });
  }
  if (confirmResetBtn && resetModal) {
    confirmResetBtn.addEventListener('click', function () {
      state.progress = {
        solvedIds: {},
        attemptsByTopic: {},
        examHistory: [],
        solvedVariants: {},
        arcade: {
          coins: 20,
          totalVariantPoints: 0,
          viewedFormulas: {},
          unlockedGames: { sprint: true, cannon: false, reactor: false },
          highScores: { sprint: 0, cannon: 0, reactor: 0 }
        }
      };
      saveProgress();
      renderAll();
      resetModal.classList.add('hidden');
      showToast('Статистика и история пробников очищены.', 'warning');
    });
  }

  // Модальное окно добавления новой задачи в базу
  const openAddTaskBtn = document.getElementById('open-add-task-modal-btn');
  const addTaskModal = document.getElementById('add-task-modal');
  const closeAddTaskBtn = document.getElementById('close-add-task-modal-btn');
  const saveNewTaskBtn = document.getElementById('save-new-task-btn');

  if (openAddTaskBtn && addTaskModal) {
    openAddTaskBtn.addEventListener('click', function () {
      addTaskModal.classList.remove('hidden');
    });
  }
  if (closeAddTaskBtn && addTaskModal) {
    closeAddTaskBtn.addEventListener('click', function () {
      addTaskModal.classList.add('hidden');
    });
  }
  if (saveNewTaskBtn && addTaskModal) {
    saveNewTaskBtn.addEventListener('click', function () {
      const qEl = document.getElementById('new-task-question');
      const ansEl = document.getElementById('new-task-answer');
      const unitEl = document.getElementById('new-task-unit');
      const expEl = document.getElementById('new-task-explanation');
      const topEl = document.getElementById('new-task-topic');
      const diffEl = document.getElementById('new-task-difficulty');

      if (!qEl || !ansEl || !qEl.value.trim() || !ansEl.value.trim()) {
        showToast('Заполните текст условия задачи и правильный ответ!', 'warning');
        return;
      }

      const diffMap = { easy: 'Базовый', medium: 'Повышенный', hard: 'Высокий' };
      const newTask = {
        id: 'custom_' + Date.now(),
        part: 1,
        ogeNumber: 6,
        topic: topEl ? topEl.value : 'practical',
        topicName: topicTitleById(topEl ? topEl.value : 'practical'),
        difficulty: diffEl ? diffEl.value : 'easy',
        difficultyName: diffMap[diffEl ? diffEl.value : 'easy'] || 'Базовый',
        points: 1,
        type: 'numeric',
        unit: unitEl ? unitEl.value.trim() : '',
        question: qEl.value.trim(),
        answer: ansEl.value.trim(),
        explanation: (expEl && expEl.value.trim()) ? expEl.value.trim() : 'Задача добавлена пользователем.'
      };

      state.data.tasks.push(newTask);
      const customList = safeGetStorage(CUSTOM_TASKS_KEY, []);
      customList.push(newTask);
      safeSetStorage(CUSTOM_TASKS_KEY, customList);

      qEl.value = '';
      ansEl.value = '';
      if (unitEl) unitEl.value = '';
      if (expEl) expEl.value = '';
      addTaskModal.classList.add('hidden');
      renderAll();
      showToast('Новая задача добавлена в тренажёр!', 'success');
    });
  }

  // Скачивание tasks.json
  const downloadJsonBtn = document.getElementById('download-json-btn');
  const footerDownloadJsonBtn = document.getElementById('footer-download-json-btn');
  if (downloadJsonBtn) downloadJsonBtn.addEventListener('click', downloadTasksJson);
  if (footerDownloadJsonBtn) footerDownloadJsonBtn.addEventListener('click', downloadTasksJson);

  // Спец кнопка Чёрно-фиолетовой темы (Angel’s Squad)
  const bpThemeBtn = document.getElementById('black-purple-theme-btn');
  if (bpThemeBtn) bpThemeBtn.addEventListener('click', activateBlackPurpleTheme);

  // Кнопки рандомайзера вариантов ОГЭ
  const randSeedBtn = document.getElementById('randomize-seed-btn');
  if (randSeedBtn) {
    randSeedBtn.addEventListener('click', function () {
      const code = generateRandomVariantCode();
      showToast('🎲 Сгенерирован новый код варианта: ' + code, 'success');
    });
  }
  const quickRandExamBtn = document.getElementById('quick-random-exam-btn');
  if (quickRandExamBtn) {
    quickRandExamBtn.addEventListener('click', function () {
      generateRandomVariantCode();
      startMockExam();
    });
  }
  const demoAutofillBtn = document.getElementById('exam-demo-autofill-btn');
  if (demoAutofillBtn) {
    demoAutofillBtn.addEventListener('click', autofillExamDemoAnswers);
  }

  // Закрытие модального окна фулл разбора формулы
  const closeFormulaModalBtn = document.getElementById('close-formula-modal-btn');
  const formulaModal = document.getElementById('formula-detail-modal');
  if (closeFormulaModalBtn && formulaModal) {
    closeFormulaModalBtn.addEventListener('click', function () {
      formulaModal.classList.add('hidden');
    });
    formulaModal.addEventListener('click', function (e) {
      if (e.target === formulaModal) formulaModal.classList.add('hidden');
    });
  }

  // Кнопки Игровой зоны Angel's Squad Arcade
  const randomFormulaBtn = document.getElementById('arcade-random-formula-btn');
  if (randomFormulaBtn) {
    randomFormulaBtn.addEventListener('click', openRandomUnviewedFormulaBreakdown);
  }
  const boostArcadeBtn = document.getElementById('arcade-claim-boost-btn');
  if (boostArcadeBtn) {
    boostArcadeBtn.addEventListener('click', function () {
      const arc = ensureArcadeState();
      arc.coins = (arc.coins || 0) + 100;
      arc.unlockedGames.sprint = true;
      arc.unlockedGames.cannon = true;
      arc.unlockedGames.reactor = true;
      saveProgress();
      renderArcadeSection();
      showToast('🎁 Начислено +100 ⚡ баллов Angel’s Squad и разблокированы все 3 мини-игры!', 'success');
    });
  }
}

window.addEventListener('DOMContentLoaded', function () {
  initTheme();
  bindEvents();
  loadAppData();
});

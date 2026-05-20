const state = {
  categories: ['売上', '開発', '顧客満足'],
  selectedCategory: '売上',
  selectedId: null,
  items: [
    { id: 1, category: '売上', title: 'MRR 目標達成率', progress: 72, memo: '今月は商談数が増加' },
    { id: 2, category: '売上', title: '新規契約件数', progress: 58, memo: '中旬に大型案件予定' },
    { id: 3, category: '開発', title: 'スプリント完了率', progress: 83, memo: 'バグ対応で微調整' },
  ],
};

const refs = {
  categoryList: document.getElementById('categoryList'),
  boardTitle: document.getElementById('boardTitle'),
  kpiCards: document.getElementById('kpiCards'),
  kpiForm: document.getElementById('kpiForm'),
  titleInput: document.getElementById('titleInput'),
  progressInput: document.getElementById('progressInput'),
  memoInput: document.getElementById('memoInput'),
  addKpiBtn: document.getElementById('addKpiBtn'),
  deleteBtn: document.getElementById('deleteBtn'),
};

function renderCategories() {
  refs.categoryList.innerHTML = '';
  state.categories.forEach((category) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.textContent = category;
    btn.style.borderColor = state.selectedCategory === category ? '#3b82f6' : '#374151';
    btn.onclick = () => {
      state.selectedCategory = category;
      state.selectedId = null;
      render();
    };
    li.appendChild(btn);
    refs.categoryList.appendChild(li);
  });
}

function renderCards() {
  refs.boardTitle.textContent = `${state.selectedCategory} KPI一覧`;
  const rows = state.items.filter((item) => item.category === state.selectedCategory);
  refs.kpiCards.innerHTML = '';
  rows.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'kpi-card';
    card.innerHTML = `
      <strong>${item.title}</strong>
      <div class="muted">進捗: ${item.progress}%</div>
      <div class="progress"><span style="width:${item.progress}%"></span></div>
      <p>${item.memo || ''}</p>
    `;
    card.onclick = () => {
      state.selectedId = item.id;
      fillForm(item);
    };
    refs.kpiCards.appendChild(card);
  });
}

function fillForm(item) {
  refs.titleInput.value = item?.title || '';
  refs.progressInput.value = item?.progress ?? '';
  refs.memoInput.value = item?.memo || '';
}

function selectedItem() {
  return state.items.find((item) => item.id === state.selectedId) || null;
}

refs.kpiForm.onsubmit = (e) => {
  e.preventDefault();
  const title = refs.titleInput.value.trim();
  const progress = Number(refs.progressInput.value);
  const memo = refs.memoInput.value.trim();

  if (!title || Number.isNaN(progress)) return;

  const current = selectedItem();
  if (current) {
    current.title = title;
    current.progress = progress;
    current.memo = memo;
  } else {
    state.items.push({
      id: Date.now(),
      category: state.selectedCategory,
      title,
      progress,
      memo,
    });
  }
  renderCards();
  fillForm(selectedItem());
};

refs.addKpiBtn.onclick = () => {
  state.selectedId = null;
  fillForm(null);
};

refs.deleteBtn.onclick = () => {
  if (!state.selectedId) return;
  state.items = state.items.filter((item) => item.id !== state.selectedId);
  state.selectedId = null;
  fillForm(null);
  renderCards();
};

function render() {
  renderCategories();
  renderCards();
  fillForm(selectedItem());
}

render();

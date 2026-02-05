const API_URL = 'https://api.escuelajs.co/api/v1/products';

const tableBody = document.querySelector('#products-table tbody');
const loading = document.getElementById('loading');
const alertBox = document.getElementById('alert');
const searchInput = document.getElementById('search-input');
const pageSizeSelect = document.getElementById('page-size-select');
const paginationEl = document.getElementById('pagination');
const pageInfo = document.getElementById('page-info');

let allProducts = [];
let debounceTimer = null;
let currentPage = 1;
let pageSize = parseInt(pageSizeSelect?.value || 10, 10);
let sortField = null; // 'title' or 'price'
let sortDir = null; // 'asc' | 'desc' | null
let lastRenderedItems = [];

function showAlert(msg, type='danger'){
  alertBox.className = `alert alert-${type}`;
  alertBox.textContent = msg;
  alertBox.classList.remove('d-none');
}

// Sort button handling: click to toggle sort for title/price
document.addEventListener('click', (ev) => {
  const btn = ev.target.closest('.sort-btn');
  if(!btn) return;
  const field = btn.getAttribute('data-sort');
  if(!field) return;
  // toggle: null -> asc -> desc -> null
  if(sortField !== field){
    sortField = field; sortDir = 'asc';
  } else if(sortDir === 'asc'){
    sortDir = 'desc';
  } else {
    sortField = null; sortDir = null;
  }
  currentPage = 1;
  renderSortIndicators();
  const filtered = filterByTitle(searchInput?.value || '');
  renderProducts(filtered);
});

function renderSortIndicators(){
  const buttons = document.querySelectorAll('.sort-btn');
  buttons.forEach(b =>{
    const f = b.getAttribute('data-sort');
    if(f === sortField){
      b.textContent = sortDir === 'asc' ? '↑' : (sortDir === 'desc' ? '↓' : '↕');
      b.classList.add('active');
    } else {
      b.textContent = '↕';
      b.classList.remove('active');
    }
  });
}
function hideAlert(){ alertBox.classList.add('d-none'); }

async function fetchProducts(){
  try{
    const res = await fetch(API_URL);
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const products = await res.json();
    allProducts = products;
    currentPage = 1;
    renderProducts(allProducts);
  }catch(err){
    showAlert('Lỗi khi tải dữ liệu: ' + err.message);
  }finally{
    loading.style.display = 'none';
  }
}

function renderProducts(products){
  tableBody.innerHTML = '';
  // apply sorting to a working copy
  let working = products ? products.slice() : [];
  if(sortField && sortDir){
    working.sort((a,b)=>{
      const av = a[sortField];
      const bv = b[sortField];
      if(sortField === 'title'){
        const sa = String(av ?? '').toLowerCase();
        const sb = String(bv ?? '').toLowerCase();
        if(sa < sb) return sortDir === 'asc' ? -1 : 1;
        if(sa > sb) return sortDir === 'asc' ? 1 : -1;
        return 0;
      } else { // price
        const na = Number(av) || 0;
        const nb = Number(bv) || 0;
        return sortDir === 'asc' ? na - nb : nb - na;
      }
    });
  }

  const total = working ? working.length : 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if(currentPage > totalPages) currentPage = totalPages;
  const startIndex = (currentPage - 1) * pageSize;
  const pageItems = working.slice(startIndex, startIndex + pageSize);

  if(!pageItems || pageItems.length === 0){
    const trEmpty = document.createElement('tr');
    trEmpty.innerHTML = '<td colspan="5" class="text-center">No results</td>';
    tableBody.appendChild(trEmpty);
  } else {
    pageItems.forEach(p =>{
        const tr = document.createElement('tr');
        tr.setAttribute('data-id', p.id);
        tr.classList.add('clickable-row');
      const idTd = `<td>${p.id ?? ''}</td>`;
      const titleTd = `<td class="title-cell">${escapeHtml(p.title ?? '')}</td>`;
      const priceTd = `<td>${p.price != null ? p.price : ''}</td>`;
      const categoryName = p.category && (p.category.name || p.category) ? (typeof p.category === 'object' ? escapeHtml(p.category.name || '') : escapeHtml(p.category)) : '';
      const categoryTd = `<td>${categoryName}</td>`;
      let imagesHtml = '<td class="images-cell">';
      if(Array.isArray(p.images) && p.images.length){
        imagesHtml += p.images.slice(0,3).map(url => `<a href="${url}" target="_blank" rel="noopener noreferrer"><img src="${url}" class="thumb" alt=""></a>`).join('');
      }
      imagesHtml += '</td>';
      tr.innerHTML = idTd + titleTd + priceTd + categoryTd + imagesHtml;

      const desc = p.description ?? '';
      if(desc){
        tr.setAttribute('data-bs-toggle', 'tooltip');
        tr.setAttribute('data-bs-placement', 'top');
        tr.setAttribute('title', desc);
      }

      tableBody.appendChild(tr);
    });
  }

  // store last rendered page items for export / detail lookup
  lastRenderedItems = pageItems;

  initTooltips();
  renderPagination(total, totalPages, currentPage);
  if(pageInfo){
    const showingFrom = total === 0 ? 0 : startIndex + 1;
    const showingTo = Math.min(total, startIndex + pageItems.length);
    pageInfo.textContent = `Showing ${showingFrom}-${showingTo} of ${total}`;
  }
}

// Export current view (visible rows) to CSV
const exportBtn = document.getElementById('export-csv');
if(exportBtn){
  exportBtn.addEventListener('click', () => {
    const items = lastRenderedItems || [];
    if(!items.length){
      showAlert('No data to export', 'warning');
      return;
    }
    const rows = items.map(p => ({
      id: p.id ?? '',
      title: p.title ?? '',
      price: p.price ?? '',
      category: (p.category && (p.category.name || p.category)) ? (typeof p.category === 'object' ? p.category.name : p.category) : '',
      images: Array.isArray(p.images) ? p.images.join(' | ') : ''
    }));
    const header = ['id','title','price','category','images'];
    const csv = [header.join(',')].concat(rows.map(r => header.map(h => '"' + String((r[h] ?? '')).replace(/"/g,'""') + '"').join(','))).join('\n');
    const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `products_page_${currentPage}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
}

// Row click -> open detail modal
if(tableBody){
  tableBody.addEventListener('click', (ev) => {
    const tr = ev.target.closest('tr');
    if(!tr) return;
    const id = tr.getAttribute('data-id') || tr.dataset.id;
    if(!id) return;
    openDetailModal(Number(id));
  });
}

// Open detail modal and populate
function openDetailModal(id){
  const item = (allProducts || []).find(p => Number(p.id) === Number(id)) || (lastRenderedItems || []).find(p => Number(p.id) === Number(id));
  if(!item){ showAlert('Item not found', 'warning'); return; }
  document.getElementById('detail-id').value = item.id || '';
  document.getElementById('detail-title').value = item.title || '';
  document.getElementById('detail-price').value = item.price ?? '';
  document.getElementById('detail-description').value = item.description || '';
  // category may be object or id
  document.getElementById('detail-category').value = item.category && item.category.id ? item.category.id : (item.category || '');
  document.getElementById('detail-images').value = Array.isArray(item.images) ? item.images.join(',') : (item.images || '');
  // ensure modal shown
  const modalEl = document.getElementById('detailModal');
  const modal = new bootstrap.Modal(modalEl);
  renderSortIndicators();
  // disable form inputs by default
  setDetailEditable(false);
  modal.show();
}

function setDetailEditable(editable){
  ['detail-title','detail-price','detail-description','detail-category','detail-images'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.disabled = !editable;
  });
  const saveBtn = document.getElementById('detail-save');
  const editBtn = document.getElementById('detail-edit');
  if(saveBtn) saveBtn.classList.toggle('d-none', !editable);
  if(editBtn) editBtn.classList.toggle('d-none', editable);
}

// Edit / Save handlers inside detail modal
const detailEditBtn = document.getElementById('detail-edit');
if(detailEditBtn){
  detailEditBtn.addEventListener('click', ()=> setDetailEditable(true));
}
const detailSaveBtn = document.getElementById('detail-save');
if(detailSaveBtn){
  detailSaveBtn.addEventListener('click', async ()=>{
    const id = document.getElementById('detail-id').value;
    const payload = {
      title: document.getElementById('detail-title').value,
      price: Number(document.getElementById('detail-price').value) || 0,
      description: document.getElementById('detail-description').value,
      categoryId: Number(document.getElementById('detail-category').value) || undefined,
      images: document.getElementById('detail-images').value.split(',').map(s=>s.trim()).filter(Boolean)
    };
    try{
      const res = await fetch(`${API_URL}/${id}`, {
        method: 'PUT',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      showAlert('Updated successfully', 'success');
      // refresh data
      fetchProducts();
      const modalEl = document.getElementById('detailModal');
      bootstrap.Modal.getInstance(modalEl).hide();
    }catch(err){
      showAlert('Update failed: ' + err.message);
    }
  });
}

// Create item handling
const createSubmit = document.getElementById('create-submit');
if(createSubmit){
  createSubmit.addEventListener('click', async ()=>{
    const payload = {
      title: document.getElementById('create-title').value,
      price: Number(document.getElementById('create-price').value) || 0,
      description: document.getElementById('create-description').value,
      categoryId: Number(document.getElementById('create-category').value) || 1,
      images: document.getElementById('create-images').value.split(',').map(s=>s.trim()).filter(Boolean)
    };
    try{
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      showAlert('Created successfully', 'success');
      fetchProducts();
      const modalEl = document.getElementById('createModal');
      bootstrap.Modal.getInstance(modalEl).hide();
      // clear form
      ['create-title','create-price','create-description','create-category','create-images'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
    }catch(err){
      showAlert('Create failed: ' + err.message);
    }
  });
}

function filterByTitle(query){
  if(!query) return allProducts;
  const q = query.trim().toLowerCase();
  return allProducts.filter(p => (p.title || '').toLowerCase().includes(q));
}

// Live search with debounce
if(searchInput){
  searchInput.addEventListener('input', (e) => {
    const q = e.target.value;
    if(debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(()=>{
      currentPage = 1;
      const filtered = filterByTitle(q);
      renderProducts(filtered);
    }, 200);
  });
}

if(pageSizeSelect){
  pageSizeSelect.addEventListener('change', (e) => {
    const v = parseInt(e.target.value, 10) || 10;
    pageSize = v;
    currentPage = 1;
    const filtered = filterByTitle(searchInput?.value || '');
    renderProducts(filtered);
  });
}

// Pagination click handling (event delegation)
if(paginationEl){
  paginationEl.addEventListener('click', (ev) => {
    const target = ev.target.closest('a[data-page]');
    if(!target) return;
    ev.preventDefault();
    const p = parseInt(target.getAttribute('data-page'), 10);
    if(isNaN(p) || p === currentPage) return;
    currentPage = p;
    const filtered = filterByTitle(searchInput?.value || '');
    renderProducts(filtered);
  });
}

function renderPagination(totalItems, totalPages, current){
  if(!paginationEl) return;
  paginationEl.innerHTML = '';

  const createPageItem = (label, page, disabled=false, active=false) => {
    const li = document.createElement('li');
    li.className = 'page-item' + (disabled ? ' disabled' : '') + (active ? ' active' : '');
    const a = document.createElement('a');
    a.className = 'page-link';
    a.href = '#';
    a.setAttribute('data-page', page);
    a.textContent = label;
    li.appendChild(a);
    return li;
  };

  // Prev
  paginationEl.appendChild(createPageItem('Prev', Math.max(1, current - 1), current === 1));

  // Page numbers (compact)
  const maxButtons = 7;
  let start = Math.max(1, current - Math.floor(maxButtons/2));
  let end = start + maxButtons - 1;
  if(end > totalPages){ end = totalPages; start = Math.max(1, end - maxButtons + 1); }

  for(let i = start; i <= end; i++){
    paginationEl.appendChild(createPageItem(i, i, false, i === current));
  }

  // Next
  paginationEl.appendChild(createPageItem('Next', Math.min(totalPages, current + 1), current === totalPages));
}

function initTooltips(){
  if(typeof bootstrap === 'undefined') return;
  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  tooltipTriggerList.forEach(el => {
    // Avoid double-initialization by checking for existing tooltip instance
    if (bootstrap.Tooltip.getInstance(el)) return;
    new bootstrap.Tooltip(el, {container: 'body'});
  });
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

fetchProducts();

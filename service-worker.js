/* =========================
   App logic: mock DB in localStorage
   - CRUD transactions
   - Charts (Chart.js)
   - Table with sort/filter/pagination
   - Products management
   - Export CSV
   - Theme & small notifications
   ========================= */

(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const uid = () => Date.now() + Math.floor(Math.random() * 999);

  let transactions = JSON.parse(localStorage.getItem('rp_trx_v1') || '[]');
  let products = JSON.parse(localStorage.getItem('rp_products_v1') || '[]') || [];
  let state = {
    view: 'overview',
    page: 1,
    rows: 10,
    sort: { key: 'date', dir: 'desc' },
    filter: { product: '', month: '' },
    theme: localStorage.getItem('rp_theme') || 'dark'
  };

  function init() {
    applyTheme();
    bindNav();
    bindTopbar();
    bindForms();
    bindTableControls();
    loadDefaults();
    render();
  }

  function applyTheme() {
    document.body.classList.toggle('dark', state.theme === 'dark');
    $('#themeSelect') && ($('#themeSelect').value = state.theme);
    localStorage.setItem('rp_theme', state.theme);
  }

  function bindNav() {
    $$('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.nav-item').forEach(x => x.classList.remove('active'));
        btn.classList.add('active');
        const v = btn.dataset.view;
        state.view = v;
        showView(v);
      });
    });

    $('#collapseBtn')?.addEventListener('click', () => {
      document.querySelector('.sidebar')?.classList.toggle('collapsed');
    });
  }

  function showView(v) {
    $$('.view').forEach(section => {
      section.classList.toggle('hidden', section.dataset.view !== v);
    });
    if (v === 'overview') renderOverview();
    if (v === 'history') renderTable();
    if (v === 'products') renderProducts();
  }

  function bindTopbar() {
    $('#darkToggle')?.addEventListener('click', () => {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      applyTheme();
    });

    $('#globalSearch')?.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      if (!q) return render();
      const filtered = transactions.filter(t =>
        t.product.toLowerCase().includes(q) || (t.date && t.date.includes(q))
      );
      renderTable(filtered);
    });

    $('#searchClear')?.addEventListener('click', () => {
      $('#globalSearch').value = '';
      render();
    });

    $('#exportCsvBtn')?.addEventListener('click', exportCSV);
    $('#quickAddBtn')?.addEventListener('click', () => {
      state.view = 'input';
      document.querySelector('[data-view="input"]').classList.remove('hidden');
      $('.nav-item[data-view="input"]').click();
      window.scrollTo({top:0,behavior:'smooth'});
    });

    $('#notifBtn')?.addEventListener('click', () => {
      toast('No new notifications');
    });
  }

  function bindForms() {
    $('#salesForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const p = $('#fProduct').value.trim();
      const q = Number($('#fQty').value);
      const h = Number($('#fPrice').value);
      const dt = $('#fDate').value || new Date().toISOString().slice(0,10);
      if (!p || q <= 0 || h <= 0) return toast('Lengkapi data dengan benar', 'error');
      const tr = { id: uid(), date: dt, product: p, qty: q, price: h, total: q*h };
      transactions.unshift(tr);
      persist();
      toast('Transaksi disimpan', 'success');
      $('#salesForm').reset();
      render();
      if (!products.includes(p)) { products.push(p); persistProducts(); }
    });

    $('#clearForm')?.addEventListener('click', () => $('#salesForm').reset());

    $('#addProduct')?.addEventListener('click', () => {
      const name = $('#newProduct').value.trim();
      if (!name) return toast('Masukkan nama produk', 'error');
      if (products.includes(name)) return toast('Produk sudah ada', 'error');
      products.push(name);
      persistProducts();
      $('#newProduct').value = '';
      renderProducts();
      toast('Produk ditambahkan', 'success');
    });

    $('#generateReport')?.addEventListener('click', generateReport);

    $('#backupBtn')?.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify({transactions, products})], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `backup-${Date.now()}.json`; a.click();
      URL.revokeObjectURL(url);
      toast('Backup dibuat', 'success');
    });

    $('#themeSelect')?.addEventListener('change', (e) => {
      state.theme = e.target.value; applyTheme();
    });
  }

  function persist() { localStorage.setItem('rp_trx_v1', JSON.stringify(transactions)); }
  function persistProducts() { localStorage.setItem('rp_products_v1', JSON.stringify(products)); }

  function loadDefaults() {
    if (transactions.length === 0) {
      const seed = [
        { id: uid(), date: recent(-10), product: 'Kopi Hitam', qty: 3, price: 15000, total: 45000 },
        { id: uid(), date: recent(-9), product: 'Teh Manis', qty: 2, price: 10000, total: 20000 },
        { id: uid(), date: recent(-8), product: 'Roti Bakar', qty: 4, price: 12000, total: 48000 },
        { id: uid(), date: recent(-3), product: 'Kopi Hitam', qty: 1, price: 15000, total: 15000 },
        { id: uid(), date: recent(-1), product: 'Es Jeruk', qty: 5, price: 8000, total: 40000 }
      ];
      transactions = seed.concat(transactions);
      persist();
    }
    products = Array.from(new Set(products.concat(transactions.map(t => t.product))));
    persistProducts();
    renderProducts();
  }

  function render() {
    renderOverview();
    renderTable();
    renderProducts();
  }

  function renderOverview() {
    $('#stat-total').innerText = formatRp(sum());
    $('#stat-count').innerText = transactions.length;
    $('#stat-avg').innerText = formatRp(avg());
    $('#stat-top').innerText = topProduct() || '-';
    renderCharts();
  }

  function renderTable(filtered = null) {
    let rows = filtered || transactions.slice();
    if (state.filter.product) rows = rows.filter(r => r.product === state.filter.product);
    if (state.filter.month) rows = rows.filter(r => r.date.startsWith(state.filter.month));
    rows.sort((a,b) => {
      const k = state.sort.key;
      const dir = state.sort.dir === 'asc' ? 1 : -1;
      if (k === 'product') return a.product.localeCompare(b.product) * dir;
      if (k === 'date') return (a.date > b.date ? 1 : -1) * dir;
      if (k === 'qty') return (a.qty - b.qty) * dir;
      if (k === 'total') return (a.total - b.total) * dir;
      return 0;
    });

    const rowsPerPage = Number($('#rowsPerPage').value || 10);
    const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));
    state.page = Math.min(state.page, totalPages);
    const start = (state.page - 1) * rowsPerPage;
    const pageRows = rows.slice(start, start + rowsPerPage);

    const tbody = $('#tableBody');
    tbody.innerHTML = pageRows.map(r => `
      <tr>
        <td>${r.date}</td>
        <td>${escapeHtml(r.product)}</td>
        <td>${r.qty}</td>
        <td>Rp ${r.price.toLocaleString()}</td>
        <td>Rp ${r.total.toLocaleString()}</td>
        <td><button class="btn ghost small" data-id="${r.id}" onclick="deleteRow(${r.id})">Hapus</button></td>
      </tr>
    `).join('') || `<tr><td colspan="6" style="text-align:center;color:#999;padding:18px">Tidak ada data</td></tr>`;

    $('#pageInfo').innerText = `${state.page} / ${totalPages}`;
  }

  function renderProducts() {
    const sel = $('#filterProduct');
    if (!sel) return;
    sel.innerHTML = `<option value="">Semua Produk</option>` + products.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
    $('#productList').innerHTML = products.map(p => `<li class="product-item"><span>${escapeHtml(p)}</span><div><button class="btn ghost small" onclick="removeProduct('${escapeJs(p)}')">Hapus</button></div></li>`).join('');
  }

  let salesChart=null, topChart=null;
  function renderCharts() {
    const months = {};
    transactions.forEach(t => { months[t.date.slice(0,7)] = (months[t.date.slice(0,7)]||0) + t.total });
    const labels = Object.keys(months).sort();
    const data = labels.map(l => months[l]);

    const ctx = document.getElementById('salesChart').getContext('2d');
    if (salesChart) salesChart.destroy();
    salesChart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{ label:'Pendapatan', data, fill:true, borderColor: '#2563eb', backgroundColor:'rgba(37,99,235,0.08)', tension:0.3 }]},
      options: { responsive:true, plugins:{legend:{display:false}}}
    });

    const counts = {};
    transactions.forEach(t => counts[t.product] = (counts[t.product]||0) + t.qty);
    const entries = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,6);
    const tlabels = entries.map(e=>e[0]);
    const tdata = entries.map(e=>e[1]);

    const ctx2 = document.getElementById('topChart').getContext('2d');
    if (topChart) topChart.destroy();
    topChart = new Chart(ctx2, {
      type: 'bar',
      data: {labels:tlabels, datasets:[{label:'Qty',data:tdata, backgroundColor:'#10b981'}]},
      options:{responsive:true,plugins:{legend:{display:false}}}
    });
  }

  function sum(){return transactions.reduce((s,t)=>s+t.total,0)}
  function avg(){return transactions.length?Math.round(sum()/transactions.length):0}
  function topProduct(){ const m={}; transactions.forEach(t=>m[t.product]=(m[t.product]||0)+t.qty); return Object.entries(m).sort((a,b)=>b[1]-a[1])[0]?.[0]||'-' }
  function recent(days){ const d=new Date(); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10) }
  function formatRp(v){ return 'Rp ' + Number(v||0).toLocaleString() }
  function escapeHtml(s){return String(s).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function escapeJs(s){ return s.replace(/'/g,"\\'") }

  window.deleteRow = function(id){
    if(!confirm('Hapus data ini?')) return;
    transactions = transactions.filter(t => t.id !== id);
    persist(); render(); toast('Data dihapus', 'success');
  }

  window.removeProduct = function(name){
    if(!confirm('Hapus produk?')) return;
    products = products.filter(p => p !== name);
    persistProducts(); renderProducts(); toast('Produk dihapus', 'success');
  }

  function bindTableControls(){
    $('#rowsPerPage')?.addEventListener('change', ()=>{ state.page=1; renderTable();});
    $('#prevPage')?.addEventListener('click', ()=>{ state.page=Math.max(1,state.page-1); renderTable();});
    $('#nextPage')?.addEventListener('click', ()=>{ state.page++; renderTable();});
    $('#filterDate')?.addEventListener('change', (e)=>{ state.filter.month = e.target.value; state.page=1; renderTable();});
    $('#filterProduct')?.addEventListener('change', (e)=>{ state.filter.product = e.target.value; state.page=1; renderTable();});
    $$('#table thead th[data-sort]').forEach(th=>{
      th.addEventListener('click', ()=> {
        const k = th.dataset.sort;
        if(state.sort.key === k) state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
        else { state.sort.key = k; state.sort.dir = 'desc' }
        renderTable();
      });
    });
  }

  function exportCSV(){
    if(transactions.length === 0) return toast('Tidak ada data untuk diexport', 'error');
    const header = ['id','date','product','qty','price','total'];
    const rows = transactions.map(t => [t.id,t.date,t.product,t.qty,t.price,t.total]);
    const csv = [header.join(','), ...rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `rekap-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast('CSV siap diunduh', 'success');
  }

  function generateReport(){
    const r = { total: sum(), count: transactions.length, avg: avg(), top: topProduct() };
    $('#reportPre').innerText = JSON.stringify(r, null, 2);
    toast('Laporan dibuat', 'success');
  }

  function toast(msg, type='info'){
    const root = $('#toastRoot');
    if(!root) return alert(msg);
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerText = msg;
    root.appendChild(el);
    setTimeout(()=> el.classList.add('visible'), 20);
    setTimeout(()=> el.classList.remove('visible'), 3000);
    setTimeout(()=> el.remove(), 3600);
  }

  function persist(){ localStorage.setItem('rp_trx_v1', JSON.stringify(transactions)); }
  function persistProducts(){ localStorage.setItem('rp_products_v1', JSON.stringify(products)); }

  function renderInitialElements(){
    $('#rowsPerPage').value = '10';
  }

  init();
  renderInitialElements();
  showView('overview');

})();

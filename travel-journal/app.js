/* ===== 旅途印记 - 核心逻辑（多旅程版） ===== */
(function () {
    'use strict';

    const DB_KEY = 'travel_journal_data';
    let data = loadData();
    let currentTripId = null;
    let editingTripId = null; // null=新建, 非null=编辑旅程
    let currentDayIndex = 0;
    let editingEntryIndex = -1;
    let tempPhotos = [];
    let tempLocations = [];
    let map = null;
    let mapMarkers = [];
    let photoViewerList = [];
    let photoViewerIndex = 0;

    function loadData() {
        try {
            const raw = localStorage.getItem(DB_KEY);
            if (!raw) return { trips: [], version: 2 };
            const d = JSON.parse(raw);
            // 迁移旧格式 (单 trip → 多 trips)
            if (d.trip && !d.trips) {
                return { trips: [d.trip], version: 2 };
            }
            if (!d.trips) return { trips: [], version: 2 };
            return d;
        } catch { return { trips: [], version: 2 }; }
    }
    function saveData() { localStorage.setItem(DB_KEY, JSON.stringify(data)); }
    function currentTrip() { return data.trips.find(t => t.id === currentTripId) || null; }

    const $ = (s, p) => (p || document).querySelector(s);
    const $$ = (s, p) => [...(p || document).querySelectorAll(s)];

    document.addEventListener('DOMContentLoaded', () => {
        bindNav();
        bindTripModal();
        bindEntryModal();
        bindPhotoViewer();
        bindImportExport();
        render();
    });

    // ===== 导航 =====
    function bindNav() {
        $$('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                // 如果点的是时间线/地图/相册但没选旅程，提示
                if (view !== 'trips' && !currentTripId) {
                    alert('请先选择一个旅程');
                    return;
                }
                $$('.nav-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                $$('.view-panel').forEach(v => v.classList.remove('active'));
                $(`#view${capitalize(view)}`).classList.add('active');
                if (view === 'map') initMap();
                if (view === 'gallery') renderGallery();
            });
        });
        $('#btnBackToList').addEventListener('click', () => {
            currentTripId = null;
            switchView('trips');
            render();
        });
        // Hero 操作按钮
        $('#btnEditTrip').addEventListener('click', () => openTripEditModal());
        $('#btnAddDayHero').addEventListener('click', () => openEntryModal(-1));
        // 操作栏按钮
        $('#tbEditTrip').addEventListener('click', () => openTripEditModal());
        $('#tbAddDay').addEventListener('click', () => openEntryModal(-1));
        $('#tbDeleteTrip').addEventListener('click', () => {
            const t = currentTrip();
            if (!t) return;
            if (!confirm(`确定删除旅程「${t.name}」？此操作不可恢复。`)) return;
            data.trips = data.trips.filter(tr => tr.id !== t.id);
            saveData();
            currentTripId = null;
            switchView('trips');
            render();
        });
        // 悬浮按钮
        $('#fabAddDay').addEventListener('click', () => openEntryModal(-1));
        $('#fabEditDay').addEventListener('click', () => {
            const t = currentTrip();
            if (!t || !t.entries || !t.entries.length) { openEntryModal(-1); return; }
            openEntryModal(currentDayIndex);
        });
    }
    function switchView(name) {
        $$('.nav-btn').forEach(b => b.classList.remove('active'));
        $$(`.nav-btn[data-view="${name}"]`).forEach(b => b.classList.add('active'));
        $$('.view-panel').forEach(v => v.classList.remove('active'));
        $(`#view${capitalize(name)}`).classList.add('active');
    }
    function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    // ===== 渲染 =====
    function render() {
        if (!currentTripId) { renderTripList(); return; }
        renderHero();
        renderDayNav();
        renderDayContent();
    }

    function renderTripList() {
        // Hero 回到默认
        $('#tripHero').classList.remove('has-cover');
        $('#tripHero').style.backgroundImage = '';
        $('#tripTitle').textContent = '🌍 旅途印记';
        $('#tripSubtitle').textContent = '每一次出发，都值得被铭记';
        $('#tripStats').innerHTML = '';
        $('#btnBackToList').style.display = 'none';
        $('#tripHeroActions').style.display = 'none';
        $('#fabGroup').style.display = 'none';
        $('#tripToolbar').style.display = 'none';
        // 清空日内容
        $('#dayNav').innerHTML = '';
        $('#dayContent').innerHTML = '';

        const list = $('#tripList');
        let html = '';
        data.trips.forEach(t => {
            const days = t.entries ? t.entries.length : 0;
            const photos = t.entries ? t.entries.reduce((s, e) => s + (e.photos ? e.photos.length : 0), 0) : 0;
            const coverStyle = t.coverImg ? `--card-cover: url(${t.coverImg})` : '';
            const coverClass = t.coverImg ? 'has-img' : '';
            html += `
            <div class="trip-card" data-id="${t.id}">
                <div class="trip-card-cover ${coverClass}" style="${coverStyle}"></div>
                <div class="trip-card-actions">
                    <button class="trip-card-action delete" data-action="delete" data-id="${t.id}" title="删除">🗑️</button>
                </div>
                <div class="trip-card-body">
                    <div class="trip-card-name">${escapeHtml(t.name)}</div>
                    <div class="trip-card-desc">${escapeHtml(t.desc || '暂无描述')}</div>
                    <div class="trip-card-meta">
                        <span>📅 ${days} 天</span>
                        <span>📸 ${photos} 张照片</span>
                        ${t.startDate ? `<span>🕐 ${t.startDate}</span>` : ''}
                    </div>
                </div>
            </div>`;
        });
        html += `
        <div class="trip-list-add" id="tripListAdd">
            <span>✈️</span>
            <p>新建旅程</p>
        </div>`;
        list.innerHTML = html;

        // 绑定事件
        $$('.trip-card').forEach(card => {
            card.addEventListener('click', e => {
                if (e.target.closest('.trip-card-action')) return;
                currentTripId = card.dataset.id;
                currentDayIndex = 0;
                map = null; // 重建地图
                switchView('timeline');
                render();
            });
        });
        $$('.trip-card-action.delete').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const trip = data.trips.find(t => t.id === id);
                if (!confirm(`确定删除旅程「${trip?.name}」？此操作不可恢复。`)) return;
                data.trips = data.trips.filter(t => t.id !== id);
                saveData();
                render();
            });
        });
        $('#tripListAdd').addEventListener('click', () => openModal('modalTrip'));
    }

    function renderHero() {
        const t = currentTrip();
        if (!t) return;
        $('#btnBackToList').style.display = '';
        $('#tripHeroActions').style.display = 'flex';
        $('#fabGroup').style.display = 'flex';
        $('#tripToolbar').style.display = 'flex';
        if (t.coverImg) {
            $('#tripHero').classList.add('has-cover');
            $('#tripHero').style.backgroundImage = `url(${t.coverImg})`;
        } else {
            $('#tripHero').classList.remove('has-cover');
            $('#tripHero').style.backgroundImage = '';
        }
        $('#tripTitle').textContent = t.name;
        $('#tripSubtitle').textContent = t.desc || '';
        const days = t.entries ? t.entries.length : 0;
        const photos = t.entries ? t.entries.reduce((s, e) => s + (e.photos ? e.photos.length : 0), 0) : 0;
        const locations = t.entries ? t.entries.reduce((s, e) => s + (e.locations ? e.locations.length : 0), 0) : 0;
        $('#tripStats').innerHTML = `
            <div class="trip-stat"><span class="trip-stat-num">${days}</span><span class="trip-stat-label">天</span></div>
            <div class="trip-stat"><span class="trip-stat-num">${photos}</span><span class="trip-stat-label">张照片</span></div>
            <div class="trip-stat"><span class="trip-stat-num">${locations}</span><span class="trip-stat-label">个地点</span></div>`;
    }

    function renderDayNav() {
        const t = currentTrip();
        if (!t) return;
        const entries = t.entries || [];
        let html = '';
        entries.forEach((e, i) => {
            const d = new Date(e.date);
            const dayNum = i + 1;
            const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
            html += `<div class="day-tab ${i === currentDayIndex ? 'active' : ''}" data-index="${i}">
                <span class="day-tab-day">Day ${dayNum}</span>
                <span class="day-tab-date">${dateStr}</span>
                ${e.title ? `<span class="day-tab-title">${e.title}</span>` : ''}
            </div>`;
        });
        html += `<div class="day-tab-add" id="btnAddDay">+ 添加一天</div>`;
        $('#dayNav').innerHTML = html;

        $$('.day-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                currentDayIndex = parseInt(tab.dataset.index);
                renderDayNav();
                renderDayContent();
            });
        });
        $('#btnAddDay').addEventListener('click', () => openEntryModal(-1));
    }

    function renderDayContent() {
        const t = currentTrip();
        if (!t) return;
        const entries = t.entries || [];

        // 操作栏 - 始终显示
        let toolbar = `<div class="trip-toolbar" style="display:flex;gap:10px;padding:12px 0;margin-bottom:16px;border-bottom:1px solid #e2e8f0;align-items:center;">
            <button class="toolbar-btn" style="padding:8px 18px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;font-size:.9rem;cursor:pointer;font-family:var(--font);" onclick="document.querySelector('#tbEditTrip').click()">⚙️ 编辑旅程</button>
            <button class="toolbar-btn" style="padding:8px 18px;border:1px solid #2563eb;background:#2563eb;color:#fff;border-radius:8px;font-size:.9rem;cursor:pointer;font-family:var(--font);" onclick="document.querySelector('#tbAddDay').click()">📝 添加一天</button>
            <button class="toolbar-btn" style="padding:8px 18px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;font-size:.9rem;cursor:pointer;font-family:var(--font);margin-left:auto;color:#dc2626;" onclick="document.querySelector('#tbDeleteTrip').click()">🗑️ 删除旅程</button>
        </div>`;

        if (!entries.length) {
            $('#dayContent').innerHTML = toolbar + `<div class="empty-state"><div class="empty-icon">📝</div><h3>还没有日记</h3><p>开始记录你的旅途吧</p><br><button class="btn-primary" onclick="document.querySelector('#btnAddDay').click()">📝 添加第一天</button></div>`;
            return;
        }
        const e = entries[currentDayIndex];
        if (!e) return;

        let html = toolbar;
        html += `<div class="day-full" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <h2 style="font-family:var(--font);font-size:1.4rem;">📅 Day ${currentDayIndex + 1}${e.title ? ' · ' + e.title : ''}</h2>
            <button class="btn-edit-day" id="btnEditDay">✏️ 编辑今日</button>
        </div>`;

        if (e.itinerary && e.itinerary.length) {
            html += `<div class="card"><div class="card-header"><h3>📋 行程安排</h3></div><div class="card-body"><div class="itinerary-timeline">`;
            e.itinerary.forEach(it => {
                html += `<div class="itin-item"><span class="itin-time">${it.time}</span><div class="itin-activity">${it.activity}</div></div>`;
            });
            html += `</div></div></div>`;
        }
        if (e.thoughts) {
            html += `<div class="card"><div class="card-header"><h3>💭 今日随想</h3></div><div class="card-body"><div class="thoughts-content">${escapeHtml(e.thoughts)}</div></div></div>`;
        }
        if (e.locations && e.locations.length) {
            html += `<div class="card day-full"><div class="card-header"><h3>📍 地点标注</h3></div><div class="card-body"><div class="location-tags">`;
            e.locations.forEach(loc => {
                html += `<span class="location-tag" data-lng="${loc.lng}" data-lat="${loc.lat}" data-name="${escapeHtml(loc.name)}">📍 ${escapeHtml(loc.name)}</span>`;
            });
            html += `</div></div></div>`;
        }
        if (e.photos && e.photos.length) {
            html += `<div class="card day-full"><div class="card-header"><h3>📸 照片记录</h3></div><div class="card-body"><div class="photo-grid">`;
            e.photos.forEach((p, pi) => {
                html += `<div class="photo-item" data-day="${currentDayIndex}" data-photo="${pi}"><img src="${p.data}" alt="${escapeHtml(p.caption || '')}"><div class="photo-overlay">🔍</div></div>`;
            });
            html += `</div></div></div>`;
        }
        if (!e.itinerary?.length && !e.thoughts && !e.locations?.length && !e.photos?.length) {
            html += `<div class="card day-full"><div class="card-body" style="text-align:center;padding:48px 24px;color:var(--text-light);">
                <div style="font-size:2.5rem;margin-bottom:12px;">✍️</div>
                <p style="margin-bottom:16px;">今天还没有内容</p>
                <button class="btn-primary" onclick="document.querySelector('#btnEditDay').click()">✏️ 开始记录</button>
            </div></div>`;
        }

        $('#dayContent').innerHTML = html;

        const editBtn = $('#btnEditDay');
        if (editBtn) editBtn.addEventListener('click', () => openEntryModal(currentDayIndex));

        $$('.photo-item').forEach(item => {
            item.addEventListener('click', () => openPhotoViewer(parseInt(item.dataset.day), parseInt(item.dataset.photo)));
        });
        $$('.location-tag').forEach(tag => {
            tag.addEventListener('click', () => {
                switchView('map');
                initMap();
                const lng = parseFloat(tag.dataset.lng), lat = parseFloat(tag.dataset.lat);
                if (map && lng && lat) { map.setCenter([lng, lat]); map.setZoom(15); }
            });
        });
    }

    // ===== 旅程弹窗 =====
    function bindTripModal() {
        $('#modalTripClose').addEventListener('click', () => closeModal('modalTrip'));
        $('#modalTripCancel').addEventListener('click', () => closeModal('modalTrip'));
        $('#tripCover').addEventListener('change', handleCoverPreview);
        $('#modalTripSave').addEventListener('click', saveTrip);
    }
    function openTripEditModal() {
        const t = currentTrip();
        if (!t) return;
        editingTripId = t.id;
        $('#tripName').value = t.name || '';
        $('#tripDesc').value = t.desc || '';
        $('#tripStart').value = t.startDate || '';
        $('#tripEnd').value = t.endDate || '';
        if (t.coverImg) {
            $('#coverPreview').innerHTML = `<img src="${t.coverImg}">`;
        } else {
            $('#coverPreview').innerHTML = '';
        }
        // 更新弹窗标题
        $('.modal-header h3', $('#modalTrip')).textContent = '⚙️ 编辑旅程';
        openModal('modalTrip');
    }
    function handleCoverPreview() {
        const file = $('#tripCover').files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => { $('#coverPreview').innerHTML = `<img src="${e.target.result}">`; };
        reader.readAsDataURL(file);
    }
    function saveTrip() {
        const name = $('#tripName').value.trim();
        if (!name) { alert('请输入旅程名称'); return; }
        const coverFile = $('#tripCover').files[0];

        const doSave = (coverImg) => {
            if (editingTripId) {
                // 编辑模式
                const t = data.trips.find(t => t.id === editingTripId);
                if (!t) return;
                t.name = name;
                t.desc = $('#tripDesc').value.trim();
                t.startDate = $('#tripStart').value;
                t.endDate = $('#tripEnd').value;
                if (coverImg !== undefined) t.coverImg = coverImg;
                saveData();
                editingTripId = null;
                closeModal('modalTrip');
                render();
            } else {
                // 新建模式
                const trip = {
                    id: 'trip_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                    name,
                    desc: $('#tripDesc').value.trim(),
                    startDate: $('#tripStart').value,
                    endDate: $('#tripEnd').value,
                    coverImg: coverImg || null,
                    entries: [],
                    createdAt: new Date().toISOString()
                };
                data.trips.push(trip);
                saveData();
                currentTripId = trip.id;
                currentDayIndex = 0;
                closeModal('modalTrip');
                switchView('timeline');
                render();
            }
            // 清空表单
            $('#tripName').value = '';
            $('#tripDesc').value = '';
            $('#tripStart').value = '';
            $('#tripEnd').value = '';
            $('#coverPreview').innerHTML = '';
            $('.modal-header h3', $('#modalTrip')).textContent = '✈️ 新建旅程';
        };
        if (coverFile) {
            compressImage(coverFile, 1200, .8, doSave);
        } else {
            doSave(null);
        }
    }

    // ===== 日记弹窗 =====
    function bindEntryModal() {
        $('#modalEntryClose').addEventListener('click', () => closeModal('modalEntry'));
        $('#modalEntryCancel').addEventListener('click', () => closeModal('modalEntry'));
        $('#modalEntrySave').addEventListener('click', saveEntry);
        $('#btnDeleteEntry').addEventListener('click', deleteEntry);
        $('#btnAddItin').addEventListener('click', addItineraryRow);
        $('#photoUploadArea').addEventListener('click', () => $('#photoInput').click());
        $('#photoInput').addEventListener('change', handlePhotoUpload);
        const area = $('#photoUploadArea');
        area.addEventListener('dragover', e => { e.preventDefault(); area.style.borderColor = 'var(--primary)'; });
        area.addEventListener('dragleave', () => { area.style.borderColor = ''; });
        area.addEventListener('drop', e => { e.preventDefault(); area.style.borderColor = ''; handleFiles(e.dataTransfer.files); });
        $('#btnSearchLocation').addEventListener('click', searchLocation);
        $('#locationSearch').addEventListener('keypress', e => { if (e.key === 'Enter') searchLocation(); });
    }

    function openEntryModal(dayIndex) {
        editingEntryIndex = dayIndex;
        tempPhotos = [];
        tempLocations = [];
        const t = currentTrip();
        if (!t) return;

        if (dayIndex >= 0 && t.entries[dayIndex]) {
            const e = t.entries[dayIndex];
            $('#entryModalTitle').textContent = '✏️ 编辑日记';
            $('#entryDate').value = e.date || '';
            $('#entryTitle').value = e.title || '';
            $('#entryThoughts').value = e.thoughts || '';
            $('#btnDeleteEntry').style.display = '';
            renderItineraryEditor(e.itinerary || []);
            tempLocations = [...(e.locations || [])];
            renderSelectedLocations();
            tempPhotos = [...(e.photos || [])];
            renderPhotoPreview();
        } else {
            $('#entryModalTitle').textContent = '📝 添加日记';
            $('#entryDate').value = t.startDate || new Date().toISOString().slice(0, 10);
            $('#entryTitle').value = '';
            $('#entryThoughts').value = '';
            $('#btnDeleteEntry').style.display = 'none';
            renderItineraryEditor([{ time: '09:00', activity: '' }]);
            tempLocations = [];
            renderSelectedLocations();
            tempPhotos = [];
            renderPhotoPreview();
        }
        openModal('modalEntry');
    }

    function renderItineraryEditor(items) {
        const list = $('#itineraryList');
        list.innerHTML = '';
        items.forEach(it => list.appendChild(createItinRow(it.time, it.activity)));
    }
    function createItinRow(time, activity) {
        const div = document.createElement('div');
        div.className = 'itinerary-item';
        div.innerHTML = `
            <input type="time" class="itin-time form-group" value="${time}" style="width:100px;padding:10px;border:1px solid var(--border);border-radius:8px;">
            <input type="text" class="itin-activity" value="${escapeHtml(activity)}" placeholder="活动描述" style="flex:1;padding:10px;border:1px solid var(--border);border-radius:8px;">
            <button class="btn-remove-itin">&times;</button>`;
        div.querySelector('.btn-remove-itin').addEventListener('click', () => {
            if ($('#itineraryList').children.length > 1) div.remove();
        });
        return div;
    }
    function addItineraryRow() { $('#itineraryList').appendChild(createItinRow('', '')); }

    function searchLocation() {
        const keyword = $('#locationSearch').value.trim();
        if (!keyword) return;
        if (typeof AMap === 'undefined') { alert('地图加载中，请稍候...'); return; }
        AMap.plugin(['AMap.PlaceSearch'], () => {
            const ps = new AMap.PlaceSearch({ pageSize: 10 });
            ps.search(keyword, (status, result) => {
                const results = $('#locationResults');
                if (status === 'complete' && result.poiList && result.poiList.pois.length) {
                    results.innerHTML = '';
                    result.poiList.pois.forEach(poi => {
                        const div = document.createElement('div');
                        div.className = 'loc-result-item';
                        div.innerHTML = `<div class="loc-result-name">${poi.name}</div><div class="loc-result-addr">${poi.address || ''}</div>`;
                        div.addEventListener('click', () => {
                            tempLocations.push({ name: poi.name, address: poi.address || '', lng: poi.location.lng, lat: poi.location.lat });
                            renderSelectedLocations();
                            results.classList.remove('active');
                            $('#locationSearch').value = '';
                        });
                        results.appendChild(div);
                    });
                    results.classList.add('active');
                } else {
                    results.innerHTML = '<div class="loc-result-item" style="color:var(--text-light)">未找到结果</div>';
                    results.classList.add('active');
                }
            });
        });
    }
    function renderSelectedLocations() {
        const container = $('#selectedLocations');
        container.innerHTML = '';
        tempLocations.forEach((loc, i) => {
            const span = document.createElement('span');
            span.className = 'selected-loc';
            span.innerHTML = `📍 ${escapeHtml(loc.name)} <span class="remove-loc" data-i="${i}">&times;</span>`;
            span.querySelector('.remove-loc').addEventListener('click', () => {
                tempLocations.splice(i, 1);
                renderSelectedLocations();
            });
            container.appendChild(span);
        });
    }

    function handlePhotoUpload() { handleFiles($('#photoInput').files); }
    function handleFiles(files) {
        [...files].forEach(f => {
            if (!f.type.startsWith('image/')) return;
            compressImage(f, 1600, .75, dataUrl => {
                tempPhotos.push({ data: dataUrl, caption: '' });
                renderPhotoPreview();
            });
        });
    }
    function renderPhotoPreview() {
        const grid = $('#photoPreviewGrid');
        grid.innerHTML = '';
        tempPhotos.forEach((p, i) => {
            const div = document.createElement('div');
            div.className = 'photo-preview-item';
            div.innerHTML = `<img src="${p.data}"><button class="remove-photo" data-i="${i}">&times;</button><input class="photo-caption-input" data-i="${i}" placeholder="添加描述" value="${escapeHtml(p.caption || '')}">`;
            div.querySelector('.remove-photo').addEventListener('click', () => { tempPhotos.splice(i, 1); renderPhotoPreview(); });
            div.querySelector('.photo-caption-input').addEventListener('change', e => { tempPhotos[i].caption = e.target.value; });
            grid.appendChild(div);
        });
    }

    function saveEntry() {
        const t = currentTrip();
        if (!t) return;
        const date = $('#entryDate').value;
        const title = $('#entryTitle').value.trim();
        const thoughts = $('#entryThoughts').value.trim();
        const itinerary = [];
        $$('.itinerary-item', $('#itineraryList')).forEach(row => {
            const time = $('.itin-time', row).value;
            const activity = $('.itin-activity', row).value.trim();
            if (time || activity) itinerary.push({ time, activity });
        });
        const entry = { date, title, itinerary, thoughts, locations: [...tempLocations], photos: [...tempPhotos] };
        if (!t.entries) t.entries = [];
        if (editingEntryIndex >= 0) {
            t.entries[editingEntryIndex] = entry;
        } else {
            t.entries.push(entry);
            t.entries.sort((a, b) => a.date.localeCompare(b.date));
            currentDayIndex = t.entries.findIndex(e => e === entry);
        }
        saveData();
        closeModal('modalEntry');
        render();
    }
    function deleteEntry() {
        const t = currentTrip();
        if (!t) return;
        if (!confirm('确定删除这一天的日记？')) return;
        t.entries.splice(editingEntryIndex, 1);
        if (currentDayIndex >= t.entries.length) currentDayIndex = Math.max(0, t.entries.length - 1);
        saveData();
        closeModal('modalEntry');
        render();
    }

    // ===== 地图 =====
    let mapSearchResult = null; // 当前搜索选中的地点

    function initMap() {
        if (typeof AMap === 'undefined') return;
        if (map) { refreshMapMarkers(); return; }
        map = new AMap.Map('mapContainer', { zoom: 5, center: [116.397, 39.908], viewMode: '2D' });
        refreshMapMarkers();
        bindMapSearch();
    }

    function bindMapSearch() {
        const input = $('#mapSearchInput');
        const results = $('#mapSearchResults');
        const btnAdd = $('#btnMapAdd');
        const daySelect = $('#mapAddDay');

        // 填充日期选择器
        populateMapDaySelect();

        // 搜索
        let searchTimer = null;
        input.addEventListener('input', () => {
            clearTimeout(searchTimer);
            const keyword = input.value.trim();
            if (!keyword) { results.classList.remove('active'); mapSearchResult = null; btnAdd.disabled = true; return; }
            searchTimer = setTimeout(() => doMapSearch(keyword), 400);
        });
        input.addEventListener('keypress', e => { if (e.key === 'Enter') doMapSearch(input.value.trim()); });

        // 添加按钮
        btnAdd.addEventListener('click', () => {
            if (!mapSearchResult) return;
            const t = currentTrip();
            if (!t) return;
            const dayIdx = parseInt(daySelect.value);
            if (isNaN(dayIdx) || dayIdx < 0) { alert('请先添加日记天数'); return; }
            if (!t.entries[dayIdx].locations) t.entries[dayIdx].locations = [];
            t.entries[dayIdx].locations.push({ ...mapSearchResult });
            saveData();
            // 清空搜索
            input.value = '';
            results.classList.remove('active');
            mapSearchResult = null;
            btnAdd.disabled = true;
            refreshMapMarkers();
        });
    }

    function populateMapDaySelect() {
        const t = currentTrip();
        const select = $('#mapAddDay');
        if (!t || !t.entries || !t.entries.length) {
            select.innerHTML = '<option value="-1">暂无日记</option>';
            return;
        }
        select.innerHTML = t.entries.map((e, i) => {
            const label = `Day ${i + 1}${e.title ? ' · ' + e.title : ''}`;
            return `<option value="${i}">${label}</option>`;
        }).join('');
        // 默认选中当前天
        select.value = currentDayIndex;
    }

    function doMapSearch(keyword) {
        if (!keyword || typeof AMap === 'undefined') return;
        const results = $('#mapSearchResults');
        AMap.plugin(['AMap.PlaceSearch'], () => {
            const ps = new AMap.PlaceSearch({ pageSize: 10 });
            ps.search(keyword, (status, result) => {
                if (status === 'complete' && result.poiList && result.poiList.pois.length) {
                    results.innerHTML = '';
                    result.poiList.pois.forEach(poi => {
                        const div = document.createElement('div');
                        div.className = 'loc-result-item';
                        div.innerHTML = `<div class="loc-result-name">${poi.name}</div><div class="loc-result-addr">${poi.address || ''}</div>`;
                        div.addEventListener('click', () => {
                            mapSearchResult = { name: poi.name, address: poi.address || '', lng: poi.location.lng, lat: poi.location.lat };
                            // 地图定位
                            map.setCenter([poi.location.lng, poi.location.lat]);
                            map.setZoom(15);
                            results.classList.remove('active');
                            // 高亮搜索框
                            $('#mapSearchInput').value = poi.name;
                            $('#btnMapAdd').disabled = false;
                        });
                        results.appendChild(div);
                    });
                    results.classList.add('active');
                } else {
                    results.innerHTML = '<div class="loc-result-item" style="color:var(--text-light)">未找到结果</div>';
                    results.classList.add('active');
                }
            });
        });
    }

    function refreshMapMarkers() {
        if (!map) return;
        mapMarkers.forEach(m => map.remove(m));
        mapMarkers = [];
        populateMapDaySelect(); // 刷新日期下拉

        const pointList = $('#mapPointList');
        pointList.innerHTML = '';
        const t = currentTrip();
        if (!t || !t.entries) return;
        const allLocs = [];
        t.entries.forEach((entry, di) => {
            if (!entry.locations) return;
            entry.locations.forEach(loc => allLocs.push({ ...loc, dayIndex: di, date: entry.date, title: entry.title }));
        });
        if (!allLocs.length) { pointList.innerHTML = '<p style="color:var(--text-light);font-size:.9rem;">搜索地点并添加标注吧 ↑</p>'; return; }
        const colors = ['#2563eb', '#0ea5e9', '#16a34a', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
        allLocs.forEach(loc => {
            const color = colors[loc.dayIndex % colors.length];
            const marker = new AMap.Marker({
                position: [loc.lng, loc.lat], title: loc.name,
                label: { content: `<div style="background:${color};color:#fff;padding:2px 8px;border-radius:10px;font-size:12px;white-space:nowrap;">D${loc.dayIndex + 1} ${loc.name}</div>`, offset: new AMap.Pixel(-20, -30) }
            });
            map.add(marker);
            mapMarkers.push(marker);
            const div = document.createElement('div');
            div.className = 'map-point';
            div.innerHTML = `<div class="map-point-day" style="color:${color}">Day ${loc.dayIndex + 1} · ${loc.date}</div><div class="map-point-name">${escapeHtml(loc.name)}</div><div class="map-point-addr">${escapeHtml(loc.address || '')}</div>`;
            div.addEventListener('click', () => {
                $$('.map-point').forEach(p => p.classList.remove('active'));
                div.classList.add('active');
                map.setCenter([loc.lng, loc.lat]);
                map.setZoom(15);
            });
            pointList.appendChild(div);
        });
        if (allLocs.length > 1) {
            const bounds = new AMap.Bounds(
                [Math.min(...allLocs.map(l => l.lng)), Math.min(...allLocs.map(l => l.lat))],
                [Math.max(...allLocs.map(l => l.lng)), Math.max(...allLocs.map(l => l.lat))]
            );
            map.setBounds(bounds, true, [60, 60, 60, 340]);
        } else {
            map.setCenter([allLocs[0].lng, allLocs[0].lat]);
            map.setZoom(14);
        }
    }

    // ===== 相册 =====
    function renderGallery() {
        const grid = $('#galleryGrid');
        grid.innerHTML = '';
        const t = currentTrip();
        if (!t || !t.entries) return;
        const allPhotos = [];
        t.entries.forEach((entry, di) => {
            if (!entry.photos) return;
            entry.photos.forEach((p, pi) => allPhotos.push({ ...p, dayIndex: di, date: entry.date, photoIndex: pi }));
        });
        if (!allPhotos.length) { grid.innerHTML = '<div class="empty-state"><div class="empty-icon">📸</div><h3>还没有照片</h3><p>在日记中添加照片后，这里会自动展示</p></div>'; return; }
        allPhotos.forEach(p => {
            const div = document.createElement('div');
            div.className = 'gallery-item';
            div.innerHTML = `<img src="${p.data}" alt="${escapeHtml(p.caption || '')}"><div class="gallery-info"><span class="gallery-date">Day ${p.dayIndex + 1} · ${p.date}</span>${p.caption ? '<br>' + escapeHtml(p.caption) : ''}</div>`;
            div.addEventListener('click', () => openPhotoViewer(p.dayIndex, p.photoIndex));
            grid.appendChild(div);
        });
    }

    // ===== 照片查看器 =====
    function bindPhotoViewer() {
        $('#modalPhotoClose').addEventListener('click', () => closeModal('modalPhoto'));
        $('#photoPrev').addEventListener('click', () => navigatePhoto(-1));
        $('#photoNext').addEventListener('click', () => navigatePhoto(1));
        document.addEventListener('keydown', e => {
            if (!$('#modalPhoto').classList.contains('active')) return;
            if (e.key === 'Escape') closeModal('modalPhoto');
            if (e.key === 'ArrowLeft') navigatePhoto(-1);
            if (e.key === 'ArrowRight') navigatePhoto(1);
        });
    }
    function openPhotoViewer(dayIndex, photoIndex) {
        const t = currentTrip();
        if (!t) return;
        const entry = t.entries[dayIndex];
        if (!entry || !entry.photos) return;
        photoViewerList = entry.photos;
        photoViewerIndex = photoIndex;
        showPhoto();
        openModal('modalPhoto');
    }
    function navigatePhoto(dir) { photoViewerIndex = (photoViewerIndex + dir + photoViewerList.length) % photoViewerList.length; showPhoto(); }
    function showPhoto() { const p = photoViewerList[photoViewerIndex]; $('#photoViewerImg').src = p.data; $('#photoCaption').textContent = p.caption || ''; }

    // ===== 导入导出 =====
    function bindImportExport() {
        $('#btnExport').addEventListener('click', () => {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `travel-journal-backup.json`;
            a.click();
        });
        $('#btnImport').addEventListener('click', () => $('#importFile').click());
        $('#importFile').addEventListener('change', e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => {
                try {
                    const imported = JSON.parse(ev.target.result);
                    // 兼容旧格式
                    if (imported.trip && !imported.trips) {
                        imported.trips = [imported.trip];
                        delete imported.trip;
                    }
                    data = imported;
                    if (!data.trips) data.trips = [];
                    saveData();
                    currentTripId = null;
                    render();
                    alert('导入成功！');
                } catch { alert('文件格式错误'); }
            };
            reader.readAsText(file);
        });
    }

    // ===== 工具函数 =====
    function openModal(id) { $(`#${id}`).classList.add('active'); }
    function closeModal(id) { $(`#${id}`).classList.remove('active'); }
    function escapeHtml(s) { return s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : ''; }

    function compressImage(file, maxW, quality, cb) {
        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                if (w > maxW) { h = h * maxW / w; w = maxW; }
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                cb(canvas.toDataURL('image/jpeg', quality));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
})();

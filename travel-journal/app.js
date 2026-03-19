/* ===== 旅途印记 - 核心逻辑 ===== */
(function () {
    'use strict';

    // ===== 数据模型 =====
    const DB_KEY = 'travel_journal_data';
    let data = loadData();
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
            return raw ? JSON.parse(raw) : { trip: null };
        } catch { return { trip: null }; }
    }
    function saveData() { localStorage.setItem(DB_KEY, JSON.stringify(data)); }

    // ===== DOM 快捷 =====
    const $ = (s, p) => (p || document).querySelector(s);
    const $$ = (s, p) => [...(p || document).querySelectorAll(s)];

    // ===== 初始化 =====
    document.addEventListener('DOMContentLoaded', () => {
        bindNav();
        bindTripModal();
        bindEntryModal();
        bindPhotoViewer();
        bindImportExport();
        render();
    });

    // ===== 导航切换 =====
    function bindNav() {
        $$('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.nav-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                $$('.view-panel').forEach(v => v.classList.remove('active'));
                $(`#view${capitalize(btn.dataset.view)}`).classList.add('active');
                if (btn.dataset.view === 'map') initMap();
                if (btn.dataset.view === 'gallery') renderGallery();
            });
        });
    }
    function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    // ===== 渲染 =====
    function render() {
        if (!data.trip) { renderEmpty(); return; }
        renderHero();
        renderDayNav();
        renderDayContent();
    }

    function renderEmpty() {
        $('#tripTitle').textContent = '点击"新建旅程"开始你的旅行记录';
        $('#tripSubtitle').textContent = '记录每一个精彩瞬间';
        $('#tripStats').innerHTML = '';
        $('#dayNav').innerHTML = '';
        $('#dayContent').innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🗺️</div>
                <h3>还没有旅程数据</h3>
                <p>点击右上角"新建旅程"开始记录你的旅行吧！</p>
            </div>`;
    }

    function renderHero() {
        const t = data.trip;
        if (t.coverImg) {
            $('#tripHero').classList.add('has-cover');
            $('#tripHero').style.setProperty('--cover-img', `url(${t.coverImg})`);
            $('#tripHero').style.backgroundImage = `url(${t.coverImg})`;
        }
        $('#tripTitle').textContent = t.name;
        $('#tripSubtitle').textContent = t.desc || '';
        const days = t.entries ? t.entries.length : 0;
        const photos = t.entries ? t.entries.reduce((s, e) => s + (e.photos ? e.photos.length : 0), 0) : 0;
        const locations = t.entries ? t.entries.reduce((s, e) => s + (e.locations ? e.locations.length : 0), 0) : 0;
        $('#tripStats').innerHTML = `
            <div class="trip-stat"><span class="trip-stat-num">${days}</span><span class="trip-stat-label">天</span></div>
            <div class="trip-stat"><span class="trip-stat-num">${photos}</span><span class="trip-stat-label">张照片</span></div>
            <div class="trip-stat"><span class="trip-stat-num">${locations}</span><span class="trip-stat-label">个地点</span></div>
        `;
    }

    function renderDayNav() {
        const entries = data.trip.entries || [];
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
        const entries = data.trip.entries || [];
        if (!entries.length) {
            $('#dayContent').innerHTML = `<div class="empty-state"><div class="empty-icon">📝</div><h3>还没有日记</h3><p>点击"添加一天"开始记录</p></div>`;
            return;
        }
        const e = entries[currentDayIndex];
        if (!e) return;

        let html = '';

        // 标题行
        html += `<div class="day-full" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <h2 style="font-family:var(--font-serif);font-size:1.4rem;">📅 Day ${currentDayIndex + 1}${e.title ? ' · ' + e.title : ''}</h2>
            <button class="btn-edit-day" id="btnEditDay">✏️ 编辑今日</button>
        </div>`;

        // 行程安排
        if (e.itinerary && e.itinerary.length) {
            html += `<div class="card">
                <div class="card-header"><h3>📋 行程安排</h3></div>
                <div class="card-body"><div class="itinerary-timeline">`;
            e.itinerary.forEach(it => {
                html += `<div class="itin-item"><span class="itin-time">${it.time}</span><div class="itin-activity">${it.activity}</div></div>`;
            });
            html += `</div></div></div>`;
        }

        // 随想
        if (e.thoughts) {
            html += `<div class="card">
                <div class="card-header"><h3>💭 今日随想</h3></div>
                <div class="card-body"><div class="thoughts-content">${escapeHtml(e.thoughts)}</div></div>
            </div>`;
        }

        // 地点
        if (e.locations && e.locations.length) {
            html += `<div class="card day-full">
                <div class="card-header"><h3>📍 地点标注</h3></div>
                <div class="card-body"><div class="location-tags">`;
            e.locations.forEach(loc => {
                html += `<span class="location-tag" data-lng="${loc.lng}" data-lat="${loc.lat}" data-name="${escapeHtml(loc.name)}">📍 ${escapeHtml(loc.name)}</span>`;
            });
            html += `</div></div></div>`;
        }

        // 照片
        if (e.photos && e.photos.length) {
            html += `<div class="card day-full">
                <div class="card-header"><h3>📸 照片记录</h3></div>
                <div class="card-body"><div class="photo-grid">`;
            e.photos.forEach((p, pi) => {
                html += `<div class="photo-item" data-day="${currentDayIndex}" data-photo="${pi}">
                    <img src="${p.data}" alt="${escapeHtml(p.caption || '')}">
                    <div class="photo-overlay">🔍</div>
                </div>`;
            });
            html += `</div></div></div>`;
        }

        if (!e.itinerary?.length && !e.thoughts && !e.locations?.length && !e.photos?.length) {
            html += `<div class="card day-full"><div class="card-body" style="text-align:center;padding:40px;color:var(--text-light);">
                <p>今天还没有内容，点击"编辑今日"开始记录 ✏️</p>
            </div></div>`;
        }

        $('#dayContent').innerHTML = html;

        // 绑定事件
        const editBtn = $('#btnEditDay');
        if (editBtn) editBtn.addEventListener('click', () => openEntryModal(currentDayIndex));

        $$('.photo-item').forEach(item => {
            item.addEventListener('click', () => {
                const di = parseInt(item.dataset.day);
                const pi = parseInt(item.dataset.photo);
                openPhotoViewer(di, pi);
            });
        });

        $$('.location-tag').forEach(tag => {
            tag.addEventListener('click', () => {
                $$('.nav-btn').forEach(b => b.classList.remove('active'));
                $$('.nav-btn')[1].classList.add('active');
                $$('.view-panel').forEach(v => v.classList.remove('active'));
                $('#viewMap').classList.add('active');
                initMap();
                const lng = parseFloat(tag.dataset.lng);
                const lat = parseFloat(tag.dataset.lat);
                if (map && lng && lat) {
                    map.setCenter([lng, lat]);
                    map.setZoom(15);
                }
            });
        });
    }

    // ===== 旅程弹窗 =====
    function bindTripModal() {
        $('#btnNewTrip').addEventListener('click', () => {
            if (data.trip && !confirm('新建旅程会覆盖当前数据，建议先导出备份。继续？')) return;
            openModal('modalTrip');
        });
        $('#modalTripClose').addEventListener('click', () => closeModal('modalTrip'));
        $('#modalTripCancel').addEventListener('click', () => closeModal('modalTrip'));
        $('#tripCover').addEventListener('change', handleCoverPreview);
        $('#modalTripSave').addEventListener('click', saveTrip);
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
            data.trip = {
                name,
                desc: $('#tripDesc').value.trim(),
                startDate: $('#tripStart').value,
                endDate: $('#tripEnd').value,
                coverImg: coverImg || null,
                entries: []
            };
            saveData();
            currentDayIndex = 0;
            closeModal('modalTrip');
            render();
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
        // 拖拽上传
        const area = $('#photoUploadArea');
        area.addEventListener('dragover', e => { e.preventDefault(); area.style.borderColor = 'var(--primary)'; });
        area.addEventListener('dragleave', () => { area.style.borderColor = ''; });
        area.addEventListener('drop', e => {
            e.preventDefault();
            area.style.borderColor = '';
            handleFiles(e.dataTransfer.files);
        });
        // 地点搜索
        $('#btnSearchLocation').addEventListener('click', searchLocation);
        $('#locationSearch').addEventListener('keypress', e => { if (e.key === 'Enter') searchLocation(); });
    }

    function openEntryModal(dayIndex) {
        editingEntryIndex = dayIndex;
        tempPhotos = [];
        tempLocations = [];

        if (dayIndex >= 0 && data.trip.entries[dayIndex]) {
            const e = data.trip.entries[dayIndex];
            $('#entryModalTitle').textContent = '✏️ 编辑日记';
            $('#entryDate').value = e.date || '';
            $('#entryTitle').value = e.title || '';
            $('#entryThoughts').value = e.thoughts || '';
            $('#btnDeleteEntry').style.display = '';
            // 行程
            renderItineraryEditor(e.itinerary || []);
            // 地点
            tempLocations = [...(e.locations || [])];
            renderSelectedLocations();
            // 照片（已有照片不做修改，只显示）
            tempPhotos = [...(e.photos || [])];
            renderPhotoPreview();
        } else {
            $('#entryModalTitle').textContent = '📝 添加日记';
            $('#entryDate').value = data.trip.startDate || new Date().toISOString().slice(0, 10);
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
        items.forEach(it => {
            list.appendChild(createItinRow(it.time, it.activity));
        });
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

    function addItineraryRow() {
        $('#itineraryList').appendChild(createItinRow('', ''));
    }

    // 地点搜索
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

    // 照片处理
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
            div.innerHTML = `
                <img src="${p.data}">
                <button class="remove-photo" data-i="${i}">&times;</button>
                <input class="photo-caption-input" data-i="${i}" placeholder="添加描述" value="${escapeHtml(p.caption || '')}">`;
            div.querySelector('.remove-photo').addEventListener('click', () => {
                tempPhotos.splice(i, 1);
                renderPhotoPreview();
            });
            div.querySelector('.photo-caption-input').addEventListener('change', e => {
                tempPhotos[i].caption = e.target.value;
            });
            grid.appendChild(div);
        });
    }

    function saveEntry() {
        const date = $('#entryDate').value;
        const title = $('#entryTitle').value.trim();
        const thoughts = $('#entryThoughts').value.trim();

        // 收集行程
        const itinerary = [];
        $$('.itinerary-item', $('#itineraryList')).forEach(row => {
            const time = $('.itin-time', row).value;
            const activity = $('.itin-activity', row).value.trim();
            if (time || activity) itinerary.push({ time, activity });
        });

        const entry = { date, title, itinerary, thoughts, locations: [...tempLocations], photos: [...tempPhotos] };

        if (!data.trip.entries) data.trip.entries = [];
        if (editingEntryIndex >= 0) {
            data.trip.entries[editingEntryIndex] = entry;
        } else {
            data.trip.entries.push(entry);
            // 按日期排序
            data.trip.entries.sort((a, b) => a.date.localeCompare(b.date));
            currentDayIndex = data.trip.entries.findIndex(e => e === entry);
        }
        saveData();
        closeModal('modalEntry');
        render();
    }

    function deleteEntry() {
        if (!confirm('确定删除这一天的日记？')) return;
        data.trip.entries.splice(editingEntryIndex, 1);
        if (currentDayIndex >= data.trip.entries.length) currentDayIndex = Math.max(0, data.trip.entries.length - 1);
        saveData();
        closeModal('modalEntry');
        render();
    }

    // ===== 地图 =====
    function initMap() {
        if (typeof AMap === 'undefined') return;
        if (map) { refreshMapMarkers(); return; }
        map = new AMap.Map('mapContainer', {
            zoom: 5,
            center: [116.397, 39.908],
            viewMode: '2D'
        });
        refreshMapMarkers();
    }

    function refreshMapMarkers() {
        if (!map) return;
        mapMarkers.forEach(m => map.remove(m));
        mapMarkers = [];
        const sidebar = $('#mapSidebar');
        sidebar.innerHTML = '<h3>📍 行程地点</h3>';
        if (!data.trip || !data.trip.entries) return;

        const allLocs = [];
        data.trip.entries.forEach((entry, di) => {
            if (!entry.locations) return;
            entry.locations.forEach(loc => {
                allLocs.push({ ...loc, dayIndex: di, date: entry.date, title: entry.title });
            });
        });

        if (!allLocs.length) {
            sidebar.innerHTML += '<p style="color:var(--text-light);font-size:.9rem;">还没有标注地点</p>';
            return;
        }

        const colors = ['#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
        allLocs.forEach((loc, i) => {
            const color = colors[loc.dayIndex % colors.length];
            const marker = new AMap.Marker({
                position: [loc.lng, loc.lat],
                title: loc.name,
                label: {
                    content: `<div style="background:${color};color:#fff;padding:2px 8px;border-radius:10px;font-size:12px;white-space:nowrap;">D${loc.dayIndex + 1} ${loc.name}</div>`,
                    offset: new AMap.Pixel(-20, -30)
                }
            });
            map.add(marker);
            mapMarkers.push(marker);

            const div = document.createElement('div');
            div.className = 'map-point';
            div.innerHTML = `<div class="map-point-day" style="color:${color}">Day ${loc.dayIndex + 1} · ${loc.date}</div>
                <div class="map-point-name">${escapeHtml(loc.name)}</div>
                <div class="map-point-addr">${escapeHtml(loc.address || '')}</div>`;
            div.addEventListener('click', () => {
                $$('.map-point').forEach(p => p.classList.remove('active'));
                div.classList.add('active');
                map.setCenter([loc.lng, loc.lat]);
                map.setZoom(15);
            });
            sidebar.appendChild(div);
        });

        // 自动缩放显示所有标记
        if (allLocs.length > 1) {
            const bounds = new AMap.Bounds(
                [Math.min(...allLocs.map(l => l.lng)), Math.min(...allLocs.map(l => l.lat))],
                [Math.max(...allLocs.map(l => l.lng)), Math.max(...allLocs.map(l => l.lat))]
            );
            map.setBounds(bounds, true, [60, 60, 60, 340]);
        } else if (allLocs.length === 1) {
            map.setCenter([allLocs[0].lng, allLocs[0].lat]);
            map.setZoom(14);
        }
    }

    // ===== 相册 =====
    function renderGallery() {
        const grid = $('#galleryGrid');
        grid.innerHTML = '';
        if (!data.trip || !data.trip.entries) return;

        const allPhotos = [];
        data.trip.entries.forEach((entry, di) => {
            if (!entry.photos) return;
            entry.photos.forEach((p, pi) => {
                allPhotos.push({ ...p, dayIndex: di, date: entry.date, entryTitle: entry.title, photoIndex: pi });
            });
        });

        if (!allPhotos.length) {
            grid.innerHTML = '<div class="empty-state"><div class="empty-icon">📸</div><h3>还没有照片</h3><p>在日记中添加照片后，这里会自动展示</p></div>';
            return;
        }

        allPhotos.forEach(p => {
            const div = document.createElement('div');
            div.className = 'gallery-item';
            div.innerHTML = `<img src="${p.data}" alt="${escapeHtml(p.caption || '')}">
                <div class="gallery-info"><span class="gallery-date">Day ${p.dayIndex + 1} · ${p.date}</span>${p.caption ? '<br>' + escapeHtml(p.caption) : ''}</div>`;
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
        const entry = data.trip.entries[dayIndex];
        if (!entry || !entry.photos) return;
        photoViewerList = entry.photos;
        photoViewerIndex = photoIndex;
        showPhoto();
        openModal('modalPhoto');
    }

    function navigatePhoto(dir) {
        photoViewerIndex = (photoViewerIndex + dir + photoViewerList.length) % photoViewerList.length;
        showPhoto();
    }

    function showPhoto() {
        const p = photoViewerList[photoViewerIndex];
        $('#photoViewerImg').src = p.data;
        $('#photoCaption').textContent = p.caption || '';
    }

    // ===== 导入导出 =====
    function bindImportExport() {
        $('#btnExport').addEventListener('click', () => {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `travel-journal-${data.trip?.name || 'backup'}.json`;
            a.click();
        });
        $('#btnImport').addEventListener('click', () => $('#importFile').click());
        $('#importFile').addEventListener('change', e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => {
                try {
                    data = JSON.parse(ev.target.result);
                    saveData();
                    currentDayIndex = 0;
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
    function escapeHtml(s) {
        if (!s) return '';
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

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
